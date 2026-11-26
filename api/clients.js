// Админ-API «Клиенты кабинета»: кто на сайте, карточка клиента (что смотрел / искал / избранное / сделки / заявки),
// подборки менеджера клиенту, заметки. Только для админа. Данные — таблицы cab_* и alert_meta (см. server/clients.js).
const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");
const cl = require("../server/clients");
const deals = require("../server/deals");
const {selfOrigin} = require("../server/origin");

const sb = supabase.rest;
const q = s => encodeURIComponent(s);
const safe = (p, d) => p.catch(() => d);
const DEAL_COLS = "id,title,vin,stage,eta_date,updated_at,active,next_step,total_usd,paid_usd,client_name";
const tableMissing = e => /cab_events|cab_picks|cab_msgs|relation|PGRST20|42P01|schema cache/i.test(String((e && e.message) || e));

async function metaByPrefix(prefix){
  const rows = await safe(sb(`/alert_meta?k=like.${q(prefix + ":*")}&select=k,v,updated_at&limit=3000`), []);
  const m = new Map();
  for(const r of rows || []) m.set(String(r.k).slice(prefix.length + 1), {v: r.v || {}, at: Date.parse(r.updated_at) || 0});
  return m;
}

async function fetchJson(url, ms){
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms || 15000);
  try{
    const r = await fetch(url, {signal: ctl.signal, headers: {accept: "application/json"}});
    if(!r.ok) return null;
    return await r.json();
  }catch(_){ return null; }
  finally{ clearTimeout(timer); }
}
const lotOf = (request, ref) => fetchJson(`${selfOrigin(request)}/api/auctions?action=detail&auction=${ref.auction}&lot=${ref.lot}`, 20000).then(j => j && (j.lot || (j.ok && j.id ? j : null)) || null);

// ---------- список ----------
async function listClients(){
  const links = await safe(sb(`/alert_links?chat_id=not.is.null&select=chat_id,lang,bound_at&order=bound_at.desc&limit=1500`), []);
  const [profiles, names, phones, seens] = await Promise.all(["profile", "tgname", "phone", "seen"].map(metaByPrefix));
  const favRows = await safe(sb(`/cab_items?kind=eq.fav&select=chat_id&limit=10000`), []);
  const pickRows = await safe(sb(`/cab_picks?active=eq.true&select=chat_id,reaction,seen_at&limit=5000`), []);
  const favs = new Map(), picks = new Map();
  for(const r of favRows || []) favs.set(String(r.chat_id), (favs.get(String(r.chat_id)) || 0) + 1);
  for(const r of pickRows || []){
    const k = String(r.chat_id), a = picks.get(k) || {n: 0, react: 0};
    a.n++; if(r.reaction) a.react++; picks.set(k, a);
  }
  // Сделки: по chat_id или по телефонному ключу клиента (подтверждённый номер / номер из профиля) — без двойного счёта
  const dealAll = await safe(sb(`/cab_deals?select=id,chat_id,phone_key,stage,active,total_usd,paid_usd,updated_at&limit=3000`), []);
  const dealsByChat = new Map(), dealsByKey = new Map();
  for(const d of dealAll || []){
    if(d.chat_id) (dealsByChat.get(String(d.chat_id)) || dealsByChat.set(String(d.chat_id), []).get(String(d.chat_id))).push(d);
    if(d.phone_key) (dealsByKey.get(d.phone_key) || dealsByKey.set(d.phone_key, []).get(d.phone_key)).push(d);
  }
  const unreadRows = await safe(sb(`/cab_msgs?dir=eq.in&seen=eq.false&select=chat_id&limit=2000`), []);
  const unread = new Map();
  for(const r of unreadRows || []) unread.set(String(r.chat_id), (unread.get(String(r.chat_id)) || 0) + 1);
  const now = Date.now(), byChat = new Map();
  for(const l of links || []){
    const id = String(l.chat_id);
    if(byChat.has(id)) continue;
    const pr = (profiles.get(id) || {}).v || {}, tg = (names.get(id) || {}).v || {}, ph = (phones.get(id) || {}).v || {}, seen = (seens.get(id) || {}).v || {};
    const seenAt = Number(seen.t) || 0;
    const dl = new Map();
    for(const d of dealsByChat.get(id) || []) dl.set(d.id, d);
    for(const k of [ph.k, cl.phoneKey(pr.phone)].filter(Boolean)) for(const d of dealsByKey.get(k) || []) dl.set(d.id, d);
    const dlist = Array.from(dl.values());
    const open = dlist.filter(d => d.active !== false && d.stage !== "done");
    const debt = open.reduce((a, d) => a + Math.max(0, (Number(d.total_usd) || 0) - (Number(d.paid_usd) || 0)), 0);
    byChat.set(id, {
      chat: id,
      name: pr.name || tg.n || "",
      city: pr.city || "",
      phone: pr.phone || (ph.n ? "+" + ph.n : ""),
      verified: !!ph.k,
      lang: l.lang || "ru",
      boundAt: l.bound_at || "",
      seenAt,
      online: !!seenAt && now - seenAt < cl.ONLINE_MS,
      page: seen.h || seen.p || "",
      favs: favs.get(id) || 0,
      unread: unread.get(id) || 0,
      picks: (picks.get(id) || {}).n || 0,
      reacts: (picks.get(id) || {}).react || 0,
      deals: dlist.length, dealsOpen: open.length, debt: Math.round(debt),
      dealStage: open.length ? open.sort((a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0))[0].stage : ""
    });
  }
  const items = Array.from(byChat.values()).sort((a, b) => ((b.unread > 0) - (a.unread > 0)) || (b.online - a.online) || (b.seenAt - a.seenAt) || (Date.parse(b.boundAt) || 0) - (Date.parse(a.boundAt) || 0));
  return items;
}

