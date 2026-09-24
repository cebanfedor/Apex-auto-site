(function(){
  const $ = selector => document.querySelector(selector);
  function debounce(fn, ms){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  // Некритичную догрузку (счётчики вкладок, прогнозы ставок — до 16 XHR)
  // откладываем на простой браузера, чтобы не конкурировать с первым экраном.
  const idle = fn => (window.requestIdleCallback
    ? requestIdleCallback(fn, {timeout:1500}) : setTimeout(fn, 250));
  // Discovery mode: fresh open with no URL params → default to run-and-drive + insurance shuffle
  let discoveryMode = !location.search.length;
  const INS_RE = /insurance|geico|progressive|allstate|usaa|state.?farm|farmers|nationwide|liberty.?mutual|travelers|erie|metlife|kemper|csaa/i;
  function exitDiscovery(){ discoveryMode = false; }
  const state = {
    auction:"all",
    tab:"all",
    page:1,
    perPage:100,
    displayPage:1,
    displayPageSize:30,
    filteredCount:0,
    total:0,
    hasMore:false,
    loading:false,
    items:[],
    selectedLot:null
  };

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  // Title-case for lowercase English API values ("rogersville, missouri" → "Rogersville, Missouri",
  // "nj"→"NJ"). Preserves already-uppercase tokens (AWD, V6). Not for Russian text.
  function tc(text){
    if(text == null || text === "") return text;
    return String(text).replace(/[A-Za-z0-9]+/g, w => {
      if(w === w.toUpperCase()) return w;
      if(/^[a-z]{2}$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  function upAbbr(text){ // short drive/trans codes: rwd→RWD, at→AT
    const t = String(text || "").trim();
    return t && t.length <= 4 ? t.toUpperCase() : tc(t);
  }
  function cleanEngine(raw){
    const s = String(raw || "");
    const displ = s.match(/\b(\d+\.\d+)/);
    const turbo = /\bturbo\b/i.test(s) ? "Turbo" : "";
    const sc    = /supercharg/i.test(s)  ? "SC"    : "";
    return [displ ? displ[1] : "", turbo || sc].filter(Boolean).join(" ");
  }
  function cleanTrans(raw){
    const s = String(raw || "").toLowerCase();
    if(!s) return "";
    if(/cvt/.test(s)) return "CVT";
    if(/auto|^at$/.test(s)) return "AT";
    if(/manual|^mt$/.test(s)) return "MT";
    return upAbbr(raw);
  }

  function money(value){
    const number = Number(value || 0);
    return number ? `$${Math.round(number).toLocaleString("en-US")}` : "—";
  }
  // Округление цены рынка до $500 (вверх): $2 083 → $2 500, $5 314 → $5 500.
  function round500(value){ return Math.ceil((Number(value) || 0) / 500) * 500; }
  function money500(value){ return money(round500(value)); }
  // Канадские лоты: оценка/ремонт у Copart CA — в CAD, как и ставка. Показываем CAD + ≈USD.
  let _caLotFlag = false;
  function caMoney(v){
    if(!_caLotFlag) return money(v);
    const rate = (typeof liveRates !== "undefined" && liveRates.cadUsd) || 0.7325;
    return `${moneyCad(v)} ≈ ${money(Math.round(v * rate))}`;
  }

  // Ставки канадских аукционов — в канадских долларах
  function moneyCad(value){
    const number = Number(value || 0);
    return number ? `${Math.round(number).toLocaleString("en-US")} CAD` : "—";
  }

  // ---- Русские значения enum-полей API (повреждения, топливо, цвет, кузов) ----
  const RU_DAMAGE = {
    "front end":"Спереди","rear end":"Сзади","left front":"Слева спереди","right front":"Справа спереди",
    "left rear":"Слева сзади","right rear":"Справа сзади","left side":"Левая сторона","right side":"Правая сторона",
    "side":"Сбоку","all over":"По всему кузову","top/roof":"Крыша","roof":"Крыша",
    "undercarriage":"Днище / подвеска","mechanical":"Механическое","engine damage":"Двигатель",
    "transmission":"Трансмиссия","electrical":"Электрика","interior":"Салон",
    "minor dent/scratches":"Мелкие вмятины / царапины","minor dents/scratches":"Мелкие вмятины / царапины",
    "normal wear":"Естественный износ","wear and tear":"Естественный износ",
    "hail":"Град","water/flood":"Затопление","flood":"Затопление","water":"Затопление",
    "burn":"Огонь","burn - engine":"Огонь · двигатель","burn - interior":"Огонь · салон",
    "rollover":"Переворот","vandalism":"Вандализм","theft":"После угона","stripped":"Разукомплектован",
    "frame damage":"Повреждение рамы","suspension":"Подвеска","biohazard/chemical":"Био / химия",
    "bio chemical":"Био / химия","biohazard chemical":"Био / химия",
    "partial repair":"Частичный ремонт","repossession":"Изъятие (repo)","storm damage":"Шторм",
    "rejected repair":"Отказ от ремонта","missing/altered vin":"Проблема с VIN","replaced vin":"Заменён VIN",
    "unknown":"Не указано","none":"Без повреждений",
    "front":"Спереди","rear":"Сзади","left":"Слева","right":"Справа",
    "normal wear & tear":"Естественный износ","normal wear and tear":"Естественный износ",
    "wear & tear":"Естественный износ","strip":"Разукомплектован","stripping":"Разукомплектован",
    "top":"Крыша","top roof":"Крыша","water flood":"Затопление","fresh water":"Затопление",
    "salt water":"Затопление (солёная вода)","total burn":"Полностью сгорел","burn engine":"Огонь · двигатель",
    "burn interior":"Огонь · салон","cargo":"Грузовой отсек","chemical":"Химическое",
    "front & rear":"Спереди и сзади","left & right":"Обе стороны","damage history":"Была бита ранее",
    "mechanical damage":"Механическое","engine burn":"Огонь · двигатель","undercarriage damage":"Днище / подвеска"
  };
  const RU_FUEL = {
    gasoline:"Бензин",gas:"Бензин",petrol:"Бензин",diesel:"Дизель",hybrid:"Гибрид",
    "plug-in hybrid":"Plug-in гибрид","hybrid electric":"Гибрид",phev:"Plug-in гибрид",
    electric:"Электро",flexible:"Флекс (бензин/этанол)","flexible fuel":"Флекс (бензин/этанол)",
    flex:"Флекс (бензин/этанол)",cng:"Газ (CNG)",lpg:"Газ (LPG)",hydrogen:"Водород",other:"Другое"
  };
  const RU_COLOR = {
    white:"Белый",black:"Чёрный",silver:"Серебристый",gray:"Серый",grey:"Серый",blue:"Синий",
    red:"Красный",green:"Зелёный",brown:"Коричневый",beige:"Бежевый",tan:"Бежевый",gold:"Золотистый",
    orange:"Оранжевый",yellow:"Жёлтый",purple:"Фиолетовый",burgundy:"Бордовый",maroon:"Бордовый",
    charcoal:"Графитовый",cream:"Кремовый",turquoise:"Бирюзовый",teal:"Бирюзовый",pink:"Розовый",
    "two tone":"Двухцветный","two-tone":"Двухцветный"
  };
  const RU_BODY = {
    sedan:"Седан",suv:"Внедорожник","sport utility vehicle":"Внедорожник",crossover:"Кроссовер",
    coupe:"Купе",convertible:"Кабриолет",hatchback:"Хэтчбек",wagon:"Универсал",liftback:"Лифтбек",
    fastback:"Фастбек",roadster:"Родстер",pickup:"Пикап","pickup truck":"Пикап",van:"Минивен / Бус",
    minivan:"Минивэн","cargo van":"Грузовой бус",truck:"Грузовик",motorcycle:"Мотоцикл",
    atv:"Квадроцикл",bus:"Автобус",limousine:"Лимузин","chassis cab":"Шасси-кабина"
  };
  function ruEnum(map, raw){
    if(raw == null || raw === "") return raw;
    const k = String(raw).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return map[k] || map[k.replace(/ /g, "-")] || tc(raw);
  }
  // ---- Документы: сырую строку API («Nm - Cert Of Title-Salvage») приводим
  // к виду «вердикт + NM · Salvage». Для Молдовы плохих документов нет:
  // Bill of Sale / ACQ / Parts Only / Junk / COD оформляются, но требуют
  // переделки (~30–40 дней) — без неё авто нельзя экспортировать.
  const DOC_TYPES = [
    [/certificate of destruction|cert of destruction|\bcod\b|destruction/, "Certificate of Destruction", "rework"],
    [/non.?repair/, "Non-Repairable", "rework"],
    [/junk|parts only|dismantl/, "Junk / Parts Only", "rework"],
    [/bill of sale/, "Bill of Sale", "rework"],
    [/\bacq\b|acquisition/, "ACQ (Bill of Sale)", "rework"],
    [/reconstructed|r=reconstr/, "Reconstructed", "good"],
    [/rebuil/, "Rebuilt", "good"],
    [/salvage histor|salv histor/, "Salvage History", "good"],
    [/salvage|\bsalv\b/, "Salvage", "good"],
    [/clean|clear/, "Clean", "good"],
    [/^cert(ificate)?\s+of\s+title\s*$/, "Clean", "good"]
  ];
  function parseDocTitle(raw){
    const s = String(raw || "").trim();
    if(!s) return null;
    const m = s.match(/^\s*([A-Za-z]{2})\s*[-–·•]\s*(.*)$/);
    const state = m ? m[1].toUpperCase() : "";
    const rest = (m ? m[2] : s).toLowerCase();
    for(const [re, label, tone] of DOC_TYPES){
      if(re.test(rest)) return {state, label, tone};
    }
    return {state, label:tc(m ? m[2] : s), tone:"neutral"};
  }
  function docShort(raw){
    const d = parseDocTitle(raw);
    if(!d) return "";
    return d.state ? `${d.state} · ${d.label}` : d.label;
  }

  // "Front End / Right Rear" → каждая часть переводится отдельно;
  // цельные ключи с "/" (Minor Dent/Scratches) ловятся до разбиения
  function ruDamage(raw){
    if(raw == null || raw === "") return raw;
    const whole = String(raw).toLowerCase().replace(/\s+/g, " ").trim();
    // Каждую часть переводим отдельно: составная строка «Сбоку / Повреждение рамы» в словарях
    // RO/EN не находилась и оставалась русской.
    if(RU_DAMAGE[whole]) return L(RU_DAMAGE[whole]);
    return String(raw).split("/").map(p => L(ruEnum(RU_DAMAGE, p))).join(" / ");
  }

  function dateText(value){
    if(!value) return "—";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleDateString("ru-RU");
  }

  // ---- Favorites (localStorage) ----
  const FAV_KEY = "apexFavsV1";
  function favLoad(){ try{ return JSON.parse(localStorage.getItem(FAV_KEY) || "{}") || {}; }catch(e){ return {}; } }
  function favSave(map){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(map)); }catch(e){} }
  function favHas(id){ return id != null && !!favLoad()[id]; }
  function favCompact(lot){
    const keep = ["id","auction","title","year","make","model","vin","lot","url","location","auctionDate","currentBid","finalBid","buyNow","odometer","odometerText","primaryDamage","secondaryDamage","damage","document","engine","drive","transmission","fuel","condition","seller","sellerType","horsePower","generationName","keys","estimatedRetailValue","repairCost","airbags","photoCount","image","images","lotStatus","statusId","statusName","saleStatus","saleStatusKey","timed","priceHistory","sellerReserve","sellerReserveAt"];
    const o = {}; keep.forEach(k => { if(lot[k] !== undefined) o[k] = lot[k]; }); return o;
  }
  function track(ev){ try{ if(window.apexTrack) window.apexTrack(ev); }catch(e){} }
  function favToggle(lot){
    if(!lot || lot.id == null) return false;
    const map = favLoad();
    if(map[lot.id]) delete map[lot.id]; else map[lot.id] = favCompact(lot);
    favSave(map);
    updateFavCount();
    if(map[lot.id]) track("fav_add");
    return !!favLoad()[lot.id];
  }
  function favList(){ return Object.values(favLoad()).reverse(); }
  function updateFavCount(){
    const n = Object.keys(favLoad()).length;
    const el = document.getElementById("favCount");
    if(el) el.textContent = n ? ` (${n})` : "";
    document.querySelectorAll("[data-fav]").forEach(s => s.classList.toggle("is-fav", favHas(s.dataset.fav)));
  }

  // ---- URL state sync (shareable searches, survives refresh) ----
  function syncUrl(){
    if(parseSlug(currentSlug())) return; // on a detail page — leave its path
    const p = formParams();
    p.delete("per_page");
    if(Number(p.get("page")) <= 1) p.delete("page");   // страница >1 остаётся в ссылке: «назад из лота» возвращает на неё
    if(p.get("sort") === "smart") p.delete("sort"); // «Рекомендованные» — дефолт с 15.09.2026 (лучшие из ближайших торгов первыми)
    if(p.get("auction") === "all") p.delete("auction");
    if(p.get("tab") === "all") p.delete("tab");
    const qs = p.toString();
    try{ history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname); }catch(e){}
    try{ renderActiveFilters(); }catch(e){}
  }
  // Мультивыбор повреждений: значения в скрытом поле через «|», чипсы под полем.
  function damageList(){
    const h = document.getElementById("filterDamageValV2");
    return h && h.value ? h.value.split("|").filter(Boolean) : [];
  }
  function setDamageList(list){
    const h = document.getElementById("filterDamageValV2");
    if(h) h.value = [...new Set(list)].join("|");
    const box = document.getElementById("damageChipsV1");
    if(!box) return;
    box.innerHTML = damageList().map((d, i) => `<button type="button" class="dmgChipV1" data-i="${i}" title="Убрать">${escapeHtml(d)} <span aria-hidden="true">×</span></button>`).join("");
  }
  // ---- Активные фильтры сверху (удаление по одному) + сохранённые поиски (localStorage) ----
  // Мультивыбор марок/моделей (как DreamBid): выбранные — в ms, id — в скрытых полях через запятую.
  const ms = {makes:[], models:[]};
  const msApi = {removeMake(){}, removeModel(){}, reset(){}};
  const msIdsOf = id => { const v = document.getElementById(id)?.value || ""; return v ? v.split(",").filter(Boolean) : []; };
  const SAVED_KEY = "apexSavedSearchesV1";
  function savedLoad(){ try{ const a = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); return Array.isArray(a) ? a : []; }catch(e){ return []; } }
  function savedStore(list){ try{ localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 30))); }catch(e){} }
  let activeChips = [];
  function activeFilterChips(){
    const form = $("#auctionFiltersForm");
    if(!form) return [];
    const chips = [];
    const add = (label, remove) => chips.push({label, remove});
    const byId = id => document.getElementById(id);
    const val = n => String(form.elements[n] && form.elements[n].value || "").trim();
    const clear = (...els) => els.forEach(e => { if(e) e.value = ""; });
    const smart = String($("#auctionSmartSearch")?.value || "").trim();
    if(smart) add(`${L("Поиск")}: ${smart}`, () => { $("#auctionSmartSearch").value = ""; });
    if(val("q")) add(`${L("Поиск")}: ${val("q")}`, () => { form.elements.q.value = ""; });
    const gn = byId("filterGenV2"), gnId = byId("filterGenIdV2");
    const resetGen = () => { clear(gn, gnId); if(gn) setPhV1(gn, "Сначала выберите модель"); };
    msIdsOf("filterMakeIdV2").forEach(id => add(`${L("Марка")}: ${(ms.makes.find(m => String(m.id) === id) || {}).name || id}`, () => msApi.removeMake(id)));
    msIdsOf("filterModelIdV2").forEach(id => add(`${L("Модель")}: ${(ms.models.find(m => String(m.id) === id) || {}).name || id}`, () => msApi.removeModel(id)));
    if(gnId && gnId.value) add(`${L("Поколение")}: ${(gn && gn.value) || gnId.value}`, resetGen);
    const range = (title, a, b, fmt) => {
      const x = val(a), y = val(b);
      if(!x && !y) return;
      const t = x && y ? `${fmt(x)}–${fmt(y)}` : x ? `${L("от")} ${fmt(x)}` : `${L("до")} ${fmt(y)}`;
      add(`${L(title)}: ${t}`, () => { clear(form.elements[a], form.elements[b]); const r = form.elements[a].closest("[data-range]"); if(r && r._applyNums) r._applyNums(); });
    };
    const num = n => Number(n).toLocaleString("ru-RU");
    const unit = document.querySelector("[data-odo-unit].active")?.dataset.odoUnit === "km" ? "км" : "mi";
    range("Год", "yearFrom", "yearTo", n => n);
    range("Пробег", "mileageFrom", "mileageTo", n => `${num(n)} ${unit}`);
    range("Объём двигателя", "engineFrom", "engineTo", n => `${Number(n).toFixed(1)}L`);
    range("Цена (ставка)", "bidFrom", "bidTo", n => `$${num(n)}`);
    range("Цена «Купить сейчас»", "buyNowFrom", "buyNowTo", n => `$${num(n)}`);
    const optText = el => (el.closest("label")?.textContent || el.value).trim();
    const boxes = (name, title) => form.querySelectorAll(`input[name="${name}"]:checked`).forEach(cb => add(`${L(title)}: ${optText(cb)}`, () => { cb.checked = false; }));
    if(form.querySelector('input[name="smart"]:checked')) add("Feduk Clean Select™", () => { form.querySelector('input[name="smart"]').checked = false; });
    boxes("fuel", "Топливо");
    boxes("body", "Кузов"); boxes("vehicleType", "Тип техники"); boxes("drive", "Привод"); boxes("transmission", "Коробка");
    boxes("cylinders", "Цилиндры"); boxes("country", "Страна"); boxes("condition", "Состояние");
    damageList().forEach((d, i) => add(`${L("Повреждение")}: ${d}`, () => { const l = damageList(); l.splice(i, 1); setDamageList(l); }));
    const dTyped = String(byId("filterDamageV2")?.value || "").trim();
    if(dTyped && !damageList().some(d => d.toLowerCase() === dTyped.toLowerCase())) add(`${L("Повреждение")}: ${dTyped}`, () => { byId("filterDamageV2").value = ""; });
    const st = byId("filterStateIdV2");
    if(st && st.value) add(`${L("Штат / провинция")}: ${byId("filterStateV2")?.value || st.value}`, () => { clear(st, byId("filterStateV2")); });
    boxes("lotStatus", "Статус лота");
    boxes("saleStatus", "Статус продажи");
    const d1 = val("auctionDateFrom"), d2 = val("auctionDateTo");
    if(d1 || d2) add(`${L("Дата аукциона")}: ${d1 || "…"} – ${d2 || "…"}`, () => { clear(form.elements.auctionDateFrom, form.elements.auctionDateTo); document.querySelectorAll(".dateQuickV2 button.active").forEach(b => b.classList.remove("active")); });
    return chips;
  }
  function renderActiveFilters(){
    const box = document.getElementById("activeFiltersV1");
    if(!box) return;
    activeChips = activeFilterChips();
    if(state.tab === "favorites"){
      const n = favList().filter(alertable).length;
      box.hidden = !n;
      box.innerHTML = n ? `<button type="button" class="afBellV1" id="afFavBellV1">${dbIco("bell")}<span>${escapeHtml(L("Следить за избранными"))} (${n})</span></button>` : "";
      return;
    }
    if(!activeChips.length){ box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false;
    box.innerHTML = activeChips.map((c, i) => `<button type="button" class="afChipV1" data-af="${i}" title="${escapeHtml(L("Убрать"))}">${escapeHtml(c.label)} <span aria-hidden="true">×</span></button>`).join("")
      + `<button type="button" class="afSaveV1" id="afSaveV1">${escapeHtml(L("Сохранить поиск"))}</button>`
      + (["archived", "favorites"].includes(state.tab) ? "" : `<button type="button" class="afBellV1" id="afBellV1">${dbIco("bell")}<span>${escapeHtml(L("Уведомлять о новых"))}</span></button>`)
      + `<button type="button" class="afClearV1" id="afClearV1">${escapeHtml(L("Очистить всё"))}</button>`;
  }
  function updateSavedCount(){
    const n = savedLoad().length;
    const el = document.getElementById("savedCount");
    if(el) el.textContent = n ? ` (${n})` : "";
  }
  function renderSavedPanel(){
    const box = document.getElementById("savedPanelV1");
    if(!box) return;
    const list = savedLoad();
    const alertsBox = `<div class="svAlertsV1" id="svAlertsV1"></div>`;
    setTimeout(() => loadAlertSubsInto(document.getElementById("svAlertsV1")), 0);
    box.innerHTML = (list.length
      ? list.map((x, i) => `<div class="svRowV1"><button type="button" class="svOpenV1" data-sv-open="${i}">${escapeHtml(x.name)}</button><button type="button" class="svDelV1" data-sv-del="${i}" aria-label="${escapeHtml(L("Удалить"))}" title="${escapeHtml(L("Удалить"))}">×</button></div>`).join("")
      : `<p class="svEmptyV1">${escapeHtml(L("Сохранённых поисков пока нет. Выберите фильтры и нажмите «Сохранить поиск»."))}</p>`) + alertsBox;
  }
  function saveCurrentSearch(){
    const qs = location.search.replace(/^\?/, "");
    if(!qs || !activeChips.length) return false;
    const list = savedLoad().filter(x => x.qs !== qs);
    const name = activeChips.map(c => c.label).join(" · ");
    list.unshift({id:Date.now(), name:name.length > 110 ? name.slice(0, 107) + "…" : name, qs});
    savedStore(list);
    updateSavedCount();
    if(!document.getElementById("savedPanelV1")?.hidden) renderSavedPanel();
    track("save_search");
    return true;
  }
  // ---- Telegram-уведомления: новые лоты по поиску и напоминания о торгах лота ----
  const ALERT_TOKEN_KEY = "apexAlertTokenV1", ALERT_LOTS_KEY = "apexAlertLotsV1";
  function alertTokenGet(){ try{ return localStorage.getItem(ALERT_TOKEN_KEY) || ""; }catch(e){ return ""; } }
  function alertTokenSet(t){ try{ localStorage.setItem(ALERT_TOKEN_KEY, t); }catch(e){} }
  function alertLots(){ try{ return new Set(JSON.parse(localStorage.getItem(ALERT_LOTS_KEY) || "[]")); }catch(e){ return new Set(); } }
  function alertLotMark(ids){ try{ const set = alertLots(); ids.forEach(i => set.add(i)); localStorage.setItem(ALERT_LOTS_KEY, JSON.stringify([...set].slice(-300))); }catch(e){} refreshBellMarks(); }
  function alertLang(){ const l = String(document.documentElement.getAttribute("lang") || "ru").slice(0, 2).toLowerCase(); return ["ru", "ro", "en"].includes(l) ? l : "ru"; }
  function alertable(lot){
    if(!lot || Number(lot.finalBid) > 0 || Number(lot.statusId) === 6) return false;
    const t = Date.parse(lot.auctionDate || "");
    return !Number.isFinite(t) || t > Date.now();      // без даты — тоже можно следить: уведомим, когда назначат
  }
  function refreshBellMarks(){
    const set = alertLots();
    document.querySelectorAll("[data-alert-lot]").forEach(b => {
      const on = set.has(b.dataset.alertLot);
      b.classList.toggle("is-on", on);
      const lab = b.querySelector("span"); if(lab) lab.textContent = L(on ? "Слежу за лотом" : "Следить за лотом");
    });
  }
  let alertPollTimer = null;
  function alertToast(kind, text, url){
    let box = document.getElementById("alertToastV1");
    if(!box){ box = document.createElement("div"); box.id = "alertToastV1"; box.className = "alertToastV1"; document.body.appendChild(box); }
    box.dataset.kind = kind;
    box.innerHTML = `<div class="atTxtV1">${escapeHtml(text)}</div>`
      + (url ? `<a class="atBtnV1" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(L("Открыть Telegram"))}</a>` : "")
      + `<button type="button" class="atCloseV1" aria-label="${escapeHtml(L("Закрыть"))}">×</button>`;
    box.hidden = false;
    box.querySelector(".atCloseV1").onclick = () => { box.hidden = true; clearInterval(alertPollTimer); };
    if(kind === "ok") setTimeout(() => { if(box.dataset.kind === "ok") box.hidden = true; }, 7000);
  }
  function alertErrText(msg){
    return L({not_configured:"Уведомления пока не настроены на сервере", limit:"Слишком много подписок (максимум 30). Удалите ненужные в «Сохранённые поиски».",
      tab_not_supported:"Для архива и избранного уведомления не поддерживаются", rate_limited:"Слишком много попыток. Попробуйте чуть позже."}[msg] || "Не удалось включить уведомления. Попробуйте позже.");
  }
  async function alertEnsureLink(){
    const t = alertTokenGet();
    if(t){
      try{ const st = await api(`/api/auctions?action=alertstatus&token=${encodeURIComponent(t)}`); if(st.exists) return {token:t, bound:!!st.bound, url:st.url || ""}; }
      catch(e){ if(e.message === "not_configured") throw e; }
    }
    const r = await api("/api/auctions?action=alertlink", {method:"POST", body:{lang:alertLang()}});
    alertTokenSet(r.token);
    return {token:r.token, bound:false, url:r.url};
  }
  function alertWatchBound(token, url){
    clearInterval(alertPollTimer);
    const until = Date.now() + 5 * 60e3;
    alertPollTimer = setInterval(async () => {
      if(Date.now() > until){ clearInterval(alertPollTimer); return; }
      try{
        const st = await api(`/api/auctions?action=alertstatus&token=${encodeURIComponent(token)}`);
        if(st.bound){ clearInterval(alertPollTimer); track("alert_connected"); alertToast("ok", L("Готово — Telegram подключён. Подтверждение уже в чате.")); }
      }catch(e){}
    }, 3000);
  }
  async function alertSubscribe(kind, data, onDone){
    alertToast("wait", L("Подключаем уведомления…"));
    track(kind === "lot" ? "alert_lot" : "alert_search");
    try{
      const link = await alertEnsureLink();
      const res = await api("/api/auctions?action=alertsub", {method:"POST", body:{token:link.token, kind, ...data}});
      if(onDone) onDone(res);
      if(link.bound || res.bound){
        alertToast("ok", res.dup ? L("Такая подписка уже есть") : L("Готово — уведомления включены. Подтверждение придёт в Telegram."));
      }else{
        alertToast("connect", L("Осталось нажать Start в Telegram — тогда придёт подтверждение и уведомления заработают."), link.url);
        if(link.url){ try{ window.open(link.url, "_blank", "noopener"); }catch(e){} }
        alertWatchBound(link.token, link.url);
      }
    }catch(e){
      alertToast("err", alertErrText(e.message));
    }
  }
  function searchAlertName(){ return activeChips.map(c => c.label).join(" · ").slice(0, 110) || L("Поиск"); }
  async function loadAlertSubsInto(box){
    const token = alertTokenGet();
    if(!token || !box) return;
    try{
      const st = await api(`/api/auctions?action=alertstatus&token=${encodeURIComponent(token)}`);
      if(!st.exists) return;
      const rows = (st.subs || []).map(x => `<div class="svRowV1"><span class="svKindV1">${escapeHtml(L(x.kind === "lot" ? "Торги лота" : "Новые лоты"))}</span><span class="svNameV1">${escapeHtml(x.name || x.lot_title || "")}</span><button type="button" class="svDelV1" data-al-del="${x.id}" aria-label="${escapeHtml(L("Удалить"))}" title="${escapeHtml(L("Удалить"))}">×</button></div>`).join("");
      const P = st.prefs || {};
      const prefKeys = [["date", "Назначена дата аукциона"], ["timed", "Лот появился на Timed (IAAI)"], ["day", "В день торгов"], ["hour", "За час до торгов"], ["buynow", "Появился Buy Now"], ["play", "Ход торгов и итог"]];
      const prefsHtml = `<div class="svPrefsV1">${prefKeys.map(([k, t]) => `<label class="svPrefV1"><input type="checkbox" data-pref="${k}"${P[k] === false ? "" : " checked"}><span>${escapeHtml(L(t))}</span></label>`).join("")}</div>`;
      box.innerHTML = `<h4 class="svHeadV1">${escapeHtml(L("Уведомления в Telegram"))}</h4>` + prefsHtml
        + (st.bound ? "" : `<div class="svRowV1"><span class="svNameV1">${escapeHtml(L("Telegram не подключён"))}</span>${st.url ? `<a class="atBtnV1" href="${escapeHtml(st.url)}" target="_blank" rel="noopener">${escapeHtml(L("Подключить"))}</a>` : ""}</div>`)
        + (rows || `<p class="svEmptyV1">${escapeHtml(L("Подписок пока нет"))}</p>`);
    }catch(e){}
  }
  function restoreFromUrl(){
    const p = new URLSearchParams(location.search);
    if(!Array.from(p.keys()).length) return;
    const setActive = (sel, attr, val) => document.querySelectorAll(sel).forEach(b => b.classList.toggle("active", b.getAttribute(attr) === val));
    if(p.get("tab")){ state.tab = p.get("tab") === "sold" ? "archived" : p.get("tab") === "open" ? "all" : p.get("tab"); setActive("[data-tab]", "data-tab", state.tab); } // старые ссылки ?tab=sold → «Архив»
    if(p.get("auction")){ state.auction = p.get("auction"); setActive("[data-auction-switch]", "data-auction-switch", state.auction); }
    if(p.get("sort") && $("#auctionSort")) $("#auctionSort").value = p.get("sort");
    { const pg = Number(p.get("page")); if(Number.isFinite(pg) && pg > 1){ state.page = Math.min(400, Math.floor(pg)); } }
    // Открыли по ссылке с фильтрами (марка/модель/…) без явной сортировки → «Скоро торги», не «Рекомендованные»
    const fk = [...p.keys()].filter(k => !["sort","tab","auction","page","per_page","lang"].includes(k));
    if(fk.length && !p.get("sort") && $("#auctionSort") && !["archived","favorites"].includes(state.tab)){
      $("#auctionSort").value = "soon";
      const lbl = document.getElementById("sortDropLabelV1"); if(lbl) lbl.textContent = "Скоро торги";
      document.querySelectorAll("#sortDropMenuV1 .sortOptV1").forEach(el => el.classList.toggle("sortOptActiveV1", el.dataset.sort === "soon"));
    }
    // make из URL — это ID марки для фильтра, в текстовый поиск его нельзя:
    // «?make=16» превращался в поиск name=16 и убивал выдачу
    const smartPrefill = p.get("vin") || p.get("q") || p.get("name");
    if(smartPrefill && $("#auctionSmartSearch")) $("#auctionSmartSearch").value = smartPrefill;
    const form = $("#auctionFiltersForm");
    if(form) for(const [k, v] of p.entries()){
      const radios = form.querySelectorAll(`[name="${k}"]`);
      if(radios.length && radios[0].type === "checkbox"){
        const set = new Set(String(v).split(","));
        radios.forEach(r => { r.checked = set.has(r.value); });
      }else if(radios.length && radios[0].type === "radio"){
        radios.forEach(r => { r.checked = (r.value === v); });
      }else if(form.elements[k]){
        try{ form.elements[k].value = v; }catch(e){}
      }
    }
    setDamageList(damageList());
    document.querySelectorAll("[data-range]").forEach(r => { if(r._applyNums) r._applyNums(); else if(r._refresh) r._refresh(); });
  }

  function saleClass(value){
    const text = String(value || "").toLowerCase();
    if(text.includes("без")) return "noReserve";
    if(text.includes("утверж")) return "approval";
    if(text.includes("миним")) return "minimum";
    if(text.includes("timed")) return "timed";
    return "";
  }

  // Полное имя с версией/тримом из API — как у DreamBid: «BMW 4 Series 430i»,
  // а не «BMW 4er». year+make+model — только фоллбек.
  function lotTitle(lot){
    const t = lotTitleRaw(lot);
    // Фид иногда пишет в заголовке не тот год («2018 Nissan Rogue» при year=2014 по
    // VIN) — год из поля лота надёжнее заголовка.
    const y = Number(lot && lot.year) || 0;
    const m = String(t || "").match(/^\s*((?:19|20)\d\d)\b/);
    if(y && m && Number(m[1]) !== y) return String(t).replace(m[1], String(y));
    return t;
  }
  function lotTitleRaw(lot){
    const raw = String(lot.title || "").trim();
    if(raw){
      return raw
        .replace(/\b([sx])drive\s*(\d+)\s*i\b/gi, (m, p, d) => `${p.toLowerCase()}Drive${d}i`)
        .replace(/\b(\d{3})\s*I\b/g, "$1i")
        .replace(/\b(\d{3})E\b/g, "$1e")
        .replace(/\b(M\d{2,3})I\b/g, "$1i")
        // API дублирует модель в триме: «M340i M340i xDrive» → «M340i xDrive»
        .replace(/\b([A-Za-z]*\d\w*)\s+\1\b/gi, "$1");
    }
    return [lot.year, lot.make, displayModel(lot.model)].filter(Boolean).join(" ") || "Автомобиль";
  }

  // «4er/5er» из справочника API → человеческое «4 Series/5 Series» (крошки, фоллбеки)
  function displayModel(model){
    const m = String(model || "");
    const ser = m.match(/^(\d)er$/i);
    if(ser) return `${ser[1]} Series`;
    // Справочник фида немецкий: «C-klasse», «GLA-klasse AMG» → привычное «C-Class», «GLA-Class AMG»
    return m.replace(/-klasse\b/i, "-Class");
  }

  // Картинки карточек: IAAI 1280×960 ≈ 220 КБ → 720×540 ≈ 70 КБ; Copart _hrs (1280×960, 250 КБ) → _ful (960×720, 154 КБ).
  // Полный размер остаётся на странице лота и в лайтбоксе; при ошибке — исходный URL (см. обработчик error ниже).
  function cardImg(url){
    const u = String(url || "");
    if(/vis\.iaai\.com\/resizer/i.test(u)) return u.replace(/width=\d+/i, "width=720").replace(/height=\d+/i, "height=540");
    if(/cs\.copart\.com\/.*_hrs\.jpg/i.test(u)) return u.replace(/_hrs\.jpg/i, "_ful.jpg");
    return u;
  }
  document.addEventListener("error", e => {
    const t = e.target;
    if(t && t.tagName === "IMG" && t.dataset && t.dataset.full && t.src !== t.dataset.full){ t.src = t.dataset.full; }
  }, true);
  // Ссылка = площадка-лот + название + VIN (тот же алгоритм на сервере: server/slug.js)
  function slugWords(s, max){
    return String(s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/g, "");
  }
  function lotSlug(lot){
    const title = slugWords(lot.title || [lot.year, lot.make, lot.model].filter(Boolean).join(" "), 60);
    const vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(lot.vin || "").trim()) ? String(lot.vin).trim().toLowerCase() : "";
    return [`${String(lot.auction || "").toLowerCase()}-${lot.lot}`, title, vin].filter(Boolean).join("-");
  }
  // Фид иногда кладёт в titleStatus название машины («2023 BMW 330E») вместо статуса документа — это не документ
  function docRaw(lot){
    const d = String(lot.document || "").trim();
    if(d) return d;
    const t = String(lot.titleStatus || "").trim();
    if(!t) return "";
    const title = String(lot.title || "").trim().toLowerCase();
    if(t.toLowerCase() === title || /^(19|20)\d{2}\s+[a-z]/i.test(t) && lot.make && t.toLowerCase().includes(String(lot.make).toLowerCase())) return "";
    return t;
  }
  function detailHref(lot){
    return `/auctions/${encodeURIComponent(lotSlug(lot))}`;
  }

  function calcHref(lot){
    const url = lot.url || (lot.auction === "iaai"
      ? `https://www.iaai.com/VehicleDetail/${lot.lot}~US`
      : `https://www.copart.com/lot/${lot.lot}`);
    const params = new URLSearchParams({
      lot:url,
      auction:lot.auction || "",
      lotNumber:lot.lot || "",
      vin:lot.vin || "",
      price:String(lot.currentBid || lot.buyNow || ""),
      year:String(lot.year || ""),
      make:lot.make || "",
      model:lot.model || "",
      location:lot.location || ""
    });
    return `/index.html?${params}`;
  }

  async function api(path, options = {}){
    const response = await fetch(path, {
      credentials:"same-origin",
      headers: options.body ? {"content-type":"application/json"} : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || payload.ok === false) throw new Error(payload.error || "Запрос не выполнен");
    return payload;
  }

  // One smart search box: VIN (11+ alnum with letters+digits) → vin,
  // pure 6-10 digit number → lot, anything else → make/model title search.
  function parseSmartSearch(raw){
    const value = String(raw || "").trim();
    if(!value) return {};
    const compact = value.replace(/[^A-Za-z0-9]/g, "");
    if(compact.length >= 11 && /[A-Za-z]/.test(compact) && /\d/.test(compact) && !/\s/.test(value)) return {vin:compact};
    if(/^\d{6,10}$/.test(compact) && /^[\d\s-]+$/.test(value)) return {lot:compact};
    return {name:value};
  }

  function formParams(){
    const form = $("#auctionFiltersForm");
    const params = new URLSearchParams(new FormData(form));
    // Мультивыбор (топливо, статус лота): чекбоксы одного имени → «4,3» одним параметром.
    for(const name of ["fuel", "lotStatus", "body", "vehicleType", "drive", "transmission", "cylinders", "country", "condition", "saleStatus"]){
      const vals = params.getAll(name).filter(Boolean);
      params.delete(name);
      if(vals.length) params.set(name, vals.join(","));
    }
    // Марка без выбранных моделей = все её модели: «Toyota (Highlander, Tacoma) + Honda» → Honda целиком.
    if(ms.models.length){
      const bare = ms.makes.filter(m => !ms.models.some(x => x.makeId === m.id)).map(m => m.id);
      if(bare.length) params.set("makeAny", bare.join(","));
    }
    // Повреждения: выбранные чипсы + набранный, но не выбранный из списка текст.
    const dmgTyped = (document.getElementById("filterDamageV2")?.value || "").trim();
    const dmgAll = damageList();
    if(dmgTyped && !dmgAll.some(d => d.toLowerCase() === dmgTyped.toLowerCase())) dmgAll.push(dmgTyped.replace(/\|/g, " "));
    if(dmgAll.length) params.set("damage", dmgAll.join("|")); else params.delete("damage");
    // Top smart search: VIN → vin, lot number → search_query, text → "name" (title search).
    const smart = parseSmartSearch($("#auctionSmartSearch")?.value);
    if(smart.vin) params.set("vin", smart.vin);
    else if(smart.lot) params.set("q", smart.lot);
    else if(smart.name) params.set("name", smart.name);
    params.set("auction", state.auction);
    params.set("tab", state.tab);
    params.set("sort", $("#auctionSort").value);
    params.set("page", state.page);
    params.set("per_page", String(state.perPage));
    Array.from(params.entries()).forEach(([key, value]) => {
      if(!value) params.delete(key);
    });
    // Mileage may be entered in km; the API has native odometer_from_km/to_km params.
    const odoUnit = document.querySelector("[data-odo-unit].active")?.dataset.odoUnit;
    if(odoUnit === "km"){
      [["mileageFrom","mileageFromKm"], ["mileageTo","mileageToKm"]].forEach(([from, to]) => {
        const v = params.get(from);
        if(v){ params.set(to, v); params.delete(from); }
      });
    }
    // sale_date_to is exclusive (treated as 00:00) — bump the "До" day by 1 so the picked day is included.
    const dTo = params.get("auctionDateTo");
    if(dTo){
      const d = new Date(dTo + "T00:00:00");
      if(!Number.isNaN(d.getTime())){
        d.setDate(d.getDate() + 1);
        params.set("auctionDateTo", d.toISOString().slice(0, 10));
      }
    }
    return params;
  }

  function statusTone(value){
    const text = String(value || "").toLowerCase();
    if(!value) return "";
    if(/не на ходу|\bнет\b|non[ -]|not |bill of sale|parts only|flood|water|missing|отсут|продан ранее|переставлялся/.test(text)) return "bad";
    if(/approval|утвержд|minimum|минимум|timed|salvage|starts|стартует|резерв|upcoming|unknown|переделк/.test(text)) return "warn";
    if(/run|drive|clear|\byes\b|\bда\b|заводится|едет|хорош|впервые|не продавалась|есть|на ходу|live|available|no reserve|без резерва|страховая|\bpresent\b/.test(text)) return "good";
    return "";
  }

  function statusItem(label, value, tone){
    return `<div class="checkStatusV1 ${tone || statusTone(value)}">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value || "—")}</b>
    </div>`;
  }

  function numberFromEngine(engine){
    const match = String(engine || "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(l|л|liter)?/i);
    return match ? Number(match[1]) : 2;
  }

  // Сбор аукциона — ЕДИНЫЙ источник: calc-core.js (ApexCalc), тот же, что у
  // главного калькулятора и /api/calc. Раньше здесь была своя таблица, которая
  // расходилась с ядром → разные суммы на странице лота и в калькуляторе.
  // Фолбэк-процент срабатывает только если ядро не загрузилось (не должно).
  function auctionFeeFor(price, auction){
    const p = Number(price || 0);
    if(!p) return 0;
    if(window.ApexCalc && window.ApexCalc.auctionFeeFor){
      return Math.round(window.ApexCalc.auctionFeeFor(p, auction).total || 0);
    }
    return Math.round(p * (auction === "iaai" ? 0.08 : 0.075));
  }

  function landShippingFor(lot){
    const locations = window.LOCATIONS || [];
    const auction = String(lot.auction || "").toLowerCase();
    const source = String(lot.location || "").toLowerCase();
    const match = locations.find(item => {
      const itemAuction = String(item.auction || "").toLowerCase();
      const label = String(item.label || item.name || item.location || "").toLowerCase();
      return (!itemAuction || itemAuction === auction) && source && (label.includes(source) || source.includes(label.split("→")[0].trim().toLowerCase()));
    });
    return Number(match?.price || match?.land || match?.value || 0) || 0;
  }

  function seaShippingFor(lot){
    const port = String(lot.port || lot.destination || "").toLowerCase();
    if(port.includes("los angeles")) return 2700;
    if(port.includes("savannah")) return 2300;
    if(port.includes("houston")) return 2400;
    return 2400;
  }

  function customsFor(lot){
    const fuel = String(lot.fuel || "").toLowerCase();
    /* Pure EV only — hybrids ("Electric And Gas Hybrid") still pay customs */
    if(fuel.includes("electric") && !fuel.includes("hybrid")) return 0;
    const year = Number(lot.year || new Date().getFullYear());
    const age = Math.max(0, new Date().getFullYear() - year);
    const engineCc = Math.round(numberFromEngine(lot.engine) * 1000);
    const rate = fuel.includes("diesel") ? 0.034 : 0.028;
    const ageFactor = age <= 3 ? 0.78 : age <= 7 ? 1 : 1.18;
    return Math.round(engineCc * rate * ageFactor * 19.4);
  }

  function vehicleKind(lot, override){
    if(override) return override;
    const b = String(lot.body || lot.bodyStyle || "").toLowerCase();
    const t = (String(lot.model || "") + " " + String(lot.make || "")).toLowerCase();
    if(/pickup|truck|silverado|sierra|ram|f-150|f150|tundra|tacoma/.test(b + t)) return "pickup";
    if(/van|cargo|sprinter|transit|minivan/.test(b + t)) return "vanLarge";
    // Правило по конкретным моделям (кроссовер vs внедорожник) — единый источник
    // в calc-core. Приоритетнее общего кузова, т.к. влияет на доставку.
    const byModel = window.ApexCalc && window.ApexCalc.bodyClassForModel
      ? window.ApexCalc.bodyClassForModel(lot.make, lot.model) : null;
    if(byModel) return byModel;
    if(/suv|utility|cuv|crossover/.test(b)) return "suv";
    return "sedan";
  }
  function landRouteLabel(lot){ const from = lot.location || "Локация США"; return `${from} → порт США`; }
  function seaRouteLabel(lot){ const port = lot.port || (String(lot.location||"").toLowerCase().includes("tx") ? "Houston" : "порт США"); return `${port} → Кишинёв`; }

  function mapFuel(raw, greenOverride, lot){
    const f = String(raw || "").toLowerCase();
    // PHEV по названию модели/трима (xDrive40e, 330e, RAV4 Prime, 4xe и т.п.) —
    // фид часто отдаёт таким машинам просто «гибрид», а у PHEV таможня ниже.
    const plugin = lot && window.ApexCalc && window.ApexCalc.isPluginHybrid
      && window.ApexCalc.isPluginHybrid(lot.make, lot.model, lot.title, lot.year);
    if(/plug|phev/.test(f)) return "phev";
    if(/hybrid|гибрид/.test(f)) return plugin ? "phev" : "hybrid";
    if(/electric|электро|tesla/.test(f)){
      /* Only reclassify as hybrid if there's real engine displacement (e.g. "2.0L").
         Cylinders field is unreliable — VIN decode can return 4 for pure EVs like BMW i7. */
      if(lot){
        const hasDisplacement = lot.engine && /\d+\.\d/i.test(String(lot.engine));
        if(hasDisplacement) return plugin ? "phev" : "hybrid";
      }
      return "electric";
    }
    if(/diesel|дизель/.test(f)) return "diesel";
    if(greenOverride) return plugin ? "phev" : "hybrid";
    return "gasoline";
  }
  // Текст локации лота: для канадских — площадка из канадской базы
  // (сырое поле API у них бывает битым, вплоть до городов США)
  function lotLocationText(lot){
    const ca = findCanadaLocation(lot);
    if(ca && ca.name){
      const raw = `${String(ca.name).replace(/^(Copart|IAA[AI]?)\s*/i, "")} · Канада`.replace(/^Канада \((\w+)\) · Канада$/, "Канада ($1)");
      // Переводим только слово «Канада», сам город оставляем как есть.
      return raw.replace(/Канада/g, L("Канада"));
    }
    const matched = findLotLocation(lot);
    const label = matched ? String(matched.displayName || matched.location || "").split("→")[0].trim() : "";
    return label || tc(lot.location);
  }

  function findLotLocation(lot){
    const locs = window.LOCATIONS || [];
    if(!locs.length) return null;
    const auction = String(lot.auction || "").toLowerCase();
    const byAuction = locs.filter(l => {
      const a = String(l.auction || "").toLowerCase();
      if(!a) return true;
      if(auction.includes("copart")) return a.includes("copart");
      if(auction.includes("iaai")) return a.includes("iaai");
      return true;
    });
    const src = String(lot.location || "").toLowerCase().replace(/[^a-z0-9, ]/g, "").trim();
    if(!src) return null;
    const tokens = src.split(",").map(s => s.trim()).filter(Boolean);
    const city = tokens[0] || "";
    const state = (tokens[1] || "").slice(0, 2);
    // 1. Strict: city + state match
    let m = byAuction.find(l => {
      const lc = String(l.city || "").toLowerCase();
      const ls = String(l.state || "").toLowerCase();
      return city && (lc === city || lc.includes(city)) && (!state || ls === state);
    });
    // 2. City-only match — API sometimes returns wrong state (e.g. "Acworth, Florida" for GA)
    if(!m && city) m = byAuction.find(l => {
      const lc = String(l.city || "").toLowerCase();
      return lc === city || lc.includes(city);
    });
    // 3. City string anywhere in location name, displayName, or city field
    if(!m && city) m = byAuction.find(l => {
      const hay = (String(l.displayName || "") + " " + String(l.location || "") + " " + String(l.city || "")).toLowerCase();
      return hay.includes(city);
    });
    return m || null;
  }
  // Живые курсы MDL — тот же источник, что у калькулятора на главной (/api/content?rates=1),
  // чтобы итоги на странице лота и на главной совпадали до копейки.
  const liveRates = {usdMdl:17.45, eurMdl:20.28, cadUsd:0.6923};
  let ratesFetched = false;
  // Последние живые курсы храним в браузере: при следующем заходе рендерим
  // сразу правильную цифру, без «прыжка» после ответа сервера
  try{
    const saved = JSON.parse(localStorage.getItem("apexLiveRatesV1") || "null");
    if(saved){
      if(Number(saved.usdMdl) > 0) liveRates.usdMdl = Number(saved.usdMdl);
      if(Number(saved.eurMdl) > 0) liveRates.eurMdl = Number(saved.eurMdl);
      if(Number(saved.cadUsd) > 0) liveRates.cadUsd = Number(saved.cadUsd);
    }
  }catch(_){}
  function applyLiveRatesToInputs(){
    const u = $("#lotCalcUsdMdl"), e = $("#lotCalcEurMdl");
    if(u) u.value = liveRates.usdMdl.toFixed(2);
    if(e) e.value = liveRates.eurMdl.toFixed(2);
    if(u || e){ try{ updateLotCalculator(); }catch(_){} }
  }
  let ratesRetried = false;
  async function fetchLiveRates(){
    if(ratesFetched){ applyLiveRatesToInputs(); return; }
    try{
      // Таймаут 8с + один повтор: если сервер курсов затупил, не остаёмся
      // навсегда на дефолтных значениях
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      let r;
      try{
        r = await fetch("/api/content?rates=1", {signal:controller.signal});
      }finally{ clearTimeout(timer); }
      if(!r.ok) throw new Error(`rates ${r.status}`);
      const data = await r.json();
      if(Number(data?.usdMdl) > 0) liveRates.usdMdl = Number(data.usdMdl);
      if(Number(data?.eurMdl) > 0) liveRates.eurMdl = Number(data.eurMdl);
      if(Number(data?.cadUsd) > 0) liveRates.cadUsd = Number(data.cadUsd);
      ratesFetched = true;
      try{ localStorage.setItem("apexLiveRatesV1", JSON.stringify(liveRates)); }catch(_){}
      applyLiveRatesToInputs();
    }catch(_){
      if(!ratesRetried){
        ratesRetried = true;
        setTimeout(fetchLiveRates, 8000);
      }
    }
  }

  // ---- Канадские лоты: свой расчёт (зеркало канадской ветки главного
  // калькулятора: диспатч Tyras ×0.90, банк TD, погрузка, море Монреаль→
  // Клайпеда, дорога до Кишинёва, комиссия канадской компании) ----
  const CA_PROV_CODES = ["ON","QC","BC","AB","SK","MB","NS","NB","NF"];
  const CA_PROV_NAMES = {ontario:"ON", quebec:"QC", "québec":"QC", "british columbia":"BC", alberta:"AB",
    saskatchewan:"SK", manitoba:"MB", "nova scotia":"NS", "new brunswick":"NB", newfoundland:"NF"};
  function findCanadaLocation(lot){
    const locs = window.CANADA_LOCATIONS || [];
    const raw = String(lot.location || "").toLowerCase();
    if(!raw) return null;
    let prov = "";
    for(const [name, code] of Object.entries(CA_PROV_NAMES)){ if(raw.includes(name)){ prov = code; break; } }
    if(!prov){
      const m = raw.match(/,\s*([a-z]{2})\b\s*$/);
      if(m && CA_PROV_CODES.includes(m[1].toUpperCase())) prov = m[1].toUpperCase();
    }
    // API часто пишет просто «moncton, Canada» — без провинции
    const isCanadaWord = /,\s*canada\s*$/.test(raw);
    if(!prov && !isCanadaWord) return null; // не канадский лот
    let city = (raw.split(",")[0] || "").replace(/[^a-z ]/g, "").trim();
    // Города-сателлиты канадских ярдов → имя площадки в базе
    const CA_CITY_ALIASES = {"stoney creek":"hamilton", "laval":"montreal", "saint eustache":"eustache", "north york":"toronto", "innisfil":"toronto"};
    city = CA_CITY_ALIASES[city] || city;
    const auc = String(lot.auction || "").toLowerCase().includes("iaai") ? "iaai" : "copart";
    const byA = locs.filter(l => String(l.auction || "").toLowerCase() === auc);
    let hit = byA.find(l => city && String(l.name).toLowerCase().includes(city));
    if(!hit && city) hit = locs.find(l => String(l.name).toLowerCase().includes(city)); // город из другой сети — тарифы сравнимы
    if(!hit && prov) hit = byA.filter(l => l.province === prov).sort((a, b) => (a.dispatchSuvCad || 0) - (b.dispatchSuvCad || 0))[0];
    if(!hit && prov) hit = locs.find(l => l.province === prov);
    if(hit) return Object.assign({}, hit);
    return {name:prov ? `Канада (${prov})` : "Канада", province:prov, zone:prov === "BC" ? "bc" : "east", dispatchSuvCad:0, dispatchPickupCad:0};
  }

  function calcCanadaLotTotal(lot, options, caLoc){
    // Ставка канадских аукционов — в CAD; весь расчёт ведём в USD по Non-Cash
    // курсу TD Bank (тот же, что на ix0.apps.td.com/en/fxcal)
    const bidCad = Number(options.bid != null ? options.bid : (lot.currentBid || lot.buyNow || 0));
    const cadUsd = Number(liveRates.cadUsd) > 0 ? Number(liveRates.cadUsd) : 0.6923;
    const bid = Math.round(bidCad * cadUsd);
    const kind = options.vehicleType || vehicleKind(lot);
    const fuel = options.fuel || mapFuel(lot.fuel, false, lot);
    const engineLiters = options.engineLiters != null ? Number(options.engineLiters) : numberFromEngine(lot.engine);
    const usdMdl = Number(options.usdMdl) > 0 ? Number(options.usdMdl) : liveRates.usdMdl;
    const eurMdl = Number(options.eurMdl) > 0 ? Number(options.eurMdl) : liveRates.eurMdl;
    const auctionFee = auctionFeeFor(bid, lot.auction);
    const ip = kind === "pickup" || kind === "vanLarge";
    const green = ["hybrid","phev","electric"].includes(fuel);
    const zone = caLoc.zone || "east";
    const offsiteFee = options.offsite ? 100 : 0; // Offsite / Sublot — как в полном калькуляторе
    const dispatchBase = zone === "bc" ? 1700 : Math.round((ip ? caLoc.dispatchPickupCad : caLoc.dispatchSuvCad) * 0.90);
    const dispatch = dispatchBase ? dispatchBase + offsiteFee : 0;
    const bankFee = zone === "bc" || !dispatchBase ? 0 : 100;
    const keeper = 300;
    const ocean = (ip ? 1170 : 950) + (green ? 150 : 0);
    const road = kind === "crossover" ? 1750 : (kind === "sedan" || kind === "moto" || kind === "atv") ? 1600 : 1900;
    const insurance = Math.max(100, (bid + auctionFee) * 0.01);
    const service = (window.ApexCalc ? Math.round(window.ApexCalc.companyFeeFor(bid, auctionFee)) : 300);
    const canadaFee = Math.max(300, bid * 0.02);
    const exportDocs = options.exportDocs ? 400 : 0;
    const customsBaseMdl = (bid + auctionFee + ocean) * usdMdl;
    const c = window.ApexCalc ? window.ApexCalc.customsMdl(customsBaseMdl, customsBaseMdl, {vehicleType:kind, fuel, engineLiters, year:Number(lot.year) || new Date().getFullYear()}) : {total:0};
    const customsUsd = Math.round(c.total / usdMdl);
    const usdPart = bid + auctionFee + dispatch + bankFee + keeper + ocean + road + canadaFee + insurance + service + exportDocs;
    const totalMdl = usdPart * usdMdl + c.total;
    const total = Math.round(totalMdl / usdMdl);
    return {
      canada:true, bidCad, cadUsd, bid, auctionFee, dispatch, bankFee, keeper, ocean, road,
      canadaFee:Math.round(canadaFee), insurance:Math.round(insurance), service, exportDocs,
      customsUsd, total, totalMdl:Math.round(totalMdl), totalEur:Math.round(totalMdl / eurMdl),
      kind, green, usdMdl, eurMdl,
      dispatchRoute:`${caLoc.name ? String(caLoc.name).replace(/^(Copart|IAA[AI]?)\s*/i, "") : "Канада"} → Монреаль`,
      seaRoute:"Монреаль → Клайпеда → Кишинёв"
    };
  }

  function calcLotTotal(lot, options = {}){
    const caLoc = findCanadaLocation(lot);
    if(caLoc) return calcCanadaLotTotal(lot, options, caLoc);
    const bid = Number(options.bid != null ? options.bid : (lot.currentBid || lot.buyNow || 0));
    const kind = options.vehicleType || vehicleKind(lot);
    const fuel = options.fuel || mapFuel(lot.fuel, !!options.green, lot);
    const loc = findLotLocation(lot);
    const engineLiters = options.engineLiters != null ? Number(options.engineLiters) : numberFromEngine(lot.engine);
    const usdMdl = Number(options.usdMdl) > 0 ? Number(options.usdMdl) : liveRates.usdMdl;
    const eurMdl = Number(options.eurMdl) > 0 ? Number(options.eurMdl) : liveRates.eurMdl;
    const r = (window.ApexCalc && window.ApexCalc.compute) ? window.ApexCalc.compute({
      lotPrice:bid, auction:String(lot.auction || "copart").toLowerCase(),
      vehicleType:kind, fuel, engineLiters,
      year:Number(lot.year) || new Date().getFullYear(),
      insurance:options.insurance !== false, exportDocs:!!options.exportDocs, offsite:!!options.offsite,
      location:loc, usdMdl, eurMdl
    }) : null;
    if(!r){
      const auctionFee = auctionFeeFor(bid, lot.auction);
      return {bid, auctionFee, land:0, sea:0, insurance:0, exportDocs:0, service:300, customsUsd:0,
        total:bid + auctionFee, totalMdl:0, totalEur:0, kind, green:false, usdMdl, eurMdl,
        landRoute:landRouteLabel(lot), seaRoute:seaRouteLabel(lot)};
    }
    return {
      bid:r.lot, auctionFee:r.auctionFee, land:r.land, sea:r.sea,
      insurance:Math.round(r.insurance), exportDocs:r.exportDocs, service:Math.round(r.company),
      customsUsd:Math.round(r.customsUsd), total:Math.round(r.totalUsd),
      totalMdl:Math.round(r.totalMdl), totalEur:Math.round(r.totalEur),
      kind, green:["hybrid","phev","electric"].includes(fuel), usdMdl, eurMdl,
      landRoute: r.route || landRouteLabel(lot),
      seaRoute: r.port ? `${r.port} → Кишинёв` : seaRouteLabel(lot)
    };
  }

  function setMessage(text){
    const box = $("#auctionMessage");
    box.hidden = !text;
    box.textContent = text || "";
  }

  const DB_ICONS = {
    // молоток (ставка) и ценник (выкуп) — для бейджей цен как у DreamBid
    gavel:'<path d="M14 4l6 6"/><path d="M10 8l6 6"/><path d="M3 21l8-8"/><path d="M12 6l-4 4 6 6 4-4z"/>',
    tag:'<path d="M20.6 13.4L13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
    engine:'<path d="M5 9h2l2-2h3v2h3l2 2h2v4h-2v2h-5l-2 2H9v-4H5z"/>',
    odo:'<circle cx="12" cy="13" r="7"/><path d="M12 13l3.5-2.5M12 4v1M5 13H4M20 13h-1"/>',
    damage:'<path d="M14.5 5.6a3.4 3.4 0 0 0-.7 3.8L5 18l1 1 8.6-8.6a3.4 3.4 0 0 0 3.8-.7 3.4 3.4 0 0 0 .8-3.6l-2 2-1.8-1.8 2-2a3.4 3.4 0 0 0-1.7.5z"/>',
    doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    pin:'<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chart:'<path d="M4 19V5M4 19h16"/><path d="M7 14l3-3 3 2 4-5"/>',
    check:'<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.4 2.4 5-5"/>',
    warn:'<path d="M12 4l8.5 15H3.5z"/><path d="M12 10v4M12 16.5v.5"/>',
    q:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1 .9-1 1.6M12 16v.5"/>',
    bell:'<path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 7.5H4c0-1 2-2.5 2-7.5z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    star:'<path d="M12 4l2.3 4.9 5.2.7-3.8 3.7.9 5.2L12 16.7 7.4 18.2l.9-5.2L4.5 9.6l5.2-.7z"/>',
    vin:'<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M6 10v4M9 10v4M12 10v4M15 10v4M18 10v4"/>',
    zoom:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M11 8v6M8 11h6"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>',
    excl:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.2M12 16v.4"/>',
    dot:'<circle cx="12" cy="12" r="7.5"/><path d="M8.5 12h7"/>',
    ext:'<path d="M14 5h5v5M19 5l-7 7M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5"/>',
    copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    gem:'<path d="M5 9L12 2l7 7M5 9l7 13 7-13H5z"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l8-8M16 4l2 2M14 6l2 2"/>',
    drive:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
    fuel:'<path d="M3 22V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14"/><path d="M3 22h12"/><path d="M15 10h2a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h0a1 1 0 0 0 1-1V9l-3-3"/><path d="M3 14h12"/>',
    person:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'
  };
  function dbIco(name){
    return `<svg class="dbIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DB_ICONS[name] || ""}</svg>`;
  }
  function dbDate(value, withYear){
    if(!value) return L("Дата аукциона не назначена");
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return String(value).slice(0, 16);
    const lang = window.APEX_LANG || "ru";
    const loc = lang === "ro" ? "ro-RO" : lang === "en" ? "en-US" : "ru-RU";
    const opts = {weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"};
    if(withYear) opts.year = "numeric";
    return d.toLocaleString(loc, opts);
  }
  function dbOdo(text){
    if(!text) return "";
    const num = Number(String(text).replace(/[^\d.]/g, ""));
    if(!num) return escapeHtml(text);
    // «1 mi» — заглушка аукциона, а не реальный пробег
    if(num <= 5) return L("Пробег не указан");
    const fmt = v => Math.round(v).toLocaleString("ru-RU");
    if(/mi/i.test(text)) return `${fmt(num)} ${L("миль")} ≈ ${fmt(num * 1.609)} ${L("км")}`;
    // Канадские лоты: одометр уже в км (как на Copart CA) — показываем км, мили справочно
    return `${fmt(num)} ${L("км")} ≈ ${fmt(num / 1.609)} ${L("миль")}`;
  }
  // "Live скоро начнётся" only within 1 hour of the start; otherwise hide the line.
  function dbLive(lot){
    const s = String(lot.statusName || lot.lotStatus || "").toLowerCase();
    const dd = lot.auctionDate ? new Date(lot.auctionDate) : null;
    const upcoming = dd && !Number.isNaN(dd.getTime()) && dd.getTime() > Date.now();
    if(!upcoming && /sold|завер|not_sold/.test(s)) return ["Торги завершены", "done"];
    if(/buy/.test(s)) return ["Купить сейчас", "buy"];
    const d = lot.auctionDate ? new Date(lot.auctionDate) : null;
    if(d && !Number.isNaN(d.getTime())){
      const diff = d.getTime() - Date.now();
      if(diff <= 0 && diff > -3 * 3600 * 1000) return ["Идут торги", "live"];
      if(diff > 0 && diff <= 3600 * 1000) return ["Live скоро начнётся", "soon"];
      return ["", ""];
    }
    if(/\blive\b|active|идут/.test(s)) return ["Идут торги", "live"];
    return ["", ""];
  }
  // Condition → Russian label + tone + icon. Full AuctionsAPI enum:
  // 0 run_and_drives, 1 for_repair, 2 to_be_dismantled, 3 not_run, 4 used,
  // 5 unconfirmed, 6 engine_starts, 7 enhanced.
  function conditionInfo(raw){
    const t = String(raw || "").toLowerCase().replace(/[_-]+/g, " ").trim();
    if(!t) return {label:"—", tone:"neutral", icon:"q"};
    if(/run and drive|runs and drives|заводится и едет/.test(t))
      return {label:"Заводится и едет", tone:"good", icon:"check"};
    if(/engine start|стартует|^заводится$|заводится(?!.*едет)/.test(t))
      return {label:"Заводится", tone:"warn", icon:"excl"};
    if(/to be dismantled|dismantl|на разбор/.test(t))
      return {label:"На разбор", tone:"bad", icon:"warn"};
    if(/for repair|на запчаст|ремонт/.test(t))
      return {label:"На запчасти / ремонт", tone:"warn", icon:"excl"};
    if(/unconfirmed|не подтвержд/.test(t))
      return {label:"Не подтверждено", tone:"neutral", icon:"q"};
    if(/^used$|^б ?\/? ?у$|^used /.test(t))
      return {label:"Б/у", tone:"neutral", icon:"dot"};
    if(/enhanced|inop|non run|not run|stationary|не на ходу|не заводится/.test(t))
      return {label:"Не на ходу", tone:"neutral", icon:"q"};
    return {label: tc(raw), tone: statusTone(raw) || "neutral", icon:"q"};
  }
  // Auction brand badge — links straight to the lot on Copart/IAAI.
  function aucLinkBadge(lot){
    const a = lot.auction === "iaai" ? "iaai" : "copart";
    const word = a === "iaai" ? "IAAI" : "Copart";
    const href = lot.url || "#";
    return `<a class="aucMark aucMark--${a}" href="${escapeHtml(href)}" target="_blank" rel="noopener nofollow" title="Открыть лот ${escapeHtml(lot.lot || "")} на ${word}"><span class="aucWordV1">${word}</span>${dbIco("ext")}</a>`;
  }
  // Click-to-copy chip (VIN / lot number).
  function copyChip(value, label, cls, preIcon){
    if(!value) return `<span class="${cls}">${preIcon ? dbIco(preIcon) : ""}—</span>`;
    return `<span class="${cls} copyChipV1" role="button" tabindex="0" data-copy="${escapeHtml(value)}" title="${escapeHtml(label)}">${preIcon ? dbIco(preIcon) : ""}<span class="copyTextV1">${escapeHtml(value)}</span>${dbIco("copy")}</span>`;
  }
  function dbSpec(icon, value){
    if(!value) return "";
    return `<li>${dbIco(icon)}<span>${value}</span></li>`;
  }
  function dbCheck(label, value){
    if(value == null || value === "") return ""; // hide fields the API didn't provide
    const tone = statusTone(value) || "neutral";
    const icon = tone === "good" ? "check" : tone === "bad" ? "warn" : tone === "warn" ? "warn" : "q";
    return `<li class="dbCheck ${tone}">${dbIco(icon)}<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span></li>`;
  }
  function dbCondition(raw){
    const c = conditionInfo(raw);
    return `<li class="dbCheck ${c.tone}">${dbIco(c.icon)}<span><b>${L("Состояние:")}</b> ${escapeHtml(L(c.label))}</span></li>`;
  }
  function dbCheckFuel(raw){
    if(!raw) return "";
    const val = ruEnum(RU_FUEL, raw);
    const low = String(raw).toLowerCase();
    const tone = /electric|электро/.test(low) ? "good" : /hybrid|гибрид|phev|plug/.test(low) ? "good" : "neutral";
    return `<li class="dbCheck ${tone}">${dbIco("fuel")}<span><b>${L("Топливо:")}</b> ${escapeHtml(L(val))}</span></li>`;
  }
  function dbCheckSeller(raw){
    const val = raw ? tc(raw) : "";
    const display = val || "Неизвестен";
    const isInsurance = /страховая|insurance|geico|progressive|allstate|usaa|state farm|farmers|nationwide|liberty mutual|travelers|erie|metlife|kemper|csaa/i.test(display);
    const tone = isInsurance ? "good" : "neutral";
    return `<li class="dbCheck ${tone}">${dbIco(isInsurance ? "check" : "person")}<span><b>${L("Продавец:")}</b> ${escapeHtml(L(display).replace(/Страховая/g, L("Страховая")).replace(/^Неизвестен$/, L("Неизвестен")))}</span></li>`;
  }
  function dbCheckKey(raw){
    if(!raw) return "";
    const val = tc(raw);
    const low = val.toLowerCase();
    const isYes = /^да$|^yes$|^present$|^available$/i.test(low);
    const isNo = /^нет$|^no$|not present|not available/i.test(low);
    const tone = isYes ? "good" : isNo ? "bad" : "neutral";
    return `<li class="dbCheck ${tone}">${dbIco("key")}<span><b>${L("Ключ:")}</b> ${escapeHtml(L(val))}</span></li>`;
  }
  function dbCheckHistory(rawHistory, currentLot){
    // Запись текущих торгов (h.current) — не история продаж
    const history = (Array.isArray(rawHistory) ? rawHistory : []).filter(h => !h.current);
    const count = history.length;
    if(count === 0){
      // В списке фид отдаёт историю только ТЕКУЩЕГО номера лота; перевыставленные машины (новый номер после
      // продажи) выглядели «ранее не продавалась». Полная история по VIN — на странице лота.
      return `<li class="dbCheck neutral">${dbIco("dot")}<span><b>${L("История:")}</b> ${L("по этому лоту нет · полная — на странице лота")}</span></li>`;
    }
    const wasSold = history.some(h => { const s = String(h.status || "").toLowerCase(); return s.includes("sold") && !s.includes("not"); });
    // «Переставлялся» = были прошлые заходы на торги (по VIN). Номера лотов не сравниваем — они не идентификатор машины.
    const relisted = history.length > 0;
    const records = `${count} ${recordsWord(count)}`;
    if(wasSold){
      return `<li class="dbCheck bad">${dbIco("warn")}<span><b>${L("История:")}</b> ${escapeHtml(records)} • ${L("Был продан ранее!")}</span></li>`;
    }
    if(relisted){
      return `<li class="dbCheck bad">${dbIco("warn")}<span><b>${L("История:")}</b> ${escapeHtml(records)} • ${L("Переставлялся!")}</span></li>`;
    }
    return `<li class="dbCheck neutral">${dbIco("dot")}<span><b>${L("История:")}</b> ${escapeHtml(records)}</span></li>`;
  }

  function histStatusLabel(name){
    const t = String(name || "").toLowerCase();
    if(t.includes("sold") && !t.includes("not")) return ["Продан", "histSold"];
    if(t.includes("not_sold") || t === "not sold") return ["Не продан", "histUnsold"];
    if(t.includes("approval")) return ["На утверждении", "histPend"];
    if(t.includes("upcoming") || t.includes("future")) return ["Предстоит", "histPend"];
    if(t.includes("cancel")) return ["Отменён", "histUnsold"];
    return [name ? name.replace(/_/g, " ") : "", "histPend"];
  }

  // «Текущий заход» (не история): запись того же дня/в будущем или собственная продажа этого же лота.
  // Ранние заходы ТОГО ЖЕ номера лота — это история (перекуп выставляет один номер десятки раз).
  function sellerIsInsurance(lot){
    return /insurance/.test(String(lot.sellerType || "").toLowerCase())
      || /insurance|state farm|allstate|progressive|geico|nationwide|farmers|usaa|liberty mutual|statefarm|mapfre/i.test(String(lot.seller || ""));
  }
  function isCurrentRound(e, lot){
    if(!e) return false;
    if(e.current) return true;
    const day = String(e.date || "").slice(0, 10), curDay = String(lot.auctionDate || "").slice(0, 10);
    if(curDay && day === curDay) return true;
    if(Date.parse(e.date) > Date.now()) return true;
    return lotSaleState(lot).isSold && e.lot && String(e.lot) === String(lot.lot) && /^sold$/i.test(String(e.status || ""));
  }
  function renderPriceHistory(rawHistory, isCad, curLot){
    // Запись текущих торгов (h.current) — не история продаж: снапшоты
    // незавершённого аукциона не должны выглядеть как прошлые торги
    const history = (Array.isArray(rawHistory) ? rawHistory : []).filter(h => !h.current);
    if(!history.length) return "";
    const fmt = isCad ? moneyCad : money;
    const bids = history.map(h => Number(h.bid || h.buyNow || 0)).filter(Boolean);
    const max = Math.max(1, ...bids);
    const min = bids.length ? Math.min(...bids) : 0;
    const hi = bids.length ? Math.max(...bids) : 0;
    const rows = history.map((h, idx) => {
      const val = Number(h.bid || h.buyNow || 0);
      let [label, cls] = histStatusLabel(h.status);
      if(!val && cls === "histUnsold") label = L("Не продан · без ставок");
      if(!val && cls === "histSold") label = L("Продан · цена не указана");
      // Timed-раунд (по данным фида): «Timed · не продан $14 200» — сразу видно, что это ночной аукцион, а не живые торги.
      if(h.timed && (cls === "histUnsold" || cls === "histSold")) label = `Timed · ${label.toLowerCase()}`;
      const pct = Math.max(6, Math.round(val / max * 100));
      // Номер лота в каждой записи — ссылкой на ту продажу (как DreamBid/BidCars): машина перевыставляется под новым
      // номером (Volvo XC60: разобранной — лот 62957656, собранной — 69432156), по клику переходим к тому заходу.
      const lotNo = String(h.lot || "").replace(/[^0-9A-Za-z-]/g, "");
      const auc = String(h.auction || curLot?.auction || "").toLowerCase();
      const isCur = curLot && lotNo && String(curLot.lot) === lotNo && (!h.auction || auc === String(curLot.auction).toLowerCase());
      const lotHtml = lotNo ? (isCur ? `<span class="histLotV1 histLotCurV1">#${escapeHtml(lotNo)}</span>`
        : `<a class="histLotV1" href="/auctions/${encodeURIComponent(auc || "copart")}-${encodeURIComponent(lotNo)}">#${escapeHtml(lotNo)}${auc ? ` · ${escapeHtml(auc === "iaai" ? "IAAI" : "Copart")}` : ""}</a>`) : "";
      return `<div class="histRowV1${idx >= 12 ? " histHiddenV1" : ""}">
        <span class="histDateV1">${escapeHtml(dbDate(h.date))}${lotHtml ? `<br>${lotHtml}` : ""}</span>
        <span class="histBarWrapV1"><span class="histBarV1" style="width:${pct}%"></span></span>
        <span class="histStatusV1 ${cls}">${escapeHtml(L(label))}</span>
        <b class="histBidV1">${val ? escapeHtml(fmt(val)) : "—"}</b>
      </div>`;
    }).join("");
    const range = bids.length ? `${fmt(min)} – ${fmt(hi)}` : "";
    return `<section class="dSec">
      <div class="dSecHead">${L("История цены")} <span class="histCountV1">${history.length} ${recordsWord(history.length)}${range ? ` · ${escapeHtml(range)}` : ""}</span></div>
      <div class="histListV1">${rows}</div>
      ${history.length > 12 ? `<button type="button" class="histMoreBtnV1" data-hist-more>${escapeHtml(L("Показать все"))} (${history.length})</button>` : ""}
    </section>`;
  }

  function plural(n, one, few, many){
    const m10 = n % 10, m100 = n % 100;
    if(m10 === 1 && m100 !== 11) return one;
    if(m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  // Обратный отсчёт до торгов — только когда осталось меньше 12 часов.
  function timeLeftLabel(auctionDate){
    if(!auctionDate) return "";
    const t = new Date(auctionDate).getTime();
    if(Number.isNaN(t)) return "";
    const diff = t - Date.now();
    if(diff <= 0 || diff > 12 * 3600e3) return "";
    const h = Math.floor(diff / 3600e3);
    const m = Math.floor((diff % 3600e3) / 60e3);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Перевыставленный лот хранит finalBid прошлых торгов: если дата аукциона в будущем,
  // лот снова активен — finalBid остаётся только в истории цены, показываем current bid.
  function lotSaleState(lot){
    const t = lot.auctionDate ? new Date(lot.auctionDate).getTime() : NaN;
    const upcoming = Number.isFinite(t) && t > Date.now();
    // Явный статус sold авторитетен даже при будущей дате торгов: продажа по
    // Buy Now случается ДО запланированного аукциона. Будущая дата отменяет
    // только косвенные признаки (старый finalBid у перевыставленного лота).
    const hardSold = lot.statusId === 6 || /^sold$/i.test(lot.statusName || lot.lotStatus || "");
    // finalBid сам по себе НЕ признак продажи: фид кладёт туда последнюю ставку и непроданных раундов
    // (BMW M4 64624966: «$78 000 · not_sold» 02.09 при реальных раундах $40 500/$29 750 и текущей ставке $0).
    // Проданным считаем только по статусу.
    const soldLike = lot.statusId === 4 || /sold|not_sold|approval/i.test(lot.statusName || lot.lotStatus || "");
    const isSold = hardSold || (soldLike && !upcoming);
    const finalBid = isSold ? (lot.finalBid || lot.priceHistory?.[0]?.bid || 0) : 0;
    return {isSold, finalBid};
  }

  function renderCard(lot, idx){
    const title = lotTitle(lot);
    const [liveLabel, liveTone] = dbLive(lot);
    const isNew = /upcoming|new/i.test(lot.lotStatus || "");
    const hpStr = Number(lot.horsePower) > 0 ? `${lot.horsePower} ${L("л.с.")}` : "";
    const engineLine = [cleanEngine(lot.engine), hpStr, upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" • ");
    const estimate = lot.estimatedRetailValue ? money(lot.estimatedRetailValue) : "";
    const {isSold, finalBid: effectiveFinalBid} = lotSaleState(lot);
    // Во вкладке «Купить сейчас» (и когда реальной ставки нет) показываем цену
    // выкупа, а не номинальную стартовую ставку ($25/$50) — иначе Buy Now лоты
    // выглядят копеечными, хотя выкуп стоит тысячи.
    const showBuyNow = !isSold && Number(lot.buyNow) > 0 && (state.tab === "buy_now" || !Number(lot.currentBid));
    const priceVal = isSold && effectiveFinalBid ? effectiveFinalBid : (showBuyNow ? lot.buyNow : (lot.currentBid || lot.buyNow));
    const priceLabel = isSold && effectiveFinalBid ? "Финальная цена"
      : showBuyNow ? "Купить сейчас" : "Текущая цена";
    // Канадские площадки торгуют в CAD
    const price = findCanadaLocation(lot) ? moneyCad(priceVal) : money(priceVal);
    const photos = lot.photoCount || lot.images?.length || 1;
    return `<article class="dbCard">
      <div class="dbPhoto" data-lid="${escapeHtml(String(lot.id))}">
        <a class="dbPhotoLink" href="${detailHref(lot)}">
          ${lot.image ? `<img src="${escapeHtml(cardImg(lot.image))}" data-full="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" ${idx < 2 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" class="dbSlideImg">` : `<span class="dbNoPhoto">${L("Нет фото")}</span>`}
        </a>
        <span class="dbBadgesRowV3"><span class="dbAuc">${escapeHtml(lot.auction.toUpperCase())}</span>${lot.video ? `<span class="dbVideoBadgeV3">▶ ${L("Видео")}</span>` : ""}</span>
        <span class="dbPhotoCount">1/${escapeHtml(String(photos))}</span>
        ${Number(priceVal) > 0 ? `<span class="dbPhotoPrice${isSold ? " dbPhotoPriceSold" : ""}">${price}</span>` : ""}
        <span class="dbFav${favHas(lot.id) ? " is-fav" : ""}" role="button" data-fav="${escapeHtml(lot.id)}" title="В избранное">${dbIco("star")}</span>
        ${alertable(lot) ? `<span class="dbBell${alertLots().has(String(lot.id)) ? " is-on" : ""}" role="button" data-alert-lot="${escapeHtml(lot.id)}" title="${escapeHtml(L("Следить за лотом"))}">${dbIco("bell")}</span>` : ""}
        ${photos > 1 ? `<button class="dbSlideBtn dbSlidePrev" type="button" aria-label="Предыдущее фото" data-dir="-1">‹</button><button class="dbSlideBtn dbSlideNext" type="button" aria-label="Следующее фото" data-dir="1">›</button>` : ""}
      </div>
      <div class="dbBody">
        <a class="dbTitle" href="${detailHref(lot)}">${escapeHtml(title)}</a>
        <div class="dbMobMetaV1">
          <span class="dbMobDateV1">${dbIco("calendar")}${escapeHtml(dbDate(lot.auctionDate))}</span>
          ${Number(priceVal) > 0 || lot.auctionDate || isSold ? `<span class="dbMobPriceV1">${L(priceLabel)}: <b>${Number(priceVal) > 0 ? price : L("ставок пока нет")}</b></span>` : ""}
          <div class="dbForecastV1 dbMobForecastV1" data-forecast="${escapeHtml(lot.id)}" hidden></div>
        </div>
        <div class="dbCols">
          <div class="dbLeftCol">
            <div class="dbIds">
              ${copyChip(lot.vin, "Скопировать VIN", "dbVin", "vin")}
              ${isNew ? `<span class="dbNew">Новый лот</span>` : ""}
            </div>
            <ul class="dbSpecs">
              ${dbSpec("engine", escapeHtml(engineLine))}
              ${dbSpec("odo", dbOdo(lot.odometerText))}
              ${dbSpec("damage", escapeHtml(ruDamage(lot.damage)))}
              ${dbSpec("doc", escapeHtml(docShort(lot.document)))}
              ${dbSpec("pin", escapeHtml(lotLocationText(lot)))}
            </ul>
          </div>
          <div class="dbChecksCol">
            <div class="dbLotRowV1">
              ${copyChip(lot.lot, "Скопировать номер лота", "dbLotNo", "")}
              ${aucLinkBadge(lot)}
            </div>
            <ul class="dbChecks">
              ${dbCondition(lot.condition)}
              ${dbCheckFuel(lot.fuel)}
              ${dbCheckSeller(lot.seller)}
              ${dbCheckKey(lot.keys)}
              ${dbCheckHistory(lot.priceHistory, lot.lot)}
            </ul>
          </div>
        </div>
        <button class="dbExpandV1" type="button">Развернуть</button>
      </div>
      <aside class="dbAside">
        <div class="dbWhen">
          <span>${dbIco("calendar")}${escapeHtml(dbDate(lot.auctionDate))}</span>
          ${(() => { const tl = isSold ? "" : timeLeftLabel(lot.auctionDate); return tl ? `<span class="dbCountdownV1${new Date(lot.auctionDate).getTime() - Date.now() < 6*3600e3 ? " dbCountdownSoonV1" : ""}">${dbIco("clock")}${tl}</span>` : ""; })()}
          ${liveLabel ? `<span class="dbLive ${liveTone}">${dbIco("clock")}${escapeHtml(liveLabel)}</span>` : ""}
        </div>
        <div class="dbPriceWrap">
          <div class="dbPriceBox${isSold ? " dbPriceSold" : ""}">
            <span>${priceLabel}</span>
            ${Number(priceVal) > 0 ? `<b>${price}</b>` : `<b class="dbNoBidV1">${L(lot.auctionDate || isSold ? "ставок пока нет" : "Дата аукциона не назначена")}</b>`}
            <div class="dbForecastV1 dbForecastInPriceV1" data-forecast="${escapeHtml(lot.id)}" hidden></div>
          </div>
          ${(() => { const t = Number(lot.sellerReserve) > 0 && !isSold ? (lot.timed ? "Timed аукцион" : "") : lot.saleStatus; return t ? `<div class="dbSale ${saleClass(t)}">${escapeHtml(t)}</div>` : ""; })()}
          ${Number(lot.sellerReserve) > 0 && !isSold ? `<div class="dbReserveV1">${L("Резерв продавца")}: <b>${money(lot.sellerReserve)}</b></div>` : ""}
        </div>
      </aside>
    </article>`;
  }

  // ---- Прогноз финальной ставки (вилка, как у DreamBid/BidCars) ----
  // Считаем из нашей рыночной статистики проданных лотов: тот же год модели,
  // при известном двигателе — точная строка по двигателю. Кеш на сессию.
  const statsCache = {};
  function statsRowsFor(makeId, modelId){
    const key = `${makeId}:${modelId}`;
    if(!statsCache[key]){
      statsCache[key] = api(`/api/auctions?action=statistics&manufacturer_id=${encodeURIComponent(makeId)}&model_id=${encodeURIComponent(modelId)}`)
        .then(r => Array.isArray(r.stats) ? r.stats : [])
        .catch(() => { delete statsCache[key]; return []; });
    }
    return statsCache[key];
  }
  function forecastFromRows(rows, lot, tol = 0){
    const yr = Number(lot.year) || 0;
    let scope = yr ? rows.filter(x => Math.abs(Number(x.year) - yr) <= tol) : rows;
    if(!scope.length) return null;
    const byEngine = lot.engineId ? scope.filter(x => x.engine && Number(x.engine.id) === Number(lot.engineId)) : [];
    if(byEngine.length) scope = byEngine;
    let sumW = 0, cnt = 0;
    scope.forEach(x => {
      const c = Number(x.lot_count) || 0, avg = Number(x.avg_final_bid) || 0;
      if(avg > 0 && c > 0){ sumW += avg * c; cnt += c; }
    });
    if(cnt < 2) return null;
    const avg = sumW / cnt;
    return {lo:Math.round(avg * 0.8 / 50) * 50, hi:Math.round(avg * 1.15 / 50) * 50, cnt};
  }
  // Параметры comps для лота — те же, что на странице лота: год, пробег, топливо,
  // поколение, run (1/0) и cq (good/mid/poor) по состоянию и повреждениям.
  function compsParamsFor(lot){
    const cp = new URLSearchParams({action:"comps", manufacturer_id:String(lot.makeId), model_id:String(lot.modelId)});
    if(lot.year) cp.set("year", String(lot.year));
    if(lot.odometer) cp.set("odometer", String(lot.odometer));
    if(lot.fuel) cp.set("fuel", String(lot.fuel));
    if(lot.generationId) cp.set("generation_id", String(lot.generationId));
    const ci = conditionInfo(lot.condition);
    const runFlag = ci.tone === "good" ? "1" : ci.tone === "bad" ? "0" : "";
    if(runFlag) cp.set("run", runFlag);
    const dmgTxt = `${lot.primaryDamage || ""} ${lot.secondaryDamage || ""} ${lot.damage || ""}`.toLowerCase();
    const heavyDmg = /all over|roll ?over|undercarriage|frame|burn|flood|water|strip|biohazard/.test(dmgTxt);
    const multiDmg = /&|,|\band\b|\+/.test(dmgTxt) || (lot.secondaryDamage && lot.secondaryDamage !== "-" && !/unknown|none|normal/.test(String(lot.secondaryDamage).toLowerCase()));
    let cq = "mid";
    if(ci.tone === "good" && !heavyDmg && !multiDmg) cq = "good";
    else if(ci.tone === "bad" || heavyDmg) cq = "poor";
    cp.set("cq", cq);
    // Данные для «ориентира ставки» (формула: база × K × коэффициент состояния считается на сервере).
    const dParts = String(lot.damage || "").split(/\s+\/\s+/);
    const d1 = lot.primaryDamage || dParts[0] || "", d2 = lot.secondaryDamage || dParts[1] || "";
    if(d1) cp.set("dmg", String(d1).slice(0, 60));
    if(d2 && d2 !== "-") cp.set("dmg2", String(d2).slice(0, 60));
    if(lot.condition) cp.set("cond", String(lot.condition).slice(0, 40));
    if(lot.document) cp.set("doc", String(lot.document).slice(0, 60));
    if(lot.make) cp.set("make_name", String(lot.make).slice(0, 40));
    if(lot.model) cp.set("model_name", String(lot.model).slice(0, 40));
    if(lot.title) cp.set("title", String(lot.title).slice(0, 80));
    if(lot.generationName) cp.set("gen", String(lot.generationName).slice(0, 60));
    return cp;
  }
  const compsCache = {};
  // Прогноз для карточки: comps (поколение, состояние, вес по году/пробегу, без
  // утиля, только завершённые торги) → диапазон p25–p75. Если своего поколения
  // мало (<4 продаж) — агрегат по году (точный год, затем ±1).
  async function forecastForLot(lot){
    const cp = compsParamsFor(lot); const key = cp.toString();
    if(!compsCache[key]) compsCache[key] = api(`/api/auctions?${cp}`).catch(() => null);
    const cr = await compsCache[key];
    const c = cr && cr.ok && cr.comps;
    if(c && c.guide && c.p25 > 0) return {lo:c.p25, hi:c.p75, src:"guide", guide:true};
    if(c && c.count && c.p25 > 0 && c.p75 >= c.p25) return {lo:c.p25, hi:c.p75, src:"comps"};
    const rows = await statsRowsFor(lot.makeId, lot.modelId);
    const f = forecastFromRows(rows, lot, 0) || forecastFromRows(rows, lot, 1);
    return f ? {lo:f.lo, hi:f.hi, src:"stats"} : null;
  }
  // Липкая панель на телефоне: вместо названия (оно и так в шапке) — итог «под ключ» из
  // калькулятора лота; тап по нему прокручивает к расчёту. Главная цифра страницы была на 3-м экране.
  function syncStickyTotal(){
    const box = document.getElementById("lotStickyTotalV1");
    const src = document.getElementById("lotCalcTotal");
    if(!box || !src) return;
    const txt = (src.textContent || "").trim();
    const ok = /\d/.test(txt);
    box.hidden = !ok;
    if(ok) box.querySelector("b").textContent = txt;
    const title = box.parentElement && box.parentElement.querySelector(".lotStickyTitleV1");
    if(title) title.hidden = ok;
  }
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("[data-sticky-calc]");
    if(!b) return;
    const calc = document.querySelector("#auctionDetail .lotCalcV2");
    if(calc) calc.scrollIntoView({behavior:"smooth", block:"start"});
  });

  // История по VIN для карточек на странице (пачкой). Строка «История» в карточке
  // перерисовывается по VIN-данным: «продавалась N раз · последняя $X (MM/YY)».
  // Живые ставка и резерв для карточек на странице: база обновляется с лагом (Tesla: в базе $13 500,
  // на IAAI уже $17 200, резерв появился после синка). Пачкой ≤30 лотов через action=livebids.
  async function updateCardLiveBids(){
    const cards = [...document.querySelectorAll("#auctionCards .dbCard")];
    const byId = new Map(state.items.map(l => [String(l.id), l]));
    const ids = cards.map(cd => cd.querySelector(".dbPhoto")?.dataset.lid).filter(id => byId.has(String(id)) && !lotSaleState(byId.get(String(id))).isSold);
    if(!ids.length) return;
    let live = {};
    try{ const r = await api(`/api/auctions?action=livebids&ids=${encodeURIComponent(ids.slice(0, 30).join(","))}`); live = r.items || {}; }catch(e){ return; }
    let healed = false;
    cards.forEach(cd => {
      const lid = cd.querySelector(".dbPhoto")?.dataset.lid; const lot = byId.get(String(lid)); const lv = live[lid];
      if(!lot || !lv) return;
      Object.assign(lot, {currentBid:lv.currentBid, buyNow:lv.buyNow, sellerReserve:lv.sellerReserve, saleStatus:lv.saleStatus || lot.saleStatus, timed:lv.timed});
      // Данные самого лота расходятся со списком: лот уже продан, либо торги перенесены — перерисовываем карточку и лечим базу.
      const liveMs = Date.parse(lv.auctionDate || ""), listMs = Date.parse(lot.auctionDate || "");
      const dateMoved = Number.isFinite(liveMs) && Number.isFinite(listMs) && Math.abs(liveMs - listMs) > 2 * 3600e3;
      if(lv.sold || dateMoved){
        Object.assign(lot, {auctionDate:lv.auctionDate || lot.auctionDate}, lv.sold ? {statusId:6, statusName:"sold", lotStatus:"sold", finalBid:lv.finalBid || lv.currentBid} : {});
        // Текущие вкладки показывают только актуальные торги: сыгравший лот убираем (в «Архиве»/«Избранном» и при поиске по VIN/номеру — оставляем как «продан»).
        const keepSold = ["archived", "favorites"].includes(state.tab) || !!String($("#auctionSmartSearch")?.value || "").trim();
        if(lv.sold && !keepSold){
          cd.classList.add("dbCardGoneV1");
          setTimeout(() => { try{ cd.remove(); }catch(e){} }, 350);
          const ix = state.items.indexOf(lot); if(ix >= 0) state.items.splice(ix, 1);
        }else{
          try{ cd.insertAdjacentHTML("afterend", renderCard(lot)); cd.remove(); }catch(e){}
        }
        api(`/api/auctions?action=detail&auction=${encodeURIComponent(lot.auction)}&lot=${encodeURIComponent(lot.lot)}&fresh=1`).catch(() => {});
        healed = true;
        return;
      }
      const box = cd.querySelector(".dbPriceBox b"); const isCa = !!findCanadaLocation(lot);
      const v = lv.currentBid || (state.tab === "buy_now" ? lv.buyNow : 0);
      if(box && v > 0){ box.textContent = isCa ? moneyCad(v) : money(v); box.classList.remove("dbNoBidV1"); }
      const photoPrice = cd.querySelector(".dbPhotoPrice"); if(photoPrice && v > 0) photoPrice.textContent = isCa ? moneyCad(v) : money(v);
      const mob = cd.querySelector(".dbMobPriceV1 b"); if(mob && v > 0) mob.textContent = isCa ? moneyCad(v) : money(v);
      const wrap = cd.querySelector(".dbPriceWrap"); let res = cd.querySelector(".dbReserveV1");
      if(lv.sellerReserve > 0 && wrap){
        if(!res){ res = document.createElement("div"); res.className = "dbReserveV1"; const sale = cd.querySelector(".dbSale"); (sale || cd.querySelector(".dbPriceBox")).insertAdjacentElement("afterend", res); }
        res.innerHTML = `${L("Резерв продавца")}: <b>${isCa ? moneyCad(lv.sellerReserve) : money(lv.sellerReserve)}</b>`;
      }
    });
    if(healed) idle(updateCardVinHistory);
  }
  const vinHistCache = {}, vinRetryN = {};
  // «Назад в каталог»: место, откуда открыли лот (фильтры/страница — в URL, положение прокрутки — здесь и в sessionStorage).
  const BACK_KEY = "apexBackV1", BACK_FLAG = "apexBackFlag";
  let pendingScrollRestore = null;
  const catalogSeo = {title:document.title, desc:document.querySelector('meta[name="description"]')?.getAttribute("content") || ""};
  function saveBackSnap(){
    const snap = {href:location.pathname + location.search, y:Math.round(window.scrollY), t:Date.now()};
    state.backSnap = snap;
    try{ sessionStorage.setItem(BACK_KEY, JSON.stringify(snap)); }catch(e){}
  }
  function readBackSnap(){
    try{ const v = JSON.parse(sessionStorage.getItem(BACK_KEY) || "null"); return v && Date.now() - v.t < 6 * 3600e3 ? v : null; }catch(e){ return null; }
  }
  // Каталог остался в DOM (лот открывали без перезагрузки) — просто показываем его на прежнем месте
  function showCatalogAgain(){
    const snap = state.backSnap || readBackSnap();
    const det = $("#auctionDetail");
    if(det){ det.hidden = true; det.innerHTML = ""; }
    $("#auctionCatalog").hidden = false;
    document.title = catalogSeo.title;
    const md = document.querySelector('meta[name="description"]'); if(md && catalogSeo.desc) md.setAttribute("content", catalogSeo.desc);
    const y = snap ? snap.y : 0;
    window.scrollTo(0, y);
    setTimeout(() => window.scrollTo(0, y), 150);   // картинки подгрузились и чуть сдвинули вёрстку
    state.backSnap = null;
  }
  async function updateCardVinHistory(){
    const cards = [...document.querySelectorAll("#auctionCards .dbCard")];
    const byId = new Map(state.items.map(l => [String(l.id), l]));
    const need = [];
    cards.forEach(card => {
      const lid = card.querySelector(".dbPhoto")?.dataset.lid;
      const lot = byId.get(String(lid));
      if(lot && lot.vin && lot.vin.length === 17 && vinHistCache[lot.vin] === undefined) need.push(lot.vin);
    });
    const uniq = [...new Set(need)];
    for(let i = 0; i < uniq.length; i += 30){
      try{
        const r = await api(`/api/auctions?action=vinhist&vins=${encodeURIComponent(uniq.slice(i, i + 30).join(","))}`);
        Object.assign(vinHistCache, r.items || {});
      }catch(e){ uniq.slice(i, i + 30).forEach(v => { vinHistCache[v] = null; }); }
    }
    // Не получилось узнать историю (фид не ответил) — пробуем ещё пару раз, а не оставляем карточку «неизвестной»
    const retry = uniq.filter(v => vinHistCache[v] === null && ((vinRetryN[v] = (vinRetryN[v] || 0) + 1) <= 2));
    if(retry.length) setTimeout(() => { retry.forEach(v => { delete vinHistCache[v]; }); updateCardVinHistory(); }, 6000);
    cards.forEach(card => {
      const lid = card.querySelector(".dbPhoto")?.dataset.lid;
      const lot = byId.get(String(lid)); if(!lot || !lot.vin) return;
      const h = vinHistCache[lot.vin]; if(!h) return;
      const li = [...card.querySelectorAll(".dbChecks li")].find(x => /История/.test(x.textContent));
      if(!li) return;
      // Прошлые заходы = записи ДРУГИХ лотов (текущий номер — это текущие/эти торги, не «ранее»).
      const curDay = String(lot.auctionDate || "").slice(0, 10);
      const entries = Array.isArray(h.entries) ? h.entries : [];
      const past = entries.filter(e => !isCurrentRound(e, lot));
      const pastSold = past.filter(e => e.status === "sold");
      const fmt = d => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toLocaleDateString(window.APEX_LANG === "ro" ? "ro-RO" : window.APEX_LANG === "en" ? "en-GB" : "ru-RU", {day:"numeric", month:"short", year:"numeric"}) : d; };
      const {isSold} = lotSaleState(lot);
      if(!past.length){
        li.className = "dbCheck good";
        li.innerHTML = `${dbIco("check")}<span><b>${L("История:")}</b> ${isSold ? L("Единственная продажа") : L("Ранее не продавалась")}</span>`;
        return;
      }
      if(pastSold.length){
        const last = pastSold[0];
        // Продажа под другим лотом ПОЗЖЕ этих торгов (старый заход разобранной машины в архиве) — это «перевыставлена», не «ранее».
        const laterSale = curDay && String(last.date).slice(0, 10) > curDay;
        const ph = card.querySelector(".dbPhoto");
        if(ph && !ph.querySelector(".simResoldV1")) ph.insertAdjacentHTML("beforeend", `<span class="simResoldV1 dbResoldV1">${dbIco("warn")}${laterSale ? L("Перевыставлена") : L("Продан ранее")}</span>`);
        li.className = "dbCheck bad";
        li.innerHTML = `${dbIco("warn")}<span><b>${L("История:")}</b> ${laterSale ? L("Продана позже под другим лотом") : L("Продавалась ранее")}: ${last.bid ? money(last.bid) : L("цена не указана")} · ${fmt(last.date)}${pastSold.length > 1 ? ` (${pastSold.length} ${L("продажи")})` : ""}${!laterSale && !sellerIsInsurance(lot) ? ` · ${L("Перекуп")}` : ""}</span>`;
      }else{
        li.className = "dbCheck neutral";
        li.innerHTML = `${dbIco("dot")}<span><b>${L("История:")}</b> ${L("Выставлялась ранее")}: ${past.length} ${recordsWord(past.length)}, ${L("не продана")}</span>`;
      }
    });
  }

  // Прогноз только для 2017+ (старше — не интересно) и только для непроданных.
  const FORECAST_MIN_YEAR = 2017;
  // Поля для оценки лота — то же, что compsParamsFor, но ПЛОСКИМ объектом (для JSON-батча).
  function compsFieldsFor(lot){
    const cp = compsParamsFor(lot);
    const o = {}; for(const [k, v] of cp.entries()) o[k] = v;
    if(lot.engineId) o.engine_id = String(lot.engineId);
    return o;
  }
  // 23.09.2026: раньше каждая карточка тянула /api/auctions?action=comps СВОИМ запросом — на
  // странице с 30 лотами это до 19 живых HTTP-запросов подряд (~6с, пока не досчитаются все).
  // Один POST на весь видимый экран — как уже сделано для vinhist/livebids.
  async function updateCardForecasts(){
    const nodes = [...document.querySelectorAll("[data-forecast]")];
    if(!nodes.length) return;
    const byId = new Map(state.items.map(l => [String(l.id), l]));
    const jobs = [];
    nodes.forEach(node => {
      const lot = byId.get(node.dataset.forecast);
      if(!lot || !lot.makeId || !lot.modelId) return;
      if((Number(lot.year) || 0) < FORECAST_MIN_YEAR) return;
      if(lotSaleState(lot).isSold) return;
      jobs.push({node, lot});
    });
    if(!jobs.length) return;
    const items = jobs.map(({lot}) => ({id:String(lot.id), ...compsFieldsFor(lot)}));
    let results = {};
    try{
      const r = await api("/api/auctions?action=compsbatch", {method:"POST", body:{items}});
      results = (r && r.items) || {};
    }catch(e){ return; }
    jobs.forEach(({node, lot}) => {
      const c = results[String(lot.id)]; if(!c || !document.body.contains(node)) return;
      // Зеркало старого forecastForLot: guide (таблица Федора) → comps (похожие продажи) → stats (агрегат).
      const f = (c.guide && c.p25 > 0) ? {lo:c.p25, hi:c.p75, src:"guide", guide:true}
        : c.src === "stats" ? {lo:c.p25, hi:c.p75, src:"stats"}
        : (c.count && c.p25 > 0 && c.p75 >= c.p25) ? {lo:c.p25, hi:c.p75, src:"comps"}
        : null;
      if(!f || !(f.hi >= f.lo)) return;
      const lo = f.guide ? f.lo : Math.floor(f.lo / 500) * 500, hi = f.guide ? f.hi : Math.max(round500(f.hi), lo + 500);
      // Ставка или резерв продавца уже выше вилки → оценка опровергнута рынком, не показываем (2026 Tesla: ставка $22.5k при «$15–17k»).
      if(Number(lot.currentBid) > hi || Number(lot.sellerReserve) > hi) return;
      node.innerHTML = `<span class="dbForecastLabV1">${dbIco("chart")}${L("Ориентир")}</span><b>${money(lo)} – ${money(hi)}</b>`;
      node.dataset.src = f.src;
      node.hidden = false;
    });
  }

  // ---- Счётчики лотов на вкладках (как у BidCars) ----
  let tabCountSeq = 0;
  async function updateTabCounts(){
    const seq = ++tabCountSeq;
    const base = formParams();
    base.delete("tab"); base.delete("page"); base.set("per_page", "1");
    const setBadge = (tab, total) => {
      const btn = document.querySelector(`[data-tab="${tab}"]`);
      if(!btn) return;
      let badge = btn.querySelector(".tabCountV1");
      if(!badge){ badge = document.createElement("span"); badge.className = "tabCountV1"; btn.appendChild(badge); }
      badge.textContent = total ? (total > 999 ? `${Math.round(total / 1000)}k` : String(total)) : "";
    };
    // Без фильтров и по всем площадкам — одним запросом action=count (те же числа, что в заголовке),
    // вместо трёх поисков: меньше нагрузки на базу, и вкладки не расходятся с заголовком.
    const fp = new URLSearchParams(base); ["auction","sort","per_page"].forEach(k => fp.delete(k));
    if(![...fp.keys()].length && (base.get("auction") || "all") === "all"){
      try{
        const c = await api("/api/auctions?action=count");
        if(seq !== tabCountSeq) return;
        if(c && c.total > 0){ setBadge("soon", Number(c.soon) || 0); setBadge("buy_now", Number(c.buyNow) || 0); setBadge("archived", Number(c.archived) || 0); return; }
      }catch(e){ /* ниже — обычный путь */ }
    }
    // С фильтрами/площадкой бейджи не считаем: три отдельных запроса шли из разных источников (база/живой фид)
    // и давали «Архив 168» рядом с «170 903» в шапке. Убираем бейджи, чтобы не врать.
    if(true){ ["soon","buy_now","archived"].forEach(tab => { const b = document.querySelector(`[data-tab="${tab}"] .tabCountV1`); if(b) b.remove(); }); return; }
    await Promise.all(["soon","buy_now","archived"].map(async tab => {   // «Завершенные» убраны 15.09.2026: 99% совпадали с архивом
      try{
        const p = new URLSearchParams(base);
        p.set("tab", tab);
        const r = await api(`/api/auctions?action=search&${p}`);
        if(seq !== tabCountSeq) return; // фильтры уже сменились
        const btn = document.querySelector(`[data-tab="${tab}"]`);
        if(!btn) return;
        let badge = btn.querySelector(".tabCountV1");
        if(!badge){ badge = document.createElement("span"); badge.className = "tabCountV1"; btn.appendChild(badge); }
        const total = Number(r.total) || 0;
        badge.textContent = total ? (total > 999 ? `${Math.round(total / 1000)}k` : String(total)) : "";
      }catch(e){ /* счётчики — украшение */ }
    }));
  }

  function matchSale(lot, sale){
    const list = Array.isArray(sale) ? sale : (sale ? String(sale).split(",") : []);
    if(!list.length) return true;
    return list.some(x => x === "timed" ? !!lot.timed
      : x === "on_approval" ? (lot.statusId === 4 || /approval/i.test(lot.statusName || ""))
      : lot.saleStatusKey === x);
  }

  function matchDateRange(lot, dateFrom, dateTo){
    if(!dateFrom && !dateTo) return true;
    if(!lot.auctionDate) return !dateFrom; // undated lots: show only when no "from" is set
    const lotDay = String(lot.auctionDate).slice(0, 10); // "YYYY-MM-DD"
    if(dateFrom && lotDay < dateFrom) return false;
    if(dateTo   && lotDay > dateTo)   return false;
    return true;
  }

  function skeletonCards(n = 6){
    const one = `<article class="dbCard dbSkelV1">
      <div class="dbPhoto skBoxV1"></div>
      <div class="dbBody">
        <div class="skLineV1 skW60"></div>
        <div class="skLineV1 skW40"></div>
        <div class="dbCols">
          <ul class="dbSpecs">${"<li><span class='skLineV1 skW80'></span></li>".repeat(5)}</ul>
          <ul class="dbChecks">${"<li><span class='skLineV1 skW80'></span></li>".repeat(4)}</ul>
        </div>
      </div>
      <aside class="dbAside"><div class="skLineV1 skW80"></div><div class="dbPriceBox skBoxV1" style="height:60px"></div></aside>
    </article>`;
    return one.repeat(n);
  }

  // Чипы поколений над выдачей при выбранной модели — как у DreamBid:
  // один клик вместо похода в фильтры. Повторный клик по активному чипу снимает фильтр.
  const genChipsCache = {};
  async function updateGenChips(){
    let box = document.getElementById("genChipsV1");
    const modelId = document.getElementById("filterModelIdV2")?.value || "";
    if(!modelId || /,/.test(modelId)){ if(box) box.remove(); return; }
    if(!box){
      box = document.createElement("div");
      box.id = "genChipsV1";
      box.className = "genChipsV1";
      const cards = document.getElementById("auctionCards");
      if(!cards) return;
      cards.parentNode.insertBefore(box, cards);
    }
    try{
      if(!genChipsCache[modelId]){
        const r = await api(`/api/auctions?action=generations&model_id=${encodeURIComponent(modelId)}`);
        genChipsCache[modelId] = r.items || [];
      }
      const gens = genChipsCache[modelId];
      if(gens.length < 2){ box.remove(); return; }
      if((document.getElementById("filterModelIdV2")?.value || "") !== modelId) return; // модель сменили, пока грузили
      const activeGen = document.getElementById("filterGenIdV2")?.value || "";
      box.innerHTML = gens.map(g => `<button type="button" class="genChipV1${String(g.id) === activeGen ? " isActiveGenV1" : ""}" data-gen-id="${escapeHtml(String(g.id))}" data-gen-name="${escapeHtml(g.name || "")}">${escapeHtml(g.name || "")}${g.qty ? `<i>${escapeHtml(String(g.qty))}</i>` : ""}</button>`).join("");
    }catch(e){ /* чипы — необязательный блок */ }
  }

  // Пагинация по ВСЕМУ каталогу: страница = запрос к серверу (30 лотов, уже отсортированных
  // по всей выборке). Раньше грузили 100 лотов и строили «страницы 1–4» только из них —
  // казалось, что каталог и сортировка — это пара страниц, остальное пряталось за «Показать ещё».
  // Исключение — фильтры, которые применяются в браузере (статус продажи, диапазон дат): там
  // по-прежнему берём пачки по 100 и листаем загруженное.
  const SERVER_PAGE_SIZE = 30, MAX_SERVER_PAGES = 400;
  // 23.09.2026: статус продажи (Timed / без резерва / на утверждении) и диапазон дат фильтруются НА СЕРВЕРЕ по всей базе
  // (searchFromDb), с честным total и пагинацией, а сортировка работает по всему отфильтрованному каталогу. Раньше эти фильтры
  // шли «клиентскими»: тянули пачки по 100 лотов и сортировали только внутри загруженных — «сортировка по паре страниц».
  // renderCards по-прежнему подстраховывает клиентским фильтром (live-фолбэк, когда база недоступна), но пагинация — серверная.
  function clientFilterActive(){ return false; }
  function isServerPaging(){ return state.tab !== "favorites" && !clientFilterActive(); }

  function renderCards(){
    const box = $("#auctionCards");
    const sale     = [...document.querySelectorAll('input[name="saleStatus"]:checked')].map(x => x.value);
    const dateFrom = document.querySelector('input[name="auctionDateFrom"]')?.value || "";
    const dateTo   = document.querySelector('input[name="auctionDateTo"]')?.value || "";
    const filtered = state.items.filter(lot => matchSale(lot, sale) && matchDateRange(lot, dateFrom, dateTo));
    state.filteredCount = filtered.length;
    const start = (state.displayPage - 1) * state.displayPageSize;
    const pageItems = filtered.slice(start, start + state.displayPageSize);
    box.innerHTML = pageItems.map(renderCard).join("");
    if(sale.length && !isServerPaging()){
      setResultNum("");
      $("#auctionResultLabel").textContent = `${L("Показано")} ${filtered.length} (${L("фильтр статуса продажи")})`;
    }
    renderPagination();
  }

  function renderPagination(){
    const box = document.getElementById("paginationV1");
    if(!box) return;
    const server = isServerPaging();
    const totalPages = server
      ? Math.min(MAX_SERVER_PAGES, Math.max(Math.ceil((state.total || 0) / SERVER_PAGE_SIZE), state.hasMore ? state.page + 1 : state.page))
      : Math.ceil(state.filteredCount / state.displayPageSize);
    const showPageNums = totalPages > 1;
    if(!showPageNums && !state.hasMore){ box.hidden = true; return; }
    box.hidden = false;
    let html = "";
    if(showPageNums){
      const p = server ? state.page : state.displayPage;
      const vis = new Set([1, totalPages]);
      for(let i = Math.max(1, p - 2); i <= Math.min(totalPages, p + 2); i++) vis.add(i);
      const pages = [...vis].sort((a, b) => a - b);
      html += `<button class="pgBtnV1 pgNavV1"${p === 1 ? " disabled" : ""} data-page="${p - 1}">&#8249;</button>`;
      let prev = 0;
      for(const num of pages){
        if(num - prev > 1) html += `<span class="pgEllipsisV1">…</span>`;
        html += `<button class="pgBtnV1${num === p ? " pgActiveV1" : ""}" data-page="${num}">${num}</button>`;
        prev = num;
      }
      html += `<button class="pgBtnV1 pgNavV1"${p === totalPages ? " disabled" : ""} data-page="${p + 1}">&#8250;</button>`;
    }
    if(state.hasMore && !server){
      html += `<button class="pgLoadMoreBtnV1" id="pgLoadMoreBtn"${state.loading ? " disabled" : ""}>Показать ещё лоты</button>`;
    }
    box.innerHTML = html;
  }

  // Demo lots so the catalog is reviewable on localhost without AUCTIONS_API_KEY.
  function isLocalHost(){ return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname); }
  function demoLots(){
    const base = o => Object.assign({
      id:"", auction:"copart", year:"", make:"", model:"", vin:"", lot:"", engine:"", drive:"",
      transmission:"", odometerText:"", damage:"", document:"", location:"", condition:"", seller:"",
      keys:"", priceHistory:[], photoCount:6, lotStatus:"upcoming", saleStatus:"На утверждении",
      currentBid:0, buyNow:0, estimatedRetailValue:0, auctionDate:"2026-06-24T19:30:00", image:""
    }, o);
    return [
      base({id:"demo1", year:"2017", make:"Ford", model:"Mustang EcoBoost", vin:"1FA6P8TH7H5205020", lot:"44500315", engine:"I4", drive:"RWD", transmission:"AT", odometerText:"105,000 mi", damage:"Front End / Bio-Chemical", document:"CA • Salvage", location:"Wilmington, CA", condition:"Не на ходу", seller:"Allied Solutions", keys:"Да", currentBid:1050, estimatedRetailValue:5500, image:"/assets/hot-bmw-5.png"}),
      base({id:"demo2", year:"2019", make:"Land Rover", model:"Range Rover Sport", vin:"SALWR2RE8KA828197", lot:"42923654", engine:"5.0L V8", drive:"4×4", transmission:"AT", odometerText:"78,000 mi", damage:"Front End", document:"CA • Salvage", location:"Los Angeles, CA", condition:"Заводится и едет", seller:"Progressive Insurance", keys:"Да", currentBid:15100, estimatedRetailValue:26000, image:"/assets/hot-bmw-x5.png"}),
      base({id:"demo3", year:"2021", make:"Mercedes-Benz", model:"E-Class", vin:"W1KZF8DB4MA948271", lot:"44758603", engine:"2.0L", drive:"RWD", transmission:"AT", odometerText:"41,000 mi", damage:"Rear End", document:"CA • Salvage", location:"Los Angeles, CA", condition:"Заводится и едет", seller:"GEICO", keys:"Да", currentBid:9800, estimatedRetailValue:21000, saleStatus:"Без резерва", image:"/assets/hot-mercedes-e.png"})
    ];
  }

  // Число в подзаголовке рядом с "лотов найдено/доступно" — отдельный span,
  // чтобы i18n-перевод самой фразы не ломался динамическим числом.
  function setResultNum(v){
    const el = document.getElementById("auctionResultNum");
    if(el) el.textContent = v === "" || v == null ? "" : String(v);
  }

  function renderFavorites(){
    state.items = favList();
    state.hasMore = false;
    $("#auctionCards").innerHTML = "";
    const pg = document.getElementById("paginationV1"); if(pg) pg.hidden = true;
    $("#auctionResultCount").textContent = state.items.length;
    setResultNum(state.items.length);
    $("#auctionResultLabel").textContent = "в избранном";
    renderCards(false);
    setMessage(state.items.length ? "" : "В избранном пусто. Нажмите ★ на карточке лота, чтобы сохранить его сюда.");
    syncUrl();
  }

  // «Ход конём»: дефолтная страница — витрина по типам техники (как BidCars).
  // Любой поиск/фильтр/вкладка выключает витрину (exitDiscovery) и показывает
  // полноценную выдачу.
  const SHOWCASE_TYPES = [[1, "Автомобили"], [2, "Мотоциклы"], [5, "Квадроциклы (ATV)"], [7, "Спецтехника"]]; // «Грузовики» убраны из витрины 14.09.2026 — лишний раздел
  // Компактная карточка витрины: фото сверху, несколько в ряд (как BidCars)
  function renderShowcaseCard(lot){
    const title = lotTitle(lot);
    const price = Number(lot.currentBid || 0);
    const buyNow = Number(lot.buyNow || 0);
    const hpStr = Number(lot.horsePower) > 0 ? `${lot.horsePower} ${L("л.с.")}` : "";
    const spec = [cleanEngine(lot.engine), hpStr, upAbbr(lot.drive)].filter(Boolean).join(" • ");
    const tl = timeLeftLabel(lot.auctionDate);
    const priceBar = price || buyNow
      ? `<span class="scPriceV1"><span>${buyNow && !price ? L("Купить сейчас") : L("Ставка")}</span><b>${money(price || buyNow)}</b></span>`
      : `<span class="scPriceV1 scPriceEmptyV1"><span>${L(lot.auctionDate ? "Ставок пока нет" : "Дата аукциона не назначена")}</span></span>`;
    return `<a class="scCardV1" href="${detailHref(lot)}">
      <span class="scImgV1">${lot.image ? `<img src="${escapeHtml(cardImg(lot.image))}" data-full="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async">` : ""}<i class="scAucV1 ${lot.auction === "iaai" ? "scAucIaaiV1" : "scAucCopartV1"}">${escapeHtml(String(lot.auction || "").toUpperCase())}</i></span>
      <span class="scBodyV1">
        <b class="scTitleV1">${escapeHtml(title)}</b>
        <span class="scSpecV1">${spec ? escapeHtml(spec) : "&nbsp;"}</span>
        <span class="scDateV1">${dbIco("calendar")}<span>${escapeHtml(dbDate(lot.auctionDate))}</span>${tl ? `<i class="scTlV1">${escapeHtml(tl)}</i>` : ""}</span>
        ${priceBar}
      </span>
    </a>`;
  }
  async function loadShowcase(){
    const reqId = state.loadSeq = (state.loadSeq || 0) + 1;
    state.loading = true;
    setMessage("");
    if(!state.items.length) $("#auctionCards").innerHTML = skeletonCards(6);
    try{
      // Счётчики (шапка и «Автомобили N») — из ОДНОГО источника action=count; витринные запросы дают только карточки.
      // Страница НЕ ждёт счётчики: карточки рисуем сразу, числа (шапка, «Автомобили N») подставляем, когда придёт count.
      // Раньше Promise.all ждал count до 9с (7 оценок + точный счёт архива) — страница «висела» с пустым экраном.
      const crP = api("/api/auctions?action=count").catch(() => null);
      const results = await Promise.all(SHOWCASE_TYPES.map(([id]) => api(`/api/auctions?action=search&per_page=30&vehicleType=${id}&sort=smart&auction=all&tab=all`).catch(() => null)));
      if(reqId !== state.loadSeq || !discoveryMode) return;
      let totalAll = 0, html = "";
      const shown = [];
      results.forEach((r, i) => {
        if(!r || !Array.isArray(r.items) || !r.items.length) return;
        const [id, label] = SHOWCASE_TYPES[i];
        totalAll += r.total || 0;
        // Ротация как на главной: пул 30 → случайные 5 на каждом обновлении страницы.
        const pool = r.items.slice();
        for(let k = pool.length - 1; k > 0; k--){ const j = Math.floor(Math.random() * (k + 1)); [pool[k], pool[j]] = [pool[j], pool[k]]; }
        const cards = pool.slice(0, 5);
        shown.push(...cards);
        html += `<section class="showcaseSecV1">
          <div class="showcaseHeadV1"><h2>${escapeHtml(label)}<b class="scTypeNumV1" data-type-num="${id}"></b></h2><button type="button" class="showcaseAllV1" data-showcase-type="${id}">Смотреть все <span aria-hidden="true">→</span></button></div>
          <div class="showcaseGridV1">${cards.map(renderShowcaseCard).join("")}</div>
        </section>`;
      });
      if(!html){ discoveryMode = false; loadLots(); return; }
      state.items = shown;
      // Счётчик заголовка: реальное число текущих лотов из базы (одним запросом), а не сумма
      // «total» витрин по типам — фид считает их по-разному, сумма врала (60k против 120k у DreamBid).
      state.total = 0;
      $("#auctionCards").innerHTML = html;
      $("#auctionResultCount").textContent = "…";
      setResultNum("");
      crP.then(cr => {
        if(reqId !== state.loadSeq || !discoveryMode || !cr || !(cr.total > 0)) return;
        state.total = cr.total;
        $("#auctionResultCount").textContent = cr.total.toLocaleString("ru-RU");
        setResultNum(cr.total.toLocaleString("ru-RU"));
        document.querySelectorAll(".scTypeNumV1[data-type-num]").forEach(b => { const n = cr.types && Number(cr.types[b.dataset.typeNum]) || 0; b.textContent = n ? n.toLocaleString("ru-RU") : ""; });
      });
      $("#auctionResultLabel").textContent = "лотов доступно на аукционах";
      const pg = document.getElementById("paginationV1");
      if(pg) pg.hidden = true;
      idle(updateCardForecasts);
      idle(updateTabCounts);
      updateFavCount();
    }catch(e){ /* при сбое — обычная выдача */ discoveryMode = false; loadLots(); }
    finally{ if(reqId === state.loadSeq) state.loading = false; }
  }

  // ---- Архив: сводка цен продаж по выбранной модели ----
  // «За сколько реально уходят такие машины» — главный вопрос к архиву. Считаем по последним
  // (до 100) состоявшимся продажам с ТЕМИ ЖЕ фильтрами, что в выдаче: середина рынка p25–p75,
  // медиана, число продаж. Только когда выбрана модель — по всей марке цифра бессмысленна.
  let archStatsSeq = 0;
  async function updateArchiveStats(){
    const seq = ++archStatsSeq;
    const cards = document.getElementById("auctionCards");
    let box = document.getElementById("archStatsV1");
    const modelPicked = !!(document.getElementById("filterModelIdV2")?.value);
    if(state.tab !== "archived" || !modelPicked || !cards){ if(box) box.remove(); return; }
    try{
      const p = formParams();
      p.set("tab", "archived"); p.set("page", "1"); p.set("per_page", "100"); p.set("sort", "date_desc");
      const r = await api(`/api/auctions?action=search&${p}`);
      if(seq !== archStatsSeq || state.tab !== "archived") return;
      const bids = (r.items || []).filter(l => !findCanadaLocation(l)).map(l => {
        const st = lotSaleState(l);
        return st.isSold ? Number(st.finalBid) || 0 : 0;
      }).filter(v => v >= 100).sort((x, y) => x - y);
      if(bids.length < 5){ if(box) box.remove(); return; }
      const q = f => { const i = (bids.length - 1) * f, lo = Math.floor(i), hi = Math.ceil(i); return bids[lo] + (bids[hi] - bids[lo]) * (i - lo); };
      const lo = Math.floor(q(.25) / 100) * 100, hi = Math.ceil(q(.75) / 100) * 100, med = Math.round(q(.5) / 50) * 50;
      if(!box){ box = document.createElement("div"); box.id = "archStatsV1"; box.className = "archStatsV1"; cards.parentNode.insertBefore(box, cards); }
      box.innerHTML = `
        <div><span>${L("Обычно продаются за")}</span><b data-no-i18n="true">${money(lo)} – ${money(hi)}</b></div>
        <div><span>${L("Медиана")}</span><b data-no-i18n="true">${money(med)}</b></div>
        <div><span>${L("Продаж в выборке")}</span><b data-no-i18n="true">${bids.length}${(r.total || 0) > bids.length ? "+" : ""}</b></div>
        <p>${L("Цены молотка на аукционе, без сборов и доставки. Разброс зависит от повреждений и пробега — точный расчёт под ключ на странице лота.")}</p>`;
    }catch(e){ if(box) box.remove(); }
  }

  // Заголовок страницы по вкладке: в «Архиве» стояло «Текущие аукционы».
  function updateCatalogH1(){
    const el = document.getElementById("auctionH1TextV1");
    if(!el) return;
    const map = {archived:"Архив аукционов", soon:"Торги сегодня и завтра", buy_now:"Купить сейчас", favorites:"Избранное"};
    el.textContent = L(map[state.tab] || "Текущие аукционы");
  }
  async function loadLots({_retry = false, append = false} = {}){
    updateCatalogH1();
    if(state.tab === "favorites"){ renderFavorites(); return; }
    if(discoveryMode && state.tab === "all"){ loadShowcase(); return; }
    // Не блокируем повторный вызов, а перебиваем предыдущий: клик по сортировке
    // или вкладке во время загрузки должен выигрывать, не игнорироваться,
    // и устаревший ответ не должен перетирать свежий (race).
    if(!append) state.perPage = isServerPaging() ? SERVER_PAGE_SIZE : 100;
    const reqId = state.loadSeq = (state.loadSeq || 0) + 1;
    state.loading = true;
    setMessage("");
    // Stale-while-revalidate: dim existing cards on page change, skeleton on first load
    if(state.items.length === 0) $("#auctionCards").innerHTML = skeletonCards(6);
    else $("#auctionCards").classList.add("lotsRefreshingV1");
    const archived = state.tab === "archived";
    try{
      const payload = await api(`/api/auctions?action=search&${formParams()}`);
      if(reqId !== state.loadSeq) return; // уже запрошено что-то новее
      const nextItems = payload.items || [];
      state.hasMore = Boolean(payload.hasMore);
      state.total = payload.total || 0;
      if(append){
        const prevCount = state.items.length;
        state.items = [...state.items, ...nextItems];
        state.displayPage = Math.floor(prevCount / state.displayPageSize) + 1;
      } else {
        state.items = nextItems;
        state.displayPage = 1;
      }
      // Вкладка «Все» без фильтров: total из базы включает лоты без даты торгов (сток «на площадке») —
      // в заголовке показываем реальное число лотов С торгами (action=count), как DreamBid.
      // total поиска без фильтров уже берётся из tabTotal (тот же источник, что у count) — отдельный запрос count
      // здесь не нужен: он блокировал отрисовку списка до 9с.
      $("#auctionResultCount").textContent = state.total
        ? state.total.toLocaleString("ru-RU")
        : state.items.length;
      setResultNum(state.total ? state.total.toLocaleString("ru-RU") : "");
      $("#auctionResultLabel").textContent = state.total
        ? (discoveryMode ? "лотов доступно на аукционах" : archived ? "лотов в архиве" : "лотов найдено")
        : `${L("Показано")} ${state.items.length} ${L("лотов")}`;
      renderCards();
      updateGenChips();
      idle(updateCardVinHistory);
      idle(updateCardLiveBids);
      idle(updateCardForecasts);
      if(!append) idle(updateTabCounts);
      if(!append) idle(updateArchiveStats);
      updateFavCount();
      if(!state.items.length) setMessage(archived ? "В архиве пока нет завершённых лотов по этим фильтрам. Ищете конкретную машину? Введите её VIN в поиск — история продаж находится по полной базе аукционов." : "По этим фильтрам лоты не найдены. Попробуйте изменить параметры поиска.");
    }catch(error){
      if(reqId !== state.loadSeq) return; // устаревший запрос — молча выходим
      state.hasMore = false;
      if(isLocalHost()){
        state.items = demoLots();
        state.total = state.items.length;
        $("#auctionResultCount").textContent = "373 909";
        setResultNum("");
        $("#auctionResultLabel").textContent = "демо-лоты (локально, без AUCTIONS_API_KEY)";
        renderCards();
      }else if(!_retry){
        // Auto-retry once after 2s before showing error — handles transient API blips
        state.loading = false;
        setTimeout(() => loadLots({_retry:true, append}), 2000);
        return;
      }else{
        // Keep showing existing cards if we have them; just flag the error
        if(!state.items.length){
          $("#auctionResultCount").textContent = "—";
          setMessage("Сервис временно недоступен. Попробуйте обновить страницу через минуту.");
        }else{
          setMessage("Не удалось обновить данные. Показаны последние загруженные лоты.");
        }
      }
    }finally{
      if(reqId === state.loadSeq){
        state.loading = false;
        $("#auctionCards").classList.remove("lotsRefreshingV1");
        syncUrl();
        if(pendingScrollRestore != null){
          const y = pendingScrollRestore; pendingScrollRestore = null;
          requestAnimationFrame(() => { window.scrollTo(0, y); setTimeout(() => window.scrollTo(0, y), 300); });
        }
      }
    }
  }

  function currentSlug(){
    const match = location.pathname.match(/^\/auctions\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : new URLSearchParams(location.search).get("slug");
  }

  function parseSlug(slug){
    const s = String(slug || "");
    const match = s.match(/^(copart|iaai)-(\d{5,12})(?:-.*)?$/i) || s.match(/^(copart|iaai)-(.+)$/i);
    return match ? {auction:match[1].toLowerCase(), lot:match[2]} : null;
  }

  function setSeo(lot){
    const title = `${lotTitle(lot)} — ${lot.auction.toUpperCase()} Lot ${lot.lot} | ApexAuto`;
    const description = `Лот ${lot.auction.toUpperCase()} ${lot.lot}: ${lotTitle(lot)}, VIN ${lot.vin || "не указан"}, пробег ${lot.odometerText || "не указан"}, повреждение ${lot.damage || "не указано"}, дата торгов ${dateText(lot.auctionDate)}.`;
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    if(lot.image) setMeta("property", "og:image", lot.image);
  }

  function setMeta(type, key, value){
    const selector = type === "property" ? `meta[property="${key}"]` : `meta[name="${key}"]`;
    let meta = document.querySelector(selector);
    if(!meta){
      meta = document.createElement("meta");
      if(type === "property") meta.setAttribute("property", key);
      else meta.setAttribute("name", key);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", value);
  }

  function spec(label, value){
    return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></div>`;
  }

  function altCurrency(calc){
    const usd = calc.usdMdl || liveRates.usdMdl;
    const eur = calc.eurMdl || 20.28;
    const mdl = Math.round(calc.totalMdl || calc.total * usd).toLocaleString("ru-RU");
    const eurV = Math.round(calc.totalEur || calc.total * usd / eur).toLocaleString("ru-RU");
    return `${mdl} MDL · €${eurV}`;
  }

  // Синхронный перевод строки в текущий язык (i18n.js экспортит window.i18nT).
  // Динамический контент (калькулятор, детали лота) строится в JS после apply(),
  // поэтому переводим прямо при сборке — иначе строка мигает по-русски, пока её
  // не догонит асинхронный наблюдатель i18n.
  function L(s){ try{ return window.i18nT ? window.i18nT(s) : s; }catch(e){ return s; } }
  // Плюрализация «продаж» с учётом языка.
  function salesWord(n){
    const lang = window.APEX_LANG || "ru";
    if(lang === "ro") return n === 1 ? "vânzare" : "vânzări";
    if(lang === "en") return n === 1 ? "sale" : "sales";
    return plural(n, "продажа", "продажи", "продаж");
  }
  // Плюрализация «записей» (история цены) с учётом языка.
  function recordsWord(n){
    const lang = window.APEX_LANG || "ru";
    if(lang === "ro") return n === 1 ? "înregistrare" : "înregistrări";
    if(lang === "en") return n === 1 ? "record" : "records";
    return plural(n, "запись", "записи", "записей");
  }

  function calcRow(label, value, sub){
    return `<div class="calcRowV2"><span>${escapeHtml(L(label))}${sub ? `<small>${escapeHtml(L(sub))}</small>` : ""}</span><b>${money(value)}</b></div>`;
  }

  // Свёрнутые секции калькулятора переживают перерисовку при изменении инпутов
  const calcClosedSecs = new Set();
  function calcSec(key, title, subtotal, rowsHtml){
    const closed = calcClosedSecs.has(key);
    return `
      <section class="calcSecV2${closed ? " calcClosedV1" : ""}" data-calc-sec="${key}">
        <div class="calcSecHeadV2" role="button" tabindex="0" data-calc-toggle="${key}">
          <span><svg class="calcChevV1" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 3.5 5 6.5 8 3.5"/></svg>${escapeHtml(L(title))}</span>
        </div>
        ${rowsHtml}
      </section>`;
  }
  function renderCalcRows(calc){
    if(calc.canada){
      const shipSub = calc.bid + calc.auctionFee + calc.dispatch + calc.bankFee + calc.keeper + calc.ocean + calc.road + calc.canadaFee;
      const clearSub = calc.customsUsd + calc.insurance + calc.exportDocs + calc.service;
      return calcSec("ship", "Калькулятор стоимости", shipSub, `
        ${calcRow("Ставка", calc.bid, `${Math.round(calc.bidCad).toLocaleString("en-US")} CAD × ${calc.cadUsd} (TD Bank)`)}
        ${calcRow("Аукционный сбор", calc.auctionFee)}
        ${calcRow("Доставка по Канаде", calc.dispatch)}
        ${calc.bankFee ? calcRow("Комиссия банка TD", calc.bankFee) : ""}
        ${calcRow("Услуги канадской компании", calc.canadaFee, calc.bid > 15000 ? "2% от цены лота" : "")}
        ${calcRow("Складирование и погрузка", calc.keeper)}
        ${calcRow("Морская перевозка", calc.ocean)}
        ${calcRow("Дорога Клайпеда → Кишинёв", calc.road)}`)
        + calcSec("clear", "Таможня и оформление", clearSub, `
        ${calcRow("Таможенные платежи", calc.customsUsd)}
        ${calcRow("Страховка (1%)", calc.insurance)}
        ${calcRow("Экспортные документы", calc.exportDocs)}
        ${calcRow("Комиссия", calc.service)}`);
    }
    const shippingSub = calc.bid + calc.auctionFee + calc.land + calc.sea;
    const clearingSub = calc.customsUsd + calc.insurance + calc.exportDocs + calc.service;
    return calcSec("ship", "Калькулятор стоимости", shippingSub, `
        ${calcRow("Ставка", calc.bid)}
        ${calcRow("Аукционный сбор", calc.auctionFee)}
        ${calcRow("Доставка по США", calc.land)}
        ${calcRow("Доставка морем", calc.sea)}`)
      + calcSec("clear", "Таможня и оформление", clearingSub, `
        ${calcRow("Таможенные платежи", calc.customsUsd)}
        ${calcRow("Страховка (1%)", calc.insurance)}
        ${calcRow("Экспортные документы", calc.exportDocs)}
        ${calcRow("Комиссия", calc.service)}`);
  }

  function renderLotCalculator(lot){
    const {isSold, finalBid: effectiveFinalBid} = lotSaleState(lot);
    // Финалку НЕ показываем на таймед-проданных: в фиде она расходится с реальной
    // (клиент: «пишете $10600, а купил за $11100»). auctionsapi часто НЕ помечает
    // IAAI-таймед как timed (лот 2022 Tesla шёл как «live»), поэтому прячем на
    // timed ИЛИ на всех IAAI-проданных; Copart-живые продажи достоверны — оставляем.
    // 22.09.2026: скрытие снято (Федор). Финал теперь берётся по VIN только у состоявшихся продаж,
    // а история цены ниже и так показывала ту же цифру — «по запросу» сверху выглядело как противоречие.
    const hidePrice = false;
    const initialBid = hidePrice ? 0 : ((isSold && effectiveFinalBid ? effectiveFinalBid : (lot.currentBid || lot.buyNow)) || 0);
    // Идут ли торги прямо сейчас (аукцион начался ≤3ч назад, ещё не продан).
    // Во время live-аукциона ставка на Copart/IAAI растёт в реальном времени,
    // а фид отдаёт последнюю синхронизированную — честно предупреждаем клиента.
    const [, liveTone] = dbLive(lot);
    const isLive = !isSold && liveTone === "live";
    const bidLabel = isSold && effectiveFinalBid ? "Финальная цена" : isLive ? "Ставка на торгах" : "Текущая ставка";
    const kind = vehicleKind(lot);
    const fuelVal = mapFuel(lot.fuel, false, lot);
    const engL = numberFromEngine(lot.engine);
    const calc = calcLotTotal(lot, {bid:initialBid, insurance:true, exportDocs:false, vehicleType:kind, fuel:fuelVal, engineLiters:engL});
    const est = lot.estimatedRetailValue ? `оценка ${money(lot.estimatedRetailValue)}` : "";
    const fOpt = v => `<option value="${v}"${fuelVal===v?" selected":""}>`;
    const countdown = isSold ? "" : timeLeftLabel(lot.auctionDate);
    // Канадские аукционы торгуют в CAD: показываем CAD как основную валюту
    // ставки + пересчёт в USD по курсу TD; сам расчёт всегда в USD
    const isCa = !!calc.canada;
    const fmtBid = v => isCa ? moneyCad(v) : money(v);
    const usdHint = v => isCa && v ? `<i class="calcBidUsdV1" id="bidUsdHintV1">≈ ${money(Math.round(v * calc.cadUsd))}</i>` : "";
    // Buy Now лоты: фикс-цена выкупа показывается отдельной кнопкой,
    // а «Текущая ставка» — только реальная ставка торгов
    const buyNowPrice = !isSold ? Number(lot.buyNow || 0) : 0;
    const currOnly = Number(lot.currentBid || 0);
    const topBidValue = isSold ? initialBid : currOnly;
    return `<aside class="lotCalcV2">
      ${isSold && (effectiveFinalBid || hidePrice) ? `
      <div class="calcSoldCardV1">
        <span>${L("Продано")}</span>
        ${hidePrice ? `
        <b class="soldByReqV1">${L("Цена — по запросу")}</b>
        <button type="button" class="soldRefineNoteV1 soldNoteBtnV1" data-lead="${escapeHtml(lot.id)}">${L("Напишите нам — подскажем точную цену продажи")}</button>
        ` : `
        <b id="soldFinalV1">${fmtBid(effectiveFinalBid)}</b>
        ${isCa ? `<i id="soldUsdHintV1">≈ ${money(Math.round(effectiveFinalBid * calc.cadUsd))}</i>` : ""}
        `}
      </div>
` : `
      <div class="calcTopV2">
        ${isLive ? `<div class="calcLiveBadgeV1"><span class="calcLiveDotV1"></span>${L("Идут торги")}</div>` : ""}
        ${topBidValue || !buyNowPrice ? `<div class="calcBidLabelV2"><span>${L(bidLabel)}</span><b id="liveBidValueV1"${!topBidValue && !lot.auctionDate ? ' class="calcNoDateBV1"' : ""}>${topBidValue ? fmtBid(topBidValue) : (lot.auctionDate ? "—" : L("Дата аукциона не назначена"))}</b>${usdHint(topBidValue)}</div>` : ""}
        ${isLive ? `<p class="calcLiveNoteV1">${L("Аукцион идёт в прямом эфире — ставка растёт в реальном времени. Актуальную цену уточните у нас.")}</p>` : ""}
      </div>`}
      ${!isSold ? `<div id="lotQueueV1" class="lotQueueV1" hidden></div>` : ""}
      ${isSold ? `<div class="soldPitchV1">
        <p>${L("Этот лот уже продан. Но мы подберём похожую машину на актуальных аукционах и привезём под ключ.")}</p>
        <button type="button" class="dbBtnPrimary soldPitchCtaV1" data-lead="${escapeHtml(lot.id)}">${L("Подобрать похожую")}</button>
      </div>` : ""}
      ${countdown ? `<div class="calcCountdownV1">${dbIco("clock")}<span>${L("Осталось")} <b id="lotCalcCountdown">${countdown}</b> ${L("до начала торгов")}</span></div>` : ""}
      ${buyNowPrice ? `<button class="calcBuyNowV1" type="button" data-lead="${escapeHtml(lot.id)}"><span>${L("Купить сейчас")}</span><b>${fmtBid(buyNowPrice)}</b></button>` : ""}
      ${!isSold ? `<button class="dbBtnPrimary calcTopCtaV1" type="button" data-lead="${escapeHtml(lot.id)}">${L("Оставить заявку")}</button>` : ""}
      ${(() => { const t = Number(lot.sellerReserve) > 0 ? (lot.timed ? "Timed аукцион" : "") : lot.saleStatus; return t && !isSold ? `<div class="calcSaleV2 ${saleClass(t)}">${escapeHtml(t)}</div>` : ""; })()}
      ${Number(lot.sellerReserve) > 0 && !isSold ? `<div class="calcReserveV1"><span>${L("Резерв продавца")}</span><b>${fmtBid(lot.sellerReserve)}</b>${Number(lot.currentBid) > 0 && lot.currentBid < lot.sellerReserve ? `<i>${L("ставка ниже резерва")}</i>` : ""}${lot.timed ? `<p>${L("Если на Timed-аукционе резерв продавца не будет достигнут, машину снова выставят на онлайн-аукцион.")}</p>` : ""}</div>` : ""}
      <div class="calcStepperV2">
        <button type="button" data-bid-step="-1" aria-label="Уменьшить ставку">−</button>
        <input id="lotBidInput" data-calc-input type="number" min="0" step="100" value="${escapeHtml(initialBid || "")}" placeholder="${isCa ? "Ваша ставка, CAD" : "Ваша ставка, $"}">
        <button type="button" data-bid-step="1" aria-label="Увеличить ставку">+</button>
      </div>
      <div class="calcOptsV2">
        <div class="calcPairV1">
          <label class="calcOptColV1">
            <span>Тип кузова</span>
            <select id="lotCalcVehType" data-calc-input class="calcSelectV2">
              ${["sedan","crossover","suv","pickup","vanLarge","moto","atv"].map(v => `<option value="${v}"${kind===v?" selected":""}>${{sedan:"Седан",crossover:"Кроссовер",suv:"Внедорожник",pickup:"Пикап",vanLarge:"Минивен / Бус",moto:"Мото",atv:"Квадро / ATV"}[v]}</option>`).join("")}
            </select>
          </label>
          <label class="calcOptColV1">
            <span>Топливо</span>
            <select id="lotCalcFuel" data-calc-input class="calcSelectV2">
              ${fOpt("gasoline")}Бензин</option>
              ${fOpt("diesel")}Дизель</option>
              ${fOpt("hybrid")}Гибрид</option>
              ${fOpt("phev")}Plug-in гибрид</option>
              ${fOpt("electric")}Электро</option>
            </select>
          </label>
          <label class="calcOptColV1">
            <span>Объём двигателя</span>
            <select id="lotCalcEngine" data-calc-input class="calcSelectV2">
              ${Array.from({length:70}, (_, i) => ((i + 1) / 10).toFixed(1)).map(v => `<option value="${v}"${Number(v) === Math.min(7, Math.max(0.1, Math.round((engL || 2) * 10) / 10)) ? " selected" : ""}>${v} ${L("л")}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="calcPairRowV1">
          <label class="calcOptV2"><input type="checkbox" id="lotCalcExportDocs" data-calc-input><span>Экспорт-документы</span></label>
          <label class="calcOptV2" title="Машина не на основной локации аукциона · +$100"><input type="checkbox" id="lotCalcOffsite" data-calc-input><span>Offsite / Sublot</span></label>
        </div>
      </div>
      <div id="lotCalcBody" class="calcBodyV2">${renderCalcRows(calc)}</div>
      <div class="calcGrandV2">
        <span>${L("Итого под ключ до Кишинёва")}</span>
        <b id="lotCalcTotal">${money(calc.total)}</b>
        <small id="lotCalcTotalAlt">${altCurrency(calc)}</small>
      </div>
      <div class="calcRatesV2">
        <label><span>USD → MDL</span><input id="lotCalcUsdMdl" data-calc-input type="number" step="0.01" min="1" value="${liveRates.usdMdl.toFixed(2)}"></label>
        <label><span>EUR → MDL</span><input id="lotCalcEurMdl" data-calc-input type="number" step="0.01" min="1" value="${liveRates.eurMdl.toFixed(2)}"></label>
      </div>
      ${(() => { const dw = deliveryWindow(lot); return `<div class="calcEtaV1">${dbIco("calendar")}<span class="calcEtaLinesV1"><span>${L("Доставка")} <b>${dw.days}</b> ${L("дней")}</span><span>${L("Выдача в Кишинёве:")} <b>${dw.label}</b></span></span></div>`; })()}
      <div class="calcCtasV2">
        <button class="dbBtnPrimary" type="button" data-lead="${escapeHtml(lot.id)}">${L("Оставить заявку")}</button>
        <button class="dbBtnGhost" type="button" data-copy-calc>${L("Скопировать расчёт")}</button>
        <a class="dbBtnGhost" href="${calcHref(lot)}">${L("Открыть в полном калькуляторе")}</a>
      </div>
      <p class="calcNoteV2">${L("Расчёт предварительный, для ориентира. Итоговую сумму подтверждаем перед покупкой. Курсы валют — по данным НБМ (bnm.md).")}</p>
    </aside>`;
  }

  // Ориентир выдачи: дата торгов (или сегодня, если торги прошли) + 6–12 недель доставки
  // Сроки доставки по портам (в днях), отсчёт от даты торгов лота:
  // NJ/NY/GA — 60–75, TX — 60–90, Калифорния — 90–120,
  // Канада — 50–60, Британская Колумбия (Ванкувер) — 70–90.
  const PORT_DAYS = {nj:[60,75], savannah:[60,75], houston:[60,90], la:[90,120], canada:[50,60], canada_bc:[70,90]};
  function deliveryWindow(lot){
    const caLoc = findCanadaLocation(lot);
    const port = caLoc ? (caLoc.zone === "bc" ? "canada_bc" : "canada") : (findLotLocation(lot)?.autoPort || "");
    const [d1, d2] = PORT_DAYS[port] || [60, 90];
    const t = lot.auctionDate ? new Date(lot.auctionDate).getTime() : NaN;
    const base = Number.isFinite(t) ? t : Date.now(); // от даты торгов, даже прошедшей
    const lang = window.APEX_LANG || "ru";
    const loc = lang === "ro" ? "ro-RO" : lang === "en" ? "en-US" : "ru-RU";
    const f = ms => new Date(ms).toLocaleDateString(loc, {day:"numeric", month:"short"});
    return {days:`${d1}–${d2}`, label:`${f(base + d1 * 864e5)} – ${f(base + d2 * 864e5)}`};
  }

  function updateLotCalculator(){
    if(!state.selectedLot || !$("#lotBidInput")) return;
    const veh = $("#lotCalcVehType")?.value || vehicleKind(state.selectedLot);
    const fuel = $("#lotCalcFuel")?.value || mapFuel(state.selectedLot.fuel, false, state.selectedLot);
    const engineLiters = Number($("#lotCalcEngine")?.value) || numberFromEngine(state.selectedLot.engine);
    const usdMdl = Number($("#lotCalcUsdMdl")?.value) || liveRates.usdMdl;
    const eurMdl = Number($("#lotCalcEurMdl")?.value) || liveRates.eurMdl;
    const calc = calcLotTotal(state.selectedLot, {
      bid:Number($("#lotBidInput").value || 0),
      insurance:true, // страховка обязательна — в стоимости всегда
      exportDocs:$("#lotCalcExportDocs")?.checked,
      offsite:$("#lotCalcOffsite")?.checked,
      vehicleType:veh, fuel, engineLiters, usdMdl, eurMdl
    });
    $("#lotCalcBody").innerHTML = renderCalcRows(calc);
    $("#lotCalcTotal").textContent = money(calc.total);
    $("#lotCalcTotalAlt").textContent = altCurrency(calc);
    syncStickyTotal();
    // ≈USD (карточка «Продано» и текущая ставка) пересчитываем живым курсом TD
    if(calc.canada){
      const soldHint = document.getElementById("soldUsdHintV1");
      if(soldHint){
        const {finalBid} = lotSaleState(state.selectedLot);
        if(finalBid) soldHint.textContent = `≈ ${money(Math.round(finalBid * calc.cadUsd))}`;
      }
      const bidHint = document.getElementById("bidUsdHintV1");
      if(bidHint){
        const cur = Number(state.selectedLot.currentBid || state.selectedLot.buyNow || 0);
        if(cur) bidHint.textContent = `≈ ${money(Math.round(cur * calc.cadUsd))}`;
      }
    }
    return calc;
  }

  // Текст расчёта для буфера — тот же полный формат, что «Скопировать расчёт» на
  // главной: аукцион, локация с маршрутом (как на экране), ссылки на лот (наш сайт +
  // площадка), номер лота, VIN, вся разбивка платежей, итог USD + MDL/EUR.
  function buildCalcText(){
    const lot = state.selectedLot;
    const calc = updateLotCalculator();
    if(!calc || !lot) return "";
    const row = (label, v, sub) => v > 0 ? `• ${L(label)}${sub ? ` (${sub})` : ""} — ${money(v)}` : "";
    const rows = calc.canada ? [
      row("Ставка", calc.bid, `${Math.round(calc.bidCad).toLocaleString("en-US")} CAD × ${calc.cadUsd}`),
      row("Аукционный сбор", calc.auctionFee),
      row("Доставка по Канаде", calc.dispatch),
      row("Комиссия банка TD", calc.bankFee),
      row("Услуги канадской компании", calc.canadaFee),
      row("Складирование и погрузка", calc.keeper),
      row("Морская перевозка", calc.ocean),
      row("Дорога Клайпеда → Кишинёв", calc.road),
      row("Таможенные платежи", calc.customsUsd),
      row("Страховка (1%)", calc.insurance),
      row("Экспортные документы", calc.exportDocs),
      row("Комиссия", calc.service)
    ] : [
      row("Ставка", calc.bid),
      row("Аукционный сбор", calc.auctionFee),
      row("Доставка по США", calc.land),
      row("Доставка морем", calc.sea),
      row("Таможенные платежи", calc.customsUsd),
      row("Страховка (1%)", calc.insurance),
      row("Экспортные документы", calc.exportDocs),
      row("Комиссия", calc.service)
    ];
    // Локация: где стоит машина + маршрут до порта и морем — то же, что показано в калькуляторе.
    // Фид отдаёт место строчными («hillsborough, new jersey») — приводим к Title Case.
    const place = String(lot.location || "").trim().toLowerCase().replace(/(^|[\s,(-])([a-zа-яё])/g, (m, p, c) => p + c.toUpperCase());
    const landRoute = calc.canada ? calc.dispatchRoute : calc.landRoute;
    const locParts = [place, landRoute && landRoute !== place ? landRoute : ""].filter(Boolean);
    const siteUrl = `${location.origin}${detailHref(lot)}`;
    const aucName = String(lot.auction || "").toLowerCase() === "iaai" ? "IAAI" : "Copart";
    return [
      `APEX AUTO | ${L("Расчёт под ключ")}`, "",
      lotTitle(lot),
      `${L("Аукцион")}: ${String(lot.auction || "").toUpperCase()}`,
      locParts.length ? `${L("Локация")}: ${locParts.join(" → ")}` : null,
      calc.seaRoute ? `${L("Морем")}: ${calc.seaRoute}` : null,
      `${L("Ссылка на лот")}: ${siteUrl}`,
      lot.url ? `${aucName}: ${lot.url}` : null,
      lot.lot ? `${L("Номер лота")}: ${lot.lot}` : null,
      lot.vin ? `VIN: ${lot.vin}` : null,
      "", ...rows.filter(Boolean), "",
      `${L("Итого под ключ")}: ${money(calc.total)}`,
      altCurrency(calc),
      "", L("Расчёт предварительный.")
    ].filter(l => l !== null).join("\n");
  }
  async function copyCalculation(){
    const text = buildCalcText();
    if(!text) return;
    const btn = document.querySelector("[data-copy-calc]");
    try{ await navigator.clipboard.writeText(text); }
    catch(e){ window.prompt(L("Скопируйте расчёт"), text); return; }
    if(btn){ const orig = btn.textContent; btn.textContent = L("Скопировано"); setTimeout(() => { btn.textContent = orig; }, 1400); }
  }

  function dMain(label, value, iconOverride){
    if(value == null || value === "") return "";
    const t = statusTone(value) || "neutral";
    const ic = iconOverride || (t === "good" ? "check" : t === "bad" ? "warn" : t === "warn" ? "warn" : "q");
    return `<div class="dRowV2"><span class="dRowLbl">${escapeHtml(L(label))}</span><span class="dRowVal dTone-${t}"><span class="dValUnit">${dbIco(ic)}<span>${escapeHtml(L(value))}</span></span></span></div>`;
  }
  function dPlain(label, valueHtml, iconName, tone){
    if(valueHtml == null || valueHtml === "") return "";
    const inner = iconName ? `<span class="dValUnit">${dbIco(iconName)}<span>${valueHtml}</span></span>` : valueHtml;
    return `<div class="dRowV2"><span class="dRowLbl">${escapeHtml(L(label))}</span><span class="dRowVal${tone ? ` dTone-${tone}` : ""}">${inner}</span></div>`;
  }

  const lb = {images:[], index:0};
  function ensureLightbox(){
    let el = document.getElementById("lotLightbox");
    if(el) return el;
    el = document.createElement("div");
    el.id = "lotLightbox";
    el.className = "lbV1";
    el.hidden = true;
    el.innerHTML = `
      <div class="lbTopV1">
        <span id="lbCount" class="lbCountV1"></span>
        <div class="lbActionsV1">
          <button class="lbBtnV1" type="button" data-lb-copy>Скопировать ссылку</button>
          <button class="lbBtnV1 lbCloseV1" type="button" data-lb-close aria-label="Закрыть">✕</button>
        </div>
      </div>
      <button class="lbNavV1 lbPrevV1" type="button" data-lb-prev aria-label="Предыдущее фото">‹</button>
      <div id="lbStage" class="lbStageV1"></div>
      <button class="lbNavV1 lbNextV1" type="button" data-lb-next aria-label="Следующее фото">›</button>`;
    document.body.appendChild(el);
    return el;
  }
  function renderLightbox(){
    const stage = document.getElementById("lbStage");
    const item = lb.images[lb.index];
    if(stage && item){
      // Перерисовка innerHTML заодно останавливает видео при листании
      if(item.type === "video"){
        stage.innerHTML = `<video class="lbImgV1" src="${escapeHtml(item.src)}" controls autoplay playsinline${item.poster ? ` poster="${escapeHtml(item.poster)}"` : ""}></video>`;
      }else{
        stage.innerHTML = `<img class="lbImgV1" src="${escapeHtml(item.src)}" alt="">`;
      }
    }
    const c = document.getElementById("lbCount");
    if(c) c.textContent = `${lb.index + 1} / ${lb.images.length}`;
    const multi = lb.images.length > 1;
    document.querySelectorAll(".lbNavV1").forEach(b => b.style.display = multi ? "" : "none");
  }
  function openLightbox(images, index){
    if(!images || !images.length) return;
    // Принимаем и строки-URL (старые вызовы), и медиа-объекты {type, src, poster}
    lb.images = images.map(m => typeof m === "string" ? {type:"image", src:m} : m);
    lb.index = Math.max(0, Math.min(index || 0, images.length - 1));
    const el = ensureLightbox();
    el.hidden = false;
    document.body.classList.add("lbOpenV1");
    renderLightbox();
  }
  function closeLightbox(){
    const el = document.getElementById("lotLightbox");
    if(el) el.hidden = true;
    // Убираем содержимое сцены — иначе скрытое видео продолжает играть звуком
    const stage = document.getElementById("lbStage");
    if(stage) stage.innerHTML = "";
    document.body.classList.remove("lbOpenV1");
  }
  function lbMove(step){
    if(!lb.images.length) return;
    lb.index = (lb.index + step + lb.images.length) % lb.images.length;
    renderLightbox();
  }
  function lbCopyLink(){
    const url = lb.images[lb.index] && lb.images[lb.index].src;
    if(!url) return;
    navigator.clipboard?.writeText(url);
    const btn = document.querySelector("[data-lb-copy]");
    if(btn){ btn.textContent = "Скопировано"; setTimeout(() => { btn.textContent = "Скопировать ссылку"; }, 1500); }
  }

  function renderSimilarCard(lot){
    const title = lotTitle(lot);
    const specLine = [cleanEngine(lot.engine), Number(lot.horsePower) > 0 ? `${lot.horsePower} ${L("л.с.")}` : "", upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" • ");
    // Компактно: короткий цветной статус («На ходу»/«Не на ходу») вместо длинного
    // «Заводится и едет», и пробег ОДНОЙ единицей (тыс. км) — иначе не вмещалось.
    const tone = conditionInfo(lot.condition).tone;
    const condShort = tone === "good" ? L("На ходу") : tone === "bad" ? L("Не на ходу") : L(conditionInfo(lot.condition).label);
    const condCls = tone === "good" ? "compsRunV1" : tone === "bad" ? "compsNoRunV1" : "";
    const miNum = Number(lot.odometer) || Number(String(lot.odometerText || "").replace(/[^0-9]/g, "").slice(0, 7)) || 0;
    const odoShort = miNum ? `${Math.round(miNum * 1.609 / 1000)} ${L("тыс. км")}` : "";
    const {isSold, finalBid: effectiveBid} = lotSaleState(lot);
    const bid = isSold && effectiveBid ? effectiveBid : (lot.currentBid || lot.buyNow);
    // Цены как у DreamBid: «Купить сейчас» — красный бейдж, текущая ставка — синий, продано — тёмный.
    const fmtB = v => findCanadaLocation(lot) ? moneyCad(v) : money(v);
    const bidBadges = isSold && effectiveBid ? `<span class="simBidV1 simBidSoldV1" title="${L("Продано")}">${dbIco("gavel")}${fmtB(effectiveBid)}</span>`
      : [Number(lot.buyNow) > 0 ? `<span class="simBidV1 simBidBuyV1" title="${L("Купить сейчас")}">${dbIco("tag")}${fmtB(lot.buyNow)}</span>` : "",
         Number(lot.currentBid) > 0 ? `<span class="simBidV1 simBidCurV1" title="${L("Текущая ставка")}">${dbIco("gavel")}${fmtB(lot.currentBid)}</span>` : ""].join("");
    // Дата торгов/продажи: «26 сент.» (в другом году — «12 сент. 2025»). Формат MM/YY «09/26» читался как непонятно что (Федор 23.09.2026).
    const sd = Date.parse(lot.auctionDate || lot.saleDate || "");
    const dateMMYY = Number.isFinite(sd)
      ? dbDate(new Date(sd).toISOString()).replace(/^[^,]+,\s*/, "").replace(/,?\s*\d{1,2}:\d{2}$/, "") + (new Date(sd).getFullYear() !== new Date().getFullYear() ? ` ${new Date(sd).getFullYear()}` : "")
      : "";
    return `<a class="simCardV1" href="${detailHref(lot)}" data-sim-vin="${escapeHtml(lot.vin || "")}" data-sim-lot="${escapeHtml(String(lot.lot || ""))}">
      <div class="simPhotoV1">${lot.image ? `<img src="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy">` : ""}${bidBadges ? `<span class="simBidsV1">${bidBadges}</span>` : ""}</div>
      <h4>${escapeHtml(title)}</h4>
      <span class="simVinV1">${dbIco("vin")}${escapeHtml(lot.vin || "—")}${dateMMYY ? ` · ${dateMMYY}` : ""}</span>
      <span>${dbIco("engine")}${escapeHtml(specLine || "—")}</span>
      <span class="simCondV1">${dbIco("odo")}<span class="${condCls}">${escapeHtml(condShort)}</span>${odoShort ? ` · ${escapeHtml(odoShort)}` : ""}</span>
    </a>`;
  }

  // Диапазоны лет поколений (кузовов) по model_id — зеркало серверных GEN_OVERRIDES.
  // Нужно, т.к. у свежих лотов (2025/2026 Panamera) generation_id в фиде ПУСТ, а в
  // справочнике поколений нового кузова нет — фильтруем «такие же» по диапазону лет.
  const SIM_GEN_OV = {
    1634:[[2010,2016],[2017,2023],[2024,null]], // Porsche Panamera
    2220:[[2015,2022],[2023,null]],             // Lexus NX
    1904:[[2006,2012],[2013,2020]],             // Ford Fusion
    350:[[2013,2017],[2018,2022],[2023,null]],  // Honda Accord
    872:[[2012,2017],[2018,2024],[2025,null]],  // Toyota Camry
    94:[[2011,2016],[2017,2023],[2024,null]]    // BMW 5
  };
  function genYearRange(modelId, year){
    const ov = SIM_GEN_OV[Number(modelId)], cur = new Date().getFullYear() + 1;
    if(!ov || !year) return null;
    const cont = ov.filter(g => year >= g[0] && year <= (g[1] || cur));
    if(cont.length){ const g = cont.reduce((a, b) => (b[0] > a[0] ? b : a)); return {from:g[0], to:g[1] || cur}; }
    const newest = ov.reduce((a, b) => (b[0] > a[0] ? b : a));
    if(year > (newest[1] || newest[0])) return {from:newest[0], to:cur};
    return null;
  }
  // «Такие же»: то же ПОКОЛЕНИЕ (диапазон лет кузова) + топливо → поколение без
  // топлива. БЕЗ подмешивания других поколений. Если модели нет в карте — тот же год.
  async function fetchSimilarLots(lot, archived){
    // Диапазон лет поколения: сначала серверный (работает для ВСЕХ моделей —
    // overrides+справочник+синтетика), затем клиентская карта, затем тот же год.
    const gr = (Number(lot.genFrom) && Number(lot.genTo))
      ? {from:Number(lot.genFrom), to:Number(lot.genTo)}
      : genYearRange(lot.modelId, lot.year);
    const query = withFuel => {
      const p = new URLSearchParams({action:"search", per_page:"12"});
      if(archived) p.set("tab", "archived"); else p.set("sort", "soon");
      if(lot.makeId) p.set("make", String(lot.makeId));
      if(lot.modelId) p.set("model", String(lot.modelId));
      if(gr){ p.set("yearFrom", String(gr.from)); p.set("yearTo", String(gr.to)); }
      else if(lot.year){ p.set("yearFrom", String(lot.year)); p.set("yearTo", String(lot.year)); }
      if(withFuel && lot.fuel) p.set("fuel", String(lot.fuel));
      return api(`/api/auctions?${p}`)
        .then(r => (r.items || []).filter(x => String(x.id) !== String(lot.id)))
        .catch(() => []);
    };
    // Топливо — НЕ жёсткий фильтр, а приоритет: тот же тип (гибрид/бензин) идёт первым, дальше
    // добираем другими из того же поколения. Иначе, когда своего топлива в фиде мало (напр. 1
    // гибрид), показывалась одна одинокая карточка, хотя того же кузова десяток.
    // 23.09.2026: оба запроса (любое топливо + то же топливо) независимы — раньше шли последовательно
    // (await, потом await), удваивая время ответа секции «Похожие» без всякой пользы; genAll пустым
    // бывает крайне редко, так что запускаем оба сразу.
    const [genAll, sameFuel] = await Promise.all([query(false), lot.fuel ? query(true) : Promise.resolve([])]);
    if(!genAll.length) return [];
    if(!lot.fuel) return genAll.slice(0, 12);
    const seen = new Set(), out = [];
    for(const x of [...sameFuel, ...genAll]){
      const k = String(x.id);
      if(seen.has(k)) continue;
      seen.add(k); out.push(x);
    }
    return out.slice(0, 12);
  }

  async function loadSimilarActive(lot){
    const box = document.getElementById("similarActiveLots");
    const sec = document.getElementById("similarActiveSection");
    if(!box || !sec) return;
    let items = [];
    if(isLocalHost()){ items = demoLots().filter(x => String(x.id) !== String(lot.id)).slice(0, 6); }
    else items = await fetchSimilarLots(lot, false);
    if(!items.length) return;
    box.innerHTML = items.map(renderSimilarCard).join("");
    sec.hidden = false;
    markResoldSimilar(box);
  }

  // Перекуп: машина уже продавалась под ДРУГИМ номером лота (VIN тот же) — красная метка на фото, чтобы клиент видел сразу.
  async function markResoldSimilar(box){
    try{
      const cards = [...box.querySelectorAll(".simCardV1[data-sim-vin]")].filter(c => (c.dataset.simVin || "").length === 17);
      const vins = [...new Set(cards.map(c => c.dataset.simVin))].slice(0, 30);
      if(!vins.length) return;
      const r = await api(`/api/auctions?action=vinhist&vins=${encodeURIComponent(vins.join(","))}`);
      const items = r && r.items || {};
      cards.forEach(c => {
        const h = items[c.dataset.simVin]; if(!h || !Array.isArray(h.entries)) return;
        const resold = h.entries.some(e => e.status === "sold" && e.lot && String(e.lot) !== String(c.dataset.simLot));
        if(resold && !c.querySelector(".simResoldV1")) c.querySelector(".simPhotoV1")?.insertAdjacentHTML("beforeend", `<span class="simResoldV1">${dbIco("warn")}${L("Продан ранее")}</span>`);
      });
    }catch(e){}
  }

  async function loadSimilarArchived(lot){
    const box = document.getElementById("similarArchivedLots");
    const sec = document.getElementById("similarArchivedSection");
    if(!box || !sec) return;
    const items = await fetchSimilarLots(lot, true);
    if(!items.length) return;
    box.innerHTML = items.map(renderSimilarCard).join("");
    sec.hidden = false;
    markResoldSimilar(box);
  }

  // История по VIN не загрузилась (сбой фида) — не оставляем «недоступно»: тихо перезапрашиваем лот и перерисовываем.
  let vinRetryTimer = null;
  function scheduleVinRetry(lot, attempt){
    clearTimeout(vinRetryTimer);
    if(!lot || lot.vinChecked !== false || attempt > 3) return;
    vinRetryTimer = setTimeout(async () => {
      try{
        const r = await api(`/api/auctions?action=detail&auction=${encodeURIComponent(lot.auction)}&lot=${encodeURIComponent(lot.lot)}&fresh=1`);
        const cur = document.getElementById("auctionDetail");
        if(!cur || cur.hidden || !r.lot || String(r.lot.lot) !== String(lot.lot)) return;
        if(r.lot.vinChecked === false){ scheduleVinRetry(r.lot, attempt + 1); return; }
        const y = window.scrollY; renderDetail(r.lot); window.scrollTo(0, y);
      }catch(e){ scheduleVinRetry(lot, attempt + 1); }
    }, [0, 4000, 10000, 20000][attempt] || 20000);
  }
  function renderDetail(lot){
    scheduleVinRetry(lot, 1);
    _caLotFlag = !!findCanadaLocation(lot);
    // Keep the address bar shareable: VIN/lot search renders the detail in place,
    // so push the canonical /auctions/<auction>-<lot> URL if we're not on it yet.
    try{
      if(lot && lot.auction && lot.lot){
        const href = detailHref(lot);
        // тот же лот, отличается только «хвост» ссылки (название/VIN) — заменяем адрес, а не плодим записи в истории
        const sameLot = decodeURIComponent(location.pathname).startsWith(`/auctions/${lot.auction}-${lot.lot}`);
        if(location.pathname !== href){
          if(sameLot) history.replaceState(history.state, "", href);
          else history.pushState({apexLot:1, d:((history.state && history.state.d) || 0) + 1}, "", href);
        }
      }
    }catch(e){}
    const images = lot.images?.length ? lot.images : [lot.image].filter(Boolean);
    const title = lotTitle(lot);
    const dmgParts = String(lot.damage || "").split("/").map(s => s.trim()).filter(Boolean);
    const primaryDmg = lot.primaryDamage || dmgParts[0] || "";
    const secondaryDmg = lot.secondaryDamage || dmgParts[1] || "";
    // Тип топлива — сразу в спек-строке, чтобы бензин/дизель/гибрид был виден без скролла
    const fuelRu = lot.fuel ? L(ruEnum(RU_FUEL, lot.fuel)) : "";   // в составной строке «2.0 · Бензин · AWD» словарь i18n не сработает сам
    const driveLine = [cleanEngine(lot.engine), fuelRu, upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" · ");
    const specLine  = [cleanEngine(lot.engine), Number(lot.horsePower) > 0 ? `${lot.horsePower} ${L("л.с.")}` : "", fuelRu, upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" • ");
    const vinReport = lot.vin ? `https://www.google.com/search?q=${encodeURIComponent(lot.vin)}` : "";
    // History summary for Главное section
    // Запись текущих торгов (h.current) — не история: впервые выставленная
    // машина не должна выглядеть как «продавалась ранее»
    // «Ранее» = записи ДРУГИХ лотов по этому VIN. Запись текущего номера (в т.ч. его продажа) — это
    // эти торги, а не история. Продан один раз под текущим номером → «Единственная продажа».
    const curLotNo = String(lot.lot || ""), curDay = String(lot.auctionDate || "").slice(0, 10);
    const pastHistory = (Array.isArray(lot.priceHistory) ? lot.priceHistory : []).filter(h => !isCurrentRound(h, lot));
    const histCount = pastHistory.length;
    const pastSold = pastHistory.filter(h => { const s = String(h.status || "").toLowerCase(); return s.includes("sold") && !s.includes("not"); });
    const fmtHd = d => { const t = Date.parse(d); return Number.isFinite(t) ? new Date(t).toLocaleDateString(window.APEX_LANG === "ro" ? "ro-RO" : window.APEX_LANG === "en" ? "en-GB" : "ru-RU", {day:"numeric", month:"short", year:"numeric"}) : ""; };
    const curMs = Date.parse(lot.auctionDate || "");
    const soldEarlier = pastSold.filter(h => !Number.isFinite(curMs) || Date.parse(h.date) < curMs);
    const soldTotal = pastSold.length + (lotSaleState(lot).isSold ? 1 : 0);
    const histStr = histCount === 0
      ? (lot.vinChecked === false ? L("История по VIN временно недоступна") : lotSaleState(lot).isSold ? L("Единственная продажа") : L("Ранее не продавалась"))
      : pastSold.length ? `${histCount} ${recordsWord(histCount)} • ${L(soldEarlier.length ? "Был продан ранее!" : "Продан снова позже!")}${soldTotal >= 2 ? ` • ${L("Продаж по VIN")}: ${soldTotal}` : ""}${sellerIsInsurance(lot) ? "" : ` • ${L("Перекуп")}`}`
      : `${L("Выставлялась ранее")}: ${histCount} ${recordsWord(histCount)}, ${L("не продана")}`;
    // Seller type detection — как у DreamBid: галочка в слоте иконки + обычный
    // текст «Страховая · Имя», без цветных плашек внутри таблицы.
    // Первичен seller_type из API (mapfre и др. по имени не распознать).
    const sellerTypeRaw = String(lot.sellerType || "").toLowerCase();
    const isIns = /insurance/.test(sellerTypeRaw)
      || /insurance|state farm|allstate|progressive|geico|nationwide|farmers|usaa|liberty mutual|statefarm|mapfre/i.test(String(lot.seller || ""));
    const sellerTypeLabel = L(isIns ? "Страховая"
      : /financ|credit|bank/.test(sellerTypeRaw) ? "Банк / кредитная"
      : /fleet|lease|rental/.test(sellerTypeRaw) ? "Автопарк / лизинг"
      : /dealer/.test(sellerTypeRaw) ? "Дилер"
      : "Дилер / банк");
    const sellerName = L(tc(String(lot.seller || "")).replace(/\s*·\s*Страховая\s*$/i, ""));
    $("#auctionCatalog").hidden = true;
    const detail = $("#auctionDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <div class="detailTopRowV1">
        <a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a>
        <form class="detailSearchV1" data-detail-search>
          <input type="search" placeholder="VIN, номер лота или марка/модель" aria-label="Поиск по аукционам" autocomplete="off">
          <button type="submit">Найти</button>
        </form>
      </div>
      <section class="auctionDetailPanelV1">
        <div class="detailHeaderV1">
          <div>
            <span class="auctionCrumbsV1"><a href="/">Главная</a> / <a href="/auctions">Аукционы</a>${lot.make ? ` / <a href="${lot.makeId ? `/auctions?make=${lot.makeId}` : `/auctions?name=${encodeURIComponent(lot.make)}`}">${escapeHtml(lot.make)}</a>` : ""}${lot.make && lot.model ? ` / <span class="crumbDropV1"><a href="${lot.makeId && lot.modelId ? `/auctions?make=${lot.makeId}&model=${lot.modelId}` : `/auctions?name=${encodeURIComponent(`${lot.make} ${lot.model}`)}`}">${escapeHtml(displayModel(lot.model))}</a>${lot.makeId ? `<button type="button" class="crumbChevV1" data-crumb-drop="model" aria-label="Другие модели"><svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 3.5 5 6.5 8 3.5"/></svg></button>` : ""}</span>` : ""}${lot.generationId && lot.generationName && lot.makeId && lot.modelId ? ` / <span class="crumbDropV1"><a href="/auctions?make=${lot.makeId}&model=${lot.modelId}&generation=${lot.generationId}">${escapeHtml(lot.generationName)}</a><button type="button" class="crumbChevV1" data-crumb-drop="gen" aria-label="Другие поколения"><svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 3.5 5 6.5 8 3.5"/></svg></button></span>` : ""} / <span class="crumbCurV1">${escapeHtml(lotTitle(lot))}</span></span>
            <div class="dTitleRowV1">
              <h1>${escapeHtml(title)}</h1>
              <button type="button" class="dShareBtnV1" data-share-page>${dbIco("ext")}<span>Поделиться</span></button>
            </div>
            <p class="dSpecLine">${dbIco("engine")}<span>${escapeHtml(specLine || "—")}</span>${lot.vin ? copyChip(lot.vin, "Скопировать VIN", "dSpecVin", "vin") : ""}</p>
            ${(() => {
              const st = lotSaleState(lot), b = st.isSold ? (st.finalBid || lot.finalBid || 0) : (lot.currentBid || 0);
              const when = lot.auctionDate ? dbDate(lot.auctionDate) : L("Дата аукциона не назначена");
              return `<div class="dMobSumV1">${b ? `<span><small>${L(st.isSold ? "Продано" : "Ставка")}</small><b>${money(b)}</b></span>` : ""}<span><small>${L("Дата аукциона")}</small><b>${escapeHtml(when)}</b></span></div>`;
            })()}
          </div>
          <div class="dHeadActionsV1">
            <button type="button" class="dFavBtnV1${favHas(lot.id) ? " is-fav" : ""}" data-fav="${escapeHtml(lot.id)}">${dbIco("star")}<span>${favHas(lot.id) ? "В избранном" : "В избранное"}</span></button>
            ${alertable(lot) ? `<button type="button" class="dFavBtnV1 dBellBtnV1${alertLots().has(String(lot.id)) ? " is-on" : ""}" data-alert-lot="${escapeHtml(lot.id)}">${dbIco("bell")}<span>${escapeHtml(L(alertLots().has(String(lot.id)) ? "Слежу за лотом" : "Следить за лотом"))}</span></button>` : ""}
            ${vinReport ? `<a class="dVinBtn" href="${vinReport}" target="_blank" rel="noopener">Отчёт истории VIN</a>` : ""}
          </div>
        </div>
        ${(() => {
          // Этот заход уже прошёл, а машину выставили снова под другим номером (перекуп) — ведём на живой лот.
          const rl = lot.relisted;
          if(!rl || !(lotSaleState(lot).isSold || Date.parse(lot.auctionDate || "") < Date.now())) return "";
          const ra = String(rl.auction || lot.auction || "copart").toLowerCase(), rn = String(rl.lot || "").replace(/[^0-9A-Za-z-]/g, "");
          if(!rn) return "";
          return `<div class="dRelistV1"><div><b>${L("Эта машина выставлена снова")}</b><span>${L("Лот")} ${escapeHtml(rn)} · ${escapeHtml(ra === "iaai" ? "IAAI" : "Copart")} · ${L("торги")} ${escapeHtml(dbDate(rl.date))}${rl.bid ? ` · ${L("ставка")} ${money(rl.bid)}` : ""}</span></div><a class="dRelistBtnV1" href="/auctions/${encodeURIComponent(ra)}-${encodeURIComponent(rn)}">${L("Открыть актуальный лот")}</a></div>`;
        })()}
        <div class="lotDetailGridV1">
          <div class="detailGalleryV1">
            <div class="dGalMainV2" data-lb-open role="button" tabindex="0" aria-label="Открыть фото в HD">
              <img id="detailMainImage" class="detailMainImageV1" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(title)}">
              ${(() => {
                // Предупреждение как у DreamBid: машина уже продавалась под другим номером лота — показываем дату и ссылку на тот заход.
                const ps = pastSold[0];
                if(!ps) return "";
                try{ if(sessionStorage.getItem("soldWarnHide:" + (lot.vin || lot.id))) return ""; }catch(e){}
                const d = new Date(ps.date); const dd = Number.isFinite(d.getTime()) ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}` : "";
                const pa = String(ps.auction || lot.auction || "copart").toLowerCase(); const pl = String(ps.lot || "").replace(/[^0-9A-Za-z-]/g, "");
                return `<div class="dSoldWarnV1" data-sold-warn>
                  <b>${L("Предупреждение!")}</b>
                  <p>${L(Number.isFinite(curMs) && Date.parse(ps.date) > curMs ? "Позже этот автомобиль был продан снова" : "Этот автомобиль был продан на другом аукционе")} ${escapeHtml(dd)}${ps.bid ? ` · ${money(ps.bid)}` : ""}</p>
                  <div class="dSoldWarnBtnsV1">
                    <button type="button" class="dSoldHideV1" data-sold-hide="${escapeHtml(lot.vin || lot.id)}">${L("Скрыть информацию")}</button>
                    ${pl ? `<a class="dSoldPrevV1" href="/auctions/${encodeURIComponent(pa)}-${encodeURIComponent(pl)}" data-sold-prev>${L("Предыдущий аукцион")}</a>` : ""}
                  </div>
                </div>`;
              })()}
              <span class="dAuc dGalChipV2">${escapeHtml(lot.auction.toUpperCase())}</span>
              ${images.length > 1 ? `
              <button class="dGalNavV1 dGalPrevV1" type="button" data-gal-step="-1" aria-label="Предыдущее фото">‹</button>
              <button class="dGalNavV1 dGalNextV1" type="button" data-gal-step="1" aria-label="Следующее фото">›</button>` : ""}
              <div class="dGalBadgesV2">
                ${lot.video ? `<span class="dGalTagV2" data-open-video role="button">${dbIco("play")} ${L("Видео")}</span>` : ""}
                ${lot.has360 || lot.spin ? `<span class="dGalTagV2">360°</span>` : ""}
                <span class="dGalTagV2">${dbIco("zoom")} ${L("HD")} · ${escapeHtml(images.length || 1)} ${L("фото")}</span>
              </div>
            </div>
            <div class="detailThumbsV1">
              ${images.map((src, i) => `<img class="dThumbV2${i === 0 ? " isActiveThumbV2" : ""}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" data-detail-image="${escapeHtml(src)}" data-detail-index="${i}"${i > 0 ? ' loading="lazy"' : ""}>`).join("")}
              ${lot.video ? `<span class="dThumbV2 dThumbVideoV1" role="button" data-open-video title="Видео осмотра"><img src="${escapeHtml(images[0] || "")}" alt="Видео осмотра" loading="lazy"><i class="dThumbPlayV1">${dbIco("play")}</i></span>` : ""}
            </div>
          </div>
          <div class="lotDetailCenterV1">
            <section class="dSec">
              <div class="dSecHead">${L("Главное")}</div>
              ${dMain("Состояние", conditionInfo(lot.condition).label)}
              ${lot.seller ? dMain("Продавец", isIns ? `${L("Страховая")} · ${sellerName}` : sellerName, isIns ? "check" : "person") : ""}
              ${(() => {
                const k = String(lot.keys || "").trim();
                if(!k) return "";
                const yes = /^(yes|да|present|available)/i.test(k);
                const no = /^(no|нет|not )/i.test(k);
                // Ключ есть — зелёный, нет — жёлтый (внимание, но не приговор)
                return dPlain("Ключ доступен", escapeHtml(tc(k)), "key", yes ? "good" : no ? "warn" : "neutral");
              })()}
              ${(() => {
                const doc = parseDocTitle(docRaw(lot));
                if(!doc) return "";
                const verdict = doc.tone === "rework" ? "Требуется переделка · 30–40 дней" : doc.tone === "good" ? "Хорошие" : tc(doc.label);
                const icon = doc.tone === "rework" ? "excl" : "doc";
                const docTone = doc.tone === "rework" ? "warn" : doc.tone === "good" ? "good" : "neutral";
                return dMain("Статус документов", verdict, icon)
                  + dPlain("Тип документа", escapeHtml(docShort(docRaw(lot))), "doc", docTone);
              })()}
              ${dMain("История", histStr)}
              ${dPlain("Привод", escapeHtml(driveLine), "drive")}
              ${dPlain("Пробег", `${escapeHtml(dbOdo(lot.odometerText))}${lot.odometerStatus && !/actual|факт/i.test(lot.odometerStatus) ? ` <span class="odoWarnV1">${escapeHtml(tc(lot.odometerStatus))}</span>` : ""}`, "odo")}
              ${primaryDmg ? dMain("Основное повреждение", ruDamage(primaryDmg), "damage") : ""}
              ${secondaryDmg ? dMain("Вторичное повреждение", ruDamage(secondaryDmg), "damage") : ""}
              ${lot.saleType ? dMain("Тип ущерба", ruDamage(lot.saleType), "damage") : ""}
              ${vinReport ? dPlain("Экстра", `<a class="dLink" href="${vinReport}" target="_blank" rel="noopener">${L("Отчет VIN")}</a>`, "gem") : ""}
            </section>
            <div class="dRecoV2">${dbIco("check")}<div><b>${L("Apex Auto рекомендует")}</b><p>${L("Поможем проверить лот, документы и историю, рассчитать стоимость под ключ до Кишинёва и сопроводить сделку от ставки до выдачи.")}</p></div></div>
            <section class="dSec">
              <div class="dSecHead">${L("Аукцион")}</div>
              ${dPlain("VIN", copyChip(lot.vin, "Скопировать VIN", "dCopyValV1", ""))}
              ${dPlain("Номер лота", `${copyChip(lot.lot, "Скопировать номер лота", "dCopyValV1", "")} ${aucLinkBadge(lot)}`)}
              ${Number(lot.sellerReserve) > 0 ? dPlain("Резерв продавца", `<b>${money(lot.sellerReserve)}</b>${lot.sellerReserveAt ? ` <i class="dReserveAtV1">${L("обновлён")} ${escapeHtml(dbDate(lot.sellerReserveAt))}</i>` : ""}`) : ""}
              ${lot.saleStatus ? dPlain("Статус продажи", escapeHtml(lot.saleStatus) + (lot.timed && !lotSaleState(lot).finalBid ? ` <i class="dTimedHintV1">не продан на timed — выйдет на live-торги</i>` : "")) : ""}
              ${lot.seller ? dPlain("Тип продавца", sellerTypeLabel) : ""}
              ${dPlain("Продавец", escapeHtml(sellerName))}
              ${dPlain("Дата аукциона", escapeHtml(lot.auctionDate ? dbDate(lot.auctionDate, true) : L("Не назначена")))}
              ${dPlain("Локация", escapeHtml(lotLocationText(lot)))}
              ${lot.estimatedRetailValue ? dPlain("Оценка (ACV)", caMoney(lot.estimatedRetailValue)) : ""}
              ${lot.repairCost ? dPlain("Оценка ремонта", caMoney(lot.repairCost)) : ""}
            </section>
            <section class="dSec">
              <div class="dSecHead">${L("Описание")}</div>
              ${dPlain("Тип топлива", escapeHtml(ruEnum(RU_FUEL, lot.fuel)))}
              ${dPlain("Цвет кузова", escapeHtml(ruEnum(RU_COLOR, lot.color)))}
              ${dPlain("Тип кузова", escapeHtml(ruEnum(RU_BODY, lot.body)))}
              ${lot.cylinders ? dPlain("Цилиндры", escapeHtml(lot.cylinders)) : ""}
              ${lot.airbags ? dPlain("Подушки безопасности", /intact/i.test(lot.airbags) ? "Целы" : /deploy/i.test(lot.airbags) ? "Сработали" : escapeHtml(tc(lot.airbags))) : ""}
              ${lot.preAccidentPrice ? dPlain("Оценка до аварии", caMoney(lot.preAccidentPrice)) : ""}
              ${lot.cleanWholesalePrice ? dPlain("Оптовая (clean)", money(lot.cleanWholesalePrice)) : ""}
              ${lot.video ? dPlain("Видео осмотра", `<button type="button" class="dLink dLinkBtnV1" data-open-video>${L("Смотреть видео")}</button>`) : ""}
            </section>
            ${renderPriceHistory(lot.priceHistory, !!findCanadaLocation(lot), lot)}
          </div>
          ${renderLotCalculator(lot)}
        </div>
        <section class="simSecV1" id="similarActiveSection" hidden>
          <h2>${L("Похожие текущие аукционы")}</h2>
          <div class="simGridV1" id="similarActiveLots"></div>
        </section>
        <section class="simSecV1" id="similarArchivedSection" hidden>
          <h2>${L("Похожие архивные аукционы")}</h2>
          <div class="simGridV1" id="similarArchivedLots"></div>
        </section>
      </section>
      ${(() => { const s = lotSaleState(lot).isSold; return `
      <div class="lotStickyCtaV1">
        <button type="button" class="lotStickyInfoV1" data-sticky-calc aria-label="${L("Расчёт под ключ")}">
          <span class="lotStickyTitleV1">${escapeHtml([lot.year, lot.make, displayModel(lot.model)].filter(Boolean).join(" "))}</span>
          <span class="lotStickyTotalV1" id="lotStickyTotalV1" hidden><small>${L("Под ключ в Кишинёве")} ≈</small> <b data-no-i18n="true"></b></span>
        </button>
        <button type="button" class="dbBtnPrimary lotStickyBtnV1" data-lead="${escapeHtml(lot.id)}">${s ? L("Подобрать похожую") : L("Оставить заявку")}</button>
      </div>`; })()}
    `;
    state.selectedLot = lot;
    state.detailImages = images;
    setTimeout(syncStickyTotal, 0);
    // Единый медиа-набор для лайтбокса: фото + видео осмотра последней плиткой
    state.detailMedia = images.map(src => ({type:"image", src}));
    if(lot.video) state.detailMedia.push({type:"video", src:lot.video, poster:images[0] || ""});
    state.detailIndex = 0;
    setSeo(lot);
    updateLotCalculator();
    loadSimilarActive(lot);
    loadSimilarArchived(lot);
    fetchLiveRates();
    startLotCountdown(lot);
    startLiveBidWatch(lot);
    startQueueWatch(lot);
    fillGenCrumb(lot);
  }

  // Live-обновление ставки: пока идут торги (±3 часа вокруг даты аукциона),
  // раз в 2 минуты тянем свежую ставку мимо кешей (fresh=ts) и обновляем блок.
  let liveBidTimer = null;
  function startLiveBidWatch(lot){
    if(liveBidTimer){ clearInterval(liveBidTimer); liveBidTimer = null; }
    const t = Date.parse(lot.auctionDate || "");
    const {finalBid} = lotSaleState(lot);
    if(!Number.isFinite(t) || finalBid > 0) return;
    if(Math.abs(t - Date.now()) > 3 * 3600e3) return;
    liveBidTimer = setInterval(async () => {
      if(document.hidden) return;
      const cur = parseSlug(currentSlug());
      if(!cur || String(cur.lot) !== String(lot.lot)){ clearInterval(liveBidTimer); liveBidTimer = null; return; }
      try{
        const p = await api(`/api/auctions?action=detail&auction=${encodeURIComponent(lot.auction)}&lot=${encodeURIComponent(lot.lot)}&fresh=${Date.now()}`);
        const nl = p.lot;
        if(!nl) return;
        const bid = Number(nl.currentBid) || 0;
        const prev = Number(state.selectedLot?.currentBid) || 0;
        if(bid && bid !== prev){
          if(state.selectedLot) state.selectedLot.currentBid = bid;
          const el = document.getElementById("liveBidValueV1");
          if(el){
            const isCa = !!findCanadaLocation(lot);
            el.textContent = isCa ? moneyCad(bid) : money(bid);
            el.classList.remove("bidPulseV1");
            void el.offsetWidth; // перезапуск анимации
            el.classList.add("bidPulseV1");
          }
        }
        const {finalBid: fb} = lotSaleState(nl);
        if(fb > 0){ clearInterval(liveBidTimer); liveBidTimer = null; }
      }catch(e){ /* live-обновление — не критично */ }
    }, 120e3);
  }

  // Очередь онлайн-торгов Copart: линия/номер лота → сколько лотов впереди и ≈ время. Обновление раз в 20 с.
  let queueTimer = null;
  function fmtEta(sec){
    const m = Math.max(1, Math.round(sec / 60));
    return m >= 60 ? `${Math.floor(m / 60)} ${L("ч")} ${m % 60} ${L("мин")}` : `${m} ${L("мин")}`;
  }
  function startQueueWatch(lot){
    if(queueTimer){ clearInterval(queueTimer); queueTimer = null; }
    if(!lot || !document.getElementById("lotQueueV1")) return;
    const t = Date.parse(lot.auctionDate || "");
    if(!Number.isFinite(t) || lotSaleState(lot).isSold) return;
    const dt = t - Date.now();
    if(dt > 30 * 3600e3 || dt < -5 * 3600e3) return;
    const lotRow = x => `<li><span class="lqNoV1">#${x.runNo}</span><span class="lqTitleV1">${escapeHtml(x.title || "")}</span>${x.finalBid ? `<b>${money(x.finalBid)}</b>` : ""}</li>`;
    const tick = async () => {
      const box = document.getElementById("lotQueueV1");
      if(!box){ clearInterval(queueTimer); queueTimer = null; return; }
      if(document.hidden) return;
      let r; try{ r = await api(`/api/auctions?action=queue&auction=${encodeURIComponent(lot.auction)}&lot=${encodeURIComponent(lot.lot)}`); }catch(e){ return; }
      if(!r || !r.available){ box.hidden = true; return; }
      const startTime = new Date(r.startsAt).toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"});
      let main;
      if(r.state === "sold") main = `<div class="lqBigV1"><b>${L("Лот продан")}</b></div>`;
      else if(r.state === "now") main = `<div class="lqBigV1 lqNowV1"><span class="calcLiveDotV1"></span><b>${L("Ваш лот сейчас на очереди")}</b></div>`;
      else main = `<div class="lqBigV1"><b>≈ ${r.ahead}</b><span>${L("лотов впереди")}</span></div>
        <div class="lqEtaV1">≈ ${fmtEta(r.etaSec)} ${L("до вашего лота")}${r.state === "before" ? ` · ${L("торги начнутся в")} ${startTime}` : ""}</div>`;
      const pct = r.state === "sold" ? 100 : Math.max(2, Math.round(((r.runNo && r.total ? (r.total - r.ahead) / r.total : 0)) * 100));
      box.hidden = false;
      box.innerHTML = `<div class="lqHeadV1"><span>${L("Очередь торгов")}</span><span>${L("Линия")} ${escapeHtml(r.lane)} · №${r.runNo}</span></div>
        ${main}
        <div class="lqBarV1"><i style="width:${Math.min(100, pct)}%"></i></div>
        ${r.recent && r.recent.length ? `<div class="lqSubV1">${L("Только что продано")}</div><ul class="lqListV1">${r.recent.map(lotRow).join("")}</ul>` : ""}
        ${r.next && r.next.length ? `<div class="lqSubV1">${L("Следом")}</div><ul class="lqListV1">${r.next.map(lotRow).join("")}</ul>` : ""}
        <p class="lqNoteV1">${L("Оценка по номеру лота в зале, считаем 1 лот ≈ 1 минута. Реальный темп аукциона может отличаться.")}</p>`;
    };
    tick();
    queueTimer = setInterval(tick, 20e3);
  }

  // Живой отсчёт до торгов в сайдбаре (обновление раз в 30 сек)
  let lotCdTimer = null;
  function startLotCountdown(lot){
    if(lotCdTimer){ clearInterval(lotCdTimer); lotCdTimer = null; }
    if(!document.getElementById("lotCalcCountdown")) return;
    lotCdTimer = setInterval(() => {
      const node = document.getElementById("lotCalcCountdown");
      if(!node){ clearInterval(lotCdTimer); lotCdTimer = null; return; }
      const tl = timeLeftLabel(lot.auctionDate);
      if(tl){ node.textContent = tl; return; }
      const box = node.closest(".calcCountdownV1");
      if(box) box.innerHTML = `${dbIco("clock")}<span>Торги начались</span>`;
      clearInterval(lotCdTimer); lotCdTimer = null;
    }, 30e3);
  }

  // Market statistics for this make/model (avg sale price, range, sample size).
  // Короткая строка рынка в сайдбаре калькулятора.
  function setMarketLine(median, count){
    const marketLine = document.getElementById("lotMarketLineV1");
    if(marketLine) marketLine.innerHTML = `${dbIco("chart")}<span>${L("Рынок")}: ${L("средняя")} ${money500(median)}</span>`;
  }
  // Подпись: какие факторы учтены (динамически из match).
  function compsNote(match){
    if(!match) return L("По данным проданных лотов Copart и IAAI.");
    const parts = [];
    if(match.fuel) parts.push(L("топлива"));
    if(match.cond) parts.push(L("состояния"));
    if(match.year) parts.push(L("года"));
    if(match.mileage) parts.push(L("пробега"));
    if(match.gen) parts.push(L("поколения"));
    return parts.length ? `${L("С учётом:")} ${parts.join(", ")}.` : L("По данным проданных лотов Copart и IAAI.");
  }

  async function loadStats(lot){
    const box = document.getElementById("lotStatsBox");
    if(!box || !lot.makeId || !lot.modelId) return;
    // Префетч агрегата ПАРАЛЛЕЛЬНО с comps (не ждём провала comps) — если comps
    // уйдёт в фолбэк, статистика уже загружена и рендер мгновенный.
    const statsPrefetch = statsRowsFor(lot.makeId, lot.modelId);
    try{
      // 1) Точная оценка по РЕАЛЬНЫМ сопоставимым продажам: тот же тип топлива,
      // близкий год и пробег (медиана устойчивее к выбросам). Пробег/топливо
      // критичны — гибрид не усредняем с бензином, свежий с пробежным.
      // Параметры те же, что у карточек каталога (один источник правды — compsParamsFor).
      const cp = compsParamsFor(lot);
      const cr = await api(`/api/auctions?${cp}`).catch(() => null);
      // Ставка или резерв продавца уже выше вилки → ориентир опровергнут рынком; на странице лота его не показываем.
      // …а также если ЭТА машина уже торговалась выше вилки (не продана за $26 750 при вилке $15–17k — оценка явно низкая).
      const maxHistBid = Math.max(0, ...(Array.isArray(lot.priceHistory) ? lot.priceHistory.map(h => Number(h.bid) || 0) : [0]));
      const guideContradicted = cr && cr.ok && cr.comps && cr.comps.guide && (Number(lot.currentBid) > Number(cr.comps.p75) || Number(lot.sellerReserve) > Number(cr.comps.p75) || maxHistBid > Number(cr.comps.p75));
      if(cr && cr.ok && cr.comps && cr.comps.guide && !guideContradicted){
        // Ориентир ставки по формуле «база × K × состояние» (см. server/price-guide.js).
        const c = cr.comps;
        const title = [lot.year, lot.make, displayModel(lot.model)].filter(Boolean).join(" ");
        box.innerHTML = `
          <div class="dSecHead">${L("Ориентир ставки")} <span class="histCountV1">${escapeHtml(title)}</span></div>
          <div class="statGridV1">
            <div class="statCellV1"><span>${L("Разумная ставка для этого лота")}</span><b>${money(c.p25)} – ${money(c.p75)}</b></div>
          </div>
          <p class="statNoteV1">${L("Считаем от средней цены продаж этого кузова с поправкой на состояние лота: повреждения и на ходу ли машина. Это ориентир, а не гарантия — перед ставкой проверяем лот вручную.")}</p>`;
        box.hidden = false;
        const marketLine = document.getElementById("lotMarketLineV1");
        if(marketLine) marketLine.innerHTML = `${dbIco("chart")}<span>${L("Ориентир ставки")}: ${money(c.p25)}–${money(c.p75)}</span>`;
        return;
      }
      if(cr && cr.ok && cr.comps && cr.comps.count){
        const c = cr.comps;
        const title = [lot.year, lot.make, lot.model].filter(Boolean).join(" ");
        const lo = c.p25 || c.min, hi = c.p75 || c.max;
        const hasRange = lo && hi && hi > lo;
        // Список отдельных проданных лотов убран — ниже показываем реальные лоты
        // того же года (открытые + архив), их можно открыть.
        box.innerHTML = `
          <div class="dSecHead">${L("Рыночная статистика")} <span class="histCountV1">${escapeHtml(title)}</span></div>
          <div class="statGridV1">
            ${hasRange ? `<div class="statCellV1"><span>${L("Оценочная стоимость")}</span><b>${money500(lo)} – ${money500(hi)}</b></div>` : ""}
            <div class="statCellV1"><span>${L("Средняя цена рынка")}</span><b>${money500(c.median)}</b></div>
          </div>
          <p class="statNoteV1">${compsNote(c.match)} ${L("Помогает оценить адекватную ставку.")}</p>`;
        box.hidden = false;
        const marketLine = document.getElementById("lotMarketLineV1");
        if(marketLine) marketLine.innerHTML = `${dbIco("chart")}<span>${L("Рынок")}: ${hasRange ? `${money500(lo)}–${money500(hi)}` : money500(c.median)}</span>`;
        return;
      }
      // 2) Фолбэк: агрегат /statistics (когда база недоступна или мало продаж).
      // ВАЖНО: year в API НЕ шлём. /statistics?year=X отдаёт строки только за X,
      // и тогда клиентское «расширить окно на год-3…год» (ниже) ломается —
      // расширять не из чего, а подпись врёт («за 2020–2023» на данных 2023).
      // Тянем все годы модели, скоуп считаем сами. Используем ПАРАЛЛЕЛЬНЫЙ префетч
      // (запущен в начале loadStats) — обычно уже готов, ждать не приходится.
      const rows = await statsPrefetch;
      if(!Array.isArray(rows) || !rows.length) return;
      // Скоуп: сначала точный год. Если продаж этого года мало (свежая модель),
      // расширяем на последние 4 года — НЕ на все года модели, иначе средняя
      // тонет в старых дешёвых лотах (Tesla 2025 усреднялась с 2020-ми).
      const yr = Number(lot.year) || null;
      const cntOf = arr => arr.reduce((s, x) => s + (Number(x.lot_count) || 0), 0);
      let scope = rows, scopeLabel = "";
      if(yr){
        const exact = rows.filter(x => Number(x.year) === yr);
        if(cntOf(exact) >= 5){ scope = exact; scopeLabel = `${L("за")} ${yr} ${L("год")}`; }
        else {
          const win = rows.filter(x => { const y = Number(x.year); return y && y <= yr && y >= yr - 3; });
          if(cntOf(win) >= 3){ scope = win; scopeLabel = `${L("за")} ${yr - 3}–${yr}`; }
          else { scope = rows; scopeLabel = ""; }
        }
      }
      // Сузить до того же двигателя лота (напр. 2.5 гибрид), чтобы не мешать с
      // 2.0/2.4-бензином других комплектаций. Если своих мало — оставляем шире.
      if(lot.engineId){
        const byEng = scope.filter(x => x.engine && Number(x.engine.id) === Number(lot.engineId));
        if(cntOf(byEng) >= 3) scope = byEng;
      }
      // ИНДИВИДУАЛЬНО по состоянию лота, даже на агрегате: у каждой корзины есть
      // avg/min/max — берём взвешенную среднюю A и темперированные верх (HI) и низ
      // (LO) (пики/шум $100 обрезаем). Хороший экземпляр (cq=good) → к HI, убитый
      // (poor) → к LO, средний → A. Диапазон показываем ОТ средней и вверх.
      let sumW = 0, cnt = 0, sHi = 0, sLo = 0;
      scope.forEach(x => {
        const c = Number(x.lot_count) || 0, a = Number(x.avg_final_bid) || 0;
        if(a > 0 && c > 0){
          sumW += a * c; cnt += c;
          const mx = Number(x.max_final_bid) || a, mn = Number(x.min_final_bid) || a;
          sHi += Math.min(mx, a * 1.6) * c;     // темперируем разовые пики
          sLo += Math.max(mn, a * 0.55) * c;    // темперируем шум (не-продажи $100)
        }
      });
      if(!cnt) return;
      const A = sumW / cnt, HI = sHi / cnt, LO = sLo / cnt;
      let center = A;
      if(cq === "good") center = A + (HI - A) * 0.7;
      else if(cq === "poor") center = LO + (A - LO) * 0.35;
      const avg = Math.round(center);
      const min = Math.round(center), max = Math.round(Math.max(HI, center * 1.06));
      const title = [yr, lot.make, lot.model].filter(Boolean).join(" ");
      box.innerHTML = `
        <div class="dSecHead">${L("Рыночная статистика")} <span class="histCountV1">${escapeHtml(title)}</span></div>
        <div class="statGridV1">
          <div class="statCellV1"><span>${L("Оценочная стоимость")}</span><b>${money500(min)} – ${money500(max)}</b></div>
          <div class="statCellV1"><span>${L("Средняя цена рынка")}</span><b>${money500(avg)}</b></div>
        </div>
        <p class="statNoteV1">${L("По данным проданных лотов Copart и IAAI")}${scopeLabel ? ` ${scopeLabel}` : ""}. ${L("Помогает оценить адекватную ставку.")}</p>`;
      box.hidden = false;
      setMarketLine(avg, cnt);
    }catch(e){ /* stats optional — ignore */ }
  }

  // Фоновая дотяжка полного лота после мгновенного рендера каталожной версии.
  // Перерисовываем только если полная версия реально отличается (не сбиваем
  // введённую ставку/скролл зря).
  function detailFingerprint(l){
    return [l.images?.length || 0, (l.priceHistory || []).length, l.currentBid, l.buyNow,
      l.auctionDate, l.seller, l.sellerType, l.body, l.color, l.cylinders, l.video, l.saleStatus].join("|");
  }
  async function refreshDetailInBackground(slug){
    try{
      const payload = await api(`/api/auctions?action=detail&auction=${encodeURIComponent(slug.auction)}&lot=${encodeURIComponent(slug.lot)}`);
      const lot = payload.lot;
      const cur = parseSlug(currentSlug());
      if(!lot || !cur || String(cur.lot) !== String(slug.lot)) return; // уже ушли со страницы
      if(detailFingerprint(lot) !== detailFingerprint(state.selectedLot || {})){
        const y = window.scrollY;
        renderDetail(lot);
        window.scrollTo(0, y);
      }
    }catch(e){ /* фоновое обновление — не критично */ }
  }

  document.addEventListener("click", event => {
    const all = event.target.closest("[data-showcase-type]");
    if(all){
      exitDiscovery();
      document.querySelectorAll('input[name="vehicleType"]').forEach(x => { x.checked = x.value === all.dataset.showcaseType; });
      state.page = 1; state.displayPage = 1;
      window.scrollTo({top:0, behavior:"smooth"});
      loadLots();
      return;
    }
    const chip = event.target.closest(".genChipV1");
    if(!chip) return;
    const genId = document.getElementById("filterGenIdV2");
    const genInput = document.getElementById("filterGenV2");
    const wasActive = chip.classList.contains("isActiveGenV1");
    if(genId) genId.value = wasActive ? "" : chip.dataset.genId;
    if(genInput) genInput.value = wasActive ? "" : chip.dataset.genName;
    state.page = 1; state.displayPage = 1;
    loadLots();
  });

  // Переход из каталога на лот без перезагрузки: данные карточки уже есть
  // в state — рендерим мгновенно, полную версию дотягиваем в фоне.
  document.addEventListener("click", event => {
    const link = event.target.closest('a[href^="/auctions/"]');
    if(!link || event.defaultPrevented) return;
    if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const slug = parseSlug(decodeURIComponent(link.getAttribute("href").replace(/^\/auctions\//, "").split(/[?#]/)[0]));
    if(!slug) return;
    const fromCatalog = !$("#auctionCatalog").hidden;
    if(fromCatalog) saveBackSnap();   // запоминаем место в каталоге и для обычной навигации (витрина, «похожие» и т.п.)
    const known = (state.items || []).find(l => String(l.lot) === String(slug.lot) && l.auction === slug.auction);
    if(!known) return; // нет данных под рукой — обычная навигация через SSR
    event.preventDefault();
    try{ history.pushState({apexLot:1, d:fromCatalog ? 1 : ((history.state && history.state.d) || 0) + 1}, "", link.getAttribute("href")); }catch(_){ location.href = link.href; return; }
    window.scrollTo(0, 0);
    renderDetail(known);
    refreshDetailInBackground(slug);
  });

  // Дропдауны в крошках: список моделей марки и поколений модели —
  // выбор без возврата в каталог (как у DreamBid)
  document.addEventListener("click", async event => {
    const openMenu = document.querySelector(".crumbMenuV1");
    const chev = event.target.closest("[data-crumb-drop]");
    if(!chev){
      if(openMenu && !event.target.closest(".crumbMenuV1")) openMenu.remove();
      return;
    }
    event.preventDefault();
    const wasOpen = openMenu && openMenu.parentElement === chev.parentElement;
    if(openMenu) openMenu.remove();
    if(wasOpen) return;
    const lot = state.selectedLot;
    if(!lot || !lot.makeId) return;
    const menu = document.createElement("div");
    menu.className = "crumbMenuV1";
    menu.innerHTML = `<div class="crumbMenuLoadV1">Загрузка…</div>`;
    chev.parentElement.appendChild(menu);
    try{
      if(chev.dataset.crumbDrop === "model"){
        const r = await api(`/api/auctions?action=models&manufacturer_id=${encodeURIComponent(lot.makeId)}`);
        menu.innerHTML = (r.items || []).map(m => {
          const cur = Number(m.id) === Number(lot.modelId);
          return `<a class="crumbOptV1${cur ? " isCurV1" : ""}" href="/auctions?make=${encodeURIComponent(lot.makeId)}&model=${encodeURIComponent(m.id)}"><span>${escapeHtml(displayModel(m.name))}</span><i>${cur ? "✓" : escapeHtml(String(m.qty || ""))}</i></a>`;
        }).join("") || `<div class="crumbMenuLoadV1">Пусто</div>`;
      }else{
        const r = await api(`/api/auctions?action=generations&model_id=${encodeURIComponent(lot.modelId)}`);
        const curGenA = chev.parentElement.querySelector("a");
        const curGenId = curGenA ? (curGenA.href.match(/generation=(\d+)/) || [])[1] : null;
        menu.innerHTML = (r.items || []).map(g => {
          const yrs = g.fromYear ? `${g.fromYear}–${g.toYear || "…"} · ` : "";
          const cur = String(g.id) === String(curGenId);
          return `<a class="crumbOptV1${cur ? " isCurV1" : ""}" href="/auctions?make=${encodeURIComponent(lot.makeId)}&model=${encodeURIComponent(lot.modelId)}&generation=${encodeURIComponent(g.id)}"><span>${escapeHtml(yrs + g.name)}</span><i>${cur ? "✓" : escapeHtml(String(g.qty || ""))}</i></a>`;
        }).join("") || `<div class="crumbMenuLoadV1">Пусто</div>`;
      }
    }catch(e){
      menu.innerHTML = `<div class="crumbMenuLoadV1">Не удалось загрузить</div>`;
    }
  });

  // API часто отдаёт generation: null — подбираем поколение по году лота
  // из справочника поколений модели (как делает DreamBid своим маппингом).
  async function fillGenCrumb(lot){
    if(lot.generationId || !lot.makeId || !lot.modelId || !lot.year) return;
    try{
      const r = await api(`/api/auctions?action=generations&model_id=${encodeURIComponent(lot.modelId)}`);
      const y = Number(lot.year);
      // Год смены поколения попадает в оба интервала (2011: E90 2005-13 и F3x 2011-20) —
      // берём то, к чьей середине выпуска год ближе, а не просто самое новое.
      const mid = x => ((x.fromYear || y) + (x.toYear || new Date().getFullYear())) / 2;
      const g = (r.items || [])
        .filter(x => x.fromYear && y >= x.fromYear && (!x.toYear || y <= x.toYear))
        .sort((a, b) => Math.abs(y - mid(a)) - Math.abs(y - mid(b)) || (b.fromYear || 0) - (a.fromYear || 0))[0];
      if(!g) return;
      const cur = parseSlug(currentSlug());
      if(!cur || String(cur.lot) !== String(lot.lot)) return;
      const crumbs = document.querySelector(".auctionCrumbsV1");
      if(!crumbs || crumbs.querySelector('a[href*="generation="]')) return;
      const lastText = [...crumbs.childNodes].reverse().find(n => n.nodeType === 3 && /\S/.test(n.nodeValue));
      if(!lastText) return;
      const wrap = document.createElement("span");
      wrap.className = "crumbDropV1";
      wrap.innerHTML = `<a href="/auctions?make=${encodeURIComponent(lot.makeId)}&model=${encodeURIComponent(lot.modelId)}&generation=${encodeURIComponent(g.id)}">${escapeHtml(g.name)}</a><button type="button" class="crumbChevV1" data-crumb-drop="gen" aria-label="Другие поколения"><svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 3.5 5 6.5 8 3.5"/></svg></button>`;
      crumbs.insertBefore(document.createTextNode(" / "), lastText);
      crumbs.insertBefore(wrap, lastText);
    }catch(e){ /* поколение — украшение крошек */ }
  }

  async function loadDetailFromUrl(){
    const slug = parseSlug(currentSlug());
    if(!slug) return false;
    $("#auctionCatalog").hidden = true;
    $("#auctionDetail").hidden = false;
    // SSR: лот уже вшит в HTML сервером (lot-page) — рендерим без запроса
    let ssr = window.__ssrLot;
    if(!ssr){
      const ssrEl = document.getElementById("ssrLotV1");
      if(ssrEl){ try{ ssr = JSON.parse(ssrEl.textContent); }catch(e){ ssr = null; } ssrEl.remove(); }
    }
    if(ssr && String(ssr.lot) === String(slug.lot) && ssr.auction === slug.auction){
      window.__ssrLot = null;
      renderDetail(ssr);
      return true;
    }
    $("#auctionDetail").innerHTML = '<div class="auctionMessageV1">Загружаем данные лота...</div>';
    try{
      const payload = await api(`/api/auctions?action=detail&auction=${encodeURIComponent(slug.auction)}&lot=${encodeURIComponent(slug.lot)}`);
      renderDetail(payload.lot);
    }catch(error){
      const demo = isLocalHost() && demoLots().find(l => String(l.lot) === String(slug.lot));
      if(demo){
        renderDetail(demo);
      }else{
        $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a><div class="auctionMessageV1">${escapeHtml(error.message || "Лот временно недоступен.")}</div>`;
      }
    }
    return true;
  }

  // VIN report — uses the dedicated /search-vin endpoint (car info + price history).
  async function openVinReport(vin){
    const clean = String(vin || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    $("#auctionCatalog").hidden = true;
    $("#auctionDetail").hidden = false;
    window.scrollTo(0, 0);
    // Строгая проверка VIN: ровно 17 символов, без букв I, O, Q. Иначе показываем
    // понятную ошибку формата, а не вводящее в заблуждение «лот не найден». P2-4.
    if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(clean)){
      $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← ${L("Назад к каталогу")}</a>
        <div class="vinEmptyV1">
          <h2>${L("Некорректный VIN")}</h2>
          <p>${L("VIN должен содержать ровно 17 символов, без букв I, O, Q. Проверьте номер и попробуйте снова.")}</p>
          <a class="vinLeadBtnV1" href="/index.html#lead">${L("Оставить заявку")}</a>
        </div>`;
      return;
    }
    $("#auctionDetail").innerHTML = '<div class="auctionMessageV1">Получаем отчёт по VIN…</div>';
    try{
      const payload = await api(`/api/auctions?action=vin&vin=${encodeURIComponent(clean)}`);
      renderDetail(payload.lot);
    }catch(error){
      $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← Назад к каталогу</a>
        <div class="vinEmptyV1">
          <h2>По VIN ${escapeHtml(clean)} лот не найден</h2>
          <p>Возможно, машина ещё не выставлена на Copart/IAAI или VIN указан с ошибкой. Проверьте номер или оставьте заявку — найдём и проверим вручную.</p>
          <a class="vinLeadBtnV1" href="/index.html#lead">Оставить заявку</a>
        </div>`;
    }
  }

  window.addEventListener("popstate", () => {
    // Вернулись на каталог, а он ещё в DOM (лот открывали из него без перезагрузки) — без перезагрузки и на том же месте
    if(!parseSlug(currentSlug()) && state.backSnap && (state.items || []).length && $("#auctionCatalog")){ showCatalogAgain(); return; }
    try{ sessionStorage.setItem(BACK_FLAG, "1"); }catch(e){}   // после перезагрузки вернём прокрутку
    location.reload();
  });
  // Кнопка «Вернуться к каталогу»: на то же место, откуда пришли (фильтры, страница, прокрутка), а не в начало каталога
  document.addEventListener("click", event => {
    const back = event.target.closest(".detailBackV1");
    if(!back || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    const d = history.state && history.state.d;
    if(d && state.backSnap && (state.items || []).length){ event.preventDefault(); history.go(-d); return; }
    const snap = readBackSnap();
    if(snap){
      event.preventDefault();
      try{ sessionStorage.setItem(BACK_FLAG, "1"); }catch(e){}
      location.href = snap.href;
    }
  });

  // Номер лота ищем напрямую через detail (search_query API по лотам не ищет):
  // сначала Copart, затем IAAI.
  async function openLotByNumber(lotNo){
    $("#auctionCatalog").hidden = true;
    $("#auctionDetail").hidden = false;
    $("#auctionDetail").innerHTML = '<div class="auctionMessageV1">Ищем лот…</div>';
    window.scrollTo(0, 0);
    // Номер лота НЕ уникален между площадками (46053676 = Tesla на IAAI и Camaro на Copart) —
    // спрашиваем обе параллельно; нашлись две разные машины → даём выбрать, а не открываем первую.
    const res = await Promise.allSettled(["copart", "iaai"].map(auc => api(`/api/auctions?action=detail&auction=${auc}&lot=${encodeURIComponent(lotNo)}`)));
    const found = res.map(r => r.status === "fulfilled" && r.value && r.value.lot && r.value.lot.lot ? r.value.lot : null).filter(Boolean);
    const distinct = found.filter((l, i) => !found.slice(0, i).some(o => (o.vin && l.vin && o.vin === l.vin) || String(o.auction) === String(l.auction)));
    if(distinct.length === 1 || (distinct.length > 1 && distinct.every(l => l.vin && l.vin === distinct[0].vin))){ renderDetail(distinct[0]); return; }
    if(distinct.length > 1){
      $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">${L("← Вернуться к каталогу")}</a>
        <div class="auctionMessageV1">${L("Номер лота")} ${escapeHtml(lotNo)} ${L("есть на обеих площадках — это разные машины. Выберите нужную:")}</div>
        <div class="lotPickV1">${distinct.map(renderShowcaseCard).join("")}</div>`;
      return;
    }
    $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a><div class="auctionMessageV1">Лот ${escapeHtml(lotNo)} не найден на Copart и IAAI.</div>`;
  }

  function triggerSearch(){
    const smart = parseSmartSearch($("#auctionSmartSearch")?.value);
    // A complete VIN → open the VIN report instead of filtering the list.
    if(smart.vin){ openVinReport(smart.vin); return; }
    if(smart.lot){ openLotByNumber(smart.lot); return; }
    state.page = 1; state.displayPage = 1;
    loadLots();
  }

  function openLead(lot){
    state.selectedLot = lot;
    const modal = $("#leadModal");
    const form = $("#auctionLeadForm");
    form.vin.value = lot.vin || "";
    form.lot.value = lot.lot || "";
    form.auction.value = lot.auction?.toUpperCase() || "";
    // Показать клиенту, по какой именно машине он оставляет заявку.
    const titleEl = document.getElementById("leadCarTitle");
    if(titleEl){
      const t = lotTitle(lot);
      titleEl.textContent = t || "";
      titleEl.hidden = !t;
    }
    const status = $("#leadFormStatus");
    status.textContent = "";
    status.className = "";
    modal.hidden = false;
    document.body.classList.add("leadModalOpenV1");
  }

  function closeLead(){
    const modal = $("#leadModal");
    if(modal) modal.hidden = true;
    document.body.classList.remove("leadModalOpenV1");
  }

  async function submitLead(event){
    event.preventDefault();
    const form = event.currentTarget;
    const btn = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    const status = $("#leadFormStatus");
    status.className = "";
    status.textContent = L("Отправляем заявку...");
    if(btn) btn.disabled = true; // защита от двойной отправки
    try{
      await api("/api/auctions?action=lead", {method:"POST", body:data});
      status.className = "leadOkV1";
      status.textContent = L("Заявка отправлена. Мы свяжемся с вами.");
      form.name.value = "";
      form.phone.value = "";
      form.comment.value = "";
      // Автозакрытие после подтверждения — клиенту не нужно жать «×».
      // Кнопку держим disabled до закрытия: иначе в окне 2.2с можно нажать
      // submit повторно и уйдёт пустой запрос (P3-1).
      setTimeout(() => { closeLead(); status.textContent = ""; status.className = ""; if(btn) btn.disabled = false; }, 2200);
    }catch(error){
      status.className = "leadErrV1";
      // Сетевой сбой (fetch reject) даёт техническое «Failed to fetch/Load failed» —
      // показываем дружелюбный fallback. Серверная ошибка уже приходит понятным текстом.
      const msg = String((error && error.message) || "");
      const isNetwork = !msg || /failed to fetch|load failed|networkerror|fetch/i.test(msg);
      status.textContent = isNetwork
        ? L("Не удалось отправить заявку. Напишите нам в Telegram или попробуйте позже.")
        : (L(msg) || L("Не удалось отправить заявку. Напишите нам в Telegram или попробуйте позже."));
      if(btn) btn.disabled = false; // ошибка — разрешаем повтор
    }
  }

  function rangeUnitFactor(rangeEl){
    const t = rangeEl.closest("details")?.querySelector("[data-odo-unit].active");
    return (t && t.dataset.odoUnit === "km") ? 1.609 : 1;
  }
  function initRanges(){
    document.querySelectorAll("[data-range]").forEach(range => {
      if(range.dataset.init) return;
      range.dataset.init = "1";
      const min = Number(range.dataset.min), max = Number(range.dataset.max), dec = range.hasAttribute("data-decimal");
      const lo = range.querySelector(".rLoV2"), hi = range.querySelector(".rHiV2"), fill = range.querySelector(".rangeFillV2");
      const nums = range.querySelectorAll(".rangeNumsV2 input"), numLo = nums[0], numHi = nums[1];
      const rangeTitle = (range.closest("details")?.querySelector("summary")?.textContent || "").trim();
      lo.setAttribute("aria-label", rangeTitle + " — от"); hi.setAttribute("aria-label", rangeTitle + " — до");
      const pct = v => ((v - min) / (max - min)) * 100;
      const paint = () => {
        const a = Math.min(Number(lo.value), Number(hi.value)), b = Math.max(Number(lo.value), Number(hi.value));
        fill.style.left = pct(a) + "%";
        fill.style.width = (pct(b) - pct(a)) + "%";
      };
      const fromSlider = () => {
        let a = Number(lo.value), b = Number(hi.value);
        if(a > b){ const t = a; a = b; b = t; lo.value = a; hi.value = b; }
        const f = rangeUnitFactor(range);
        const rd = v => dec ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v * f);
        numLo.value = a > min ? rd(a) : "";
        numHi.value = b < max ? rd(b) : "";
        paint();
      };
      const fromNum = () => {
        const f = rangeUnitFactor(range);
        lo.value = numLo.value !== "" ? Math.min(max, Math.max(min, Number(numLo.value) / f)) : min;
        hi.value = numHi.value !== "" ? Math.min(max, Math.max(min, Number(numHi.value) / f)) : max;
        paint();
      };
      lo.addEventListener("input", fromSlider);
      hi.addEventListener("input", fromSlider);
      if(numLo) numLo.addEventListener("input", fromNum);
      if(numHi) numHi.addEventListener("input", fromNum);
      range._refresh = fromSlider;
      range._applyNums = fromNum; // sync slider position from the number inputs (used on URL restore)
      paint();
    });
  }

  // optionsFn returns an array of strings or {id,name,image,qty}. onPick(option) fires on selection.
  function setupCombo(inputId, menuId, optionsFn, onPick){
    const input = document.getElementById(inputId);
    const menu = document.getElementById(menuId);
    if(!input || !menu) return;
    const wrap = input.closest(".comboV2");
    const norm = o => (typeof o === "string" ? {id:null, name:o} : o);
    const render = (showAll) => {
      const q = showAll ? "" : input.value.trim().toLowerCase();
      const opts = (optionsFn() || []).map(norm).filter(o => !q || String(o.name).toLowerCase().includes(q));
      menu._opts = opts;
      menu.innerHTML = opts.length
        ? opts.map((o, i) => `<div class="comboOptV2" data-i="${i}">${o.image ? `<img class="comboLogoV2" src="${escapeHtml(o.image)}" alt="" loading="lazy">` : ""}<span>${escapeHtml(o.name)}</span>${o.qty ? `<span class="comboQtyV2">${escapeHtml(o.qty)}</span>` : ""}</div>`).join("")
        : `<div class="comboEmptyV2">Ничего не найдено</div>`;
    };
    const close = () => { menu.hidden = true; };
    input.addEventListener("focus", () => { render(true); menu.hidden = false; setTimeout(() => { try{ input.select(); }catch(e){} }, 0); });
    input.addEventListener("click", () => { render(true); menu.hidden = false; });
    input.addEventListener("input", () => { render(false); menu.hidden = false; });
    input.addEventListener("keydown", e => { if(e.key === "Escape") close(); });
    menu.addEventListener("mousedown", e => {
      const el = e.target.closest("[data-i]");
      if(!el) return;
      e.preventDefault();
      const opt = menu._opts[Number(el.dataset.i)];
      input.value = opt.name;
      close();
      if(onPick) onPick(opt);
    });
    document.addEventListener("click", e => { if(e.target.closest(".comboV2") !== wrap) close(); });
  }

  // Плейсхолдер, который меняется на лету: i18n кэширует ПЕРВЫЙ русский текст поля и на RO/EN
  // возвращал бы его перевод поверх нового — обновляем и кэш, и сам атрибут.
  function setPhV1(el, text){ if(!el) return; el.__i18nPh = text; el.setAttribute("placeholder", L(text)); }

  function initCarData(){
    const data = window.CAR_DATA || {};
    const makeInput = document.getElementById("filterMakeV2");
    const makeId = document.getElementById("filterMakeIdV2");
    const modelInput = document.getElementById("filterModelV2");
    const modelId = document.getElementById("filterModelIdV2");
    const genInput = document.getElementById("filterGenV2");
    const genId = document.getElementById("filterGenIdV2");
    let manufacturers = [];
    let models = [];
    let generations = [];

    function resetGenerations(){
      generations = [];
      if(genInput){ genInput.value = ""; setPhV1(genInput, "Сначала выберите модель"); }
      if(genId) genId.value = "";
    }

    // Марка + Модель: списки с галочками и мультивыбором (как DreamBid). Выбранные — сверху, список фильтруется поиском.
    const makeSearch = makeInput, modelSearch = modelInput;
    const makeList = document.getElementById("makeListV1"), modelList = document.getElementById("modelListV1");
    const modelsCache = {};
    let applyTimer = null;
    const queueApply = () => { if(window.matchMedia("(max-width:1100px)").matches) return; clearTimeout(applyTimer); applyTimer = setTimeout(() => { state.page = 1; state.displayPage = 1; exitDiscovery(); $("#auctionFiltersForm").requestSubmit(); }, 350); };
    const syncHidden = () => { if(makeId) makeId.value = ms.makes.map(m => m.id).join(","); if(modelId) modelId.value = ms.models.map(m => m.id).join(","); };
    async function ensureModels(mid){
      if(!modelsCache[mid]){
        try{ const r = await api(`/api/auctions?action=models&manufacturer_id=${encodeURIComponent(mid)}`); modelsCache[mid] = (r.items || []).map(x => ({id:String(x.id), name:displayModel(x.name), makeId:String(mid), qty:x.qty})); }
        catch(e){ modelsCache[mid] = []; }
      }
      return modelsCache[mid];
    }
    const rowHtml = (kind, id, name, image, qty, checked, sub) => `<label class="msRowV1${checked ? " isOnV1" : ""}"><input type="checkbox" data-ms-${kind}="${escapeHtml(String(id))}"${checked ? " checked" : ""}>${image ? `<img class="msLogoV1" src="${escapeHtml(image)}" alt="" loading="lazy">` : ""}<span class="msNameV1">${escapeHtml(name)}${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span>${qty ? `<i>${escapeHtml(String(qty))}</i>` : ""}</label>`;
    function renderMakes(){
      if(!makeList) return;
      if(!manufacturers.length){ makeList.innerHTML = `<p class="msEmptyV1">${escapeHtml(L("Список марок недоступен"))}</p>`; return; }
      const q = (makeSearch?.value || "").trim().toLowerCase();
      const on = new Set(ms.makes.map(m => m.id));
      const list = manufacturers.filter(m => m.id != null && (!q || String(m.name).toLowerCase().includes(q)));
      const rows = [...list.filter(m => on.has(String(m.id))), ...list.filter(m => !on.has(String(m.id)))];
      makeList.innerHTML = rows.length ? rows.map(m => rowHtml("make", m.id, m.name, m.image, m.qty, on.has(String(m.id)))).join("") : `<p class="msEmptyV1">${escapeHtml(L("Ничего не найдено"))}</p>`;
    }
    function renderModels(){
      if(!modelList) return;
      if(!ms.makes.length){ modelList.innerHTML = `<p class="msEmptyV1">${escapeHtml(L("Сначала выберите марку"))}</p>`; return; }
      const q = (modelSearch?.value || "").trim().toLowerCase();
      const on = new Set(ms.models.map(m => m.id));
      const multi = ms.makes.length > 1;
      let all = [];
      ms.makes.forEach(mk => (modelsCache[mk.id] || []).forEach(m => all.push({...m, makeName:mk.name})));
      if(ms.makes.some(mk => modelsCache[mk.id] === undefined)){ modelList.innerHTML = `<p class="msEmptyV1">${escapeHtml(L("Загрузка моделей…"))}</p>`; return; }
      all = all.filter(m => !q || m.name.toLowerCase().includes(q));
      const rows = [...all.filter(m => on.has(m.id)), ...all.filter(m => !on.has(m.id))];
      modelList.innerHTML = rows.length ? rows.map(m => rowHtml("model", m.id, m.name, "", m.qty, on.has(m.id), multi ? m.makeName : "")).join("") : `<p class="msEmptyV1">${escapeHtml(L("Ничего не найдено"))}</p>`;
    }
    async function refreshGenerationsForSelection(){
      resetGenerations();
      if(ms.models.length !== 1){ if(genInput) setPhV1(genInput, ms.models.length > 1 ? "Выберите одну модель" : "Сначала выберите модель"); return; }
      if(genInput) setPhV1(genInput, "Загрузка поколений…");
      try{ const r = await api(`/api/auctions?action=generations&model_id=${encodeURIComponent(ms.models[0].id)}`); generations = r.items || []; }
      catch(e){ generations = []; }
      if(genInput) setPhV1(genInput, generations.length ? "Любое поколение" : "Поколения не найдены");
    }
    makeList?.addEventListener("change", async e => {
      const cb = e.target.closest("[data-ms-make]"); if(!cb) return;
      const id = cb.dataset.msMake, m = manufacturers.find(x => String(x.id) === id);
      if(cb.checked){ if(m && !ms.makes.some(x => x.id === id)) ms.makes.push({id, name:m.name}); }
      else{ ms.makes = ms.makes.filter(x => x.id !== id); ms.models = ms.models.filter(x => x.makeId !== id); }
      syncHidden(); renderMakes(); renderModels();
      if(cb.checked){ await ensureModels(id); renderModels(); }
      refreshGenerationsForSelection();
      queueApply();
    });
    modelList?.addEventListener("change", e => {
      const cb = e.target.closest("[data-ms-model]"); if(!cb) return;
      const id = cb.dataset.msModel;
      if(cb.checked){
        const found = ms.makes.map(mk => (modelsCache[mk.id] || []).find(x => x.id === id)).find(Boolean);
        if(found && !ms.models.some(x => x.id === id)) ms.models.push({id, name:found.name, makeId:found.makeId});
      }else ms.models = ms.models.filter(x => x.id !== id);
      syncHidden(); renderModels(); refreshGenerationsForSelection(); queueApply();
    });
    makeSearch?.addEventListener("input", renderMakes);
    modelSearch?.addEventListener("input", renderModels);
    msApi.removeMake = id => { ms.makes = ms.makes.filter(x => x.id !== id); ms.models = ms.models.filter(x => x.makeId !== id); syncHidden(); renderMakes(); renderModels(); refreshGenerationsForSelection(); state.page = 1; state.displayPage = 1; loadLots(); };
    msApi.removeModel = id => { ms.models = ms.models.filter(x => x.id !== id); syncHidden(); renderModels(); refreshGenerationsForSelection(); state.page = 1; state.displayPage = 1; loadLots(); };
    msApi.reset = () => { ms.makes = []; ms.models = []; syncHidden(); if(makeSearch) makeSearch.value = ""; if(modelSearch) modelSearch.value = ""; renderMakes(); renderModels(); resetGenerations(); };

    // Generation → generation_id (depends on the selected model)
    setupCombo("filterGenV2", "genMenuV2", () => generations, (opt) => { if(genId) genId.value = opt.id != null ? opt.id : ""; });
    genInput?.addEventListener("input", () => { if(genId) genId.value = ""; });

    // Каталог открыт по ссылке (?make=16&model=93&generation=…): в форме стоят только id, а поля
    // показывали «Выбрать марку» — человек не видел, по чему отфильтровано, и не мог сбросить.
    // Подставляем названия и подгружаем зависимые списки.
    async function hydrateNamesFromIds(){
      const mkIds = msIdsOf("filterMakeIdV2"), mdIds = msIdsOf("filterModelIdV2"), gn = genId && genId.value;
      ms.makes = mkIds.map(id => manufacturers.find(m => String(m.id) === id)).filter(Boolean).map(m => ({id:String(m.id), name:m.name}));
      await Promise.all(ms.makes.map(m => ensureModels(m.id)));
      ms.models = mdIds.map(id => { for(const mk of ms.makes){ const f = (modelsCache[mk.id] || []).find(x => x.id === id); if(f) return {id, name:f.name, makeId:mk.id}; } return null; }).filter(Boolean);
      renderMakes(); renderModels();
      if(ms.models.length === 1){
        try{ const r = await api(`/api/auctions?action=generations&model_id=${encodeURIComponent(ms.models[0].id)}`); generations = r.items || []; }catch(e){ generations = []; }
        if(genInput) setPhV1(genInput, generations.length ? "Любое поколение" : "Поколения не найдены");
        if(gn && genInput && !genInput.value){ const g = generations.find(x => String(x.id) === String(gn)); if(g) genInput.value = g.name; }
      }
    }
    api(`/api/auctions?action=manufacturers`).then(r => { manufacturers = r.items || []; Promise.resolve(hydrateNamesFromIds()).then(() => renderActiveFilters()).catch(() => {}); }).catch(() => { manufacturers = []; renderMakes(); });

    // Damage, state: mutable arrays — filled from API on load
    let damages = [];
    let states  = [];

    // Damage: sent as text (confirmed filterable by API)
    setupCombo("filterDamageV2", "damageMenuV2", () => damages.filter(d => !damageList().includes(typeof d === "string" ? d : d.name)), opt => {
      const input = document.getElementById("filterDamageV2");
      if(input) input.value = "";
      setDamageList([...damageList(), opt.name]);
    });
    document.getElementById("damageChipsV1")?.addEventListener("click", e => {
      const b = e.target.closest(".dmgChipV1");
      if(!b) return;
      const l = damageList(); l.splice(Number(b.dataset.i), 1); setDamageList(l);
    });


    // State: store state_code (e.g. "CA"), NOT numeric id
    const stateId = document.getElementById("filterStateIdV2");
    setupCombo("filterStateV2", "stateMenuV2", () => states, (opt) => {
      if(stateId) stateId.value = opt.code || String(opt.id || "");
    });
    document.getElementById("filterStateV2")?.addEventListener("input", () => { if(stateId) stateId.value = ""; });

    // Словари грузим ЛЕНИВО — только при первом открытии соответствующего
    // фильтра, а не веером на старте. Раньше dict=damages тянул все страницы
    // live-API (~6с) прямо на критическом пути каталога и тормозил первый экран.
    const pickedCountries = [...document.querySelectorAll('input[name="country"]:checked')].map(x => x.value);
    const country = pickedCountries.length === 1 ? pickedCountries[0] : "US";
    const lazyDict = (inputId, menuId, url, assign) => {
      const input = document.getElementById(inputId);
      const menu = document.getElementById(menuId);
      if(!input) return;
      let started = false;
      input.addEventListener("focus", () => {
        if(started) return; started = true;
        api(url).then(r => {
          assign(r.items || []);
          // данные приехали позже открытия — перерисовать, если меню ещё открыто
          if(menu && !menu.hidden) input.dispatchEvent(new Event("click"));
        }).catch(() => {});
      });
    };
    lazyDict("filterDamageV2", "damageMenuV2", "/api/auctions?action=usadict&dict=damages&v=3", v => { damages = v; });
    lazyDict("filterStateV2",  "stateMenuV2",  `/api/auctions?action=usadict&dict=states&country=${country}`, v => { states = v; });
  }

  function bindEvents(){
    // Колесо мыши/тачпад над числовым полем в фокусе меняло значение (ставку,
    // курс) — легко ошибиться. Снимаем фокус: значение не трогается, страница
    // скроллится как обычно.
    document.addEventListener("wheel", event => {
      const t = event.target;
      if(t && t.tagName === "INPUT" && t.type === "number" && document.activeElement === t) t.blur();
    }, {passive:true});

    // Поиск со страницы лота: VIN → фильтр по VIN, номер лота → поиск лота,
    // текст → поиск по названию; уводим в каталог с готовым запросом
    document.addEventListener("submit", event => {
      const form = event.target.closest("[data-detail-search]");
      if(!form) return;
      event.preventDefault();
      const smart = parseSmartSearch(form.querySelector("input")?.value);
      // VIN — сразу VIN-отчёт (ищет и в архиве), как смарт-поиск каталога;
      // фильтр каталога по VIN показал бы пусто для проданных машин
      if(smart.vin){ try{ history.pushState({apexVin:1}, "", `/auctions?vin=${encodeURIComponent(smart.vin)}`); }catch(e){} openVinReport(smart.vin); }
      else if(smart.lot) location.href = `/auctions?q=${encodeURIComponent(smart.lot)}`;
      else if(smart.name) location.href = `/auctions?name=${encodeURIComponent(smart.name)}`;
    });
    // «Поделиться» — системный share на мобильном, буфер обмена на десктопе
    $("#shareCatalogBtn")?.addEventListener("click", async () => {
      const btn = $("#shareCatalogBtn");
      const url = location.href;
      try{
        if(navigator.share){ await navigator.share({title:document.title, url}); return; }
        await navigator.clipboard.writeText(url);
        const label = btn.querySelector("span");
        if(label){ const t = label.textContent; label.textContent = "Скопировано"; setTimeout(() => { label.textContent = t; }, 1400); }
      }catch(_){}
    });
    // Инфо-баннер: показываем, пока пользователь не закрыл
    (function(){
      const banner = $("#auctionInfoBanner");
      if(!banner) return;
      try{ if(!localStorage.getItem("apexAucInfoHidden")) banner.hidden = false; }catch(_){ banner.hidden = false; }
      $("#infoCloseBtn")?.addEventListener("click", () => {
        banner.hidden = true;
        try{ localStorage.setItem("apexAucInfoHidden", "1"); }catch(_){}
      });
    })();
    $("#auctionSearchBtn").addEventListener("click", () => { exitDiscovery(); triggerSearch(); });
    ["#auctionSmartSearch"].forEach(selector => {
      $(selector)?.addEventListener("keydown", event => {
        if(event.key === "Enter"){ event.preventDefault(); triggerSearch(); }
      });
    });
    (function initSortDrop(){
      const drop = document.getElementById("sortDropV1");
      const trig = document.getElementById("sortDropTrigV1");
      const menu = document.getElementById("sortDropMenuV1");
      const lbl  = document.getElementById("sortDropLabelV1");
      const inp  = document.getElementById("auctionSort");
      if(!drop) return;
      function setSort(val, silent){
        const opt = menu.querySelector(`[data-sort="${val}"]`);
        if(!opt) return;
        menu.querySelectorAll(".sortOptV1").forEach(el => el.classList.remove("sortOptActiveV1"));
        opt.classList.add("sortOptActiveV1");
        lbl.textContent = opt.textContent.trim();
        inp.value = val;
        if(!silent){ exitDiscovery(); state.page = 1; state.displayPage = 1; loadLots(); }
      }
      const urlSort = new URLSearchParams(location.search).get("sort");
      if(urlSort) setSort(urlSort, true);
      trig.addEventListener("click", e => { e.stopPropagation(); drop.classList.toggle("openV1"); menu.hidden = !menu.hidden; });
      document.addEventListener("click", e => { if(!drop.contains(e.target)){ drop.classList.remove("openV1"); menu.hidden = true; } });
      menu.addEventListener("click", e => {
        const opt = e.target.closest(".sortOptV1");
        if(!opt || opt.classList.contains("sortOptActiveV1")) return;
        setSort(opt.dataset.sort);
        drop.classList.remove("openV1"); menu.hidden = true;
      });
    }());
    document.querySelectorAll("[data-auction-switch]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-auction-switch]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        state.auction = button.dataset.auctionSwitch;
        exitDiscovery(); state.page = 1; state.displayPage = 1;
        loadLots();
      });
    });
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        state.tab = button.dataset.tab || "all";
        exitDiscovery(); state.page = 1; state.displayPage = 1;
        loadLots();
      });
    });
    $("#auctionFiltersForm").addEventListener("submit", event => {
      event.preventDefault();
      exitDiscovery(); state.page = 1; state.displayPage = 1;
      document.body.classList.remove("filtersOpenV1");
      // Timed-очередь живёт часами — сортируем по времени окончания,
      // как IAAI («Auction Date: Soonest First»), если стоит дефолтный сорт
      // Правило Федора (22.09.2026): «Рекомендованные» — только для витрины без фильтров.
      // Как только пользователь применил любой фильтр — сортируем по ближайшим торгам.
      const fp = formParams(); ["auction","tab","sort","page","per_page"].forEach(k => fp.delete(k));
      const anyFilter = [...fp.keys()].length > 0;
      const saleVal = [...document.querySelectorAll('input[name="saleStatus"]:checked')].some(x => x.value === "timed");
      if((anyFilter || saleVal) && $("#auctionSort").value === "smart"){
        $("#auctionSort").value = "soon";
        const lbl = document.getElementById("sortDropLabelV1");
        if(lbl) lbl.textContent = "Скоро торги";
        document.querySelectorAll("#sortDropMenuV1 .sortOptV1").forEach(el => el.classList.toggle("sortOptActiveV1", el.dataset.sort === "soon"));
      }
      loadLots();
    });
    document.getElementById("smartSelV1")?.addEventListener("change", () => { $("#auctionFiltersForm").requestSubmit(); });
    // Галочки фильтров (топливо, кузов, привод…) на десктопе применяются сразу; на телефоне — кнопкой «Показать» (панель-шторка).
    let optTimer = null;
    $("#auctionFiltersForm").addEventListener("change", e => {
      if(!e.target.closest(".optV2") || e.target.name === "smart" || window.matchMedia("(max-width:1100px)").matches) return;
      clearTimeout(optTimer);
      optTimer = setTimeout(() => { state.page = 1; state.displayPage = 1; exitDiscovery(); $("#auctionFiltersForm").requestSubmit(); }, 450);
    });
    document.getElementById("activeFiltersV1")?.addEventListener("click", e => {
      const chip = e.target.closest(".afChipV1");
      if(chip){
        const c = activeChips[Number(chip.dataset.af)];
        if(!c) return;
        c.remove();
        state.page = 1; state.displayPage = 1;
        loadLots();
        return;
      }
      if(e.target.closest("#afClearV1")){ $("#resetFiltersBtn").click(); return; }
      if(e.target.closest("#afBellV1")){ alertSubscribe("search", {qs:location.search.replace(/^\?/, ""), name:searchAlertName()}); return; }
      if(e.target.closest("#afFavBellV1")){
        const lots = favList().filter(alertable).map(l => ({id:l.id, title:lotTitle(l), saleDate:l.auctionDate, vin:l.vin || ""}));
        alertSubscribe("lot", {lots}, () => alertLotMark(lots.map(l => l.id)));
        return;
      }
      const sv = e.target.closest("#afSaveV1");
      if(sv){
        const ok = saveCurrentSearch();
        const old = sv.textContent;
        sv.textContent = ok ? L("Сохранено ✓") : old;
        setTimeout(() => { sv.textContent = old; }, 1600);
      }
    });
    document.getElementById("savedBtnV1")?.addEventListener("click", () => {
      const panel = document.getElementById("savedPanelV1"), btn = document.getElementById("savedBtnV1");
      if(!panel) return;
      const open = panel.hidden;
      if(open) renderSavedPanel();
      panel.hidden = !open;
      btn.classList.toggle("active", open);
      btn.setAttribute("aria-expanded", String(open));
    });
    document.getElementById("savedPanelV1")?.addEventListener("change", e => {
      if(!e.target.closest("[data-pref]")) return;
      const prefs = {};
      document.querySelectorAll("#svAlertsV1 [data-pref]").forEach(c => { prefs[c.dataset.pref] = c.checked; });
      api("/api/auctions?action=alertprefs", {method:"POST", body:{token:alertTokenGet(), prefs}}).catch(() => {});
    });
    document.getElementById("savedPanelV1")?.addEventListener("click", e => {
      const alDel = e.target.closest("[data-al-del]");
      if(alDel){
        api("/api/auctions?action=alertdel", {method:"POST", body:{token:alertTokenGet(), id:Number(alDel.dataset.alDel)}}).then(() => loadAlertSubsInto(document.getElementById("svAlertsV1"))).catch(() => {});
        return;
      }
      const del = e.target.closest("[data-sv-del]");
      const list = savedLoad();
      if(del){ list.splice(Number(del.dataset.svDel), 1); savedStore(list); updateSavedCount(); renderSavedPanel(); return; }
      const open = e.target.closest("[data-sv-open]");
      if(open && list[Number(open.dataset.svOpen)]) location.href = `${location.pathname}?${list[Number(open.dataset.svOpen)].qs}`;
    });
    updateSavedCount();
    $("#resetFiltersBtn").addEventListener("click", () => {
      $("#auctionFiltersForm").reset();
      // Скрытые ID комбо-фильтров form.reset() не чистит — фильтр «залипал»
      ["filterMakeIdV2","filterModelIdV2","filterGenIdV2","filterMakeV2","filterModelV2","filterGenV2"].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = "";
      });
      msApi.reset();
      setDamageList([]);
      const dInp = document.getElementById("filterDamageV2"); if(dInp) dInp.value = "";
      ["#auctionSmartSearch"].forEach(selector => {
        const input = $(selector);
        if(input) input.value = "";
      });
      document.querySelectorAll(".dateQuickV2 button.active").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("[data-range]").forEach(range => { if(range._refresh) range._refresh(); });
      state.page = 1; state.displayPage = 1;
      loadLots();
    });
    document.getElementById("paginationV1")?.addEventListener("click", e => {
      if(e.target.id === "pgLoadMoreBtn"){
        if(state.loading || !state.hasMore) return;
        // Мгновенная обратная связь: подгрузка может занять несколько секунд
        e.target.disabled = true;
        e.target.textContent = "Загружаем…";
        state.page++;
        loadLots({append: true});
        return;
      }
      const btn = e.target.closest(".pgBtnV1");
      if(!btn || btn.disabled || btn.classList.contains("pgActiveV1")) return;
      const page = parseInt(btn.dataset.page);
      if(!page || page < 1) return;
      if(isServerPaging()){
        state.page = page; state.displayPage = 1;
        const top = document.getElementById("auctionCards")?.offsetTop ?? 0;
        window.scrollTo({top: Math.max(0, top - 80), behavior:"smooth"});
        loadLots();
        return;
      }
      const loadedPages = Math.ceil(state.items.length / state.displayPageSize);
      if(page > loadedPages && state.hasMore){
        state.page++;
        state.displayPage = page;
        loadLots({append: true});
        return;
      }
      state.displayPage = page;
      const cardsTop = document.getElementById("auctionCards")?.offsetTop ?? 0;
      window.scrollTo({top: Math.max(0, cardsTop - 80), behavior:"smooth"});
      renderCards();
    });
    const sidebar = $("#auctionFilters");
    function openFiltersDrawer(){ document.body.classList.add("filtersOpenV1"); }
    function closeFiltersDrawer(){ document.body.classList.remove("filtersOpenV1"); }
    $("#openFiltersBtn").addEventListener("click", openFiltersDrawer);
    $("#searchSettingsBtn")?.addEventListener("click", openFiltersDrawer);
    $("#closeFiltersBtn").addEventListener("click", closeFiltersDrawer);
    document.addEventListener("click", event => {
      const warn = event.target.closest("[data-sold-warn]");
      if(warn){
        event.stopPropagation();
        const hide = event.target.closest("[data-sold-hide]");
        if(hide){ event.preventDefault(); try{ sessionStorage.setItem("soldWarnHide:" + hide.dataset.soldHide, "1"); }catch(e){} warn.remove(); }
        return;   // ссылка «Предыдущий аукцион» — обычный переход
      }
      const slideBtn = event.target.closest(".dbSlideBtn");
      if(slideBtn){
        event.preventDefault();
        event.stopPropagation();
        const card = slideBtn.closest(".dbPhoto");
        if(!card) return;
        const lid = card.dataset.lid;
        const lot = state.items.find(l => String(l.id) === String(lid));
        if(!lot || !lot.images?.length) return;
        const img = card.querySelector(".dbSlideImg");
        const counter = card.querySelector(".dbPhotoCount");
        const dir = parseInt(slideBtn.dataset.dir) || 1;
        // В базе у лота хранятся только 4 фото (экономия места), а счётчик показывал 1/19 —
        // при первом листании дотягиваем полный набор со страницы лота, дальше листаем все.
        if(!lot._fullImgs && Number(lot.photoCount) > lot.images.length){
          lot._fullImgs = "loading";
          api(`/api/auctions?action=detail&auction=${encodeURIComponent(lot.auction)}&lot=${encodeURIComponent(lot.lot)}`)
            .then(p => { const im = p && p.lot && Array.isArray(p.lot.images) ? p.lot.images.filter(Boolean) : []; if(im.length > lot.images.length) lot.images = im; lot._fullImgs = "done";
              const i2 = parseInt(img?.dataset.slide || "0"); if(counter) counter.textContent = `${i2 + 1}/${lot.images.length}`; })
            .catch(() => { lot._fullImgs = "done"; });
        }
        let idx = parseInt(img?.dataset.slide || "0");
        idx = (idx + dir + lot.images.length) % lot.images.length;
        if(img){ img.dataset.full = lot.images[idx]; img.src = cardImg(lot.images[idx]); img.dataset.slide = idx; }
        if(counter) counter.textContent = `${idx + 1}/${lot.images.length}`;
        return;
      }
      const copyEl = event.target.closest("[data-copy]");
      if(copyEl){
        event.preventDefault();
        event.stopPropagation();
        const val = copyEl.dataset.copy || "";
        const done = () => { copyEl.classList.add("copiedV1"); setTimeout(() => copyEl.classList.remove("copiedV1"), 1100); };
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(val).then(done).catch(() => {
            const ta = document.createElement("textarea"); ta.value = val; document.body.appendChild(ta); ta.select();
            try{ document.execCommand("copy"); }catch(e){} ta.remove(); done();
          });
        }else{
          const ta = document.createElement("textarea"); ta.value = val; document.body.appendChild(ta); ta.select();
          try{ document.execCommand("copy"); }catch(e){} ta.remove(); done();
        }
        return;
      }
      const expBtn = event.target.closest(".dbExpandV1");
      if(expBtn){
        event.preventDefault();
        const card = expBtn.closest(".dbCard");
        const open = card.classList.toggle("dbOpenV1");
        expBtn.textContent = open ? "Свернуть" : "Развернуть";
        return;
      }
      const histMore = event.target.closest("[data-hist-more]");
      if(histMore){ histMore.closest(".dSec")?.querySelectorAll(".histHiddenV1").forEach(r => r.classList.remove("histHiddenV1")); histMore.remove(); return; }
      const bellBtn = event.target.closest("[data-alert-lot]");
      if(bellBtn){
        event.preventDefault();
        event.stopPropagation();
        const id = bellBtn.dataset.alertLot;
        const lot = state.items.find(l => String(l.id) === String(id)) || (state.selectedLot && String(state.selectedLot.id) === String(id) ? state.selectedLot : null);
        if(lot) alertSubscribe("lot", {lots:[{id:String(lot.id), title:lotTitle(lot), saleDate:lot.auctionDate, vin:lot.vin || ""}]}, () => alertLotMark([String(lot.id)]));
        return;
      }
      const favBtn = event.target.closest("[data-fav]");
      if(favBtn){
        event.preventDefault();
        event.stopPropagation();
        const id = favBtn.dataset.fav;
        const lot = state.items.find(l => String(l.id) === String(id)) || (state.selectedLot && String(state.selectedLot.id) === String(id) ? state.selectedLot : null);
        if(lot){
          const on = favToggle(lot);
          favBtn.classList.toggle("is-fav", on);
          const label = favBtn.querySelector("span");
          if(label) label.textContent = on ? "В избранном" : "В избранное";
          if(state.tab === "favorites") renderFavorites();
        }
        return;
      }
      if(event.target.closest("#openFiltersBtn")) document.body.classList.add("filtersOpenV1");
      if(event.target.closest("#searchSettingsBtn")) document.body.classList.add("filtersOpenV1");
      if(event.target.closest("#closeFiltersBtn")) document.body.classList.remove("filtersOpenV1");
      const odoBtn = event.target.closest("[data-odo-unit]");
      if(odoBtn){
        const wrap = odoBtn.closest("details");
        wrap.querySelectorAll("[data-odo-unit]").forEach(b => b.classList.toggle("active", b === odoBtn));
        const range = wrap.querySelector("[data-range]");
        if(range && range._refresh) range._refresh();
      }
      // Клик в любое место поля даты открывает системный календарь,
      // а не только по маленькой иконке справа.
      const dateInput = event.target.closest('input[type="date"]');
      if(dateInput && typeof dateInput.showPicker === "function"){
        try{ dateInput.showPicker(); }catch(e){ /* без жеста/фокуса браузер может отказать — не страшно */ }
      }
      const dq = event.target.closest("[data-date-range]");
      if(dq){
        const form = $("#auctionFiltersForm");
        const pad = n => String(n).padStart(2, "0");
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const from = new Date(); from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        const kind = dq.dataset.dateRange;
        if(kind === "tomorrow"){ from.setDate(from.getDate() + 1); to.setDate(to.getDate() + 1); }
        else if(kind === "week"){ to.setDate(to.getDate() + 7); }
        else if(kind === "nextweek"){ from.setDate(from.getDate() + 7); to.setDate(to.getDate() + 14); }
        if(form.auctionDateFrom) form.auctionDateFrom.value = fmt(from);
        if(form.auctionDateTo) form.auctionDateTo.value = fmt(to);
        dq.closest(".dateQuickV2").querySelectorAll("button").forEach(b => b.classList.toggle("active", b === dq));
      }
      const leadButton = event.target.closest("[data-lead]");
      if(leadButton){
        const lot = state.items.find(item => item.id === leadButton.dataset.lead) || state.selectedLot;
        if(lot) openLead(lot);
      }
      const bidMode = event.target.closest("[data-bid-mode]");
      if(bidMode && state.selectedLot){
        document.querySelectorAll("[data-bid-mode]").forEach(item => item.classList.remove("active"));
        bidMode.classList.add("active");
        const input = $("#lotBidInput");
        if(bidMode.dataset.bidMode === "current") input.value = state.selectedLot.currentBid || "";
        if(bidMode.dataset.bidMode === "buy") input.value = state.selectedLot.buyNow || "";
        input.focus();
        updateLotCalculator();
      }
      const bidStep = event.target.closest("[data-bid-step]");
      if(bidStep && $("#lotBidInput")){
        const input = $("#lotBidInput");
        const dir = Number(bidStep.dataset.bidStep) < 0 ? -1 : 1;
        const cur = Number(input.value || 0);
        // Шаг ставки: до $25k — по $100, свыше — по $250. При уменьшении с
        // порога шаг берём по целевому уровню (25000 → 24900, не 24750).
        const step = (dir > 0 ? cur >= 25000 : cur > 25000) ? 250 : 100;
        input.value = Math.max(0, cur + dir * step);
        updateLotCalculator();
      }
      if(event.target.closest("[data-copy-calc]")) copyCalculation();
      const calcToggle = event.target.closest("[data-calc-toggle]");
      if(calcToggle){
        const key = calcToggle.dataset.calcToggle;
        const sec = calcToggle.closest("[data-calc-sec]");
        if(calcClosedSecs.has(key)) calcClosedSecs.delete(key); else calcClosedSecs.add(key);
        sec?.classList.toggle("calcClosedV1", calcClosedSecs.has(key));
      }
      const shareBtn = event.target.closest("[data-share-page]");
      if(shareBtn){
        (async () => {
          const url = location.href;
          try{
            if(navigator.share){ await navigator.share({title:document.title, url}); return; }
            await navigator.clipboard.writeText(url);
            const label = shareBtn.querySelector("span");
            if(label){ const old = label.textContent; label.textContent = "Скопировано"; setTimeout(() => { label.textContent = old; }, 1600); }
          }catch(e){}
        })();
      }
      const thumb = event.target.closest("[data-detail-image]");
      if(thumb){
        if($("#detailMainImage")) $("#detailMainImage").src = thumb.dataset.detailImage;
        state.detailIndex = Number(thumb.dataset.detailIndex || 0);
        document.querySelectorAll(".detailThumbsV1 .dThumbV2").forEach(t => t.classList.remove("isActiveThumbV2"));
        thumb.classList.add("isActiveThumbV2");
      }
      // Lightbox controls
      if(event.target.closest("[data-lb-copy]")){ lbCopyLink(); return; }
      if(event.target.closest("[data-lb-prev]")){ lbMove(-1); return; }
      if(event.target.closest("[data-lb-next]")){ lbMove(1); return; }
      if(event.target.closest("[data-lb-close]")){ closeLightbox(); return; }
      if(event.target.id === "lotLightbox"){ closeLightbox(); return; }
      const galStep = event.target.closest("[data-gal-step]");
      if(galStep){
        // Листание главного фото стрелками — без открытия лайтбокса
        const imgs = state.detailImages || [];
        if(imgs.length > 1){
          state.detailIndex = ((state.detailIndex || 0) + Number(galStep.dataset.galStep) + imgs.length) % imgs.length;
          const main = $("#detailMainImage");
          if(main) main.src = imgs[state.detailIndex];
          document.querySelectorAll(".detailThumbsV1 .dThumbV2").forEach(t => t.classList.toggle("isActiveThumbV2", Number(t.dataset.detailIndex) === state.detailIndex));
        }
        return;
      }
      if(event.target.closest("[data-open-video]")){
        const media = state.detailMedia || [];
        const vi = media.findIndex(m => m.type === "video");
        if(vi >= 0) openLightbox(media, vi);
        return;
      }
      if(event.target.closest("[data-lb-open]")){
        openLightbox(state.detailMedia || state.detailImages || [], state.detailIndex || 0);
        return;
      }
      if(event.target.closest("[data-close-lead]") || event.target.id === "leadModal") closeLead();
    });
    document.addEventListener("input", event => {
      if(event.target.closest("[data-calc-input]")) updateLotCalculator();
    });
    document.addEventListener("change", event => {
      if(event.target.closest("[data-calc-input]")) updateLotCalculator();
    });
    document.addEventListener("keydown", event => {
      const lbOpen = document.getElementById("lotLightbox") && !document.getElementById("lotLightbox").hidden;
      if(lbOpen){
        if(event.key === "Escape"){ closeLightbox(); return; }
        if(event.key === "ArrowLeft"){ lbMove(-1); return; }
        if(event.key === "ArrowRight"){ lbMove(1); return; }
      }
      if(event.key === "Escape") closeLead();
    });
    $("#auctionLeadForm").addEventListener("submit", submitLead);
  }

  // Fire-and-forget пинг синхронизации каталога: сайт сам поддерживает базу
  // лотов свежей от трафика (endpoint защищён локом, чаще раза в ~5 мин не сработает).
  // Синк базы лотов запускает только GitHub Actions (hourly) — веб-пинг убран:
  // посетитель триггерил импорт, Supabase занималась записью и каталог
  // открывался по 7-8 секунд вместо одной.
  async function initAuctions(){
    closeLead();
    bindEvents();
    initRanges();
    initCarData();
    updateFavCount();
    const isDetail = await loadDetailFromUrl();
    if(!isDetail){
      // Вход по ссылке /auctions?vin=… — сразу VIN-отчёт (ищет и в архиве),
      // а не фильтр каталога, который пуст для проданных машин
      const vinParam = new URLSearchParams(location.search).get("vin");
      if(vinParam && parseSmartSearch(vinParam).vin){
        openVinReport(vinParam);
        return;
      }
      // Вход по ссылке /auctions?q=<номер лота> — сразу страница лота
      const qParam = new URLSearchParams(location.search).get("q");
      if(qParam && parseSmartSearch(qParam).lot){
        const inp = $("#auctionSmartSearch");
        if(inp) inp.value = qParam;
        openLotByNumber(parseSmartSearch(qParam).lot);
        return;
      }
      restoreFromUrl();
      try{
        const snap = readBackSnap();
        if(sessionStorage.getItem(BACK_FLAG) && snap && snap.href === location.pathname + location.search) pendingScrollRestore = snap.y;
        sessionStorage.removeItem(BACK_FLAG);
      }catch(e){}
      loadLots();
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { initAuctions(); fetchLiveRates(); });
  }else{
    initAuctions();
    fetchLiveRates();
  }
})();
