const {test} = require("node:test");
const assert = require("node:assert");
const ApexCalc = require("../calc-core.js");

// Тестируем ИНВАРИАНТЫ (границы, конечность, монотонность), а НЕ конкретные суммы
// тарифов — числа ставок/пошлин калибрует владелец, тесты не должны их фиксировать.

test("auctionFeeFor: неположительная цена → нулевой сбор (Copart/IAAI)", () => {
  assert.equal(ApexCalc.auctionFeeFor(0, "copart").total, 0);
  assert.equal(ApexCalc.auctionFeeFor(-5000, "copart").total, 0);
});

test("auctionFeeFor: результат всегда конечный и неотрицательный", () => {
  for(const price of [0, 1, 999, 12000, 100000, 1e6, 1e999]){
    for(const auc of ["copart", "iaai", "manheim"]){
      const fee = ApexCalc.auctionFeeFor(price, auc).total;
      assert.ok(Number.isFinite(fee), `fee конечен для ${auc}@${price}`);
      assert.ok(fee >= 0, `fee неотрицателен для ${auc}@${price}`);
    }
  }
});

test("auctionFeeFor: сбор не убывает с ростом цены (Copart)", () => {
  let prev = -1;
  for(const price of [1000, 3000, 5000, 10000, 20000, 50000, 100000]){
    const fee = ApexCalc.auctionFeeFor(price, "copart").total;
    assert.ok(fee >= prev, `монотонность @${price}: ${fee} >= ${prev}`);
    prev = fee;
  }
});

test("auctionFeeFor: IAAI дороже Copart на фикс. надбавку", () => {
  const p = 12000;
  assert.equal(
    ApexCalc.auctionFeeFor(p, "iaai").total,
    ApexCalc.auctionFeeFor(p, "copart").total + 50
  );
});

test("seaShippingFor: конечная положительная цена для разных типов/топлив", () => {
  for(const type of ["sedan", "crossover", "suv", "pickup", "moto", "atv"]){
    for(const fuel of ["gasoline", "hybrid", "electric"]){
      const sea = ApexCalc.seaShippingFor(type, fuel, "nj");
      assert.ok(Number.isFinite(sea) && sea > 0, `${type}/${fuel} → ${sea}`);
    }
  }
});

test("seaShippingFor: Бус (vanLarge) — своя цена по порту, не формула «база+500», как у пикапа", () => {
  for(const port of ["nj", "savannah", "houston", "la"]){
    const bus = ApexCalc.seaShippingFor("vanLarge", "gasoline", port);
    assert.ok(Number.isFinite(bus) && bus > 0, `Бус@${port} = ${bus}`);
  }
  const pickupNj = ApexCalc.seaShippingFor("pickup", "gasoline", "nj");
  const busNj = ApexCalc.seaShippingFor("vanLarge", "gasoline", "nj");
  assert.notEqual(busNj, pickupNj, "у Буса отдельная ставка, не общая «крупногабаритная» надбавка");
  const busLa = ApexCalc.seaShippingFor("vanLarge", "gasoline", "la");
  assert.ok(busLa > busNj, "дальний порт (CA) дороже ближнего (NJ) и для Буса тоже");
});

test("landShippingFor: без локации → 0, с локацией → конечно", () => {
  assert.equal(ApexCalc.landShippingFor(null, "sedan", false), 0);
  const land = ApexCalc.landShippingFor({landPrice: 500}, "suv", true);
  assert.ok(Number.isFinite(land) && land > 0);
});

test("insuranceFor: не ниже минимума и конечно", () => {
  for(const v of [0, 5000, 50000]){
    const ins = ApexCalc.insuranceFor(v);
    assert.ok(Number.isFinite(ins) && ins >= 100, `insurance@${v} = ${ins}`);
  }
});

test("paymentFeeFor: 1% от (лот + сбор), не ниже $50", () => {
  assert.equal(ApexCalc.paymentFeeFor(12000, 800), 128);      // 1% от 12800
  assert.equal(ApexCalc.paymentFeeFor(2000, 300), 50);         // 1% = 23 → минимум 50
  assert.equal(ApexCalc.paymentFeeFor(0, 0), 50);              // минимум держится
  for(const [lot, fee] of [[0,0],[3000,300],[50000,2000]]){
    const p = ApexCalc.paymentFeeFor(lot, fee);
    assert.ok(Number.isFinite(p) && p >= 50, `paymentFee@${lot}/${fee} = ${p}`);
  }
});

