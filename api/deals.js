// Админ-API «Сделки» (личный кабинет клиента). Только для админа. При смене этапа (или с флагом notify)
// клиенту в Telegram уходит сообщение — если он подтвердил номер телефона в боте.
const {sendJson, methodNotAllowed, readBody, getQuery} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");
const deals = require("../server/deals");
const {selfOrigin} = require("../server/origin");
const invoice = require("../server/invoice");
const clients = require("../server/clients");
const SITE = "https://apexauto.md";

// ---------- Счета (хранятся в alert_meta: inv:<токен>, invset) ----------
const sbr = supabase.rest;
const qe = encodeURIComponent;
async function metaPut(k, v){
  await sbr(`/alert_meta?on_conflict=k`, {method: "POST", headers: {prefer: "resolution=merge-duplicates,return=minimal"}, body: JSON.stringify({k, v, updated_at: new Date().toISOString()})});
}
async function invoicesOf(dealId){
  const rows = await sbr(`/alert_meta?k=like.${qe("inv:*")}&v->>deal_id=eq.${Number(dealId)}&select=v,updated_at&order=updated_at.desc&limit=30`).catch(() => []);
  return (rows || []).map(r => r.v);
}
async function invSettings(){
  const r = await sbr(`/alert_meta?k=eq.invset&select=v&limit=1`).catch(() => []);
  return (r && r[0] && r[0].v) || {requisites: ""};
}
async function dealById(id){
  const r = await supabase.list("cab_deals", {select: "*", id: `eq.${Number(id)}`, limit: "1"}).catch(() => []);
  return r && r[0] || null;
}
async function handleInvoiceAction(body, response){
  const act = body.action;
  if(act === "invset"){
    await metaPut("invset", {requisites: String(body.requisites || "").slice(0, 1500)});
    sendJson(response, 200, {ok: true});
    return;
  }
  if(act === "invoice"){
    const deal = await dealById(body.deal_id);
    if(!deal){ sendJson(response, 404, {ok: false, error: "Сначала сохраните сделку, потом формируйте счёт"}); return; }
    const lines = invoice.parseLines(body.lines);
    if(!lines.length){ sendJson(response, 400, {ok: false, error: "Добавьте хотя бы одну строку счёта: «название | сумма $»"}); return; }
    if(invoice.total(lines) <= 0){ sendJson(response, 400, {ok: false, error: "Итог счёта должен быть больше нуля"}); return; }
    const existing = await invoicesOf(deal.id);
    const token = invoice.newToken();
    const rate = invoice.num(body.rate) || invoice.num(deal.calc && deal.calc.usd_mdl) || 0;
    const rec = {token, deal_id: deal.id, no: `AA-${deal.id}-${existing.length + 1}`, title: deal.title, vin: deal.vin || "", client: deal.client_name || "", chat: deal.chat_id || null,
      lines, rate, note: String(body.note || "").slice(0, 300), created: new Date().toISOString(), paid: []};
    await metaPut("inv:" + token, rec);
    if(body.requisites != null) await metaPut("invset", {requisites: String(body.requisites).slice(0, 1500)});
    let sent = "skip";
    if(body.send){
      const c = await deals.chatForDeal(supabase, deal);
      if(!c) sent = "no_chat";
      else{
        const T = {ru: ["🧾 Счёт", "на сумму", "Открыть счёт"], ro: ["🧾 Factură", "în sumă de", "Deschide factura"], en: ["🧾 Invoice", "for", "Open invoice"]}[c.lang] || ["🧾 Счёт", "на сумму", "Открыть счёт"];
        const ok = await clients.tgSend(c.chat, `${T[0]} <b>${clients.esc(rec.no)}</b> — ${clients.esc(rec.title)}\n${T[1]} <b>${invoice.total(lines)} $</b>`, [{text: T[2], url: `${SITE}/invoice/${token}?lang=${c.lang}`}]);
        sent = ok ? "sent" : "failed";
      }
    }
    sendJson(response, 200, {ok: true, invoice: rec, url: `${SITE}/invoice/${token}`, sent});
    return;
  }
  if(act === "pay"){
    if(!invoice.okToken(body.token)){ sendJson(response, 400, {ok: false, error: "token"}); return; }
    const r = await sbr(`/alert_meta?k=eq.${qe("inv:" + body.token)}&select=v&limit=1`).catch(() => []);
    const rec = r && r[0] && r[0].v;
    if(!rec){ sendJson(response, 404, {ok: false, error: "Счёт не найден"}); return; }
    const usd = invoice.num(body.usd);
    if(!(usd > 0)){ sendJson(response, 400, {ok: false, error: "Введите сумму платежа в долларах"}); return; }
    rec.paid = (rec.paid || []).concat([{usd, at: new Date().toISOString(), note: String(body.note || "").slice(0, 80)}]);
    await metaPut("inv:" + body.token, rec);
    const deal = await dealById(rec.deal_id);
    if(deal){ await supabase.update("cab_deals", deal.id, {paid_usd: Math.round(((Number(deal.paid_usd) || 0) + usd) * 100) / 100, updated_at: new Date().toISOString()}).catch(() => {}); }
    let sent = "skip";
    if(deal && body.notify !== false){
      const c = await deals.chatForDeal(supabase, deal);
      if(!c) sent = "no_chat";
      else{
        const left = Math.max(0, invoice.total(rec.lines) - invoice.paidSum(rec));
        const T = {ru: ["✅ Платёж получен", "Оплачено по счёту", "Осталось"], ro: ["✅ Plată primită", "Achitat din factură", "Rest"], en: ["✅ Payment received", "Paid on invoice", "Left"]}[c.lang] || ["✅ Платёж получен", "Оплачено по счёту", "Осталось"];
        const ok = await clients.tgSend(c.chat, `${T[0]}: <b>${usd} $</b> · ${clients.esc(rec.title)}\n${T[1]} ${clients.esc(rec.no)}: ${invoice.paidSum(rec)} $ · ${T[2]}: ${left} $`);
        sent = ok ? "sent" : "failed";
      }
    }
    sendJson(response, 200, {ok: true, invoice: rec, sent});
    return;
  }
  sendJson(response, 400, {ok: false, error: "action"});
}

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
const chatForDeal = row => deals.chatForDeal(supabase, row);

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
    if(request.method === "GET" && getQuery(request).get("invoices") != null){
      const did = Number(getQuery(request).get("invoices")) || 0;
      sendJson(response, 200, {ok: true, settings: await invSettings(), invoices: did ? await invoicesOf(did) : []});
      return;
    }
    if(request.method === "GET"){
      const items = await supabase.list("cab_deals", {select: "*", order: "updated_at.desc", limit: "300"});
      // у каких клиентов номер уже подтверждён в боте (клиент увидит сделку и получит уведомления)
      const keys = [...new Set((items || []).filter(r => !r.chat_id).map(r => r.phone_key))];
      const linked = {};
      for(const k of keys){ const c = await chatForKey(k); if(c) linked[k] = true; }
      // привязанные напрямую (chat_id) — подключены по определению
      sendJson(response, 200, {ok: true, items: (items || []).map(r => ({...r, linked: !!r.chat_id || !!linked[r.phone_key]})), stages: deals.STAGES.map(s => ({key: s[0], label: s[1][0]}))});
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
      if(body && body.action){ await handleInvoiceAction(body, response); return; }
      const row = deals.cleanDeal(body);
      if(!row){ sendJson(response, 400, {ok: false, error: "Выберите клиента из Telegram или укажите телефон (≥7 цифр), и название авто"}); return; }
      const editId = String((body && body.id) || id || "").replace(/[^0-9]/g, "");
      let before = null;
      if(editId){ const r = await supabase.list("cab_deals", {select: "*", id: `eq.${editId}`, limit: "1"}); before = r && r[0]; }
      let saved;
      let calcWarn = false, chatWarn = false;
      const save = r => editId ? supabase.update("cab_deals", editId, r) : supabase.create("cab_deals", r);
      // Колонок calc / chat_id может ещё не быть (миграции 20261125_cab_deals_calc.sql, 20261126_cab_deals_chat.sql) —
      // сохраняем сделку без них и предупреждаем; не получилось один раз — пробуем дальше без следующей колонки
      let attempt = {...row};
      for(let i = 0; i < 3; i++){
        try{ saved = await save(attempt); break; }
        catch(e){
          const m = String((e && e.message) || e);
          if(/chat_id/i.test(m) && "chat_id" in attempt){ chatWarn = !!attempt.chat_id; delete attempt.chat_id; continue; }
          if(/calc/i.test(m) && "calc" in attempt){ calcWarn = !!attempt.calc; delete attempt.calc; continue; }
          throw e;
        }
      }
      saved = Array.isArray(saved) ? saved[0] : saved;
      // уведомление клиенту: этап изменился (или принудительно) и сделка активна
      let notified = "skip";
      const changed = !before || before.stage !== row.stage;
      if(row.active && (changed || body.notify_now) && body.notify !== false && body.notify !== "false"){
        const c = await chatForDeal(chatWarn ? {...row, chat_id: null} : row);
        if(!c) notified = "no_chat";
        else notified = (await deals.sendTelegram(c.chat, deals.stageMessage(row, c.lang), c.lang)) ? "sent" : "failed";
        if(notified === "sent" && saved && saved.id) await supabase.update("cab_deals", saved.id, {notified_stage: row.stage}).catch(() => {});
      }
      sendJson(response, 200, {ok: true, item: saved, notified, calcWarn, chatWarn});
      return;
    }
    methodNotAllowed(response, ["GET", "POST", "PATCH", "DELETE"]);
  }catch(error){
    const msg = String(error.message || error);
    sendJson(response, error.status || 500, {ok: false, error: /cab_deals|relation|schema cache/i.test(msg) ? "Таблица cab_deals не создана: выполните SQL из supabase/migrations/20261125_cab_deals.sql в Supabase → SQL Editor" : msg});
  }
};
