/* Админка → «Клиенты сайта» (26.11.2026): кто сейчас на сайте, карточка клиента (что смотрел / что ищет / избранное / сделки / заявки)
   и подборки клиенту прямо в его личный кабинет. Данные — /api/clients (только админ). Использует общие функции admin.js. */
(function(){
  "use strict";
  const CC = {items: [], chat: "", card: null, timer: null, suggest: null, picked: new Set(), site: null, loading: false};
  const REACT = {like: ["👍", "нравится", "ccRxLike"], no: ["👎", "не подходит", "ccRxNo"], discuss: ["💬", "хочет обсудить", "ccRxDisc"]};
  const e = escapeHtml;
  const STAGE_RU = {bought: "Куплен", paid: "Лот оплачен", pickup: "Вывоз с площадки", port: "На складе в порту", sea: "В море", klaipeda: "В порту Клайпеда", road: "В пути в Кишинёв", customs: "Растаможка", ready: "Готова к выдаче", done: "Выдана"};
  const times = n => { const m10 = n % 10, m100 = n % 100; return n + (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? " раза" : " раз"); };
  const dt = ms => ms ? new Date(ms).toLocaleString("ru-RU", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}) : "";
  const ago = ms => {
    if(!ms) return "никогда";
    const m = Math.round((Date.now() - ms) / 60000);
    if(m < 1) return "только что";
    if(m < 60) return m + " мин назад";
    if(m < 24 * 60) return Math.round(m / 60) + " ч назад";
    const d = Math.round(m / 1440);
    return d < 14 ? d + " дн назад" : dt(ms);
  };
  const digits = p => String(p || "").replace(/\D/g, "");
  const money = n => Number(n) > 0 ? Number(n).toLocaleString("ru-RU") + " $" : "";
  const lotUrl = id => "/auctions/" + encodeURIComponent(id);
  const thumb = d => d && (d.image || (d.images && d.images[0])) ? `<img src="${e(d.image || d.images[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const titleOf = d => (d && (d.title || [d.year, d.make, d.model].filter(Boolean).join(" "))) || "";

  // ---------- список ----------
  async function loadCabClients(silent){
    if(CC.loading) return;
    CC.loading = true;
    try{
      const [list, site] = await Promise.all([api("/api/clients"), api("/api/track?days=1").catch(() => null)]);
      CC.items = list.items || [];
      CC.site = site && site.stats ? site.stats : null;
      CC.online = list.online || 0;
      $$("[data-cc-pref]").forEach(c => { c.checked = !list.prefs || list.prefs[c.dataset.ccPref] !== false; });
      renderList();
      if(CC.chat && silent) await refreshCard(true);
    }catch(error){
      if(!silent) $("#ccList").innerHTML = `<p class="ccEmptyV1">${e(error.message)}</p>`;
    }finally{ CC.loading = false; }
    clearTimeout(CC.timer);
    CC.timer = setTimeout(() => { if(state.view === "cabclients") loadCabClients(true); }, 30000);
  }
  function renderList(){
    const q = ($("#ccSearch").value || "").trim().toLowerCase();
    const items = CC.items.filter(c => !q || [c.name, c.phone, c.city].join(" ").toLowerCase().includes(q));
    $("#ccOnlineV1").textContent = CC.online ? CC.online + " онлайн" : "";
    $("#ccOnlineV1").hidden = !CC.online;
    const s = CC.site;
    $("#ccSiteV1").innerHTML = s ? `Сейчас на сайте: <b>${Number(s.online) || 0}</b> посетителей, из них клиентов кабинета: <b>${CC.online || 0}</b>` : "";
    $("#ccList").innerHTML = items.length ? items.map(c => `
      <div class="ccRowV1${c.chat === CC.chat ? " is-sel" : ""}" data-cc-open="${e(c.chat)}">
        <i class="ccDotV1${c.online ? " on" : ""}"></i>
        <div class="ccRowMainV1">
          <b>${e(c.name || "Без имени")}</b>${c.city ? `<small> · ${e(c.city)}</small>` : ""}${c.verified ? ` <em class="ccVerV1" title="Номер подтверждён в Telegram">✓</em>` : ""}
          <span>${e(c.phone || "телефон не указан")}</span>
          <span class="ccSeenV1${c.online ? " on" : ""}">${c.online ? "онлайн" + (c.page ? " · " + e(c.page) : "") : "был " + ago(c.seenAt)}</span>
        </div>
        <div class="ccCountsV1">${c.unread ? `<span class="ccUnreadV1" title="Непрочитанные сообщения">💬 ${c.unread}</span>` : ""}${c.favs ? `<span title="В избранном">♡ ${c.favs}</span>` : ""}${c.picks ? `<span title="Подборок отправлено">🎯 ${c.picks}${c.reacts ? ` · ${c.reacts} отв.` : ""}</span>` : ""}</div>
      </div>`).join("") : `<p class="ccEmptyV1">${CC.items.length ? "Никого не найдено." : "Пока нет клиентов с подключённым Telegram."}</p>`;
  }

  // ---------- карточка ----------
  async function openClient(chat){
    CC.chat = chat; CC.suggest = null; CC.picked = new Set();
    $("#ccSplitV1").classList.add("ccOpenV1");
    renderList();
    $("#ccCard").innerHTML = `<p class="ccEmptyV1">Загрузка…</p>`;
    try{
      await refreshCard(false);
      $("#ccCard").scrollIntoView({block: "start", behavior: "smooth"});
    }catch(error){ $("#ccCard").innerHTML = `<p class="ccEmptyV1">${e(error.message)}</p>`; }
  }
  async function refreshCard(silent){
    const chat = CC.chat; if(!chat) return;
    if(silent && $("#ccCard").contains(document.activeElement) && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName)) return;   // не мешаем вводу
    const r = await api("/api/clients?chat=" + encodeURIComponent(chat));
    if(chat !== CC.chat) return;
    CC.card = r.card;
    renderCard();
  }
  function renderCard(){
    const c = CC.card; if(!c) return;
    const name = c.profile.name || c.tgName || "Без имени";
    const phone = c.profile.phone || c.phone.number;
    const hello = `Здравствуйте${name && name !== "Без имени" ? ", " + name : ""}! Это Apex Auto (Федор). `;
    const wa = digits(phone) ? `https://api.whatsapp.com/send?phone=${digits(phone)}&text=${encodeURIComponent(hello)}` : "";
    const seen = c.seen.online ? `<span class="ccPillV1 on">онлайн${c.seen.title ? " · " + e(c.seen.title) : ""}</span>` : `<span class="ccPillV1">был ${ago(c.seen.at)}</span>`;
    const sec = (title, body, count) => body ? `<section class="ccSecV1"><h3>${title}${count != null ? ` <em>${count}</em>` : ""}</h3>${body}</section>` : "";
    const lotRow = (id, d, right) => `<a class="ccLotV1" href="${lotUrl(id)}" target="_blank" rel="noopener"><span class="ccThumbV1">${thumb(d)}</span><span class="ccLotTxtV1"><b>${e(titleOf(d) || id)}</b><small>${e(id)}${d && d.year ? "" : ""}${right ? " · " + right : ""}</small></span></a>`;

    const views = c.views.length ? c.views.slice(0, 30).map(v => lotRow(v.key, v.data, `${v.n > 1 ? `<b class="ccHotV1">${times(v.n)}</b> · ` : ""}${ago(v.last)}`)).join("") : "";
    const searches = c.searches.map(sr => `<a class="ccSrV1" href="/auctions?${e(sr.data.qs || "")}" target="_blank" rel="noopener"><b>${e(sr.data.label || sr.key)}</b><small>${sr.n > 1 ? times(sr.n) + " · " : ""}${ago(sr.last)}</small></a>`).join("");
    const favs = c.favs.map(f => lotRow(f.id, f, [money(f.currentBid), f.note ? "✎ " + e(f.note) : ""].filter(Boolean).join(" · "))).join("");
    const picks = c.picks.map(p => {
      const rx = p.reaction ? REACT[p.reaction] : null;
      return `<div class="ccPickV1">${lotRow(p.lot_id, p.data, ago(Date.parse(p.created_at)) + (p.seen_at ? " · просмотрено" : " · не открыто"))}
        <div class="ccPickMetaV1">${rx ? `<span class="ccRx ${rx[2]}">${rx[0]} ${rx[1]}${p.reaction_note ? ": «" + e(p.reaction_note) + "»" : ""}</span>` : `<span class="ccRx">без ответа</span>`}
        <button type="button" class="ghost ccMiniV1" data-cc-unpick="${p.id}">Убрать</button></div></div>`;
    }).join("");
    const subs = c.subs.map(s => `<div class="ccSrV1"><b>${s.kind === "lot" ? "🔔 Лот" : "🔎 Поиск"}: ${e(s.name)}</b>${s.kind === "lot" ? `<small><a href="${lotUrl(s.lot_id)}" target="_blank" rel="noopener">${e(s.lot_id)}</a></small>` : ""}</div>`).join("");
    const dealsHtml = c.deals.map(d => `<div class="ccSrV1"><b>${e(d.title)}</b><small>${e(STAGE_RU[d.stage] || d.stage)}${d.eta_date ? " · выдача " + e(d.eta_date) : ""}${d.active === false ? " · скрыта" : ""}</small></div>`).join("");
    const leads = c.leads.map(l => `<div class="ccSrV1"><b>${e(l.title || l.message || "Заявка")}</b><small>${e(l.status || "")}${l.source ? " · " + e(l.source) : ""} · ${fmtWhen(l.created_at)}</small></div>`).join("");
    const cars = c.cars.map(x => `<div class="ccSrV1"><b>${e(x.label || x.vin)}</b><small>${e(x.vin)} · <a href="/tracking?vin=${e(x.vin)}" target="_blank" rel="noopener">отследить</a></small></div>`).join("");
    const tl = c.timeline.map(t => `<div class="ccTlV1"><i></i><span>${dt(t.at)}</span><b>${t.kind === "search" ? "🔎 " + e(t.data.label || t.key) : "👁 " + e(titleOf(t.data) || t.key)}</b></div>`).join("");

    const draft = $("#ccSayText") ? $("#ccSayText").value : "";
    $("#ccCard").innerHTML = `
      <button type="button" class="ghost ccBackV1" data-cc-back>← К списку клиентов</button>
      <header class="ccHeadV1">
        <div><h2>${e(name)}</h2>
          <p>${e([c.profile.city, phone].filter(Boolean).join(" · ") || "контакты не указаны")}${c.phone.verified ? ` <em class="ccVerV1" title="Номер подтверждён в Telegram">✓ подтверждён</em>` : ""}</p>
          <div class="ccPillsV1">${seen}<span class="ccPillV1">язык: ${e(c.lang)}</span>${c.boundAt ? `<span class="ccPillV1">в кабинете с ${e(String(c.boundAt).slice(0, 10))}</span>` : ""}</div></div>
        <div class="ccActsV1">${phone ? `<a class="ccBtnV1" href="tel:${e(phone.replace(/[^\d+]/g, ""))}">Позвонить</a>` : ""}${wa ? `<a class="ccBtnV1 isWa" href="${e(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ""}</div>
      </header>
      ${!c.eventsReady ? `<p class="ccWarnV1">${c.eventsNoTable ? "Журнал просмотров и подборки ещё не включены: выполните SQL из supabase/migrations/20261126_cab_clients.sql в Supabase → SQL Editor." : "Журнал просмотров временно недоступен."}</p>` : ""}

      <section class="ccSecV1 ccChatV1"><h3>💬 Переписка <small>(клиент видит ответы в своём Telegram)</small></h3>
        <div id="ccThread" class="ccThreadV1"><p class="ccEmptyV1">Загрузка…</p></div>
        <div class="ccSayV1"><textarea id="ccSayText" rows="2" maxlength="3500" placeholder="Ответ клиенту… (Ctrl+Enter — отправить)"></textarea><button type="button" data-cc-say>Отправить</button></div>
        <p class="ccMsgV1" id="ccSayMsg"></p>
      </section>

      <section class="ccSecV1 ccPickFormV1"><h3>🎯 Подборка клиенту</h3>
        <textarea id="ccPickIds" rows="2" placeholder="Ссылки с сайта или номера лотов: copart-61420506, iaai-45839097 — по одному в строке"></textarea>
        <textarea id="ccPickNote" rows="2" maxlength="600" placeholder="Комментарий клиенту (необязательно): подходит по бюджету, ставка до 9 000 $"></textarea>
        <div class="ccRowBtnsV1"><button type="button" data-cc-sendpick>Отправить в кабинет</button><button type="button" class="ghost" data-cc-suggest>Подобрать похожее на просмотренное</button></div>
        <p class="ccMsgV1" id="ccPickMsg"></p>
        <div id="ccSuggestBox">${suggestHtml()}</div>
      </section>

      <section class="ccSecV1"><h3>📝 Заметка менеджера <small>(клиент не видит)</small></h3>
        <textarea id="ccNoteText" rows="3" placeholder="Бюджет, пожелания, договорённости…">${e(c.manager.text)}</textarea>
        <input id="ccNoteTags" class="ccTagsV1" placeholder="Теги через запятую: горячий, Tesla, до 10к" value="${e(c.manager.tags.join(", "))}">
        <div class="ccRowBtnsV1"><button type="button" class="ghost" data-cc-savenote>Сохранить заметку</button><span class="ccMsgV1" id="ccNoteMsg"></span></div>
      </section>

      ${sec("Отправленные подборки", picks, c.picks.length)}
      ${sec("Что смотрел", views, c.views.length)}
      ${sec("Что ищет", searches, c.searches.length)}
      ${sec("Избранное", favs, c.favs.length)}
      ${sec("Подписки на уведомления", subs, c.subs.length)}
      ${sec("Сделки", dealsHtml, c.deals.length)}
      ${sec("Заявки с сайта", leads, c.leads.length)}
      ${sec("Мои машины (трекинг)", cars, c.cars.length)}
      ${sec("Последние действия", tl, null)}
      ${!(views || searches || favs) ? `<p class="ccEmptyV1">Клиент пока ничего не смотрел и не сохранял.</p>` : ""}`;
    if(draft) $("#ccSayText").value = draft;
    loadThread(false);
  }
  // ---------- переписка ----------
  const fmtMsgTime = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString("ru-RU", {day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"}); };
  function renderThread(msgs, noTable){
    const box = $("#ccThread"); if(!box) return;
    if(noTable){ box.innerHTML = `<p class="ccWarnV1">Переписка ещё не включена: выполните SQL из supabase/migrations/20261127_cab_msgs.sql в Supabase → SQL Editor.</p>`; return; }
    const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = msgs.length ? msgs.map(m => `<div class="ccMsgRowV1 ${m.dir === "in" ? "isIn" : "isOut"}"><div class="ccBubbleV1">${e(m.text).replace(/\n/g, "<br>")}<small>${fmtMsgTime(m.at)}${m.dir === "in" && !m.seen ? " · новое" : ""}</small></div></div>`).join("")
      : `<p class="ccEmptyV1">Пока ничего не писали. Когда клиент напишет боту, сообщение появится здесь, а вам придёт уведомление в Telegram.</p>`;
    if(near || !box.dataset.once){ box.scrollTop = box.scrollHeight; box.dataset.once = "1"; }
  }
  async function loadThread(poll){
    const chat = CC.chat; if(!chat || !$("#ccThread")) return;
    try{
      const r = await api("/api/clients?chat=" + encodeURIComponent(chat) + "&thread=1&seen=1" + (poll ? "&poll=1" : ""));
      if(chat !== CC.chat) return;
      renderThread(r.msgs || [], r.noTable);
    }catch(_){ /* следующая попытка через 10 с */ }
  }
  setInterval(() => { if(state.view === "cabclients" && CC.chat && !document.hidden) loadThread(true); }, 10000);
  async function sendSay(){
    const ta = $("#ccSayText"), msg = $("#ccSayMsg");
    const text = ta.value.trim(); if(!text) return;
    msg.className = "ccMsgV1"; msg.textContent = "Отправляю…";
    try{
      const r = await post({action: "say", text});
      ta.value = "";
      msg.className = "ccMsgV1 ok"; msg.textContent = r.logged === false ? "Отправлено в Telegram (но в историю не записалось — выполните SQL из 20261127_cab_msgs.sql)" : "Отправлено ✓";
      await loadThread(false);
    }catch(error){ msg.className = "ccMsgV1 err"; msg.textContent = error.message; }
  }

  function suggestHtml(){
    const s = CC.suggest;
    if(!s) return "";
    if(s.loading) return `<p class="ccMsgV1">Подбираю…</p>`;
    if(!s.items.length) return `<p class="ccMsgV1">Нечего предложить: у клиента мало просмотров или подходящих лотов сейчас нет.</p>`;
    return `<div class="ccSugHeadV1">По интересам: ${s.profile.map(p => e((p.make + " " + p.model).trim() + (p.yearFrom ? ` ${p.yearFrom}–${p.yearTo}` : ""))).join(" · ")}</div>
      <div class="ccSugGridV1">${s.items.map(x => { const l = x.lot, on = CC.picked.has(l.id); return `<div class="ccSugV1${on ? " is-on" : ""}" data-cc-sel="${e(l.id)}"><span class="ccThumbV1">${thumb(l)}</span><span class="ccLotTxtV1"><b>${e(titleOf(l))}</b><small>${[money(l.currentBid), l.auctionDate ? dt(Date.parse(l.auctionDate)) : "", l.odometerText].filter(Boolean).map(e).join(" · ")}</small></span><i>${on ? "✓" : "+"}</i></div>`; }).join("")}</div>
      <div class="ccRowBtnsV1"><button type="button" data-cc-sendsel ${CC.picked.size ? "" : "disabled"}>Отправить выбранные (${CC.picked.size})</button></div>`;
  }

  // ---------- действия ----------
  async function post(body){ return api("/api/clients", {method: "POST", body: Object.assign({chat: CC.chat}, body)}); }
  async function sendPick(ids, text){
    const msg = $("#ccPickMsg"); msg.className = "ccMsgV1"; msg.textContent = "Отправляю…";
    try{
      const r = await post({action: "pick", ids, text, note: $("#ccPickNote").value});
      msg.className = "ccMsgV1 ok";
      msg.textContent = `Добавлено: ${r.added}${r.missing && r.missing.length ? ` (не нашёл: ${r.missing.join(", ")})` : ""}. ${r.notified ? "Клиенту ушло сообщение в Telegram." : "Сообщение в Telegram не доставлено — клиент увидит подборку в кабинете."}`;
      $("#ccPickIds").value = ""; $("#ccPickNote").value = ""; CC.picked = new Set(); CC.suggest = null;
      await refreshCard(false);
      $("#ccPickMsg").className = "ccMsgV1 ok"; $("#ccPickMsg").textContent = msg.textContent;
      loadCabClients(true);
    }catch(error){ msg.className = "ccMsgV1 err"; msg.textContent = error.message; }
  }
  async function loadSuggest(){
    CC.suggest = {loading: true, items: [], profile: []};
    $("#ccSuggestBox").innerHTML = suggestHtml();
    try{
      const r = await api("/api/clients?chat=" + encodeURIComponent(CC.chat) + "&suggest=1");
      CC.suggest = {items: r.items || [], profile: r.profile || []};
    }catch(error){ CC.suggest = {items: [], profile: []}; showNotice(error.message); }
    $("#ccSuggestBox").innerHTML = suggestHtml();
  }

  document.addEventListener("click", ev => {
    const t = ev.target;
    const open = t.closest("[data-cc-open]");
    if(open){ openClient(open.dataset.ccOpen); return; }
    if(t.closest("[data-cc-back]")){ $("#ccSplitV1").classList.remove("ccOpenV1"); CC.chat = ""; renderList(); return; }
    if(t.closest("[data-cc-sendpick]")){
      const text = $("#ccPickIds").value;
      if(!text.trim()){ $("#ccPickMsg").className = "ccMsgV1 err"; $("#ccPickMsg").textContent = "Вставьте ссылку на лот или номер вида copart-61420506"; return; }
      sendPick([], text); return;
    }
    if(t.closest("[data-cc-say]")){ sendSay(); return; }
    if(t.closest("[data-cc-tgmenu]")){
      const m = $("#ccTgMenuMsg"); m.textContent = "Подключаю…";
      api("/api/clients", {method: "POST", body: {action: "tgmenu"}})
        .then(r => { m.textContent = "Готово ✓ В боте появилась кнопка «Кабинет»" + (r.commands ? " и список команд" : ""); })
        .catch(error => { m.textContent = "Не получилось: " + error.message; });
      return;
    }
    if(t.closest("[data-cc-suggest]")){ loadSuggest(); return; }
    const sel = t.closest("[data-cc-sel]");
    if(sel){
      const id = sel.dataset.ccSel;
      if(CC.picked.has(id)) CC.picked.delete(id); else CC.picked.add(id);
      $("#ccSuggestBox").innerHTML = suggestHtml(); return;
    }
    if(t.closest("[data-cc-sendsel]")){ if(CC.picked.size) sendPick(Array.from(CC.picked), ""); return; }
    const un = t.closest("[data-cc-unpick]");
    if(un){
      if(!confirm("Убрать лот из кабинета клиента?")) return;
      post({action: "unpick", id: Number(un.dataset.ccUnpick)}).then(() => refreshCard(false)).then(() => loadCabClients(true)).catch(error => showNotice(error.message));
      return;
    }
    if(t.closest("[data-cc-savenote]")){
      const tags = $("#ccNoteTags").value.split(",").map(x => x.trim()).filter(Boolean);
      post({action: "note", text: $("#ccNoteText").value, tags}).then(() => { const m = $("#ccNoteMsg"); m.className = "ccMsgV1 ok"; m.textContent = "Сохранено ✓"; }).catch(error => showNotice(error.message));
    }
  });
  document.addEventListener("input", ev => { if(ev.target && ev.target.id === "ccSearch") renderList(); });
  document.addEventListener("keydown", ev => { if(ev.target && ev.target.id === "ccSayText" && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)){ ev.preventDefault(); sendSay(); } });
  document.addEventListener("change", ev => {
    const c = ev.target.closest && ev.target.closest("[data-cc-pref]"); if(!c) return;
    const prefs = {}; $$("[data-cc-pref]").forEach(x => { prefs[x.dataset.ccPref] = x.checked; });
    api("/api/clients", {method: "POST", body: Object.assign({action: "prefs"}, prefs)}).then(() => showNotice("Сохранено", true)).catch(error => showNotice(error.message));
  });

  window.loadCabClients = loadCabClients;
  // Ссылка из Telegram-уведомления: /admin/#client=<chat>
  window.cabDeepLink = function(){
    const m = String(location.hash || "").match(/client=(-?\d+)/);
    if(!m) return;
    const btn = document.querySelector('.tabs button[data-view="cabclients"]');
    if(btn) btn.click();
    setTimeout(() => openClient(m[1]), 400);
  };
})();
