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

function resetForm(id){
  const form = document.getElementById(id);
  form.reset();
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
  const className = /купил|продан|рекомендуется/i.test(text) ? "good" : /закрыт|архив/i.test(text) ? "red" : "";
  return `<span class="badge ${className}">${escapeHtml(text)}</span>`;
}

function escapeHtml(value){
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
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
    .map(item => `<option value="${item.id}">${escapeHtml(item.name || item.phone || item.id)}</option>`)
    .join("");
  vehicleSelect.innerHTML = '<option value="">Без автомобиля</option>' + state.vehicles
    .map(item => `<option value="${item.id}">${escapeHtml([item.year,item.make,item.model,item.lot].filter(Boolean).join(" · "))}</option>`)
    .join("");
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
  if(state.view === "customers") await loadCustomers();
  if(state.view === "leads"){
    await Promise.all([loadCustomers(), loadVehicles()]);
    await loadLeads();
  }
  if(state.view === "content") await loadContent();
}

async function uploadFiles(input, folder){
  const urls = [];
  for(const file of Array.from(input.files || [])){
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
      $("#viewTitle").textContent = button.textContent;
      await refresh().catch(error => showNotice(error.message));
    });
  });
}

function bindForms(){
  $("#vehicleForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formData(form);
    const photoUrls = await uploadFiles($("#vehiclePhotos"), "vehicles");
    const existing = String(data.photos || "").split(/\n+/).map(item => item.trim()).filter(Boolean);
    data.photos = [...existing, ...photoUrls];
    const id = data.id;
    delete data.id;
    await api(id ? `/api/vehicles?id=${encodeURIComponent(id)}` : "/api/vehicles", {method:id ? "PATCH" : "POST", body:data});
    resetForm("vehicleForm");
    await loadVehicles();
    showNotice("Автомобиль сохранен", true);
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
    const vehicleId = target.dataset.editVehicle;
    const customerId = target.dataset.editCustomer;
    const leadId = target.dataset.editLead;

    if(vehicleId){
      const item = state.vehicles.find(row => String(row.id) === String(vehicleId));
      setForm($("#vehicleForm"), item);
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
        await api(`${path}?id=${encodeURIComponent(target.dataset[key])}`, {method:"DELETE"});
        await reload();
        showNotice("Запись удалена", true);
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
