// Кабинет v3: профиль клиента, «был в сети», журнал просмотров/поисков, подборки менеджера, уведомления менеджеру.
// Таблицы cab_events / cab_picks — supabase/migrations/20261126_cab_clients.sql; профиль, присутствие и заметки
// менеджера лежат в alert_meta (ключи profile:<chat>, seen:<chat>, cnote:<chat>, mgr_prefs) — миграция не нужна.
const SITE = "https://apexauto.md";
const ONLINE_MS = 3 * 60e3;                       // «онлайн сейчас» — пинг не старше 3 минут
const LOT_RE = /^(copart|iaai)-[A-Za-z0-9_-]{3,30}$/;
// просмотры: лоты аукционов и целые машины Кореи/Канады (kr-/ca-)
const VIEW_RE = /^(copart|iaai|kr|ca)-[A-Za-z0-9_-]{3,40}$/;
const KEEP = ["id","auction","lot","title","year","make","model","vin","image","auctionDate","currentBid","buyNow","finalBid","statusId","saleStatus","primaryDamage","odometerText","location","fuel","engine","drive","keys","document","estimatedRetailValue","repairCost","sellerName"];

const esc = v => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const phoneKey = p => { const d = String(p == null ? "" : p).replace(/\D/g, ""); return d.length >= 7 ? d.slice(-8) : ""; };
const digitsOnly = p => String(p == null ? "" : p).replace(/\D/g, "");

// Профиль, который клиент заполняет сам (в настройках кабинета). Телефон тут НЕ подтверждён — подтверждённый
// приходит из Telegram (alert_meta phone:<chat>).
function cleanProfile(b){
  b = b || {};
  const phone = String(b.phone == null ? "" : b.phone).replace(/[^\d+()\-\s]/g, "").replace(/\s+/g, " ").trim().slice(0, 24);
  return {name: clip(b.name, 60), city: clip(b.city, 60), phone: digitsOnly(phone).length >= 7 || !phone ? phone : "", t: Date.now()};
}

// Событие клиента → запись журнала (null, если не годится)
function cleanEvent(kind, key, data){
  data = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  if(kind === "view"){
    if(!VIEW_RE.test(String(key || ""))) return null;
    const out = {};
    for(const k of ["title","make","model","vin","image","auctionDate"]) if(data[k]) out[k] = clip(data[k], k === "image" ? 300 : 160);
    if(/^(kr|ca)-/.test(String(key))){ out.catalog = true; out.src = String(key).slice(0, 2); if(typeof data.url === "string" && data.url[0] === "/") out.url = clip(data.url, 300); if(Number(data.usd) > 0) out.usd = Math.round(Number(data.usd)); }
    if(Number(data.year) > 1950 && Number(data.year) < 2100) out.year = Number(data.year);
    if(Number(data.currentBid) > 0) out.currentBid = Math.round(Number(data.currentBid));
    return {kind, key: String(key), data: out};
  }
  if(kind === "search"){
    const k = clip(key, 300);
    if(!k) return null;
    return {kind, key: k, data: {label: clip(data.label, 200), qs: clip(data.qs || k, 400)}};
  }
  return null;
}

// Сводка журнала: по каждому лоту — сколько раз открывал, первый/последний раз; поиски — то же
function aggregateEvents(rows){
  const views = new Map(), searches = new Map();
  for(const r of rows || []){
    const t = Date.parse(r.at) || 0;
    const map = r.kind === "search" ? searches : r.kind === "view" ? views : null;
    if(!map) continue;
    let a = map.get(r.key);
    if(!a){ a = {key: r.key, n: 0, first: t, last: t, data: r.data || {}}; map.set(r.key, a); }
    a.n++; if(t < a.first) a.first = t; if(t > a.last){ a.last = t; a.data = r.data || a.data; }
  }
  const sort = m => Array.from(m.values()).sort((x, y) => y.last - x.last);
  return {views: sort(views), searches: sort(searches)};
}

