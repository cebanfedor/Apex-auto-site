// «Мои сделки» личного кабинета: этапы, разбор данных из админки, сообщение клиенту в Telegram.
// Таблица cab_deals — supabase/migrations/20261125_cab_deals.sql.
const SITE = "https://apexauto.md";

// [ключ, [ru, ro, en]] — порядок этапов от покупки до выдачи
const STAGES = [
  ["bought",   ["Куплен на аукционе", "Cumpărat la licitație", "Bought at auction"]],
  ["paid",     ["Лот оплачен", "Lot plătit", "Lot paid"]],
  ["pickup",   ["Вывоз с площадки", "Ridicare din parcare", "Pickup from the yard"]],
  ["port",     ["На складе в порту", "La depozitul din port", "At the port warehouse"]],
  ["sea",      ["В море", "Pe mare", "At sea"]],
  ["klaipeda", ["В порту Клайпеда", "În portul Klaipeda", "In Klaipeda port"]],
  ["road",     ["В пути в Кишинёв", "În drum spre Chișinău", "On the way to Chișinău"]],
  ["customs",  ["Растаможка", "Vămuire", "Customs clearance"]],
  ["ready",    ["Готова к выдаче", "Gata de predare", "Ready for handover"]],
  ["done",     ["Выдана", "Predată", "Handed over"]]
];
const STAGE_KEYS = STAGES.map(s => s[0]);
const LI = {ru: 0, ro: 1, en: 2};
const stageLabel = (key, lang) => { const s = STAGES.find(x => x[0] === key); return s ? s[1][LI[lang] || 0] : key; };

