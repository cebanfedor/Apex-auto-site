// Уведомления в Telegram: новые лоты по сохранённому поиску и напоминания о торгах конкретного лота.
// Клиент получает секретный токен (localStorage) → «Start» у бота (deep-link) → cron/опрос getUpdates привязывает chat_id.
// Таблицы: alert_links / alert_subs / alert_meta (supabase/migrations/20260924_alerts.sql). Доступ только сервисным ключом.
const crypto = require("crypto");

const SITE = "https://apexauto.md";
const MAX_SUBS_PER_TOKEN = 30;
const SEARCH_MIN_GAP_MS = 30 * 60e3;   // не чаще одного сообщения по поиску раз в 30 мин (накапливаем)
const SEARCH_CHECK_GAP_MS = 5 * 60e3;
const LOT_REMIND_MS = 60 * 60e3;
const DAY_NOTIFY_HOUR = 10;              // «в день торгов» — в 10:00 по Кишинёву

const TXT = {
  ru: {
    subSearch: n => `🔔 Подписка включена: «${n}»`,
    subLot: n => `🔔 Слежу за лотом: ${n}`,
    dateSet: d => `📅 Назначена дата аукциона: ${d}`,
    timedOn: d => `⏳ Лот появился на Timed-торгах${d ? " · закрытие " + d : ""}`,
    dayOf: (d, h) => `📆 Сегодня торги: ${d}${h ? " (через ~" + h + " ч)" : ""}`,
    buyNow: p => `💰 Появился Buy Now: $${p}`,
    welcome: "✅ Уведомления Apex Auto подключены.",
    subsHead: "Ваши подписки:",
    none: "Пока подписок нет — добавьте их на сайте (кнопка «Уведомлять»).",
    stopped: "Уведомления отключены. Включить снова можно на сайте.",
    startBare: "Откройте сайт apexauto.md/auctions, выберите фильтры и нажмите «Уведомлять о новых» — подключение произойдёт автоматически.",
    newHead: (n, name) => `🆕 Новые лоты по поиску «${name}»: ${n}`,
    more: n => `…и ещё ${n}`,
    openAll: "Открыть все",
    openLot: "Открыть лот",
    soon: (t, mins) => `⏰ Через ${mins} мин торги${t ? " (Timed — закрытие)" : ""}`,
    playing: t => t ? "🔨 Timed-торги закрываются прямо сейчас" : "🔨 Торги по лоту идут сейчас",
    sold: b => `🏁 Лот продан за $${b}`,
    notSold: "🏁 Торги прошли, лот не продан (возможно, перенесён или выставлен снова)",
    moved: d => `📅 Торги перенесены на ${d}`,
    bid: "Ставка",
    date: "Торги"
  },
  ro: {
    subSearch: n => `🔔 Abonament activ: «${n}»`,
    subLot: n => `🔔 Urmăresc lotul: ${n}`,
    dateSet: d => `📅 A fost stabilită data licitației: ${d}`,
    timedOn: d => `⏳ Lotul a apărut la licitația Timed${d ? " · închidere " + d : ""}`,
    dayOf: (d, h) => `📆 Astăzi licitația: ${d}${h ? " (peste ~" + h + " h)" : ""}`,
    buyNow: p => `💰 A apărut Buy Now: $${p}`,
    welcome: "✅ Notificările Apex Auto sunt conectate.",
    subsHead: "Abonamentele tale:",
    none: "Nu ai abonamente — adaugă-le pe site (butonul „Notifică”).",
    stopped: "Notificările au fost oprite. Le poți reactiva pe site.",
    startBare: "Deschide apexauto.md/auctions, alege filtrele și apasă „Notifică-mă de noutăți” — conectarea se face automat.",
    newHead: (n, name) => `🆕 Loturi noi pentru căutarea „${name}”: ${n}`,
    more: n => `…și încă ${n}`,
    openAll: "Deschide toate",
    openLot: "Deschide lotul",
    soon: (t, mins) => `⏰ Peste ${mins} min licitația${t ? " (Timed — închidere)" : ""}`,
    playing: t => t ? "🔨 Licitația Timed se închide chiar acum" : "🔨 Licitația pentru lot are loc acum",
    sold: b => `🏁 Lot vândut cu $${b}`,
    notSold: "🏁 Licitația s-a încheiat, lotul nu s-a vândut (posibil reprogramat sau scos din nou)",
    moved: d => `📅 Licitația a fost mutată pe ${d}`,
    bid: "Ofertă",
    date: "Licitație"
  },
  en: {
    subSearch: n => `🔔 Subscription on: «${n}»`,
    subLot: n => `🔔 Watching the lot: ${n}`,
    dateSet: d => `📅 Auction date set: ${d}`,
    timedOn: d => `⏳ The lot is now on a Timed auction${d ? " · closes " + d : ""}`,
    dayOf: (d, h) => `📆 Auction today: ${d}${h ? " (in ~" + h + " h)" : ""}`,
    buyNow: p => `💰 Buy Now appeared: $${p}`,
    welcome: "✅ Apex Auto notifications are connected.",
    subsHead: "Your subscriptions:",
    none: "No subscriptions yet — add them on the site (the “Notify” button).",
    stopped: "Notifications are off. You can turn them on again on the site.",
    startBare: "Open apexauto.md/auctions, pick filters and press “Notify me about new lots” — connecting is automatic.",
    newHead: (n, name) => `🆕 New lots for your search “${name}”: ${n}`,
    more: n => `…and ${n} more`,
    openAll: "Open all",
    openLot: "Open lot",
    soon: (t, mins) => `⏰ Auction in ${mins} min${t ? " (Timed — closing)" : ""}`,
    playing: t => t ? "🔨 Timed auction is closing right now" : "🔨 The lot is on the block now",
    sold: b => `🏁 Lot sold for $${b}`,
    notSold: "🏁 Auction ended, the lot did not sell (it may be rescheduled or relisted)",
    moved: d => `📅 Auction moved to ${d}`,
    bid: "Bid",
    date: "Auction"
  }
};
const tx = lang => TXT[lang] || TXT.ru;
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = n => Number(n || 0).toLocaleString("en-US").replace(/,/g, " ");

