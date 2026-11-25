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
  assert.strictEqual(m.out.deals.length, 0);
  // по телефону не ищем (его нет); по chat_id — ищем (сделка, привязанная менеджером напрямую)
  assert.ok(!m.calls.some(c => c.startsWith("/cab_deals?phone_key")));
});
test("cabdeals: сделка, привязанная к клиенту из Telegram (chat_id), видна без подтверждённого телефона", async () => {
  const calls = [];
  const sb = async path => {
    calls.push(path);
    if(path.startsWith("/alert_links?token=eq.bound")) return [{chat_id: 777, lang: "ru"}];
    if(path.startsWith("/cab_deals?chat_id=eq.777")) return [{id: 9, phone: "", phone_key: "tg777", chat_id: "777", title: "Audi Q5", stage: "port", timeline: [], photos: [], docs: []}];
    return [];
  };
  let out = null;
  const api = create({sb, sendJson: (r, c, b) => { out = b; }, readBody: async r => r.body});
  await api.handle("cabdeals", {method: "GET"}, {}, new URLSearchParams({token: TOK}));
  assert.strictEqual(out.verified, true);
  assert.strictEqual(out.deals.length, 1);
  assert.strictEqual(out.deals[0].title, "Audi Q5");
  assert.ok(!("chat_id" in out.deals[0]));
});
test("cabdeals: и по chat_id, и по телефону — без дублей", async () => {
  const same = {id: 5, phone_key: "68832032", chat_id: "777", title: "BMW", stage: "sea", updated_at: "2026-11-26T10:00:00Z", timeline: [], photos: [], docs: []};
  const other = {id: 6, phone_key: "68832032", chat_id: null, title: "Tesla", stage: "bought", updated_at: "2026-11-25T10:00:00Z", timeline: [], photos: [], docs: []};
  const sb = async path => {
    if(path.startsWith("/alert_links?token=eq.bound")) return [{chat_id: 777, lang: "ru"}];
    if(path.startsWith("/alert_meta?k=eq.phone%3A777")) return [{v: {k: "68832032"}}];
    if(path.startsWith("/cab_deals?chat_id=eq.777")) return [same];
    if(path.startsWith("/cab_deals?phone_key=eq.68832032")) return [same, other];
    return [];
  };
  let out = null;
  const api = create({sb, sendJson: (r, c, b) => { out = b; }, readBody: async r => r.body});
  await api.handle("cabdeals", {method: "GET"}, {}, new URLSearchParams({token: TOK}));
  assert.deepStrictEqual(out.deals.map(d => d.id), [5, 6]);
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

test("cleanDeal: клиент из Telegram (chat_id) — телефон не обязателен", () => {
  const r = deals.cleanDeal({chat_id: "123456789", title: "BMW X5"});
  assert.ok(r);
  assert.strictEqual(r.chat_id, "123456789");
  assert.strictEqual(r.phone_key, "tg123456789");
  // телефон есть — ключ по телефону, chat_id сохраняется
  const r2 = deals.cleanDeal({chat_id: "123456789", phone: "068 832 032", title: "BMW X5"});
  assert.strictEqual(r2.phone_key, "68832032");
  assert.strictEqual(r2.chat_id, "123456789");
  // без chat_id: прежнее поведение
  assert.strictEqual(deals.cleanDeal({title: "X"}), null);
  assert.strictEqual(deals.cleanDeal({phone: "068832032", title: "X"}).chat_id, null);
  // мусор в chat_id не проходит
  assert.strictEqual(deals.cleanDeal({chat_id: "abc'; drop", title: "X"}), null);
});

test("chatForDeal: привязанный chat_id важнее телефона; без chat_id — по подтверждённому номеру", async () => {
  const calls = [];
  const sb = {list: async (table, q) => {
    calls.push([table, q.k || q.chat_id]);
    if(table === "alert_links") return q.chat_id === "eq.555" ? [{lang: "ro"}] : [];
    if(table === "alert_meta") return q.k === "eq.phonekey:68832032" ? [{v: {chat: 777}}] : [];
    return [];
  }};
  assert.deepStrictEqual(await deals.chatForDeal(sb, {chat_id: "555", phone_key: "68832032"}), {chat: "555", lang: "ro"});
  // chat_id есть, но клиент отвязался (нет в alert_links) → запасной путь по телефону
  const fb = await deals.chatForDeal(sb, {chat_id: "999", phone_key: "68832032"});
  assert.strictEqual(fb.chat, 777);
  assert.strictEqual(await deals.chatForDeal(sb, {chat_id: null, phone_key: "11111111"}), null);
});