const phoneKey = p => { const d = String(p == null ? "" : p).replace(/\D/g, ""); return d.length >= 7 ? d.slice(-8) : ""; };
const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const httpsUrl = u => { u = String(u || "").trim(); return /^https:\/\/[^\s"'<>]+$/i.test(u) ? u.slice(0, 600) : ""; };

// "2026-11-20 | текст" или "20.11.2026 | текст"
function parseTimeline(v){
  const lines = Array.isArray(v) ? v : String(v || "").split(/\r?\n/);
  const out = [];
  for(const raw of lines){
    if(raw && typeof raw === "object"){ const t = String(raw.text || "").trim(); if(t) out.push({at: String(raw.at || "").slice(0, 10), text: t.slice(0, 300)}); continue; }
    const line = String(raw || "").trim(); if(!line) continue;
    const m = line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\s*[|;]\s*(.+)$/);
    let at = "", text = line;
    if(m){
      text = m[2].trim();
      at = m[1].includes("-") ? m[1] : m[1].split(".").reverse().map((x, i) => i === 0 ? x : x.padStart(2, "0")).join("-");
    }
    if(text) out.push({at, text: text.slice(0, 300)});
  }
  return out.slice(0, 60);
}
// "https://… | подпись"
function parsePhotos(v){
  const lines = Array.isArray(v) ? v : String(v || "").split(/\r?\n/);
  const out = [];
  for(const raw of lines){
    if(raw && typeof raw === "object"){ const url = httpsUrl(raw.url); if(url) out.push({url, caption: String(raw.caption || "").slice(0, 120)}); continue; }
    const [u, ...rest] = String(raw || "").split("|");
    const url = httpsUrl(u); if(url) out.push({url, caption: rest.join("|").trim().slice(0, 120)});
  }
  return out.slice(0, 40);
}
// "Название | https://…"
function parseDocs(v){
  const lines = Array.isArray(v) ? v : String(v || "").split(/\r?\n/);
  const out = [];
  for(const raw of lines){
    if(raw && typeof raw === "object"){ const url = httpsUrl(raw.url); const name = String(raw.name || "").trim(); if(url && name) out.push({name: name.slice(0, 100), url}); continue; }
    const s = String(raw || "").trim(); if(!s) continue;
    const i = s.lastIndexOf("|");
    const url = httpsUrl(i >= 0 ? s.slice(i + 1) : s);
    const name = (i >= 0 ? s.slice(0, i) : "Документ").trim();
    if(url && name) out.push({name: name.slice(0, 100), url});
  }
  return out.slice(0, 30);
}

// Сырое тело из админки → строка таблицы (null, если нет обязательных полей)
function cleanDeal(b){
  b = b || {};
  const title = String(b.title || "").trim().slice(0, 140);
  const key = phoneKey(b.phone);
  if(!title || !key) return null;
  const stage = STAGE_KEYS.includes(b.stage) ? b.stage : "bought";
  const vin = String(b.vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "").slice(0, 17);
  const eta = /^\d{4}-\d{2}-\d{2}$/.test(String(b.eta_date || "")) ? String(b.eta_date) : null;
  return {
    phone_key: key, phone: String(b.phone || "").trim().slice(0, 40), client_name: String(b.client_name || "").trim().slice(0, 100) || null,
    title, vin: vin || null, stage, next_step: String(b.next_step || "").trim().slice(0, 300) || null, eta_date: eta,
    total_usd: num(b.total_usd), paid_usd: num(b.paid_usd),
    timeline: parseTimeline(b.timeline), photos: parsePhotos(b.photos), docs: parseDocs(b.docs),
    active: b.active !== false && b.active !== "false" && b.active !== 0, updated_at: new Date().toISOString()
  };
}

// Что видит клиент (без телефона/служебных полей)
function publicDeal(r){
  return {
    id: r.id, title: r.title, vin: r.vin || "", stage: r.stage, next_step: r.next_step || "", eta: r.eta_date || "",
    total: r.total_usd == null ? null : Number(r.total_usd), paid: r.paid_usd == null ? null : Number(r.paid_usd),
    timeline: Array.isArray(r.timeline) ? r.timeline : [], photos: Array.isArray(r.photos) ? r.photos : [], docs: Array.isArray(r.docs) ? r.docs : [],
    updated: r.updated_at
  };
}

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MSG = {
  ru: {head: "📍 Ваша сделка", stage: "Этап", next: "Дальше", eta: "Выдача", btn: "Мои сделки"},
  ro: {head: "📍 Tranzacția ta", stage: "Etapa", next: "Urmează", eta: "Predare", btn: "Tranzacțiile mele"},
  en: {head: "📍 Your order", stage: "Stage", next: "Next", eta: "Handover", btn: "My orders"}
};
function stageMessage(deal, lang){
  const T = MSG[lang] || MSG.ru;
  const dt = deal.eta_date ? new Date(deal.eta_date + "T00:00:00Z") : null;
  let eta = "";
  if(dt && !Number.isNaN(dt.getTime())){
    try{ eta = dt.toLocaleDateString(lang === "en" ? "en-GB" : lang === "ro" ? "ro-RO" : "ru-RU", {timeZone: "UTC", day: "numeric", month: "long"}); }catch(_){ eta = deal.eta_date; }
  }
  return `${T.head} — <b>${esc(deal.title)}</b>\n${T.stage}: <b>${esc(stageLabel(deal.stage, lang))}</b>` +
    (deal.next_step ? `\n${T.next}: ${esc(deal.next_step)}` : "") + (eta && deal.stage !== "done" ? `\n${T.eta}: <b>${esc(eta)}</b>` : "");
}
async function sendTelegram(chatId, text, lang){
  const token = process.env.ALERTS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
  if(!token) return false;
  const T = MSG[lang] || MSG.ru;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try{
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: {"content-type": "application/json"}, signal: ctl.signal,
      body: JSON.stringify({chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: {inline_keyboard: [[{text: T.btn, url: SITE + "/cabinet#deals"}]]}})
    });
    const j = await r.json();
    return !!(j && j.ok);
  }catch(_){ return false; }
  finally{ clearTimeout(timer); }
}

module.exports = {STAGES, STAGE_KEYS, stageLabel, phoneKey, cleanDeal, publicDeal, parseTimeline, parsePhotos, parseDocs, stageMessage, sendTelegram};
