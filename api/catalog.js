// /api/catalog — отдельный backend-for-frontend для НОВОГО каталога (api.auctionsapi.com, Encar
// и др. источники). 04.11.2026. Один serverless-файл, экшены через ?action= — как у api/auctions.js,
// чтобы не плодить функции (на проекте уже 22+ файла в api/, лимит плана никто не проверял).
// НЕ смешивать с api/auctions.js / api/korea.js (другой хост, другой ключ, другие поля — см. бриф
// Федора и server/catalog-api.js). Ключ никогда не уходит в браузер: только через этот эндпоинт.
const {sendJson, methodNotAllowed, getQuery} = require("../server/http");
const cat = require("../server/catalog-api");
const {fetchT} = require("../server/fetchx");

const LANGS = new Set(["en", "ru", "uk", "pl", "bg", "sq"]);
const SORTS = new Set(["newest", "oldest", "cheaper", "expensive", "odometer_asc", "odometer_desc", "year_asc", "year_desc", "auction_nearest"]);

function pickLang(q){
  const raw = String(q.get("lang") || "").toLowerCase();
  // §2.1: наш UI ru/ro/en — ro не поддержан апстримом, шлём en и переводим сами на фронте.
  if(LANGS.has(raw)) return raw;
  if(raw === "ro") return "en";
  return "ru";
}

