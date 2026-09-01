const {test} = require("node:test");
const assert = require("node:assert");
const A = require("../calc-core.js");
const p = (mk, md, ti) => A.isPluginHybrid(mk, md, ti);

test("PHEV распознаётся по названию модели/трима", () => {
  assert.ok(p("BMW", "X5", "2018 BMW X5 Xdr40E"));        // случай пользователя
  assert.ok(p("BMW", "X5", "2018 BMW X5 xDrive40e"));
  assert.ok(p("BMW", "3 Series", "2020 BMW 330e"));
  assert.ok(p("Mercedes-Benz", "GLC", "2021 Mercedes GLC 350e"));
  assert.ok(p("Toyota", "RAV4", "2022 Toyota RAV4 Prime"));
  assert.ok(p("Jeep", "Wrangler", "2023 Jeep Wrangler 4xe"));
  assert.ok(p("Ford", "Fusion", "2019 Ford Fusion Energi"));
  assert.ok(p("Volvo", "XC60", "2022 Volvo XC60 Recharge"));
});

test("доп. PHEV-правила: Mitsubishi/Mazda/Volvo/Toyota Prime/Lexus 450h+", () => {
  assert.ok(p("Mitsubishi", "Outlander", "2020 Mitsubishi Outlander"));
  assert.ok(p("Mazda", "CX-90", "2024 Mazda CX-90"));
  assert.ok(p("Mazda", "CX-70", "2025 Mazda CX-70"));
  assert.ok(p("Volvo", "XC60", "2018 Volvo XC60", 2018));
  assert.ok(p("Volvo", "XC90", "2016 Volvo XC90", 2016));
  assert.ok(p("Toyota", "Prius", "2022 Toyota Prius Prime"));
  assert.ok(p("Lexus", "NX", "2023 Lexus NX 450h+"));         // маркер h+
  assert.ok(p("Lexus", "RX", "2024 Lexus RX 450h+"));
  assert.ok(p("Lexus", "NX", "2022 Lexus NX 450", 2022));     // без «+», по году
  assert.ok(p("Lexus", "RX", "2024 Lexus RX 450", 2024));
});

test("доп. правила не срабатывают ложно", () => {
  assert.equal(p("Volvo", "XC90", "2014 Volvo XC90", 2014), false);   // до 2016
  assert.equal(p("Lexus", "RX", "2019 Lexus RX 450h", 2019), false);  // старый RX450h — обычный гибрид
  assert.equal(p("Lexus", "NX", "2021 Lexus NX 300h", 2021), false);
  assert.equal(p("Mazda", "CX-5", "2022 Mazda CX-5"), false);
});

test("не-PHEV не распознаётся ложно", () => {
  assert.equal(p("BMW", "X5", "2019 BMW X5 xDrive40i"), false);  // 40i, не 40e
  assert.equal(p("Toyota", "Camry", "2020 Toyota Camry Hybrid"), false);
  assert.equal(p("Honda", "CR-V", "2021 Honda CR-V Hybrid"), false);
  assert.equal(p("Audi", "e-tron", "2021 Audi e-tron"), false);   // EV, не PHEV
  assert.equal(p("Tesla", "Model Y", "2022 Tesla Model Y"), false);
});

test("у PHEV таможня (акциз) ниже, чем у обычного гибрида", () => {
  const opts = {vehicleType: "suv", engineLiters: 2.0, year: 2018};
  const phev = A.customsMdl(300000, 300000, {...opts, fuel: "phev"}).total;
  const hyb = A.customsMdl(300000, 300000, {...opts, fuel: "hybrid"}).total;
  assert.ok(phev < hyb, `PHEV ${phev} должно быть меньше hybrid ${hyb}`);
});
