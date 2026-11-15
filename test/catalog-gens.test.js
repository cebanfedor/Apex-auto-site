const test = require("node:test");
const assert = require("node:assert");
const cat = require("../server/catalog-api");
const api = require("../api/catalog.js");

const SPORTAGE = [
  {id:2182, name:"I", from_year:1993, to_year:2006},
  {id:2188, name:"IV", from_year:2016, to_year:2022},
  {id:2185, name:"III", from_year:2010, to_year:2016},
  {id:7219, name:"V", from_year:2021, to_year:2022},
  {id:2183, name:"II", from_year:2004, to_year:2010},
];

test("normGens: новые первыми, у самого свежего поколения верх открыт", () => {
  const r = api.normGens(SPORTAGE);
  assert.deepStrictEqual(r.map(g => g.id), [7219, 2188, 2185, 2183, 2182]);
  assert.strictEqual(r[0].to_year, null);      // V: 2021– (справочник обрывался на 2022)
  assert.strictEqual(r[1].to_year, 2022);      // остальные не трогаем
});

test("normGens: закрытое старое поколение (модель снята) верх не открывает", () => {
  const r = api.normGens([{id:1, name:"I", from_year:2000, to_year:2012}, {id:2, name:"II", from_year:2012, to_year:2018}]);
  assert.strictEqual(r[0].to_year, 2018);
});

test("genYearRange: одно поколение → годы вместо generation_id", async () => {
  cat.listGenerations = async () => SPORTAGE;
  const brands = [{id:1, models:[{id:449, generations:[{id:7219}]}]}];
  const r = await api.genYearRange(brands, "kr");
  assert.strictEqual(r.from, 2021);
  assert.strictEqual(r.to, null);
});

test("genYearRange: два соседних поколения → общий диапазон", async () => {
  cat.listGenerations = async () => SPORTAGE;
  const brands = [{id:1, models:[{id:449, generations:[{id:2185}, {id:2188}]}]}];
  const r = await api.genYearRange(brands, "kr");
  assert.strictEqual(r.from, 2010);
  assert.strictEqual(r.to, 2022);
});

test("genYearRange: поколения с разрывом, несколько моделей, нет поколений → null (старый фильтр по id)", async () => {
  cat.listGenerations = async () => SPORTAGE;
  assert.strictEqual(await api.genYearRange([{id:1, models:[{id:449, generations:[{id:2182}, {id:7219}]}]}], "kr"), null);
  assert.strictEqual(await api.genYearRange([{id:1, models:[{id:449, generations:[{id:2188}]}, {id:448, generations:[{id:2188}]}]}], "kr"), null);
  assert.strictEqual(await api.genYearRange([{id:1, models:[{id:449}]}], "kr"), null);
  assert.strictEqual(await api.genYearRange(null, "kr"), null);
});
