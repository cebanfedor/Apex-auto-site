const {test} = require("node:test");
const assert = require("node:assert");
const {computeComps} = require("../api/auctions.js");
const priceGuide = require("../server/price-guide.js");

// 28.09.2026 (Федор, Tesla Model Y Copart 59336256: «вилка до $31700 — супер дорого, у машины Structural
// повреждение справа»). Раньше computeComps взвешивал пул похожих продаж ТОЛЬКО по году/пробегу — состояние
// повреждений самого оцениваемого лота не влияло на ОТБОР пула, только на то, с какого перцентиля брать
// итоговую цифру. Почти целые экземпляры того же года/пробега наравне тянули верхнюю границу вверх для
// повреждённого лота. Теперь пул дополнительно довешивается по близости coef состояния (meta.coef).

function row({final_bid, year, odometer_mi, dmg, run = true, doc = ""}){
  return {final_bid, year, odometer_mi, dmg, run, doc, fuel_id:0, fuel_x:0, heavy:false};
}

test("computeComps: без coef в meta — прежнее поведение воспроизводится (баг Tesla Model Y Copart 59336256: верх вилки застревает в кластере «целых»)", () => {
  const good = Array.from({length:6}, (_, i) => row({final_bid:30000 + i * 200, year:2022, odometer_mi:19500 + i * 300, dmg:"Minor Dent/Scratches"}));
  const poor = Array.from({length:6}, (_, i) => row({final_bid:15000 + i * 200, year:2022, odometer_mi:19500 + i * 300, dmg:"Right Side / Structural"}));
  const rows = [...good, ...poor];
  const st = computeComps(rows, {year:2022, odometer:20000, genFrom:2022, genTo:2025, cq:"mid"});
  assert.ok(st && st.count === 12);
  // Без coef пул НЕ сужается по состоянию — верхний перцентиль (hiP=88 при cq=mid) неизбежно достаёт
  // до кластера «целых» ($30k+), хотя лот битый. Это и есть воспроизведённый баг из жалобы Федора.
  assert.ok(st.p75 > 28000, `p75=${st.p75} — без coef верх вилки должен доставать до кластера «целых», как в баге до фикса`);
});

test("computeComps: с coef и достаточным числом похожих по состоянию продаж — пул СУЖАЕТСЯ, верх вилки не завышен целыми машинами", () => {
  const good = Array.from({length:6}, (_, i) => row({final_bid:30000 + i * 200, year:2022, odometer_mi:19500 + i * 300, dmg:"Minor Dent/Scratches"}));
  const poor = Array.from({length:6}, (_, i) => row({final_bid:15000 + i * 200, year:2022, odometer_mi:19500 + i * 300, dmg:"Right Side / Structural"}));
  const rows = [...good, ...poor];
  // Тот же реальный кейс: Structural + Clean title, run_and_drives.
  const targetCoef = priceGuide.conditionCoef({dmg:"Right Side", dmg2:"Structural", run:true, doc:"Clean"});
  const st = computeComps(rows, {year:2022, odometer:20000, genFrom:2022, genTo:2025, cq:"mid", coef:targetCoef});
  assert.ok(st && st.count === 6, `count=${st && st.count} — пул должен сузиться до 6 похожих по состоянию (Structural), исключив 6 «целых»`);
  // Раньше (без сужения) верх вилки (p75/hi-перцентиль) забирался из кластера «целых» ($30k+) — с 12 строк
  // в пуле и hiP=88 (cq=mid) итог был близко к $31k, как и жаловался Федор. Теперь пул сужен ДО похожих по
  // состоянию — верх должен остаться в пределах кластера Structural ($15-16k), а не улетать к «целым».
  assert.ok(st.p75 < 20000, `p75=${st.p75}, верх вилки всё ещё подпёрт «целыми» машинами`);
  assert.ok(st.trueMedian < 17000, `trueMedian=${st.trueMedian}, должна тянуться к кластеру Structural ($15-16k)`);
});

test("computeComps: строки без данных о повреждениях (живой фолбэк, r.dmg===undefined) — довес по состоянию не применяется, не падает", () => {
  const rows = [
    {final_bid:20000, year:2022, odometer_mi:20000, run:true, fuel_id:0, fuel_x:0, heavy:false},
    {final_bid:22000, year:2022, odometer_mi:21000, run:true, fuel_id:0, fuel_x:0, heavy:false},
    {final_bid:19000, year:2022, odometer_mi:19500, run:false, fuel_id:0, fuel_x:0, heavy:false},
    {final_bid:21000, year:2022, odometer_mi:20500, run:true, fuel_id:0, fuel_x:0, heavy:false},
  ];
  const targetCoef = priceGuide.conditionCoef({dmg:"Right Side", dmg2:"Structural", run:true, doc:"Clean"});
  const st = computeComps(rows, {year:2022, odometer:20000, genFrom:2022, genTo:2025, cq:"mid", coef:targetCoef});
  assert.ok(st && st.count === 4);
  assert.ok(st.trueMedian > 0);
});
