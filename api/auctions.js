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

function setCached(key, value){
  cache.set(key, {value, expires:Date.now() + CACHE_TTL});
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

function auctionUrl(auction, lot){
  if(!lot) return "";
  return auction === "iaai"
    ? `https://www.iaai.com/VehicleDetail/${encodeURIComponent(lot)}~US`
    : `https://www.copart.com/lot/${encodeURIComponent(lot)}`;
}

function imageList(value){
  const sources = [
    value?.images?.normal,
    value?.images?.big,
    value?.images,
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
  const title = item?.title || [year, make, model].filter(Boolean).join(" ") || "Автомобиль";
  const location = locationLabel(lot?.location) || safeName(lot?.branch || lot?.selling_branch) || locationLabel(item?.location);
  const primaryDamage = safeName(lot?.damage?.main || lot?.primary_damage || lot?.primaryDamage || item?.primary_damage || item?.damage);
  const secondaryDamage = safeName(lot?.damage?.second || lot?.secondary_damage || lot?.secondaryDamage || item?.secondary_damage);
  const odometer = safeNumber(lot?.odometer?.mi || lot?.odometer || item?.odometer || item?.mileage);
  const currentBid = safeNumber(lot?.bid || lot?.current_bid || lot?.currentBid || item?.current_bid || item?.bid);
  const finalBid = safeNumber(lot?.final_bid || lot?.finalBid);
  const buyNow = safeNumber(lot?.buy_now || lot?.buyNow || item?.buy_now || item?.buyNow);
  const statusName = safeName(lot?.status || item?.status);
  const statusId = (lot?.status && lot.status.id) || (item?.status && item.status.id) || null;
  const sale = saleStatusInfo(lot, item);
  const rawHistory = Array.isArray(lot?.prices) ? lot.prices : Array.isArray(item?.prices) ? item.prices : [];
  const priceHistory = rawHistory.map(p => ({
    bid:safeNumber(p?.bid || p?.final_bid),
    buyNow:safeNumber(p?.buy_now_price || p?.buy_now),
    date:p?.sale_date || p?.final_bid_updated_at || p?.date || "",
    status:safeName(p?.status)
  })).filter(p => p.bid || p.buyNow || p.date);
  const images = imageList(lot).length ? imageList(lot) : imageList(item);

  return {
    id:`${auction}-${lotNumber || item?.vin || Math.random().toString(36).slice(2)}`,
    auction,
    title,
    year,
    make,
    model,
    vin:item?.vin || lot?.vin || "",
    lot:lotNumber,
    url:auctionUrl(auction, lotNumber),
    location,
    auctionDate:lot?.sale_date || lot?.auction_date || lot?.saleDate || lot?.date || "",
    currentBid,
    finalBid,
    buyNow,
    odometer,
    odometerKm:safeNumber(lot?.odometer?.km),
    odometerText:odometer ? `${odometer.toLocaleString("en-US")} mi` : "",
    primaryDamage,
    secondaryDamage,
    damage:[primaryDamage, secondaryDamage].filter(Boolean).join(" / "),
    document:safeName(lot?.detailed_title || lot?.title || lot?.document || item?.document),
    fuel:safeName(item?.fuel || lot?.fuel),
    engine:safeName(item?.engine || lot?.engine),
    transmission:safeName(item?.transmission || lot?.transmission),
    drive:safeName(item?.drive || item?.drive_type || lot?.drive),
    body:safeName(item?.body_type || item?.vehicle_type || lot?.body_type),
    cylinders:safeName(item?.cylinders || lot?.cylinders),
    color:safeName(item?.color || lot?.color),
    keys:safeName(item?.keys || lot?.keys),
    estimatedRetailValue:safeNumber(lot?.actual_cash_value || lot?.estimated_retail_value || item?.estimated_retail_value || item?.acv),
    seller:safeName(lot?.seller || item?.seller),
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
    image:images[0] || "",
    source:item
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
  // Whether the user has applied any real filter (decides if we narrow to dated lots).
  const hasUserFilters = Array.from(params.keys()).length > 0;
  const tab = query.get("tab");
  if(tab === "buy_now") params.set("buy_now", "1");
  if(tab === "sold") params.set("status", "6");
  // Archive = completed auctions (sold + not sold). sale_date filters are
  // unreliable in this API, so use the status field (CSV is accepted).
  if(tab === "archived" && !params.get("status") && query.get("lotStatus") == null){
    params.set("status", "6,8");
  }
  // Default "Скоро торги" view: the API returns sale_date=null for unscheduled
  // lots (so every card would show "Future"). sale_date_in_days makes it return
  // lots that actually have an auction date (today/recent) — the cars on today.
  const sort = query.get("sort") || "soon";
  const tabUpcoming = tab !== "buy_now" && tab !== "sold" && tab !== "archived";
  const hasDateFilter = params.get("sale_date_from") || params.get("sale_date_to") || params.get("sale_date_in_days");
  if(sort === "soon" && tabUpcoming && !hasDateFilter && !hasUserFilters){
    params.set("sale_date_in_days", "3");
  }
  params.set("page", query.get("page") || "1");
  params.set("per_page", query.get("per_page") || query.get("limit") || "50");
  params.set("simple_paginate", "0");
  // exclude_expired_auctions keeps only future/no-date lots — but "past" statuses
  // (sold=6, not_sold=8) and the archived/sold tabs need expired lots included.
  const status = params.get("status");
  const wantsPast = tab === "archived" || tab === "sold" || status === "6" || status === "8";
  params.set("exclude_expired_auctions", wantsPast ? "0" : "1");
  return params;
}

async function fetchJson(url){
  const key = process.env.AUCTIONS_API_KEY;
  if(!key){
    const error = new Error("AUCTIONS_API_KEY is not configured");
    error.status = 500;
    throw error;
  }
  const response = await fetch(url, {
    headers:{
      "x-api-key":key,
      "accept":"application/json"
    }
  });
  const payload = await response.json().catch(() => null);
  if(!response.ok || payload?.error){
    const error = new Error(payload?.message || payload?.error || "Auctions API request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchSearch(query){
  const auction = normalizeAuction(query.get("auction"));
  const params = buildSearchParams(query);
  const domain = auctionsApiDomain(auction);
  params.set("domain_id", auctionsApiDomainId(auction));
  const attempts = [
    `${AUCTIONS_API_BASE}/cars?${params}`,
    `${AUCTIONS_API_BASE}/cars?${new URLSearchParams({...Object.fromEntries(params), domain})}`
  ];

  let lastError;
  let lastEndpoint = attempts[0];
  for(const url of attempts){
    try{
      lastEndpoint = url;
      const payload = await fetchJson(url);
      const items = findItems(payload).map(item => normalizeLot(item, auction));
      const perPage = safeNumber(query.get("per_page") || query.get("limit") || 50) || 50;
      const total = safeNumber(payload?.total || payload?.count || payload?.data?.total || payload?.data?.count || payload?.meta?.total);
      return {
        items,
        total,
        shown:items.length,
        page:safeNumber(query.get("page")) || 1,
        perPage,
        hasMore:total ? (safeNumber(query.get("page")) || 1) * perPage < total : items.length >= perPage,
        endpoint:lastEndpoint.replace(process.env.AUCTIONS_API_KEY || "", "")
      };
    }catch(error){
      lastError = error;
    }
  }
  throw lastError || new Error("Auctions search failed");
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
  if(auction === "iaai") params.set("search_by_id", "1");
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
  if(sort === "price_asc") return list.sort((a, b) => (a.currentBid || a.buyNow || 0) - (b.currentBid || b.buyNow || 0));
  if(sort === "price_desc") return list.sort((a, b) => (b.currentBid || b.buyNow || 0) - (a.currentBid || a.buyNow || 0));
  if(sort === "year_desc") return list.sort((a, b) => (b.year || 0) - (a.year || 0));
  if(sort === "mileage_asc") return list.sort((a, b) => (a.odometer || 0) - (b.odometer || 0));
  // "soon": lots with a real sale date first (today/freshest at top), undated last.
  const ts = v => { const t = v ? new Date(v).getTime() : NaN; return Number.isNaN(t) ? null : t; };
  return list.sort((a, b) => {
    const ta = ts(a.auctionDate), tb = ts(b.auctionDate);
    if(ta === null) return tb === null ? 0 : 1;
    if(tb === null) return -1;
    return tb - ta;
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

    const existing = await supabase.list("customers", {select:"*", phone:`eq.${phone}`, limit:1}).catch(() => []);
    const customer = existing[0] || await supabase.create("customers", {
      name,
      phone,
      status:"Новый",
      source:"Аукционы"
    });

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

    if(action === "search"){
      const result = await fetchSearch(query);
      const payload = {ok:true,...result,items:sortItems(result.items, query.get("sort") || "soon")};
      setCached(key, payload);
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
