const test = require("node:test");
const assert = require("node:assert");
const wp = require("web-push");
const push = require("../server/push");

// Память вместо Supabase: alert_meta и alert_links
function fakeSb(links){
  const meta = new Map();
  const sb = async (path, opts = {}) => {
    const m = path.match(/^\/alert_meta\?k=eq\.([^&]+)/);
    if(m && (!opts.method || opts.method === "GET")){ const k = decodeURIComponent(m[1]); return meta.has(k) ? [{v: meta.get(k)}] : []; }
    if(path.startsWith("/alert_meta?on_conflict=k")){
      const b = JSON.parse(opts.body);
      if(/ignore-duplicates/.test(opts.headers.prefer) && meta.has(b.k)) return null;
      meta.set(b.k, b.v); return null;
    }
    if(path.startsWith("/alert_links?chat_id=eq.")) return links;
    return null;
  };
  sb.meta = meta;
  return sb;
}
const SUB = {endpoint: "https://push.example.com/abc", keys: {p256dh: "p".repeat(80), auth: "a".repeat(20)}};

test("validSub отсеивает мусор", () => {
  assert.ok(push.validSub(SUB));
  assert.ok(!push.validSub({endpoint: "http://x", keys: SUB.keys}));
  assert.ok(!push.validSub({endpoint: SUB.endpoint}));
  assert.ok(!push.validSub(null));
});

test("toPayload: первая строка — заголовок, остальное — текст; HTML снят", () => {
  const p = JSON.parse(push.toPayload("📅 <b>Назначена дата</b>\nHonda &amp; Co\n<a href=\"x\">лот</a>", "/cabinet#fav"));
  assert.equal(p.title, "📅 Назначена дата");
  assert.equal(p.body, "Honda & Co · лот");
  assert.equal(p.url, "/cabinet#fav");
});

test("VAPID создаётся один раз и переиспользуется", async () => {
  const sb = fakeSb([]);
  const a = push.create(sb), b = push.create(sb);
  const k1 = await a.publicKey(), k2 = await b.publicKey();
  assert.ok(k1.length > 40);
  assert.equal(k1, k2);
});

test("подписки: сохранение, лимит устройств, отправка и удаление мёртвых", async () => {
  const sb = fakeSb([{token: "T".repeat(24)}]);
  const p = push.create(sb);
  const token = "T".repeat(24);
  for(let i = 0; i < 7; i++) assert.ok(await p.saveSub(token, {endpoint: "https://push.example.com/" + i, keys: SUB.keys}));
  assert.equal((await p.status(token)).devices, 5);
  const orig = wp.sendNotification;
  const sent = [];
  wp.sendNotification = async (sub, payload) => {
    sent.push(sub.endpoint);
    if(sub.endpoint.endsWith("/6")){ const e = new Error("gone"); e.statusCode = 410; throw e; }
    return {statusCode: 201};
  };
  try{
    const n = await p.sendToChat(555, "Hello\nBody", "/cabinet");
    assert.equal(n, 4);                       // 5 устройств, одно «мёртвое»
    assert.equal((await p.status(token)).devices, 4);
  }finally{ wp.sendNotification = orig; }
});

test("без токенов у чата — ничего не отправляем", async () => {
  const p = push.create(fakeSb([]));
  assert.equal(await p.sendToChat(1, "x"), 0);
});