test("compute: оплата в MDL (комиссия 1% + брокер 2000 MDL) включена по умолчанию и снимается флагом", () => {
  const base = {lotPrice:12000, auction:"copart", vehicleType:"sedan", fuel:"gasoline", engineLiters:2, year:2020, usdMdl:17.45, eurMdl:20.28};
  const on = ApexCalc.compute(base);
  const off = ApexCalc.compute(Object.assign({}, base, {paymentFee:false}));
  assert.ok(on.paymentFee > 0, "по умолчанию комиссия > 0");
  assert.equal(on.brokerUtilMdl, 2000, "по умолчанию брокер+утиль = 2000 MDL");
  assert.equal(off.paymentFee, 0, "с paymentFee:false комиссии нет");
  assert.equal(off.brokerUtilMdl, 0, "с paymentFee:false брокер+утиль = 0");
  // разница итога = комиссия (USD) + брокер (2000 MDL → USD): оба входят 1:1
  const expectedDiff = on.paymentFee + on.brokerUtilMdl / base.usdMdl;
  assert.ok(Math.abs((on.totalUsd - off.totalUsd) - expectedDiff) < 1, "итог отличается ровно на комиссию + брокер");
});

test("customsMdl: мото — НДС 27% от landBaseMdl (суша), а не от customsBaseMdl (море)", () => {
  const seaBase = 400000, landBase = 150000;
  const c = ApexCalc.customsMdl(seaBase, seaBase, {vehicleType:"moto", landBaseMdl:landBase});
  assert.equal(c.total, landBase * 0.27, "считает от суши, не от моря");
  assert.equal(c.vatPct, 27);
  // Рост «морской» базы без изменения «сухопутной» не должен менять растаможку мото.
  const c2 = ApexCalc.customsMdl(seaBase * 3, seaBase * 3, {vehicleType:"moto", landBaseMdl:landBase});
  assert.equal(c2.total, c.total, "customsBaseMdl (море) не влияет на мото, когда передан landBaseMdl");
});

test("customsMdl: мото без landBaseMdl — деградирует на customsBaseMdl (страховка от падения, не основной путь)", () => {
  const c = ApexCalc.customsMdl(200000, 200000, {vehicleType:"moto"});
  assert.equal(c.total, 200000 * 0.27);
});

test("customsMdl: пикап/van large остаются на 20% от customsBaseMdl — ставка мото их не задевает", () => {
  for(const type of ["pickup", "vanLarge"]){
    const c = ApexCalc.customsMdl(300000, 300000, {vehicleType:type, landBaseMdl:999});
    assert.equal(c.total, 300000 * 0.20, `${type} игнорирует landBaseMdl и ставку мото`);
    assert.equal(c.vatPct, 20);
  }
});

test("compute: у мото landBaseMdl считается сервером из (лот+сбор+суша), не из моря", () => {
  const loc = {landPrice:500, autoLand:500, autoPort:"nj"};
  const withLand = ApexCalc.compute({lotPrice:8000, auction:"copart", vehicleType:"moto", fuel:"gasoline", year:2023, usdMdl:17.45, eurMdl:20.28, location:loc});
  const noLand = ApexCalc.compute({lotPrice:8000, auction:"copart", vehicleType:"moto", fuel:"gasoline", year:2023, usdMdl:17.45, eurMdl:20.28, location:null});
  assert.ok(withLand.land > 0, "с локацией есть сухопутная доставка");
  assert.equal(noLand.land, 0, "без локации суши нет");
  assert.notEqual(withLand.customsUsd, noLand.customsUsd, "растаможка мото меняется вместе с сушей (а не остаётся по морю)");
});

test("минивен: как внедорожник, но море +$100; распознавание Sienna/Pacifica/Carnival/Metris", () => {
  const base = {lotPrice:16700, auction:"copart", fuel:"gasoline", engineLiters:3.5, year:2022, usdMdl:17.45, eurMdl:20.28, port:"nj"};
  const suv = ApexCalc.compute({...base, vehicleType:"suv"});
  const mv = ApexCalc.compute({...base, vehicleType:"minivan"});
  assert.equal(mv.sea - suv.sea, 100, "море минивена = внедорожник + 100");
  assert.equal(mv.land, suv.land, "суша как у внедорожника");
  for(const [mk, md] of [["Toyota","Sienna"],["Chrysler","Pacifica"],["Kia","Carnival"],["Mercedes-Benz","Metris"],["Mercedes-Benz","V-Class"],["Dodge","Grand Caravan"],["Honda","Odyssey"]])
    assert.ok(ApexCalc.isMinivan(mk, md, "", ""), mk + " " + md);
  for(const [mk, md] of [["Ford","Transit"],["Mercedes-Benz","Sprinter"],["Toyota","Highlander"],["Honda","Pilot"]])
    assert.ok(!ApexCalc.isMinivan(mk, md, "", ""), mk + " " + md + " — не минивен");
});

