const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

process.env.ALERTS_BOT_TOKEN = "123:TEST";
process.env.TELEGRAM_CHAT_ID = "999";

// фейковая база: REST-пути → ответы
const calls = [];
let rest = async () => [];
const fakeSupabase = {rest: (p, o) => { calls.push({p, m: (o && o.method) || "GET", b: o && o.body ? JSON.parse(o.body) : null}); return rest(p, o || {}); }, list: async () => []};
function stub(mod, exports){ const id = require.resolve(mod); require.cache[id] = {id, filename: id, loaded: true, exports}; }
stub("../server/supabase", fakeSupabase);
stub("../server/auth", {requireAdmin: () => true, isAuthenticated: () => true});
const handler = require("../api/clients");

function run(method, url, body){
  const out = {};
  const res = {status(c){ out.status = c; return this; }, setHeader(){}, json(p){ out.payload = p; }};
  return handler({method, url, headers: {host: "apexauto.md"}, body}, res).then(() => out);
}

test("список клиентов: онлайн сверху, имя из профиля, телефон подтверждён", async () => {
  const now = Date.now();
  rest = async p => {
    if(/alert_links\?chat_id=not\.is\.null/.test(p)) return [{chat_id: 1, lang: "ru", bound_at: "2026-11-01T00:00:00Z"}, {chat_id: 2, lang: "ro", bound_at: "2026-11-02T00:00:00Z"}];
    if(/k=like\.profile/.test(p)) return [{k: "profile:1", v: {name: "Анна", city: "Бельцы"}, updated_at: "2026-11-01"}];
    if(/k=like\.tgname/.test(p)) return [{k: "tgname:2", v: {n: "Ion"}, updated_at: "2026-11-01"}];
    if(/k=like\.phone/.test(p)) return [{k: "phone:2", v: {k: "68832032", n: "37368832032"}, updated_at: "2026-11-01"}];
    if(/k=like\.seen/.test(p)) return [{k: "seen:1", v: {t: now - 3600e3, h: "Аукционы"}, updated_at: "x"}, {k: "seen:2", v: {t: now - 20e3, h: "Лот BMW"}, updated_at: "x"}];
    if(/cab_items\?kind=eq\.fav/.test(p)) return [{chat_id: 1}, {chat_id: 1}, {chat_id: 2}];
    if(/cab_picks/.test(p)) return [{chat_id: 2, reaction: "like"}];
    if(/mgr_prefs/.test(p)) return [];
    return [];
  };
  const r = await run("GET", "/api/clients");
  assert.strictEqual(r.payload.ok, true);
  assert.strictEqual(r.payload.items[0].chat, "2");               // онлайн первым
  assert.strictEqual(r.payload.items[0].online, true);
  assert.strictEqual(r.payload.items[0].verified, true);
  assert.strictEqual(r.payload.items[0].phone, "+37368832032");
  assert.strictEqual(r.payload.items[1].name, "Анна");
  assert.strictEqual(r.payload.items[1].favs, 2);
  assert.strictEqual(r.payload.online, 1);
});

