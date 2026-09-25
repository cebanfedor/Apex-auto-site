const {test} = require("node:test");
const assert = require("node:assert");
const pt = require("../server/powertrain.js");

// Ответы vPIC (реальные VIN из базы лотов, 25.09.2026)
const V = {
  cx90mild: {Make:"MAZDA", Model:"CX-90", ElectrificationLevel:"Mild HEV (Hybrid Electric Vehicle)", FuelTypePrimary:"Gasoline", FuelTypeSecondary:"Electric"},
  cx90phev: {Make:"MAZDA", Model:"CX-90", ElectrificationLevel:"PHEV (Plug-in Hybrid Electric Vehicle)", FuelTypePrimary:"Electric", FuelTypeSecondary:"Gasoline"},
  santafeHev: {Make:"HYUNDAI", Model:"Santa Fe", ElectrificationLevel:"HEV (Hybrid Electric Vehicle)", FuelTypePrimary:"Gasoline", FuelTypeSecondary:"Electric"},
  santafeGas: {Make:"HYUNDAI", Model:"Santa Fe", FuelTypePrimary:"Gasoline"},
  prius: {Make:"TOYOTA", Model:"Prius", ElectrificationLevel:"Strong HEV (Hybrid Electric Vehicle)", FuelTypePrimary:"Gasoline", FuelTypeSecondary:"Electric"},
  volt: {Make:"CHEVROLET", Model:"Volt", ElectrificationLevel:"PHEV (Plug-in Hybrid Electric Vehicle)", FuelTypePrimary:"Electric", FuelTypeSecondary:"Gasoline"},
  ev: {Make:"TESLA", Model:"Model 3", ElectrificationLevel:"BEV (Battery Electric Vehicle)", FuelTypePrimary:"Electric"},
  diesel: {Make:"RAM", Model:"2500", FuelTypePrimary:"Diesel"},
  dieselMild: {Make:"RAM", Model:"1500", ElectrificationLevel:"Mild HEV (Hybrid Electric Vehicle)", FuelTypePrimary:"Diesel"},
  reev: {Make:"BMW", Model:"i3", FuelTypePrimary:"Electric", FuelTypeSecondary:"Gasoline"},
  empty: {Make:"", Model:""}
};

test("vPIC: уровень электрификации → тип силовой установки", () => {
  assert.deepEqual(pt.kindFromVpic(V.cx90mild), {x:4, src:4, level:"MHEV"});   // CX-90 3.3T: mild-hybrid = бензин
  assert.equal(pt.kindFromVpic(V.cx90phev).x, 5);
  assert.equal(pt.kindFromVpic(V.santafeHev).x, 3);
  assert.equal(pt.kindFromVpic(V.santafeGas).x, 4);
  assert.equal(pt.kindFromVpic(V.prius).x, 3);
  assert.equal(pt.kindFromVpic(V.volt).x, 5);
  assert.equal(pt.kindFromVpic(V.ev).x, 2);
  assert.equal(pt.kindFromVpic(V.diesel).x, 1);
  assert.equal(pt.kindFromVpic(V.dieselMild).x, 1);
  assert.equal(pt.kindFromVpic(V.reev).x, 5);
  assert.equal(pt.kindFromVpic(V.empty), null);
  assert.equal(pt.kindFromVpic(null), null);
});

test("EPA: какие варианты бывают у модели в году", () => {
  assert.equal(pt.epaFlags("Hyundai", "Santa Fe", 2023), "GHP");
  assert.equal(pt.epaFlags("Hyundai", "Santa Fe", 2020), "G");
  assert.equal(pt.epaFlags("Kia", "Sorento", 2024), "GHP");
  assert.equal(pt.epaFlags("Mazda", "CX-50", 2025), "GH");
  assert.equal(pt.epaFlags("Toyota", "Prius", 2018), "H");
  assert.equal(pt.epaFlags("Toyota", "Camry", 2018), "GH");
  assert.equal(pt.epaFlags("Dodge", "Challenger", 2018), "");   // гибридных вариантов нет — в таблице не хранится
});

