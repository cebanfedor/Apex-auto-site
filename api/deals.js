// Админ-API «Сделки» (личный кабинет клиента). Только для админа. При смене этапа (или с флагом notify)
// клиенту в Telegram уходит сообщение — если он подтвердил номер телефона в боте.
const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");
const deals = require("../server/deals");

async function chatForKey(key){
  const rows = await supabase.list("alert_meta", {select: "v", k: `eq.phonekey:${key}`, limit: "1"}).catch(() => []);
  const chat = rows && rows[0] && rows[0].v && rows[0].v.chat;
  if(!chat) return null;
  const links = await supabase.list("alert_links", {select: "lang", chat_id: `eq.${chat}`, limit: "1"}).catch(() => []);
  return {chat, lang: (links && links[0] && links[0].lang) || "ru"};
}

module.exports = async function handler(request, response){
  if(!requireAdmin(request, response)) return;
  response.setHeader("cache-control", "no-store");
  try{
    const id = String(getQuery(request).get("id") || "").replace(/[^0-9]/g, "");
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
      if(editId) saved = await supabase.update("cab_deals", editId, row);
      else saved = await supabase.create("cab_deals", row);
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
      sendJson(response, 200, {ok: true, item: saved, notified});
      return;
    }
    methodNotAllowed(response, ["GET", "POST", "PATCH", "DELETE"]);
  }catch(error){
    const msg = String(error.message || error);
    sendJson(response, error.status || 500, {ok: false, error: /cab_deals|relation|schema cache/i.test(msg) ? "Таблица cab_deals не создана: выполните SQL из supabase/migrations/20261125_cab_deals.sql в Supabase → SQL Editor" : msg});
  }
};
