const state = {
  view:"dashboard",
  vehicles:[],
  customers:[],
  leads:[],
  content:null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));

function showNotice(message, good = false){
  const notice = $("#notice");
  notice.textContent = message;
  notice.hidden = false;
  notice.style.borderColor = good ? "rgba(25,164,99,.35)" : "rgba(237,0,18,.28)";
  notice.style.background = good ? "rgba(25,164,99,.10)" : "rgba(237,0,18,.08)";
  notice.style.color = good ? "#0d6841" : "#8a0010";
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => notice.hidden = true, 4200);
}

async function api(path, options = {}){
  const response = await fetch(path, {
    credentials:"same-origin",
    headers: options.body instanceof Blob || options.body instanceof File || options.raw
      ? options.headers || {}
      : {"content-type":"application/json", ...(options.headers || {})},
    ...options,
    body: options.body && !(options.body instanceof Blob) && !(options.body instanceof File) && !options.raw
      ? JSON.stringify(options.body)
      : options.body
  });
  const payload = await response.json().catch(() => ({}));
  if(!response.ok || payload.ok === false){
    throw new Error(payload.error || "Ошибка запроса");
  }
  return payload;
}

function formData(form){
  const data = Object.fromEntries(new FormData(form).entries());
  for(const [key, value] of Object.entries(data)){
    if(value === "") data[key] = null;
  }
  return data;
}

function setForm(form, item = {}){
  for(const element of Array.from(form.elements)){
    if(!element.name) continue;
    if(element.name === "photos" && Array.isArray(item.photos)){
      element.value = item.photos.join("\n");
    }else if(element.name === "benefits" && Array.isArray(item.benefits)){
      element.value = item.benefits.join("\n");
    }else if(element.type === "datetime-local" && item[element.name]){
      element.value = String(item[element.name]).slice(0, 16);
    }else{
      element.value = item[element.name] ?? "";
    }
  }
}