test("запасные правила (VIN не расшифрован)", () => {
  const r = (make, model, year, title, fuelId) => pt.kindFromRules({make, model, year, title, fuelId}).x;
  assert.equal(r("Toyota", "Prius", 2020, "2020 Toyota Prius L", 4), 3);            // все Prius гибриды, фид ошибся
  assert.equal(r("Toyota", "RAV4", 2021, "2021 Toyota Rav4 Prime Se", 3), 5);
  assert.equal(r("Hyundai", "Santa Fe", 2023, "2023 Hyundai Santa Fe Limited", 3), 3);
  assert.equal(r("Hyundai", "Santa Fe", 2023, "2023 Hyundai Santa Fe Sel", 4), 4);
  assert.equal(r("BMW", "X5", 2021, "2021 BMW X5 xDrive45E", 3), 5);
  assert.equal(r("Toyota", "Camry", 2023, "2023 Toyota Camry Xle Hybrid", 3), 3);   // XLE Hybrid — не plug-in
  assert.equal(r("Tesla", "Model 3", 2022, "2022 Tesla Model 3", 2), 2);
  assert.equal(r("Ford", "F-150", 2022, "2022 Ford F-150 Xlt", 4), 4);
});

test("decide: vPIC главнее фида", () => {
  const row = {make:"Mazda", model:"CX-90", year:2025, title:"2025 Mazda Cx-90 Hybrid 4D Suv Turbo Premium Plus", fuelId:4};
  assert.equal(pt.decide(row, V.cx90mild).x, 4);        // фид «бензин», vPIC mild — бензин
  assert.equal(pt.decide({...row, fuelId:3}, V.cx90phev).x, 5);
  assert.equal(pt.decide({...row, fuelId:3}, null).x, 5);   // vPIC недоступен → правила (CX-90 hybrid = PHEV по calc-core)
});

test("validVin", () => {
  assert.ok(pt.validVin("JM3KKEHD2S1223930"));
  assert.ok(!pt.validVin("JM3KKEHD2S122393"));
  assert.ok(!pt.validVin("YAMC0412F222"));
});

test("полное название: усечённое слово, комплектация по VIN, гибрид", () => {
  const ft = pt.fullTitle;
  assert.equal(ft("2022 Toyota Rav4 Hybri", {trim:"XSE", kind:3}), "2022 Toyota Rav4 Hybrid XSE");
  assert.equal(ft("2022 Ford Escape Titanium", {trim:"Titanium", kind:3}), "2022 Ford Escape Titanium Hybrid");
  assert.equal(ft("2024 Ford Maverick Lariat", {trim:"Lariat", kind:3}), "2024 Ford Maverick Lariat Hybrid");
  assert.equal(ft("2023 Tesla Model Y", {trim:"Long Range Dual Motor", kind:2}), "2023 Tesla Model Y Long Range Dual Motor");
  assert.equal(ft("2023 Tesla Model 3", {trim:"", kind:2}), "2023 Tesla Model 3");
  assert.equal(ft("2018 BMW 530e Iperformance", {trim:"", kind:5}), "2018 BMW 530e Iperformance");
  assert.equal(ft("2014 BMW X3 xDrive28i", {trim:"xDrive28i", kind:4}), "2014 BMW X3 xDrive28i");
  assert.equal(ft("2021 Kia Sorento", {trim:"", kind:5}), "2021 Kia Sorento Plug-in Hybrid");
  assert.equal(ft("2020 Toyota Camry Le", {trim:"", kind:4}), "2020 Toyota Camry Le");
});
test("комплектация из vPIC", () => {
  assert.equal(pt.trimFromVpic({Make:"TOYOTA", Trim:"XSE"}), "XSE");
  assert.equal(pt.trimFromVpic({Make:"FORD", Trim:"Titanium FHEV"}), "Titanium");
  assert.equal(pt.trimFromVpic({Make:"FORD", Trim:"LARIAT"}), "Lariat");
  assert.equal(pt.trimFromVpic({Make:"TESLA", OtherEngineInfo:"Dual Motor – Standard"}), "Long Range Dual Motor");
  assert.equal(pt.trimFromVpic({Make:"TESLA", OtherEngineInfo:"Dual Motor - Performance"}), "Performance Dual Motor");
  assert.equal(pt.trimFromVpic({Make:"TESLA", OtherEngineInfo:"Single Motor – Standard / Performance"}), "");
  assert.equal(pt.trimFromVpic({Make:"BMW", Trim:"Base"}), "");
});

