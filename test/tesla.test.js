const {test} = require("node:test");
const assert = require("node:assert");
const tesla = require("../server/tesla.js");

test("teslaModelFromVin: WMI-префикс однозначно определяет модель по 4-му знаку VIN", () => {
  assert.equal(tesla.teslaModelFromVin("5YJYGDEF2MF202221").name, "Model Y");
  assert.equal(tesla.teslaModelFromVin("5YJ3E1EC2LF586908").name, "Model 3");
  assert.equal(tesla.teslaModelFromVin("5YJSA1E2XLF123456").name, "Model S");
  assert.equal(tesla.teslaModelFromVin("5YJXCAE2XLF123456").name, "Model X");
  assert.equal(tesla.teslaModelFromVin("not-a-real-vin"), null);
  assert.equal(tesla.teslaModelFromVin("1G1ZD5ST3MF072564"), null); // не Tesla WMI
});

test("fixTeslaItem: чинит модель, когда марка в фиде УЖЕ верно «Tesla» (прежнее поведение)", () => {
  const item = {vin:"5YJ3E1EC2LF586908", manufacturer:{id:187, name:"Tesla"}, model:{id:9999, name:"Model X"}, title:"2020 Tesla Model X"};
  const changed = tesla.fixTeslaItem(item);
  assert.equal(changed, true);
  assert.equal(item.model.name, "Model 3");
  assert.equal(item.model.id, 2741);
  assert.equal(item.title, "2020 Tesla Model 3");
});

test("fixTeslaItem: 28.09.2026, IAAI 40084037 — фид путает МАРКУ (не только модель), VIN 5YJY… пришёл как «Subaru Impreza»", () => {
  const item = {vin:"5YJYGDEF2MF202221", manufacturer:{id:99, name:"Subaru"}, model:{id:887, name:"Impreza"}, title:"2021 Subaru Impreza"};
  const changed = tesla.fixTeslaItem(item);
  assert.equal(changed, true);
  assert.equal(item.manufacturer.name, "Tesla");
  assert.equal(item.manufacturer.id, tesla.TESLA_MAKE_ID);
  assert.equal(item.model.name, "Model Y");
  assert.equal(item.model.id, 3119);
  assert.equal(item.body_type.name, "suv");
});

test("fixTeslaItem: не Tesla VIN — ничего не трогает", () => {
  const item = {vin:"1G1ZD5ST3MF072564", manufacturer:{id:99, name:"Subaru"}, model:{id:887, name:"Impreza"}};
  const changed = tesla.fixTeslaItem(item);
  assert.equal(changed, false);
  assert.equal(item.manufacturer.name, "Subaru");
});

test("fixTeslaItem: уже всё верно — идемпотентно, changed=false", () => {
  const item = {vin:"5YJYGDEF2MF202221", manufacturer:{id:187, name:"Tesla"}, model:{id:3119, name:"Model Y"}, body_type:{id:5, name:"suv"}, title:"2021 Tesla Model Y"};
  const changed = tesla.fixTeslaItem(item);
  assert.equal(changed, false);
});