// ---------- карточка клиента ----------
async function clientCard(chat){
  const links = await safe(sb(`/alert_links?chat_id=eq.${chat}&select=token,lang,bound_at`), []);
  if(!links || !links.length) return null;
  const metas = await safe(sb(`/alert_meta?k=in.(${["profile", "tgname", "phone", "seen", "cnote"].map(x => q(x + ":" + chat)).join(",")})&select=k,v`), []);
  const M = {};
  for(const r of metas || []) M[String(r.k).split(":")[0]] = r.v || {};
  const tokens = links.map(l => l.token);
  const [items, events, subs, picks] = await Promise.all([
    safe(sb(`/cab_items?chat_id=eq.${chat}&select=kind,key,data,updated_at&order=updated_at.desc&limit=800`), []),
    sb(`/cab_events?chat_id=eq.${chat}&select=kind,key,data,at&order=at.desc&limit=500`).then(rows => ({ok: true, rows: rows || []})).catch(e => ({ok: false, rows: [], noTable: tableMissing(e)})),
    safe(sb(`/alert_subs?token=in.(${tokens.map(q).join(",")})&active=eq.true&select=id,kind,name,qs,lot_id,lot_title,sale_date,created_at&order=created_at.desc&limit=60`), []),
    safe(sb(`/cab_picks?chat_id=eq.${chat}&select=id,lot_id,data,note,created_at,seen_at,reaction,reaction_note,reaction_at,active&order=created_at.desc&limit=80`), [])
  ]);
  const by = k => (items || []).filter(r => r.kind === k);
  const notes = {};
  for(const r of by("note")) notes[r.key] = r.data && r.data.text || "";
  const favs = by("fav").map(r => ({id: r.key, ...(r.data || {}), note: notes[r.key] || "", t: Date.parse(r.updated_at) || 0}));
  const cars = by("car").map(r => ({vin: r.key, label: r.data && r.data.label || "", t: Date.parse(r.updated_at) || 0}));
  const agg = cl.aggregateEvents(events.rows);
  // нет журнала (миграция не выполнена) — берём «недавние» из cab_items
  const viewsFallback = by("view").map(r => ({key: r.key, n: 1, first: Date.parse(r.updated_at) || 0, last: (r.data && r.data.viewedAt) || Date.parse(r.updated_at) || 0, data: r.data || {}}));
  const views = (agg.views.length ? agg.views : viewsFallback).slice(0, 60);
  // сделки и заявки по телефону (подтверждённый и указанный в профиле)
  const keys = [...new Set([M.phone && M.phone.k, cl.phoneKey(M.profile && M.profile.phone)].filter(Boolean))];
  let dealRows = [], leadRows = [], customerRows = [];
  // сделки, привязанные к Telegram-клиенту напрямую (chat_id) — даже без телефона
  const byChat = await safe(sb(`/cab_deals?chat_id=eq.${q(chat)}&select=${DEAL_COLS}&order=updated_at.desc&limit=20`), []);
  dealRows = byChat || [];
  if(keys.length){
    const byKey = await safe(sb(`/cab_deals?phone_key=in.(${keys.map(q).join(",")})&select=${DEAL_COLS}&order=updated_at.desc&limit=20`), []);
    const have = new Set(dealRows.map(d => d.id));
    for(const d of byKey || []) if(!have.has(d.id)) dealRows.push(d);
    const custs = await safe(supabase.list("customers", {select: "id,name,phone,status,notes", limit: "3000"}), []);
    customerRows = (custs || []).filter(c => keys.includes(cl.phoneKey(c.phone)));
    if(customerRows.length){
      leadRows = await safe(supabase.list("leads", {select: "id,title,message,status,source,created_at", customer_id: `in.(${customerRows.map(c => c.id).join(",")})`, order: "created_at.desc", limit: "20"}), []);
    }
  }
  const seenAt = Number(M.seen && M.seen.t) || 0;
  return {
    chat: String(chat), lang: links[0].lang || "ru", boundAt: links[0].bound_at || "",
    profile: {name: M.profile && M.profile.name || "", city: M.profile && M.profile.city || "", phone: M.profile && M.profile.phone || ""},
    tgName: M.tgname && M.tgname.n || "",
    phone: {verified: !!(M.phone && M.phone.k), number: M.phone && M.phone.n ? "+" + M.phone.n : "", key: M.phone && M.phone.k || ""},
    seen: {at: seenAt, online: !!seenAt && Date.now() - seenAt < cl.ONLINE_MS, page: M.seen && M.seen.p || "", title: M.seen && M.seen.h || ""},
    manager: {text: M.cnote && M.cnote.text || "", tags: Array.isArray(M.cnote && M.cnote.tags) ? M.cnote.tags : []},
    eventsReady: events.ok, eventsNoTable: !!events.noTable,
    views, searches: agg.searches.slice(0, 40),
    timeline: events.rows.slice(0, 40).map(r => ({kind: r.kind, key: r.key, data: r.data || {}, at: Date.parse(r.at) || 0})),
    favs: favs.slice(0, 80), cars,
    subs: (subs || []).map(s => ({id: s.id, kind: s.kind, name: s.name || s.lot_title || s.lot_id || "", qs: s.qs || "", lot_id: s.lot_id || ""})),
    deals: dealRows || [], customers: customerRows.map(c => ({id: c.id, name: c.name, phone: c.phone, status: c.status})), leads: leadRows || [],
    picks: (picks || []).filter(p => p.active !== false)
  };
}

