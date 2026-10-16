const {test} = require("node:test");
const assert = require("node:assert");

// 16.10.2026 (Федор, BMW X5 Copart 71697016): в поиске по VIN рядом с живым лотом (торги 21.10, ставка 6 500 CAD)
// висела архивная копия «Продано 37 000 CAD» от 14.10 — тот же номер лота, перевыставленный позже. По правилу
// Федора (24.09.2026, Honda Insight) предыдущий «sold»-раунд перевыставленного номера — НЕ продажа.
// Проверяем оба слоя: самолечение на чтении (demoteRelistedCopies) и запись копии при релисте (preserveSoldCopies).

process.env.SUPABASE_URL = "https://test.supabase.local";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";

const {demoteRelistedCopies, preserveSoldCopies} = require("../api/auctions.js");

const T14 = "2026-10-14T17:00:00.000Z", T21 = "2026-10-21T17:00:00.000Z";
const soldPayload = (extra = {}) => ({id:"copart-71697016", lot:"71697016", auction:"copart", statusId:6, finalBid:37000, currentBid:37000, auctionDate:T14, ...extra});

function mockFetch(routes){
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    const path = String(url).replace(/^.*\/rest\/v1/, "");
    calls.push({path, method:opts.method || "GET", body:opts.body ? JSON.parse(opts.body) : null});
    const hit = routes.find(r => r.test(path));
    const body = hit ? hit.reply(path, opts) : [];
    return {ok:true, status:200, text:async () => JSON.stringify(body)};
  };
  return calls;
}

test("demoteRelistedCopies: копия продажи, чей лот выставлен снова позже, — понижается в базе и убирается из выдачи", async () => {
  const calls = mockFetch([{test:p => /^\/api_lots\?id=in\./.test(p), reply:() => [{id:"copart-71697016", sale_date:T21}]}]);
  const rows = [
    {id:"copart-71697016", sale_date:T21, payload:{id:"copart-71697016", lot:"71697016", auction:"copart", statusId:3, finalBid:0, currentBid:6500, auctionDate:T21}},
    {id:"copart-71697016-s20261014", sale_date:T14, payload:soldPayload()}
  ];
  const out = await demoteRelistedCopies(rows);
  assert.deepStrictEqual(out.map(r => r.id), ["copart-71697016"], "копия должна исчезнуть из выдачи, живой лот остаться");
  await new Promise(r => setTimeout(r, 10));   // PATCH уходит fire-and-forget
  const patch = calls.find(c => c.method === "PATCH");
  assert.ok(patch && /id=eq\.copart-71697016-s20261014/.test(patch.path), "PATCH именно по копии");
  assert.strictEqual(patch.body.status_id, 8);
  assert.strictEqual(patch.body.final_bid, 0);
  assert.strictEqual(patch.body.archived, true);
  assert.strictEqual(patch.body.payload.relistDemoted, true);
  assert.strictEqual(patch.body.payload.statusName, "not_sold");
});

test("demoteRelistedCopies: уже понижённая копия вырезается без запросов; покупка по Buy Now и копия без позднего релиста — не трогаются", async () => {
  const calls = mockFetch([{test:p => /^\/api_lots\?id=in\./.test(p), reply:() => [{id:"copart-1", sale_date:T14}]}]);   // copart-1: основная строка НЕ позже копии
  const rows = [
    {id:"iaai-5-s20261001", sale_date:"2026-10-01T10:00:00Z", payload:{statusId:8, finalBid:0, relistDemoted:true}},
    {id:"copart-2-s20261014", sale_date:T14, payload:soldPayload({id:"copart-2", lot:"2", soldByBuyNow:true})},
    {id:"copart-1-s20261014", sale_date:T14, payload:soldPayload({id:"copart-1", lot:"1"})}
  ];
  const out = await demoteRelistedCopies(rows);
  assert.deepStrictEqual(out.map(r => r.id).sort(), ["copart-1-s20261014", "copart-2-s20261014"]);
  await new Promise(r => setTimeout(r, 10));
  assert.ok(!calls.some(c => c.method === "PATCH"), "ничего не понижаем");
  const inq = calls.filter(c => /id=in\./.test(c.path));
  assert.strictEqual(inq.length, 1);
  assert.ok(!/copart-2/.test(inq[0].path), "Buy Now-продажу не проверяем вовсе");
});

test("preserveSoldCopies: при релисте того же номера на более позднюю дату копия пишется как непроданный раунд, при ранней — как продажа", async () => {
  const saleRow = {id:"copart-71697016", auction:"copart", lot:"71697016", archived:true, status_id:6, final_bid:37000, sale_date:T14, payload:soldPayload()};
  let calls = mockFetch([{test:p => /select=\*/.test(p), reply:() => [saleRow]}]);
  let n = await preserveSoldCopies(["copart-71697016"], {"copart-71697016":Date.parse(T21)});
  assert.strictEqual(n, 1);
  assert.strictEqual(preserveSoldCopies.demoted, 1);
  let post = calls.find(c => c.method === "POST");
  assert.strictEqual(post.body[0].id, "copart-71697016-s20261014");
  assert.strictEqual(post.body[0].status_id, 8);
  assert.strictEqual(post.body[0].final_bid, 0);
  assert.strictEqual(post.body[0].payload.relistDemoted, true);

  calls = mockFetch([{test:p => /select=\*/.test(p), reply:() => [saleRow]}]);
  n = await preserveSoldCopies(["copart-71697016"], {"copart-71697016":Date.parse("2026-10-01T17:00:00Z")});   // входящая строка РАНЬШЕ продажи — не релист
  assert.strictEqual(n, 1);
  assert.strictEqual(preserveSoldCopies.demoted, 0);
  post = calls.find(c => c.method === "POST");
  assert.strictEqual(post.body[0].status_id, 6);
  assert.strictEqual(post.body[0].final_bid, 37000);
  assert.ok(!post.body[0].payload.relistDemoted);
});
