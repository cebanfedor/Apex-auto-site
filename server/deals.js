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
    timeline: parseTimeline(b.timeline), photos: parsePhotos(b.photos), docs: parseDocs(b.docs), calc: cleanCalc(b.calc),
    active: b.active !== false && b.active !== "false" && b.active !== 0, updated_at: new Date().toISOString()
  };
}

// Что видит клиент (без телефона/служебных полей)
function publicDeal(r){
  return {
    id: r.id, title: r.title, vin: r.vin || "", stage: r.stage, next_step: r.next_step || "", eta: r.eta_date || "",
    total: r.total_usd == null ? null : Number(r.total_usd), paid: r.paid_usd == null ? null : Number(r.paid_usd),
    timeline: Array.isArray(r.timeline) ? r.timeline : [], photos: Array.isArray(r.photos) ? r.photos : [], docs: Array.isArray(r.docs) ? r.docs : [],
    calc: r.calc && typeof r.calc === "object" ? cleanCalc(r.calc) : null,
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


// ---------- Расчёт доставки и таможни («Мои сделки», кабинет) ----------
// Считает тем же ядром, что калькулятор сайта (calc-core). Менеджер может поправить любую цифру руками;
// клиенту в кабинете уходит то, что сохранено в cab_deals.calc.
const VIN_FUEL = {1: "diesel", 2: "electric", 3: "hybrid", 4: "gasoline", 5: "phev"};
function fuelOfLot(lot){
  const k = VIN_FUEL[lot.fuelKind]; if(k) return k;
  const t = [lot.fuel, lot.title].filter(Boolean).join(" ").toLowerCase();
  if(/plug-?in|phev/.test(t)) return "phev";
  if(/electric|\bev\b|электро/.test(t)) return "electric";
  if(/hybrid|гибрид/.test(t)) return "hybrid";
  if(/diesel|дизел/.test(t)) return "diesel";
  return "gasoline";
}
function vehicleTypeOfLot(lot, ApexCalc){
  const body = String(lot.body || "").toLowerCase();
  const text = body + " " + String(lot.make || "").toLowerCase() + " " + String(lot.model || "").toLowerCase();
  const ps = ApexCalc.powerSportKind ? ApexCalc.powerSportKind(lot) : ""; if(ps) return ps;
  if(/motorcycle|moto\b/.test(text)) return "moto";
  if(/\batv\b|quad/.test(text)) return "atv";
  if(/pickup|truck|silverado|sierra|\bram\b|f-150|f150|tundra|tacoma/.test(text)) return "pickup";
  if(ApexCalc.isMinivan && ApexCalc.isMinivan(lot.make, lot.model, lot.title, body)) return "minivan";
  if(/\bvan\b|cargo|sprinter|transit|minivan/.test(text)) return "vanLarge";
  const byModel = ApexCalc.bodyClassForModel ? ApexCalc.bodyClassForModel(lot.make, lot.model) : null;
  if(byModel === "crossover" || byModel === "suv") return byModel;
  if(/suv|utility|cuv|crossover/.test(body)) return "suv";
  return "sedan";
}
function litersOfLot(lot){
  const m = String(lot.engine || "").match(/\b([1-9](?:\.\d)?)\s*l/i) || String(lot.title || "").match(/\b([1-9]\.\d)\s*l\b/i);
  const n = m ? Number(m[1]) : Number(lot.vinEngineL) || 0;
  return n > 0 && n <= 7 ? n : 0;
}
const rnd = n => Math.round(Number(n) || 0);

// lot — ответ /api/auctions?action=vin. rules: "2026" | "2027" | "" (по умолчанию как на сайте)
async function calcFromLot(lot, rules){
  if(!lot) return null;
  const isCa = /,\s*canada\s*$|\b(ontario|quebec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland)\b/i.test(String(lot.location || ""));
  if(isCa) return {canada: true};
  const ApexCalc = require("../calc-core.js");
  const ch = require("./calc-handler");
  const rates = await ch.currentRates();
  const sold = Number(lot.statusId) === 6 && Number(lot.finalBid) > 0;
  const price = sold ? Number(lot.finalBid) : (Number(lot.currentBid) || Number(lot.buyNow) || 0);
  const auction = lot.auction === "iaai" ? "iaai" : "copart";
  const location = ch.findLocation(lot.location, auction);
  const fuel = fuelOfLot(lot);
  const input = {
    lotPrice: price, auction, vehicleType: vehicleTypeOfLot(lot, ApexCalc), fuel,
    engineLiters: fuel === "electric" ? 0 : (litersOfLot(lot) || 2), curbKg: 0,
    customsRules: rules === "2027" ? "2027" : rules === "2026" ? "2026" : undefined,
    year: Number(lot.year) || new Date().getFullYear() - 5,
    insurance: true, exportDocs: false, offsite: false, paymentFee: true, marginUsd: 0,
    usdMdl: rates.usdMdl, eurMdl: rates.eurMdl, port: (location && location.autoPort) || "nj", location
  };
  const r = ApexCalc.compute(input);
  return {
    canada: false, locationFound: !!location, locationLabel: location ? (location.displayName || location.location || "") : "",
    port: r.port || "", rules: input.customsRules || (ApexCalc.getCustomsRules ? ApexCalc.getCustomsRules() : "2026"),
    vehicleType: input.vehicleType, fuel, engineLiters: input.engineLiters, year: input.year, lotPrice: price,
    usd_mdl: Number(r.usdMdl) || rates.usdMdl,
    land_usd: rnd(r.land), sea_usd: rnd(r.sea), customs_mdl: rnd(r.customsMdlValue), broker_mdl: rnd(r.brokerUtilMdl)
  };
}

// Что храним и показываем клиенту: четыре суммы + скидка + курс. Всё правится руками.
function cleanCalc(c){
  if(!c || typeof c !== "object") return null;
  const n = v => { const x = num(v); return x == null ? null : x; };
  const out = {
    land_usd: n(c.land_usd), sea_usd: n(c.sea_usd), customs_mdl: n(c.customs_mdl), broker_mdl: n(c.broker_mdl),
    discount_on: c.discount_on === true || c.discount_on === "true" || c.discount_on === 1 || c.discount_on === "on",
    discount_usd: n(c.discount_usd), usd_mdl: n(c.usd_mdl),
    rules: c.rules === "2027" ? "2027" : c.rules === "2026" ? "2026" : "",
    note: String(c.note || "").trim().slice(0, 200)
  };
  const any = [out.land_usd, out.sea_usd, out.customs_mdl, out.broker_mdl].some(v => v != null && v > 0);
  return any ? out : null;
}

// ---------- Заполнение сделки из трекинга (/api/w8-tracking) ----------
// Название этапа трекинга (W8 / Dealer API / AvtoShipping) → этап сделки. Дальше «в пути в Кишинёв» (road)
// трекинг не двигает: растаможку, выдачу менеджер отмечает руками.
const TRACK_TO_STAGE = {
  "Car won": "bought", "Left auction": "pickup", "Delivered to loading place": "port", "Loading": "sea", "Arrival": "klaipeda",
  "D_PURCHASED": "bought", "D_TO_ORIGIN": "pickup", "D_AT_ORIGIN": "port", "D_SEA": "sea", "D_TO_DEST": "road", "D_AT_DEST": "klaipeda", "D_ARRIVED": "road",
  "A_PURCHASED": "paid", "A_DISPATCHED": "pickup", "A_DELIVERED": "port", "A_LOADED": "sea", "A_UNLOADED": "klaipeda", "A_EU_DISPATCHED": "road"
};
const TRACK_LABEL = {
  "Car won": "Куплен на аукционе", "Left auction": "Выехал с аукциона", "Delivered to loading place": "Прибыл на склад / в порт", "Loading": "Погружен в контейнер", "Arrival": "Прибыл в порт Клайпеда",
  "D_PURCHASED": "Куплен", "D_TO_ORIGIN": "В пути на склад", "D_AT_ORIGIN": "На складе в порту отправки", "D_SEA": "Отправлен морем", "D_TO_DEST": "В пути по Европе", "D_AT_DEST": "На складе в Европе", "D_ARRIVED": "Прибыл",
  "A_PURCHASED": "Оплачен", "A_DISPATCHED": "В пути на склад", "A_DELIVERED": "Прибыл на склад", "A_LOADED": "Погружен в контейнер", "A_UNLOADED": "Выгружен из контейнера", "A_EU_DISPATCHED": "В пути к месту выдачи"
};
const stageIdx = k => STAGE_KEYS.indexOf(k);
const isoDay = v => { const m = String(v || "").match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : ""; };

// Ответ /api/w8-tracking → поля сделки (null, если трекинг машину не знает)
function fromTracking(d){
  if(!d || d.error || (!d.vehicle && !(d.stages && d.stages.length))) return null;
  const todayStr = new Date().toISOString().slice(0, 10);
  const stages = Array.isArray(d.stages) ? d.stages : [];
  const portArr = d.container && d.container.portArrival ? isoDay(d.container.portArrival) : "";
  let best = -1, bestKey = "";
  const timeline = [];
  for(const s of stages){
    const key = TRACK_TO_STAGE[s.title]; if(!key) continue;
    let status = s.status;
    if(s.title === "Arrival" && status !== "completed" && portArr && todayStr >= portArr) status = "completed";
    if(status !== "completed" && status !== "current") continue;
    if(stageIdx(key) > best){ best = stageIdx(key); bestKey = key; }
    if(status === "completed" && s.date){
      let text = TRACK_LABEL[s.title] || s.title;
      if(s.title === "Car won" || s.title === "A_PURCHASED" || s.title === "D_PURCHASED"){
        const extra = [d.auction, d.city].filter(Boolean).join(", ");
        if(extra) text += " · " + extra;
      }
      if(s.title === "Loading" || s.title === "A_LOADED"){ const n = d.container && d.container.number; if(n) text += " · контейнер " + n; }
      timeline.push({at: isoDay(s.date), text: text.slice(0, 300)});
    }
  }
  const eta = isoDay(d.etaChisinau) || "";
  const photos = [];
  const seen = new Set();
  for(const c of (Array.isArray(d.photoCategories) ? d.photoCategories : [])){
    for(const u of (c.photos || [])){
      const url = httpsUrl(u); if(!url || seen.has(url)) continue;
      seen.add(url); photos.push({url, caption: String(c.label || "").slice(0, 120)});
    }
  }
  if(!photos.length) for(const u of (d.photos || [])){ const url = httpsUrl(u); if(url && !seen.has(url)){ seen.add(url); photos.push({url, caption: ""}); } }
  return {
    title: String(d.vehicle || "").trim().slice(0, 140), vin: String(d.vin || "").toUpperCase().slice(0, 17),
    stage: bestKey, eta_date: eta, timeline: timeline.slice(0, 60), photos: photos.slice(0, 40),
    city: d.city || "", auction: d.auction || "", lot: d.lotNumber || "", container: (d.container && d.container.number) || "", source: d.source || ""
  };
}

// Что изменить в уже существующей сделке по свежему трекингу. Только вперёд и только добавляем:
// этап не откатывается и не выше «в пути в Кишинёв», введённое руками (ETA, фразы) не затирается.
function mergeTracking(row, t){
  if(!row || !t) return null;
  const patch = {};
  if(t.stage && stageIdx(t.stage) > stageIdx(row.stage) && stageIdx(t.stage) <= stageIdx("road")) patch.stage = t.stage;
  if(t.eta_date && !row.eta_date) patch.eta_date = t.eta_date;
  const tl = Array.isArray(row.timeline) ? row.timeline.slice() : [];
  const have = new Set(tl.map(x => String(x.text || "").trim().toLowerCase()));
  let added = 0;
  for(const e of (t.timeline || [])){ const k = e.text.trim().toLowerCase(); if(!have.has(k)){ tl.push(e); have.add(k); added++; } }
  if(added){ tl.sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))); patch.timeline = tl.slice(-60); }
  const ph = Array.isArray(row.photos) ? row.photos.slice() : [];
  const urls = new Set(ph.map(x => x.url));
  let addedPh = 0;
  for(const p of (t.photos || [])){ if(!urls.has(p.url) && ph.length < 40){ ph.push(p); urls.add(p.url); addedPh++; } }
  if(addedPh) patch.photos = ph;
  return Object.keys(patch).length ? patch : null;
}

