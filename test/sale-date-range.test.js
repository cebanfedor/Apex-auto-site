const {test} = require("node:test");
const assert = require("node:assert");
const {shiftYmd, buildSearchParams} = require("../api/auctions.js");

// 02.10.2026 (аудит офиц. доки auctionsapi.com/docs/ai-prompt): sale_date_from/sale_date_to — рабочий
// документированный фильтр API, EXCLUSIVE и по календарному дню UTC. Раньше код вообще не слал эти
// параметры live-фолбэку («путают API, 0 результатов» — похоже, не учли exclusive-семантику),
// тянул широкое окно через sale_date_in_days и обещал несуществующую matchDateRange(). Теперь шлём
// настоящий диапазон — но АСИММЕТРИЧНО: auctionDateTo клиент (auctions.js formParams()) УЖЕ сдвигает
// на +1 день до отправки (нужно для своего Postgres-запроса в searchFromDb, у которого .lt. тоже
// exclusive) — этот же +1 ровно совпадает с тем, что нужно live-API, поэтому сервер auctionDateTo
// больше НЕ сдвигает, только валидирует формат. auctionDateFrom клиент не трогает (Postgres .gte.
// включительный, сдвиг не нужен) — для live-API сдвиг -1 делается здесь. Тесты ниже используют
// auctionDateTo СРАЗУ в уже-сдвинутом виде, как его реально шлёт браузер.

test("shiftYmd: сдвигает дату на N дней, формат YYYY-MM-DD", () => {
  assert.strictEqual(shiftYmd("2026-10-05", -1), "2026-10-04");
  assert.strictEqual(shiftYmd("2026-10-05", 1), "2026-10-06");
  assert.strictEqual(shiftYmd("2026-10-05", 0), "2026-10-05");
});

test("shiftYmd: переход через границу месяца/года", () => {
  assert.strictEqual(shiftYmd("2026-10-01", -1), "2026-09-30");
  assert.strictEqual(shiftYmd("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(shiftYmd("2027-01-01", -1), "2026-12-31");
});

test("shiftYmd: невалидный вход -> null (не шлём мусор в API)", () => {
  assert.strictEqual(shiftYmd("", -1), null);
  assert.strictEqual(shiftYmd(undefined, -1), null);
  assert.strictEqual(shiftYmd("not-a-date", -1), null);
  assert.strictEqual(shiftYmd("2026-10-05T00:00:00Z", -1), null); // только чистый YYYY-MM-DD
  assert.strictEqual(shiftYmd("05-10-2026", -1), null);
});

test("buildSearchParams: явный диапазон дат -> from сдвигается на сервере (-1), to приходит от клиента УЖЕ сдвинутым и просто проходит валидацию формата", () => {
  // Пользователь выбрал «с 5 по 7 октября» — клиент шлёт auctionDateFrom=2026-10-05 (сырое) и
  // auctionDateTo=2026-10-08 (это 7 окт + 1 день, клиент уже сдвинул до отправки).
  const q = new URLSearchParams({auctionDateFrom:"2026-10-05", auctionDateTo:"2026-10-08"});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_from"), "2026-10-04", "from сдвинут на -1 день на сервере (EXCLUSIVE 'после')");
  assert.strictEqual(params.get("sale_date_to"), "2026-10-08", "to НЕ сдвигается повторно — уже пришёл готовым от клиента");
  assert.strictEqual(params.get("sale_date_in_days"), null, "sale_date_in_days не шлём, когда есть явные даты");
});

test("buildSearchParams: только дата «от» (без «до»)", () => {
  const q = new URLSearchParams({auctionDateFrom:"2026-10-05"});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_from"), "2026-10-04");
  assert.strictEqual(params.get("sale_date_to"), null);
});

test("buildSearchParams: только дата «до» (уже сдвинутая клиентом) — проходит как есть, без двойного сдвига", () => {
  const q = new URLSearchParams({auctionDateTo:"2026-10-08"});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_to"), "2026-10-08");
  assert.strictEqual(params.get("sale_date_from"), null);
});

test("buildSearchParams: без дат -> старое поведение, sale_date_in_days=60 по умолчанию", () => {
  const q = new URLSearchParams({});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_in_days"), "60");
  assert.strictEqual(params.get("sale_date_from"), null);
  assert.strictEqual(params.get("sale_date_to"), null);
});

test("buildSearchParams: явные next_hours_auction/sale_date_in_days не перебиваются (приоритет сохранён)", () => {
  const q1 = new URLSearchParams({nextHours:"48"});
  assert.strictEqual(buildSearchParams(q1).get("sale_date_in_days"), null);
  assert.strictEqual(buildSearchParams(q1).get("next_hours_auction"), "48");
});

test("buildSearchParams: tab=archived/sold/buy_now — дата-окно не применяется вовсе (не 'upcoming')", () => {
  const q = new URLSearchParams({auctionDateFrom:"2026-10-05", tab:"archived"});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_from"), null);
  assert.strictEqual(params.get("sale_date_in_days"), null);
});
