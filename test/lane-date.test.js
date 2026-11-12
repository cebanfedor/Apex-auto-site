const {test} = require("node:test");
const assert = require("node:assert");

// 12.11.2026 (Федор, Mercedes GLE Copart 72493526): фид отдаёт линию «D/4066», но sale_date/bid = null (пробел в данных провайдера),
// у DreamBid торги 12.11 20:00. Дату для показа берём у соседей по линии филиала из базы (≥3 лота с одной ближайшей датой).

process.env.SUPABASE_URL = "https://test.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
const {laneSaleDate, inferLaneDate} = require("../api/auctions.js");

function mockRows(rows){
  const calls = [];
  global.fetch = async (url) => { calls.push(String(url)); return {ok:true, status:200, text:async () => JSON.stringify(rows)}; };
  return calls;
}
const iso = h => new Date(Date.now() + h * 3600e3).toISOString();

const rows = (h, n, from) => Array.from({length:n}, (_, k) => ({sale_date:iso(h), run_no:from + k * 5}));

test("laneSaleDate: одна сессия, в диапазон заездов которой попадает лот — берём её дату", async () => {
  const calls = mockRows([...rows(3, 6, 4030), ...rows(30, 9, 100), {sale_date:iso(1), run_no:4066}]);
  const d = await laneSaleDate("1001|D", 4060);
  assert.ok(d && !d.to, "одна дата без окна");
  assert.ok(Math.abs(Date.parse(d.at) - Date.now() - 3 * 3600e3) < 5000, "выбрана сессия +3ч (по заезду 4060), не дальняя и не одиночный лот");
  assert.ok(/lane=eq\.1001%7CD/.test(calls[0]) && /archived=eq\.false/.test(calls[0]), "запрос по линии филиала и только живым лотам");
});

test("laneSaleDate: две сессии перекрываются по заездам (как Dallas South линия D) — окно от ранней до поздней", async () => {
  mockRows([...rows(3, 24, 4031), {sale_date:iso(4), run_no:4025}, {sale_date:iso(4), run_no:4090}, {sale_date:iso(4), run_no:4144}]);   // как в реальных данных: 17:00 UTC — заезды 4031…, 18:00 UTC — 4025…4144
  const d = await laneSaleDate("1005|D", 4066);
  assert.ok(d && d.to, "неоднозначно — отдаём окно");
  assert.ok(Date.parse(d.to) - Date.parse(d.at) === 3600e3, "окно в 1 час");
});

test("laneSaleDate: заезд лота вне диапазонов сессий — не гадаем", async () => {
  mockRows(rows(3, 6, 100));
  assert.equal(await laneSaleDate("1006|A", 4066), null);
});

test("laneSaleDate: меньше 3 лотов на дате — не угадываем", async () => {
  mockRows([{sale_date:iso(2), run_no:10}, {sale_date:iso(2), run_no:11}]);
  assert.equal(await laneSaleDate("1002|A", 10), null);
});

test("laneSaleDate: левый ключ и сбой базы → null, без исключения", async () => {
  assert.equal(await laneSaleDate("x; drop", 1), null);
  global.fetch = async () => { throw new Error("db down"); };
  assert.equal(await laneSaleDate("1003|B", 1), null);
});

test("inferLaneDate: только лот без даты с линией, не проданный", async () => {
  mockRows(rows(5, 4, 4060));
  assert.ok(await inferLaneDate({auctionDate:"", laneKey:"1004|C", runNo:4066, lotStatus:"sale"}));
  assert.equal(await inferLaneDate({auctionDate:iso(1), laneKey:"1004|C", runNo:4066, lotStatus:"sale"}), null, "дата есть — не трогаем");
  assert.equal(await inferLaneDate({auctionDate:"", laneKey:"", lotStatus:"sale"}), null, "нет линии");
  assert.equal(await inferLaneDate({auctionDate:"", laneKey:"1004|C", statusId:6}), null, "продан");
});
