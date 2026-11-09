const test = require("node:test");
const assert = require("node:assert");
const C = require("../calc-core.js");
C.setCustomsRules("2027");

const cm = (o) => C.customsMdl(500000, 500000, o);

test("2027: возраст считается от года ввоза (не раньше 2027)", () => {
  assert.ok(C.CUSTOMS_YEAR >= 2027);
});

test("2027: бензин 1.5–2.0 л, 7 лет (2020 г.) — ставка 23,68 лей/см³", () => {
  const r = cm({vehicleType:"sedan", fuel:"gasoline", engineLiters:2, year:2020});
  assert.strictEqual(r.rate, 23.68);
  assert.strictEqual(Math.round(r.baseExcise), 2000 * 23.68);
});

test("2027: обычный гибрид — без скидки, plug-in — минус 25%", () => {
  const g = cm({vehicleType:"sedan", fuel:"gasoline", engineLiters:2, year:2020}).baseExcise;
  assert.strictEqual(cm({vehicleType:"sedan", fuel:"hybrid", engineLiters:2, year:2020}).baseExcise, g);
  assert.strictEqual(cm({vehicleType:"sedan", fuel:"phev", engineLiters:2, year:2020}).baseExcise, g * 0.75);
});

test("2027: дизель ≤1500 см³, 0–2 года — 13,45", () => {
  const r = cm({vehicleType:"sedan", fuel:"diesel", engineLiters:1.4, year:C.CUSTOMS_YEAR - 1});
  assert.strictEqual(r.rate, 13.45);
});

test("2027: электро — акциз по массе (лей/кг), группа по весу", () => {
  const y = C.CUSTOMS_YEAR - 1; // 0–2 года
  const a = cm({vehicleType:"sedan", fuel:"electric", year:y, curbKg:1900});
  assert.strictEqual(a.rate, 15.59);
  assert.strictEqual(Math.round(a.baseExcise), Math.round(1900 * 15.59));
  const b = cm({vehicleType:"sedan", fuel:"electric", year:y, curbKg:2001});
  assert.strictEqual(b.rate, 25.69);
  const c = cm({vehicleType:"sedan", fuel:"electric", year:y, curbKg:3100});
  assert.strictEqual(c.rate, 45.87);
  // по умолчанию — типичная масса кузова
  const d = cm({vehicleType:"suv", fuel:"electric", year:y});
  assert.strictEqual(d.kg, C.defaultCurbKg("suv"));
});

test("2027: полный расчёт электро включает акциз (раньше был 0)", () => {
  const r = C.compute({lotPrice:9000, auction:"copart", vehicleType:"crossover", fuel:"electric", year:C.CUSTOMS_YEAR - 2, curbKg:1950, port:"nj"});
  assert.ok(r.customs.ev);
  assert.ok(r.customsMdlValue > 20000);
});

test("2026: прежние правила — гибрид −25%, plug-in −50%, электро без акциза", () => {
  const o = {vehicleType:"sedan", engineLiters:2, year:new Date().getFullYear() - 6, rules:"2026"};
  const g = cm({...o, fuel:"gasoline"});
  assert.strictEqual(g.rate, 19.57);                        // 2026, возраст 6 лет → колонка «5–6 лет» (при запуске в 2026 г.)
  assert.strictEqual(cm({...o, fuel:"hybrid"}).baseExcise, g.baseExcise * 0.75);
  assert.strictEqual(cm({...o, fuel:"phev"}).baseExcise, g.baseExcise * 0.5);
  assert.strictEqual(cm({...o, fuel:"electric"}).baseExcise, 0);
});

test("setCustomsRules меняет правила по умолчанию", () => {
  C.setCustomsRules("2026");
  assert.strictEqual(C.getCustomsRules(), "2026");
  assert.strictEqual(cm({vehicleType:"sedan", fuel:"electric", year:2024}).baseExcise, 0);
  C.setCustomsRules("2027");
  assert.ok(cm({vehicleType:"sedan", fuel:"electric", year:2024}).baseExcise > 0);
});
