// Витрина Кореи для главной: фильтры цены/фото/названия (06.11.2026)
const test = require("node:test");
const assert = require("node:assert");
const {showcaseItem, niceModel} = require("../api/catalog");

const rates = {usdKrw:1330};
const car = (over = {}) => Object.assign({
  id:"abc123", year:2022, vin:"KMHL14JA5NA123456",
  brand:{name:"Hyundai"}, model:{name:"Sonata"},
  fuel:{id:4}, engine_volume:2000, transmission:{id:1},
  has_inspections:true, has_history_reports:true,
  listings:[{archived:false, odometer:41000, price:{price:26600000, currency:{name:"krw"}}, images:[{preview:"https://ci.encar.com/a.jpg"}]}]
}, over);

test("нормальное объявление: цена в $ по курсу, округление, поля карточки", () => {
  const it = showcaseItem(car(), rates, "kr");
  assert.strictEqual(it.title, "2022 Hyundai Sonata");
  assert.strictEqual(it.usd, 20000);
  assert.strictEqual(it.km, 41000);
  assert.strictEqual(it.engine, 2);
  assert.strictEqual(it.img, "https://ci.encar.com/a.jpg");
  assert.ok(it.href.startsWith("/korea/"));
});
test("без фото, без модели, без цены — не показываем", () => {
  assert.strictEqual(showcaseItem(car({listings:[{archived:false, price:{price:26600000, currency:{name:"krw"}}, images:[]}]}), rates, "kr"), null);
  assert.strictEqual(showcaseItem(car({model:null}), rates, "kr"), null);
  assert.strictEqual(showcaseItem(car({listings:[{archived:false, images:[{preview:"x"}]}]}), rates, "kr"), null);
});
test("заглушка цены (999 999 999 ₩) и слишком дешёвое/дорогое — отсекаются", () => {
  const mk = price => car({listings:[{archived:false, price:{price, currency:{name:"krw"}}, images:[{preview:"x"}]}]});
  assert.strictEqual(showcaseItem(mk(999999999), rates, "kr"), null);
  assert.strictEqual(showcaseItem(mk(3000000), rates, "kr"), null);
});
test("без курса KRW цену не выдумываем", () => {
  assert.strictEqual(showcaseItem(car(), null, "kr"), null);
});
test("электро: объём двигателя не показываем", () => {
  const it = showcaseItem(car({fuel:{id:2}, engine_volume:120}), rates, "kr");
  assert.strictEqual(it.engine, 0);
});

test("немецкие названия моделей: 5er → 5 Series, C-klasse → C-Class, обычные не трогаем", () => {
  assert.strictEqual(niceModel("5er"), "5 Series");
  assert.strictEqual(niceModel("3er Touring"), "3 Series Touring");
  assert.strictEqual(niceModel("C-klasse"), "C-Class");
  assert.strictEqual(niceModel("Sonata"), "Sonata");
  assert.strictEqual(niceModel("X5"), "X5");
});
