const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const supabase = require("../server/supabase");

const AUCTIONS_API_BASE = "https://auctionsapi.com/api";
const CACHE_TTL = 7 * 60 * 1000;
const cache = new Map();

function cacheKey(action, params){
  return `${action}:${Array.from(params.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => `${k}=${v}`).join("&")}`;
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
  const priceHistory = rawHistory.map(p => ({
    bid:safeNumber(p?.bid || p?.final_bid || p?.current_bid),
    buyNow:safeNumber(p?.buy_now_price || p?.buy_now),
    date:p?.sale_date || p?.final_bid_updated_at || p?.date || "",
    status:safeName(p?.status),
    lot:String(p?.lot || p?.lot_number || p?.lotNumber || p?.external_id || "").replace(/~.*/, "")
  })).filter(p => p.bid || p.buyNow || p.date);
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
  // Sort: try common API param names. The API may support sort_by + order,
  // or may ignore them — client-side sortItems() is the guaranteed fallback.
  const sortVal = query.get("sort") || "soon";
  const sortApiMap = {
    soon:         {sort_by:"sale_date", order:"asc"},
    date_asc:     {sort_by:"sale_date", order:"asc"},
    date_desc:    {sort_by:"sale_date", order:"desc"},
    year_asc:     {sort_by:"year",      order:"asc"},
    year_desc:    {sort_by:"year",      order:"desc"},
    mileage_asc:  {sort_by:"odometer",  order:"asc"},
    mileage_desc: {sort_by:"odometer",  order:"desc"},
    price_asc:    {sort_by:"price",     order:"asc"},
    price_desc:   {sort_by:"price",     order:"desc"},
    buy_now_asc:  {sort_by:"buy_now",   order:"asc"},
    buy_now_desc: {sort_by:"buy_now",   order:"desc"},
  };
  const apiSort = sortApiMap[sortVal];
  if(apiSort){
    params.set("sort_by", apiSort.sort_by);
    params.set("order",   apiSort.order);
  }
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
    throw error;
  }
  return payload;
}

async function fetchSearch(query){
  const rawAuction = String(query.get("auction") || "").toLowerCase();
  const isAll = rawAuction === "all" || rawAuction === "both" || rawAuction === "";
  const auction = normalizeAuction(query.get("auction"));
  const params = buildSearchParams(query);
  const domain = auctionsApiDomain(auction);
  // "all" → omit domain_id so Copart (3) + IAAI (1) come together (domain_id
  // does not accept a CSV). Encar/Korea (12) is filtered out below.
  if(!isAll) params.set("domain_id", auctionsApiDomainId(auction));
  // When fetching all auctions, Encar lots are filtered after the API returns.
  // Request extra items so the final page still shows ~50 after Encar removal.
  if(isAll){
    const base = safeNumber(params.get("per_page")) || 50;
    params.set("per_page", String(Math.min(base + 50, 300)));
  }
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

  // For "all" tab: fire a parallel buy_now=1 fetch — Buy Now lots have no
  // scheduled sale_date so sale_date_in_days excludes them from the main query.
  const tabForBN = query.get("tab") || "all";
  let buyNowPromise = null;
  if(tabForBN === "all") {
    const bnP = new URLSearchParams(params);
    bnP.delete("sale_date_in_days");
    bnP.set("buy_now", "1");
    bnP.set("per_page", "50");
    const bnUrl = isAll
      ? `${AUCTIONS_API_BASE}/cars?${bnP}`
      : `${AUCTIONS_API_BASE}/cars?${new URLSearchParams({...Object.fromEntries(bnP), domain})}`;
    buyNowPromise = fetchJson(bnUrl).catch(() => null);
  }

  // Safety net: if our injected date filter yields nothing (e.g. the feed has no
  // recently-dated lots), retry once without it so the catalog is never empty.
  const userDate = query.get("daysAhead") || query.get("auctionDateFrom") || query.get("auctionDateTo") || query.get("nextHours");
  const injectedDate = !userDate && params.get("sale_date_in_days");
  let result = await run();
  if(!result.items.length && injectedDate){
    params.delete("sale_date_in_days");
    result = await run();
    result._fallback = true;
  }

  // Merge buy_now lots into "all" tab result
  if(buyNowPromise) {
    const bnPayload = await buyNowPromise;
    if(bnPayload) {
      const bnItems = findItems(bnPayload)
        .filter(item => !isAll || !isEncar(item))
        .map(item => normalizeLot(item, isAll ? (item?.domain || auction) : auction))
        .filter(lot => String(lot.statusId) !== "6" && String(lot.statusId) !== "8");
      const seen = new Set(result.items.map(l => l.id || l.lot));
      const fresh = bnItems.filter(l => !seen.has(l.id || l.lot));
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

function sortItems(items, sort){
  const list = [...items];
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
  try{
    const body = await readBody(request);
    const name = String(body.name || "").trim();
    const phone = String(body.phone || "").trim();
    if(!name || !phone){
      sendJson(response, 400, {ok:false,error:"Введите имя и телефон"});
      return;
    }

    // upsert by phone: creates new customer or returns existing one — no duplicate key errors
    const customer = await supabase.upsert("customers", {name, phone, status:"Новый", source:"Аукционы"}, "phone");

    const lead = await supabase.create("leads", {
      customer_id:customer?.id || null,
      title:`Заявка по лоту ${body.auction || ""} ${body.lot || ""}`.trim(),
      message:[
        body.comment,
        body.vin ? `VIN: ${body.vin}` : "",
        body.lot ? `LOT: ${body.lot}` : "",
        body.auction ? `Аукцион: ${String(body.auction).toUpperCase()}` : ""
      ].filter(Boolean).join("\n"),
      status:"Новый",
      source:"Аукционы"
    });

    sendJson(response, 200, {ok:true,customer,lead});
  }catch(error){
    sendJson(response, error.status || 500, {ok:false,error:"Не удалось отправить заявку. Напишите нам в Telegram или попробуйте позже."});
  }
}

module.exports = async function handler(request, response){
  const query = getQuery(request);
  const action = query.get("action") || "search";

  if(action === "lead") return handleLead(request, response);
  if(request.method !== "GET"){
    methodNotAllowed(response, ["GET","POST"]);
    return;
  }

  const key = cacheKey(action, query);
  const cached = getCached(key);
  if(cached){
    sendJson(response, 200, {...cached, cached:true});
    return;
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
      sendJson(response, 200, payload);
      return;
    }

    if(action === "vin"){
      const lot = await fetchVin(query);
      const payload = {ok:true,lot};
      setCached(key, payload);
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
      const result = await fetchSearch(query);
      const payload = {ok:true,...result,items:sortItems(result.items, query.get("sort") || "soon")};
      // Fallback results (safety-net without date filter) cached briefly so next
      // request re-tries the date-filtered query once conditions may have changed.
      setCached(key, payload, result._fallback ? 90 * 1000 : CACHE_TTL);
      sendJson(response, 200, payload);
      return;
    }

    sendJson(response, 404, {ok:false,error:"Unknown auctions action"});
  }catch(error){
    sendJson(response, error.status || 502, {
      ok:false,
      error:error.status === 500
        ? "Не удалось загрузить реальные лоты AuctionsAPI. Проверьте AUCTIONS_API_KEY или попробуйте позже."
        : "Не удалось загрузить реальные лоты AuctionsAPI. Попробуйте позже."
    });
  }
};
