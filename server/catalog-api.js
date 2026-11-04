// Клиент для НОВОГО API api.auctionsapi.com (каталог Encar и др. источников) — 04.11.2026.
// Отдельный от server/supabase.js / api/auctions.js (Copart/IAAI, auctionsapi.com/api): другой
// хост, другой ключ (env AUCTIONSAPI_CATALOG_KEY), другие поля и пагинация. НЕ смешивать клиентов.
// Источник контракта: https://api.auctionsapi.com/docs-api/openapi.json (OpenAPI 3.0.3, 40 схем,
// скачан и сверен 04.11.2026 — полный список полей/эндпоинтов подтверждён реальным запросом, не
// придуман). На нашем ключе включён ровно один домен — fem.encar.com (id 55613), подтверждено
// живым /domains; поэтому раздел «Источники» в фильтрах не показываем (см. бриф §5.2.1, последний
// пункт), а domains[] шлём захардкоженным — с запасным резолвом через /domains на случай, если
// Федор когда-нибудь добавит ещё источник на этот ключ.
const {fetchT} = require("./fetchx");

const BASE = "https://api.auctionsapi.com";
const KNOWN_ENCAR_DOMAIN_ID = 55613; // проверено живым /domains 04.11.2026; resolveEncarDomainId() всё равно переспрашивает с кэшем на случай смены.
const DEFAULT_TIMEOUT_MS = 20000;

function apiKey(){
  return process.env.AUCTIONSAPI_CATALOG_KEY || "";
}

class CatalogApiError extends Error {
  constructor(message, {status = 502, kind = "upstream", detail = "", fieldErrors = null, retryAfterMs = 0} = {}){
    super(message);
    this.name = "CatalogApiError";
    this.status = status;       // статус, который стоит отдать НАШЕМУ клиенту
    this.kind = kind;           // "no_key" | "auth" | "not_found" | "validation" | "unavailable" | "network" | "upstream"
    this.detail = detail;       // только для логов — никогда не отдаём наружу как есть
    this.fieldErrors = fieldErrors; // {field: [messages]} для 422
    this.retryAfterMs = retryAfterMs;
  }
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function backoffMs(attempt){ return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250); }

// §2.1: массивы — PHP bracket-формат (key[]=a&key[]=b), не через запятую; пустые значения не шлём вовсе.
function qsPush(parts, key, value){
  if(value === undefined || value === null || value === "") return;
  if(typeof value === "boolean") value = value ? "1" : "0";
  parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
}
function qsArray(parts, key, arr){
  if(!Array.isArray(arr)) return;
  for(const v of arr){
    if(v === undefined || v === null || v === "") continue;
    qsPush(parts, `${key}[]`, v);
  }
}

// Иерархия brands[i][id] / brands[i][models][]  ИЛИ  brands[i][models][j][id] + [generations][k][id] (+variants/trims).
// §5.3.1: марка без моделей = все её модели (только brands[0][id]); при выбранном поколении —
// обязательно структурированный models[j][id], никогда не смешивать с плоским models[] для той же марки.
function qsBrands(parts, brands){
  if(!Array.isArray(brands)) return;
  let i = 0;
  for(const b of brands){
    if(!b || !b.id) continue;
    qsPush(parts, `brands[${i}][id]`, b.id);
    const models = Array.isArray(b.models) ? b.models.filter(m => m && m.id) : [];
    if(models.length){
      const structured = models.some(m => Array.isArray(m.generations) && m.generations.length);
      if(!structured){
        for(const m of models) qsPush(parts, `brands[${i}][models][]`, m.id);
      }else{
        let j = 0;
        for(const m of models){
          qsPush(parts, `brands[${i}][models][${j}][id]`, m.id);
          const gens = Array.isArray(m.generations) ? m.generations.filter(g => g && g.id) : [];
          let k = 0;
          for(const g of gens){
            qsPush(parts, `brands[${i}][models][${j}][generations][${k}][id]`, g.id);
            qsArray(parts, `brands[${i}][models][${j}][generations][${k}][variants]`, g.variants);
            qsArray(parts, `brands[${i}][models][${j}][generations][${k}][trims]`, g.trims);
            k++;
          }
          j++;
        }
      }
    }
    i++;
  }
}
function qsCountries(parts, countries){
  if(!Array.isArray(countries)) return;
  let i = 0;
  for(const c of countries){
    if(!c || !c.id) continue;
    qsPush(parts, `countries[${i}][id]`, c.id);
    qsArray(parts, `countries[${i}][regions]`, c.regions);
    i++;
  }
}

