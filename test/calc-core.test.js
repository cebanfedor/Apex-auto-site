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
