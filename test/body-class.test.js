const {test} = require("node:test");
const assert = require("node:assert");
const ApexCalc = require("../calc-core.js");
const c = (mk, md) => ApexCalc.bodyClassForModel(mk, md);

test("кроссоверы классифицируются как crossover", () => {
  assert.equal(c("Tesla", "Model Y"), "crossover");
  assert.equal(c("BMW", "X1"), "crossover");
  assert.equal(c("BMW", "X4"), "crossover");
  assert.equal(c("Mercedes-Benz", "GLC 300"), "crossover");
  assert.equal(c("Mercedes-Benz", "GLB"), "crossover");
  assert.equal(c("Hyundai", "Tucson"), "crossover");
  assert.equal(c("Kia", "Sportage"), "crossover");
  assert.equal(c("Toyota", "RAV4"), "crossover");
  assert.equal(c("Lexus", "NX 300"), "crossover");
  assert.equal(c("Honda", "CR-V"), "crossover");
  assert.equal(c("Volkswagen", "Tiguan"), "crossover");
  assert.equal(c("Audi", "Q5"), "crossover");
});

test("внедорожники классифицируются как suv", () => {
  assert.equal(c("Tesla", "Model X"), "suv");
  assert.equal(c("BMW", "X5"), "suv");
  assert.equal(c("BMW", "X7"), "suv");
  assert.equal(c("Mercedes-Benz", "GLE 350"), "suv");
  assert.equal(c("Mercedes-Benz", "GLS"), "suv");
  assert.equal(c("Hyundai", "Santa Fe"), "suv");
  assert.equal(c("Kia", "Sorento"), "suv");
  assert.equal(c("Volkswagen", "Atlas"), "suv");
  assert.equal(c("Lexus", "RX 350"), "suv");
  assert.equal(c("Audi", "Q7"), "suv");
});

test("не из списка → null (решает кузов лота)", () => {
  assert.equal(c("BMW", "X6"), null);
  assert.equal(c("Toyota", "Camry"), null);
  assert.equal(c("Ford", "Explorer"), null);
  assert.equal(c("", ""), null);
});

test("crossover дешевле по морю, чем suv (ядро)", () => {
  const cross = ApexCalc.seaShippingFor("crossover", "gasoline", "nj");
  const suv = ApexCalc.seaShippingFor("suv", "gasoline", "nj");
  assert.ok(suv > cross, `suv ${suv} должно быть дороже crossover ${cross}`);
});