test("карточка клиента: просмотры агрегируются, подборки и подписки на месте", async () => {
  rest = async p => {
    if(/alert_links\?chat_id=eq\.5/.test(p)) return [{token: "tok", lang: "ru", bound_at: "2026-11-01"}];
    if(/alert_meta\?k=in\./.test(p)) return [{k: "profile:5", v: {name: "Пётр", phone: "+373 69 111 222"}}, {k: "cnote:5", v: {text: "бюджет 10к", tags: ["горячий"]}}];
    if(/cab_items\?chat_id=eq\.5/.test(p)) return [{kind: "fav", key: "copart-1", data: {title: "A"}, updated_at: "2026-11-20"}, {kind: "note", key: "copart-1", data: {text: "тут"}, updated_at: "2026-11-20"}];
    if(/cab_events\?chat_id=eq\.5/.test(p)) return [
      {kind: "view", key: "copart-9", data: {title: "BMW X5"}, at: "2026-11-24T10:00:00Z"},
      {kind: "view", key: "copart-9", data: {title: "BMW X5"}, at: "2026-11-23T10:00:00Z"},
      {kind: "search", key: "BMW 2018+", data: {label: "BMW 2018+", qs: "make=1"}, at: "2026-11-22T10:00:00Z"}];
    if(/alert_subs/.test(p)) return [{id: 1, kind: "lot", name: "X", lot_id: "copart-2"}];
    if(/cab_picks\?chat_id=eq\.5/.test(p)) return [{id: 3, lot_id: "copart-9", data: {title: "BMW X5"}, active: true, reaction: "like"}, {id: 4, lot_id: "iaai-1", data: {}, active: false}];
    return [];
  };
  const r = await run("GET", "/api/clients?chat=5");
  const c = r.payload.card;
  assert.strictEqual(c.profile.name, "Пётр");
  assert.strictEqual(c.manager.text, "бюджет 10к");
  assert.strictEqual(c.views[0].n, 2);
  assert.strictEqual(c.searches.length, 1);
  assert.strictEqual(c.favs[0].note, "тут");
  assert.strictEqual(c.picks.length, 1);                          // неактивные скрыты
  assert.strictEqual(c.subs.length, 1);
  assert.strictEqual(c.eventsReady, true);
});

test("подборка: лот берётся с сайта, пишется в cab_picks и уходит сообщение клиенту", async () => {
  calls.length = 0;
  const tg = [];
  global.fetch = async (url, opts) => {
    const u = String(url);
    if(u.startsWith("https://api.telegram.org/")){ tg.push(JSON.parse(opts.body)); return {json: async () => ({ok: true})}; }
    if(/action=detail&auction=copart&lot=61420506/.test(u)) return {ok: true, json: async () => ({ok: true, lot: {id: "copart-61420506", title: "2020 Tesla Model 3", year: 2020, currentBid: 5300, images: ["https://x/1.jpg"], secret: 1}})};
    throw new Error("fetch " + u);
  };
  rest = async p => /alert_links\?chat_id=eq\.5/.test(p) ? [{lang: "ro"}] : [];
  const r = await run("POST", "/api/clients", {action: "pick", chat: "5", text: "https://apexauto.md/auctions/copart-61420506-2020-Tesla-Model-3", note: "Bun pret"});
  assert.strictEqual(r.status === undefined || r.status === 200, true, JSON.stringify(r));
  assert.strictEqual(r.payload.added, 1);
  assert.strictEqual(r.payload.notified, true);
  const ins = calls.find(c => c.m === "POST" && /cab_picks/.test(c.p));
  assert.strictEqual(ins.b[0].lot_id, "copart-61420506");
  assert.strictEqual(ins.b[0].data.secret, undefined);
  assert.strictEqual(String(tg[0].chat_id), "5");
  assert.ok(/Managerul/.test(tg[0].text));                        // язык клиента — румынский
  assert.ok(/#picks$/.test(tg[0].reply_markup.inline_keyboard[0][0].url));

  const bad = await run("POST", "/api/clients", {action: "pick", chat: "5", text: "просто текст"});
  assert.strictEqual(bad.status, 400);
});

test("заметка и настройки менеджера сохраняются", async () => {
  calls.length = 0; rest = async () => [];
  await run("POST", "/api/clients", {action: "note", chat: "5", text: "ждёт Tesla", tags: ["a", "b"]});
  const n = calls.find(c => c.m === "POST" && /alert_meta/.test(c.p));
  assert.strictEqual(n.b.k, "cnote:5"); assert.deepStrictEqual(n.b.v.tags, ["a", "b"]);
  const p = await run("POST", "/api/clients", {action: "prefs", online: false, hot: true, react: true});
  assert.deepStrictEqual(p.payload.prefs, {online: false, hot: true, react: true, msg: true});
});