// «Кому писать»: телефон клиента → чат Telegram (после подтверждения номера в боте)
async function chatForKey(supabase, key){
  const rows = await supabase.list("alert_meta", {select: "v", k: `eq.phonekey:${key}`, limit: "1"}).catch(() => []);
  const chat = rows && rows[0] && rows[0].v && rows[0].v.chat;
  if(!chat) return null;
  const links = await supabase.list("alert_links", {select: "lang", chat_id: `eq.${chat}`, limit: "1"}).catch(() => []);
  return {chat, lang: (links && links[0] && links[0].lang) || "ru"};
}

// Фоновая синхронизация: по кругу берём активные сделки с VIN, подтягиваем трекинг, обновляем и пишем клиенту при смене этапа.
async function syncDeals({supabase, fetchTrack, budgetMs, batch}, out){
  out = out || {}; out.dealsChecked = 0; out.dealsUpdated = 0; out.dealMsgs = 0;
  const deadline = Date.now() + (budgetMs || 15000);
  const cur = await supabase.list("alert_meta", {select: "v", k: "eq.dealsync_cursor", limit: "1"}).catch(() => []);
  const after = Number(cur && cur[0] && cur[0].v && cur[0].v.id) || 0;
  const n = batch || 6;
  const rows = await supabase.list("cab_deals", {select: "*", active: "eq.true", vin: "not.is.null", stage: "neq.done", id: `gt.${after}`, order: "id.asc", limit: String(n)}).catch(() => null);
  if(!rows) return out;
  let lastId = rows.length < n ? 0 : (rows.length ? rows[rows.length - 1].id : 0);
  for(const row of rows){
    if(Date.now() > deadline - 3000){ lastId = row.id - 1; break; }
    out.dealsChecked++;
    const t = fromTracking(await fetchTrack(row.vin).catch(() => null));
    const patch = mergeTracking(row, t);
    if(!patch) continue;
    patch.updated_at = new Date().toISOString();
    const saved = await supabase.update("cab_deals", row.id, patch).catch(() => null);
    if(!saved) continue;
    out.dealsUpdated++;
    if(patch.stage && patch.stage !== row.notified_stage){
      const c = await chatForKey(supabase, row.phone_key);
      if(c){
        const merged = Object.assign({}, row, patch);
        if(await sendTelegram(c.chat, stageMessage(merged, c.lang), c.lang)){ out.dealMsgs++; await supabase.update("cab_deals", row.id, {notified_stage: patch.stage}).catch(() => {}); }
      }
    }
  }
  await supabase.upsert("alert_meta", {k: "dealsync_cursor", v: {id: lastId}, updated_at: new Date().toISOString()}, "k").catch(() => {});
  return out;
}

module.exports = {calcFromLot, cleanCalc, fromTracking, mergeTracking, chatForKey, syncDeals, STAGES, STAGE_KEYS, stageLabel, phoneKey, cleanDeal, publicDeal, parseTimeline, parsePhotos, parseDocs, stageMessage, sendTelegram};
