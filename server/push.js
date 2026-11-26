// Web push (26.11.2026): уведомления на телефон/компьютер без Telegram — те же события, что уходят в бота.
// VAPID-ключи: из env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT) или создаются один раз и лежат в alert_meta (k=vapid).
// Подписки устройств — alert_meta k=push:<token> {subs:[{endpoint, keys:{p256dh, auth}, t}]} (до 5 устройств на токен).
// Адресат определяется так же, как у бота: chat_id → токены клиента (alert_links) → подписки.
const q = encodeURIComponent;
const MAX_DEVICES = 5;
let webpush = null;
function wp(){ if(!webpush) webpush = require("web-push"); return webpush; }

function validSub(s){
  return !!(s && typeof s === "object" && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 600
    && s.keys && typeof s.keys.p256dh === "string" && typeof s.keys.auth === "string" && s.keys.p256dh.length < 200 && s.keys.auth.length < 100);
}
// Тело уведомления из HTML-текста сообщения бота
function plain(text){
  return String(text == null ? "" : text).replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/\s+\n/g, "\n").trim();
}
function toPayload(text, url, title){
  const lines = plain(text).split("\n").map(s => s.trim()).filter(Boolean);
  const head = title || lines[0] || "Apex Auto";
  const body = (title ? lines : lines.slice(1)).join(" · ").slice(0, 180);
  return JSON.stringify({title: head.slice(0, 80), body, url: url || "/cabinet", tag: "apex-" + Date.now().toString(36)});
}

function create(sb){
  let vapidCache = null;

  async function metaGet(k){
    const rows = await sb(`/alert_meta?k=eq.${q(k)}&select=v&limit=1`).catch(() => null);
    return rows && rows[0] ? rows[0].v : null;
  }
  async function metaSet(k, v){
    await sb(`/alert_meta?on_conflict=k`, {method: "POST", headers: {prefer: "resolution=merge-duplicates,return=minimal"}, body: JSON.stringify({k, v, updated_at: new Date().toISOString()})});
  }
  async function vapid(){
    if(vapidCache) return vapidCache;
    if(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY){
      vapidCache = {publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY, subject: process.env.VAPID_SUBJECT || "mailto:info@apexauto.md"};
      return vapidCache;
    }
    let v = await metaGet("vapid");
    if(!v || !v.publicKey || !v.privateKey){
      const k = wp().generateVAPIDKeys();
      v = {publicKey: k.publicKey, privateKey: k.privateKey, subject: "mailto:info@apexauto.md"};
      // ignore-duplicates: если параллельный вызов уже записал ключи — читаем их, а не затираем
      await sb(`/alert_meta?on_conflict=k`, {method: "POST", headers: {prefer: "resolution=ignore-duplicates,return=minimal"}, body: JSON.stringify({k: "vapid", v, updated_at: new Date().toISOString()})}).catch(() => {});
      const again = await metaGet("vapid");
      if(again && again.publicKey && again.privateKey) v = again;
    }
    vapidCache = v;
    return v;
  }
  async function publicKey(){ const v = await vapid(); return v.publicKey; }

  async function saveSub(token, sub){
    if(!validSub(sub)) return false;
    const cur = (await metaGet("push:" + token)) || {};
    const subs = (cur.subs || []).filter(s => s.endpoint !== sub.endpoint);
    subs.push({endpoint: sub.endpoint, keys: {p256dh: sub.keys.p256dh, auth: sub.keys.auth}, t: Date.now()});
    await metaSet("push:" + token, {subs: subs.slice(-MAX_DEVICES)});
    return true;
  }
  async function delSub(token, endpoint){
    const cur = await metaGet("push:" + token);
    if(!cur || !cur.subs) return;
    const subs = endpoint ? cur.subs.filter(s => s.endpoint !== endpoint) : [];
    await metaSet("push:" + token, {subs});
  }
  async function status(token){
    const cur = await metaGet("push:" + token);
    return {devices: cur && cur.subs ? cur.subs.length : 0};
  }

  // Отправка на все устройства токена; «мёртвые» подписки (410/404) удаляем
  async function sendToToken(token, payload){
    const cur = await metaGet("push:" + token);
    if(!cur || !cur.subs || !cur.subs.length) return 0;
    const v = await vapid();
    const lib = wp();
    let ok = 0; const dead = [];
    await Promise.all(cur.subs.map(async s => {
      try{
        await lib.sendNotification({endpoint: s.endpoint, keys: s.keys}, payload, {vapidDetails: {subject: v.subject, publicKey: v.publicKey, privateKey: v.privateKey}, TTL: 6 * 3600, urgency: "high", timeout: 6000});
        ok++;
      }catch(e){ if(e && (e.statusCode === 404 || e.statusCode === 410)) dead.push(s.endpoint); }
    }));
    if(dead.length) await metaSet("push:" + token, {subs: cur.subs.filter(s => !dead.includes(s.endpoint))}).catch(() => {});
    return ok;
  }
  // chat_id → все токены этого клиента → устройства
  async function sendToChat(chatId, text, url, title){
    if(!chatId) return 0;
    const links = await sb(`/alert_links?chat_id=eq.${q(chatId)}&select=token&limit=5`).catch(() => null);
    if(!links || !links.length) return 0;
    const payload = toPayload(text, url, title);
    let n = 0;
    for(const l of links) if(l && l.token) n += await sendToToken(l.token, payload).catch(() => 0);
    return n;
  }
  return {publicKey, saveSub, delSub, status, sendToToken, sendToChat, vapid};
}

module.exports = {create, validSub, plain, toPayload};
