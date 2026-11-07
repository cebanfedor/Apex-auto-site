process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://x";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "x";
const test = require("node:test");
const assert = require("node:assert");
const {syncRowFromItem} = require("../api/auctions.js");

// Запись /archived-lots: числа и даты объектами {value, updated_at}; у проданных IAAI final_bid=null, цена — в bid.
const rec = (lot, dom, st, bid, sale, bidUpd) => ({
  archived_at:"2026-11-07T04:13:21Z", lot_id:1, car_id:2, vin:"1gnek13rxxj475506", lot,
  domain:{name:dom, id:dom === "iaai_com" ? 1 : 3}, currency:"USD",
  status:{name:st[0], id:st[1]},
  bid:{value:bid, updated_at:bidUpd || "2026-11-06T01:51:47Z"},
  buy_now:{value:0, updated_at:null},
  sale_date:{value:sale, updated_at:"2026-11-06T18:12:34Z"},
  final_bid:{value:null, updated_at:null}
});

test("archived-lots: продан IAAI, final_bid null → финал = bid, строка архивная", () => {
  const r = syncRowFromItem(rec("41613432", "iaai_com", ["sold", 6], 2700, "2026-11-06T01:29:00Z"), {archived:true});
  assert.strictEqual(r.archived, true);
  assert.strictEqual(r.final_bid, 2700);
});

test("archived-lots: торги в будущем (пред-ставка) → не продан", () => {
  const r = syncRowFromItem(rec("1", "iaai_com", ["sold", 6], 2700, "2099-01-01T00:00:00Z"), {archived:true});
  assert.strictEqual(r.archived, false);
  assert.strictEqual(r.final_bid, 0);
});

test("archived-lots: ставка обновлена ДО торгов → не считаем ценой продажи", () => {
  const r = syncRowFromItem(rec("2", "iaai_com", ["sold", 6], 2700, "2026-11-06T01:29:00Z", "2026-11-05T10:00:00Z"), {archived:true});
  assert.strictEqual(r.final_bid, 0);
});

test("archived-lots: sold без ставки и без даты → живая строка, финал 0", () => {
  const r = syncRowFromItem(rec("3", "iaai_com", ["sold", 6], 0, null), {archived:true});
  assert.strictEqual(r.archived, false);
  assert.strictEqual(r.final_bid, 0);
});

test("синк по площадке: лот ЭТОЙ площадки читается первым, даже если в lots[0] чужой", () => {
  const car = {id:1, vin:"WBSAE0C06PCL70372", year:2023, title:"2023 BMW M3", lots:[
    {id:2, lot:"40093457", external_id:"40093457", domain:{name:"iaai_com", id:1}, sale_date:"2026-11-20T15:00:00Z", bid:500, status:{name:"sale", id:3}},
    {id:3, lot:"86246665", domain:{name:"copart_com", id:3}, sale_date:"2026-11-25T15:00:00Z", bid:900, status:{name:"sale", id:3}}
  ]};
  const copart = syncRowFromItem(JSON.parse(JSON.stringify(car)), {preferDomain:3});
  assert.strictEqual(copart.auction, "copart");
  assert.strictEqual(copart.lot, "86246665");
  const iaai = syncRowFromItem(JSON.parse(JSON.stringify(car)), {preferDomain:1});
  assert.strictEqual(iaai.auction, "iaai");
  const none = syncRowFromItem(JSON.parse(JSON.stringify(car)), {});
  assert.strictEqual(none.lot, "40093457");   // без фильтра — как раньше, lots[0]
});

test("валюта лота CAD → канадский лот (пробег в км), даже если локация не распознана", () => {
  const {normalizeLot} = require("../api/auctions.js");
  const mk = cur => normalizeLot({id:1, vin:"WBSAE0C06PCL70372", year:2022, title:"2022 BMW X3", lots:[
    {lot:"12700052", domain:{name:"iaai_com", id:1}, currency:cur, bid:5000, odometer:{mi:null, km:40201}, sale_date:"2099-01-01T00:00:00Z", status:{name:"sale", id:3}}
  ]});
  assert.strictEqual(mk("CAD").odometerUnit, "km");
  assert.notStrictEqual(mk("USD").odometerUnit, "km");
});

test("archived-lots: legacy скалярный bid (без bid_updated_at) НЕ становится финалом", () => {
  const r = syncRowFromItem({archived_at:"2026-11-07T04:13:21Z", lot_id:1, car_id:2, vin:"1gnek13rxxj475506", lot:"41613499",
    domain:{name:"iaai_com", id:1}, status:{name:"sold", id:6}, bid:2700, buy_now:0, sale_date:"2026-11-06T01:29:00Z", final_bid:null}, {archived:true});
  assert.strictEqual(r.final_bid, 0);
});

test("archived-lots: призраки (непроданные без будущей даты) не пишем, проданные и перевыставленные — пишем", () => {
  const {keepArchivedRow} = require("../api/auctions.js");
  const row = (st, bid, sale) => syncRowFromItem(rec("5", "copart_com", st, bid, sale), {archived:true});
  assert.strictEqual(keepArchivedRow(row(["upcoming", 10], 0, null)), false);
  assert.strictEqual(keepArchivedRow(row(["sale", 3], 0, null)), false);
  assert.strictEqual(keepArchivedRow(row(["sale", 3], 225, "2026-11-04T15:00:00Z")), false);
  assert.strictEqual(keepArchivedRow(row(["sold", 6], 2700, "2026-11-06T01:29:00Z")), true);
  assert.strictEqual(keepArchivedRow(row(["sale", 3], 100, "2099-01-01T00:00:00Z")), true);
});

