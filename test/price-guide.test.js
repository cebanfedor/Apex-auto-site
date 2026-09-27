const {test} = require("node:test");
const assert = require("node:assert");
const pg = require("../server/price-guide.js");

test("acvRatioFor: известные коэффициенты состояния", () => {
  assert.equal(pg.acvRatioFor(1.1), 0.42);
  assert.equal(pg.acvRatioFor(1), 0.29);
  assert.equal(pg.acvRatioFor(0.5), 0.16);
});

test("acvMileageAdj: без пробега — нейтрально, дальше по ступеням из акта калибровки (?action=acvcalib)", () => {
  assert.equal(pg.acvMileageAdj(0), 1);
  assert.equal(pg.acvMileageAdj(20000), 1.15);
  assert.equal(pg.acvMileageAdj(80000), 1);
  assert.equal(pg.acvMileageAdj(300000), 0.65);
});

test("acvExtraAdj: сработавшие подушки и отсутствие ключей понижают", () => {
  assert.equal(pg.acvExtraAdj({}), 1);
  assert.equal(pg.acvExtraAdj({airbags:"Deployed"}), 0.8);
  assert.equal(pg.acvExtraAdj({keys:"No"}), 0.6);
  assert.ok(Math.abs(pg.acvExtraAdj({airbags:"deployed", keys:"нет"}) - 0.48) < 1e-9);
});

test("estimateFromAcv: маленькая ACV или её отсутствие — не оцениваем", () => {
  assert.equal(pg.estimateFromAcv(0, 1, 50000), null);
  assert.equal(pg.estimateFromAcv(400, 1, 50000), null);
});

test("estimateFromAcv: вилка симметрична вокруг середины и не выше 90% ACV", () => {
  const b = pg.estimateFromAcv(66124, 1, 80000, {});
  assert.equal(b.mid, Math.round(66124 * 0.29 / 100) * 100);
  assert.ok(b.lo < b.mid && b.mid < b.hi);
  assert.ok(b.hi <= 66124 * 0.9);
});

test("estimateFromAcv: реальный лот (2022 Porsche Panamera Base, IAAI 66261236, 26.09.2026)", () => {
  // Minor Dent/Scratches, run_and_drives, Cert Of Title-Salvage → coef 1.1; ACV $66 124, пробег 45 806 миль.
  // Прежняя логика (усреднение всего пула поколения — 4 старых Panamera 2017–2018) давала медиану $16 231, занижая свежий кузов.
  const coef = pg.conditionCoef({dmg:"Minor Dent/Scratches", dmg2:"", cond:"run_and_drives", doc:"Ga - Cert Of Title-Salvage"});
  assert.equal(coef, 1.1);
  const b = pg.estimateFromAcv(66124, coef, 45806, {airbags:"", keys:"Да"});
  assert.deepEqual(b, {lo:26700, mid:31400, hi:36100});
});
