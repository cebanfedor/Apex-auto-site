const {test} = require("node:test");
const assert = require("node:assert");
const {shiftYmd, buildSearchParams} = require("../api/auctions.js");

// 02.10.2026 (аудит офиц. доки auctionsapi.com/docs/ai-prompt): sale_date_from/sale_date_to — рабочий
// документированный фильтр API, EXCLUSIVE и по календарному дню UTC. Раньше код вообще не слал эти
// параметры live-фолбэку («путают API, 0 результатов» — похоже, не учли exclusive-семантику),
// тянул широкое окно через sale_date_in_days и обещал несуществующую matchDateRange(). Теперь шлём
// настоящий диапазон со сдвигом границ на 1 день, чтобы «с X по Y» было включительным.

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

test("buildSearchParams: явный диапазон дат -> sale_date_from/to со сдвигом на 1 день (включительный диапазон)", () => {
  const q = new URLSearchParams({auctionDateFrom:"2026-10-05", auctionDateTo:"2026-10-07"});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_from"), "2026-10-04", "from сдвинут на -1 день (EXCLUSIVE 'после')");
  assert.strictEqual(params.get("sale_date_to"), "2026-10-08", "to сдвинут на +1 день (EXCLUSIVE 'до')");
  assert.strictEqual(params.get("sale_date_in_days"), null, "sale_date_in_days не шлём, когда есть явные даты");
});

test("buildSearchParams: только дата «от» (без «до»)", () => {
  const q = new URLSearchParams({auctionDateFrom:"2026-10-05"});
  const params = buildSearchParams(q);
  assert.strictEqual(params.get("sale_date_from"), "2026-10-04");
  assert.strictEqual(params.get("sale_date_to"), null);
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
