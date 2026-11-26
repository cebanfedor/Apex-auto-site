const test = require("node:test");
const assert = require("node:assert");
const inv = require("../server/invoice");

test("parseLines: «название | сумма», запятая, минус, мусор", () => {
  const l = inv.parseLines("Доставка по США | 450\nМорская доставка | 1 900,50\nСкидка | -200\nбез суммы\n | 5\nНоль | 0");
  assert.deepStrictEqual(l, [{name: "Доставка по США", usd: 450}, {name: "Морская доставка", usd: 1900.5}, {name: "Скидка", usd: -200}]);
  assert.strictEqual(inv.total(l), 2150.5);
  assert.deepStrictEqual(inv.parseLines(null), []);
});
test("linesFromCalc: лей → доллары по курсу, скидка минусом", () => {
  const l = inv.linesFromCalc({land_usd: 450, sea_usd: 1900, customs_mdl: 17500, broker_mdl: 2000, usd_mdl: 17.5, discount_on: true, discount_usd: 200, note: "повторная покупка"});
  assert.deepStrictEqual(l.map(x => x.usd), [450, 1900, 1000, 114.29, -200]);
  assert.ok(l[4].name.includes("повторная покупка"));
  assert.deepStrictEqual(inv.linesFromCalc(null), []);
});
test("renderInvoice: статус по оплатам, экранирование, нет индексации", () => {
  const rec = {token: "t".repeat(24), no: "AA-5-1", title: "BMW <script>x</script>", vin: "5UXCR6C09M9E12345", client: "Иван \"Т\"", lines: [{name: "Доставка", usd: 1000}], rate: 17.5, created: "2026-11-27T10:00:00Z", paid: []};
  let html = inv.renderInvoice(rec, "IBAN MD00 <b>", "ru");
  assert.ok(html.includes("К ОПЛАТЕ"));
  assert.ok(!html.includes("<script>x</script>") && html.includes("&lt;script&gt;"));
  assert.ok(html.includes('content="noindex,nofollow"'));
  assert.ok(html.replace(/[\u00a0\u202f]/g, " ").includes("17 500 MDL"));   // ru-RU разделяет тысячи неразрывным пробелом
  rec.paid = [{usd: 400, at: "2026-11-28T10:00:00Z"}];
  html = inv.renderInvoice(rec, "", "ro");
  assert.ok(html.includes("PARȚIAL ACHITAT") && html.includes("600"));
  rec.paid.push({usd: 600, at: "2026-11-29T10:00:00Z", note: "банк"});
  assert.ok(inv.renderInvoice(rec, "", "en").includes("PAID"));
});
test("токены: формат и случайность", () => {
  const a = inv.newToken(), b = inv.newToken();
  assert.notStrictEqual(a, b);
  assert.ok(inv.okToken(a));
  assert.ok(!inv.okToken("short") && !inv.okToken("x".repeat(25) + "/../"));
});
