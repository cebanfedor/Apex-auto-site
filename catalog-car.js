/* /catalog/<id> — страница автомобиля (Encar, api.auctionsapi.com).
   05.11.2026: разметка 1:1 с эталоном dev.autopartner.by/korea/<id> (.lot-*, .car-gallery*, .lot-rep*, .lot-hist*,
   .lot-tl*, .lot-tree*). Эталон на Alpine.js — здесь то же поведение на vanilla JS (CSP без unsafe-eval):
   галерея со свайпом/превью/лайтбоксом, избранное, «Поделиться», переключатель объявлений, липкая навигация
   с бегунком, схема кузова с зонами и подсказками, поиск по комплектации, график пробега, боковые панели
   «Полный отчёт»/«Хронология». Данные — наши (api/catalog.js), ничего не выдумываем: нет данных — нет блока.
   Арт (SVG схемы кузова/флаг/иконки) — catalog-car-art.js (window.APEX_LOT_ART). */
(function(){
  "use strict";
  var root = document.getElementById("catCarContentV1");
  if(!root) return;
  var ART = window.APEX_LOT_ART || {};

  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function fmtNum(n){ return Number(n || 0).toLocaleString("ru-RU").replace(/ /g, " "); }
  function lang(){ var l = window.APEX_LANG; return (l === "ro" || l === "en") ? "en" : "ru"; }
  function uiLang(){ return window.APEX_LANG || "ru"; }
  function plural(n, one, few, many){ n = Math.abs(n) % 100; var n1 = n % 10; if(n > 10 && n < 20) return many; if(n1 > 1 && n1 < 5) return few; if(n1 === 1) return one; return many; }

  var FUELS = {1:"Дизель",2:"Электро",3:"Гибрид",4:"Бензин",5:"Газ",6:"Гибкое топливо",7:"Водород",8:"Этанол"};
  var TRANSMISSIONS = {1:"АКПП",2:"МКПП"};
  var DRIVE_WHEELS = {1:"Задний",2:"Передний",3:"Полный"};
  var BODY_TYPES = {1:"Седан",2:"Универсал",3:"Купе",4:"Пикап",5:"Внедорожник",6:"Кабриолет",7:"Фургон",11:"Хэтчбек",12:"Родстер",13:"Лимузин",20:"Лифтбек",22:"Катафалк",27:"Спорткар"};
  var CONDITIONS = {1:"С пробегом",2:"Новый",3:"Повреждён"};
  var AVAIL = {1:"В наличии",2:"В пути",3:"Под заказ"};
  var SELLER_TYPE = {1:"Частное лицо",2:"Дилер"};
  var AIRBAG = {1:"Целые",2:"Сработавшие",3:"Отсутствуют"};
  var STEERING = {1:"Левый руль",2:"Правый руль"};
  var COLORS_MAP = {1:"Серебристый",2:"Пурпурный",3:"Оранжевый",4:"Зелёный",5:"Красный",6:"Золотой",8:"Коричневый",9:"Серый",10:"Бирюзовый",11:"Синий",12:"Бронзовый",13:"Белый",14:"Кремовый",15:"Черный",16:"Жёлтый",17:"Бежевый",18:"Розовый",100:"Двухцветный"};
  var COLOR_SWATCH = {1:"#c0c4c9",2:"#7c3aed",3:"#f59e0b",4:"#20b26b",5:"#c24135",6:"#d7a61d",8:"#8b552d",9:"#9ca3af",10:"#31c7c7",11:"#2d86c9",12:"#b77d37",13:"#ffffff",14:"#fff7d8",15:"#111111",16:"#f7ea13",17:"#f1e7ce",18:"#ee94bf"};
  var MARKET_ORIGIN = {1:"Европа",2:"США",3:"Китай",4:"Индия",5:"Япония",6:"Корея",8:"Великобритания",9:"Канада",10:"Турция",11:"Россия",12:"Южная Корея",13:"Таиланд",14:"Австралия",15:"Индонезия",16:"Ближний Восток",17:"Африка",18:"Тайвань",19:"Мексика",20:"Северная Корея",21:"Океания",22:"Азия",23:"Бразилия",24:"Южная Америка",25:"Северная Америка"};
  var BRAND_LOGO_SLUGS = {abarth:1,ac:1,acura:1,aixam:1,alfaromeo:1,alpina:1,alpine:1,alvis:1,arcfox:1,ariel:1,aro:1,astonmartin:1,audi:1,austin:1,autobianchi:1,baic:1,bentley:1,bertone:1,bestune:1,bitter:1,bmw:1,borgward:1,bowler:1,brabus:1,brilliance:1,bufori:1,bugatti:1,buick:1,byd:1,cadillac:1,caterham:1,changan:1,changfeng:1,chery:1,chevrolet:1,chrysler:1,citroen:1,cizeta:1,dacia:1,daewoo:1,daf:1,daihatsu:1,daimler:1,datsun:1,dayun:1,delage:1,desoto:1,dodge:1,dongfeng:1,donkervoort:1,ds:1,duesenberg:1,eagle:1,exeed:1,faw:1,ferrari:1,fiat:1,fisker:1,ford:1,foton:1,fso:1,gac:1,gaz:1,geely:1,genesis:1,geo:1,ginetta:1,gmc:1,gonow:1,greatwall:1,grinnall:1,hafei:1,haima:1,haval:1,hawtai:1,hennessey:1,holden:1,honda:1,hongqi:1,horch:1,hudson:1,hummer:1,hyundai:1,infiniti:1,irankhodro:1,isuzu:1,iveco:1,jaguar:1,jbamotors:1,jeep:1,jetta:1,kia:1,koenigsegg:1,ktm:1,lagonda:1,lamborghini:1,lancia:1,landrover:1,landwind:1,lexus:1,lifan:1,ligier:1,lincoln:1,lister:1,lixiang:1,lotus:1,lucid:1,luxgen:1,lynkco:1,mahindra:1,man:1,marlin:1,maserati:1,mastretta:1,maxus:1,maybach:1,mazda:1,mclaren:1,mercedesbenz:1,mercury:1,merkur:1,mg:1,microcar:1,mini:1,mitsubishi:1,mitsuoka:1,morgan:1,nio:1,nissan:1,noble:1,oldsmobile:1,opel:1,packard:1,pagani:1,panoz:1,pegaso:1,perodua:1,peugeot:1,plymouth:1,polestar:1,pontiac:1,porsche:1,premier:1,proton:1,qoros:1,ram:1,rambler:1,renault:1,rezvani:1,rimac:1,rinspeed:1,rivian:1,roewe:1,rollsroyce:1,ronart:1,rover:1,saab:1,saipa:1,saturn:1,scania:1,scion:1,seat:1,simca:1,singulato:1,skoda:1,smart:1,soueast:1,spyker:1,ssangyong:1,studebaker:1,stutz:1,subaru:1,suzuki:1,talbot:1,tata:1,tatra:1,tesla:1,toyota:1,tramontana:1,triumph:1,tucker:1,tvr:1,uaz:1,ultima:1,vauxhall:1,venucia:1,vinfast:1,volkswagen:1,volvo:1,wanderer:1,wartburg:1,weltmeister:1,westfield:1,wey:1,wiesmann:1,wmotors:1,workhorse:1,xpeng:1,yulon:1,zaz:1,zenvo:1,zotye:1};
  function logoHtml(name){
    var slug = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if(BRAND_LOGO_SLUGS[slug]) return '<img src="/assets/brand-logos/' + slug + '.webp" alt="" width="24" height="18" loading="lazy" decoding="async" class="cf-logo">';
    return '<span class="cf-logo cf-logo--letter" aria-hidden="true">' + esc(String(name || "?").slice(0, 1).toUpperCase()) + '</span>';
  }

  // ---- Иконки (из разметки эталона) ----
  function ico(d, cls){ return '<svg class="' + (cls || "h-4 w-4") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var I = {
    check: ico('<path d="M20 6 9 17l-5-5"/>'),
    warn: ico('<path d="M12 6.5v7M12 17.5h.01"/>'),
    minus: ico('<path d="M5 12h14"/>'),
    chev: ico('<path d="m6 9 6 6 6-6"/>', "h-4 w-4 lot-switch__chev h-3.5 w-3.5"),
    chevDown: ico('<path d="m6 9 6 6 6-6"/>'),
    chevR: ico('<path d="m9 18 6-6-6-6"/>'),
    arrR: ico('<path d="M5 12h14M13 6l6 6-6 6"/>', "h-4 w-4 h-3.5 w-3.5"),
    arrR4: ico('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    x: ico('<path d="M18 6 6 18M6 6l12 12"/>'),
    prev: ico('<path d="m15 18-6-6 6-6"/>'),
    next: ico('<path d="m9 18 6-6-6-6"/>'),
    cal: ico('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/>', "h-4 w-4 h-3.5 w-3.5"),
    odo: ico('<path d="M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 11l3-3M3.3 17a10 10 0 1 1 17.4 0"/>', "h-4 w-4 h-3.5 w-3.5"),
    odoChip: ico('<path d="M12 13a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 11l3-3M3.3 17a10 10 0 1 1 17.4 0"/>'),
    fuel: ico('<path d="M3 22V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v17M3 22h12M7 9h4M15 9h2.5a1.5 1.5 0 0 1 1.5 1.5V17a2 2 0 0 0 4 0V8l-3-3"/>', "h-4 w-4 h-3.5 w-3.5"),
    trans: ico('<path d="M6 4v16M18 4v6M6 12h12M18 14v6"/>', "h-4 w-4 h-3.5 w-3.5"),
    clock: ico('<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2"/>', "h-4 w-4 h-3.5 w-3.5"),
    history: ico('<path d="M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"/>'),
    historyBig: ico('<path d="M12 8v4l3 3M3.05 11a9 9 0 1 1 .5 4M3 4v5h5"/>', "h-4 w-4 h-5 w-5"),
    shield: ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/>'),
    shieldBig: ico('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4"/>', "h-4 w-4 h-5 w-5"),
    layers: ico('<path d="m12 2 10 5-10 5L2 7zM2 12l10 5 10-5M2 17l10 5 10-5"/>'),
    list: ico('<path d="M4 6h10M4 12h12M4 18h8M18 6h2M18 12h2M18 18h2"/>'),
    owners: ico('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
    chat: ico('<path d="M21 12a8 8 0 0 1-11.9 7L3 21l2-6A8 8 0 1 1 21 12z"/>'),
    search: ico('<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"/>', "h-4 w-4 h-4 w-4 text-ink-4"),
    searchBig: ico('<path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3"/>', "h-4 w-4 h-5 w-5"),
    tick: ico('<path d="M20 6 9 17l-5-5"/>', "h-4 w-4 lot-options__tick h-3.5 w-3.5"),
    doc: ico('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>', "h-4 w-4 h-5 w-5"),
    bolt: ico('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
    car: ico('<path d="M5 17h14M4 13.5 5.6 8.6A2 2 0 0 1 7.5 7.2h9a2 2 0 0 1 1.9 1.4l1.6 4.9V17H4z"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>'),
    seat: ico('<path d="M7 18v-6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v6M5 18h14M9 10V5h6v5"/>'),
    sun: ico('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', "h-4 w-4 h-[18px] w-[18px]"),
    wind: ico('<path d="M9.6 4.6A2 2 0 1 1 11 8H2M12.6 19.4A2 2 0 1 0 14 16H2M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/>', "h-4 w-4 h-[18px] w-[18px]"),
    wheel: ico('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M4.5 15l5.5-1.8M19.5 15l-5.5-1.8"/>', "h-4 w-4 h-[18px] w-[18px]"),
    sensor: ico('<path d="M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0M12 12v8"/>', "h-4 w-4 h-[18px] w-[18px]"),
    camera: ico('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', "h-4 w-4 h-[18px] w-[18px]"),
    nav: ico('<path d="M3 11l19-9-9 19-2-8z"/>', "h-4 w-4 h-[18px] w-[18px]"),
    key: ico('<path d="M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l2.1-2.1A4 4 0 0 1 15 7z"/>', "h-4 w-4 h-[18px] w-[18px]"),
    cruise: ico('<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 12l4-4"/>', "h-4 w-4 h-[18px] w-[18px]"),
    star: ico('<path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 3 1.1-6.2L3 9.7l6.2-.9z"/>', "h-4 w-4 h-[18px] w-[18px]"),
    globe: ico('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>', "h-4 w-4 h-3.5 w-3.5"),
    eye: ico('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', "h-4 w-4 h-3.5 w-3.5"),
    copy: ico('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>', "h-4 w-4 h-3.5 w-3.5")
  };

  // ---- Курс для цен в $ (как у эталона: главная цена в $, под ней — в KRW) ----
  var rates = {usdKrw:0, usdEur:0};
  function fetchRates(){
    return fetch("https://api.frankfurter.app/latest?from=USD&to=KRW,EUR").then(function(r){ return r.json(); })
      .catch(function(){ return fetch("https://api.fxratesapi.com/latest?base=USD&currencies=KRW,EUR").then(function(r){ return r.json(); }); });
  }
  function loadRates(){
    try{ var c = JSON.parse(localStorage.getItem("apexKrwRateV1") || "null"); if(c && c.t && Date.now() - c.t < 12 * 3600e3 && c.krw){ rates.usdKrw = c.krw; rates.usdEur = c.eur || 0; } }catch(e){}
    return fetchRates().then(function(d){
      if(d && d.rates && d.rates.KRW){ rates.usdKrw = d.rates.KRW; rates.usdEur = d.rates.EUR || 0; try{ localStorage.setItem("apexKrwRateV1", JSON.stringify({t:Date.now(), krw:rates.usdKrw, eur:rates.usdEur})); }catch(e){} }
    }).catch(function(){});
  }
  function toUsd(amount, cur){
    cur = String(cur || "").toLowerCase();
    if(cur === "usd") return amount;
    if(cur === "krw" && rates.usdKrw) return amount / rates.usdKrw;
    if(cur === "eur" && rates.usdEur) return amount / rates.usdEur;
    return null;
  }
  function moneyParts(amount, cur){
    cur = String(cur || "").toUpperCase();
    var usd = toUsd(amount, cur);
    if(usd != null && cur !== "USD") return {main:fmtNum(Math.round(usd)) + " $", sub:fmtNum(amount) + " " + cur};
    if(cur === "USD") return {main:fmtNum(amount) + " $", sub:""};
    return {main:fmtNum(amount) + " " + cur, sub:""};
  }
  function usdApprox(amount, cur){ var u = toUsd(amount, cur); return u != null ? "≈ " + fmtNum(Math.round(u)) + " $" : fmtNum(amount) + " " + String(cur || "").toUpperCase(); }
  function listingPrice(listing){
    if(!listing) return null;
    var cur = listing.price && listing.price.currency && listing.price.currency.name;
    if(listing.is_auction && listing.current_bid != null) return {amount:listing.current_bid, cur:cur, label:T("Текущая ставка")};
    if(listing.price && listing.price.price > 0) return {amount:listing.price.price, cur:cur, label:T("Цена")};
    if(listing.current_bid != null) return {amount:listing.current_bid, cur:cur, label:T("Текущая ставка")};
    return null;
  }

  // ---- Данные ----
  var m = location.pathname.match(/^\/catalog\/([^/?#]+)/);
  var carId = m ? decodeURIComponent(m[1]) : "";
  var qp = new URLSearchParams(location.search);
  var refDomainId = qp.get("domain_id"), refListingId = qp.get("listing_id");
  var state = {car:null, listing:null, photos:[], galIdx:0, options:null};

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
  function imageUrl(img){ return img.original || img.downloaded || img.preview || ""; }
  function titleOf(car, listing){
    var brand = car.brand && car.brand.name, model = car.model && car.model.name;
    if(brand || model) return [car.year, brand, model].filter(Boolean).join(" ");
    var tm = listing && listing.title;
    if(tm && typeof tm === "object"){ var l = lang(); return tm[l] || tm.en || tm.ru || Object.values(tm)[0] || T("Автомобиль"); }
    return T("Автомобиль");
  }
  function listingHref(car, l){
    var p = new URLSearchParams();
    if(l && l.external){ p.set("domain_id", l.external.domain.id); p.set("listing_id", l.external.id); }
    return "/catalog/" + encodeURIComponent(car.id) + (p.toString() ? "?" + p.toString() : "");
  }
  function pageUrl(){ return location.origin + location.pathname + location.search; }
  function matchingReports(list){
    var listing = state.listing;
    if(!listing || !listing.external) return [];
    var own = (list || []).filter(function(r){ var ref = r.vehicle_ref; return ref && String(ref.domain_id) === String(listing.external.domain.id) && String(ref.listing_id) === String(listing.external.id); });
    // Отчёт может быть привязан к другому объявлению той же машины (тот же VIN, повторное размещение) — как у эталона,
    // показываем его и тогда; свои отчёты объявления идут первыми.
    return own.length ? own : (list || []).slice();
  }
  function term(report, category, key){
    if(!key) return null;
    var terms = report && report.translations && report.translations.terms;
    var cat = terms && typeof terms === "object" && terms[category];
    return (cat && typeof cat === "object" && cat[key]) || null;
  }
  function humanizeKey(k){ k = String(k || "").replace(/_/g, " "); return k.charAt(0).toUpperCase() + k.slice(1); }
  function termOr(report, category, key, fallback){ return term(report, category, key) || fallback || humanizeKey(key); }
  function fmtDate(iso){ if(!iso) return ""; var d = new Date(iso); if(isNaN(d.getTime())) return String(iso).slice(0, 10); return d.toLocaleDateString("ru-RU", {year:"numeric", month:"short", day:"numeric"}).replace(/\.$/, "").replace(" г.", ""); }
  function fmtDayMon(iso){ var d = new Date(iso); if(isNaN(d.getTime())) return ""; return d.toLocaleDateString("ru-RU", {month:"short", day:"numeric", timeZone:"UTC"}).replace(/\.$/, ""); }
  function fmtDatePrecise(iso, precision){
    if(!iso) return "";
    var d = new Date(iso); if(isNaN(d.getTime())) return "";
    if(precision === "year") return String(d.getUTCFullYear());
    if(precision === "month"){ var s = d.toLocaleDateString("ru-RU", {month:"long", timeZone:"UTC"}); return s.charAt(0).toUpperCase() + s.slice(1); }
    return d.toLocaleDateString("ru-RU", {month:"short", day:"numeric", timeZone:"UTC"}).replace(/\.$/, "");
  }
  function fmtMonthYear(car){ if(!car.year) return ""; return car.month ? (String(car.month).padStart(2, "0") + "." + car.year) : String(car.year); }
  function agoText(iso){
    if(!iso) return ""; var d = new Date(iso); if(isNaN(d.getTime())) return "";
    var mins = Math.floor((Date.now() - d) / 60000);
    if(mins < 1) return T("Обновлено только что");
    if(mins < 60) return T("Обновлено") + " " + mins + " " + plural(mins, T("минуту"), T("минуты"), T("минут")) + " " + T("назад");
    var h = Math.floor(mins / 60);
    if(h < 24) return T("Обновлено") + " " + h + " " + plural(h, T("час"), T("часа"), T("часов")) + " " + T("назад");
    var days = Math.floor(h / 24);
    if(days < 30) return T("Обновлено") + " " + days + " " + plural(days, T("день"), T("дня"), T("дней")) + " " + T("назад");
    return T("Обновлено") + " " + fmtDate(iso);
  }
  function placeOf(listing){ var ld = listing && listing.location_details; if(!ld) return ""; return [ld.district && ld.district.name, ld.region && ld.region.name, ld.country && ld.country.name].filter(Boolean).join(", "); }

  // ---- Избранное (localStorage) ----
  function favLoad(){ try{ return JSON.parse(localStorage.getItem("apexCatFavV1") || "{}") || {}; }catch(e){ return {}; } }
  function favHas(id){ return !!favLoad()[id]; }
  function favToggle(id, info){ var f = favLoad(); if(f[id]) delete f[id]; else f[id] = info; try{ localStorage.setItem("apexCatFavV1", JSON.stringify(f)); }catch(e){} return !!f[id]; }
  function favBtnHtml(cls){
    var on = favHas(state.car.id);
    return '<button type="button" class="fav-btn ' + cls + (on ? " is-on" : "") + '" data-fav aria-pressed="' + (on ? "true" : "false") + '" aria-label="' + esc(on ? T("Убрать из избранного") : T("Добавить в избранное")) + '">' + (ART.fav || I.star) + '<span class="fav-btn__sparks" aria-hidden="true"><i style="--a: 30deg"></i><i style="--a: 90deg"></i><i style="--a: 150deg"></i><i style="--a: 210deg"></i><i style="--a: 270deg"></i><i style="--a: 330deg"></i></span></button>';
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-fav]"); if(!b || !state.car) return;
    e.preventDefault(); e.stopPropagation();
    var photo = state.photos[0] || "";
    var on = favToggle(state.car.id, {id:state.car.id, url:pageUrl(), title:titleOf(state.car, state.listing), image:photo});
    document.querySelectorAll("[data-fav]").forEach(function(x){
      x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", on ? "true" : "false"); x.setAttribute("aria-label", on ? T("Убрать из избранного") : T("Добавить в избранное"));
      x.classList.remove("is-burst", "is-unburst"); void x.offsetWidth; x.classList.add(on ? "is-burst" : "is-unburst"); setTimeout(function(){ x.classList.remove("is-burst", "is-unburst"); }, 750);
    });
  });

  // ---- Копирование + тост ----
  var toastEl = null, toastTimer = null;
  function toast(msg){
    if(!toastEl){ toastEl = document.createElement("div"); toastEl.className = "lot-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("is-shown");
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ toastEl.classList.remove("is-shown"); }, 1800);
  }
  window.toast = toast;
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-copy]"); if(!b) return;
    e.preventDefault();
    var v = b.getAttribute("data-copy");
    if(navigator.clipboard) navigator.clipboard.writeText(v).then(function(){ toast(b.getAttribute("data-copy-message") || T("Скопировано")); }).catch(function(){});
  });

  // ---- Загрузка ----
  function load(){
    loadRates().then(function(){
      return fetch(apiUrl()).then(function(r){ return r.json().then(function(d){ return {ok:r.ok, data:d}; }); });
    }).then(function(res){
      if(!res.ok || !res.data || !res.data.car){ showNotFound(); return; }
      state.car = res.data.car;
      state.listing = pickListing(state.car);
      state.photos = (state.listing && Array.isArray(state.listing.images) ? state.listing.images.map(imageUrl) : []).filter(Boolean);
      render();
    }).catch(function(){ showNotFound(); });
  }
  function showNotFound(){
    document.getElementById("catCarLoadingV1").hidden = true;
    document.getElementById("catCarNotFoundV1").hidden = false;
    document.getElementById("main").setAttribute("aria-busy", "false");
  }

  function render(){
    var car = state.car, listing = state.listing;
    document.getElementById("catCarLoadingV1").hidden = true;
    root.hidden = false;
    document.getElementById("main").setAttribute("aria-busy", "false");
    var title = titleOf(car, listing);
    document.title = title + (car.badge ? " " + car.badge : "") + " | Apex Auto";
    renderCrumbs();
    renderHead();
    renderGallery();
    renderInfo();
    renderBuy();
    renderBelow();
    renderExtras();
  }

  // ============ Крошки ============
  function renderCrumbs(){
    var el = document.getElementById("catCrumbsV1"), car = state.car;
    var sep = '<svg class="crumb-sep" aria-hidden="true" fill="none" viewBox="0 0 6 10"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" d="m1 9 4-4-4-4"/></svg>';
    var parts = ['<a href="/" class="crumb crumb--home" aria-label="' + esc(T("Главная")) + '"><svg class="h-[15px] w-[15px]" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5h-6V20H5a1 1 0 0 1-1-1z"/></svg></a>',
      '<a href="/catalog" class="crumb">' + esc(T("Авто из Кореи")) + '</a>'];
    if(car.brand){ var bp = new URLSearchParams(); bp.set("brand_id", car.brand.id); parts.push('<a href="/catalog?' + bp.toString() + '" class="crumb" data-no-i18n="true">' + esc(car.brand.name) + '</a>'); }
    if(car.brand && car.model){ var mp = new URLSearchParams(); mp.set("brand_id", car.brand.id); mp.set("model_id", car.brand.id + ":" + car.model.id); parts.push('<a href="/catalog?' + mp.toString() + '" class="crumb" data-no-i18n="true">' + esc(car.model.name) + '</a>'); }
    parts.push('<span class="crumb-current" data-no-i18n="true">' + esc(titleOf(car, state.listing)) + '</span>');
    el.innerHTML = parts.join(sep);
  }

  // ============ Шапка лота ============
  function renderHead(){
    var car = state.car, listing = state.listing, listings = car.listings || [];
    var title = titleOf(car, listing);
    var url = pageUrl(), shareText = title;
    var shareLinks = [
      ["Telegram", "https://t.me/share/url?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(shareText)],
      ["WhatsApp", "https://api.whatsapp.com/send?text=" + encodeURIComponent(shareText + " " + url)],
      ["VK", "https://vk.com/share.php?url=" + encodeURIComponent(url) + "&title=" + encodeURIComponent(shareText)],
      ["Facebook", "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url)],
      ["Почта", "mailto:?subject=" + encodeURIComponent(shareText) + "&body=" + encodeURIComponent(url)]
    ];
    var shareIcons = ART.shareIcons || {};
    var shareHtml = '<div class="lot-share" id="lotShareV1">'
      + '<button type="button" class="lot-icon-btn" data-share-toggle aria-haspopup="true" aria-expanded="false" aria-label="' + esc(T("Поделиться")) + '" title="' + esc(T("Поделиться")) + '">' + (ART.share || I.arrR4) + '</button>'
      + '<div class="lot-share__panel" style="display:none">'
        + '<p class="lot-share__title">' + esc(T("Поделиться")) + '</p>'
        + '<ul class="lot-share__grid">' + shareLinks.map(function(s){ var ic = shareIcons[s[0]] || {color:"#64748b", svg:I.globe}; return '<li><a href="' + esc(s[1]) + '" target="_blank" rel="noopener noreferrer nofollow" class="lot-share__item" data-share-close><span class="lot-share__icon" style="background: ' + ic.color + '">' + ic.svg + '</span>' + esc(T(s[0])) + '</a></li>'; }).join("") + '</ul>'
        + '<div class="lot-share__link"><span class="lot-share__url" title="' + esc(url) + '" data-no-i18n="true">' + esc(url.replace(/^https?:\/\//, "")) + '</span><button type="button" class="lot-share__copy" data-copy="' + esc(url) + '" data-copy-message="' + esc(T("Ссылка скопирована")) + '">' + (ART.copy || I.copy) + esc(T("Копировать")) + '</button></div>'
        + (navigator.share ? '<button type="button" class="lot-share__native" data-share-native>' + (ART.share || "") + esc(T("Другие приложения")) + '</button>' : "")
      + '</div></div>';

    var chips = '<span class="lot-head__flag" title="' + esc(T("Корея")) + '">' + (ART.flag || "🇰🇷") + '</span>';
    var domainName = listing && listing.external && listing.external.domain && listing.external.domain.name || "Encar";
    var domainHost = listing && listing.external && listing.external.url ? String(listing.external.url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "encar.com";
    if(listings.length > 1){
      var sites = new Set(listings.map(function(l){ return l.external && l.external.domain.id; })).size;
      var countText = listings.length + " " + plural(listings.length, T("объявление"), T("объявления"), T("объявлений")) + " · " + sites + " " + plural(sites, T("площадка"), T("площадки"), T("площадок"));
      chips += '<div class="lot-switch-group"><div class="lot-switch" id="lotSwitchV1">'
        + '<button type="button" class="lot-switch__toggle" data-switch-toggle aria-haspopup="dialog" aria-expanded="false"><span class="lot-switch__current" title="' + esc(domainHost) + '" data-no-i18n="true">' + esc(domainName) + '</span>' + I.chev + '</button>'
        + '<div class="fixed inset-0 z-[65] bg-panel/55 sm:hidden" data-switch-veil style="display:none" aria-hidden="true"></div>'
        + '<div role="dialog" aria-label="' + esc(T("Объявления")) + '" class="lot-switch__panel" data-switch-panel style="display:none">'
          + '<div class="lot-switch__head"><span class="sheet-grip sm:hidden" aria-hidden="true"></span><p class="lot-switch__title" data-no-i18n="true">' + esc(countText) + '</p><button type="button" data-switch-close class="sheet-close sm:hidden" aria-label="' + esc(T("Закрыть")) + '">' + I.x + '</button></div>'
          + '<div class="cf-scroll-frame flex min-h-0 flex-1 flex-col"><ul class="lot-switch__list">' + listings.map(function(l){
              var pr = listingPrice(l), mp = pr ? moneyParts(pr.amount, pr.cur) : null;
              var isCur = l === listing;
              var img = Array.isArray(l.images) && l.images.length ? imageUrl(l.images[0]) : "";
              var when = l.archived ? (T("Снято") + " · " + fmtDayMon(l.last_seen_at || l.updated_at)) : (T("Активно") + " · " + T("с") + " " + fmtDayMon(l.created_at || l.updated_at));
              return '<li><a href="' + esc(listingHref(car, l)) + '" class="lot-switch__row' + (isCur ? " is-shown" : "") + (l.archived ? " is-archived" : "") + '"' + (isCur ? ' aria-current="page" data-switch-close' : "") + '>'
                + '<span class="lot-switch__thumb">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + '</span>'
                + '<span class="min-w-0 flex-1"><span class="lot-switch__site"><span class="lot-switch__status"></span><span class="truncate" data-no-i18n="true">' + esc(l.external && l.external.domain.name || "") + '</span></span><span class="lot-switch__meta" data-no-i18n="true">' + esc(when) + '</span></span>'
                + (mp ? '<span class="lot-switch__price" title="' + esc(mp.sub) + '" data-no-i18n="true"><span class="num">' + esc(mp.main) + '</span>' + (mp.sub ? '<small class="num">' + esc(mp.sub) + '</small>' : "") + '</span>' : "")
                + '<span class="lot-switch__tick">' + (isCur ? I.check : "") + '</span></a></li>';
            }).join("") + '</ul></div>'
          + '<div class="lot-switch__foot"><a href="#listings" class="lot-switch__all" data-go="listings" data-switch-close>' + esc(T("Сравнить все объявления")) + I.arrR + '</a></div>'
        + '</div></div>'
        + '<span class="lot-switch-group__line" aria-hidden="true"></span>'
        + '<a href="#listings" class="lot-switch-count" data-go="listings" data-no-i18n="true">' + esc(countText) + I.arrR + '</a></div>';
    }else{
      chips += '<span class="lot-chip" title="' + esc(domainHost) + '">' + I.globe + '<span data-no-i18n="true">' + esc(domainName) + '</span></span>';
    }
    var myd = fmtMonthYear(car);
    if(myd) chips += '<span class="lot-chip" title="' + esc(T("Дата выпуска")) + '" data-no-i18n="true">' + I.cal + esc(myd) + '</span>';
    if(listing && listing.odometer != null) chips += '<span class="lot-chip" title="' + esc(T("Пробег")) + '" data-no-i18n="true">' + I.odo + esc(fmtNum(listing.odometer)) + ' ' + esc(T("км")) + '</span>';
    if(car.fuel) chips += '<span class="lot-chip" title="' + esc(T("Топливо")) + '">' + I.fuel + esc(T(FUELS[car.fuel.id] || car.fuel.name)) + '</span>';
    if(car.transmission) chips += '<span class="lot-chip" title="' + esc(T("Трансмиссия")) + '">' + I.trans + esc(T(TRANSMISSIONS[car.transmission.id] || car.transmission.name)) + '</span>';
    var upd = listing && (listing.last_seen_at || listing.updated_at);
    if(upd) chips += '<span class="lot-head__seen" title="' + esc(new Date(upd).toLocaleString("ru-RU")) + '" data-no-i18n="true">' + I.clock + esc(agoText(upd)) + '</span>';

    document.getElementById("lotHeadV1").innerHTML = '<div class="min-w-0 flex-1">'
      + '<h1><span class="lot-head__title" data-no-i18n="true">' + esc(title) + '</span>' + (car.badge ? ' <span class="lot-head__trim" data-no-i18n="true">' + esc(car.badge) + '</span>' : "") + '</h1>'
      + (car.vin ? '<button type="button" class="lot-head__vin" data-copy="' + esc(String(car.vin).toUpperCase()) + '" data-copy-message="' + esc(T("VIN скопирован")) + '" aria-label="' + esc(T("Скопировать VIN")) + '"><span class="lot-head__vin-label">VIN</span><span class="num" data-no-i18n="true">' + esc(String(car.vin).toUpperCase()) + '</span>' + (ART.copy || I.copy) + '</button>' : "")
      + '</div>'
      + '<div class="lot-head__actions">' + favBtnHtml("lot-icon-btn") + shareHtml + '</div>'
      + '<div class="lot-chips">' + chips + '</div>';
  }
  // Поделиться / переключатель объявлений — открытие/закрытие
  document.addEventListener("click", function(e){
    var share = document.getElementById("lotShareV1");
    if(share){
      var panel = share.querySelector(".lot-share__panel"), btn = share.querySelector("[data-share-toggle]");
      if(e.target.closest("[data-share-toggle]") && share.contains(e.target)){ var open = panel.style.display === "none"; panel.style.display = open ? "" : "none"; btn.classList.toggle("is-open", open); btn.setAttribute("aria-expanded", open ? "true" : "false"); return; }
      if(e.target.closest("[data-share-native]")){ navigator.share({title:titleOf(state.car, state.listing), url:pageUrl()}).catch(function(){}); panel.style.display = "none"; btn.classList.remove("is-open"); return; }
      if(e.target.closest("[data-share-close]") || !share.contains(e.target)){ panel.style.display = "none"; btn.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); }
    }
    var sw = document.getElementById("lotSwitchV1");
    if(sw){
      var sp = sw.querySelector("[data-switch-panel]"), sv = sw.querySelector("[data-switch-veil]"), st = sw.querySelector("[data-switch-toggle]");
      function setSw(open){ sp.style.display = open ? "" : "none"; sv.style.display = open ? "" : "none"; st.classList.toggle("is-open", open); st.setAttribute("aria-expanded", open ? "true" : "false"); document.documentElement.classList.toggle("max-sm:overflow-hidden", open); }
      if(e.target.closest("[data-switch-toggle]") && sw.contains(e.target)){ setSw(sp.style.display === "none"); return; }
      if(e.target.closest("[data-switch-close]") || e.target === sv || !sw.contains(e.target)) setSw(false);
    }
    var go = e.target.closest("[data-go]");
    if(go){ e.preventDefault(); scrollToSection(go.getAttribute("data-go")); }
  });

  // ============ Галерея ============
  var gal = {idx:0, cap:18, capPhone:12};
  function phone(){ return window.matchMedia("(max-width: 639px)").matches; }
  function fineHover(){ return window.matchMedia("(hover:hover) and (pointer:fine)").matches; }
  function renderGallery(){
    var photos = state.photos, n = photos.length, title = titleOf(state.car, state.listing);
    var cap = phone() ? gal.capPhone : gal.cap;
    var hidden = n <= cap ? 0 : n - cap + 1;
    var slides = photos.map(function(u, i){
      return '<button type="button" class="car-gallery__slide' + (i === 0 ? " is-on" : "") + '" data-index="' + i + '" data-gal-open="' + i + '" aria-label="' + esc(T("Фото")) + ' ' + (i + 1) + ' ' + esc(T("из")) + ' ' + n + '"><img ' + (i < 2 ? 'src="' + esc(u) + '"' + (i === 0 ? ' fetchpriority="high"' : "") : 'data-src="' + esc(u) + '"') + ' alt="' + esc(title) + ', ' + (i + 1) + '" width="1600" height="1200" decoding="async" referrerpolicy="no-referrer" draggable="false"></button>';
    }).join("");
    var thumbs = photos.map(function(u, i){
      var shown = hidden === 0 || i < cap - 1;
      return '<button type="button" class="car-gallery__thumb' + (i === 0 ? " is-on" : "") + '" data-index="' + i + '" data-gal-thumb="' + i + '"' + (shown ? "" : ' style="display:none"') + ' aria-label="' + esc(T("Фото")) + ' ' + (i + 1) + ' ' + esc(T("из")) + ' ' + n + '"><img src="' + esc(u) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" draggable="false"></button>';
    }).join("");
    var more = hidden > 0 ? '<button type="button" class="car-gallery__more" data-gal-open="' + (cap - 1) + '" aria-label="' + esc(T("Открыть фото на весь экран")) + '"><img src="' + esc(photos[cap - 1]) + '" alt="" loading="lazy" referrerpolicy="no-referrer"><span class="num">+<span>' + hidden + '</span></span></button>' : "";
    document.getElementById("lotAsideV1").innerHTML = '<div class="car-gallery lot-gallery" id="carGalleryV1" tabindex="0">'
      + '<div class="car-gallery__stage">'
        + '<div class="car-gallery__track" data-gal-track>' + slides + '</div>'
        + (n > 1 ? '<div><button type="button" class="car-gallery__arrow car-gallery__arrow--prev" data-gal-step="-1" aria-label="' + esc(T("Предыдущее фото")) + '">' + I.prev + '</button><button type="button" class="car-gallery__arrow car-gallery__arrow--next" data-gal-step="1" aria-label="' + esc(T("Следующее фото")) + '">' + I.next + '</button></div>' : "")
        + (n > 1 ? '<span class="car-gallery__counter num"><span data-gal-idx>1</span> / <span>' + n + '</span></span>' : "")
        + favBtnHtml("lot-gallery__fav")
        + (n === 0 ? '<div class="car-gallery__empty">' + esc(T("Фото скоро появятся")) + '</div>' : "")
      + '</div>'
      + (n > 1 ? '<div class="car-gallery__thumbs">' + thumbs + more + '</div>' : "")
    + '</div>';
    gal.idx = 0;
  }
  function galTrack(){ return document.querySelector("[data-gal-track]"); }
  function galSwiping(){ var t = galTrack(); return !!t && t.scrollWidth > t.clientWidth + 4; }
  function galReveal(i){ var t = galTrack(); if(!t) return; [i - 1, i, i + 1].forEach(function(k){ var im = t.querySelector('[data-index="' + k + '"] img'); if(im && im.getAttribute("data-src")){ im.src = im.getAttribute("data-src"); im.removeAttribute("data-src"); } }); }
  function galGo(i, fromScroll){
    var n = state.photos.length; if(!n) return;
    i = (i + n) % n;
    galReveal(i);
    var t = galTrack();
    if(galSwiping() && !fromScroll){ var s = t.querySelector('[data-index="' + i + '"]'); t.scrollTo({left:s ? s.offsetLeft : 0, behavior:"smooth"}); }
    if(!galSwiping()){
      t.querySelectorAll(".car-gallery__slide").forEach(function(s){ var k = parseInt(s.getAttribute("data-index"), 10); s.classList.toggle("is-on", k === i); s.classList.toggle("is-leaving", k === gal.idx && k !== i); });
      setTimeout(function(){ t.querySelectorAll(".is-leaving").forEach(function(s){ s.classList.remove("is-leaving"); }); }, 400);
    }
    gal.idx = i;
    var c = document.querySelector("[data-gal-idx]"); if(c) c.textContent = String(i + 1);
    document.querySelectorAll("[data-gal-thumb]").forEach(function(b){ b.classList.toggle("is-on", parseInt(b.getAttribute("data-gal-thumb"), 10) === i); });
  }
  document.addEventListener("click", function(e){
    var st = e.target.closest("[data-gal-step]"); if(st){ galGo(gal.idx + parseInt(st.getAttribute("data-gal-step"), 10)); return; }
    var th = e.target.closest("[data-gal-thumb]"); if(th){ var k = parseInt(th.getAttribute("data-gal-thumb"), 10); if(galSwiping()) galGo(k); else openLightbox(state.photos, k); return; }
    var op = e.target.closest("[data-gal-open]"); if(op){ openLightbox(state.photos, parseInt(op.getAttribute("data-gal-open"), 10)); return; }
  });
  document.addEventListener("mouseover", function(e){ var th = e.target.closest && e.target.closest("[data-gal-thumb]"); if(th && fineHover()) galGo(parseInt(th.getAttribute("data-gal-thumb"), 10)); });
  document.addEventListener("scroll", function(e){
    var t = e.target; if(!t || !t.hasAttribute || !t.hasAttribute("data-gal-track") || !t.clientWidth) return;
    var i = Math.round(t.scrollLeft / t.clientWidth); if(i !== gal.idx) galGo(i, true);
  }, true);
  document.addEventListener("keydown", function(e){
    var g = document.getElementById("carGalleryV1"); if(!g || !g.contains(document.activeElement)) return;
    if(e.key === "ArrowLeft"){ e.preventDefault(); galGo(gal.idx - 1); } if(e.key === "ArrowRight"){ e.preventDefault(); galGo(gal.idx + 1); }
  });

  // ---- Лайтбокс (зум двойным кликом/колесом/пинчем, как на /auctions) ----
  var lb = {images:[], idx:0, zoom:1, panX:0, panY:0, dragging:false, startX:0, startY:0, pinchDist:0, pinchZoom:1}, lbEl = null;
  function ensureLightbox(){
    if(lbEl) return lbEl;
    var el = document.createElement("div"); el.className = "lot-lb"; el.hidden = true; el.tabIndex = -1;
    el.innerHTML = '<button type="button" class="lot-lb__close" aria-label="' + esc(T("Закрыть")) + '">' + I.x + '</button><button type="button" class="lot-lb__arr lot-lb__prev" aria-label="' + esc(T("Предыдущее фото")) + '">' + I.prev + '</button><button type="button" class="lot-lb__arr lot-lb__next" aria-label="' + esc(T("Следующее фото")) + '">' + I.next + '</button><div class="lot-lb__stage"><img class="lot-lb__img" alt=""></div><span class="lot-lb__count num"></span>';
    document.body.appendChild(el); lbEl = el; wireLightbox(el); return el;
  }
  function lbApply(){ var img = lbEl.querySelector(".lot-lb__img"); img.style.transform = "translate(" + lb.panX + "px," + lb.panY + "px) scale(" + lb.zoom + ")"; lbEl.classList.toggle("is-zoomed", lb.zoom > 1.01); }
  function lbRender(){ lbEl.querySelector(".lot-lb__img").src = lb.images[lb.idx] || ""; lb.zoom = 1; lb.panX = lb.panY = 0; lbApply(); lbEl.querySelector(".lot-lb__count").textContent = (lb.idx + 1) + " / " + lb.images.length; }
  function lbNav(d){ if(!lb.images.length) return; lb.idx = (lb.idx + d + lb.images.length) % lb.images.length; lbRender(); }
  function lbCycle(){ var steps = [1, 2, 3], cur = steps.indexOf(Math.round(lb.zoom)); lb.zoom = steps[(cur + 1) % steps.length]; if(lb.zoom <= 1){ lb.panX = lb.panY = 0; } lbApply(); }
  function openLightbox(images, idx){ if(!images || !images.length) return; ensureLightbox(); lb.images = images; lb.idx = Math.max(0, Math.min(images.length - 1, idx || 0)); lbRender(); lbEl.hidden = false; document.documentElement.classList.add("overflow-hidden"); lbEl.focus(); }
  function closeLightbox(){ if(!lbEl || lbEl.hidden) return; lbEl.hidden = true; document.documentElement.classList.remove("overflow-hidden"); }
  function dist(t){ var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
  function wireLightbox(el){
    var stage = el.querySelector(".lot-lb__stage");
    el.querySelector(".lot-lb__close").addEventListener("click", closeLightbox);
    el.querySelector(".lot-lb__prev").addEventListener("click", function(){ lbNav(-1); });
    el.querySelector(".lot-lb__next").addEventListener("click", function(){ lbNav(1); });
    el.addEventListener("click", function(e){ if(e.target === el && lb.zoom <= 1) closeLightbox(); });
    stage.addEventListener("dblclick", function(e){ e.preventDefault(); lbCycle(); });
    stage.addEventListener("wheel", function(e){ e.preventDefault(); lb.zoom = Math.min(3, Math.max(1, lb.zoom + (e.deltaY < 0 ? 0.25 : -0.25))); if(lb.zoom <= 1){ lb.panX = lb.panY = 0; } lbApply(); }, {passive:false});
    stage.addEventListener("mousedown", function(e){ if(lb.zoom <= 1) return; lb.dragging = true; lb.startX = e.clientX - lb.panX; lb.startY = e.clientY - lb.panY; e.preventDefault(); });
    window.addEventListener("mousemove", function(e){ if(!lb.dragging) return; lb.panX = e.clientX - lb.startX; lb.panY = e.clientY - lb.startY; lbApply(); });
    window.addEventListener("mouseup", function(){ lb.dragging = false; });
    var lastTap = 0;
    stage.addEventListener("touchstart", function(e){
      if(e.touches.length === 2){ lb.pinchDist = dist(e.touches); lb.pinchZoom = lb.zoom; }
      else if(e.touches.length === 1){ if(lb.zoom > 1){ lb.dragging = true; lb.startX = e.touches[0].clientX - lb.panX; lb.startY = e.touches[0].clientY - lb.panY; } var now = Date.now(); if(now - lastTap < 350) lbCycle(); lastTap = now; }
    }, {passive:true});
    stage.addEventListener("touchmove", function(e){
      if(e.touches.length === 2 && lb.pinchDist){ lb.zoom = Math.min(3, Math.max(1, lb.pinchZoom * (dist(e.touches) / lb.pinchDist))); if(lb.zoom <= 1){ lb.panX = lb.panY = 0; } lbApply(); e.preventDefault(); }
      else if(e.touches.length === 1 && lb.dragging){ lb.panX = e.touches[0].clientX - lb.startX; lb.panY = e.touches[0].clientY - lb.startY; lbApply(); e.preventDefault(); }
    }, {passive:false});
    stage.addEventListener("touchend", function(e){ if(e.touches.length < 2) lb.pinchDist = 0; if(e.touches.length === 0) lb.dragging = false; });
    document.addEventListener("keydown", function(e){ if(!lbEl || lbEl.hidden) return; if(e.key === "Escape") closeLightbox(); else if(e.key === "ArrowLeft") lbNav(-1); else if(e.key === "ArrowRight") lbNav(1); });
  }

  // ============ Сводки по отчётам ============
  function inspSummary(){
    var r = matchingReports(state.car.inspections)[0]; if(!r) return null;
    var items = Array.isArray(r.checked_items) ? r.checked_items : [];
    var c = (r.conclusions && !Array.isArray(r.conclusions)) ? r.conclusions : {};
    var bodyKeys = {exterior:1, body_structure:1};
    var issues = items.filter(function(i){ return i.result_key === "issue"; });
    var bodyIssues = issues.filter(function(i){ return bodyKeys[i.block_key]; });
    var mechIssues = issues.filter(function(i){ return !bodyKeys[i.block_key]; });
    var accident = c.accident_status_key && !(c.accident_status_key === "not_present" || c.accident_status_key === "ok" || c.accident_status_key === "none");
    return {r:r, items:items, c:c, issues:issues, bodyIssues:bodyIssues, mechIssues:mechIssues, accident:accident,
      tone: accident ? "is-bad" : issues.length ? "is-warn" : "is-ok"};
  }
  function inspVerdictText(s){
    var parts = [];
    parts.push(s.mechIssues.length ? (T("Механика") + ": " + s.mechIssues.length + " " + plural(s.mechIssues.length, T("замечание"), T("замечания"), T("замечаний"))) : T("Механика в порядке"));
    parts.push(s.bodyIssues.length ? (T("по кузову") + " " + s.bodyIssues.length + " " + plural(s.bodyIssues.length, T("замечание"), T("замечания"), T("замечаний"))) : T("кузов без отметок"));
    parts.push(s.accident ? T("есть следы ДТП") : T("без следов ДТП"));
    return parts.join(", ");
  }
  function histSummary(){
    var r = matchingReports(state.car.vehicle_history_reports)[0]; if(!r) return null;
    var s = (r.summary && !Array.isArray(r.summary)) ? r.summary : {};
    var events = Array.isArray(r.events) ? r.events.slice() : [];
    var checks = Array.isArray(r.checks) ? r.checks : [];
    var claims = events.filter(function(e){ return e.type_key === "insurance_claim"; });
    var claimsTotal = claims.reduce(function(a, e){ return a + (e.amount_total || 0); }, 0);
    var claimsCur = (claims.find(function(e){ return e.currency; }) || {}).currency || s.currency || "KRW";
    var claimCount = s.insurance_claim_count != null ? s.insurance_claim_count : claims.length;
    var owners = s.owner_change_count != null ? s.owner_change_count : events.filter(function(e){ return e.type_key === "owner_change"; }).length;
    var total = (s.total_loss_count > 0) || (s.flood_total_loss_count > 0) || (s.flood_partial_loss_count > 0) || (s.theft_count > 0);
    var readings = events.filter(function(e){ return e.mileage_km != null && isFinite(e.mileage_km) && e.occurred_at; }).map(function(e){ return {date:e.occurred_at, km:Math.round(e.mileage_km), e:e}; }).sort(function(a, b){ return new Date(a.date) - new Date(b.date); });
    var rollback = readings.some(function(rd, i){ return i > 0 && rd.km < readings[i - 1].km; });
    return {r:r, s:s, events:events, checks:checks, claims:claims, claimsTotal:claimsTotal, claimsCur:claimsCur, claimCount:claimCount, owners:owners, total:total, readings:readings, rollback:rollback,
      tone: total ? "is-bad" : (claimCount > 0 || rollback) ? "is-warn" : "is-ok"};
  }
  function histVerdictText(h){
    var p = [];
    p.push(h.claimCount > 0 ? (h.claimCount + " " + plural(h.claimCount, T("страховой случай"), T("страховых случая"), T("страховых случаев"))) : T("без страховых случаев"));
    p.push(h.owners > 0 ? (h.owners + " " + plural(h.owners, T("смена владельца"), T("смены владельца"), T("смен владельца"))) : T("владелец не менялся"));
    p.push(h.total ? T("есть тотал, затопление или угон") : T("без тотала, затопления и угона"));
    return p.join(", ");
  }
  function histShortVerdict(h){
    var a = [h.total ? T("Есть тотал/затопление/угон") : T("Без тотальных и утоплений")];
    a.push(h.owners > 0 ? (h.owners + " " + plural(h.owners, T("смена владельца"), T("смены владельца"), T("смен владельца"))) : T("без смены владельца"));
    return a.join(" · ");
  }
  function optionIds(){
    var car = state.car, listing = state.listing, n = (car.listings || []).length;
    return n > 1 ? (listing && listing.option_ids || []) : Array.from(new Set((car.option_ids || []).concat((listing && listing.option_ids) || [])));
  }

  // ============ lot-info ============
  function infoRow(label, value, ddCls, opts){
    opts = opts || {};
    var inner;
    if(opts.fact){
      var ic = opts.icon || "";
      inner = (opts.go ? '<a class="lot-info__fact" href="#' + opts.go + '" data-go="' + opts.go + '">' : '<span class="lot-info__fact">') + '<span class="lot-info__icon">' + ic + '</span><span class="lot-info__value" data-no-i18n="true">' + esc(value) + '</span>' + (opts.go ? '</a>' : '</span>');
    }else{
      inner = (opts.swatch ? '<i class="car-swatch" style="background: ' + opts.swatch + '" aria-hidden="true"></i>' : "") + (opts.html || ('<span class="lot-info__value" data-no-i18n="true">' + esc(value) + '</span>')) + (opts.copy ? '<button type="button" class="lot-copy" data-copy="' + esc(opts.copy) + '" aria-label="' + esc(T("Скопировать")) + ' ' + esc(label) + '">' + I.copy + '</button>' : "");
    }
    return '<div class="lot-info__row' + (opts.go ? " is-link" : "") + '"><dt>' + esc(label) + '</dt><dd class="' + (ddCls || "") + '">' + inner + '</dd></div>';
  }
  function infoGroup(title, rows){ return rows ? '<section class="lot-info__group"><h2 class="lot-info__title">' + esc(title) + '</h2><dl>' + rows + '</dl></section>' : ""; }
  function renderInfo(){
    var car = state.car, listing = state.listing;
    var main = "";
    var insp = inspSummary(), hist = histSummary();
    if(insp){
      if(insp.c.accident_status_key) main += infoRow(T("ДТП"), insp.accident ? T("Есть следы") : T("Нет"), insp.accident ? "is-warn" : "is-ok", {fact:true, icon:insp.accident ? I.warn : I.check, go:"inspection"});
      main += infoRow(T("Техосмотр"), insp.issues.length ? (insp.issues.length + " " + plural(insp.issues.length, T("замечание"), T("замечания"), T("замечаний"))) : T("Без замечаний"), insp.issues.length ? "is-warn" : "is-ok", {fact:true, icon:insp.issues.length ? I.warn : I.check, go:"inspection"});
    }
    if(hist){
      main += infoRow(T("Страховые случаи"), hist.claimCount > 0 ? (hist.claimCount + " " + plural(hist.claimCount, T("случай"), T("случая"), T("случаев"))) : T("Нет"), hist.claimCount > 0 ? "is-warn" : "is-ok", {fact:true, icon:hist.claimCount > 0 ? I.warn : I.check, go:"history"});
      main += infoRow(T("Изменения владельца"), hist.owners > 0 ? (hist.owners + " " + plural(hist.owners, T("смена"), T("смены"), T("смен"))) : T("Нет"), "", {fact:true, icon:I.owners});
      main += infoRow(T("Тотал, затопление, угон"), hist.total ? T("Да") : T("Нет"), hist.total ? "is-warn" : "is-ok", {fact:true, icon:hist.total ? I.warn : I.check});
    }
    var ad = "";
    if(car.vin) ad += infoRow("VIN", String(car.vin).toUpperCase(), "is-mono", {copy:String(car.vin).toUpperCase()});
    if(listing && listing.availability) ad += infoRow(T("Наличие"), T(AVAIL[listing.availability.id] || listing.availability.name));
    if(listing) ad += infoRow(T("Тип продажи"), listing.is_auction ? T("Аукцион") : T("Фиксированная цена"));
    if(listing && listing.auction_at) ad += infoRow(T("Дата аукциона"), fmtDate(listing.auction_at));
    if(listing && listing.created_at) ad += infoRow(T("Размещено"), fmtDate(listing.created_at));
    if(listing && listing.last_seen_at) ad += infoRow(T("Последняя проверка"), fmtDate(listing.last_seen_at));
    if(listing && listing.has_registration != null) ad += infoRow(T("Документы (ПТС)"), listing.has_registration ? T("Да") : T("Нет"), listing.has_registration ? "is-ok" : "");
    if(listing && listing.keys_available != null) ad += infoRow(T("Ключи имеются"), listing.keys_available ? T("Да") : T("Нет"), listing.keys_available ? "is-ok" : "");
    if(listing && listing.is_manufacturer_certified != null) ad += infoRow(T("Сертифицированный продавец"), listing.is_manufacturer_certified ? T("Да") : T("Нет"), listing.is_manufacturer_certified ? "is-ok" : "");
    if(listing && listing.seller_type) ad += infoRow(T("Продавец"), T(SELLER_TYPE[listing.seller_type.id] || listing.seller_type.name));
    if(listing && listing.is_leasing != null) ad += infoRow(T("В лизинге"), listing.is_leasing ? T("Да") : T("Нет"));
    if(listing && listing.price && Array.isArray(listing.price.history) && listing.price.history.length > 1) ad += infoRow(T("Изменений цены"), String(listing.price.history.length - 1));
    var place = placeOf(listing); if(place) ad += infoRow(T("Регион"), place);
    var d = "";
    if(car.brand){
      var bp = new URLSearchParams(); bp.set("brand_id", car.brand.id);
      d += infoRow(T("Марка"), car.brand.name, "is-make", {html:'<a class="lot-make" href="/catalog?' + bp.toString() + '" title="' + esc(T("Все лоты")) + ' ' + esc(car.brand.name) + '"><span class="lot-make__logo" aria-hidden="true">' + logoHtml(car.brand.name) + '</span><span class="lot-info__value" data-no-i18n="true">' + esc(car.brand.name) + '</span>' + ico('<path d="m9 18 6-6-6-6"/>', "h-4 w-4 lot-make__go") + '</a>'});
    }
    if(car.model) d += infoRow(T("Модель"), car.model.name);
    if(car.badge) d += infoRow(T("Метка"), car.badge);
    var myd = fmtMonthYear(car); if(myd) d += infoRow(T("Дата выпуска"), myd);
    if(listing && listing.odometer != null) d += infoRow(T("Пробег"), fmtNum(listing.odometer) + " " + T("км"));
    if(car.fuel) d += infoRow(T("Топливо"), T(FUELS[car.fuel.id] || car.fuel.name));
    if(car.transmission) d += infoRow(T("Трансмиссия"), T(TRANSMISSIONS[car.transmission.id] || car.transmission.name));
    if(car.engine_volume && !(car.fuel && car.fuel.id === 2)) d += infoRow(T("Двигатель"), (car.engine_volume / 1000).toFixed(1).replace(/\.0$/, "") + " " + T("л"));
    if(car.battery_capacity_kwh) d += infoRow(T("Батарея"), car.battery_capacity_kwh + " " + T("кВт·ч"));
    if(car.power_hp) d += infoRow(T("Мощность"), car.power_hp + " " + T("л.с."));
    if(car.drive_wheels) d += infoRow(T("Привод"), T(DRIVE_WHEELS[car.drive_wheels.id] || car.drive_wheels.name));
    if(car.body_type) d += infoRow(T("Тип кузова"), T(BODY_TYPES[car.body_type.id] || car.body_type.name));
    if(car.color) d += infoRow(T("Цвет"), T(COLORS_MAP[car.color.id] || car.color.name), "", {swatch:COLOR_SWATCH[car.color.id] || "#9ca3af"});
    if(car.interior_color) d += infoRow(T("Цвет салона"), T(COLORS_MAP[car.interior_color.id] || car.interior_color.name), "", {swatch:COLOR_SWATCH[car.interior_color.id] || "#9ca3af"});
    if(car.seats) d += infoRow(T("Количество мест"), String(car.seats));
    if(car.cylinders) d += infoRow(T("Цилиндров"), String(car.cylinders));
    if(car.market_origin) d += infoRow(T("Рынок"), T(MARKET_ORIGIN[car.market_origin.id] || car.market_origin.name));
    if(car.steering_wheel_position) d += infoRow(T("Руль"), T(STEERING[car.steering_wheel_position.id] || car.steering_wheel_position.name));
    if(listing && listing.condition) d += infoRow(T("Состояние"), T(CONDITIONS[listing.condition.id] || listing.condition.name), listing.condition.id === 3 ? "is-warn" : "");
    if(listing && listing.damage) d += infoRow(T("Повреждение"), listing.damage.name, "is-warn");
    if(listing && listing.airbag_state) d += infoRow(T("Подушки безопасности"), T(AIRBAG[listing.airbag_state.id] || listing.airbag_state.name), listing.airbag_state.id === 1 ? "is-ok" : "is-warn");
    var desc = listing && listing.description ? String(listing.description).replace(/[►◄]/g, "").replace(/-{3,}/g, "\n").split("\n").map(function(l){ return l.replace(/^>\s?/, "").trim(); }).filter(Boolean).join("\n") : "";
    var descHtml = desc ? '<section class="lot-info__group"><h2 class="lot-info__title">' + esc(T("От продавца")) + '</h2><p class="lot-info__text" data-no-i18n="true">' + esc(desc) + '</p></section>' : "";
    document.getElementById("lotInfoV1").innerHTML = '<div class="lot-info__groups">' + infoGroup(T("Главное"), main) + infoGroup(T("Объявление"), ad) + infoGroup(T("Описание"), d) + descHtml + '</div>';
  }

  // ============ lot-buy ============
  function renderBuy(){
    var car = state.car, listing = state.listing;
    var pr = listingPrice(listing), mp = pr ? moneyParts(pr.amount, pr.cur) : null;
    var title = titleOf(car, listing) + (car.badge ? " " + car.badge : "");
    var msg = T("Здравствуйте! Интересует автомобиль.") + "\n" + T("Авто") + ": " + title + (car.vin ? "\nVIN: " + String(car.vin).toUpperCase() : "") + "\n" + pageUrl();
    var ms = ART.messengers || {};
    var tgIc = ms.Telegram ? ms.Telegram.svg : "", waIc = ms.WhatsApp ? ms.WhatsApp.svg : "";
    var html = '<section class="lot-buy">'
      + '<div class="lot-price__head"><p class="lot-price__label">' + esc(pr ? pr.label : T("Цена")) + '</p><p class="lot-price__value num" data-no-i18n="true">' + esc(mp ? mp.main : T("По запросу")) + '</p></div>'
      + (mp && mp.sub ? '<p class="lot-price__sub num" data-no-i18n="true">' + esc(mp.sub) + '</p>' : "")
      + (listing && listing.archived ? '<p class="lot-price__sub lot-price__sub--sold">' + esc(T("Объявление снято с продажи")) + '</p>' : "")
      + (listing && listing.price && listing.price.negotiable ? '<p class="lot-price__sub">' + esc(T("Возможен торг")) + '</p>' : "")
      + '<div class="lot-price__actions">'
        + '<button type="button" class="btn btn-primary btn-lg" data-lead>' + esc(T("Написать менеджеру")) + '<span class="btn-chip">' + I.arrR + '</span></button>'
        + '<div class="lot-messengers"><p class="lot-messengers__or">' + esc(T("или напишите в мессенджер")) + '</p><div class="lot-messengers__row">'
          + '<a href="https://t.me/fedukusa?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener noreferrer nofollow" class="lot-messenger" style="--brand: #229ed9" aria-label="' + esc(T("Написать в Telegram")) + '" data-copy-silent="' + esc(msg) + '"><span class="lot-messenger__icon">' + tgIc + '</span><span class="lot-messenger__name">Telegram</span></a>'
          + '<a href="https://api.whatsapp.com/send?phone=37368832032&text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener noreferrer nofollow" class="lot-messenger" style="--brand: #25d366" aria-label="' + esc(T("Написать в WhatsApp")) + '"><span class="lot-messenger__icon">' + waIc + '</span><span class="lot-messenger__name">WhatsApp</span></a>'
        + '</div></div>'
      + '</div></section>';
    var insp = inspSummary(), hist = histSummary(), reports = "";
    if(insp) reports += '<a href="#inspection" data-go="inspection" class="lot-report ' + insp.tone + '"><span class="lot-report__icon">' + I.shieldBig + '</span><span class="min-w-0 flex-1"><span class="lot-report__kind">' + esc(T("Техосмотр")) + '</span><span class="lot-report__verdict" data-no-i18n="true">' + esc(inspVerdictText(insp)) + '</span></span>' + ico('<path d="M5 12h14M13 6l6 6-6 6"/>', "h-4 w-4 lot-report__go h-4 w-4") + '</a>';
    if(hist) reports += '<a href="#history" data-go="history" class="lot-report ' + hist.tone + '"><span class="lot-report__icon">' + I.historyBig + '</span><span class="min-w-0 flex-1"><span class="lot-report__kind">' + esc(T("История автомобиля")) + '</span><span class="lot-report__verdict" data-no-i18n="true">' + esc(histShortVerdict(hist)) + '</span></span>' + ico('<path d="M5 12h14M13 6l6 6-6 6"/>', "h-4 w-4 lot-report__go h-4 w-4") + '</a>';
    if(reports) html += '<div class="lot-reports">' + reports + '</div>';
    document.getElementById("lotBuyV1").innerHTML = html;
  }
  document.addEventListener("click", function(e){
    if(e.target.closest("[data-lead]")){ e.preventDefault(); openLeadModal(); return; }
    var tg = e.target.closest("[data-copy-silent]");
    if(tg && navigator.clipboard) navigator.clipboard.writeText(tg.getAttribute("data-copy-silent")).then(function(){ toast(T("Текст заявки скопирован, вставьте его в чат")); }).catch(function(){});
  });

  // ============ Ниже: toc + nav + секции ============
  var SECTION_DEFS = [
    {id:"inspection", label:"Техосмотр", icon:I.shield},
    {id:"options", label:"Комплектация", icon:I.list},
    {id:"history", label:"История", icon:I.history},
    {id:"listings", label:"Объявления", icon:I.layers}
  ];
  function visibleSections(){
    var insp = inspSummary(), hist = histSummary(), opts = optionIds().length, lst = (state.car.listings || []).length > 1;
    return SECTION_DEFS.filter(function(s){ return s.id === "inspection" ? !!insp : s.id === "options" ? opts > 0 : s.id === "history" ? !!hist : lst; });
  }
  function renderBelow(){
    var car = state.car, listing = state.listing, vis = visibleSections();
    var below = document.getElementById("lotBelowV1");
    if(!vis.length){ below.style.display = "none"; return; }
    below.style.display = "";
    var insp = inspSummary(), hist = histSummary(), opts = optionIds().length, listings = car.listings || [];
    var pr = listingPrice(listing), mp = pr ? moneyParts(pr.amount, pr.cur) : null;
    // toc card
    var tiles = vis.map(function(s){
      var cls = "", val = "", unit = "", words = false;
      if(s.id === "options"){ val = String(opts); }
      if(s.id === "inspection"){ cls = insp.tone === "is-ok" ? "is-ok" : "is-warn"; if(insp.issues.length){ val = String(insp.issues.length); unit = plural(insp.issues.length, T("замечание"), T("замечания"), T("замечаний")); } else { val = T("Без замечаний"); words = true; } }
      if(s.id === "history"){ cls = hist.tone === "is-ok" ? "is-ok" : "is-warn"; if(hist.claimCount){ val = String(hist.claimCount); unit = plural(hist.claimCount, T("случай"), T("случая"), T("случаев")); } else { val = T("Чистая"); words = true; } }
      if(s.id === "listings"){ var prices = new Set(listings.map(function(l){ var p = listingPrice(l); return p ? p.amount : null; }).filter(function(x){ return x != null; })); cls = prices.size <= 1 ? "is-ok" : ""; val = prices.size <= 1 ? T("Одна цена") : (listings.length + " " + plural(listings.length, T("объявление"), T("объявления"), T("объявлений"))); words = true; }
      return '<a href="#' + s.id + '" class="lot-tcard__tile ' + cls + '" data-toc="' + s.id + '" data-go="' + s.id + '"><span class="lot-tcard__name">' + s.icon + esc(T(s.label)) + '</span>' + (words ? '<b class="is-words" data-no-i18n="true">' + esc(val) + '</b>' : '<b class="num">' + esc(val) + '</b><span class="lot-tcard__unit">' + esc(unit) + '</span>') + '</a>';
    }).join("");
    document.getElementById("lotTocV1").innerHTML = '<div class="lot-tcard"><div class="lot-tcard__car">' + (state.photos[0] ? '<img src="' + esc(state.photos[0]) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + '<div class="min-w-0"><p class="lot-tcard__title" data-no-i18n="true">' + esc(titleOf(car, listing)) + '</p><p class="lot-tcard__price num" data-no-i18n="true"><span>' + esc(T("Цена")) + '</span> ' + esc(mp ? mp.main : T("по запросу")) + '</p></div></div>'
      + '<nav class="lot-tcard__grid' + (vis.length % 2 ? " is-odd" : "") + '">' + tiles + '</nav></div>'
      + '<button type="button" class="lot-toc__cta" data-lead>' + I.chat + esc(T("Написать менеджеру")) + '</button>';
    // nav + sections
    var tabs = vis.map(function(s, i){
      var extra = "";
      if(s.id === "options") extra = '<span class="lot-nav__count num">' + opts + '</span>';
      if(s.id === "listings") extra = '<span class="lot-nav__count num">' + listings.length + '</span>';
      if(s.id === "history" && hist.tone !== "is-ok") extra = '<span class="lot-nav__alert" aria-hidden="true"></span>';
      if(s.id === "inspection" && insp.issues.length) extra = '<span class="lot-nav__count num">' + insp.issues.length + '</span>';
      return '<a href="#' + s.id + '" class="lot-nav__tab" data-tab="' + s.id + '" data-go="' + s.id + '"' + (i === 0 ? ' aria-current="true"' : "") + '>' + s.icon + esc(T(s.label)) + extra + '</a>';
    }).join("");
    var html = '<nav class="lot-nav" id="lotNavV1" aria-label="' + esc(T("Разделы страницы автомобиля")) + '"><div class="lot-nav__tabs scrollbar-none" id="lotNavTabsV1"><span class="lot-nav__pill" aria-hidden="true"></span>' + tabs + '</div><button type="button" class="lot-nav__cta" data-lead>' + I.chat + esc(T("Написать")) + '</button></nav>';
    vis.forEach(function(s){
      if(s.id === "inspection") html += inspectionSectionHtml(insp);
      if(s.id === "options") html += '<section id="options" class="lot-section" data-options-section><header class="lot-section__head"><div class="min-w-0"><h2 class="lot-section__title">' + esc(T("Комплектация")) + '</h2><p class="lot-section__sub" data-no-i18n="true">' + opts + ' ' + plural(opts, T("опция"), T("опции"), T("опций")) + '</p></div><div class="lot-section__actions"><label class="lot-search">' + I.search + '<input type="search" data-opt-search placeholder="' + esc(T("Найти опцию")) + '" aria-label="' + esc(T("Найти опцию")) + '" autocomplete="off"><button type="button" class="lot-search__clear" data-opt-clear aria-label="' + esc(T("Сбросить поиск")) + '" style="display:none">' + I.x + '</button></label></div></header><div class="lot-section__body" data-options-body><p class="lot-options__loading">' + esc(T("Загрузка…")) + '</p></div></section>';
      if(s.id === "history") html += historySectionHtml(hist);
      if(s.id === "listings") html += listingsSectionHtml();
    });
    document.getElementById("lotMainV1").innerHTML = html;
    if(insp) afterInspectionRender(insp);
    if(hist) afterHistoryRender(hist);
    if(opts) loadOptions();
    initNav();
  }

  // ---- Навигация: активный таб, бегунок, липкость ----
  var navObs = null;
  function scrollToSection(id){
    var el = document.getElementById(id); if(!el) return;
    var nav = document.getElementById("lotNavV1");
    var off = (nav ? nav.offsetHeight : 0) + headerOffset() + 12;
    window.scrollTo({top:el.getBoundingClientRect().top + window.scrollY - off, behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"});
  }
  function headerOffset(){ var h = document.querySelector(".siteHeader"); if(!h) return 0; var cs = getComputedStyle(h); return (cs.position === "fixed" || cs.position === "sticky") ? h.offsetHeight : 0; }
  function setActiveTab(id, animated){
    var tabs = document.getElementById("lotNavTabsV1"); if(!tabs) return;
    tabs.querySelectorAll(".lot-nav__tab").forEach(function(t){ var on = t.getAttribute("data-tab") === id; if(on) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); });
    document.querySelectorAll("[data-toc]").forEach(function(t){ if(t.getAttribute("data-toc") === id) t.setAttribute("aria-current", "true"); else t.removeAttribute("aria-current"); });
    var act = tabs.querySelector('.lot-nav__tab[data-tab="' + id + '"]'), pill = tabs.querySelector(".lot-nav__pill");
    if(act && pill){ pill.style.transform = "translateX(" + act.offsetLeft + "px)"; pill.style.width = act.offsetWidth + "px"; tabs.classList.add("is-ready"); if(animated) requestAnimationFrame(function(){ tabs.classList.add("is-animated"); }); }
  }
  function initNav(){
    var tabs = document.getElementById("lotNavTabsV1"), nav = document.getElementById("lotNavV1"); if(!tabs) return;
    var first = tabs.querySelector(".lot-nav__tab");
    requestAnimationFrame(function(){ if(first) setActiveTab(first.getAttribute("data-tab"), true); });
    var top = headerOffset() + 8; nav.style.top = top + "px";
    if(navObs) navObs.disconnect();
    if("IntersectionObserver" in window){
      navObs = new IntersectionObserver(function(entries){ entries.forEach(function(en){ if(en.isIntersecting) setActiveTab(en.target.id, true); }); }, {rootMargin:"-" + (top + 80) + "px 0px -55% 0px"});
      document.querySelectorAll("#lotMainV1 > .lot-section").forEach(function(s){ navObs.observe(s); });
    }
    var onScroll = function(){ var r = nav.getBoundingClientRect(); nav.classList.toggle("is-stuck", r.top <= top + 1 && window.scrollY > 40); };
    window.addEventListener("scroll", onScroll, {passive:true}); onScroll();
    window.addEventListener("resize", function(){ var cur = tabs.querySelector('.lot-nav__tab[aria-current="true"]'); if(cur) setActiveTab(cur.getAttribute("data-tab"), false); });
  }

  // ============ Техосмотр ============
  var ZONE_OF = {
    hood:"hood", roof_panel:"roof", roof:"roof", trunk_floor_panel:"trunk", trunk_lid:"trunk", trunk:"trunk", tailgate:"trunk",
    front_apron_panel:"front_bumper", radiator_support:"front_bumper", front_bumper:"front_bumper", rear_apron_panel:"rear_bumper", rear_bumper:"rear_bumper",
    front_left_fender_apron:"front_left", left_front_fender_apron:"front_left", front_left_fender:"front_left", left_front_fender:"front_left",
    front_right_fender:"front_right", right_front_fender_apron:"front_right", front_right_fender_apron:"front_right",
    front_door_left:"front_door_left", left_front_door_frame_seal:"front_door_left", left_front_door:"front_door_left",
    front_door_right:"front_door_right", right_front_door_frame_seal:"front_door_right", right_front_door:"front_door_right",
    rear_door_left:"rear_door_left", left_rear_door_outer_panel:"rear_door_left", left_lower_side_sill:"rear_door_left", left_rear_door:"rear_door_left",
    rear_door_right:"rear_door_right", right_rear_door_frame_seal:"rear_door_right", right_lower_side_sill:"rear_door_right", right_rear_door:"rear_door_right",
    quarter_panel:"quarter_left", left_quarter_panel:"quarter_left", left_rear_fender_inner_panel:"quarter_left", left_rear_quarter_panel:"quarter_left", left_rear_wheel_house_inner:"quarter_left",
    right_rear_quarter_panel:"quarter_right", right_quarter_panel:"quarter_right", right_rear_fender_inner_panel:"quarter_right", right_rear_wheel_house_inner:"quarter_right"
  };
  var ZONE_LABEL = {front_bumper:"Передний бампер", hood:"Капот", front_left:"Крыло переднее левое", front_right:"Крыло переднее правое", mirror_left:"Зеркало левое", mirror_right:"Зеркало правое", front_door_left:"Дверь передняя левая", front_door_right:"Дверь передняя правая", roof:"Крыша", rear_door_left:"Дверь задняя левая", rear_door_right:"Дверь задняя правая", quarter_left:"Крыло заднее левое", quarter_right:"Крыло заднее правое", trunk:"Крышка багажника", rear_bumper:"Задний бампер", left_front_wheel:"Диск передний левый", left_front_tire:"Шина передняя левая", left_rear_wheel:"Диск задний левый", left_rear_tire:"Шина задняя левая", right_front_wheel:"Диск передний правый", right_front_tire:"Шина передняя правая", right_rear_wheel:"Диск задний правый", right_rear_tire:"Шина задняя правая"};
  function zoneFor(item){
    var k = String(item.part_key || "");
    if(ZONE_OF[k]) return ZONE_OF[k];
    if(/mirror/.test(k)) return /right/.test(k) ? "mirror_right" : "mirror_left";
    if(/tire/.test(k)) return (/right/.test(k) ? "right" : "left") + "_" + (/rear/.test(k) ? "rear" : "front") + "_tire";
    if(/wheel/.test(k)) return (/right/.test(k) ? "right" : "left") + "_" + (/rear/.test(k) ? "rear" : "front") + "_wheel";
    return null;
  }
  var BODY_BLOCKS = {exterior:1, body_structure:1};
  function isTraceTag(txt){ return /дтп|замен|repl|accident|weld|свар/i.test(txt); }
  function itemDescTags(r, it){
    var tags = [];
    if(it.description) tags.push(it.description);
    if(it.severity_key) tags.push(termOr(r, "severity", it.severity_key, it.severity_key));
    if(it.damage_rank_key) tags.push(termOr(r, "damage_rank", it.damage_rank_key, it.damage_rank_key));
    if(it.issue_type_key) tags.push(termOr(r, "issue_type", it.issue_type_key, it.issue_type_key));
    return tags.filter(function(t, i, a){ return t && a.indexOf(t) === i; });
  }
  function inspectionSectionHtml(s){
    var r = s.r, items = s.items, c = s.c;
    var bodyItems = items.filter(function(i){ return BODY_BLOCKS[i.block_key] || zoneFor(i); });
    var hasMap = bodyItems.length > 0 && ART.exterior;
    var damage = s.issues.filter(function(i){ return BODY_BLOCKS[i.block_key] || zoneFor(i); });
    var mechBlocks = {};
    items.filter(function(i){ return !(BODY_BLOCKS[i.block_key] || zoneFor(i)); }).forEach(function(i){ var k = i.block_key || "other"; (mechBlocks[k] = mechBlocks[k] || []).push(i); });
    var blockKeys = Object.keys(mechBlocks);
    var mechIssueBlocks = blockKeys.filter(function(k){ return mechBlocks[k].some(function(i){ return i.result_key === "issue"; }); });
    var shownBlocks = mechIssueBlocks.concat(blockKeys.filter(function(k){ return mechIssueBlocks.indexOf(k) < 0; })).slice(0, 2);
    var restOk = blockKeys.filter(function(k){ return shownBlocks.indexOf(k) < 0; }).reduce(function(a, k){ return a + mechBlocks[k].length; }, 0);
    var html = '<section id="inspection" class="lot-section"><header class="lot-section__head"><div class="min-w-0"><h2 class="lot-section__title">' + esc(T("Техосмотр")) + '</h2><p class="lot-section__verdict"><span class="lot-section__dot ' + s.tone + '"></span><span data-no-i18n="true">' + esc(inspVerdictText(s)) + (r.inspected_at ? '<span class="lot-section__meta">' + esc(T("Осмотр от")) + ' ' + esc(fmtDate(r.inspected_at)) + '</span>' : "") + '</span></p></div></header><div class="lot-section__body"><div class="lot-rep" id="lotRepV1">';
    html += '<div class="lot-rep__split' + (hasMap ? " has-map" : "") + '">';
    if(hasMap){
      html += '<figure class="lot-rep__map"><div class="lot-rep__plate"><p class="lot-rep__end">' + esc(T("Перед")) + '</p><div class="lot-cmap__frame is-exterior" style="--map-ratio: ' + (ART.mapRatio || "0.78") + '" id="lotMapV1">' + ART.exterior + '</div><p class="lot-rep__end">' + esc(T("Зад")) + '</p></div>'
        + '<figcaption class="lot-rep__legend"><span><i class="is-bad"></i>' + esc(T("Замечание, след ДТП, замена")) + '</span><span><i class="is-clean"></i>' + esc(T("Без отметок")) + '</span></figcaption></figure>';
    }
    html += '<div class="lot-rep__list">';
    if(damage.length){
      html += '<div class="lot-dmg">' + damage.map(function(it, i){
        var zone = zoneFor(it), tags = itemDescTags(r, it);
        return '<div class="lot-rep__row is-damage" data-zone="' + (zone ? "exterior:" + zone : "") + '" data-dmg-row="' + i + '" role="button" tabindex="0"><div class="lot-rep__part"><span class="lot-rep__num is-bad">' + (i + 1) + '</span><div class="min-w-0"><p class="lot-rep__name" data-no-i18n="true">' + esc(termOr(r, "part", it.part_key, it.part_label || it.source_label)) + '</p><p class="lot-rep__meta" data-no-i18n="true">' + esc(termOr(r, "section", it.block_key, T("Кузов"))) + '</p></div></div>'
          + '<div class="lot-dmg__tags">' + (tags.length ? tags.map(function(t){ return '<span class="lot-dmg__tag' + (isTraceTag(t) ? " is-trace is-bad" : "") + '" data-no-i18n="true">' + esc(t) + '</span>'; }).join("") : '<span class="lot-dmg__tag is-bad">' + esc(T("Замечание")) + '</span>') + '</div></div>';
      }).join("") + '</div>';
    }else if(hasMap){
      html += '<p class="lot-rep__clean">' + I.check + esc(T("По кузову отметок нет")) + '</p>';
    }
    var claims = Array.isArray(r.source_claims) ? r.source_claims.map(function(sc){ var ok = sc.result_key === "not_present" || sc.result_key === "ok"; return termOr(r, "claim_type", sc.type_key, sc.source_label) + ": " + (ok ? T("нет") : termOr(r, "result", sc.result_key, T("да"))); }) : [];
    if(claims.length || c.notes) html += '<p class="lot-rep__note" data-no-i18n="true">' + (claims.length ? esc(T("По заявлению продавца")) + ": " + esc(claims.join(", ")) + ". " : "") + esc(c.notes || "") + '</p>';
    shownBlocks.forEach(function(k){
      html += '<div class="lot-rep__set"><p class="lot-rep__group" data-no-i18n="true">' + esc(termOr(r, "section", k, humanizeKey(k))) + '</p>' + mechBlocks[k].map(function(it){
        var bad = it.result_key === "issue";
        return '<div class="lot-rep__row is-quiet' + (bad ? " is-issue" : "") + '"><p class="lot-rep__name" data-no-i18n="true">' + esc(termOr(r, "part", it.part_key, it.part_label || it.source_label)) + '</p><p class="lot-rep__value ' + (bad ? "is-bad" : "is-ok") + '" data-no-i18n="true">' + esc(bad ? (itemDescTags(r, it)[0] || T("Замечание")) : T("Норма")) + '</p></div>';
      }).join("") + '</div>';
    });
    html += '<button type="button" class="lot-rep__full" data-full-open="inspection" aria-haspopup="dialog"><span class="lot-rep__full-icon">' + I.doc + '</span><span class="min-w-0 flex-1"><span class="lot-rep__full-title">' + esc(T("Полный отчёт проверки")) + '</span><span class="lot-rep__full-sub" data-no-i18n="true">' + esc(restOk ? (T("Ещё") + " " + restOk + " " + plural(restOk, T("проверка"), T("проверки"), T("проверок")) + " " + T("в норме")) : (T("Проверено") + " " + items.length + " " + plural(items.length, T("пункт"), T("пункта"), T("пунктов")))) + '</span></span><span class="lot-rep__full-go">' + esc(T("Открыть")) + I.arrR + '</span></button>';
    html += '</div></div></div></div></section>';
    return html;
  }
  var tipEl = null;
  function showTip(x, y, text){
    if(!tipEl){ tipEl = document.createElement("div"); tipEl.className = "lot-tip"; document.body.appendChild(tipEl); }
    tipEl.textContent = text; tipEl.style.left = x + "px"; tipEl.style.top = y + "px"; tipEl.classList.add("is-shown");
  }
  function hideTip(){ if(tipEl) tipEl.classList.remove("is-shown"); }
  function afterInspectionRender(s){
    var map = document.getElementById("lotMapV1"); if(!map) return;
    var r = s.r;
    var byZone = {};
    s.items.forEach(function(it){ var z = zoneFor(it); if(!z) return; (byZone[z] = byZone[z] || []).push(it); });
    var damage = s.issues.filter(function(i){ return BODY_BLOCKS[i.block_key] || zoneFor(i); });
    var svg = map.querySelector("svg"), rep = document.getElementById("lotRepV1"); if(rep){ rep.classList.add("is-seen"); }
    svg.querySelectorAll(".lot-zone-g").forEach(function(g){
      var zone = (g.getAttribute("data-zone") || "").split(":")[1];
      var items = byZone[zone] || [];
      var issue = items.filter(function(i){ return i.result_key === "issue"; });
      g.setAttribute("data-state", issue.length ? "issue" : items.length ? "ok" : "muted");
      // у эталона класс формы зоны ставит их JS: .lot-zone-shape (+ .is-issue — красная заливка, .is-ok — наша зелёная подсветка нормы)
      g.querySelectorAll("path").forEach(function(p){ p.classList.add("lot-zone-shape"); p.classList.toggle("is-issue", issue.length > 0); p.classList.toggle("is-ok", !issue.length && items.length > 0); });
      var label = T(ZONE_LABEL[zone] || humanizeKey(zone));
      if(issue.length) label += ": " + T("найдена проблема") + ": " + issue.map(function(it){ return itemDescTags(r, it).join(", ") || T("замечание"); }).join("; ");
      g.setAttribute("data-tip", label);
      if(issue.length){
        var n = damage.indexOf(issue[0]) + 1;
        try{
          var bb = g.getBBox(), bx = bb.x + bb.width / 2, by = bb.y + bb.height / 2;
          var badge = document.createElementNS("http://www.w3.org/2000/svg", "g");
          badge.setAttribute("class", "lot-zone-badge is-bad"); badge.setAttribute("data-zone", "exterior:" + zone); badge.setAttribute("transform", "translate(" + bx.toFixed(1) + " " + by.toFixed(1) + ")"); badge.style.setProperty("--i", String(n - 1));
          badge.innerHTML = '<g class="lot-zone-badge__pop"><circle r="9.5" class="lot-zone-badge__ring"/><circle r="9.5"/><text y="4" text-anchor="middle">' + n + '</text></g>';
          svg.appendChild(badge);
        }catch(e){}
      }
    });
    function link(zone){ document.querySelectorAll("#lotRepV1 [data-zone]").forEach(function(el){ el.classList.toggle("is-linked", !!zone && el.getAttribute("data-zone") === zone); }); }
    svg.addEventListener("mousemove", function(e){ var g = e.target.closest(".lot-zone-g"); if(!g){ hideTip(); link(""); return; } showTip(e.clientX + 12, e.clientY + 14, g.getAttribute("data-tip")); link(g.getAttribute("data-zone")); });
    svg.addEventListener("mouseleave", function(){ hideTip(); link(""); });
    svg.addEventListener("click", function(e){ var g = e.target.closest(".lot-zone-g"); if(!g || g.getAttribute("data-state") !== "issue") return; var row = document.querySelector('#lotRepV1 .lot-rep__row[data-zone="' + g.getAttribute("data-zone") + '"]'); if(row){ row.scrollIntoView({behavior:"smooth", block:"center"}); row.classList.add("is-selected"); setTimeout(function(){ row.classList.remove("is-selected"); }, 1600); } });
    document.querySelectorAll("#lotRepV1 .lot-rep__row[data-zone]").forEach(function(row){
      row.addEventListener("mouseenter", function(){ link(row.getAttribute("data-zone")); });
      row.addEventListener("mouseleave", function(){ link(""); });
    });
  }
  function fullInspectionPanel(s){
    var r = s.r, groups = {};
    s.items.forEach(function(i){ var k = i.block_key || "other"; (groups[k] = groups[k] || []).push(i); });
    var keys = Object.keys(groups).sort(function(a, b){ var ia = groups[a].some(function(i){ return i.result_key === "issue"; }), ib = groups[b].some(function(i){ return i.result_key === "issue"; }); return (ib ? 1 : 0) - (ia ? 1 : 0); });
    var body = keys.map(function(k, idx){
      var its = groups[k], issues = its.filter(function(i){ return i.result_key === "issue"; }).length;
      return '<section class="lot-full__group' + (idx === 0 || issues ? " is-open" : "") + '"><button type="button" class="lot-full__toggle" data-full-toggle aria-expanded="' + (idx === 0 || issues ? "true" : "false") + '"><span class="lot-full__name" data-no-i18n="true">' + esc(termOr(r, "section", k, humanizeKey(k))) + '</span><span class="lot-full__pills">' + (issues ? '<span class="lot-full__pill is-issue">' + issues + ' ' + plural(issues, T("замечание"), T("замечания"), T("замечаний")) + '</span>' : '<span class="lot-full__pill is-ok">' + esc(T("Норма")) + '</span>') + '</span>' + ico('<path d="m6 9 6 6 6-6"/>', "h-4 w-4 lot-full__chev h-4 w-4") + '</button>'
        + '<div class="lot-full__items"><ul>' + its.map(function(it){ var bad = it.result_key === "issue"; return '<li class="lot-full__row"><span class="lot-full__part" data-no-i18n="true">' + esc(termOr(r, "part", it.part_key, it.part_label || it.source_label)) + '</span><span class="lot-full__value ' + (bad ? "is-bad" : "is-ok") + '" data-no-i18n="true">' + esc(bad ? (itemDescTags(r, it).join(", ") || T("Замечание")) : T("Норма")) + '</span></li>'; }).join("") + '</ul></div></section>';
    }).join("");
    openFull(T("Полный отчёт проверки"), T("Проверено") + " " + s.items.length + " " + plural(s.items.length, T("пункт"), T("пункта"), T("пунктов")) + (s.issues.length ? ' · <span class="is-issue">' + s.issues.length + " " + plural(s.issues.length, T("замечание"), T("замечания"), T("замечаний")) + "</span>" : ""), body, "lot-full-title");
  }

  // ---- Боковая панель (полный отчёт / хронология) ----
  var fullEl = null;
  function openFull(title, sub, bodyHtml, titleId){
    if(!fullEl){
      fullEl = document.createElement("div"); fullEl.className = "lot-full"; fullEl.style.display = "none";
      fullEl.innerHTML = '<div class="lot-full__veil" data-full-close aria-hidden="true"></div><aside class="lot-full__panel" role="dialog" aria-modal="true"><header class="lot-full__head"><span class="sheet-grip sm:hidden" aria-hidden="true"></span><div class="min-w-0"><h2 class="lot-full__title" id="lotFullTitleV1"></h2><p class="lot-full__sub" id="lotFullSubV1"></p></div><button type="button" class="sheet-close" data-full-close aria-label="' + esc(T("Закрыть")) + '">' + I.x + '</button></header><div class="lot-full__body" id="lotFullBodyV1"></div></aside>';
      document.body.appendChild(fullEl);
      fullEl.addEventListener("click", function(e){ if(e.target.closest("[data-full-close]")) closeFull(); var tg = e.target.closest("[data-full-toggle]"); if(tg){ var g = tg.closest(".lot-full__group"); var open = !g.classList.contains("is-open"); g.classList.toggle("is-open", open); tg.setAttribute("aria-expanded", open ? "true" : "false"); } });
    }
    fullEl.querySelector("#lotFullTitleV1").textContent = title;
    fullEl.querySelector("#lotFullSubV1").innerHTML = sub;
    fullEl.querySelector(".lot-full__panel").setAttribute("aria-labelledby", "lotFullTitleV1");
    fullEl.querySelector("#lotFullBodyV1").innerHTML = bodyHtml;
    fullEl.style.display = ""; document.documentElement.classList.add("overflow-hidden");
    requestAnimationFrame(function(){ fullEl.classList.add("is-open"); var tl = fullEl.querySelector(".lot-tl"); if(tl) tl.classList.add("is-open"); });
  }
  function closeFull(){ if(!fullEl) return; fullEl.classList.remove("is-open"); fullEl.style.display = "none"; document.documentElement.classList.remove("overflow-hidden"); }
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && fullEl && fullEl.style.display !== "none") closeFull(); });
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-full-open]"); if(!b) return;
    var kind = b.getAttribute("data-full-open");
    if(kind === "inspection"){ var s = inspSummary(); if(s) fullInspectionPanel(s); }
    if(kind === "timeline"){ var h = histSummary(); if(h) timelinePanel(h); }
  });

  // ============ Комплектация ============
  var KEY_OPTS = [
    [/люк|sunroof|панорам|panoram/i, I.sun], [/вентил|ventilat/i, I.wind], [/обогрев рул|подогрев рул|heated steering/i, I.wheel],
    [/парктроник|parking sensor|датчик парков/i, I.sensor], [/камера|camera/i, I.camera], [/навигац|navigation/i, I.nav],
    [/смарт|smart key|бесключ|keyless/i, I.key], [/круиз|cruise/i, I.cruise], [/подогрев сид|heated seat|обогрев сид/i, I.seat], [/кож|leather/i, I.seat]
  ];
  function sectionIcon(name){
    var s = String(name || "").toLowerCase();
    if(/сиден|seat|обив|upholst/.test(s)) return I.seat;
    if(/безопас|safety|ассист|assist/.test(s)) return I.shield;
    if(/мультимед|удобств|comfort|media|convenience/.test(s)) return I.bolt;
    return I.car;
  }
  function loadOptions(){
    var ids = optionIds(), body = document.querySelector("[data-options-body]");
    fetch("/api/catalog?action=options&ids=" + ids.slice(0, 100).join(",") + "&lang=" + lang()).then(function(r){ return r.json(); }).then(function(d){
      var items = (d && d.items) || [];
      if(!items.length){ body.innerHTML = '<p class="lot-options__loading">' + esc(T("Не удалось загрузить комплектацию.")) + '</p>'; return; }
      var ul = uiLang() === "en" ? "en" : (uiLang() === "ro" ? "ro" : "ru");
      function nameOf(o){ var tr = o.translations && o.translations.name; if(tr && typeof tr === "object") return tr[ul] || tr.ru || tr.en || o.name || (T("Опция") + " #" + o.id); return o.name || (T("Опция") + " #" + o.id); }
      function secOf(o){ var s = o.section; if(!s) return T("Другое"); var tr = s.translations && s.translations.name; if(tr && typeof tr === "object") return tr[ul] || tr.ru || tr.en || s.name || T("Другое"); return s.name || T("Другое"); }
      var bySec = {}; items.forEach(function(o){ var k = secOf(o); (bySec[k] = bySec[k] || []).push(o); });
      var secs = Object.keys(bySec).sort();
      var keys = [];
      items.forEach(function(o){ var n = nameOf(o); var hit = KEY_OPTS.find(function(k){ return k[0].test(n); }); if(hit && keys.length < 4 && !keys.some(function(k){ return k.icon === hit[1]; })) keys.push({name:n, icon:hit[1]}); });
      var keysHtml = keys.length ? '<ul class="lot-options__keys lot-options__keys--' + ["one","two","three","four"][keys.length - 1] + '" data-opt-keys>' + keys.map(function(k){ var w = k.name.split(" "); return '<li title="' + esc(k.name) + '"><span class="lot-options__key-icon">' + k.icon + '</span><span class="lot-options__key-text"><span class="lot-options__key-name" data-no-i18n="true">' + esc(w[0]) + '</span><span class="lot-options__key-note" data-no-i18n="true">' + esc(w.slice(1).join(" ")) + '</span></span></li>'; }).join("") + '</ul>' : "";
      var groups = secs.map(function(sec){
        var opts = bySec[sec].slice().sort(function(a, b){ return nameOf(a).localeCompare(nameOf(b)); });
        return '<div class="lot-options__group" data-opt-group><h3 class="lot-options__name"><span class="lot-options__name-icon">' + sectionIcon(sec) + '</span><span data-no-i18n="true">' + esc(sec) + '</span><span class="num" data-opt-count data-total="' + opts.length + '">' + opts.length + '</span></h3><ul class="lot-options__items">' + opts.map(function(o){ return '<li data-opt-name="' + esc(nameOf(o).toLowerCase()) + '">' + I.tick + '<span data-no-i18n="true">' + esc(nameOf(o)) + '</span></li>'; }).join("") + '</ul></div>';
      }).join("");
      body.innerHTML = '<div class="lot-options">' + keysHtml + '<div class="lot-options__list">' + groups + '</div><div class="lot-options__empty" data-opt-empty style="display:none"><span class="lot-options__empty-icon">' + I.searchBig + '</span><p class="lot-options__empty-title" data-opt-empty-title></p><p class="lot-options__empty-hint">' + esc(T("Попробуйте другое слово, например «камера» или «подогрев»")) + '</p><button type="button" class="lot-options__empty-reset" data-opt-clear>' + esc(T("Сбросить поиск")) + '</button></div></div>';
    }).catch(function(){ body.innerHTML = '<p class="lot-options__loading">' + esc(T("Не удалось загрузить комплектацию.")) + '</p>'; });
  }
  function filterOptions(q){
    var sec = document.querySelector("[data-options-section]"); if(!sec) return;
    q = String(q || "").trim().toLowerCase();
    var clear = sec.querySelector("[data-opt-clear].lot-search__clear"); if(clear) clear.style.display = q ? "" : "none";
    var keysEl = sec.querySelector("[data-opt-keys]"); if(keysEl) keysEl.style.display = q ? "none" : "";
    var any = false;
    sec.querySelectorAll("[data-opt-group]").forEach(function(g){
      var n = 0;
      g.querySelectorAll("li[data-opt-name]").forEach(function(li){ var hit = !q || li.getAttribute("data-opt-name").indexOf(q) >= 0; li.style.display = hit ? "" : "none"; li.classList.toggle("is-hit", !!q && hit); if(hit) n++; });
      g.style.display = n ? "" : "none"; if(n) any = true;
      var cnt = g.querySelector("[data-opt-count]"); if(cnt) cnt.textContent = q ? (n + " / " + cnt.getAttribute("data-total")) : cnt.getAttribute("data-total");
    });
    var empty = sec.querySelector("[data-opt-empty]"); if(empty){ empty.style.display = (q && !any) ? "" : "none"; var t = empty.querySelector("[data-opt-empty-title]"); if(t) t.textContent = T("По запросу") + " «" + q + "» " + T("ничего нет"); }
  }
  document.addEventListener("input", function(e){ if(e.target.hasAttribute && e.target.hasAttribute("data-opt-search")) filterOptions(e.target.value); });
  document.addEventListener("click", function(e){ var c = e.target.closest("[data-opt-clear]"); if(!c) return; var inp = document.querySelector("[data-opt-search]"); if(inp){ inp.value = ""; } filterOptions(""); });

  // ============ История ============
  function checkTone(k){ return k === "present" ? "is-warn" : k === "not_present" ? "is-ok" : "is-muted"; }
  function historySectionHtml(h){
    var r = h.r, s = h.s;
    var lastKm = h.readings.length ? h.readings[h.readings.length - 1].km : (state.listing && state.listing.odometer);
    var answers = '<li class="' + (h.claimCount > 0 ? "is-bad" : "is-ok") + ' is-main"><span class="lot-hist__mark">' + (h.claimCount > 0 ? I.warn : I.check) + '</span><span class="lot-hist__label">' + esc(T("Страховые случаи")) + '</span><b class="lot-hist__value num" data-no-i18n="true">' + (h.claimCount > 0 ? (h.claimCount + (h.claimsTotal ? " · " + esc(usdApprox(h.claimsTotal, h.claimsCur)) : "")) : esc(T("Не было"))) + '</b></li>'
      + '<li class="is-info is-main"><span class="lot-hist__mark">' + I.minus + '</span><span class="lot-hist__label">' + esc(T("Смены владельца")) + '</span><b class="lot-hist__value num" data-no-i18n="true">' + h.owners + '</b></li>'
      + (lastKm != null ? '<li class="' + (h.rollback ? "is-warn" : "is-ok") + ' is-main"><span class="lot-hist__mark">' + (h.rollback ? I.warn : I.check) + '</span><span class="lot-hist__label">' + esc(T("Пробег")) + '</span><b class="lot-hist__value num" data-no-i18n="true">' + esc(fmtNum(lastKm)) + ' ' + esc(T("км")) + '<small>' + esc(h.rollback ? T("есть признак скрутки") : T("скрутки не видно")) + '</small></b></li>' : "");
    var gaps = h.events.filter(function(e){ return e.type_key === "insurance_coverage_gap"; }).length;
    answers += '<li class="' + (gaps ? "is-warn" : "is-ok") + '"><span class="lot-hist__mark">' + (gaps ? I.warn : I.check) + '</span><span class="lot-hist__label">' + esc(T("Перерывы в страховке")) + '</span><b class="lot-hist__value num">' + esc(gaps ? T("Было") : T("Не было")) + '</b></li>';
    var unknownChecks = [];
    h.checks.slice().sort(function(a, b){ var rk = {present:0, not_present:1}; return (rk[a.result_key] != null ? rk[a.result_key] : 2) - (rk[b.result_key] != null ? rk[b.result_key] : 2); }).forEach(function(c){
      var label = termOr(r, "check_type", c.type_key, humanizeKey(c.type_key));
      if(c.result_key !== "present" && c.result_key !== "not_present"){ unknownChecks.push(label); return; }
      var bad = c.result_key === "present";
      answers += '<li class="' + (bad ? "is-bad" : "is-ok") + '"><span class="lot-hist__mark">' + (bad ? I.warn : I.check) + '</span><span class="lot-hist__label" data-no-i18n="true">' + esc(label) + '</span><b class="lot-hist__value num">' + esc(bad ? T("Было") : T("Не было")) + '</b></li>';
    });
    var cov = (r.coverage && !Array.isArray(r.coverage)) ? r.coverage : {};
    var foot = [];
    if(s.first_registered_at) foot.push(T("Первая регистрация") + ": " + fmtDate(s.first_registered_at));
    if(cov.period_start || cov.period_end) foot.push(T("Период отчёта") + ": " + fmtDate(cov.period_start) + " → " + (cov.period_end ? fmtDate(cov.period_end) : T("сейчас")));
    if(s.registration_change_count != null) foot.push(T("Смен номера") + ": " + s.registration_change_count);
    var html = '<section id="history" class="lot-section"><header class="lot-section__head"><div class="min-w-0"><h2 class="lot-section__title">' + esc(T("История")) + '</h2><p class="lot-section__verdict"><span class="lot-section__dot ' + h.tone + '"></span><span data-no-i18n="true">' + esc(histVerdictText(h)) + '<span class="lot-section__meta">' + esc(T("по страховой базе")) + '</span></span></p></div></header><div class="lot-section__body"><div class="lot-rep lot-hist">'
      + '<div class="lot-hist__side"><p class="lot-hist__cap">' + esc(T("Главное")) + '</p><ul class="lot-hist__answers">' + answers + '</ul>'
      + (foot.length || unknownChecks.length ? '<p class="lot-hist__foot" data-no-i18n="true">' + esc(foot.join(" · ")) + (unknownChecks.length ? '<span class="block">' + esc(T("Нет данных")) + ': ' + esc(unknownChecks.join(", ").toLowerCase()) + '.</span>' : "") + '</p>' : "")
      + '</div><div class="lot-hist__main">';
    if(h.readings.length >= 2) html += odometerHtml(h);
    if(h.claims.length){
      html += '<div><p class="lot-hist__cap">' + esc(T("Страховые случаи")) + '</p><ul class="lot-hist__claims">' + h.claims.slice().sort(function(a, b){ return new Date(b.occurred_at) - new Date(a.occurred_at); }).map(function(e){
        var policy = e.subtype_key ? termOr(r, "event_subtype", e.subtype_key, e.source_label) : (e.source_label || T("Страховой случай"));
        return '<li><span class="lot-hist__date num" data-no-i18n="true">' + esc(fmtDate(e.occurred_at)) + '</span><span class="lot-hist__policy" data-no-i18n="true">' + esc(policy) + '</span><span class="lot-hist__sum num" data-no-i18n="true">' + (e.amount_total != null ? esc(usdApprox(e.amount_total, e.currency || h.claimsCur)) + (toUsd(1, e.currency || h.claimsCur) != null ? '<small>' + esc(fmtNum(e.amount_total)) + ' ' + esc(String(e.currency || h.claimsCur).toUpperCase()) + '</small>' : "") : esc(T("сумма не указана"))) + '</span></li>';
      }).join("") + '</ul>' + (h.claimsTotal ? '<p class="lot-hist__total num" data-no-i18n="true"><span>' + esc(T("Всего выплачено")) + '</span><span>' + esc(usdApprox(h.claimsTotal, h.claimsCur)) + '</span></p>' : "") + '</div>';
    }
    html += '<div><button type="button" class="lot-rep__full !mt-0" data-full-open="timeline" aria-haspopup="dialog"><span class="lot-rep__full-icon">' + I.historyBig + '</span><span class="min-w-0 flex-1"><span class="lot-rep__full-title">' + esc(T("Хронология автомобиля")) + '</span><span class="lot-rep__full-sub" data-no-i18n="true">' + h.events.length + ' ' + plural(h.events.length, T("событие"), T("события"), T("событий")) + ' ' + esc(T("по годам")) + '</span></span><span class="lot-rep__full-go">' + esc(T("Открыть")) + I.arrR + '</span></button></div>';
    html += '</div></div></div></section>';
    return html;
  }
  function odometerHtml(h){
    var rd = h.readings;
    var t0 = new Date(rd[0].date).getTime(), t1 = new Date(rd[rd.length - 1].date).getTime(); if(t1 <= t0) t1 = t0 + 1;
    var maxKm = Math.max.apply(null, rd.map(function(x){ return x.km; })) || 1;
    var top = maxKm * 1.08;
    function xOf(t){ return 2 + (t - t0) / (t1 - t0) * 96; }
    function yOf(km){ return 100 - (km / top) * 100; }
    var pts = rd.map(function(x){ return {x:xOf(new Date(x.date).getTime()), y:yOf(x.km), date:fmtDate(x.date), km:fmtNum(x.km) + " " + T("км"), label:termOr(h.r, "event_type", x.e.type_key, humanizeKey(x.e.type_key)), kind:x.e.type_key === "owner_change" ? "owner" : "plain"}; });
    var poly = pts.map(function(p){ return p.x.toFixed(2) + "," + p.y.toFixed(2); }).join(" ");
    var polygon = pts[0].x.toFixed(2) + ",100 " + poly + " " + pts[pts.length - 1].x.toFixed(2) + ",100";
    function interpY(t){ for(var i = 1; i < rd.length; i++){ var a = new Date(rd[i - 1].date).getTime(), b = new Date(rd[i].date).getTime(); if(t <= b){ var f = b === a ? 0 : (t - a) / (b - a); return yOf(rd[i - 1].km + (rd[i].km - rd[i - 1].km) * Math.max(0, Math.min(1, f))); } } return yOf(rd[rd.length - 1].km); }
    var marks = h.events.filter(function(e){ return (e.type_key === "insurance_claim" || e.type_key === "owner_change") && e.occurred_at; }).map(function(e){ var t = new Date(e.occurred_at).getTime(); var x = Math.max(2, Math.min(98, xOf(t))); return {x:x, y:interpY(t), kind:e.type_key === "owner_change" ? "owner" : "claim", date:fmtDate(e.occurred_at), km:e.mileage_km != null ? fmtNum(Math.round(e.mileage_km)) + " " + T("км") : "", label:termOr(h.r, "event_type", e.type_key, humanizeKey(e.type_key)) + (e.subtype_key ? ": " + termOr(h.r, "event_subtype", e.subtype_key, "") : "")}; });
    var all = pts.concat(marks).sort(function(a, b){ return a.x - b.x; });
    var step = maxKm > 150000 ? 100000 : maxKm > 60000 ? 50000 : maxKm > 20000 ? 20000 : 10000;
    var ticks = ""; for(var v = step; v < top; v += step) ticks += '<span class="lot-odo__mark" style="top: ' + yOf(v).toFixed(2) + '%"><span class="num">' + (v >= 1000 ? fmtNum(v / 1000) + " " + T("тыс. км") : v) + '</span></span>';
    var years = ""; var y0 = new Date(t0).getUTCFullYear() + 1, y1 = new Date(t1).getUTCFullYear(); for(var y = y0; y <= y1; y++){ var tx = xOf(Date.UTC(y, 0, 1)); if(tx > 4 && tx < 96) years += '<span class="num" style="left: ' + tx.toFixed(2) + '%">' + y + '</span>'; }
    return '<figure class="lot-odo" data-odo="' + esc(JSON.stringify(all)) + '"><figcaption class="lot-hist__head"><span class="lot-hist__cap">' + esc(T("Пробег по годам")) + '</span><span class="lot-odo__legend"><span><i class="is-claim"></i>' + esc(T("Страховой случай")) + '</span><span><i class="is-owner"></i>' + esc(T("Смена владельца")) + '</span></span></figcaption>'
      + '<div class="lot-odo__plate"><div class="lot-odo__plot" data-odo-plot tabindex="0" role="img" aria-label="' + esc(T("Пробег по годам")) + '">' + ticks
      + '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="lot-odo-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ed0012" stop-opacity=".22"/><stop offset="1" stop-color="#ed0012" stop-opacity="0"/></linearGradient></defs><polygon points="' + polygon + '" fill="url(#lot-odo-fill)"/><polyline points="' + poly + '" class="lot-odo__line" vector-effect="non-scaling-stroke"/></svg>'
      + marks.map(function(mk){ return '<span class="lot-odo__dot is-' + mk.kind + '" style="left: ' + mk.x.toFixed(2) + '%; top: ' + mk.y.toFixed(2) + '%"></span>'; }).join("")
      + '<div data-odo-cur style="display:none"><span class="lot-odo__cross"></span><span class="lot-odo__pin"></span><div class="lot-odo__tip"><span class="lot-odo__tip-date num"></span><b class="num"></b><span class="lot-odo__tip-label"><i></i><span></span></span></div></div>'
      + '</div><div class="lot-odo__years" aria-hidden="true">' + years + '</div></div></figure>';
  }
  function afterHistoryRender(){
    var fig = document.querySelector(".lot-odo[data-odo]"); if(!fig) return;
    var pts; try{ pts = JSON.parse(fig.getAttribute("data-odo")); }catch(e){ return; }
    var plot = fig.querySelector("[data-odo-plot]"), cur = fig.querySelector("[data-odo-cur]");
    function show(p){
      cur.style.display = "";
      cur.querySelector(".lot-odo__cross").style.left = p.x + "%";
      var pin = cur.querySelector(".lot-odo__pin"); pin.className = "lot-odo__pin is-" + p.kind; pin.style.left = p.x + "%"; pin.style.top = p.y + "%";
      var tip = cur.querySelector(".lot-odo__tip"); tip.classList.toggle("is-left", p.x > 58); tip.style.left = p.x + "%"; tip.style.top = "clamp(34px, " + p.y + "%, calc(100% - 34px))";
      tip.querySelector(".lot-odo__tip-date").textContent = p.date;
      var b = tip.querySelector("b"); b.textContent = p.km || T("пробег не записан"); b.classList.toggle("is-none", !p.km);
      tip.querySelector(".lot-odo__tip-label i").className = "is-" + p.kind; tip.querySelector(".lot-odo__tip-label span").textContent = p.label;
    }
    function track(e){ var r = plot.getBoundingClientRect(); var x = (e.clientX - r.left) / r.width * 100; var best = pts[0]; pts.forEach(function(p){ if(Math.abs(p.x - x) < Math.abs(best.x - x)) best = p; }); show(best); }
    plot.addEventListener("pointermove", track); plot.addEventListener("pointerdown", track);
    plot.addEventListener("pointerleave", function(){ cur.style.display = "none"; });
  }
  function timelinePanel(h){
    var r = h.r;
    var dated = h.events.filter(function(e){ return e.occurred_at; }).sort(function(a, b){ return new Date(a.occurred_at) - new Date(b.occurred_at); });
    var items = "", year = null, i = 0;
    function tone(e){ if(e.type_key === "insurance_claim" || e.type_key === "insurance_coverage_gap" || e.type_key === "total_loss" || (e.type_key === "recall" && e.status_key === "recall_open")) return "is-risk"; if(e.type_key === "owner_change") return "is-owner"; if(e.type_key === "maintenance" || e.type_key === "statutory_inspection" || e.type_key === "recall") return "is-ok"; return "is-plain"; }
    dated.forEach(function(e){
      var y = new Date(e.occurred_at).getUTCFullYear();
      if(y !== year){ year = y; items += '<li class="lot-tl__year" style="--i: ' + (i++) + '"><span class="num">' + y + '</span></li>'; }
      var tn = tone(e), facts = [];
      if(e.mileage_km != null) facts.push('<span class="lot-tl__chip num">' + I.odoChip + esc(fmtNum(Math.round(e.mileage_km))) + ' ' + esc(T("км")) + '</span>');
      if(e.amount_total != null) facts.push('<span class="lot-tl__chip is-paid num">' + esc(usdApprox(e.amount_total, e.currency || h.claimsCur)) + (toUsd(1, e.currency || h.claimsCur) != null ? '<small>' + esc(fmtNum(e.amount_total)) + ' ' + esc(String(e.currency || h.claimsCur).toUpperCase()) + '</small>' : "") + '</span>');
      if(e.organization_name) facts.push('<span>' + esc(e.organization_name) + '</span>');
      (e.details || []).filter(function(d){ return d.value_text && !/mileage|amount|currency/.test(d.key || ""); }).slice(0, 3).forEach(function(d){ var lbl = term(r, "detail", d.key) || d.source_label; facts.push('<span>' + esc(lbl ? lbl + ": " + d.value_text : d.value_text) + '</span>'); });
      if(e.status_key && e.type_key === "recall") facts.push('<span>' + esc(termOr(r, "event_subtype", e.status_key, humanizeKey(e.status_key))) + '</span>');
      var title = termOr(r, "event_type", e.type_key, humanizeKey(e.type_key)) + (e.subtype_key ? ": " + termOr(r, "event_subtype", e.subtype_key, humanizeKey(e.subtype_key)) : "");
      items += '<li class="lot-tl__event ' + tn + '" style="--i: ' + (i++) + '"><span class="lot-tl__day num" data-no-i18n="true">' + esc(fmtDatePrecise(e.occurred_at, e.date_precision_key)) + '</span><span class="lot-tl__node">' + (tn === "is-ok" ? I.check : tn === "is-risk" ? I.warn : tn === "is-owner" ? I.owners : "") + '</span><div class="lot-tl__body"><p class="lot-tl__title" data-no-i18n="true">' + esc(title) + '</p>' + (facts.length ? '<p class="lot-tl__facts" data-no-i18n="true">' + facts.join("") + '</p>' : "") + '</div></li>';
    });
    openFull(T("Хронология автомобиля"), dated.length + " " + plural(dated.length, T("событие"), T("события"), T("событий")) + " " + T("по годам"), '<ol class="lot-tl">' + items + '</ol>');
  }

  // ============ Объявления ============
  function listingsSectionHtml(){
    var car = state.car, listings = (car.listings || []).slice(), cur = state.listing;
    var byDomain = {}; listings.forEach(function(l){ var k = l.external ? l.external.domain.id : "x"; (byDomain[k] = byDomain[k] || []).push(l); });
    var prices = new Set(listings.map(function(l){ var p = listingPrice(l); return p ? p.amount : null; }).filter(function(x){ return x != null; }));
    var same = prices.size <= 1;
    var sites = Object.keys(byDomain).length;
    var html = '<section id="listings" class="lot-section"><header class="lot-section__head"><div class="min-w-0"><h2 class="lot-section__title">' + esc(T("Где продаётся этот автомобиль")) + '</h2><p class="lot-section__verdict"><span class="lot-section__dot ' + (same ? "is-ok" : "is-warn") + '"></span><span>' + esc(same ? T("Цена везде одинаковая") : T("Цены различаются")) + '<span class="lot-section__meta" data-no-i18n="true">' + sites + ' ' + plural(sites, T("площадка"), T("площадки"), T("площадок")) + ' · ' + listings.length + ' ' + plural(listings.length, T("объявление"), T("объявления"), T("объявлений")) + ' · ' + esc(T("цены в долларах по текущему курсу")) + '</span></span></p></div></header><div class="lot-section__body"><div class="lot-tree">'
      + '<figure class="lot-tree__car"><span class="lot-tree__photo">' + (state.photos[0] ? '<img src="' + esc(state.photos[0]) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + '</span><figcaption class="min-w-0"><span class="lot-tree__title" data-no-i18n="true">' + esc(titleOf(car, cur)) + '</span>' + (car.vin ? '<span class="lot-tree__vin" data-no-i18n="true">VIN ' + esc(String(car.vin).toUpperCase()) + '</span>' : "") + '</figcaption></figure><div class="lot-sites">';
    Object.keys(byDomain).forEach(function(k){
      var ls = byDomain[k].sort(function(a, b){ return (a.archived ? 1 : 0) - (b.archived ? 1 : 0); }), d0 = ls[0].external;
      var host = d0 && d0.url ? String(d0.url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0] : "";
      html += '<section class="lot-site"><span class="lot-tree__dot" aria-hidden="true"></span><header class="lot-site__head"><span class="lot-site__mark" aria-hidden="true">' + I.globe + '</span><div class="min-w-0"><p class="lot-site__name" data-no-i18n="true">' + esc(d0 ? d0.domain.name : "") + (host ? '<span class="lot-site__domain">' + esc(host) + '</span>' : "") + '</p><p class="lot-site__meta" data-no-i18n="true">' + ls.length + ' ' + plural(ls.length, T("объявление"), T("объявления"), T("объявлений")) + '</p></div></header><ol class="lot-site__rows">'
        + ls.map(function(l, idx){
          var isCur = l === cur, pr = listingPrice(l), mp = pr ? moneyParts(pr.amount, pr.cur) : null, img = Array.isArray(l.images) && l.images.length ? imageUrl(l.images[0]) : "";
          var tm = l.title && typeof l.title === "object" ? (l.title[lang()] || l.title.en || Object.values(l.title)[0]) : (l.title || titleOf(car, l));
          var upd = l.last_seen_at || l.updated_at;
          return '<li class="lot-site__row' + (isCur ? " is-shown" : "") + (l.archived ? " is-archived" : "") + '"><a href="' + esc(listingHref(car, l)) + '" class="lot-site__thumb" tabindex="-1" aria-hidden="true">' + (img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : "") + (isCur ? '<span class="lot-site__here">' + esc(T("Вы здесь")) + '</span>' : "") + '</a>'
            + '<div class="min-w-0"><p class="lot-site__listing"><span class="lot-site__title" data-no-i18n="true">' + esc(tm) + '</span>' + (isCur ? '<span class="lot-site__now">' + I.eye + esc(T("Вы смотрите это")) + '</span>' : (idx > 0 ? '<span class="lot-site__note">' + esc(T("повторное объявление")) + '</span>' : "")) + '</p>'
            + '<p class="lot-site__state"><span><span class="lot-site__status"></span>' + esc(l.archived ? T("Продано") : T("В продаже")) + '</span>' + (upd ? '<span class="lot-site__date"><span class="lot-site__date-long" data-no-i18n="true">' + esc(T("обновлено")) + ' ' + esc(fmtDate(upd)) + '</span><span class="lot-site__date-short" data-no-i18n="true">' + esc(fmtDayMon(upd)) + '</span></span>' : "") + (l.external ? '<span class="lot-site__id num" title="' + esc(l.external.id) + '" data-no-i18n="true">#' + esc(l.external.id) + '</span>' : "") + '</p></div>'
            + '<div class="lot-site__side"><div class="lot-site__price"><small>' + esc(T("Цена объявления")) + '</small>' + (mp ? '<span class="num" data-no-i18n="true">' + esc(mp.main) + '</span>' + (mp.sub ? '<small class="num" data-no-i18n="true">' + esc(mp.sub) + '</small>' : "") : '<span class="num">—</span>') + '</div>'
            + (isCur ? '<div class="lot-site__actions"></div>' : '<span class="lot-site__go" aria-hidden="true">' + I.chevR + '</span><div class="lot-site__actions"><a href="' + esc(listingHref(car, l)) + '" class="lot-btn">' + esc(T("Открыть")) + '</a></div>') + '</div></li>';
        }).join("") + '</ol></section>';
    });
    return html + '</div></div></div></section>';
  }

  // ============ Похожие / другие модели ============
  function simCard(c){
    var l = (c.listings || []).filter(function(x){ return !x.archived; })[0] || (c.listings || [])[0];
    var img = l && Array.isArray(l.images) && l.images.length ? imageUrl(l.images[0]) : "";
    var pr = listingPrice(l), mp = pr ? moneyParts(pr.amount, pr.cur) : null;
    var specs = [];
    if(l && l.odometer != null) specs.push(fmtNum(l.odometer) + " " + T("км"));
    if(c.fuel) specs.push(T(FUELS[c.fuel.id] || c.fuel.name));
    if(c.transmission) specs.push(T(TRANSMISSIONS[c.transmission.id] || c.transmission.name));
    return '<article class="vcard vcard--api group"><a href="' + esc(listingHref(c, l)) + '" class="vcard__media' + (img ? " is-loaded" : " no-photo is-loaded") + '" data-no-photo="' + esc(T("Фото скоро появятся")) + '">' + (img ? '<img class="vcard__single" src="' + esc(img) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">' : "") + '</a>'
      + '<div class="vcard__body flex flex-1 flex-col gap-3 px-4 pb-4 pt-3.5"><div class="vcard__main"><h3 class="min-w-0 flex-1"><a href="' + esc(listingHref(c, l)) + '" class="vcard__hit vcard__title font-display text-[16px] font-semibold leading-snug tracking-tight text-ink line-clamp-2" data-no-i18n="true">' + esc(titleOf(c, l)) + '</a>' + (c.badge ? '<span class="vcard__badge mt-0.5 block truncate text-[13px] font-normal text-ink-3" data-no-i18n="true">' + esc(c.badge) + '</span>' : "") + '</h3><p class="text-[13px] text-ink-2 truncate" data-no-i18n="true">' + esc(specs.join(" · ")) + '</p></div>'
      + '<div class="vcard__foot mt-auto flex items-end justify-between gap-3 border-t border-line pt-3"><div class="min-w-0"><p class="truncate text-[11.5px] text-ink-4">' + esc(T("Цена")) + '</p><p class="vcard__price num whitespace-nowrap font-display text-[18px] font-semibold leading-tight tracking-tight text-ink" data-no-i18n="true">' + esc(mp ? mp.main : T("По запросу")) + '</p></div></div></div></article>';
  }
  function renderExtras(){
    var car = state.car, simSlot = document.getElementById("similarSlotV1"), modSlot = document.getElementById("modelsSlotV1");
    if(car.brand && car.model){
      var p = new URLSearchParams(); p.set("action", "search"); p.set("lang", lang()); p.set("brand_id", car.brand.id); p.set("model_id", car.brand.id + ":" + car.model.id);
      if(car.year){ p.set("year_from", String(car.year - 2)); p.set("year_to", String(car.year + 2)); }
      p.set("per_page", "12"); p.set("sort", "newest");
      fetch("/api/catalog?" + p.toString()).then(function(r){ return r.json(); }).then(function(d){
        var items = ((d && d.items) || []).filter(function(c){ return c.id !== car.id; }).slice(0, 8);
        if(!items.length) return;
        var mp = new URLSearchParams(); mp.set("brand_id", car.brand.id); mp.set("model_id", car.brand.id + ":" + car.model.id);
        simSlot.innerHTML = '<section class="lot-sheet lot-extra"><header class="lot-section__head"><div class="min-w-0"><h2 class="lot-section__title">' + esc(T("Похожие автомобили")) + '</h2><p class="lot-section__sub" data-no-i18n="true">' + esc(car.brand.name + " " + car.model.name) + (car.year ? ", " + (car.year - 2) + "–" + (car.year + 2) : "") + '</p></div><div class="lot-section__actions"><a class="btn btn-secondary btn-sm" href="/catalog?' + mp.toString() + '">' + esc(T("Все предложения")) + I.arrR + '</a></div></header><div class="vcard-grid vcard-grid--wide">' + items.map(simCard).join("") + '</div></section>';
      }).catch(function(){});
    }
    if(car.brand){
      fetch("/api/catalog?action=models&brand_id=" + encodeURIComponent(car.brand.id) + "&lang=" + encodeURIComponent(lang())).then(function(r){ return r.json(); }).then(function(d){
        var items = ((d && d.items) || []).filter(function(mm){ return !car.model || mm.id !== car.model.id; }).slice(0, 30);
        if(!items.length) return;
        modSlot.innerHTML = '<section class="lot-sheet lot-extra"><header class="lot-section__head"><div class="min-w-0"><h2 class="lot-section__title" data-no-i18n="true">' + esc(T("Другие модели")) + ' ' + esc(car.brand.name) + '</h2></div></header><div class="flex flex-wrap gap-2">' + items.map(function(mm){ var mp = new URLSearchParams(); mp.set("brand_id", car.brand.id); mp.set("model_id", car.brand.id + ":" + mm.id); return '<a class="cf-pill" href="/catalog?' + mp.toString() + '" data-no-i18n="true">' + esc(mm.name || ("ID " + mm.id)) + '</a>'; }).join("") + '</div></section>';
      }).catch(function(){});
    }
  }

  // ============ Заявка (модалка) ============
  var modal = null;
  function ensureModal(){
    if(modal) return modal;
    modal = document.createElement("div"); modal.className = "lot-modal"; modal.hidden = true;
    modal.innerHTML = '<div class="lot-modal__card"><button type="button" class="sheet-close lot-modal__close" data-close aria-label="' + esc(T("Закрыть")) + '">' + I.x + '</button><h3 class="lot-modal__title">' + esc(T("Написать менеджеру")) + '</h3><p class="lot-modal__car" id="catLeadCarLineV1" data-no-i18n="true"></p>'
      + '<form id="catLeadFormV1" novalidate class="lot-modal__form"><input class="cf-input" name="name" type="text" autocomplete="name" placeholder="' + esc(T("Ваше имя")) + '" required><input class="cf-input" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="' + esc(T("Телефон или Telegram")) + '" required><input name="hp_website" type="text" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true"><button type="submit" class="btn btn-primary btn-lg w-full">' + esc(T("Оставить заявку")) + '</button><small class="lot-modal__msg" id="catLeadMsgV1"></small></form></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function(e){ if(e.target === modal || e.target.closest("[data-close]")) closeLeadModal(); });
    modal.querySelector("#catLeadFormV1").addEventListener("submit", submitLead);
    return modal;
  }
  function openLeadModal(){
    var mo = ensureModal(), line = mo.querySelector("#catLeadCarLineV1");
    if(line) line.textContent = titleOf(state.car, state.listing) + (state.car.badge ? " " + state.car.badge : "");
    var form = mo.querySelector("#catLeadFormV1"); form.reset(); form.hidden = false;
    var ok = mo.querySelector(".lot-modal__ok"); if(ok) ok.remove();
    mo.hidden = false; document.documentElement.classList.add("overflow-hidden");
  }
  function closeLeadModal(){ if(modal) modal.hidden = true; document.documentElement.classList.remove("overflow-hidden"); }
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && modal && !modal.hidden) closeLeadModal(); });
  function submitLead(e){
    e.preventDefault();
    var form = e.target, msg = document.getElementById("catLeadMsgV1");
    var name = form.name.value.trim(), phone = form.phone.value.trim();
    if(name.length < 2 || phone.length < 5){ if(msg) msg.textContent = T("Укажите имя и контакт для связи"); return; }
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    var car = state.car, listing = state.listing;
    fetch("/api/auctions?action=lead", {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({name:name, phone:phone, hp_website:form.hp_website.value, source:"Каталог Encar", vin:car.vin || "", page:location.href, comment:"Каталог Encar " + (car.id || "") + ": " + titleOf(car, listing) + (listing && listing.odometer ? " — " + fmtNum(listing.odometer) + " км" : "")})})
      .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return r.ok && d.ok; }); }).catch(function(){ return false; })
      .then(function(ok){
        if(ok){ form.hidden = true; var div = document.createElement("div"); div.className = "lot-modal__ok"; div.innerHTML = "<b>" + esc(T("Заявка отправлена!")) + "</b><span>" + esc(T("Мы свяжемся с вами в ближайшее время.")) + "</span>"; form.closest(".lot-modal__card").appendChild(div); }
        else{ btn.disabled = false; if(msg) msg.textContent = T("Не удалось отправить. Напишите нам в WhatsApp или Telegram."); }
      });
  }

  load();
})();