test("канада (дилерский аукцион): сбор по таблице Manheim без надбавки США", () => {
  const C = require("../calc-core.js");
  assert.equal(C.auctionFeeFor(4000, "manheim", true).total, 820);
  assert.equal(C.auctionFeeFor(5000, "manheim", true).total, 820);
  assert.equal(C.auctionFeeFor(12000, "manheim", true).total, 1070);
  assert.equal(C.auctionFeeFor(28000, "manheim", true).total, 1100);
  assert.equal(C.auctionFeeFor(60000, "manheim", true).total, 2000);
  assert.equal(C.auctionFeeFor(4000, "manheim", false).total, 920);
});

test("computeCanada: дилерская площадка Канады — сбор Manheim + канадская логистика (14.11.2026)", () => {
  const C = require("../calc-core.js");
  const L = require("../locations.js").CANADA_LOCATIONS;
  const loc = C.findCanadaLocation("Halifax, Nova Scotia, Canada", "", L, "copart");
  assert.equal(loc.province, "NS");
  const r = C.computeCanada({bidUsd:8696, auction:"manheim", vehicleType:"crossover", fuel:"gasoline", engineLiters:1.5, year:2020, location:loc, usdMdl:17.8, eurMdl:20.5, customsRules:"2027"});
  assert.equal(r.auctionFee, 1070);            // Manheim 5–15 тыс., без надбавки США
  assert.equal(r.dispatch, 585);               // 650 CAD × 0.90
  assert.equal(r.bankFee, 100);
  assert.equal(r.keeper, 300);
  assert.equal(r.ocean, 950);
  assert.equal(r.road, 1750);                  // кроссовер
  assert.equal(r.canadaFee, 300);              // 2%, минимум 300
  assert.equal(r.paymentFee, 98);              // 1% от (ставка + сбор)
  assert.equal(r.brokerUsd, Math.round(2000 / 17.8));
  assert.equal(C.computeCanada({bidUsd:20000, auction:"manheim", location:loc}).canadaFee, 400);
  // оплата не в MDL: без комиссии на оплату и брокера
  const noPay = C.computeCanada({bidUsd:8696, auction:"manheim", location:loc, paymentFee:false});
  assert.equal(noPay.paymentFee, 0); assert.equal(noPay.brokerUsd, 0);
  // BC: фиксированная доставка 1700, без банка TD
  const bc = C.computeCanada({bidUsd:8000, auction:"manheim", location:L.find(l => l.zone === "bc")});
  assert.equal(bc.dispatch, 1700); assert.equal(bc.bankFee, 0);
  // площадка не определилась — доставка неизвестна
  assert.equal(C.computeCanada({bidUsd:8000, auction:"manheim", location:null}).dispatchUnknown, true);
});

test("канада: ближайшая площадка по координатам/городу (14.11.2026)", () => {
  require("../canada-locations.js");
  const A = require("../calc-core.js");
  const near = (t, p) => A.nearestCanadaLocation(t, p);
  assert.equal(near("Mississauga, Ontario, Canada").name, "Copart Toronto");            // город из таблицы → ближайший двор
  assert.equal(near("Mississauga, Ontario, Canada").pointSrc, "city");
  assert.equal(near("x", {lat:45.5, lon:-73.5}).name, "Copart Montreal");                // координаты объявления важнее текста
  assert.equal(near("x", {lat:45.5, lon:-73.5}).pointSrc, "gps");
  assert.equal(near("Richmond Hill, Ontario").pointSrc, "city");                         // Richmond Hill (ON) ≠ Richmond (BC)
  assert.notEqual(near("Richmond Hill, Ontario").province, "BC");
  assert.equal(near("Ontario").pointSrc, "province");                                    // города нет → центр провинции
  assert.equal(near(""), null);
  assert.ok(near("Halifax, Nova Scotia").distKm <= 5);
});
test("канада: plug-in гибрид BMW X5 xDrive45e распознаётся по названию", () => {
  const A = require("../calc-core.js");
  assert.equal(A.isPluginHybrid("BMW", "X5", "2022 BMW X5 xDrive45e", 2022), true);
  assert.equal(A.isPluginHybrid("BMW", "i4", "2023 BMW i4 eDrive40", 2023), false);
  assert.equal(A.isPluginHybrid("BMW", "iX", "2023 BMW iX xDrive50", 2023), false);
});