// ---------- автоподбор «похожее на то, что смотрел» ----------
async function suggestFor(request, chat){
  const [events, items] = await Promise.all([
    safe(sb(`/cab_events?chat_id=eq.${chat}&kind=eq.view&select=key,data,at&order=at.desc&limit=200`), []),
    safe(sb(`/cab_items?chat_id=eq.${chat}&kind=eq.fav&select=key,data&limit=200`), [])
  ]);
  const have = new Set();
  const weighted = [];
  for(const e of events || []){ have.add(e.key); weighted.push({data: e.data, w: 1}); }
  for(const f of items || []){ have.add(f.key); weighted.push({data: f.data, w: 3}); }   // избранное весомее просмотра
  const picks = await safe(sb(`/cab_picks?chat_id=eq.${chat}&select=lot_id&limit=200`), []);
  for(const p of picks || []) have.add(p.lot_id);
  const prof = cl.interestProfile(weighted).slice(0, 2);
  const out = [], seen = new Set();
  for(const p of prof){
    const qs = new URLSearchParams({action: "search", name: `${p.make} ${p.model}`.trim(), tab: "all", sort: "soon", per_page: "12", auction: "all", smart: "1"});
    if(p.yearFrom) qs.set("yearFrom", String(p.yearFrom));
    if(p.yearTo) qs.set("yearTo", String(p.yearTo));
    const j = await fetchJson(`${selfOrigin(request)}/api/auctions?${qs}`, 20000);
    for(const lot of (j && j.items) || []){
      if(!lot || !lot.id || have.has(lot.id) || seen.has(lot.id)) continue;
      seen.add(lot.id);
      out.push({why: `${p.make} ${p.model}`.trim(), lot: cl.lotSnapshot(lot)});
      if(out.length >= 16) break;
    }
  }
  return {profile: prof, items: out.filter(x => x.lot)};
}