function clampInt(v, min, max, def){
  const n = parseInt(v, 10);
  if(!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function csvInts(v){
  return String(v || "").split(",").map(s => parseInt(s, 10)).filter(Number.isFinite);
}

function parseModelPairs(v){
  // "88:120,88:130" -> {88:[120,130]}
  const map = {};
  for(const pair of String(v || "").split(",")){
    const [b, m] = pair.split(":").map(x => parseInt(x, 10));
    if(!Number.isFinite(b) || !Number.isFinite(m)) continue;
    (map[b] = map[b] || []).push(m);
  }
  return map;
}

function buildBrandsParam(q){
  // Приоритет: vehicle_selection (полная иерархия с поколениями) > brand_id/model_id (плоско).
  const vs = q.get("vehicle_selection");
  if(vs){
    try{
      const parsed = JSON.parse(vs);
      if(Array.isArray(parsed?.brands) && parsed.brands.length) return parsed.brands;
    }catch(e){ /* битый JSON в адресе — игнорируем, попробуем плоские параметры */ }
  }
  const brandIds = csvInts(q.get("brand_id"));
  if(!brandIds.length) return null;
  const modelMap = parseModelPairs(q.get("model_id"));
  return brandIds.map(id => ({id, models:(modelMap[id] || []).map(mid => ({id:mid}))}));
}

async function buildSearchQuery(q, {forCount}){
  const parts = [];
  const lang = pickLang(q);
  parts.push(`lang=${encodeURIComponent(lang)}`);

  const domainId = await cat.resolveEncarDomainId();
  cat.qsArray(parts, "domains", [domainId]);

  const vehicleType = q.get("vehicle_type") === "motorcycle" ? "motorcycle" : null;
  if(vehicleType) cat.qsPush(parts, "vehicle_type", vehicleType);

  const vin = String(q.get("vin") || "").trim();
  if(vin) cat.qsPush(parts, "vin", vin.slice(0, 19));

  const brands = buildBrandsParam(q);
  if(brands) cat.qsBrands(parts, brands);

  cat.qsPush(parts, "price_from", clampInt(q.get("price_from"), 0, 9_000_000_000_000, undefined));
  cat.qsPush(parts, "price_to", clampInt(q.get("price_to"), 1, 9_000_000_000_000, undefined));
  const currency = String(q.get("currency") || "").trim().toLowerCase();
  if(/^[a-z]{3}$/.test(currency)) cat.qsPush(parts, "currency", currency);

  cat.qsPush(parts, "year_from", clampInt(q.get("year_from"), 1800, 3000, undefined));
  cat.qsPush(parts, "year_to", clampInt(q.get("year_to"), 1800, 3000, undefined));
  cat.qsPush(parts, "odometer_from", clampInt(q.get("odometer_from"), 0, 999_999_999, undefined));
  cat.qsPush(parts, "odometer_to", clampInt(q.get("odometer_to"), 0, 999_999_999, undefined));
  cat.qsPush(parts, "engine_volume_from", clampInt(q.get("engine_volume_from"), 0, 999_999_999, undefined));
  cat.qsPush(parts, "engine_volume_to", clampInt(q.get("engine_volume_to"), 0, 999_999_999, undefined));
  cat.qsPush(parts, "power_hp_from", clampInt(q.get("power_hp_from"), 0, 100_000, undefined));
  cat.qsPush(parts, "power_hp_to", clampInt(q.get("power_hp_to"), 0, 100_000, undefined));
  cat.qsPush(parts, "seats", clampInt(q.get("seats"), 1, 200, undefined));

  cat.qsArray(parts, "body_types", csvInts(q.get("body_type_id")));
  cat.qsArray(parts, "fuels", csvInts(q.get("fuel_id")));
  cat.qsArray(parts, "damages", csvInts(q.get("damage_id")));
  cat.qsArray(parts, "conditions", csvInts(q.get("condition_id")));
  cat.qsArray(parts, "availabilities", csvInts(q.get("availability_id")));
  cat.qsArray(parts, "emissions", csvInts(q.get("emission_id")));
  cat.qsArray(parts, "drive_wheels", csvInts(q.get("drive_wheel_id")));
  cat.qsArray(parts, "colors", csvInts(q.get("color_id")));
  cat.qsArray(parts, "interior_colors", csvInts(q.get("interior_color_id")));
  cat.qsArray(parts, "cylinders", csvInts(q.get("cylinders")));

  for(const [uiKey, upKey] of [["transmission", "transmission"], ["seller_type", "seller_type"], ["steering_wheel_position", "steering_wheel_position"], ["airbags", "airbags"]]){
    const v = clampInt(q.get(uiKey), 0, 99, undefined);
    if(v !== undefined) cat.qsPush(parts, upKey, v);
  }

  for(const flag of ["is_auction", "is_leasing"]){
    const raw = q.get(flag);
    if(raw === "1" || raw === "0") cat.qsPush(parts, flag, raw === "1");
  }
  for(const [uiKey, upKey] of [["keys_available", "keys_available"], ["manufacturer_certified", "is_manufacturer_certified"], ["has_inspections", "has_inspections"], ["has_history_reports", "has_history_reports"]]){
    const raw = q.get(uiKey);
    if(raw === "1" || raw === "0") cat.qsPush(parts, upKey, raw);
  }

  if(!forCount){
    const sort = SORTS.has(q.get("sort")) ? q.get("sort") : "newest";
    cat.qsPush(parts, "sort", sort);
    const perPage = clampInt(q.get("per_page"), 2, 50, 24);
    const page = clampInt(q.get("page"), 1, Math.floor(10000 / perPage), 1);
    cat.qsPush(parts, "perPage", perPage);
    cat.qsPush(parts, "page", page);
  }else{
    const sort = SORTS.has(q.get("sort")) ? q.get("sort") : "newest";
    cat.qsPush(parts, "sort", sort); // §5.3.2: тот же sort для совпадающего count (auction_nearest фильтрует набор).
  }

  return {query:parts.join("&"), lang};
}

// §5.3.2: count кэшируем 60с по хэшу фильтра (без page) — чтобы листание страниц не пересчитывало.
const countCache = new Map();
function cacheCount(key, promise){
  const hit = countCache.get(key);
  if(hit && hit.exp > Date.now()) return hit.promise;
  const exp = Date.now() + 60 * 1000;
  countCache.set(key, {promise, exp});
  return promise;
}

async function doSearch(q){
  const {query: searchQ} = await buildSearchQuery(q, {forCount:false});
  const {query: countQ} = await buildSearchQuery(q, {forCount:true});

  const searchP = cat.catalogFetch("/search", searchQ);
  const countP = cacheCount(countQ, cat.catalogFetch("/search/count", countQ).catch(e => ({__failed:true, error:e})));

  const [searchRes, countRes] = await Promise.all([searchP, countP]);

  let total;
  let countFailed = false;
  if(countRes && countRes.__failed){
    countFailed = true;
    total = Math.min(10000, Number(searchRes?.meta?.total) || 0);
  }else{
    total = Number(countRes?.count);
    if(!Number.isFinite(total)) total = Math.min(10000, Number(searchRes?.meta?.total) || 0);
  }

  const perPage = Number(searchRes?.meta?.per_page) || 24;
  const items = Array.isArray(searchRes?.data) ? searchRes.data.slice(0, perPage) : [];

  return {
    ok:true,
    items,
    total,
    countApprox:countFailed,
    page:Number(searchRes?.meta?.current_page) || 1,
    perPage,
    lastReachablePage:Math.max(1, Math.floor(10000 / perPage)),
  };
}

// Курс USD→KRW/EUR для показа цен Encar в $ (05.11.2026). Считает сервер (у браузера frankfurter режет CORS).
// Основной источник — Naver (решение Федора 05.11.2026): курс калькулятора валют Naver = базовый курс KEB Hana
// (매매기준율), тот же, что в поиске naver.com «usd». Запас RATE_MARGIN в нашу пользу: делим вон на чуть МЕНЬШИЙ
// курс → цена в $ на сайте чуть выше рыночной (покрывает движение курса до оплаты). Запасные — рыночные API.
const RATE_MARGIN = 0.02; // 2%: 1 356.5 ₩/$ на Naver → считаем по 1 329.4
const naverUrl = to => "https://m.search.naver.com/p/csearch/content/qapirender.nhn?key=calculator&pkid=141&q=%ED%99%98%EC%9C%A8&where=m&u1=keb&u6=standardUnit&u7=0&u3=USD&u4=" + to + "&u8=down&u2=1";
async function naverRate(to){
  const r = await fetchT(naverUrl(to), {headers:{accept:"application/json", "user-agent":"Mozilla/5.0"}}, 5000);
  if(!r.ok) return 0;
  const d = await r.json();
  const row = d && Array.isArray(d.country) ? d.country[1] : null;
  return row ? Number(String(row.value || "").replace(/,/g, "")) || 0 : 0;
}
let ratesCache = null;
async function getRates(){
  if(ratesCache && Date.now() - ratesCache.t < 3600e3) return ratesCache.v;
  const sources = [
    ["m.search.naver.com", async () => { const [krw, eur] = await Promise.all([naverRate("KRW"), naverRate("EUR").catch(() => 0)]); return {krw, eur}; }],
    ["api.frankfurter.app", async () => { const r = await fetchT("https://api.frankfurter.app/latest?from=USD&to=KRW,EUR", {headers:{accept:"application/json"}}, 5000); const d = r.ok ? await r.json() : null; return d && d.rates && {krw:d.rates.KRW, eur:d.rates.EUR}; }],
    ["open.er-api.com", async () => { const r = await fetchT("https://open.er-api.com/v6/latest/USD", {headers:{accept:"application/json"}}, 5000); const d = r.ok ? await r.json() : null; return d && d.rates && {krw:d.rates.KRW, eur:d.rates.EUR}; }],
  ];
  for(const [src, get] of sources){
    try{
      const v = await get();
      if(v && v.krw > 100 && v.krw < 10000){
        const out = {usdKrw:Math.round(v.krw * (1 - RATE_MARGIN) * 100) / 100, marketKrw:v.krw, margin:RATE_MARGIN, usdEur:v.eur || 0, src, at:new Date().toISOString()};
        ratesCache = {t:Date.now(), v:out};
        return out;
      }
    }catch(e){ /* следующий источник */ }
  }
  return ratesCache ? ratesCache.v : null;
}

module.exports = async function handler(req, res){
  if(req.method !== "GET") return methodNotAllowed(res);
  const q = getQuery(req);
  const action = String(q.get("action") || "search");

  try{
    if(action === "search"){
      const data = await doSearch(q);
      return sendJson(res, 200, data, {"cache-control":"no-store, private"});
    }

    if(action === "car"){
      const id = String(q.get("id") || "").trim();
      if(!id) return sendJson(res, 400, {ok:false, error:"missing_id"});
      const lang = pickLang(q);
      const data = await cat.catalogFetch(`/cars/${encodeURIComponent(id)}`, `lang=${encodeURIComponent(lang)}`);
      return sendJson(res, 200, {ok:true, car:data?.data || data}, {"cache-control":"no-store, private"});
    }

    if(action === "vin"){
      const vin = String(q.get("vin") || "").trim();
      if(!/^[A-Za-z0-9]{10,19}$/.test(vin)) return sendJson(res, 400, {ok:false, error:"bad_vin"});
      const lang = pickLang(q);
      const data = await cat.catalogFetch(`/cars/vin/${encodeURIComponent(vin)}`, `lang=${encodeURIComponent(lang)}`);
      return sendJson(res, 200, {ok:true, car:data?.data || data}, {"cache-control":"no-store, private"});
    }

    if(action === "listing"){
      const domainId = String(q.get("domain_id") || "").trim();
      const listingId = String(q.get("listing_id") || "").trim();
      if(!domainId || !listingId) return sendJson(res, 400, {ok:false, error:"missing_listing_ref"});
      const lang = pickLang(q);
      const data = await cat.catalogFetch(`/listing/${encodeURIComponent(domainId)}/${encodeURIComponent(listingId)}`, `lang=${encodeURIComponent(lang)}`);
      return sendJson(res, 200, {ok:true, car:data?.data || data}, {"cache-control":"no-store, private"});
    }

    if(action === "brands"){
      const lang = pickLang(q);
      const vehicleType = q.get("vehicle_type") === "motorcycle" ? "motorcycle" : "automobile";
      const rows = await cat.listBrands(lang, vehicleType);
      return sendJson(res, 200, {ok:true, items:rows}, {"cache-control":"public, max-age=3600"});
    }

    if(action === "models"){
      const brandId = String(q.get("brand_id") || "").trim();
      if(!brandId) return sendJson(res, 400, {ok:false, error:"missing_brand_id"});
      const lang = pickLang(q);
      const rows = await cat.listModels(brandId, lang);
      return sendJson(res, 200, {ok:true, items:rows}, {"cache-control":"public, max-age=3600"});
    }

    if(action === "options"){
      const ids = String(q.get("ids") || "").split(",").map(s => parseInt(s, 10)).filter(Number.isFinite).slice(0, 100);
      if(!ids.length) return sendJson(res, 200, {ok:true, items:[]});
      const lang = pickLang(q);
      const data = await cat.catalogFetch("/car-options", `ids=${encodeURIComponent(ids.join(","))}&per_page=${ids.length}&lang=${encodeURIComponent(lang)}`);
      const rows = Array.isArray(data?.data) ? data.data : [];
      return sendJson(res, 200, {ok:true, items:rows}, {"cache-control":"public, max-age=3600"});
    }

    if(action === "rates"){
      const r = await getRates();
      if(!r) return sendJson(res, 503, {ok:false, error:"rates_unavailable"}, {"cache-control":"no-store"});
      return sendJson(res, 200, {ok:true, ...r}, {"cache-control":"public, max-age=900, s-maxage=3600, stale-while-revalidate=21600"});
    }

    if(action === "generations"){
      const modelId = String(q.get("model_id") || "").trim();
      if(!modelId) return sendJson(res, 400, {ok:false, error:"missing_model_id"});
      const lang = pickLang(q);
      const rows = await cat.listGenerations(modelId, lang);
      return sendJson(res, 200, {ok:true, items:rows}, {"cache-control":"public, max-age=3600"});
    }

    return sendJson(res, 400, {ok:false, error:"unknown_action"});
  }catch(e){
    if(e instanceof cat.CatalogApiError){
      // Детали — только в серверный лог (без ключа, см. redact() в catalog-api.js), наружу — безопасный текст.
      console.error("[catalog]", action, e.kind, e.detail || e.message);
      if(e.kind === "no_key" || e.kind === "auth" || e.kind === "unavailable"){
        return sendJson(res, 503, {ok:false, error:"catalog_unavailable", message:"The catalog is temporarily unavailable", retryAfterMs:e.retryAfterMs || 0});
      }
      if(e.kind === "not_found"){
        return sendJson(res, 404, {ok:false, error:"not_found", message:e.message});
      }
      if(e.kind === "validation"){
        return sendJson(res, 422, {ok:false, error:"validation", message:e.message, fieldErrors:e.fieldErrors});
      }
      return sendJson(res, 502, {ok:false, error:"upstream", message:"Catalog API is unavailable"});
    }
    console.error("[catalog] unexpected", action, e && e.message || e);
    return sendJson(res, 500, {ok:false, error:"internal"});
  }
};
