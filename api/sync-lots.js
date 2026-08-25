// Синхронизация каталога auctionsapi.com в Supabase (официальная схема интеграции):
//   фаза "full"  — первичный импорт: /cars постранично (per_page=1000), прогресс в api_sync_state;
//   фаза "incr"  — обновления: /cars?minutes=NN (новые/изменённые) + /archived-lots?minutes=NN
//                  (проданные/снятые → archived=true с финальной ценой).
// Эндпоинт без секрета: он только обновляет данные и защищён локом (не чаще раза в ~5 мин).
// Дёргается GitHub Actions (hourly) и fire-and-forget пингом с каталога.

const {normalizeLot, normalizeAuction, findItems, AUCTIONS_API_BASE} = require("./auctions.js");

// Свой фетч с таймаутом 30с: страницы по 1000 лотов с prices_history тяжелее,
// чем обычные запросы каталога (у общего fetchJson таймаут 12с).
async function apiFetch(url){
  const key = process.env.AUCTIONS_API_KEY;
  if(!key) throw new Error("AUCTIONS_API_KEY is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try{
    const response = await fetch(url, {headers:{"x-api-key":key, accept:"application/json"}, signal:controller.signal});
    const payload = await response.json().catch(() => null);
    if(!response.ok || payload?.error){
      const error = new Error(payload?.message || payload?.error || `AuctionsAPI ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }finally{ clearTimeout(timer); }
}

const SUPABASE_REST = "/rest/v1";
const PER_PAGE = 1000;          // подтверждённый лимит тарифа
const PAGES_PER_RUN = 8;        // страниц за один вызов (укладываемся в maxDuration=60s)
const LOCK_MINUTES = 5;
const RUN_BUDGET_MS = 45000;    // мягкий дедлайн, чтобы успеть сохранить прогресс

function sb(){
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if(!url || !key) throw new Error("Supabase env is not configured");
  return {url, key};
}

async function sbFetch(path, options = {}){
  const {url, key} = sb();
  const response = await fetch(`${url}${SUPABASE_REST}${path}`, {
    ...options,
    headers:{
      "apikey":key,
      "authorization":`Bearer ${key}`,
      "content-type":"application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if(!response.ok){
    const error = new Error(payload?.message || `Supabase ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function getState(){
  const rows = await sbFetch(`/api_sync_state?k=eq.main&select=v`);
  return (rows && rows[0] && rows[0].v) || {};
}

async function setState(v){
  await sbFetch(`/api_sync_state?on_conflict=k`, {
    method:"POST",
    headers:{"prefer":"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify({k:"main", v, updated_at:new Date().toISOString()})
  });
}

// item (сырой ответ API) → строка таблицы api_lots.
// payload — нормализованный лот в том же виде, что отдаёт action=search (фронт не меняется).
function rowFromItem(item, {archived = false} = {}){
  const lot = (Array.isArray(item?.lots) && item.lots[0]) || item?.lot || item || {};
  const auction = normalizeAuction(item?.auction || lot?.auction || item?.domain || lot?.domain || "copart");
  const normalized = normalizeLot(item, auction);
  if(!normalized.lot) return null;
  // Обложка + до 4 фото: карточке каталога хватает, детальная всегда live.
  if(Array.isArray(normalized.images) && normalized.images.length > 4){
    normalized.images = normalized.images.slice(0, 4);
  }
  const num = v => { const n = Number(v); return Number.isFinite(n) && n !== 0 ? Math.round(n) : (n === 0 ? 0 : null); };
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

async function upsertRows(rows){
  if(!rows.length) return;
  await sbFetch(`/api_lots?on_conflict=id`, {
    method:"POST",
    headers:{"prefer":"resolution=merge-duplicates,return=minimal"},
    body:JSON.stringify(rows)
  });
}

async function importPage(pathBase, page, extra = {}){
  const p = new URLSearchParams({per_page:String(PER_PAGE), page:String(page), simple_paginate:"1", prices_history:"1", ...extra});
  const payload = await apiFetch(`${AUCTIONS_API_BASE}${pathBase}?${p}`);
  const items = findItems(payload) || [];
  const rows = items.map(it => rowFromItem(it, extra._archived ? {archived:true} : {})).filter(Boolean);
  await upsertRows(rows);
  return items.length;
}

module.exports = async function handler(request, response){
  response.setHeader("cache-control", "no-store");
  const started = Date.now();
  let state;
  try{
    state = await getState();
  }catch(e){
    response.statusCode = 200;
    response.end(JSON.stringify({ok:false, error:"sync tables missing — run supabase/migrations/20260825_api_lots.sql", detail:e.message}));
    return;
  }
  // Лок: не чаще раза в LOCK_MINUTES (защита публичного эндпоинта от заспамливания).
  const lockAt = state.lock_at ? new Date(state.lock_at).getTime() : 0;
  if(Date.now() - lockAt < LOCK_MINUTES * 60e3){
    response.statusCode = 200;
    response.end(JSON.stringify({ok:true, locked:true, continue:false}));
    return;
  }
  state.lock_at = new Date().toISOString();
  await setState(state);

  const result = {ok:true, phase:state.phase || "full", imported:0, archivedMarked:0};
  try{
    if(state.phase !== "incr"){
      // -------- Полный импорт: PAGES_PER_RUN страниц за вызов --------
      let page = Number(state.next_page) || 1;
      for(let i = 0; i < PAGES_PER_RUN; i++){
        if(Date.now() - started > RUN_BUDGET_MS) break;
        const got = await importPage("/cars", page);
        result.imported += got;
        page += 1;
        if(got < PER_PAGE){
          state.phase = "incr";
          state.full_done_at = new Date().toISOString();
          state.last_incr_at = new Date().toISOString();
          break;
        }
      }
      state.next_page = page;
      result.next_page = page;
      result.phase = state.phase || "full";
      result.continue = state.phase !== "incr"; // GitHub Actions продолжает качать, пока фаза full
    }else{
      // -------- Инкремент: обновлённые + архивные за окно с прошлого запуска --------
      const last = state.last_incr_at ? new Date(state.last_incr_at).getTime() : Date.now() - 3600e3;
      const minutes = Math.min(4320, Math.max(30, Math.ceil((Date.now() - last) / 60e3) + 15));
      for(let page = 1; page <= 6; page++){
        if(Date.now() - started > RUN_BUDGET_MS) break;
        const got = await importPage("/cars", page, {minutes:String(minutes)});
        result.imported += got;
        if(got < PER_PAGE) break;
      }
      for(let page = 1; page <= 3; page++){
        if(Date.now() - started > RUN_BUDGET_MS) break;
        const p = new URLSearchParams({per_page:String(PER_PAGE), page:String(page), minutes:String(minutes)});
        const payload = await apiFetch(`${AUCTIONS_API_BASE}/archived-lots?${p}`);
        const items = findItems(payload) || [];
        const rows = items.map(it => rowFromItem(it, {archived:true})).filter(Boolean);
        await upsertRows(rows);
        result.archivedMarked += rows.length;
        if(items.length < PER_PAGE) break;
      }
      state.last_incr_at = new Date().toISOString();
      result.continue = false;
    }
  }catch(e){
    result.ok = false;
    result.error = e.message;
    result.continue = false;
  }
  state.lock_at = null; // импорт закончился — следующий вызов может стартовать сразу
  state.last_run = {at:new Date().toISOString(), ...result};
  try{ await setState(state); }catch(e){ /* прогресс потеряем на один шаг — не критично */ }
  response.statusCode = 200;
  response.end(JSON.stringify(result));
};
