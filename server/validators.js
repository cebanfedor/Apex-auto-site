// Чистые валидаторы ввода. Переиспользуются серверными роутами и покрыты
// юнит-тестами (test/validators.test.js). Держим отдельно, чтобы логику можно
// было тестировать без запуска http/DOM.

// Контакт лида: валиден, если это телефон (≥8 цифр — покрывает +373/+40/+7)
// ИЛИ Telegram (@username / t.me/…). Мусор вроде "aaaaa"/"00000" отсекается.
function isValidContact(value){
  const v = String(value == null ? "" : value).trim();
  if(!v) return false;
  const digits = (v.match(/\d/g) || []).length;
  const looksTelegram = /@[a-z0-9_]{3,}|t\.me\//i.test(v);
  return digits >= 8 || looksTelegram;
}

// VIN: ровно 17 символов, только разрешённые (без I, O, Q). Регистронезависимо.
function isValidVin(value){
  const v = String(value == null ? "" : value).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
}

module.exports = { isValidContact, isValidVin };
