const {test} = require("node:test");
const assert = require("node:assert");
const {lotSlug, transitSlug, parseLotSlug, words} = require("../server/slug");

// Слаги генерят канонические URL (301 со старых, OG, SSR) — фиксируем поведение,
// чтобы клиентские копии (auctions.js/home-lots.js/transit.js) не разошлись незаметно.

test("words: каждое слово с Заглавной, внутренний регистр сохраняется", () => {
  assert.equal(words("2021 chevrolet malibu fwd lt", 60), "2021-Chevrolet-Malibu-Fwd-Lt");
  assert.equal(words("BMW xDrive40i", 60), "BMW-XDrive40i"); // первая буква слова вверх, остальное как есть
});

test("words: не-ASCII вырезается, хвостовые дефисы убираются, лимит длины", () => {
  assert.equal(words("Tesla Модель Y", 60), "Tesla-Y");          // кириллица выброшена
  assert.equal(words("a b c d e", 5).replace(/-+$/g, ""), words("a b c d e", 5)); // нет хвостового «-»
  assert.ok(words("word ".repeat(40), 20).length <= 20);
});

test("lotSlug: площадка-лот-название-VIN, VIN ЗАГЛАВНЫМИ", () => {
  const s = lotSlug({auction:"IAAI", lot:"45987487", title:"2021 Chevrolet Malibu Fwd Lt", vin:"1g1zd5st3mf072564"});
  assert.equal(s, "iaai-45987487-2021-Chevrolet-Malibu-Fwd-Lt-1G1ZD5ST3MF072564");
});

test("lotSlug: невалидный VIN отбрасывается, название из year/make/model", () => {
  const s = lotSlug({auction:"copart", lot:"618", vin:"NOTAVIN", year:2020, make:"Tesla", model:"Model 3"});
  assert.equal(s, "copart-618-2020-Tesla-Model-3");
});

test("transitSlug: id-название-VIN", () => {
  assert.equal(transitSlug({id:3, title:"2019 Lincoln MKZ", vin:""}), "3-2019-Lincoln-MKZ");
});

test("parseLotSlug: числовой и буквенный лот, мусор → null, roundtrip", () => {
  assert.deepEqual(parseLotSlug("iaai-45987487-2021-Chevrolet-Malibu"), {auction:"iaai", lot:"45987487"});
  assert.deepEqual(parseLotSlug("copart-A12B34"), {auction:"copart", lot:"A12B34"});
  assert.equal(parseLotSlug("/etc/passwd"), null);
  const lot = {auction:"copart", lot:"61420506", title:"2020 Tesla Model 3", vin:"5YJ3E1EC2LF586908"};
  const parsed = parseLotSlug(lotSlug(lot));
  assert.equal(parsed.auction, "copart");
  assert.equal(parsed.lot, "61420506");
});
