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
