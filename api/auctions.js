const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const supabase = require("../server/supabase");
const priceGuide = require("../server/price-guide");
const {isValidContact, isValidVin} = require("../server/validators");

const AUCTIONS_API_BASE = "https://auctionsapi.com/api";
const CACHE_TTL = 7 * 60 * 1000;
const cache = new Map();

// Rate limiting: max 3 lead submissions per IP per 10 minutes
const LEAD_RATE_LIMIT = 3;
const LEAD_RATE_WINDOW = 10 * 60 * 1000;
const leadRateMap = new Map();

function getClientIp(request){
  const forwarded = request.headers["x-forwarded-for"] || "";
  return forwarded.split(",")[0].trim() || request.socket?.remoteAddress || "unknown";
}

function checkLeadRate(ip){
  const now = Date.now();
  // Purge stale entries every ~100 calls to prevent unbounded growth
  if(leadRateMap.size > 500){
    for(const [k, v] of leadRateMap) if(now - v.start > LEAD_RATE_WINDOW) leadRateMap.delete(k);
  }
  const entry = leadRateMap.get(ip);
  if(!entry || now - entry.start > LEAD_RATE_WINDOW){
    leadRateMap.set(ip, {count:1, start:now});
    return true;
  }
  if(entry.count >= LEAD_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

async function notifyTelegram(data){
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if(!token || !chatId) return;
  const lines = [
    "🚗 *Новая заявка — Apex Auto*",
    `👤 *Имя:* ${data.name || "—"}`,
    `📞 *Телефон:* ${data.phone || "—"}`,
  ];
  if(data.comment) lines.push(`💬 *Комментарий:* ${data.comment}`);
  if(data.lot) lines.push(`📋 *Лот:* ${data.lot}`);
  if(data.vin) lines.push(`🔑 *VIN:* ${data.vin}`);
  if(data.auction) lines.push(`🏷 *Аукцион:* ${data.auction.toUpperCase()}`);
  // Прямая ссылка на лот — менеджер открывает машину одним кликом, без поиска.
  if(data.lotUrl) lines.push(`🔗 ${data.lotUrl}`);
  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:chatId, text:lines.join("\n"), parse_mode:"Markdown"})
    });
  }catch(_){}
}

// CACHE_VER бампается при изменении нормализации/сортировки: кеш хранит уже
// обработанные ответы, и без этого старая выдача живёт до 6 часов.
const CACHE_VER = "n6";
function cacheKey(action, params){
  return `${CACHE_VER}:${action}:${Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("&")}`;
}

// Edge-кэш Vercel (CDN) для медленно меняющихся оценок: повторные открытия того
// же лота/модели отдаются с CDN мгновенно, без вызова функции. stale-while-
// revalidate — отдаём кэш сразу, а обновляем в фоне.
const COMPS_EDGE_CACHE = {"cache-control": "public, s-maxage=900, stale-while-revalidate=86400"};
const STATS_EDGE_CACHE = {"cache-control": "public, s-maxage=3600, stale-while-revalidate=86400"};

// DB_TTL in seconds: search=6h, detail=30мин (аукционы переносят даты — 24h кеш
// показывал устаревшую дату торгов), vin=7d, dict/lists=12h
// search: 3 мин — иначе лот, сыгравший час назад, до 6 часов не появлялся в архиве (кэш живого ответа).
const DB_TTL = {search:180, detail:1800, vin:604800, _default:43200};

// Supabase может лечь/тормозить (переполнение, пауза проекта) — его никогда
// не ждём дольше 1.5с (живая база отвечает <300мс), а после двух подряд
// таймаутов/ошибок пропускаем его целиком на 3 минуты (circuit breaker):
// иначе каждый MISS-запрос детальной/каталога терял секунды на мёртвой базе.
const SB_WAIT_MS = 2500;   // 23.09.2026: под нагрузкой (purge + тяжёлые вкладки) чтения кэша выходили за 1.5с и выбивали базу на 3 мин
let sbFails = 0, sbDownUntil = 0;
function sbUp(){ return Date.now() > sbDownUntil; }
const SB_TIMEOUT = Symbol("sbTimeout");
async function sbGuard(promise, ms){
  if(!sbUp()) return null;
  try{
    const res = await Promise.race([
      promise,
      new Promise(resolve => setTimeout(() => resolve(SB_TIMEOUT), ms || SB_WAIT_MS))
    ]);
    if(res === SB_TIMEOUT){
      if(++sbFails >= 2){ sbDownUntil = Date.now() + 180e3; sbFails = 0; }
      return null;
    }
    sbFails = 0;
    return res;
  }catch(_){
    if(++sbFails >= 2){ sbDownUntil = Date.now() + 180e3; sbFails = 0; }
    return null;
  }
}

async function getDbCache(key){
  const now = new Date().toISOString();
  const rows = await sbGuard(supabase.list("api_cache", {
    cache_key:`eq.${key}`, expires_at:`gt.${now}`, select:"data", limit:1
  }));
  return rows && rows[0] ? rows[0].data : null;
}

// Stale read: same row, but ignores expires_at — used when the upstream API is down/rate-limited.
async function getDbCacheStale(key){
  const rows = await sbGuard(supabase.list("api_cache", {
    cache_key:`eq.${key}`, select:"data", limit:1
  }));
  return rows && rows[0] ? rows[0].data : null;
}