// Что искать «похожее» для клиента: самые частые марка+модель среди просмотренных/избранных + разброс годов
function interestProfile(items){
  const score = new Map();
  for(const it of items || []){
    const d = it.data || it;
    const make = clip(d.make, 40), model = clip(d.model, 40), year = Number(d.year) || 0;
    if(!make) continue;
    const key = (make + "|" + model).toLowerCase();
    let s = score.get(key);
    if(!s) score.set(key, s = {make, model, w: 0, years: []});
    s.w += Number(it.w) || 1;
    if(year > 1990) s.years.push(year);
  }
  return Array.from(score.values()).sort((a, b) => b.w - a.w).slice(0, 3).map(s => {
    const ys = s.years.sort((a, b) => a - b);
    return {make: s.make, model: s.model, w: s.w, yearFrom: ys.length ? ys[0] - 2 : 0, yearTo: ys.length ? ys[ys.length - 1] + 2 : 0};
  });
}

// Из ссылки/текста менеджера → {id, auction, lot}. Понимает «copart-61420506», ссылки /auctions/<slug>, «IAAI #45839097»
function parseLotRef(text){
  const s = String(text || "").trim();
  let m = s.match(/(?:^|[\/\s#])(copart|iaai)[-\s#:]*(\d{5,12})(?![\d])/i);
  if(!m) return null;
  const auction = m[1].toLowerCase(), lot = m[2];
  return {id: auction + "-" + lot, auction, lot};
}
function parseLotRefs(text){
  const out = [], seen = new Set();
  const re = /(copart|iaai)[-\s#:]*(\d{5,12})(?![\d])/ig;
  let m;
  while((m = re.exec(String(text || "")))){
    const id = m[1].toLowerCase() + "-" + m[2];
    if(seen.has(id)) continue; seen.add(id);
    out.push({id, auction: m[1].toLowerCase(), lot: m[2]});
  }
  return out.slice(0, 12);
}

// Снимок лота для подборки (то, что клиент видит в кабинете без обращения к API)
function lotSnapshot(lot){
  if(!lot || typeof lot !== "object") return null;
  const o = {};
  for(const k of KEEP){ if(lot[k] !== undefined && lot[k] !== null && lot[k] !== "") o[k] = lot[k]; }
  if(!o.image && Array.isArray(lot.images) && lot.images[0]) o.image = lot.images[0];
  if(Array.isArray(lot.images)) o.images = lot.images.filter(x => typeof x === "string").slice(0, 3);
  if(o.title) o.title = clip(o.title, 140);
  return o.id ? o : null;
}

const MSG = {
  ru: {pick1: "🎯 <b>Менеджер подобрал для вас авто</b>", pickN: n => `🎯 <b>Менеджер подобрал для вас ${n} авто</b>`, btn: "Открыть подборку", note: "Комментарий"},
  ro: {pick1: "🎯 <b>Managerul ți-a ales o mașină</b>", pickN: n => `🎯 <b>Managerul ți-a ales ${n} mașini</b>`, btn: "Deschide selecția", note: "Comentariu"},
  en: {pick1: "🎯 <b>Your manager picked a car for you</b>", pickN: n => `🎯 <b>Your manager picked ${n} cars for you</b>`, btn: "Open the selection", note: "Comment"}
};
function pickMessage(lang, picks, note){
  const T = MSG[lang] || MSG.ru;
  const head = picks.length === 1 ? T.pick1 : T.pickN(picks.length);
  const lines = picks.slice(0, 6).map(p => {
    const d = p.data || {};
    const bid = Number(d.currentBid) > 0 ? " · " + Number(d.currentBid).toLocaleString("en-US").replace(/,/g, " ") + (/canada|,\s*(AB|BC|MB|NB|NL|NS|ON|PE|QC|SK)\b/i.test(String(d.location || "")) ? " CAD" : " $") : "";
    return `• ${esc(d.title || p.lot_id)}${bid}`;
  });
  const more = picks.length > 6 ? `\n… +${picks.length - 6}` : "";
  return head + "\n\n" + lines.join("\n") + more + (note ? `\n\n💬 <i>${esc(clip(note, 400))}</i>` : "");
}

// ---------- Telegram: клиенту и менеджеру ----------
const {inlineButton} = require("./tgapp");
function botToken(){ return process.env.ALERTS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ""; }
async function tgSend(chatId, text, buttons){
  const token = botToken();
  if(!token || !chatId) return false;
  const body = {chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true};
  if(buttons && buttons.length) body.reply_markup = {inline_keyboard: [buttons.map(inlineButton)]};
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body), signal: ctl.signal});
    const j = await r.json();
    return !!(j && j.ok);
  }catch(_){ return false; }
  finally{ clearTimeout(timer); }
}

