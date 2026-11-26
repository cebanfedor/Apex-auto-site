const state = {
  view:"dashboard",
  vehicles:[],
  customers:[],
  leads:[],
  leadsAll:[],
  deals:[],
  dealStages:[],
  leadsView:"list",
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
  if(id === "dealForm"){ form.elements.notify.checked = true; form.elements.active.checked = true; form.dataset.lastVin = ""; form.elements.chat_id.value = ""; const il = document.getElementById("invList"); if(il) il.innerHTML = ""; const imsg = document.getElementById("invMsg"); if(imsg) imsg.textContent = ""; setTimeout(dealClientHint, 0); const lm = document.getElementById("dealLookupMsg"); if(lm) lm.textContent = ""; }
  form.querySelector('[name="id"]').value = "";
  const title = document.getElementById(`${id.replace("Form", "FormTitle")}`);
  if(title){
    title.textContent = id === "vehicleForm" ? "Новый автомобиль" : id === "customerForm" ? "Новый клиент" : id === "dealForm" ? "Новая сделка" : "Новая заявка";
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
    if(type === "deal"){
      const st = (state.dealStages.find(x => x.key === item.stage) || {}).label || item.stage;
      const money = (a, b) => (b ? ` · оплачено ${formatMoney(a)} из ${formatMoney(b)}` : "");
      return `<article class="rowItem">
        <div>
          <h3>${escapeHtml(item.title || "Сделка")}</h3>
          <p>${escapeHtml(item.client_name || "—")} · ${escapeHtml(item.phone || "—")} · <b>${escapeHtml(st)}</b>${item.active === false ? " · скрыта" : ""}</p>
          <p>VIN: ${escapeHtml(item.vin || "—")}${money(item.paid_usd, item.total_usd)} · ${item.chat_id ? "✅ привязан к клиенту из Telegram" : item.linked ? "✅ клиент подтвердил номер в Telegram" : "⏳ клиент ещё не подтвердил номер"}</p>
        </div>
        <div class="rowActions">
          ${digits(item.phone) ? `<a class="ghost" style="text-decoration:none;padding:8px 12px;border-radius:10px" target="_blank" rel="noopener" href="https://api.whatsapp.com/send?phone=${digits(item.phone)}&text=${encodeURIComponent(dealWaText(item, st))}">WhatsApp</a>` : ""}
          <button data-edit-deal="${item.id}">Изм.</button>
          <button class="danger" data-delete-deal="${item.id}">Удалить</button>
        </div>
      </article>`;
    }
    if(type === "customer"){
      const cab = cabinetOf(item.phone);
      return `<article class="rowItem">
        <div>
          <h3>${escapeHtml(item.name || "Клиент")}${cab ? ` <a href="#client=${escapeHtml(cab.chat)}" data-cab-open="${escapeHtml(cab.chat)}" title="Открыть карточку клиента в кабинете" style="font-size:12px;font-weight:700;color:#4f46e5;text-decoration:none;background:#eef0ff;border-radius:999px;padding:2px 9px;margin-left:6px">${cab.online ? "🟢" : "🔗"} в кабинете${cab.unread ? " · 💬 " + cab.unread : ""}</a>` : ""}</h3>
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

// Клиенты, подключившие Telegram (те же, что во вкладке «Клиенты сайта») — им можно привязать сделку напрямую
async function loadDealClients(){
  const sel = $("#dealClientPick");
  if(!sel) return;
  try{
    const data = await api("/api/clients");
    state.dealClients = data.items || [];
  }catch(e){ state.dealClients = state.dealClients || []; }
  const cur = sel.value;
  const label = c => {
    const nm = c.name || "без имени";
    return `${c.online ? "🟢 " : ""}${nm} · ${c.phone || "телефон не указан"}${c.verified ? " ✓" : ""}`;
  };
  sel.innerHTML = `<option value="">— клиента нет в списке, ввести телефон вручную —</option>` +
    state.dealClients.map(c => `<option value="${escapeHtml(c.chat)}">${escapeHtml(label(c))}</option>`).join("");
  if(cur) sel.value = cur;
}
function dealClientHint(){
  const f = $("#dealForm"); if(!f) return;
  const chat = f.elements.chat_id.value, hint = $("#dealClientHint"), star = $("#dealPhoneStar");
  if(star) star.style.display = chat ? "none" : "";
  if(!hint) return;
  hint.textContent = chat
    ? "✅ Клиент подключён в Telegram: сообщения о смене этапа придут ему в чат, сделка появится в его кабинете. Телефон необязателен."
    : "Номер вручную: клиент увидит сделку и получит сообщения только после того, как подтвердит этот номер в боте (кабинет → «Мои сделки»).";
}
function pickDealClient(chat){
  const f = $("#dealForm"), el = f.elements;
  el.chat_id.value = chat || "";
  const c = (state.dealClients || []).find(x => String(x.chat) === String(chat));
  if(c){
    if(c.phone) el.phone.value = c.phone;
    if(c.name && !el.client_name.value.trim()) el.client_name.value = c.name;
  }
  dealClientHint();
}

const digits = p => String(p || "").replace(/\D/g, "");
// Клиент CRM ↔ клиент Telegram-кабинета: по последним 8 цифрам телефона (из списка «Клиенты сайта»)
function cabinetOf(phone){
  const k = digits(phone).slice(-8);
  if(k.length < 7) return null;
  return (state.dealClients || []).find(c => digits(c.phone).slice(-8) === k) || null;
}
// Готовый текст клиенту о сделке (для WhatsApp/Viber, если клиент не в Telegram)
function dealWaText(d, stageLabel){
  const eta = d.eta_date ? ` Ожидаемая выдача: ${String(d.eta_date).split("-").reverse().join(".")}.` : "";
  return `Здравствуйте${d.client_name ? ", " + d.client_name : ""}! Apex Auto: ${d.title}. Этап: ${stageLabel}.${d.next_step ? " Дальше: " + d.next_step + "." : ""}${eta}`;
}

async function loadDeals(){
  const q = ($("#dealSearch")?.value || "").trim().toLowerCase();
  loadDealClients();
  const data = await api("/api/deals");
  state.dealStages = data.stages || state.dealStages;
  const sel = $("#dealStageSelect");
  if(sel && !sel.options.length) sel.innerHTML = state.dealStages.map(s => `<option value="${escapeHtml(s.key)}">${escapeHtml(s.label)}</option>`).join("");
  state.deals = (data.items || []).filter(d => !q || [d.title, d.vin, d.phone, d.client_name].join(" ").toLowerCase().includes(q));
  renderRows("dealsList", state.deals, "deal");
}

// Автозаполнение сделки по VIN: машина, этап, ETA, лента и фото — из трекинга («Отследить»).
// Ничего не затираем: пустое заполняем, этап только двигаем вперёд, ленту/фото дописываем недостающим.
async function lookupDealVin(manual, recalc){
  const form = $("#dealForm"), msg = $("#dealLookupMsg");
  const vin = String(form.elements.vin.value || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  form.elements.vin.value = vin;
  if(vin.length !== 17){ if(manual) msg.textContent = "Введите VIN целиком (17 символов)."; return; }
  if(form.dataset.lastVin === vin && !manual) return;
  form.dataset.lastVin = vin;
  msg.textContent = "Ищу в трекинге и на аукционах…";
  const rulesSel = form.elements.calc_rules.value;
  let res;
  try{ res = await api("/api/deals?lookup=" + encodeURIComponent(vin) + (rulesSel ? "&rules=" + rulesSel : "")); }catch(e){ msg.textContent = "Не удалось запросить данные: " + (e.message || e); return; }
  if(!res || !res.found){ msg.textContent = "Этот VIN пока не нашёлся ни в трекинге, ни в нашей базе аукционов — заполните вручную (трекинг подтянется сам, когда машина в нём появится)."; return; }
  const d = res.data, el = form.elements, got = [];
  const calcNote = applyDealCalc(d.calc, !!recalc);
  if(recalc){ msg.textContent = ""; return; }
  if(calcNote.filled) got.push("расчёт доставки и таможни");
  if(d.title && !el.title.value.trim()){ el.title.value = d.title; got.push("авто"); }
  const order = (state.dealStages || []).map(s => s.key);
  if(d.stage && order.indexOf(d.stage) > order.indexOf(el.stage.value)){ el.stage.value = d.stage; got.push("этап"); }
  if(d.eta_date && !el.eta_date.value){ el.eta_date.value = d.eta_date; got.push("дата выдачи"); }
  const lines = el.timeline.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const have = new Set(lines.map(x => x.toLowerCase().replace(/^[^|]*\|\s*/, "")));
  const add = (d.timeline || []).filter(e => !have.has(e.text.toLowerCase())).map(e => `${e.at ? e.at.split("-").reverse().join(".") : ""} | ${e.text}`.replace(/^ \| /, ""));
  if(add.length){ el.timeline.value = lines.concat(add).join("\n"); got.push("лента"); }
  const plines = el.photos.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const urls = new Set(plines.map(x => x.split("|")[0].trim()));
  const padd = (d.photos || []).filter(p => !urls.has(p.url)).map(p => p.url + (p.caption ? " | " + p.caption : ""));
  if(padd.length){ el.photos.value = plines.concat(padd).join("\n"); got.push("фото " + padd.length); }
  const where = [d.auction, d.city].filter(Boolean).join(", ");
  msg.textContent = "Найдено: " + (d.title || "авто") + (where ? " · " + where : "") + (got.length ? " — подставлено: " + got.join(", ") : " — всё уже заполнено") + ".";
}

// Расчёт доставки и таможни из калькулятора сайта: подставляем в пустые поля (или перезаписываем по кнопке «Пересчитать»)
function applyDealCalc(c, overwrite){
  const form = $("#dealForm"), el = form.elements, out = $("#dealCalcMsg");
  const say = t => { if(out) out.textContent = t; };
  if(!c){ say("Машины нет в нашей базе аукционов — впишите цифры вручную."); return {filled: false}; }
  if(c.canada){ say("Канадский лот — считается по другой формуле, впишите цифры вручную."); return {filled: false}; }
  const put = (name, v) => { if(v == null || v === "") return false; if(el[name].value !== "" && !overwrite) return false; el[name].value = v; return true; };
  let n = 0;
  if(put("calc_land", c.land_usd)) n++;
  if(put("calc_sea", c.sea_usd)) n++;
  if(put("calc_customs", c.customs_mdl)) n++;
  if(put("calc_broker", c.broker_mdl)) n++;
  if(put("calc_rate", c.usd_mdl)) n++;
  if(c.rules && !el.calc_rules.value){ el.calc_rules.value = c.rules; }
  const warn = c.locationFound ? "" : " ⚠️ Площадка аукциона не найдена — доставку по США впишите сами.";
  say("По калькулятору: доставка по США $" + c.land_usd + ", море+дорога $" + c.sea_usd + ", таможня " + Number(c.customs_mdl).toLocaleString("ru-RU") + " лей (правила " + c.rules + ")." + warn);
  return {filled: n > 0};
}
function setDealForm(item){
  const form = $("#dealForm");
  form.reset();
  const set = (n, v) => { if(form.elements[n]) form.elements[n].value = v == null ? "" : v; };
  ["id","phone","client_name","title","vin","stage","eta_date","total_usd","paid_usd","next_step","chat_id"].forEach(n => set(n, item[n]));
  const pick = form.elements.client_pick;
  if(pick){
    if(item.chat_id && ![...pick.options].some(o => o.value === String(item.chat_id))){
      const o = document.createElement("option"); o.value = String(item.chat_id); o.textContent = "Клиент Telegram #" + item.chat_id; pick.appendChild(o);
    }
    pick.value = item.chat_id ? String(item.chat_id) : "";
  }
  dealClientHint();
  set("timeline", (item.timeline || []).map(x => `${x.at ? x.at.split("-").reverse().join(".") : ""} | ${x.text}`.replace(/^ \| /, "")).join("\n"));
  set("photos", (item.photos || []).map(x => `${x.url}${x.caption ? " | " + x.caption : ""}`).join("\n"));
  set("docs", (item.docs || []).map(x => `${x.name} | ${x.url}`).join("\n"));
  form.elements.active.checked = item.active !== false;
  form.elements.notify.checked = true;
  $("#dealFormTitle").textContent = "Редактировать сделку";
  form.dataset.lastVin = String(item.vin || "");
  const lm = $("#dealLookupMsg"); if(lm) lm.textContent = "";
  const cm = $("#dealCalcMsg"); if(cm) cm.textContent = "";
  const c = item.calc || {};
  const sv = (n, v) => { form.elements[n].value = v == null ? "" : v; };
  sv("calc_land", c.land_usd); sv("calc_sea", c.sea_usd); sv("calc_customs", c.customs_mdl); sv("calc_broker", c.broker_mdl);
  sv("calc_rate", c.usd_mdl); sv("calc_rules", c.rules || ""); sv("calc_discount", c.discount_usd); sv("calc_note", c.note || "");
  form.elements.calc_discount_on.checked = !!c.discount_on;
  loadInvoices(item.id);
}

// ---------- Счета ----------
function invoiceLinesFromForm(){
  const f = $("#dealForm").elements, num = v => parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0;
  const rate = num(f.calc_rate.value), out = [];
  const add = (n, v) => { v = Math.round(v * 100) / 100; if(v) out.push(n + " | " + v); };
  add("Доставка по США", num(f.calc_land.value));
  add("Морская доставка и дорога до Кишинёва", num(f.calc_sea.value));
  if(rate > 0){ add("Таможенные платежи", num(f.calc_customs.value) / rate); add("Брокер и утилизационный сбор", num(f.calc_broker.value) / rate); }
  if(f.calc_discount_on.checked && num(f.calc_discount.value)) add("Скидка клиенту" + (f.calc_note.value ? " (" + f.calc_note.value + ")" : ""), -Math.abs(num(f.calc_discount.value)));
  return out.join("\n");
}
function renderInvoices(list){
  const box = $("#invList"); if(!box) return;
  box.innerHTML = (list || []).map(i => {
    const sum = (i.lines || []).reduce((a, l) => a + (Number(l.usd) || 0), 0), paid = (i.paid || []).reduce((a, p) => a + (Number(p.usd) || 0), 0);
    const url = location.origin + "/invoice/" + i.token;
    return `<div class="rowItem" style="margin-top:8px"><div><h3 style="font-size:15px">${escapeHtml(i.no)} — ${formatMoney(sum)}</h3>
      <p>${paid >= sum - 0.005 ? "✅ оплачен" : paid > 0 ? "◐ оплачено " + formatMoney(paid) : "⏳ не оплачен"} · ${escapeHtml(fmtWhen(i.created) || "")}</p></div>
      <div class="rowActions" style="flex-wrap:wrap"><a class="ghost" style="text-decoration:none;padding:8px 12px;border-radius:10px" target="_blank" rel="noopener" href="${escapeHtml(url)}">Открыть</a>
      <button type="button" class="ghost" data-inv-copy="${escapeHtml(url)}">Ссылка</button>
      <input type="number" min="0" step="0.01" placeholder="$ платёж" data-inv-sum="${escapeHtml(i.token)}" style="width:100px">
      <button type="button" data-inv-pay="${escapeHtml(i.token)}">Отметить оплату</button></div></div>`;
  }).join("");
}
async function loadInvoices(dealId){
  const box = $("#invList"); if(box) box.innerHTML = "";
  const f = $("#dealForm"); if(!f) return;
  try{
    const r = await api("/api/deals?invoices=" + (Number(dealId) || 0));
    if(r.settings && r.settings.requisites != null && !f.elements.inv_req.value) f.elements.inv_req.value = r.settings.requisites;
    renderInvoices(r.invoices);
  }catch(_){ /* без таблицы настроек просто пусто */ }
}
document.addEventListener("click", async ev => {
  const t = ev.target; if(!t.closest) return;
  const f = $("#dealForm");
  if(t.closest("#invFillBtn")){ f.elements.inv_lines.value = invoiceLinesFromForm() || f.elements.inv_lines.value; return; }
  const cp = t.closest("[data-inv-copy]");
  if(cp){ try{ await navigator.clipboard.writeText(cp.dataset.invCopy); showNotice("Ссылка на счёт скопирована", true); }catch(_){ prompt("Ссылка на счёт:", cp.dataset.invCopy); } return; }
  if(t.closest("#invMakeBtn")){
    const msg = $("#invMsg"), id = f.elements.id.value;
    if(!id){ msg.textContent = "Сначала сохраните сделку, потом формируйте счёт."; return; }
    msg.textContent = "Формирую…";
    try{
      const r = await api("/api/deals", {method: "POST", body: {action: "invoice", deal_id: id, lines: f.elements.inv_lines.value, requisites: f.elements.inv_req.value, rate: f.elements.calc_rate.value, send: $("#invSend").checked}});
      msg.textContent = "Счёт " + r.invoice.no + " готов." + ({sent: " Клиенту отправлена ссылка в Telegram.", no_chat: " Клиент не подключён в Telegram — отправьте ссылку сами (кнопка «Ссылка»).", failed: " Не удалось отправить в Telegram — отправьте ссылку сами."}[r.sent] || "");
      f.elements.inv_lines.value = "";
      loadInvoices(id);
    }catch(e){ msg.textContent = "Не получилось: " + (e.message || e); }
    return;
  }
  const pay = t.closest("[data-inv-pay]");
  if(pay){
    const token = pay.dataset.invPay, inp = document.querySelector(`[data-inv-sum="${token}"]`), usd = parseFloat(inp && inp.value);
    if(!(usd > 0)){ showNotice("Введите сумму платежа в долларах"); return; }
    try{
      const r = await api("/api/deals", {method: "POST", body: {action: "pay", token, usd}});
      showNotice("Платёж отмечен." + ({sent: " Клиент получил сообщение в Telegram.", no_chat: " Клиент не подключён в Telegram — сообщение не отправлено."}[r.sent] || ""), true);
      loadInvoices(f.elements.id.value); loadDeals();
    }catch(e){ showNotice(e.message); }
  }
});

document.addEventListener("click", ev => {
  const a = ev.target.closest && ev.target.closest("[data-cab-open]");
  if(!a) return;
  ev.preventDefault();
  location.hash = "client=" + a.dataset.cabOpen;
  if(window.cabDeepLink) window.cabDeepLink();
});

async function loadCustomers(){
  if(!state.dealClients) loadDealClients().then(() => { if(state.view === "customers") renderRows("customersList", state.customers, "customer"); });
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

// Полный список заявок БЕЗ фильтра статуса — общий источник и для мини-KPI, и для канбана
// (канбану нужны ВСЕ статусы разом, чтобы было между чем перетаскивать; фильтр выше относится
// только к списку). Один запрос на двоих — Промис.
async function loadLeadsAll(){
  try{
    const data = await api("/api/leads?limit=200");
    state.leadsAll = data.items || [];
  }catch(e){ state.leadsAll = state.leadsAll || []; }
  renderLeadsKpiFromState();
  if(state.leadsView === "kanban") renderLeadsKanban();
}
function renderLeadsKpiFromState(){
  const box = $("#leadsKpiV1");
  if(!box) return;
  const items = state.leadsAll || [];
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
}

// ── Канбан по статусам (Федор 08.10.2026) ──
const KANBAN_STATUSES = ["Новый", "Перезвонить", "В работе", "Купил", "Закрыт"];
function renderLeadsKanban(){
  const box = $("#leadsKanbanV1");
  if(!box) return;
  const items = state.leadsAll || [];
  box.innerHTML = KANBAN_STATUSES.map(status => {
    const rows = items.filter(x => (x.status || "Новый") === status);
    const cards = rows.length
      ? rows.map(item => `
          <article class="kanbanCardV1" draggable="true" data-lead-id="${item.id}">
            <b>${escapeHtml(item.customers?.name || item.title || "Заявка")}</b>
            <span>${escapeHtml(item.vehicles ? [item.vehicles.year, item.vehicles.make, item.vehicles.model].filter(Boolean).join(" ") : (item.customers?.phone || "Без авто"))}</span>
            <span>${escapeHtml(item.source || "—")} · ${escapeHtml(fmtWhen(item.created_at) || "—")}</span>
          </article>`).join("")
      : `<div class="kanbanEmptyV1">Пусто</div>`;
    return `
      <div class="kanbanColV1" data-status="${escapeHtml(status)}">
        <div class="kanbanColHeadV1"><h3>${escapeHtml(status)}</h3><span>${rows.length}</span></div>
        <div class="kanbanColBodyV1">${cards}</div>
      </div>`;
  }).join("");
}
function bindLeadsKanban(){
  const toggle = $("#leadsViewToggleV1");
  if(toggle){
    toggle.addEventListener("click", event => {
      const btn = event.target.closest("[data-leads-view]");
      if(!btn) return;
      state.leadsView = btn.dataset.leadsView;
      $$("#leadsViewToggleV1 button").forEach(b => b.classList.toggle("active", b === btn));
      $("#leadsSplitV1").hidden = state.leadsView === "kanban";
      $("#leadsKanbanV1").hidden = state.leadsView !== "kanban";
      $("#leadStatusFilter").hidden = state.leadsView === "kanban";
      if(state.leadsView === "kanban") renderLeadsKanban();
    });
  }

  const board = $("#leadsKanbanV1");
  if(!board) return;
  let draggedId = null;
  board.addEventListener("dragstart", event => {
    const card = event.target.closest(".kanbanCardV1");
    if(!card) return;
    draggedId = card.dataset.leadId;
    card.classList.add("draggingV1");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedId);
  });
  board.addEventListener("dragend", event => {
    event.target.closest(".kanbanCardV1")?.classList.remove("draggingV1");
    $$(".kanbanColV1.dragoverV1").forEach(c => c.classList.remove("dragoverV1"));
  });
  board.addEventListener("dragover", event => {
    const col = event.target.closest(".kanbanColV1");
    if(!col) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    col.classList.add("dragoverV1");
  });
  board.addEventListener("dragleave", event => {
    const col = event.target.closest(".kanbanColV1");
    if(col && !col.contains(event.relatedTarget)) col.classList.remove("dragoverV1");
  });
  board.addEventListener("drop", async event => {
    const col = event.target.closest(".kanbanColV1");
    if(!col) return;
    event.preventDefault();
    col.classList.remove("dragoverV1");
    const id = draggedId || event.dataTransfer.getData("text/plain");
    const status = col.dataset.status;
    draggedId = null;
    if(!id) return;
    const lead = (state.leadsAll || []).find(x => String(x.id) === String(id));
    if(!lead || lead.status === status) return;
    const prevStatus = lead.status;
    lead.status = status;   // оптимистично — доска переотрисовывается сразу, не ждём ответ сервера
    renderLeadsKanban();
    try{
      await api(`/api/leads?id=${encodeURIComponent(id)}`, {method:"PATCH", body:{status}});
      renderLeadsKpiFromState();
      loadLeads().catch(() => {});   // фоном освежаем список — пригодится, если переключатся обратно
      showNotice("Статус обновлён", true);
    }catch(error){
      lead.status = prevStatus;
      renderLeadsKanban();
      showNotice(error.message || "Не удалось изменить статус", false);
    }
  });
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
  if(state.view === "deals") await loadDeals();
  if(state.view === "cabclients" && window.loadCabClients) await window.loadCabClients();
  if(state.view === "leads"){
    await Promise.all([loadCustomers(), loadVehicles()]);
    await loadLeads();
    loadLeadTgBind();
    loadLeadsAll();
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
const EV_NAMES = {fav_add:"Добавили в избранное", save_search:"Сохранили поиск", alert_search:"Нажали «Уведомлять о новых»", alert_lot:"Нажали «Следить за лотом»", alert_connected:"Подключили Telegram", lead_open:"Открыли форму заявки", calc_use:"Пользовались калькулятором", calc_result:"Получили расчёт", calc_share:"Поделились расчётом", lead_sent:"Отправили заявку", contact_click:"Нажали на контакт (Telegram/WhatsApp/звонок)", wizard_start:"Открыли «Подбери мне»", wizard_done:"Прошли «Подбери мне»", hero_cta:"Нажали кнопку на первом экране"};
const EV_SUFFIX = {tg:"Telegram", wa:"WhatsApp", phone:"звонок", email:"e-mail", copy:"копирование", home:"главная", lot:"страница лота", catalog:"каталог", transit:"авто в пути", carcat:"Корея/Канада", contacts:"контакты", vin:"страница VIN", other:"другое", calc:"калькулятор", match:"подбор"};
const evName = ev => { const [b, sfx] = String(ev).split(":"); return (EV_NAMES[b] || b) + (sfx ? ` — ${EV_SUFFIX[sfx] || sfx}` : ""); };
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
function fmtDuration(sec){
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}м ${s % 60}с` : `${s}с`;
}
function renderAnalytics(s){
  const A = s.alerts || {};
  const E = s.engagement || {};
  const conv = A.links ? Math.round(A.bound / A.links * 100) : 0;
  const per = s.period || {visitors:0, views:0};
  const perV = per.visitors ? (per.views / per.visitors).toFixed(1) : "0";
  const evRows = (s.events || []).map(e => ({name:evName(e.ev), n:e.n, v:e.visitors}));
  const lotLink = p => `<a href="${escapeHtml(p)}" target="_blank" rel="noopener">${escapeHtml(p.replace("/auctions/", ""))}</a>`;
  return `
  <div class="anGridV1">
    <article class="anLive"><span>Сейчас на сайте</span><b>${num(s.online)}</b><small>${(s.online_pages || []).map(p => `${escapeHtml(p.path)} · ${p.n}`).join("<br>") || "никого"}</small></article>
    <article><span>Сегодня</span><b>${num(s.today && s.today.visitors)}</b><small>посетителей · ${num(s.today && s.today.views)} просмотров</small></article>
    <article><span>За период</span><b>${num(per.visitors)}</b><small>визитов (сумма по дням) · ${num(per.views)} просмотров</small></article>
    <article><span>Глубина</span><b>${perV}</b><small>страниц за визит</small></article>
    <article><span>Среднее время на сайте</span><b>${escapeHtml(fmtDuration(E.avg_duration_sec))}</b><small>${num(E.sessions)} визитов за период</small></article>
    <article><span>Отказы</span><b>${num(E.bounce_rate)}%</b><small>ушли после одной страницы</small></article>
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

  $("#dealClientPick").addEventListener("change", event => pickDealClient(event.target.value));
  dealClientHint();
  $("#dealForm").elements.vin.addEventListener("input", () => lookupDealVin(false));
  $("#dealLookupBtn").addEventListener("click", () => lookupDealVin(true));
  $("#dealRecalcBtn").addEventListener("click", () => lookupDealVin(true, true));
  $("#dealForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formData(form);
    data.active = form.elements.active.checked;
    data.notify = form.elements.notify.checked;
    const f = form.elements;
    data.calc = {land_usd: f.calc_land.value, sea_usd: f.calc_sea.value, customs_mdl: f.calc_customs.value, broker_mdl: f.calc_broker.value,
      usd_mdl: f.calc_rate.value, rules: f.calc_rules.value, discount_on: f.calc_discount_on.checked, discount_usd: f.calc_discount.value, note: f.calc_note.value};
    Object.keys(data).forEach(k => { if(k.indexOf("calc_") === 0 || k.indexOf("inv_") === 0) delete data[k]; });
    delete data.client_pick;
    if(!data.chat_id && !data.phone){ alert("Выберите клиента из Telegram или укажите его телефон."); return; }
    const id = data.id; delete data.id;
    const btn = form.querySelector('[type="submit"]');
    try{
      btn.disabled = true;
      const res = await api(id ? `/api/deals?id=${encodeURIComponent(id)}` : "/api/deals", {method: id ? "PATCH" : "POST", body: data});
      resetForm("dealForm");
      await loadDeals();
      const n = {sent: " Клиенту отправлено сообщение в Telegram.", no_chat: " Клиент ещё не подтвердил номер в боте — сообщение не отправлено (выберите его из списка «Клиент из Telegram», тогда сообщения пойдут сразу).", failed: " Не удалось отправить сообщение в Telegram."}[res.notified] || "";
      const cw = res.calcWarn ? " ⚠️ Расчёт доставки/таможни НЕ сохранён: выполните SQL из supabase/migrations/20261125_cab_deals_calc.sql в Supabase." : "";
      const chw = res.chatWarn ? " ⚠️ Привязка к клиенту НЕ сохранена: выполните SQL из supabase/migrations/20261126_cab_deals_chat.sql в Supabase." : "";
      showNotice("Сделка сохранена." + n + cw + chw, res.notified !== "failed" && !res.calcWarn && !res.chatWarn);
    }catch(error){
      alert("Не сохранилось: " + (error.message || error));
    }finally{ btn.disabled = false; }
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
    const dealId = target.dataset.editDeal;
    if(dealId){
      const item = state.deals.find(row => String(row.id) === String(dealId));
      if(item){ setDealForm(item); $("#dealForm").scrollIntoView({behavior:"smooth", block:"start"}); }
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
      ["deleteLead", "/api/leads", loadLeads],
      ["deleteDeal", "/api/deals", loadDeals]
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
  $("#dealSearch").addEventListener("input", () => delayed(loadDeals));
  $("#customerStatusFilter").addEventListener("change", () => delayed(loadCustomers));
  $("#leadStatusFilter").addEventListener("change", () => delayed(loadLeads));
}

async function checkAuth(){
  const data = await api("/api/admin?action=me");
  setAuthScreen(data.authenticated);
  try{ if(data.authenticated) localStorage.setItem("apexAdminV1", "1"); else localStorage.removeItem("apexAdminV1"); }catch(_){}
  if(data.authenticated){
    try{
      await refresh();
    }catch(error){
      showNotice(error.message);
    }
    window.scrollTo({top:0, left:0});
    if(window.cabDeepLink) window.cabDeepLink();
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
  bindLeadsKanban();
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