test("списки комплектаций и дубли не попадают в название", () => {
  const ft = pt.fullTitle;
  assert.equal(ft("2024 Toyota Corolla Hybrid Se", {trim:"LE, SE, XSE, LE w/Convenience Tech pkg", kind:3}), "2024 Toyota Corolla Hybrid Se");
  assert.equal(ft("2022 Mitsubishi Outlander Phev", {trim:"SEL/LE/GT/BE/SE", kind:5}), "2022 Mitsubishi Outlander Phev");
  assert.equal(ft("2021 Tesla Model Y Long Range", {trim:"Long Range Dual Motor", kind:2}), "2021 Tesla Model Y Long Range Dual Motor");
  assert.equal(ft("2026 Kia Carnival Hev Sx/Sx+", {trim:"SX, SX Prestige", kind:3}), "2026 Kia Carnival Hev Sx/Sx+");
  assert.equal(pt.trimFromVpic({Make:"TOYOTA", Trim:"LE, SE, XSE"}), "");
});

test("мягкий гибрид = бензин (правило Федора)", () => {
  const r = (make, model, year, title, fuelId) => pt.kindFromRules({make, model, year, title, fuelId});
  assert.deepEqual(r("Audi", "A4", 2021, "2021 Audi A4 Premium Plus 40", 3), {x:4, src:4});   // 40 TFSI mild hybrid; vPIC по VIN молчит
  assert.deepEqual(r("Audi", "A4", 2021, "2021 Audi A4 Premium Plus 40", 4), {x:4, src:2});   // фид сказал бензин — бензин
  assert.equal(r("Audi", "Q5", 2021, "2021 Audi Q5 E Premium Plus", 3).x, 5);                   // Q5 e — plug-in
  assert.equal(r("Toyota", "Camry", 2023, "2023 Toyota Camry Xle Hybrid", 3).x, 3);           // настоящий гибрид
  assert.equal(r("Toyota", "Prius", 2020, "2020 Toyota Prius L", 4).x, 3);
  assert.equal(r("Dodge", "Hornet", 2024, "2024 Dodge Hornet R/T Plus Eaw", 3).x, 5);           // у Hornet гибрид бывает только plug-in
});

test("обрывки комплектации отбрасываются", () => {
  assert.equal(pt.fullTitle("2022 Polestar 2", {trim:"e-", kind:2}), "2022 Polestar 2");
  assert.equal(pt.trimFromVpic({Make:"POLESTAR", Trim:"e-"}), "");
});

test("vPIC «Mild HEV» у Toyota/Hyundai с Hybrid в названии — всё же полный гибрид; у Audi — бензин", () => {
  const mild = {Make:"X", Model:"Y", ElectrificationLevel:"Mild HEV (Hybrid Electric Vehicle)", FuelTypePrimary:"Gasoline", FuelTypeSecondary:"Electric"};
  assert.equal(pt.decide({make:"Hyundai", model:"Elantra", year:2021, title:"2021 Hyundai Elantra Hybrid Limited", fuelId:3}, mild).x, 3);
  assert.equal(pt.decide({make:"Toyota", model:"Land Cruiser", year:2026, title:"2026 Toyota Land Cruiser Base", fuelId:3}, mild).x, 3);
  assert.equal(pt.decide({make:"Audi", model:"A4", year:2021, title:"2021 Audi A4 Premium Plus 40", fuelId:3}, mild).x, 4);
  assert.equal(pt.decide({make:"Mazda", model:"CX-90", year:2025, title:"2025 Mazda Cx-90 Preferred", fuelId:4}, mild).x, 4);
  assert.equal(pt.decide({make:"Ford", model:"Escape", year:2021, title:"2021 Ford Escape Se", fuelId:4}, mild).x, 4);   // без «Hybrid» и не EPA-гибрид-только → бензин
});

test("cleanTitle: обозначения BMW как на аукционе", () => {
  const {cleanTitle} = require("../server/powertrain");
  assert.equal(cleanTitle("2016 BMW 340 Xi"), "2016 BMW 340i xDrive");
  assert.equal(cleanTitle("2023 BMW 530 I xDrive"), "2023 BMW 530i xDrive");
  assert.equal(cleanTitle("2022 BMW 530 Xi xDrive"), "2022 BMW 530i xDrive");
  assert.equal(cleanTitle("2023 BMW M550 I xDrive"), "2023 BMW M550i xDrive");
  assert.equal(cleanTitle("2021 BMW X5 Xdrive40I"), "2021 BMW X5 xDrive40i");
  assert.equal(cleanTitle("2020 BMW 530e xDrive"), "2020 BMW 530e xDrive");
  assert.equal(cleanTitle("2021 Toyota Camry XLE"), "2021 Toyota Camry XLE");
});
