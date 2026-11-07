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
