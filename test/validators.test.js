const {test} = require("node:test");
const assert = require("node:assert");
const {isValidContact, isValidVin} = require("../server/validators");

test("isValidContact: телефоны MD/RO/RU валидны", () => {
  assert.ok(isValidContact("+373 68 832 032"));   // Молдова
  assert.ok(isValidContact("+40 721 234 567"));    // Румыния
  assert.ok(isValidContact("+7 900 123 45 67"));   // РФ/ПМР
  assert.ok(isValidContact("068832032"));          // локальный формат
});

test("isValidContact: Telegram-хэндл валиден", () => {
  assert.ok(isValidContact("@fedukusa"));
  assert.ok(isValidContact("https://t.me/fedukusa"));
});

test("isValidContact: мусор и пустое отклоняются", () => {
  assert.equal(isValidContact("aaaaa"), false);
  assert.equal(isValidContact("00000"), false);    // 5 цифр < 8
  assert.equal(isValidContact("123"), false);
  assert.equal(isValidContact(""), false);
  assert.equal(isValidContact(null), false);
  assert.equal(isValidContact("   "), false);
});

test("isValidVin: ровно 17 символов без I/O/Q", () => {
  assert.ok(isValidVin("WBSAE0C06PCL70372"));      // реальный BMW M8 из доки API
  assert.ok(isValidVin("1HGCM82633A004352"));
  assert.ok(isValidVin("wbsae0c06pcl70372"));       // регистр не важен
  assert.ok(isValidVin("WBS AE0C06-PCL70372"));     // разделители чистятся
});

test("isValidVin: неверная длина отклоняется", () => {
  assert.equal(isValidVin("WBSAE0C06PCL"), false);        // 12 — коротко
  assert.equal(isValidVin("WBSAE0C06PCL703721234"), false); // длинно
  assert.equal(isValidVin(""), false);
});

test("isValidVin: запрещённые буквы I, O, Q отклоняются", () => {
  assert.equal(isValidVin("IBSAE0C06PCL70372"), false); // I
  assert.equal(isValidVin("OBSAE0C06PCL70372"), false); // O
  assert.equal(isValidVin("QBSAE0C06PCL70372"), false); // Q
});
