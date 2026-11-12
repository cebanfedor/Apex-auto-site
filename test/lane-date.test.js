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

test("laneSaleDate: берёт ближайшую дату, на которой у линии ≥3 лота", async () => {
  const calls = mockRows([...Array(5).fill({sale_date:iso(3)}), ...Array(9).fill({sale_date:iso(30)}), {sale_date:iso(1)}]);
  const d = await laneSaleDate("1001|D");
  assert.ok(d, "дата найдена");
  assert.ok(Math.abs(Date.parse(d) - Date.now() - 3 * 3600e3) < 5000, "выбрана дата +3ч (одиночный лот на +1ч и дальняя дата не подходят)");
  assert.ok(/lane=eq\.1001%7CD/.test(calls[0]) && /archived=eq\.false/.test(calls[0]), "запрос по линии филиала и только живым лотам");
});

test("laneSaleDate: меньше 3 лотов на дате — не угадываем", async () => {
  mockRows([{sale_date:iso(2)}, {sale_date:iso(2)}]);
  assert.equal(await laneSaleDate("1002|A"), "");
});

test("laneSaleDate: левый ключ и сбой базы → пусто, без исключения", async () => {
  assert.equal(await laneSaleDate("x; drop"), "");
  global.fetch = async () => { throw new Error("db down"); };
  assert.equal(await laneSaleDate("1003|B"), "");
});

test("inferLaneDate: только лот без даты с линией, не проданный", async () => {
  mockRows(Array(4).fill({sale_date:iso(5)}));
  assert.ok(await inferLaneDate({auctionDate:"", laneKey:"1004|C", lotStatus:"sale"}));
  assert.equal(await inferLaneDate({auctionDate:iso(1), laneKey:"1004|C", lotStatus:"sale"}), "", "дата есть — не трогаем");
  assert.equal(await inferLaneDate({auctionDate:"", laneKey:"", lotStatus:"sale"}), "", "нет линии");
  assert.equal(await inferLaneDate({auctionDate:"", laneKey:"1004|C", statusId:6}), "", "продан");
});
