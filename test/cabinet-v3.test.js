const test = require("node:test");
const assert = require("node:assert");

process.env.ALERTS_BOT_TOKEN = "123:TEST";
process.env.TELEGRAM_CHAT_ID = "999";
const cabinet = require("../server/cabinet");

const TOKEN = "t".repeat(24);
function harness(routes){
  const calls = [], tg = [];
  global.fetch = async (url, opts) => {
    if(String(url).startsWith("https://api.telegram.org/")){ tg.push(JSON.parse(opts.body)); return {json: async () => ({ok: true})}; }
    throw new Error("unexpected fetch " + url);
  };
  const sb = async (path, opts = {}) => {
    calls.push({path, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null});
    for(const [re, fn] of routes){ if(re.test(path)) return fn(path, opts); }
    return [];
  };
  const out = {};
  const sendJson = (res, status, payload) => { out.status = status; out.payload = payload; };
  const api = cabinet.create({sb, sendJson, readBody: async r => r.body});
  const call = async (action, body, method = "POST") => { out.status = out.payload = undefined; await api.handle(action, {method, body}, {}, new URLSearchParams(body && body.q || "")); return out; };
  return {call, calls, tg};
}
const link = [/\/alert_links\?token=/, () => [{chat_id: 555, lang: "ru"}]];
const names = [/\/alert_meta\?k=in\.\(/, () => [{k: "tgname:555", v: {n: "Иван"}}]];

test("cabprofile сохраняет чистый профиль в alert_meta", async () => {
  const h = harness([link]);
  const r = await h.call("cabprofile", {token: TOKEN, profile: {name: "Иван <b>П</b>", city: "Кишинёв", phone: "+373 68 832 032"}});
  assert.strictEqual(r.payload.ok, true);
  const w = h.calls.find(c => c.method === "POST" && /alert_meta/.test(c.path));
  assert.strictEqual(w.body.k, "profile:555");
  assert.ok(!/[<>]/.test(w.body.v.name));
  assert.strictEqual(w.body.v.phone, "+373 68 832 032");
});

test("cabping: первый заход после паузы пишет менеджеру", async () => {
  const h = harness([link, names, [/\/alert_meta\?k=eq\.seen/, () => []], [/admin_lead_token/, () => []]]);
  const r = await h.call("cabping", {token: TOKEN, p: "/auctions", h: "Аукционы", first: true});
  assert.strictEqual(r.payload.ok, true);
  assert.ok(h.calls.some(c => c.method === "POST" && c.body && c.body.k === "seen:555"));
  assert.strictEqual(h.tg.length, 1);
  assert.strictEqual(String(h.tg[0].chat_id), "999");
  assert.ok(/Иван/.test(h.tg[0].text) && /впервые/.test(h.tg[0].text));
});

test("cabping: недавний визит менеджеру не пишем", async () => {
  const h = harness([link, [/\/alert_meta\?k=eq\.seen/, () => [{v: {t: Date.now() - 600e3}}]]]);
  await h.call("cabping", {token: TOKEN, p: "/", h: "x", first: true});
  assert.strictEqual(h.tg.length, 0);
});

test("cabevent: повтор в окне не пишется, третий просмотр за сутки — горячий лот", async () => {
  let dayRows = [{id: 1}, {id: 2}, {id: 3}];
  const h = harness([link, names,
    [/\/cab_events\?chat_id=eq\.555&kind=eq\.view&key=eq\.[^&]+&at=gte\.[^&]+&select=id&limit=1/, () => []],
    [/limit=4/, () => dayRows],
    [/\/alert_meta\?k=eq\.hot/, () => []]]);
  const r = await h.call("cabevent", {token: TOKEN, kind: "view", key: "copart-61420506", data: {title: "2020 Tesla Model 3"}});
  assert.strictEqual(r.payload.ok, true);
  assert.ok(h.calls.some(c => c.method === "POST" && /\/cab_events$/.test(c.path) && c.body.key === "copart-61420506"));
  assert.ok(h.tg.some(m => /3-й раз/.test(m.text)));

  const h2 = harness([link, [/\/cab_events\?chat_id/, () => [{id: 9}]]]);
  const r2 = await h2.call("cabevent", {token: TOKEN, kind: "view", key: "copart-61420506", data: {}});
  assert.strictEqual(r2.payload.dup, true);
  assert.ok(!h2.calls.some(c => c.method === "POST" && /\/cab_events$/.test(c.path)));

  const bad = await h2.call("cabevent", {token: TOKEN, kind: "view", key: "drop table", data: {}});
  assert.strictEqual(bad.payload.ok, false);
});

test("cabpickreact: реакция чужого лота невозможна, своя — пишет менеджеру", async () => {
  const h = harness([link, names,
    [/\/cab_picks\?id=eq\.7&chat_id=eq\.555/, (p, o) => (o.method === "PATCH" ? null : [{id: 7, lot_id: "copart-1", data: {title: "BMW X5"}, reaction: null}])]]);
  const r = await h.call("cabpickreact", {token: TOKEN, id: 7, reaction: "discuss", note: "Какая цена под ключ?"});
  assert.strictEqual(r.payload.ok, true);
  const patch = h.calls.find(c => c.method === "PATCH");
  assert.strictEqual(patch.body.reaction, "discuss");
  assert.ok(h.tg.some(m => /обсудить/.test(m.text) && /BMW X5/.test(m.text)));

  const h2 = harness([link, [/\/cab_picks\?id=eq\.8/, () => []]]);
  const r2 = await h2.call("cabpickreact", {token: TOKEN, id: 8, reaction: "like"});
  assert.strictEqual(r2.status, 404);
  const bad = await h.call("cabpickreact", {token: TOKEN, id: 7, reaction: "hack"});
  assert.strictEqual(bad.payload.ok, true);                         // неизвестная реакция игнорируется, а не ломает запись
});

test("cabload отдаёт профиль и подтверждённый телефон", async () => {
  const h = harness([link,
    [/\/cab_items\?chat_id/, () => []],
    [/\/alert_meta\?k=in\./, () => [{k: "tgname:555", v: {n: "Иван"}}, {k: "profile:555", v: {name: "Иван П", city: "Кишинёв", phone: "+373 68"}}, {k: "phone:555", v: {k: "68832032", n: "37368832032"}}]]]);
  const r = await h.call("cabload", {q: "token=" + TOKEN}, "GET");
  assert.strictEqual(r.payload.name, "Иван П");
  assert.strictEqual(r.payload.profile.city, "Кишинёв");
  assert.strictEqual(r.payload.phoneVerified, true);
  assert.strictEqual(r.payload.verifiedPhone, "+37368832032");
});