// ---------- подборка ----------
async function sendPicks(request, chat, refs, note){
  const links = await safe(sb(`/alert_links?chat_id=eq.${chat}&select=lang&limit=1`), []);
  if(!links || !links.length) return {ok: false, error: "Клиент не найден"};
  const lang = links[0].lang || "ru";
  const lots = await Promise.all(refs.map(r => lotOf(request, r)));
  const rows = [], missing = [];
  refs.forEach((r, i) => {
    const snap = cl.lotSnapshot(lots[i]);
    if(!snap){ missing.push(r.id); return; }
    snap.id = r.id;
    rows.push({chat_id: chat, lot_id: r.id, data: snap, note: cl.clip(note, 600) || null, created_at: new Date().toISOString(), seen_at: null, reaction: null, reaction_note: null, reaction_at: null, active: true});
  });
  if(!rows.length) return {ok: false, error: "Не удалось получить лоты: " + (missing.join(", ") || "список пуст")};
  await sb(`/cab_picks?on_conflict=chat_id,lot_id`, {method: "POST", headers: {prefer: "resolution=merge-duplicates,return=minimal"}, body: JSON.stringify(rows)});
  const T = {ru: "Открыть подборку", ro: "Deschide selecția", en: "Open the selection"}[lang] || "Открыть подборку";
  const pickText = cl.pickMessage(lang, rows, note);
  const sentTg = cl.tgSend(chat, pickText, [{text: T, url: cl.SITE + "/cabinet#picks"}]);
  // + web push на устройства клиента (если подключил уведомления в кабинете)
  const sentPush = require("../server/push").create(sb).sendToChat(chat, pickText, "/cabinet#picks").catch(() => 0);
  const sent = (await sentTg) || (await sentPush) > 0;
  return {ok: true, added: rows.length, missing, notified: sent};
}

