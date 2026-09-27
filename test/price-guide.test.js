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

test("acvExtraAdj: сработавшие подушки понижают; ключ больше не влияет (Федор 28.09.2026 — 99% не играет роль)", () => {
  assert.equal(pg.acvExtraAdj({}), 1);
  assert.equal(pg.acvExtraAdj({airbags:"Deployed"}), 0.8);
  assert.equal(pg.acvExtraAdj({keys:"No"}), 1);
  assert.equal(pg.acvExtraAdj({airbags:"deployed", keys:"нет"}), 0.8);
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

test("conditionCoef: документ почти всегда роли не играет (Федор 28.09.2026, Tesla Model Y CoD 7SAYGDEF8PF704867)", () => {
  // Certificate of Destruction больше НЕ обнуляет до 0.5 — цену решают повреждения (перед+зад,
  // не на ходу → тот же коэффициент 0.8, что и у обычного Salvage с той же историей повреждений).
  const dmg = {dmg:"Rear End", dmg2:"Front End", run:false};
  const cod = pg.conditionCoef({...dmg, doc:"Fl - Certificate Of Destruction"});
  const salvage = pg.conditionCoef({...dmg, doc:"Ga - Cert Of Title-Salvage"});
  const nonRepair = pg.conditionCoef({...dmg, doc:"Non-Repairable"});
  assert.equal(cod, 0.8);
  assert.equal(salvage, cod);      // документ не играет роль — совпадает с «обычным» salvage
  assert.equal(nonRepair, cod);
  // Bill of Sale / ACQ — небольшая скидка сверху обычного коэффициента.
  assert.ok(Math.abs(pg.conditionCoef({...dmg, doc:"Bill of Sale"}) - 0.8 * 0.92) < 1e-9);
  assert.ok(Math.abs(pg.conditionCoef({...dmg, doc:"ACQ"}) - 0.8 * 0.92) < 1e-9);
  // Clean/Clear title — небольшая надбавка.
  const minor = {dmg:"Minor Dent/Scratches", dmg2:"", run:true};
  assert.equal(pg.conditionCoef(minor), 1.1);
  assert.ok(Math.abs(pg.conditionCoef({...minor, doc:"Clean Title"}) - 1.1 * 1.05) < 1e-9);
  assert.ok(Math.abs(pg.conditionCoef({...minor, doc:"NY - Clear"}) - 1.1 * 1.05) < 1e-9);
});

test("estimateFromAcv: реальный лот (2022 Porsche Panamera Base, IAAI 66261236, 26.09.2026)", () => {
  // Minor Dent/Scratches, run_and_drives, Cert Of Title-Salvage → coef 1.1; ACV $66 124, пробег 45 806 миль.
  // Прежняя логика (усреднение всего пула поколения — 4 старых Panamera 2017–2018) давала медиану $16 231, занижая свежий кузов.
  const coef = pg.conditionCoef({dmg:"Minor Dent/Scratches", dmg2:"", cond:"run_and_drives", doc:"Ga - Cert Of Title-Salvage"});
  assert.equal(coef, 1.1);
  const b = pg.estimateFromAcv(66124, coef, 45806, {airbags:"", keys:"Да"});
  assert.deepEqual(b, {lo:26700, mid:31400, hi:36100});
});

test("repairRatioAdj: дешёвый ремонт относительно ACV — поднимает оценку; дорогой — понижает", () => {
  assert.equal(pg.repairRatioAdj(0, 20000), 1);          // нет данных о ремонте — нейтрально
  assert.equal(pg.repairRatioAdj(1000, 0), 1);            // нет ACV — нейтрально
  assert.equal(pg.repairRatioAdj(1500, 20000), 1.2);      // 7.5% от ACV — дёшево чинить
  assert.equal(pg.repairRatioAdj(3000, 20000), 1.1);      // 15%
  assert.equal(pg.repairRatioAdj(6000, 20000), 1);        // 30% — типичный диапазон
  assert.equal(pg.repairRatioAdj(9000, 20000), 0.9);      // 45%
  assert.equal(pg.repairRatioAdj(15000, 20000), 0.8);     // 75%
  assert.equal(pg.repairRatioAdj(19000, 20000), 0.7);     // 95% — ремонт почти как вся машина
});

test("estimateFromAcv: реальный лот (2021 Tesla Model Y Performance Dual Motor, IAAI 40084037, 28.09.2026)", () => {
  // Повреждение «Правая сторона / Structural», состояние не указано, документ «VA · Clean» → coef 0.8925.
  // ACV $24 742, пробег 52 895 миль, оценка ремонта $3 045 (≈12% ACV — дёшево чинить несмотря на ярлык
  // «Structural»). Федор не поверил вилке $5 600–$8 600 («машина должна сыграть дороже») — раньше формула
  // ИГНОРИРОВАЛА оценку ремонта конкретного VIN, хотя она прямо показывает, что повреждение не тяжёлое.
  const coef = pg.conditionCoef({dmg:"right side", dmg2:"Structural", cond:"", doc:"VA Clean"});
  assert.ok(Math.abs(coef - 0.8925) < 1e-6);
  const without = pg.estimateFromAcv(24742, coef, 52895, {airbags:""});
  const withRepair = pg.estimateFromAcv(24742, coef, 52895, {airbags:"", repairCost:3045});
  assert.deepEqual(without, {lo:6400, mid:7500, hi:8700});
  assert.deepEqual(withRepair, {lo:7100, mid:8300, hi:9500});
  assert.ok(withRepair.mid > without.mid);
});
