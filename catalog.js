/* /catalog — новый каталог Encar (api.auctionsapi.com). 04.11.2026.
   Phase 1 (по решению Федора — делаем этапами): сайдбар фильтров (Марка/Модель/Поколение/Цена/
   Год/Пробег/КПП/Кузов/Топливо/Привод/Состояние/Цвет/флаги), URL-состояние, грид карточек,
   пагинация, тулбар. ОТДЕЛЬНО от auctions.js/korea.js — свой продукт, свои классы, см. бриф + CLAUDE.md.
   Страница авто (/catalog/<id>) — catalog-car.html/js, вкладки Equipment/Inspection/History —
   следующим проходом (структура+бейджи уже есть, контент вкладок — нет). */
(function(){
  "use strict";

  var grid = document.getElementById("catGridV1");
  if(!grid) return;

  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  // ---- Литеральные таблицы значений (бриф §5.2.9/5.2.10/§11 — подтверждены реальной OpenAPI-спекой 04.11.2026) ----
  var BODY_TYPES = [[1,"Седан"],[2,"Универсал"],[3,"Купе"],[4,"Пикап"],[5,"Внедорожник"],[6,"Кабриолет"],[7,"Фургон"],[11,"Хэтчбек"],[12,"Родстер"],[13,"Лимузин"],[20,"Лифтбек"],[22,"Катафалк"],[27,"Спорткар"]];
  var FUELS = [[1,"Дизель"],[2,"Электро"],[3,"Гибрид"],[4,"Бензин"],[5,"Газ"],[6,"Флекс-топливо"],[7,"Водород"],[8,"Этанол"]];
  var TRANSMISSIONS = [[1,"Автомат"],[2,"Механика"]];
  var DRIVE_WHEELS = [[1,"Задний"],[2,"Передний"],[3,"Полный"]];
  var CONDITIONS = [[1,"Б/у"],[2,"Новый"],[3,"Повреждён"]];
  var COLORS = [
    [1,"Серебристый","#c9cbcc"],[2,"Фиолетовый","#7c3aed"],[3,"Оранжевый","#f59e0b"],[4,"Зелёный","#20b26b"],
    [5,"Красный","#c24135"],[6,"Золотой","#d7a61d"],[8,"Коричневый","#8b552d"],[9,"Серый","#62676b"],
    [10,"Бирюзовый","#31c7c7"],[11,"Синий","#2d86c9"],[12,"Бронзовый","#b77d37"],[13,"Белый","#ffffff"],
    [14,"Кремовый","#fff7d8"],[15,"Чёрный","#050505"],[16,"Жёлтый","#f7ea13"],[17,"Бежевый","#f1e7ce"],[18,"Розовый","#ee94bf"]
  ];

  var POPULAR_BRAND_NAMES = ["Hyundai","Kia","Genesis","Toyota","BMW","Mercedes-Benz","Audi","Volkswagen","Lexus","Chevrolet","Ford","Honda","Nissan","Porsche","Land Rover","Jeep"];

  // ---- Состояние ----
  var state = {
    vehicleType:"automobile",
    brands:[],            // [{id,name,models:[{id,name,generations:[{id,name}]}]}]
    priceFrom:"", priceTo:"", currency:"krw",
    yearFrom:"", yearTo:"",
    odoFrom:"", odoTo:"",
    transmission:"", bodyTypeIds:[], fuelIds:[], driveIds:[], condIds:[], colorIds:[],
    flagKeys:false, flagInsp:false, flagHist:false,
    sort:"newest", page:1
  };
  var PER_PAGE = 24;

  var dict = {brands:null, modelsByBrand:{}, gensByModel:{}};
  var reqToken = 0;
  var abortCtrl = null;
  var lastUrlPushAt = 0;

  // ---- URL <-> state ----
  function stateToParams(){
    var p = new URLSearchParams();
    if(state.vehicleType === "motorcycle") p.set("vehicle_type", "motorcycle");
    if(state.brands.length){
      p.set("brand_id", state.brands.map(function(b){ return b.id; }).join(","));
      var pairs = [];
      state.brands.forEach(function(b){ (b.models||[]).forEach(function(m){ pairs.push(b.id + ":" + m.id); }); });
      if(pairs.length) p.set("model_id", pairs.join(","));
      var hasGen = state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); });
      if(hasGen) p.set("vehicle_selection", JSON.stringify({brands:state.brands}));
    }
    if(state.priceFrom) p.set("price_from", state.priceFrom);
    if(state.priceTo) p.set("price_to", state.priceTo);
    if(state.currency !== "usd") p.set("currency", state.currency);
    if(state.yearFrom) p.set("year_from", state.yearFrom);
    if(state.yearTo) p.set("year_to", state.yearTo);
    if(state.odoFrom) p.set("odometer_from", state.odoFrom);
    if(state.odoTo) p.set("odometer_to", state.odoTo);
    if(state.transmission) p.set("transmission", state.transmission);
    if(state.bodyTypeIds.length) p.set("body_type_id", state.bodyTypeIds.join(","));
    if(state.fuelIds.length) p.set("fuel_id", state.fuelIds.join(","));
    if(state.driveIds.length) p.set("drive_wheel_id", state.driveIds.join(","));
    if(state.condIds.length) p.set("condition_id", state.condIds.join(","));
    if(state.colorIds.length) p.set("color_id", state.colorIds.join(","));
    if(state.flagKeys) p.set("keys_available", "1");
    if(state.flagInsp) p.set("has_inspections", "1");
    if(state.flagHist) p.set("has_history_reports", "1");
    if(state.sort !== "newest") p.set("sort", state.sort);
    if(state.page > 1) p.set("page", String(state.page));
    return p;
  }

  function clampInt(v, lo, hi){
    var n = parseInt(v, 10);
    if(!isFinite(n)) return "";
    return String(Math.min(hi, Math.max(lo, n)));
  }
  function csvInts(v){ return String(v || "").split(",").map(function(s){ return parseInt(s, 10); }).filter(isFinite); }

  function stateFromParams(p){
    state.vehicleType = p.get("vehicle_type") === "motorcycle" ? "motorcycle" : "automobile";
    var vs = p.get("vehicle_selection");
    if(vs){
      try{
        var parsed = JSON.parse(vs);
        if(Array.isArray(parsed.brands)) state.brands = parsed.brands;
      }catch(e){ state.brands = []; }
    }else{
      var brandIds = csvInts(p.get("brand_id"));
      var modelPairs = {};
      String(p.get("model_id") || "").split(",").forEach(function(pair){
        var parts = pair.split(":");
        var b = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
        if(isFinite(b) && isFinite(m)){ (modelPairs[b] = modelPairs[b] || []).push(m); }
      });
      state.brands = brandIds.map(function(id){ return {id:id, models:(modelPairs[id] || []).map(function(mid){ return {id:mid}; })}; });
    }
    state.priceFrom = clampInt(p.get("price_from"), 0, 1e15);
    state.priceTo = clampInt(p.get("price_to"), 1, 1e15);
    state.currency = /^[a-z]{3}$/.test(p.get("currency") || "") ? p.get("currency").toLowerCase() : "krw";
    state.yearFrom = clampInt(p.get("year_from"), 1800, 3000);
    state.yearTo = clampInt(p.get("year_to"), 1800, 3000);
    state.odoFrom = clampInt(p.get("odometer_from"), 0, 999999999);
    state.odoTo = clampInt(p.get("odometer_to"), 0, 999999999);
    state.transmission = [1,2].includes(parseInt(p.get("transmission"), 10)) ? p.get("transmission") : "";
    state.bodyTypeIds = csvInts(p.get("body_type_id"));
    state.fuelIds = csvInts(p.get("fuel_id"));
    state.driveIds = csvInts(p.get("drive_wheel_id"));
    state.condIds = csvInts(p.get("condition_id"));
    state.colorIds = csvInts(p.get("color_id"));
    state.flagKeys = p.get("keys_available") === "1";
    state.flagInsp = p.get("has_inspections") === "1";
    state.flagHist = p.get("has_history_reports") === "1";
    var sortOk = ["newest","oldest","cheaper","expensive","odometer_asc","odometer_desc","year_asc","year_desc"];
    state.sort = sortOk.indexOf(p.get("sort")) >= 0 ? p.get("sort") : "newest";
    state.page = Math.max(1, parseInt(p.get("page"), 10) || 1);
  }

  function pushUrl(){
    var p = stateToParams();
    var url = location.pathname + (p.toString() ? "?" + p.toString() : "");
    var now = Date.now();
    if(now - lastUrlPushAt < 1500) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    lastUrlPushAt = now;
  }
  function pushUrlForce(){ // смена страницы — всегда push (§5.4)
    var p = stateToParams();
    history.pushState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : ""));
    lastUrlPushAt = 0;
  }

  // ---- Активных фильтров: подсчёт групп (§5.5) ----
  function activeGroupsCount(){
    var n = 0;
    if(state.vehicleType === "motorcycle") n++;
    if(state.brands.length) n++; // марки
    if(state.brands.some(function(b){ return (b.models||[]).length; })) n++; // модели
    if(state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); })) n++;
    if(state.priceFrom || state.priceTo) n++;
    if(state.currency !== "usd") n++;
    if(state.yearFrom || state.yearTo) n++;
    if(state.odoFrom || state.odoTo) n++;
    if(state.transmission) n++;
    if(state.bodyTypeIds.length) n++;
    if(state.fuelIds.length) n++;
    if(state.driveIds.length) n++;
    if(state.condIds.length) n++;
    if(state.colorIds.length) n++;
    if(state.flagKeys) n++;
    if(state.flagInsp) n++;
    if(state.flagHist) n++;
    return n;
  }

  // ---- Запрос к бэкенду ----
  function buildQuery(forFilters){
    var p = stateToParams();
    p.set("action", "search");
    p.set("lang", (window.APEX_LANG || "ru"));
    p.set("per_page", String(PER_PAGE));
    if(!forFilters) p.set("page", String(state.page));
    return p.toString();
  }

  function search(){
    var myToken = ++reqToken;
    if(abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    renderSkeleton();
    fetch("/api/catalog?" + buildQuery(), {signal:abortCtrl.signal})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, status:r.status, data:d}; }); })
      .then(function(res){
        if(myToken !== reqToken) return; // устаревший ответ — игнор
        if(!res.ok){
          renderError(res.data, res.status);
          return;
        }
        renderResults(res.data);
      })
      .catch(function(e){
        if(e && e.name === "AbortError") return;
        if(myToken !== reqToken) return;
        renderError({error:"network"}, 0);
      });
  }
  var searchDebounced = debounce(search, 350);
  function debounce(fn, ms){
    var t;
    return function(){
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  }

  function scheduleSearch(resetPage){
    if(resetPage){ state.page = 1; }
    renderChips();
    renderSidebarState();
    pushUrl();
    searchDebounced();
  }

  // ---- Рендер: тулбар/заголовок ----
  function fmtNum(n){ return Number(n || 0).toLocaleString("ru-RU"); }
  function setHeading(total, approx){
    var h = document.getElementById("catHeadingV1");
    if(!h) return;
    var word = total === 1 ? T("автомобиль") : T("автомобилей");
    h.textContent = fmtNum(total) + (approx ? "+" : "") + " " + word;
  }

  // ---- Скелетоны / состояния ----
  function renderSkeleton(){
    grid.setAttribute("aria-busy", "true");
    if(grid.children.length) return; // держим текущие карточки, не мигаем (кроме первой загрузки)
    var out = "";
    for(var i = 0; i < 8; i++){
      out += '<div class="catCardV1 catSkelV1"><div class="catCardPhotoV1"></div><div class="catCardBodyV1"><div class="catCardTitleV1">—</div><div class="catSpecsV1"><span>—</span><span>—</span><span>—</span><span>—</span></div></div></div>';
    }
    grid.innerHTML = out;
  }

  function renderError(data, status){
    grid.setAttribute("aria-busy", "false");
    var msg = T("Не удалось загрузить каталог. Попробуйте ещё раз.");
    if(status === 503) msg = T("Каталог временно недоступен. Попробуйте чуть позже.");
    grid.innerHTML = '<div class="catStateV1" role="alert" style="grid-column:1/-1">'
      + '<h3>' + esc(T("Ошибка загрузки")) + '</h3><p>' + esc(msg) + '</p>'
      + '<button type="button" id="catRetryBtnV1" type="button">' + esc(T("Повторить")) + '</button>'
      + '</div>';
    var btn = document.getElementById("catRetryBtnV1");
    if(btn) btn.addEventListener("click", search);
    var pager = document.getElementById("catPagerV1");
    if(pager) pager.hidden = true;
    setHeading(0, false);
  }

  function renderEmpty(){
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = '<div class="catStateV1" style="grid-column:1/-1">'
      + '<h3>' + esc(T("Ничего не найдено")) + '</h3><p>' + esc(T("Попробуйте изменить или сбросить часть фильтров.")) + '</p>'
      + '<button type="button" id="catEmptyResetV1">' + esc(T("Сбросить всё")) + '</button>'
      + '</div>';
    var btn = document.getElementById("catEmptyResetV1");
    if(btn) btn.addEventListener("click", resetAll);
  }

  // ---- Карточка ----
  function pickListing(car){
    var listings = Array.isArray(car.listings) ? car.listings : [];
    var active = listings.filter(function(l){ return !l.archived; });
    return (active[0] || listings[0] || null);
  }
  function firstImageUrl(img){
    return img.downloaded || img.original || img.preview || "";
  }
  function titleOf(car){
    var brand = car.brand && car.brand.name;
    var model = car.model && car.model.name;
    if(brand || model) return [brand, model, car.year].filter(Boolean).join(" ");
    var l = pickListing(car);
    var tm = l && l.title;
    if(tm && typeof tm === "object"){
      var lang = window.APEX_LANG === "en" ? "en" : (window.APEX_LANG === "ro" ? "en" : "ru");
      return tm[lang] || tm.en || Object.values(tm)[0] || T("Автомобиль");
    }
    return T("Автомобиль");
  }
  function specsOf(car, listing){
    var out = [];
    if(listing && listing.odometer != null) out.push(fmtNum(listing.odometer) + " " + T("км"));
    if(car.fuel && car.fuel.name) out.push(T(fuelLabel(car.fuel.id)));
    if(car.transmission && car.transmission.name) out.push(T(transLabel(car.transmission.id)));
    // Электро: engine_volume в фиде — НЕ объём двигателя (120/111/202/1... бессмысленно как см³/1000, проверено 04.11.2026) — не показываем.
    if(car.engine_volume && !(car.fuel && car.fuel.id === 2)) out.push((car.engine_volume / 1000).toFixed(1).replace(/\.0$/, "") + " " + T("л"));
    if(car.power_hp) out.push(car.power_hp + " " + T("л.с."));
    if(car.drive_wheels && car.drive_wheels.name) out.push(T(driveLabel(car.drive_wheels.id)));
    if(car.body_type && car.body_type.name) out.push(T(bodyLabel(car.body_type.id)));
    return out.slice(0, 4);
  }
  function fuelLabel(id){ var r = FUELS.find(function(x){ return x[0] === id; }); return r ? r[1] : ""; }
  function transLabel(id){ var r = TRANSMISSIONS.find(function(x){ return x[0] === id; }); return r ? r[1] : ""; }
  function driveLabel(id){ var r = DRIVE_WHEELS.find(function(x){ return x[0] === id; }); return r ? r[1] : ""; }
  function bodyLabel(id){ var r = BODY_TYPES.find(function(x){ return x[0] === id; }); return r ? r[1] : ""; }
  function placeOf(listing){
    var ld = listing && listing.location_details;
    if(!ld) return "";
    var parts = [ld.region && ld.region.name, ld.country && ld.country.name].filter(Boolean);
    return parts.join(", ");
  }
  function priceOf(car, listing){
    if(!listing) return {label:T("Цена"), text:T("Цена по запросу")};
    if(listing.is_auction){
      if(listing.current_bid != null) return {label:T("Текущая ставка"), text:fmtNum(listing.current_bid), cur:curName(listing)};
      if(listing.price && listing.price.price > 0) return {label:T("Цена аукциона"), text:fmtNum(listing.price.price), cur:curName(listing)};
      return {label:T("Цена"), text:T("Цена по запросу")};
    }
    if(listing.price && listing.price.price > 0) return {label:T("Цена"), text:fmtNum(listing.price.price), cur:curName(listing)};
    if(listing.current_bid != null) return {label:T("Текущая ставка"), text:fmtNum(listing.current_bid), cur:curName(listing)};
    return {label:T("Цена"), text:T("Цена по запросу")};
  }
  function curName(listing){
    var c = listing && listing.price && listing.price.currency;
    return c && c.name ? String(c.name).toUpperCase() : "";
  }

  function carHref(car, listing){
    var p = new URLSearchParams();
    if(listing && listing.external){ p.set("domain_id", listing.external.domain.id); p.set("listing_id", listing.external.id); }
    return "/catalog/" + encodeURIComponent(car.id) + (p.toString() ? "?" + p.toString() : "");
  }

  var ICON_INSPECTION = '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 10.2l2.3 2.3 4.7-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_HISTORY = '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10.5" r="7.2" stroke="currentColor" stroke-width="1.6"/><path d="M10 6.8v4l2.6 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.3 5.3l1-2.4 2.3 1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_OPEN = '<svg viewBox="0 0 20 20" fill="none"><path d="M8 6h6v6M14 6L6 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function cardHtml(car){
    var listing = pickListing(car);
    var imgs = listing && Array.isArray(listing.images) ? listing.images.map(firstImageUrl).filter(Boolean) : [];
    var sold = listing && listing.archived;
    var badges = "";
    if(car.has_inspections) badges += '<span class="catBadgeV1 isInspV1">' + ICON_INSPECTION + esc(T("Осмотр")) + '</span>';
    if(car.has_history_reports) badges += '<span class="catBadgeV1 isHistV1">' + ICON_HISTORY + esc(T("История")) + '</span>';
    var specs = specsOf(car, listing).map(function(s){ return "<span>" + esc(s) + "</span>"; }).join("");
    var place = placeOf(listing);
    var src = listing && listing.external && listing.external.domain && listing.external.domain.name || "";
    var price = priceOf(car, listing);
    var href = carHref(car, listing);
    var nav = imgs.length > 1
      ? '<button type="button" class="catPhotoNavV1 catPhotoPrevV1" data-nav="-1" aria-label="' + esc(T("Предыдущее фото")) + '">‹</button>'
        + '<button type="button" class="catPhotoNavV1 catPhotoNextV1" data-nav="1" aria-label="' + esc(T("Следующее фото")) + '">›</button>'
        + '<div class="catPhotoDotsV1">' + imgs.slice(0, 6).map(function(_, i){ return '<span class="' + (i === 0 ? "isOnV1" : "") + '"></span>'; }).join("") + '</div>'
      : "";
    return '<a class="catCardV1" href="' + esc(href) + '" role="listitem">'
      + '<div class="catCardPhotoV1" data-images="' + esc(JSON.stringify(imgs.slice(0, 6))) + '" data-idx="0">'
        + (imgs[0] ? '<img src="' + esc(imgs[0]) + '" alt="" loading="lazy" referrerpolicy="no-referrer" width="320" height="240">' : '<div class="catCardNoPhotoV1">' + esc(T("Нет фото")) + '</div>')
        + nav
        + (badges ? '<div class="catBadgeRowV1">' + badges + '</div>' : "")
        + (sold ? '<div class="catSoldStampV1">' + esc(T("ПРОДАНО")) + '</div>' : "")
      + '</div>'
      + '<div class="catCardBodyV1">'
        + '<h3 class="catCardTitleV1" data-no-i18n="true">' + esc(titleOf(car)) + '</h3>'
        + '<div class="catSpecsV1">' + specs + '</div>'
        + (place || src ? '<div class="catPlaceRowV1"><span data-no-i18n="true">' + esc(place) + '</span>' + (src ? '<span class="catSrcV1" data-no-i18n="true">' + esc(src) + '</span>' : "") + '</div>' : "")
        + '<div class="catPriceRowV1"><span><span class="catPriceLblV1">' + esc(price.label) + '</span><span class="catPriceAmtV1" data-no-i18n="true">' + esc(price.text) + '</span></span>' + (price.cur ? '<span class="catPriceCurV1" data-no-i18n="true">' + esc(price.cur) + '</span>' : "") + '<span class="catQuickOpenV1" aria-hidden="true">' + ICON_OPEN + '</span></div>'
      + '</div>'
    + '</a>';
  }

  // Стрелки фото карточки листают снимок БЕЗ перехода на страницу (бриф §5.7, как у демо-каталога провайдера).
  grid.addEventListener("click", function(e){
    var btn = e.target.closest("[data-nav]");
    if(!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var box = btn.closest(".catCardPhotoV1");
    if(!box) return;
    var imgs;
    try{ imgs = JSON.parse(box.getAttribute("data-images") || "[]"); }catch(err){ imgs = []; }
    if(!imgs.length) return;
    var idx = parseInt(box.getAttribute("data-idx"), 10) || 0;
    idx = (idx + parseInt(btn.getAttribute("data-nav"), 10) + imgs.length) % imgs.length;
    box.setAttribute("data-idx", String(idx));
    var im = box.querySelector("img");
    if(im) im.src = imgs[idx];
    box.querySelectorAll(".catPhotoDotsV1 span").forEach(function(d, i){ d.classList.toggle("isOnV1", i === idx); });
  }, true);

  function renderResults(data){
    grid.setAttribute("aria-busy", "false");
    var items = Array.isArray(data.items) ? data.items : [];
    setHeading(data.total || 0, !!data.countApprox);
    if(!items.length){ renderEmpty(); renderPager(data); return; }
    grid.innerHTML = items.map(cardHtml).join("");
    renderPager(data);
  }

  function renderPager(data){
    var pager = document.getElementById("catPagerV1");
    if(!pager) return;
    var perPage = data.perPage || PER_PAGE;
    var total = data.total || 0;
    var lastReachable = Math.min(data.lastReachablePage || 416, Math.max(1, Math.ceil(total / perPage)));
    if(total <= perPage){ pager.hidden = true; return; }
    pager.hidden = false;
    var cur = state.page;
    var from = (cur - 1) * perPage + 1;
    var to = Math.min(total, cur * perPage);
    var pages = pagerPages(cur, lastReachable);
    var btns = pages.map(function(p){
      if(p === "...") return '<button type="button" disabled>…</button>';
      return '<button type="button" ' + (p === cur ? 'aria-current="page"' : '') + ' data-page="' + p + '">' + p + '</button>';
    }).join("");
    pager.innerHTML = '<span class="catPagerInfoV1">' + esc(T("Показано")) + " " + fmtNum(from) + "–" + fmtNum(to) + " " + esc(T("из")) + " " + fmtNum(total) + '</span>'
      + '<div class="catPagerBtnsV1">'
      + '<button type="button" data-page="' + (cur - 1) + '" ' + (cur <= 1 ? "disabled" : "") + '>‹</button>'
      + btns
      + '<button type="button" data-page="' + (cur + 1) + '" ' + (cur >= lastReachable ? "disabled" : "") + '>›</button>'
      + '</div>';
  }
  function pagerPages(cur, last){
    if(last <= 7){ var all = []; for(var i = 1; i <= last; i++) all.push(i); return all; }
    var set = [1, last, cur];
    if(cur <= 4){ for(var i = 2; i <= 5; i++) set.push(i); }
    else if(cur >= last - 3){ for(var i = last - 4; i <= last - 1; i++) set.push(i); }
    else{ set.push(cur - 1, cur + 1); }
    var uniq = Array.from(new Set(set)).filter(function(n){ return n >= 1 && n <= last; }).sort(function(a, b){ return a - b; });
    var out = [];
    for(var i = 0; i < uniq.length; i++){
      if(i > 0 && uniq[i] - uniq[i - 1] > 1) out.push("...");
      out.push(uniq[i]);
    }
    return out;
  }

  // ---- Чипы активных фильтров ----
  function renderChips(){
    var row = document.getElementById("catChipsRowV1");
    if(!row) return;
    var chips = [];
    function chip(label, onRemove){ chips.push({label:label, onRemove:onRemove}); }
    if(state.vehicleType === "motorcycle") chip(T("Мотоциклы"), function(){ state.vehicleType = "automobile"; });
    state.brands.forEach(function(b, bi){
      var bName = (dict.brands || []).find(function(x){ return x.id === b.id; });
      chip((bName ? bName.name : "ID " + b.id), function(){ state.brands.splice(bi, 1); });
      (b.models || []).forEach(function(m, mi){
        var mName = (dict.modelsByBrand[b.id] || []).find(function(x){ return x.id === m.id; });
        chip((mName ? mName.name : "ID " + m.id), function(){ b.models.splice(mi, 1); });
      });
    });
    if(state.priceFrom) chip(T("Цена от") + " " + fmtNum(state.priceFrom) + " " + state.currency.toUpperCase(), function(){ state.priceFrom = ""; });
    if(state.priceTo) chip(T("Цена до") + " " + fmtNum(state.priceTo) + " " + state.currency.toUpperCase(), function(){ state.priceTo = ""; });
    if(state.yearFrom) chip(T("Год от") + " " + state.yearFrom, function(){ state.yearFrom = ""; });
    if(state.yearTo) chip(T("Год до") + " " + state.yearTo, function(){ state.yearTo = ""; });
    if(state.odoFrom) chip(T("Пробег от") + " " + fmtNum(state.odoFrom) + " " + T("км"), function(){ state.odoFrom = ""; });
    if(state.odoTo) chip(T("Пробег до") + " " + fmtNum(state.odoTo) + " " + T("км"), function(){ state.odoTo = ""; });
    if(state.transmission) chip(T(transLabel(parseInt(state.transmission, 10))), function(){ state.transmission = ""; });
    state.bodyTypeIds.forEach(function(id){ chip(T(bodyLabel(id)), function(){ state.bodyTypeIds = state.bodyTypeIds.filter(function(x){ return x !== id; }); }); });
    state.fuelIds.forEach(function(id){ chip(T(fuelLabel(id)), function(){ state.fuelIds = state.fuelIds.filter(function(x){ return x !== id; }); }); });
    state.driveIds.forEach(function(id){ chip(T(driveLabel(id)), function(){ state.driveIds = state.driveIds.filter(function(x){ return x !== id; }); }); });
    state.condIds.forEach(function(id){ var r = CONDITIONS.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.condIds = state.condIds.filter(function(x){ return x !== id; }); }); });
    state.colorIds.forEach(function(id){ var r = COLORS.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.colorIds = state.colorIds.filter(function(x){ return x !== id; }); }); });
    if(state.flagKeys) chip(T("Ключи в наличии"), function(){ state.flagKeys = false; });
    if(state.flagInsp) chip(T("Есть отчёт осмотра"), function(){ state.flagInsp = false; });
    if(state.flagHist) chip(T("Есть отчёт истории"), function(){ state.flagHist = false; });

    if(!chips.length){ row.hidden = true; row.innerHTML = ""; return; }
    row.hidden = false;
    row.innerHTML = chips.map(function(c, i){ return '<span class="catChipV1" data-chip-i="' + i + '" data-no-i18n="true">' + esc(c.label) + '<button type="button" aria-label="' + esc(T("Убрать фильтр")) + '">✕</button></span>'; }).join("")
      + '<button type="button" class="catClearAllV1" id="catClearAllBtnV1">' + esc(T("Очистить всё")) + '</button>';
    row.querySelectorAll("[data-chip-i]").forEach(function(el, i){
      el.querySelector("button").addEventListener("click", function(){ chips[i].onRemove(); scheduleSearch(true); });
    });
    var clearBtn = document.getElementById("catClearAllBtnV1");
    if(clearBtn) clearBtn.addEventListener("click", resetAll);

    var badge = document.getElementById("catFilterBadgeV1");
    var n = activeGroupsCount();
    if(badge){ badge.hidden = !n; badge.textContent = String(n); }
    var mobBtn = document.getElementById("catFiltersMobBtnV1");
    if(mobBtn) mobBtn.textContent = n ? (T("Фильтры") + " · " + n) : T("Фильтры");
  }

  function resetAll(){
    state.vehicleType = "automobile"; state.brands = [];
    state.priceFrom = ""; state.priceTo = ""; state.currency = "krw";
    state.yearFrom = ""; state.yearTo = ""; state.odoFrom = ""; state.odoTo = "";
    state.transmission = ""; state.bodyTypeIds = []; state.fuelIds = []; state.driveIds = []; state.condIds = []; state.colorIds = [];
    state.flagKeys = false; state.flagInsp = false; state.flagHist = false;
    state.sort = "newest"; state.page = 1;
    renderSidebarAll();
    scheduleSearch(true);
  }

  // ========== Сайдбар: словари и рендер ==========
  function ensureBrands(){
    if(dict.brands) return Promise.resolve(dict.brands);
    return fetch("/api/catalog?action=brands&lang=" + encodeURIComponent(window.APEX_LANG || "ru") + "&vehicle_type=" + state.vehicleType)
      .then(function(r){ return r.json(); })
      .then(function(d){ dict.brands = (d && d.items) || []; return dict.brands; })
      .catch(function(){ dict.brands = []; return dict.brands; });
  }
  function ensureModels(brandId){
    if(dict.modelsByBrand[brandId]) return Promise.resolve(dict.modelsByBrand[brandId]);
    return fetch("/api/catalog?action=models&brand_id=" + encodeURIComponent(brandId) + "&lang=" + encodeURIComponent(window.APEX_LANG || "ru"))
      .then(function(r){ return r.json(); })
      .then(function(d){ dict.modelsByBrand[brandId] = (d && d.items) || []; return dict.modelsByBrand[brandId]; })
      .catch(function(){ dict.modelsByBrand[brandId] = []; return []; });
  }
  function ensureGenerations(modelId){
    if(dict.gensByModel[modelId]) return Promise.resolve(dict.gensByModel[modelId]);
    return fetch("/api/catalog?action=generations&model_id=" + encodeURIComponent(modelId) + "&lang=" + encodeURIComponent(window.APEX_LANG || "ru"))
      .then(function(r){ return r.json(); })
      .then(function(d){ dict.gensByModel[modelId] = (d && d.items) || []; return dict.gensByModel[modelId]; })
      .catch(function(){ dict.gensByModel[modelId] = []; return []; });
  }

  var makeSearchQuery = "";
  function renderMakeList(){
    var listEl = document.getElementById("catMakeListV1");
    if(!listEl) return;
    var all = dict.brands || [];
    var q = makeSearchQuery.trim().toLowerCase();
    var filtered = q ? all.filter(function(b){ return (b.name || "").toLowerCase().indexOf(q) >= 0; }) : all;
    var selectedIds = state.brands.map(function(b){ return b.id; });
    var popular = filtered.filter(function(b){ return POPULAR_BRAND_NAMES.indexOf(b.name) >= 0; });
    var other = filtered.filter(function(b){ return POPULAR_BRAND_NAMES.indexOf(b.name) < 0; });
    function rowHtml(b){
      var on = selectedIds.indexOf(b.id) >= 0;
      return '<label class="catRowV1" data-brand-id="' + b.id + '">'
        + '<input type="checkbox" ' + (on ? "checked" : "") + '>'
        + '<span class="catAvatarV1">' + esc((b.name || "?").slice(0, 1)) + '</span>'
        + '<span class="catRowNameV1" data-no-i18n="true">' + esc(b.name || ("ID " + b.id)) + '</span>'
      + '</label>';
    }
    var html = "";
    if(popular.length) html += popular.map(rowHtml).join("");
    if(other.length) html += (popular.length ? '<div style="padding:6px 6px 2px;font-size:11px;color:var(--muted)">' + esc(T("Другие марки")) + '</div>' : "") + other.map(rowHtml).join("");
    listEl.innerHTML = html || ('<div style="padding:8px 4px;color:var(--muted);font-size:13px">' + esc(T("Ничего не найдено")) + '</div>');
    listEl.querySelectorAll("[data-brand-id]").forEach(function(el){
      el.addEventListener("change", function(){
        var id = parseInt(el.getAttribute("data-brand-id"), 10);
        var idx = state.brands.findIndex(function(b){ return b.id === id; });
        if(el.querySelector("input").checked){
          if(idx < 0) state.brands.push({id:id, models:[]});
        }else if(idx >= 0){
          state.brands.splice(idx, 1);
        }
        renderModelSection();
        renderGenSection();
        scheduleSearch(true);
      });
    });
  }

  function renderModelSection(){
    var sec = document.getElementById("catSecModelV1");
    var wrap = document.getElementById("catModelBlocksV1");
    if(!sec || !wrap) return;
    if(!state.brands.length){ sec.hidden = true; wrap.innerHTML = ""; return; }
    sec.hidden = false;
    var htmlParts = state.brands.map(function(b, bi){
      var bInfo = (dict.brands || []).find(function(x){ return x.id === b.id; });
      var models = dict.modelsByBrand[b.id] || [];
      var chips = (b.models || []).map(function(m, mi){
        var mInfo = models.find(function(x){ return x.id === m.id; });
        return '<span class="catMiniChipV1" data-no-i18n="true">' + esc(mInfo ? mInfo.name : ("ID " + m.id)) + '<button type="button" data-rm-model="' + bi + ':' + mi + '">✕</button></span>';
      }).join("") || '<span class="catMiniChipV1">' + esc(T("Все модели")) + '</span>';
      return '<div class="catBlockV1" data-block-brand="' + bi + '">'
        + '<div class="catBlockHeadV1"><span class="catAvatarV1">' + esc((bInfo ? bInfo.name : "?").slice(0, 1)) + '</span><b data-no-i18n="true">' + esc(bInfo ? bInfo.name : ("ID " + b.id)) + '</b></div>'
        + '<div class="catChipRowV1">' + chips + '<button type="button" class="catAddBtnV1" data-add-model="' + bi + '">+ ' + esc(T("Добавить")) + '</button></div>'
        + '<div class="catModelPickerV1" data-picker="' + bi + '" hidden></div>'
      + '</div>';
    });
    wrap.innerHTML = htmlParts.join("");

    wrap.querySelectorAll("[data-rm-model]").forEach(function(el){
      el.addEventListener("click", function(){
        var parts = el.getAttribute("data-rm-model").split(":");
        var bi = parseInt(parts[0], 10), mi = parseInt(parts[1], 10);
        state.brands[bi].models.splice(mi, 1);
        renderModelSection(); renderGenSection(); scheduleSearch(true);
      });
    });
    wrap.querySelectorAll("[data-add-model]").forEach(function(el){
      el.addEventListener("click", function(){
        var bi = parseInt(el.getAttribute("data-add-model"), 10);
        var picker = wrap.querySelector('[data-picker="' + bi + '"]');
        if(!picker) return;
        var willOpen = picker.hidden;
        wrap.querySelectorAll(".catModelPickerV1").forEach(function(p){ p.hidden = true; });
        if(!willOpen) return;
        picker.hidden = false;
        var brandId = state.brands[bi].id;
        picker.innerHTML = '<div style="padding:8px 0 4px;color:var(--muted);font-size:12.5px">' + esc(T("Загрузка…")) + '</div>';
        ensureModels(brandId).then(function(models){
          var selected = (state.brands[bi].models || []).map(function(m){ return m.id; });
          picker.innerHTML = '<div class="catListV1" style="max-height:220px">' + models.map(function(m){
            var on = selected.indexOf(m.id) >= 0;
            return '<label class="catRowV1"><input type="checkbox" data-model-id="' + m.id + '" ' + (on ? "checked" : "") + '><span class="catRowNameV1" data-no-i18n="true">' + esc(m.name || ("ID " + m.id)) + '</span></label>';
          }).join("") + '</div>';
          picker.querySelectorAll("[data-model-id]").forEach(function(cb){
            cb.addEventListener("change", function(){
              var mid = parseInt(cb.getAttribute("data-model-id"), 10);
              var arr = state.brands[bi].models = state.brands[bi].models || [];
              var idx = arr.findIndex(function(m){ return m.id === mid; });
              if(cb.checked){ if(idx < 0) arr.push({id:mid}); }
              else if(idx >= 0) arr.splice(idx, 1);
              renderModelSection(); renderGenSection(); scheduleSearch(true);
            });
          });
        });
      });
    });
  }

  function renderGenSection(){
    var sec = document.getElementById("catSecGenV1");
    var wrap = document.getElementById("catGenBlocksV1");
    if(!sec || !wrap) return;
    var modelsSelected = [];
    state.brands.forEach(function(b, bi){ (b.models || []).forEach(function(m, mi){ modelsSelected.push({bi:bi, mi:mi, brandId:b.id, modelId:m.id}); }); });
    if(!modelsSelected.length){ sec.hidden = true; wrap.innerHTML = ""; return; }
    sec.hidden = false;
    wrap.innerHTML = modelsSelected.map(function(ref){
      var mInfo = (dict.modelsByBrand[ref.brandId] || []).find(function(x){ return x.id === ref.modelId; });
      var m = state.brands[ref.bi].models[ref.mi];
      var chips = (m.generations || []).map(function(g, gi){
        var gens = dict.gensByModel[ref.modelId] || [];
        var gInfo = gens.find(function(x){ return x.id === g.id; });
        var label = gInfo ? genLabel(gInfo) : ("ID " + g.id);
        return '<span class="catMiniChipV1" data-no-i18n="true">' + esc(label) + '<button type="button" data-rm-gen="' + ref.bi + ':' + ref.mi + ':' + gi + '">✕</button></span>';
      }).join("") || '<span class="catMiniChipV1">' + esc(T("Все поколения")) + '</span>';
      return '<div class="catBlockV1">'
        + '<div class="catBlockHeadV1"><b data-no-i18n="true">' + esc(mInfo ? mInfo.name : ("ID " + ref.modelId)) + '</b></div>'
        + '<div class="catChipRowV1">' + chips + '<button type="button" class="catAddBtnV1" data-add-gen="' + ref.bi + ':' + ref.mi + '">+ ' + esc(T("Добавить")) + '</button></div>'
        + '<div class="catGenPickerV1" data-gpicker="' + ref.bi + ':' + ref.mi + '" hidden></div>'
      + '</div>';
    }).join("");

    wrap.querySelectorAll("[data-rm-gen]").forEach(function(el){
      el.addEventListener("click", function(){
        var parts = el.getAttribute("data-rm-gen").split(":").map(Number);
        state.brands[parts[0]].models[parts[1]].generations.splice(parts[2], 1);
        renderGenSection(); scheduleSearch(true);
      });
    });
    wrap.querySelectorAll("[data-add-gen]").forEach(function(el){
      el.addEventListener("click", function(){
        var parts = el.getAttribute("data-add-gen").split(":").map(Number);
        var bi = parts[0], mi = parts[1];
        var picker = wrap.querySelector('[data-gpicker="' + bi + ':' + mi + '"]');
        if(!picker) return;
        var willOpen = picker.hidden;
        wrap.querySelectorAll(".catGenPickerV1").forEach(function(p){ p.hidden = true; });
        if(!willOpen) return;
        picker.hidden = false;
        var modelId = state.brands[bi].models[mi].id;
        picker.innerHTML = '<div style="padding:8px 0 4px;color:var(--muted);font-size:12.5px">' + esc(T("Загрузка…")) + '</div>';
        ensureGenerations(modelId).then(function(gens){
          var m = state.brands[bi].models[mi];
          var selected = (m.generations || []).map(function(g){ return g.id; });
          picker.innerHTML = gens.length ? ('<div class="catListV1" style="max-height:200px">' + gens.map(function(g){
            var on = selected.indexOf(g.id) >= 0;
            return '<label class="catRowV1"><input type="checkbox" data-gen-id="' + g.id + '" ' + (on ? "checked" : "") + '><span class="catRowNameV1" data-no-i18n="true">' + esc(genLabel(g)) + '</span></label>';
          }).join("") + '</div>') : ('<p style="color:var(--muted);font-size:12.5px;padding:6px 0">' + esc(T("Не удалось загрузить список")) + '</p>');
          picker.querySelectorAll("[data-gen-id]").forEach(function(cb){
            cb.addEventListener("change", function(){
              var gid = parseInt(cb.getAttribute("data-gen-id"), 10);
              m.generations = m.generations || [];
              var idx = m.generations.findIndex(function(g){ return g.id === gid; });
              if(cb.checked){ if(idx < 0) m.generations.push({id:gid}); }
              else if(idx >= 0) m.generations.splice(idx, 1);
              renderGenSection(); scheduleSearch(true);
            });
          });
        });
      });
    });
  }
  function genLabel(g){
    var years = (g.from_year || g.from) ? ((g.from_year || g.from) + "–" + (g.to_year || g.to || "")) : "";
    var name = [g.ordinal, g.code].filter(Boolean).join(" ") || g.name || ("ID " + g.id);
    return years ? (name + " · " + years) : name;
  }

  function renderPills(containerId, table, selectedArr, onToggle){
    var el = document.getElementById(containerId);
    if(!el) return;
    el.innerHTML = table.map(function(row){
      var on = selectedArr.indexOf(row[0]) >= 0;
      return '<button type="button" class="catPillV1' + (on ? " isOnV1" : "") + '" data-val="' + row[0] + '" data-no-i18n="true">' + esc(T(row[1])) + '</button>';
    }).join("");
    el.querySelectorAll("[data-val]").forEach(function(btn){
      btn.addEventListener("click", function(){
        onToggle(parseInt(btn.getAttribute("data-val"), 10));
        renderSidebarAll();
        scheduleSearch(true);
      });
    });
  }
  function toggleIn(arr, v){
    var i = arr.indexOf(v);
    if(i >= 0) arr.splice(i, 1); else arr.push(v);
  }

  function renderColorSwatches(){
    var el = document.getElementById("catColorSwatchesV1");
    var moreBtn = document.getElementById("catColorMoreV1");
    if(!el) return;
    var expanded = el.getAttribute("data-expanded") === "1";
    var shown = expanded ? COLORS : COLORS.slice(0, 5).concat(COLORS.filter(function(c){ return state.colorIds.indexOf(c[0]) >= 0; }).filter(function(c){ return COLORS.slice(0,5).indexOf(c) < 0; }));
    el.innerHTML = shown.map(function(c){
      var on = state.colorIds.indexOf(c[0]) >= 0;
      return '<span class="catSwatchV1' + (on ? " isOnV1" : "") + '" style="background:' + c[2] + '" data-color="' + c[0] + '" title="' + esc(T(c[1])) + '"></span>';
    }).join("");
    el.querySelectorAll("[data-color]").forEach(function(sw){
      sw.addEventListener("click", function(){
        toggleIn(state.colorIds, parseInt(sw.getAttribute("data-color"), 10));
        renderColorSwatches();
        scheduleSearch(true);
      });
    });
    if(moreBtn) moreBtn.hidden = expanded;
  }

  function renderSidebarAll(){
    renderMakeList();
    renderModelSection();
    renderGenSection();
    renderPills("catTransPillsV1", TRANSMISSIONS, state.transmission ? [parseInt(state.transmission, 10)] : [], function(v){
      state.transmission = state.transmission === String(v) ? "" : String(v);
    });
    renderPills("catBodyPillsV1", BODY_TYPES, state.bodyTypeIds, function(v){ toggleIn(state.bodyTypeIds, v); });
    renderPills("catFuelPillsV1", FUELS, state.fuelIds, function(v){ toggleIn(state.fuelIds, v); });
    renderPills("catDrivePillsV1", DRIVE_WHEELS, state.driveIds, function(v){ toggleIn(state.driveIds, v); });
    renderPills("catCondPillsV1", CONDITIONS, state.condIds, function(v){ toggleIn(state.condIds, v); });
    renderColorSwatches();
    renderSidebarState();
  }

  function renderSidebarState(){
    // Подставляем значения текстовых полей и переключателей из state (после Back/Forward/reset).
    setVal("catPriceFromV1", state.priceFrom); setVal("catPriceToV1", state.priceTo);
    setVal("catCurrencyV1", state.currency);
    setVal("catYearFromV1", state.yearFrom); setVal("catYearToV1", state.yearTo);
    setVal("catOdoFromV1", state.odoFrom); setVal("catOdoToV1", state.odoTo);
    setChecked("catFlagKeysV1", state.flagKeys);
    setChecked("catFlagInspV1", state.flagInsp);
    setChecked("catFlagHistV1", state.flagHist);
    setVal("catSortSelV1", state.sort);
    var seg = document.getElementById("catVehTypeSegV1");
    if(seg) seg.querySelectorAll("button").forEach(function(b){ b.classList.toggle("isOnV1", b.getAttribute("data-val") === state.vehicleType); });
    // «точка» активности у разделов
    document.querySelectorAll(".catSecV1").forEach(function(sec){
      var key = sec.getAttribute("data-sec");
      var active = false;
      if(key === "vehicle") active = !!state.brands.length || state.vehicleType === "motorcycle";
      if(key === "model") active = state.brands.some(function(b){ return (b.models||[]).length; });
      if(key === "generation") active = state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); });
      if(key === "price") active = !!(state.priceFrom || state.priceTo);
      if(key === "year") active = !!(state.yearFrom || state.yearTo);
      if(key === "mileage") active = !!(state.odoFrom || state.odoTo);
      if(key === "transmission") active = !!state.transmission;
      if(key === "body") active = !!state.bodyTypeIds.length;
      if(key === "fuel") active = !!state.fuelIds.length;
      if(key === "drive") active = !!state.driveIds.length;
      if(key === "condition") active = !!state.condIds.length;
      if(key === "color") active = !!state.colorIds.length;
      if(key === "flags") active = state.flagKeys || state.flagInsp || state.flagHist;
      sec.classList.toggle("isActiveV1", active);
    });
  }
  function setVal(id, v){ var el = document.getElementById(id); if(el) el.value = v || (id === "catCurrencyV1" ? "krw" : ""); }
  function setChecked(id, v){ var el = document.getElementById(id); if(el) el.checked = !!v; }

  // ---- Открытые/закрытые секции (localStorage, §5.2) ----
  function sectionStorageKey(key){ return "catalog-filter-open:" + key; }
  document.addEventListener("click", function(e){
    var btn = e.target.closest("[data-toggle]");
    if(!btn) return;
    var sec = btn.closest(".catSecV1");
    if(!sec) return;
    var open = sec.classList.toggle("isOpenV1");
    try{ localStorage.setItem(sectionStorageKey(sec.getAttribute("data-sec")), open ? "1" : "0"); }catch(err){}
  });
  document.querySelectorAll(".catSecV1").forEach(function(sec){
    try{
      var saved = localStorage.getItem(sectionStorageKey(sec.getAttribute("data-sec")));
      if(saved === "1") sec.classList.add("isOpenV1");
      if(saved === "0") sec.classList.remove("isOpenV1");
    }catch(err){}
  });

  // ---- Обработчики простых полей ----
  function onText(id, setter){
    var el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("change", function(){ setter(el.value.replace(/[^\d]/g, "")); scheduleSearch(true); });
  }
  onText("catPriceFromV1", function(v){ state.priceFrom = v; });
  onText("catPriceToV1", function(v){ state.priceTo = v; });
  onText("catYearFromV1", function(v){ state.yearFrom = v; });
  onText("catYearToV1", function(v){ state.yearTo = v; });
  onText("catOdoFromV1", function(v){ state.odoFrom = v; });
  onText("catOdoToV1", function(v){ state.odoTo = v; });
  var curSel = document.getElementById("catCurrencyV1");
  if(curSel) curSel.addEventListener("change", function(){ state.currency = curSel.value; scheduleSearch(true); });
  ["catFlagKeysV1", "catFlagInspV1", "catFlagHistV1"].forEach(function(id, i){
    var el = document.getElementById(id);
    if(!el) return;
    el.addEventListener("change", function(){
      if(i === 0) state.flagKeys = el.checked;
      if(i === 1) state.flagInsp = el.checked;
      if(i === 2) state.flagHist = el.checked;
      scheduleSearch(true);
    });
  });
  var sortSel = document.getElementById("catSortSelV1");
  if(sortSel) sortSel.addEventListener("change", function(){ state.sort = sortSel.value; scheduleSearch(true); });
  var makeSearch = document.getElementById("catMakeSearchV1");
  if(makeSearch) makeSearch.addEventListener("input", debounce(function(){ makeSearchQuery = makeSearch.value; renderMakeList(); }, 150));
  var vehSeg = document.getElementById("catVehTypeSegV1");
  if(vehSeg) vehSeg.addEventListener("click", function(e){
    var b = e.target.closest("[data-val]");
    if(!b) return;
    var val = b.getAttribute("data-val");
    if(val === state.vehicleType) return;
    state.vehicleType = val;
    state.brands = [];
    dict.brands = null;
    ensureBrands().then(function(){ renderSidebarAll(); });
    scheduleSearch(true);
  });
  var resetBtn = document.getElementById("catResetAllBtnV1");
  if(resetBtn) resetBtn.addEventListener("click", resetAll);
  var applyBtn = document.getElementById("catApplyBtnV1");
  if(applyBtn) applyBtn.addEventListener("click", function(){ closeMobileFilters(); search(); });

  function openMobileFilters(){ document.body.classList.add("catFiltersOpenV1"); var c = document.getElementById("catFiltersCloseBtnV1"); if(c) c.style.display = "inline-flex"; }
  function closeMobileFilters(){ document.body.classList.remove("catFiltersOpenV1"); }
  var mobBtn = document.getElementById("catFiltersMobBtnV1");
  if(mobBtn) mobBtn.addEventListener("click", openMobileFilters);
  var closeBtn = document.getElementById("catFiltersCloseBtnV1");
  if(closeBtn) closeBtn.addEventListener("click", closeMobileFilters);
  document.body.addEventListener("click", function(e){
    if(document.body.classList.contains("catFiltersOpenV1") && e.target === document.body) closeMobileFilters();
  });

  // ---- Пагинация клики ----
  document.getElementById("catPagerV1").addEventListener("click", function(e){
    var b = e.target.closest("[data-page]");
    if(!b || b.disabled) return;
    var p = parseInt(b.getAttribute("data-page"), 10);
    if(!isFinite(p) || p < 1) return;
    state.page = p;
    pushUrlForce();
    search();
    var results = document.querySelector(".catalogResultsV1");
    if(results) results.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start"});
  });

  // ---- Back/Forward ----
  window.addEventListener("popstate", function(){
    stateFromParams(new URLSearchParams(location.search));
    renderSidebarAll();
    renderChips();
    search();
  });

  // ---- Старт ----
  function boot(){
    stateFromParams(new URLSearchParams(location.search));
    ensureBrands().then(function(){
      var modelPromises = state.brands.map(function(b){ return ensureModels(b.id); });
      Promise.all(modelPromises).then(function(){
        var genPromises = [];
        state.brands.forEach(function(b){ (b.models || []).forEach(function(m){ if((m.generations || []).length) genPromises.push(ensureGenerations(m.id)); }); });
        Promise.all(genPromises).then(function(){ renderSidebarAll(); renderChips(); });
      });
    });
    search();
  }
  boot();
})();
