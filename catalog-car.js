/* /catalog/<id> — страница автомобиля (Encar, api.auctionsapi.com). 04.11.2026.
   Overview + Listings — полностью; Equipment — полностью (названия через /car-options);
   Inspection/History — БАЗОВАЯ версия (сводка по реальным полям отчёта: даты, вердикт, счётчики),
   без диаграмм/полного списка пунктов/медиа (см. CLAUDE.md, отдельный проход). Карточки
   всегда считают цену/даты по РЕАЛЬНЫМ полям ответа — не придумываем отсутствующее (тот же
   принцип, что во всём проекте). */
(function(){
  "use strict";
  var root = document.getElementById("catCarRootV1");
  if(!root) return;

  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function fmtNum(n){ return Number(n || 0).toLocaleString("ru-RU"); }
  function lang(){ var l = window.APEX_LANG; return (l === "ro" || l === "en") ? "en" : "ru"; }

  var FUELS = {1:"Дизель",2:"Электро",3:"Гибрид",4:"Бензин",5:"Газ",6:"Флекс-топливо",7:"Водород",8:"Этанол"};
  var TRANSMISSIONS = {1:"Автомат",2:"Механика"};
  var DRIVE_WHEELS = {1:"Задний",2:"Передний",3:"Полный"};
  var BODY_TYPES = {1:"Седан",2:"Универсал",3:"Купе",4:"Пикап",5:"Внедорожник",6:"Кабриолет",7:"Фургон",11:"Хэтчбек",12:"Родстер",13:"Лимузин",20:"Лифтбек",22:"Катафалк",27:"Спорткар"};
  var CONDITIONS = {1:"Б/у",2:"Новый",3:"Повреждён"};
  var AVAIL = {1:"В наличии",2:"В пути",3:"Под заказ"};
  var SELLER_TYPE = {1:"Частное лицо",2:"Дилер"};
  var AIRBAG = {1:"Целы",2:"Сработали",3:"Отсутствуют"};
  var STEERING = {1:"Левый руль",2:"Правый руль"};
  var COLORS_MAP = {1:"Серебристый",2:"Фиолетовый",3:"Оранжевый",4:"Зелёный",5:"Красный",6:"Золотой",8:"Коричневый",9:"Серый",10:"Бирюзовый",11:"Синий",12:"Бронзовый",13:"Белый",14:"Кремовый",15:"Чёрный",16:"Жёлтый",17:"Бежевый",18:"Розовый",100:"Двухцветный"};
  var COLOR_SWATCH = {1:"#c9cbcc",2:"#7c3aed",3:"#f59e0b",4:"#20b26b",5:"#c24135",6:"#d7a61d",8:"#8b552d",9:"#62676b",10:"#31c7c7",11:"#2d86c9",12:"#b77d37",13:"#ffffff",14:"#fff7d8",15:"#050505",16:"#f7ea13",17:"#f1e7ce",18:"#ee94bf"};
  var MARKET_ORIGIN = {1:"Европа",2:"США",3:"Китай",4:"Индия",5:"Япония",6:"Корея",8:"Великобритания",9:"Канада",10:"Турция",11:"Россия",12:"Южная Корея",13:"Таиланд",14:"Австралия",15:"Индонезия",16:"Ближний Восток",17:"Африка",18:"Тайвань",19:"Мексика",20:"Северная Корея",21:"Океания",22:"Азия",23:"Бразилия",24:"Южная Америка",25:"Северная Америка"};
  var MARKET_FLAG = {1:"🇪🇺",2:"🇺🇸",3:"🇨🇳",4:"🇮🇳",5:"🇯🇵",6:"🇰🇷",8:"🇬🇧",9:"🇨🇦",10:"🇹🇷",11:"🇷🇺",12:"🇰🇷",13:"🇹🇭",14:"🇦🇺",15:"🇮🇩",17:"🌍",18:"🇹🇼",19:"🇲🇽",20:"🇰🇵",23:"🇧🇷"};

  // Иконка по ключевому слову названия опции — как у демо-каталога провайдера (бриф §6.8).
  function iconForOption(name){
    var s = String(name || "").toLowerCase();
    if(/navigation|map|gps/.test(s)) return "🗺️";
    if(/monitor|screen|display|hud/.test(s)) return "🖥️";
    if(/bluetooth/.test(s)) return "🔵";
    if(/airbag|brake|abs|tcs|stability|esc|esp/.test(s)) return "🛡️";
    if(/seat/.test(s)) return "💺";
    if(/light|lamp|headl/.test(s)) return "💡";
    if(/\bkey\b|smart key/.test(s)) return "🔑";
    if(/lock/.test(s)) return "🔒";
    if(/camera/.test(s)) return "📷";
    if(/sensor|radar|parking/.test(s)) return "📡";
    if(/cruise/.test(s)) return "⚙️";
    if(/sunroof|roof/.test(s)) return "☀️";
    if(/wheel/.test(s)) return "⚙️";
    return "✓";
  }

  function relTime(iso){
    if(!iso) return "";
    var d = new Date(iso), now = new Date();
    if(isNaN(d.getTime())) return "";
    var days = Math.floor((now - d) / 86400000);
    if(days <= 0) return T("Размещено сегодня");
    if(days === 1) return T("Размещено вчера");
    if(days < 30) return T("Размещено") + " " + days + " " + T("дн. назад");
    return T("Размещено") + " " + fmtDate(iso);
  }

  function copyRowValue(value){
    return '<button type="button" class="catCopyBtnV1" data-copy="' + esc(value) + '" aria-label="' + esc(T("Скопировать")) + '" data-no-i18n="true">' + esc(value) + ' <svg viewBox="0 0 20 20" fill="none" width="12" height="12"><rect x="7" y="7" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M4 13V5a1 1 0 0 1 1-1h8" stroke="currentColor" stroke-width="1.4"/></svg></button>';
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest(".catCopyBtnV1");
    if(!b) return;
    var v = b.getAttribute("data-copy");
    navigator.clipboard && navigator.clipboard.writeText(v).then(function(){
      b.classList.add("isCopiedV1");
      setTimeout(function(){ b.classList.remove("isCopiedV1"); }, 1200);
    });
  });

  var m = location.pathname.match(/^\/catalog\/([^/?#]+)/);
  var carId = m ? decodeURIComponent(m[1]) : "";
  var qp = new URLSearchParams(location.search);
  var refDomainId = qp.get("domain_id");
  var refListingId = qp.get("listing_id");

  var state = {car:null, listing:null, tab:"overview", galIdx:0};

  function apiUrl(){
    var l = lang();
    if(refDomainId && refListingId) return "/api/catalog?action=listing&domain_id=" + encodeURIComponent(refDomainId) + "&listing_id=" + encodeURIComponent(refListingId) + "&lang=" + l;
    return "/api/catalog?action=car&id=" + encodeURIComponent(carId) + "&lang=" + l;
  }

  function pickListing(car){
    var listings = Array.isArray(car.listings) ? car.listings : [];
    if(refDomainId && refListingId){
      var byRef = listings.find(function(l){ return l.external && String(l.external.domain.id) === String(refDomainId) && String(l.external.id) === String(refListingId); });
      if(byRef) return byRef;
    }
    var active = listings.filter(function(l){ return !l.archived; });
    return active[0] || listings[0] || null;
  }

  function firstImageUrl(img){ return img.downloaded || img.original || img.preview || ""; }

  function titleOf(car, listing){
    var brand = car.brand && car.brand.name;
    var model = car.model && car.model.name;
    if(brand || model) return [brand, model, car.year].filter(Boolean).join(" ");
    var tm = listing && listing.title;
    if(tm && typeof tm === "object"){
      var l = lang();
      return tm[l] || tm.en || tm.ru || Object.values(tm)[0] || T("Автомобиль");
    }
    return T("Автомобиль");
  }

  function load(){
    fetch(apiUrl()).then(function(r){ return r.json().then(function(d){ return {ok:r.ok, status:r.status, data:d}; }); })
      .then(function(res){
        if(!res.ok || !res.data || !res.data.car){ showNotFound(); return; }
        state.car = res.data.car;
        state.listing = pickListing(state.car);
        render();
      })
      .catch(function(){ showNotFound(); });
  }

  function showNotFound(){
    document.getElementById("catCarLoadingV1").hidden = true;
    document.getElementById("catCarNotFoundV1").hidden = false;
    root.setAttribute("aria-busy", "false");
  }

  // ============ RENDER: header ============
  function render(){
    var car = state.car, listing = state.listing;
    document.getElementById("catCarLoadingV1").hidden = true;
    document.getElementById("catCarContentV1").hidden = false;
    root.setAttribute("aria-busy", "false");

    var title = titleOf(car, listing);
    document.getElementById("catCarTitleV1").textContent = (car.badge ? title + " " + car.badge : title);
    document.title = title + " | Apex Auto";
    var titleTag = document.getElementById("catCarTitleTagV1");
    if(titleTag) titleTag.textContent = title + " | Apex Auto";

    renderMeta();
    renderSold();
    renderGallery();
    renderTabsVisibility();
    renderOverview();
    renderListingsTab();
  }

  function renderMeta(){
    var car = state.car, listing = state.listing;
    var el = document.getElementById("catCarMetaRowV1");
    var parts = [];
    var listings = Array.isArray(car.listings) ? car.listings : [];
    if(listings.length > 1){
      var sites = new Set(listings.map(function(l){ return l.external && l.external.domain.id; })).size;
      parts.push('<button type="button" id="catOpenListingsBtnV1" style="border:none;background:var(--field);border-radius:8px;padding:5px 10px;cursor:pointer;font:inherit;font-size:12.5px;font-weight:600">' + fmtNum(listings.length) + " " + esc(T("объявлений")) + " · " + fmtNum(sites) + " " + esc(T(sites === 1 ? "сайт" : "сайта")) + '</button>');
    }else if(listing && listing.external){
      parts.push('<a href="' + esc(listing.external.url) + '" target="_blank" rel="noopener noreferrer" data-no-i18n="true">🌐 ' + esc(listing.external.domain.name || "") + '</a>');
    }
    var place = placeOf(listing);
    if(place) parts.push('<span data-no-i18n="true">📍 ' + esc(place) + '</span>');
    if(car.vin) parts.push('<button type="button" class="catVinBtnV1" id="catVinBtnV1" data-vin="' + esc(car.vin) + '" data-no-i18n="true">VIN ' + esc(String(car.vin).toUpperCase()) + '</button>');
    el.innerHTML = parts.join("");
    var vb = document.getElementById("catVinBtnV1");
    if(vb) vb.addEventListener("click", function(){
      navigator.clipboard && navigator.clipboard.writeText(vb.getAttribute("data-vin")).then(function(){
        var orig = vb.textContent; vb.textContent = "✓ " + T("Скопировано"); setTimeout(function(){ vb.textContent = orig; }, 1600);
      });
    });
    var ol = document.getElementById("catOpenListingsBtnV1");
    if(ol) ol.addEventListener("click", function(){ selectTab("listings"); });
  }

  function placeOf(listing){
    var ld = listing && listing.location_details;
    if(!ld) return "";
    return [ld.region && ld.region.name, ld.country && ld.country.name].filter(Boolean).join(", ");
  }

  function renderSold(){
    var box = document.getElementById("catCarSoldNoticeV1");
    var listing = state.listing;
    if(!listing || !listing.archived){ box.hidden = true; return; }
    box.hidden = false;
    var lastSeen = listing.last_seen_at || listing.updated_at;
    var hasOtherActive = (state.car.listings || []).some(function(l){ return !l.archived; });
    box.className = "catSoldNoticeV1";
    box.innerHTML = '<b>' + esc(T("Этот автомобиль уже продан")) + '</b>'
      + '<span>' + esc(T("Объявление на источнике больше не активно. Данные ниже сохранены для справки.")) + (lastSeen ? (" " + esc(T("Последний раз видели")) + ": " + fmtDate(lastSeen)) : "") + '</span>';
  }

  // ============ RENDER: gallery ============
  function galleryImages(){
    var listing = state.listing;
    if(!listing || !Array.isArray(listing.images)) return [];
    return listing.images.map(firstImageUrl).filter(Boolean);
  }
  function renderGallery(){
    var imgs = galleryImages();
    var mainImg = document.getElementById("catGalMainImgV1");
    var thumbs = document.getElementById("catGalThumbsV1");
    var count = document.getElementById("catGalCountV1");
    var viewSrc = document.getElementById("catViewSrcBtnV1");
    state.galIdx = 0;
    function show(i){
      state.galIdx = Math.max(0, Math.min(imgs.length - 1, i));
      mainImg.src = imgs[state.galIdx] || "";
      mainImg.alt = "";
      count.textContent = imgs.length ? ((state.galIdx + 1) + " / " + imgs.length) : "";
      thumbs.querySelectorAll("button").forEach(function(b, bi){ b.classList.toggle("isOnV1", bi === state.galIdx); });
    }
    if(!imgs.length){
      mainImg.removeAttribute("src"); mainImg.alt = T("Нет фото"); count.textContent = ""; thumbs.innerHTML = "";
    }else{
      thumbs.innerHTML = imgs.slice(0, 18).map(function(u, i){ return '<button type="button" data-i="' + i + '"><img src="' + esc(u) + '" loading="lazy" referrerpolicy="no-referrer" alt=""></button>'; }).join("");
      thumbs.querySelectorAll("[data-i]").forEach(function(b){ b.addEventListener("click", function(){ show(parseInt(b.getAttribute("data-i"), 10)); }); });
      show(0);
    }
    document.getElementById("catGalPrevV1").onclick = function(){ if(imgs.length) show((state.galIdx - 1 + imgs.length) % imgs.length); };
    document.getElementById("catGalNextV1").onclick = function(){ if(imgs.length) show((state.galIdx + 1) % imgs.length); };
    if(state.listing && state.listing.external){ viewSrc.href = state.listing.external.url; viewSrc.hidden = false; }
    else{ viewSrc.hidden = true; }
  }

  // ============ Tabs ============
  function matchingReports(list){
    var listing = state.listing;
    if(!listing || !listing.external) return [];
    return (list || []).filter(function(r){
      var ref = r.vehicle_ref;
      return ref && String(ref.domain_id) === String(listing.external.domain.id) && String(ref.listing_id) === String(listing.external.id);
    });
  }
  function renderTabsVisibility(){
    var car = state.car;
    var listings = car.listings || [];
    document.getElementById("catTabListingsV1").hidden = listings.length <= 1;
    var optCount = (state.listing && listings.length > 1 ? (state.listing.option_ids || []) : Array.from(new Set((car.option_ids || []).concat((state.listing && state.listing.option_ids) || [])))).length;
    document.getElementById("catTabEqCountV1").textContent = optCount ? ("· " + optCount) : "";
    var insp = matchingReports(car.inspections);
    document.getElementById("catTabInspCountV1").textContent = insp.length ? ("· " + insp.length) : "";
    var hist = matchingReports(car.vehicle_history_reports);
    document.getElementById("catTabHistCountV1").textContent = hist.length ? ("· " + hist.length) : "";

    document.querySelectorAll("#catTabsV1 [role=tab]").forEach(function(btn){
      btn.addEventListener("click", function(){ selectTab(btn.getAttribute("data-tab")); });
    });
  }
  var tabLoaded = {};
  function selectTab(tab){
    if(tab === "listings" && (state.car.listings || []).length <= 1) tab = "overview";
    state.tab = tab;
    document.querySelectorAll("#catTabsV1 [role=tab]").forEach(function(b){ b.classList.toggle("isOnV1", b.getAttribute("data-tab") === tab); b.setAttribute("aria-selected", b.getAttribute("data-tab") === tab ? "true" : "false"); });
    ["overview","listings","equipment","inspection","history"].forEach(function(key){
      var panel = document.getElementById("catPanel" + key[0].toUpperCase() + key.slice(1) + "V1");
      if(panel) panel.hidden = key !== tab;
    });
    if(!tabLoaded[tab]){
      tabLoaded[tab] = true;
      if(tab === "equipment") renderEquipmentTab();
      if(tab === "inspection") renderInspectionTab();
      if(tab === "history") renderHistoryTab();
    }
  }

  // ============ Overview ============
  function fmtDate(iso){
    if(!iso) return "";
    var d = new Date(iso);
    if(isNaN(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString("ru-RU", {year:"numeric", month:"short", day:"numeric"});
  }
  function priceBlock(car, listing){
    if(!listing) return {label:T("Цена"), amt:T("Цена по запросу"), cur:""};
    var cur = listing.price && listing.price.currency && listing.price.currency.name ? listing.price.currency.name.toUpperCase() : "";
    if(listing.is_auction){
      if(listing.current_bid != null) return {label:T("Текущая ставка"), amt:fmtNum(listing.current_bid), cur:cur};
      if(listing.price && listing.price.price > 0) return {label:T("Цена аукциона"), amt:fmtNum(listing.price.price), cur:cur};
      return {label:T("Цена"), amt:T("Цена по запросу"), cur:""};
    }
    if(listing.price && listing.price.price > 0) return {label:T("Цена"), amt:fmtNum(listing.price.price), cur:cur};
    if(listing.current_bid != null) return {label:T("Текущая ставка"), amt:fmtNum(listing.current_bid), cur:cur};
    return {label:T("Цена"), amt:T("Цена по запросу"), cur:""};
  }

  function renderOverview(){
    var car = state.car, listing = state.listing;
    var html = "";

    var price = priceBlock(car, listing);
    html += '<div class="catPriceCardV1"><span class="catPriceLblV1">' + esc(price.label) + '</span>'
      + '<div class="catPriceBigV1" data-no-i18n="true">' + esc(price.amt) + (price.cur ? ' <span class="catPriceCurV1">' + esc(price.cur) + '</span>' : "") + (listing && listing.price && listing.price.negotiable ? '<span class="catNegTagV1">' + esc(T("Торг")) + '</span>' : "") + '</div>'
      + (listing && listing.external ? '<div class="catPriceSrcV1">' + esc(T("на")) + ' <a href="' + esc(listing.external.url) + '" target="_blank" rel="noopener noreferrer" data-no-i18n="true">' + esc(listing.external.domain.name) + '</a></div>' : "")
      + (listing && listing.created_at ? '<span class="catListedChipV1">📅 ' + esc(relTime(listing.created_at)) + '</span>' : "")
      + '</div>';

    html += reportsCardHtml(car, listing);

    // Key facts (год уже в заголовке — пропускаем)
    var facts = [];
    if(listing && listing.odometer != null) facts.push([T("Пробег"), fmtNum(listing.odometer) + " " + T("км")]);
    if(car.fuel) facts.push([T("Топливо"), T(FUELS[car.fuel.id] || car.fuel.name)]);
    if(car.transmission) facts.push([T("КПП"), T(TRANSMISSIONS[car.transmission.id] || car.transmission.name)]);
    // Электро: engine_volume в фиде — не объём двигателя (см. catalog.js), не показываем.
    if(car.engine_volume && !(car.fuel && car.fuel.id === 2)) facts.push([T("Объём"), (car.engine_volume / 1000).toFixed(1).replace(/\.0$/, "") + " " + T("л")]);
    if(car.battery_capacity_kwh) facts.push([T("Батарея"), car.battery_capacity_kwh + " " + T("кВт·ч")]);
    if(car.power_hp) facts.push([T("Мощность"), car.power_hp + " " + T("л.с.")]);
    if(car.drive_wheels) facts.push([T("Привод"), T(DRIVE_WHEELS[car.drive_wheels.id] || car.drive_wheels.name)]);
    if(car.body_type) facts.push([T("Кузов"), T(BODY_TYPES[car.body_type.id] || car.body_type.name)]);
    html += '<div class="catFactsStripV1">' + facts.map(function(f){ return '<div class="catFactV1"><small>' + esc(f[0]) + '</small><b data-no-i18n="true">' + esc(f[1]) + '</b></div>'; }).join("") + '</div>';

    html += '<div class="catLeadCardV1"><button type="button" id="catLeadBtnV1">' + esc(T("Узнать цену под ключ")) + '</button><p>' + esc(T("Оставьте заявку — пришлём расчёт доставки и растаможки в Молдову")) + '</p></div>';

    // Details card
    html += '<div class="catDetailsCardV1">';
    html += '<h4>' + esc(T("Объявление")) + '</h4>';
    var rows = [];
    if(listing && listing.availability) rows.push([T("Наличие"), T(AVAIL[listing.availability.id] || listing.availability.name)]);
    if(listing) rows.push([T("Тип продажи"), listing.is_auction ? T("Аукцион") : T("Фиксированная цена")]);
    if(listing && listing.auction_at) rows.push([T("Дата аукциона"), fmtDate(listing.auction_at)]);
    if(listing && listing.price && Array.isArray(listing.price.history)) rows.push([T("Изменений цены"), String(listing.price.history.length)]);
    if(listing && listing.created_at) rows.push([T("Размещено"), fmtDate(listing.created_at)]);
    if(listing && listing.last_seen_at) rows.push([T("Последний раз видели"), fmtDate(listing.last_seen_at)]);
    if(listing && listing.seller_type) rows.push([T("Продавец"), T(SELLER_TYPE[listing.seller_type.id] || listing.seller_type.name)]);
    if(listing && listing.keys_available != null) rows.push([T("Ключи"), listing.keys_available ? T("Да") : T("Нет")]);
    if(listing && listing.is_manufacturer_certified != null) rows.push([T("Сертификат производителя"), listing.is_manufacturer_certified ? T("Да") : T("Нет")]);
    if(listing && listing.is_leasing) rows.push([T("Лизинг"), T("Да")]);
    if(listing && listing.has_registration != null) rows.push([T("Регистрация"), listing.has_registration ? T("Есть") : T("Нет")]);
    html += rowsHtml(rows);

    html += '<h4>' + esc(T("Автомобиль")) + '</h4>';
    rows = [];
    if(car.brand) rows.push([T("Марка"), car.brand.name]);
    if(car.model) rows.push([T("Модель"), car.model.name]);
    if(car.badge) rows.push([T("Комплектация"), car.badge]);
    if(car.color) rows.push([T("Цвет"), swatchRow(car.color.id, T(COLORS_MAP[car.color.id] || car.color.name))]);
    if(car.interior_color) rows.push([T("Цвет салона"), swatchRow(car.interior_color.id, T(COLORS_MAP[car.interior_color.id] || car.interior_color.name))]);
    if(car.seats) rows.push([T("Мест"), String(car.seats)]);
    if(car.cylinders) rows.push([T("Цилиндров"), String(car.cylinders)]);
    if(car.market_origin) rows.push([T("Рынок"), (MARKET_FLAG[car.market_origin.id] || "") + " " + T(MARKET_ORIGIN[car.market_origin.id] || car.market_origin.name)]);
    if(car.steering_wheel_position) rows.push([T("Руль"), T(STEERING[car.steering_wheel_position.id] || car.steering_wheel_position.name)]);
    html += rowsHtml(rows, true);

    rows = [];
    if(listing && listing.condition) rows.push([T("Состояние"), T(CONDITIONS[listing.condition.id] || listing.condition.name)]);
    if(listing && listing.damage) rows.push([T("Повреждение"), listing.damage.name]);
    if(listing && listing.second_damage) rows.push([T("Доп. повреждение"), listing.second_damage.name]);
    if(listing && listing.airbag_state) rows.push([T("Подушки безопасности"), T(AIRBAG[listing.airbag_state.id] || listing.airbag_state.name)]);
    if(rows.length){ html += '<h4>' + esc(T("Состояние")) + '</h4>' + rowsHtml(rows, true); }

    rows = [];
    if(car.vin) rows.push([T("VIN"), copyRow(String(car.vin).toUpperCase())]);
    if(listing && listing.external) rows.push([T("ID объявления"), copyRow(String(listing.external.id))]);
    if(listing && listing.external) rows.push([T("Источник"), listing.external.domain.name]);
    if(listing && listing.external && listing.external.domain) rows.push([T("ID источника"), copyRow(String(listing.external.domain.id))]);
    if(listing && listing.document_id) rows.push([T("Документ"), listing.document_id.name]);
    html += '<h4>' + esc(T("Идентификаторы")) + '</h4>' + rowsHtml(rows, true);
    html += '</div>';

    // Location
    var ld = listing && listing.location_details;
    var pos = listing && listing.location && !Array.isArray(listing.location) ? listing.location.position : null;
    if(ld && (ld.country || ld.region || ld.district)){
      var mapLink = pos && pos.lat != null && pos.lon != null
        ? '<a href="https://www.google.com/maps?q=' + pos.lat + ',' + pos.lon + '" target="_blank" rel="noopener noreferrer" class="catMapLinkV1">' + esc(T("Открыть карту")) + ' ↗</a>'
        : "";
      html += '<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Локация")) + '</h4>' + mapLink + '</div>' + rowsHtml([
        ld.country && ld.country.name ? [T("Страна"), ld.country.name] : null,
        ld.region && ld.region.name ? [T("Регион"), ld.region.name] : null,
        ld.district && ld.district.name ? [T("Район"), ld.district.name] : null
      ].filter(Boolean), true) + '</div>';
    }

    // Description
    var desc = listing && listing.description ? cleanDescription(listing.description) : "";
    if(desc){
      var clampId = "catDescTxtV1";
      html += '<div class="catDescCardV1"><h4>' + esc(T("Описание продавца")) + '</h4><div class="catDescClampV1" id="' + clampId + '" data-no-i18n="true">' + esc(desc) + '</div>'
        + (desc.length > 420 ? '<button type="button" class="catDescMoreV1" id="catDescMoreBtnV1">' + esc(T("Показать полностью")) + '</button>' : "") + '</div>';
    }

    document.getElementById("catPanelOverviewV1").innerHTML = html;

    var leadBtn = document.getElementById("catLeadBtnV1");
    if(leadBtn) leadBtn.addEventListener("click", openLeadModal);
    var moreBtn = document.getElementById("catDescMoreBtnV1");
    if(moreBtn) moreBtn.addEventListener("click", function(){
      var box = document.getElementById(clampId);
      box.style.maxHeight = "none";
      moreBtn.remove();
    });
  }
  // «Reports» — сводная карточка в Overview (бриф §6.6.4, как в демо-каталоге провайдера): плитка-ссылка
  // на вкладку Осмотр/История с коротким вердиктом, только если соответствующий отчёт реально есть у ВЫБРАННОГО листинга.
  function reportsCardHtml(car, listing){
    var tiles = "";
    var insp = matchingReports(car.inspections)[0];
    if(insp){
      var blocks = Array.isArray(insp.inspection_blocks) ? insp.inspection_blocks : [];
      var issueCount = blocks.reduce(function(s, b){ return s + (Number(b.issue_count) || 0); }, 0);
      var checkedCount = blocks.reduce(function(s, b){ return s + (Number(b.checked_count) || 0); }, 0);
      var verdict = issueCount > 0 ? {cls:"isWarnV1", text:T("Найдены проблемы") + ": " + issueCount}
        : checkedCount > 0 ? {cls:"isOkV1", text:T("Проблем не найдено")}
        : {cls:"isNeutralV1", text:T("Результат не ясен")};
      tiles += '<a class="catReportTileV1" data-report-tab="inspection">'
        + '<span class="catReportIcoV1">' + ICON_INSP_BIG + '</span>'
        + '<span class="catReportBodyV1"><b>' + esc(T("Осмотр")) + '</b><span class="catReportPillV1 ' + verdict.cls + '">' + esc(verdict.text) + '</span>'
        + '<small>' + esc(T("Проверено")) + ": " + checkedCount + '</small></span>'
        + '<span class="catReportArrV1">→</span>'
      + '</a>';
    }
    var hist = matchingReports(car.vehicle_history_reports)[0];
    if(hist){
      var s = (hist.summary && !Array.isArray(hist.summary)) ? hist.summary : {};
      var risky = (s.insurance_claim_count > 0) || (s.total_loss_count > 0) || (s.flood_total_loss_count > 0) || (s.flood_partial_loss_count > 0) || (s.theft_count > 0);
      var vh = risky ? {cls:"isWarnV1", text:T("Найдены риски")} : {cls:"isOkV1", text:T("Рисков не найдено")};
      tiles += '<a class="catReportTileV1" data-report-tab="history">'
        + '<span class="catReportIcoV1">' + ICON_HIST_BIG + '</span>'
        + '<span class="catReportBodyV1"><b>' + esc(T("История")) + '</b><span class="catReportPillV1 ' + vh.cls + '">' + esc(vh.text) + '</span>'
        + '<small>' + esc(T("Смен владельца")) + ": " + (s.owner_change_count != null ? s.owner_change_count : "—") + ' · ' + esc(T("Страховых случаев")) + ": " + (s.insurance_claim_count != null ? s.insurance_claim_count : "—") + '</small></span>'
        + '<span class="catReportArrV1">→</span>'
      + '</a>';
    }
    return tiles ? '<div class="catReportsCardV1">' + tiles + '</div>' : "";
  }
  var ICON_INSP_BIG = '<svg viewBox="0 0 24 24" fill="none" width="22" height="22"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.7"/><path d="M7.5 12.3l2.8 2.8 5.7-6.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_HIST_BIG = '<svg viewBox="0 0 24 24" fill="none" width="22" height="22"><circle cx="12" cy="12.5" r="8.6" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4.5l3 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  document.addEventListener("click", function(e){
    var t = e.target.closest("[data-report-tab]");
    if(!t) return;
    e.preventDefault();
    selectTab(t.getAttribute("data-report-tab"));
  });

  function rowsHtml(rows, skipWrapCheck){
    if(!rows.length) return skipWrapCheck ? "" : "";
    return rows.map(function(r){
      var val = r[1] && typeof r[1] === "object" && "html" in r[1] ? r[1].html : esc(r[1]);
      return '<div class="catDetailRowV1"><span>' + esc(r[0]) + '</span><span data-no-i18n="true">' + val + '</span></div>';
    }).join("");
  }
  function swatchRow(colorId, label){
    var hex = COLOR_SWATCH[colorId];
    var dot = hex ? '<span class="catColorDotV1" style="background:' + hex + '"></span>' : "";
    return {html: dot + esc(label)};
  }
  function copyRow(value){
    return {html: copyRowValue(value)};
  }
  function cleanDescription(text){
    return String(text || "")
      .replace(/[►◄]/g, "")
      .replace(/-{3,}/g, "\n")
      .split("\n").map(function(l){ return l.replace(/^>\s?/, "").trim(); }).filter(Boolean).join("\n");
  }

  // ============ Listings tab ============
  function renderListingsTab(){
    var car = state.car;
    var listings = Array.isArray(car.listings) ? car.listings.slice() : [];
    if(listings.length <= 1) return;
    listings.sort(function(a, b){ return (a.archived ? 1 : 0) - (b.archived ? 1 : 0); });
    var sites = new Set(listings.map(function(l){ return l.external && l.external.domain.id; })).size;
    var html = '<p style="color:var(--muted);font-size:13px;margin:0 0 12px">' + esc(T("Одна и та же машина, размещённая отдельно на разных площадках/объявлениях. Цены — в исходной валюте каждого объявления.")) + '</p>';
    html += listings.map(function(l){
      var img = Array.isArray(l.images) && l.images.length ? firstImageUrl(l.images[0]) : "";
      var isSelected = state.listing === l;
      var price = priceBlock(car, l);
      return '<div class="catListingRowV1">'
        + (img ? '<img src="' + esc(img) + '" loading="lazy" referrerpolicy="no-referrer" alt="">' : '')
        + '<div class="catListingMainV1"><b data-no-i18n="true">' + esc(l.external ? l.external.domain.name : "") + (isSelected ? (" · " + esc(T("показано"))) : "") + '</b>'
          + '<small data-no-i18n="true">#' + esc((l.external && l.external.id || "").toString().slice(0, 14)) + " · " + esc(l.archived ? T("Продано") : T("Активно")) + ' · ' + esc(price.amt) + (price.cur ? " " + esc(price.cur) : "") + '</small></div>'
        + (l.external ? '<a class="catListingOpenV1" href="' + esc(l.external.url) + '" target="_blank" rel="noopener noreferrer">' + esc(T("Открыть на сайте →")) + '</a>' : '')
      + '</div>';
    }).join("");
    document.getElementById("catPanelListingsV1").innerHTML = html;
  }

  // ============ Equipment tab ============
  function renderEquipmentTab(){
    var car = state.car, listing = state.listing;
    var listingsCount = (car.listings || []).length;
    var ids = listingsCount > 1 ? (listing && listing.option_ids || []) : Array.from(new Set((car.option_ids || []).concat((listing && listing.option_ids) || [])));
    var panel = document.getElementById("catPanelEquipmentV1");
    if(!ids.length){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Нет данных о комплектации для этого автомобиля.")) + '</div>'; return; }
    panel.innerHTML = '<div class="catSoonV1">' + esc(T("Загрузка…")) + '</div>';
    fetch("/api/catalog?action=options&ids=" + ids.slice(0, 100).join(",") + "&lang=" + lang())
      .then(function(r){ return r.json(); })
      .then(function(d){
        var items = (d && d.items) || [];
        if(!items.length){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Не удалось загрузить комплектацию.")) + '</div>'; return; }
        var uiLang = window.APEX_LANG === "en" ? "en" : (window.APEX_LANG === "ro" ? "ro" : "ru");
        function nameOf(opt){
          var tr = opt.translations && opt.translations.name;
          if(tr && typeof tr === "object"){
            return tr[uiLang] || tr.ru || tr.en || opt.name || (T("Опция") + " #" + opt.id);
          }
          return opt.name || (T("Опция") + " #" + opt.id);
        }
        function sectionNameOf(opt){
          var sec = opt.section;
          if(!sec) return T("Другое");
          var tr = sec.translations && sec.translations.name;
          if(tr && typeof tr === "object") return tr[uiLang] || tr.ru || tr.en || sec.name || T("Другое");
          return sec.name || T("Другое");
        }
        var bySection = {};
        items.forEach(function(opt){
          var secName = sectionNameOf(opt);
          (bySection[secName] = bySection[secName] || []).push(opt);
        });
        var sections = Object.keys(bySection).sort();
        function renderSections(filterQ){
          var q = (filterQ || "").trim().toLowerCase();
          return sections.map(function(sec){
            var opts = bySection[sec].filter(function(o){ return !q || nameOf(o).toLowerCase().indexOf(q) >= 0; }).sort(function(a, b){ return nameOf(a).localeCompare(nameOf(b)); });
            if(!opts.length) return "";
            return '<div class="catEqSectionV1"><div class="catEqSecHeadV1">' + esc(sec.toUpperCase()) + '<span>' + bySection[sec].length + '</span></div>'
              + '<div class="catEqGridV1">'
              + opts.map(function(o){ return '<div class="catEqItemV1"><span class="catEqIconV1">' + iconForOption(nameOf(o)) + '</span><span data-no-i18n="true">' + esc(nameOf(o)) + '</span></div>'; }).join("")
              + '</div></div>';
          }).join("");
        }
        var html = '<div class="catEqHeadRowV1"><div><b>' + esc(T("Комплектация и опции")) + '</b><small>' + fmtNum(items.length) + " " + esc(T("опций")) + '</small></div>'
          + '<input type="text" id="catEqSearchV1" class="catEqSearchV1" placeholder="' + esc(T("Фильтр по комплектации")) + '"></div>'
          + '<div id="catEqListV1">' + renderSections("") + '</div>';
        panel.innerHTML = html;
        var searchInp = document.getElementById("catEqSearchV1");
        if(searchInp) searchInp.addEventListener("input", function(){
          var list = document.getElementById("catEqListV1");
          var out = renderSections(searchInp.value);
          list.innerHTML = out || '<p style="color:var(--muted);font-size:13px;padding:10px 0">' + esc(T("Ничего не найдено")) + '</p>';
        });
      })
      .catch(function(){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Не удалось загрузить комплектацию.")) + '</div>'; });
  }

  // ============ Inspection / History — базовая сводка ============
  function renderInspectionTab(){
    var panel = document.getElementById("catPanelInspectionV1");
    var reports = matchingReports(state.car.inspections);
    if(!reports.length){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Нет отчётов осмотра для этого объявления.")) + '</div>'; return; }
    panel.innerHTML = reports.map(function(r){
      var c = (r.conclusions && !Array.isArray(r.conclusions)) ? r.conclusions : {};
      var score = Number(c.evaluation_score);
      return '<div class="catDetailsCardV1">'
        + '<h4>' + esc(T("Отчёт осмотра")) + (r.inspected_at ? " · " + esc(fmtDate(r.inspected_at)) : "") + '</h4>'
        + rowsHtml([
            c.overall_result_key ? [T("Итог"), T(humanizeKey(c.overall_result_key))] : null,
            c.accident_status_key ? [T("ДТП"), T(humanizeKey(c.accident_status_key))] : null,
            c.water_damage_status_key ? [T("Затопление"), T(humanizeKey(c.water_damage_status_key))] : null,
            r.valid_until ? [T("Действителен до"), fmtDate(r.valid_until)] : null,
            isFinite(score) ? [T("Оценка"), score + " / 100"] : null,
            r.source && r.source.source_key ? [T("Источник"), r.source.source_key] : null
          ].filter(Boolean), true)
        + (c.notes ? '<p style="font-size:13px;color:var(--ink-2);margin-top:10px" data-no-i18n="true">' + esc(c.notes) + '</p>' : "")
      + '</div>';
    }).join("") + '<p style="color:var(--muted);font-size:12.5px">' + esc(T("Подробный разбор по зонам кузова и медиа — в следующем обновлении раздела.")) + '</p>';
  }
  function renderHistoryTab(){
    var panel = document.getElementById("catPanelHistoryV1");
    var reports = matchingReports(state.car.vehicle_history_reports);
    if(!reports.length){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Нет отчётов истории для этого объявления. Отсутствие отчёта не означает чистую историю.")) + '</div>'; return; }
    panel.innerHTML = reports.map(function(r){
      var s = (r.summary && !Array.isArray(r.summary)) ? r.summary : {};
      return '<div class="catDetailsCardV1">'
        + '<h4>' + esc(T("Отчёт истории")) + '</h4>'
        + rowsHtml([
            s.owner_change_count != null ? [T("Смен владельца"), String(s.owner_change_count)] : null,
            s.insurance_claim_count != null ? [T("Страховых случаев"), String(s.insurance_claim_count)] : null,
            s.total_loss_count != null ? [T("Полная гибель"), String(s.total_loss_count)] : null,
            s.flood_total_loss_count != null ? [T("Затопление (полное)"), String(s.flood_total_loss_count)] : null,
            s.theft_count != null ? [T("Угон"), String(s.theft_count)] : null,
            s.first_registered_at ? [T("Первая регистрация"), fmtDate(s.first_registered_at)] : null,
            Array.isArray(r.events) ? [T("Событий в хронологии"), String(r.events.length)] : null
          ].filter(Boolean), true)
      + '</div>';
    }).join("") + '<p style="color:var(--muted);font-size:12.5px">' + esc(T("Полная хронология событий, пробег и разбивка по суммам претензий — в следующем обновлении раздела.")) + '</p>';
  }
  function humanizeKey(k){ return String(k || "").replace(/_/g, " "); }

  // ============ Lead modal (переиспользуем простую форму, как у /korea) ============
  var modal = null;
  function ensureModal(){
    if(modal) return modal;
    modal = document.createElement("div");
    modal.className = "koreaModalV1";
    modal.hidden = true;
    modal.innerHTML = '<div class="koreaModalCardV1">'
      + '<button type="button" class="koreaModalCloseV1" data-close aria-label="' + esc(T("Закрыть")) + '">✕</button>'
      + '<h3>' + esc(T("Узнать цену под ключ")) + '</h3>'
      + '<div class="koreaModalCarV1" id="catLeadCarLineV1" data-no-i18n="true"></div>'
      + '<form id="catLeadFormV1" novalidate>'
        + '<input name="name" type="text" autocomplete="name" placeholder="' + esc(T("Ваше имя")) + '" required>'
        + '<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="' + esc(T("Телефон или Telegram")) + '" required>'
        + '<input name="hp_website" type="text" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">'
        + '<button type="submit">' + esc(T("Оставить заявку")) + '</button>'
        + '<small id="catLeadMsgV1" style="display:block;margin-top:8px;color:var(--muted);font-size:12.5px"></small>'
      + '</form>'
    + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function(e){ if(e.target === modal || e.target.closest("[data-close]")) closeLeadModal(); });
    modal.querySelector("#catLeadFormV1").addEventListener("submit", submitLead);
    return modal;
  }
  function openLeadModal(){
    var m = ensureModal();
    var line = m.querySelector("#catLeadCarLineV1");
    var title = titleOf(state.car, state.listing);
    if(line) line.textContent = title + (state.car.badge ? " " + state.car.badge : "");
    var form = m.querySelector("#catLeadFormV1"); form.reset(); form.hidden = false;
    var ok = m.querySelector(".koreaModalOkV1"); if(ok) ok.remove();
    m.hidden = false; document.body.classList.add("lbOpenV1");
  }
  function closeLeadModal(){ if(modal) modal.hidden = true; document.body.classList.remove("lbOpenV1"); }
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && modal && !modal.hidden) closeLeadModal(); });
  function submitLead(e){
    e.preventDefault();
    var form = e.target;
    var msg = document.getElementById("catLeadMsgV1");
    var name = form.name.value.trim(), phone = form.phone.value.trim();
    if(name.length < 2 || phone.length < 5){ if(msg) msg.textContent = T("Укажите имя и контакт для связи"); return; }
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    var car = state.car, listing = state.listing;
    fetch("/api/auctions?action=lead", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({
        name:name, phone:phone, hp_website:form.hp_website.value,
        source:"Каталог Encar", vin:car.vin || "", page:location.href,
        comment:"Каталог Encar " + (car.id || "") + ": " + titleOf(car, listing) + (listing && listing.odometer ? " — " + fmtNum(listing.odometer) + " км" : "")
      })
    }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return r.ok && d.ok; }); })
      .catch(function(){ return false; })
      .then(function(ok){
        if(ok){
          form.hidden = true;
          var card = form.closest(".koreaModalCardV1");
          var div = document.createElement("div");
          div.className = "koreaModalOkV1";
          div.innerHTML = "<b>" + esc(T("Заявка отправлена!")) + "</b><span>" + esc(T("Мы свяжемся с вами в ближайшее время.")) + "</span>";
          card.appendChild(div);
        }else{
          btn.disabled = false;
          if(msg) msg.textContent = T("Не удалось отправить. Напишите нам в WhatsApp или Telegram.");
        }
      });
  }

  load();
})();
