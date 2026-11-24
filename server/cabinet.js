// Личный кабинет клиента: избранное, заметки, «мои машины», недавние. Аккаунт = Telegram chat_id, к которому
// привязан секретный токен клиента (alert_links, см. server/alerts.js). Таблица cab_items —
// supabase/migrations/20261124_cabinet.sql. Без таблицы отвечаем ready:false — клиент работает на localStorage.
const KINDS = {
  fav:  {max:300, keyRe:/^(copart|iaai)-[A-Za-z0-9_-]{3,30}$/, dataMax:6000},
  note: {max:300, keyRe:/^(copart|iaai)-[A-Za-z0-9_-]{3,30}$/, dataMax:2600},
  car:  {max:30,  keyRe:/^[A-HJ-NPR-Z0-9]{17}$/,               dataMax:600},
  view: {max:60,  keyRe:/^(copart|iaai)-[A-Za-z0-9_-]{3,30}$/, dataMax:2500}
};
const BULK_MAX = 700;

const okToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(t);

// Ужимаем «сырой» лот до безопасного размера: лишние фото/история не нужны в кабинете (карточка живёт на странице лота)
function trimLot(d){
  if(!d || typeof d !== "object" || Array.isArray(d)) return null;
  const o = {};
  for(const [k, v] of Object.entries(d)){
    if(v === undefined || typeof v === "function") continue;
    o[k] = v;
  }
  if(Array.isArray(o.images)) o.images = o.images.filter(x => typeof x === "string").slice(0, 3);
  if(Array.isArray(o.priceHistory)) o.priceHistory = o.priceHistory.slice(0, 6);
  return o;
}

function cleanData(kind, data){
  const cfg = KINDS[kind];
  if(!cfg) return null;
  let out;
  if(kind === "note"){
    const text = String(data && data.text || "").trim().slice(0, 2000);
    if(!text) return null;
    out = {text, updatedAt:Number(data.updatedAt) || Date.now()};
  }else if(kind === "car"){
    out = {label:String(data && data.label || "").slice(0, 80), addedAt:Number(data && data.addedAt) || Date.now()};
  }else{
    out = trimLot(data);
    if(!out) return null;
    if(JSON.stringify(out).length > cfg.dataMax){ delete out.priceHistory; delete out.images; }
    if(kind === "view"){ out.viewedAt = Number(data.viewedAt) || Date.now(); }
  }
  if(JSON.stringify(out).length > cfg.dataMax) return null;
  return out;
}

