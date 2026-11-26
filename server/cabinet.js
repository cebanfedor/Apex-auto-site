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

const dealsLib = require("./deals");
const cl = require("./clients");
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
  const tableMissing = e => /cab_items|cab_deals|cab_events|cab_picks|relation|PGRST20|42P01|schema cache/i.test(String(e && e.message || e));

  async function prune(chat, kind){
    const cfg = KINDS[kind];
    const extra = await sb(`/cab_items?chat_id=eq.${chat}&kind=eq.${kind}&select=key&order=updated_at.desc&offset=${cfg.max}&limit=200`).catch(() => []);
    if(extra && extra.length){
      const keys = extra.map(r => `"${String(r.key).replace(/"/g, "")}"`).join(",");
      await sb(`/cab_items?chat_id=eq.${chat}&kind=eq.${kind}&key=in.(${keys})`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
    }
  }

  async function handle(action, request, response, query){
    // Вход из Telegram Mini App: подпись initData проверяем токеном бота — клиент привязывается без «Start»-ссылки
    if(action === "cabtg"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      const botTok = process.env.ALERTS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
      const u = require("./tgapp").verifyInitData(body.initData, botTok);
      if(!u || u.isBot){ sendJson(response, 200, {ok:false, error:"bad_init"}, NO); return true; }
      let token = okToken(body.token) ? body.token : "";
      try{
        if(token){
          const ex = await sb(`/alert_links?token=eq.${q(token)}&select=chat_id&limit=1`).catch(() => []);
          if(ex && ex[0]){
            if(ex[0].chat_id && Number(ex[0].chat_id) !== u.id) token = "";   // токен уже у другого — выдаём новый
            else if(!ex[0].chat_id) await sb(`/alert_links?token=eq.${q(token)}&chat_id=is.null`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({chat_id:u.id, bound_at:new Date().toISOString(), lang:u.lang})});
          }else token = "";                                               // такого токена нет в базе — не принимаем чужой
        }
        if(!token){
          token = require("crypto").randomBytes(24).toString("base64url");
          await sb(`/alert_links`, {method:"POST", headers:{prefer:"return=minimal"}, body:JSON.stringify({token, lang:u.lang, chat_id:u.id, bound_at:new Date().toISOString()})});
        }
        if(u.first_name) await cl.metaSet(sb, "tgname:" + u.id, {n:u.first_name}).catch(() => {});
        sendJson(response, 200, {ok:true, token, lang:u.lang}, NO);
      }catch(e){
        sendJson(response, 200, {ok:false, error:"db_error"}, NO);
      }
      return true;
    }

    if(action === "cabload"){
      const who = await chatOf(query.get("token"));
      if(who.error){ sendJson(response, 200, {ok:true, bound:false, reason:who.error}, NO); return true; }
      try{
        const rows = await sb(`/cab_items?chat_id=eq.${who.chat}&select=kind,key,data,updated_at&order=updated_at.desc&limit=1200`);
        const items = {fav:[], note:[], car:[], view:[]};
        const metas = await sb(`/alert_meta?k=in.(${["tgname", "profile", "phone"].map(x => q(x + ":" + who.chat)).join(",")})&select=k,v`).catch(() => []);
        const M = {};
        for(const r of metas || []) M[String(r.k).split(":")[0]] = r.v || {};
        const tgName = M.tgname && M.tgname.n || "";
        for(const r of rows || []){ if(items[r.kind]) items[r.kind].push({key:r.key, data:r.data, t:Date.parse(r.updated_at) || 0}); }
        const profile = {name:M.profile && M.profile.name || "", city:M.profile && M.profile.city || "", phone:M.profile && M.profile.phone || ""};
        sendJson(response, 200, {ok:true, bound:true, ready:true, lang:who.lang, name:profile.name || tgName, tgName, profile, phoneVerified:!!(M.phone && M.phone.k), verifiedPhone:M.phone && M.phone.n ? "+" + M.phone.n : "", items}, NO);
      }catch(e){
        sendJson(response, 200, {ok:true, bound:true, ready:false, lang:who.lang, reason:tableMissing(e) ? "no_table" : "db_error"}, NO);
      }
      return true;
    }

    // Реферальная ссылка клиента: короткий код (alert_meta ref:<chat>, refcode:<код>), счётчик заявок по ссылке — refhits:<код>
    if(action === "cabref"){
      const who = await chatOf(query.get("token"));
      if(who.error){ sendJson(response, 200, {ok:true, bound:false}, NO); return true; }
      try{
        const cur = await sb(`/alert_meta?k=eq.${q("ref:" + who.chat)}&select=v&limit=1`).catch(() => []);
        let code = cur && cur[0] && cur[0].v && cur[0].v.code;
        if(!code){
          const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", crypto = require("crypto");
          for(let i = 0; i < 5 && !code; i++){
            const c = Array.from(crypto.randomBytes(6)).map(b => ALPHA[b % ALPHA.length]).join("");
            const taken = await sb(`/alert_meta?k=eq.${q("refcode:" + c)}&select=k&limit=1`).catch(() => []);
            if(!taken || !taken.length) code = c;
          }
          if(!code){ sendJson(response, 200, {ok:false, error:"code"}, NO); return true; }
          await cl.metaSet(sb, "refcode:" + code, {chat:String(who.chat)});
          await cl.metaSet(sb, "ref:" + who.chat, {code});
        }
        const hits = await sb(`/alert_meta?k=eq.${q("refhits:" + code)}&select=v&limit=1`).catch(() => []);
        sendJson(response, 200, {ok:true, code, hits:Number(hits && hits[0] && hits[0].v && hits[0].v.n) || 0}, NO);
      }catch(e){ sendJson(response, 200, {ok:false, error:"db_error"}, NO); }
      return true;
    }

    if(action === "cabdeals"){
      const who = await chatOf(query.get("token"));
      if(who.error){ sendJson(response, 200, {ok:true, bound:false}, NO); return true; }
      try{
        const pm = await sb(`/alert_meta?k=eq.${q("phone:" + who.chat)}&select=v&limit=1`).catch(() => []);
        const key = pm && pm[0] && pm[0].v && pm[0].v.k;
        // сделки: привязанные менеджером к этому Telegram-клиенту (chat_id) + по подтверждённому телефону
        let rows = [];
        try{ rows = await sb(`/cab_deals?chat_id=eq.${q(who.chat)}&active=eq.true&select=*&order=updated_at.desc&limit=20`) || []; }catch(_){ rows = []; }   // колонки chat_id может не быть — тогда только по телефону
        if(key){
          const byKey = await sb(`/cab_deals?phone_key=eq.${q(key)}&active=eq.true&select=*&order=updated_at.desc&limit=20`);
          const have = new Set(rows.map(r => r.id));
          for(const r of byKey || []) if(!have.has(r.id)) rows.push(r);
          rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
        }
        if(!key && !rows.length){ sendJson(response, 200, {ok:true, bound:true, verified:false, deals:[]}, NO); return true; }
        sendJson(response, 200, {ok:true, bound:true, verified:true, deals:rows.map(dealsLib.publicDeal)}, NO);
      }catch(e){
        sendJson(response, 200, {ok:true, bound:true, verified:true, deals:[], ready:!tableMissing(e) ? true : false, reason:tableMissing(e) ? "no_table" : "db_error"}, NO);
      }
      return true;
    }

    // ---- профиль, присутствие, журнал, подборки (кабинет v3) ----
    if(action === "cabpicks"){
      const who = await chatOf(query.get("token"));
      if(who.error){ sendJson(response, 200, {ok:true, bound:false, picks:[]}, NO); return true; }
      try{
        const rows = await sb(`/cab_picks?chat_id=eq.${who.chat}&active=eq.true&select=id,lot_id,data,note,created_at,seen_at,reaction,reaction_note,reaction_at&order=created_at.desc&limit=60`);
        sendJson(response, 200, {ok:true, bound:true, picks:rows || []}, NO);
      }catch(e){
        sendJson(response, 200, {ok:true, bound:true, picks:[], reason:tableMissing(e) ? "no_table" : "db_error"}, NO);
      }
      return true;
    }
    if(action === "cabprofile" || action === "cabping" || action === "cabevent" || action === "cabpickreact"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      const who = await chatOf(body.token);
      if(who.error){ sendJson(response, 200, {ok:false, error:who.error}, NO); return true; }
      try{
        if(action === "cabprofile"){
          const profile = cl.cleanProfile(body.profile);
          await cl.metaSet(sb, "profile:" + who.chat, profile);
          sendJson(response, 200, {ok:true, profile:{name:profile.name, city:profile.city, phone:profile.phone}}, NO);
          return true;
        }
        if(action === "cabping"){
          const now = Date.now();
          let gap = 0;
          if(body.first){
            const old = await sb(`/alert_meta?k=eq.${q("seen:" + who.chat)}&select=v&limit=1`).catch(() => []);
            gap = old && old[0] && old[0].v && old[0].v.t ? now - Number(old[0].v.t) : Infinity;
          }
          await cl.metaSet(sb, "seen:" + who.chat, {t:now, p:cl.clip(body.p, 200), h:cl.clip(body.h, 120)});
          // менеджеру — когда клиент вернулся после долгого перерыва (или заходит впервые)
          if(body.first && gap > 6 * 3600e3){
            const lab = await cl.clientLabel(sb, who.chat);
            const ago = gap === Infinity ? "впервые" : "не был " + (gap > 48 * 3600e3 ? Math.round(gap / 86400e3) + " дн." : Math.round(gap / 3600e3) + " ч.");
            await cl.notifyManager(sb, "online", `👤 <b>${lab.text}</b> на сайте\n🕒 ${ago}${body.h ? "\n📍 " + cl.esc(cl.clip(body.h, 100)) : ""}`, [{text:"Открыть клиента", url:`${cl.SITE}/admin/#client=${who.chat}`}]).catch(() => {});
          }
          sendJson(response, 200, {ok:true}, NO);
          return true;
        }
        if(action === "cabevent"){
          const ev = cl.cleanEvent(body.kind, body.key, body.data);
          if(!ev){ sendJson(response, 200, {ok:false, error:"bad_event"}, NO); return true; }
          const win = ev.kind === "view" ? 10 * 60e3 : 30 * 60e3;
          const have = await sb(`/cab_events?chat_id=eq.${who.chat}&kind=eq.${ev.kind}&key=eq.${q(ev.key)}&at=gte.${q(new Date(Date.now() - win).toISOString())}&select=id&limit=1`);
          if(have && have.length){ sendJson(response, 200, {ok:true, dup:true}, NO); return true; }
          await sb(`/cab_events`, {method:"POST", headers:{prefer:"return=minimal"}, body:JSON.stringify({chat_id:who.chat, kind:ev.kind, key:ev.key, data:ev.data})});
          if(Math.random() < 0.02) sb(`/cab_events?at=lt.${q(new Date(Date.now() - 120 * 86400e3).toISOString())}`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
          // горячий лот: третий заход за сутки — один раз пишем менеджеру
          if(ev.kind === "view"){
            const day = await sb(`/cab_events?chat_id=eq.${who.chat}&kind=eq.view&key=eq.${q(ev.key)}&at=gte.${q(new Date(Date.now() - 86400e3).toISOString())}&select=id&limit=4`).catch(() => []);
            if(day && day.length >= 3){
              const mk = `hot:${who.chat}:${ev.key}`;
              const seen = await sb(`/alert_meta?k=eq.${q(mk)}&select=k&limit=1`).catch(() => []);
              if(!(seen && seen.length)){
                await cl.metaSet(sb, mk, {t:Date.now()});
                const lab = await cl.clientLabel(sb, who.chat);
                await cl.notifyManager(sb, "hot", `🔥 <b>${lab.text}</b> уже 3-й раз смотрит лот\n${cl.esc(ev.data.title || ev.key)}`, [{text:"Открыть клиента", url:`${cl.SITE}/admin/#client=${who.chat}`}, {text:"Лот", url:`${cl.SITE}/auctions/${ev.key}`}]).catch(() => {});
              }
            }
          }
          sendJson(response, 200, {ok:true}, NO);
          return true;
        }
        if(action === "cabpickreact"){
          const id = Number(body.id) || 0;
          if(!id){ sendJson(response, 400, {ok:false}, NO); return true; }
          const rows = await sb(`/cab_picks?id=eq.${id}&chat_id=eq.${who.chat}&select=id,lot_id,data,reaction&limit=1`);
          const pick = rows && rows[0];
          if(!pick){ sendJson(response, 404, {ok:false, error:"not_found"}, NO); return true; }
          const patch = {};
          if(body.seen) patch.seen_at = new Date().toISOString();
          const reaction = body.reaction === "" ? null : ["like", "no", "discuss"].includes(body.reaction) ? body.reaction : undefined;
          if(reaction !== undefined){
            patch.reaction = reaction; patch.reaction_at = reaction ? new Date().toISOString() : null;
            patch.reaction_note = reaction ? cl.clip(body.note, 400) || null : null;
            patch.seen_at = patch.seen_at || new Date().toISOString();
          }
          if(Object.keys(patch).length) await sb(`/cab_picks?id=eq.${id}&chat_id=eq.${who.chat}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify(patch)});
          if(reaction && reaction !== pick.reaction){
            const lab = await cl.clientLabel(sb, who.chat);
            const word = reaction === "like" ? "👍 нравится" : reaction === "no" ? "👎 не подходит" : "💬 хочет обсудить";
            await cl.notifyManager(sb, "react", `${word}\n<b>${lab.text}</b>\n${cl.esc((pick.data && pick.data.title) || pick.lot_id)}${patch.reaction_note ? "\n«" + cl.esc(patch.reaction_note) + "»" : ""}`, [{text:"Открыть клиента", url:`${cl.SITE}/admin/#client=${who.chat}`}, {text:"Лот", url:`${cl.SITE}/auctions/${pick.lot_id}`}]).catch(() => {});
          }
          sendJson(response, 200, {ok:true}, NO);
          return true;
        }
      }catch(e){
        sendJson(response, 200, {ok:false, error:tableMissing(e) ? "no_table" : "db_error"}, NO);
        return true;
      }
    }

    if(action === "cabput" || action === "cabdel" || action === "cabbulk" || action === "cabwipe"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      const who = await chatOf(body.token);
      if(who.error){ sendJson(response, 200, {ok:false, error:who.error}, NO); return true; }
      try{
        if(action === "cabwipe"){
          await sb(`/cab_items?chat_id=eq.${who.chat}`, {method:"DELETE", headers:{prefer:"return=minimal"}});
          for(const t of ["cab_events", "cab_picks"]) await sb(`/${t}?chat_id=eq.${who.chat}`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
          for(const k of ["profile:", "seen:"]) await sb(`/alert_meta?k=eq.${q(k + who.chat)}`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
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