function redact(path){
  // Логируем только путь+статус — ключ никогда не должен попасть в лог (§2.1).
  return String(path || "").split("?")[0];
}

function readRetryAfterMs(res){
  const h = res.headers?.get?.("retry-after");
  const n = Number(h);
  return Number.isFinite(n) && n > 0 ? n * 1000 : 0;
}

async function parseBody(res){
  const text = await res.text().catch(() => "");
  if(!text) return {text:"", json:null};
  try{ return {text, json:JSON.parse(text)}; }
  catch(e){ return {text, json:null}; }
}

// §2.3: тела ошибок — {"error":...} | {"errors":{field:[...]}, message?} | HTML на части 5xx.
function buildErrorMessage(json, text){
  if(json){
    if(json.message) return json.message;
    if(json.error) return json.error;
    if(json.errors && typeof json.errors === "object"){
      const msgs = [];
      for(const k of Object.keys(json.errors)){
        const arr = Array.isArray(json.errors[k]) ? json.errors[k] : [];
        for(const m of arr){ msgs.push(m); if(msgs.length >= 2) break; }
        if(msgs.length >= 2) break;
      }
      if(msgs.length) return msgs.join("; ");
    }
  }
  return (text || "").replace(/<[^>]+>/g, " ").trim().slice(0, 300) || "Unknown upstream error";
}

/**
 * path: "/search" (без базы и без api_key)
 * query: готовая строка параметров (без ведущего "&"/"?"), без api_key — добавляем сами.
 */
async function catalogFetch(path, query = "", {timeoutMs = DEFAULT_TIMEOUT_MS, retries = 3} = {}){
  const key = apiKey();
  if(!key) throw new CatalogApiError("AUCTIONSAPI_CATALOG_KEY не настроен", {status:503, kind:"no_key"});

  const sep = query ? "&" : "";
  const url = `${BASE}${path}?api_key=${encodeURIComponent(key)}${sep}${query}`;
  let lastErr = null;

  for(let attempt = 0; attempt <= retries; attempt++){
    let res;
    try{
      res = await fetchT(url, {headers:{accept:"application/json"}, redirect:"manual"}, timeoutMs);
    }catch(e){
      lastErr = new CatalogApiError("Catalog API is unavailable", {status:502, kind:"network", detail:`${redact(path)}: ${e && e.message || e}`});
      if(attempt < retries){ await sleep(backoffMs(attempt)); continue; }
      throw lastErr;
    }

    // §2.1: редиректы — ошибка.
    if(res.status >= 300 && res.status < 400){
      throw new CatalogApiError("Catalog API is unavailable", {status:502, kind:"network", detail:`${redact(path)}: unexpected redirect ${res.status}`});
    }

    if(res.status === 403){
      const {json, text} = await parseBody(res);
      throw new CatalogApiError("Catalog temporarily unavailable", {status:403, kind:"auth", detail:`${redact(path)}: 403 ${buildErrorMessage(json, text)}`});
    }
    if(res.status === 404){
      const {json, text} = await parseBody(res);
      throw new CatalogApiError(buildErrorMessage(json, text) || "Not found", {status:404, kind:"not_found", detail:`${redact(path)}: 404`});
    }
    if(res.status === 422){
      const {json, text} = await parseBody(res);
      throw new CatalogApiError(buildErrorMessage(json, text) || "Invalid filter", {status:422, kind:"validation", detail:`${redact(path)}: 422`, fieldErrors:(json && json.errors) || null});
    }
    if(res.status === 429 || res.status === 503 || res.status >= 500){
      const retryAfterMs = readRetryAfterMs(res);
      if(attempt < retries){
        await sleep(retryAfterMs || backoffMs(attempt));
        continue;
      }
      const {json, text} = await parseBody(res);
      throw new CatalogApiError(
        res.status === 503 ? "Search is temporarily unavailable" : "Catalog API is unavailable",
        {status:res.status === 503 ? 503 : 502, kind:"unavailable", detail:`${redact(path)}: ${res.status} ${buildErrorMessage(json, text)}`, retryAfterMs}
      );
    }
    if(!res.ok){
      const {json, text} = await parseBody(res);
      throw new CatalogApiError(buildErrorMessage(json, text) || `HTTP ${res.status}`, {status:502, kind:"upstream", detail:`${redact(path)}: ${res.status}`});
    }

    const {json} = await parseBody(res);
    if(json === null) throw new CatalogApiError("Catalog API is unavailable", {status:502, kind:"upstream", detail:`${redact(path)}: bad JSON`});
    return json;
  }
  throw lastErr || new CatalogApiError("Catalog API is unavailable", {status:502, kind:"network"});
}

