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

test("расширенный список: компактные SUV → crossover", () => {
  assert.equal(c("Nissan", "Rogue"), "crossover");
  assert.equal(c("Mazda", "CX-5"), "crossover");
  assert.equal(c("Ford", "Escape"), "crossover");
  assert.equal(c("Chevrolet", "Equinox"), "crossover");
  assert.equal(c("Subaru", "Forester"), "crossover");
  assert.equal(c("Jeep", "Cherokee"), "crossover");
  assert.equal(c("Land Rover", "Discovery Sport"), "crossover");
  assert.equal(c("Infiniti", "QX50"), "crossover");
});

test("расширенный список: средние/крупные → suv", () => {
  assert.equal(c("Nissan", "Murano"), "suv");
  assert.equal(c("Mazda", "CX-9"), "suv");
  assert.equal(c("Ford", "Explorer"), "suv");     // теперь в таблице → suv
  assert.equal(c("Chevrolet", "Tahoe"), "suv");
  assert.equal(c("Toyota", "4Runner"), "suv");
  assert.equal(c("Jeep", "Grand Cherokee"), "suv");
  assert.equal(c("Land Rover", "Range Rover"), "suv");
  assert.equal(c("Infiniti", "QX60"), "suv");
});

test("prefix-коллизии разрешаются длиной (specific раньше general)", () => {
  assert.equal(c("Jeep", "Grand Cherokee"), "suv");     // не путать с Cherokee
  assert.equal(c("Jeep", "Cherokee"), "crossover");
  assert.equal(c("Land Rover", "Discovery"), "suv");    // не путать с Discovery Sport
  assert.equal(c("Land Rover", "Discovery Sport"), "crossover");
});

test("не из таблицы → null (решает кузов лота)", () => {
  assert.equal(c("Toyota", "Camry"), null);
  assert.equal(c("Honda", "Civic"), null);
  assert.equal(c("Ford", "Mustang"), null);
  assert.equal(c("", ""), null);
});

test("crossover дешевле по морю, чем suv (ядро)", () => {
  const cross = ApexCalc.seaShippingFor("crossover", "gasoline", "nj");
  const suv = ApexCalc.seaShippingFor("suv", "gasoline", "nj");
  assert.ok(suv > cross, `suv ${suv} должно быть дороже crossover ${cross}`);
});