let adminCache = {chat: null, at: 0};
// Чат менеджера: env TELEGRAM_CHAT_ID или привязка через CRM («Заявки» → привязать Telegram)
async function adminChat(sb){
  if(process.env.TELEGRAM_CHAT_ID) return process.env.TELEGRAM_CHAT_ID;
  if(Date.now() - adminCache.at < 5 * 60e3) return adminCache.chat;
  try{
    const meta = await sb(`/alert_meta?k=eq.admin_lead_token&select=v`);
    const token = meta && meta[0] && meta[0].v && meta[0].v.token;
    if(!token){ adminCache = {chat: null, at: Date.now()}; return null; }
    const links = await sb(`/alert_links?token=eq.${encodeURIComponent(token)}&select=chat_id&limit=1`);
    adminCache = {chat: (links && links[0] && links[0].chat_id) || null, at: Date.now()};
    return adminCache.chat;
  }catch(_){ return adminCache.chat; }
}
const MGR_DEFAULT = {online: true, hot: true, react: true, msg: true, lotday: true};
async function mgrPrefs(sb){
  try{
    const r = await sb(`/alert_meta?k=eq.mgr_prefs&select=v&limit=1`);
    return Object.assign({}, MGR_DEFAULT, r && r[0] && r[0].v || {});
  }catch(_){ return Object.assign({}, MGR_DEFAULT); }
}
async function notifyManager(sb, kind, text, buttons){
  const prefs = await mgrPrefs(sb);
  if(prefs[kind] === false) return false;
  const chat = await adminChat(sb);
  if(!chat) return false;
  return tgSend(chat, text, buttons);
}

// ---------- переписка с клиентом (таблица cab_msgs) ----------
const MSG_MAX = 3500;
async function msgAdd(sb, chat, dir, text){
  const t = String(text == null ? "" : text).trim().slice(0, MSG_MAX);
  if(!t || !chat) return false;
  await sb(`/cab_msgs`, {method: "POST", headers: {prefer: "return=minimal"}, body: JSON.stringify({chat_id: String(chat), dir, text: t, seen: dir === "out"})});
  return true;
}
// Последние сообщения (старые первыми) + пометка «прочитано» для входящих
async function msgThread(sb, chat, markSeen){
  const rows = await sb(`/cab_msgs?chat_id=eq.${encodeURIComponent(chat)}&select=id,dir,text,seen,at&order=at.desc&limit=80`);
  const list = (rows || []).slice().reverse();
  if(markSeen && list.some(m => m.dir === "in" && !m.seen)){
    await sb(`/cab_msgs?chat_id=eq.${encodeURIComponent(chat)}&dir=eq.in&seen=eq.false`, {method: "PATCH", headers: {prefer: "return=minimal"}, body: JSON.stringify({seen: true})}).catch(() => {});
  }
  return list;
}

async function metaSet(sb, k, v){
  await sb(`/alert_meta?on_conflict=k`, {method: "POST", headers: {prefer: "resolution=merge-duplicates,return=minimal"}, body: JSON.stringify({k, v, updated_at: new Date().toISOString()})});
}

// Как зовём клиента в сообщениях менеджеру
async function clientLabel(sb, chat){
  try{
    const rows = await sb(`/alert_meta?k=in.(${["profile", "tgname", "phone"].map(x => encodeURIComponent(x + ":" + chat)).join(",")})&select=k,v`);
    const m = {};
    for(const r of rows || []) m[String(r.k).split(":")[0]] = r.v || {};
    const name = (m.profile && m.profile.name) || (m.tgname && m.tgname.n) || "Клиент";
    const phone = (m.profile && m.profile.phone) || (m.phone && m.phone.n ? "+" + m.phone.n : "");
    return {name, phone, text: esc(name) + (phone ? ` · ${esc(phone)}` : "")};
  }catch(_){ return {name: "Клиент", phone: "", text: "Клиент"}; }
}

module.exports = {msgAdd, msgThread, MSG_MAX, SITE, ONLINE_MS, LOT_RE, KEEP, esc, clip, phoneKey, digitsOnly, cleanProfile, cleanEvent, aggregateEvents, interestProfile, parseLotRef, parseLotRefs, lotSnapshot, pickMessage, tgSend, adminChat, mgrPrefs, notifyManager, clientLabel, metaSet, MGR_DEFAULT};
