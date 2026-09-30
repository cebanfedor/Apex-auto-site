const {test} = require("node:test");
const assert = require("node:assert");
const {attachVinHistory} = require("../api/auctions.js");

// attachVinHistory (api/auctions.js) — самая часто чинившаяся функция проекта (Honda Insight relist,
// BMW 530e Buy Now, Tesla Model 3/Model Y VIN-история, absurd-bid). Тесты мокают global.fetch (fetchJson
// внутри использует его напрямую) вместо реального похода в auctionsapi.com — никаких network/DB вызовов.

process.env.AUCTIONS_API_KEY = process.env.AUCTIONS_API_KEY || "test-key";

function mockFetchOnce(payload, {ok = true, status = 200} = {}){
  const orig = global.fetch;
  global.fetch = async () => ({ok, status, json: async () => payload});
  return () => { global.fetch = orig; };
}

const VIN = "1G1ZD5ST3MF072564";

test("attachVinHistory: тот же номер лота выставлен ЕЩЁ РАЗ позже — прошлый раунд НЕ продажа (Honda Insight 62067926, 24.09.2026)", async () => {
  // Раунд 24.09 фид помечает sold с bid=5300, но сам лот (та же запись) снова на торгах 01.10 —
  // резерв не был набран, продажи не было. Раньше это показывалось как «ПРОДАН $5,300».
  const payload = {lots:[{
    lot:"62067926", domain:"copart_com", status:"active", final_bid:0,
    sale_date:"2026-10-01T00:00:00Z", buy_now:0,
    prices:[{sale_date:"2026-09-24T04:20:00Z", status:"sold", bid:5300, buy_now_price:6900}]
  }]};
  const restore = mockFetchOnce(payload);
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"62067926", auction:"copart", auctionDate:"2026-10-01T00:00:00Z", estimatedRetailValue:0, buyNow:0});
    assert.strictEqual(lot.vinChecked, true);
    assert.strictEqual(lot.priceHistory.length, 1);
    assert.strictEqual(lot.priceHistory[0].status, "not_sold", "раунд с ЕЩЁ РАЗ выставленным тем же номером лота не должен считаться продажей");
    assert.strictEqual(lot.priceHistory[0].bid, 5300);
  }finally{ restore(); }
});

test("attachVinHistory: покупка по Buy Now — реальная продажа, даже если та же запись потом снова «активна» (BMW 530e IAAI 45914882, 25.09.2026)", async () => {
  // Живое время раунда (секунды ≠ 0) + ставка = цене выкупа записи → не понижаем до not_sold,
  // несмотря на то что l.sale_date (следующая дата аукциона) позже раунда покупки.
  const payload = {lots:[{
    lot:"45914882", domain:"iaai_com", status:"sale", final_bid:0,
    sale_date:"2026-09-28T00:00:00Z", buy_now:9100,
    prices:[{sale_date:"2026-09-24T14:13:29Z", status:"sold", bid:9100}]
  }]};
  const restore = mockFetchOnce(payload);
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"45914882", auction:"iaai", auctionDate:"2026-09-28T00:00:00Z", estimatedRetailValue:0, buyNow:9100});
    assert.strictEqual(lot.priceHistory.length, 1);
    assert.strictEqual(lot.priceHistory[0].status, "sold", "покупка по Buy Now — реальная продажа, relist-правило её не должно понижать");
    assert.strictEqual(lot.priceHistory[0].bid, 9100);
  }finally{ restore(); }
});