function fmtDate(iso, lang){
  const d = new Date(iso);
  if(Number.isNaN(d.getTime())) return "—";
  try{
    return d.toLocaleString(lang === "en" ? "en-GB" : lang === "ro" ? "ro-RO" : "ru-RU", {timeZone:"Europe/Chisinau", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"});
  }catch(_){ return d.toISOString().slice(0, 16).replace("T", " "); }
}

function lotUrl(id){ return `${SITE}/auctions/${encodeURIComponent(id)}`; }
function ymd(iso){ const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10).replace(/-/g, ""); }

function create(deps){
  const {sb, searchFromDb, sendJson, readBody, isAdmin} = deps;
  let botName = null, botNameAt = 0;

  const tgToken = () => process.env.TELEGRAM_BOT_TOKEN || "";
  async function tg(method, body, ms = 8000){
    const token = tgToken();
    if(!token) return {ok:false, description:"no token"};
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try{
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body || {}), signal:ctl.signal
      });
      return await res.json();
    }catch(e){
      return {ok:false, description:String(e.message || e)};
    }finally{ clearTimeout(timer); }
  }
  async function botUsername(){
    if(botName && Date.now() - botNameAt < 6 * 3600e3) return botName;
    const r = await tg("getMe");
    if(r && r.ok && r.result && r.result.username){ botName = r.result.username; botNameAt = Date.now(); }
    return botName;
  }
  async function send(chatId, text, buttons){
    const body = {chat_id:chatId, text, parse_mode:"HTML", disable_web_page_preview:true};
    if(buttons && buttons.length) body.reply_markup = {inline_keyboard:[buttons.map(b => ({text:b.text, url:b.url}))]};
    const r = await tg("sendMessage", body);
    // Пользователь заблокировал бота → отключаем его подписки, чтобы не долбить впустую
    if(r && r.ok === false && /blocked|deactivated|chat not found/i.test(String(r.description || ""))) return {ok:false, dead:true};
    return {ok:!!(r && r.ok)};
  }

  const q = s => encodeURIComponent(s);
  const ip = req => String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  const ipHash = req => crypto.createHash("sha256").update("alerts|" + ip(req)).digest("hex").slice(0, 24);
  const okToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(t);

  // ---------- мета-лок (getUpdates нельзя вызывать параллельно) ----------
  async function metaGet(k){
    const rows = await sb(`/alert_meta?k=eq.${q(k)}&select=v,updated_at&limit=1`).catch(() => null);
    return rows && rows[0] ? rows[0] : null;
  }
  async function metaSet(k, v){
    await sb(`/alert_meta?on_conflict=k`, {method:"POST", headers:{prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({k, v, updated_at:new Date().toISOString()})});
  }
  async function takeLock(k, ms){
    await sb(`/alert_meta?on_conflict=k`, {method:"POST", headers:{prefer:"resolution=ignore-duplicates,return=minimal"}, body:JSON.stringify({k, v:{}, updated_at:new Date(0).toISOString()})}).catch(() => {});
    const now = Date.now();
    const rows = await sb(`/alert_meta?k=eq.${q(k)}&updated_at=lt.${q(new Date(now - ms).toISOString())}`, {
      method:"PATCH", headers:{prefer:"return=representation"}, body:JSON.stringify({updated_at:new Date(now).toISOString()})
    }).catch(() => null);
    return Array.isArray(rows) && rows.length === 1;
  }

  // ---------- привязка: обработка сообщений боту ----------
  async function subsSummary(token, lang){
    const T = tx(lang);
    const subs = await sb(`/alert_subs?token=eq.${q(token)}&active=eq.true&select=kind,name,lot_title&order=created_at.desc&limit=15`).catch(() => []);
    if(!subs.length) return T.none;
    return `${T.subsHead}\n` + subs.map(s => `• ${s.kind === "lot" ? "🔨" : "🆕"} ${esc(s.name || s.lot_title || "")}`).join("\n");
  }
  async function pollUpdates(){
    if(!tgToken()) return {ok:false, reason:"no_token"};
    if(!(await takeLock("tg_poll", 4000))) return {ok:true, skipped:true};
    const meta = await metaGet("tg_offset");
    const offset = meta && meta.v && Number.isFinite(meta.v.o) ? meta.v.o : 0;
    const r = await tg("getUpdates", {offset, timeout:0, limit:50, allowed_updates:["message"]}, 9000);
    if(!r || !r.ok) return {ok:false, reason:String((r && r.description) || "getUpdates failed")};
    let last = null, bound = 0;
    for(const u of r.result || []){
      last = u.update_id;
      const m = u.message;
      if(!m || !m.chat || m.chat.type !== "private" || typeof m.text !== "string") continue;
      const chatId = m.chat.id;
      const text = m.text.trim();
      const start = text.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/i);
      if(start){
        const token = start[1];
        if(token && okToken(token)){
          const links = await sb(`/alert_links?token=eq.${q(token)}&select=token,lang,chat_id&limit=1`).catch(() => []);
          const link = links[0];
          if(link){
            // Токен привязывается один раз; повторный /start с тем же токеном — просто подтверждение
            if(!link.chat_id) await sb(`/alert_links?token=eq.${q(token)}&chat_id=is.null`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({chat_id:chatId, bound_at:new Date().toISOString()})}).catch(() => {});
            if(!link.chat_id || Number(link.chat_id) === Number(chatId)){
              bound++;
              const lang = link.lang || "ru";
              await send(chatId, `${tx(lang).welcome}\n\n${await subsSummary(token, lang)}`);
              continue;
            }
          }
        }
        await send(chatId, tx("ru").startBare);
      }else if(/^\/stop\b/i.test(text)){
        const links = await sb(`/alert_links?chat_id=eq.${chatId}&select=token,lang`).catch(() => []);
        for(const l of links) await sb(`/alert_subs?token=eq.${q(l.token)}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({active:false})}).catch(() => {});
        await send(chatId, tx((links[0] && links[0].lang) || "ru").stopped);
      }else if(/^\/list\b/i.test(text)){
        const links = await sb(`/alert_links?chat_id=eq.${chatId}&select=token,lang&limit=1`).catch(() => []);
        await send(chatId, links[0] ? await subsSummary(links[0].token, links[0].lang || "ru") : tx("ru").none);
      }
    }
    if(last != null) await metaSet("tg_offset", {o:last + 1});
    return {ok:true, updates:(r.result || []).length, bound};
  }

  // ---------- обработка подписок ----------
  async function linksFor(tokens){
    if(!tokens.length) return {};
    const rows = await sb(`/alert_links?token=in.(${tokens.map(q).join(",")})&chat_id=not.is.null&select=token,chat_id,lang,prefs`).catch(() => []);
    const out = {};
    for(const r of rows) out[r.token] = r;
    return out;
  }
  const patchSub = (id, body) => sb(`/alert_subs?id=eq.${id}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify(body)}).catch(() => {});

  function lotLine(l, lang){
    const T = tx(lang);
    const title = l.title || [l.year, l.make, l.model].filter(Boolean).join(" ") || l.id;
    const bid = Number(l.currentBid) > 0 ? ` · ${T.bid} $${money(l.currentBid)}` : "";
    const when = l.auctionDate ? ` · ${fmtDate(l.auctionDate, lang)}` : "";
    return `• <a href="${lotUrl(l.id)}">${esc(title)}</a>${bid}${when}`;
  }

  const PREF_DEFAULT = {date:true, timed:true, day:true, hour:true, buynow:true, play:true};
  const localYmd = ms => new Date(ms).toLocaleDateString("en-CA", {timeZone:"Europe/Chisinau"});
  const localHour = ms => Number(new Date(ms).toLocaleString("en-GB", {timeZone:"Europe/Chisinau", hour:"2-digit", hour12:false}));

  async function processLots(now, out){
    const subs = await sb(`/alert_subs?kind=eq.lot&active=eq.true&select=*&order=sale_date.asc.nullslast&limit=300`).catch(() => []);
    if(!subs.length) return;
    const links = await linksFor([...new Set(subs.map(s => s.token))]);
    const live = subs.filter(s => links[s.token]);
    if(!live.length) return;
    const ids = [...new Set(live.map(s => s.lot_id))];
    const rows = await sb(`/api_lots?id=in.(${ids.map(q).join(",")})&select=id,sale_date,status_id,final_bid,current_bid,buy_now,archived,payload`).catch(() => []);
    const byId = {}; for(const r of rows) byId[r.id] = r;
    // Продажа могла уйти в архивную копию, если лот выставили заново (id вида <lot>-sYYYYMMDD)
    const copyIds = live.filter(s => s.sale_date && Date.parse(s.sale_date) < now).map(s => `${s.lot_id}-s${ymd(s.sale_date)}`);
    const copies = {};
    if(copyIds.length){
      const cr = await sb(`/api_lots?id=in.(${copyIds.map(q).join(",")})&select=id,final_bid,status_id,archived`).catch(() => []);
      for(const r of cr) copies[r.id] = r;
    }
    for(const s of live){
      const link = links[s.token], lang = link.lang || "ru", T = tx(lang);
      const prefs = {...PREF_DEFAULT, ...(link.prefs || {})};
      const row = byId[s.lot_id];
      const pl = (row && row.payload) || {};
      const title = s.lot_title || pl.title || s.lot_id;
      const btn = [{text:T.openLot, url:lotUrl(s.lot_id)}];
      const head = `<b>${esc(title)}</b>\n`;
      const st = {...(s.state || {})};                       // d: дата была, t: Timed был, b: Buy Now был, day/hour: ключи уже отправленных
      const patch = {};
      let dead = false;
      const say = async (text, extra) => {
        const r = await send(link.chat_id, `${head}${text}`, btn);
        if(r.dead) dead = true;
        patch.last_sent = new Date().toISOString();
        if(extra) Object.assign(patch, extra);
        return r;
      };

      if(!row){
        // Лот исчез из базы: без даты ждём неделю, с датой — сутки после торгов
        const age = now - Date.parse(s.created_at || 0);
        const done = s.sale_date ? now - Date.parse(s.sale_date) > 24 * 3600e3 : age > 7 * 24 * 3600e3;
        if(done) await patchSub(s.id, {active:false});
        continue;
      }

      const curTimed = !!pl.timed && /^iaai/.test(s.lot_id);
      const curBuy = Number(row.buy_now) > 0 ? Number(row.buy_now) : 0;
      let saleIso = row.sale_date || null;
      let saleMs = saleIso ? Date.parse(saleIso) : NaN;
      const storedMs = s.sale_date ? Date.parse(s.sale_date) : NaN;

      // 1) появилась дата аукциона (раньше её не было)
      if(!st.d && Number.isFinite(saleMs) && saleMs > now - 3600e3){
        if(prefs.date) await say(T.dateSet(fmtDate(saleIso, lang)));
        st.d = true; patch.sale_date = saleIso; patch.stage = 0; st.hour = null; st.day = null; out.dateSet++;
      }else if(Number.isFinite(saleMs) && Number.isFinite(storedMs) && saleMs > now && Math.abs(saleMs - storedMs) > 6 * 3600e3){
        // Лот перенесли на другую дату (в будущем)
        if(prefs.play) await say(T.moved(fmtDate(saleIso, lang)));
        patch.sale_date = saleIso; patch.stage = 0; st.hour = null; st.day = null; out.moved++;
      }else if(Number.isFinite(saleMs) && !Number.isFinite(storedMs)){
        patch.sale_date = saleIso;
      }
      if(Number.isFinite(saleMs)) st.d = true;

      // 2) IAAI: лот появился на Timed-торгах
      if(curTimed && !st.t){
        if(prefs.timed) await say(T.timedOn(Number.isFinite(saleMs) ? fmtDate(saleIso, lang) : ""));
        out.timedOn++;
      }
      st.t = curTimed;

      // 5) появился Buy Now
      if(curBuy && !st.b){
        if(prefs.buynow) await say(T.buyNow(money(curBuy)));
        out.buyNow++;
      }
      st.b = curBuy;

      if(Number.isFinite(saleMs)){
        const copy = copies[`${s.lot_id}-s${ymd(s.sale_date)}`];
        const soldFrom = (row.archived && Number(row.status_id) === 6 && Number(row.final_bid) > 0 && saleMs <= now) ? row
          : (copy && Number(copy.status_id) === 6 && Number(copy.final_bid) > 0) ? copy : null;
        const stage = Number(patch.stage != null ? patch.stage : s.stage) || 0;
        if(soldFrom){
          if(prefs.play) await say(T.sold(money(soldFrom.final_bid)));
          patch.stage = 3; patch.active = false; out.sold++;
        }else if(now >= saleMs){
          if(stage < 2 && now - saleMs < 4 * 3600e3){
            if(prefs.play) await say(T.playing(curTimed));
            patch.stage = 2; out.playing++;
          }else if(now - saleMs > 12 * 3600e3){
            if(stage < 3 && prefs.play){ await say(T.notSold); out.notSold++; }
            patch.stage = 3; patch.active = false;
          }
        }else{
          const hourKey = saleIso;
          // 3) день аукциона: в 10:00 по Кишинёву (или при подписке позже в тот же день) — если до торгов больше часа
          if(st.day !== localYmd(saleMs) && localYmd(saleMs) === localYmd(now) && (localHour(now) >= DAY_NOTIFY_HOUR) && saleMs - now > LOT_REMIND_MS){
            if(prefs.day) await say(T.dayOf(fmtDate(saleIso, lang), Math.round((saleMs - now) / 3600e3)));
            st.day = localYmd(saleMs); out.dayOf++;
          }
          // 4) за час
          if(saleMs - now <= LOT_REMIND_MS && st.hour !== hourKey){
            if(prefs.hour){
              const mins = Math.max(1, Math.round((saleMs - now) / 60000));
              const bid = Number(row.current_bid) > 0 ? `\n${T.bid}: $${money(row.current_bid)}` : "";
              await say(`${T.soon(curTimed, mins)}\n${T.date}: ${fmtDate(saleIso, lang)}${bid}`);
            }
            st.hour = hourKey; patch.stage = Math.max(1, Number(s.stage) || 0); out.soon++;
          }
        }
      }else if(s.created_at && now - Date.parse(s.created_at) > 60 * 24 * 3600e3){
        patch.active = false;                                // без даты за 60 дней так и не появилась
      }

      patch.state = st;
      if(dead){ await sb(`/alert_subs?token=eq.${q(s.token)}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({active:false})}).catch(() => {}); continue; }
      await patchSub(s.id, patch);
    }
  }

  async function processSearches(now, out, budgetMs){
    const t0 = Date.now();
    const olderCheck = new Date(now - SEARCH_CHECK_GAP_MS).toISOString();
    const subs = await sb(`/alert_subs?kind=eq.search&active=eq.true&last_check=lt.${q(olderCheck)}&select=*&order=last_check.asc&limit=8`).catch(() => []);
    if(!subs.length) return;
    const links = await linksFor([...new Set(subs.map(s => s.token))]);
    for(const s of subs){
      if(Date.now() - t0 > budgetMs) break;
      const link = links[s.token];
      if(!link) continue;                                 // Telegram ещё не подключён — пока не проверяем
      if(s.last_sent && now - Date.parse(s.last_sent) < SEARCH_MIN_GAP_MS) continue;
      const lang = link.lang || "ru", T = tx(lang);
      const p = new URLSearchParams(s.qs || "");
      for(const k of ["page", "per_page", "lang", "firstSeenFrom"]) p.delete(k);
      const since = new Date(Date.parse(s.last_check) - 3000).toISOString();
      const startedAt = new Date().toISOString();
      p.set("firstSeenFrom", since); p.set("per_page", "6"); p.set("page", "1");
      if(!p.get("sort") || p.get("sort") === "smart") p.set("sort", "soon");
      let res = null;
      try{ res = await searchFromDb(p); }catch(_){ res = null; }
      if(!res || !Array.isArray(res.items)){ out.searchErr++; continue; }   // база недоступна — курсор не двигаем
      const total = Number(res.total) || res.items.length;
      if(!res.items.length){ await patchSub(s.id, {last_check:startedAt}); continue; }
      const shown = res.items.slice(0, 5);
      const back = new URLSearchParams(s.qs || ""); ["page", "per_page", "firstSeenFrom", "lang"].forEach(k => back.delete(k));
      const openUrl = `${SITE}/auctions${back.toString() ? "?" + back.toString() : ""}`;
      const text = `${T.newHead(total, esc(s.name || ""))}\n\n${shown.map(l => lotLine(l, lang)).join("\n")}${total > shown.length ? `\n${T.more(total - shown.length)}` : ""}`;
      const r = await send(link.chat_id, text, [{text:T.openAll, url:openUrl}]);
      await patchSub(s.id, r.dead ? {active:false} : {last_check:startedAt, last_sent:startedAt, sent_count:(Number(s.sent_count) || 0) + 1});
      out.newMsgs++;
    }
  }

  async function tick(){
    const out = {ok:true, soon:0, playing:0, sold:0, notSold:0, moved:0, dateSet:0, timedOn:0, dayOf:0, buyNow:0, newMsgs:0, searchErr:0};
    if(!tgToken()){ out.ok = false; out.reason = "no_token"; return out; }
    if(!(await takeLock("tick", 45000))) return {ok:true, skipped:true};
    const started = Date.now();
    out.poll = await pollUpdates().catch(e => ({ok:false, reason:String(e.message || e)}));
    await processLots(Date.now(), out).catch(e => { out.lotErr = String(e.message || e).slice(0, 120); });
    await processSearches(Date.now(), out, Math.max(5000, 40000 - (Date.now() - started))).catch(e => { out.searchFail = String(e.message || e).slice(0, 120); });
    out.ms = Date.now() - started;
    return out;
  }

  // ---------- публичные действия ----------
  async function handle(action, request, response, query){
    const NO = {"cache-control":"no-store"};
    if(!tgToken() && action !== "alertdiag"){ sendJson(response, 200, {ok:false, error:"not_configured"}, NO); return true; }

    if(action === "alerttick"){ sendJson(response, 200, await tick(), NO); return true; }

    if(action === "alertdiag"){
      if(!isAdmin(request)){ sendJson(response, 401, {ok:false}); return true; }
      const info = tgToken() ? await tg("getWebhookInfo") : null;
      const counts = {};
      for(const [k, path] of [["links", "/alert_links?select=token"], ["bound", "/alert_links?chat_id=not.is.null&select=token"], ["subsActive", "/alert_subs?active=eq.true&select=id"], ["lotSubs", "/alert_subs?active=eq.true&kind=eq.lot&select=id"]]){
        counts[k] = await sb(path + "&limit=1000").then(r => r.length).catch(e => `err: ${String(e.message || e).slice(0, 60)}`);
      }
      sendJson(response, 200, {ok:true, configured:!!tgToken(), bot:tgToken() ? await botUsername() : null, webhook:info && info.result ? (info.result.url || "") : null, counts}, NO);
      return true;
    }

    if(action === "alertlink"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      const lang = ["ru", "ro", "en"].includes(body.lang) ? body.lang : "ru";
      const h = ipHash(request);
      const since = new Date(Date.now() - 3600e3).toISOString();
      const recent = await sb(`/alert_links?ip_hash=eq.${h}&created_at=gt.${q(since)}&select=token&limit=20`).catch(() => []);
      if(recent.length >= 10){ sendJson(response, 429, {ok:false, error:"rate_limited"}, NO); return true; }
      const token = crypto.randomBytes(24).toString("base64url");
      await sb(`/alert_links`, {method:"POST", headers:{prefer:"return=minimal"}, body:JSON.stringify({token, lang, ip_hash:h})});
      const name = await botUsername();
      if(!name){ sendJson(response, 200, {ok:false, error:"bot_unavailable"}, NO); return true; }
      sendJson(response, 200, {ok:true, token, url:`https://t.me/${name}?start=${token}`}, NO);
      return true;
    }

    if(action === "alertstatus"){
      const token = query.get("token");
      if(!okToken(token)){ sendJson(response, 400, {ok:false}, NO); return true; }
      let links = await sb(`/alert_links?token=eq.${q(token)}&select=chat_id,lang,prefs&limit=1`).catch(() => null);
      if(!links || !links[0]){ sendJson(response, 200, {ok:true, exists:false}, NO); return true; }
      if(!links[0].chat_id){
        await pollUpdates().catch(() => {});      // Start нажат секунду назад — не ждём cron
        links = await sb(`/alert_links?token=eq.${q(token)}&select=chat_id,lang,prefs&limit=1`).catch(() => links);
      }
      const subs = await sb(`/alert_subs?token=eq.${q(token)}&active=eq.true&select=id,kind,name,lot_id,lot_title,sale_date,stage&order=created_at.desc&limit=60`).catch(() => []);
      const name = await botUsername();
      sendJson(response, 200, {ok:true, exists:true, bound:!!(links[0] && links[0].chat_id), prefs:{...PREF_DEFAULT, ...((links[0] && links[0].prefs) || {})}, url:name ? `https://t.me/${name}?start=${token}` : "", subs}, NO);
      return true;
    }

    if(action === "alertprefs"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      if(!okToken(body.token)){ sendJson(response, 400, {ok:false}, NO); return true; }
      const prefs = {};
      for(const k of Object.keys(PREF_DEFAULT)) prefs[k] = body.prefs && body.prefs[k] === false ? false : true;
      await sb(`/alert_links?token=eq.${q(body.token)}`, {method:"PATCH", headers:{prefer:"return=minimal"}, body:JSON.stringify({prefs})});
      sendJson(response, 200, {ok:true, prefs}, NO);
      return true;
    }

    if(action === "alertsub" || action === "alertdel"){
      if(request.method !== "POST"){ sendJson(response, 405, {ok:false}); return true; }
      const body = await readBody(request).catch(() => ({}));
      if(!okToken(body.token)){ sendJson(response, 400, {ok:false, error:"bad_token"}, NO); return true; }
      const links = await sb(`/alert_links?token=eq.${q(body.token)}&select=token,chat_id&limit=1`).catch(() => []);
      if(!links[0]){ sendJson(response, 200, {ok:false, error:"unknown_token"}, NO); return true; }
      if(action === "alertdel"){
        const id = Number(body.id);
        if(!Number.isFinite(id)){ sendJson(response, 400, {ok:false}, NO); return true; }
        await sb(`/alert_subs?id=eq.${id}&token=eq.${q(body.token)}`, {method:"DELETE", headers:{prefer:"return=minimal"}});
        sendJson(response, 200, {ok:true}, NO);
        return true;
      }
      const existing = await sb(`/alert_subs?token=eq.${q(body.token)}&active=eq.true&select=id,kind,qs,lot_id&limit=100`).catch(() => []);
      const room = MAX_SUBS_PER_TOKEN - existing.length;
      const rows = [];
      if(body.kind === "search"){
        const p = new URLSearchParams(String(body.qs || "").slice(0, 1500));
        for(const k of ["page", "per_page", "lang", "firstSeenFrom"]) p.delete(k);
        if(["archived", "favorites"].includes(p.get("tab"))){ sendJson(response, 200, {ok:false, error:"tab_not_supported"}, NO); return true; }
        const qs = p.toString();
        if(existing.some(e => e.kind === "search" && e.qs === qs)){ sendJson(response, 200, {ok:true, dup:true, bound:!!links[0].chat_id}, NO); return true; }
        rows.push({token:body.token, kind:"search", qs, name:String(body.name || "Поиск").slice(0, 120), last_check:new Date().toISOString()});
      }else if(body.kind === "lot"){
        for(const l of (Array.isArray(body.lots) ? body.lots : []).slice(0, 40)){
          const id = String(l && l.id || "");
          if(!/^(copart|iaai)-[A-Za-z0-9_-]{3,30}$/.test(id)) continue;
          if(existing.some(e => e.kind === "lot" && e.lot_id === id)) continue;
          const sd = l.saleDate && Number.isFinite(Date.parse(l.saleDate)) ? new Date(l.saleDate).toISOString() : null;
          rows.push({token:body.token, kind:"lot", lot_id:id, lot_title:String(l.title || id).slice(0, 140), name:String(l.title || id).slice(0, 140), sale_date:sd, stage:0});
        }
      }
      if(rows.length && body.kind === "lot"){
        // Снимок текущего состояния лота: события («дата назначена», «Timed», «Buy Now») сработают только на ИЗМЕНЕНИЕ
        const snap = await sb(`/api_lots?id=in.(${rows.map(r => q(r.lot_id)).join(",")})&select=id,sale_date,buy_now,payload`).catch(() => []);
        const byId = {}; for(const r of snap) byId[r.id] = r;
        for(const r of rows){
          const row = byId[r.lot_id];
          if(row && row.sale_date) r.sale_date = new Date(row.sale_date).toISOString();
          r.state = {d:!!(row && row.sale_date) || !!r.sale_date, t:!!(row && row.payload && row.payload.timed) && /^iaai/.test(r.lot_id), b:row && Number(row.buy_now) > 0 ? Number(row.buy_now) : 0};
        }
      }
      if(!rows.length){ sendJson(response, 200, {ok:true, added:0, bound:!!links[0].chat_id}, NO); return true; }
      if(room < rows.length){ sendJson(response, 200, {ok:false, error:"limit", max:MAX_SUBS_PER_TOKEN}, NO); return true; }
      await sb(`/alert_subs`, {method:"POST", headers:{prefer:"return=minimal"}, body:JSON.stringify(rows)});
      // Уже подключён к Telegram — подтверждаем сразу, чтобы клиент видел, что всё работает
      if(links[0].chat_id){
        const lk = await sb(`/alert_links?token=eq.${q(body.token)}&select=lang&limit=1`).catch(() => []);
        const T = tx((lk[0] && lk[0].lang) || "ru");
        const msg = body.kind === "search" ? T.subSearch(esc(rows[0].name)) : rows.length === 1 ? T.subLot(esc(rows[0].name)) : T.subLot(`${rows.length}`);
        await send(links[0].chat_id, msg);
      }
      sendJson(response, 200, {ok:true, added:rows.length, bound:!!links[0].chat_id}, NO);
      return true;
    }
    return false;
  }

  return {handle, tick, pollUpdates};
}

module.exports = {create};