// ── Фото автомобиля: превью со списком URL (textarea name=photos — источник правды).
// Первое фото = обложка объявления. Кнопки: ★ сделать обложкой, ←/→ порядок, × убрать.
function vehiclePhotoList(){
  const ta = document.querySelector('#vehicleForm [name="photos"]');
  return ta ? String(ta.value || "").split(/\n+/).map(x => x.trim()).filter(Boolean) : [];
}
function setVehiclePhotoList(list){
  const ta = document.querySelector('#vehicleForm [name="photos"]');
  if(ta){ ta.value = list.join("\n"); renderVehiclePhotoThumbs(); }
}
function renderVehiclePhotoThumbs(){
  const box = document.getElementById("vehiclePhotoThumbs");
  if(!box) return;
  const list = vehiclePhotoList();
  box.innerHTML = list.map((url, i) => `
    <figure class="photoThumbV1${i === 0 ? " isCoverV1" : ""}">
      <img src="${escapeHtml(url)}" alt="" loading="lazy">
      ${i === 0 ? '<figcaption>Обложка</figcaption>' : ""}
      <div class="photoThumbBtnsV1">
        ${i > 0 ? `<button type="button" data-photo-act="cover" data-photo-i="${i}" title="Сделать обложкой">★</button><button type="button" data-photo-act="left" data-photo-i="${i}" title="Левее">←</button>` : ""}
        ${i < list.length - 1 ? `<button type="button" data-photo-act="right" data-photo-i="${i}" title="Правее">→</button>` : ""}
        <button type="button" class="danger" data-photo-act="del" data-photo-i="${i}" title="Убрать фото">×</button>
      </div>
    </figure>`).join("");
}
function bindVehiclePhotoThumbs(){
  const box = document.getElementById("vehiclePhotoThumbs");
  const ta = document.querySelector('#vehicleForm [name="photos"]');
  if(!box || !ta) return;
  ta.addEventListener("input", renderVehiclePhotoThumbs);
  box.addEventListener("click", event => {
    const btn = event.target.closest("[data-photo-act]");
    if(!btn) return;
    const i = Number(btn.dataset.photoI), list = vehiclePhotoList(), act = btn.dataset.photoAct;
    if(act === "del") list.splice(i, 1);
    else if(act === "cover") list.unshift(list.splice(i, 1)[0]);
    else if(act === "left" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if(act === "right" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    setVehiclePhotoList(list);
  });
}

function resetForm(id){
  const form = document.getElementById(id);
  form.reset();
  if(id === "vehicleForm") setTimeout(renderVehiclePhotoThumbs, 0);
  if(id === "leadForm") updateLeadCustomerContact();
  form.querySelector('[name="id"]').value = "";
  const title = document.getElementById(`${id.replace("Form", "FormTitle")}`);
  if(title){
    title.textContent = id === "vehicleForm" ? "Новый автомобиль" : id === "customerForm" ? "Новый клиент" : "Новая заявка";
  }
}

function formatMoney(value){
  const number = Number(value || 0);
  return number ? `$${number.toLocaleString("en-US")}` : "—";
}

function badge(status){
  const text = status || "Новый";
  // Чуть точнее, чем просто «хорошо/плохо»: отдельный цвет под каждый частый статус заявки/клиента/авто.
  const className = /купил|продан|рекомендуется/i.test(text) ? "good"
    : /закрыт|архив/i.test(text) ? "red"
    : /перезвонить/i.test(text) ? "gold"
    : /в работе|горячий/i.test(text) ? "accent"
    : /новый/i.test(text) ? "amber"
    : "";
  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

// «Когда» заявка/клиент создан — Федор 07.10.2026: «время когда оставил заявку».
function fmtWhen(iso){
  const t = Date.parse(iso || "");
  if(!Number.isFinite(t)) return "";
  const d = new Date(t);
  const diffMin = Math.round((Date.now() - t) / 60000);
  if(diffMin < 60) return diffMin <= 0 ? "только что" : `${diffMin} мин назад`;
  if(diffMin < 24 * 60) return `${Math.round(diffMin / 60)} ч назад`;
  return d.toLocaleString("ru-RU", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"});
}

function renderRows(container, items, type){
  const el = document.getElementById(container);
  if(!items.length){
    el.innerHTML = '<div class="rowItem"><div><h3>Пока пусто</h3><p>Данные появятся после создания записи.</p></div></div>';
    return;
  }

  el.innerHTML = items.map(item => {
    if(type === "vehicle"){
      return `<article class="rowItem">
        <div>
          <h3>${escapeHtml([item.year, item.make, item.model].filter(Boolean).join(" ") || "Автомобиль")}</h3>
          <p>VIN: ${escapeHtml(item.vin || "—")} · LOT: ${escapeHtml(item.lot || "—")} · ${formatMoney(item.price)} · ${badge(item.status)}</p>
        </div>
        <div class="rowActions">
          <button data-edit-vehicle="${item.id}">Изм.</button>
          <button class="danger" data-delete-vehicle="${item.id}">Удалить</button>
        </div>
      </article>`;
    }
    if(type === "customer"){
      return `<article class="rowItem">
        <div>
          <h3>${escapeHtml(item.name || "Клиент")}</h3>
          <p>${escapeHtml(item.phone || "—")} · ${escapeHtml(item.telegram || "—")} · ${badge(item.status)}</p>
          <p>${escapeHtml(item.source || "—")} · ${escapeHtml(fmtWhen(item.created_at) || "—")}</p>
        </div>
        <div class="rowActions">
          <button data-edit-customer="${item.id}">Изм.</button>
          <button class="danger" data-delete-customer="${item.id}">Удалить</button>
        </div>
      </article>`;
    }
    return `<article class="rowItem">
      <div>
        <h3>${escapeHtml(item.title || item.message || "Заявка")}</h3>
        <p>${escapeHtml(item.customers?.name || "Без клиента")} · ${escapeHtml(item.vehicles ? [item.vehicles.year,item.vehicles.make,item.vehicles.model].filter(Boolean).join(" ") : "Без авто")} · ${badge(item.status)}</p>
        <p>${escapeHtml(item.source || "—")} · ${escapeHtml(fmtWhen(item.created_at) || "—")}</p>
      </div>
      <div class="rowActions">
        <button data-edit-lead="${item.id}">Изм.</button>
        <button class="danger" data-delete-lead="${item.id}">Удалить</button>
      </div>
    </article>`;
  }).join("");
}

function fillLeadSelects(){
  const customerSelect = $("#leadCustomerSelect");
  const vehicleSelect = $("#leadVehicleSelect");
  customerSelect.innerHTML = '<option value="">Без клиента</option>' + state.customers
    .map(item => `<option value="${item.id}">${escapeHtml([item.name, item.phone].filter(Boolean).join(" · ") || item.id)}</option>`)
    .join("");
  vehicleSelect.innerHTML = '<option value="">Без автомобиля</option>' + state.vehicles
    .map(item => `<option value="${item.id}">${escapeHtml([item.year,item.make,item.model,item.lot].filter(Boolean).join(" · "))}</option>`)
    .join("");
  updateLeadCustomerContact();
}

// Телефон клиента в заявке виден только внутри названия в выпадающем списке —
// Федор: «в CRM у нас нет номера телефона клиента» (искал его рядом с полем «Клиент»).
// Кликабельная строка tel:/Telegram под селектом, обновляется при выборе и при открытии заявки на редактирование.
function updateLeadCustomerContact(){
  const box = $("#leadCustomerContact");
  if(!box) return;
  const id = $("#leadCustomerSelect")?.value;
  const item = id ? state.customers.find(row => String(row.id) === String(id)) : null;
  if(!item || (!item.phone && !item.telegram)){ box.innerHTML = ""; return; }
  const parts = [];
  if(item.phone) parts.push(`<a href="tel:${escapeHtml(item.phone)}">${escapeHtml(item.phone)}</a>`);
  if(item.telegram) parts.push(`<a href="https://t.me/${escapeHtml(String(item.telegram).replace(/^@/, ""))}" target="_blank" rel="noopener">${escapeHtml(item.telegram)}</a>`);
  box.innerHTML = parts.join(" · ");
}

async function loadDashboard(){
  const data = await api("/api/admin?action=dashboard");
  $("#statCustomers").textContent = data.stats.customers;
  $("#statLeads").textContent = data.stats.leads;
  $("#statVehicles").textContent = data.stats.vehicles;
  renderRows("latestLeads", data.latestLeads || [], "lead");
}

async function loadVehicles(){
  const q = $("#vehicleSearch")?.value || "";
  const data = await api(`/api/vehicles?limit=80${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  state.vehicles = data.items || [];
  renderRows("vehiclesList", state.vehicles, "vehicle");
  fillLeadSelects();
}

async function loadCustomers(){
  const q = $("#customerSearch")?.value || "";
  const status = $("#customerStatusFilter")?.value || "";
  const data = await api(`/api/customers?limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`);
  state.customers = data.items || [];
  renderRows("customersList", state.customers, "customer");
  fillLeadSelects();
}

async function loadLeads(){
  const status = $("#leadStatusFilter")?.value || "";
  const data = await api(`/api/leads?limit=100${status ? `&status=${encodeURIComponent(status)}` : ""}`);
  state.leads = data.items || [];
  renderRows("leadsList", state.leads, "lead");
}

// Мини-KPI над списком заявок — отдельный запрос БЕЗ фильтра статуса (иначе, например,
// при выбранном фильтре «Закрыт» карточка «Новых сегодня» всегда показывала бы 0).
async function loadLeadsKpi(){
  const box = $("#leadsKpiV1");
  if(!box) return;
  try{
    const data = await api("/api/leads?limit=200");
    const items = data.items || [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const newToday = items.filter(x => String(x.created_at || "").slice(0, 10) === todayStr).length;
    const inWork = items.filter(x => /в работе/i.test(x.status || "")).length;
    const waiting = items.filter(x => /перезвонить/i.test(x.status || "")).length;
    const bought = items.filter(x => /купил/i.test(x.status || "")).length;
    const conversion = items.length ? Math.round((bought / items.length) * 100) : 0;
    box.innerHTML = [
      ["Новых сегодня", newToday],
      ["В работе", inWork],
      ["Ждут звонка", waiting],
      ["Конверсия в покупку", `${conversion}%`]
    ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><b>${escapeHtml(String(value))}</b></article>`).join("");
  }catch(e){ box.innerHTML = ""; }
}

// Уведомления о новых заявках в Telegram (Федор 07.10.2026) — переиспользует бот уведомлений
// о лотах/поисках (ALERTS_BOT_TOKEN, server/alerts.js): action=alertadminbind выдаёт одноразовую
// t.me-ссылку, после «Start» в Telegram alertadminstatus подтверждает привязку chat_id.
function renderLeadTgBind(bound){
  const box = $("#leadTgBindV1");
  if(!box) return;
  box.innerHTML = bound
    ? `<span class="tgBindOkV1">✅ Telegram-уведомления о заявках подключены</span>`
    : `<span class="tgBindOffV1">🔔 Уведомления о новых заявках не подключены</span><button type="button" id="leadTgBindBtnV1">Подключить Telegram</button>`;
}
async function loadLeadTgBind(){
  const box = $("#leadTgBindV1");
  if(!box) return;
  box.innerHTML = `<span class="muted">Проверяем Telegram-уведомления…</span>`;
  try{
    const st = await api("/api/auctions?action=alertadminstatus");
    renderLeadTgBind(!!st.bound);
  }catch(e){ box.innerHTML = ""; }
}

async function loadContent(){
  const data = await api("/api/content");
  state.content = data.content || {};
  setForm($("#contentForm"), {
    ...state.content,
    benefits:Array.isArray(state.content.benefits) ? state.content.benefits : []
  });
}

async function refresh(){
  if(state.view === "dashboard") await loadDashboard();
  if(state.view === "vehicles") await loadVehicles();
  if(state.view === "guide") await loadGuide();
  if(state.view === "analytics") await loadAnalytics();
  if(state.view === "customers") await loadCustomers();
  if(state.view === "leads"){
    await Promise.all([loadCustomers(), loadVehicles()]);
    await loadLeads();
    loadLeadTgBind();
    loadLeadsKpi();
  }
  if(state.view === "content") await loadContent();
}

// Фото с телефона весят 3–8 МБ, а тело запроса к функции Vercel ограничено ~4.5 МБ.
// Перед отправкой ужимаем до 1920px по длинной стороне в JPEG — и грузится быстро,
// и сайт не тянет оригиналы. Не получилось (старый браузер) — шлём файл как есть.
async function shrinkImage(file){
  try{
    if(!/^image\//.test(file.type || "") && !/\.(jpe?g|png|webp|heic)$/i.test(file.name || "")) return file;
    const bmp = await createImageBitmap(file);
    const MAX = 1920;
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    if(k === 1 && file.size < 900 * 1024 && /jpeg|webp/.test(file.type)) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.86));
    return blob || file;
  }catch(e){ return file; }
}

async function uploadFiles(input, folder){
  const urls = [];
  const files = Array.from(input.files || []);
  for(let i = 0; i < files.length; i++){
    showNotice(`Загружаю фото ${i + 1} из ${files.length}…`, true);
    const file = await shrinkImage(files[i]);
    const data = await api("/api/uploads", {
      method:"POST",
      body:file,
      raw:true,
      headers:{
        "content-type":file.type || "image/jpeg",
        "x-apex-folder":folder
      }
    });
    urls.push(data.url);
  }
  input.value = "";
  return urls;
}

function bindTabs(){
  $$(".tabs button").forEach(button => {
    button.addEventListener("click", async () => {
      $$(".tabs button").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      state.view = button.dataset.view;
      $$(".view").forEach(view => view.classList.remove("active"));
      document.getElementById(`${state.view}View`).classList.add("active");
      $("#viewTitle").textContent = (button.querySelector(".navLabelV1") || button).textContent.trim();
      clearTimeout(analyticsTimer);
      await refresh().catch(error => showNotice(error.message));
    });
  });
}


// ── Аналитика: онлайн сейчас, посещаемость, популярные страницы, статистика уведомлений ──
let analyticsDays = 7, analyticsTimer = null;
const EV_NAMES = {fav_add:"Добавили в избранное", save_search:"Сохранили поиск", alert_search:"Нажали «Уведомлять о новых»", alert_lot:"Нажали «Следить за лотом»", alert_connected:"Подключили Telegram", lead_open:"Открыли форму заявки", calc_use:"Пользовались калькулятором"};
const DEV_NAMES = {m:"Телефон", d:"Компьютер", t:"Планшет", "?":"Не определено"};
const num = n => Number(n || 0).toLocaleString("ru-RU");
function anTable(rows, cols){
  if(!rows || !rows.length) return `<p class="muted">Пока нет данных</p>`;
  return `<table class="anTableV1"><tbody>${rows.map(r => `<tr>${cols.map((c, i) => `<td class="${i ? "num" : ""}">${c(r)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
function anBars(series, days){
  if(!series.length) return `<p class="muted">Пока нет данных</p>`;
  const map = new Map(series.map(x => [String(x.day).slice(0, 10), x]));
  const list = [];
  for(let i = days - 1; i >= 0; i--){
    const d = new Date(Date.now() - i * 864e5);
    const key = new Intl.DateTimeFormat("en-CA", {timeZone:"Europe/Chisinau"}).format(d);
    list.push({key, ...(map.get(key) || {visitors:0, views:0})});
  }
  const max = Math.max(1, ...list.map(x => x.views));
  return `<div class="anBarsV1">${list.map(x => `<div class="anBarV1" title="${x.key}: ${num(x.visitors)} посетителей, ${num(x.views)} просмотров"><div class="anBarColV1"><i style="height:${Math.round(x.views / max * 100)}%"><b style="height:${x.views ? Math.round(x.visitors / x.views * 100) : 0}%"></b></i></div><span>${x.key.slice(8)}.${x.key.slice(5, 7)}</span></div>`).join("")}</div>
  <p class="muted anLegendV1"><i class="l1"></i> просмотры <i class="l2"></i> посетители</p>`;
}
function renderAnalytics(s){
  const A = s.alerts || {};
  const conv = A.links ? Math.round(A.bound / A.links * 100) : 0;
  const per = s.period || {visitors:0, views:0};
  const perV = per.visitors ? (per.views / per.visitors).toFixed(1) : "0";
  const evRows = (s.events || []).map(e => ({name:EV_NAMES[e.ev] || e.ev, n:e.n, v:e.visitors}));
  const lotLink = p => `<a href="${escapeHtml(p)}" target="_blank" rel="noopener">${escapeHtml(p.replace("/auctions/", ""))}</a>`;
  return `
  <div class="anGridV1">
    <article class="anLive"><span>Сейчас на сайте</span><b>${num(s.online)}</b><small>${(s.online_pages || []).map(p => `${escapeHtml(p.path)} · ${p.n}`).join("<br>") || "никого"}</small></article>
    <article><span>Сегодня</span><b>${num(s.today && s.today.visitors)}</b><small>посетителей · ${num(s.today && s.today.views)} просмотров</small></article>
    <article><span>За период</span><b>${num(per.visitors)}</b><small>визитов (сумма по дням) · ${num(per.views)} просмотров</small></article>
    <article><span>Глубина</span><b>${perV}</b><small>страниц за визит</small></article>
  </div>
  <div class="panel"><div class="panelHead"><h2>Посещаемость по дням</h2></div>${anBars(s.series || [], analyticsDays)}</div>
  <div class="anTwoV1">
    <div class="panel"><div class="panelHead"><h2>Популярные страницы</h2></div>${anTable(s.top_pages, [r => escapeHtml(r.page), r => num(r.views)])}</div>
    <div class="panel"><div class="panelHead"><h2>Чаще всего смотрят лоты</h2></div>${anTable(s.top_lots, [r => lotLink(r.page), r => num(r.views)])}</div>
    <div class="panel"><div class="panelHead"><h2>Откуда приходят</h2></div>${anTable(s.refs, [r => escapeHtml(r.ref), r => num(r.visitors)])}</div>
    <div class="panel"><div class="panelHead"><h2>Страны и устройства</h2></div>${anTable(s.countries, [r => escapeHtml(r.c), r => num(r.visitors)])}<div class="anSepV1"></div>${anTable(s.devices, [r => escapeHtml(DEV_NAMES[r.d] || r.d), r => num(r.visitors)])}</div>
  </div>
  <div class="panel">
    <div class="panelHead"><h2>Уведомления в Telegram</h2></div>
    <div class="anGridV1">
      <article><span>Нажали «Уведомлять»</span><b>${num(A.links)}</b><small>${num(A.links_period)} за период</small></article>
      <article><span>Подключили Telegram</span><b>${num(A.bound)}</b><small>${conv}% дошли до Start · ${num(A.bound_period)} за период</small></article>
      <article><span>Подписок на поиск</span><b>${num(A.search_subs)}</b><small>активных сейчас</small></article>
      <article><span>Подписок на лот</span><b>${num(A.lot_subs)}</b><small>активных сейчас</small></article>
    </div>
    <div class="anTwoV1">
      <div><h3 class="anH3V1">За лотами чаще всего следят</h3>${anTable(A.watched, [r => escapeHtml(r.lot), r => num(r.n)])}</div>
      <div><h3 class="anH3V1">Действия клиентов (за период)</h3>${anTable(evRows, [r => escapeHtml(r.name), r => `${num(r.n)} · ${num(r.v)} чел.`])}</div>
    </div>
  </div>`;
}
async function loadAnalytics(){
  const box = $("#analyticsBox");
  try{
    const data = await api(`/api/track?days=${analyticsDays}`);
    box.innerHTML = renderAnalytics(data.stats || {});
    $("#anUpdatedV1").textContent = "Обновлено " + new Date().toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
  }catch(error){
    box.innerHTML = `<div class="panel"><p>${escapeHtml(error.message)}</p></div>`;
  }
  clearTimeout(analyticsTimer);
  analyticsTimer = setTimeout(() => { if(state.view === "analytics") loadAnalytics(); }, 30000);
}
document.addEventListener("click", event => {
  const b = event.target.closest("#anPeriodV1 button");
  if(!b) return;
  analyticsDays = Number(b.dataset.days) || 7;
  $$("#anPeriodV1 button").forEach(x => x.classList.toggle("active", x === b));
  loadAnalytics();
});

// ── Оценка лотов: импорт закрытой таблицы из Google Sheets (вставка TSV) ──
// Строка «bmw g30 530e LCI 21-23 | плагин | … | K | база» → марка, ключевые слова, годы, топливо.
const GUIDE_MAKES2 = ["alfa romeo","land rover","aston martin"];
function parseGuideName(nameRaw, noteRaw){
  let name = String(nameRaw || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const note = String(noteRaw || "").toLowerCase();
  let make = GUIDE_MAKES2.find(m => name.startsWith(m + " ")) || name.split(" ")[0];
  let rest = name.slice(make.length).trim();
  let yf = null, yt = null;
  const yr = rest.match(/(?:^|\s)((?:20)?\d{2})\s*-\s*((?:20)?\d{2})?(?=\s|$)/) || rest.match(/(?:^|\s)(20\d{2}|\d{2})(?=\s*$)/);
  if(yr){
    const y = v => v ? (Number(v) < 100 ? 2000 + Number(v) : Number(v)) : null;
    yf = y(yr[1]); yt = yr[2] !== undefined ? y(yr[2]) : (/-\s*$/.test(yr[0]) || /-/.test(yr[0]) ? null : yf);
    rest = rest.replace(yr[0], " ").trim();
  }
  rest = rest.replace(/\bmodel\s+([3sxy])\b/g, "model$1").replace(/\bsanta\s+fe\b/g, "santafe").replace(/\bmach\s*-?\s*e\b/g, "mache")
    .replace(/\be-?tron\b/g, "etron").replace(/\bc-max\b/g, "cmax").replace(/\bcorasir\b/g, "corsair").replace(/\blci\b/g, " ");
  const tokens = rest.split(/[\s,]+/).map(t => t.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const hint = note + " " + name;
  let fuel = "any";
  if(/plug|плагин|phev/.test(hint)) fuel = "plugin";
  else if(/hybrid|гибрид/.test(hint)) fuel = "hybrid";
  else if(/electric|электр|etron|e-tron|lyriq|\bleaf\b|mach e|polestar|^tesla|bmw ix\b/.test(hint)) fuel = "electric";
  return {make, tokens, year_from:yf, year_to:yt, fuel};
}
function parseGuidePaste(text){
  const out = [];
  String(text || "").split(/\r?\n/).forEach(line => {
    const c = line.split("\t").map(x => x.trim());
    if(!c[0] || c.length < 3) return;
    const nums = c.map(x => Number(String(x).replace(/\s/g, "").replace(",", ".")));
    const base = nums[c.length - 1], k = nums[c.length - 2];
    if(!(base > 300) || !(k > 0.5 && k < 3)) return;        // шапка/пустая строка
    const p = parseGuideName(c[0], c[1]);
    if(!p.tokens.length) return;
    out.push({name:c[0], note:/^\d{5}(\.0)?$/.test(c[1] || "") ? "" : (c[1] || ""), ...p, base_price:Math.round(base), k:Math.round(k * 100) / 100});
  });
  return out;
}
let guideParsed = [];
let guideLoaded = [];   // последние строки, загруженные из базы (для «Править»/«Удалить»)
const GUIDE_FUEL_RU = {any:"любое", gas:"бензин", hybrid:"гибрид", plugin:"плагин", electric:"электро", diesel:"дизель"};
function renderGuideTable(items, saved){
  const box = document.getElementById("guideTable");
  if(!box) return;
  if(saved) guideLoaded = items;
  box.innerHTML = items.length ? `<table><thead><tr><th>Строка таблицы</th><th>Марка</th><th>Ключевые слова</th><th>Годы</th><th>Топливо</th><th>База, $</th><th>K</th><th>1.00 →</th>${saved ? "<th></th>" : ""}</tr></thead><tbody>${items.map(r => `
    <tr><td>${escapeHtml(r.name)}${r.note ? ` <i>${escapeHtml(r.note)}</i>` : ""}</td><td>${escapeHtml(r.make)}</td><td>${escapeHtml((r.tokens || []).join(" + "))}</td>
    <td>${r.year_from || "…"}–${r.year_to || "…"}</td><td>${GUIDE_FUEL_RU[r.fuel] || r.fuel}</td><td>${Number(r.base_price).toLocaleString("ru-RU")}</td><td>${r.k}</td><td>${Math.round(r.base_price * r.k).toLocaleString("ru-RU")}</td>${saved ? `<td><div class="rowActions"><button type="button" class="guideEditBtnV1" data-guide-id="${r.id}">Править</button><button type="button" class="guideDelBtnV1 danger" data-guide-id="${r.id}">Удалить</button></div></td>` : ""}</tr>`).join("")}</tbody></table>` : "";
  document.getElementById("guideInfo").textContent = items.length ? (saved ? `В базе: ${items.length} строк` : `Разобрано: ${items.length} строк — проверьте и нажмите «Заменить всю таблицу»`) : "";
}
async function loadGuide(){
  try{ const r = await api("/api/price-guide"); renderGuideTable(r.items || [], true); }
  catch(e){ document.getElementById("guideInfo").textContent = "Таблица ещё не создана в базе: выполните SQL 20260922_price_guide.sql. (" + e.message + ")"; }
}
function guideRowFormReset(){
  const f = document.getElementById("guideRowForm");
  if(!f) return;
  f.reset();
  document.getElementById("guideRowId").value = "";
  document.getElementById("guideRowK").value = "1.2";
  document.getElementById("guideRowInfo").textContent = "";
}
function bindGuideRowForm(){
  const form = document.getElementById("guideRowForm");
  if(!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const btn = document.getElementById("guideRowSaveBtn");
    const id = document.getElementById("guideRowId").value.trim();
    const body = {
      id: id || undefined,
      name: `${document.getElementById("guideRowMake").value.trim()} ${document.getElementById("guideRowTokens").value.trim()} ${document.getElementById("guideRowYearFrom").value || ""}-${document.getElementById("guideRowYearTo").value || ""}`.trim(),
      note: document.getElementById("guideRowNote").value.trim(),
      make: document.getElementById("guideRowMake").value.trim(),
      tokens: document.getElementById("guideRowTokens").value.trim(),
      year_from: document.getElementById("guideRowYearFrom").value || null,
      year_to: document.getElementById("guideRowYearTo").value || null,
      fuel: document.getElementById("guideRowFuel").value,
      base_price: Number(document.getElementById("guideRowBase").value),
      k: Number(document.getElementById("guideRowK").value)
    };
    btn.disabled = true;
    try{
      const r = await api("/api/price-guide", {method:"POST", body});
      showNotice(r.note || (r.mode === "updated" ? "Строка обновлена" : "Строка добавлена"), true);
      guideRowFormReset();
      await loadGuide();
    }catch(e){ alert("Не сохранилось: " + e.message); }
    btn.disabled = false;
  });
  document.getElementById("guideRowResetBtn").addEventListener("click", guideRowFormReset);
  document.getElementById("guideTable").addEventListener("click", async event => {
    const editBtn = event.target.closest(".guideEditBtnV1");
    const delBtn = event.target.closest(".guideDelBtnV1");
    if(editBtn){
      const row = guideLoaded.find(r => String(r.id) === editBtn.dataset.guideId);
      if(!row) return;
      document.getElementById("guideRowId").value = row.id;
      document.getElementById("guideRowMake").value = row.make || "";
      document.getElementById("guideRowTokens").value = (row.tokens || []).join(" ");
      document.getElementById("guideRowYearFrom").value = row.year_from || "";
      document.getElementById("guideRowYearTo").value = row.year_to || "";
      document.getElementById("guideRowFuel").value = row.fuel || "any";
      document.getElementById("guideRowNote").value = row.note || "";
      document.getElementById("guideRowBase").value = row.base_price;
      document.getElementById("guideRowK").value = row.k;
      document.getElementById("guideRowForm").scrollIntoView({behavior:"smooth", block:"center"});
    }else if(delBtn){
      const row = guideLoaded.find(r => String(r.id) === delBtn.dataset.guideId);
      if(!row || !confirm(`Удалить строку «${row.name}»? Остальные не затронет.`)) return;
      try{
        await api(`/api/price-guide?id=${encodeURIComponent(row.id)}`, {method:"DELETE"});
        showNotice("Строка удалена", true);
        await loadGuide();
      }catch(e){ alert("Не удалилось: " + e.message); }
    }
  });
}
function bindGuide(){
  bindGuideRowForm();
  const parseBtn = document.getElementById("guideParseBtn"), saveBtn = document.getElementById("guideSaveBtn");
  if(!parseBtn) return;
  parseBtn.addEventListener("click", () => {
    guideParsed = parseGuidePaste(document.getElementById("guidePaste").value);
    renderGuideTable(guideParsed, false);
    saveBtn.disabled = !guideParsed.length;
    if(!guideParsed.length) showNotice("Не нашёл строк: нужны столбцы A–I, последний — база, предпоследний — K");
  });
  saveBtn.addEventListener("click", async () => {
    if(!guideParsed.length || !confirm(`Заменить ВСЮ таблицу оценки на эти ${guideParsed.length} строк? Всё, что не попало в список, будет удалено.`)) return;
    saveBtn.disabled = true;
    try{
      const r = await api("/api/price-guide", {method:"PUT", body:{items:guideParsed}});
      showNotice(`Сохранено строк: ${r.saved}`, true);
      document.getElementById("guidePaste").value = ""; guideParsed = [];
      await loadGuide();
    }catch(e){ alert("Не сохранилось: " + e.message); saveBtn.disabled = false; }
  });
}

function bindForms(){
  bindGuide();
  bindVehiclePhotoThumbs();
  $("#leadCustomerSelect").addEventListener("change", updateLeadCustomerContact);
  $("#vehicleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formData(form);
    const btn = form.querySelector("button[type=submit]");
    if(btn){ btn.disabled = true; btn.textContent = "Сохраняю…"; }
    try{
    const photoUrls = await uploadFiles($("#vehiclePhotos"), "vehicles");
    const existing = String(data.photos || "").split(/\n+/).map(item => item.trim()).filter(Boolean);
    data.photos = [...existing, ...photoUrls];
    const id = data.id;
    delete data.id;
    const saveVehicle = body => api(id ? `/api/vehicles?id=${encodeURIComponent(id)}` : "/api/vehicles", {method:id ? "PATCH" : "POST", body});
    try{ await saveVehicle(data); }
    catch(e){
      // Новые поля объявления (оценка ремонта / дата / «цена включает») появятся в базе после
      // SQL-миграции 20260921. Пока её нет — сохраняем без них, а не роняем всё сохранение.
      if(!/column|schema|price_includes|repair_estimate|eta_date/i.test(String(e && e.message))) throw e;
      const rest = {...data}; delete rest.price_includes; delete rest.repair_estimate; delete rest.eta_date;
      await saveVehicle(rest);
      alert("Сохранено, но без полей «Оценка ремонта», «Ожидается в Кишинёве» и «Цена включает»: в базе ещё нет этих колонок. Выполните SQL из supabase/migrations/20260921_vehicles_offer_fields.sql.");
    }
    resetForm("vehicleForm");
    await loadVehicles();
    showNotice("Автомобиль сохранен", true);
    }catch(e){
      // Раньше ошибка сохранения молча терялась — форма «ничего не делала».
      const msg = String(e && e.message || e);
      showNotice("Не сохранилось: " + msg, false);
      alert("Не сохранилось: " + msg + (/column|schema/i.test(msg) ? "\n\nВ базе не хватает колонок — выполните SQL из supabase/migrations/20260920_vehicles_listing_fields.sql в Supabase → SQL Editor." : ""));
    }finally{
      if(btn){ btn.disabled = false; btn.textContent = "Сохранить"; }
    }
  });

  $("#customerForm").addEventListener("submit", async event => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    const id = data.id;
    delete data.id;
    await api(id ? `/api/customers?id=${encodeURIComponent(id)}` : "/api/customers", {method:id ? "PATCH" : "POST", body:data});
    resetForm("customerForm");
    await loadCustomers();
    showNotice("Клиент сохранен", true);
  });

  $("#leadForm").addEventListener("submit", async event => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    const id = data.id;
    delete data.id;
    await api(id ? `/api/leads?id=${encodeURIComponent(id)}` : "/api/leads", {method:id ? "PATCH" : "POST", body:data});
    resetForm("leadForm");
    await loadLeads();
    showNotice("Заявка сохранена", true);
  });

  $("#contentForm").addEventListener("submit", async event => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    const logoUrls = await uploadFiles($("#logoFile"), "site");
    if(logoUrls[0]) data.logo_url = logoUrls[0];
    data.benefits = String(data.benefits || "").split(/\n+/).map(item => item.trim()).filter(Boolean);
    await api("/api/content", {method:"PUT", body:data});
    await loadContent();
    showNotice("Контент сохранен", true);
  });

  $$("[data-reset-form]").forEach(button => {
    button.addEventListener("click", () => resetForm(button.dataset.resetForm));
  });
}

function bindLists(){
  document.addEventListener("click", async event => {
    const target = event.target;
    if(target.id === "leadTgBindBtnV1"){
      target.disabled = true;
      target.textContent = "Открываем Telegram…";
      try{
        const r = await api("/api/auctions?action=alertadminbind");
        if(!r.url){ throw new Error("Бот недоступен"); }
        window.open(r.url, "_blank", "noopener");
        target.textContent = "Ждём подтверждения в Telegram…";
        // Нажали «Start» у бота — chat_id привязывается опросом (alertadminstatus сам
        // досрочно дёргает pollUpdates, не ждём крон раз в 3 мин).
        for(let i = 0; i < 8; i++){
          await new Promise(resolve => setTimeout(resolve, 2500));
          const st = await api("/api/auctions?action=alertadminstatus").catch(() => null);
          if(st && st.bound){ renderLeadTgBind(true); showNotice("Telegram-уведомления подключены", true); return; }
        }
        renderLeadTgBind(false);
        showNotice("Не подтвердилось — откройте ссылку и нажмите Start в Telegram, затем попробуйте снова", false);
      }catch(error){
        renderLeadTgBind(false);
        showNotice(error.message || "Не удалось подключить Telegram", false);
      }
      return;
    }
    const vehicleId = target.dataset.editVehicle;
    const customerId = target.dataset.editCustomer;
    const leadId = target.dataset.editLead;

    if(vehicleId){
      const item = state.vehicles.find(row => String(row.id) === String(vehicleId));
      setForm($("#vehicleForm"), item);
      renderVehiclePhotoThumbs();
      $("#vehicleFormTitle").textContent = "Редактировать автомобиль";
    }
    if(customerId){
      const item = state.customers.find(row => String(row.id) === String(customerId));
      setForm($("#customerForm"), item);
      $("#customerFormTitle").textContent = "Редактировать клиента";
    }
    if(leadId){
      const item = state.leads.find(row => String(row.id) === String(leadId));
      setForm($("#leadForm"), item);
      updateLeadCustomerContact();
      $("#leadFormTitle").textContent = "Редактировать заявку";
    }

    const deleteMap = [
      ["deleteVehicle", "/api/vehicles", loadVehicles],
      ["deleteCustomer", "/api/customers", loadCustomers],
      ["deleteLead", "/api/leads", loadLeads]
    ];
    for(const [key, path, reload] of deleteMap){
      if(target.dataset[key]){
        if(!confirm("Удалить запись?")) return;
        // Раньше ошибка (например, FK-constraint) уходила в necaught rejection этого
        // async-обработчика клика — молча, без showNotice: со стороны выглядело так,
        // будто кнопка «Удалить» просто ничего не делает (Федор 07.10.2026).
        try{
          await api(`${path}?id=${encodeURIComponent(target.dataset[key])}`, {method:"DELETE"});
          await reload();
          showNotice("Запись удалена", true);
        }catch(error){
          showNotice(error.message || "Не удалось удалить запись", false);
        }
      }
    }
  });
}

function bindFilters(){
  let timer = 0;
  const delayed = fn => {
    clearTimeout(timer);
    timer = setTimeout(() => fn().catch(error => showNotice(error.message)), 250);
  };
  $("#vehicleSearch").addEventListener("input", () => delayed(loadVehicles));
  $("#customerSearch").addEventListener("input", () => delayed(loadCustomers));
  $("#customerStatusFilter").addEventListener("change", () => delayed(loadCustomers));
  $("#leadStatusFilter").addEventListener("change", () => delayed(loadLeads));
}

async function checkAuth(){
  const data = await api("/api/admin?action=me");
  setAuthScreen(data.authenticated);
  if(data.authenticated){
    try{
      await refresh();
    }catch(error){
      showNotice(error.message);
    }
    window.scrollTo({top:0, left:0});
  }
}

function setAuthScreen(authenticated){
  $("#loginScreen").hidden = authenticated;
  $("#appScreen").hidden = !authenticated;
  document.body.classList.toggle("isAdminAuthenticated", authenticated);
  document.body.classList.toggle("isAdminLogin", !authenticated);
  if(!authenticated){
    $("#adminPassword").value = "";
    $("#loginError").textContent = "";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  bindTabs();
  bindForms();
  bindLists();
  bindFilters();
  $("#refreshBtn").addEventListener("click", () => refresh().catch(error => showNotice(error.message)));
  $("#logoutBtn").addEventListener("click", async () => {
    await api("/api/admin?action=logout", {method:"POST", body:{}});
    setAuthScreen(false);
    window.scrollTo({top:0, left:0});
  });
  $("#loginForm").addEventListener("submit", async event => {
    event.preventDefault();
    $("#loginError").textContent = "";
    try{
      await api("/api/admin?action=login", {method:"POST", body:{password:$("#adminPassword").value}});
      await checkAuth();
    }catch(error){
      $("#loginError").textContent = error.message;
    }
  });
  await checkAuth().catch(() => {
    setAuthScreen(false);
  });
});