async function setDbCache(key, data, action){
  try{
    const ttl = DB_TTL[action] || DB_TTL._default;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    // Запись — best-effort: медленный upsert большого ответа не должен выбивать базу на 3 мин для всех чтений.
    await Promise.race([
      supabase.upsert("api_cache", {cache_key:key, data, expires_at:expiresAt}, "cache_key"),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);
  }catch(_){}
}

function getCached(key){
  const item = cache.get(key);
  if(!item || item.expires < Date.now()){
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value, ttl){
  cache.set(key, {value, expires:Date.now() + (ttl || CACHE_TTL)});
}

function safeName(value){
  return value && typeof value === "object" ? value.name || value.title || value.value || "" : String(value || "");
}

function safeNumber(value){
  if(value && typeof value === "object"){
    return safeNumber(value.value || value.amount || value.usd || value.price || value.bid);
  }
  const number = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function normalizeAuction(value){
  // value may be a string ("iaai_com") or an object ({name:"iaai_com", id:1})
  const text = (value && typeof value === "object" ? (value.name || value.title || "") : String(value || "")).toLowerCase();
  if(text.includes("iaai") || text === "1" || value === 1) return "iaai";
  return "copart";
}

function auctionsApiDomain(auction){
  return auction === "iaai" ? "iaai_com" : "copart_com";
}

function auctionsApiDomainId(auction){
  return auction === "iaai" ? "1" : "3";
}

function iaaiSuffix(lot){
  if(/^ICB_/i.test(lot)) return "~";   // Canadian CBE — no country code
  if(/^\d+$/.test(lot))  return "~US"; // Pure numeric = US lot
  return "~CA";                         // Any other prefix (Imp_, C_, etc.) = Canadian
}

function auctionUrl(auction, lot){
  if(!lot) return "";
  return auction === "iaai"
    ? `https://www.iaai.com/VehicleDetail/${encodeURIComponent(lot)}${iaaiSuffix(lot)}`
    : `https://www.copart.com/lot/${encodeURIComponent(lot)}`;
}

// vis.iaai.com/deepzoom — полноразмерные тайлы по ~700KB: 18 фото кладут
// страницу в ~12MB и IAAI обрывает часть запросов (битые картинки у канадских
// лотов). Переписываем на их же resizer: 1280px ≈ 230KB, качества хватает
// и карточкам, и лайтбоксу.
function normalizeImageUrl(url){
  const m = String(url || "").match(/^https?:\/\/vis\.iaai\.com\/deepzoom\?.*?imageKey=([^&]+)/i);
  if(!m) return url;
  const key = decodeURIComponent(m[1]).replace(/~RW.*$/i, "");
  return `https://vis.iaai.com/resizer?imageKeys=${encodeURIComponent(key)}&width=1280&height=960`;
}

function imageList(value){
  // images.normal and images.big are the same photos at two resolutions — pick one set only
  const imgNormal = Array.isArray(value?.images?.normal) ? value.images.normal : [];
  const imgBig    = Array.isArray(value?.images?.big)    ? value.images.big    : [];
  const imgArr    = imgBig.length ? imgBig : imgNormal.length ? imgNormal
    : Array.isArray(value?.images) ? value.images : [];

  const sources = [
    imgArr,
    value?.photos,
    value?.photo,
    value?.image,
    value?.image_url,
    value?.thumbnail
  ];
  const list = [];
  for(const source of sources){
    if(Array.isArray(source)) list.push(...source);
    else if(source) list.push(source);
  }
  return list
    .map(item => typeof item === "string" ? item : item?.url || item?.src || "")
    .filter(Boolean)
    .map(normalizeImageUrl)
    .filter((item, index, all) => all.indexOf(item) === index);
}

// Seller: real name + type badge. IAAI has seller_type; Copart detects from name.
function sellerLabel(lot, item){
  let name = safeName(lot?.seller || item?.seller);
  // Фид иногда кладёт в seller имя файла («dsc2.jpg») — это мусор, не продавец.
  if(/\.(jpe?g|png|webp|gif)$/i.test(name) || /^https?:/i.test(name)) name = "";
  const t = safeName(lot?.seller_type || item?.seller_type).toLowerCase();
  // Detect insurance from seller_type or from well-known insurer names
  const nameUp = name.toUpperCase();
  const insurerKeywords = /INSURANCE|GEICO|USAA|CSAA|PROGRESSIVE|ALLSTATE|NATIONWIDE|LIBERTY MUTUAL|STATE FARM|FARMERS|BRISTOL WEST|TRAVELERS|ERIE|MERCURY|ESURANCE|21ST CENTURY|AAA|METLIFE|KEMPER|AMERICAN FAMILY/;
  const isInsurance = /insurance/.test(t) || (!t && insurerKeywords.test(nameUp));
  const isDealer = /non.?insurance|dealer|dealership|private/.test(t);
  if(name){
    if(isInsurance) return name + " · Страховая";
    if(isDealer) return name + " · Дилер";
    return name;
  }
  // No name — show type category only
  if(isDealer) return "Дилер / частник";
  if(/insurance/.test(t)) return "Страховая компания";
  if(t) return t.replace(/_/g, " ");
  return "";
}

function keysLabel(lot, item){
  const v = lot?.keys_available != null ? lot.keys_available
    : item?.keys_available != null ? item.keys_available
    : (lot?.keys != null ? lot.keys : item?.keys);
  if(v === true) return "Да";
  if(v === false) return "Нет";
  return safeName(v);
}

function driveLabel(value){
  const t = safeName(value).toLowerCase();
  if(!t) return "";
  if(/all|awd/.test(t)) return "AWD";
  if(/front|fwd/.test(t)) return "FWD";
  if(/rear|rwd/.test(t)) return "RWD";
  if(/4|four/.test(t)) return "4×4";
  return safeName(value);
}

function locationLabel(loc){
  if(!loc) return "";
  if(typeof loc === "string") return loc;
  if(typeof loc === "object"){
    const city = safeName(loc.city || loc.name);
    const state = safeName(loc.state || loc.state_code || loc.region);
    const country = safeName(loc.country || loc.country_code);
    const tail = state || country;
    return [city, tail].filter(Boolean).join(", ");
  }
  return "";
}

// Sale status = reserve type of the lot (not the vehicle condition).
// Sources: lots[0].auction_type ("pure_sale"), lots[0].seller_reserve, is_timed_auction.
function saleStatusInfo(lot, item){
  // seller_reserve: раньше число, с сентября 2026 — объект {price, updated_at} (резерв продавца на Timed).
  const rawRes = lot?.seller_reserve != null ? lot.seller_reserve : item?.seller_reserve;
  const reserve = rawRes && typeof rawRes === "object" ? Number(rawRes.price) || 0 : Number(rawRes) || 0;
  const reserveAt = rawRes && typeof rawRes === "object" ? (rawRes.updated_at || "") : "";
  const auctionType = safeName(lot?.auction_type || item?.auction_type).toLowerCase();
  const timed = lot?.is_timed_auction === true || item?.is_timed_auction === true;
  let key = "", label = "";
  if(reserve != null && Number(reserve) > 0){ key = "min_reserve"; label = "Минимальный резерв"; }
  else if(auctionType === "pure_sale"){ key = "no_reserve"; label = "Без резерва"; }
  if(!label && timed){ key = "timed"; label = "Timed аукцион"; }
  else if(label && timed){ label += " · Timed"; }
  return {key, label, timed, reserve:reserve > 0 ? Math.round(reserve) : 0, reserveAt};
}

function lotStatus(item, lot){
  const text = [
    item?.status,
    item?.lot_status,
    item?.lotStatus,
    lot?.status,
    lot?.lot_status,
    lot?.lotStatus
  ].map(safeName).find(Boolean) || "";
  const lowered = text.toLowerCase();
  if(lowered.includes("sold")) return "sold";
  if(lowered.includes("buy")) return "buy now";
  if(lowered.includes("upcoming") || lowered.includes("future")) return "upcoming";
  if(lowered.includes("live") || lowered.includes("active")) return "live";
  return text || "live";
}

// Для мото/ATV/спецтехники фид не отдаёт manufacturer/model (null) — марки нет
// в справочнике /manufacturers. Достаём её из title по известному списку брендов,
// остаток заголовка после марки считаем моделью (BidCars делает так же).
const TITLE_MAKES = [
  "Harley-Davidson", "Harley Davidson", "Can-Am", "Can Am", "Cf Moto", "CFMoto",
  "Polaris", "Arctic Cat", "Yamaha", "Kawasaki", "Suzuki", "Honda", "KTM",
  "Ducati", "Triumph", "Indian", "Aprilia", "Moto Guzzi", "Royal Enfield",
  "Vespa", "Piaggio", "Zero", "Segway", "Hisun", "Kayo", "Coleman", "SSR",
  "Tao Tao", "TaoTao", "Benelli", "Husqvarna", "Gas Gas", "GasGas", "Sherco",
  "Beta", "Sea-Doo", "Ski-Doo", "Seadoo", "Skidoo", "Bombardier", "Odes",
  "Massimo", "Linhai", "Argo", "American Landmaster", "Landmaster",
  "Intimidator", "Tracker", "Textron", "Cub Cadet", "John Deere", "Kubota", "Bobcat"
];
function makeFromTitle(title, year){
  let rest = String(title || "").trim();
  if(!rest) return null;
  if(year) rest = rest.replace(new RegExp(`^\\s*${year}\\s+`), "");
  const low = rest.toLowerCase();
  let best = "";
  for(const m of TITLE_MAKES){
    const ml = m.toLowerCase();
    if(low.startsWith(ml + " ") || low === ml){
      if(ml.length > best.length) best = m;
    }
  }
  if(!best) return null;
  return {make:best, model:rest.slice(best.length).trim()};
}

function normalizeLot(source, fallbackAuction = "copart"){
  const item = source?.data && !Array.isArray(source.data) ? source.data : source;
  const lots = Array.isArray(item?.lots) ? item.lots : [];
  const lot = lots[0] || item?.lot || item;
  const auction = normalizeAuction(item?.auction || lot?.auction || item?.domain || lot?.domain || fallbackAuction);
  let make = safeName(item?.manufacturer || item?.make || item?.brand);
  let model = safeName(item?.model);
  const year = safeNumber(item?.year);
  if(!make){
    const parsed = makeFromTitle(item?.title, year);
    if(parsed){ make = parsed.make; model = model || parsed.model; }
  }
  const lotNumber = String(lot?.lot || lot?.lot_number || lot?.lotNumber || lot?.external_id || item?.lot || item?.lot_number || item?.lotNumber || "").replace(/~.*/, "");
  // For IAAI: external_id is the stock number used in the URL (lot.lot is the internal API id).
  const iaaiExternalId = auction === "iaai" ? String(lot?.external_id || lotNumber).replace(/~.*/, "") : "";
  const title = item?.title || [year, make, model].filter(Boolean).join(" ") || "Автомобиль";
  const location = locationLabel(lot?.location) || safeName(lot?.branch || lot?.selling_branch) || locationLabel(item?.location);
  const primaryDamage = safeName(lot?.damage?.main || lot?.primary_damage || lot?.primaryDamage || item?.primary_damage || item?.damage);
  const secondaryDamage = safeName(lot?.damage?.second || lot?.secondary_damage || lot?.secondaryDamage || item?.secondary_damage);
  // Канада: Copart CA показывает одометр в КМ, а фид кладёт то же число в odometer.mi и «пересчитывает»
  // в km (48 349 km на Copart → mi:48349, km:77810). Для канадских лотов число = километры;
  // мили считаем сами (÷1.609). Признак — страна локации CA или провинция в строке локации.
  const odoRaw = safeNumber(lot?.odometer?.mi || lot?.odometer || item?.odometer || item?.mileage);
  const isCanadaLot = (() => {
    const iso = String(lot?.location?.country?.iso || lot?.location?.country_code || lot?.location?.country || "").toLowerCase();
    if(iso === "ca" || iso === "canada") return true;
    return /\bcanada\b|,\s*(qc|on|ab|bc|mb|sk|ns|nb|nl|pe)\s*$/i.test(String(location || ""));
  })();
  const odometerKmVal = isCanadaLot ? odoRaw : safeNumber(lot?.odometer?.km);
  const odometer = isCanadaLot ? Math.round(odoRaw / 1.609) : odoRaw;
  // У timed-аукционов ставка живёт в timed_start_bid, а bid пуст
  const currentBid = safeNumber(lot?.bid || lot?.current_bid || lot?.currentBid || item?.current_bid || item?.bid)
    || safeNumber(lot?.timed_start_bid);
  const finalBid = safeNumber(lot?.final_bid || lot?.finalBid || lot?.winning_bid || lot?.sale_price);
  const buyNow = safeNumber(lot?.buy_now || lot?.buyNow || item?.buy_now || item?.buyNow);
  const statusName = safeName(lot?.status || item?.status);
  const rawStatusId = (lot?.status ?? item?.status);
  const statusId = typeof rawStatusId === "number" ? rawStatusId
    : typeof rawStatusId === "string" && /^\d+$/.test(rawStatusId) ? Number(rawStatusId)
    : (rawStatusId?.id != null ? Number(rawStatusId.id) : null);
  const sale = saleStatusInfo(lot, item);
  const rawHistory = (Array.isArray(lot?.prices) && lot.prices.length) ? lot.prices
    : (Array.isArray(item?.prices) && item.prices.length) ? item.prices
    : (() => {
        if(!Array.isArray(item?.lots)) return [];
        // Prefer a nested prices array inside any lot
        const withPrices = item.lots.find(l => Array.isArray(l?.prices) && l.prices.length);
        if(withPrices) return withPrices.prices;
        // Search results: item.lots[1+] are prior auction attempts for the same VIN
        if(item.lots.length > 1) return item.lots.slice(1);
        return [];
      })();
  // История цены = только реальные прошлые аукционы (по sale_date).
  // final_bid_updated_at — это время обновления записи в API, не дата торгов:
  // с ним снапшоты ставок выглядели как «2 аукциона за ночь с разницей 7 минут».
  if(rawHistory[0] && typeof rawHistory[0] === "object") normalizeLot.lastRawHistKeys = Object.keys(rawHistory[0]);
  const priceHistoryRaw = rawHistory.map(p => ({
    bid:safeNumber(p?.bid || p?.final_bid || p?.current_bid),
    buyNow:safeNumber(p?.buy_now_price || p?.buy_now),
    date:p?.sale_date || "",
    status:safeName(p?.status),
    // Timed-раунд (Федор 23.09.2026): в истории показываем «Timed · не продан» и сумму.
    timed:p?.is_timed_auction === true || p?.timed === true || /timed/i.test(String(p?.auction_type || p?.sale_type || p?.type || "")) || looksTimed(p?.sale_date),
    lot:String(p?.lot || p?.lot_number || p?.lotNumber || p?.external_id || "").replace(/~.*/, "")
  })).filter(p => (p.bid || p.buyNow) && p.date && new Date(p.date).getTime() < Date.now());
  // Один аукцион — одна запись: дедуп по дню торгов, оставляем максимальную ставку.
  const byDay = new Map();
  for(const p of priceHistoryRaw){
    const day = String(p.date).slice(0, 10);
    const prev = byDay.get(day);
    if(!prev || (p.bid || 0) > (prev.bid || 0)) byDay.set(day, p);
  }
  // «Не продан за $200» — это перенос лота без реальных ставок (пребид-заглушка),
  // а не финальная ставка торгов. DreamBid такие записи не показывает — мы тоже:
  // скрываем not_sold с копеечной ставкой (< $300 или < 2% от оценки авто).
  const ervForNoise = safeNumber(lot?.actual_cash_value || lot?.estimated_retail_value || item?.estimated_retail_value || 0);
  const noiseCap = Math.max(300, ervForNoise * 0.02);
  // Перенос даты торгов (Copart Future → новая дата) создаёт запись not_sold
  // с промежуточным пребидом — это не прошлые торги. Признак: лот активен
  // с будущей датой, а его пребид-цикл непрерывен (текущая ставка выше
  // «финала» недавней записи). При честной непродаже ставка обнуляется,
  // так что реальные relist-записи под правило не попадают.
  const saleTs = Date.parse(lot?.sale_date || lot?.auction_date || "");
  const saleUpcoming = Number.isFinite(saleTs) && saleTs > Date.now();
  // Проверка на здравый смысл: «не продан за $78 000» при оценке авто $54 000 и выкупе $41 500
  // (BMW M4, лот 64624966) — не ставка. Продавец не откажется от 78k, чтобы выставить выкуп за 41.5k:
  // фид записал в поле ставки что-то иное (запрос продавца/сорванную ставку). Такие записи непроданных
  // раундов выбрасываем: ставка выше 115% оценочной стоимости или в 1.5+ раза выше текущего «Купить сейчас».
  const buyNowNow = safeNumber(lot?.buy_now || item?.buy_now);
  const absurdBid = p => /not_sold/i.test(p.status) && (p.bid || 0) > 0
    && ((ervForNoise > 0 && p.bid > ervForNoise * 1.15) || (buyNowNow > 0 && p.bid > buyNowNow * 1.5));
  const priceHistory = Array.from(byDay.values())
    .filter(p => !absurdBid(p))
    .filter(p => !(/not_sold/i.test(p.status) && (p.bid || 0) > 0 && (p.bid || 0) < noiseCap && !p.buyNow))
    .filter(p => !(saleUpcoming && currentBid > 0 && /not_sold/i.test(p.status)
      && (p.bid || 0) > 0 && (p.bid || 0) < currentBid
      && Date.parse(p.date) > Date.now() - 30 * 864e5))
    .sort((a, b) => a.date < b.date ? 1 : -1);
  // Запись с датой текущих торгов — это финал ЭТОГО аукциона, а не прошлая
  // продажа: машина, впервые вышедшая на торги, не должна выглядеть как
  // «продавалась ранее». Помечаем — фронт не считает её историей.
  // Пока аукцион не завершён (final_bid нет), API вешает на prices-записи
  // технические таймстампы постановки/переноса лота — они попадают на соседние
  // дни (у 45050740: снапшот «not_sold $10,300» за 27 авг при торгах 28-го).
  // DreamBid такие относит к текущему циклу — записи в пределах ±3 суток
  // от даты торгов у незавершённого лота тоже считаем текущими.
  const currentSaleDay = String(lot?.sale_date || lot?.auction_date || "").slice(0, 10);
  if(currentSaleDay){
    priceHistory.forEach(p => {
      if(String(p.date).slice(0, 10) === currentSaleDay){ p.current = true; return; }
      const ts = Date.parse(p.date);
      if(!finalBid && Number.isFinite(ts) && Number.isFinite(saleTs)
        && Math.abs(ts - saleTs) < 3 * 864e5) p.current = true;
    });
  }
  // For on-approval / sold lots where final_bid isn't explicitly set, infer from price history
  // ⚠️ Раньше финал «додумывался» из ЛЮБОЙ последней записи истории, даже «не продан» — так у лота без
  // ставок появлялась «финальная цена» непроданного раунда. Додумываем только из записи со статусом продажи.
  const topHist = priceHistory[0];
  const topIsSale = topHist && /sold|approval/i.test(topHist.status || "") && !/not_sold/i.test(topHist.status || "");
  const resolvedFinalBid = finalBid || (!currentBid && topIsSale ? (topHist.bid || 0) : 0);
  const images = imageList(lot).length ? imageList(lot) : imageList(item);
  // ⚠️ Фид ставит статус «sold» (6) лотам, торги по которым ЕЩЁ НЕ ПРОШЛИ, а в final_bid кладёт текущую
  // пред-ставку. Торги в будущем → лот не может быть продан: это активный лот со ставкой. Иначе в архиве
  // висели «торги 23 сентября · финальная цена $1 700».
  const saleTsN = Date.parse(lot?.sale_date || lot?.auction_date || "");
  const soldByStatus = Number(statusId) === 6 || Number(statusId) === 8 || /sold/i.test(String(statusName || ""));
  const preBidSold = soldByStatus && Number.isFinite(saleTsN) && saleTsN > Date.now();

  return {
    id:`${auction}-${lotNumber || item?.vin || Math.random().toString(36).slice(2)}`,
    auction,
    title,
    year,
    make,
    model,
    makeId:(item?.manufacturer && item.manufacturer.id) || null,
    modelId:(item?.model && item.model.id) || null,
    generationId:(item?.generation && item.generation.id) || null,
    engineId:(item?.engine && item.engine.id) || null,
    vin:item?.vin || lot?.vin || "",
    lot:lotNumber,
    url:auctionUrl(auction, iaaiExternalId || lotNumber),
    location,
    auctionDate:lot?.sale_date || lot?.auction_date || lot?.saleDate || lot?.date || "",
    currentBid:preBidSold ? Math.max(currentBid, resolvedFinalBid) : currentBid,
    finalBid:preBidSold ? 0 : resolvedFinalBid,
    buyNow,
    odometer,
    odometerKm:odometerKmVal,
    // Для Канады текст — в км (как на Copart), чтобы клиент не считал дважды.
    odometerText:isCanadaLot ? (odoRaw ? `${odoRaw.toLocaleString("en-US")} km` : "") : (odometer ? `${odometer.toLocaleString("en-US")} mi` : ""),
    odometerUnit:isCanadaLot ? "km" : "mi",
    odometerStatus:safeName(lot?.odometer?.status),
    primaryDamage,
    secondaryDamage,
    damage:[primaryDamage, secondaryDamage].filter(Boolean).join(" / "),
    document:safeName(lot?.document || item?.document || lot?.detailed_title || lot?.title),
    titleStatus:safeName(lot?.detailed_title || lot?.title || item?.title),
    saleType:safeName(lot?.loss_type || lot?.casualty_type || lot?.damage_type || item?.loss_type || item?.casualty_type),
    fuel:safeName(item?.fuel || lot?.fuel),
    engine:safeName(item?.engine || lot?.engine),
    // Лошадиные силы зашиты в имя двигателя ("2.0l i-4 di, vvt, turbo, 255hp")
    horsePower:(() => { const m = safeName(item?.engine || lot?.engine).match(/(\d{2,4})\s*hp\b/i); return m ? Number(m[1]) : 0; })(),
    generationName:safeName(item?.generation),
    transmission:safeName(item?.transmission || lot?.transmission),
    drive:driveLabel(item?.drive_wheel || lot?.drive_wheel || item?.drive || item?.drive_type || lot?.drive),
    body:safeName(item?.body_type || item?.vehicle_type || lot?.body_type),
    cylinders:safeName(item?.cylinders || lot?.cylinders),
    color:safeName(item?.color || lot?.color),
    keys:keysLabel(lot, item),
    video:(lot?.images?.video) || (item?.images?.video) || "",
    estimatedRetailValue:safeNumber(lot?.actual_cash_value || lot?.estimated_retail_value || lot?.pre_accident_price || lot?.clean_wholesale_price || item?.estimated_retail_value || item?.acv),
    repairCost:safeNumber(lot?.estimate_repair_price || lot?.estimated_repair_cost),
    airbags:safeName(lot?.airbags),
    preAccidentPrice:safeNumber(lot?.pre_accident_price),
    cleanWholesalePrice:safeNumber(lot?.clean_wholesale_price),
    seller:sellerLabel(lot, item),
    sellerType:safeName(lot?.seller_type || item?.seller_type),
    condition:safeName(lot?.condition || item?.condition),
    priceHistory,
    photoCount:images.length,
    lotStatus:preBidSold ? "sale" : lotStatus(item, lot),
    statusName:preBidSold ? "On sale" : statusName,
    statusId:preBidSold ? 3 : statusId,
    saleStatus:sale.label,
    sellerReserve:sale.reserve || 0,          // резерв продавца, $ (0 = не указан)
    sellerReserveAt:sale.reserveAt || "",
    saleStatusKey:sale.key,
    timed:sale.timed,
    images,
    image:images[0] || ""
  };
}

function findItems(payload){
  if(Array.isArray(payload)) return payload;
  const candidates = [
    payload?.data?.items,
    payload?.data?.lots,
    payload?.data?.results,
    payload?.data?.cars,
    payload?.data,
    payload?.items,
    payload?.lots,
    payload?.results,
    payload?.cars
  ];
  for(const value of candidates){
    if(Array.isArray(value)) return value;
  }
  return [];
}

// Pull every page of a paginated /usa/* dictionary (small lists; capped).
// Stops when a page repeats (some endpoints ignore ?page) or last_page is hit.
async function fetchAllPages(path, cap = 12){
  const all = [];
  let prevFirstId;
  for(let page = 1; page <= cap; page++){
    const sep = path.includes("?") ? "&" : "?";
    const payload = await fetchJson(`${AUCTIONS_API_BASE}${path}${sep}page=${page}`);
    const rows = findItems(payload);
    if(!rows.length) break;
    const firstId = rows[0] && rows[0].id;
    if(page > 1 && firstId != null && firstId === prevFirstId) break; // page param ignored → repeated page
    prevFirstId = firstId;
    all.push(...rows);
    const meta = payload?.meta || payload?.data?.meta || payload;
    const lastPage = Number(meta?.last_page || meta?.lastPage || 0);
    if(lastPage && page >= lastPage) break;
    if(!lastPage && rows.length < 20) break;
  }
  // de-duplicate by id (then by name) — some lists return overlapping rows
  const seen = new Set();
  return all.filter(r => {
    const k = r && r.id != null ? `id:${r.id}` : `n:${safeName(r?.name || r?.title || r)}`;
    if(seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function buildSearchParams(query){
  const params = new URLSearchParams();
  const map = {
    q:"search_query",
    vin:"vin",
    name:"name",
    yearFrom:"from_year",
    yearTo:"to_year",
    bidFrom:"bid_price_from",
    bidTo:"bid_price_to",
    buyNowFrom:"buy_now_price_from",
    buyNowTo:"buy_now_price_to",
    mileageFrom:"odometer_from_mi",
    mileageTo:"odometer_to_mi",
    mileageFromKm:"odometer_from_km",
    mileageToKm:"odometer_to_km",
    // fuel — ниже отдельно: /cars принимает одно значение, мультивыбор дофильтровываем после нормализации

    body:"body_type",
    transmission:"transmission",
    drive:"drive_wheel",
    condition:"condition",
    color:"color",
    vehicleType:"vehicle_type",
    cylinders:"cylinders",
    damage:"damage",
    document:"document_title",
    state:"state_code",
    country:"country",
    generation:"generation_id",
    auctionDateFrom:"sale_date_from",
    auctionDateTo:"sale_date_to",
    daysAhead:"sale_date_in_days",
    nextHours:"next_hours_auction",
    withoutSaleDate:"without_sale_date",
    engineName:"engine_name",
    lotStatus:"status"
  };
  for(const [from, to] of Object.entries(map)){
    let value = query.get(from);
    if(from === "damage" && value) value = damageTerms(value)[0] || "";
    if(value) params.set(to, value);
  }
  const fuelCsv = String(query.get("fuel") || "");
  if(/^\d+$/.test(fuelCsv)) params.set("fuel_type", fuelCsv);
  // Поколение из нашей таблицы (синтетический id) → диапазон лет вместо generation_id.
  const synGenLive = parseSynGen(query.get("generation"));
  if(synGenLive){
    params.delete("generation_id");
    const yf = Number(params.get("from_year")) || 0, yt = Number(params.get("to_year")) || 0;
    params.set("from_year", String(Math.max(yf, synGenLive.from)));
    if(synGenLive.to) params.set("to_year", String(yt ? Math.min(yt, synGenLive.to) : synGenLive.to));
  }
  const make = query.get("make");
  const model = query.get("model");
  if(make && /^[\d,]+$/.test(make)) params.set("manufacturer_id", make);
  if(model && /^\d+$/.test(model)) params.set("model_id", model);
  // Sale status (reserve type) is not a server-side filter on /cars — applied
  // client-side over loaded lots. "На утверждении" maps to the status param.
  const saleList = parseSaleList(query);
  if(saleList.length === 1 && saleList[0] === "on_approval") params.set("status", "4");
  // Timed-аукционы: у /cars нет фильтра по auction_type (проверено по доке
  // и живым запросам), но timed-лоты — это торги ближайших дней (IAAI гоняет
  // их тысячами ежедневно). Сужаем окно до 72 часов — в нём доля timed ~100%,
  // а остаток отфильтровывается после нормализации (см. fetchSearch).
  if(saleList.length === 1 && saleList[0] === "timed" && !query.get("nextHours") && !query.get("daysAhead")){
    params.set("next_hours_auction", "30");
  }
  const tab = query.get("tab");
  if(tab === "buy_now") params.set("buy_now", "1");
  if(tab === "soon" && !params.get("next_hours_auction")) params.set("next_hours_auction", "48");
  if(tab === "sold") params.set("status", "6");
  // Archive = completed auctions (sold + not sold). sale_date filters are
  // unreliable in this API, so use the status field (CSV is accepted).
  if(tab === "archived" && !params.get("status") && query.get("lotStatus") == null){
    params.set("status", "6");   // Архив = только ПРОДАННЫЕ (Федор 22.09.2026): непроданные раунды никому не нужны
  }
  // sale_date_in_days is the only reliable date filter in this API.
  // sale_date_from/to are NOT sent to the API — they confuse it and return 0 results.
  // We use sale_date_in_days to get a broad window, then matchDateRange() on the client
  // provides exact-match guarantee.
  const tabUpcoming = tab !== "buy_now" && tab !== "sold" && tab !== "archived";
  const hasExplicitDays = params.get("sale_date_in_days") || params.get("next_hours_auction");
  // Always delete sale_date_from/to — never send to API (they break results).
  const userDateFrom = params.get("sale_date_from");
  const userDateTo   = params.get("sale_date_to");
  params.delete("sale_date_from");
  params.delete("sale_date_to");
  if(tabUpcoming && !hasExplicitDays){
    if(userDateFrom || userDateTo){
      // Compute how many days ahead we need to cover the chosen date + 7 days buffer.
      const farStr = userDateTo || userDateFrom;
      const today = new Date(); today.setHours(0,0,0,0);
      const far   = new Date(farStr + "T00:00:00");
      const days  = Number.isNaN(far.getTime()) ? 90 : Math.max(14, Math.ceil((far - today) / 86400000) + 7);
      params.set("sale_date_in_days", String(Math.min(days, 180)));
    } else {
      params.set("sale_date_in_days", "60"); // default: no user date selected
    }
  }
  // Сортировку API /cars не поддерживает (подтверждено докой) — глобальная
  // сортировка выполняется поиском по локальной базе (searchFromDb); в live-
  // фоллбеке страницу сортирует клиентский sortItems().
  params.set("page", query.get("page") || "1");
  params.set("per_page", query.get("per_page") || query.get("limit") || "50");
  params.set("simple_paginate", "0");
  const status = params.get("status");
  const wantsPast = tab === "archived" || tab === "sold" || status === "6" || status === "8";
  // exclude_expired_auctions=0 for all live tabs: the API's definition of "expired"
  // excludes lots whose auction time passed today (e.g. 01:00 lots by afternoon).
  // We want those to still appear in the main view — our statusId filter handles
  // removing actually-sold lots (6/8) instead.
  params.set("exclude_expired_auctions", "0");
  params.set("prices_history", "1");
  return params;
}

async function fetchJson(url){
  const key = process.env.AUCTIONS_API_KEY;
  if(!key){
    const error = new Error("AUCTIONS_API_KEY is not configured");
    error.status = 500;
    throw error;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try{
    response = await fetch(url, {
      headers:{"x-api-key":key,"accept":"application/json"},
      signal:controller.signal
    });
  }catch(e){
    const error = new Error(e.name === "AbortError" ? "Сервис аукционов не отвечает (таймаут)" : "Ошибка соединения с AuctionsAPI");
    error.status = 502;
    throw error;
  }finally{ clearTimeout(timer); }
  const payload = await response.json().catch(() => null);
  if(!response.ok || payload?.error){
    const error = new Error(payload?.message || payload?.error || "Auctions API request failed");
    error.status = response.status;
    error.apiUrl = url.replace(key, "***");
    throw error;
  }
  return payload;
}

// ── Eridan API (Copart supplement) ───────────────────────────────────────
// Auth: ERIDAN_TOKEN (static API token, preferred) OR ERIDAN_USERNAME +
// ERIDAN_PASSWORD (token is then obtained via /auth/login/ and cached).
// Covers only Copart lots.
const ERIDAN_BASE = "https://eridan-catalog.com/api";
let eridanMem = {token:null, expiry:0};

function eridanConfigured(){
  return Boolean(process.env.ERIDAN_TOKEN || (process.env.ERIDAN_USERNAME && process.env.ERIDAN_PASSWORD));
}

async function getEridanToken(){
  if(process.env.ERIDAN_TOKEN) return process.env.ERIDAN_TOKEN;
  if(eridanMem.token && Date.now() < eridanMem.expiry) return eridanMem.token;
  try{
    const cached = await getDbCache("eridan:token");
    if(cached && cached.token && new Date(cached.expiry) > new Date()){
      eridanMem = {token:cached.token, expiry:new Date(cached.expiry).getTime()};
      return eridanMem.token;
    }
  }catch(_){}
  const user = process.env.ERIDAN_USERNAME;
  const pass = process.env.ERIDAN_PASSWORD;
  if(!user || !pass){
    const err = new Error("Eridan auth is not configured (ERIDAN_TOKEN or ERIDAN_USERNAME/ERIDAN_PASSWORD)");
    err.status = 500;
    throw err;
  }
  const res = await fetch(`${ERIDAN_BASE}/auth/login/`, {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({username:user, password:pass})
  });
  const data = await res.json().catch(() => null);
  if(!res.ok || !data?.token){
    const err = new Error(data?.detail || "Eridan auth failed");
    err.status = 502;
    throw err;
  }
  const expiry = new Date(Date.now() + 23 * 60 * 60 * 1000);
  eridanMem = {token:data.token, expiry:expiry.getTime()};
  setDbCache("eridan:token", {token:data.token, expiry:expiry.toISOString()}, "_default").catch(() => {});
  return data.token;
}

async function eridanFetch(path, token){
  // The API schema declares bearer auth, but Django-style backends usually
  // expect the "Token" prefix — try Token first, then Bearer on 401.
  let res;
  for(const prefix of ["Token", "Bearer"]){
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try{
      res = await fetch(`${ERIDAN_BASE}${path}`, {
        headers:{"Authorization":`${prefix} ${token}`, "Accept":"application/json"},
        signal:controller.signal
      });
    }catch(e){
      const err = new Error(e.name === "AbortError" ? "Eridan timeout" : "Eridan connection error");
      err.status = 502;
      throw err;
    }finally{ clearTimeout(timer); }
    if(res.status !== 401) break;
  }
  if(res.status === 401){
    eridanMem = {token:null, expiry:0};
    const err = new Error("Eridan token expired");
    err.status = 401;
    throw err;
  }
  const json = await res.json().catch(() => null);
  if(!res.ok){
    const err = new Error(json?.detail || "Eridan API error");
    err.status = res.status;
    throw err;
  }
  return json;
}

function normalizeEridanLot(item){
  const lotId = String(item.lot_id || item.id || "");
  const make = item.make?.name || "";
  const model = item.model?.name || "";
  const year = Number(item.year) || 0;
  const title = item.name || [year, make, model].filter(Boolean).join(" ") || "Автомобиль";
  const city = item.city?.name || "";
  const state = item.state?.code || item.state?.name || "";
  const location = [city, state].filter(Boolean).join(", ");
  const odometer = Math.round(Number(item.odometer) || 0);
  const primaryDamage = item.primary_damage?.name || "";
  const secondaryDamage = item.secondary_damage?.name || "";
  const currentBid = Math.round(Number(item.current_bid) || 0);
  const buyNow = Math.round(Number(item.buy_now_price) || 0);
  const engineSize = Number(item.engine_type?.size) || 0;
  const engineDisplay = item.engine_type?.display_name || (engineSize > 0 ? `${engineSize.toFixed(1)}L` : "");
  const cylinders = Number(item.engine_type?.cylinders) > 0 ? String(item.engine_type.cylinders) : "";
  const hasKeys = item.has_keys;
  const keysStr = hasKeys === "YES" || hasKeys === true ? "Да"
    : hasKeys === "NO" || hasKeys === false ? "Нет"
    : String(hasKeys || "");
  const images = [
    ...(item.high_res_images || []),
    ...(item.full_images    || []),
    ...(item.thumbnail_images || [])
  ].filter((v, i, a) => v && typeof v === "string" && a.indexOf(v) === i);

  return {
    id:`copart-${lotId}`,
    auction:"copart",
    title,
    year,
    make,
    model,
    makeId:item.make?.id || null,
    modelId:item.model?.id || null,
    generationId:null,
    engineId:null,
    vin:item.vin || "",
    lot:lotId,
    url:item.url || (lotId ? `https://www.copart.com/lot/${lotId}` : ""),
    location,
    auctionDate:item.sale_date || "",
    currentBid,
    finalBid:item.is_sold ? currentBid : 0,
    buyNow,
    odometer,
    odometerKm:0,
    odometerText:odometer ? `${odometer.toLocaleString("en-US")} mi` : "",
    odometerStatus:item.odometer_status?.name || "",
    primaryDamage,
    secondaryDamage,
    damage:[primaryDamage, secondaryDamage].filter(Boolean).join(" / "),
    document:item.document?.title || "",
    titleStatus:item.document?.title || "",
    saleType:"",
    fuel:item.fuel_type?.name || "",
    engine:engineDisplay,
    transmission:item.transmission_type?.name || "",
    drive:driveLabel(item.drive_type?.name),
    body:item.body_style?.name || item.vehicle_type?.name || "",
    cylinders,
    color:item.color?.name || "",
    keys:keysStr,
    video:"",
    estimatedRetailValue:Math.round(Number(item.est_retail_value) || 0),
    preAccidentPrice:0,
    cleanWholesalePrice:0,
    seller:"",
    sellerType:"",
    condition:item.highlight?.title || "",
    priceHistory:[],
    photoCount:images.length,
    lotStatus:item.is_sold ? "sold" : "live",
    statusName:item.is_sold ? "Sold" : "Live",
    statusId:item.is_sold ? 6 : null,
    saleStatus:"",
    saleStatusKey:"",
    timed:false,
    images,
    image:images[0] || item.thumb || ""
  };
}

async function fetchEridanSearch(query){
  let token = await getEridanToken();

  const buildEridanParams = () => {
    const p = new URLSearchParams();
    const make = query.get("make");
    if(make && !/^\d/.test(make)) p.set("make__name", make);
    const model = query.get("model");
    if(model && !/^\d/.test(model)) p.set("model__name", model);
    const yearFrom = query.get("yearFrom"); if(yearFrom) p.set("year_from", yearFrom);
    const yearTo   = query.get("yearTo");   if(yearTo)   p.set("year_to",   yearTo);
    const mileFrom = query.get("mileageFrom"); if(mileFrom) p.set("odometer_from", mileFrom);
    const mileTo   = query.get("mileageTo");   if(mileTo)   p.set("odometer_to",   mileTo);
    const fuel     = query.get("fuel");        if(fuel)     p.set("fuel_type__name", fuel);
    p.set("page", query.get("page") || "1");
    const sortMap = {
      soon:"sale_date", date_asc:"sale_date", date_desc:"-sale_date",
      year_asc:"year",  year_desc:"-year",
      mileage_asc:"odometer", mileage_desc:"-odometer"
    };
    const ordering = sortMap[query.get("sort") || "soon"];
    if(ordering) p.set("ordering", ordering);
    return p;
  };

  const doSearch = async (tok) => {
    const data = await eridanFetch(`/copart/lots/?${buildEridanParams()}`, tok);
    const tab = query.get("tab") || "all";
    const wantsPast = tab === "sold" || tab === "archived";
    const results = Array.isArray(data.results) ? data.results : [];
    const items = results
      .map(normalizeEridanLot)
      .filter(lot => wantsPast ? String(lot.statusId) === "6" : String(lot.statusId) !== "6")
      .filter(lot => !wantsPast || !(Date.parse(lot.auctionDate || "") > Date.now()));
    return {
      items,
      total:data.count || items.length,
      shown:items.length,
      page:Number(query.get("page") || 1),
      perPage:50,
      hasMore:Boolean(data.next),
      _source:"eridan"
    };
  };

  try{
    return await doSearch(token);
  }catch(e){
    if(e.status === 401){
      eridanMem = {token:null, expiry:0};
      token = await getEridanToken();
      return await doSearch(token);
    }
    throw e;
  }
}
// ── end Eridan ────────────────────────────────────────────────────────────

async function fetchSearch(query){
  const rawAuction = String(query.get("auction") || "").toLowerCase();
  const isAll = rawAuction === "all" || rawAuction === "both" || rawAuction === "";
  const auction = normalizeAuction(query.get("auction"));
  const params = buildSearchParams(query);
  const domain = auctionsApiDomain(auction);
  // "all" → omit domain_id so Copart (3) + IAAI (1) come together (domain_id
  // does not accept a CSV). Encar/Korea (12) is filtered out below.
  if(!isAll) params.set("domain_id", auctionsApiDomainId(auction));
  // Платный ключ: /cars отдаёт до 1000 записей на страницу (проверено live —
  // per_page=1000 возвращает ровно 1000; демо-лимит 50 к нам не относится).
  // Синк уже тянет 1000/стр, живой фолбэк держим таким же потолком.
  const API_MAX_PER_PAGE = 1000;
  const requestedPerPage = safeNumber(params.get("per_page")) || 50;
  params.set("per_page", String(Math.min(requestedPerPage, API_MAX_PER_PAGE)));
  const isEncar = it => { const d = it && it.domain; const id = d && d.id; const nm = String((d && d.name) || d || "").toLowerCase(); return id === 12 || nm.includes("encar") || nm.includes("korea"); };
  const perPage = safeNumber(query.get("per_page") || query.get("limit") || 50) || 50;

  const run = async () => {
    const attempts = isAll
      ? [`${AUCTIONS_API_BASE}/cars?${params}`]
      : [
          `${AUCTIONS_API_BASE}/cars?${params}`,
          `${AUCTIONS_API_BASE}/cars?${new URLSearchParams({...Object.fromEntries(params), domain})}`
        ];
    const normalizeItems = payload => {
      const tab = query.get("tab") || "all";
      const wantsPast = tab === "archived" || tab === "sold";
      return findItems(payload)
        .filter(item => !isAll || !isEncar(item))
        .map(item => normalizeLot(item, isAll ? (item?.domain || auction) : auction))
        // For live tabs strip definitively sold/unsold lots (status 6/8).
        // Don't filter by past auction date — recently ended lots may not have
        // status 6/8 yet (feed lag). sortItems("soon") puts future lots first,
        // recently ended ones at the bottom — same as bid.cars behavior.
        .filter(lot => wantsPast || (String(lot.statusId) !== "6" && String(lot.statusId) !== "8"))
        // Архив = только состоявшиеся торги: лот с будущей датой (фид помечает его sold с пред-ставкой) — не архив.
        .filter(lot => !wantsPast || !(Date.parse(lot.auctionDate || "") > Date.now()))
        // Timed-фильтр: /cars не умеет auction_type — дофильтровываем сами
        // (окно next_hours=30ч сужено в buildSearchParams — timed-торги идут ежедневно)
        .filter(lot => { const sl = parseSaleList(query); return !sl.length || sl.some(x => x === "timed" ? lot.timed : x === "on_approval" ? Number(lot.statusId) === 4 : lot.saleStatusKey === x); })
        // Мультивыбор повреждений (live): фид принимает одно значение (первое), остальные — ИЛИ здесь
        .filter(lot => {
          const t = damageTerms(query.get("damage"));
          if(t.length < 2) return true;
          const d = String(lot.damage || "").toLowerCase();
          return t.some(x => d.includes(x.toLowerCase()));
        })
        // Объём двигателя (live): фид не фильтрует по нему — читаем литры из строки двигателя
        .filter(lot => {
          const eng = parseEngineRange(query);
          if(eng.from == null && eng.to == null) return true;
          const l = engineLitersOf(lot.engine);
          return l > 0 && (eng.from == null || l >= eng.from) && (eng.to == null || l <= eng.to);
        })
        // Мультивыбор моделей (live): фид принимает одну — остальные отсекаем здесь
        .filter(lot => {
          const ids = String(query.get("model") || "").split(",").filter(x => /^\d+$/.test(x));
          return ids.length < 2 || ids.includes(String(lot.modelId));
        })
        // Мультивыбор топлива (live): список id → фильтр по нормализованному fuel
        .filter(lot => {
          const ids = String(query.get("fuel") || "").split(",").filter(x => /^\d+$/.test(x));
          if(ids.length < 2) return true;
          const T = {1:"diesel", 2:"electric", 3:"hybrid", 4:"gasoline"};
          const f = String(lot.fuel || "").toLowerCase();
          return ids.some(id => T[id] && f.includes(T[id]));
        });
    };

    // API /cars не сортирует ВООБЩЕ: сортировка одной страницы из 50 лотов
    // давала кашу («Год 9-1» начинался с 2024 при живых 2026-х). При явных
    // пользовательских сортировках собираем пул из нескольких страниц API
    // параллельно и сортируем его целиком (в handler) — первые страницы
    // выглядят честно. Юзер-страница p = окно API-страниц (p-1)*POOL+1..p*POOL.
    const sortParam = String(query.get("sort") || "soon");
    // Дата-сортировки НЕ пулим: POOL тянет live-API без окна «только актуальные»
    // и подмешивает прошедшие проданные лоты, которые date_asc ставит наверх.
    // Дата идёт через searchFromDb (окно + сортировка по всей базе).
    const POOL_SORTS = new Set(["year_desc","year_asc","mileage_asc","mileage_desc","price_asc","price_desc","buy_now_asc","buy_now_desc"]);
    const POOL_PAGES = 5;
    const userPage = safeNumber(query.get("page")) || 1;

    const runPooled = async () => {
      const startPage = (userPage - 1) * POOL_PAGES + 1;
      const payloads = await Promise.all(Array.from({length:POOL_PAGES}, (_, i) => {
        const p = new URLSearchParams(params);
        p.set("page", String(startPage + i));
        return fetchJson(`${AUCTIONS_API_BASE}/cars?${p}`).catch(() => null);
      }));
      const got = payloads.filter(Boolean);
      if(!got.length) throw new Error("Auctions search failed");
      const items = got.flatMap(normalizeItems);
      const total = safeNumber(got[0]?.total || got[0]?.count || got[0]?.data?.total || got[0]?.data?.count || got[0]?.meta?.total);
      const apiPerPage = safeNumber(params.get("per_page")) || 50;
      return {
        items, total, shown:items.length,
        page:userPage, perPage:POOL_PAGES * apiPerPage,
        hasMore:total ? userPage * POOL_PAGES * apiPerPage < total : items.length >= POOL_PAGES * apiPerPage - 5,
        endpoint:"pooled"
      };
    };

    if(POOL_SORTS.has(sortParam)) return runPooled();

    let lastError, lastEndpoint = attempts[0];
    for(const url of attempts){
      try{
        lastEndpoint = url;
        const payload = await fetchJson(url);
        const items = normalizeItems(payload);
        const total = safeNumber(payload?.total || payload?.count || payload?.data?.total || payload?.data?.count || payload?.meta?.total);
        return {
          items, total, shown:items.length,
          page:safeNumber(query.get("page")) || 1, perPage,
          hasMore:total ? (safeNumber(query.get("page")) || 1) * perPage < total : items.length >= perPage
        };
      }catch(error){ lastError = error; }
    }
    throw lastError || new Error("Auctions search failed");
  };

  // Safety net: if our injected date filter yields nothing (e.g. the feed has no
  // recently-dated lots), retry once without it so the catalog is never empty.
  const userDate = query.get("daysAhead") || query.get("auctionDateFrom") || query.get("auctionDateTo") || query.get("nextHours");
  const injectedDate = !userDate && params.get("sale_date_in_days");

  // Eridan: Copart-only supplement. Start in parallel with primary for live tabs.
  const tab = query.get("tab") || "all";
  const canUseEridan = eridanConfigured() && tab !== "sold" && tab !== "archived";
  const eridanPromise = canUseEridan
    ? fetchEridanSearch(query).catch(() => null)
    : Promise.resolve(null);

  let result;
  try {
    result = await run();
    if(!result.items.length && injectedDate){
      params.delete("sale_date_in_days");
      result = await run();
      result._fallback = true;
    }
  } catch(primaryErr) {
    // Primary failed — use Eridan as sole source if available
    const eridanResult = await eridanPromise;
    if(eridanResult){ return eridanResult; }
    throw primaryErr;
  }

  // Primary succeeded — merge unique Eridan lots (dedupe by id)
  if(canUseEridan){
    const eridanResult = await eridanPromise;
    if(eridanResult && eridanResult.items && eridanResult.items.length){
      const seen = new Set(result.items.map(l => l.id));
      const fresh = eridanResult.items.filter(l => !seen.has(l.id));
      if(fresh.length) result.items = [...result.items, ...fresh];
    }
  }

  return result;
}

async function fetchDetail(query){
  const auction = normalizeAuction(query.get("auction"));
  const lot = String(query.get("lot") || "").replace(/[^\w-]/g, "");
  if(!lot){
    const error = new Error("Missing lot");
    error.status = 400;
    throw error;
  }

  const params = new URLSearchParams({prices_history:"1"});
  const domains = [auctionsApiDomain(auction), auction];
  let lastError;
  for(const domain of domains){
    try{
      const payload = await fetchJson(`${AUCTIONS_API_BASE}/search-lot/${encodeURIComponent(lot)}/${domain}?${params}`);
      return normalizeLot(payload, auction);
    }catch(error){
      lastError = error;
    }
  }
  throw lastError || new Error("Lot detail failed");
}

// История продаж ПО VIN: у перевыставленной машины каждый заход на аукцион — новый номер лота, и
// /search-lot видит только историю текущего номера (Volvo XC60 69432156: «ранее не продавалась», хотя
// под лотом 62957656 продана 25.08 за $7 600). /search-vin отдаёт все заходы — сливаем их в priceHistory.
// Timed-раунд по времени закрытия: живые торги Copart/IAAI назначены на :00/:15/:30/:45 без секунд, а Timed
// закрывается в произвольную минуту («28 авг., 20:32:16»). Флаг is_timed_auction у фида есть только у ТЕКУЩЕГО
// захода, по прошлым раундам он не сохраняется — поэтому для истории признак выводим из времени.
function looksTimed(dateStr){
  const d = new Date(dateStr || "");
  if(Number.isNaN(d.getTime())) return false;
  return d.getUTCSeconds() !== 0 || d.getUTCMinutes() % 15 !== 0;
}
// ---- Надёжность истории по VIN: повтор запроса + постоянное хранилище (vin_hist) как запасной источник ----
async function fetchJsonRetry(url, tries = 2){
  let err;
  for(let i = 0; i < tries; i++){
    try{ return await fetchJson(url); }
    catch(e){ err = e; if(e && (e.status === 404 || e.status === 400)) throw e; if(i < tries - 1) await new Promise(r => setTimeout(r, 400)); }
  }
  throw err;
}
const vinStoreThrottle = new Map();
const vinFailStat = {fail:0, fallback:0, ok:0, since:Date.now()};
function compactVinEntries(list){
  return (Array.isArray(list) ? list : []).slice(0, 80).map(e => {
    const o = {date:e.date, bid:e.bid || 0, status:e.status, lot:e.lot || "", auction:e.auction || ""};
    if(e.buyNow) o.buyNow = e.buyNow;
    if(e.timed) o.timed = true;
    if(e.noPrice) o.noPrice = true;
    if(e.prebid) o.prebid = e.prebid;
    return o;
  });
}
async function saveVinHist(vin, entries, latest){
  const last = vinStoreThrottle.get(vin);
  if(last && Date.now() - last < 10 * 60e3) return;
  vinStoreThrottle.set(vin, Date.now()); if(vinStoreThrottle.size > 5000) vinStoreThrottle.clear();
  try{
    const list = compactVinEntries(entries);
    await syncSbFetch(`/vin_hist?on_conflict=vin`, {method:"POST", headers:{prefer:"resolution=merge-duplicates,return=minimal"},
      body:JSON.stringify({vin, entries:list, latest:latest || null, sold_n:list.filter(e => e.status === "sold").length, rounds_n:list.length, checked_at:new Date().toISOString()})});
  }catch(_){}
}
async function loadVinHist(vin, maxAgeMs){
  try{
    const rows = await syncSbFetch(`/vin_hist?vin=eq.${encodeURIComponent(vin)}&select=entries,latest,checked_at&limit=1`);
    const r = rows && rows[0];
    if(!r || (maxAgeMs && Date.now() - Date.parse(r.checked_at) > maxAgeMs)) return null;
    return r;
  }catch(_){ return null; }
}

async function attachVinHistory(lot){
  try{
    if(!lot || !isValidVin(String(lot.vin || ""))) return lot;
    const params = new URLSearchParams({prices_history:"1"});
    const payload = await fetchJsonRetry(`${AUCTIONS_API_BASE}/search-vin/${encodeURIComponent(lot.vin)}?${params}`);
    const lotsArr = Array.isArray(payload?.lots) ? payload.lots : Array.isArray(payload?.data?.lots) ? payload.data.lots : [];
    // История ТОЛЬКО по VIN (правило Федора 22.09.2026): номер лота — не идентификатор машины (один номер
    // может быть у разных машин на Copart и IAAI), поэтому историю текущего номера НЕ используем —
    // берём всё, что фид знает по этому VIN, включая текущий заход, и пересобираем с нуля.
    const entries = [];
    const curDay = String(lot.auctionDate || "").slice(0, 10);
    // Диагностика (detail&debug=1): сырые заходы и раунды по VIN — чтобы видеть, что именно отдаёт фид.
    attachVinHistory.lastRaw = lotsArr.slice(0, 6).map(l => ({lot:l?.lot, sale_date:l?.sale_date, status:safeName(l?.status), final_bid:l?.final_bid, bid:l?.bid, timed:l?.is_timed_auction,
      prices:(Array.isArray(l?.prices) ? l.prices : []).slice(0, 8).map(p => ({sale_date:p?.sale_date, status:safeName(p?.status), bid:p?.bid, buy_now:p?.buy_now_price}))}));
    for(const l of lotsArr){
      const lotNo = String(l?.lot || l?.lot_number || l?.external_id || "").replace(/~.*/, "");
      const dom = normalizeAuction(l?.domain || payload?.domain || lot.auction);
      const st = safeName(l?.status).toLowerCase();
      const sid = Number(enumIdOf(l?.status));
      const fb = safeNumber(l?.final_bid || l?.winning_bid);
      const sd = l?.sale_date || l?.auction_date || "";
      const past = sd && Date.parse(sd) < Date.now();
      const soldReal = past && fb > 0 && (sid === 6 || (/sold/.test(st) && !/not/.test(st)));
      // Timed-раунд по данным фида: флаг на заходе (lot) или на записи цены.
      const lotTimed = l?.is_timed_auction === true || /timed/i.test(String(l?.auction_type || l?.sale_type || ""));
      if(soldReal) entries.push({bid:fb, buyNow:0, date:new Date(sd).toISOString(), status:"sold", lot:lotNo, auction:dom, timed:lotTimed});
      // Продан без указанной цены (фид: status sold, final_bid пуст, дата прошла — Tesla 58144806, прошлый заход 92059535).
      // Считаем продажей, только если ПОЗЖЕ тот же VIN выставили под другим номером лота (перепродажа). Цену не выдумываем.
      if(!soldReal && past && !(fb > 0) && (sid === 6 || (/sold/.test(st) && !/not/.test(st))) && lotNo !== String(lot.lot || "")){
        const sdMs = Date.parse(sd);
        const firstOf = o => { const ds = [o?.sale_date, ...(Array.isArray(o?.prices) ? o.prices.map(x => x?.sale_date) : [])].map(x => Date.parse(x || "")).filter(Number.isFinite); return ds.length ? Math.min(...ds) : NaN; };
        const later = lotsArr.some(o => String(o?.lot || o?.lot_number || o?.external_id || "").replace(/~.*/, "") !== lotNo && firstOf(o) > sdMs);
        if(later) entries.push({bid:0, buyNow:0, date:new Date(sd).toISOString(), status:"sold", lot:lotNo, auction:dom, timed:lotTimed, noPrice:true});
      }
      for(const p of (Array.isArray(l?.prices) ? l.prices : [])){
        const pd = p?.sale_date || ""; const pb = safeNumber(p?.bid || p?.final_bid || p?.current_bid);
        const noBidRound = !(pb > 0) && /not_sold/.test(safeName(p?.status).toLowerCase());
        if(!((pb > 0 || noBidRound) && pd && Date.parse(pd) < Date.now())) continue;
        if(p && typeof p === "object" && !attachVinHistory.rawKeys) attachVinHistory.rawKeys = {price:Object.keys(p), lot:Object.keys(l || {})};
        const pst = safeName(p?.status).toLowerCase() || st;
        const ptimed = p?.is_timed_auction === true || p?.timed === true || /timed/i.test(String(p?.auction_type || p?.sale_type || p?.type || "")) || (lotTimed && String(pd).slice(0, 10) === curDay) || looksTimed(pd);
        // пред-ставки текущих торгов (тот же день) — не история
        const cur = String(pd).slice(0, 10) === curDay;
        entries.push({bid:pb, buyNow:0, date:new Date(pd).toISOString(), status:pst, lot:lotNo, auction:dom, current:cur, timed:ptimed});
      }
    }
    try{ Object.defineProperty(lot, "_vinOk", {value:true, enumerable:false, configurable:true}); }catch(_){}   // запрос к фиду прошёл (отличаем «VIN не найден» от сбоя)
    lot.vinChecked = true;   // клиент: история по VIN проверена (иначе — не утверждаем «единственная продажа»)
    if(!lotsArr.length) return lot;   // VIN не найден — оставляем как есть
    // «не продан» за копейки (перенос без ставок) — не история
    const erv = Number(lot.estimatedRetailValue) || 0, cap = Math.max(300, erv * 0.02);
    const seen = new Set();
    const bn = Number(lot.buyNow) || 0;
    const absurd = e => /not_sold/.test(e.status) && ((erv > 1 && e.bid > erv * 1.15) || (bn > 0 && e.bid > bn * 1.5));
    lot.priceHistory = entries
      // Копеечный пребид ($100 у Volvo 06.08) — это не ставка, но сам раунд был: показываем как «не продан · без ставок» (как DreamBid).
      .map(e => (/not_sold/.test(e.status) && e.bid > 0 && e.bid < cap) ? {...e, bid:0, prebid:e.bid} : e)
      .filter(e => !absurd(e))
      // одна продажа, отданная и «заходом», и «раундом» на соседний день — одна запись
      .filter((e, i, arr) => !(e.status === "sold" && arr.some((o, j) => j < i && o.status === "sold" && o.lot === e.lot && o.bid === e.bid && Math.abs(Date.parse(o.date) - Date.parse(e.date)) < 3 * 864e5)))
      .filter(e => { const k = e.date.slice(0, 10) + "|" + e.lot + "|" + e.status; if(seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => a.date < b.date ? 1 : -1);
    // Актуальный заход по VIN: самая поздняя запись, которая ещё не сыграла (или только что сыграла) и НЕ продана — не зависит от лота, храним в vin_hist.
    let latest = null;
    for(const l of lotsArr){
      const no = String(l?.lot || l?.lot_number || l?.external_id || "").replace(/~.*/, "");
      const sd = Date.parse(l?.sale_date || l?.auction_date || "");
      if(!no || !Number.isFinite(sd) || sd < Date.now() - 12 * 3600e3) continue;
      if((Number(enumIdOf(l?.status)) === 6 || (/sold/.test(safeName(l?.status).toLowerCase()) && !/not/.test(safeName(l?.status).toLowerCase()))) && safeNumber(l?.final_bid || l?.winning_bid) > 0 && sd < Date.now()) continue;
      if(!latest || sd > latest.ms) latest = {ms:sd, lot:no, auction:normalizeAuction(l?.domain || payload?.domain || lot.auction), date:new Date(sd).toISOString(), bid:safeNumber(l?.bid || l?.current_bid)};
    }
    if(latest){ latest = {lot:latest.lot, auction:latest.auction, date:latest.date, bid:latest.bid}; }
    lot.relisted = undefined; delete lot.relisted;
    { const rel = relistedFor(lot, latest); if(rel) lot.relisted = rel; }
    saveVinHist(lot.vin, lot.priceHistory, latest);
    vinFailStat.ok++;
    // Финал — только если ТЕКУЩИЙ заход реально продан (прошедшая дата + статус) — по VIN-данным
    const curEntry = lotsArr.find(l => String(l?.lot || l?.lot_number || "").replace(/~.*/, "") === String(lot.lot));
    if(curEntry){
      const sid = Number(enumIdOf(curEntry.status)), fb = safeNumber(curEntry.final_bid || curEntry.winning_bid);
      const sd = curEntry.sale_date || curEntry.auction_date || "";
      const sold = sid === 6 && fb > 0 && sd && Date.parse(sd) < Date.now();
      lot.finalBid = sold ? fb : 0;
    }
  }catch(e){
    if(lot && isValidVin(String(lot.vin || ""))){
      if(e && e.status === 404){ lot.vinChecked = true; }                 // фид не знает этот VIN — истории нет, это не сбой
      else{
        vinFailStat.fail++;
        // Запасной источник: последняя удачная история этого VIN из нашей базы (до 14 дней)
        const st = await loadVinHist(String(lot.vin).toUpperCase(), 14 * 864e5);
        if(st && Array.isArray(st.entries)){
          const curDay = String(lot.auctionDate || "").slice(0, 10);
          lot.priceHistory = st.entries.map(x => ({...x, ...(String(x.date).slice(0, 10) === curDay ? {current:true} : {})}));
          const rel = relistedFor(lot, st.latest); if(rel) lot.relisted = rel;
          lot.vinChecked = true; lot.vinStale = st.checked_at;
          vinFailStat.fallback++;
        }else lot.vinChecked = false;   // ни фид, ни запас — честно скажем «недоступно»
      }
    }
  }
  return lot;
}
function relistedFor(lot, latest){
  if(!latest || !latest.lot || String(latest.lot) === String(lot.lot)) return null;
  const ownMs = Date.parse(lot.auctionDate || "");
  return !Number.isFinite(ownMs) || Date.parse(latest.date) > ownMs ? {lot:latest.lot, auction:latest.auction, date:latest.date, bid:latest.bid} : null;
}
function enumIdOf(v){ return (v && typeof v === "object" && v.id != null) ? Number(v.id) : (typeof v === "number" ? v : null); }
async function fetchVin(query){
  const vin = String(query.get("vin") || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  // Строгая проверка VIN и на сервере (17 символов, без I/O/Q) — defense-in-depth
  // к клиентской проверке в openVinReport. P2-4.
  if(!isValidVin(vin)){
    const error = new Error("VIN должен содержать 17 символов, без букв I, O, Q");
    error.status = 400;
    throw error;
  }
  const params = new URLSearchParams({prices_history:"1"});
  const payload = await fetchJson(`${AUCTIONS_API_BASE}/search-vin/${encodeURIComponent(vin)}?${params}`);
  return normalizeLot(payload, normalizeAuction(payload?.domain || payload?.data?.domain || payload?.auction));
}

async function handleDebug(query, response){
  const auction = normalizeAuction(query.get("auction"));
  const searchParams = buildSearchParams(query);
  searchParams.set("domain_id", auctionsApiDomainId(auction));
  const endpoint = `${AUCTIONS_API_BASE}/cars?${searchParams}`;
  const debug = {
    ok:true,
    hasAuctionsApiKey:Boolean(process.env.AUCTIONS_API_KEY),
    endpoint,
    page:searchParams.get("page"),
    per_page:searchParams.get("per_page"),
    source:"real-api",
    returned:0,
    error:null
  };

  if(!process.env.AUCTIONS_API_KEY){
    debug.source = "none";
    debug.error = "AUCTIONS_API_KEY is not configured";
    sendJson(response, 200, debug);
    return;
  }

  try{
    const payload = await fetchJson(endpoint);
    debug.returned = findItems(payload).length;
    debug.total = safeNumber(payload?.total || payload?.count || payload?.data?.total || payload?.data?.count || payload?.meta?.total);
    sendJson(response, 200, debug);
  }catch(error){
    debug.error = error.message || "Auctions API request failed";
    sendJson(response, 200, debug);
  }
}

// «Рекомендованные» (дефолт каталога): качественные лоты наверх — страховые
// и банковские продавцы, чистая история, ключи, живые повреждения и документы.
// Перекупы-дилеры с многократными перепостановками уходят вниз.
function lotQualityScore(l, todayStart){
  let s = 0;
  const st = String(l.sellerType || "").toLowerCase();
  const seller = String(l.seller || "");
  if(/insurance/.test(st) || /Страховая/.test(seller)) s += 30;
  else if(/financ|credit|bank/.test(st)) s += 22;
  else if(/fleet|lease|rental/.test(st)) s += 18;
  else if(seller) s += 6; // известный продавец лучше «Неизвестен»
  const hist = (l.priceHistory || []).filter(h => !h.current);
  if(!hist.length) s += 14;
  else{
    if(hist.some(h => { const t = String(h.status || "").toLowerCase(); return t.includes("sold") && !t.includes("not"); })) s -= 25;
    s -= Math.min(12, hist.length * 3);
  }
  if(l.keys === "Да") s += 8;
  else if(l.keys === "Нет") s -= 6;
  const doc = String(l.document || "").toLowerCase();
  if(/bill of sale|acq|parts only|junk|non.?repair|destruction/.test(doc)) s -= 15;
  const dmg = String(l.damage || "").toLowerCase();
  if(/burn|fire|water|flood|roll ?over/.test(dmg)) s -= 20;
  else if(/minor|dent|scratch|normal wear|hail/.test(dmg)) s += 8;
  const cond = String(l.condition || "").toLowerCase();
  if(/run/.test(cond)) s += 6;
  else if(/engine.?start/.test(cond)) s += 2;
  else if(/not.?run|stationar|dismantl/.test(cond)) s -= 12;
  if(!l.photoCount) s -= 10;
  // Год: свежие машины выше (2020+ ≈ +20, 2017 ≈ +8, 2015 = 0, старше 2012 ≈ −15).
  // Без этого «Рекомендованные» поднимали 2004 Civic из-за страхового продавца.
  const yr = Number(l.year) || 0;
  if(yr) s += Math.max(-15, Math.min(20, (yr - 2015) * 4));
  // Спецтехника/лодки/прицепы идут без полного VIN — в рекомендациях не нужны
  if(String(l.vin || "").length < 17) s -= 25;
  // Прошедшие торги без Buy Now в рекомендациях не нужны
  const t = l.auctionDate ? new Date(l.auctionDate).getTime() : NaN;
  if(!Number.isNaN(t) && t < todayStart && !(l.buyNow > 0)) s -= 60;
  return s;
}

function sortItems(items, sort, {pastTab = false} = {}){
  const list = [...items];
  if(sort === "smart" && pastTab) return sortItems(list, "date_desc");
  if(sort === "smart"){
    const soon = sortItems(list, "soon");
    const d = new Date(); d.setHours(0, 0, 0, 0);
    const todayStart = d.getTime();
    // Стабильно поверх «скоро торги»: внутри равного балла — ближайшие первыми
    return soon
      .map((l, i) => ({l, i, s:lotQualityScore(l, todayStart)}))
      .sort((a, b) => (b.s - a.s) || (a.i - b.i))
      .map(x => x.l);
  }
  // «Дата 1-9» = ближайшие БУДУЩИЕ торги первыми, прошедшие/проданные в конце
  // (как DreamBid Date 1-9). Чистое возрастание ставило бы прошедшие наверх.
  if(sort === "date_asc")     return sortItems(list, "soon", {pastTab});
  if(sort === "date_desc")    return list.sort((a, b) => (a.auctionDate || "") > (b.auctionDate || "") ? -1 : 1);
  if(sort === "year_asc")     return list.sort((a, b) => (a.year || 0) - (b.year || 0));
  if(sort === "year_desc")    return list.sort((a, b) => (b.year || 0) - (a.year || 0));
  if(sort === "mileage_asc")  return list.sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
  if(sort === "mileage_desc") return list.sort((a, b) => (b.odometer || 0) - (a.odometer || 0));
  if(sort === "price_asc")    return list.sort((a, b) => (a.currentBid || a.buyNow || 0) - (b.currentBid || b.buyNow || 0));
  if(sort === "price_desc")   return list.sort((a, b) => (b.currentBid || b.buyNow || 0) - (a.currentBid || a.buyNow || 0));
  if(sort === "buy_now_asc")  return list.sort((a, b) => (a.buyNow || 0) - (b.buyNow || 0));
  if(sort === "buy_now_desc") return list.sort((a, b) => (b.buyNow || 0) - (a.buyNow || 0));
  // "soon": today's lots first (even if auction time passed), then future days,
  // then past days (yesterday and earlier) last. Boundary = start of today (midnight),
  // not current time — so a lot auctioned at 01:00 today still counts as "today".
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const todayStart = d.getTime();
  const ts = v => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };
  return list.sort((a, b) => {
    const ta = ts(a.auctionDate), tb = ts(b.auctionDate);
    const fa = ta !== null && ta >= todayStart, fb = tb !== null && tb >= todayStart;
    if(fa && fb) return ta - tb; // both today/future: soonest first
    if(fa) return -1;            // a is today/future, b is past: a first
    if(fb) return 1;             // b is today/future, a is past: b first
    // Buy Now lots with no date: show before past-dated lots
    const bna = ta === null && (a.buyNow || 0) > 0;
    const bnb = tb === null && (b.buyNow || 0) > 0;
    if(bna && bnb) return 0;
    if(bna) return -1;
    if(bnb) return 1;
    if(ta === null && tb === null) return 0;
    if(ta === null) return 1;    // undated (no buy_now) after past-dated
    if(tb === null) return -1;
    return tb - ta;              // both past: most recent first
  });
}

// Топливо словом → числовой id auctionsapi (как в UI-радио).
function normalizeFuelParam(query){
  const raw = String(query.get("fuel") || "").trim().toLowerCase();
  if(!raw || /^[\d,]+$/.test(raw)) return;   // id или список id («3,2» — мультивыбор)
  const map = {
    gasoline:"4", petrol:"4", gas:"4", "бензин":"4", "benzina":"4",
    diesel:"1", "дизель":"1", "motorina":"1",
    hybrid:"3", "гибрид":"3", "hibrid":"3",
    electric:"2", ev:"2", "электро":"2", "электрический":"2", "electric":"2"
  };
  if(map[raw]) query.set("fuel", map[raw]);
  else query.delete("fuel"); // неизвестное значение — просто игнорируем, не роняем запрос
}

async function handleLead(request, response){
  if(request.method !== "POST"){
    methodNotAllowed(response, ["POST"]);
    return;
  }

  const ip = getClientIp(request);
  if(!checkLeadRate(ip)){
    sendJson(response, 429, {ok:false,error:"Слишком много заявок. Подождите несколько минут и попробуйте снова."});
    return;
  }

  try{
    const body = await readBody(request);
    if(String(body.hp_website || "")){
      sendJson(response, 200, {ok:true});
      return;
    }
    const name = String(body.name || "").trim().slice(0, 120);
    const phone = String(body.phone || "").trim().slice(0, 60);
    if(!name || !phone){
      sendJson(response, 400, {ok:false,error:"Введите имя и телефон"});
      return;
    }
    // Контакт валиден, если телефон (≥8 цифр: +373/+40/+7) или Telegram (@username /
    // t.me). Мусор "aaaaa"/"00000" отсекаем — не плодим грязных клиентов. P2-3.
    if(!isValidContact(phone)){
      sendJson(response, 400, {ok:false,error:"Укажите телефон (+373…, +40…, +7…) или Telegram (@username)"});
      return;
    }

    // Источник заявки: с формы аукционов по умолчанию, но формы главной
    // (подбор / контакт) передают свой source, чтобы различать в CRM.
    const source = String(body.source || "").trim().slice(0, 40) || "Аукционы";

    // upsert by phone: creates new customer or returns existing one — no duplicate key errors
    const customer = await supabase.upsert("customers", {name, phone, status:"Новый", source}, "phone");

    const comment = String(body.comment || "").trim().slice(0, 1000);
    const vin = String(body.vin || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 17);
    const lot = String(body.lot || "").replace(/[^A-Za-z0-9_~-]/g, "").slice(0, 30);
    const auction = String(body.auction || "").replace(/[^a-zA-Z]/g, "").toLowerCase().slice(0, 10);
    // Прямая ссылка на лот на сайте — в заявку и в Telegram, чтобы менеджер
    // открывал нужную машину одним кликом.
    const lotUrl = (auction && lot) ? `https://apexauto.md/auctions/${auction}-${lot.replace(/~.*/, "")}` : "";

    const lead = await supabase.create("leads", {
      customer_id:customer?.id || null,
      title:`Заявка по лоту ${auction} ${lot}`.trim(),
      message:[
        comment,
        vin ? `VIN: ${vin}` : "",
        lot ? `LOT: ${lot}` : "",
        auction ? `Аукцион: ${auction.toUpperCase()}` : "",
        lotUrl ? `Ссылка: ${lotUrl}` : ""
      ].filter(Boolean).join("\n"),
      status:"Новый",
      source
    });

    notifyTelegram({name, phone, comment, lot, vin, auction, lotUrl}).catch(() => {});
    sendJson(response, 200, {ok:true,customer,lead});
  }catch(error){
    sendJson(response, error.status || 500, {ok:false,error:"Не удалось отправить заявку. Напишите нам в Telegram или попробуйте позже."});
  }
}

// ================= Поиск по локальной базе (Supabase api_lots) =================
// DreamBid-модель: каталог синхронизирован в Supabase (см. api/sync-lots.js),
// фильтры/сортировка/пагинация выполняются по SQL на ВСЁМ каталоге — в отличие
// от live-запросов к /cars, где API не поддерживает сортировку вовсе.

let dbReadyCache = {value:null, at:0};
async function lotsDbReady(){
  if(Date.now() - dbReadyCache.at < 60e3) return dbReadyCache.value;
  if(!sbUp()) return false; // Supabase в отключке — сразу на живой API
  try{
    const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if(!url || !key) throw new Error("no supabase env");
    const controller = new AbortController();
    // Это чтение ОДНОЙ строки по ключу — ему незачем жить на жёстком 1.5с-бюджете
    // circuit-breaker. На слабом compute (nano) весь ответ бывает ~1.7с, из-за чего
    // готовность ложно падала в false. Даём отдельный, более щедрый таймаут.
    const timer = setTimeout(() => controller.abort(), 4000);
    let r;
    try{
      r = await fetch(`${url}/rest/v1/api_sync_state?k=eq.main&select=v`, {
        headers:{apikey:key, authorization:`Bearer ${key}`},
        signal:controller.signal
      });
    }finally{ clearTimeout(timer); }
    const rows = r.ok ? await r.json() : null;
    const value = !!(rows && rows[0] && rows[0].v && rows[0].v.phase === "incr");
    lotsDbReady.last = {at:new Date().toISOString(), status:r.status, value, phase:rows && rows[0] && rows[0].v && rows[0].v.phase};
    // Отрицательный ответ держим 15с, положительный — 60с: раньше один сбой уводил инстанс в live на минуту.
    dbReadyCache = {value, at:value ? Date.now() : Date.now() - 45e3};
  }catch(e){
    lotsDbReady.last = {at:new Date().toISOString(), err:String(e && e.message || e).slice(0, 80)};
    dbReadyCache = {value:false, at:Date.now() - 45e3};
  }
  return dbReadyCache.value;
}

// Группы повреждений для фильтра: пункт меню = метка, поиск = ИЛИ по подстрокам (ilike *term*) в поле damage лота.
const DAMAGE_GROUPS = [
  {label:"Front End", terms:["front"]},
  {label:"Rear End", terms:["rear"]},
  {label:"Side", terms:["side"]},
  {label:"Minor / Normal Wear", terms:["minor dent", "normal wear", "scratches"]},
  {label:"Water / Flood", terms:["water", "flood"]},
  {label:"Burn / Fire", terms:["burn", "fire"]},
  {label:"Hail / Storm", terms:["hail", "storm"]},
  {label:"Rollover", terms:["rollover", "roll over"]},
  {label:"Undercarriage", terms:["undercarriage", "under carriage"]},
  {label:"Mechanical / Electrical", terms:["mechanical", "mech.", "electrical", "engine", "transmission", "suspension", "steering"]},
  {label:"All Over", terms:["all over"]},
  {label:"Roof / Top", terms:["roof", "top/"]},
  {label:"Frame / Structural", terms:["frame", "structural"]},
  {label:"Stripped", terms:["strip"]},
  {label:"Vandalism / Theft", terms:["vandal", "theft"]},
  {label:"Biohazard", terms:["biohazard", "bio hazard"]},
  {label:"VIN Missing / Replaced", terms:["altered vin", "replaced vin"]},
  {label:"Partial / Rejected Repair", terms:["partial repair", "rejected repair"]},
  {label:"Glass / Windows", terms:["window"]}
];
const DAMAGE_GROUP_BY_LABEL = new Map(DAMAGE_GROUPS.map(g => [g.label.toLowerCase(), g.terms]));

// «Статус продажи» — мультивыбор: no_reserve,timed,on_approval через запятую
function parseSaleList(query){
  return String(query.get("saleStatus") || "").split(",").map(x => x.trim()).filter(x => x === "timed" || x === "no_reserve" || x === "on_approval");
}

function damageTerms(raw){
  const out = [];
  for(const part of String(raw || "").split("|")){
    const label = part.trim().toLowerCase();
    if(DAMAGE_GROUP_BY_LABEL.has(label)){ out.push(...DAMAGE_GROUP_BY_LABEL.get(label)); continue; }
    const t = part.replace(/[(),*%\\]/g, " ").trim();
    if(t) out.push(t);
  }
  return [...new Set(out)].slice(0, 40);
}

function pgEscape(value){
  // Значение для PostgREST-фильтра: убираем спецсимволы синтаксиса запросов.
  return String(value).replace(/[(),*%\\]/g, " ").trim();
}

// Справочник поколений модели (годовые диапазоны) с кэшем на 6ч — для
// year-based фильтра поколения в searchFromDb.
// Своя таблица поколений (классификация DreamBid: коды кузова + годы, см.
// server/gen-table.js). Для моделей из таблицы поколение = ДИАПАЗОН ЛЕТ, а его id —
// синтетический: from*10000 + to (20192025; to=0 — выпускается). Фильтр каталога по
// такому id работает по году лота, а не по generation_id фида (тот пуст/врёт).
const GEN_TABLE = require("../server/gen-table");
const SYN_GEN_MIN = 19000000;
function parseSynGen(id){
  const n = Number(String(id || "").replace(/[^0-9]/g, ""));
  if(!(n >= SYN_GEN_MIN)) return null;
  const from = Math.floor(n / 10000), to = n % 10000;
  return from >= 1900 && from <= 2100 ? {from, to:to || 0} : null;
}
function tableGens(modelId){
  const t = GEN_TABLE[Number(String(modelId).replace(/[^0-9]/g, ""))];
  return t ? t.map(([from, to, c]) => ({id:from * 10000 + (to || 0), name:c || "", from, to:to || null})) : null;
}
const genRangeCache = new Map();
async function generationsFor(modelId){
  const tg = tableGens(modelId);
  if(tg) return tg;
  const key = String(modelId);
  const now = Date.now();
  const c = genRangeCache.get(key);
  if(c && now - c.at < 6 * 3600e3) return c.items;
  try{
    const list = await fetchJson(`${AUCTIONS_API_BASE}/generations/${key.replace(/[^0-9]/g, "")}`);
    const items = (Array.isArray(list?.data) ? list.data : []).map(m => ({
      id:m.id,
      name:m.name || "",
      from:m.from_year || m.year_from || m.start_year || null,
      to:m.to_year || m.year_to || m.end_year || null
    }));
    // Справочник API обрывается на ~2022: у самого свежего поколения to=2022 —
    // граница ДАННЫХ, а не конец кузова (Malibu IX «2015-2022» реально 2016–2025).
    // Без этого любой 2023+ авто выпадал из всех диапазонов и получал ложный
    // «новый кузов». Открываем верх у поколения с максимальным from.
    const withFrom = items.filter(x => x.from);
    if(withFrom.length){
      const newest = withFrom.reduce((a, b) => (b.from > a.from ? b : a));
      if(newest.to != null && newest.to >= 2021) newest.to = null;
    }
    genRangeCache.set(key, {items, at:now});
    return items;
  }catch(e){ return c ? c.items : []; }
}

// РЕАЛЬНЫЕ поколения (кузова) по model_id — справочник auctionsapi часто врёт или
// неполон (Fusion: только «I 2002-2012», нет 2-го кузова; NX «II» помечен 2021-2022,
// хотя AL20 идёт 2022+; Panamera «II» до 2023, хотя 972 — с 2024). Здесь зашиты
// верные границы по рынку US. `to` не указан = поколение действующее (открыто до
// текущего года). Это ПЕРЕКРЫВАЕТ справочник; для не занесённых моделей — фолбэк
// на API + синтетику. Расширяется по мере надобности.
const GEN_OVERRIDES = {
  // Toyota
  872:  [{from:2012, to:2017}, {from:2018, to:2024}, {from:2025}],   // Camry XV50→XV70→XV80
  876:  [{from:2014, to:2019}, {from:2020}],                         // Corolla E170→E210
  906:  [{from:2013, to:2018}, {from:2019, to:2025}, {from:2026}],   // RAV4 XA40→XA50→gen6(2026)
  887:  [{from:2014, to:2019}, {from:2020}],                         // Highlander XU50→XU70
  1307: [{from:2016, to:2023}, {from:2024}],                         // Tacoma N300→N400
  1390: [{from:2014, to:2021}, {from:2022}],                         // Tundra XK50→XK70
  860:  [{from:2010, to:2024}, {from:2025}],                         // 4Runner N280→N300
  902:  [{from:2016, to:2022}, {from:2023}],                         // Prius XW50→XW60
  // Honda
  350:  [{from:2013, to:2017}, {from:2018, to:2022}, {from:2023}],   // Accord 9→10→11
  354:  [{from:2016, to:2021}, {from:2022}],                         // Civic 10→11
  356:  [{from:2017, to:2022}, {from:2023}],                         // CR-V 5→6
  371:  [{from:2016, to:2022}, {from:2023}],                         // Pilot 3→4
  360:  [{from:2016, to:2022}, {from:2023}],                         // HR-V
  // Ford
  1387: [{from:2015, to:2020}, {from:2021}],                         // F-150 13→14
  323:  [{from:2013, to:2019}, {from:2020}],                         // Escape 3→4
  303:  [{from:2011, to:2019}, {from:2020}],                         // Explorer 5→6
  1904: [{from:2006, to:2012}, {from:2013, to:2020}],                // Fusion (снят 2020)
  324:  [{from:2015, to:2023}, {from:2024}],                         // Mustang S550→S650
  1436: [{from:2021}],                                               // Bronco (2021+)
  309:  [{from:2022}],                                               // Maverick (2022+)
  // Chevrolet / GMC
  1078: [{from:2018, to:2024}, {from:2025}],                         // Equinox 3→4
  1349: [{from:2014, to:2018}, {from:2019}],                         // Silverado
  150:  [{from:2015, to:2020}, {from:2021}],                         // Tahoe
  1686: [{from:2018, to:2023}, {from:2024}],                         // Traverse
  1153: [{from:2014, to:2018}, {from:2019}],                         // GMC Sierra
  // Nissan
  658:  [{from:2013, to:2018}, {from:2019}],                         // Altima 5→6
  1364: [{from:2014, to:2020}, {from:2021}],                         // Rogue 2→3
  689:  [{from:2013, to:2019}, {from:2020}],                         // Sentra 7→8
  // Tesla
  2741: [{from:2017, to:2023}, {from:2024}],                         // Model 3 → Highland 2024
  1772: [{from:2012, to:2020}, {from:2021}],                         // Model S refresh 2021
  2497: [{from:2016, to:2021}, {from:2022}],                         // Model X refresh 2022
  // BMW
  93:   [{from:2012, to:2018}, {from:2019}],                         // 3er F30→G20
  94:   [{from:2011, to:2016}, {from:2017, to:2023}, {from:2024}],   // 5er F10→G30→G60
  1895: [{from:2018, to:2024}, {from:2025}],                         // X3 G01→G45
  1665: [{from:2014, to:2018}, {from:2019}],                         // X5 F15→G05
  // Lexus / Mercedes / Porsche / Audi
  2220: [{from:2015, to:2022}, {from:2023}],                         // Lexus NX (по Фёдору с 2023)
  481:  [{from:2016, to:2022}, {from:2023}],                         // Lexus RX 4→5
  476:  [{from:2013, to:2018}, {from:2019}],                         // Lexus ES 6→7
  2426: [{from:2016, to:2022}, {from:2023}],                         // Mercedes GLC
  2396: [{from:2016, to:2019}, {from:2020}],                         // Mercedes GLE W166→W167
  1634: [{from:2010, to:2016}, {from:2017, to:2023}, {from:2024}],   // Porsche Panamera 970→971→972
  762:  [{from:2011, to:2018}, {from:2019}],                         // Porsche Cayenne
  58:   [{from:2009, to:2016}, {from:2017}],                         // Audi A4 B8→B9
  1577: [{from:2009, to:2017}, {from:2018}],                         // Audi Q5
  // Hyundai / Kia
  394:  [{from:2017, to:2020}, {from:2021}],                         // Elantra 6→7
  400:  [{from:2015, to:2019}, {from:2020}],                         // Sonata 7→8
  1034: [{from:2016, to:2021}, {from:2022}],                         // Tucson 3→4
  398:  [{from:2019, to:2023}, {from:2024}],                         // Santa Fe TM→MX5
  449:  [{from:2017, to:2022}, {from:2023}],                         // Sportage 4→5
  448:  [{from:2016, to:2020}, {from:2021}],                         // Sorento 3→4
  2764: [{from:2021}],                                               // Kia K5
  // Jeep / Dodge / Ram
  431:  [{from:2011, to:2021}, {from:2022}],                         // Grand Cherokee WK2→WL
  432:  [{from:2007, to:2017}, {from:2018}],                         // Wrangler JK→JL
  1321: [{from:2017}],                                               // Compass
  1360: [{from:2011, to:2023}, {from:2024}],                         // Dodge Charger
  3181: [{from:2009, to:2018}, {from:2019}],                         // Ram 1500 DS→DT
  // VW / Subaru / Mazda
  1201: [{from:2011, to:2018}, {from:2019}],                         // VW Jetta A6→A7
  1485: [{from:2018}],                                               // VW Tiguan 2nd
  1501: [{from:2015, to:2019}, {from:2020}],                         // Subaru Outback 5→6
  828:  [{from:2014, to:2018}, {from:2019}],                         // Subaru Forester 4→5
  1812: [{from:2013, to:2016}, {from:2017}],                         // Mazda CX-5 1→2
  1036: [{from:2014, to:2018}, {from:2019}],                          // Mazda3 3→4
  // ---- Аудит 14.09.2026: перекрытия/обрыв справочника, US-модельные годы ----
  7: [{from:2001, to:2006}, {from:2007, to:2013}, {from:2014, to:2020}, {from:2022}], // Acura MDX
  12: [{from:2004, to:2008}, {from:2009, to:2014}],                      // Acura TL
  115: [{from:2003, to:2007}, {from:2008, to:2013}, {from:2014, to:2019}], // Cadillac CTS
  118: [{from:2002, to:2006}, {from:2007, to:2014}, {from:2015, to:2020}, {from:2021}], // Cadillac Escalade
  130: [{from:2019}],                                                    // Chevrolet Blazer
  131: [{from:2010, to:2015}, {from:2016, to:2024}],                     // Chevrolet Camaro
  137: [{from:2005, to:2013}, {from:2014, to:2019}, {from:2020}],        // Chevrolet Corvette
  138: [{from:2000, to:2005}, {from:2006, to:2013}, {from:2014, to:2020}], // Chevrolet Impala
  141: [{from:1997, to:2003}, {from:2004, to:2007}, {from:2008, to:2012}, {from:2013, to:2015}, {from:2016, to:2025}], // Chevrolet Malibu
  149: [{from:2000, to:2006}, {from:2007, to:2014}, {from:2015, to:2020}, {from:2021}], // Chevrolet Suburban
  152: [{from:2002, to:2009}, {from:2021}],                              // Chevrolet TrailBlazer
  163: [{from:2004, to:2008}, {from:2017}],                              // Chrysler Pacifica
  168: [{from:2001, to:2007}, {from:2008, to:2016}],                     // Chrysler Town & Country
  241: [{from:2001, to:2007}, {from:2008, to:2020}],                     // Dodge Caravan
  243: [{from:2004, to:2009}, {from:2011}],                              // Dodge Durango
  302: [{from:2003, to:2006}, {from:2007, to:2017}, {from:2018}],        // Ford Expedition
  304: [{from:2011, to:2019}],                                           // Ford Fiesta
  305: [{from:2000, to:2007}, {from:2008, to:2011}, {from:2012, to:2018}], // Ford Focus
  322: [{from:1992, to:2014}],                                           // Ford Econoline
  325: [{from:2000, to:2007}, {from:2008, to:2009}, {from:2010, to:2019}], // Ford Taurus
  338: [{from:2000, to:2006}, {from:2007, to:2014}, {from:2015, to:2020}, {from:2021}], // GMC Yukon
  359: [{from:2007, to:2008}, {from:2009, to:2014}, {from:2015, to:2020}], // Honda Fit
  388: [{from:2006, to:2011}, {from:2012, to:2017}, {from:2018, to:2022}], // Hyundai Accent
  429: [{from:2002, to:2007}, {from:2008, to:2013}, {from:2014, to:2023}], // Jeep Cherokee
  445: [{from:2006, to:2011}, {from:2012, to:2017}, {from:2018, to:2023}], // Kia Rio
  478: [{from:2001, to:2005}, {from:2006, to:2013}, {from:2014}],        // Lexus IS
  570: [{from:2001, to:2007}, {from:2008, to:2014}, {from:2015, to:2021}, {from:2022}], // Mercedes C
  573: [{from:2003, to:2009}, {from:2010, to:2016}, {from:2017, to:2023}, {from:2024}], // Mercedes E
  617: [{from:2014}],                                                    // Mitsubishi Mirage
  618: [{from:2007, to:2013}, {from:2014, to:2021}, {from:2022}],        // Mitsubishi Outlander
  677: [{from:2003, to:2007}, {from:2009, to:2014}, {from:2015, to:2024}], // Nissan Murano
  678: [{from:2005, to:2012}, {from:2013, to:2020}, {from:2022}],        // Nissan Pathfinder
  829: [{from:2008, to:2011}, {from:2012, to:2016}, {from:2017, to:2023}, {from:2024}], // Subaru Impreza
  831: [{from:2005, to:2009}, {from:2010, to:2014}, {from:2015, to:2019}, {from:2020}], // Subaru Legacy
  864: [{from:2005, to:2012}, {from:2013, to:2018}, {from:2019, to:2022}], // Toyota Avalon
  910: [{from:2004, to:2010}, {from:2011, to:2020}, {from:2021}],        // Toyota Sienna
  919: [{from:2007, to:2011}, {from:2012, to:2019}, {from:2020}],        // Toyota Yaris
  976: [{from:2006, to:2010}, {from:2012, to:2019}, {from:2020, to:2022}], // VW Passat
  1002: [{from:2003, to:2014}, {from:2016}],                             // Volvo XC90
  1016: [{from:2002, to:2008}, {from:2009, to:2018}, {from:2019}],       // Ram 1500
  1020: [{from:2004, to:2008}, {from:2009, to:2014}, {from:2016, to:2023}], // Nissan Maxima
  1039: [{from:2004, to:2009}, {from:2010, to:2016}],                    // Cadillac SRX
  1073: [{from:2005, to:2009}, {from:2010, to:2016}, {from:2017, to:2019}], // Buick LaCrosse
  1092: [{from:2007, to:2015}, {from:2017}],                             // Audi Q7
  1097: [{from:2005, to:2021}, {from:2022}],                             // Nissan Frontier
  1123: [{from:2013, to:2015}, {from:2016, to:2022}],                    // Chevrolet Spark
  1151: [{from:1998, to:2011}, {from:2019, to:2023}, {from:2024}],       // Ford Ranger
  1161: [{from:2004, to:2015}, {from:2017, to:2024}],                    // Nissan Titan
  1189: [{from:2003, to:2008}, {from:2009, to:2013}, {from:2014, to:2021}], // Mazda6
  1311: [{from:2007, to:2012}, {from:2013, to:2018}, {from:2019}],       // Acura RDX
  1365: [{from:2007, to:2015}, {from:2016, to:2023}],                    // Mazda CX-9
  1385: [{from:2011, to:2015}, {from:2016, to:2020}],                    // Kia Optima
  1427: [{from:2004, to:2012}, {from:2015, to:2022}, {from:2023}],       // Chevrolet Colorado
  1449: [{from:2007, to:2011}, {from:2012, to:2019}, {from:2020}],       // Nissan Versa
  1464: [{from:2007, to:2012}, {from:2013, to:2020}],                    // Lincoln MKZ
  1471: [{from:2007, to:2016}, {from:2017, to:2023}, {from:2024}],       // GMC Acadia
  1483: [{from:2007, to:2014}, {from:2015, to:2024}],                    // Ford Edge
  1506: [{from:2008, to:2017}, {from:2018, to:2024}, {from:2025}],       // Buick Enclave
  1517: [{from:2008, to:2023}],                                          // Dodge Challenger
  1574: [{from:2009, to:2020}],                                          // Dodge Journey
  1600: [{from:2011, to:2015}, {from:2016, to:2019}],                    // Chevrolet Cruze
  1608: [{from:2010, to:2013}, {from:2014, to:2019}, {from:2020}],       // Kia Soul
  1675: [{from:2010, to:2017}, {from:2018}],                             // GMC Terrain
  1804: [{from:2003, to:2006}, {from:2007, to:2013}],                    // Infiniti G
  1808: [{from:2012, to:2020}],                                          // Chevrolet Sonic
  1884: [{from:2013, to:2017}, {from:2018, to:2023}, {from:2024}],       // Subaru Crosstrek
  1894: [{from:2013, to:2015}, {from:2016, to:2022}, {from:2023}],       // BMW X1
  1945: [{from:2003}],                                                   // Chevrolet Express
  1959: [{from:2011, to:2014}, {from:2015, to:2017}],                    // Chrysler 200
  1967: [{from:1999, to:2004}, {from:2005, to:2010}, {from:2011, to:2017}, {from:2018}], // Honda Odyssey
  2070: [{from:2014, to:2020}, {from:2021}],                             // BMW 4er
  2124: [{from:2014}],                                                   // Infiniti Q50
  2127: [{from:2013, to:2020}, {from:2022}],                             // Infiniti QX60
  2156: [{from:2018, to:2022}],                                          // Ford EcoSport
  2218: [{from:2013, to:2022}],                                          // Buick Encore
  2228: [{from:2015, to:2020}, {from:2021}],                             // Acura TLX
  2231: [{from:2015}],                                                   // Jeep Renegade
  2723: [{from:2018, to:2023}, {from:2024}],                             // Hyundai Kona
  2763: [{from:2010, to:2013}, {from:2014, to:2018}, {from:2019, to:2024}], // Kia Forte
  3220: [{from:2015}],                                                   // Ford Transit
  // ---- Аудит 14.09.2026, часть 2: остальные модели (<1000 лотов) ----
  6: [{from:1994, to:2001}, {from:2023}],                                // Acura Integra
  13: [{from:2004, to:2008}, {from:2009, to:2014}],                      // Acura TSX
  29: [{from:2017}],                                                     // Alfa Romeo Giulia
  57: [{from:2006, to:2013}, {from:2015, to:2020}, {from:2022}],         // Audi A3
  60: [{from:1998, to:2004}, {from:2005, to:2011}, {from:2012, to:2018}, {from:2019}], // Audi A6
  61: [{from:1997, to:2003}, {from:2004, to:2010}, {from:2011, to:2018}, {from:2019}], // Audi A8
  71: [{from:2000, to:2002}, {from:2004, to:2008}, {from:2010, to:2016}, {from:2018}], // Audi S4
  95: [{from:2004, to:2010}, {from:2012, to:2018}],                      // BMW 6er
  96: [{from:2002, to:2008}, {from:2009, to:2015}, {from:2016, to:2022}, {from:2023}], // BMW 7er
  103: [{from:1997, to:2005}],                                           // Buick Century
  105: [{from:1992, to:1999}, {from:2000, to:2005}],                     // Buick LeSabre
  108: [{from:2011, to:2017}, {from:2018, to:2020}],                     // Buick Regal
  116: [{from:1994, to:1999}, {from:2000, to:2005}],                     // Cadillac DeVille
  147: [{from:1994, to:2004}],                                           // Chevrolet S-10
  166: [{from:2001, to:2006}, {from:2007, to:2010}],                     // Chrysler Sebring
  171: [{from:2020}],                                                    // Chrysler Voyager (US 2020+)
  240: [{from:2008, to:2014}],                                           // Dodge Avenger
  242: [{from:1997, to:2004}, {from:2005, to:2011}],                     // Dodge Dakota
  273: [{from:2012, to:2019}],                                           // Fiat 500
  320: [{from:1992, to:1997}, {from:1998, to:2011}],                     // Ford Crown Victoria
  334: [{from:1998, to:2001}, {from:2002, to:2009}],                     // GMC Envoy
  361: [{from:2000, to:2006}, {from:2010, to:2014}, {from:2019, to:2022}], // Honda Insight
  370: [{from:1994, to:1997}, {from:1998, to:2002}, {from:2019}],        // Honda Passport
  407: [{from:2003, to:2008}, {from:2009, to:2013}],                     // Infiniti FX
  427: [{from:2004, to:2009}, {from:2011, to:2019}],                     // Jaguar XJ
  435: [{from:2022}],                                                    // Kia Carnival (US 2022+)
  472: [{from:2005, to:2009}, {from:2010, to:2016}, {from:2017}],        // LR Discovery
  474: [{from:2003, to:2012}, {from:2013, to:2021}, {from:2022}],        // Range Rover
  475: [{from:2006, to:2013}, {from:2014, to:2022}, {from:2023}],        // Range Rover Sport
  477: [{from:2003, to:2009}, {from:2010, to:2023}, {from:2024}],        // Lexus GX
  479: [{from:2001, to:2006}, {from:2007, to:2017}, {from:2018}],        // Lexus LS
  483: [{from:2003, to:2005}, {from:2020}],                              // Lincoln Aviator
  484: [{from:2003, to:2006}, {from:2007, to:2017}, {from:2018}],        // Lincoln Navigator
  485: [{from:1998, to:2011}],                                           // Lincoln Town Car
  520: [{from:2014}],                                                    // Maserati Ghibli
  548: [{from:2011, to:2014}],                                           // Mazda2
  552: [{from:1999, to:2005}, {from:2006, to:2015}, {from:2016}],        // Mazda MX-5
  569: [{from:2019, to:2022}],                                           // Mercedes A (US)
  572: [{from:1998, to:2002}, {from:2003, to:2009}],                     // Mercedes CLK
  575: [{from:1998, to:2005}, {from:2006, to:2011}, {from:2012, to:2015}], // Mercedes ML
  576: [{from:1992, to:1999}, {from:2000, to:2006}, {from:2007, to:2013}, {from:2014, to:2020}, {from:2021}], // Mercedes S
  577: [{from:1998, to:2004}, {from:2005, to:2011}, {from:2012, to:2016}], // Mercedes SLK
  608: [{from:1995, to:1999}, {from:2000, to:2005}, {from:2006, to:2012}], // Mitsubishi Eclipse
  685: [{from:2004, to:2009}, {from:2011, to:2017}],                     // Nissan Quest
  752: [{from:1997, to:2003}, {from:2004, to:2008}],                     // Pontiac Grand Prix
  756: [{from:2003, to:2008}, {from:2009, to:2010}],                     // Pontiac Vibe
  757: [{from:1999, to:2004}, {from:2005, to:2011}, {from:2012, to:2019}, {from:2020}], // Porsche 911
  805: [{from:2002, to:2007}, {from:2008, to:2010}],                     // Saturn VUE
  890: [{from:1998, to:2007}, {from:2008, to:2021}, {from:2024}],        // Toyota Land Cruiser
  908: [{from:2001, to:2007}, {from:2008, to:2022}, {from:2023}],        // Toyota Sequoia
  970: [{from:2006, to:2009}, {from:2010, to:2014}, {from:2015, to:2021}, {from:2022}], // VW Golf
  975: [{from:1998, to:2010}, {from:2012, to:2019}],                     // VW Beetle
  983: [{from:2004, to:2010}, {from:2011, to:2017}],                     // VW Touareg
  996: [{from:2001, to:2009}, {from:2011, to:2018}, {from:2019}],        // Volvo S60
  1037: [{from:2001, to:2007}, {from:2008, to:2016}],                    // Volvo XC70
  1040: [{from:2004, to:2011}],                                          // Chevrolet Aveo
  1045: [{from:2003, to:2011}],                                          // Honda Element
  1047: [{from:2002, to:2005}, {from:2006, to:2014}, {from:2015, to:2021}], // Kia Sedona
  1052: [{from:2006, to:2011}, {from:2012, to:2018}, {from:2019}],       // Mercedes CLS
  1065: [{from:2004, to:2006}, {from:2008, to:2015}],                    // Scion xB
  1066: [{from:2005, to:2010}, {from:2011, to:2016}],                    // Scion tC
  1075: [{from:2005, to:2010}],                                          // Chevrolet Cobalt
  1098: [{from:2007, to:2012}],                                          // Mazda CX-7
  1099: [{from:2007, to:2012}, {from:2013, to:2016}],                    // Mercedes GL
  1103: [{from:2012, to:2015}],                                          // Chevrolet Captiva Sport
  1129: [{from:2005, to:2010}, {from:2011, to:2023}],                    // Chrysler 300
  1171: [{from:1998, to:2005}, {from:2006, to:2011}, {from:2013, to:2020}], // Lexus GS
  1192: [{from:2002, to:2007}, {from:2008, to:2017}],                    // Mitsubishi Lancer
  1205: [{from:1998, to:2002}, {from:2003, to:2011}],                    // Mercury Grand Marquis
  1225: [{from:2004, to:2015}, {from:2017}],                             // Nissan Armada
  1298: [{from:2003, to:2008}, {from:2009, to:2013}],                    // Toyota Matrix
  1320: [{from:2006, to:2010}, {from:2012, to:2015}],                    // Mazda5
  1327: [{from:2000, to:2004}, {from:2005, to:2009}],                    // Kia Spectra
  1346: [{from:2006, to:2014}, {from:2017}],                             // Honda Ridgeline
  1355: [{from:2017, to:2022}],                                          // Nissan Rogue Sport (Qashqai)
  1363: [{from:2007, to:2010}, {from:2011, to:2015}, {from:2016, to:2018}], // Lincoln MKX
  1381: [{from:2002, to:2006}, {from:2007, to:2013}],                    // Chevrolet Avalanche
  1388: [{from:2002, to:2007}, {from:2008, to:2012}],                    // Jeep Liberty
  1461: [{from:2008, to:2016}, {from:2017}],                             // Audi A5
  1492: [{from:2013, to:2018}],                                          // Ford C-MAX
  1502: [{from:2009, to:2015}, {from:2016}],                             // Jaguar XF
  1510: [{from:2009, to:2014}, {from:2015, to:2016}],                    // Hyundai Genesis
  1535: [{from:2011, to:2016}, {from:2017, to:2024}, {from:2025}],       // MINI Countryman
  1599: [{from:2010, to:2017}, {from:2018}],                             // Volvo XC60
  1627: [{from:2001, to:2005}, {from:2007, to:2010}],                    // Ford Sport Trac
  1644: [{from:2011, to:2017}, {from:2018}],                             // Nissan Leaf
  1655: [{from:1984, to:1991}, {from:2022}],                             // Jeep Grand Wagoneer
  1671: [{from:2003, to:2012}, {from:2013, to:2020}, {from:2022}],       // Mercedes SL
  1715: [{from:2012, to:2018}, {from:2019}],                             // Audi A7
  1718: [{from:2011, to:2017}],                                          // Nissan Juke
  1725: [{from:2003, to:2005}, {from:2006, to:2010}, {from:2011, to:2013}], // Infiniti M
  1740: [{from:2011, to:2017}],                                          // Lexus CT
  1785: [{from:2012, to:2017}, {from:2019, to:2022}],                    // Hyundai Veloster
  1788: [{from:2015, to:2018}, {from:2019}],                             // Audi Q3
  1792: [{from:2012, to:2019}, {from:2020}],                             // Range Rover Evoque
  1794: [{from:2011, to:2015}, {from:2016, to:2019}],                    // Chevrolet Volt
  1797: [{from:2014, to:2016}, {from:2017, to:2019}],                    // Kia Cadenza
  1807: [{from:2004, to:2010}, {from:2011, to:2013}],                    // Infiniti QX56
  1825: [{from:2008, to:2017}, {from:2018}],                             // Audi S5
  1829: [{from:2013, to:2022}],                                          // Acura ILX
  1896: [{from:2008, to:2014}, {from:2015, to:2019}, {from:2020}],       // BMW X6
  1908: [{from:2020}],                                                   // LR Defender
  1926: [{from:2014, to:2019}, {from:2020}],                             // Mercedes CLA
  1936: [{from:2013, to:2020}, {from:2022}],                             // Subaru BRZ
  1949: [{from:2004, to:2012}, {from:2015, to:2022}, {from:2023}],       // GMC Canyon
  2071: [{from:2013, to:2016}],                                          // Dodge Dart
  2094: [{from:2015, to:2020}, {from:2021}],                             // Mercedes GLA
  2119: [{from:2014, to:2017}, {from:2018}],                             // Audi SQ5
  2125: [{from:2014, to:2017}, {from:2019}],                             // Infiniti QX50
  2126: [{from:2014, to:2016}, {from:2017, to:2022}],                    // Infiniti Q60
  2128: [{from:2014, to:2024}, {from:2025}],                             // Infiniti QX80
  2135: [{from:2014, to:2021}, {from:2022}],                             // BMW 2er
  2137: [{from:2015}],                                                   // Lexus RC
  2139: [{from:2015}],                                                   // Porsche Macan
  2177: [{from:2015, to:2018}, {from:2019}],                             // BMW X4
  2185: [{from:2015, to:2019}],                                          // Lincoln MKC
  2197: [{from:2015, to:2021}, {from:2022}],                             // Subaru WRX
  2246: [{from:2015}],                                                   // LR Discovery Sport
  2266: [{from:1999, to:2003}, {from:2004, to:2008}],                    // Toyota Solara
  2272: [{from:2008, to:2013}, {from:2015, to:2018}, {from:2021}],       // BMW M3
  2273: [{from:2015, to:2020}, {from:2021}],                             // BMW M4
  2274: [{from:2000, to:2003}, {from:2006, to:2010}, {from:2013, to:2016}, {from:2018}], // BMW M5
  2281: [{from:2008, to:2014}, {from:2015, to:2021}, {from:2022}],       // Mercedes C AMG
  2322: [{from:2006, to:2009}, {from:2010, to:2014}, {from:2015, to:2021}, {from:2022}], // VW Golf GTI
  2412: [{from:2012, to:2017}],                                          // Buick Verano
  2491: [{from:2017}],                                                   // Jaguar F-Pace
  2507: [{from:2017, to:2019}, {from:2020}],                             // Mercedes GLS
  2517: [{from:2017}],                                                   // Cadillac XT5
  2551: [{from:2017, to:2023}],                                          // Chevrolet Bolt
  2669: [{from:2017, to:2020}, {from:2021}],                             // Genesis G80
  2775: [{from:2018}],                                                   // Mitsubishi Eclipse Cross
  2893: [{from:2019}],                                                   // Subaru Ascent
  2898: [{from:2006, to:2011}, {from:2012, to:2017}],                    // Hyundai Azera
};
// Возвращает диапазон лет поколения оцениваемого лота [genFrom..genTo]. Приоритет:
// 1) зашитые overrides, 2) справочник API, 3) синтетика (год за верхом → новый кузов).
async function resolveGenRange(modelId, yearQ, genIdQ){
  const cur = new Date().getFullYear() + 1;
  const ov = tableGens(modelId) || GEN_OVERRIDES[Number(String(modelId).replace(/[^0-9]/g, ""))];
  if(ov && ov.length && yearQ){
    const cont = ov.filter(g => yearQ >= g.from && yearQ <= (g.to || cur));
    if(cont.length){ const g = cont.reduce((a, b) => (b.from > a.from ? b : a)); return {genFrom:g.from, genTo:g.to || cur}; }
    const newest = ov.reduce((a, b) => (b.from > a.from ? b : a));
    if(yearQ > (newest.to || newest.from)) return {genFrom:newest.from, genTo:newest.to || cur};
    // Год в «дыре» между поколениями (A8 2018: D4 до 2017, D5 с 2019) → ближайшее по
    // годам, при равенстве — более раннее (переходный год обычно ещё старый кузов).
    const dist = g => (yearQ < g.from ? g.from - yearQ : yearQ - (g.to || cur));
    const near = ov.slice().sort((a, b) => dist(a) - dist(b) || a.from - b.from)[0];
    return {genFrom:near.from, genTo:near.to || cur};
  }
  try{
    const gens = await generationsFor(modelId);
    const withFrom = (gens || []).filter(x => x.from);
    if(withFrom.length){
      const newest = withFrom.reduce((a, b) => (b.from > a.from ? b : a));
      let g = genIdQ ? withFrom.find(x => String(x.id) === String(genIdQ)) : null;
      if(!g && yearQ){
        const c = withFrom.filter(x => yearQ >= x.from && yearQ <= (x.to || cur));
        if(c.length) g = c.reduce((a, b) => (b.from > a.from ? b : a));
      }
      if(g && g.from) return {genFrom:g.from, genTo:g.to || cur};
      if(yearQ && yearQ > (newest.to || newest.from)) return {genFrom:(newest.to || newest.from) + 1, genTo:cur};
    }
  }catch(e){ /* справочник недоступен — без поколения */ }
  return {genFrom:0, genTo:0};
}
// Кладём в лот диапазон лет ЕГО поколения (кузова) — для фильтра «похожих» того же
// поколения на клиенте. Работает для ВСЕХ моделей: overrides → справочник → синтетика.
async function attachGenRange(lot){
  try{
    if(lot && lot.modelId && lot.year){
      const yr = Number(lot.year) || 0;
      const cur = new Date().getFullYear() + 1;
      const gr = await resolveGenRange(lot.modelId, yr, lot.generationId || "");
      if(gr && gr.genFrom){ lot.genFrom = gr.genFrom; lot.genTo = gr.genTo; }
      // Модель в нашей таблице → крошка как у DreamBid: код кузова + годы.
      const tg = tableGens(lot.modelId);
      if(tg){
        const g = lot.genFrom ? tg.find(x => x.from === lot.genFrom) : null;
        if(g){ lot.generationId = g.id; lot.generationName = (g.name ? g.name + " · " : "") + g.from + "–" + (g.to || ""); }
        else { lot.generationId = null; lot.generationName = ""; }
        return lot;
      }
      // Поколение в крошках/фильтре — ПО ГОДУ, а не по generation_id фида: фид
      // относит 2018 BMW 330e к «VII (G2x)», хотя это F30; годы в справочнике API
      // перекрываются (F3x 2011–2020, G2x 2018–2022 — мировые, не US). Берём запись
      // справочника с максимальным from ≤ нашего genFrom (допуск 1 год), в имя
      // добавляем US-годы. Нет совпадения и фид начинается позже года лота → не
      // показываем ложное поколение вовсе.
      const gens = (await generationsFor(lot.modelId)).filter(g => g && g.from && g.name);
      let pick = null;
      if(lot.genFrom){
        // Ближайшее по началу поколение (±3 года), при равенстве — более раннее.
        // Правило «max from ≤ genFrom+1» давало Forte 2020 → «II» (III в справочнике
        // с 2021) и X1 2023 → «F48» (U11 нет вовсе). Нет записи в пределах ±3 →
        // крошку поколения не показываем: честнее, чем чужой код кузова.
        const c = gens.map(g => ({g, d:Math.abs(g.from - lot.genFrom)})).filter(x => x.d <= 3)
          .sort((a, b) => a.d - b.d || a.g.from - b.g.from);
        if(c.length) pick = c[0].g;
        else { lot.generationId = null; lot.generationName = ""; }
      }
      // Запасной подбор «по вхождению года» — только если у лота НЕТ нашего
      // диапазона (модель не в overrides и справочник не дал границ). Иначе после
      // открытого верха свежего поколения F48 «2015–∞» ловил X1 2023 (это U11).
      if(!pick && yr && !lot.genFrom){
        const c = gens.filter(g => yr >= g.from && yr <= (g.to || cur));
        if(c.length) pick = c.reduce((a, b) => (b.from > a.from ? b : a));
      }
      if(pick){
        const to = lot.genTo && lot.genTo < cur ? String(lot.genTo) : "";
        lot.generationId = pick.id;
        // Как у DreamBid — коротко, кодом кузова («G05», «F3x»): берём текст в скобках
        // имени справочника («VI (F3x)» → «F3x»), иначе имя целиком. Плюс US-годы.
        const code = (String(pick.name).match(/\(([^)]+)\)/) || [])[1] || String(pick.name).trim();
        lot.generationName = lot.genFrom ? `${code} · ${lot.genFrom}–${to}` : code;
      }else if(lot.generationId){
        const feed = gens.find(g => String(g.id) === String(lot.generationId));
        if(feed && yr && feed.from > yr){ lot.generationId = null; lot.generationName = ""; }
      }
    }
  }catch(e){ /* без поколения — клиент откатится на год */ }
  return lot;
}

// payload в базе нормализован на момент синка — в старых записях finalBid мог быть «додуман» из
// непроданного раунда. Финал оставляем только у лотов со статусом продажи.
function sanitizeStoredLot(l){
  // строка помечена проданной, но финала нет → это непроданный раунд, лот жив
  if(l && l.statusId === 6 && !(Number(l.finalBid) > 0)) l = {...l, statusId:3, lotStatus:"sale", statusName:"sale"};
  const ts = l && l.auctionDate ? Date.parse(l.auctionDate) : NaN;
  if(l && Number.isFinite(ts) && ts > Date.now() && (l.statusId === 6 || l.statusId === 8 || /^sold$/i.test(String(l.lotStatus || "")))){
    l = {...l, currentBid:Math.max(Number(l.currentBid) || 0, Number(l.finalBid) || 0), finalBid:0, lotStatus:"sale", statusName:"On sale", statusId:3};
  }
  if(l && Number(l.finalBid) > 0){
    const st = String(l.statusName || l.lotStatus || "");
    const sold = l.statusId === 6 || l.statusId === 4 || (/sold|approval/i.test(st) && !/not_sold/i.test(st));
    if(!sold) return {...l, finalBid:0};
  }
  return l;
}
const undatedCountCache = new Map();

// Счётчик вкладки БЕЗ фильтров — один на вкладку+площадку, не зависит от сортировки (кэш 10 мин).
// Раньше total = оценка планировщика по конкретному запросу: у сортировок разные предикаты
// («year.not.is.null», хвост без даты…) → «Все» показывало 526k / 164k / 483k при смене сортировки.
const tabTotalCache = new Map();
async function tabTotal(tab, auction, vtype){
  const ck = `${tab}|${auction || "all"}${vtype ? "|t" + vtype : ""}`;
  const c = tabTotalCache.get(ck);
  if(c && Date.now() - c.at < 10 * 60e3) return c.n;
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if(!url || !key) return 0;
  const auc = (auction && auction !== "all" ? `&auction=eq.${pgEscape(auction).toLowerCase()}` : "") + (vtype ? `&vehicle_type_id=eq.${String(vtype).replace(/[^0-9]/g, "")}` : "");
  // Точный счёт (частичные индексы where archived=false держат его в ~1с даже на 500k), при
  // таймауте — оценка планировщика. Ошибки не глотаем молча: tabTotal.lastError для диагностики.
  const one = async (q, mode, ms) => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
    try{
      const r = await fetch(`${url}/rest/v1/api_lots?select=id&${q.startsWith("archived=") ? "" : "archived=eq.false&"}${q}${auc}`,
        {headers:{apikey:key, authorization:`Bearer ${key}`, prefer:`count=${mode}`, range:"0-0", "range-unit":"items"}, signal:ctrl.signal});
      if(!(r.ok || r.status === 416)) throw new Error(`HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 80)}`);
      const n = Number((r.headers.get("content-range") || "*/0").split("/").pop()) || 0;
      tabTotal.debug = (tabTotal.debug || []).slice(-24).concat([{ck, q, mode, n, cr:r.headers.get("content-range"), st:r.status}]);
      return n;
    }catch(e){ tabTotal.debug = (tabTotal.debug || []).slice(-24).concat([{ck, q, mode, err:String(e.message || e).slice(0, 80)}]); throw e; }
    finally{ clearTimeout(t); }
  };
  // Только оценка планировщика (EXPLAIN): точный счёт по 600k строк на этой базе шёл 5с+ и держал ответ каталога
  // (00:50 23.09: «Все» отвечало 15с, из них ~10с — счётчики). После ANALYZE оценка совпадает с точной до долей процента.
  const cnt = async q => {
    try{ return await one(q, "planned", 4000); }
    catch(e){ tabTotal.lastError = `${ck}: ${String(e.message || e).slice(0, 100)}`; return 0; }
  };
  const live = "or=(status_id.neq.6,status_id.is.null)";
  const grace = encodeURIComponent(new Date(Date.now() - LIVE_GRACE_MS).toISOString());
  let n = 0;
  if(tab === "soon"){
    const to = encodeURIComponent(new Date(Date.now() + 48 * 3600e3).toISOString());
    n = await cnt(`sale_date=gte.${grace}&sale_date=lte.${to}&${live}`);
  }else if(tab === "buy_now"){
    const dayAgo = encodeURIComponent(new Date(Date.now() - 24 * 3600e3).toISOString());
    // Одна оценка планировщика без предиката по дате: с «sale_date is null» планировщик давал 0 (нет индекса под Buy Now,
    // SQL п.7 на утро), из-за чего бейдж показывал 7k вместо ~55k. Прошедшие сутки чуть завышают — терпимо.
    n = await cnt(`buy_now=gt.0&status_id=neq.6`);
  }else if(tab === "archived"){
    // Архив: точный счёт по частичному индексу (archived=true, status 6 → ~50k строк, <1с); оценка планировщика тут
    // врёт на порядки (28 вместо 52k). Не успели — лучше пусто, чем «28».
    n = await one(`archived=eq.true&status_id=eq.6&final_bid=gt.0&sale_date=lte.${encodeURIComponent(new Date().toISOString())}`, "exact", 6000).catch(() => 0);
  }else if(tab === "dated"){
    n = await cnt(`sale_date=gte.${grace}&${live}`);
  }else{
    n = (await cnt(`sale_date=gte.${grace}&${live}`)) + (await cnt(`sale_date=is.null&${live}`));
  }
  // n=0 (таймауты) тоже кэшируем, но на 2 мин — иначе каждый запрос каталога заново гонял точные счёты по 5с.
  tabTotalCache.set(ck, {n, at:n > 0 ? Date.now() : Date.now() - 8 * 60e3});
  return n;
}
// Датированные торги (как у DreamBid «current») — для сводки в count.
async function datedTotal(auction){ return tabTotal("dated", auction); }
// Счёт для выборок с «широкими» фильтрами (топливо, год, цена, повреждения, статус продажи, даты…). Оценка планировщика по ним
// врёт в разы (timed и «без резерва» показывали одно и то же «2491»), а count=exact в одном запросе с выборкой держал ответ.
// Поэтому считаем ОТДЕЛЬНЫМ параллельным запросом: точно (3.5с), не успели — оценка планировщика; результат кэшируем на 5 минут.
const filteredCountCache = new Map();
async function countRows(url, key, params){
  const ck = params.toString();
  const c = filteredCountCache.get(ck);
  if(c && Date.now() - c.at < 5 * 60e3) return c.n;
  const one = async (mode, ms) => {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), ms);
    try{
      const r = await fetch(`${url}/rest/v1/api_lots?${params}`, {headers:{apikey:key, authorization:`Bearer ${key}`, prefer:`count=${mode}`, range:"0-0", "range-unit":"items"}, signal:ctrl.signal});
      if(!(r.ok || r.status === 416)) throw new Error("HTTP " + r.status);
      return Number((r.headers.get("content-range") || "*/0").split("/").pop()) || 0;
    }finally{ clearTimeout(t); }
  };
  let n = 0, exact = true;
  try{ n = await one("exact", 2500); }
  catch(e){ exact = false; try{ n = await one("planned", 2500); }catch(e2){ n = 0; } }
  if(n > 0){
    filteredCountCache.set(ck, {n, at:exact ? Date.now() : Date.now() - 4 * 60e3});   // оценку держим ~1 мин, точный — 5
    if(filteredCountCache.size > 300) filteredCountCache.delete(filteredCountCache.keys().next().value);
  }
  return n;
}

async function searchFromDb(query){
  const T = searchFromDb.t = {t0:Date.now()};
  if(!(await lotsDbReady())) return null;
  T.ready = Date.now() - T.t0;
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const p = new URLSearchParams();
  p.set("select", "payload");
  const ands = [];
  // Страховка от Encar/Кореи, попавшей в базу до доменного фильтра синка
  ands.push("or(country.neq.kr,country.is.null)");

  // Внутреннее: «новые лоты» для уведомлений (first_seen проставляет БД при первой вставке лота)
  const firstSeenFrom = query.get("firstSeenFrom");
  if(firstSeenFrom && Number.isFinite(Date.parse(firstSeenFrom))) ands.push(`first_seen.gte.${new Date(firstSeenFrom).toISOString()}`);

  // Feduk SmartSelect: без перекупов (resale: 1 — многократно выставлялся, 2 — уже продавался). Непроверенные (null) показываем.
  if(query.get("smart") === "1") ands.push("or(resale.is.null,resale.eq.0)");

  const tab = query.get("tab") || "all";
  let datedOnly = false, datedOnlyFull = null;   // общий каталог: основная выборка — только назначенные торги (см. ниже)
  // Архив = только СОСТОЯВШИЕСЯ торги. Фид помечает sold/archived и лоты с будущей датой,
  // где final_bid — всего лишь пред-ставка: они вставали первыми («23 сент., финальная $975»).
  let pastTail = false;
  const pastOnly = () => { ands.push(`sale_date.lte.${new Date().toISOString()}`); pastTail = true; };
  if(tab === "sold"){ p.set("archived", "eq.true"); p.set("status_id", "eq.6"); pastOnly(); }
  else if(tab === "archived"){ p.set("archived", "eq.true"); p.set("status_id", "eq.6"); p.set("final_bid", "gt.0"); pastOnly(); }
  else if(tab === "buy_now"){
    // «Купить сейчас» — только реально доступные к выкупу: цена выкупа есть,
    // не продан (status ≠ 6), и аукцион ещё не прошёл (будущая дата или без
    // даты). Иначе наверх вкладки лезли вчерашние проданные лоты.
    p.set("archived", "eq.false");
    p.set("buy_now", "gt.0");
    p.set("status_id", "neq.6");
    const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
    // Как у «Все»: OR по sale_date не даёт индексу range-scan (вкладка отвечала 11–18с) → для сортировок
    // по дате берём датированные range-scan'ом, недатированные Buy Now — хвостом (dateTail).
    const dateSortedBN = /^(|soon|smart|date_asc|date_desc)$/.test(query.get("sort") || "");
    if(!dateSortedBN || query.get("make") || query.get("model") || query.get("name") || query.get("vin")){
      ands.push(`or(sale_date.gte.${dayAgo},sale_date.is.null)`);
    }else{
      ands.push(`sale_date.gte.${dayAgo}`);
      datedOnly = true; datedOnlyFull = [`sale_date.gte.${dayAgo}`, `or(sale_date.gte.${dayAgo},sale_date.is.null)`];
    }
  }
  else if(tab === "soon"){
    // «Сегодня и завтра»: торги в ближайшие 48 часов (плюс идущие сейчас). Чистый range по
    // sale_date — быстро и без недатированных. Заменила вкладку «Открытые», которая после
    // возврата лотов без даты стала копией «Все».
    p.set("archived", "eq.false");
    const from = new Date(Date.now() - LIVE_GRACE_MS).toISOString();
    const to = new Date(Date.now() + 48 * 3600e3).toISOString();
    ands.push(`sale_date.gte.${from}`);
    ands.push(`sale_date.lte.${to}`);
    ands.push("or(status_id.neq.6,status_id.is.null)");
  }
  else if(tab === "open"){
    p.set("archived", "eq.false");
    // Открытые: будущие торги (плюс идущие прямо сейчас — до 2 ч после старта) или
    // без даты. Раньше окно было «сутки назад» → первая страница по дате состояла
    // из ВЧЕРАШНИХ уже прошедших торгов (ставку не сделать, смотрелось как мусор).
    const grace = new Date(Date.now() - LIVE_GRACE_MS).toISOString();
    // Без марки/модели/поиска OR по sale_date не даёт Postgres идти по индексу диапазоном:
    // общий каталог упирался в 8с-таймаут и падал на live (10с первая загрузка). В общем
    // виде берём только назначенные торги — чистый range-scan по (sale_date,id); недатированные
    // там всё равно были бы на тысячных страницах. С маркой/моделью — полный набор с «Future».
    // …и только для сортировок ПО ДАТЕ: при «Год»/«Пробег»/«Buy Now» порядок задаёт другое поле,
    // range-scan по дате не нужен — сортируем весь каталог, включая лоты без даты.
    const dateSorted = /^(|soon|smart|date_asc|date_desc)$/.test(query.get("sort") || "");
    if(!dateSorted || query.get("make") || query.get("model") || query.get("name") || query.get("vin")){
      ands.push(`or(sale_date.gte.${grace},sale_date.is.null)`);
    }else{
      ands.push(`sale_date.gte.${grace}`);
      datedOnly = true; datedOnlyFull = [`sale_date.gte.${grace}`, `or(sale_date.gte.${grace},sale_date.is.null)`];
    }
    ands.push("or(status_id.neq.6,status_id.is.null)");
  }else{
    // «Все» — живой каталог: назначенные торги (включая вчерашние, ждущие
    // результата) или Buy Now без даты. Сток без даты и без цены — 600k+
    // записей фида «на площадке» — не показываем (DreamBid тоже не считает).
    p.set("archived", "eq.false");
    // То же окно «сейчас − 2 ч»: вчерашние торги, ждущие результата, покупателю
    // бесполезны — после синка они и так уходят в архив.
    const grace = new Date(Date.now() - LIVE_GRACE_MS).toISOString();
    // 21.09.2026: лоты БЕЗ даты возвращены. Проверка выборки по live-фиду: ~70% из них —
    // живые «upcoming» (площадка ещё не назначила торги; у DreamBid это «Future», их 872
    // у BMW 3 Series против наших 11 с датой). Сортировка sale_date.asc NULLS LAST держит
    // назначенные торги наверху, недатированные идут следом. Проданные (status 6), которые
    // синк не успел унести в архив, отсекаем.
    // Без марки/модели/поиска OR по sale_date не даёт Postgres идти по индексу диапазоном:
    // общий каталог упирался в 8с-таймаут и падал на live (10с первая загрузка). В общем
    // виде берём только назначенные торги — чистый range-scan по (sale_date,id); недатированные
    // там всё равно были бы на тысячных страницах. С маркой/моделью — полный набор с «Future».
    // …и только для сортировок ПО ДАТЕ: при «Год»/«Пробег»/«Buy Now» порядок задаёт другое поле,
    // range-scan по дате не нужен — сортируем весь каталог, включая лоты без даты.
    const dateSorted = /^(|soon|smart|date_asc|date_desc)$/.test(query.get("sort") || "");
    if(!dateSorted || query.get("make") || query.get("model") || query.get("name") || query.get("vin")){
      ands.push(`or(sale_date.gte.${grace},sale_date.is.null)`);
    }else{
      ands.push(`sale_date.gte.${grace}`);
      datedOnly = true; datedOnlyFull = [`sale_date.gte.${grace}`, `or(sale_date.gte.${grace},sale_date.is.null)`];
    }
    ands.push("or(status_id.neq.6,status_id.is.null)");
  }

  const auction = query.get("auction");
  if(auction && auction !== "all") p.set("auction", `eq.${pgEscape(auction).toLowerCase()}`);

  const make = query.get("make");
  if(make && /^[\d,]+$/.test(make)) p.set("make_id", make.includes(",") ? `in.(${make})` : `eq.${make}`);
  const model = query.get("model");
  if(model && /^[\d,]+$/.test(model)) p.set("model_id", model.includes(",") ? `in.(${model.replace(/^,+|,+$/g, "")})` : `eq.${model}`);
  // Марки без выбранных моделей берём целиком: (model_id ∈ выбранные) ИЛИ (make_id ∈ марки без моделей)
  const makeAny = String(query.get("makeAny") || "").replace(/[^0-9,]/g, "").replace(/^,+|,+$/g, "");
  if(makeAny && p.get("model_id")){
    const mv = p.get("model_id");
    p.delete("model_id"); p.delete("make_id");
    ands.push(`or(model_id.${mv},make_id.in.(${makeAny}))`);
  }
  const generation = query.get("generation");
  const synGen = parseSynGen(generation);
  if(synGen){
    ands.push(`year.gte.${synGen.from}`);
    if(synGen.to) ands.push(`year.lte.${synGen.to}`);
  }else if(generation && /^\d+$/.test(generation)){
    // Фид часто не проставляет generation_id (null), а справочник поколений
    // отстаёт по годам (напр. BMW G2x значится 2018–2022, хотя выпускается и
    // в 2023+). Поэтому вместо строгого generation_id=eq.X включаем и лоты без
    // поколения, чей год попадает в диапазон этого поколения; для новейшего
    // поколения модели верхнюю границу открываем до текущего года — как DreamBid.
    let genApplied = false;
    if(model && /^\d+$/.test(model)){
      try{
        const gens = await generationsFor(model);
        const g = gens.find(x => String(x.id) === String(generation));
        if(g && g.from){
          const newest = gens.reduce((a, b) => ((b.from || 0) > (a.from || 0) ? b : a), gens[0] || {});
          const curYear = new Date().getFullYear() + 1;
          const to = String(newest.id) === String(generation) ? curYear : (g.to || curYear);
          ands.push(`or(generation_id.eq.${generation},and(generation_id.is.null,year.gte.${g.from},year.lte.${to}))`);
          genApplied = true;
        }
      }catch(e){ /* fallback ниже */ }
    }
    if(!genApplied) p.set("generation_id", `eq.${generation}`);
  }

  const numFilters = [
    ["yearFrom", "year", "gte"], ["yearTo", "year", "lte"],
    ["bidFrom", "current_bid", "gte"], ["bidTo", "current_bid", "lte"],
    ["buyNowFrom", "buy_now", "gte"], ["buyNowTo", "buy_now", "lte"],
    ["mileageFrom", "odometer_mi", "gte"], ["mileageTo", "odometer_mi", "lte"]
  ];
  for(const [from, col, op] of numFilters){
    const v = query.get(from);
    if(v && /^\d+$/.test(v)) ands.push(`${col}.${op}.${v}`);
  }
  {
    const eng = parseEngineRange(query);
    if(eng.from != null || eng.to != null){
      ands.push("engine_l.gt.0");
      if(eng.from != null) ands.push(`engine_l.gte.${eng.from}`);
      if(eng.to != null) ands.push(`engine_l.lte.${eng.to}`);
    }
  }
  const kmFrom = query.get("mileageFromKm"), kmTo = query.get("mileageToKm");
  if(kmFrom && /^\d+$/.test(kmFrom)) ands.push(`odometer_mi.gte.${Math.round(Number(kmFrom) * 0.621371)}`);
  if(kmTo && /^\d+$/.test(kmTo)) ands.push(`odometer_mi.lte.${Math.round(Number(kmTo) * 0.621371)}`);

  const enumFilters = [["fuel","fuel_id"],["body","body_id"],["transmission","transmission_id"],["drive","drive_id"],["condition","condition_id"],["color","color_id"],["cylinders","cylinders"],["vehicleType","vehicle_type_id"]];
  for(const [from, col] of enumFilters){
    const v = String(query.get(from) || "").replace(/[^0-9,]/g, "");
    const ids = v.split(",").filter(Boolean);
    if(ids.length === 1) p.set(col, `eq.${ids[0]}`);
    else if(ids.length > 1) p.set(col, `in.(${ids.join(",")})`);   // мультивыбор
  }
  // Статус лота (мультивыбор): 10 скоро торги · 3 в продаже · 4 на одобрении · 6 продан · 8 не продан
  const stIds = String(query.get("lotStatus") || "").replace(/[^0-9,]/g, "").split(",").filter(x => x && x !== "8");
  if(stIds.length){
    ["status_id"].forEach(k => p.delete(k));
    for(let i = ands.length - 1; i >= 0; i--) if(/status_id/.test(ands[i])) ands.splice(i, 1);
    p.set("status_id", stIds.length === 1 ? `eq.${stIds[0]}` : `in.(${stIds.join(",")})`);
    // «Продан/не продан» реальны только у ПРОШЕДШИХ торгов: фид метит sold и будущие лоты с пред-ставкой.
    const past = stIds.filter(x => x === "6" || x === "8"), live = stIds.filter(x => x !== "6" && x !== "8");
    if(past.length){
      for(let i = ands.length - 1; i >= 0; i--) if(/^sale_date\./.test(ands[i]) || /^or\(sale_date/.test(ands[i])) ands.splice(i, 1);
      p.delete("archived");
      const nowIso = new Date().toISOString();
      if(live.length){
        p.delete("status_id");
        ands.push(`or(and(status_id.in.(${past.join(",")}),sale_date.lte.${nowIso}),and(status_id.in.(${live.join(",")}),archived.eq.false))`);
      }else{
        ands.push(`sale_date.lte.${nowIso}`);
      }
    }
  }

  const dmgTerms = damageTerms(query.get("damage"));
  if(dmgTerms.length === 1) p.set("damage", `ilike.*${dmgTerms[0]}*`);
  else if(dmgTerms.length > 1) ands.push(`or(${dmgTerms.map(t => `damage.ilike.*${t}*`).join(",")})`);
  const doc = query.get("document");
  if(doc) p.set("document", `ilike.*${pgEscape(doc)}*`);
  const state = query.get("state");
  if(state) p.set("state_code", `eq.${pgEscape(state).toLowerCase()}`);
  const countries = [...new Set(String(query.get("country") || "").toLowerCase().split(",").map(x => x.replace(/[^a-z]/g, "")).filter(x => x === "us" || x === "ca"))];
  if(countries.length === 1) p.set("country", `eq.${countries[0]}`);

  // Трейлеры убраны с сайта: исключаем из любых выдач без явного выбора типа
  if(!query.get("vehicleType")) ands.push("or(vehicle_type_id.neq.3,vehicle_type_id.is.null)");

  // Статусы продажи фильтруем по нормализованному payload.
  // JSON-путь внутри and=() PostgREST не принимает — только отдельным параметром.
  const saleSel = parseSaleList(query);
  if(saleSel.length === 1){
    if(saleSel[0] === "timed") p.set("payload->>timed", "eq.true");
    if(saleSel[0] === "no_reserve") p.set("payload->>saleStatusKey", "eq.no_reserve");
    if(saleSel[0] === "on_approval") p.set("status_id", "eq.4");
  }else if(saleSel.length > 1){
    // Несколько статусов = ИЛИ; JSON-путь работает в верхнеуровневом or=(…) (в and=(…) — нет)
    p.set("or", `(${saleSel.map(x => x === "timed" ? "payload->>timed.eq.true" : x === "no_reserve" ? "payload->>saleStatusKey.eq.no_reserve" : "status_id.eq.4").join(",")})`);
  }

  const q = query.get("q");
  const vin = query.get("vin");
  const name = query.get("name");
  if(q && /^\d{6,10}$/.test(q)) p.set("lot", `eq.${q}`);
  else if(q) ands.push(`or(vin.ilike.*${pgEscape(q)}*,title.ilike.*${pgEscape(q)}*)`);
  if(vin) p.set("vin", `ilike.*${pgEscape(vin).replace(/_/g, "")}*`);
  if(name) p.set("title", `ilike.*${pgEscape(name)}*`);

  const dateFrom = query.get("auctionDateFrom");
  const dateTo = query.get("auctionDateTo");
  if(dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) ands.push(`sale_date.gte.${dateFrom}T00:00:00Z`);
  // dateTo приходит от клиента уже сдвинутым на +1 день (так нужно live-API) → верхняя граница ИСКЛЮЧАЮЩАЯ,
  // иначе в выдачу попадал лишний день, а клиентский фильтр его срезал (страница < 30, total завышен).
  if(dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) ands.push(`sale_date.lt.${dateTo}T00:00:00Z`);
  if(query.get("withoutSaleDate") === "1") p.set("sale_date", "is.null");

  if(ands.length) p.set("and", `(${ands.join(",")})`);

  // «Статус продажи» (Timed / без резерва / на утверждении) относится к ТОРГАМ — только лоты с назначенной датой. Недатированный
  // сток «на площадке» (295k лотов Copart pure_sale) под «Без резерва» — не аукцион и делал счёт неподъёмным (точный count 9с,
  // оценка планировщика 2321 при реальных ~295k); Timed всегда датирован. Заменяем «дата ИЛИ без даты» на просто «дата ≥ …».
  const hasSaleStatus = !!query.get("saleStatus");
  if(hasSaleStatus){
    for(let i = 0; i < ands.length; i++){
      const m = ands[i].match(/^or\(sale_date\.gte\.([^,]+),sale_date\.is\.null\)$/);
      if(m) ands[i] = `sale_date.gte.${m[1]}`;
    }
    datedOnlyFull = null;
  }
  const wantsPastTab = tab === "sold" || tab === "archived";
  // ⚠️ Никаких «.asc.nullslast»: для ASC в Postgres NULLS LAST и так по умолчанию, а с явным NULLS LAST PostgREST
  // получал план без индекса (замер 23.09.2026 01:08: 2.6с против 125мс на том же запросе). Это и было «каталог 8с → live».
  const sortMap = {
    soon:wantsPastTab ? "sale_date.desc" : "sale_date.asc",   // архив: только что сыгравшие — первыми
    smart:wantsPastTab ? "sale_date.desc" : undefined,
    // date_desc: на общем каталоге набор уже без NULL (datedOnly) — «DESC NULLS LAST» индекс не обслуживает,
    // сортировка 600k строк в памяти → 8с-таймаут → live-фолбэк (782k «лотов» с Кореей). Недатированные — хвостом.
    date_asc:"sale_date.asc", date_desc:datedOnly ? "sale_date.desc" : "sale_date.desc.nullslast",
    year_asc:"year.asc", year_desc:"year.desc",
    // desc БЕЗ nullslast: NULL-ы уже отсечены фильтром выше, а «DESC NULLS LAST» обычный btree-индекс
    // обслужить не может → сортировка 600k строк в памяти → таймаут → live-фолбэк на 10 секунд.
    mileage_asc:"odometer_mi.asc", mileage_desc:"odometer_mi.desc",
    price_asc:"current_bid.asc", price_desc:"current_bid.desc",
    buy_now_asc:"buy_now.asc", buy_now_desc:"buy_now.desc"
  };
  // В каталоге показываем ВСЁ, что даёт API (решение Федора, 22.09.2026): никаких отсечений по
  // «пробегу 0», «году 0», дешёвому Buy Now и т.п. — скрывать часть лотов можно только в
  // «Рекомендованных» (smart). Единственное техническое: у DESC-сортировок NULL-значения выносим
  // в «хвост» отдельным запросом (см. ниже) — «ORDER BY x DESC NULLS LAST» обычный индекс не
  // обслуживает, и сортировка 600k строк в памяти уходила в таймаут. Лоты при этом НЕ теряются.
  const sortQ = query.get("sort") || "";
  // Сортировка по значению идёт по РЕАЛЬНЫМ значениям всего каталога (Федор 23.09.2026: «сортировка из общего каталога»):
  // «годные» лоты — в основном запросе, лоты без значения/с мусором (год 0 у 17k лотов, пробег 1.6 млрд миль, нет цены выкупа) —
  // хвостом, после всех годных. Лоты не теряются (правило «каталог показывает всё»), но не стоят в начале сортировки:
  // раньше «Цена выкупа 1-9» открывалась лотами вообще без выкупа, «Год 1-9» — лотами с годом 0.
  const TAIL_SPEC = {
    year_desc:   {ok:"year.not.is.null", miss:"year.is.null"},
    year_asc:    {ok:"year.gte.1940", miss:"or(year.is.null,year.lt.1940)"},   // год 0/1/76/206/1900 — мусор фида (17k лотов)
    mileage_desc:{ok:"odometer_mi.lte.500000", miss:"or(odometer_mi.is.null,odometer_mi.gt.500000)"},   // >500k миль (~2k лотов) — мусор/заглушки (999999)
    buy_now_desc:{ok:"buy_now.not.is.null", miss:"buy_now.is.null"},
    buy_now_asc: {ok:"buy_now.gt.0", miss:"or(buy_now.is.null,buy_now.lte.0)"},
    price_desc:  {ok:"current_bid.not.is.null", miss:"current_bid.is.null"},
    price_asc:   {ok:"current_bid.gt.0", miss:"or(current_bid.is.null,current_bid.lte.0)"},
  };
  const tailSpec = TAIL_SPEC[sortQ] || null;
  const nullTailCol = tailSpec ? sortQ : "";
  if(tailSpec) ands.push(tailSpec.ok);
  // date_desc на общем каталоге: 11 лотов с «плейсхолдер»-датой 2030 года стояли первыми. Основной набор — до +120 дней,
  // хвост (вместе с недатированными) — всё, что дальше.
  const dateCap = (datedOnly && sortQ === "date_desc" && !query.get("auctionDateFrom") && !query.get("auctionDateTo")) ? new Date(Date.now() + 120 * 86400e3).toISOString() : "";
  if(dateCap) ands.push(`sale_date.lte.${dateCap}`);
  if(ands.length) p.set("and", `(${ands.join(",")})`);
  p.set("order", `${sortMap[query.get("sort") || "soon"] || sortMap.soon},id.asc`);

  // Полный VIN (17 знаков): точное совпадение по индексу вместо ilike '%vin%' (seq-scan 600k строк → 8с → live-фолбэк с
  // пустым ответом), и БЕЗ ограничений вкладки — покупатель ищет машину, показываем все её заходы: живые и проданные, новые первыми
  // (Volvo XC60 YV4M12RC4T1297163: разобранной продана 25.08, собранной — 22.09 под другим номером лота).
  const vinFull = String(query.get("vin") || query.get("q") || "").trim().toUpperCase();
  if(/^[A-HJ-NPR-Z0-9]{17}$/.test(vinFull)){
    for(const k of [...p.keys()]) if(k !== "select") p.delete(k);
    p.set("vin", `eq.${vinFull}`);
    p.set("order", "sale_date.desc.nullslast,id.asc");
    datedOnly = false; pastTail = false;
  }
  const perPage = Math.min(100, Math.max(1, Number(query.get("per_page") || query.get("limit") || 50) || 50));
  const page = Math.max(1, Number(query.get("page") || 1) || 1);
  const offset = (page - 1) * perPage;
  const hasNarrowFilter = !!(query.get("make") || query.get("model") || query.get("generation") || query.get("vin") || query.get("q") || query.get("name"));
  // «Широкий» фильтр = любой параметр кроме служебных (вкладка/площадка/сортировка/страница) и без марки/модели/поиска.
  const NON_FILTER_KEYS = new Set(["tab", "auction", "sort", "page", "per_page", "limit", "lang", "_", "fresh", "action", "vehicleType", "debug"]);
  const hasBroadFilter = !hasNarrowFilter && [...query.keys()].some(k => !NON_FILTER_KEYS.has(k));
  let broadCountP = null;
  if(hasBroadFilter){
    // Счёт НЕ зависит от сортировки: убираем предикаты сортировки (годные значения, потолок даты) и возвращаем полный
    // предикат вкладки вместо «только датированные». Иначе total менялся при смене сортировки (167 → 277 у Timed).
    const cAnds = ands.filter(x => !(tailSpec && x === tailSpec.ok) && !(dateCap && x === `sale_date.lte.${dateCap}`))
      .map(x => (datedOnlyFull && x === datedOnlyFull[0]) ? datedOnlyFull[1] : x);
    const pc = new URLSearchParams(p); pc.delete("order"); pc.set("select", "id"); pc.set("and", `(${cAnds.join(",")})`);
    broadCountP = countRows(url, key, pc);
  }

  const controller = new AbortController();
  // 8с: с индексами обычный запрос ~0.1–1.5с; но редкий тяжёлый (дефолтная
  // выдача без фильтра) может дойти до 5с — лучше отдать полные данные из базы
  // (ответ кэшируется CDN на 15 мин, посетитель ждёт только первый раз), чем
  // уйти на неполный live-API и заодно трипнуть circuit breaker.
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  T.q = p.toString().slice(0, 400); T.mainStart = Date.now() - T.t0;
  try{
    response = await fetch(`${url}/rest/v1/api_lots?${p}`, {
      headers:{
        apikey:key,
        authorization:`Bearer ${key}`,
        // Архив: точный счётчик — выборка ограничена проданными (~50k, частичный индекс), а estimated после
        // массовой чистки без ANALYZE врал в 50 раз («Архив 1k» при 49k продаж).
        // 23.09.2026 01:00: count=estimated у PostgREST = СНАЧАЛА точный count по всей выборке (600k строк → 5–15с!),
        // и только потом решение «взять оценку». Сам range-запрос без count — 165мс. Поэтому: без фильтров — только
        // оценка планировщика (planned, ~200мс), с маркой/моделью/поиском — точный count (выборка маленькая).
        prefer:hasNarrowFilter ? "count=exact" : hasBroadFilter ? "count=none" : "count=planned",
        range:`${offset}-${offset + perPage - 1}`,
        "range-unit":"items"
      },
      signal:controller.signal
    });
  }finally{ clearTimeout(timer); T.main = Date.now() - T.t0; }
  // 416 = PostgREST «диапазон вне результата»: запрошена страница дальше конца
  // выборки (мало лотов по фильтру, клиент листает). Это НЕ сбой базы — отдаём
  // корректную пустую страницу с total из Content-Range. Раньше бросали ошибку →
  // «searchFromDb fallback: 416» в логах и лишний медленный live-запрос (60 раз
  // за 15 минут в алерте Vercel 14.09.2026).
  const total416 = response.status === 416 ? (Number((response.headers.get("content-range") || "*/0").split("/").pop()) || 0) : 0;
  if(response.status === 416 && !datedOnly){
    return {_db:true, items:[], total:total416 || (broadCountP ? await broadCountP.catch(() => 0) : 0), page, perPage, _source:"db"};
  }
  if(!response.ok && response.status !== 416) throw new Error(`lots db search failed: ${response.status}`);
  let rows = response.status === 416 ? [] : await response.json();
  let total = response.status === 416 ? total416 : (Number((response.headers.get("content-range") || "*/0").split("/").pop()) || rows.length);
  let totalIsFull = false;
  if(broadCountP){ const n = await broadCountP.catch(() => 0); if(n > 0){ total = n; totalIsFull = true; } }
  // Общий каталог шёл только по датированным (быстрый range-scan). Недатированные «Future»
  // добавляем отдельным дешёвым запросом (sale_date IS NULL — тот же индекс): в счётчик всегда,
  // в выдачу — когда датированные закончились (глубокие страницы). Сбой хвоста не критичен.
  // Явный диапазон дат — недатированные лоты в выдачу не подмешиваем (раньше хвост «без даты» шёл и при фильтре по датам).
  const hasDateRange = !!(query.get("auctionDateFrom") || query.get("auctionDateTo"));
  const dateTail = !hasDateRange && !hasSaleStatus && ((datedOnly && (query.get("sort") || "soon").match(/^(soon|smart|date_asc|date_desc)$/)) || (pastTail && (query.get("sort") || "soon").match(/^(soon|smart|date_desc)$/)));
  if(dateTail || tailSpec){
    try{
      const p2 = new URLSearchParams(p);
      const ands2 = dateTail
        ? ands.filter(x => !x.startsWith("sale_date.gte.") && !x.startsWith("sale_date.lte."))
        : ands.filter(x => x !== tailSpec.ok);
      ands2.push(dateTail ? (dateCap ? `or(sale_date.is.null,sale_date.gt.${dateCap})` : "sale_date.is.null") : tailSpec.miss);
      p2.set("and", `(${ands2.join(",")})`);
      p2.set("order", "id.asc");
      const need = Math.max(0, perPage - rows.length);
      const off2 = Math.max(0, offset - total);
      // Хвост нужен только на глубоких страницах; счётчик недатированных кэшируем на 6ч
      // (ключ = набор фильтров) — иначе второй запрос добавлял 1–4с к каждой странице.
      const tailKey = p2.toString();
      const tc = undatedCountCache.get(tailKey);
      if(need === 0 && tc && Date.now() - tc.at < 6 * 3600e3){ if(!totalIsFull) total += tc.n; throw null; }
      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 3000);
      let r2;
      try{
        r2 = await fetch(`${url}/rest/v1/api_lots?${p2}`, {
          headers:{apikey:key, authorization:`Bearer ${key}`, prefer:hasNarrowFilter ? "count=exact" : "count=planned",
            range:`${off2}-${off2 + Math.max(need, 1) - 1}`, "range-unit":"items"},
          signal:ctrl2.signal
        });
      }finally{ clearTimeout(t2); }
      if(r2 && (r2.ok || r2.status === 416)){
        const undated = Number((r2.headers.get("content-range") || "*/0").split("/").pop()) || 0;
        if(r2.ok && need > 0){ const extra = await r2.json(); rows = rows.concat(extra.slice(0, need)); }
        if(!totalIsFull) total += undated;
        undatedCountCache.set(tailKey, {n:undated, at:Date.now()});
        if(undatedCountCache.size > 200) undatedCountCache.delete(undatedCountCache.keys().next().value);
      }
    }catch(e){ /* без хвоста — отдаём датированные (null = взяли счётчик из кэша) */ }
  }
  T.tail = Date.now() - T.t0;
  // Вкладка без фильтров: единый счётчик, не зависящий от сортировки (см. tabTotal).
  // vehicleType — тоже «без фильтров»: список «Автомобили» берёт то же число, что витрина (533k), а не оценку своего запроса (511k).
  const FILTER_FREE = new Set(["tab", "auction", "sort", "page", "per_page", "limit", "lang", "_", "fresh", "action", "vehicleType"]);
  const vtQ = String(query.get("vehicleType") || "").replace(/[^0-9]/g, "");
  const unfiltered = [...query.keys()].every(k => FILTER_FREE.has(k)) && ["all", "soon", "buy_now", "archived"].includes(tab) && (!vtQ || tab === "all");
  // tabTotal — только оценки планировщика (~200мс каждая), поэтому ждём: иначе первый ответ инстанса показывал
  // оценку основного запроса (564k), а следующий — tabTotal (599k), и число «прыгало» между инстансами.
  if(unfiltered){
    const t = await tabTotal(tab, query.get("auction"), vtQ || undefined).catch(() => 0);
    // buy_now: оценка «без даты» у планировщика иногда 0 (частичного индекса под Buy Now пока нет) — не занижаем.
    if(t > 0) total = tab === "buy_now" ? Math.max(t, total) : t;
  }
  return {
    _db:true,
    items:rows.map(r => r.payload).filter(Boolean).map(sanitizeStoredLot),
    total,
    page,
    perPage,
    _source:"db"
  };
}

// ================= Сопоставимые продажи (action=comps) =================
// Оценка рынка и прогноз ставки по РЕАЛЬНЫМ проданным лотам той же модели с
// фильтром по топливу, году и пробегу (медиана устойчивее к выбросам, чем
// среднее). Тянет проданные лоты из api_lots и фильтрует тирами от узкого к
// широкому — берём первый тир с достаточным числом сопоставимых.
const FUEL_TEXT_TO_ID = {
  gasoline:4, petrol:4, gas:4, "бензин":4, benzina:4,
  diesel:1, "дизель":1, motorina:1,
  hybrid:3, "гибрид":3, hibrid:3, phev:3, "plug-in":3, plugin:3,
  electric:2, ev:2, "электро":2, "электрический":2
};
function fuelTextToId(v){
  const raw = String(v || "").trim().toLowerCase();
  if(/^\d+$/.test(raw)) return Number(raw);
  return FUEL_TEXT_TO_ID[raw] || 0;
}
function median(arr){
  if(!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
function percentile(arr, pct){
  if(!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round((pct / 100) * (s.length - 1))))];
}
// «Утиль» — машины, которые к нам не возят и которые занижают медиану: не
// восстановимые по титулу или уничтоженные типом повреждения. ВАЖНО: обычный
// Salvage/Rebuildable/Clear и даже Rollover/All Over — нормальные восстановимые
// авто (их и импортируют), их НЕ трогаем. Отсекаем только настоящий хлам.
const JUNK_TITLE = /non-?repairable|cert(ificate)?\s*of\s*destruction|junk|parts?\s*only|for\s*parts|dismantle|scrap|destroyed|bill\s*of\s*sale/i;
const JUNK_DAMAGE = /burn|flood|water|biohazard/i;
function isJunkLot(l){
  const t = (safeName(l && l.title) + " " + safeName(l && l.detailed_title)).toLowerCase();
  if(JUNK_TITLE.test(t)) return true;
  const d = (safeName(l && l.damage && l.damage.main) + " " + safeName(l && l.damage && l.damage.second)).toLowerCase();
  if(JUNK_DAMAGE.test(d)) return true;
  return false;
}
// «Тяжёлые» — структурно разбитые (перевёртыш, всё вокруг, рама, лонжерон): цену
// уводят вниз и это не «нормальная восстановимая» машина. Исключаем из оценки.
const HEAVY_DAMAGE = /all over|roll\s?over|undercarriage|frame|total loss|strip/i;
function isHeavyLot(l){
  const d = (safeName(l && l.damage && l.damage.main) + " " + safeName(l && l.damage && l.damage.second)).toLowerCase();
  return HEAVY_DAMAGE.test(d);
}
// Сырой пул проданных зависит ТОЛЬКО от марки+модели, а comps дёргается на
// каждом лоте (год/пробег/топливо разные → разные ключи ответа). Без этого
// кэша тяжёлая выгрузка архива (~1МБ/страница, ~5–10с) повторялась бы на каждом
// лоте одной модели и упиралась в 12с-abort → ok:false. Кэшируем пул на 30 мин.
const soldPoolCache = new Map();
const SOLD_POOL_TTL = 30 * 60e3;
// Полная история проданных из НАШЕЙ базы api_lots (~15k проданных, топливо и
// повреждения отдельными колонками) — правильный источник comps, как своя БД у
// DreamBid/BidCars. Отделяет гибрид от бензина (fuel_id), чего агрегат не умеет.
async function fetchSoldCompsFromDb(makeId, modelId){
  if(!(await lotsDbReady())) return null;
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if(!url || !key) return null;
  const p = new URLSearchParams();
  p.set("select", "auction,year,fuel_id,odometer_mi,final_bid,generation_id,condition_id,damage,title,document,sale_date");
  p.set("make_id", `eq.${String(makeId).replace(/[^0-9]/g, "")}`);
  p.set("model_id", `eq.${String(modelId).replace(/[^0-9]/g, "")}`);
  p.set("archived", "eq.true");
  p.set("status_id", "eq.6");
  p.set("final_bid", "gt.0");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let response;
  try{
    response = await fetch(`${url}/rest/v1/api_lots?${p}`, {
      headers:{apikey:key, authorization:`Bearer ${key}`, range:"0-1499", "range-unit":"items"},
      signal:controller.signal
    });
  }catch(e){ return null; }finally{ clearTimeout(timer); }
  if(!response || !response.ok) return null;
  let rows; try{ rows = await response.json(); }catch(e){ return null; }
  if(!Array.isArray(rows) || !rows.length) return null;
  const soldBefore = Date.now() - 12 * 3600e3;
  const out = [];
  for(const r of rows){
    const fb = Number(r.final_bid) || 0;
    if(fb <= 0) continue;
    const saleTs = r.sale_date ? Date.parse(r.sale_date) : NaN;
    if(Number.isFinite(saleTs) && saleTs > soldBefore) continue; // не берём ещё не отторгованные
    const titleTxt = `${r.title || ""} ${r.document || ""}`.toLowerCase();
    const dmgTxt = String(r.damage || "").toLowerCase();
    if(JUNK_TITLE.test(titleTxt) || JUNK_DAMAGE.test(dmgTxt)) continue;   // утиль не берём
    out.push({final_bid:fb, year:Number(r.year) || 0, odometer_mi:Number(r.odometer_mi) || 0,
      fuel_id:Number(r.fuel_id) || 0, gen_id:Number(r.generation_id) || 0,
      run:Number(r.condition_id) === 0, heavy:HEAVY_DAMAGE.test(dmgTxt), dmg:String(r.damage || ""), doc:String(r.document || ""), title:String(r.title || ""), auction:String(r.auction || "")});
  }
  return out.length ? out : null;
}
async function fetchSoldComps(makeId, modelId){
  const ck = `${makeId}:${modelId}`;
  const cc = soldPoolCache.get(ck);
  if(cc){
    if(cc.promise) return cc.promise;   // уже в полёте (другой лот того же make+model в этом же батче) — ждём тот же промис
    if(Date.now() - cc.at < SOLD_POOL_TTL) return cc.rows;
  }
  // Кладём промис в кэш ДО await: конкурентные вызовы для одного make+model (compsbatch по 30 лотам
  // часто содержит несколько одной модели) не должны бить в базу N раз одновременно.
  const p = (async () => {
    let rowsOut = null;
    try{ rowsOut = await fetchSoldCompsFromDb(makeId, modelId); }catch(e){ rowsOut = null; }
    if(!rowsOut) rowsOut = await fetchSoldCompsLive(makeId, modelId);
    soldPoolCache.set(ck, {rows:rowsOut, at:Date.now()});
    return rowsOut;
  })();
  soldPoolCache.set(ck, {promise:p});
  return p;
}
async function fetchSoldCompsLive(makeId, modelId){
  // Фолбэк: тонкий живой срез /cars?status=6, когда база не готова. Страница 100
  // (не 200): 200 весит ~1.5МБ и балансирует на грани 12с-abort в fetchJson.
  const items = [];
  for(let page = 1; page <= 8; page++){
    const params = new URLSearchParams({
      manufacturer_id:String(makeId), model_id:String(modelId),
      status:"6", per_page:"100", page:String(page), simple_paginate:"1"
    });
    let chunk;
    try{ chunk = findItems(await fetchJson(`${AUCTIONS_API_BASE}/cars?${params}`)); }
    catch(e){ break; }
    if(!chunk || !chunk.length) break;
    items.push(...chunk);
    if(chunk.length < 100) break;
  }
  if(!items.length) return null;
  // Порог «торги реально завершились»: 12ч назад. Фид помечает status=6 и у
  // живых/будущих лотов, где final_bid == текущая пред-ставка (не молоток) —
  // такие лоты давали «живые машины за $1500». Берём только прошедшие продажи.
  const soldBefore = Date.now() - 12 * 3600e3;
  const out = [];
  for(const v of items){
    const year = safeNumber(v && v.year);
    const fuelId = fuelTextToId(safeName(v && v.fuel));
    const genId = Number((v && v.generation && v.generation.id) || 0) || 0;
    const lots = Array.isArray(v && v.lots) ? v.lots : [];
    for(const l of lots){
      const st = Number((l && l.status && (l.status.id != null ? l.status.id : l.status)) || 0);
      const fb = safeNumber(l && (l.final_bid || l.bid));
      const odo = safeNumber(l && l.odometer && l.odometer.mi);
      // Торги должны быть в прошлом (не сегодня-вживую и не будущая дата): иначе
      // final_bid — это текущая пред-ставка, а не финальная цена продажи.
      const saleTs = l && l.sale_date ? Date.parse(l.sale_date) : NaN;
      const settled = Number.isFinite(saleTs) && saleTs <= soldBefore;
      // Состояние «на ходу» — сильнейший фактор цены salvage. Определяем по id
      // условия (0 = run_and_drives), не по тексту: «not run» содержит «run».
      const condId = l && l.condition && (l.condition.id != null ? Number(l.condition.id) : null);
      const condName = safeName(l && l.condition).toLowerCase();
      const run = condId === 0 || (condId == null && /(runs? and drive|заводится и едет)/.test(condName));
      // Утиль (не восстановимый / сгоревший / утопленник / биохазард) не возят —
      // он занижает медиану, поэтому в оценку рынка не берём вовсе.
      if(st === 6 && fb > 0 && settled && !isJunkLot(l)) out.push({final_bid:fb, year, odometer_mi:odo, fuel_id:fuelId, gen_id:genId, run, heavy:isHeavyLot(l)});
    }
  }
  return out.length ? out : null;
}
// Крен «средней» вверх — к НОРМАЛЬНЫМ восстановимым экземплярам, а не к рухляди
// из нижнего хвоста salvage. Медиана всего salvage занижает (Fusion Hybrid: реально
// нормальный $4-6k, а медиана всех продаж ~$1.7k из-за дохлых батарей/тяжёлых).
// Поэтому ведущее число = взвешенный p65, диапазон = p45–p88. Это ДАННЫЕ (реальные
// перцентили проданных), просто смещённые к верхней части. Настраивается здесь.
const EST_CENTER_PCTL = 70;
const EST_LO_PCTL = 45;
const EST_HI_PCTL = 88;
// База для моделей ВНЕ таблицы — аналог «актуаластат»: средняя цена всех продаж кузова (и топлива)
// из нашей истории, с отсечением 5% хвостов. Меньше 8 продаж — не считаем.
// K для базы из НАШИХ данных = 1.0, а не 1.2: у Федора 1.2 поднимает «среднюю по всей истории» (с утилем)
// до уровня нормальной машины, а наш пул уже без утиля — проверка на продажах дала K≈1.03 (RAV4, Camry).
const DATA_GUIDE_K = 1.0;
// База сужается по году как строки его таблицы (диапазоны 2–4 года): сначала год ±1, затем ±2, затем весь кузов.
function dataGuideBase(rows, g, fuelId, year){
  if(!rows || !rows.length || !g || !g.genFrom) return null;
  let gen = rows.filter(r => r.final_bid > 0 && r.year >= g.genFrom && r.year <= g.genTo);
  if(fuelId){ const f = gen.filter(r => Number(r.fuel_id) === Number(fuelId)); if(f.length >= 8) gen = f; else if(gen.some(r => r.fuel_id && Number(r.fuel_id) !== Number(fuelId))) return null; }
  if(gen.length < 8) return null;
  let base = gen;
  const yr = Number(year) || 0;
  if(yr){ for(const d of [1, 2]){ const near = gen.filter(r => Math.abs(r.year - yr) <= d); if(near.length >= 8){ base = near; break; } } }
  const v = base.map(r => r.final_bid).sort((a, b) => a - b);
  const cut = Math.floor(v.length * 0.05), t = v.slice(cut, v.length - cut);
  return t.reduce((a, b) => a + b, 0) / t.length;
}

function computeComps(rows, meta){
  const yr = Number(meta.year) || 0, odo = Number(meta.odometer) || 0;
  const fuel = Number(meta.fuelId) || 0;
  const genFrom = Number(meta.genFrom) || 0, genTo = Number(meta.genTo) || 0;
  const hasGenRange = genFrom > 0 && genTo >= genFrom;
  const inGenRange = r => !hasGenRange || ((Number(r.year) || 0) >= genFrom && (Number(r.year) || 0) <= genTo);

  // Оценка по ПОХОЖЕСТИ, а не одна медиана на всё поколение. Внутри одного кузова
  // цена сильно зависит от года и пробега: свежий малопробежный стоит вдвое больше
  // убитого пробежного. Поэтому берём проданные того же поколения (без утиля и без
  // структурно-тяжёлых), и взвешиваем каждый лот по близости к оцениваемому по году
  // и пробегу — близкие определяют цену, далёкие почти не влияют. Состояние
  // «заводится/нет» НЕ фильтруем: не на ходу ≠ плохая машина (может быть целой).
  const notWreck = r => Number(r.final_bid) > 0 && !r.heavy && inGenRange(r);
  let base = rows.filter(notWreck);
  let fuelMatched = false;
  if(fuel){
    const f = base.filter(r => Number(r.fuel_id) === fuel);
    if(f.length >= 3){ base = f; fuelMatched = true; }   // топливо: гибрид→гибрид (порог 3)
  }
  // Мало продаж своего поколения → не выдумываем, отдаём агрегату /statistics.
  if(hasGenRange && base.length < 4) return null;
  if(base.length < 2) return null;
  // СТРОГО тот же год (как просил Фёдор): 2017 → берём 2017. Окно года расширяем
  // только если своих мало (<4): ±1, ±2, ±3, иначе — всё поколение как было.
  let yearMatched = false;
  if(yr){
    for(const w of [0, 1, 2, 3]){
      const yb = base.filter(r => Math.abs((Number(r.year) || 0) - yr) <= w);
      // Нужно ≥8 сопоставимых для устойчивой оценки; иначе окно года шире. Так
      // «тонкий» год (5 дешёвых лотов) не даёт заниженную цифру с потолком $1800.
      if(yb.length >= 8){ base = yb; yearMatched = w === 0; break; }
      if(w === 3 && yb.length >= 2){ base = yb; yearMatched = false; }
    }
  }
  // Машина топливо-чувствительная (гибрид/электро/дизель), но своих по топливу не
  // набралось И год не совпал → выборка мешает бензин и чужие годы (напр. свежий
  // 530e plug-in: 4 случайных G30). Лучше отдать агрегату /statistics — там есть
  // объём по двигателю, чем показать бред по 4 несопоставимым лотам.
  const fuelSensitive = fuel === 1 || fuel === 2 || fuel === 3;
  if(fuelSensitive && !fuelMatched && !yearMatched && base.length < 8) return null;

  // Вес похожести: 1 год ≈ 40к миль по влиянию; далёкие быстро затухают.
  const wOf = r => {
    const dy = yr ? Math.abs((Number(r.year) || 0) - yr) : 0;
    const dm = odo ? Math.abs((Number(r.odometer_mi) || 0) - odo) : 0;
    return 1 / (1 + (dy / 2) * (dy / 2) + (dm / 40000) * (dm / 40000));
  };
  // Взвешенный перцентиль С ИНТЕРПОЛЯЦИЕЙ между соседними лотами: при малой
  // выборке ступенчатый перцентиль прыгает (p82=$3025, p88=$5800), а нужное
  // значение в разрыве. Интерполяция даёт плавную цену внутри разрыва.
  const wPct = pct => {
    const s = base.map(r => ({v:Number(r.final_bid), w:wOf(r)})).sort((a, b) => a.v - b.v);
    const tot = s.reduce((a, b) => a + b.w, 0);
    if(tot <= 0) return 0;
    const target = pct / 100 * tot;
    let cum = 0;
    for(let i = 0; i < s.length; i++){
      const prev = cum; cum += s[i].w;
      if(cum >= target){
        if(i === 0 || s[i].w <= 0) return Math.round(s[i].v);
        const frac = Math.max(0, Math.min(1, (target - prev) / s[i].w));
        return Math.round(s[i - 1].v + (s[i].v - s[i - 1].v) * frac);
      }
    }
    return Math.round(s[s.length - 1].v);
  };
  let sw = 0, sv = 0;
  for(const r of base){ const w = wOf(r); sw += w; sv += w * Number(r.final_bid); }
  const prices = base.map(r => Number(r.final_bid));
  // Перцентиль ведущей цены — ПО СОСТОЯНИЮ оцениваемого лота: хороший экземпляр
  // (заводится, лёгкое повреждение) стоит у ВЕРХА диапазона своего года, убитый —
  // у низа. Хорошие цены в пуле как раз и есть хорошие экземпляры.
  const cq = meta.cq === "good" || meta.cq === "poor" ? meta.cq : "mid";
  const centerP = cq === "good" ? 90 : cq === "poor" ? 45 : 68;
  // Диапазон — ОТ средней и ВВЕРХ (нижний хвост не показываем): низ = центр.
  const loP = centerP, hiP = Math.min(98, centerP + 8);
  // Примеры — ближайшие по году+пробегу (1 год ≈ 15к миль для сортировки).
  const samples = base.slice()
    .sort((a, b) => (Math.abs((a.odometer_mi || 0) - odo) + Math.abs((a.year || 0) - yr) * 15000)
                  - (Math.abs((b.odometer_mi || 0) - odo) + Math.abs((b.year || 0) - yr) * 15000))
    .slice(0, 6)
    .map(r => ({year:r.year || null, mi:Math.round(r.odometer_mi) || null, run:!!r.run, price:Math.round(r.final_bid)}));
  return {
    count:base.length,
    // Ведущее число и диапазон — по состоянию лота (см. centerP/loP/hiP).
    median:wPct(centerP), mean:sw ? Math.round(sv / sw) : 0,
    trueMedian:wPct(50),
    min:Math.min(...prices), max:Math.max(...prices),
    p25:wPct(loP), p75:wPct(hiP),
    match:{fuel:fuelMatched, year:yearMatched, mileage:!!odo, gen:hasGenRange},
    samples
  };
}

// Ориентир ставки по одному лоту, из объекта-like-URLSearchParams (q.get(key)) — используется и
// одиночным action=comps, и пачкой action=compsbatch (см. ниже), чтобы не дублировать логику.
async function computeCompsForQ(q){
  const makeId = String(q.get("manufacturer_id") || q.get("make_id") || "").replace(/[^0-9]/g, "");
  const modelId = String(q.get("model_id") || "").replace(/[^0-9]/g, "");
  if(!makeId || !modelId) return null;
  try{
    const yearG = Number(String(q.get("year") || "").replace(/[^0-9]/g, "")) || 0;
    const runG = String(q.get("run") || "");
    const coef = priceGuide.conditionCoef({dmg:q.get("dmg"), dmg2:q.get("dmg2"), cond:q.get("cond"),
      run:runG === "1" ? true : runG === "0" ? false : null, doc:q.get("doc")});
    const hasCond = !!(q.get("dmg") || q.get("cond"));
    const row = hasCond ? priceGuide.matchGuide(await priceGuide.loadGuide(), {make:q.get("make_name"), model:q.get("model_name"),
      title:q.get("title"), gen:q.get("gen"), year:yearG, fuel:q.get("fuel")}) : null;
    const miF = priceGuide.mileageFactor(String(q.get("odometer") || "").replace(/[^0-9]/g, ""));
    let band = row ? priceGuide.guideBand(row.base_price * miF, row.k, coef) : null, src = "guide";
    if(!band && hasCond && yearG){
      const pool = await fetchSoldComps(makeId, modelId);
      const g = await resolveGenRange(modelId, yearG, "");
      const cc = (g && g.genFrom) ? computeComps(pool, {year:yearG, odometer:String(q.get("odometer") || "").replace(/[^0-9]/g, ""),
        fuelId:fuelTextToId(q.get("fuel")), genFrom:g.genFrom, genTo:g.genTo, cq:String(q.get("cq") || "mid")}) : null;
      if(cc && cc.count >= 6 && cc.p25 > 0 && cc.p75 >= cc.p25){
        const r100 = v => Math.round(v / 100) * 100;
        band = {lo:r100(cc.p25), mid:r100(cc.median), hi:r100(Math.max(cc.p75, cc.p25 * 1.05))}; src = "data";
      }else{
        const base = dataGuideBase(pool, g, fuelTextToId(q.get("fuel")), yearG);
        if(base){ band = priceGuide.guideBand(base, DATA_GUIDE_K, coef); src = "data"; }
      }
    }
    if(band) return {guide:true, src, p25:band.lo, p75:band.hi, median:band.mid, trueMedian:band.mid, count:0, match:{gen:true, fuel:true}};
  }catch(e){ /* ориентир не получился — ниже прежняя оценка по похожим продажам */ }
  try{
    const rows = await fetchSoldComps(makeId, modelId);
    if(rows && rows.length){
      const runQ = String(q.get("run") || "");
      const run = runQ === "1" ? true : runQ === "0" ? false : null;
      const yearQ = Number(String(q.get("year") || "").replace(/[^0-9]/g, "")) || 0;
      let genIdQ = String(q.get("generation_id") || "").replace(/[^0-9]/g, "");
      if(parseSynGen(genIdQ)) genIdQ = "";
      const {genFrom, genTo} = await resolveGenRange(modelId, yearQ, genIdQ);
      const cqQ = String(q.get("cq") || "");
      const stats = computeComps(rows, {year:yearQ, odometer:q.get("odometer"), fuelId:fuelTextToId(q.get("fuel")), genId:genIdQ, genFrom, genTo, run, cq:cqQ});
      if(stats) return stats;
    }
  }catch(e){ /* база недоступна — выше уровень (compsbatch) откатится на /statistics */ }
  return null;
}

// Агрегат /statistics по make+model — дедуп + кэш 30 мин, как у fetchSoldComps (используется
// компасбатчем как последний фолбэк, когда для лота нет ни строки в таблице Федора, ни похожих продаж).
const statsRowsCache = new Map();
const STATS_ROWS_TTL = 30 * 60e3;
async function fetchStatsRows(makeId, modelId){
  const ck = `${makeId}:${modelId}`;
  const cc = statsRowsCache.get(ck);
  if(cc){
    if(cc.promise) return cc.promise;
    if(Date.now() - cc.at < STATS_ROWS_TTL) return cc.rows;
  }
  const p = (async () => {
    let rows = [];
    try{
      const p2 = new URLSearchParams({manufacturer_id:String(makeId), model_id:String(modelId)});
      const data = await fetchJson(`${AUCTIONS_API_BASE}/statistics?${p2}`);
      rows = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    }catch(e){ rows = []; }
    statsRowsCache.set(ck, {rows, at:Date.now()});
    return rows;
  })();
  statsRowsCache.set(ck, {promise:p});
  return p;
}
// Зеркало клиентского forecastFromRows (auctions.js) — взвешенное среднее /statistics по году±tol,
// сужение по двигателю, если есть.
function statsForecast(rows, yearQ, engineId, tol){
  let scope = yearQ ? rows.filter(x => Math.abs(Number(x.year) - yearQ) <= tol) : rows;
  if(!scope.length) return null;
  const byEngine = engineId ? scope.filter(x => x.engine && Number(x.engine.id) === Number(engineId)) : [];
  if(byEngine.length) scope = byEngine;
  let sumW = 0, cnt = 0;
  scope.forEach(x => { const c = Number(x.lot_count) || 0, avg = Number(x.avg_final_bid) || 0; if(avg > 0 && c > 0){ sumW += avg * c; cnt += c; } });
  if(cnt < 2) return null;
  const avg = sumW / cnt;
  return {lo:Math.round(avg * 0.8 / 50) * 50, hi:Math.round(avg * 1.15 / 50) * 50};
}

// ================= Синхронизация каталога в Supabase (action=synclots) =================
// Официальная схема интеграции auctionsapi.com: фаза "full" — первичный импорт
// /cars постранично (per_page=1000), фаза "incr" — /cars?minutes=NN + /archived-lots.
// Живёт внутри этой функции из-за лимита Vercel Hobby (12 serverless-функций);
// снаружи доступна как /api/sync-lots (rewrite). Защищена локом ~5 мин.

const SYNC_PER_PAGE = 1000;
const SYNC_PAGES_PER_RUN = 8;
const SYNC_LOCK_MINUTES = 3;
const SYNC_RUN_BUDGET_MS = 45000;

function syncSb(){
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if(!url || !key) throw new Error("Supabase env is not configured");
  return {url, key};
}

async function syncSbFetch(path, options = {}){
  const {url, key} = syncSb();
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers:{apikey:key, authorization:`Bearer ${key}`, "content-type":"application/json", ...(options.headers || {})}
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  if(!res.ok){
    const error = new Error(payload?.message || `Supabase ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return payload;
}

async function syncGetState(){
  const rows = await syncSbFetch(`/api_sync_state?k=eq.main&select=v`);
  return (rows && rows[0] && rows[0].v) || {};
}

// Один писатель в api_lots одновременно: инкремент, syncclosed и syncsettle делят lock_at
// (параллельные upsert одних и тех же лотов ждали друг друга и упирались в statement timeout).
async function acquireSyncLock(){
  const st = await syncGetState().catch(() => null);
  if(!st) return false;
  const lockAt = st.lock_at ? new Date(st.lock_at).getTime() : 0;
  if(Date.now() - lockAt < SYNC_LOCK_MINUTES * 60e3) return false;
  st.lock_at = new Date().toISOString();
  await syncSetState(st);
  return true;
}
// info — короткий итог для диагностики (?action=dbstatus → sync.v.last_<name>).
async function releaseSyncLock(name, info){
  try{ const st = await syncGetState(); st.lock_at = null; if(name) st["last_" + name] = {at:new Date().toISOString(), ...(info || {})}; await syncSetState(st); }catch(e){}
}

async function syncSetState(v){
  await syncSbFetch(`/api_sync_state?on_conflict=k`, {
    method:"POST",
    headers:{prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({k:"main", v, updated_at:new Date().toISOString()})
  });
}

// Свой фетч с таймаутом 30с: страницы по 1000 лотов тяжелее обычных запросов.
async function syncApiFetch(url, timeoutMs){
  const key = process.env.AUCTIONS_API_KEY;
  if(!key) throw new Error("AUCTIONS_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || 30000);
  try{
    const res = await fetch(url, {headers:{"x-api-key":key, accept:"application/json"}, signal:controller.signal});
    const payload = await res.json().catch(() => null);
    if(!res.ok || payload?.error){
      const error = new Error(payload?.message || payload?.error || `AuctionsAPI ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return payload;
  }finally{ clearTimeout(timer); }
}

// item (сырой ответ API) → строка таблицы api_lots.
// payload — нормализованный лот в том же виде, что отдаёт action=search.
function syncRowFromItem(item, {archived = false} = {}){
  const lot = (Array.isArray(item?.lots) && item.lots[0]) || item?.lot || item || {};
  // Только Copart (3) и IAAI (1): Encar/Корея (12) не наш рынок, и normalizeAuction
  // ошибочно записывал бы такие лоты как «copart».
  const rawDomain = lot?.domain || item?.domain;
  const domainId = rawDomain && typeof rawDomain === "object" ? Number(rawDomain.id) : null;
  const domainName = String((rawDomain && rawDomain.name) || rawDomain || "").toLowerCase();
  if(domainId === 12 || domainName.includes("encar")) return null;
  if(domainId != null && domainId !== 1 && domainId !== 3) return null;
  const auction = normalizeAuction(item?.auction || lot?.auction || item?.domain || lot?.domain || "copart");
  const normalized = normalizeLot(item, auction);
  if(!normalized.lot) return null;
  // Обложка + до 4 фото: карточке каталога хватает, детальная всегда live.
  if(Array.isArray(normalized.images) && normalized.images.length > 4){
    normalized.images = normalized.images.slice(0, 4);
  }
  const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : null; };
  const enumId = v => (v && typeof v === "object" && v.id != null) ? Number(v.id) : (typeof v === "number" ? v : null);
  const saleDateRaw = lot?.sale_date || lot?.auction_date || null;
  const saleDate = saleDateRaw && !Number.isNaN(new Date(saleDateRaw).getTime()) ? new Date(saleDateRaw).toISOString() : null;
  const statusId = normalized.statusId != null ? normalized.statusId : enumId(lot?.status);
  // Лот с будущей датой торгов и не проданный — НИКОГДА не архивный, даже если
  // фид или архивный синк говорят archived=true (фид иногда так помечает
  // переставленные/переоткрытые лоты). Иначе живые лоты пропадают из каталога.
  const isFutureSale = saleDate && Date.parse(saleDate) > Date.now();
  // Архив = ТОЛЬКО продан (6) и торги прошли. «Не продан» (8) и флаг archived из /archived-lots без продажи —
  // непроданный раунд: лот перевыставляют (RAV4 62012166: 17 раундов not_sold, «Купить сейчас», торги 23.09 —
  // а в архиве висел «продан $7 500»). Такие пишем как живые; finalBid у живых — 0.
  // 23.09.2026: фид отдаёт «sold» БЕЗ даты торгов и без финала (только текущая ставка) — это не продажа. Раньше такие
  // записи уходили в архив с final_bid=0 и ЗАТИРАЛИ настоящие продажи (за ночь потеряно ~25k записей архива).
  const isSold = statusId === 6 && !isFutureSale && !!saleDate;
  const isArchived = isSold;
  if(!isSold){ normalized.finalBid = 0; if(normalized.statusId === 6 || normalized.statusId === 8){ normalized.statusId = 3; normalized.lotStatus = "sale"; normalized.statusName = "sale"; } }
  return {
    id:normalized.id,
    auction,
    lot:String(normalized.lot),
    vin:normalized.vin || null,
    title:normalized.title || null,
    year:num(normalized.year),
    make_id:enumId(item?.manufacturer),
    model_id:enumId(item?.model),
    generation_id:enumId(item?.generation),
    vehicle_type_id:enumId(item?.vehicle_type),
    body_id:enumId(item?.body_type),
    color_id:enumId(item?.color),
    fuel_id:enumId(item?.fuel),
    transmission_id:enumId(item?.transmission),
    drive_id:enumId(item?.drive_wheel),
    condition_id:enumId(lot?.condition),
    cylinders:num(item?.cylinders),
    damage:normalized.damage || null,
    document:normalized.document || null,
    state_code:(lot?.location?.state?.code || "").toLowerCase() || null,
    country:(lot?.location?.country?.iso || "").toLowerCase() || null,
    odometer_mi:num(normalized.odometer),
    current_bid:num(normalized.currentBid) || 0,
    buy_now:num(normalized.buyNow) || 0,
    final_bid:num(normalized.finalBid) || 0,
    sale_date:saleDate,
    status_id:statusId != null && Number.isFinite(Number(statusId)) ? Number(statusId) : null,
    archived:isArchived,
    payload:normalized,
    synced_at:new Date().toISOString()
  };
}

// «Сыгралась → сразу в архив»: /archived-lots отдаёт закрытые торги с лагом и пропусками (RAV4 Prime
// 66820296: продан 22.09 16:00, в /archived-lots?minutes=90 через 2 часа так и не пришёл, хотя /search-lot
// и /search-vin уже отдают sold+$23 000). Поэтому любой проданный лот, который сервер увидел живым запросом
// (страница лота, VIN, VIN-история), тут же дописываем в базу как архивный. Огонь-и-забыть, ошибки глотаем.
function upsertClosedLot(lot){
  try{
    if(!lot || !lot.lot || !lot.auction) return;
    const ts = Date.parse(lot.auctionDate || "");
    const sold = lot.statusId === 6 && Number.isFinite(ts) && ts < Date.now();
    if(!sold){
      // Живой лот (торги впереди / не продан) — «оживляем» строку в базе, если она там архивная или с устаревшей датой.
      if(Number.isFinite(ts) && ts > Date.now()){
        const rid = lot.auction + "-" + lot.lot;
        preserveSoldCopies([rid]).then(() => syncSbFetch(`/api_lots?id=eq.${encodeURIComponent(rid)}`, {method:"PATCH", headers:{prefer:"return=minimal"},
          body:JSON.stringify({archived:false, status_id:lot.statusId || 3, final_bid:0, current_bid:Number(lot.currentBid) || 0, buy_now:Number(lot.buyNow) || 0,
            sale_date:new Date(ts).toISOString(), payload:{...lot, finalBid:0}, synced_at:new Date().toISOString()})})).catch(() => {});
      }
      return;
    }
    const n = v => { const x = Number(v); return Number.isFinite(x) ? Math.round(x) : null; };
    const row = {
      id:`${lot.auction}-${lot.lot}`, auction:lot.auction, lot:String(lot.lot), vin:lot.vin || null, title:lot.title || null,
      year:n(lot.year), make_id:n(lot.makeId), model_id:n(lot.modelId), generation_id:parseSynGen(lot.generationId) ? null : n(lot.generationId),
      fuel_id:fuelTextToId(lot.fuel) || null, condition_id:/not/.test(String(lot.condition || "")) ? 1 : (lot.condition ? 0 : null),
      damage:lot.damage || null, document:lot.document || null, odometer_mi:n(lot.odometer),
      current_bid:n(lot.currentBid) || 0, buy_now:n(lot.buyNow) || 0, final_bid:n(lot.finalBid) || 0,
      sale_date:new Date(ts).toISOString(), status_id:lot.statusId, archived:true,
      payload:{...lot, images:Array.isArray(lot.images) ? lot.images.slice(0, 4) : lot.images}, synced_at:new Date().toISOString()
    };
    syncUpsertRows([row]).catch(() => {});
  }catch(e){ /* не мешаем ответу */ }
}
// Ключевые поля строки: если в базе они те же — строку не переписываем (upsert = переписать 12 индексов + TOAST payload).
const ROW_KEY_FIELDS = ["sale_date", "current_bid", "buy_now", "final_bid", "status_id", "odometer_mi", "archived"];
function sameKeyFields(a, b){
  // Timed и резерв продавца живут в payload: лот, перешедший на Timed-аукцион без смены даты/ставки, раньше считался
  // «неизменившимся» и его признак Timed в базе застревал (DreamBid: 4334 Timed, у нас были сотни).
  const pl = a.payload || {};
  if(("tm" in b) && (!!pl.timed) !== (b.tm === "true")) return false;
  if(("sr" in b) && (Number(pl.sellerReserve) || 0) !== (Number(b.sr) || 0)) return false;
  for(const f of ROW_KEY_FIELDS){
    let x = a[f], y = b[f];
    if(f === "sale_date"){ x = x ? Date.parse(x) : null; y = y ? Date.parse(y) : null; }
    if((x ?? null) !== (y ?? null) && !(Number.isFinite(Number(x)) && Number.isFinite(Number(y)) && Number(x) === Number(y))) return false;
  }
  return true;
}
// Правило Федора (23.09.2026): машина продалась → запись о продаже остаётся в архиве НАВСЕГДА, даже если лот
// перевыставили (Buy Now / новые торги) под тем же номером. Перед тем как перезаписать строку-продажу живой версией
// (или другой продажей с другой датой), копируем её под id `<auction>-<lot>-s<YYYYMMDD>` (archived=true).
const isSaleRow = r => r && r.archived === true && Number(r.final_bid) > 0 && Number(r.status_id) === 6;
async function preserveSoldCopies(ids){
  if(!ids.length) return 0;
  try{
    const full = await syncSbFetch(`/api_lots?id=in.(${ids.map(x => `"${String(x).replace(/[^a-z0-9_-]/gi, "")}"`).join(",")})&select=*`);
    const copies = (Array.isArray(full) ? full : []).filter(isSaleRow).map(r => ({...r, id:`${r.id}-s${String(r.sale_date || "").slice(0, 10).replace(/-/g, "")}`, archived:true}));
    if(!copies.length) return 0;
    await syncSbFetch(`/api_lots?on_conflict=id`, {method:"POST", headers:{prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(copies)});
    return copies.length;
  }catch(e){ return 0; }
}
async function syncUpsertRows(rows, deadline, opts = {}){
  syncUpsertRows.written = 0; syncUpsertRows.unchanged = 0; syncUpsertRows.preserved = 0;
  if(!rows.length) return;
  // Пред-чтение ключевых полей: (а) пропуск неизменившихся, (б) защита записей о продаже от перезаписи.
  try{
    const ids = rows.map(r => `"${String(r.id).replace(/[^a-z0-9_-]/gi, "")}"`).join(",");
    const ex = await syncSbFetch(`/api_lots?id=in.(${ids})&select=id,${ROW_KEY_FIELDS.join(",")},tm:payload->>timed,sr:payload->>sellerReserve`);
    if(Array.isArray(ex)){
      const map = new Map(ex.map(r => [r.id, r]));
      // Строку-продажу нельзя ухудшить: входящая без финала и без БУДУЩИХ торгов (sold без даты, not_sold-раунд
      // без новой даты) просто отбрасывается — продажа остаётся как есть.
      const degrading = r => { const e = map.get(r.id); return isSaleRow(e) && !(Number(r.final_bid) > 0) && !(r.sale_date && Date.parse(r.sale_date) > Date.now()); };
      const before0 = rows.length; rows = rows.filter(r => !degrading(r)); syncUpsertRows.skippedDegrading = before0 - rows.length;
      const toPreserve = rows.filter(r => { const e = map.get(r.id); return isSaleRow(e) && (r.archived !== true || Math.abs((Date.parse(r.sale_date) || 0) - (Date.parse(e.sale_date) || 0)) > 3600e3); }).map(r => r.id);
      if(toPreserve.length) syncUpsertRows.preserved = await preserveSoldCopies(toPreserve);
      if(!rows.length){ syncUpsertRows.written = before0; return; }
      if(!opts.force){
        const before = rows.length;
        rows = rows.filter(r => { const e = map.get(r.id); return !e || !sameKeyFields(r, e); });
        syncUpsertRows.unchanged = before - rows.length;
        syncUpsertRows.written = syncUpsertRows.unchanged;   // «учтены», хоть и не переписаны — страница считается полной
        if(!rows.length) return;
      }
    }
  }catch(e){ /* не смогли сравнить — пишем всё */ }
  // Чанки по 250: батч на 1000 строк упирался в statement timeout,
  // и страница терялась целиком. Один повтор на чанк.
  // 100 (было 250): после ежедневного sweep база тяжелее — 250 снова ловили statement timeout.
  // Чанки пишем по 3 параллельно (23.09.2026): страница в ~900 изменённых строк шла 10 чанков подряд (~5с), обход ближайших торгов
  // успевал ~1 страницу в минуту. Строки разных чанков не пересекаются (уникальные id) — Medium-база держит 3 потока.
  const CHUNK = 100, PAR = 3;
  const writeChunk = async chunk => {
    syncUpsertRows.written += chunk.length;
    try{
      await syncSbFetch(`/api_lots?on_conflict=id`, {
        method:"POST",
        headers:{prefer:"resolution=merge-duplicates,return=minimal"},
        body:JSON.stringify(chunk)
      });
    }catch(e){
      // Таймаут на чанке: пробуем мелкими пачками по 25; если и они падают — пропускаем чанк
      // (лот догонит следующий прогон), но НЕ роняем весь синк.
      await new Promise(r => setTimeout(r, 500));
      for(let j = 0; j < chunk.length; j += 25){
        try{
          await syncSbFetch(`/api_lots?on_conflict=id`, {method:"POST", headers:{prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify(chunk.slice(j, j + 25))});
        }catch(e2){ syncUpsertRows.skipped = (syncUpsertRows.skipped || 0) + Math.min(25, chunk.length - j); }
      }
    }
  };
  for(let i = 0; i < rows.length; i += CHUNK * PAR){
    // Дедлайн прогона: остаток страницы не пишем (инкремент догонит окном 3ч; обход sweep страницу повторит).
    if(deadline && Date.now() > deadline) break;
    const group = [];
    for(let k = 0; k < PAR; k++){ const c = rows.slice(i + k * CHUNK, i + (k + 1) * CHUNK); if(c.length) group.push(c); }
    await Promise.all(group.map(writeChunk));
  }
}

async function syncImportPage(pathBase, page, extraParams = {}, rowOpts = {}, deadline, upsertOpts = {}){
  const p = new URLSearchParams({per_page:String(SYNC_PER_PAGE), page:String(page), simple_paginate:"1", prices_history:"1", ...extraParams});
  const tA = Date.now();
  // Ожидание фида — не дольше остатка бюджета прогона: зависший запрос (30с) вместе с записью выходил за лимит функции 60с,
  // прогон убивался, а курсор обхода не сохранялся → обход вставал на месте (23.09: «ближайшие торги» стояли на странице 22).
  const feedTimeout = deadline ? Math.max(4000, Math.min(30000, deadline - Date.now() - 3000)) : 30000;
  const payload = await syncApiFetch(`${AUCTIONS_API_BASE}${pathBase}?${p}`, feedTimeout);
  const items = findItems(payload) || [];
  const rows = items.map(it => syncRowFromItem(it, rowOpts)).filter(Boolean);
  syncImportPage.lastFetchMs = Date.now() - tA;
  await syncUpsertRows(rows, deadline, upsertOpts);
  syncImportPage.lastComplete = syncUpsertRows.written >= rows.length;
  syncImportPage.lastUnchanged = syncUpsertRows.unchanged || 0;
  syncImportPage.lastWritten = syncUpsertRows.written;
  return items.length;
}

async function handleSyncLots(response){
  response.setHeader("cache-control", "no-store");
  // База в отключке (circuit breaker) — не держим соединение впустую
  if(!sbUp()){
    response.statusCode = 200;
    response.end(JSON.stringify({ok:false, skipped:"db down", continue:false}));
    return;
  }
  const started = Date.now();
  let state;
  try{
    state = await syncGetState();
  }catch(e){
    response.statusCode = 200;
    response.end(JSON.stringify({ok:false, error:"sync tables missing — run supabase/migrations/20260825_api_lots.sql", detail:e.message}));
    return;
  }
  const lockAt = state.lock_at ? new Date(state.lock_at).getTime() : 0;
  if(Date.now() - lockAt < SYNC_LOCK_MINUTES * 60e3){
    response.statusCode = 200;
    response.end(JSON.stringify({ok:true, locked:true, continue:false}));
    return;
  }
  state.lock_at = new Date().toISOString();
  await syncSetState(state);

  const result = {ok:true, phase:state.phase || "full", imported:0, archivedMarked:0};
  const SYNC_DOMAINS = ["3", "1"]; // Copart, затем IAAI (Encar не качаем)
  try{
    if(state.phase !== "incr"){
      // -------- Полный импорт по доменам: SYNC_PAGES_PER_RUN страниц за вызов --------
      if(!state.domain_mode){ state.domain_mode = true; state.domain_idx = 0; state.next_page = 1; }
      let di = Number(state.domain_idx) || 0;
      let page = Number(state.next_page) || 1;
      for(let i = 0; i < SYNC_PAGES_PER_RUN && di < SYNC_DOMAINS.length; i++){
        if(Date.now() - started > SYNC_RUN_BUDGET_MS) break;
        const got = await syncImportPage("/cars", page, {domain_id:SYNC_DOMAINS[di]});
        result.imported += got;
        page += 1;
        // Домен закрываем только на ПУСТОЙ странице: /cars часто отдаёт
        // 990-999 на обычных страницах, и порог <1000 обрывал импорт рано
        if(got === 0){ di += 1; page = 1; }
      }
      if(di >= SYNC_DOMAINS.length){
        state.phase = "incr";
        state.full_done_at = new Date().toISOString();
        state.last_incr_at = new Date().toISOString();
      }
      state.domain_idx = di;
      state.next_page = page;
      result.next_page = page;
      result.domain = SYNC_DOMAINS[di] || "done";
      result.phase = state.phase || "full";
      result.continue = state.phase !== "incr"; // GitHub Actions качает дальше, пока фаза full
    }else{
      // -------- Инкремент: ЛЁГКОЕ обновление (без зацикливания) --------
      // Окно 24ч (API отдаёт пусто на minutes>~1440). Берём первые страницы окна —
      // фид отдаёт свежие reschedule ПЕРВЫМИ (по updated_at), поэтому этого хватает
      // для актуальности дат каталога. НЕ зацикливаемся (continue=false) и держим
      // прогон коротким — агрессивный постраничный дренаж убегал на 100+ страниц,
      // таймаутил прогон и грузил базу, из-за чего мигал comps (главная фича).
      const INCR_WINDOW_MIN = 180;   // было 1440: фид отдаёт свежие первыми, 3 страниц×1000 за 3ч хватает; сутки догоняет ночной обход
      // Внутри pump-цикла sweep (GitHub Actions крутит вызовы, пока continue:true) инкремент НЕ повторяем —
      // раньше каждая итерация заново переписывала 6000 лотов, и база захлёбывалась.
      const lastIncr = state.last_incr_at ? new Date(state.last_incr_at).getTime() : 0;
      // Vercel cron дёргает /api/cron/sync каждые 5 мин (GitHub cron срабатывал 5–6 раз в СУТКИ вместо
      // ежечасно, см. 23.09.2026) — инкремент делаем не чаще раза в ~50 мин, остальные вызовы отдаём sweep или выходим.
      const skipIncr = Date.now() - lastIncr < 50 * 60e3;
      result.incrSkipped = skipIncr;
      // 22.09.2026: после чистки 300k строк база пишет в 4–5 раз медленнее (1000 upsert ≈ 39с), 22с не хватало
      // даже на первую страницу → synс падал по таймауту, каталог отстал на сутки. Бюджет 45с, страниц меньше —
      // фид отдаёт свежие изменения первыми, дальние страницы догоняет ночной обход.
      const INCR_BUDGET = 45000;
      result.steps = [];
      const stepT = () => Date.now() - started;
      result.stage = "incr start";
      if(!skipIncr) for(const domain of SYNC_DOMAINS){
        for(let page = 1; page <= 3; page++){
          if(Date.now() - started > INCR_BUDGET) break;
          const t0 = stepT();
          result.stage = `incr d${domain} p${page}`;
          let got = await syncImportPage("/cars", page, {minutes:String(INCR_WINDOW_MIN), domain_id:domain}, {}, started + INCR_BUDGET);
          let label = `incr d${domain} p${page}`;
          if(got === 0 && page === 1){
            // 23.09.2026: IAAI на окне 3ч отдал 0 лотов (Copart — 3000). Страховка: сутки, одна страница.
            got = await syncImportPage("/cars", 1, {minutes:"1440", domain_id:domain}, {}, started + INCR_BUDGET);
            label += " (24h fallback)";
          }
          result.imported += syncImportPage.lastWritten;
          result.steps.push(`${label}: ${syncImportPage.lastWritten}/${got} in ${stepT() - t0}ms (feed ${syncImportPage.lastFetchMs}ms, skipped ${syncUpsertRows.skipped || 0})`);
          if(got < SYNC_PER_PAGE || !syncImportPage.lastComplete) break;
        }
      }
      // Закрытые лоты: раньше брали ОДНУ страницу (1000) — а площадки закрывают десятки тысяч
      // лотов в сутки, остальное навсегда оставалось в базе «живым». Берём до 6 страниц.
      if(!skipIncr) for(let apg = 1; apg <= 6; apg++){
        if(Date.now() - started > INCR_BUDGET + 8000) break;
        result.stage = `archived p${apg}`;
        const got = await syncImportPage("/archived-lots", apg, {minutes:String(INCR_WINDOW_MIN)}, {archived:true}, started + INCR_BUDGET + 8000);
        result.archivedMarked += syncImportPage.lastWritten;
        if(got < SYNC_PER_PAGE || !syncImportPage.lastComplete) break;
      }
      if(!skipIncr) state.last_incr_at = new Date().toISOString();

      // -------- Обход ближайших торгов (каждый 5-мин тик без инкремента) --------
      // 23.09.2026: фид на 48ч отдаёт ~77k лотов, в базе было 45k — часовой инкремент (3 страницы изменений на площадку)
      // не успевает за новыми лотами, а полный обход идёт раз в сутки. Здесь по кругу листаем /cars?next_hours_auction=72
      // по площадкам с курсором в состоянии; неизменившиеся строки не переписываем (dropUnchangedRows).
      if(skipIncr){
        // Окно изменений фида (3ч) — по курсору, чтобы за час пройти его ЦЕЛИКОМ, а не первые 3 страницы:
        // фид меняет десятки тысяч лотов в час, и новые лоты попадали в базу только ночным обходом.
        // Днём (UTC 6–20) база нужна посетителям: короче окна записи; ночью — полные.
        // Днём урезание бюджета убрано (Medium-база держит запись): обход 160 страниц должен проходиться за ~20–30 минут.
        const CH_BUDGET_MS = 12000;
        const ch = state.changes || (state.changes = {di:0, page:1});
        result.chSteps = [];
        result.stage = "changes";
        while(Date.now() - started < CH_BUDGET_MS && ch.di < SYNC_DOMAINS.length){
          const t0 = stepT();
          const got = await syncImportPage("/cars", ch.page, {minutes:String(INCR_WINDOW_MIN), domain_id:SYNC_DOMAINS[ch.di]}, {}, started + CH_BUDGET_MS);
          result.imported += Math.max(0, syncImportPage.lastWritten - syncImportPage.lastUnchanged);
          result.chSteps.push(`ch d${SYNC_DOMAINS[ch.di]} p${ch.page}: ${got} (same ${syncImportPage.lastUnchanged}, kept ${syncUpsertRows.preserved || 0}) in ${stepT() - t0}ms`);
          if(got && !syncImportPage.lastComplete) break;
          if(got < SYNC_PER_PAGE || ch.page >= 40){ ch.di += 1; ch.page = 1; } else { ch.page += 1; }
          await syncSetState(state).catch(() => {});   // курсор — сразу: если прогон убьют по лимиту, прогресс не потеряется
        }
        if(ch.di >= SYNC_DOMAINS.length){ ch.di = 0; ch.page = 1; ch.done_at = new Date().toISOString(); }
        const UP_BUDGET_MS = 42000;
        const up = state.upcoming || (state.upcoming = {di:0, page:1, cycles:0});
        result.upSteps = [];
        result.stage = "upcoming";
        while(Date.now() - started < UP_BUDGET_MS && up.di < SYNC_DOMAINS.length && Date.now() - started >= 0){
          const t0 = stepT();
          const got = await syncImportPage("/cars", up.page, {next_hours_auction:"72", domain_id:SYNC_DOMAINS[up.di]}, {}, started + UP_BUDGET_MS);
          result.imported += Math.max(0, syncImportPage.lastWritten - syncImportPage.lastUnchanged);
          result.upSteps.push(`up d${SYNC_DOMAINS[up.di]} p${up.page}: ${got} (same ${syncImportPage.lastUnchanged}) in ${stepT() - t0}ms`);
          if(got && !syncImportPage.lastComplete) break;          // не дописали страницу — повторим её
          if(got < SYNC_PER_PAGE){ up.di += 1; up.page = 1; } else { up.page += 1; }
          await syncSetState(state).catch(() => {});
        }
        if(up.di >= SYNC_DOMAINS.length){ up.di = 0; up.page = 1; up.cycles += 1; up.done_at = new Date().toISOString(); }
      }
      // Сбрасываем возможный застрявший курсор дренажа прошлой версии.
      state.incr_anchor = null; state.incr_di = 0; state.incr_page = 1;
      result.continue = false;

      // -------- Еженедельная сверка с живым фидом (sweep) --------
      // Инкремент видит только изменения за сутки и часть закрытий → в базе копились лоты,
      // которых в фиде давно нет (21.09.2026: ~560k «живых» без даты против ~152k в фиде;
      // завышенный счётчик каталога и «проданные» в выдаче). Раз в 7 дней ночью (UTC 0–4)
      // заново проходим весь /cars по доменам (upsert обновляет synced_at), затем удаляем
      // неархивные лоты, которых обход не встретил. Удаляем, а не архивируем: исход торгов по
      // ним неизвестен, вкладку «Архив» и comps они бы только засоряли (страница лота всё равно
      // берётся из live). Страховка: чистим, только если обход дошёл до конца обоих доменов и
      // принёс ≥80k лотов — иначе считаем фид сбойным и ничего не трогаем.
      const SWEEP_EVERY_MS = 20 * 3600e3;   // ежедневно (Федор, 22.09.2026): окно UTC 0–4, интервал 20ч чтобы не пропустить ночь
      const sw = state.sweep || (state.sweep = {});
      const hourUtc = new Date().getUTCHours();
      const dbHealthy = sbUp() && !(state.last_run && state.last_run.ok === false);
      const sweepStale = sw.active && sw.started_at && Date.now() - new Date(sw.started_at).getTime() > 26 * 3600e3;   // застрял в purge >26ч — обход нужен всё равно
      if(dbHealthy && (!sw.active || sweepStale) && !state.arch_backfilling && (!sw.done_at || sweepStale || Date.now() - new Date(sw.done_at).getTime() > SWEEP_EVERY_MS) && (hourUtc <= 4 || !sw.done_at || sweepStale)){
        state.sweep = {active:true, started_at:new Date().toISOString(), di:0, page:1, imported:0, stage:"crawl", deleted:sw.deleted || 0, done_at:sw.done_at || null, purge_cursor:sw.purge_cursor || null};
      }
      if(sw.aborted === "purge errors" && sw.started_at && Date.now() - new Date(sw.started_at).getTime() < 3 * 86400e3){
        // чистка прервалась по таймауту базы — продолжаем её меньшими пачками, обход заново не делаем
        Object.assign(sw, {active:true, stage:"purge", errors:0, aborted:null});
      }
      const sweep = state.sweep;
      // Полный обход (743 страницы принудительной записи) — ТОЛЬКО ночью UTC 0–5: днём он перегружал Micro-базу,
      // и каталог для посетителей отвечал по 10–16с (23.09 09:00).
      const nightNow = new Date().getUTCHours() <= 5;
      if(sweep.active && sweep.stage === "crawl" && nightNow){
        while(Date.now() - started < SYNC_RUN_BUDGET_MS && sweep.di < SYNC_DOMAINS.length){
          const got = await syncImportPage("/cars", sweep.page, {domain_id:SYNC_DOMAINS[sweep.di]}, {}, started + SYNC_RUN_BUDGET_MS, {force:true});
          if(got && !syncImportPage.lastComplete) break;   // не успели записать страницу — повторим её в следующем вызове
          sweep.imported += got;
          if(got === 0){ sweep.di += 1; sweep.page = 1; } else { sweep.page += 1; }
        }
        if(sweep.di >= SYNC_DOMAINS.length){
          if(sweep.imported >= 80000){ sweep.stage = "purge"; }
          else { sweep.active = false; sweep.aborted = "feed too small: " + sweep.imported; sweep.done_at = new Date().toISOString(); }
        }
        result.sweep = {stage:sweep.stage, di:sweep.di, page:sweep.page, imported:sweep.imported};
        if(sweep.active) result.continue = true;
      }
      // 23.09.2026 00:20: purge на 45с каждые 5 мин исчерпал IO-кредиты Micro-инстанса — простые range-запросы каталога
      // уходили за 8с. Чистка теперь короткая (≤12с за прогон) и только ночью UTC 0–5.
      const PURGE_BUDGET_MS = 12000;
      const purgeHour = new Date().getUTCHours() <= 5;
      if(sweep.active && sweep.stage === "purge" && dbHealthy && purgeHour && Date.now() - started < SYNC_RUN_BUDGET_MS - (skipIncr ? 5000 : 15000)){
        const purgeStart = Date.now();
        result.stage = "purge";
        // Час запаса: лот, обновлённый инкрементом прямо перед стартом обхода, не трогаем.
        const cutoff = new Date(new Date(sweep.started_at).getTime() - 3600e3).toISOString();
        let left = true;
        try{
        while(Date.now() - started < SYNC_RUN_BUDGET_MS && Date.now() - purgeStart < PURGE_BUDGET_MS){
          // Окно по synced_at (индекс): [cursor, cursor+6ч) — узкий диапазон, без сортировки всей таблицы.
          const cur = sweep.purge_cursor || "2020-01-01T00:00:00.000Z";
          const hi = new Date(Math.min(new Date(cur).getTime() + 6 * 3600e3, new Date(cutoff).getTime())).toISOString();
          const rows = await syncSbFetch(`/api_lots?archived=eq.false&synced_at=gte.${encodeURIComponent(cur)}&synced_at=lt.${encodeURIComponent(hi)}&select=id&limit=200`);
          if(!rows || !rows.length){ if(hi >= cutoff){ left = false; break; } sweep.purge_cursor = hi; continue; }
          for(let i = 0; i < rows.length; i += 50){
            const ids = rows.slice(i, i + 50).map(r => `"${String(r.id).replace(/[^a-z0-9_-]/gi, "")}"`).join(",");
            await syncSbFetch(`/api_lots?id=in.(${ids})&archived=eq.false`, {method:"DELETE", headers:{prefer:"return=minimal"}});
          }
          sweep.deleted += rows.length;
          if(rows.length < 200){ sweep.purge_cursor = hi; if(hi >= cutoff){ left = false; break; } }
        }
        }catch(e){
          // Тяжёлый запрос упёрся в таймаут базы — не зацикливаемся: 5 сбоев подряд → отмена до следующей недели.
          sweep.errors = (sweep.errors || 0) + 1; sweep.last_error = String(e.message || e).slice(0, 120);
          if(sweep.errors >= 30){ sweep.active = false; sweep.aborted = "purge errors"; sweep.done_at = new Date().toISOString(); }
        }
        if(!left){ sweep.active = false; sweep.stage = "done"; sweep.done_at = new Date().toISOString(); }
        result.sweep = {stage:sweep.stage, deleted:sweep.deleted};
        if(sweep.active) result.continue = true;
      }

      // -------- Архивный бэкфилл: история продаж из /cars?status=6,8 --------
      // Наш архив копится только с запуска базы; основной фид отдаёт и уже
      // проданные лоты — докачиваем их постранично, помечая archived.
      if(!state.arch_done){
        let st = String(state.arch_status || "6");
        let apage = Number(state.arch_page) || 1;
        let archImported = 0;
        while(Date.now() - started < SYNC_RUN_BUDGET_MS && !state.arch_done){
          const got = await syncImportPage("/cars", apage, {status:st}, {archived:true});
          archImported += got;
          if(got === 0){
            if(st === "6"){ st = "8"; apage = 1; }
            else { state.arch_done = true; }
          }else{
            apage += 1;
          }
        }
        state.arch_status = st;
        state.arch_page = apage;
        result.archBackfill = archImported;
        result.continue = result.continue || !state.arch_done; // GitHub Actions продолжит качать архив
      }
    }
    // Одноразовая чистка Encar/Кореи (ранние прогоны качали общий фид):
    // массовый DELETE упирается в statement timeout — удаляем PK-батчами
    // остатком бюджета этого прогона.
    if(!state.cleaned_kr){
      let cleaned = 0;
      while(Date.now() - started < SYNC_RUN_BUDGET_MS){
        const rows = await syncSbFetch(`/api_lots?country=eq.kr&select=id&limit=2000`);
        if(!rows || !rows.length){ state.cleaned_kr = true; break; }
        for(let i = 0; i < rows.length; i += 500){
          const ids = rows.slice(i, i + 500).map(r => r.id).join(",");
          await syncSbFetch(`/api_lots?id=in.(${ids})`, {method:"DELETE", headers:{prefer:"return=minimal"}});
        }
        cleaned += rows.length;
        if(rows.length < 2000){ state.cleaned_kr = true; break; }
      }
      result.cleanedKr = cleaned;
      if(!state.cleaned_kr) result.continue = true; // workflow продолжает, пока не дочистим
    }
  }catch(e){
    result.ok = false;
    result.error = e.message;
    result.failedAt = (result.stage || "before first import") + ((result.steps && result.steps.length) ? " · after: " + result.steps[result.steps.length - 1] : "");
    result.continue = false;
  }
  // Протухший api_cache: таблица не чистилась с июля → сотни тысяч строк, тяжёлые upsert'ы. Окна по expires_at
  // (индекс), ≤8с за прогон, курсор в состоянии; дошли до «сейчас − 1ч» → начинаем заново с давнего.
  try{
    const cut = Date.now() - 3600e3;
    let cur = state.cache_purge_cursor ? new Date(state.cache_purge_cursor).getTime() : Date.parse("2026-06-01T00:00:00Z");
    const t0 = Date.now(); let cleaned = 0;
    while(Date.now() - t0 < 3000 && cur < cut){
      const hi = Math.min(cur + 6 * 3600e3, cut);
      await syncSbFetch(`/api_cache?expires_at=gte.${new Date(cur).toISOString()}&expires_at=lt.${new Date(hi).toISOString()}`, {method:"DELETE", headers:{prefer:"return=minimal"}});
      cleaned++; cur = hi;
    }
    state.cache_purge_cursor = cur >= cut ? new Date(cut - 7 * 86400e3).toISOString() : new Date(cur).toISOString();
    result.cacheWindows = cleaned;
  }catch(e){ result.cacheCleanErr = String(e.message || e).slice(0, 80); }
  state.lock_at = null; // шаг завершён — следующий вызов может стартовать сразу
  state.last_run = {at:new Date().toISOString(), ...result};
  try{ await syncSetState(state); }catch(e){ /* прогресс потеряем на один шаг — не критично */ }
  response.statusCode = 200;
  response.end(JSON.stringify(result));
}

// Счётчики каталога (шапка, бейджи вкладок, типы витрины) — один набор оценок; вызывается из action=count и в фоне.
async function computeCatalogCount(){
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const grace = new Date(Date.now() - LIVE_GRACE_MS).toISOString();
  const cnt = async extra => {
    const r = await fetch(`${url}/rest/v1/api_lots?select=id&archived=eq.false&sale_date=gte.${encodeURIComponent(grace)}${extra}`,
      {headers:{apikey:key, authorization:`Bearer ${key}`, prefer:"count=planned", range:"0-0", "range-unit":"items"}});
    // count=planned: оценка планировщика по индексу (archived, sale_date) — мгновенно; exact на 786k строк рвался по таймауту → 0
    return r.ok || r.status === 416 ? Number((r.headers.get("content-range") || "*/0").split("/").pop()) || 0 : 0;
  };
  let all = 0, copart = 0, iaai = 0, dated = 0, buyNow = 0, soon = 0, archivedN = 0, types = null;
  if(sbUp() && await lotsDbReady().catch(() => false)){
    // Те же числа, что у вкладок (tabTotal). ПОСЛЕДОВАТЕЛЬНО: параллельные 8 запросов забивали пул соединений
    // PostgREST на Micro (~10), остальные запросы каталога ждали и падали по 8с-аборту.
    // Общий лимит 6с на весь набор: при медленной базе 7 последовательных оценок тянули ответ до 37с (504).
    const deadline = Date.now() + 9000;
    const t = async (a, b) => { if(Date.now() > deadline) return 0; try{ return await tabTotal(a, b); }catch(e){ return 0; } };
    all = await t("all", "all"); soon = await t("soon", "all"); archivedN = await t("archived", "all"); buyNow = await t("buy_now", "all");
    dated = await t("dated", "all"); copart = await t("all", "copart"); iaai = await t("all", "iaai");
    // Витрина по типам кузова — те же числа, что в заголовке (раньше витрина брала оценки своих 4 запросов: 524k «Автомобили» при 192k в шапке).
    types = {};
    for(const vt of ["1", "2", "5", "7"]){ const n = await (async () => { if(Date.now() > deadline + 4000) return 0; try{ return await tabTotal("all", "all", vt); }catch(e){ return 0; } })(); if(n > 0) types[vt] = n; }
  }
  if(!(all > 0)){
    // база недоступна/пуста → живой фид (то, на чём и так работает каталог в этот момент)
    try{
      const tc = k => { const x = tabTotalCache.get(k); return x && x.n > 0 ? x.n : 0; };
      [all, copart, iaai] = [tc("all|all"), tc("all|copart"), tc("all|iaai")];   // последнее известное из базы
      if(!(all > 0)){
        const [c, i] = await Promise.all([
          fetchSearch(new URLSearchParams({tab:"all", auction:"copart", per_page:"1"})).catch(() => null),
          fetchSearch(new URLSearchParams({tab:"all", auction:"iaai", per_page:"1"})).catch(() => null)]);
        copart = (c && c.total) || 0; iaai = (i && i.total) || 0; all = copart + iaai;   // без «all»: там и Корея
      }
    }catch(e){}
  }
  const payload = {ok:true, total:all, copart, iaai, dated, buyNow, soon, archived:archivedN, types, src:sbUp() ? "db" : "live", at:new Date().toISOString(), lastError:tabTotal.lastError || null};
  payload._complete = all > 0 && soon > 0 && buyNow > 0 && archivedN > 0;
  return payload;
}


// ---- Feduk SmartSelect: фоновая пометка «перекупских» лотов (api_lots.resale: 0 чистый · 1 многократно выставлялся · 2 уже продавался) ----
// История по VIN — тот же attachVinHistory, что на странице лота (правила едины). За тик — сотни лотов, ближайшие торги первыми.
const resaleFailedVins = new Map();
async function takeMetaLock(k, ms){
  await syncSbFetch(`/alert_meta?on_conflict=k`, {method:"POST", headers:{prefer:"resolution=ignore-duplicates,return=minimal"}, body:JSON.stringify({k, v:{}, updated_at:new Date(0).toISOString()})}).catch(() => {});
  const now = Date.now();
  const rows = await syncSbFetch(`/alert_meta?k=eq.${encodeURIComponent(k)}&updated_at=lt.${encodeURIComponent(new Date(now - ms).toISOString())}`, {
    method:"PATCH", headers:{prefer:"return=representation"}, body:JSON.stringify({updated_at:new Date(now).toISOString()})
  }).catch(() => null);
  return Array.isArray(rows) && rows.length === 1;
}
function resaleLevel(stub, lotNo, saleIso){
  const curDay = String(saleIso || "").slice(0, 10);
  const past = (stub.priceHistory || []).filter(e => !e.current && !(curDay && String(e.date).slice(0, 10) === curDay) && !(Date.parse(e.date) > Date.now()));
  const soldBefore = past.some(e => e.status === "sold");
  const lots = new Set(past.map(e => e.lot).filter(Boolean)); lots.add(String(lotNo));
  return soldBefore ? 2 : (past.length >= 8 || lots.size >= 3) ? 1 : 0;
}
// Окно «идут торги» для текущих вкладок: лот с датой старта старше 30 мин уже почти наверняка продан (лоты аукциона идут по одному), а проверить каждый нельзя.
const LIVE_GRACE_MS = 30 * 60e3;
function parseEngineRange(query){
  const one = k => {
    const v = Number(String(query.get(k) || "").replace(",", "."));
    return Number.isFinite(v) && v > 0 && v < 20 ? Math.round(v * 10) / 10 : null;
  };
  return {from:one("engineFrom"), to:one("engineTo")};
}
function engineLitersOf(text){
  const m = /^\s*(\d{1,2}\.\d)\s*l/i.exec(String(text || ""));
  return m ? Number(m[1]) : 0;
}

// Заливка api_lots.engine_l из payload.engine («2.0l i-4 …» → 2.0). Порция — SQL-функция fill_engine_l (skip locked).
async function runEngineFill(){
  const t0 = Date.now();
  const out = {ok:true, filled:0, rounds:0};
  try{
    while(Date.now() - t0 < 40000 && out.rounds < 16){
      const n = await syncSbFetch("/rpc/fill_engine_l", {method:"POST", body:JSON.stringify({n:2500})});
      out.rounds++;
      out.filled += Number(n) || 0;
      if(!(Number(n) >= 2500)) break;
    }
  }catch(e){ out.ok = false; out.error = String(e.message || e).slice(0, 160); }
  out.ms = Date.now() - t0;
  return out;
}

async function runResaleCheck(budgetMs){
  const t0 = Date.now();
  const out = {ok:true, checked:0, clean:0, relisted:0, resold:0, skipped:0, fail:0};
  if(!(await takeMetaLock("resale", 50000))) return {ok:true, lockedOut:true};
  const since = encodeURIComponent(new Date(Date.now() - 2 * 3600e3).toISOString());
  let rows;
  try{
    rows = await syncSbFetch(`/api_lots?archived=eq.false&resale_at=is.null&vin=not.is.null&sale_date=gte.${since}&select=id,vin,lot,sale_date,buy_now,erv:payload-%3E%3EestimatedRetailValue&order=sale_date.asc&limit=300`);
  }catch(e){ return {ok:false, error:String(e.message || e).slice(0, 160)}; }
  const buckets = {0:[], 1:[], 2:[]};
  const storedMap = {};
  try{
    const vinsAll = [...new Set(rows.map(r => String(r.vin || "").toUpperCase()).filter(isValidVin))];
    const sinceIso = encodeURIComponent(new Date(Date.now() - 24 * 3600e3).toISOString());
    for(let i = 0; i < vinsAll.length; i += 100){
      const part = await syncSbFetch(`/vin_hist?vin=in.(${vinsAll.slice(i, i + 100).join(",")})&checked_at=gt.${sinceIso}&select=vin,entries`);
      for(const x of part || []) storedMap[x.vin] = x.entries;
    }
  }catch(_){}
  let idx = 0, stop = false;
  const worker = async () => {
    while(!stop && Date.now() - t0 < budgetMs){
      const r = rows[idx++]; if(!r) return;
      const vin = String(r.vin || "").toUpperCase();
      if(!isValidVin(vin)){ buckets[0].push(r.id); continue; }
      if((resaleFailedVins.get(vin) || 0) > Date.now()){ out.skipped++; continue; }
      const stub = {vin, lot:String(r.lot || ""), auctionDate:r.sale_date || "", estimatedRetailValue:Number(r.erv) || 0, buyNow:Number(r.buy_now) || 0, priceHistory:[]};
      if(Array.isArray(storedMap[vin])){ stub.priceHistory = storedMap[vin]; stub._vinOk = true; out.fromStore = (out.fromStore || 0) + 1; }
      else await attachVinHistory(stub);
      if(!stub._vinOk){ out.fail++; resaleFailedVins.set(vin, Date.now() + 10 * 60e3); if(out.fail >= 4) stop = true; continue; }
      buckets[resaleLevel(stub, r.lot, r.sale_date)].push(r.id);
    }
  };
  await Promise.all(Array.from({length:6}, worker));
  const stamp = new Date().toISOString();
  for(const level of [0, 1, 2]){
    const ids = buckets[level];
    for(let i = 0; i < ids.length; i += 60){
      const chunk = ids.slice(i, i + 60);
      await syncSbFetch(`/api_lots?id=in.(${chunk.map(encodeURIComponent).join(",")})`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({resale:level, resale_at:stamp})}).catch(() => { out.fail++; });
    }
    out.checked += ids.length;
  }
  out.clean = buckets[0].length; out.relisted = buckets[1].length; out.resold = buckets[2].length;
  out.queue = rows.length; out.ms = Date.now() - t0;
  return out;
}

module.exports = async function handler(request, response){
  const query = getQuery(request);
  const action = query.get("action") || "search";

  if(action === "lead") return handleLead(request, response);
  if(action === "vinhealth"){
    // Здоровье истории по VIN: сбои/запасной источник (в пределах инстанса) и покрытие проверкой Clean Select.
    const url = (process.env.SUPABASE_URL || "").replace(/\/$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    const cnt = async path => {
      try{
        const r = await fetch(`${url}/rest/v1${path}`, {headers:{apikey:key, authorization:`Bearer ${key}`, prefer:"count=planned", range:"0-0", "range-unit":"items"}});
        return Number(String(r.headers.get("content-range") || "").split("/").pop()) || 0;
      }catch(_){ return null; }
    };
    const out = {ok:true, instance:{...vinFailStat, minutes:Math.round((Date.now() - vinFailStat.since) / 60000)}};
    out.vinStored = await cnt("/vin_hist?select=vin");
    out.upcomingChecked = await cnt(`/api_lots?select=id&archived=eq.false&resale_at=not.is.null&sale_date=gte.${encodeURIComponent(new Date().toISOString())}`);
    out.upcomingTotal = await cnt(`/api_lots?select=id&archived=eq.false&vin=not.is.null&sale_date=gte.${encodeURIComponent(new Date().toISOString())}`);
    sendJson(response, 200, out, {"cache-control":"no-store"});
    return;
  }
  if(action === "enginefill"){
    sendJson(response, 200, await runEngineFill(), {"cache-control":"no-store"});
    return;
  }
  if(action === "resalecheck"){
    sendJson(response, 200, await runResaleCheck(42000).catch(e => ({ok:false, error:String(e.message || e).slice(0, 160)})), {"cache-control":"no-store"});
    return;
  }
  if(action.startsWith("alert")){
    const alerts = require("../server/alerts").create({
      sb:syncSbFetch, searchFromDb, sendJson, readBody,
      liveLot:async id => {
        const [auction, lotNo] = String(id).split("-");
        const lot = await fetchDetail(new URLSearchParams({auction, lot:lotNo}));
        const sold = Number(lot.statusId) === 6 && Date.parse(lot.auctionDate || "") < Date.now();
        if(sold) upsertClosedLot(lot);
        return {auctionDate:lot.auctionDate || "", statusId:Number(lot.statusId) || 0, currentBid:Number(lot.currentBid) || 0, buyNow:Number(lot.buyNow) || 0, finalBid:Number(lot.finalBid) || Number(lot.currentBid) || 0, sold};
      },
      isAdmin:req => { try{ return require("../server/auth").isAuthenticated(req); }catch(_){ return false; } }
    });
    if(await alerts.handle(action, request, response, query).catch(e => { sendJson(response, 500, {ok:false, error:String(e.message || e).slice(0, 160)}); return true; })) return;
  }
  if(action === "synclots") return handleSyncLots(response);
  // Быстрый синк ЗАКРЫТЫХ торгов (каждые 10 мин из GitHub Actions): только /archived-lots за последние 90 минут.
  // Даёт правило «сыгралась → сразу в архив»: лаг ≤10 мин вместо часа. Полный инкремент остаётся часовым.
  // Диагностика фида закрытых лотов (read-only, только админ): есть ли лот в /archived-lots за N минут.
  if(action === "closedprobe"){
    const {isAuthenticated} = require("../server/auth");
    if(!isAuthenticated(request)){ sendJson(response, 401, {ok:false}); return; }
    const lotQ = String(query.get("lot") || "").replace(/[^0-9]/g, "");
    const mins = String(query.get("minutes") || "180").replace(/[^0-9]/g, "");
    const out = {ok:true, minutes:mins, pages:[]};
    for(let pg = 1; pg <= 5; pg++){
      const p = new URLSearchParams({per_page:"1000", page:String(pg), simple_paginate:"1", minutes:mins});
      const payload = await syncApiFetch(`${AUCTIONS_API_BASE}/archived-lots?${p}`);
      const items = findItems(payload) || [];
      const hit = items.find(it => String(((it.lots||[])[0]||it.lot||it).lot || "") === lotQ);
      out.pages.push({page:pg, n:items.length, hit:hit ? {status:((hit.lots||[])[0]||{}).status, final:((hit.lots||[])[0]||{}).final_bid, sale_date:((hit.lots||[])[0]||{}).sale_date, updated:((hit.lots||[])[0]||{}).final_bid_updated_at || ((hit.lots||[])[0]||{}).updated_at} : null});
      if(hit || items.length < 1000) break;
    }
    sendJson(response, 200, out, {"cache-control":"no-store"});
    return;
  }
  // Сыгравшие, которых /archived-lots не отдал: лоты с прошедшей датой торгов (последние 3ч), в базе ещё не архив →
  // точечный /search-lot по каждому, проданные тут же в архив. Каждые 10 мин из GitHub Actions вместе с syncclosed.
  // Восстановление затёртых продаж (23.09.2026): archived=true, status 6, final_bid=0 → по VIN (/search-vin) находим
  // запись продажи и возвращаем финал/дату/историю. Не нашли → помечаем payload.repairTried, чтобы не крутить повторно.
  async function repairLostSales(budgetMs){
    const t0 = Date.now(); let fixed = 0, tried = 0;
    const rows = await syncSbFetch(`/api_lots?archived=eq.true&status_id=eq.6&final_bid=eq.0&vin=not.is.null&payload-%3E%3ErepairTried=is.null&select=id,vin,auction,lot,payload&order=synced_at.desc&limit=420`).catch(() => null);
    if(!Array.isArray(rows) || !rows.length) return {fixed, tried, empty:true};
    for(let i = 0; i < rows.length; i += 8){
      if(Date.now() - t0 > budgetMs) break;
      await Promise.all(rows.slice(i, i + 8).map(async r => {
        tried++;
        try{
          const stub = {vin:r.vin, lot:String(r.lot || ""), auction:r.auction, auctionDate:"", finalBid:0, priceHistory:[], statusId:6};
          await attachVinHistory(stub);
          const sale = (stub.priceHistory || []).filter(h => /sold|approval/i.test(String(h.status || "")) && !/not_sold/i.test(String(h.status || "")) && Number(h.bid) > 0 && h.date)
            .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
          const base = r.payload && typeof r.payload === "object" ? r.payload : {};
          if(sale){
            const sd = new Date(Date.parse(sale.date)).toISOString();
            await syncSbFetch(`/api_lots?id=eq.${encodeURIComponent(r.id)}`, {method:"PATCH", headers:{prefer:"return=minimal"},
              body:JSON.stringify({final_bid:Math.round(Number(sale.bid)), sale_date:sd, status_id:6, archived:true,
                payload:{...base, finalBid:Math.round(Number(sale.bid)), auctionDate:sd, statusId:6, statusName:"sold", priceHistory:stub.priceHistory || [], repairedAt:new Date().toISOString()}})});
            fixed++;
          }else{
            await syncSbFetch(`/api_lots?id=eq.${encodeURIComponent(r.id)}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({payload:{...base, repairTried:true}})});
          }
        }catch(e){}
      }));
    }
    return {fixed, tried, ms:Date.now() - t0};
  }
  if(action === "syncsettle"){
    response.setHeader("cache-control", "no-store");
    if(!sbUp()){ response.statusCode = 200; response.end(JSON.stringify({ok:false, skipped:"db down"})); return; }
    if(!(await acquireSyncLock())){ response.statusCode = 200; response.end(JSON.stringify({ok:false, skipped:"sync running"})); return; }
    const started = Date.now(); let checked = 0, closed = 0, settleInfo = null;
    try{
      const to = new Date(Date.now() - 15 * 60e3).toISOString(), from = new Date(Date.now() - 3 * 3600e3).toISOString();
      const rows = await syncSbFetch(`/api_lots?archived=eq.false&sale_date=gte.${encodeURIComponent(from)}&sale_date=lte.${encodeURIComponent(to)}&select=auction,lot,sale_date&order=sale_date.desc&limit=400`);
      for(let i = 0; i < (rows || []).length; i += 8){
        if(Date.now() - started > 40000) break;
        await Promise.all(rows.slice(i, i + 8).map(async r => {
          try{
            const lot = await fetchDetail(new URLSearchParams({auction:r.auction, lot:r.lot}));
            checked++;
            const ts = Date.parse(lot.auctionDate || "");
            if(lot.statusId === 6 && ts < Date.now()){ upsertClosedLot(lot); closed++; }
            else if(Number.isFinite(ts) && ts > Date.now()){
              // перенесли на другую дату — обновляем дату и снимаем архив/финал, если ошибочно стояли
              await syncSbFetch(`/api_lots?id=eq.${encodeURIComponent(r.auction + "-" + r.lot)}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({sale_date:new Date(ts).toISOString(), archived:false, status_id:lot.statusId, final_bid:0, current_bid:Number(lot.currentBid) || 0, buy_now:Number(lot.buyNow) || 0, payload:{...lot, finalBid:0}})});
            }
          }catch(e){}
        }));
      }
      const repair = await repairLostSales(Math.max(5000, 42000 - (Date.now() - started))).catch(e => ({error:String(e.message || e).slice(0, 80)}));
      response.statusCode = 200; response.end(JSON.stringify({ok:true, candidates:(rows || []).length, checked, closed, repair, ms:Date.now() - started}));
      settleInfo = {candidates:(rows || []).length, checked, closed, repair, ms:Date.now() - started};
    }catch(e){ response.statusCode = 200; response.end(JSON.stringify({ok:false, error:String(e.message || e).slice(0, 200)})); settleInfo = {error:String(e.message || e).slice(0, 120)}; }
    finally{ await releaseSyncLock("settle", settleInfo); }
    return;
  }
  // Одноразово/по запросу: «призраки» — в архиве без цены продажи (непроданные раунды, записанные как sold) → оживить.
  if(action === "syncghosts"){
    response.setHeader("cache-control", "no-store");
    let fixed = 0, started = Date.now();
    try{
      // По индексу (archived, sale_date): сутки за прогон, назад от сегодня; day=N — смещение.
      const dayOff = Math.max(0, Number(query.get("day") || 0));
      const d0 = new Date(Date.now() - dayOff * 86400e3); d0.setUTCHours(0, 0, 0, 0);
      const d1 = new Date(d0.getTime() + 86400e3);
      while(Date.now() - started < 40000){
        const rows = await syncSbFetch(`/api_lots?archived=eq.true&sale_date=gte.${d0.toISOString()}&sale_date=lt.${d1.toISOString()}&final_bid=eq.0&select=id&limit=500`);
        if(!rows || !rows.length) break;
        for(let i = 0; i < rows.length; i += 100){
          const ids = rows.slice(i, i + 100).map(r => `"${String(r.id).replace(/[^a-z0-9_-]/gi, "")}"`).join(",");
          await syncSbFetch(`/api_lots?id=in.(${ids})`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({archived:false, status_id:3})});
        }
        fixed += rows.length; if(rows.length < 500) break;
      }
      response.statusCode = 200; response.end(JSON.stringify({ok:true, revived:fixed, ms:Date.now() - started}));
    }catch(e){ response.statusCode = 200; response.end(JSON.stringify({ok:false, error:String(e.message || e).slice(0, 200), revived:fixed})); }
    return;
  }
  if(action === "syncclosed"){
    response.setHeader("cache-control", "no-store");
    if(!sbUp()){ response.statusCode = 200; response.end(JSON.stringify({ok:false, skipped:"db down"})); return; }
    if(!(await acquireSyncLock())){ response.statusCode = 200; response.end(JSON.stringify({ok:false, skipped:"sync running"})); return; }
    const started = Date.now(); let n = 0, closedInfo = null;
    try{
      // Окно 30 мин при запуске каждые 10 мин (было 90: каждый закрытый лот переписывался ~9 раз подряд).
      for(let apg = 1; apg <= 2; apg++){
        if(Date.now() - started > 25000) break;
        const got = await syncImportPage("/archived-lots", apg, {minutes:"30"}, {archived:true}, started + 30000);
        n += syncImportPage.lastWritten; if(got < SYNC_PER_PAGE || !syncImportPage.lastComplete) break;
      }
      response.statusCode = 200; response.end(JSON.stringify({ok:true, archivedMarked:n, skipped:syncUpsertRows.skipped || 0, ms:Date.now() - started}));
      closedInfo = {archivedMarked:n, skipped:syncUpsertRows.skipped || 0, ms:Date.now() - started};
    }catch(e){ response.statusCode = 200; response.end(JSON.stringify({ok:false, error:String(e.message || e).slice(0, 200)})); closedInfo = {error:String(e.message || e).slice(0, 120)}; }
    finally{ await releaseSyncLock("closed", closedInfo); }
    return;
  }
  // 23.09.2026: карточки каталога раньше тянули «Ориентир ставки» ПО ОДНОМУ запросу на лот (до 19
  // запросов на страницу, каждый 300–700мс, потому что не батчились как vinhist/livebids) — почти 6с
  // до появления оценок на последних карточках. compsbatch — один POST на всю видимую страницу; на
  // сервере одинаковые make+model внутри батча делят один fetchSoldComps (дедуп через in-flight промис).
  if(action === "compsbatch"){
    if(request.method !== "POST"){ methodNotAllowed(response, ["POST"]); return; }
    let body;
    try{ body = await readBody(request); }catch(e){ sendJson(response, 400, {ok:false, error:"bad body"}); return; }
    const items = Array.isArray(body?.items) ? body.items.slice(0, 40) : [];
    const out = {};
    await Promise.all(items.map(async it => {
      const id = String(it?.id || "").slice(0, 80);
      if(!id || typeof it !== "object") return;
      const q = {get:k => (it[k] != null ? String(it[k]) : null)};
      try{
        const comps = await computeCompsForQ(q);
        if(comps){ out[id] = comps; return; }
        // Ни строки в таблице Федора, ни похожих продаж — фолбэк на агрегат /statistics
        // (то же самое, что клиент раньше добирал вторым запросом через statsRowsFor).
        const makeId = String(it.manufacturer_id || it.make_id || "").replace(/[^0-9]/g, "");
        const modelId = String(it.model_id || "").replace(/[^0-9]/g, "");
        if(makeId && modelId){
          const rows = await fetchStatsRows(makeId, modelId);
          const yearQ = Number(String(it.year || "").replace(/[^0-9]/g, "")) || 0;
          const engineId = it.engine_id != null ? Number(it.engine_id) : 0;
          const f = statsForecast(rows, yearQ, engineId, 0) || statsForecast(rows, yearQ, engineId, 1);
          if(f) out[id] = {guide:false, src:"stats", p25:f.lo, p75:f.hi, median:Math.round((f.lo + f.hi) / 2), trueMedian:Math.round((f.lo + f.hi) / 2), count:0, match:{}};
        }
      }catch(e){ /* этот лот без оценки — остальные батча не страдают */ }
    }));
    sendJson(response, 200, {ok:true, items:out}, {"cache-control":"no-store"});
    return;
  }

  if(request.method !== "GET"){
    methodNotAllowed(response, ["GET","POST"]);
    return;
  }

  // Кеш детали протух по смыслу: дата торгов уже прошла, а лот не завершён —
  // аукционы часто переносят даты, показывать старую дату нельзя, перезапрашиваем.
  const detailCacheStale = payload => {
    if(action !== "detail" || !payload || !payload.lot) return false;
    const lot = payload.lot;
    const t = Date.parse(lot.auctionDate || "");
    const done = lot.statusId === 6 || lot.statusId === 8 || /sold|not_sold/i.test(lot.statusName || "");
    return Number.isFinite(t) && t < Date.now() && !done;
  };

  // Live-поллинг ставки: fresh=<ts> обходит чтение кешей (CDN обходится самим
  // уникальным ts в URL), но результат пишется в канонический ключ кеша.
  const freshMode = !!query.get("fresh");
  if(freshMode) query.delete("fresh");

  // Edge-заголовок для медленных оценок — чтобы CDN кэшировал и hit из памяти/БД.
  const edgeHdr = action === "comps" ? COMPS_EDGE_CACHE : action === "statistics" ? STATS_EDGE_CACHE : undefined;
  // Соль версии ранжирования/окна выборки для поиска: ответ кэшируется (память +
  // Supabase, до 6 ч) уже отсортированным, и без соли изменения sortItems /
  // lotQualityScore / окна выборки доходят до людей с опозданием. Поднимать при
  // изменении этой логики.
  const SEARCH_CACHE_VER = "25";
  const GEN_CACHE_SALT = (action === "generations" || action === "detail" || action === "vin") ? "|g13" : "";   // бамп при смене таблицы поколений и формы detail
  const key = cacheKey(action, query) + (action === "search" ? `|sv${SEARCH_CACHE_VER}` : "") + GEN_CACHE_SALT;
  const cached = getCached(key);
  if(cached && !freshMode && !detailCacheStale(cached)){
    sendJson(response, 200, {...cached, cached:true}, edgeHdr);
    return;
  }

  // Supabase persistent cache — shared across all serverless instances.
  // Checked only for actions that consume the auctionsapi.com quota.
  // 23.09.2026: search/archived ИСКЛЮЧЕНЫ — живой ответ каталога (100 лотов с payload) весил мегабайты, его чтение
  // из api_cache шло >2.5с и выбивало circuit breaker на 3 мин для всех запросов (каталог уходил в live по кругу).
  // Каталогу хватает памяти инстанса + CDN (s-maxage=180).
  const dbCacheActions = new Set(["detail","vin","manufacturers","models","generations","usadict","statistics"]);
  // Словарь повреждений теперь статический (не тратит квоту API) — Supabase-кэш
  // для него лишний round-trip, пропускаем (memory + edge-кэш достаточно). P3-16.
  const isStaticDamages = action === "usadict" && String(query.get("dict") || "").toLowerCase() === "damages";
  if(dbCacheActions.has(action) && !freshMode && !isStaticDamages){
    const dbHit = await getDbCache(key);
    if(dbHit && !detailCacheStale(dbHit)){
      setCached(key, dbHit);
      sendJson(response, 200, {...dbHit, cached:true}, edgeHdr);
      return;
    }
  }

  try{
    if(action === "debug"){
      const {requireAdmin} = require("../server/auth");
      if(!requireAdmin(request, response)) return;
      await handleDebug(query, response);
      return;
    }

    if(action === "manufacturers"){
      const list = await fetchJson(`${AUCTIONS_API_BASE}/manufacturers`);
      const items = (Array.isArray(list?.data) ? list.data : [])
        .filter(m => m && m.cars && Number(m.cars_qty) > 0)
        .map(m => ({id:m.id, name:m.name, image:m.image || "", qty:m.cars_qty}))
        .sort((a, b) => a.name.localeCompare(b.name));
      const payload = {ok:true, items};
      setCached(key, payload);
      sendJson(response, 200, payload);
      return;
    }

    if(action === "models"){
      const mid = String(query.get("manufacturer_id") || "").replace(/[^0-9]/g, "");
      if(!mid){ sendJson(response, 200, {ok:true, items:[]}); return; }
      const list = await fetchJson(`${AUCTIONS_API_BASE}/models/${mid}`);
      const items = (Array.isArray(list?.data) ? list.data : [])
        .filter(m => m && Number(m.cars_qty) > 0)
        .map(m => ({id:m.id, name:m.name, qty:m.cars_qty}))
        .sort((a, b) => a.name.localeCompare(b.name));
      const payload = {ok:true, items};
      setCached(key, payload);
      sendJson(response, 200, payload);
      return;
    }

    if(action === "generations"){
      const mid = String(query.get("model_id") || "").replace(/[^0-9]/g, "");
      if(!mid){ sendJson(response, 200, {ok:true, items:[]}); return; }
      const tgList = tableGens(mid);
      if(tgList){
        // Как у DreamBid: свежие кузова первыми, имя = код кузова (нет кода — годы).
        const items = tgList.slice().sort((a, b) => b.from - a.from)
          .map(g => ({id:g.id, name:g.name || (g.from + "–" + (g.to || "")), fromYear:g.from, toYear:g.to || null}));
        const payload = {ok:true, items};
        setCached(key, payload);
        sendJson(response, 200, payload);
        return;
      }
      const list = await fetchJson(`${AUCTIONS_API_BASE}/generations/${mid}`);
      const items = (Array.isArray(list?.data) ? list.data : [])
        .filter(m => m && m.name)
        .map(m => ({id:m.id, name:m.name, qty:m.cars_qty, fromYear:m.from_year || m.year_from || m.start_year || null, toYear:m.to_year || m.year_to || m.end_year || null}))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
      const payload = {ok:true, items};
      setCached(key, payload);
      sendJson(response, 200, payload);
      return;
    }

    if(action === "usadict"){
      const dict = String(query.get("dict") || "").toLowerCase();
      const country = String(query.get("country") || "us").toLowerCase() === "ca" ? "ca" : "us";
      const domainId = String(query.get("domain_id") || "3").replace(/[^0-9]/g, "") || "3";
      const stateId = String(query.get("state_id") || "").replace(/[^0-9]/g, "");
      const paths = {
        damages:"/usa/damages",
        states:`/usa/states?country=${country}`,
        // colors: у auctionsapi нет /usa/colors (404) — отдаём пустой список ниже
        titles:"/usa/titles",
        branches:`/usa/branches?domain_id=${domainId}`,
        cities:stateId ? `/usa/cities/${stateId}` : ""
      };
      const path = paths[dict];
      if(!path){ sendJson(response, 200, {ok:true, items:[]}); return; }
      // Словарь повреждений практически не меняется и большой (~2400 значений):
      // live-выгрузка всех страниц занимала ~4с при первом открытии фильтра (P3-16).
      // Отдаём статический снимок из репозитория мгновенно; live — фолбэк, если
      // файл почему-то не прочитался. Остальные словари остаются live.
      let rows;
      if(dict === "damages"){
        try{ rows = require("../server/usa-damages.json"); }catch(e){ rows = []; }
        if(!Array.isArray(rows) || !rows.length) rows = await fetchAllPages(path);
      }else{
        rows = await fetchAllPages(path);
      }
      const items = rows.map(d => ({
        id:d.id != null ? d.id : null,
        name:safeName(d.name || d.title || d.damage || d),
        code:d.state_code || d.code || d.abbr || ""
      })).filter(d => d.name);
      let outItems = items;
      if(dict === "damages"){
        // Справочник фида: ~2300 служебных кодов продавцов («Dp1142») + однобуквенные обрывки — в фильтре им не место.
        // «Front End Damage» покрывается подстрокой «Front End» (фильтр ilike *x*), поэтому дубли с суффиксом « Damage» убираем.
        const seen = new Set();
        outItems = [];
        for(const it of items){
          let n = String(it.name).trim();
          if(/^[A-Za-z]{1,3}\d{2,}$/.test(n) || n.length < 4) continue;
          n = n.replace(/\s+Damage$/i, "").trim();
          if(n.length < 4) continue;
          const k = n.toLowerCase();
          if(seen.has(k)) continue;
          seen.add(k);
          outItems.push({...it, name:n});
        }
        // Всё, что покрыто группой, заменяем пунктом группы; в конце остаются только «одиночные» значения.
        const covered = n => DAMAGE_GROUPS.some(g => g.terms.some(t => n.toLowerCase().includes(t)));
        outItems = [...DAMAGE_GROUPS.map(g => ({id:null, name:g.label, code:""})), ...outItems.filter(it => !covered(it.name))];
      }
      const payload = {ok:true, items:outItems};
      setCached(key, payload);
      sendJson(response, 200, payload);
      return;
    }

    if(action === "archived"){
      const perPage = Math.min(1000, Math.max(1, Number(query.get("per_page") || query.get("limit") || 100) || 100));
      const minutes = Math.min(4320, Math.max(1, Number(query.get("minutes") || 4320) || 4320));
      const p = new URLSearchParams({per_page:String(perPage), minutes:String(minutes)});
      const payload = await fetchJson(`${AUCTIONS_API_BASE}/archived-lots?${p}`);
      const items = findItems(payload).map(it => normalizeLot(it, normalizeAuction(it?.domain || it?.auction || query.get("auction"))));
      const result = {ok:true, items, total:items.length, archived:true};
      setCached(key, result);
      sendJson(response, 200, result);
      return;
    }

    if(action === "detail"){
      const lot = await fetchDetail(query);
      await attachVinHistory(lot);
      await attachGenRange(lot);
      upsertClosedLot(lot);
      const payload = {ok:true,lot, ...(query.get("debug") ? {_histKeys:normalizeLot.lastRawHistKeys || null, _vinKeys:attachVinHistory.rawKeys || null, _vinRaw:attachVinHistory.lastRaw || null} : {})};
      // История по VIN не загрузилась (таймаут фида) — НЕ кэшируем: иначе «Единственная продажа» висит до получаса.
      if(lot.vinChecked !== false){
        setCached(key, payload);
        setDbCache(key, payload, "detail");
        // Clean Select: страницу лота открыли — метку перекупа получаем сразу, не ждём очереди фоновой проверки
        if(lot.vinChecked && lot.id && Number(lot.statusId) !== 6 && Date.parse(lot.auctionDate || "") > Date.now()){
          syncSbFetch(`/api_lots?id=eq.${encodeURIComponent(lot.id)}&archived=eq.false&resale_at=is.null`, {method:"PATCH", headers:{prefer:"return=minimal"},
            body:JSON.stringify({resale:resaleLevel(lot, lot.lot, lot.auctionDate), resale_at:new Date().toISOString()})}).catch(() => {});
        }
      }
      sendJson(response, 200, payload);
      return;
    }

    // История по VIN пачкой для карточек каталога (правило Федора: VIN — первичен, номер лота — второстепенен).
    // До 30 VIN за запрос, параллельно по 6, результат кэшируется 6ч (история меняется редко).
    // Живые ставка/резерв/статус продажи пачкой для карточек (≤30 id, параллельно по 6, кэш 2 мин).
    // Диагностика (read-only, кэш 10 мин): сколько лотов у ФИДА по площадкам — с датой торгов в 60 дней и всего.
    // Нужна, чтобы сверять счётчик каталога с источником, а не с DreamBid.
    // Диагностика планов (read-only): план запроса вкладки «Сегодня и завтра» через PostgREST (если db-plan включён),
    // плюс тайминги: чтение по PK, range-запрос без count, тот же с count=planned.
    if(action === "explain"){
      const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
      const skey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      const H = {apikey:skey, authorization:`Bearer ${skey}`};
      const grace = encodeURIComponent(new Date(Date.now() - LIVE_GRACE_MS).toISOString());
      const to = encodeURIComponent(new Date(Date.now() + 48 * 3600e3).toISOString());
      const q = `/api_lots?select=id&archived=eq.false&and=(sale_date.gte.${grace},sale_date.lte.${to},or(status_id.neq.6,status_id.is.null))&order=sale_date.asc,id.asc&limit=1`;
      const timed = async (path, extra) => {
        const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000); const t0 = Date.now();
        try{ const r = await fetch(`${url}/rest/v1${path}`, {headers:{...H, ...(extra || {})}, signal:ctrl.signal}); const txt = await r.text(); return {ms:Date.now() - t0, status:r.status, body:txt.slice(0, 1500), cr:r.headers.get("content-range")}; }
        catch(e){ return {ms:Date.now() - t0, err:String(e.message || e).slice(0, 80)}; }
        finally{ clearTimeout(t); }
      };
      const out = {ok:true};
      // Произвольный (read-only) запрос к api_lots для сравнения вариантов: только безопасные символы, только GET.
      const qq = String(query.get("q") || "");
      if(qq && /^[\w%().,:=&+*-]+$/.test(qq) && qq.length < 900){
        out.custom = await timed(`/api_lots?${qq}`, query.get("exact") ? {prefer:"count=exact", range:"0-0", "range-unit":"items"} : query.get("planned") ? {prefer:"count=planned", range:"0-0", "range-unit":"items"} : {});
        sendJson(response, 200, out, {"cache-control":"no-store"});
        return;
      }
      out.pk = await timed(`/api_lots?select=id,sale_date&id=eq.iaai-44682632`);
      out.range = await timed(q);
      out.rangePlanned = await timed(q, {prefer:"count=planned", range:"0-0", "range-unit":"items"});
      out.plan = await timed(q, {accept:"application/vnd.pgrst.plan+text; options=analyze"});
      out.planAll = await timed(`/api_lots?select=id&archived=eq.false&and=(sale_date.gte.${grace},or(status_id.neq.6,status_id.is.null),or(country.neq.kr,country.is.null))&order=sale_date.asc,id.asc&limit=1`, {accept:"application/vnd.pgrst.plan+text; options=analyze"});
      sendJson(response, 200, out, {"cache-control":"no-store"});
      return;
    }
    if(action === "feedcount"){
      const ck = "feedcount"; const c = getCached(ck);
      if(c){ sendJson(response, 200, c, {"cache-control":"no-store"}); return; }
      const one = async extra => {
        const p = new URLSearchParams({per_page:"1", page:"1", simple_paginate:"0", prices_history:"0", ...extra});
        const payload = await fetchJson(`${AUCTIONS_API_BASE}/cars?${p}`).catch(e => ({error:String(e.message || e).slice(0, 80)}));
        const meta = payload && (payload.meta || payload.pagination || payload);
        return payload && payload.error ? payload.error : Number(payload.total ?? (meta && meta.total) ?? (payload.data && payload.data.total)) || 0;
      };
      const out = {ok:true, at:new Date().toISOString()};
      // Диагностика: свой набор параметров /cars (только безопасные ключи) — «сколько у фида таких лотов».
      // Сколько лотов у фида в Timed: листаем окно ближайших торгов постранично и считаем is_timed_auction (фильтра по нему в /cars нет).
      if(query.get("timedscan")){
        const dom = query.get("timedscan") === "iaai" ? "1" : "3";
        const hours = String(query.get("hours") || "72").replace(/[^0-9]/g, "") || "72";
        const from = Math.max(1, Number(query.get("from") || 1) || 1), n = Math.min(6, Math.max(1, Number(query.get("n") || 4) || 4));
        const rep = {domain:dom, hours, pages:[], timed:0, seen:0, byType:{}};
        for(let pg = from; pg < from + n; pg++){
          const p = new URLSearchParams({per_page:"1000", page:String(pg), simple_paginate:"1", prices_history:"0", next_hours_auction:hours, domain_id:dom});
          const data = await fetchJson(`${AUCTIONS_API_BASE}/cars?${p}`).catch(e => ({error:String(e.message || e).slice(0, 80)}));
          const its = findItems(data) || [];
          let t = 0;
          for(const it of its){ const l = (it.lots || [])[0] || it; const isT = l.is_timed_auction === true || it.is_timed_auction === true; if(isT) t++; const ty = (l.auction_type && l.auction_type.name) || String(l.auction_type || "?"); rep.byType[ty] = (rep.byType[ty] || 0) + 1; }
          rep.pages.push({pg, n:its.length, timed:t}); rep.timed += t; rep.seen += its.length;
          if(its.length < 1000) break;
        }
        sendJson(response, 200, {ok:true, ...rep}, {"cache-control":"no-store"});
        return;
      }
      if(query.get("probe")){
        const okKeys = new Set(["domain_id", "is_timed_auction", "timed", "next_hours_auction", "sale_date_in_days", "buy_now", "status", "exclude_expired_auctions", "auction_type", "with_reserve", "reserve"]);
        const pp = {}; for(const kv of String(query.get("probe")).split(",")){ const [k, v] = kv.split(":"); if(okKeys.has(k) && /^[\w-]{1,20}$/.test(v || "")) pp[k] = v; }
        const p = new URLSearchParams({per_page:"2", page:"1", simple_paginate:"0", prices_history:"0", ...pp});
        const data = await fetchJson(`${AUCTIONS_API_BASE}/cars?${p}`).catch(e => ({error:String(e.message || e).slice(0, 100)}));
        const its = findItems(data) || [];
        out.probe = {params:pp, total:Number(data?.total ?? data?.meta?.total ?? data?.data?.total) || 0, keys:its[0] ? Object.keys(((its[0].lots||[])[0]) || its[0]).slice(0, 60) : [], sample:its.slice(0, 2).map(it => { const l = (it.lots||[])[0] || it; return {lot:l.lot, is_timed:l.is_timed_auction, type:l.auction_type, reserve:l.seller_reserve, sale_date:l.sale_date}; }), error:data?.error || null};
        sendJson(response, 200, out, {"cache-control":"no-store"});
        return;
      }
      const days = String(query.get("days") || "1,7,30,60").split(",").map(x => x.replace(/[^0-9]/g, "")).filter(Boolean).slice(0, 6);
      for(const [name, d] of [["copart", "3"], ["iaai", "1"]]){
        const o = {total:await one({domain_id:d}), sold:await one({domain_id:d, status:"6"}), buy_now:await one({domain_id:d, buy_now:"1"}),
          next48h:await one({domain_id:d, next_hours_auction:"48"})};
        for(const n of days){
          o[`days${n}`] = await one({domain_id:d, sale_date_in_days:n, exclude_expired_auctions:"0"});
          o[`days${n}_noexp`] = await one({domain_id:d, sale_date_in_days:n, exclude_expired_auctions:"1"});
        }
        out[name] = o;
      }
      setCached(ck, out, 600);
      sendJson(response, 200, out, {"cache-control":"no-store"});
      return;
    }
    if(action === "count"){
      const ck = "catalog-count"; const c = getCached(ck);
      if(c){ sendJson(response, 200, c, {"cache-control":"public, s-maxage=600, stale-while-revalidate=3600"}); return; }
      // Протухшее значение (до 30 мин) отдаём сразу, пересчёт — в фоне: холодный count занимал до 9с.
      const stale = cache.get(ck + ":stale");
      if(stale && Date.now() - stale.at < 30 * 60e3 && !cache.get(ck + ":busy")){
        cache.set(ck + ":busy", {value:1, expires:Date.now() + 60e3});
        computeCatalogCount().then(p => { if(p){ setCached(ck, p, p._complete ? 10 * 60e3 : 60e3); cache.set(ck + ":stale", {value:p, at:Date.now(), expires:Date.now() + 3600e3}); } }).catch(() => {}).finally(() => cache.delete(ck + ":busy"));
        sendJson(response, 200, {...stale.value, stale:true}, {"cache-control":"public, s-maxage=120, stale-while-revalidate=600"});
        return;
      }
      const payload = await computeCatalogCount();
      if(query.get("debug")) payload.debug = tabTotal.debug || [];
      const complete = !!payload._complete;
      // Неполный набор (база не успела) — кэшируем коротко, чтобы бейджи не зависли пустыми на 10 мин.
      setCached(ck, payload, complete ? 10 * 60e3 : 60e3);
      cache.set(ck + ":stale", {value:payload, at:Date.now(), expires:Date.now() + 3600e3});
      sendJson(response, 200, payload, {"cache-control":complete ? "public, s-maxage=600, stale-while-revalidate=3600" : "public, s-maxage=60, stale-while-revalidate=300"});
      return;
    }
    if(action === "livebids"){
      const ids = [...new Set(String(query.get("ids") || "").split(",").map(x => x.trim()).filter(x => /^(copart|iaai)-[0-9]+$/.test(x)))].slice(0, 30);
      const out = {};
      const one = async id => {
        const ck = "livebid:" + id; const c = getCached(ck); if(c){ out[id] = c; return; }
        try{
          const [auction, lotNo] = id.split("-");
          const lot = await fetchDetail(new URLSearchParams({auction, lot:lotNo}));
          const r = {currentBid:Number(lot.currentBid) || 0, buyNow:Number(lot.buyNow) || 0, sellerReserve:Number(lot.sellerReserve) || 0,
            saleStatus:lot.saleStatus || "", timed:!!lot.timed, statusId:lot.statusId, auctionDate:lot.auctionDate || ""};
          // Лот по данным самого лота (не списка) уже продан — карточка в каталоге показывала «сегодня на торгах» (IAAI 44995177):
          // отдаём клиенту флаг и заодно лечим строку в базе (архив), чтобы ошибка не жила дальше.
          if(Number(lot.statusId) === 6 && Date.parse(lot.auctionDate || "") < Date.now()){ r.sold = true; r.finalBid = Number(lot.finalBid) || Number(lot.currentBid) || 0; upsertClosedLot(lot); }
          setCached(ck, r, 2 * 60e3); out[id] = r;
        }catch(e){ out[id] = null; }
      };
      // 6 → 10: паучок был лишним ограничением (upstream — платный тариф без задокументированного
      // лимита в секунду), 30 лотов теперь ~3 волны вместо 5 (23.09.2026, замер: 2с → ~1.2с).
      for(let i = 0; i < ids.length; i += 10) await Promise.all(ids.slice(i, i + 10).map(one));
      sendJson(response, 200, {ok:true, items:out}, {"cache-control":"public, s-maxage=120, stale-while-revalidate=60"});
      return;
    }
    if(action === "vinhist"){
      const vins = [...new Set(String(query.get("vins") || "").toUpperCase().split(",").map(v => v.replace(/[^A-Z0-9]/g, "")).filter(isValidVin))].slice(0, 30);
      const out = {};
      // Сначала наше хранилище (vin_hist, свежее ≤24ч): мгновенно и без запросов к фиду; фид — только для того, чего в базе нет.
      const storedMap = {};
      try{
        const since = encodeURIComponent(new Date(Date.now() - 24 * 3600e3).toISOString());
        const rows = await syncSbFetch(`/vin_hist?vin=in.(${vins.join(",")})&checked_at=gt.${since}&select=vin,entries`);
        for(const r of rows || []) storedMap[r.vin] = r.entries;
      }catch(_){}
      const one = async vin => {
        const ck = "vinhist4:" + vin;
        const c = getCached(ck);
        if(c){ out[vin] = c; return; }
        try{
          let h, fromStore = false;
          if(Array.isArray(storedMap[vin])){ h = storedMap[vin]; fromStore = true; }
          else{
            const stub = {vin, lot:"", auctionDate:"", estimatedRetailValue:0, buyNow:0, priceHistory:[]};
            await attachVinHistory(stub);
            if(stub.vinChecked === false){ out[vin] = null; return; }   // сбой фида и нет запаса — клиент повторит, не «ранее не продавалась»
            h = stub.priceHistory || [];
          }
          const sold = h.filter(x => x.status === "sold");
          // Отдаём записи с номером лота и датой: клиент сам исключает ТЕКУЩИЙ лот (для архивной
          // карточки её собственная продажа — не «ранее», а эта самая продажа).
          const r = {count:h.length, sold:sold.length, lastSale:sold[0] ? {date:sold[0].date.slice(0, 10), bid:sold[0].bid} : null,
            entries:[...sold, ...h.filter(x => x.status !== "sold")].slice(0, 40).map(x => ({date:String(x.date).slice(0, 10), bid:x.bid, status:x.status, lot:x.lot || "", auction:x.auction || "", ...(x.noPrice ? {noPrice:true} : {})}))};
          setCached(ck, r, 2 * 3600e3);
          out[vin] = fromStore ? r : {...r, fresh:true};
        }catch(e){ out[vin] = null; }
      };
      for(let i = 0; i < vins.length; i += 10) await Promise.all(vins.slice(i, i + 10).map(one));
      // Clean Select: карточки, которые смотрят люди, размечаем сразу (только живые лоты без метки; уровень 0 не пишем — его выставит фоновая проверка)
      try{
        const byLevel = {1:[], 2:[]};
        for(const v of Object.keys(out)){
          const e = out[v]; if(!e || !e.fresh) continue;
          const lvl = resaleLevel({priceHistory:e.entries.map(x => ({...x, date:x.date}))}, "", "");
          if(lvl > 0) byLevel[lvl].push(v);
        }
        const stamp = new Date().toISOString();
        for(const lvl of [1, 2]) if(byLevel[lvl].length) syncSbFetch(`/api_lots?vin=in.(${byLevel[lvl].join(",")})&archived=eq.false&resale_at=is.null`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({resale:lvl, resale_at:stamp})}).catch(() => {});
      }catch(_){}
      for(const v of Object.keys(out)) if(out[v] && out[v].fresh) delete out[v].fresh;
      sendJson(response, 200, {ok:true, items:out}, {"cache-control":"public, s-maxage=3600, stale-while-revalidate=21600"});
      return;
    }

    if(action === "vin"){
      const lot = await fetchVin(query);
      await attachGenRange(lot);
      upsertClosedLot(lot);
      const payload = {ok:true,lot};
      setCached(key, payload);
      setDbCache(key, payload, "vin");
      sendJson(response, 200, payload);
      return;
    }

    if(action === "dbstatus"){
      // Диагностика БД: доступность, фаза синка, счётчики (read-only).
      const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
      const skey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      const out = {ok:true, hasEnv:!!(url && skey), sbUp:sbUp(), lotsDbReady:await lotsDbReady().catch(() => false), readyLast:lotsDbReady.last || null, sync:null, total:null, sold:null, error:null};
      if(url && skey){
        const H = {apikey:skey, authorization:`Bearer ${skey}`};
        // Короткий abort — иначе висящие запросы к БД упирались в лимит функции.
        const withTimeout = async (path, extra, ms) => {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), ms || 3000);
          const started = Date.now();
          try{ const r = await fetch(`${url}/rest/v1${path}`, {headers:{...H, ...(extra || {})}, signal:ctrl.signal}); return {r, ms:Date.now() - started}; }
          catch(e){ return {err:(e && e.name === "AbortError") ? `timeout>${ms || 3000}ms` : String(e.message || e).slice(0, 40)}; }
          finally{ clearTimeout(t); }
        };
        const count = async q => {
          const {r, err} = await withTimeout(`/api_lots?${q}&select=id`, {prefer:"count=estimated", range:"0-0", "range-unit":"items"}, 3500);
          if(err) return err;
          return r.ok ? Number((r.headers.get("content-range") || "*/0").split("/").pop()) || 0 : `HTTP ${r.status}`;
        };
        const {r, err, ms} = await withTimeout(`/api_sync_state?k=eq.main&select=v,updated_at`, {}, 3500);
        out.sync = err || (r.ok ? ((await r.json())[0] || null) : `HTTP ${r.status}`);
        out.syncMs = err ? null : ms;
        out.total = await count("");
        out.sold = await count("status_id=eq.6");
        const cr = await withTimeout(`/api_cache?select=cache_key&cache_key=eq.__probe__`, {}, 3500);
        out.cacheMs = cr.err || cr.ms;
        const cc = await withTimeout(`/api_cache?select=cache_key`, {prefer:"count=planned", range:"0-0", "range-unit":"items"}, 3500);
        out.cacheRows = cc.err || (cc.r && (cc.r.ok || cc.r.status === 416) ? Number((cc.r.headers.get("content-range") || "*/0").split("/").pop()) || 0 : `HTTP ${cc.r && cc.r.status}`);
      }
      sendJson(response, 200, out);
      return;
    }

    // Диагностика точности оценки (read-only): leave-one-out по истории продаж модели.
    // Каждую проданную машину «оцениваем» по остальным и сравниваем с реальным молотком.
    if(action === "compstest"){
      const makeId = String(query.get("manufacturer_id") || "").replace(/[^0-9]/g, "");
      const modelId = String(query.get("model_id") || "").replace(/[^0-9]/g, "");
      const rows = (makeId && modelId) ? await fetchSoldCompsFromDb(makeId, modelId) : null;
      if(!rows){ sendJson(response, 200, {ok:false, reason:"no db rows"}); return; }
      const genCache = new Map();
      // Проверка ТАБЛИЦЫ Федора на тех же продажах (только агрегаты — цифры таблицы наружу не уходят).
      const guideRows = await priceGuide.loadGuide();
      const mkName = String(query.get("make_name") || ""), mdName = String(query.get("model_name") || "");
      const FUEL_TXT = {1:"Gasoline", 2:"Electric", 3:"Hybrid", 4:"Diesel"};
      const tErrs = [], tRatio = [], tIn20 = [], tByYear = {}, tLow = [], tHigh = [];
      const errs = [], inBand = [], widths = [], gErrs = [], gIn = [], gRatio = [], gIn10 = [], gIn15 = [], gIn20 = []; let nulls = 0;
      const sample = rows.filter(r => !r.heavy && r.year >= 2012).slice(0, 400);
      for(const r of sample){
        if(!genCache.has(r.year)) genCache.set(r.year, await resolveGenRange(modelId, r.year, ""));
        const g = genCache.get(r.year);
        const rest = rows.filter(x => x !== r);
        const st = computeComps(rest, {year:r.year, odometer:r.odometer_mi, fuelId:r.fuel_id, genId:"", genFrom:g.genFrom, genTo:g.genTo, run:r.run, cq:r.run ? "good" : "poor"});
        if(!st || !st.median){ nulls++; continue; }
        errs.push(Math.abs(st.median - r.final_bid) / r.final_bid);
        if(mkName && guideRows.length){
          const parts = String(r.dmg || "").split(/\s+\/\s+/);
          const row = priceGuide.matchGuide(guideRows, {make:mkName, model:mdName, title:r.title, gen:((tableGens(modelId) || []).find(x => x.from === g.genFrom) || {}).name || "", year:r.year, fuel:FUEL_TXT[r.fuel_id] || ""});
          if(row){
            const cf = priceGuide.conditionCoef({dmg:parts[0], dmg2:parts[1] || "", run:r.run, doc:r.doc});
            // Таблица Федора рассчитана на пробег до 100 тыс. миль — считаем отдельно «как в таблице» и «пробежные».
            const lowMi = r.odometer_mi > 0 && r.odometer_mi < 100000;
            (lowMi ? tLow : tHigh).push(r.final_bid / priceGuide.guideBand(row.base_price * priceGuide.mileageFactor(r.odometer_mi), row.k, cf).mid);
            const tb = priceGuide.guideBand(row.base_price, row.k, cf);
            const rel = Math.abs(r.final_bid - tb.mid) / r.final_bid;
            tErrs.push(rel); tRatio.push(r.final_bid / tb.mid);
            (tByYear[r.auction || "?"] = tByYear[r.auction || "?"] || []).push(r.final_bid / tb.mid); tIn20.push(Math.abs(r.final_bid - tb.mid) / tb.mid <= .2 ? 1 : 0);
          }
        }
        const gb = dataGuideBase(rest, g, r.fuel_id, r.year);
        if(gb){
          const dp = String(r.dmg || "").split(/\s+\/\s+/);
          const cf = priceGuide.conditionCoef({dmg:dp[0], dmg2:dp[1] || "", run:r.run, doc:r.doc});
          const b = priceGuide.guideBand(gb, DATA_GUIDE_K, cf);
          gErrs.push(Math.abs(b.mid - r.final_bid) / r.final_bid);
          gIn.push(r.final_bid >= b.lo && r.final_bid <= b.hi ? 1 : 0);
          const rel = Math.abs(r.final_bid - b.mid) / b.mid; gIn10.push(rel <= .10 ? 1 : 0); gIn15.push(rel <= .15 ? 1 : 0); gIn20.push(rel <= .20 ? 1 : 0);
          gRatio.push(r.final_bid / (gb * cf));
        }
        inBand.push(r.final_bid >= st.p25 && r.final_bid <= st.p75 ? 1 : 0);
        widths.push((st.p75 - st.p25) / Math.max(1, st.median));
      }
      const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
      const pct = (a, f) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) * f)] : null; };
      sendJson(response, 200, {ok:true, pool:rows.length, tested:errs.length, noEstimate:nulls,
        medianAbsErrPct:errs.length ? Math.round(med(errs) * 100) : null,
        p80AbsErrPct:errs.length ? Math.round(pct(errs, .8) * 100) : null,
        within25pct:errs.length ? Math.round(errs.filter(e => e <= .25).length / errs.length * 100) : null,
        actualInsideBandPct:inBand.length ? Math.round(inBand.reduce((x, y) => x + y, 0) / inBand.length * 100) : null,
        medianBandWidthPct:widths.length ? Math.round(med(widths) * 100) : null,
        table:{tested:tErrs.length, medianAbsErrPct:tErrs.length ? Math.round(med(tErrs) * 100) : null,
          within25pct:tErrs.length ? Math.round(tErrs.filter(e => e <= .25).length / tErrs.length * 100) : null,
          inside20:tIn20.length ? Math.round(tIn20.reduce((x, y) => x + y, 0) / tIn20.length * 100) : null,
          actualToGuideRatio:tRatio.length ? Math.round(med(tRatio) * 100) / 100 : null,
          under100k:{n:tLow.length, ratio:tLow.length ? Math.round(med(tLow) * 100) / 100 : null, within25pct:tLow.length ? Math.round(tLow.filter(x => Math.abs(x - 1) <= .25).length / tLow.length * 100) : null},
          over100k:{n:tHigh.length, ratio:tHigh.length ? Math.round(med(tHigh) * 100) / 100 : null},
          ratioByAuction:Object.fromEntries(Object.entries(tByYear).map(([k, v]) => [k, {n:v.length, ratio:Math.round(med(v) * 100) / 100}]))},
        formula:{tested:gErrs.length, medianAbsErrPct:gErrs.length ? Math.round(med(gErrs) * 100) : null,
          within25pct:gErrs.length ? Math.round(gErrs.filter(e => e <= .25).length / gErrs.length * 100) : null,
          insideBandPct:gIn.length ? Math.round(gIn.reduce((x, y) => x + y, 0) / gIn.length * 100) : null,
          impliedK:gRatio.length ? Math.round(med(gRatio) * 100) / 100 : null,
          inside10:gIn10.length ? Math.round(gIn10.reduce((x, y) => x + y, 0) / gIn10.length * 100) : null,
          inside15:gIn15.length ? Math.round(gIn15.reduce((x, y) => x + y, 0) / gIn15.length * 100) : null,
          inside20:gIn20.length ? Math.round(gIn20.reduce((x, y) => x + y, 0) / gIn20.length * 100) : null}}, {"cache-control":"no-store"});
      return;
    }

    if(action === "comps"){
      // Оценка по реальным проданным лотам с учётом топлива, года и пробега (общая логика — computeCompsForQ,
      // делится с action=compsbatch ниже).
      const comps = await computeCompsForQ(query);
      const payload = comps ? {ok:true, comps} : {ok:false};
      setCached(key, payload);
      sendJson(response, 200, payload, COMPS_EDGE_CACHE);
      return;
    }

    if(action === "statistics"){
      const p = new URLSearchParams();
      ["manufacturer_id","model_id","generation_id","engine_id","year"].forEach(k => {
        const v = String(query.get(k) || "").replace(/[^0-9]/g, "");
        if(k === "generation_id" && parseSynGen(v)) return;   // наш синтетический id провайдеру неизвестен
        if(v) p.set(k, v);
      });
      const data = await fetchJson(`${AUCTIONS_API_BASE}/statistics?${p}`);
      const payload = {ok:true, stats:(data && data.data) || data || null};
      setCached(key, payload);
      // Агрегат меняется медленно и общий на всю модель → держим на edge подольше.
      sendJson(response, 200, payload, STATS_EDGE_CACHE);
      return;
    }

    if(action === "showcase"){
      // Витрина лотов на главной: ГИБРИД/PHEV/ЭЛЕКТРО/BMW, 2020+, только «на ходу»
      // (run_and_drives), ВПЕРВЫЕ на аукционе (в истории нет прошлых продаж) и без
      // «котлет» (без тяжёлых/утильных повреждений). Проверка «впервые» требует
      // истории лота (её нет в списке/БД — только в detail), поэтому добираем
      // detail по кандидатам. Дорого на каждый показ → считаем РАЗ в 30 минут и
      // отдаём с edge-кэшем: одна пересборка на всех посетителей.
      const SHOWCASE_EDGE = {"cache-control":"public, s-maxage=900, stale-while-revalidate=86400"};
      const shim = obj => ({ get: k => (obj[k] != null ? String(obj[k]) : null) });
      // «Без котлет» — витрина: ТОЛЬКО косметика. Каждая зона повреждения должна
      // быть «Minor Dent/Scratches», «None» или «Damage History» (без видимых
      // повреждений). Normal Wear, Hail, Mechanical, любые зоны кузова (морда/зад/
      // бок), структурное, огонь/вода — исключаем.
      const COSMETIC = /^(minor dent\/scratches|minor dents?\/scratches|minor dent|scratches|none|damage history)$/i;
      const cosmeticOnly = it => {
        const zones = (String(it.damage || "") + " / " + String(it.secondaryDamage || ""))
          .split("/").map(x => x.trim()).filter(Boolean);
        return zones.length > 0 && zones.every(z => COSMETIC.test(z));
      };
      const NOT_CAR = /bike|motorcycle|moped|scooter|atv|quad|snowmobile|watercraft|jet ?ski|trailer/i;
      const cheapOk = it => it && it.image && Number(it.year) >= 2020
        && String(it.condition || "").toLowerCase() === "run_and_drives"
        && cosmeticOnly(it)
        && repairOk(it)
        && !NOT_CAR.test(String(it.body || "") + " " + String(it.vehicleType || ""));
      // Ранжируем по МИНИМАЛЬНОМУ РЕМОНТУ: отношение оценки ремонта к оценочной
      // стоимости авто (repairCost / estimatedRetailValue) — чем меньше, тем выше.
      // Без оценки ремонта — в конец. Затем новее и с меньшим пробегом.
      // estimatedRetailValue в фиде часто «1» (заглушка) — считаем оценку валидной
      // только при > $1000. Ремонт > 25% от оценки — не «минимум ремонта», исключаем.
      const REPAIR_MAX = 0.25;
      const repairRatio = it => {
        const rc = Number(it.repairCost) || 0, v = Number(it.estimatedRetailValue) || 0;
        return rc > 0 && v > 1000 ? rc / v : null;   // null = оценки нет
      };
      const repairOk = it => { const r = repairRatio(it); return r == null || r <= REPAIR_MAX; };
      const score = it => { const r = repairRatio(it); return (r == null ? 9 : r) * 1e6 - Number(it.year) * 1e3 + Math.min(Number(it.odometer) || 0, 300000) / 100; };
      try{
        // Топливо — числовыми id (как в каталоге): 3 = гибрид, 2 = электро.
        // Отдельного PHEV-id нет (feed кладёт plug-in в гибрид/электро). BMW — по
        // марке (любое топливо). Сырые слова API не фильтрует → берём id.
        const bases = [{fuel:"3"}, {fuel:"2"}, {make:"16"}];
        const lists = await Promise.all(bases.map(b =>
          fetchSearch(shim({ ...b, yearFrom:"2020", per_page:"150", auction:"all" }))
            .then(r => (r.items || []).filter(cheapOk).sort((a, b) => score(a) - score(b))).catch(() => [])
        ));
        // Round-robin: перемешиваем гибрид/PHEV/электро/BMW, чтобы витрина не
        // забивалась одной маркой; дедуп по id.
        const seen = new Set(), cand = [];
        for(let i = 0; i < 150; i++){
          for(const l of lists){ const it = l[i]; if(it && !seen.has(it.id)){ seen.add(it.id); cand.push(it); } }
        }
        // «Впервые на аукционе»: сегмент почти весь перевыставлен, поэтому строго
        // «ни разу не был» — редкость. Убираем УЖЕ ПРОДАННЫЕ ранее (перекуп/
        // повторы), а из чистых ставим truly-first-time (нет прошлых торгов)
        // вперёд, добирая «ни разу не проданными» (был выставлен, но не купили).
        // Историю тянем волнами (detail) с бюджетом 48 на всех (раз в 30 мин).
        const classify = ph => {
          let sold = false, past = false;
          for(const h of (ph || [])){
            const st = String(h && h.status || "").toLowerCase();
            if(st === "not_sold"){ past = true; }
            else if(/sold/.test(st)){ sold = true; past = true; }
          }
          return { sold, first: !past };
        };
        const firstTier = [], secondTier = [];
        // Собираем ПУЛ до 24: клиент показывает случайные 8 на каждом заходе —
        // витрина меняется, а не висит одним набором. Бюджет detail — 72 на всех.
        for(let i = 0; i < cand.length && i < 72 && (firstTier.length + secondTier.length) < 24; i += 12){
          const wave = await Promise.all(cand.slice(i, i + 12).map(it =>
            fetchDetail(shim({ auction: it.auction, lot: it.lot }))
              .then(d => attachVinHistory(d))                 // история ПО VIN, не по номеру лота
              .then(d => ({ it, c: classify(d.priceHistory) }))
              .catch(() => null)
          ));
          for(const r of wave){
            if(!r || r.c.sold) continue;                 // уже продавалась — вон
            (r.c.first ? firstTier : secondTier).push(r.it);
          }
        }
        // Итоговый пул — снова по минимальному ремонту (tier «впервые» лишь отсекает
        // уже проданные; порядок задаёт repairCost / estimatedRetailValue).
        const items = firstTier.concat(secondTier).sort((a, b) => score(a) - score(b)).slice(0, 24);
        const payload = {ok:true, items};
        setCached(key, payload, 15 * 60 * 1000);
        sendJson(response, 200, payload, SHOWCASE_EDGE);
      }catch(e){
        sendJson(response, 200, {ok:true, items:[]}, SHOWCASE_EDGE);
      }
      return;
    }

    if(action === "search"){
      // Топливо словом (старые/ручные ссылки: fuel=hybrid) → числовой id, как
      // шлёт UI. Иначе строка не проходит DB-фильтр (только числа) и запрос
      // валится на live-фоллбэк с ошибкой.
      normalizeFuelParam(query);
      // Локальная база (DreamBid-модель) — честная сортировка/фильтры по всему
      // каталогу; live-запрос к API остаётся фоллбеком, пока база не готова.
      let result = null;
      let dbErr = null;
      try{ result = await searchFromDb(query); }catch(e){ dbErr = String(e && e.message || e).slice(0, 200); result = null; }
      if(!result){
        result = await fetchSearch(query);
        // Live-фолбэк без фильтров: total фида — ВСЕ домены (с Кореей, 782k) и «прыгает» относительно базы.
        // Берём последний известный счётчик вкладки из базы (кэш tabTotal), если он есть.
        const FILTER_FREE = new Set(["tab", "auction", "sort", "page", "per_page", "limit", "lang", "_", "fresh", "action"]);
        const tab0 = query.get("tab") || "all";
        if([...query.keys()].every(k => FILTER_FREE.has(k)) && ["all", "soon", "buy_now"].includes(tab0)){
          const tc = tabTotalCache.get(`${tab0}|${query.get("auction") || "all"}`);
          if(tc && tc.n > 0) result = {...result, total:tc.n};
          else if((query.get("auction") || "all") === "all"){
            // Базы нет и счётчика из неё нет: фид по площадкам отдельно (без Кореи), кэш 10 мин на инстанс.
            const lk = `live|${tab0}`; const lc = tabTotalCache.get(lk);
            let n = lc && Date.now() - lc.at < 10 * 60e3 ? lc.n : 0;
            if(!n){
              const [c, i] = await Promise.all(["copart", "iaai"].map(a => fetchSearch(new URLSearchParams({tab:tab0, auction:a, per_page:"1"})).catch(() => null)));
              n = ((c && c.total) || 0) + ((i && i.total) || 0);
              if(n > 0) tabTotalCache.set(lk, {n, at:Date.now()});
            }
            if(n > 0) result = {...result, total:n};
          }
        }
      }
      if(dbErr) console.error("searchFromDb fallback:", dbErr);
      const pastTab = (query.get("tab") === "sold" || query.get("tab") === "archived");
      const payload = {ok:true,...result,items:sortItems(result.items, query.get("sort") || "soon", {pastTab}), ...(dbErr ? {_dbErr:dbErr} : {}), ...(!result._source && !sbUp() ? {_dbDown:true} : {}), ...(query.get("debug") ? {_t:searchFromDb.t} : {})};
      // Fallback results cached briefly; real results cached 6h in Supabase.
      setCached(key, payload, result._fallback ? 90 * 1000 : 3 * 60 * 1000);
      // api_cache для search не пишем (см. dbCacheActions).
      sendJson(response, 200, payload);
      return;
    }

    sendJson(response, 404, {ok:false,error:"Unknown auctions action"});
  }catch(error){
    // Upstream failed (rate limit or outage): serve stale Supabase cache if we have it —
    // slightly old lots beat an empty catalog.
    if(action === "search" || action === "detail" || action === "vin"){
      const stale = await getDbCacheStale(key);
      if(stale && stale.ok){
        setCached(key, stale, 120 * 1000);
        sendJson(response, 200, {...stale, stale:true});
        return;
      }
    }
    // 429 rate-limit: return 200 so Vercel CDN caches the response and stops hammering auctionsapi.com.
    // Other errors return their status so CDN doesn't cache them.
    if(error.status === 429){
      sendJson(response, 200, {ok:false, rateLimited:true, items:[], total:0,
        error:"Превышен лимит запросов к AuctionsAPI. Данные обновятся через несколько минут."});
      return;
    }
    sendJson(response, error.status || 502, {
      ok:false,
      error:error.status === 500
        ? "Не удалось загрузить реальные лоты AuctionsAPI. Проверьте AUCTIONS_API_KEY или попробуйте позже."
        : "Не удалось загрузить реальные лоты AuctionsAPI. Попробуйте позже.",
    });
  }
};