// Реальная машина из /cars (BMW M3 CS): lots[0] — старый IAAI-лот «на торгах» со ставкой 575, а продана на Copart за 77000 (lots[1], создан позже).
const m3 = () => ({id:7077741, vin:"WBS63AY08RFP97726", year:2024, title:"2024 BMW M3 Cs", lots:[
  {id:22369324, lot:"46063211", external_id:"46562738~US", domain:{name:"iaai_com", id:1}, created_at:"2026-09-05T07:21:23.000000Z",
   sale_date:"2026-10-07T16:30:00.000000Z", bid:575, status:{name:"sale", id:3}},
  {id:23297532, lot:"74095956", domain:{name:"copart_com", id:3}, created_at:"2026-10-21T17:30:39.000000Z",
   sale_date:"2026-10-23T19:00:00.000000Z", bid:77000, bid_updated_at:"2026-10-23 21:19:10", final_bid:77000, status:{name:"sold", id:6}}
]});

test("несколько лотов без подсказки: текущий — самый свежий по created_at, а не lots[0]", () => {
  const {normalizeLot} = require("../api/auctions.js");
  const l = normalizeLot(m3());
  assert.strictEqual(l.lot, "74095956");
  assert.strictEqual(l.finalBid, 77000);
});

test("страница лота: запрошенный номер лота (в т.ч. IAAI по external_id) — первым", () => {
  const {normalizeLot} = require("../api/auctions.js");
  const {orderLots} = require("../api/auctions.js");
  const item = orderLots(m3(), {lot:"46562738"});
  assert.strictEqual(normalizeLot(item).statusId, 3);   // IAAI-лот, как запросили
  const item2 = orderLots(m3(), {lot:"74095956"});
  assert.strictEqual(normalizeLot(item2).statusId, 6);
});

test("обход по площадке: Copart-обход берёт Copart-лот, IAAI-обход — IAAI-лот", () => {
  assert.strictEqual(syncRowFromItem(m3(), {preferDomain:3}).lot, "74095956");
  assert.strictEqual(syncRowFromItem(m3(), {preferDomain:1}).auction, "iaai");
});

// Реальный Copart-лот из /cars (Nissan Altima 68635016): куплен по Buy Now 27.09, торги по плану 28.09 — final=bid=buy_now, final_bid_updated_at раньше торгов.
const bnLot = (extra = {}) => ({id:476928, vin:"1N4AL3AP6FC286975", year:2015, title:"2015 Nissan Altima 2.5 Sv", lots:[Object.assign({
  id:22544031, lot:"68635016", domain:{name:"copart_com", id:3}, sale_date:"2026-09-28T17:00:00.000000Z",
  bid:1100, bid_updated_at:"2026-09-27 15:49:10", buy_now:1100, final_bid:1100, final_bid_updated_at:"2026-09-28T00:01:09.000000Z",
  status:{name:"sold", id:6}}, extra)]});

test("Buy Now до аукциона: sold + final=buy_now, дата торгов в будущем → продан, не «пред-ставка»", () => {
  const {normalizeLot} = require("../api/auctions.js");
  const fut = new Date(Date.now() + 3 * 864e5).toISOString();
  const nowPast = new Date(Date.now() - 2 * 864e5).toISOString();
  const l = normalizeLot(bnLot({sale_date:fut, final_bid_updated_at:nowPast}));
  assert.strictEqual(l.statusId, 6);
  assert.strictEqual(l.finalBid, 1100);
  assert.strictEqual(l.soldByBuyNow, true);
  assert.strictEqual(l.buyNow, 0);
});

test("Buy Now: обычная продажа (final < buy_now) и пред-ставка при будущих торгах не становятся выкупом", () => {
  const {normalizeLot} = require("../api/auctions.js");
  const fut = new Date(Date.now() + 3 * 864e5).toISOString();
  const normal = normalizeLot(bnLot({sale_date:"2026-09-28T17:00:00.000000Z", final_bid:1150, bid:1150, buy_now:2300, final_bid_updated_at:"2026-09-28T18:16:44.000000Z"}));
  assert.notStrictEqual(normal.soldByBuyNow, true);
  const pre = normalizeLot(bnLot({sale_date:fut, final_bid:900, bid:900, buy_now:2300, final_bid_updated_at:new Date().toISOString()}));
  assert.strictEqual(pre.statusId, 3);   // пред-ставка: не продан
  assert.strictEqual(pre.finalBid, 0);
});

test("Buy Now до аукциона: строка попадает в архив с финалом и датой покупки", () => {
  const fut = new Date(Date.now() + 3 * 864e5).toISOString();
  const nowPast = new Date(Date.now() - 2 * 864e5).toISOString();
  const r = syncRowFromItem(bnLot({sale_date:fut, final_bid_updated_at:nowPast}), {});
  assert.strictEqual(r.archived, true);
  assert.strictEqual(r.final_bid, 1100);
  assert.ok(Date.parse(r.sale_date) < Date.now());
});
