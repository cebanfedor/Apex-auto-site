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

test("fromTracking: AvtoShipping → этап, лента, ETA, фото", () => {
  const t = deals.fromTracking({
    vehicle: "2021 BMW X5 xDrive40i", vin: "5uxcr6c09m9e12345", auction: "Copart", city: "Houston, TX", source: "avtoshipping",
    etaChisinau: "2026-12-26T00:00:00Z", container: {number: "MSKU123", portArrival: "2026-12-12"},
    stages: [
      {title: "A_PURCHASED", date: "2026-11-01", status: "completed"},
      {title: "A_DISPATCHED", date: "2026-11-04", status: "completed"},
      {title: "A_DELIVERED", date: "2026-11-08", status: "completed"},
      {title: "A_LOADED", date: "2026-11-15", status: "current"},
      {title: "A_UNLOADED_EST", date: "2026-12-12", status: "todo"}
    ],
    photoCategories: [{label: "Погрузка", photos: ["https://a.md/1.jpg", "http://bad/2.jpg"]}]
  });
  assert.strictEqual(t.title, "2021 BMW X5 xDrive40i");
  assert.strictEqual(t.stage, "sea");
  assert.strictEqual(t.eta_date, "2026-12-26");
  assert.strictEqual(t.photos.length, 1);
  assert.ok(t.timeline[0].text.includes("Copart, Houston, TX"));
  assert.strictEqual(deals.fromTracking({error: "x"}), null);
});
test("mergeTracking: только вперёд, не выше «в пути», ETA и ленту не затирает", () => {
  const t = {stage: "road", eta_date: "2026-12-26", timeline: [{at: "2026-11-15", text: "Погружен в контейнер"}], photos: [{url: "https://a.md/1.jpg", caption: ""}]};
  const row = {stage: "sea", eta_date: "2026-12-30", timeline: [{at: "2026-11-15", text: "погружен в контейнер"}], photos: []};
  const p = deals.mergeTracking(row, t);
  assert.strictEqual(p.stage, "road");
  assert.ok(!("eta_date" in p));
  assert.ok(!("timeline" in p));
  assert.strictEqual(p.photos.length, 1);
  assert.strictEqual(deals.mergeTracking({stage: "customs", eta_date: "x", timeline: [], photos: []}, {stage: "road", timeline: [], photos: []}), null);
});

test("cleanCalc: суммы, скидка, правила; пустой расчёт → null", () => {
  assert.strictEqual(deals.cleanCalc({}), null);
  assert.strictEqual(deals.cleanCalc({land_usd: "0", sea_usd: ""}), null);
  const c = deals.cleanCalc({land_usd: "950", sea_usd: "2 100", customs_mdl: "38 450", broker_mdl: 2000, discount_on: "on", discount_usd: "200", usd_mdl: "17.5", rules: "2027", note: "x".repeat(300)});
  assert.strictEqual(c.sea_usd, 2100);
  assert.strictEqual(c.customs_mdl, 38450);
  assert.strictEqual(c.discount_on, true);
  assert.strictEqual(c.rules, "2027");
  assert.strictEqual(c.note.length, 200);
  const row = deals.cleanDeal({phone: "068832032", title: "BMW", calc: {land_usd: 500}});
  assert.strictEqual(row.calc.land_usd, 500);
  assert.strictEqual(deals.publicDeal({id: 1, title: "T", stage: "sea", calc: {customs_mdl: 1000, discount_on: false}}).calc.customs_mdl, 1000);
});
test("calcFromLot: США считает доставку/таможню в леях, Канада — вручную, нет лота — null", async () => {
  assert.strictEqual(await deals.calcFromLot(null), null);
  assert.deepStrictEqual(await deals.calcFromLot({location: "Toronto, Ontario"}), {canada: true});
  const c = await deals.calcFromLot({auction: "copart", location: "TX - DALLAS", year: 2019, make: "Toyota", model: "RAV4", title: "2019 Toyota RAV4 XLE", fuelKind: 4, engine: "2.5L 4", currentBid: 6000, statusId: 3});
  assert.strictEqual(c.canada, false);
  assert.ok(c.sea_usd > 0, "море");
  assert.ok(c.customs_mdl > 0, "таможня в леях");
  assert.ok(c.land_usd >= 0);
  assert.ok(c.usd_mdl > 10);
  const ev = await deals.calcFromLot({auction: "iaai", location: "unknown place", year: 2022, make: "Tesla", model: "Model 3", fuelKind: 2, currentBid: 9000}, "2027");
  assert.strictEqual(ev.rules, "2027");
  assert.strictEqual(ev.fuel, "electric");
});