// ---- Словари с server-side кэшем (§9: domains 6ч, brands/models 24ч/vehicle_type+lang, generations 24ч/parent) ----
const dictCache = new Map();
function cacheGet(key){
  const hit = dictCache.get(key);
  if(hit && hit.exp > Date.now()) return hit.data;
  return undefined;
}
function cacheSet(key, data, ttlMs){
  dictCache.set(key, {data, exp:Date.now() + ttlMs});
}

async function resolveEncarDomainId(){
  const cached = cacheGet("domains:encar");
  if(cached !== undefined) return cached;
  let id = KNOWN_ENCAR_DOMAIN_ID;
  try{
    const list = await catalogFetch("/domains", "lang=en");
    const arr = Array.isArray(list) ? list : (Array.isArray(list?.data) ? list.data : []);
    const encar = arr.find(d => /encar/i.test(d?.name || d?.base_url || d?.domain || ""));
    if(encar?.id) id = encar.id;
  }catch(e){
    // сеть легла — используем известное значение, не роняем весь каталог из-за словаря
  }
  cacheSet("domains:encar", id, 6 * 60 * 60 * 1000);
  return id;
}

async function listBrands(lang, vehicleType){
  const cacheKey = `brands:${vehicleType}:${lang}`;
  const cached = cacheGet(cacheKey);
  if(cached !== undefined) return cached;
  const out = [];
  let page = 1;
  for(;;){
    const q = [`lang=${encodeURIComponent(lang)}`, `per_page=100`, `page=${page}`];
    if(vehicleType === "motorcycle") q.push("vehicle_type=motorcycle");
    const resp = await catalogFetch("/brands", q.join("&"));
    const rows = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
    out.push(...rows);
    const hasMore = !!resp?.meta?.has_more;
    if(!hasMore || rows.length === 0 || page > 50) break;
    page++;
  }
  cacheSet(cacheKey, out, 24 * 60 * 60 * 1000);
  return out;
}

async function listModels(brandId, lang){
  const cacheKey = `models:${brandId}:${lang}`;
  const cached = cacheGet(cacheKey);
  if(cached !== undefined) return cached;
  const resp = await catalogFetch(`/models/${encodeURIComponent(brandId)}`, `lang=${encodeURIComponent(lang)}&per_page=100`);
  const rows = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
  cacheSet(cacheKey, rows, 24 * 60 * 60 * 1000);
  return rows;
}

async function listGenerations(modelId, lang){
  const cacheKey = `gens:${modelId}:${lang}`;
  const cached = cacheGet(cacheKey);
  if(cached !== undefined) return cached;
  const out = [];
  let afterId;
  for(;;){
    const q = [`lang=${encodeURIComponent(lang)}`, `per_page=100`];
    if(afterId) q.push(`after_id=${encodeURIComponent(afterId)}`);
    const resp = await catalogFetch(`/generations/${encodeURIComponent(modelId)}`, q.join("&"));
    const rows = Array.isArray(resp?.data) ? resp.data : (Array.isArray(resp) ? resp : []);
    out.push(...rows);
    const hasMore = !!resp?.meta?.has_more;
    afterId = resp?.meta?.next_after_id;
    if(!hasMore || !afterId || rows.length === 0 || out.length > 2000) break;
  }
  cacheSet(cacheKey, out, 24 * 60 * 60 * 1000);
  return out;
}

module.exports = {
  CatalogApiError,
  catalogFetch,
  qsPush, qsArray, qsBrands, qsCountries,
  resolveEncarDomainId,
  listBrands, listModels, listGenerations,
  KNOWN_ENCAR_DOMAIN_ID,
};