module.exports = async function handler(request, response){
  if(!requireAdmin(request, response)) return;
  response.setHeader("cache-control", "no-store");
  try{
    const query = getQuery(request);
    if(request.method === "GET"){
      if(query.get("ping") != null){ sendJson(response, 200, {ok: true}); return; }
      const chat = String(query.get("chat") || "").replace(/[^0-9-]/g, "");
      if(chat){
        if(query.get("thread") != null){
          // Переписка: poll=1 — перед чтением забрать свежие сообщения у Telegram (cron раз в 3 мин; здесь — сразу)
          if(query.get("poll") != null){
            try{ await require("../server/alerts").create({sb, sendJson, readBody, isAdmin: () => true}).pollUpdates(); }catch(_){}
          }
          try{
            const msgs = await cl.msgThread(sb, chat, query.get("seen") != null);
            sendJson(response, 200, {ok: true, msgs});
          }catch(e){
            sendJson(response, 200, {ok: true, msgs: [], noTable: tableMissing(e)});
          }
          return;
        }
        if(query.get("suggest") != null){ sendJson(response, 200, {ok: true, ...(await suggestFor(request, chat))}); return; }
        const card = await clientCard(chat);
        if(!card){ sendJson(response, 404, {ok: false, error: "Клиент не найден"}); return; }
        sendJson(response, 200, {ok: true, card});
        return;
      }
      if(query.get("prefs") != null){ sendJson(response, 200, {ok: true, prefs: await cl.mgrPrefs(sb)}); return; }
      const items = await listClients();
      sendJson(response, 200, {ok: true, items, online: items.filter(i => i.online).length, prefs: await cl.mgrPrefs(sb)});
      return;
    }
    if(request.method === "POST"){
      const body = await readBody(request);
      const action = String(body.action || "");
      if(action === "prefs"){
        const prefs = {online: body.online !== false, hot: body.hot !== false, react: body.react !== false, msg: body.msg !== false};
        await cl.metaSet(sb, "mgr_prefs", prefs);
        sendJson(response, 200, {ok: true, prefs});
        return;
      }
      if(action === "tgmenu"){
        // Кнопка «Кабинет» в меню бота открывает Mini App (вход без ссылок и токенов) + список команд
        const token = process.env.ALERTS_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || "";
        if(!token){ sendJson(response, 400, {ok: false, error: "Не задан токен бота (ALERTS_BOT_TOKEN)"}); return; }
        const call = async (method, payload) => {
          const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
          try{ const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(payload), signal: ctl.signal}); return await r.json(); }
          catch(_){ return {ok: false, description: "нет ответа от Telegram"}; }
          finally{ clearTimeout(timer); }
        };
        const menu = await call("setChatMenuButton", {menu_button: {type: "web_app", text: "Кабинет", web_app: {url: cl.SITE + "/cabinet"}}});
        const cmds = await call("setMyCommands", {commands: [{command: "cabinet", description: "Личный кабинет"}, {command: "list", description: "Мои уведомления"}, {command: "stop", description: "Отключить уведомления"}]});
        sendJson(response, menu.ok ? 200 : 502, {ok: !!menu.ok, menu: !!menu.ok, commands: !!cmds.ok, error: menu.ok ? undefined : String(menu.description || "Telegram отказал")});
        return;
      }
      const chat = String(body.chat || "").replace(/[^0-9-]/g, "");
      if(!chat){ sendJson(response, 400, {ok: false, error: "chat"}); return; }
      if(action === "say"){
        const text = String(body.text || "").trim().slice(0, cl.MSG_MAX);
        if(!text){ sendJson(response, 400, {ok: false, error: "Введите текст"}); return; }
        const sent = await cl.tgSend(chat, cl.esc(text));
        if(!sent){ sendJson(response, 502, {ok: false, error: "Telegram не принял сообщение: клиент мог отключить бота"}); return; }
        let logged = true;
        try{ await cl.msgAdd(sb, chat, "out", text); }catch(e){ logged = false; }
        sendJson(response, 200, {ok: true, logged});
        return;
      }
      if(action === "note"){
        const tags = (Array.isArray(body.tags) ? body.tags : []).map(t => cl.clip(t, 24)).filter(Boolean).slice(0, 8);
        await cl.metaSet(sb, "cnote:" + chat, {text: cl.clip(body.text, 3000).slice(0, 3000), tags, t: Date.now()});
        sendJson(response, 200, {ok: true});
        return;
      }
      if(action === "pick"){
        const refs = [].concat(Array.isArray(body.ids) ? body.ids : [], cl.parseLotRefs(body.text)).map(x => typeof x === "string" ? cl.parseLotRef(x) : x).filter(Boolean);
        const uniq = [...new Map(refs.map(r => [r.id, r])).values()].slice(0, 12);
        if(!uniq.length){ sendJson(response, 400, {ok: false, error: "Укажите лот: ссылку на сайте или номер вида copart-61420506"}); return; }
        const r = await sendPicks(request, chat, uniq, body.note);
        sendJson(response, r.ok ? 200 : 400, r);
        return;
      }
      if(action === "unpick"){
        const id = Number(body.id) || 0;
        if(!id){ sendJson(response, 400, {ok: false}); return; }
        await sb(`/cab_picks?id=eq.${id}&chat_id=eq.${chat}`, {method: "PATCH", headers: {prefer: "return=minimal"}, body: JSON.stringify({active: false})});
        sendJson(response, 200, {ok: true});
        return;
      }
      sendJson(response, 400, {ok: false, error: "action"});
      return;
    }
    methodNotAllowed(response, ["GET", "POST"]);
  }catch(error){
    const msg = String(error.message || error);
    sendJson(response, error.status || 500, {ok: false, error: tableMissing(error) ? "Таблицы кабинета не созданы: выполните SQL из supabase/migrations/20261126_cab_clients.sql в Supabase → SQL Editor" : msg});
  }
};
