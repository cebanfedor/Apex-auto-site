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
  // ---- Фильтры, добавленные 05.11.2026 (Федор: «сделай 1в1 как у autopartner.by/korea», структурный
  // эталон в CLAUDE.md) — литералы сверены с реальной OpenAPI-спекой api.auctionsapi.com (не выдуманы),
  // backend (api/catalog.js) уже принимал эти query-параметры, просто в сайдбаре их не было.
  var AVAILABILITIES = [[1,"В наличии"],[2,"В пути"],[3,"Под заказ"]];
  var STEERING = [[1,"Левый руль"],[2,"Правый руль"]];
  var AIRBAGS = [[1,"Целые"],[2,"Сработавшие"],[3,"Отсутствуют"]];
  var SELLER_TYPES = [[1,"Частное лицо"],[2,"Дилер"]];
  var EMISSIONS = [[1,"Евро-1"],[2,"Евро-2"],[3,"Евро-3"],[4,"Евро-4"],[5,"Евро-5"],[6,"Евро-6"],[7,"ZEV (нулевые выбросы)"]];
  var SEATS_TABLE = [[2,"2"],[4,"4"],[5,"5"],[6,"6"],[7,"7"],[8,"8"],[10,"10"]];
  var DAMAGES = [
    [1,"Боковое повреждение"],[2,"Угон"],[3,"Пожар"],[4,"Электрические повреждения"],[5,"Вандализм"],
    [6,"Повреждение водой"],[7,"Повреждение крыши"],[8,"Повреждение трансмиссии"],[9,"Повреждение подвески"],
    [10,"Биологическая опасность"],[11,"Утилизация"],[12,"Изъятие"],[13,"Переворот"],[14,"Повреждения по всему кузову"],
    [15,"Повреждение двигателя"],[16,"Повреждение рамы"],[17,"Переднее повреждение"],[18,"Заднее повреждение"],
    [19,"Переднее и заднее повреждение"],[20,"Град"],[21,"Механические повреждения"],[22,"Мелкие вмятины и царапины"],
    [23,"Повреждение VIN"],[24,"Нормальный износ"],[25,"Отклонённый или частичный ремонт"],[26,"Повреждение штормом"],
    [27,"Разобран"],[28,"Повреждение днища"]
  ];

  // ---- Логотипы марок (05.11.2026, Федор: «значки на все марки», свои копии, см. CLAUDE.md) ----
  // 202 реальных логотипа марок, скачанные один раз в /assets/brand-logos/<slug>.webp (не хотлинк — своя копия,
  // решение Федора). Остальные ~390 марок нашего справочника (редкие/нишевые) логотипа не имеют — честный
  // буквенный аватар остаётся для них, не подменяем картинкой то, чего нет.
  var BRAND_LOGO_SLUGS = {abarth:1,ac:1,acura:1,aixam:1,alfaromeo:1,alpina:1,alpine:1,alvis:1,arcfox:1,ariel:1,aro:1,astonmartin:1,audi:1,austin:1,autobianchi:1,baic:1,bentley:1,bertone:1,bestune:1,bitter:1,bmw:1,borgward:1,bowler:1,brabus:1,brilliance:1,bufori:1,bugatti:1,buick:1,byd:1,cadillac:1,caterham:1,changan:1,changfeng:1,chery:1,chevrolet:1,chrysler:1,citroen:1,cizeta:1,dacia:1,daewoo:1,daf:1,daihatsu:1,daimler:1,datsun:1,dayun:1,delage:1,desoto:1,dodge:1,dongfeng:1,donkervoort:1,ds:1,duesenberg:1,eagle:1,exeed:1,faw:1,ferrari:1,fiat:1,fisker:1,ford:1,foton:1,fso:1,gac:1,gaz:1,geely:1,genesis:1,geo:1,ginetta:1,gmc:1,gonow:1,greatwall:1,grinnall:1,hafei:1,haima:1,haval:1,hawtai:1,hennessey:1,holden:1,honda:1,hongqi:1,horch:1,hudson:1,hummer:1,hyundai:1,infiniti:1,irankhodro:1,isuzu:1,iveco:1,jaguar:1,jbamotors:1,jeep:1,jetta:1,kia:1,koenigsegg:1,ktm:1,lagonda:1,lamborghini:1,lancia:1,landrover:1,landwind:1,lexus:1,lifan:1,ligier:1,lincoln:1,lister:1,lixiang:1,lotus:1,lucid:1,luxgen:1,lynkco:1,mahindra:1,man:1,marlin:1,maserati:1,mastretta:1,maxus:1,maybach:1,mazda:1,mclaren:1,mercedesbenz:1,mercury:1,merkur:1,mg:1,microcar:1,mini:1,mitsubishi:1,mitsuoka:1,morgan:1,nio:1,nissan:1,noble:1,oldsmobile:1,opel:1,packard:1,pagani:1,panoz:1,pegaso:1,perodua:1,peugeot:1,plymouth:1,polestar:1,pontiac:1,porsche:1,premier:1,proton:1,qoros:1,ram:1,rambler:1,renault:1,rezvani:1,rimac:1,rinspeed:1,rivian:1,roewe:1,rollsroyce:1,ronart:1,rover:1,saab:1,saipa:1,saturn:1,scania:1,scion:1,seat:1,simca:1,singulato:1,skoda:1,smart:1,soueast:1,spyker:1,ssangyong:1,studebaker:1,stutz:1,subaru:1,suzuki:1,talbot:1,tata:1,tatra:1,tesla:1,toyota:1,tramontana:1,triumph:1,tucker:1,tvr:1,uaz:1,ultima:1,vauxhall:1,venucia:1,vinfast:1,volkswagen:1,volvo:1,wanderer:1,wartburg:1,weltmeister:1,westfield:1,wey:1,wiesmann:1,wmotors:1,workhorse:1,xpeng:1,yulon:1,zaz:1,zenvo:1,zotye:1};
  function brandLogoHtml(name){
    var slug = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return BRAND_LOGO_SLUGS[slug] ? '<img src="/assets/brand-logos/' + slug + '.webp" alt="" loading="lazy">' : "";
  }

  var POPULAR_BRAND_NAMES = ["Hyundai","Kia","Genesis","Toyota","BMW","Mercedes-Benz","Audi","Volkswagen","Lexus","Chevrolet","Ford","Honda","Nissan","Porsche","Land Rover","Jeep"];

  // ---- Состояние ----
  var state = {
    brands:[],            // [{id,name,models:[{id,name,generations:[{id,name}]}]}]
    priceFrom:"", priceTo:"", currency:"krw",
    yearFrom:"", yearTo:"",
    odoFrom:"", odoTo:"",
    driveIds:[], transmission:"", bodyTypeIds:[], fuelIds:[], condIds:[],
    availIds:[], damageIds:[],
    keysAvail:"", steering:"", emissionIds:[], airbags:"", sellerType:"", mfgCert:"",
    hasInsp:"", isAuction:"", hasHist:"",
    colorIds:[],
    engineVolFrom:"", engineVolTo:"", powerFrom:"", powerTo:"", seats:"", isLeasing:"",
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
    // ⚠️ currency ВСЕГДА шлётся (даже дефолтный "krw"), а не только при отличии от "usd": эта же функция
    // строит и видимый URL, и реальный запрос к /api/catalog→upstream, у которого СВОЙ дефолт "usd" — без
    // явного krw сортировка по цене на upstream незаметно перескочила бы на доллары (05.11.2026, найдено
    // при проверке; activeGroupsCount ниже отдельно не даёт этому попасть в счётчик активных фильтров).
    if(state.currency !== "usd") p.set("currency", state.currency);
    if(state.yearFrom) p.set("year_from", state.yearFrom);
    if(state.yearTo) p.set("year_to", state.yearTo);
    if(state.odoFrom) p.set("odometer_from", state.odoFrom);
    if(state.odoTo) p.set("odometer_to", state.odoTo);
    if(state.driveIds.length) p.set("drive_wheel_id", state.driveIds.join(","));
    if(state.transmission) p.set("transmission", state.transmission);
    if(state.bodyTypeIds.length) p.set("body_type_id", state.bodyTypeIds.join(","));
    if(state.fuelIds.length) p.set("fuel_id", state.fuelIds.join(","));
    if(state.condIds.length) p.set("condition_id", state.condIds.join(","));
    if(state.availIds.length) p.set("availability_id", state.availIds.join(","));
    if(state.damageIds.length) p.set("damage_id", state.damageIds.join(","));
    if(state.keysAvail) p.set("keys_available", state.keysAvail);
    if(state.steering) p.set("steering_wheel_position", state.steering);
    if(state.emissionIds.length) p.set("emission_id", state.emissionIds.join(","));
    if(state.airbags) p.set("airbags", state.airbags);
    if(state.sellerType) p.set("seller_type", state.sellerType);
    if(state.mfgCert) p.set("manufacturer_certified", state.mfgCert);
    if(state.hasInsp) p.set("has_inspections", state.hasInsp);
    if(state.isAuction) p.set("is_auction", state.isAuction);
    if(state.hasHist) p.set("has_history_reports", state.hasHist);
    if(state.colorIds.length) p.set("color_id", state.colorIds.join(","));
    if(state.engineVolFrom) p.set("engine_volume_from", state.engineVolFrom);
    if(state.engineVolTo) p.set("engine_volume_to", state.engineVolTo);
    if(state.powerFrom) p.set("power_hp_from", state.powerFrom);
    if(state.powerTo) p.set("power_hp_to", state.powerTo);
    if(state.seats) p.set("seats", state.seats);
    if(state.isLeasing) p.set("is_leasing", state.isLeasing);
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
  function triOf(v){ return (v === "1" || v === "0") ? v : ""; } // «Все/Да/Нет» булевых фильтров (05.11.2026)

  function stateFromParams(p){
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
    state.driveIds = csvInts(p.get("drive_wheel_id"));
    state.transmission = [1,2].includes(parseInt(p.get("transmission"), 10)) ? p.get("transmission") : "";
    state.bodyTypeIds = csvInts(p.get("body_type_id"));
    state.fuelIds = csvInts(p.get("fuel_id"));
    state.condIds = csvInts(p.get("condition_id"));
    state.availIds = csvInts(p.get("availability_id"));
    state.damageIds = csvInts(p.get("damage_id"));
    state.keysAvail = triOf(p.get("keys_available"));
    state.steering = [1,2].includes(parseInt(p.get("steering_wheel_position"), 10)) ? p.get("steering_wheel_position") : "";
    state.emissionIds = csvInts(p.get("emission_id"));
    state.airbags = [1,2,3].includes(parseInt(p.get("airbags"), 10)) ? p.get("airbags") : "";
    state.sellerType = [1,2].includes(parseInt(p.get("seller_type"), 10)) ? p.get("seller_type") : "";
    state.mfgCert = triOf(p.get("manufacturer_certified"));
    state.hasInsp = triOf(p.get("has_inspections"));
    state.isAuction = triOf(p.get("is_auction"));
    state.hasHist = triOf(p.get("has_history_reports"));
    state.colorIds = csvInts(p.get("color_id"));
    state.engineVolFrom = clampInt(p.get("engine_volume_from"), 0, 999999999);
    state.engineVolTo = clampInt(p.get("engine_volume_to"), 0, 999999999);
    state.powerFrom = clampInt(p.get("power_hp_from"), 0, 100000);
    state.powerTo = clampInt(p.get("power_hp_to"), 0, 100000);
    state.seats = SEATS_TABLE.some(function(s){ return String(s[0]) === p.get("seats"); }) ? p.get("seats") : "";
    state.isLeasing = triOf(p.get("is_leasing"));
    var sortOk = ["newest","oldest","cheaper","expensive","odometer_asc","odometer_desc","year_asc","year_desc","auction_nearest"];
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
    if(state.brands.length) n++; // марки
    if(state.brands.some(function(b){ return (b.models||[]).length; })) n++; // модели
    if(state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); })) n++;
    if(state.priceFrom || state.priceTo) n++;
    if(state.currency !== "krw") n++; // 05.11.2026: "krw" — наш дефолт (не "usd"), раньше валюта всегда лишне считалась активным фильтром
    if(state.yearFrom || state.yearTo) n++;
    if(state.odoFrom || state.odoTo) n++;
    if(state.driveIds.length) n++;
    if(state.transmission) n++;
    if(state.bodyTypeIds.length) n++;
    if(state.fuelIds.length) n++;
    if(state.condIds.length) n++;
    if(state.availIds.length) n++;
    if(state.damageIds.length) n++;
    if(state.keysAvail) n++;
    if(state.steering) n++;
    if(state.emissionIds.length) n++;
    if(state.airbags) n++;
    if(state.sellerType) n++;
    if(state.mfgCert) n++;
    if(state.hasInsp) n++;
    if(state.isAuction) n++;
    if(state.hasHist) n++;
    if(state.colorIds.length) n++;
    if(state.engineVolFrom || state.engineVolTo) n++;
    if(state.powerFrom || state.powerTo) n++;
    if(state.seats) n++;
    if(state.isLeasing) n++;
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
    updateCrumbs();
    updateHeroHeading();
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

  // ---- Крошки + заголовок H1 листинга (05.11.2026, эталон autopartner.by/korea: «BMW - Авто из
  // Кореи» + крошки над заголовком; на нашей странице без фильтра — обычный статичный заголовок). ----
  function brandNameOf(b){
    var found = (dict.brands || []).find(function(x){ return x.id === b.id; });
    return found ? found.name : null;
  }
  function modelNameOf(b, m){
    var found = (dict.modelsByBrand[b.id] || []).find(function(x){ return x.id === m.id; });
    return found ? found.name : null;
  }
  function updateCrumbs(){
    var el = document.getElementById("catListCrumbsV1");
    if(!el) return;
    var b = state.brands[0];
    var bName = b ? brandNameOf(b) : null;
    var parts = ['<a href="/">' + esc(T("Главная")) + '</a>'];
    if(b && bName){
      parts.push('<a href="/catalog">' + esc(T("Каталог Encar")) + '</a>');
      var m = (b.models || [])[0];
      var mName = m ? modelNameOf(b, m) : null;
      if(m && mName){
        var bp = new URLSearchParams(); bp.set("brand_id", b.id);
        parts.push('<a href="/catalog?' + bp.toString() + '" data-no-i18n="true">' + esc(bName) + '</a>');
        parts.push('<span data-no-i18n="true">' + esc(mName) + '</span>');
      } else {
        parts.push('<span data-no-i18n="true">' + esc(bName) + '</span>');
      }
    } else {
      parts.push('<span>' + esc(T("Каталог Encar")) + '</span>');
    }
    el.innerHTML = parts.join('<i class="catListCrumbSepV1" aria-hidden="true">›</i>');
  }

  function updateHeroHeading(){
    var h1 = document.querySelector(".catalogTopV1 h1");
    if(!h1) return;
    var b = state.brands[0];
    var bName = b ? brandNameOf(b) : null;
    if(b && bName){
      var m = (b.models || [])[0];
      var mName = m ? modelNameOf(b, m) : null;
      h1.setAttribute("data-no-i18n", "true");
      h1.textContent = bName + (mName ? " " + mName : "") + " — " + T("Авто из Кореи");
    } else {
      h1.removeAttribute("data-no-i18n");
      h1.textContent = T("Каталог авто из Кореи");
    }
  }
  window._catalogRerenderHeading = function(){ updateCrumbs(); updateHeroHeading(); };

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
    // 05.11.2026 (Федор: «всегда грузить оригиналы»): `original` — ссылка источника на исходное фото (не наша
    // пересжатая копия), `downloaded`/`preview` — запасные варианты по спеке ListingImage, если оригинала нет.
    return img.original || img.downloaded || img.preview || "";
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
  // 05.11.2026 (эталон autopartner.by/korea, CLAUDE.md): карточка листинга у них — РОВНО 4 факта
  // (пробег/объём/КПП/топливо), не 7 — порядок полей ниже подобран так, что .slice(0,4) даёт именно их.
  function specsOf(car, listing){
    var out = [];
    if(listing && listing.odometer != null) out.push({t:"odo", v:fmtNum(listing.odometer) + " " + T("км")});
    // Электро: engine_volume в фиде — НЕ объём двигателя (120/111/202/1... бессмысленно как см³/1000, проверено 04.11.2026) — не показываем.
    if(car.engine_volume && !(car.fuel && car.fuel.id === 2)) out.push({t:"engine", v:(car.engine_volume / 1000).toFixed(1).replace(/\.0$/, "") + " " + T("л")});
    if(car.transmission && car.transmission.name) out.push({t:"trans", v:T(transLabel(car.transmission.id))});
    if(car.fuel && car.fuel.name) out.push({t:"fuel", v:T(fuelLabel(car.fuel.id))});
    if(car.power_hp) out.push({t:"power", v:car.power_hp + " " + T("л.с.")});
    if(car.drive_wheels && car.drive_wheels.name) out.push({t:"drive", v:T(driveLabel(car.drive_wheels.id))});
    if(car.body_type && car.body_type.name) out.push({t:"body", v:T(bodyLabel(car.body_type.id))});
    return out.slice(0, 4);
  }
  var SPEC_ICONS = {
    odo: '<svg viewBox="0 0 20 20" fill="none"><path d="M3.5 13.5a6.5 6.5 0 1 1 13 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M10 13.5l3-4.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="13.5" r="1" fill="currentColor"/></svg>',
    fuel: '<svg viewBox="0 0 20 20" fill="none"><rect x="4" y="4" width="7.5" height="12" rx="1.1" stroke="currentColor" stroke-width="1.5"/><path d="M11.5 8.3h1.6c.66 0 1.2.53 1.2 1.2V13.6a1 1 0 0 0 2 0v-3.9l-1.9-1.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.8 7h3.9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    trans: '<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.8" stroke="currentColor" stroke-width="1.5"/><path d="M10 3.3v2M10 14.7v2M3.3 10h2M14.7 10h2M5.4 5.4l1.4 1.4M13.2 13.2l1.4 1.4M5.4 14.6l1.4-1.4M13.2 6.8l1.4-1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    engine: '<svg viewBox="0 0 20 20" fill="none"><rect x="3.3" y="8" width="8.4" height="5.8" rx="1" stroke="currentColor" stroke-width="1.5"/><path d="M11.7 10h2.1c.66 0 1.2.53 1.2 1.2v2.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M5.8 8V5.6h2.8V8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    power: '<svg viewBox="0 0 20 20" fill="none"><path d="M11 3L5 12h3.7l-.9 5L14 8h-3.7l.7-5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
    drive: '<svg viewBox="0 0 20 20" fill="none"><circle cx="5.2" cy="5.2" r="1.5" fill="currentColor"/><circle cx="14.8" cy="5.2" r="1.5" fill="currentColor"/><circle cx="5.2" cy="14.8" r="1.5" fill="currentColor"/><circle cx="14.8" cy="14.8" r="1.5" fill="currentColor"/><path d="M5.2 5.2v9.6M14.8 5.2v9.6M5.2 10h9.6" stroke="currentColor" stroke-width="1.2"/></svg>',
    body: '<svg viewBox="0 0 20 20" fill="none"><path d="M3 13.3V11l1.5-3a2 2 0 0 1 1.8-1.2h7.4a2 2 0 0 1 1.8 1.2l1.5 3v2.3" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="6.3" cy="13.3" r="1.25" stroke="currentColor" stroke-width="1.3"/><circle cx="13.7" cy="13.3" r="1.25" stroke="currentColor" stroke-width="1.3"/></svg>'
  };
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
    var specs = specsOf(car, listing).map(function(s){ return '<span><i class="catSpecIcoV1">' + (SPEC_ICONS[s.t] || "") + '</i>' + esc(s.v) + '</span>'; }).join("");
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
        + (car.vin ? '<div class="catCardVinV1" data-no-i18n="true">VIN ' + esc(String(car.vin).toUpperCase()) + '</div>' : "")
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
    state.driveIds.forEach(function(id){ chip(T(driveLabel(id)), function(){ state.driveIds = state.driveIds.filter(function(x){ return x !== id; }); }); });
    if(state.transmission) chip(T(transLabel(parseInt(state.transmission, 10))), function(){ state.transmission = ""; });
    state.bodyTypeIds.forEach(function(id){ chip(T(bodyLabel(id)), function(){ state.bodyTypeIds = state.bodyTypeIds.filter(function(x){ return x !== id; }); }); });
    state.fuelIds.forEach(function(id){ chip(T(fuelLabel(id)), function(){ state.fuelIds = state.fuelIds.filter(function(x){ return x !== id; }); }); });
    state.condIds.forEach(function(id){ var r = CONDITIONS.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.condIds = state.condIds.filter(function(x){ return x !== id; }); }); });
    state.availIds.forEach(function(id){ var r = AVAILABILITIES.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.availIds = state.availIds.filter(function(x){ return x !== id; }); }); });
    state.damageIds.forEach(function(id){ var r = DAMAGES.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.damageIds = state.damageIds.filter(function(x){ return x !== id; }); }); });
    if(state.keysAvail) chip(T("Ключи") + ": " + T(state.keysAvail === "1" ? "Есть" : "Нет"), function(){ state.keysAvail = ""; });
    if(state.steering) chip(T(STEERING.find(function(x){ return String(x[0]) === state.steering; })[1]), function(){ state.steering = ""; });
    state.emissionIds.forEach(function(id){ var r = EMISSIONS.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.emissionIds = state.emissionIds.filter(function(x){ return x !== id; }); }); });
    if(state.airbags) chip(T(AIRBAGS.find(function(x){ return String(x[0]) === state.airbags; })[1]), function(){ state.airbags = ""; });
    if(state.sellerType) chip(T(SELLER_TYPES.find(function(x){ return String(x[0]) === state.sellerType; })[1]), function(){ state.sellerType = ""; });
    if(state.mfgCert) chip(T("Сертифицированный продавец") + ": " + T(state.mfgCert === "1" ? "Да" : "Нет"), function(){ state.mfgCert = ""; });
    if(state.hasInsp) chip(T("Есть отчёт об инспекции") + ": " + T(state.hasInsp === "1" ? "Да" : "Нет"), function(){ state.hasInsp = ""; });
    if(state.isAuction) chip(T("Аукцион") + ": " + T(state.isAuction === "1" ? "Да" : "Нет"), function(){ state.isAuction = ""; });
    if(state.hasHist) chip(T("История автомобиля") + ": " + T(state.hasHist === "1" ? "Да" : "Нет"), function(){ state.hasHist = ""; });
    state.colorIds.forEach(function(id){ var r = COLORS.find(function(x){ return x[0] === id; }); chip(T(r ? r[1] : ""), function(){ state.colorIds = state.colorIds.filter(function(x){ return x !== id; }); }); });
    if(state.engineVolFrom) chip(T("Объём от") + " " + fmtNum(state.engineVolFrom) + " " + T("см³"), function(){ state.engineVolFrom = ""; });
    if(state.engineVolTo) chip(T("Объём до") + " " + fmtNum(state.engineVolTo) + " " + T("см³"), function(){ state.engineVolTo = ""; });
    if(state.powerFrom) chip(T("Мощность от") + " " + fmtNum(state.powerFrom) + " " + T("л.с."), function(){ state.powerFrom = ""; });
    if(state.powerTo) chip(T("Мощность до") + " " + fmtNum(state.powerTo) + " " + T("л.с."), function(){ state.powerTo = ""; });
    if(state.seats) chip(T("Мест") + ": " + state.seats, function(){ state.seats = ""; });
    if(state.isLeasing) chip(T("Только лизинг"), function(){ state.isLeasing = ""; });

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
    state.brands = [];
    state.priceFrom = ""; state.priceTo = ""; state.currency = "krw";
    state.yearFrom = ""; state.yearTo = ""; state.odoFrom = ""; state.odoTo = "";
    state.driveIds = []; state.transmission = ""; state.bodyTypeIds = []; state.fuelIds = []; state.condIds = [];
    state.availIds = []; state.damageIds = [];
    state.keysAvail = ""; state.steering = ""; state.emissionIds = []; state.airbags = ""; state.sellerType = ""; state.mfgCert = "";
    state.hasInsp = ""; state.isAuction = ""; state.hasHist = "";
    state.colorIds = [];
    state.engineVolFrom = ""; state.engineVolTo = ""; state.powerFrom = ""; state.powerTo = ""; state.seats = ""; state.isLeasing = "";
    state.sort = "newest"; state.page = 1;
    renderSidebarAll();
    scheduleSearch(true);
  }

  // ========== Сайдбар: словари и рендер ==========
  function ensureBrands(){
    if(dict.brands) return Promise.resolve(dict.brands);
    return fetch("/api/catalog?action=brands&lang=" + encodeURIComponent(window.APEX_LANG || "ru"))
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
        + '<span class="catAvatarV1">' + (brandLogoHtml(b.name) || esc((b.name || "?").slice(0, 1))) + '</span>'
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
        + '<div class="catBlockHeadV1"><span class="catAvatarV1">' + (brandLogoHtml(bInfo && bInfo.name) || esc((bInfo ? bInfo.name : "?").slice(0, 1))) + '</span><b data-no-i18n="true">' + esc(bInfo ? bInfo.name : ("ID " + b.id)) + '</b></div>'
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

  // «Все/Да/Нет» — для булевых фильтров (05.11.2026, эталон autopartner.by/korea): клик по уже активной
  // пилюле снимает выбор, как и у остальных single-select пилюль этого каталога (transmission и т.п.) —
  // отдельная кнопка «Все» не нужна, тот же интерактивный паттерн, что уже в коде.
  function renderBoolPills(containerId, stateKey, yesLabel, noLabel){
    var el = document.getElementById(containerId);
    if(!el) return;
    var table = [["1", yesLabel || "Да"], ["0", noLabel || "Нет"]];
    el.innerHTML = table.map(function(row){
      var on = state[stateKey] === row[0];
      return '<button type="button" class="catPillV1' + (on ? " isOnV1" : "") + '" data-val="' + row[0] + '" data-no-i18n="true">' + esc(T(row[1])) + '</button>';
    }).join("");
    el.querySelectorAll("[data-val]").forEach(function(btn){
      btn.addEventListener("click", function(){
        var v = btn.getAttribute("data-val");
        state[stateKey] = state[stateKey] === v ? "" : v;
        renderSidebarAll();
        scheduleSearch(true);
      });
    });
  }

  function renderSidebarAll(){
    renderMakeList();
    renderModelSection();
    renderGenSection();
    renderPills("catDrivePillsV1", DRIVE_WHEELS, state.driveIds, function(v){ toggleIn(state.driveIds, v); });
    renderPills("catTransPillsV1", TRANSMISSIONS, state.transmission ? [parseInt(state.transmission, 10)] : [], function(v){
      state.transmission = state.transmission === String(v) ? "" : String(v);
    });
    renderPills("catBodyPillsV1", BODY_TYPES, state.bodyTypeIds, function(v){ toggleIn(state.bodyTypeIds, v); });
    renderPills("catFuelPillsV1", FUELS, state.fuelIds, function(v){ toggleIn(state.fuelIds, v); });
    renderPills("catCondPillsV1", CONDITIONS, state.condIds, function(v){ toggleIn(state.condIds, v); });
    renderPills("catAvailPillsV1", AVAILABILITIES, state.availIds, function(v){ toggleIn(state.availIds, v); });
    renderPills("catDamagePillsV1", DAMAGES, state.damageIds, function(v){ toggleIn(state.damageIds, v); });
    renderBoolPills("catKeysPillsV1", "keysAvail", "Есть", "Нет");
    renderPills("catSteeringPillsV1", STEERING, state.steering ? [parseInt(state.steering, 10)] : [], function(v){
      state.steering = state.steering === String(v) ? "" : String(v);
    });
    renderPills("catEmissionPillsV1", EMISSIONS, state.emissionIds, function(v){ toggleIn(state.emissionIds, v); });
    renderPills("catAirbagsPillsV1", AIRBAGS, state.airbags ? [parseInt(state.airbags, 10)] : [], function(v){
      state.airbags = state.airbags === String(v) ? "" : String(v);
    });
    renderPills("catSellerPillsV1", SELLER_TYPES, state.sellerType ? [parseInt(state.sellerType, 10)] : [], function(v){
      state.sellerType = state.sellerType === String(v) ? "" : String(v);
    });
    renderBoolPills("catMfgCertPillsV1", "mfgCert", "Да", "Нет");
    renderBoolPills("catHasInspPillsV1", "hasInsp", "Да", "Нет");
    renderBoolPills("catIsAuctionPillsV1", "isAuction", "Да", "Нет");
    renderBoolPills("catHasHistPillsV1", "hasHist", "Да", "Нет");
    renderColorSwatches();
    renderPills("catSeatsPillsV1", SEATS_TABLE, state.seats ? [parseInt(state.seats, 10)] : [], function(v){
      state.seats = state.seats === String(v) ? "" : String(v);
    });
    renderBoolPills("catLeasingPillsV1", "isLeasing", "Только лизинг", "Без лизинга");
    renderSidebarState();
  }

  function renderSidebarState(){
    // Подставляем значения текстовых полей и переключателей из state (после Back/Forward/reset).
    setVal("catPriceFromV1", state.priceFrom); setVal("catPriceToV1", state.priceTo);
    setVal("catCurrencyV1", state.currency);
    setVal("catYearFromV1", state.yearFrom); setVal("catYearToV1", state.yearTo);
    setVal("catOdoFromV1", state.odoFrom); setVal("catOdoToV1", state.odoTo);
    setVal("catEngineVolFromV1", state.engineVolFrom); setVal("catEngineVolToV1", state.engineVolTo);
    setVal("catPowerFromV1", state.powerFrom); setVal("catPowerToV1", state.powerTo);
    setVal("catSortSelV1", state.sort);
    // «точка» активности у разделов
    document.querySelectorAll(".catSecV1").forEach(function(sec){
      var key = sec.getAttribute("data-sec");
      var active = false;
      if(key === "vehicle") active = !!state.brands.length;
      if(key === "model") active = state.brands.some(function(b){ return (b.models||[]).length; });
      if(key === "generation") active = state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); });
      if(key === "price") active = !!(state.priceFrom || state.priceTo);
      if(key === "year") active = !!(state.yearFrom || state.yearTo);
      if(key === "mileage") active = !!(state.odoFrom || state.odoTo);
      if(key === "drive") active = !!state.driveIds.length;
      if(key === "transmission") active = !!state.transmission;
      if(key === "body") active = !!state.bodyTypeIds.length;
      if(key === "fuel") active = !!state.fuelIds.length;
      if(key === "condition") active = !!state.condIds.length;
      if(key === "availability") active = !!state.availIds.length;
      if(key === "damage") active = !!state.damageIds.length;
      if(key === "keys") active = !!state.keysAvail;
      if(key === "steering") active = !!state.steering;
      if(key === "emission") active = !!state.emissionIds.length;
      if(key === "airbags") active = !!state.airbags;
      if(key === "sellertype") active = !!state.sellerType;
      if(key === "mfgcert") active = !!state.mfgCert;
      if(key === "hasinsp") active = !!state.hasInsp;
      if(key === "isauction") active = !!state.isAuction;
      if(key === "hashist") active = !!state.hasHist;
      if(key === "color") active = !!state.colorIds.length;
      if(key === "enginevol") active = !!(state.engineVolFrom || state.engineVolTo);
      if(key === "power") active = !!(state.powerFrom || state.powerTo);
      if(key === "seats") active = !!state.seats;
      if(key === "leasing") active = !!state.isLeasing;
      sec.classList.toggle("isActiveV1", active);
    });
  }
  function setVal(id, v){ var el = document.getElementById(id); if(el) el.value = v || (id === "catCurrencyV1" ? "krw" : ""); }

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
  onText("catEngineVolFromV1", function(v){ state.engineVolFrom = v; });
  onText("catEngineVolToV1", function(v){ state.engineVolTo = v; });
  onText("catPowerFromV1", function(v){ state.powerFrom = v; });
  onText("catPowerToV1", function(v){ state.powerTo = v; });
  var curSel = document.getElementById("catCurrencyV1");
  if(curSel) curSel.addEventListener("change", function(){ state.currency = curSel.value; scheduleSearch(true); });
  var sortSel = document.getElementById("catSortSelV1");
  if(sortSel) sortSel.addEventListener("change", function(){ state.sort = sortSel.value; scheduleSearch(true); });

  // ---- Переключатель вида (сетка/список) — чисто визуальный, те же карточки (CSS), без новых запросов ----
  var viewToggle = document.getElementById("catViewToggleV1");
  function applyView(v){
    grid.classList.toggle("isListV1", v === "list");
    if(viewToggle) viewToggle.querySelectorAll("[data-view]").forEach(function(b){
      var on = b.getAttribute("data-view") === v;
      b.classList.toggle("isOnV1", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
    try{ localStorage.setItem("apexCatalogViewV1", v); }catch(e){}
  }
  if(viewToggle) viewToggle.addEventListener("click", function(e){
    var b = e.target.closest("[data-view]");
    if(!b) return;
    applyView(b.getAttribute("data-view"));
  });
  try{ var savedView = localStorage.getItem("apexCatalogViewV1"); if(savedView === "list") applyView("list"); }catch(e){}
  var makeSearch = document.getElementById("catMakeSearchV1");
  if(makeSearch) makeSearch.addEventListener("input", debounce(function(){ makeSearchQuery = makeSearch.value; renderMakeList(); }, 150));
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
    updateCrumbs();
    updateHeroHeading();
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
        Promise.all(genPromises).then(function(){ renderSidebarAll(); renderChips(); updateCrumbs(); updateHeroHeading(); });
      });
    });
    updateCrumbs();
    updateHeroHeading();
    search();
  }
  boot();
})();
