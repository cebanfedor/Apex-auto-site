// Админ-API «Сделки» (личный кабинет клиента). Только для админа. При смене этапа (или с флагом notify)
// клиенту в Telegram уходит сообщение — если он подтвердил номер телефона в боте.
const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");
const deals = require("../server/deals");
const {selfOrigin} = require("../server/origin");

async function lotByVin(request, vin){
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
  try{
    const r = await fetch(`${selfOrigin(request)}/api/auctions?action=vin&vin=${encodeURIComponent(vin)}`, {signal: ctl.signal, headers: {accept: "application/json"}});
    if(!r.ok) return null;
    const j = await r.json();
    return j && j.ok && j.lot && j.lot.year ? j.lot : null;
  }catch(_){ return null; }
  finally{ clearTimeout(timer); }
}
async function trackByVin(request, vin){
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
  try{
    const r = await fetch(`${selfOrigin(request)}/api/w8-tracking?vin=${encodeURIComponent(vin)}`, {signal: ctl.signal, headers: {accept: "application/json"}});
    if(!r.ok) return null;
    return await r.json();
  }catch(_){ return null; }
  finally{ clearTimeout(timer); }
}

const chatForKey = key => deals.chatForKey(supabase, key);

module.exports = async function handler(request, response){
  if(!requireAdmin(request, response)) return;
  response.setHeader("cache-control", "no-store");
  try{
    const id = String(getQuery(request).get("id") || "").replace(/[^0-9]/g, "");
    if(request.method === "GET" && getQuery(request).get("lookup") != null){
      // Автозаполнение по VIN: машина, этап, ETA, лента и фото — из тех же данных, что на странице «Отследить»
      const vin = String(getQuery(request).get("lookup") || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
      if(vin.length !== 17){ sendJson(response, 200, {ok: true, found: false, reason: "vin"}); return; }
      const rules = String(getQuery(request).get("rules") || "");
      const [trk, lot] = await Promise.all([trackByVin(request, vin), lotByVin(request, vin)]);
      const t = deals.fromTracking(trk);
      let calc = null;
      try{ calc = await deals.calcFromLot(lot, rules); }catch(e){ calc = null; }
      if(!t && !lot){ sendJson(response, 200, {ok: true, found: false, reason: "not_found"}); return; }
      const data = t || {title: "", vin, stage: "", eta_date: "", timeline: [], photos: [], city: "", auction: "", lot: "", container: "", source: ""};
      if(!data.title && lot) data.title = String(lot.title || [lot.year, lot.make, lot.model].filter(Boolean).join(" ")).slice(0, 140);
      if(!data.city && lot) data.city = lot.location || "";
      data.calc = calc; data.inLots = !!lot;
      sendJson(response, 200, {ok: true, found: true, data});
      return;
    }
    if(request.method === "GET"){
      const items = await supabase.list("cab_deals", {select: "*", order: "updated_at.desc", limit: "300"});
      // у каких клиентов номер уже подтверждён в боте (клиент увидит сделку и получит уведомления)
      const keys = [...new Set((items || []).map(r => r.phone_key))];
      const linked = {};
      for(const k of keys){ const c = await chatForKey(k); if(c) linked[k] = true; }
      sendJson(response, 200, {ok: true, items: (items || []).map(r => ({...r, linked: !!linked[r.phone_key]})), stages: deals.STAGES.map(s => ({key: s[0], label: s[1][0]}))});
      return;
    }
    if(request.method === "DELETE"){
      if(!id){ sendJson(response, 400, {ok: false, error: "id"}); return; }
      await supabase.remove("cab_deals", id);
      sendJson(response, 200, {ok: true});
      return;
    }
    if(request.method === "POST" || request.method === "PATCH"){
      const body = await readBody(request);
      const row = deals.cleanDeal(body);
      if(!row){ sendJson(response, 400, {ok: false, error: "Укажите телефон клиента (≥7 цифр) и название авто"}); return; }
      const editId = String((body && body.id) || id || "").replace(/[^0-9]/g, "");
      let before = null;
      if(editId){ const r = await supabase.list("cab_deals", {select: "*", id: `eq.${editId}`, limit: "1"}); before = r && r[0]; }
      let saved;
      let calcWarn = false;
      const save = r => editId ? supabase.update("cab_deals", editId, r) : supabase.create("cab_deals", r);
      try{ saved = await save(row); }
      catch(e){
        // Колонки calc ещё нет (миграция 20261125_cab_deals_calc.sql) — сохраняем сделку без расчёта и предупреждаем
        if(/calc/i.test(String((e && e.message) || e))){ const {calc, ...rest} = row; saved = await save(rest); calcWarn = !!calc; }
        else throw e;
      }
      saved = Array.isArray(saved) ? saved[0] : saved;
      // уведомление клиенту: этап изменился (или принудительно) и сделка активна
      let notified = "skip";
      const changed = !before || before.stage !== row.stage;
      if(row.active && (changed || body.notify_now) && body.notify !== false && body.notify !== "false"){
        const c = await chatForKey(row.phone_key);
        if(!c) notified = "no_chat";
        else notified = (await deals.sendTelegram(c.chat, deals.stageMessage(row, c.lang), c.lang)) ? "sent" : "failed";
        if(notified === "sent" && saved && saved.id) await supabase.update("cab_deals", saved.id, {notified_stage: row.stage}).catch(() => {});
      }
      sendJson(response, 200, {ok: true, item: saved, notified, calcWarn});
      return;
    }
    methodNotAllowed(response, ["GET", "POST", "PATCH", "DELETE"]);
  }catch(error){
    const msg = String(error.message || error);
    sendJson(response, error.status || 500, {ok: false, error: /cab_deals|relation|schema cache/i.test(msg) ? "Таблица cab_deals не создана: выполните SQL из supabase/migrations/20261125_cab_deals.sql в Supabase → SQL Editor" : msg});
  }
};
