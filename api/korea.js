// /api/korea — отдельная лёгкая выдача авто из Кореи (Encar, domain_id=12 у auctionsapi.com).
// 30.10.2026 (Федор: «нужна отдельная кнопка Авто из Кореи, публиковать корейские авто,
// с ценой позже разберёмся»): намеренно НЕ использует normalizeLot/calc-core из api/auctions.js —
// та машинерия построена под Copart/IAAI (ставки, резерв, статус торгов, odometer.mi как основа)
// и рискованно переносить её на Encar без проверки реальных полей фида для этого домена.
// Здесь — отдельный маленький нормализатор, без цены (цену сознательно не показываем —
// неизвестно, в каком виде/валюте её отдаёт фид для Кореи, разберёмся отдельно).
const {sendJson, methodNotAllowed} = require("../server/http");
const {fetchT} = require("../server/fetchx");

const BASE = "https://auctionsapi.com/api";
const DOMAIN_ID = "12"; // Encar/Корея — см. isEncar() в api/auctions.js (id===12)
const CACHE = new Map();
const TTL = 10 * 60 * 1000; // как у hot-lots.js — не долбим платный ключ на каждое открытие страницы

function safeName(v){ return v && typeof v === "object" ? (v.name || v.title || v.value || "") : String(v || ""); }
function safeNum(v){
  if(v && typeof v === "object") return safeNum(v.value || v.amount || v.km || v.mi || 0);
  const n = Number(String(v || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function imageList(src){
  const sources = [src?.images?.normal, src?.images?.big, src?.images, src?.photos, src?.photo, src?.image, src?.thumbnail];
  const out = [];
  for(const s of sources){
    if(Array.isArray(s)) out.push(...s);
    else if(s) out.push(s);
  }
  return [...new Set(out.map(x => typeof x === "string" ? x : (x?.url || x?.src || "")).filter(Boolean))];
}
function findItems(payload){
  if(Array.isArray(payload)) return payload;
  const candidates = [payload?.data?.items, payload?.data?.lots, payload?.data?.results, payload?.data?.cars, payload?.data, payload?.items, payload?.lots, payload?.results, payload?.cars];
  for(const v of candidates) if(Array.isArray(v)) return v;
  return [];
}

// Пробег: фид обычно кладёт объект {mi, km} (как у Copart/IAAI) — для Кореи естественная
// единица км, поэтому km в приоритете; мили — расчётный запасной вариант. ⚠️ Поля не
// проверены на живом фиде для domain_id=12 (нет доступа к auctionsapi из этой сессии) —
// если на проде окажется другая форма, скорректировать здесь.
function mileageOf(lot, item){
  const src = lot?.odometer ?? item?.odometer;
  const km = safeNum(src?.km);
  if(km > 0) return {km, text:`${Math.round(km).toLocaleString("en-US")} km`};
  const mi = safeNum(src?.mi ?? src);
  if(mi > 0) return {km:Math.round(mi * 1.609344), text:`${Math.round(mi * 1.609344).toLocaleString("en-US")} km`};
  return {km:0, text:""};
}

function normalizeKoreaItem(raw){
  const item = raw?.data && !Array.isArray(raw.data) ? raw.data : raw;
  const lots = Array.isArray(item?.lots) ? item.lots : [];
  const lot = lots[0] || item?.lot || item;
  const year = safeNum(item?.year);
  const make = safeName(item?.manufacturer || item?.make);
  const model = safeName(item?.model);
  const images = imageList(lot).length ? imageList(lot) : imageList(item);
  const mileage = mileageOf(lot, item);
  const id = String(lot?.lot || lot?.external_id || item?.id || item?.lot || "").trim();
  if(!id && !images.length && !make && !model) return null; // совсем пустая запись — не показываем
  return {
    id: id || null,
    title: item?.title || [year, make, model].filter(Boolean).join(" ") || "Автомобиль из Кореи",
    year, make, model,
    images: images.slice(0, 8),
    image: images[0] || "",
    mileageKm: mileage.km,
    mileageText: mileage.text,
    fuel: safeName(item?.fuel),
    transmission: safeName(item?.transmission),
    color: safeName(item?.color),
    location: safeName(lot?.location?.city || lot?.location || item?.location),
    vin: /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(item?.vin || "").trim()) ? String(item.vin).trim().toUpperCase() : "",
  };
}

async function fetchKoreaPage(page, perPage){
  const key = `${page}:${perPage}`;
  const hit = CACHE.get(key);
  if(hit && hit.exp > Date.now()) return hit.data;

  const apiKey = process.env.AUCTIONS_API_KEY;
  if(!apiKey) return {items:[], total:0, mode:"fallback", reason:"AUCTIONS_API_KEY не настроен"};

  const params = new URLSearchParams({domain_id:DOMAIN_ID, page:String(page), per_page:String(perPage)});
  let res;
  try{
    res = await fetchT(`${BASE}/cars?${params}`, {headers:{"x-api-key":apiKey, accept:"application/json"}}, 8000);
  }catch(e){
    // 30.10.2026 (Федор: «пустая страница, почему?») — раньше тут был общий текст без реальной причины
    // (таймаут/DNS/обрыв соединения выглядели одинаково). Теперь кладём настоящее сообщение ошибки.
    const data = {items:[], total:0, mode:"fallback", reason:`Сервис аукционов не отвечает: ${String(e && e.message || e).slice(0, 160)}`};
    CACHE.set(key, {data, exp:Date.now() + 30 * 1000}); // короткий TTL на сбой — не залипаем надолго
    return data;
  }
  if(!res.ok){
    // Тело ответа при ошибке часто объясняет причину (напр. у НОВОГО api.auctionsapi.com бывает
    // "you don't have any data in your subscription" — см. CLAUDE.md «API»). Короткий фрагмент помогает
    // диагностировать без доступа к логам Vercel.
    let bodySnippet = "";
    try{ bodySnippet = (await res.text()).slice(0, 200); }catch(e){}
    const data = {items:[], total:0, mode:"fallback", reason:`AuctionsAPI ${res.status}${bodySnippet ? ": " + bodySnippet : ""}`};
    CACHE.set(key, {data, exp:Date.now() + 30 * 1000});
    return data;
  }
  let payload;
  try{ payload = await res.json(); }catch(e){ return {items:[], total:0, mode:"fallback", reason:"Bad JSON from AuctionsAPI"}; }
  const rawItems = findItems(payload);
  const items = rawItems.map(normalizeKoreaItem).filter(Boolean);
  const total = Number(payload?.total ?? payload?.count ?? payload?.data?.total ?? payload?.data?.count ?? payload?.meta?.total) || items.length;
  // Разделяем два разных «пусто»: фид не вернул ни одной записи для domain_id=12 (подписка/лимит/нет лотов
  // прямо сейчас) — vs. записи пришли, но наш normalizeKoreaItem счёл их все пустыми (баг маппинга полей).
  const data = {
    items, total, mode:"live",
    ...(rawItems.length === 0 ? {reason:"Фид вернул 0 записей для domain_id=12 (Корея)"} : {}),
    ...(rawItems.length > 0 && items.length === 0 ? {reason:`Фид вернул ${rawItems.length} записей, но normalizeKoreaItem не смог их разобрать — нужна сверка полей`, sampleKeys:Object.keys(rawItems[0] || {}).slice(0, 40)} : {}),
  };
  CACHE.set(key, {data, exp:Date.now() + TTL});
  return data;
}

module.exports = async function handler(req, res){
  if(req.method !== "GET") return methodNotAllowed(res);
  const q = new URL(req.url, "http://x").searchParams;
  const page = Math.max(1, Number(q.get("page")) || 1);
  const perPage = Math.min(48, Math.max(1, Number(q.get("per_page")) || 24));
  let data;
  try{ data = await fetchKoreaPage(page, perPage); }
  catch(e){ data = {items:[], total:0, mode:"fallback", reason:String(e && e.message || e).slice(0, 160)}; }
  return sendJson(res, 200, {...data, page, perPage, hasMore: data.items.length >= perPage && (page * perPage) < (data.total || 0)});
};
