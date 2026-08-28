const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const supabase = require("../server/supabase");

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
  try{
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:chatId, text:lines.join("\n"), parse_mode:"Markdown"})
    });
  }catch(_){}
}

function cacheKey(action, params){
  return `${action}:${Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("&")}`;
}

// DB_TTL in seconds: search=6h, detail=30мин (аукционы переносят даты — 24h кеш
// показывал устаревшую дату торгов), vin=7d, dict/lists=12h
const DB_TTL = {search:21600, detail:1800, vin:604800, _default:43200};

// Supabase может лечь/тормозить (переполнение, пауза проекта) — его никогда
// не ждём дольше 3с: иначе каждый запрос каталога висел до 60с таймаута
// функции вместо мгновенного перехода на живой API.
const SB_WAIT_MS = 3000;
function withTimeout(promise, ms, fallback){
  return Promise.race([
    promise.catch(() => fallback),
    new Promise(resolve => setTimeout(() => resolve(fallback), ms))
  ]);
}

async function getDbCache(key){
  try{
    const now = new Date().toISOString();
    const rows = await withTimeout(supabase.list("api_cache", {
      cache_key:`eq.${key}`, expires_at:`gt.${now}`, select:"data", limit:1
    }), SB_WAIT_MS, null);
    return rows && rows[0] ? rows[0].data : null;
  }catch(_){ return null; }
}

// Stale read: same row, but ignores expires_at — used when the upstream API is down/rate-limited.
async function getDbCacheStale(key){
  try{
    const rows = await withTimeout(supabase.list("api_cache", {
      cache_key:`eq.${key}`, select:"data", limit:1
    }), SB_WAIT_MS, null);
    return rows && rows[0] ? rows[0].data : null;
  }catch(_){ return null; }
}

