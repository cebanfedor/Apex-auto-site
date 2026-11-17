const test = require("node:test");
const assert = require("node:assert");
const table = require("../server/gen-table.js");
const names = require("../server/gen-names.js");

// BMW X5 (model_id 1665): с MY2027 — новый кузов G65, G05 закрыт на 2026.
test("BMW X5: G05 до 2026, G65 с 2027", () => {
  const t = (table.GEN_TABLE || table)["1665"];
  assert.ok(t, "нет записи X5");
  const last = t[t.length - 1], prev = t[t.length - 2];
  assert.deepStrictEqual(last, [2027, 0, "G65"]);
  assert.deepStrictEqual(prev, [2019, 2026, "G05"]);
  assert.strictEqual(names["1665"].length, t.length);
  assert.strictEqual(names["1665"][t.length - 1], "V");
});
