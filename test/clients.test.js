const test = require("node:test");
const assert = require("node:assert");
const cl = require("../server/clients");

test("cleanProfile: чистит теги, режет длину, телефон только цифры/символы", () => {
  const p = cl.cleanProfile({name: "  <b>Иван</b>  Петров ", city: "Кишинёв", phone: "+373 (68) 832-032 abc"});
  assert.ok(!/[<>]/.test(p.name));
  assert.ok(p.name.includes("Иван") && p.name.includes("Петров"));
  assert.strictEqual(p.city, "Кишинёв");
  assert.strictEqual(p.phone, "+373 (68) 832-032");
  assert.strictEqual(cl.cleanProfile({phone: "12"}).phone, "");      // слишком короткий — не сохраняем
  assert.strictEqual(cl.cleanProfile({name: "x".repeat(300)}).name.length, 60);
});

test("cleanEvent: просмотр лота и поиск", () => {
  assert.strictEqual(cl.cleanEvent("view", "bad id", {}), null);
  const v = cl.cleanEvent("view", "copart-61420506", {title: "2020 Tesla Model 3", year: 2020, currentBid: 5300.4, junk: "x"});
  assert.deepStrictEqual(v.data, {title: "2020 Tesla Model 3", year: 2020, currentBid: 5300});
  const s = cl.cleanEvent("search", "make=1&year=2018", {label: "BMW 2018+"});
  assert.strictEqual(s.data.label, "BMW 2018+");
  assert.strictEqual(cl.cleanEvent("search", "", {}), null);
  assert.strictEqual(cl.cleanEvent("calc", "x", {}), null);
});

test("aggregateEvents: считает заходы, первый и последний", () => {
  const rows = [
    {kind: "view", key: "copart-1", at: "2026-11-20T10:00:00Z", data: {title: "B"}},
    {kind: "view", key: "copart-1", at: "2026-11-19T10:00:00Z", data: {title: "A"}},
    {kind: "view", key: "iaai-2", at: "2026-11-21T10:00:00Z", data: {title: "C"}},
    {kind: "search", key: "q", at: "2026-11-18T10:00:00Z", data: {label: "L"}}
  ];
  const a = cl.aggregateEvents(rows);
  assert.strictEqual(a.views.length, 2);
  assert.strictEqual(a.views[0].key, "iaai-2");
  const c1 = a.views.find(v => v.key === "copart-1");
  assert.strictEqual(c1.n, 2);
  assert.strictEqual(c1.data.title, "B");                  // данные последнего захода
  assert.ok(c1.first < c1.last);
  assert.strictEqual(a.searches.length, 1);
});

test("interestProfile: топ марка/модель с разбросом годов, избранное весомее", () => {
  const items = [
    {data: {make: "BMW", model: "X5", year: 2019}, w: 1}, {data: {make: "BMW", model: "X5", year: 2021}, w: 1},
    {data: {make: "Audi", model: "Q5", year: 2020}, w: 3}, {data: {make: "Kia", model: "Rio", year: 2015}, w: 1}
  ];
  const p = cl.interestProfile(items);
  assert.strictEqual(p[0].make, "Audi");                   // 3 > 2
  assert.strictEqual(p[1].make, "BMW");
  assert.strictEqual(p[1].yearFrom, 2017);
  assert.strictEqual(p[1].yearTo, 2023);
});

test("parseLotRef(s): ссылки, номера, дубли", () => {
  assert.strictEqual(cl.parseLotRef("https://apexauto.md/auctions/copart-61420506-2020-Tesla-Model-3-5YJ3E1EC2LF586908").id, "copart-61420506");
  assert.strictEqual(cl.parseLotRef("IAAI #45839097").id, "iaai-45839097");
  assert.strictEqual(cl.parseLotRef("61420506"), null);
  const many = cl.parseLotRefs("copart-61420506, iaai-45839097\ncopart-61420506 и ещё https://x/auctions/iaai-12345678-bmw");
  assert.deepStrictEqual(many.map(r => r.id), ["copart-61420506", "iaai-45839097", "iaai-12345678"]);
});

test("lotSnapshot и pickMessage: экранирование и язык", () => {
  const snap = cl.lotSnapshot({id: "copart-1", title: "2020 <b>BMW</b>", images: ["https://a/1.jpg", 5], currentBid: 4000, secret: "x"});
  assert.strictEqual(snap.secret, undefined);
  assert.strictEqual(snap.image, "https://a/1.jpg");
  assert.ok(!/[<>]/.test(snap.title));
  const msg = cl.pickMessage("en", [{lot_id: "copart-1", data: snap}], "Good <i>deal</i>");
  assert.ok(/picked a car/.test(msg));
  assert.ok(!msg.includes("<i>deal"));                    // теги из комментария менеджера вырезаются
  assert.ok(/2 cars/.test(cl.pickMessage("en", [{lot_id: "a", data: {}}, {lot_id: "b", data: {}}], "")));
});