async function setDbCache(key, data, action){
  try{
    const ttl = DB_TTL[action] || DB_TTL._default;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    await supabase.upsert("api_cache", {cache_key:key, data, expires_at:expiresAt}, "cache_key");
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
  const name = safeName(lot?.seller || item?.seller);
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
  const reserve = lot?.seller_reserve != null ? lot.seller_reserve : item?.seller_reserve;
  const auctionType = safeName(lot?.auction_type || item?.auction_type).toLowerCase();
  const timed = lot?.is_timed_auction === true || item?.is_timed_auction === true;
  let key = "", label = "";
  if(reserve != null && Number(reserve) > 0){ key = "min_reserve"; label = "Минимальный резерв"; }
  else if(auctionType === "pure_sale"){ key = "no_reserve"; label = "Без резерва"; }
  if(!label && timed){ key = "timed"; label = "Timed аукцион"; }
  else if(label && timed){ label += " · Timed"; }
  return {key, label, timed};
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

function normalizeLot(source, fallbackAuction = "copart"){
  const item = source?.data && !Array.isArray(source.data) ? source.data : source;
  const lots = Array.isArray(item?.lots) ? item.lots : [];
  const lot = lots[0] || item?.lot || item;
  const auction = normalizeAuction(item?.auction || lot?.auction || item?.domain || lot?.domain || fallbackAuction);
  const make = safeName(item?.manufacturer || item?.make || item?.brand);
  const model = safeName(item?.model);
  const year = safeNumber(item?.year);
  const lotNumber = String(lot?.lot || lot?.lot_number || lot?.lotNumber || lot?.external_id || item?.lot || item?.lot_number || item?.lotNumber || "").replace(/~.*/, "");
  // For IAAI: external_id is the stock number used in the URL (lot.lot is the internal API id).
  const iaaiExternalId = auction === "iaai" ? String(lot?.external_id || lotNumber).replace(/~.*/, "") : "";
  const title = item?.title || [year, make, model].filter(Boolean).join(" ") || "Автомобиль";
  const location = locationLabel(lot?.location) || safeName(lot?.branch || lot?.selling_branch) || locationLabel(item?.location);
  const primaryDamage = safeName(lot?.damage?.main || lot?.primary_damage || lot?.primaryDamage || item?.primary_damage || item?.damage);
  const secondaryDamage = safeName(lot?.damage?.second || lot?.secondary_damage || lot?.secondaryDamage || item?.secondary_damage);
  const odometer = safeNumber(lot?.odometer?.mi || lot?.odometer || item?.odometer || item?.mileage);
  const currentBid = safeNumber(lot?.bid || lot?.current_bid || lot?.currentBid || item?.current_bid || item?.bid);
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
  const priceHistoryRaw = rawHistory.map(p => ({
    bid:safeNumber(p?.bid || p?.final_bid || p?.current_bid),
    buyNow:safeNumber(p?.buy_now_price || p?.buy_now),
    date:p?.sale_date || "",
    status:safeName(p?.status),
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
  const priceHistory = Array.from(byDay.values())
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
  const resolvedFinalBid = finalBid || (!currentBid && priceHistory.length ? (priceHistory[0].bid || 0) : 0);
  const images = imageList(lot).length ? imageList(lot) : imageList(item);

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
    currentBid,
    finalBid:resolvedFinalBid,
    buyNow,
    odometer,
    odometerKm:safeNumber(lot?.odometer?.km),
    odometerText:odometer ? `${odometer.toLocaleString("en-US")} mi` : "",
    odometerStatus:safeName(lot?.odometer?.status),
    primaryDamage,
    secondaryDamage,
    damage:[primaryDamage, secondaryDamage].filter(Boolean).join(" / "),
    document:safeName(lot?.document || item?.document || lot?.detailed_title || lot?.title),
    titleStatus:safeName(lot?.detailed_title || lot?.title || item?.title),
    saleType:safeName(lot?.loss_type || lot?.casualty_type || lot?.damage_type || item?.loss_type || item?.casualty_type),
    fuel:safeName(item?.fuel || lot?.fuel),
    engine:safeName(item?.engine || lot?.engine),
    transmission:safeName(item?.transmission || lot?.transmission),
    drive:driveLabel(item?.drive_wheel || lot?.drive_wheel || item?.drive || item?.drive_type || lot?.drive),
    body:safeName(item?.body_type || item?.vehicle_type || lot?.body_type),
    cylinders:safeName(item?.cylinders || lot?.cylinders),
    color:safeName(item?.color || lot?.color),
    keys:keysLabel(lot, item),
    video:(lot?.images?.video) || (item?.images?.video) || "",
    estimatedRetailValue:safeNumber(lot?.actual_cash_value || lot?.estimated_retail_value || lot?.pre_accident_price || lot?.clean_wholesale_price || item?.estimated_retail_value || item?.acv),
    preAccidentPrice:safeNumber(lot?.pre_accident_price),
    cleanWholesalePrice:safeNumber(lot?.clean_wholesale_price),
    seller:sellerLabel(lot, item),
    sellerType:safeName(lot?.seller_type || item?.seller_type),
    condition:safeName(lot?.condition || item?.condition),
    priceHistory,
    photoCount:images.length,
    lotStatus:lotStatus(item, lot),
    statusName,
    statusId,
    saleStatus:sale.label,
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
    fuel:"fuel_type",
    body:"body_type",
    transmission:"transmission",
    drive:"drive_wheel",
    condition:"condition",
    color:"color",
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
    const value = query.get(from);
    if(value) params.set(to, value);
  }
  const make = query.get("make");
  const model = query.get("model");
  if(make && /^[\d,]+$/.test(make)) params.set("manufacturer_id", make);
  if(model && /^\d+$/.test(model)) params.set("model_id", model);
  // Sale status (reserve type) is not a server-side filter on /cars — applied
  // client-side over loaded lots. "На утверждении" maps to the status param.
  if(query.get("saleStatus") === "on_approval") params.set("status", "4");
  const tab = query.get("tab");
  if(tab === "buy_now") params.set("buy_now", "1");
  if(tab === "sold") params.set("status", "6");
  // Archive = completed auctions (sold + not sold). sale_date filters are
  // unreliable in this API, so use the status field (CSV is accepted).
  if(tab === "archived" && !params.get("status") && query.get("lotStatus") == null){
    params.set("status", "6,8");
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
      .filter(lot => wantsPast ? String(lot.statusId) === "6" : String(lot.statusId) !== "6");
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
  // Demo-mode limit: max per_page=50. Clamp to avoid 400 errors.
  // Remove this cap if the auctionsapi.com plan is upgraded to paid.
  const API_MAX_PER_PAGE = 50;
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
    let lastError, lastEndpoint = attempts[0];
    for(const url of attempts){
      try{
        lastEndpoint = url;
        const payload = await fetchJson(url);
        const tab = query.get("tab") || "all";
        const wantsPast = tab === "archived" || tab === "sold";
        const items = findItems(payload)
          .filter(item => !isAll || !isEncar(item))
          .map(item => normalizeLot(item, isAll ? (item?.domain || auction) : auction))
          // For live tabs strip definitively sold/unsold lots (status 6/8).
          // Don't filter by past auction date — recently ended lots may not have
          // status 6/8 yet (feed lag). sortItems("soon") puts future lots first,
          // recently ended ones at the bottom — same as bid.cars behavior.
          .filter(lot => wantsPast || (String(lot.statusId) !== "6" && String(lot.statusId) !== "8"));
        const total = safeNumber(payload?.total || payload?.count || payload?.data?.total || payload?.data?.count || payload?.meta?.total);
        return {
          items, total, shown:items.length,
          page:safeNumber(query.get("page")) || 1, perPage,
          hasMore:total ? (safeNumber(query.get("page")) || 1) * perPage < total : items.length >= perPage,
          endpoint:lastEndpoint.replace(process.env.AUCTIONS_API_KEY || "", "")
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
      const normalized = normalizeLot(payload, auction);
      // Отладка нормализации: ?raw=1 отдаёт и сырой ответ auctionsapi
      if(query.get("raw") === "1") normalized.__raw = payload;
      return normalized;
    }catch(error){
      lastError = error;
    }
  }
  throw lastError || new Error("Lot detail failed");
}

async function fetchVin(query){
  const vin = String(query.get("vin") || "").replace(/[^A-Za-z0-9]/g, "");
  if(vin.length < 11){
    const error = new Error("VIN указан неверно");
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
  if(/run/.test(String(l.condition || "").toLowerCase())) s += 6;
  if(!l.photoCount) s -= 10;
  // Спецтехника/лодки/прицепы идут без полного VIN — в рекомендациях не нужны
  if(String(l.vin || "").length < 17) s -= 25;
  // Прошедшие торги без Buy Now в рекомендациях не нужны
  const t = l.auctionDate ? new Date(l.auctionDate).getTime() : NaN;
  if(!Number.isNaN(t) && t < todayStart && !(l.buyNow > 0)) s -= 60;
  return s;
}

function sortItems(items, sort){
  const list = [...items];
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
  if(sort === "date_asc")     return list.sort((a, b) => (a.auctionDate || "") < (b.auctionDate || "") ? -1 : 1);
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
    const phone = String(body.phone || "").trim().slice(0, 30);
    if(!name || !phone){
      sendJson(response, 400, {ok:false,error:"Введите имя и телефон"});
      return;
    }
    if(phone.length < 5){
      sendJson(response, 400, {ok:false,error:"Введите корректный номер телефона"});
      return;
    }

    // upsert by phone: creates new customer or returns existing one — no duplicate key errors
    const customer = await supabase.upsert("customers", {name, phone, status:"Новый", source:"Аукционы"}, "phone");

    const comment = String(body.comment || "").trim().slice(0, 1000);
    const vin = String(body.vin || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 17);
    const lot = String(body.lot || "").replace(/[^A-Za-z0-9_~-]/g, "").slice(0, 30);
    const auction = String(body.auction || "").replace(/[^a-zA-Z]/g, "").toLowerCase().slice(0, 10);

    const lead = await supabase.create("leads", {
      customer_id:customer?.id || null,
      title:`Заявка по лоту ${auction} ${lot}`.trim(),
      message:[
        comment,
        vin ? `VIN: ${vin}` : "",
        lot ? `LOT: ${lot}` : "",
        auction ? `Аукцион: ${auction.toUpperCase()}` : ""
      ].filter(Boolean).join("\n"),
      status:"Новый",
      source:"Аукционы"
    });

    notifyTelegram({name, phone, comment, lot, vin, auction}).catch(() => {});
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
  try{
    const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if(!url || !key) throw new Error("no supabase env");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SB_WAIT_MS);
    let r;
    try{
      r = await fetch(`${url}/rest/v1/api_sync_state?k=eq.main&select=v`, {
        headers:{apikey:key, authorization:`Bearer ${key}`},
        signal:controller.signal
      });
    }finally{ clearTimeout(timer); }
    const rows = r.ok ? await r.json() : null;
    dbReadyCache = {value:!!(rows && rows[0] && rows[0].v && rows[0].v.phase === "incr"), at:Date.now()};
  }catch(e){
    dbReadyCache = {value:false, at:Date.now()};
  }
  return dbReadyCache.value;
}

function pgEscape(value){
  // Значение для PostgREST-фильтра: убираем спецсимволы синтаксиса запросов.
  return String(value).replace(/[(),*%\\]/g, " ").trim();
}

async function searchFromDb(query){
  if(!(await lotsDbReady())) return null;
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const p = new URLSearchParams();
  p.set("select", "payload");
  const ands = [];
  // Страховка от Encar/Кореи, попавшей в базу до доменного фильтра синка
  ands.push("or(country.neq.kr,country.is.null)");

  const tab = query.get("tab") || "all";
  if(tab === "sold"){ p.set("archived", "eq.true"); p.set("status_id", "eq.6"); }
  else if(tab === "archived"){ p.set("archived", "eq.true"); }
  else if(tab === "buy_now"){ p.set("archived", "eq.false"); p.set("buy_now", "gt.0"); }
  else{
    p.set("archived", "eq.false");
    // Показываем будущие торги, лоты без даты и прошедшие менее суток назад
    const dayAgo = new Date(Date.now() - 24 * 3600e3).toISOString();
    ands.push(`or(sale_date.gte.${dayAgo},sale_date.is.null)`);
  }

  const auction = query.get("auction");
  if(auction && auction !== "all") p.set("auction", `eq.${pgEscape(auction).toLowerCase()}`);

  const make = query.get("make");
  if(make && /^[\d,]+$/.test(make)) p.set("make_id", make.includes(",") ? `in.(${make})` : `eq.${make}`);
  const model = query.get("model");
  if(model && /^\d+$/.test(model)) p.set("model_id", `eq.${model}`);
  const generation = query.get("generation");
  if(generation && /^\d+$/.test(generation)) p.set("generation_id", `eq.${generation}`);

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
  const kmFrom = query.get("mileageFromKm"), kmTo = query.get("mileageToKm");
  if(kmFrom && /^\d+$/.test(kmFrom)) ands.push(`odometer_mi.gte.${Math.round(Number(kmFrom) * 0.621371)}`);
  if(kmTo && /^\d+$/.test(kmTo)) ands.push(`odometer_mi.lte.${Math.round(Number(kmTo) * 0.621371)}`);

  const enumFilters = [["fuel","fuel_id"],["body","body_id"],["transmission","transmission_id"],["drive","drive_id"],["condition","condition_id"],["color","color_id"],["cylinders","cylinders"],["vehicleType","vehicle_type_id"]];
  for(const [from, col] of enumFilters){
    const v = query.get(from);
    if(v && /^\d+$/.test(v)) p.set(col, `eq.${v}`);
  }

  const damage = query.get("damage");
  if(damage) p.set("damage", `ilike.*${pgEscape(damage)}*`);
  const doc = query.get("document");
  if(doc) p.set("document", `ilike.*${pgEscape(doc)}*`);
  const state = query.get("state");
  if(state) p.set("state_code", `eq.${pgEscape(state).toLowerCase()}`);
  const country = query.get("country");
  if(country) p.set("country", `eq.${pgEscape(country).toLowerCase()}`);

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
  if(dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo)) ands.push(`sale_date.lte.${dateTo}T23:59:59Z`);
  if(query.get("withoutSaleDate") === "1") p.set("sale_date", "is.null");

  if(ands.length) p.set("and", `(${ands.join(",")})`);

  const sortMap = {
    soon:"sale_date.asc.nullslast", date_asc:"sale_date.asc.nullslast", date_desc:"sale_date.desc.nullslast",
    year_asc:"year.asc.nullslast", year_desc:"year.desc.nullslast",
    mileage_asc:"odometer_mi.asc.nullslast", mileage_desc:"odometer_mi.desc.nullslast",
    price_asc:"current_bid.asc.nullslast", price_desc:"current_bid.desc.nullslast",
    buy_now_asc:"buy_now.asc.nullslast", buy_now_desc:"buy_now.desc.nullslast"
  };
  p.set("order", `${sortMap[query.get("sort") || "soon"] || sortMap.soon},id.asc`);

  const perPage = Math.min(100, Math.max(1, Number(query.get("per_page") || query.get("limit") || 50) || 50));
  const page = Math.max(1, Number(query.get("page") || 1) || 1);
  const offset = (page - 1) * perPage;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  let response;
  try{
    response = await fetch(`${url}/rest/v1/api_lots?${p}`, {
      headers:{
        apikey:key,
        authorization:`Bearer ${key}`,
        prefer:"count=exact",
        range:`${offset}-${offset + perPage - 1}`,
        "range-unit":"items"
      },
      signal:controller.signal
    });
  }finally{ clearTimeout(timer); }
  if(!response.ok) throw new Error(`lots db search failed: ${response.status}`);
  const rows = await response.json();
  const total = Number((response.headers.get("content-range") || "*/0").split("/").pop()) || rows.length;
  return {
    items:rows.map(r => r.payload).filter(Boolean),
    total,
    page,
    perPage,
    _source:"db"
  };
}

// ================= Синхронизация каталога в Supabase (action=synclots) =================
// Официальная схема интеграции auctionsapi.com: фаза "full" — первичный импорт
// /cars постранично (per_page=1000), фаза "incr" — /cars?minutes=NN + /archived-lots.
// Живёт внутри этой функции из-за лимита Vercel Hobby (12 serverless-функций);
// снаружи доступна как /api/sync-lots (rewrite). Защищена локом ~5 мин.

const SYNC_PER_PAGE = 1000;
const SYNC_PAGES_PER_RUN = 8;
const SYNC_LOCK_MINUTES = 5;
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

async function syncSetState(v){
  await syncSbFetch(`/api_sync_state?on_conflict=k`, {
    method:"POST",
    headers:{prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({k:"main", v, updated_at:new Date().toISOString()})
  });
}

// Свой фетч с таймаутом 30с: страницы по 1000 лотов тяжелее обычных запросов.
async function syncApiFetch(url){
  const key = process.env.AUCTIONS_API_KEY;
  if(!key) throw new Error("AUCTIONS_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
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
    archived:archived || statusId === 6 || statusId === 8 || lot?.archived === true,
    payload:normalized,
    synced_at:new Date().toISOString()
  };
}

async function syncUpsertRows(rows){
  if(!rows.length) return;
  await syncSbFetch(`/api_lots?on_conflict=id`, {
    method:"POST",
    headers:{prefer:"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify(rows)
  });
}

async function syncImportPage(pathBase, page, extraParams = {}, rowOpts = {}){
  const p = new URLSearchParams({per_page:String(SYNC_PER_PAGE), page:String(page), simple_paginate:"1", prices_history:"1", ...extraParams});
  const payload = await syncApiFetch(`${AUCTIONS_API_BASE}${pathBase}?${p}`);
  const items = findItems(payload) || [];
  const rows = items.map(it => syncRowFromItem(it, rowOpts)).filter(Boolean);
  await syncUpsertRows(rows);
  return items.length;
}

async function handleSyncLots(response){
  response.setHeader("cache-control", "no-store");
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
        if(got < SYNC_PER_PAGE){ di += 1; page = 1; }
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
      // -------- Инкремент: обновлённые + архивные за окно с прошлого запуска --------
      const last = state.last_incr_at ? new Date(state.last_incr_at).getTime() : Date.now() - 3600e3;
      const minutes = Math.min(4320, Math.max(30, Math.ceil((Date.now() - last) / 60e3) + 15));
      for(const domain of SYNC_DOMAINS){
        for(let page = 1; page <= 5; page++){
          if(Date.now() - started > SYNC_RUN_BUDGET_MS) break;
          const got = await syncImportPage("/cars", page, {minutes:String(minutes), domain_id:domain});
          result.imported += got;
          if(got < SYNC_PER_PAGE) break;
        }
      }
      for(let page = 1; page <= 3; page++){
        if(Date.now() - started > SYNC_RUN_BUDGET_MS) break;
        const got = await syncImportPage("/archived-lots", page, {minutes:String(minutes)}, {archived:true});
        result.archivedMarked += got;
        if(got < SYNC_PER_PAGE) break;
      }
      state.last_incr_at = new Date().toISOString();
      result.continue = false;
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
    result.continue = false;
  }
  state.lock_at = null; // шаг завершён — следующий вызов может стартовать сразу
  state.last_run = {at:new Date().toISOString(), ...result};
  try{ await syncSetState(state); }catch(e){ /* прогресс потеряем на один шаг — не критично */ }
  response.statusCode = 200;
  response.end(JSON.stringify(result));
}

module.exports = async function handler(request, response){
  const query = getQuery(request);
  const action = query.get("action") || "search";

  if(action === "lead") return handleLead(request, response);
  if(action === "synclots") return handleSyncLots(response);
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

  const key = cacheKey(action, query);
  const cached = getCached(key);
  if(cached && !detailCacheStale(cached)){
    sendJson(response, 200, {...cached, cached:true});
    return;
  }

  // Supabase persistent cache — shared across all serverless instances.
  // Checked only for actions that consume the auctionsapi.com quota.
  const dbCacheActions = new Set(["search","detail","vin","archived","manufacturers","models","generations","usadict","statistics"]);
  if(dbCacheActions.has(action)){
    const dbHit = await getDbCache(key);
    if(dbHit && !detailCacheStale(dbHit)){
      setCached(key, dbHit);
      sendJson(response, 200, {...dbHit, cached:true});
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
      const list = await fetchJson(`${AUCTIONS_API_BASE}/generations/${mid}`);
      const items = (Array.isArray(list?.data) ? list.data : [])
        .filter(m => m && m.name)
        .map(m => ({id:m.id, name:m.name, qty:m.cars_qty}))
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
        colors:"/usa/colors",
        titles:"/usa/titles",
        branches:`/usa/branches?domain_id=${domainId}`,
        cities:stateId ? `/usa/cities/${stateId}` : ""
      };
      const path = paths[dict];
      if(!path){ sendJson(response, 200, {ok:true, items:[]}); return; }
      const rows = await fetchAllPages(path);
      const items = rows.map(d => ({
        id:d.id != null ? d.id : null,
        name:safeName(d.name || d.title || d.damage || d),
        code:d.state_code || d.code || d.abbr || ""
      })).filter(d => d.name);
      const payload = {ok:true, items};
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
      const payload = {ok:true,lot};
      setCached(key, payload);
      setDbCache(key, payload, "detail");
      sendJson(response, 200, payload);
      return;
    }

    if(action === "vin"){
      const lot = await fetchVin(query);
      const payload = {ok:true,lot};
      setCached(key, payload);
      setDbCache(key, payload, "vin");
      sendJson(response, 200, payload);
      return;
    }

    if(action === "statistics"){
      const p = new URLSearchParams();
      ["manufacturer_id","model_id","generation_id","engine_id","year"].forEach(k => {
        const v = String(query.get(k) || "").replace(/[^0-9]/g, "");
        if(v) p.set(k, v);
      });
      const data = await fetchJson(`${AUCTIONS_API_BASE}/statistics?${p}`);
      const payload = {ok:true, stats:(data && data.data) || data || null};
      setCached(key, payload);
      sendJson(response, 200, payload);
      return;
    }

    if(action === "search"){
      // Локальная база (DreamBid-модель) — честная сортировка/фильтры по всему
      // каталогу; live-запрос к API остаётся фоллбеком, пока база не готова.
      let result = null;
      try{ result = await searchFromDb(query); }catch(e){ result = null; }
      if(!result) result = await fetchSearch(query);
      const payload = {ok:true,...result,items:sortItems(result.items, query.get("sort") || "soon")};
      // Fallback results cached briefly; real results cached 6h in Supabase.
      setCached(key, payload, result._fallback ? 90 * 1000 : CACHE_TTL);
      if(!result._fallback && !result._source) setDbCache(key, payload, "search");
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
