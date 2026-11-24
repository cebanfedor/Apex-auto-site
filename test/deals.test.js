const test = require("node:test");
const assert = require("node:assert");
const deals = require("../server/deals");
const {create} = require("../server/cabinet");

test("phoneKey: разные форматы одного номера дают один ключ", () => {
  assert.strictEqual(deals.phoneKey("+373 68 832 032"), "68832032");
  assert.strictEqual(deals.phoneKey("068832032"), "68832032");
  assert.strictEqual(deals.phoneKey("37368832032"), "68832032");
  assert.strictEqual(deals.phoneKey("123"), "");
});
test("cleanDeal: обязательные поля, этап, VIN, суммы", () => {
  assert.strictEqual(deals.cleanDeal({title:"X"}), null);
  assert.strictEqual(deals.cleanDeal({phone:"068832032"}), null);
  const r = deals.cleanDeal({phone:"068 832 032", title:"BMW X5", stage:"nope", vin:"5uxcr6c09m9e12345", total_usd:"31 500", paid_usd:"abc"});
  assert.strictEqual(r.stage, "bought");
  assert.strictEqual(r.vin, "5UXCR6C09M9E12345");
  assert.strictEqual(r.total_usd, 31500);
  assert.strictEqual(r.paid_usd, null);
});
test("парсеры строк: лента, фото, документы; только https", () => {
  const t = deals.parseTimeline("20.11.2026 | Погружен\n2026-11-22 | Судно вышло\nбез даты");
  assert.deepStrictEqual(t.map(x => x.at), ["2026-11-20", "2026-11-22", ""]);
  const p = deals.parsePhotos("https://a.md/1.jpg | порт\nhttp://bad.md/2.jpg\njavascript:alert(1)");
  assert.strictEqual(p.length, 1);
  const d = deals.parseDocs("Договор | https://a.md/d.pdf\nhttp://x.md/y.pdf");
  assert.deepStrictEqual(d, [{name:"Договор", url:"https://a.md/d.pdf"}]);
});
test("publicDeal не отдаёт телефон и служебные поля", () => {
  const o = deals.publicDeal({id:1, phone:"068", phone_key:"68", client_name:"X", title:"T", stage:"sea", timeline:[], photos:[], docs:[], total_usd:"100", paid_usd:50});
  assert.ok(!("phone" in o) && !("phone_key" in o) && !("client_name" in o));
  assert.strictEqual(o.total, 100);
});
test("stageMessage экранирует HTML и переводится", () => {
  const m = deals.stageMessage({title:"<b>X</b>", stage:"customs", next_step:"a<b", eta_date:"2026-12-20"}, "ro");
  assert.ok(m.includes("&lt;b&gt;X"));
  assert.ok(m.includes("Vămuire"));
});

function mock(rows){
  const calls = [];
  const sb = async path => {
    calls.push(path);
    if(path.startsWith("/alert_links?token=eq.bound")) return [{chat_id: 777, lang: "ru"}];
    if(path.startsWith("/alert_meta?k=eq.phone%3A777")) return rows.phone ? [{v: {k: "68832032"}}] : [];
    if(path.startsWith("/cab_deals?phone_key=eq.68832032")) return rows.deals || [];
    return [];
  };
  let out = null;
  return {calls, get out(){ return out; }, api: create({sb, sendJson: (r, c, b) => { out = b; }, readBody: async r => r.body})};
}
const TOK = "bound" + "x".repeat(20);
test("cabdeals: без подтверждённого телефона сделок не отдаём", async () => {
  const m = mock({});
  await m.api.handle("cabdeals", {method: "GET"}, {}, new URLSearchParams({token: TOK}));
  assert.strictEqual(m.out.verified, false);
  assert.ok(!m.calls.some(c => c.startsWith("/cab_deals")));
});
test("cabdeals: с телефоном — только его сделки и без служебных полей", async () => {
  const m = mock({phone: true, deals: [{id: 5, phone: "068832032", phone_key: "68832032", title: "BMW", stage: "sea", timeline: [], photos: [], docs: []}]});
  await m.api.handle("cabdeals", {method: "GET"}, {}, new URLSearchParams({token: TOK}));
  assert.strictEqual(m.out.verified, true);
  assert.strictEqual(m.out.deals.length, 1);
  assert.ok(!("phone" in m.out.deals[0]));
});