function create(deps){
  const {sb, sendJson, readBody} = deps;
  const q = s => encodeURIComponent(s);
  const NO = {"cache-control":"no-store"};

  // токен → chat_id (null, если не привязан)
  async function chatOf(token){
    if(!okToken(token)) return {error:"bad_token"};
    const rows = await sb(`/alert_links?token=eq.${q(token)}&select=chat_id,lang&limit=1`).catch(() => null);
    if(!rows || !rows[0]) return {error:"unknown_token"};
    if(!rows[0].chat_id) return {error:"unbound", lang:rows[0].lang};
    return {chat:rows[0].chat_id, lang:rows[0].lang};
  }
  const tableMissing = e => /cab_items|relation|PGRST20|42P01|schema cache/i.test(String(e && e.message || e));

  async function prune(chat, kind){
    const cfg = KINDS[kind];
    const extra = await sb(`/cab_items?chat_id=eq.${chat}&kind=eq.${kind}&select=key&order=updated_at.desc&offset=${cfg.max}&limit=200`).catch(() => []);
    if(extra && extra.length){
      const keys = extra.map(r => `"${String(r.key).replace(/"/g, "")}"`).join(",");
      await sb(`/cab_items?chat_id=eq.${chat}&kind=eq.${kind}&key=in.(${keys})`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
    }
  }

  async function handle(action, request, response, query){
    if(action === "cabload"){
      const who = await chatOf(query.get("token"));
      if(who.error){ sendJson(response, 200, {ok:true, bound:false, reason:who.error}, NO); return true; }
      try{
        const rows = await sb(`/cab_items?chat_id=eq.${who.chat}&select=kind,key,data,updated_at&order=updated_at.desc&limit=1200`);
        const items = {fav:[], note:[], car:[], view:[]};
        for(const r of rows || []){ if(items[r.kind]) items[r.kind].push({key:r.key, data:r.data, t:Date.parse(r.updated_at) || 0}); }
        sendJson(response, 200, {ok:true, bound:true, ready:true, lang:who.lang, items}, NO);
      }catch(e){
        sendJson(response, 200, {ok:true, bound:true, ready:false, lang:who.lang, reason:tableMissing(e) ? "no_table" : "db_error"}, NO);
      }
      return true;
    }

    if(action === "cabput" || action === "cabdel" || action === "cabbulk" || action === "cabwipe"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      const who = await chatOf(body.token);
      if(who.error){ sendJson(response, 200, {ok:false, error:who.error}, NO); return true; }
      try{
        if(action === "cabwipe"){
          await sb(`/cab_items?chat_id=eq.${who.chat}`, {method:"DELETE", headers:{prefer:"return=minimal"}});
          sendJson(response, 200, {ok:true}, NO);
          return true;
        }
        if(action === "cabdel"){
          const cfg = KINDS[body.kind];
          if(!cfg || !cfg.keyRe.test(String(body.key || ""))){ sendJson(response, 400, {ok:false}, NO); return true; }
          await sb(`/cab_items?chat_id=eq.${who.chat}&kind=eq.${body.kind}&key=eq.${q(body.key)}`, {method:"DELETE", headers:{prefer:"return=minimal"}});
          sendJson(response, 200, {ok:true}, NO);
          return true;
        }
        const list = action === "cabput" ? [{kind:body.kind, key:body.key, data:body.data}] : (Array.isArray(body.items) ? body.items.slice(0, BULK_MAX) : []);
        const rows = [], kinds = new Set();
        const now = Date.now();
        list.forEach((it, i) => {
          const cfg = it && KINDS[it.kind];
          if(!cfg || !cfg.keyRe.test(String(it.key || ""))) return;
          const data = cleanData(it.kind, it.data);
          if(!data) return;
          // в пачке сохраняем порядок «новые первыми» через небольшой сдвиг времени
          rows.push({chat_id:who.chat, kind:it.kind, key:String(it.key), data, updated_at:new Date(now - i).toISOString()});
          kinds.add(it.kind);
        });
        if(rows.length){
          // bulk (первый вход): то, что уже есть на сервере, не затираем; одиночная запись — обновляет
          const prefer = action === "cabbulk" ? "resolution=ignore-duplicates,return=minimal" : "resolution=merge-duplicates,return=minimal";
          if(action === "cabput"){
            const cfg = KINDS[rows[0].kind];
            if(rows[0].kind === "car"){
              const have = await sb(`/cab_items?chat_id=eq.${who.chat}&kind=eq.car&select=key&limit=${cfg.max + 1}`).catch(() => []);
              if(have.length >= cfg.max && !have.some(r => r.key === rows[0].key)){ sendJson(response, 200, {ok:false, error:"limit", max:cfg.max}, NO); return true; }
            }
          }
          await sb(`/cab_items?on_conflict=chat_id,kind,key`, {method:"POST", headers:{prefer}, body:JSON.stringify(rows)});
          for(const k of kinds) await prune(who.chat, k);
        }
        sendJson(response, 200, {ok:true, saved:rows.length}, NO);
      }catch(e){
        sendJson(response, 200, {ok:false, error:tableMissing(e) ? "no_table" : "db_error"}, NO);
      }
      return true;
    }
    return false;
  }
  return {handle};
}

module.exports = {create, cleanData, trimLot, KINDS, okToken};
