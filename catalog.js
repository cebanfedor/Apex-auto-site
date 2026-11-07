/* /catalog — каталог авто из Кореи (Encar, api.auctionsapi.com).
   05.11.2026: разметка и классы 1:1 с эталоном dev.autopartner.by/korea (Федор: «просто скопировать
   другой сайт»). Эталон собран на Alpine.js + Tailwind; у нас CSP без unsafe-eval, поэтому всё
   поведение (аккордеон фильтров, двойные слайдеры, пилюли, скраб фото карточек, сортировка-меню,
   мобильная шторка, пагинация) — vanilla JS ниже, а CSS собран из их бандла (catalog-ref.css,
   scripts/build-catalog-css.js) и перекрашен в наш красный. Слой данных/URL/API — наш прежний
   (api/catalog.js). Страница авто — catalog-car.html/js. */
(function(){
  "use strict";

  var grid = document.getElementById("catGridV1");
  if(!grid) return;

  // Источник по странице (06.11.2026): /korea — Encar (Корея), /canada — OpenLane (Канада). Разметка /canada — canada.html
  // (собирается scripts/build-canada-pages.js из catalog.html), движок общий, запросы к API с src=ca.
  var CA = !!document.querySelector('main[data-cat-src="ca"]');
  // Канада по умолчанию — «Ближайшие аукционы» (Федор 06.11.2026: машины с прошедшими торгами неинтересны)
  var DEF_SORT = CA ? "auction_nearest" : "newest";
  var BASE = CA ? "/canada" : "/korea";
  var API = "/api/catalog?" + (CA ? "src=ca&" : "");
  var PAGE_NAME = CA ? "Авто из Канады" : "Авто из Кореи";

  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function fmtNum(n){ return Number(n || 0).toLocaleString("ru-RU").replace(/ /g, " "); }
  function uiLang(){ return window.APEX_LANG || "ru"; }

  // ---- Литеральные таблицы значений (сверены с OpenAPI-спекой api.auctionsapi.com) ----
  var BODY_TYPES = [[1,"Седан"],[2,"Универсал"],[3,"Купе"],[4,"Пикап"],[5,"Внедорожник"],[6,"Кабриолет"],[7,"Фургон"],[11,"Хэтчбек"],[12,"Родстер"],[13,"Лимузин"],[20,"Лифтбек"],[22,"Катафалк"],[27,"Спорткар"]];
  var FUELS = [[1,"Дизель"],[2,"Электро"],[3,"Гибрид"],[4,"Бензин"],[5,"Газ"],[6,"Гибкое топливо"],[7,"Водород"],[8,"Этанол"]];
  var TRANSMISSIONS = [[1,"АКПП"],[2,"МКПП"]];
  var DRIVE_WHEELS = [[1,"Задний"],[2,"Передний"],[3,"Полный"]];
  var CONDITIONS = [[1,"С пробегом","cf-pill--slate"],[2,"Новый","cf-pill--green"],[3,"Повреждён","cf-pill--rose"]];
  var COLORS = [
    [1,"Серебристый","#c0c4c9"],[2,"Пурпурный","#7c3aed"],[3,"Оранжевый","#f59e0b"],[4,"Зелёный","#20b26b"],
    [5,"Красный","#c24135"],[6,"Золотой","#d7a61d"],[8,"Коричневый","#8b552d"],[9,"Серый","#9ca3af"],
    [10,"Бирюзовый","#31c7c7"],[11,"Синий","#2d86c9"],[12,"Бронзовый","#b77d37"],[13,"Белый","#ffffff"],
    [14,"Кремовый","#fff7d8"],[15,"Черный","#111111"],[16,"Жёлтый","#f7ea13"],[17,"Бежевый","#f1e7ce"],[18,"Розовый","#ee94bf"]
  ];
  var AVAILABILITIES = [[1,"В наличии"],[2,"В пути"],[3,"Под заказ"]];
  var STEERING = [[1,"Левый руль"],[2,"Правый руль"]];
  var AIRBAGS = [[1,"Целые"],[2,"Сработавшие"],[3,"Отсутствуют"]];
  var SELLER_TYPES = [[1,"Частное лицо"],[2,"Дилер"]];
  var EMISSIONS = [[1,"Евро-1"],[2,"Евро-2"],[3,"Евро-3"],[4,"Евро-4"],[5,"Евро-5"],[6,"Евро-6"],[7,"ZEV"]];
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
  var SORTS = [["newest","Сначала новые"],["oldest","Сначала старые"],["cheaper","Сначала дешевые"],["expensive","Сначала дорогие"],["odometer_asc","Пробег: по возрастанию"],["odometer_desc","Пробег: по убыванию"],["year_asc","Год: по возрастанию"],["year_desc","Год: по убыванию"],["auction_nearest","Ближайшие аукционы"]];

  // Логотипы марок (202 реальных, свои копии в /assets/brand-logos/<slug>.webp, см. CLAUDE.md).
  var BRAND_LOGO_SLUGS = {abarth:1,ac:1,acura:1,aixam:1,alfaromeo:1,alpina:1,alpine:1,alvis:1,arcfox:1,ariel:1,aro:1,astonmartin:1,audi:1,austin:1,autobianchi:1,baic:1,bentley:1,bertone:1,bestune:1,bitter:1,bmw:1,borgward:1,bowler:1,brabus:1,brilliance:1,bufori:1,bugatti:1,buick:1,byd:1,cadillac:1,caterham:1,changan:1,changfeng:1,chery:1,chevrolet:1,chrysler:1,citroen:1,cizeta:1,dacia:1,daewoo:1,daf:1,daihatsu:1,daimler:1,datsun:1,dayun:1,delage:1,desoto:1,dodge:1,dongfeng:1,donkervoort:1,ds:1,duesenberg:1,eagle:1,exeed:1,faw:1,ferrari:1,fiat:1,fisker:1,ford:1,foton:1,fso:1,gac:1,gaz:1,geely:1,genesis:1,geo:1,ginetta:1,gmc:1,gonow:1,greatwall:1,grinnall:1,hafei:1,haima:1,haval:1,hawtai:1,hennessey:1,holden:1,honda:1,hongqi:1,horch:1,hudson:1,hummer:1,hyundai:1,infiniti:1,irankhodro:1,isuzu:1,iveco:1,jaguar:1,jbamotors:1,jeep:1,jetta:1,kia:1,koenigsegg:1,ktm:1,lagonda:1,lamborghini:1,lancia:1,landrover:1,landwind:1,lexus:1,lifan:1,ligier:1,lincoln:1,lister:1,lixiang:1,lotus:1,lucid:1,luxgen:1,lynkco:1,mahindra:1,man:1,marlin:1,maserati:1,mastretta:1,maxus:1,maybach:1,mazda:1,mclaren:1,mercedesbenz:1,mercury:1,merkur:1,mg:1,microcar:1,mini:1,mitsubishi:1,mitsuoka:1,morgan:1,nio:1,nissan:1,noble:1,oldsmobile:1,opel:1,packard:1,pagani:1,panoz:1,pegaso:1,perodua:1,peugeot:1,plymouth:1,polestar:1,pontiac:1,porsche:1,premier:1,proton:1,qoros:1,ram:1,rambler:1,renault:1,rezvani:1,rimac:1,rinspeed:1,rivian:1,roewe:1,rollsroyce:1,ronart:1,rover:1,saab:1,saipa:1,saturn:1,scania:1,scion:1,seat:1,simca:1,singulato:1,skoda:1,smart:1,soueast:1,spyker:1,ssangyong:1,studebaker:1,stutz:1,subaru:1,suzuki:1,talbot:1,tata:1,tatra:1,tesla:1,toyota:1,tramontana:1,triumph:1,tucker:1,tvr:1,uaz:1,ultima:1,vauxhall:1,venucia:1,vinfast:1,volkswagen:1,volvo:1,wanderer:1,wartburg:1,weltmeister:1,westfield:1,wey:1,wiesmann:1,wmotors:1,workhorse:1,xpeng:1,yulon:1,zaz:1,zenvo:1,zotye:1};
  function logoHtml(name, cls){
    var slug = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if(BRAND_LOGO_SLUGS[slug]) return '<img src="/assets/brand-logos/' + slug + '.webp" alt="" width="24" height="18" loading="lazy" decoding="async" class="' + (cls || "cf-logo") + '">';
    return '<span class="' + (cls || "cf-logo") + ' cf-logo--letter" aria-hidden="true">' + esc(String(name || "?").slice(0, 1).toUpperCase()) + '</span>';
  }

  // ---- SVG-иконки (из разметки эталона) ----
  var I = {
    chev: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    x: '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    search: '<svg class="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    check: '<span class="cf-check" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.6 6.3 4.9 8.6 9.4 3.6" pathLength="1"/></svg></span>',
    tick: '<svg class="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    odo: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 11l3-3M3.3 17a10 10 0 1 1 17.4 0"/></svg>',
    engine: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10v6M12 5v3M10 5h4M5 13H3M6 10h2l2-2h3.4a1 1 0 0 1 .9.6l1.4 2.8a1 1 0 0 0 .9.6H18V10h2a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2v-2h-3v2a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-.8-.4L8 16H6z"/></svg>',
    trans: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v16M18 4v6M6 12h12M18 14v6"/></svg>',
    fuel: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M3 22h12M7 9h4M15 9h2.5a1.5 1.5 0 0 1 1.5 1.5V17a2 2 0 0 0 4 0V8l-3-3"/></svg>',
    body: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14M4 13.5 5.6 8.6A2 2 0 0 1 7.5 7.2h9a2 2 0 0 1 1.9 1.4l1.6 4.9V17H4z"/></svg>',
    drive: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h14M5 17h14M7 7v10M17 7v10"/></svg>',
    seats: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 18v-6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6M5 18h14M9 10V5h6v5"/></svg>',
    key: '<svg class="h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7z"/></svg>',
    shield: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>',
    clock: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"/></svg>',
    copy: '<svg class="vcard__copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
    photos: '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="7" width="14" height="14" rx="2"/><path d="M3 17V5a2 2 0 0 1 2-2h12M10 17l3-3 3 3 2-2 3 3"/></svg>',
    prev: '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 17-5-5 5-5"/></svg>',
    next: '<svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9.5 17 5-5-5-5"/></svg>',
    arrL: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    arrR: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    chevL: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    chevR: '<svg class="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
    home: '<svg class="h-[15px] w-[15px]" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5h-6V20H5a1 1 0 0 1-1-1z"/></svg>',
    crumbSep: '<svg class="crumb-sep" aria-hidden="true" fill="none" viewBox="0 0 6 10"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="m1 9 4-4-4-4"/></svg>',
    driveRear: '<svg class="cf-pill__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3.5 14.5v4M20.5 14.5v4M3.5 16.5h17"/></svg>',
    driveFront: '<svg class="cf-pill__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3.5 5.5v4M20.5 5.5v4M3.5 7.5h17"/></svg>',
    driveAll: '<svg class="cf-pill__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3.5 5.5v4M20.5 5.5v4M3.5 7.5h17M3.5 14.5v4M20.5 14.5v4M3.5 16.5h17"/></svg>',
    transA: '<svg class="cf-pill__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 16l3-8 3 8M10.2 13.5h3.6"/></svg>',
    transM: '<svg class="cf-pill__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 16V8l4 5 4-5v8"/></svg>'
  };
  var DRIVE_ICONS = {1:I.driveRear, 2:I.driveFront, 3:I.driveAll};
  var TRANS_ICONS = {1:I.transA, 2:I.transM};

  // ---- Состояние ----
  var state = {
    brands:[],
    priceFrom:"", priceTo:"", currency:"usd",
    yearFrom:"", yearTo:"",
    odoFrom:"", odoTo:"",
    driveIds:[], transmission:"", bodyTypeIds:[], fuelIds:[], condIds:[],
    availIds:[], damageIds:[],
    keysAvail:"", steering:"", emissionIds:[], airbags:"", sellerType:"", mfgCert:"",
    hasInsp:"", isAuction:"", hasHist:"",
    colorIds:[],
    engineVolFrom:"", engineVolTo:"", powerFrom:"", powerTo:"", seats:"", isLeasing:"",
    sort:DEF_SORT, page:1
  };
  var PER_PAGE = 24;
  var dict = {brands:null, modelsByBrand:{}, gensByModel:{}};
  var reqToken = 0, abortCtrl = null, lastUrlPushAt = 0, lastTotal = null;

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
    if(state.sort !== DEF_SORT) p.set("sort", state.sort);
    if(state.page > 1) p.set("page", String(state.page));
    return p;
  }
  function clampInt(v, lo, hi){ var n = parseInt(v, 10); if(!isFinite(n)) return ""; return String(Math.min(hi, Math.max(lo, n))); }
  function csvInts(v){ return String(v || "").split(",").map(function(s){ return parseInt(s, 10); }).filter(isFinite); }
  function triOf(v){ return (v === "1" || v === "0") ? v : ""; }
  function stateFromParams(p){
    var vs = p.get("vehicle_selection");
    if(vs){
      try{ var parsed = JSON.parse(vs); if(Array.isArray(parsed.brands)) state.brands = parsed.brands; }catch(e){ state.brands = []; }
    }else{
      var brandIds = csvInts(p.get("brand_id")), modelPairs = {};
      String(p.get("model_id") || "").split(",").forEach(function(pair){
        var parts = pair.split(":"), b = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
        if(isFinite(b) && isFinite(m)){ (modelPairs[b] = modelPairs[b] || []).push(m); }
      });
      state.brands = brandIds.map(function(id){ return {id:id, models:(modelPairs[id] || []).map(function(mid){ return {id:mid}; })}; });
    }
    state.priceFrom = clampInt(p.get("price_from"), 0, 1e15);
    state.priceTo = clampInt(p.get("price_to"), 1, 1e15);
    state.currency = /^[a-z]{3}$/.test(p.get("currency") || "") ? p.get("currency").toLowerCase() : "usd";
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
    state.seats = /^\d{1,2}$/.test(p.get("seats") || "") ? p.get("seats") : "";
    state.isLeasing = triOf(p.get("is_leasing"));
    state.sort = SORTS.some(function(s){ return s[0] === p.get("sort"); }) ? p.get("sort") : DEF_SORT;
    state.page = Math.max(1, parseInt(p.get("page"), 10) || 1);
  }
  function pushUrl(){
    var p = stateToParams(), url = location.pathname + (p.toString() ? "?" + p.toString() : ""), now = Date.now();
    if(now - lastUrlPushAt < 1500) history.replaceState(null, "", url); else history.pushState(null, "", url);
    lastUrlPushAt = now;
  }
  function pushUrlForce(){ var p = stateToParams(); history.pushState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : "")); lastUrlPushAt = 0; }

  function activeGroupsCount(){
    var n = 0;
    if(state.brands.length) n++;
    if(state.brands.some(function(b){ return (b.models||[]).length; })) n++;
    if(state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); })) n++;
    if(state.priceFrom || state.priceTo) n++;
    if(state.yearFrom || state.yearTo) n++;
    if(state.odoFrom || state.odoTo) n++;
    [state.driveIds, state.bodyTypeIds, state.fuelIds, state.condIds, state.availIds, state.damageIds, state.emissionIds, state.colorIds].forEach(function(a){ if(a.length) n++; });
    [state.transmission, state.keysAvail, state.steering, state.airbags, state.sellerType, state.mfgCert, state.hasInsp, state.isAuction, state.hasHist, state.seats, state.isLeasing].forEach(function(v){ if(v) n++; });
    if(state.engineVolFrom || state.engineVolTo) n++;
    if(state.powerFrom || state.powerTo) n++;
    return n;
  }

  // ---- Курс USD→KRW для показа цен в $ (эталон показывает цену в долларах; Encar отдаёт KRW) ----
  var rates = {usdKrw:0, usdEur:0, usdCad:0};
  // Курс отдаёт наш сервер (/api/catalog?action=rates): прямые запросы браузера к сервисам курсов режут CORS/лимиты.
  function fetchRates(){
    return fetch("/api/catalog?action=rates").then(function(r){ return r.json(); })
      .then(function(d){ return d && d.ok && d.usdKrw ? {rates:{KRW:d.usdKrw, EUR:d.usdEur, CAD:d.usdCad || 0}} : null; });
  }
  function loadRates(){
    try{
      var c = JSON.parse(localStorage.getItem("apexKrwRateV4") || "null");
      if(c && c.t && Date.now() - c.t < 3 * 3600e3 && c.krw){ rates.usdKrw = c.krw; rates.usdEur = c.eur || 0; rates.usdCad = c.cad || 0; applyRates(); }
    }catch(e){}
    fetchRates().then(function(d){
      if(d && d.rates && d.rates.KRW){
        rates.usdKrw = d.rates.KRW; rates.usdEur = d.rates.EUR || 0; rates.usdCad = d.rates.CAD || 0;
        try{ localStorage.setItem("apexKrwRateV4", JSON.stringify({t:Date.now(), krw:rates.usdKrw, eur:rates.usdEur, cad:rates.usdCad})); }catch(e){}
        applyRates();
      }
    }).catch(function(){});
  }
  function toUsd(amount, cur){
    cur = String(cur || "").toLowerCase();
    if(cur === "usd") return amount;
    if(cur === "krw" && rates.usdKrw) return amount / rates.usdKrw;
    if(cur === "eur" && rates.usdEur) return amount / rates.usdEur;
    if(cur === "cad" && rates.usdCad) return amount / rates.usdCad;
    return null;
  }
  function priceText(amount, cur){
    var usd = toUsd(amount, cur);
    if(usd != null) return fmtNum(Math.round(usd)) + " $";
    return fmtNum(amount) + " " + String(cur || "").toUpperCase();
  }
  function applyRates(){
    document.querySelectorAll("[data-price-amt]").forEach(function(el){
      el.textContent = priceText(Number(el.getAttribute("data-price-amt")), el.getAttribute("data-price-cur"));
    });
  }

  // ---- Запрос ----
  function buildQuery(){
    var p = stateToParams();
    p.set("action", "search"); p.set("lang", uiLang()); p.set("per_page", String(PER_PAGE)); p.set("page", String(state.page));
    p.set("sort", state.sort);   // сортировка по умолчанию (у Канады своя) — серверу всегда явно
    return p.toString();
  }
  var frame = document.querySelector(".catalog-frame");
  function search(){
    var myToken = ++reqToken;
    if(abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    grid.setAttribute("aria-busy", "true");
    if(frame) frame.classList.add("catalog-loading");
    if(!grid.children.length) renderSkeleton();
    fetch(API + buildQuery(), {signal:abortCtrl.signal})
      .then(function(r){ return r.json().then(function(d){ return {ok:r.ok, status:r.status, data:d}; }); })
      .then(function(res){
        if(myToken !== reqToken) return;
        if(frame) frame.classList.remove("catalog-loading");
        if(!res.ok){ renderError(res.status); return; }
        renderResults(res.data);
      })
      .catch(function(e){
        if(e && e.name === "AbortError") return;
        if(myToken !== reqToken) return;
        if(frame) frame.classList.remove("catalog-loading");
        renderError(0);
      });
  }
  function debounce(fn, ms){ var t; return function(){ clearTimeout(t); t = setTimeout(fn, ms); }; }
  var searchDebounced = debounce(search, 350);
  function scheduleSearch(resetPage){
    if(resetPage) state.page = 1;
    renderHeadControls();
    updateCrumbs(); updateHeroHeading();
    pushUrl();
    searchDebounced();
  }

  // ---- Тулбар / заголовок / крошки ----
  function setHeading(total){
    var h = document.getElementById("catHeadingV1");
    if(!h) return;
    lastTotal = total;
    h.setAttribute("data-cars-total", String(total));
    var n = total % 100, n1 = total % 10;
    var word = (n > 10 && n < 20) ? T("автомобилей") : n1 === 1 ? T("автомобиль") : (n1 >= 2 && n1 <= 4) ? T("автомобиля") : T("автомобилей");
    h.textContent = fmtNum(total) + " " + word;
    var lbl = document.getElementById("catApplyLabelV1");
    if(lbl) lbl.textContent = T("Показать") + " " + fmtNum(total) + " " + T("авто");
  }
  function brandNameOf(b){ var f = (dict.brands || []).find(function(x){ return x.id === b.id; }); return f ? f.name : null; }
  function modelNameOf(b, m){ var f = (dict.modelsByBrand[b.id] || []).find(function(x){ return x.id === m.id; }); return f ? f.name : null; }
  function updateCrumbs(){
    var el = document.getElementById("catListCrumbsV1");
    if(!el) return;
    var b = state.brands[0], bName = b ? brandNameOf(b) : null;
    var parts = ['<a href="/" class="crumb crumb--home" aria-label="' + esc(T("Главная")) + '">' + I.home + '</a>'];
    if(b && bName){
      parts.push('<a href="' + BASE + '" class="crumb">' + esc(T(PAGE_NAME)) + '</a>');
      var m = (b.models || [])[0], mName = m ? modelNameOf(b, m) : null;
      if(m && mName){
        var bp = new URLSearchParams(); bp.set("brand_id", b.id);
        parts.push('<a href="' + BASE + '?' + bp.toString() + '" class="crumb" data-no-i18n="true">' + esc(bName) + '</a>');
        parts.push('<span class="crumb-current" data-no-i18n="true">' + esc(mName) + '</span>');
      }else parts.push('<span class="crumb-current" data-no-i18n="true">' + esc(bName) + '</span>');
    }else parts.push('<span class="crumb-current">' + esc(T(PAGE_NAME)) + '</span>');
    el.innerHTML = parts.join(I.crumbSep);
  }
  function updateHeroHeading(){
    var h1 = document.querySelector(".catalog-hero h1");
    if(!h1) return;
    var b = state.brands[0], bName = b ? brandNameOf(b) : null;
    if(b && bName){
      var m = (b.models || [])[0], mName = m ? modelNameOf(b, m) : null;
      h1.setAttribute("data-no-i18n", "true");
      h1.textContent = bName + (mName ? " " + mName : "") + " - " + T(PAGE_NAME);
    }else{ h1.removeAttribute("data-no-i18n"); h1.textContent = T(PAGE_NAME); }
  }
  window._catalogRerenderHeading = function(){ updateCrumbs(); updateHeroHeading(); renderSortMenu(); renderHeadControls(); };

  function renderHeadControls(){
    var n = activeGroupsCount();
    var cnt = document.getElementById("catFilterCountV1"), rst = document.getElementById("catFilterResetV1");
    if(cnt) cnt.innerHTML = n ? '<span class="cf-count num">' + n + '</span>' : "";
    if(rst) rst.innerHTML = n ? '<button type="button" class="cf-reset" id="catResetAllBtnV1">' + esc(T("Сбросить")) + '</button>' : "";
    var r = document.getElementById("catResetAllBtnV1"); if(r) r.addEventListener("click", resetAll);
    var fb = document.getElementById("btn-filters");
    if(fb){
      var lab = fb.querySelector("[data-fcnt]") ? fb.querySelector("[data-fcnt]").previousSibling : fb.lastChild;
      if(lab && lab.nodeType === 3){ lab.__i18nSrc = undefined; lab.nodeValue = " " + T("Фильтры"); }
      var fc = fb.querySelector("[data-fcnt]");
      if(!fc){ fc = document.createElement("span"); fc.setAttribute("data-fcnt", ""); fc.setAttribute("data-no-i18n", "true"); fb.appendChild(fc); }
      fc.textContent = n ? " · " + n : "";
    }
    document.querySelectorAll(".filter-section[data-sec]").forEach(function(sec){
      var active = sectionActive(sec.getAttribute("data-sec"));
      var dot = sec.querySelector("[data-active-dot]"), clr = sec.querySelector(".filter-section__clear");
      if(dot) dot.style.display = active ? "" : "none";
      if(clr) clr.style.display = active ? "" : "none";
    });
  }
  function sectionActive(key){
    switch(key){
      case "brand": return !!state.brands.length;
      case "model": return state.brands.some(function(b){ return (b.models||[]).length; });
      case "generation": return state.brands.some(function(b){ return (b.models||[]).some(function(m){ return (m.generations||[]).length; }); });
      case "price": return !!(state.priceFrom || state.priceTo);
      case "year": return !!(state.yearFrom || state.yearTo);
      case "odometer": return !!(state.odoFrom || state.odoTo);
      case "drive": return !!state.driveIds.length;
      case "transmission": return !!state.transmission;
      case "body": return !!state.bodyTypeIds.length;
      case "fuel": return !!state.fuelIds.length;
      case "condition": return !!state.condIds.length;
      case "availability": return !!state.availIds.length;
      case "damage": return !!state.damageIds.length;
      case "keys": return !!state.keysAvail;
      case "steering": return !!state.steering;
      case "emission": return !!state.emissionIds.length;
      case "airbags": return !!state.airbags;
      case "seller": return !!state.sellerType;
      case "mfgcert": return !!state.mfgCert;
      case "hasinsp": return !!state.hasInsp;
      case "isauction": return !!state.isAuction;
      case "hashist": return !!state.hasHist;
      case "color": return !!state.colorIds.length;
      case "enginevol": return !!(state.engineVolFrom || state.engineVolTo);
      case "power": return !!(state.powerFrom || state.powerTo);
      case "seats": return !!state.seats;
      case "leasing": return !!state.isLeasing;
    }
    return false;
  }
  function clearSection(key){
    switch(key){
      case "brand": state.brands = []; break;
      case "model": state.brands.forEach(function(b){ b.models = []; }); break;
      case "generation": state.brands.forEach(function(b){ (b.models||[]).forEach(function(m){ m.generations = []; }); }); break;
      case "price": state.priceFrom = state.priceTo = ""; break;
      case "year": state.yearFrom = state.yearTo = ""; break;
      case "odometer": state.odoFrom = state.odoTo = ""; break;
      case "drive": state.driveIds = []; break;
      case "transmission": state.transmission = ""; break;
      case "body": state.bodyTypeIds = []; break;
      case "fuel": state.fuelIds = []; break;
      case "condition": state.condIds = []; break;
      case "availability": state.availIds = []; break;
      case "damage": state.damageIds = []; break;
      case "keys": state.keysAvail = ""; break;
      case "steering": state.steering = ""; break;
      case "emission": state.emissionIds = []; break;
      case "airbags": state.airbags = ""; break;
      case "seller": state.sellerType = ""; break;
      case "mfgcert": state.mfgCert = ""; break;
      case "hasinsp": state.hasInsp = ""; break;
      case "isauction": state.isAuction = ""; break;
      case "hashist": state.hasHist = ""; break;
      case "color": state.colorIds = []; break;
      case "enginevol": state.engineVolFrom = state.engineVolTo = ""; break;
      case "power": state.powerFrom = state.powerTo = ""; break;
      case "seats": state.seats = ""; break;
      case "leasing": state.isLeasing = ""; break;
    }
  }
  function resetAll(){
    var keep = {sort:state.sort};
    Object.keys(state).forEach(function(k){ if(Array.isArray(state[k])) state[k] = []; else if(typeof state[k] === "string") state[k] = ""; });
    state.currency = "usd"; state.sort = keep.sort; state.page = 1;
    renderSections();
    scheduleSearch(true);
  }

  // ---- Сортировка (меню) ----
  var sortOpen = false;
  function renderSortMenu(){
    var box = document.getElementById("catSortItemsV1"), lbl = document.getElementById("catSortLabelV1");
    if(!box) return;
    box.innerHTML = SORTS.map(function(s){
      var on = s[0] === state.sort;
      return '<button type="button" role="menuitem" data-sort="' + s[0] + '" class="menu-item w-full justify-between text-start max-sm:min-h-12 max-sm:text-[15px]' + (on ? " is-selected" : "") + '">' + esc(T(s[1])) + (on ? I.tick : "") + '</button>';
    }).join("");
    var cur = SORTS.find(function(s){ return s[0] === state.sort; });
    if(lbl) lbl.textContent = T(cur ? cur[1] : "Сначала новые");
  }
  function setSortOpen(v){
    sortOpen = v;
    var menu = document.getElementById("sort-dropdown-menu"), veil = document.getElementById("catSortVeilV1"), btn = document.getElementById("sort-dropdown-button"), chev = document.getElementById("catSortChevV1");
    if(menu) menu.style.display = v ? "" : "none";
    if(veil) veil.style.display = v ? "" : "none";
    if(btn) btn.setAttribute("aria-expanded", v ? "true" : "false");
    if(chev) chev.classList.toggle("rotate-180", v);
    document.documentElement.classList.toggle("max-sm:overflow-hidden", v);
  }
  document.addEventListener("click", function(e){
    var wrap = document.getElementById("catSortWrapV1");
    if(e.target.closest("#sort-dropdown-button")){ setSortOpen(!sortOpen); return; }
    var it = e.target.closest("[data-sort]");
    if(it){ state.sort = it.getAttribute("data-sort"); state.page = 1; renderSortMenu(); setSortOpen(false); pushUrlForce(); search(); return; }
    if(e.target.closest("[data-sort-close]") || e.target.id === "catSortVeilV1" || (sortOpen && wrap && !wrap.contains(e.target))) setSortOpen(false);
  });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape"){ setSortOpen(false); closeMobileFilters(); } });

  // ---- Вид: плитка / список ----
  var viewToggle = document.getElementById("catViewToggleV1");
  function applyView(v){
    grid.classList.toggle("is-list", v === "list");
    if(viewToggle){
      viewToggle.setAttribute("data-view", v);
      viewToggle.querySelectorAll("[data-view-toggle]").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-view-toggle") === v ? "true" : "false"); });
    }
    try{ localStorage.setItem("apexCatalogViewV1", v); }catch(e){}
  }
  if(viewToggle) viewToggle.addEventListener("click", function(e){ var b = e.target.closest("[data-view-toggle]"); if(b) applyView(b.getAttribute("data-view-toggle")); });
  try{ if(localStorage.getItem("apexCatalogViewV1") === "list") applyView("list"); }catch(e){}

  // ---- Мобильная шторка фильтров ----
  var sidebar = document.getElementById("catSidebarV1"), veil = document.getElementById("catSidebarVeilV1");
  function openMobileFilters(){ if(sidebar) sidebar.classList.add("is-open"); if(veil) veil.style.display = ""; document.documentElement.classList.add("overflow-hidden"); }
  function closeMobileFilters(){ if(sidebar) sidebar.classList.remove("is-open"); if(veil) veil.style.display = "none"; document.documentElement.classList.remove("overflow-hidden"); }
  var fbtn = document.getElementById("btn-filters"); if(fbtn) fbtn.addEventListener("click", openMobileFilters);
  var cbtn = document.getElementById("catFiltersCloseBtnV1"); if(cbtn) cbtn.addEventListener("click", closeMobileFilters);
  if(veil) veil.addEventListener("click", closeMobileFilters);
  var abtn = document.getElementById("catApplyBtnV1"); if(abtn) abtn.addEventListener("click", function(){ closeMobileFilters(); search(); });

  // ========== Сайдбар фильтров (разметка .filter-section эталона) ==========
  var SECTIONS = [
    {key:"brand", label:"Марка", open:true, type:"brands"},
    {key:"model", label:"Модель", open:false, type:"models"},
    {key:"generation", label:"Поколение", open:true, type:"generations"},
    {key:"price", label:"Цена", open:true, type:"range", min:0, max:100000, step:500, from:"priceFrom", to:"priceTo", format:true, prefix:"$"},
    {key:"year", label:"Год производства", open:true, type:"range", min:1960, max:(new Date()).getFullYear(), step:1, from:"yearFrom", to:"yearTo", format:false},
    {key:"odometer", label:"Одометр", open:true, type:"range", min:0, max:400000, step:1000, from:"odoFrom", to:"odoTo", format:true, suffix:"km"},
    {key:"drive", label:"Привод", type:"radio", table:DRIVE_WHEELS, get:function(){ return state.driveIds[0] || ""; }, set:function(v){ state.driveIds = v ? [parseInt(v, 10)] : []; }, icons:DRIVE_ICONS},
    {key:"transmission", label:"Трансмиссия", open:true, type:"radio", table:TRANSMISSIONS, get:function(){ return state.transmission; }, set:function(v){ state.transmission = v; }, icons:TRANS_ICONS},
    {key:"body", label:"Тип кузова", type:"check", table:BODY_TYPES, arr:"bodyTypeIds"},
    {key:"fuel", label:"Топливо", type:"check", table:FUELS, arr:"fuelIds"},
    {key:"condition", label:"Состояние", type:"radio", table:CONDITIONS, get:function(){ return state.condIds[0] || ""; }, set:function(v){ state.condIds = v ? [parseInt(v, 10)] : []; }},
    {key:"availability", label:"Наличие", type:"radio", table:AVAILABILITIES, get:function(){ return state.availIds[0] || ""; }, set:function(v){ state.availIds = v ? [parseInt(v, 10)] : []; }},
    {key:"damage", label:"Повреждения", type:"rows", table:DAMAGES, arr:"damageIds"},
    {key:"keys", label:"Ключи", type:"tri", yes:"Есть", no:"Нет", prop:"keysAvail"},
    {key:"steering", label:"Руль", type:"radio", table:STEERING, get:function(){ return state.steering; }, set:function(v){ state.steering = v; }},
    {key:"emission", label:"Экологический класс", type:"radio", table:EMISSIONS, get:function(){ return state.emissionIds[0] || ""; }, set:function(v){ state.emissionIds = v ? [parseInt(v, 10)] : []; }},
    {key:"airbags", label:"Подушки безопасности", type:"radio", table:AIRBAGS, get:function(){ return state.airbags; }, set:function(v){ state.airbags = v; }},
    {key:"seller", label:"Тип продавца", type:"radio", table:SELLER_TYPES, get:function(){ return state.sellerType; }, set:function(v){ state.sellerType = v; }},
    {key:"mfgcert", label:"Сертифицированный продавец", type:"tri", yes:"Да", no:"Нет", prop:"mfgCert"},
    {key:"hasinsp", label:"Есть отчёт об инспекции", type:"tri", yes:"Да", no:"Нет", prop:"hasInsp"},
    {key:"isauction", label:"Аукцион", type:"tri", yes:"Да", no:"Нет", prop:"isAuction"},
    {key:"hashist", label:"История автомобиля", type:"tri", yes:"Да", no:"Нет", prop:"hasHist"},
    {key:"color", label:"Цвет", type:"colors"},
    {key:"enginevol", label:"Объём двигателя, см³", type:"range", min:0, max:7000, step:100, from:"engineVolFrom", to:"engineVolTo", format:true},
    {key:"power", label:"Мощность, л.с.", type:"range", min:0, max:800, step:10, from:"powerFrom", to:"powerTo", format:true},
    {key:"seats", label:"Количество мест", type:"seats"},
    {key:"leasing", label:"В лизинге", type:"tri", yes:"Только лизинг", no:null, prop:"isLeasing"}
  ];
  var openState = {};
  function isOpen(sec){
    if(openState[sec.key] != null) return openState[sec.key];
    try{ var s = localStorage.getItem("catalog-filter-open:" + sec.key); if(s === "1") return true; if(s === "0") return false; }catch(e){}
    return !!sec.open || sectionActive(sec.key);
  }
  function sectionHtml(sec, bodyHtml){
    var open = isOpen(sec), active = sectionActive(sec.key);
    return '<section class="filter-section" data-sec="' + sec.key + '">'
      + '<div class="flex min-h-14 items-center gap-1">'
        + '<button type="button" class="filter-section__head" data-sec-toggle aria-expanded="' + (open ? "true" : "false") + '">'
          + '<span class="min-w-0">' + esc(T(sec.label)) + '</span>'
          + '<span class="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" data-active-dot' + (active ? "" : ' style="display:none"') + '></span>'
          + '<span class="filter-section__chevron ms-auto' + (open ? " is-open" : "") + '" aria-hidden="true">' + I.chev + '</span>'
        + '</button>'
        + (sec.type === "brands" ? "" : '<button type="button" class="filter-section__clear" data-sec-clear title="' + esc(T("Очистить")) + ': ' + esc(T(sec.label)) + '" aria-label="' + esc(T("Очистить")) + ': ' + esc(T(sec.label)) + '"' + (active ? "" : ' style="display:none"') + '>' + I.x + '</button>')
      + '</div>'
      + '<div class="collapse-room" data-sec-body' + (open ? "" : ' style="display:none"') + '><div class="filter-section__body space-y-3 pb-4">' + bodyHtml + '</div></div>'
    + '</section>';
  }
  function rangeBodyHtml(sec){
    var from = state[sec.from], to = state[sec.to];
    var show = function(v){ return v === "" ? "" : (sec.format ? fmtNum(v) : String(v)); };
    var ph = function(v){ return sec.format ? fmtNum(v) : String(v); };
    var affixPre = sec.prefix ? '<span class="cf-range-field__affix">' + esc(sec.prefix) + '</span>' : "";
    var affixPost = sec.suffix ? '<span class="cf-range-field__affix">' + esc(sec.suffix) + '</span>' : "";
    return '<div data-range data-min="' + sec.min + '" data-max="' + sec.max + '" data-step="' + sec.step + '" data-format="' + (sec.format ? 1 : 0) + '" data-from-key="' + sec.from + '" data-to-key="' + sec.to + '">'
      + '<div class="relative mb-3 h-6">'
        + '<div class="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-line-2"></div>'
        + '<div class="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-500" data-fill></div>'
        + '<input type="range" class="range-input" min="' + sec.min + '" max="' + sec.max + '" step="' + sec.step + '" data-lo aria-label="' + esc(T("от")) + '">'
        + '<input type="range" class="range-input" min="' + sec.min + '" max="' + sec.max + '" step="' + sec.step + '" data-hi aria-label="' + esc(T("до")) + '">'
      + '</div>'
      + '<div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">'
        + '<label class="cf-range-field">' + affixPre + '<input type="text" inputmode="numeric" data-from value="' + esc(show(from)) + '" autocomplete="off" placeholder="' + esc(ph(sec.min)) + '" aria-label="' + esc(T("от")) + '">' + affixPost + '</label>'
        + '<span class="text-ink-4" aria-hidden="true">–</span>'
        + '<label class="cf-range-field">' + affixPre + '<input type="text" inputmode="numeric" data-to value="' + esc(show(to)) + '" autocomplete="off" placeholder="' + esc(ph(sec.max)) + '" aria-label="' + esc(T("до")) + '">' + affixPost + '</label>'
      + '</div>'
    + '</div>';
  }
  function pillLabel(type, name, value, checked, inner, extraCls){
    return '<label class="block cursor-pointer"><input type="' + type + '" name="' + esc(name) + '" value="' + esc(value) + '"' + (checked ? " checked" : "") + ' class="peer sr-only"><span class="cf-pill' + (extraCls ? " " + extraCls : "") + '">' + inner + '</span></label>';
  }
  function radioBodyHtml(sec){
    var cur = String(sec.get() || "");
    var out = '<div data-radio="' + sec.key + '" role="radiogroup"><div class="flex flex-wrap gap-2">';
    out += pillLabel("radio", "f_" + sec.key, "", cur === "", T("Все"));
    sec.table.forEach(function(row){
      var ico = sec.icons && sec.icons[row[0]] ? sec.icons[row[0]] : "";
      out += pillLabel("radio", "f_" + sec.key, String(row[0]), cur === String(row[0]), ico + esc(T(row[1])), (ico ? "cf-pill--icon" : "") + (row[2] ? " " + row[2] : ""));
    });
    return out + '</div></div>';
  }
  function checkBodyHtml(sec){
    var arr = state[sec.arr] || [];
    return '<div data-checks="' + sec.key + '" role="group"><div class="flex flex-wrap gap-2">' + sec.table.map(function(row){
      return pillLabel("checkbox", "f_" + sec.key, String(row[0]), arr.indexOf(row[0]) >= 0, esc(T(row[1])));
    }).join("") + '</div></div>';
  }
  function triBodyHtml(sec){
    var cur = state[sec.prop] || "";
    var out = '<div data-tri="' + sec.key + '" role="radiogroup"><div class="flex flex-wrap gap-2">';
    out += pillLabel("radio", "f_" + sec.key, "", cur === "", T("Все"));
    out += pillLabel("radio", "f_" + sec.key, "1", cur === "1", esc(T(sec.yes)));
    if(sec.no) out += pillLabel("radio", "f_" + sec.key, "0", cur === "0", esc(T(sec.no)));
    return out + '</div></div>';
  }
  function rowsBodyHtml(sec){
    var arr = state[sec.arr] || [];
    var rows = '<label class="cf-row"><input type="checkbox" value="" ' + (arr.length ? "" : "checked") + ' class="peer sr-only" data-rows-all><span class="cf-check" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.6 6.3 4.9 8.6 9.4 3.6" pathLength="1"/></svg></span><span class="cf-label">' + esc(T("Все")) + '</span></label>';
    rows += sec.table.map(function(row){
      return '<label class="cf-row"><input type="checkbox" value="' + row[0] + '"' + (arr.indexOf(row[0]) >= 0 ? " checked" : "") + ' class="peer sr-only">' + I.check + '<span class="cf-label">' + esc(T(row[1])) + '</span></label>';
    }).join("");
    return '<div data-rows="' + sec.key + '" role="group"><div class="cf-scroll-frame"><div class="cf-scroll max-h-[286px] space-y-1.5">' + rows + '</div></div></div>';
  }
  function colorsBodyHtml(){
    return '<div data-colors role="group"><div class="flex flex-wrap gap-2">' + COLORS.map(function(c){
      var inner = '<span class="h-3.5 w-3.5 shrink-0 rounded-full border border-line-2" style="background: ' + c[2] + '" aria-hidden="true"></span>' + esc(T(c[1]));
      return pillLabel("checkbox", "colors[]", String(c[0]), state.colorIds.indexOf(c[0]) >= 0, inner);
    }).join("") + '</div></div>';
  }
  function seatsBodyHtml(){
    return '<div data-seats>'
      + '<input type="number" min="1" class="cf-input" placeholder="' + esc(T("Любой")) + '" value="' + esc(state.seats) + '" data-seats-input>'
      + '<div class="flex flex-wrap gap-1.5" role="group">' + SEATS_TABLE.map(function(s){
          return '<button type="button" class="cf-pill min-w-8 justify-center px-2.5' + (state.seats === String(s[0]) ? " is-checked" : "") + '" data-seat="' + s[0] + '">' + s[1] + '</button>';
        }).join("") + '</div></div>';
  }
  var makeSearchQuery = "";
  // Популярные марки — первыми в фильтре (Федор 05.11.2026). Порядок по реальному числу авто на Encar
  // (замер 05.11.2026: Hyundai 35k, Kia 34k, BMW 12.8k, Mercedes 12.5k, Genesis 8.2k … Peugeot 364); внутри группы — по алфавиту
  // (Федор 05.11.2026), остальные — тоже по алфавиту ниже.
  // Канада (OpenLane, замер 06.11.2026 из 31k): Ford 4425, Chevrolet 2994, Nissan 2146, Toyota 2119, GMC 1886, Hyundai 1866, Jeep 1691, Honda 1551,
  // Ram 1391, Kia 1367, VW 1170, Mercedes 1075, Audi 1024, BMW 930, Subaru 811 … Volvo 240 (≥240 машин).
  var POPULAR_BRANDS = CA ? [48,26,99,140,52,58,68,56,275,70,147,88,9,16,132,19,41,21,187,74,110,76,27,60,2,148]
    : [58,70,16,88,232,131,26,123,9,110,74,94,147,187,148,68,48,76,140,56,83,21,77,67,107];
  function brandsBodyHtml(){
    var all = dict.brands || [];
    var q = makeSearchQuery.trim().toLowerCase();
    var filtered = q ? all.filter(function(b){ return (b.name || "").toLowerCase().indexOf(q) >= 0; }) : all;
    var selectedIds = state.brands.map(function(b){ return b.id; });
    var row = function(b){
      return '<label class="cf-row"><input type="checkbox" value="' + b.id + '"' + (selectedIds.indexOf(b.id) >= 0 ? " checked" : "") + ' class="peer sr-only" data-brand-id="' + b.id + '">' + I.check + logoHtml(b.name) + '<span class="cf-label" data-no-i18n="true">' + esc(b.name || ("ID " + b.id)) + '</span></label>';
    };
    var top = filtered.filter(function(b){ return POPULAR_BRANDS.indexOf(b.id) >= 0; }).sort(function(a, b){ return (a.name || "").localeCompare(b.name || ""); });
    var rest = filtered.filter(function(b){ return POPULAR_BRANDS.indexOf(b.id) < 0; });
    var rows = top.map(row).join("")
      + (top.length && rest.length ? '<p class="cf-brand-sep">' + esc(T("Другие марки")) + '</p>' : "")
      + rest.map(row).join("");
    if(!all.length) rows = '<p class="text-[13px] text-ink-3 py-2">' + esc(T("Загрузка…")) + '</p>';
    else if(!rows) rows = '<p class="text-[13px] text-ink-3 py-2">' + esc(T("Ничего не найдено")) + '</p>';
    return '<div class="relative mb-2.5">' + I.search + '<input type="search" autocomplete="off" class="cf-search" id="catMakeSearchV1" placeholder="' + esc(T("Поиск марки")) + '" aria-label="' + esc(T("Поиск марки")) + '" value="' + esc(makeSearchQuery) + '"></div>'
      + '<div class="cf-scroll-frame"><div class="cf-scroll max-h-[286px] space-y-1.5" id="catMakeListV1">' + rows + '</div></div>';
  }
  // Популярные модели — первыми, по алфавиту (Федор 05.11.2026, как у марок). Замер 05.11.2026 по реальному числу авто на Encar
  // (action=search&model_id=<марка:модель>): модель с ≥2% машин своей марки и ≥20 шт. Пример: BMW 5er 2473, X5 1051, 3er 1020…;
  // Hyundai Grandeur 7191, Santa Fe 4037… Остальные модели марки — ниже, тоже по алфавиту. Пересчитывать тем же замером раз в полгода.
  var POPULAR_MODELS = CA ? {} : {"9":[60,1577,1715,61,58,1092,1461,2951,1788,2988,57],"16":[94,1665,93,96,1896,1895,2177,2978,2070,95,1042,1894],"21":[118,2404,2517,115,3020],"26":[1123,3219,141,152,1787,1600,1103,1000089,1427,138,1686],"48":[303,324,1387,1151,325,1436,310],"56":[350,356,371,1967,354],"58":[1268,398,400,1486,2995,1034,394,2812,3259,1000087,2723,1510,2933,3232],"67":[1502,427,2240,2491,1994,2738],"68":[432,429,2231,1321,431,3078],"70":[435,448,1840,2764,2765,449,2807,2818,1511,3056,1000084,2570,2823],"74":[474,472,475,2246,1792,1908,2700],"76":[476,2220,481,479,2972,478,480,1171,1740,3154],"77":[483,1464,3000,3046,1363,1180,484,2185],"83":[2585,520,527,1000039],"88":[573,576,2426,2396,570,1052,2239,574,1926,569,3062,2507],"94":[1000040,1535,1534,1000063,1937],"107":[1629,2164,1687,1709,1838,1523],"110":[762,1634,757,2139,3054,1000098,760],"123":[2827,1000080,1000082,800,801,1000088,1348,1000093,1000100,1002090],"131":[825,2399,1242,1000091,1005866,2235,2690],"140":[872,906,902,910,1391],"147":[1485,970,1201,2703,976,983,3184,1932,975,978],"148":[1599,999,1002,2774,996,1760,1001,1000,998],"187":[3119,2741,2497,1772],"232":[2669,3138,2668,3217,2910]};
  function byName(a, b){ return String(a.name || "").localeCompare(String(b.name || ""), "en", {numeric:true, sensitivity:"base"}); }
  function modelsBodyHtml(){
    return state.brands.map(function(b){
      var info = (dict.brands || []).find(function(x){ return x.id === b.id; });
      var models = dict.modelsByBrand[b.id];
      var selected = (b.models || []).map(function(m){ return m.id; });
      var list = !models ? '<p class="text-[13px] text-ink-3 py-1">' + esc(T("Загрузка…")) + '</p>'
        : !models.length ? '<p class="text-[13px] text-ink-3 py-1">' + esc(T("Нет моделей")) + '</p>'
        : (function(){
            var pop = POPULAR_MODELS[b.id] || [];
            var row = function(m){ return '<label class="cf-row"><input type="checkbox" value="' + m.id + '"' + (selected.indexOf(m.id) >= 0 ? " checked" : "") + ' class="peer sr-only" data-model-id="' + m.id + '" data-brand-ref="' + b.id + '">' + I.check + '<span class="cf-label" data-no-i18n="true">' + esc(m.name || ("ID " + m.id)) + '</span></label>'; };
            var top = models.filter(function(m){ return pop.indexOf(m.id) >= 0; }).sort(byName);
            var rest = models.filter(function(m){ return pop.indexOf(m.id) < 0; }).sort(byName);
            return top.map(row).join("") + (top.length && rest.length ? '<p class="cf-brand-sep">' + esc(T("Другие модели")) + '</p>' : "") + rest.map(row).join("");
          })();
      return '<div class="cf-group"><p class="cf-group__title" data-no-i18n="true">' + logoHtml(info && info.name) + '<span>' + esc(info ? info.name : ("ID " + b.id)) + '</span></p><div class="cf-scroll-frame"><div class="cf-scroll max-h-[286px] space-y-1.5">' + list + '</div></div></div>';
    }).join("");
  }
  function genLabel(g){
    var years = (g.from_year || g.from) ? ((g.from_year || g.from) + "–" + (g.to_year || g.to || "")) : "";
    var name = [g.ordinal, g.code].filter(Boolean).join(" ") || g.name || ("ID " + g.id);
    return years ? (name + " · " + years) : name;
  }
  function gensBodyHtml(){
    var out = "";
    state.brands.forEach(function(b){
      (b.models || []).forEach(function(m){
        var mInfo = (dict.modelsByBrand[b.id] || []).find(function(x){ return x.id === m.id; });
        var gens = dict.gensByModel[m.id];
        var selected = (m.generations || []).map(function(g){ return g.id; });
        var list = !gens ? '<p class="text-[13px] text-ink-3 py-1">' + esc(T("Загрузка…")) + '</p>'
          : !gens.length ? '<p class="text-[13px] text-ink-3 py-1">' + esc(T("Нет данных о поколениях")) + '</p>'
          : gens.map(function(g){
              return '<label class="cf-row"><input type="checkbox" value="' + g.id + '"' + (selected.indexOf(g.id) >= 0 ? " checked" : "") + ' class="peer sr-only" data-gen-id="' + g.id + '" data-brand-ref="' + b.id + '" data-model-ref="' + m.id + '">' + I.check + '<span class="cf-label" data-no-i18n="true">' + esc(genLabel(g)) + '</span></label>';
            }).join("");
        out += '<div class="cf-group"><p class="cf-group__title" data-no-i18n="true"><span>' + esc(mInfo ? mInfo.name : ("ID " + m.id)) + '</span></p><div class="space-y-1.5">' + list + '</div></div>';
      });
    });
    return out;
  }
  function bodyFor(sec){
    switch(sec.type){
      case "brands": return brandsBodyHtml();
      case "models": return modelsBodyHtml();
      case "generations": return gensBodyHtml();
      case "range": return rangeBodyHtml(sec);
      case "radio": return radioBodyHtml(sec);
      case "check": return checkBodyHtml(sec);
      case "tri": return triBodyHtml(sec);
      case "rows": return rowsBodyHtml(sec);
      case "colors": return colorsBodyHtml();
      case "seats": return seatsBodyHtml();
    }
    return "";
  }
  function sectionVisible(sec){
    if(sec.type === "models") return state.brands.length > 0;
    if(sec.type === "generations") return state.brands.some(function(b){ return (b.models || []).length; });
    return true;
  }
  var sectionsBox = document.getElementById("catSectionsV1");
  function renderSections(){
    if(!sectionsBox) return;
    var focusId = document.activeElement && document.activeElement.id === "catMakeSearchV1" ? "catMakeSearchV1" : null;
    sectionsBox.innerHTML = '<div>' + SECTIONS.filter(sectionVisible).map(function(sec){ return sectionHtml(sec, bodyFor(sec)); }).join("") + '</div>';
    sectionsBox.querySelectorAll("[data-range]").forEach(initRange);
    if(focusId){ var el = document.getElementById(focusId); if(el){ el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
    // Загрузка словарей для видимых разделов
    state.brands.forEach(function(b){ if(!dict.modelsByBrand[b.id]) ensureModels(b.id).then(renderSection.bind(null, "model")).then(function(){ renderSection("generation"); }); });
    state.brands.forEach(function(b){ (b.models || []).forEach(function(m){ if(!dict.gensByModel[m.id]) ensureGenerations(m.id).then(renderSection.bind(null, "generation")); }); });
  }
  function renderSection(key){
    var sec = SECTIONS.find(function(s){ return s.key === key; });
    var el = sectionsBox && sectionsBox.querySelector('.filter-section[data-sec="' + key + '"]');
    if(!sec) return;
    if(!el){ renderSections(); return; }
    if(!sectionVisible(sec)){ renderSections(); return; }
    var body = el.querySelector(".filter-section__body");
    if(body){ body.innerHTML = bodyFor(sec); body.querySelectorAll("[data-range]").forEach(initRange); }
  }

  // Двойной слайдер диапазона (как rangeFilter у эталона)
  function initRange(box){
    var min = Number(box.getAttribute("data-min")), max = Number(box.getAttribute("data-max")), step = Number(box.getAttribute("data-step")), format = box.getAttribute("data-format") === "1";
    var fromKey = box.getAttribute("data-from-key"), toKey = box.getAttribute("data-to-key");
    var lo = box.querySelector("[data-lo]"), hi = box.querySelector("[data-hi]"), fill = box.querySelector("[data-fill]"), tFrom = box.querySelector("[data-from]"), tTo = box.querySelector("[data-to]");
    function show(v){ return v === "" ? "" : (format ? fmtNum(v) : String(v)); }
    function digits(v){ return String(v).replace(/\D/g, "").slice(0, 9); }
    function loVal(){ return state[fromKey] === "" ? min : Math.max(min, Math.min(Number(state[fromKey]), max)); }
    function hiVal(){ return state[toKey] === "" ? max : Math.min(max, Math.max(Number(state[toKey]), min)); }
    function paint(){
      var l = loVal(), h = hiVal(), span = (max - min) || 1;
      lo.value = l; hi.value = h;
      fill.style.left = ((l - min) / span * 100) + "%"; fill.style.right = (100 - (h - min) / span * 100) + "%";
    }
    lo.addEventListener("input", function(){ var v = Math.min(Number(lo.value), hiVal()); state[fromKey] = v <= min ? "" : String(v); tFrom.value = show(state[fromKey]); paint(); });
    hi.addEventListener("input", function(){ var v = Math.max(Number(hi.value), loVal()); state[toKey] = v >= max ? "" : String(v); tTo.value = show(state[toKey]); paint(); });
    lo.addEventListener("change", function(){ scheduleSearch(true); });
    hi.addEventListener("change", function(){ scheduleSearch(true); });
    tFrom.addEventListener("input", function(){ state[fromKey] = digits(tFrom.value); tFrom.value = show(state[fromKey]); paint(); });
    tTo.addEventListener("input", function(){ state[toKey] = digits(tTo.value); tTo.value = show(state[toKey]); paint(); });
    tFrom.addEventListener("change", function(){ scheduleSearch(true); });
    tTo.addEventListener("change", function(){ scheduleSearch(true); });
    tFrom.addEventListener("focus", function(){ tFrom.select(); });
    tTo.addEventListener("focus", function(){ tTo.select(); });
    paint();
  }

  // Делегированные обработчики сайдбара
  if(sectionsBox){
    sectionsBox.addEventListener("click", function(e){
      var tg = e.target.closest("[data-sec-toggle]");
      if(tg){
        var sec = tg.closest(".filter-section"), key = sec.getAttribute("data-sec"), body = sec.querySelector("[data-sec-body]"), chev = sec.querySelector(".filter-section__chevron");
        var open = body.style.display === "none";
        body.style.display = open ? "" : "none"; chev.classList.toggle("is-open", open); tg.setAttribute("aria-expanded", open ? "true" : "false");
        openState[key] = open; try{ localStorage.setItem("catalog-filter-open:" + key, open ? "1" : "0"); }catch(err){}
        return;
      }
      var cl = e.target.closest("[data-sec-clear]");
      if(cl){ var k = cl.closest(".filter-section").getAttribute("data-sec"); clearSection(k); renderSections(); scheduleSearch(true); return; }
      var seat = e.target.closest("[data-seat]");
      if(seat){ var v = seat.getAttribute("data-seat"); state.seats = state.seats === v ? "" : v; renderSection("seats"); scheduleSearch(true); return; }
    });
    sectionsBox.addEventListener("change", function(e){
      var inp = e.target;
      if(inp.hasAttribute("data-brand-id")){
        var id = parseInt(inp.getAttribute("data-brand-id"), 10), idx = state.brands.findIndex(function(b){ return b.id === id; });
        if(inp.checked){ if(idx < 0) state.brands.push({id:id, models:[]}); } else if(idx >= 0) state.brands.splice(idx, 1);
        renderSections(); scheduleSearch(true); return;
      }
      if(inp.hasAttribute("data-model-id")){
        var bid = parseInt(inp.getAttribute("data-brand-ref"), 10), mid = parseInt(inp.getAttribute("data-model-id"), 10);
        var b = state.brands.find(function(x){ return x.id === bid; }); if(!b) return;
        b.models = b.models || [];
        var mi = b.models.findIndex(function(m){ return m.id === mid; });
        if(inp.checked){ if(mi < 0) b.models.push({id:mid}); } else if(mi >= 0) b.models.splice(mi, 1);
        renderSection("generation"); renderHeadControls(); scheduleSearch(true); return;
      }
      if(inp.hasAttribute("data-gen-id")){
        var bid2 = parseInt(inp.getAttribute("data-brand-ref"), 10), mid2 = parseInt(inp.getAttribute("data-model-ref"), 10), gid = parseInt(inp.getAttribute("data-gen-id"), 10);
        var b2 = state.brands.find(function(x){ return x.id === bid2; }); var m2 = b2 && (b2.models || []).find(function(m){ return m.id === mid2; }); if(!m2) return;
        m2.generations = m2.generations || [];
        var gi = m2.generations.findIndex(function(g){ return g.id === gid; });
        if(inp.checked){ if(gi < 0) m2.generations.push({id:gid}); } else if(gi >= 0) m2.generations.splice(gi, 1);
        scheduleSearch(true); return;
      }
      var radio = inp.closest("[data-radio]");
      if(radio){ var sec = SECTIONS.find(function(s){ return s.key === radio.getAttribute("data-radio"); }); if(sec) sec.set(inp.value); scheduleSearch(true); return; }
      var tri = inp.closest("[data-tri]");
      if(tri){ var sec2 = SECTIONS.find(function(s){ return s.key === tri.getAttribute("data-tri"); }); if(sec2) state[sec2.prop] = inp.value; scheduleSearch(true); return; }
      var checks = inp.closest("[data-checks]");
      if(checks){ var sec3 = SECTIONS.find(function(s){ return s.key === checks.getAttribute("data-checks"); }); if(sec3){ var arr = state[sec3.arr], v = parseInt(inp.value, 10), i = arr.indexOf(v); if(inp.checked){ if(i < 0) arr.push(v); } else if(i >= 0) arr.splice(i, 1); } scheduleSearch(true); return; }
      var rows = inp.closest("[data-rows]");
      if(rows){
        var sec4 = SECTIONS.find(function(s){ return s.key === rows.getAttribute("data-rows"); });
        if(sec4){
          if(inp.hasAttribute("data-rows-all")){ state[sec4.arr] = []; }
          else{ var arr2 = state[sec4.arr], v2 = parseInt(inp.value, 10), i2 = arr2.indexOf(v2); if(inp.checked){ if(i2 < 0) arr2.push(v2); } else if(i2 >= 0) arr2.splice(i2, 1); }
          renderSection(sec4.key);
        }
        scheduleSearch(true); return;
      }
      if(inp.closest("[data-colors]")){ var cv = parseInt(inp.value, 10), ci = state.colorIds.indexOf(cv); if(inp.checked){ if(ci < 0) state.colorIds.push(cv); } else if(ci >= 0) state.colorIds.splice(ci, 1); scheduleSearch(true); return; }
      if(inp.hasAttribute("data-seats-input")){ state.seats = inp.value.replace(/\D/g, "").slice(0, 2); renderSection("seats"); scheduleSearch(true); return; }
    });
    sectionsBox.addEventListener("input", debounce(function(e){
      var el = document.getElementById("catMakeSearchV1");
      if(el && document.activeElement === el){ makeSearchQuery = el.value; var list = document.getElementById("catMakeListV1"); if(list){ var tmp = document.createElement("div"); tmp.innerHTML = brandsBodyHtml(); list.innerHTML = tmp.querySelector("#catMakeListV1").innerHTML; } }
    }, 120));
  }

  // ---- Словари ----
  function ensureBrands(){
    if(dict.brands) return Promise.resolve(dict.brands);
    return fetch(API + "action=brands&lang=" + encodeURIComponent(uiLang())).then(function(r){ return r.json(); })
      .then(function(d){ dict.brands = (d && d.items) || []; return dict.brands; }).catch(function(){ dict.brands = []; return dict.brands; });
  }
  function ensureModels(brandId){
    if(dict.modelsByBrand[brandId]) return Promise.resolve(dict.modelsByBrand[brandId]);
    return fetch(API + "action=models&brand_id=" + encodeURIComponent(brandId) + "&lang=" + encodeURIComponent(uiLang())).then(function(r){ return r.json(); })
      .then(function(d){ dict.modelsByBrand[brandId] = (d && d.items) || []; return dict.modelsByBrand[brandId]; }).catch(function(){ dict.modelsByBrand[brandId] = []; return []; });
  }
  function ensureGenerations(modelId){
    if(dict.gensByModel[modelId]) return Promise.resolve(dict.gensByModel[modelId]);
    return fetch(API + "action=generations&model_id=" + encodeURIComponent(modelId) + "&lang=" + encodeURIComponent(uiLang())).then(function(r){ return r.json(); })
      .then(function(d){ dict.gensByModel[modelId] = (d && d.items) || []; return dict.gensByModel[modelId]; }).catch(function(){ dict.gensByModel[modelId] = []; return []; });
  }

  // ========== Результаты ==========
  function renderSkeleton(){
    var out = "";
    for(var i = 0; i < 8; i++) out += '<article class="vcard vcard--api is-skeleton"><div class="vcard__media"></div><div class="vcard__body flex flex-1 flex-col gap-3 px-4 pb-4 pt-3.5"><div class="vcard__main"><div class="skel-line w-3/4"></div><div class="skel-line w-1/2"></div><div class="skel-line w-2/3"></div></div></div></article>';
    grid.innerHTML = out;
  }
  function renderError(status){
    grid.setAttribute("aria-busy", "false");
    var msg = status === 503 ? T("Каталог временно недоступен. Попробуйте чуть позже.") : T("Не удалось загрузить каталог. Попробуйте ещё раз.");
    grid.innerHTML = '<div class="catalog-empty col-span-full" role="alert"><p class="catalog-empty__title">' + esc(T("Ошибка загрузки")) + '</p><p class="catalog-empty__text">' + esc(msg) + '</p><button type="button" class="btn btn-dark btn-sm" id="catRetryBtnV1">' + esc(T("Повторить")) + '</button></div>';
    var b = document.getElementById("catRetryBtnV1"); if(b) b.addEventListener("click", search);
    document.getElementById("catPagerV1").innerHTML = "";
  }
  function renderEmpty(){
    grid.innerHTML = '<div class="catalog-empty col-span-full"><p class="catalog-empty__title">' + esc(T("Ничего не найдено")) + '</p><p class="catalog-empty__text">' + esc(T("Попробуйте изменить или сбросить часть фильтров.")) + '</p><button type="button" class="btn btn-dark btn-sm" id="catEmptyResetV1">' + esc(T("Сбросить всё")) + '</button></div>';
    var b = document.getElementById("catEmptyResetV1"); if(b) b.addEventListener("click", resetAll);
  }
  function pickListing(car){
    var listings = Array.isArray(car.listings) ? car.listings : [];
    var active = listings.filter(function(l){ return !l.archived; });
    return active[0] || listings[0] || null;
  }
  // Как у эталона: в карточке — preview источника (800×600 с ci.encar.com), не оригинал 2000px (~400 КБ на кадр).
  // Карточка ~303px: просим у ci.encar.com 480×360 вместо 800×600 (52 КБ вместо 137 КБ на кадр; Lighthouse: 6 МБ → ~2.5 МБ на странице).
  function smallEncar(u){
    return /^https:\/\/ci\.encar\.com\//.test(u) ? u.replace(/([?&])rh=\d+/, "$1rh=360").replace(/([?&])cw=\d+/, "$1cw=480").replace(/([?&])ch=\d+/, "$1ch=360") : u;
  }
  function imageUrl(img){ return smallEncar(img.preview || img.original || img.downloaded || ""); }
  function titleOf(car){
    var brand = car.brand && car.brand.name, model = car.model && car.model.name;
    if(brand || model) return [car.year, brand, model].filter(Boolean).join(" ");
    var l = pickListing(car), tm = l && l.title;
    if(tm && typeof tm === "object"){ var lg = uiLang() === "ru" ? "ru" : "en"; return tm[lg] || tm.en || Object.values(tm)[0] || T("Автомобиль"); }
    return T("Автомобиль");
  }
  function lbl(table, id){ var r = table.find(function(x){ return x[0] === id; }); return r ? T(r[1]) : ""; }
  // Чистая ссылка как у эталона: /catalog/<id> (страница сама берёт активное объявление — то же, что pickListing здесь)
  // Ссылка как у лотов США: /korea|/canada/<название>-<VIN>-<id>; без VIN — просто id. Тот же алгоритм на сервере (server/slug.js catSlug/parseCatSlug).
  function catSlug(car){
    var id = String(car && car.id || ""); if(!id) return "";
    var vin = String(car.vin || "").trim(); vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) ? vin.toUpperCase() : "";
    if(!vin) return id;
    var t = String([car.year, car.brand && car.brand.name, car.model && car.model.name].filter(Boolean).join(" ")).normalize("NFKD").replace(/[^\x00-\x7F]/g, "")
      .split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(w){ return w[0].toUpperCase() + w.slice(1); }).join("-").slice(0, 60).replace(/-+$/g, "");
    return [t, vin, id].filter(Boolean).join("-");
  }
  function parseCatSlug(seg){ var m = String(seg || "").match(/^(?:.*?-)?([A-HJ-NPR-Z0-9]{17})-(.+)$/); return m ? m[2] : String(seg || ""); }
  function carHref(car){ return BASE + "/" + catSlug(car); }
  function specLi(icon, text, more){
    return '<li class="' + (more ? "vcard__more" : "flex") + ' min-w-0 items-center gap-2">' + icon + '<span class="truncate" data-no-i18n="true">' + esc(text) + '</span></li>';
  }
  // OpenLane (Канада) — дилерский аукцион: обычной цены почти нет. Показываем текущую ставку, иначе стартовую (не символическую 50 CAD),
  // иначе цену, иначе среднюю цену продаж таких машин на OpenLane (market_value, их данные), иначе «по запросу».
  function olPrice(listing){
    if(!listing) return null;
    var sd = listing.source_data || {}, oa = sd.openlane_auction || {}, mv = oa.market_value || {};
    var cur = (listing.price && listing.price.currency && listing.price.currency.name) || "cad";
    var start = Number(sd.starting_bid || oa.start_price || 0);
    // До первых ставок фид кладёт стартовую в current_bid — это не «текущая ставка»
    if(Number(listing.current_bid) > 0 && Number(listing.current_bid) !== start) return {amt:Number(listing.current_bid), cur:cur, label:T("Текущая ставка")};
    if(start >= 500) return {amt:start, cur:cur, label:T("Стартовая ставка")};
    if(listing.price && listing.price.price > 0) return {amt:listing.price.price, cur:cur, label:T("Цена")};
    if(Number(mv.average_price) > 0) return {amt:Math.round(mv.average_price), cur:"cad", label:T("Средняя цена продаж")};
    return null;
  }
  function olAuctionText(listing){
    var t = listing && Date.parse(listing.auction_at || "");
    if(!t) return "";
    var loc = uiLang() === "en" ? "en-GB" : uiLang() === "ro" ? "ro-RO" : "ru-RU";
    var d = new Date(t).toLocaleString(loc, {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"});
    return t < Date.now() - 3 * 3600e3 ? T("Торги прошли") + " · " + new Date(t).toLocaleDateString(loc, {day:"numeric", month:"short"}) : T("Торги") + ": " + d;
  }
  function cardHtml(car, idx){
    var listing = pickListing(car);
    var imgs = listing && Array.isArray(listing.images) ? listing.images.map(imageUrl).filter(Boolean) : [];
    var shown = imgs.slice(0, 6), more = imgs.length - shown.length;
    var href = carHref(car, listing), title = titleOf(car);
    // Грузим заранее только ПЕРВОЕ фото; остальные (data-src) — по требованию: наведение, стрелка, свайп (loadAround).
    var slides = shown.map(function(u, i){
      return '<a href="' + esc(href) + '" class="vcard__slide" tabindex="-1" rel="nofollow"><img ' + (i === 0 ? 'src="' + esc(u) + '"' : 'data-src="' + esc(u) + '"') + ' alt="' + esc(title) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></a>';
    }).join("");
    var stage = shown.map(function(u, i){ return '<img ' + (i === 0 ? 'src="' + esc(u) + '"' : 'data-src="' + esc(u) + '"') + ' alt="" class="vcard__stage-img' + (i === 0 ? " is-active" : "") + '"' + (i === 0 && idx < 2 ? ' fetchpriority="high"' : "") + ' loading="' + (i === 0 && idx < 2 ? "eager" : "lazy") + '" decoding="async" referrerpolicy="no-referrer" draggable="false">'; }).join("")
      + (more > 0 ? '<div class="vcard__more-photos" style="display:none" data-more-photos><span>' + I.photos + ' +' + more + '</span></div>' : "");
    var segments = shown.length > 1 ? '<div class="vcard__segments" aria-hidden="true">' + shown.map(function(_, i){ return '<span data-active="' + (i === 0 ? "true" : "false") + '"></span>'; }).join("") + '</div>' : "";
    var nav = shown.length > 1 ? '<button type="button" class="vcard__nav vcard__nav--prev" data-nav="-1" aria-label="‹" tabindex="-1">' + I.prev + '</button><button type="button" class="vcard__nav vcard__nav--next" data-nav="1" aria-label="›" tabindex="-1">' + I.next + '</button>' : "";
    var badges = "";
    if(car.has_inspections) badges += '<span class="badge badge-glass h-[22px] gap-1 rounded-[7px] px-2 text-[11px] text-emerald-700 max-sm:hidden">' + I.shield + esc(T("Инспекция")) + '</span>';
    if(car.has_history_reports) badges += '<span class="badge badge-glass h-[22px] gap-1 rounded-[7px] px-2 text-[11px] text-blue-700 max-sm:hidden">' + I.clock + esc(T("История")) + '</span>';
    var mobReports = (car.has_inspections || car.has_history_reports) ? '<div class="vcard__reports sm:hidden"><div class="flex gap-1.5">'
      + (car.has_inspections ? '<span class="vcard__report is-inspection" role="img" aria-label="' + esc(T("Есть инспекция")) + '">' + I.shield.replace('class="h-3 w-3"', "") + '</span>' : "")
      + (car.has_history_reports ? '<span class="vcard__report is-history" role="img" aria-label="' + esc(T("Есть история")) + '">' + I.clock.replace('class="h-3 w-3"', "") + '</span>' : "")
      + '</div></div>' : "";
    var specs = "";
    if(listing && listing.odometer != null) specs += specLi(I.odo, fmtNum(listing.odometer) + " " + T("км"));
    // Как у эталона: 2-я ячейка — объём «2.0 л»; у электро (объёма нет/он бессмысленный) — тип кузова.
    var hasEngine = car.engine_volume && !(car.fuel && car.fuel.id === 2);
    if(hasEngine) specs += specLi(I.engine, (car.engine_volume / 1000).toFixed(1) + " " + T("л"));
    else if(car.body_type) specs += specLi(I.body, lbl(BODY_TYPES, car.body_type.id) || car.body_type.name);
    if(car.transmission) specs += specLi(I.trans, lbl(TRANSMISSIONS, car.transmission.id) || car.transmission.name);
    if(car.fuel) specs += specLi(I.fuel, lbl(FUELS, car.fuel.id) || car.fuel.name);
    if(car.body_type && hasEngine) specs += specLi(I.body, lbl(BODY_TYPES, car.body_type.id) || car.body_type.name, true);
    if(car.color){ var c = COLORS.find(function(x){ return x[0] === car.color.id; }); specs += specLi('<span class="mx-0.5 h-3 w-3 shrink-0 rounded-full border border-line-2" style="background: ' + (c ? c[2] : "#9ca3af") + '" aria-hidden="true"></span>', c ? T(c[1]) : car.color.name, true); }
    if(car.drive_wheels) specs += specLi(I.drive, (lbl(DRIVE_WHEELS, car.drive_wheels.id) || car.drive_wheels.name) + " " + T("привод"), true);
    if(car.seats) specs += specLi(I.seats, car.seats + " " + T("мест"), true);
    if(listing && listing.keys_available) specs += specLi(I.key, T("Ключи в наличии"), true);
    var price = listing && listing.price && listing.price.price > 0 ? {amt:listing.price.price, cur:listing.price.currency && listing.price.currency.name} : (listing && listing.current_bid != null ? {amt:listing.current_bid, cur:listing.price && listing.price.currency && listing.price.currency.name} : null);
    var priceLabel = listing && listing.is_auction && listing.current_bid != null ? T("Текущая ставка") : T("Цена");
    var aucLine = "";
    if(CA){
      var op = olPrice(listing);
      price = op ? {amt:op.amt, cur:op.cur} : null; priceLabel = op ? op.label : "";
      aucLine = olAuctionText(listing);
    }
    var src = CA ? "" : (listing && listing.external && listing.external.domain && listing.external.domain.name || "");
    var sold = listing && listing.archived;
    return '<article class="vcard vcard--api group' + (sold ? " is-sold" : "") + '">'
      + '<div class="vcard__media' + (shown.length ? " has-gallery" : " no-photo is-loaded") + '" data-no-photo="' + esc(T("Фото скоро появятся")) + '" data-count="' + shown.length + '" data-href="' + esc(href) + '">'
        + '<div class="vcard__track" data-track>' + (slides || '<a href="' + esc(href) + '" class="vcard__slide has-error" tabindex="-1"></a>') + '</div>'
        + '<div class="vcard__stage" data-stage aria-hidden="true">' + stage + '</div>'
        + nav + segments
        + '<span class="vcard__scrim" aria-hidden="true"></span>'
        + '<div class="vcard__badges pointer-events-none absolute start-2.5 top-2.5 z-[2] flex flex-wrap items-start gap-1.5 end-11">' + badges + mobReports + '</div>'
        + (sold ? '<span class="vcard__sold">' + esc(T("Продано")) + '</span>' : "")
      + '</div>'
      + '<div class="vcard__body flex flex-1 flex-col gap-3 px-4 pb-4 pt-3.5">'
        + '<div class="vcard__main">'
          + '<div class="flex items-start gap-2.5"><h3 class="min-w-0 flex-1">'
            + '<a href="' + esc(href) + '" title="' + esc(car.badge || "") + '" class="vcard__hit vcard__title font-display text-[16px] font-semibold leading-snug tracking-tight text-ink line-clamp-2" data-no-i18n="true">' + esc(title) + '</a>'
            + (car.badge ? '<span class="vcard__badge mt-0.5 block truncate text-[13px] font-normal text-ink-3 max-sm:hidden" data-no-i18n="true">' + esc(car.badge) + '</span>' : "")
          + '</h3></div>'
          + (car.vin ? '<div class="vcard__ids flex min-w-0 items-center gap-2 max-sm:hidden"><button type="button" class="vcard__copy min-w-0 truncate" data-copy="' + esc(String(car.vin).toUpperCase()) + '" data-no-i18n="true"><span class="text-ink-4">VIN</span> ' + esc(String(car.vin).toUpperCase()) + I.copy + '</button></div>' : "")
          + '<ul class="vcard__specs grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] text-ink-2">' + specs + '</ul>'
          + (src ? '<p class="vcard__domain sm:hidden">' + I.globe + '<span class="truncate" data-no-i18n="true">' + esc(src.toLowerCase().indexOf(".") > 0 ? src : src + ".com") + '</span></p>' : "")
        + '</div>'
        + '<div class="vcard__foot mt-auto flex items-end justify-between gap-3 border-t border-line pt-3">'
          + '<div class="vcard__pricebox flex min-w-0 items-end gap-5"><div class="min-w-0">'
            + '<p class="truncate text-[11.5px] text-ink-4">' + esc(priceLabel) + '</p>'
            + '<div class="vcard__price-row flex items-center gap-2"><p class="vcard__price num whitespace-nowrap font-display text-[18px] font-semibold leading-tight tracking-tight text-ink" data-no-i18n="true"' + (price ? ' data-price-amt="' + price.amt + '" data-price-cur="' + esc(price.cur || "") + '"' : "") + '>' + (price ? esc(priceText(price.amt, price.cur)) : '<span class="vcard__noprice">' + esc(T("Цена по запросу")) + '</span>') + '</p></div>'
          + (aucLine ? '<p class="vcard__auc text-[11.5px] leading-snug text-ink-4" data-no-i18n="true">' + esc(aucLine) + '</p>' : "")
          + '</div></div>'
        + '</div>'
      + '</div>'
    + '</article>';
  }
  function renderResults(data){
    grid.setAttribute("aria-busy", "false");
    var items = Array.isArray(data.items) ? data.items : [];
    setHeading(data.total || 0);
    if(!items.length){ renderEmpty(); renderPager(data); return; }
    grid.innerHTML = items.map(cardHtml).join("");
    renderPager(data);
  }

  // Галерея карточки: скраб мышью (hover-устройства), стрелки, свайп по треку (тач) — как cardGallery эталона
  var fineHover = window.matchMedia("(hover:hover) and (pointer:fine)");
  function mediaIndex(media){ return parseInt(media.getAttribute("data-idx") || "0", 10) || 0; }
  // Подгружает фото с номерами idx-1…idx+1 (только те, что ещё не загружены) — и в сцене, и в ленте свайпа.
  function loadAround(media, idx){
    var count = parseInt(media.getAttribute("data-count"), 10) || 0;
    [idx, idx + 1, idx - 1].forEach(function(k){
      if(k < 0 || k >= count) return;
      media.querySelectorAll(".vcard__stage-img:nth-child(" + (k + 1) + "), .vcard__slide:nth-child(" + (k + 1) + ") img").forEach(function(im){
        var d = im.getAttribute("data-src");
        if(d){ im.src = d; im.removeAttribute("data-src"); }
      });
    });
  }
  function goTo(media, idx, instant){
    var count = parseInt(media.getAttribute("data-count"), 10) || 0;
    if(count < 2) return;
    idx = (idx + count) % count;
    media.setAttribute("data-idx", String(idx));
    loadAround(media, idx);
    var stage = media.querySelector("[data-stage]");
    var staged = stage && stage.offsetParent;
    if(staged){
      stage.querySelectorAll(".vcard__stage-img").forEach(function(im, i){ im.classList.toggle("is-active", i === idx); });
      var mp = media.querySelector("[data-more-photos]"); if(mp) mp.style.display = idx === count - 1 ? "" : "none";
    }else{
      var track = media.querySelector("[data-track]");
      if(track) track.scrollTo({left:track.clientWidth * idx, behavior:instant ? "instant" : "smooth"});
    }
    media.querySelectorAll(".vcard__segments span").forEach(function(s, i){ s.setAttribute("data-active", i === idx ? "true" : "false"); });
  }
  grid.addEventListener("touchstart", function(e){
    var media = e.target.closest && e.target.closest(".vcard__media"); if(media) loadAround(media, mediaIndex(media));
  }, {passive:true});
  grid.addEventListener("pointerover", function(e){
    if(!fineHover.matches) return;
    var media = e.target.closest && e.target.closest(".vcard__media"); if(media) loadAround(media, mediaIndex(media));
  });
  grid.addEventListener("pointermove", function(e){
    if(!fineHover.matches) return;
    var media = e.target.closest(".vcard__media"); if(!media) return;
    var count = parseInt(media.getAttribute("data-count"), 10) || 0; if(count < 2) return;
    var r = media.getBoundingClientRect();
    var n = Math.min(count - 1, Math.max(0, Math.floor((e.clientX - r.left) / r.width * count)));
    if(n !== mediaIndex(media)) goTo(media, n, true);
  });
  grid.addEventListener("pointerleave", function(){}, true);
  grid.addEventListener("mouseout", function(e){
    var media = e.target.closest && e.target.closest(".vcard__media");
    if(!media || !fineHover.matches) return;
    if(e.relatedTarget && media.contains(e.relatedTarget)) return;
    if(mediaIndex(media) !== 0) goTo(media, 0, true);
  });
  grid.addEventListener("click", function(e){
    var nav = e.target.closest("[data-nav]");
    if(nav){ e.preventDefault(); e.stopPropagation(); var media = nav.closest(".vcard__media"); goTo(media, mediaIndex(media) + parseInt(nav.getAttribute("data-nav"), 10)); return; }
    var cp = e.target.closest("[data-copy]");
    if(cp){ e.preventDefault(); e.stopPropagation(); if(navigator.clipboard){ navigator.clipboard.writeText(cp.getAttribute("data-copy")).then(function(){ cp.classList.add("is-copied"); setTimeout(function(){ cp.classList.remove("is-copied"); }, 1200); }).catch(function(){}); } return; }
    var media2 = e.target.closest(".vcard__media");
    if(media2 && !e.target.closest("a")){ var href = media2.getAttribute("data-href"); if(href) location.href = href; }
  });
  grid.addEventListener("scroll", function(e){
    var track = e.target;
    if(!track || !track.hasAttribute || !track.hasAttribute("data-track") || !track.clientWidth) return;
    var media = track.closest(".vcard__media");
    var idx = Math.round(track.scrollLeft / track.clientWidth);
    loadAround(media, idx);
    if(idx !== mediaIndex(media)){ media.setAttribute("data-idx", String(idx)); media.querySelectorAll(".vcard__segments span").forEach(function(s, i){ s.setAttribute("data-active", i === idx ? "true" : "false"); }); }
  }, true);
  grid.addEventListener("load", function(e){
    var im = e.target; if(!im || im.tagName !== "IMG") return;
    im.classList.add("is-loaded"); var media = im.closest(".vcard__media"); if(media) media.classList.add("is-loaded");
  }, true);
  grid.addEventListener("error", function(e){
    var im = e.target; if(!im || im.tagName !== "IMG") return;
    var slide = im.closest(".vcard__slide"), media = im.closest(".vcard__media");
    if(slide) slide.classList.add("has-error"); if(media){ media.classList.add("is-loaded"); if(slide && !slide.previousElementSibling) media.classList.add("no-photo"); }
  }, true);

  // ---- Пагинация (разметка эталона: мобильная и десктопная версии) ----
  function pageHref(p){ var q = stateToParams(); if(p > 1) q.set("page", String(p)); else q.delete("page"); var s = q.toString(); return location.pathname + (s ? "?" + s : ""); }
  function renderPager(data){
    var pager = document.getElementById("catPagerV1");
    if(!pager) return;
    var perPage = data.perPage || PER_PAGE, total = data.total || 0;
    // Elastic у провайдера листает не дальше 10 000 записей (416 стр. × 24). Как у эталона: на последней доступной странице —
    // «417» и «Следующая» открывают блок «Дальше страницы не листаются», плюс подсказка уточнить фильтры.
    var realLast = Math.max(1, Math.ceil(total / perPage));
    var last = Math.min(data.lastReachablePage || 416, realLast);
    var limited = realLast > last, atLimit = limited && state.page >= last;
    if(total <= perPage){ pager.innerHTML = ""; return; }
    var cur = state.page, from = (cur - 1) * perPage + 1, to = Math.min(total, cur * perPage);
    var pages = pagerPages(cur, last);
    var mob = pagerPagesMob(cur, last).map(function(p){
      if(p === "...") return '<span class="num inline-flex h-10 min-w-9 items-center justify-center rounded-xl px-2 text-[14px] font-medium min-w-6 px-0 text-ink-4" aria-hidden="true">…</span>';
      if(p === cur) return '<span class="num inline-flex h-10 min-w-9 items-center justify-center rounded-xl px-2 text-[14px] font-medium bg-brand-500/10 font-semibold text-brand-700" aria-current="page">' + p + '</span>';
      return '<a href="' + esc(pageHref(p)) + '" data-page="' + p + '" class="num inline-flex h-10 min-w-9 items-center justify-center rounded-xl px-2 text-[14px] font-medium text-ink-2 active:bg-ink/5" aria-label="' + esc(T("Страница")) + ' ' + p + '">' + p + '</a>';
    }).join("") + (atLimit ? '<button type="button" data-limit class="num inline-flex h-10 min-w-9 items-center justify-center rounded-xl px-2 text-[14px] font-medium text-ink-4 active:bg-ink/5" aria-label="' + esc(T("Страница")) + ' ' + (last + 1) + '">' + (last + 1) + '</button>' : "");
    var desk = pages.map(function(p){
      if(p === "...") return '<span class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold num transition duration-200 text-ink-4" aria-disabled="true">...</span>';
      if(p === cur) return '<span aria-current="page" class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold num transition duration-200 bg-ink text-surface shadow-sm">' + p + '</span>';
      return '<a href="' + esc(pageHref(p)) + '" data-page="' + p + '" class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold num transition duration-200 text-ink-3 hover:bg-surface hover:text-ink" aria-label="' + esc(T("Страница")) + ' ' + p + '">' + p + '</a>';
    }).join("") + (atLimit ? '<button type="button" data-limit class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold num transition duration-200 text-ink-4 hover:bg-surface hover:text-ink" aria-label="' + esc(T("Страница")) + ' ' + (last + 1) + '">' + (last + 1) + '</button>' : "");
    var prevMob = cur > 1 ? '<a href="' + esc(pageHref(cur - 1)) + '" data-page="' + (cur - 1) + '" rel="prev" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-surface text-ink-2 active:bg-ink/5" aria-label="' + esc(T("Предыдущая")) + '">' + I.arrL + '</a>'
      : '<span class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-surface text-ink-2 active:bg-ink/5 opacity-40" aria-disabled="true">' + I.arrL + '</span>';
    var nextMob = atLimit ? '<button type="button" data-limit class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-surface text-ink-2 active:bg-ink/5" aria-label="' + esc(T("Следующая")) + '">' + I.arrR + '</button>'
      : cur < last ? '<a href="' + esc(pageHref(cur + 1)) + '" data-page="' + (cur + 1) + '" rel="next" class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-surface text-ink-2 active:bg-ink/5" aria-label="' + esc(T("Следующая")) + '">' + I.arrR + '</a>'
      : '<span class="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-line-2 bg-surface text-ink-2 active:bg-ink/5 opacity-40" aria-disabled="true">' + I.arrR + '</span>';
    var prevDesk = cur > 1 ? '<a href="' + esc(pageHref(cur - 1)) + '" data-page="' + (cur - 1) + '" rel="prev" class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold num transition duration-200 w-9 border border-line-2 bg-surface px-0 text-ink-2 hover:border-ink/25 hover:text-ink" aria-label="' + esc(T("Предыдущая")) + '">' + I.chevL + '</a>'
      : '<span class="inline-flex h-9 min-w-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold num transition duration-200 w-9 px-0 text-ink-4 opacity-50" aria-disabled="true">' + I.chevL + '</span>';
    var nextArrow = '<svg class="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
    var nextDesk = atLimit ? '<button type="button" data-limit class="btn btn-dark btn-sm" aria-label="' + esc(T("Следующая")) + '"><span class="hidden sm:inline">' + esc(T("Следующая")) + ' &raquo;</span>' + nextArrow + '</button>'
      : cur < last ? '<a href="' + esc(pageHref(cur + 1)) + '" data-page="' + (cur + 1) + '" rel="next" class="btn btn-dark btn-sm" aria-label="' + esc(T("Следующая")) + '"><span class="hidden sm:inline">' + esc(T("Следующая")) + ' &raquo;</span>' + nextArrow + '</a>' : "";
    var limitHtml = atLimit ? '<p data-limit-note class="mt-4 flex items-start justify-center gap-2 text-[13px] leading-relaxed text-ink-3 sm:justify-start"><svg class="mt-0.5 h-4 w-4 shrink-0 text-ink-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>' + esc(T("Можно пролистать только первые 10 000 результатов. Уточните фильтры, чтобы увидеть остальные.")) + '</p>'
      + '<div data-limit-panel class="mt-5 flex flex-col gap-4 rounded-[18px] border border-line bg-surface-2 p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6" role="status" style="display:none"><span class="hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-500/10 text-brand-600 sm:grid" aria-hidden="true"><svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg></span>'
        + '<div class="min-w-0 flex-1"><h3 class="font-display text-[17px] font-semibold tracking-tight text-ink">' + esc(T("Дальше страницы не листаются")) + '</h3><p class="mt-1 max-w-2xl text-[14px] leading-relaxed text-ink-3">' + esc(T("Каталог листает не больше 10 000 машин подряд, а под ваш запрос подходит")) + ' <span class="num">' + fmtNum(total) + '</span>. ' + esc(T("Остальные откроются, если сузить поиск фильтрами: марка, модель, год или цена.")) + '</p></div>'
        + '<div class="flex shrink-0 flex-wrap gap-2"><button type="button" class="btn btn-dark btn-sm" data-limit-filters><svg class="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>' + esc(T("Уточнить фильтры")) + '</button><button type="button" class="btn btn-secondary btn-sm" data-limit-back>' + esc(T("Вернуться к страницам")) + '</button></div></div>' : "";
    pager.innerHTML = '<div class="pagination mt-6 border-t border-line pb-2 pt-5 sm:mt-8 sm:pb-0 sm:pt-6"><nav role="navigation" aria-label="Pagination Navigation" class="flex flex-col items-center justify-between gap-4 sm:flex-row">'
      + '<p class="order-2 hidden text-[13px] text-ink-3 sm:order-1 sm:block">' + esc(T("Показано с")) + ' <span class="num font-semibold text-ink">' + fmtNum(from) + '</span> ' + esc(T("до")) + ' <span class="num font-semibold text-ink">' + fmtNum(to) + '</span> ' + esc(T("из")) + ' <span class="num font-semibold text-ink">' + fmtNum(total) + '</span> ' + esc(T("результатов")) + '</p>'
      + '<div class="order-1 flex items-center gap-1 sm:hidden">' + prevMob + mob + nextMob + '</div>'
      + '<div class="order-1 hidden items-center gap-2 sm:order-2 sm:flex">' + prevDesk + '<div class="flex items-center gap-1.5 rounded-full bg-ink/[.05] p-1">' + desk + '</div>' + nextDesk + '</div>'
    + '</nav>' + limitHtml + '</div>';
  }
  // Телефон — как у эталона: «1 2 3 … N» / «1 … 4 5 6 … N» (полный ряд 1–6 не влезал в 390px)
  function pagerPagesMob(cur, last){
    var set = [1, last, cur - 1, cur, cur + 1];
    if(cur <= 2) set.push(2, 3);
    if(cur >= last - 1) set.push(last - 1, last - 2);
    var nums = set.filter(function(n){ return n >= 1 && n <= last; }).sort(function(a, b){ return a - b; }).filter(function(n, i, a){ return a.indexOf(n) === i; });
    var out = []; nums.forEach(function(n, i){ if(i && n - nums[i - 1] > 1) out.push("..."); out.push(n); }); return out;
  }
  function pagerPages(cur, last){
    if(last <= 7){ var all = []; for(var i = 1; i <= last; i++) all.push(i); return all; }
    var set = [1, last, cur];
    if(cur <= 4){ for(var j = 2; j <= 6; j++) set.push(j); }
    else if(cur >= last - 3){ for(var k = last - 5; k <= last - 1; k++) set.push(k); }
    else{ set.push(cur - 1, cur + 1); }
    var uniq = Array.from(new Set(set)).filter(function(n){ return n >= 1 && n <= last; }).sort(function(a, b){ return a - b; });
    var out = [];
    for(var q = 0; q < uniq.length; q++){ if(q > 0 && uniq[q] - uniq[q - 1] > 1) out.push("..."); out.push(uniq[q]); }
    return out;
  }
  document.getElementById("catPagerV1").addEventListener("click", function(e){
    var pg = e.currentTarget;
    if(e.target.closest("[data-limit]")){
      var note = pg.querySelector("[data-limit-note]"), panel = pg.querySelector("[data-limit-panel]");
      if(note) note.style.display = "none";
      if(panel){ panel.style.display = ""; pg.querySelectorAll("[data-limit].num").forEach(function(b){ b.classList.add("bg-surface", "text-ink", "shadow-sm"); }); panel.scrollIntoView({behavior:"smooth", block:"nearest"}); }
      return;
    }
    if(e.target.closest("[data-limit-back]")){
      var n2 = pg.querySelector("[data-limit-note]"), p2 = pg.querySelector("[data-limit-panel]");
      if(p2) p2.style.display = "none"; if(n2) n2.style.display = "";
      pg.querySelectorAll("[data-limit].num").forEach(function(b){ b.classList.remove("bg-surface", "text-ink", "shadow-sm"); });
      return;
    }
    if(e.target.closest("[data-limit-filters]")){
      if(window.matchMedia("(min-width: 1024px)").matches){ (document.querySelector(".catalog-sidebar") || document.body).scrollIntoView({behavior:"smooth", block:"start"}); }
      else openMobileFilters();
      return;
    }
    var a = e.target.closest("[data-page]"); if(!a) return;
    e.preventDefault();
    var p = parseInt(a.getAttribute("data-page"), 10); if(!isFinite(p) || p < 1) return;
    state.page = p; pushUrlForce(); search();
    var top = document.querySelector(".catalog-frame");
    if(top) window.scrollTo({top:top.getBoundingClientRect().top + window.scrollY - 80, behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  });

  // ---- Back/Forward ----
  window.addEventListener("popstate", function(){
    stateFromParams(new URLSearchParams(location.search));
    renderSections(); renderSortMenu(); renderHeadControls(); updateCrumbs(); updateHeroHeading();
    search();
  });

  // ---- Старт ----
  function boot(){
    stateFromParams(new URLSearchParams(location.search));
    renderSortMenu(); renderHeadControls(); renderSections(); updateCrumbs(); updateHeroHeading();
    loadRates();
    search();
    ensureBrands().then(function(){
      renderSections(); renderHeadControls(); updateCrumbs(); updateHeroHeading();
    });
  }
  boot();
})();
