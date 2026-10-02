const {test} = require("node:test");
const assert = require("node:assert");
const {titleMakeMismatch, normalizeLot} = require("../api/auctions.js");

test("titleMakeMismatch: марка отсутствует в title целиком — мисматч", () => {
  assert.equal(titleMakeMismatch("2015 Toyota Rav4 Le", "Tesla"), true);
});

test("titleMakeMismatch: обычное совпадение — не мисматч", () => {
  assert.equal(titleMakeMismatch("2021 Tesla Model Y Long Range Dual Motor", "Tesla"), false);
});

test("titleMakeMismatch: составные марки (дефис/пробел) — не мисматч", () => {
  assert.equal(titleMakeMismatch("2021 Mercedes-Benz Glc 300", "Mercedes-Benz"), false);
  assert.equal(titleMakeMismatch("2020 Land Rover Range Rover", "Land Rover"), false);
});

test("titleMakeMismatch: пустая/короткая марка — не рискуем, не мисматч", () => {
  assert.equal(titleMakeMismatch("2015 Toyota Rav4 Le", ""), false);
  assert.equal(titleMakeMismatch("2015 Toyota Rav4 Le", "A"), false);
});

test("normalizeLot: 02.10.2026, IAAI 40081510 — фид путает manufacturer/model (от старой машины, номер лота переиспользован), title/VIN — Toyota Rav4", () => {
  const item = {
    auction:"iaai", domain:"iaai", lot:"40081510", external_id:"40081510",
    vin:"2T3BFREV0FW337191", year:2015,
    manufacturer:{id:187, name:"Tesla"}, model:{id:3119, name:"Model Y"},
    title:"2015 Toyota Rav4 Le"
  };
  const lot = normalizeLot(item, "iaai");
  assert.equal(lot.title, "2015 Toyota Rav4 Le");
  assert.equal(lot.vin, "2T3BFREV0FW337191");
  assert.equal(lot.makeId, null);
  assert.equal(lot.modelId, null);
});

test("normalizeLot: обычный согласованный лот — makeId/modelId сохраняются", () => {
  const item = {
    auction:"iaai", domain:"iaai", lot:"46191892", external_id:"46191892",
    vin:"5YJYGDEE3MF145616", year:2021,
    manufacturer:{id:187, name:"Tesla"}, model:{id:3119, name:"Model Y"},
    title:"2021 Tesla Model Y Long Range Dual Motor All-Wheel Drive"
  };
  const lot = normalizeLot(item, "iaai");
  assert.equal(lot.makeId, 187);
  assert.equal(lot.modelId, 3119);
});