test("attachVinHistory: «sold» без цены и без прошедшей даты продажи под ДРУГИМ номером лота — не история (Tesla Model 3 58144806, 24.09.2026)", async () => {
  // Прошлый заход (другой номер лота) фид отдаёт как sold/final_bid:null — считаем продажей БЕЗ ЦЕНЫ,
  // но только если тот же VIN позже реально выставили под другим номером (проверяем через lotsArr).
  const payload = {lots:[
    {lot:"69796376", domain:"copart_com", status:"active", final_bid:0, sale_date:"2026-10-05T00:00:00Z"},
    {lot:"92059535", domain:"copart_com", status:"sold", final_bid:null, sale_date:"2026-06-14T00:00:00Z"}
  ]};
  const restore = mockFetchOnce(payload);
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"69796376", auction:"copart", auctionDate:"2026-10-05T00:00:00Z", estimatedRetailValue:0, buyNow:0});
    const noPriceEntry = lot.priceHistory.find(e => e.lot === "92059535");
    assert.ok(noPriceEntry, "должна появиться запись о прошлом заходе без цены");
    assert.strictEqual(noPriceEntry.status, "sold");
    assert.strictEqual(noPriceEntry.noPrice, true);
    assert.strictEqual(noPriceEntry.bid, 0, "цену продажи не додумываем");
  }finally{ restore(); }
});

test("attachVinHistory: абсурдная ставка (>115% оценки) в not_sold-раунде отбрасывается (BMW M4 64624966, 22.09.2026)", async () => {
  const payload = {lots:[{
    lot:"OTHERLOT", domain:"copart_com", status:"active", final_bid:0,
    sale_date:"2026-09-20T00:00:00Z", buy_now:0,
    prices:[{sale_date:"2026-09-20T00:00:00Z", status:"not_sold", bid:78000}]
  }]};
  const restore = mockFetchOnce(payload);
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"CURLOT", auction:"copart", auctionDate:"2026-09-30T00:00:00Z", estimatedRetailValue:52000, buyNow:0});
    assert.ok(!lot.priceHistory.some(e => e.bid === 78000), "продавец не откажется от $78k ради выкупа $41.5k — абсурдная ставка не должна попасть в историю");
  }finally{ restore(); }
});

test("attachVinHistory: копеечный пребид (< порога) — не ставка, показывается как «не продан · без ставок»", async () => {
  const payload = {lots:[{
    lot:"CURLOT", domain:"copart_com", status:"active", final_bid:0,
    sale_date:"2026-09-30T00:00:00Z", buy_now:0,
    prices:[{sale_date:"2026-09-25T00:00:00Z", status:"not_sold", bid:100}]
  }]};
  const restore = mockFetchOnce(payload);
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"CURLOT", auction:"copart", auctionDate:"2026-09-30T00:00:00Z", estimatedRetailValue:0, buyNow:0});
    assert.strictEqual(lot.priceHistory.length, 1);
    assert.strictEqual(lot.priceHistory[0].bid, 0);
    assert.strictEqual(lot.priceHistory[0].prebid, 100);
  }finally{ restore(); }
});

test("attachVinHistory: VIN не найден в фиде (404) — vinChecked=true, историю не выдумываем", async () => {
  const restore = mockFetchOnce({message:"not found"}, {ok:false, status:404});
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"X", auction:"copart", auctionDate:"2026-09-30T00:00:00Z"});
    assert.strictEqual(lot.vinChecked, true);
    assert.strictEqual(lot.priceHistory, undefined);
  }finally{ restore(); }
});

test("attachVinHistory: сбой запроса к фиду (не 404) без запасной истории в БД — честно vinChecked=false", async () => {
  const restore = mockFetchOnce({error:"boom"}, {ok:false, status:502});
  try{
    const lot = await attachVinHistory({vin:VIN, lot:"X", auction:"copart", auctionDate:"2026-09-30T00:00:00Z"});
    assert.strictEqual(lot.vinChecked, false);
  }finally{ restore(); }
});

test("attachVinHistory: невалидный VIN — лот возвращается без изменений (нет запроса к фиду)", async () => {
  const orig = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return {ok:true, status:200, json: async () => ({lots:[]})}; };
  try{
    const lot = await attachVinHistory({vin:"SHORT", lot:"X", auction:"copart"});
    assert.strictEqual(called, false, "не должно быть похода к фиду на невалидный VIN");
    assert.strictEqual(lot.vinChecked, undefined);
  }finally{ global.fetch = orig; }
});
