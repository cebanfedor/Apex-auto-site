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

  var state = {car:null, listing:null, galIdx:0};

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

  // 05.11.2026 (Федор: «всегда грузить оригиналы»): `original` — ссылка источника на исходное фото (не наша
  // пересжатая копия), см. ту же правку и комментарий в catalog.js. `downloaded`/`preview` — запасные варианты.
  function firstImageUrl(img){ return img.original || img.downloaded || img.preview || ""; }

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

    renderCrumbs();
    renderMeta();
    renderSold();
    renderGallery();
    renderOverview();
    // 05.11.2026 (эталон autopartner.by/korea): секции ниже — вертикальный скролл, не переключаемые
    // табы, поэтому все рендерятся сразу (не лениво по клику) — renderStickyNav прячет и nav-пункт,
    // и саму секцию, если для неё реально нет данных у выбранного объявления.
    renderListingsTab();
    renderEquipmentTab();
    renderInspectionTab();
    renderHistoryTab();
    renderStickyNav();
    wireStickyNavScroll();
    renderSimilarAndModels();
  }

  // Хлебные крошки (05.11.2026, эталон autopartner.by/korea): Каталог → Марка → Модель → полное название.
  function renderCrumbs(){
    var el = document.getElementById("catCrumbsV1");
    if(!el) return;
    var car = state.car;
    var parts = ['<a href="/catalog">' + esc(T("Каталог Encar")) + '</a>'];
    if(car.brand){
      var bp = new URLSearchParams(); bp.set("brand_id", car.brand.id);
      parts.push('<a href="/catalog?' + bp.toString() + '" data-no-i18n="true">' + esc(car.brand.name) + '</a>');
    }
    if(car.brand && car.model){
      var mp = new URLSearchParams(); mp.set("brand_id", car.brand.id); mp.set("model_id", car.brand.id + ":" + car.model.id);
      parts.push('<a href="/catalog?' + mp.toString() + '" data-no-i18n="true">' + esc(car.model.name) + '</a>');
    }
    parts.push('<span data-no-i18n="true">' + esc(titleOf(car, state.listing)) + '</span>');
    el.innerHTML = parts.join('<i class="catCrumbSepV1" aria-hidden="true">›</i>');
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
    if(ol) ol.addEventListener("click", function(){ scrollToAnchor("listings"); });
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
    mainImg.onclick = function(){ if(imgs.length) openLightbox(imgs, state.galIdx); };
    var zoomHint = document.getElementById("catGalZoomHintV1");
    if(zoomHint) zoomHint.onclick = function(e){ e.stopPropagation(); if(imgs.length) openLightbox(imgs, state.galIdx); };
  }

  // ============ Лайтбокс фото (05.11.2026, Федор: «не могу открыть фотки, увеличить итд») — полноэкранный
  // просмотр с зумом, тот же приём, что уже на /auctions и /in-transit (двойной клик/тап 1×→2×→3×, колесо,
  // перетаскивание, пинч на телефоне), но свой изолированный набор классов catLb* — страница /catalog/<id>
  // не подключает auctions.js/auctions.css (см. шапку файла), поэтому код здесь самостоятельный.
  var lb = {images:[], idx:0, zoom:1, panX:0, panY:0, dragging:false, startX:0, startY:0, pinchDist:0, pinchZoom:1};
  var lbEl = null;
  function ensureLightbox(){
    if(lbEl) return lbEl;
    var el = document.createElement("div");
    el.className = "catLbV1";
    el.hidden = true;
    el.tabIndex = -1;
    el.innerHTML = '<button type="button" class="catLbCloseV1" aria-label="' + esc(T("Закрыть")) + '">✕</button>'
      + '<button type="button" class="catLbArrV1 catLbPrevV1" aria-label="' + esc(T("Предыдущее фото")) + '">‹</button>'
      + '<button type="button" class="catLbArrV1 catLbNextV1" aria-label="' + esc(T("Следующее фото")) + '">›</button>'
      + '<div class="catLbStageV1"><img class="catLbImgV1" alt=""></div>'
      + '<span class="catLbCountV1"></span>';
    document.body.appendChild(el);
    lbEl = el;
    wireLightbox(el);
    return el;
  }
  function lbApplyTransform(){
    if(!lbEl) return;
    var img = lbEl.querySelector(".catLbImgV1");
    img.style.transform = "translate(" + lb.panX + "px," + lb.panY + "px) scale(" + lb.zoom + ")";
    lbEl.classList.toggle("isZoomedV1", lb.zoom > 1.01);
  }
  function lbResetZoom(){ lb.zoom = 1; lb.panX = 0; lb.panY = 0; lbApplyTransform(); }
  function lbRender(){
    var img = lbEl.querySelector(".catLbImgV1");
    img.src = lb.images[lb.idx] || "";
    lbResetZoom();
    lbEl.querySelector(".catLbCountV1").textContent = lb.images.length ? ((lb.idx + 1) + " / " + lb.images.length) : "";
  }
  function lbNav(delta){ if(!lb.images.length) return; lb.idx = (lb.idx + delta + lb.images.length) % lb.images.length; lbRender(); }
  function lbCycleZoom(){
    var steps = [1, 2, 3];
    var cur = steps.indexOf(Math.round(lb.zoom));
    lb.zoom = steps[(cur + 1 >= 0 ? cur + 1 : 1) % steps.length];
    if(lb.zoom <= 1){ lb.panX = 0; lb.panY = 0; }
    lbApplyTransform();
  }
  function openLightbox(images, idx){
    if(!images || !images.length) return;
    ensureLightbox();
    lb.images = images;
    lb.idx = Math.max(0, Math.min(images.length - 1, idx || 0));
    lbRender();
    lbEl.hidden = false;
    document.body.classList.add("catLbOpenV1");
    lbEl.focus();
  }
  function closeLightbox(){
    if(!lbEl || lbEl.hidden) return;
    lbEl.hidden = true;
    document.body.classList.remove("catLbOpenV1");
  }
  function lbTouchDist(t){ var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY; return Math.sqrt(dx * dx + dy * dy); }
  function wireLightbox(el){
    var stage = el.querySelector(".catLbStageV1");
    el.querySelector(".catLbCloseV1").addEventListener("click", closeLightbox);
    el.querySelector(".catLbPrevV1").addEventListener("click", function(){ lbNav(-1); });
    el.querySelector(".catLbNextV1").addEventListener("click", function(){ lbNav(1); });
    el.addEventListener("click", function(e){ if(e.target === el && lb.zoom <= 1) closeLightbox(); });
    stage.addEventListener("dblclick", function(e){ e.preventDefault(); lbCycleZoom(); });
    stage.addEventListener("wheel", function(e){
      e.preventDefault();
      lb.zoom = Math.min(3, Math.max(1, lb.zoom + (e.deltaY < 0 ? 0.25 : -0.25)));
      if(lb.zoom <= 1){ lb.panX = 0; lb.panY = 0; }
      lbApplyTransform();
    }, {passive:false});
    stage.addEventListener("mousedown", function(e){
      if(lb.zoom <= 1) return;
      lb.dragging = true; lb.startX = e.clientX - lb.panX; lb.startY = e.clientY - lb.panY;
      e.preventDefault();
    });
    window.addEventListener("mousemove", function(e){
      if(!lb.dragging) return;
      lb.panX = e.clientX - lb.startX; lb.panY = e.clientY - lb.startY;
      lbApplyTransform();
    });
    window.addEventListener("mouseup", function(){ lb.dragging = false; });
    var lastTapAt = 0;
    stage.addEventListener("touchstart", function(e){
      if(e.touches.length === 2){
        lb.pinchDist = lbTouchDist(e.touches); lb.pinchZoom = lb.zoom;
      }else if(e.touches.length === 1){
        if(lb.zoom > 1){ lb.dragging = true; lb.startX = e.touches[0].clientX - lb.panX; lb.startY = e.touches[0].clientY - lb.panY; }
        var now = Date.now();
        if(now - lastTapAt < 350){ lbCycleZoom(); }
        lastTapAt = now;
      }
    }, {passive:true});
    stage.addEventListener("touchmove", function(e){
      if(e.touches.length === 2 && lb.pinchDist){
        var d = lbTouchDist(e.touches);
        lb.zoom = Math.min(3, Math.max(1, lb.pinchZoom * (d / lb.pinchDist)));
        if(lb.zoom <= 1){ lb.panX = 0; lb.panY = 0; }
        lbApplyTransform();
        e.preventDefault();
      }else if(e.touches.length === 1 && lb.dragging){
        lb.panX = e.touches[0].clientX - lb.startX; lb.panY = e.touches[0].clientY - lb.startY;
        lbApplyTransform();
        e.preventDefault();
      }
    }, {passive:false});
    stage.addEventListener("touchend", function(e){ if(e.touches.length < 2) lb.pinchDist = 0; if(e.touches.length === 0) lb.dragging = false; });
    document.addEventListener("keydown", function(e){
      if(!lbEl || lbEl.hidden) return;
      if(e.key === "Escape") closeLightbox();
      else if(e.key === "ArrowLeft") lbNav(-1);
      else if(e.key === "ArrowRight") lbNav(1);
    });
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
  function historyHasRisk(car){
    var hist = matchingReports(car.vehicle_history_reports)[0];
    if(!hist) return false;
    var s = (hist.summary && !Array.isArray(hist.summary)) ? hist.summary : {};
    return (s.insurance_claim_count > 0) || (s.total_loss_count > 0) || (s.flood_total_loss_count > 0) || (s.flood_partial_loss_count > 0) || (s.theft_count > 0);
  }
  // 05.11.2026 (эталон autopartner.by/korea, CLAUDE.md): липкая якорная навигация по секциям НИЖЕ Overview —
  // пункт показывается, ТОЛЬКО если для него реально есть данные у ВЫБРАННОГО объявления; сама секция
  // (не только nav-пункт) тоже прячется целиком — пустых плашек "нет данных" в этих разделах не показываем.
  function renderStickyNav(){
    var car = state.car;
    var listings = car.listings || [];
    var optCount = (state.listing && listings.length > 1 ? (state.listing.option_ids || []) : Array.from(new Set((car.option_ids || []).concat((state.listing && state.listing.option_ids) || [])))).length;
    var insp = matchingReports(car.inspections);
    var hist = matchingReports(car.vehicle_history_reports);
    var hasListings = listings.length > 1;

    toggleSection("inspection", "catNavInspV1", insp.length > 0);
    toggleSection("options", "catNavEqV1", optCount > 0);
    toggleSection("history", "catNavHistV1", hist.length > 0);
    toggleSection("listings", "catNavListingsV1", hasListings);

    document.getElementById("catTabEqCountV1").textContent = optCount ? String(optCount) : "";
    document.getElementById("catTabListingsCountV1").textContent = hasListings ? String(listings.length) : "";
    var alertDot = document.getElementById("catNavHistAlertV1");
    if(alertDot) alertDot.hidden = !historyHasRisk(car);

    var nav = document.getElementById("catStickyNavV1");
    if(nav) nav.hidden = !(insp.length || optCount || hist.length || hasListings);

    renderTocCard(car, insp, optCount, hist, hasListings, listings.length);
  }
  var ICON_TOC_INSP = '<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.5"/><path d="M16 16l-3.2-3.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var ICON_TOC_EQ = '<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><path d="M4 6h12M4 10h8M4 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M15 12.5l1.3 1.3 2.2-2.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_TOC_HIST = '<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><circle cx="10" cy="10.5" r="7.2" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.8v4l2.6 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_TOC_LISTINGS = '<svg viewBox="0 0 20 20" fill="none" width="15" height="15"><path d="M10 3l7 3.5-7 3.5-7-3.5L10 3z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M3 10l7 3.5 7-3.5M3 13.5l7 3.5 7-3.5" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  // Карточка-навигатор под фото (05.11.2026, эталон `.lot-toc`): 4 плитки с иконкой+подписью+значением,
  // та же логика видимости, что и у #catStickyNavV1 (toggleSection уже решил, что показывать).
  function renderTocCard(car, insp, optCount, hist, hasListings, listingsCount){
    var box = document.getElementById("catTocCardV1");
    var grid = document.getElementById("catTocGridV1");
    if(!box || !grid) return;
    var tiles = "";
    if(insp.length){
      var cItems = Array.isArray(insp[0].checked_items) ? insp[0].checked_items : [];
      var issueN = cItems.filter(function(i){ return i.result_key === "issue"; }).length;
      tiles += '<a href="#inspection" data-anchor-link="inspection" class="catTocTileV1 ' + (issueN ? "isWarnV1" : "isOkV1") + '">' + ICON_TOC_INSP + '<span>' + esc(T("Техосмотр")) + '</span><b data-no-i18n="true">' + (issueN ? (T("Замечаний") + ": " + issueN) : T("Без замечаний")) + '</b></a>';
    }
    if(optCount) tiles += '<a href="#options" data-anchor-link="options" class="catTocTileV1">' + ICON_TOC_EQ + '<span>' + esc(T("Комплектация")) + '</span><b data-no-i18n="true">' + optCount + '</b></a>';
    if(hist.length){
      var s = (hist[0].summary && !Array.isArray(hist[0].summary)) ? hist[0].summary : {};
      var risky = historyHasRisk(car);
      var hv = s.insurance_claim_count > 0 ? (String(s.insurance_claim_count) + " " + T("случаев")) : T("Без рисков");
      tiles += '<a href="#history" data-anchor-link="history" class="catTocTileV1 ' + (risky ? "isWarnV1" : "isOkV1") + '">' + ICON_TOC_HIST + '<span>' + esc(T("История")) + '</span><b data-no-i18n="true">' + esc(hv) + '</b></a>';
    }
    if(hasListings) tiles += '<a href="#listings" data-anchor-link="listings" class="catTocTileV1 isOkV1">' + ICON_TOC_LISTINGS + '<span>' + esc(T("Объявления")) + '</span><b data-no-i18n="true">' + listingsCount + '</b></a>';
    grid.innerHTML = tiles;
    box.hidden = !tiles;
  }
  function toggleSection(id, navId, show){
    var sec = document.getElementById(id);
    var nav = document.getElementById(navId);
    if(sec) sec.hidden = !show;
    if(nav) nav.hidden = !show;
  }
  function scrollToAnchor(id){
    var el = document.getElementById(id);
    if(el) el.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block:"start"});
  }
  function wireStickyNavScroll(){
    document.querySelectorAll("#catStickyNavV1 [data-anchor]").forEach(function(btn){
      btn.addEventListener("click", function(){ scrollToAnchor(btn.getAttribute("data-anchor")); });
    });
    var tocCta = document.getElementById("catTocCtaV1");
    if(tocCta) tocCta.addEventListener("click", openLeadModal);
    if(!("IntersectionObserver" in window)) return;
    var sections = Array.from(document.querySelectorAll(".catAnchorSecV1")).filter(function(s){ return !s.hidden; });
    if(!sections.length) return;
    var obs = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(!e.isIntersecting) return;
        document.querySelectorAll("#catStickyNavV1 [data-anchor]").forEach(function(btn){
          btn.classList.toggle("isOnV1", btn.getAttribute("data-anchor") === e.target.id);
        });
      });
    }, {rootMargin:"-120px 0px -55% 0px"});
    sections.forEach(function(s){ obs.observe(s); });
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

  // 05.11.2026 (Федор: «страница машины выглядит кардинально по-разному», сравнение со скриншотом демо-каталога
  // провайдера, Overview) — демо держит цену и характеристики в ОДНОЙ светлой карточке (у нас было: тёмная
  // градиентная карточка цены отдельно + серая полоса фактов отдельно) и показывает тренд цены/тех. поля
  // источника, которых мы вообще не читали, хотя они приходят в ответе API. Объединил в одну карточку,
  // добавил оба реальных поля (ничего не досочинял, см. комментарии ниже).
  function priceTrend(listing){
    // listing.price.history — реальное поле (PriceHistoryEntry[]), просто раньше читался только как счётчик
    // «Изменений цены» в таблице ниже. Сравниваем САМУЮ РАННЮЮ запись с текущей ценой — честная интерпретация
    // подписи «since listed» (сколько раз меняли — отдельная строка в «Объявление», тут именно направление/%).
    if(!listing || !listing.price || !Array.isArray(listing.price.history) || listing.price.history.length < 1) return null;
    var hist = listing.price.history.filter(function(h){ return h && h.price > 0 && h.created_at; }).slice().sort(function(a, b){ return new Date(a.created_at) - new Date(b.created_at); });
    if(!hist.length) return null;
    var oldest = hist[0].price, cur = listing.price.price;
    if(!oldest || !cur || oldest === cur) return null;
    var pct = ((cur - oldest) / oldest) * 100;
    if(Math.abs(pct) < 0.5) return null;
    return {pct:pct, up:pct > 0};
  }
  function renderOverview(){
    var car = state.car, listing = state.listing;
    var html = "";

    var price = priceBlock(car, listing);
    var trend = priceTrend(listing);
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

    // 05.11.2026 (эталон autopartner.by/korea, Федор со скриншотов: «ты видишь разницу?») — кнопка-CTA +
    // мессенджеры прямо под ценой (у них «Написать менеджеру» + Telegram/WhatsApp/Viber; Viber у нас нигде
    // на сайте не подключён — не выдумываю несуществующий контакт, оставляю только Telegram+WhatsApp,
    // те же номер/бот, что уже использует auctions.js для лотов — `t.me/fedukusa`, `api.whatsapp.com/send`
    // вместо wa.me, см. transit.js — site-content.js иначе перепишет голый wa.me-линк).
    var msgTitle = titleOf(car, listing) + (car.badge ? " " + car.badge : "");
    var msgText = T("Здравствуйте! Интересует автомобиль.") + "\n" + T("Авто") + ": " + msgTitle + (car.vin ? ("\nVIN: " + String(car.vin).toUpperCase()) : "") + "\n" + location.href;
    var tgHref = "https://t.me/fedukusa?text=" + encodeURIComponent(msgText);
    var waHref = "https://api.whatsapp.com/send?phone=37368832032&text=" + encodeURIComponent(msgText);

    html += '<div class="catOverviewTopCardV1"><div class="catOvPriceColV1">'
      + '<span class="catPriceLblV1">' + esc(price.label) + '</span>'
      + '<div class="catPriceBigV1" data-no-i18n="true">' + esc(price.amt) + (price.cur ? ' <span class="catPriceCurV1">' + esc(price.cur) + '</span>' : "") + (listing && listing.price && listing.price.negotiable ? '<span class="catNegTagV1">' + esc(T("Торг")) + '</span>' : "") + '</div>'
      + (listing && listing.external ? '<div class="catPriceSrcV1">' + esc(T("на")) + ' <a href="' + esc(listing.external.url) + '" target="_blank" rel="noopener noreferrer" data-no-i18n="true">' + esc(listing.external.domain.name) + '</a></div>' : "")
      + '<div class="catOvMetaRowV1">'
        + (listing && listing.created_at ? '<span class="catListedChipV1">📅 ' + esc(relTime(listing.created_at)) + '</span>' : "")
        + (trend ? '<span class="catTrendBadgeV1 ' + (trend.up ? "isUpV1" : "isDownV1") + '" data-no-i18n="true">' + (trend.up ? "↗" : "↘") + " " + (trend.up ? "+" : "") + trend.pct.toFixed(0) + "% " + esc(T("с момента размещения")) + '</span>' : "")
      + '</div>'
      + '<div class="catPriceActionsV1">'
        + '<button type="button" class="catPriceCtaV1" id="catLeadBtnV1">' + esc(T("Узнать цену под ключ")) + ' <svg viewBox="0 0 24 24" fill="none" width="15" height="15"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
        + '<p class="catMsgOrV1">' + esc(T("или напишите в мессенджер")) + '</p>'
        + '<div class="catMsgRowV1">'
          + '<a href="' + esc(tgHref) + '" target="_blank" rel="noopener noreferrer nofollow" class="catMsgBtnV1" style="--msgBrand:#229ed9" aria-label="Telegram">' + ICON_TG + '<span>Telegram</span></a>'
          + '<a href="' + esc(waHref) + '" target="_blank" rel="noopener noreferrer nofollow" class="catMsgBtnV1" style="--msgBrand:#25d366" aria-label="WhatsApp">' + ICON_WA + '<span>WhatsApp</span></a>'
        + '</div>'
      + '</div>'
    + '</div>'
    + (facts.length ? '<div class="catOvFactsColV1">' + facts.map(function(f){ return '<div class="catFactV1"><small>' + esc(f[0]) + '</small><b data-no-i18n="true">' + esc(f[1]) + '</b></div>'; }).join("") + '</div>' : "")
    + '</div>';

    html += mainInfoHtml(car, listing);
    html += reportsCardHtml(car, listing);

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
  // «Главное» — кликабельные строки-итоги (эталон autopartner.by/korea, Федор со скриншотов «ты видишь
  // разницу?»): ДТП / Техосмотр(ссылка на #inspection) / Страховые случаи(ссылка на #history) / Изменения
  // владельца / Тотал-затопление-угон — те же данные, что уже считает `reportsCardHtml` ниже, просто в их
  // формате компактных строк, а не крупных плиток. Строка показывается, только если за ней реально стоят
  // данные нужного отчёта (ничего не выдумываем на пустом месте).
  var ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M20 6 9 17l-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_WARN_DOT = '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 6.5v7M12 17.5h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICON_OWNERS = '<svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function mainInfoRow(label, cls, icon, value, anchor){
    var inner = '<span class="catMainInfoFactV1">' + icon + '<span data-no-i18n="true">' + esc(value) + '</span></span>';
    var body = anchor ? '<a href="#' + anchor + '" data-anchor-link="' + anchor + '">' + inner + '</a>' : inner;
    return '<div class="catMainInfoRowV1' + (anchor ? " isLinkV1" : "") + '"><dt>' + esc(label) + '</dt><dd class="' + cls + '">' + body + '</dd></div>';
  }
  function mainInfoHtml(car, listing){
    var insp = matchingReports(car.inspections)[0];
    var hist = matchingReports(car.vehicle_history_reports)[0];
    if(!insp && !hist) return "";
    var rows = "";
    if(insp){
      var c = (insp.conclusions && !Array.isArray(insp.conclusions)) ? insp.conclusions : {};
      if(c.accident_status_key){
        var accOk = c.accident_status_key === "not_present" || c.accident_status_key === "ok";
        rows += mainInfoRow(T("ДТП"), accOk ? "isOkV1" : "isWarnV1", accOk ? ICON_CHECK : ICON_WARN_DOT, termOr(insp, "result", c.accident_status_key, accOk ? T("Не было") : T("Было")));
      }
      var cItems = Array.isArray(insp.checked_items) ? insp.checked_items : [];
      var issueN = cItems.filter(function(i){ return i.result_key === "issue"; }).length;
      rows += mainInfoRow(T("Техосмотр"), issueN ? "isWarnV1" : "isOkV1", issueN ? ICON_WARN_DOT : ICON_CHECK, issueN ? (T("Замечаний") + ": " + issueN) : T("Без замечаний"), "inspection");
    }
    if(hist){
      var s = (hist.summary && !Array.isArray(hist.summary)) ? hist.summary : {};
      if(s.insurance_claim_count != null) rows += mainInfoRow(T("Страховые случаи"), s.insurance_claim_count > 0 ? "isWarnV1" : "isOkV1", s.insurance_claim_count > 0 ? ICON_WARN_DOT : ICON_CHECK, s.insurance_claim_count > 0 ? String(s.insurance_claim_count) : T("Нет"), "history");
      if(s.owner_change_count != null) rows += mainInfoRow(T("Изменения владельца"), "", ICON_OWNERS, s.owner_change_count > 0 ? (T("Смен") + ": " + s.owner_change_count) : T("Нет"));
      var totalRisk = (s.total_loss_count > 0) || (s.flood_total_loss_count > 0) || (s.flood_partial_loss_count > 0) || (s.theft_count > 0);
      if(s.total_loss_count != null || s.flood_total_loss_count != null || s.theft_count != null) rows += mainInfoRow(T("Тотал, затопление, угон"), totalRisk ? "isWarnV1" : "isOkV1", totalRisk ? ICON_WARN_DOT : ICON_CHECK, totalRisk ? T("Да") : T("Нет"));
    }
    if(!rows) return "";
    return '<div class="catMainInfoV1"><h4>' + esc(T("Главное")) + '</h4><dl>' + rows + '</dl></div>';
  }
  // «Reports» — сводная карточка в Overview (бриф §6.6.4, как в демо-каталоге провайдера): плитка-ссылка
  // на вкладку Осмотр/История с коротким вердиктом, только если соответствующий отчёт реально есть у ВЫБРАННОГО листинга.
  function reportsCardHtml(car, listing){
    var tiles = "";
    var insp = matchingReports(car.inspections)[0];
    if(insp){
      // inspection_blocks[].issue_count/checked_count у Encar не приходят (04.11.2026) — считаем из checked_items.
      var cItems = Array.isArray(insp.checked_items) ? insp.checked_items : [];
      var issueCount = cItems.filter(function(i){ return i.result_key === "issue"; }).length;
      var checkedCount = cItems.length;
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
  var ICON_TG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21.5 4.5 2.8 11.8c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.2-2.1 4.6 3.4c.8.5 1.4.2 1.6-.8l3-14.1c.3-1.3-.5-1.8-1.9-1.6zM8.2 14.3l9.3-5.9c.4-.3.8-.1.5.2l-7.9 7.1-.3 3.3-1.6-4.7z"/></svg>';
  var ICON_WA = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm5.7 14.3c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.2 1.1-2.4c.3-.3.6-.3.8-.3h.6c.2 0 .5 0 .7.5.3.6.9 2.1 1 2.2.1.2.1.4 0 .6-.1.2-.2.3-.4.5-.2.2-.4.4-.5.6-.2.2-.4.4-.2.8.2.4 1 1.6 2.1 2.6 1.4 1.3 2.6 1.7 3 1.9.4.2.6.1.8-.1.2-.2.9-1 1.1-1.4.2-.4.4-.3.7-.2.3.1 2 1 2.3 1.1.3.2.5.2.6.4.1.1.1.8-.1 1.4z"/></svg>';
  document.addEventListener("click", function(e){
    var t = e.target.closest("[data-report-tab]");
    if(t){ e.preventDefault(); scrollToAnchor(t.getAttribute("data-report-tab") === "equipment" ? "options" : t.getAttribute("data-report-tab")); return; }
    var a = e.target.closest("[data-anchor-link]");
    if(a){ e.preventDefault(); scrollToAnchor(a.getAttribute("data-anchor-link")); }
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

  // ============ Inspection / History — ПОЛНАЯ версия (04.11.2026→след. проход) ============
  // 04.11.2026 (Федор: «добавь полный inspection с диаграммами и историю с таймлайном»): разобрал РЕАЛЬНЫЕ
  // отчёты ~300 машин напрямую через server/catalog-api.js (не выдумывал поля). Находки, важные для чтения
  // остального кода ниже:
  // 1) `report.translations.terms[категория][ключ]` — ГОТОВЫЙ русский перевод от самого провайдера (part/
  //    result/section/claim_type/issue_type/severity — осмотр; check_type/event_type/event_subtype/detail/
  //    date_precision/coverage_section/evidence_type/verification — история). lang=ru в запросе НЕ переводит
  //    source_label/part_label (они остаются EN) — переводим сами через term() ниже. `description`/
  //    `clarification` — свободный текст источника, остаётся как есть (как описание продавца).
  // 2) У Encar реально бывает ТОЛЬКО 6 блоков осмотра: powertrain/mechanical/brakes/electrical (чисто
  //    механические проверки, без привязки к зоне кузова) + exterior/body_structure (листовой металл/рама —
  //    вот тут part_key — реальные названия панелей: front_right_fender, hood, quarter_panel, front_door_left,
  //    front_right_frame_rail и т.п.). НЕТ отдельных блоков Interior/Tires/Wheels, как в общем брифе провайдера
  //    (это описание контракта API в целом, не гарантия, что КАЖДЫЙ источник их заполняет) — у Encar их просто
  //    нет ни у одной из ~300 проверенных машин. Диаграмма построена на РЕАЛЬНОМ наборе зон exterior+
  //    body_structure (ZONE_MAP ниже, из реального словаря part_key), а не на выдуманных 5 зонах из брифа.
  // 3) `inspection_blocks[].checked_count/issue_count` и т.п. — у Encar НЕ ПРИХОДЯТ (только result_key/id/
  //    source_label) → считаем сами из checked_items по block_id.
  // 4) `result_key` на практике — только "ok"/"issue" (не все 6 состояний спеки) — код всё равно поддерживает
  //    все 6, на случай другого источника на этом же ключе в будущем.
  // 5) У History реально есть mileage_km в части событий (manitenance/statutory_inspection) — строим график.

  function term(report, category, key){
    if(!key) return null;
    var terms = report && report.translations && report.translations.terms;
    var cat = terms && typeof terms === "object" && terms[category];
    return (cat && typeof cat === "object" && cat[key]) || null;
  }
  function termOr(report, category, key, fallback){
    return term(report, category, key) || fallback || humanizeKey(key);
  }
  function humanizeKey(k){ return String(k || "").replace(/_/g, " "); }

  var RESULT_STATE = {
    ok: {cls:"isOkV1", ico:"✓"}, not_present: {cls:"isOkV1", ico:"✓"},
    issue: {cls:"isWarnV1", ico:"!"}, present: {cls:"isWarnV1", ico:"!"},
    not_checked: {cls:"isNeutralV1", ico:"?"}, unknown: {cls:"isNeutralV1", ico:"?"},
    not_applicable: {cls:"isNeutralV1", ico:"–"}, not_equipped: {cls:"isNeutralV1", ico:"–"}
  };
  function resultBadgeHtml(report, key, category){
    var st = RESULT_STATE[key] || {cls:"isNeutralV1", ico:"?"};
    return '<span class="catResBadgeV1 ' + st.cls + '">' + st.ico + ' ' + esc(termOr(report, category || "result", key, key ? humanizeKey(key) : T("Неизвестно"))) + '</span>';
  }
  function fmtDatePrecise(iso, precision){
    if(!iso) return "";
    var d = new Date(iso);
    if(isNaN(d.getTime())) return "";
    if(precision === "year") return String(d.getUTCFullYear());
    if(precision === "month") return d.toLocaleDateString("ru-RU", {year:"numeric", month:"long", timeZone:"UTC"});
    return d.toLocaleDateString("ru-RU", {year:"numeric", month:"long", day:"numeric", timeZone:"UTC"});
  }

  // ---------- ОСМОТР ----------
  // Зоны реальной диаграммы кузова — из словаря part_key, собранного со ~300 реальных отчётов Encar (см. выше).
  var ZONE_MAP = {
    hood:"hood", roof_panel:"roof", trunk_floor_panel:"trunk",
    front_apron_panel:"frontBumper", radiator_support:"frontBumper", rear_apron_panel:"rearBumper",
    front_left_fender_apron:"fenderFL", left_front_fender_apron:"fenderFL",
    front_right_fender:"fenderFR", right_front_fender_apron:"fenderFR",
    front_door_left:"doorFL", left_front_door_frame_seal:"doorFL",
    front_door_right:"doorFR",
    rear_door_left:"doorRL", left_rear_door_outer_panel:"doorRL", left_lower_side_sill:"doorRL",
    right_rear_door_frame_seal:"doorRR",
    quarter_panel:"quarterRL", left_rear_fender_inner_panel:"quarterRL",
    right_rear_quarter_panel:"quarterRR", right_rear_fender_inner_panel:"quarterRR", right_rear_wheel_house_inner:"quarterRR"
  };
  var FRAME_ZONE_MAP = {
    front_left_frame_rail:"railFL", front_right_frame_rail:"railFR",
    left_rear_frame_rail:"railRL", right_rear_frame_rail:"railRR",
    floor_panel:"floor", rear_floor_side_member:"floor"
  };
  var EXT_ZONES = [
    ["frontBumper", 50, 4, 100, 16], ["hood", 55, 22, 90, 56],
    ["fenderFL", 42, 26, 12, 92], ["fenderFR", 146, 26, 12, 92],
    ["roof", 58, 84, 84, 134], ["doorFL", 42, 120, 12, 66], ["doorFR", 146, 120, 12, 66],
    ["doorRL", 42, 188, 12, 56], ["doorRR", 146, 188, 12, 56],
    ["quarterRL", 42, 246, 12, 56], ["quarterRR", 146, 246, 12, 56],
    ["trunk", 55, 304, 90, 54], ["rearBumper", 50, 360, 100, 16]
  ];
  var FRAME_ZONES = [["railFL", 4, 4, 42, 30], ["railFR", 54, 4, 42, 30], ["railRL", 4, 42, 42, 30], ["floor", 54, 42, 42, 30]];
  var ZONE_LABEL = {
    frontBumper:"Передний бампер", hood:"Капот", fenderFL:"Левое переднее крыло", fenderFR:"Правое переднее крыло",
    roof:"Крыша/салон", doorFL:"Левая передняя дверь", doorFR:"Правая передняя дверь",
    doorRL:"Левая задняя дверь", doorRR:"Правая задняя дверь", quarterRL:"Левая задняя четверть", quarterRR:"Правая задняя четверть",
    trunk:"Крышка багажника", rearBumper:"Задний бампер",
    railFL:"Передний лонжерон (л)", railFR:"Передний лонжерон (п)", railRL:"Задний лонжерон (л)", railRR:"Задний лонжерон (п)", floor:"Пол/днище"
  };

  function zoneStateOf(items, zoneMap, zoneId){
    var matches = items.filter(function(it){ return zoneMap[it.part_key] === zoneId; });
    if(!matches.length) return {state:"nodata", items:[]};
    if(matches.some(function(m){ return m.result_key === "issue"; })) return {state:"issue", items:matches};
    if(matches.some(function(m){ return m.result_key === "ok"; })) return {state:"ok", items:matches};
    return {state:"unknown", items:matches};
  }
  // Силуэт кузова сверху — чисто декоративная подложка (не из данных API, см. CLAUDE.md «реальные зоны
  // осмотра» — настоящие данные только в зонах-прямоугольниках выше неё). Нужна, чтобы зоны читались как
  // машина, а не как абстрактная сетка (запрошено 1:1 с демо-каталогом провайдера, у них — рисованный топ-вид).
  var CAR_BODY_BG_EXT = '<rect x="20" y="2" width="160" height="376" rx="40" ry="50" fill="var(--field)" stroke="var(--line-2)" stroke-width="1.2"/>'
    + '<circle cx="13" cy="76" r="11" fill="var(--line-2)"/><circle cx="187" cy="76" r="11" fill="var(--line-2)"/>'
    + '<circle cx="13" cy="278" r="11" fill="var(--line-2)"/><circle cx="187" cy="278" r="11" fill="var(--line-2)"/>'
    + '<rect x="58" y="88" width="84" height="136" rx="14" fill="var(--surface)" stroke="var(--line-2)" stroke-width="1"/>';
  var CAR_BODY_BG_FRAME = '<rect x="2" y="2" width="96" height="72" rx="10" fill="var(--field)" stroke="var(--line-2)" stroke-width="1.2"/>'
    + '<line x1="50" y1="2" x2="50" y2="74" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2,3"/>'
    + '<line x1="2" y1="38" x2="98" y2="38" stroke="var(--line-2)" stroke-width="1" stroke-dasharray="2,3"/>';
  function bodyDiagramSvg(report, items, zones, zoneMap, idPrefix){
    var cells = zones.map(function(z){
      var zid = z[0], x = z[1], y = z[2], w = z[3], h = z[4];
      var zs = zoneStateOf(items, zoneMap, zid);
      var fill = zs.state === "issue" ? "rgba(237,0,18,.22)" : zs.state === "ok" ? "rgba(32,178,107,.16)" : "transparent";
      var stroke = zs.state === "issue" ? "#ed0012" : zs.state === "ok" ? "#20b26b" : "#c7cbd2";
      var dash = zs.state === "nodata" ? ' stroke-dasharray="3,3"' : "";
      return '<rect data-zone="' + idPrefix + ":" + zid + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="3" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4"' + dash + ' style="cursor:' + (zs.items.length ? "pointer" : "default") + '"><title>' + esc(T(ZONE_LABEL[zid] || zid)) + (zs.items.length ? (": " + esc(zs.items.map(function(m){ return termOr(report, "part", m.part_key, m.part_label); }).join(", "))) : "") + '</title></rect>';
    }).join("");
    var isExt = zones === EXT_ZONES;
    var vb = isExt ? "0 0 200 380" : "0 0 100 76";
    var bg = isExt ? CAR_BODY_BG_EXT : CAR_BODY_BG_FRAME;
    return '<svg viewBox="' + vb + '" class="catBodyDiagramV1" data-diag="' + idPrefix + '">' + bg + cells + '</svg>';
  }

  function computeBlockStats(items){
    var byBlock = {};
    items.forEach(function(it){
      var b = it.block_id || it.block_key || "other";
      var s = byBlock[b] = byBlock[b] || {total:0, issue:0, ok:0, key:it.block_key};
      s.total++;
      if(it.result_key === "issue") s.issue++;
      else if(it.result_key === "ok") s.ok++;
    });
    return byBlock;
  }

  var inspTabState = {reportIdx:0, filter:"all"};
  function renderInspectionTab(){
    var panel = document.getElementById("catPanelInspectionV1");
    var reports = matchingReports(state.car.inspections);
    if(!reports.length){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Нет отчётов осмотра для этого объявления.")) + '</div>'; return; }
    var r = reports[Math.min(inspTabState.reportIdx, reports.length - 1)];
    var c = (r.conclusions && !Array.isArray(r.conclusions)) ? r.conclusions : {};
    var items = Array.isArray(r.checked_items) ? r.checked_items : [];
    var byBlock = computeBlockStats(items);
    var totalIssues = items.filter(function(i){ return i.result_key === "issue"; }).length;
    var totalOk = items.filter(function(i){ return i.result_key === "ok"; }).length;
    var score = Number(c.evaluation_score);

    var html = "";
    if(reports.length > 1) html += '<div class="catReportSwitchV1">' + reports.map(function(_, i){ return '<button type="button" data-insp-report="' + i + '" class="' + (i === inspTabState.reportIdx ? "isOnV1" : "") + '">' + esc(T("Отчёт")) + " " + (i + 1) + '</button>'; }).join("") + '</div>';

    // 1. Summary
    html += '<div class="catDetailsCardV1">';
    html += '<h4>' + esc(T("Заключение")) + '</h4>';
    var concRows = [];
    if(c.overall_result_key) concRows.push([T("Итог"), {html:resultBadgeHtml(r, c.overall_result_key)}]);
    if(c.accident_status_key) concRows.push([T("ДТП"), {html:resultBadgeHtml(r, c.accident_status_key)}]);
    if(c.water_damage_status_key) concRows.push([T("Затопление"), {html:resultBadgeHtml(r, c.water_damage_status_key)}]);
    if(c.fire_damage_status_key) concRows.push([T("Пожар"), {html:resultBadgeHtml(r, c.fire_damage_status_key)}]);
    if(c.chemical_damage_status_key) concRows.push([T("Хим. повреждение"), {html:resultBadgeHtml(r, c.chemical_damage_status_key)}]);
    if(c.biohazard_status_key) concRows.push([T("Биоопасность"), {html:resultBadgeHtml(r, c.biohazard_status_key)}]);
    if(r.inspected_at) concRows.push([T("Дата осмотра"), fmtDate(r.inspected_at)]);
    if(r.valid_until) concRows.push([T("Действителен до"), fmtDate(r.valid_until)]);
    html += rowsHtml(concRows, true);
    // Сводка «Checks» + «Issues by section» — как в демо-каталоге провайдера (api.auctionsapi.com/catalog),
    // тот же состав чисел, что раньше шёл пилюлями (items.length/totalIssues/totalOk), просто как 2-сегментный
    // прогресс-бар + список секций с замечаниями собственной полосой (bars). Данные те же, не новые.
    var okPct = items.length ? Math.round((totalOk / items.length) * 100) : 0;
    var issuePct = items.length ? Math.max(totalIssues ? 2 : 0, 100 - okPct) : 0;
    var blockOrder = Object.keys(byBlock).sort(function(a, b){ return (byBlock[a].key || a).localeCompare(byBlock[b].key || b); });
    var issueBlocks = blockOrder.filter(function(bid){ return byBlock[bid].issue > 0; });
    html += '<div class="catInspSummaryGridV1">'
      + '<div class="catInspSumBoxV1"><small>' + esc(T("Проверено")) + '</small>'
        + '<b class="' + (totalIssues ? "isWarnTxtV1" : "isOkTxtV1") + '" data-no-i18n="true">' + (totalIssues ? (esc(T("Замечаний")) + ": " + totalIssues) : esc(T("Без замечаний"))) + '</b>'
        + '<span class="catInspSumSubV1" data-no-i18n="true">' + esc(T("из")) + " " + items.length + " " + esc(T("проверено")) + " · " + totalOk + " OK" + (isFinite(score) && score > 10 && score <= 100 ? " · " + score + "/100" : "") + '</span>'
        + '<div class="catInspBarV1"><span class="okSegV1" style="width:' + okPct + '%"></span><span class="issSegV1" style="width:' + issuePct + '%"></span></div>'
      + '</div>'
      + '<div class="catInspSumBoxV1"><small>' + esc(T("Замечания по секциям")) + '</small>'
        + (issueBlocks.length ? '<div class="catInspSecBarsV1">' + issueBlocks.map(function(bid){
            var s = byBlock[bid];
            var label = termOr(r, "section", s.key, s.key ? humanizeKey(s.key) : T("Другое"));
            var pct = s.total ? Math.round((s.issue / s.total) * 100) : 0;
            return '<div class="catInspSecBarRowV1"><span class="catInspSecLblV1" data-no-i18n="true">' + esc(label) + '</span><div class="catInspSecTrackV1"><span style="width:' + pct + '%"></span></div><b data-no-i18n="true">' + s.issue + '</b></div>';
          }).join("") + '</div>' : '<p class="catInspNoIssueV1">' + esc(T("Замечаний не найдено")) + '</p>')
      + '</div>'
    + '</div>';
    if(Array.isArray(r.source_claims) && r.source_claims.length){
      html += '<div class="catClaimsRowV1">' + r.source_claims.map(function(sc){
        return '<span class="catClaimChipV1">' + esc(termOr(r, "claim_type", sc.type_key, sc.source_label)) + ": " + resultBadgeHtml(r, sc.result_key) + '</span>';
      }).join("") + '</div>';
    }
    if(c.notes) html += '<p class="catNotesV1" data-no-i18n="true">' + esc(c.notes) + '</p>';
    html += '</div>';

    // 2. Диаграммы (только если в отчёте реально есть зоны кузова/рамы)
    var extItems = items.filter(function(i){ return ZONE_MAP[i.part_key]; });
    var frameItems = items.filter(function(i){ return FRAME_ZONE_MAP[i.part_key]; });
    if(extItems.length || frameItems.length){
      html += '<div class="catDetailsCardV1">'
        + '<h4>' + esc(T("Схема кузова")) + '</h4>'
        + '<div class="catDiagramsRowV1">'
        + (extItems.length ? '<div class="catDiagramColV1"><small>' + esc(T("Кузов (листовой металл)")) + '</small>' + bodyDiagramSvg(r, extItems, EXT_ZONES, ZONE_MAP, "ext") + '</div>' : "")
        + (frameItems.length ? '<div class="catDiagramColV1"><small>' + esc(T("Рама/днище")) + '</small>' + bodyDiagramSvg(r, frameItems, FRAME_ZONES, FRAME_ZONE_MAP, "frame") + '</div>' : "")
        + '</div>'
        + '<div class="catDiagLegendV1"><span><i class="catLegSwV1" style="background:rgba(237,0,18,.22);border-color:#ed0012"></i>' + esc(T("Есть замечание")) + '</span><span><i class="catLegSwV1" style="background:rgba(32,178,107,.16);border-color:#20b26b"></i>' + esc(T("В норме")) + '</span><span><i class="catLegSwV1" style="border-color:#c7cbd2;border-style:dashed"></i>' + esc(T("Нет данных")) + '</span></div>'
        + '<p class="catDiagCaptionV1" id="catDiagCaptionV1">' + esc(T("Нажмите на зону, чтобы увидеть подробности")) + '</p>'
      + '</div>';
    }

    // 3. Секции
    if(blockOrder.length){
      html += '<div class="catSectionsGridV1">' + blockOrder.map(function(bid){
        var s = byBlock[bid];
        var label = termOr(r, "section", s.key, s.key ? humanizeKey(s.key) : T("Другое"));
        return '<div class="catSectionCardV1"><b data-no-i18n="true">' + esc(label) + '</b>'
          + '<span class="catResBadgeV1 ' + (s.issue ? "isWarnV1" : "isOkV1") + '">' + (s.issue ? (T("Замечаний") + ": " + s.issue) : esc(T("Без замечаний"))) + '</span>'
          + '<small>' + esc(T("Проверено")) + ": " + s.total + '</small></div>';
      }).join("") + '</div>';
    }

    // 4. Issues found (chips)
    var issueItems = items.filter(function(i){ return i.result_key === "issue"; });
    if(issueItems.length){
      html += '<div class="catIssueChipsRowV1">' + issueItems.slice(0, 8).map(function(it){
        return '<span class="catIssueChipV1" data-no-i18n="true">' + esc(termOr(r, "part", it.part_key, it.part_label || it.source_label)) + '</span>';
      }).join("") + (issueItems.length > 8 ? '<span class="catIssueChipV1 catIssueMoreV1">+' + (issueItems.length - 8) + '</span>' : "") + '</div>';
    }

    // 5. Checked items (фильтр + список по секциям)
    html += '<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Проверенные пункты")) + ' (' + items.length + ')</h4>'
      + '<div class="catItemFilterV1"><button type="button" data-insp-filter="all" class="' + (inspTabState.filter === "all" ? "isOnV1" : "") + '">' + esc(T("Все")) + '</button><button type="button" data-insp-filter="issue" class="' + (inspTabState.filter === "issue" ? "isOnV1" : "") + '">' + esc(T("Только замечания")) + " (" + totalIssues + ')</button></div></div>'
      + '<div id="catCheckedItemsV1">' + checkedItemsHtml(r, items, inspTabState.filter) + '</div></div>';

    // 6. Диагностика
    if(Array.isArray(r.diagnostic_errors) && r.diagnostic_errors.length){
      html += '<div class="catDetailsCardV1"><h4>' + esc(T("Диагностика")) + '</h4>' + r.diagnostic_errors.map(function(d){
        return rowsHtml([[d.system_label || d.system_key || T("Система"), [d.code, d.description].filter(Boolean).join(" — ") || T("нет данных")]], true);
      }).join("") + '</div>';
    }

    // 7. Источник
    html += '<div class="catDetailsCardV1"><h4>' + esc(T("Источник отчёта")) + '</h4>' + rowsHtml([
      [T("ID отчёта"), copyRow(r.report_id || "")],
      r.source && r.source.source_key ? [T("Провайдер"), r.source.source_key] : null,
      r.source && r.source.imported_at ? [T("Импортирован"), fmtDate(r.source.imported_at)] : null
    ].filter(Boolean), true) + '</div>';

    panel.innerHTML = html;
  }
  function checkedItemsHtml(report, items, filter){
    var shown = filter === "issue" ? items.filter(function(i){ return i.result_key === "issue"; }) : items;
    if(!shown.length) return '<p style="color:var(--muted);font-size:13px;padding:8px 0">' + esc(T("Нет пунктов по этому фильтру")) + '</p>';
    var byBlock = {};
    shown.forEach(function(it){ (byBlock[it.block_key || "other"] = byBlock[it.block_key || "other"] || []).push(it); });
    return Object.keys(byBlock).sort().map(function(bk){
      var label = termOr(report, "section", bk, humanizeKey(bk));
      return '<div class="catCheckedGroupV1"><b data-no-i18n="true">' + esc(label) + '</b>' + byBlock[bk].map(function(it){
        var sentence = it.result_key === "issue" ? T("Есть замечание") : it.result_key === "ok" ? T("В норме") : termOr(report, "result", it.result_key, "");
        var extra = [];
        if(it.description) extra.push('<span data-no-i18n="true">' + esc(it.description) + '</span>');
        if(it.severity_key) extra.push('<span>' + esc(termOr(report, "severity", it.severity_key, it.severity_key)) + '</span>');
        if(it.damage_rank_key) extra.push('<span>' + esc(termOr(report, "damage_rank", it.damage_rank_key, it.damage_rank_key)) + '</span>');
        return '<div class="catCheckedRowV1" data-zone-item="' + esc(ZONE_MAP[it.part_key] ? "ext:" + ZONE_MAP[it.part_key] : (FRAME_ZONE_MAP[it.part_key] ? "frame:" + FRAME_ZONE_MAP[it.part_key] : "")) + '">'
          + resultBadgeHtml(report, it.result_key)
          + '<span class="catCheckedMainV1"><b data-no-i18n="true">' + esc(termOr(report, "part", it.part_key, it.part_label || it.source_label)) + '</b><small data-no-i18n="true">' + esc(sentence) + (extra.length ? " · " + extra.join(" · ") : "") + '</small></span>'
        + '</div>';
      }).join("") + '</div>';
    }).join("");
  }
  document.addEventListener("click", function(e){
    var rb = e.target.closest("[data-insp-report]");
    if(rb){ inspTabState.reportIdx = parseInt(rb.getAttribute("data-insp-report"), 10) || 0; renderInspectionTab(); return; }
    var fb = e.target.closest("[data-insp-filter]");
    if(fb){ inspTabState.filter = fb.getAttribute("data-insp-filter"); renderInspectionTab(); return; }
    var zone = e.target.closest("[data-zone]");
    if(zone){
      var zid = zone.getAttribute("data-zone");
      var cap = document.getElementById("catDiagCaptionV1");
      var row = document.querySelector('[data-zone-item="' + zid + '"]');
      if(row){
        row.scrollIntoView({behavior:"smooth", block:"center"});
        row.classList.add("isFlashV1");
        setTimeout(function(){ row.classList.remove("isFlashV1"); }, 1500);
        if(cap){
          var main = row.querySelector(".catCheckedMainV1");
          cap.textContent = (main.querySelector("b").textContent + " — " + main.querySelector("small").textContent);
        }
      }else if(cap){ cap.textContent = T("Нет данных по этой зоне в отчёте"); }
    }
  });

  // ---------- ИСТОРИЯ ----------
  var histTabState = {reportIdx:0, order:"asc"};
  // 05.11.2026 (Федор: «повтори полностью структуру сайта как я тебе дал», 4 скриншота демо-каталога провайдера,
  // вкладка History): реальные поля сверены по OpenAPI-схеме VehicleHistory (summary.vehicle_damage_claim_cost/
  // third_party_damage_claim_cost/registration_change_count — были в схеме, не показывались; event.description —
  // есть в схеме, но пусто у всех 23 событий тестовой машины, поэтому для «предложения» под заголовком события
  // используем синтез из details[] (label: значение, через запятую) — то же самое, что явно делает сам демо-сайт
  // для событий без description). Монохромный ЗАГЛАВНЫЙ тег у события (`INITIAL_REGISTRATION`) — это их
  // буквальный `type_key` в верхнем регистре (подтверждено посимвольным совпадением со скриншота) — не перевод.
  var TONE_RISK = {insurance_claim:1, insurance_coverage_gap:1, total_loss:1};
  var TONE_OK = {maintenance:1, statutory_inspection:1};
  function eventTone(e){ return TONE_RISK[e.type_key] ? "isWarnV1" : TONE_OK[e.type_key] ? "isOkV1" : (e.type_key === "recall" && e.status_key === "recall_open") ? "isWarnV1" : "isNeutralV1"; }
  function computeReadings(events){
    var readings = events.filter(function(e){ return e.mileage_km != null && isFinite(e.mileage_km) && e.occurred_at; })
      .map(function(e){ return {date:e.occurred_at, km:Math.round(e.mileage_km)}; })
      .sort(function(a, b){ return new Date(a.date) - new Date(b.date); });
    return readings.filter(function(rd, i){ return i === 0 || !(rd.date === readings[i - 1].date && rd.km === readings[i - 1].km); });
  }

  function renderHistoryTab(){
    var panel = document.getElementById("catPanelHistoryV1");
    var reports = matchingReports(state.car.vehicle_history_reports);
    if(!reports.length){ panel.innerHTML = '<div class="catSoonV1">' + esc(T("Нет отчётов истории для этого объявления. Отсутствие отчёта не означает чистую историю.")) + '</div>'; return; }
    var r = reports[Math.min(histTabState.reportIdx, reports.length - 1)];
    var s = (r.summary && !Array.isArray(r.summary)) ? r.summary : {};
    var checks = Array.isArray(r.checks) ? r.checks : [];
    var events = Array.isArray(r.events) ? r.events.slice() : [];
    var cov = (r.coverage && !Array.isArray(r.coverage)) ? r.coverage : {};
    var cur = (s.currency || "").toUpperCase();

    var html = "";
    if(reports.length > 1) html += '<div class="catReportSwitchV1">' + reports.map(function(_, i){ return '<button type="button" data-hist-report="' + i + '" class="' + (i === histTabState.reportIdx ? "isOnV1" : "") + '">' + esc(T("Отчёт")) + " " + (i + 1) + '</button>'; }).join("") + '</div>';

    // 1. Сводка — 4 блока (риски / владельцы / страховые случаи / пробег), как у демо провайдера
    var found = checks.filter(function(c){ return c.result_key === "present"; }).length;
    var notFound = checks.filter(function(c){ return c.result_key === "not_present"; }).length;
    var unknownN = Math.max(0, checks.length - found - notFound);
    var pNot = checks.length ? Math.round((notFound / checks.length) * 100) : 0;
    var pFound = checks.length ? Math.max(found ? 2 : 0, Math.round((found / checks.length) * 100)) : 0;
    var pUnk = Math.max(0, 100 - pNot - pFound);
    var readings = computeReadings(events);
    var rollback = readings.some(function(rd, i){ return i > 0 && rd.km < readings[i - 1].km; });
    var lastReading = readings.length ? readings[readings.length - 1] : null;

    html += '<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Сводка")) + '</h4><span class="catEvCountV1" data-no-i18n="true">' + esc(T("Событий")) + ": " + events.length + '</span></div>';
    html += '<div class="catHistSumGridV1">'
      + '<div class="catInspSumBoxV1"><small>' + esc(T("Риски — проверки")) + '</small>'
        + '<b class="' + (found ? "isWarnTxtV1" : "isOkTxtV1") + '" data-no-i18n="true">' + found + " " + esc(T("найдено")) + '</b>'
        + '<span class="catInspSumSubV1" data-no-i18n="true">' + esc(T("из")) + " " + checks.length + " " + esc(T("проверок")) + '</span>'
        + '<div class="catInspBarV1 catRiskBarV1"><span class="okSegV1" style="width:' + pNot + '%"></span><span class="issSegV1" style="width:' + pFound + '%"></span><span class="unkSegV1" style="width:' + pUnk + '%"></span></div>'
      + '</div>'
      + '<div class="catInspSumBoxV1"><small>' + esc(T("Смены владельца")) + '</small>'
        + '<b data-no-i18n="true">' + (s.owner_change_count != null ? s.owner_change_count : "—") + '</b>'
        + (s.registration_change_count != null ? '<span class="catInspSumSubV1" data-no-i18n="true">' + esc(T("Смен номеров")) + ": " + s.registration_change_count + '</span>' : "")
      + '</div>'
      + '<div class="catInspSumBoxV1"><small>' + esc(T("Страховые случаи")) + '</small>'
        + '<b class="' + (s.insurance_claim_count > 0 ? "isWarnTxtV1" : "isOkTxtV1") + '" data-no-i18n="true">' + (s.insurance_claim_count != null ? s.insurance_claim_count : "—") + '</b>'
        + (s.vehicle_damage_claim_cost != null ? '<span class="catInspSumSubV1" data-no-i18n="true">' + esc(T("Ущерб по своей страховке")) + ": " + fmtNum(s.vehicle_damage_claim_cost) + " " + cur + '</span>' : "")
        + (s.third_party_damage_claim_cost != null ? '<span class="catInspSumSubV1" data-no-i18n="true">' + esc(T("Ущерб по чужой страховке")) + ": " + fmtNum(s.third_party_damage_claim_cost) + " " + cur + '</span>' : "")
      + '</div>'
      + (lastReading ? '<div class="catInspSumBoxV1"><small>' + esc(T("Последний зафиксированный пробег")) + '</small>'
        + '<b data-no-i18n="true">' + fmtNum(lastReading.km) + " " + esc(T("км")) + '</b>'
        + mileageChartSvg(readings)
        + '<span class="catInspSumSubV1" data-no-i18n="true">' + esc(T("Показаний")) + ": " + readings.length + " · " + (rollback ? esc(T("возможна скрутка")) : esc(T("скрутка не обнаружена"))) + '</span>'
      + '</div>' : "")
    + '</div>';
    var metaChips = [];
    if(s.first_registered_at) metaChips.push({t:T("Первая регистрация") + ": " + fmtDate(s.first_registered_at)});
    if(cov.period_start || cov.period_end) metaChips.push({t:T("Период данных") + ": " + fmtDate(cov.period_start) + " – " + (cov.period_end ? fmtDate(cov.period_end) : T("сейчас"))});
    if(s.total_loss_count != null) metaChips.push({t:T("Полная гибель") + ": " + s.total_loss_count, warn:s.total_loss_count > 0});
    if(s.flood_total_loss_count != null) metaChips.push({t:T("Затопление (полное)") + ": " + s.flood_total_loss_count, warn:s.flood_total_loss_count > 0});
    if(s.theft_count != null) metaChips.push({t:T("Угон") + ": " + s.theft_count, warn:s.theft_count > 0});
    var openRecalls = events.filter(function(e){ return e.type_key === "recall" && e.status_key === "recall_open"; }).length;
    if(events.some(function(e){ return e.type_key === "recall"; })) metaChips.push({t:T("Открытые отзывные кампании") + ": " + openRecalls, warn:openRecalls > 0});
    if(metaChips.length) html += '<div class="catMetaChipsV1">' + metaChips.map(function(m){ return '<span class="' + (m.warn ? "isWarnChipV1" : "isOkChipV1") + '" data-no-i18n="true">' + esc(m.t) + '</span>'; }).join("") + '</div>';
    html += '</div>';

    // 2. Проверки по базам — ВСЕ, сеткой в 2 колонки, с легендой Found/Not found/Unknown
    if(checks.length){
      html += '<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Проверки по базам")) + '</h4>'
        + '<div class="catLegendRowV1"><span><i class="catLegDotV1 isWarnV1"></i>' + esc(T("Найдено")) + '</span><span><i class="catLegDotV1 isOkV1"></i>' + esc(T("Не найдено")) + '</span><span><i class="catLegDotV1 isNeutralV1"></i>' + esc(T("Неизвестно")) + '</span></div></div>'
        + '<div class="catHistCheckGridV1">' + checks.slice().sort(function(a, b){
          var rank = {present:0, unknown:1, not_applicable:1, not_present:2};
          return (rank[a.result_key] != null ? rank[a.result_key] : 1) - (rank[b.result_key] != null ? rank[b.result_key] : 1);
        }).map(function(c){
          var isFoundC = c.result_key === "present";
          var tone = isFoundC ? "isWarnV1" : c.result_key === "not_present" ? "isOkV1" : "isNeutralV1";
          var statusTxt = isFoundC ? T("Найдено") : c.result_key === "not_present" ? T("Не найдено") : T("Неизвестно");
          return '<div class="catHistCheckRowV1' + (isFoundC ? " isFoundV1" : "") + '"><span class="catLegDotV1 ' + tone + '"></span><span class="catHistCheckLblV1" data-no-i18n="true">' + esc(termOr(r, "check_type", c.type_key, humanizeKey(c.type_key))) + '</span><span class="catHistCheckStV1 ' + tone + '">' + esc(statusTxt) + '</span></div>';
        }).join("") + '</div></div>';
    }

    // 3. Пробег — полный график (оси) + плитки всех показаний
    if(readings.length >= 2){
      html += '<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Пробег")) + '</h4><span class="catResBadgeV1 ' + (rollback ? "isWarnV1" : "isOkV1") + '">' + (rollback ? esc(T("Признак скрутки пробега")) : esc(T("Скрутка не обнаружена"))) + '</span></div>'
        + mileageChartFull(readings)
        + '<div class="catMileageTilesRowV1">' + readings.map(function(rd, i){
            return '<div class="catMileageTileV1' + (i === readings.length - 1 ? " isActiveV1" : "") + '"><small data-no-i18n="true">' + esc(fmtDate(rd.date)) + '</small><b data-no-i18n="true">' + fmtNum(rd.km) + " " + esc(T("км")) + '</b></div>';
          }).join("") + '</div>'
      + '</div>';
    }

    // 4. Хронология событий — заголовок/синтезированное описание из details/заглавный тег type_key/раскрываемые Source details
    var dated = events.filter(function(e){ return e.occurred_at; }).sort(function(a, b){ return new Date(a.occurred_at) - new Date(b.occurred_at); });
    var undated = events.filter(function(e){ return !e.occurred_at; });
    if(histTabState.order === "desc") dated = dated.slice().reverse();
    html += '<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Хронология событий")) + '</h4>'
      + '<button type="button" id="catHistOrderBtnV1" class="catOrderBtnV1">' + esc(histTabState.order === "asc" ? T("Сначала новые") : T("Сначала старые")) + '</button></div>'
      + '<div class="catTimelineV1">' + dated.concat(undated).map(function(e){ return eventCardHtml(r, e); }).join("") + '</div></div>';

    // 5. Суммы страховых случаев — составной бар (выплата/запчасти/работа/покраска)
    var claims = events.filter(function(e){ return e.type_key === "insurance_claim" && e.amount_total != null; });
    if(claims.length){
      html += '<div class="catDetailsCardV1"><h4>' + esc(T("Суммы страховых случаев")) + '</h4><p class="catSecSubV1">' + esc(T("Разбивка по типам, если источник их указывает")) + '</p>' + claims.slice(0, 6).map(function(e){
        var comps = [
          e.amount_insurance_benefit != null ? [T("Выплата"), e.amount_insurance_benefit, "#20b26b"] : null,
          e.amount_parts != null ? [T("Запчасти"), e.amount_parts, "#2d86c9"] : null,
          e.amount_labor != null ? [T("Работа"), e.amount_labor, "#d7891d"] : null,
          e.amount_painting != null ? [T("Покраска"), e.amount_painting, "#7c5cd8"] : null
        ].filter(Boolean);
        var totalParts = comps.reduce(function(s2, c){ return s2 + c[1]; }, 0) || e.amount_total || 1;
        var bar = comps.map(function(c){ var pct = totalParts ? (c[1] / totalParts * 100) : 0; return pct > 0 ? '<span style="width:' + pct.toFixed(2) + '%;background:' + c[2] + '"></span>' : ""; }).join("");
        var title = e.subtype_key ? termOr(r, "event_subtype", e.subtype_key, e.source_label) : (e.source_label || T("Страховой случай"));
        return '<div class="catClaimCardV1"><div class="catClaimHeadV1"><div><b data-no-i18n="true">' + esc(title) + '</b><small data-no-i18n="true">' + esc(fmtDatePrecise(e.occurred_at, e.date_precision_key)) + '</small></div>'
          + '<div class="catClaimHeadRightV1">' + (e.subtype_key ? '<span class="catClaimTagV1" data-no-i18n="true">' + esc(String(title).toUpperCase()) + '</span>' : "") + '<b data-no-i18n="true">' + fmtNum(e.amount_total) + " " + esc((e.currency || "").toUpperCase()) + '</b></div></div>'
          + (bar ? '<div class="catClaimBarV1">' + bar + '</div><div class="catClaimLegendV1">' + comps.map(function(c){ return '<span><i class="catLegDotV1" style="background:' + c[2] + '"></i>' + esc(c[0]) + " " + fmtNum(c[1]) + " " + esc((e.currency || "").toUpperCase()) + '</span>'; }).join("") + '</div>' : "")
        + '</div>';
      }).join("") + '</div>';
    }

    // 6. Смены владельца — таблица (дата/изменение/транзакция/пробег)
    var owners = events.filter(function(e){ return e.type_key === "owner_change"; });
    if(owners.length){
      html += '<div class="catDetailsCardV1"><h4>' + esc(T("Смены владельца")) + '</h4><div class="catOwnerTableV2">'
        + '<div class="catOwnerHeadRowV1"><span>' + esc(T("Дата")) + '</span><span>' + esc(T("Изменение")) + '</span><span>' + esc(T("Транзакция")) + '</span><span>' + esc(T("Пробег")) + '</span></div>'
        + owners.map(function(e){
          var txnDetail = (e.details || []).find(function(d){ return d.key === "transaction_type"; });
          return '<div class="catOwnerRowV2"><span data-no-i18n="true">' + esc(fmtDatePrecise(e.occurred_at, e.date_precision_key)) + '</span>'
            + '<span data-no-i18n="true">' + esc(termOr(r, "event_type", "owner_change", T("Смена владельца"))) + '</span>'
            + '<span data-no-i18n="true">' + esc(txnDetail ? txnDetail.value_text : "—") + '</span>'
            + '<span data-no-i18n="true">' + (e.mileage_km != null ? fmtNum(Math.round(e.mileage_km)) + " " + esc(T("км")) : "—") + '</span></div>';
        }).join("")
      + '</div></div>';
    }

    // 7. Покрытие отчёта + Event mix — рядом, как у демо провайдера
    var mixMap = {};
    events.forEach(function(e){ var k = e.type_key || "other"; mixMap[k] = (mixMap[k] || 0) + 1; });
    var mixRows = Object.keys(mixMap).sort(function(a, b){ return mixMap[b] - mixMap[a]; });
    var mixMax = mixRows.length ? mixMap[mixRows[0]] : 1;
    var covHtml = (cov.section_keys && cov.section_keys.length) ? ('<div class="catDetailsCardV1"><div class="catCardHeadRowV1"><h4 style="margin:0">' + esc(T("Покрытие отчёта")) + '</h4>' + (cov.completeness_key ? '<span class="catResBadgeV1 isOkV1" data-no-i18n="true">' + esc(termOr(r, "completeness", cov.completeness_key, cov.completeness_key).toUpperCase()) + '</span>' : "") + '</div>'
      + rowsHtml([cov.period_start ? [T("Начало периода"), fmtDate(cov.period_start)] : null, cov.period_end ? [T("Конец периода"), fmtDate(cov.period_end)] : null].filter(Boolean), true)
      + '<div class="catCoverageChipsV1">' + cov.section_keys.map(function(k){ return '<span data-no-i18n="true">' + esc(termOr(r, "coverage_section", k, humanizeKey(k))) + '</span>'; }).join("") + '</div></div>') : "";
    var mixHtml = mixRows.length ? ('<div class="catDetailsCardV1"><h4>' + esc(T("Состав событий")) + '</h4><div class="catEventMixV1">' + mixRows.map(function(k){
        var tone = TONE_RISK[k] ? "#ed0012" : TONE_OK[k] ? "#20b26b" : "var(--muted)";
        var pct = Math.round((mixMap[k] / mixMax) * 100);
        return '<div class="catEventMixRowV1"><div class="catEventMixHeadV1"><span data-no-i18n="true">' + esc(termOr(r, "event_type", k, humanizeKey(k))) + '</span><b data-no-i18n="true">' + mixMap[k] + '</b></div><div class="catEventMixBarTrackV1"><span style="width:' + pct + '%;background:' + tone + '"></span></div></div>';
      }).join("") + '</div></div>') : "";
    if(covHtml || mixHtml) html += '<div class="catCoverageMixRowV1">' + covHtml + mixHtml + '</div>';

    // 8. Подробнее об отчёте
    html += '<div class="catDetailsCardV1"><h4>' + esc(T("Подробнее об отчёте")) + '</h4>' + rowsHtml([
      [T("ID отчёта"), copyRow(r.report_id || "")],
      r.source && r.source.source_key ? [T("Провайдер"), r.source.source_key] : null,
      r.vehicle_ref && r.vehicle_ref.vin ? [T("VIN"), copyRow(String(r.vehicle_ref.vin).toUpperCase())] : null
    ].filter(Boolean), true)
      + (Array.isArray(r.limitations) && r.limitations.length ? '<p class="catNotesV1">' + esc(T("Оговорки источника")) + ": " + r.limitations.map(function(l){ return esc(l.description || l.source_label || ""); }).join("; ") + '</p>' : "")
      + '</div>';

    panel.innerHTML = html;
  }
  function eventCardHtml(r, e){
    var tone = eventTone(e);
    var title = termOr(r, "event_type", e.type_key, humanizeKey(e.type_key));
    var subtitle = e.subtype_key ? termOr(r, "event_subtype", e.subtype_key, humanizeKey(e.subtype_key)) : "";
    var dateTxt = e.occurred_at ? fmtDatePrecise(e.occurred_at, e.date_precision_key) + (e.ended_at ? " – " + fmtDatePrecise(e.ended_at, e.date_precision_key) : "") : T("Дата неизвестна");
    var details = e.details || [];
    // Предложение-синтез из details (как у источника для событий без своего description) — те же данные, что в сетке ниже.
    var sentence = e.description || details.map(function(d){
      var label = d.source_label || termOr(r, "detail", d.key, humanizeKey(d.key));
      var val = d.value_text || (d.value_number != null ? fmtNum(d.value_number) + (d.unit_key ? " " + String(d.unit_key).toUpperCase() : "") : (d.value_date ? fmtDate(d.value_date) : ""));
      return val ? (label + ": " + val) : null;
    }).filter(Boolean).join(", ");
    var fields = details.map(function(d){
      var label = termOr(r, "detail", d.key, d.source_label || humanizeKey(d.key));
      var val = d.value_text || (d.value_number != null ? fmtNum(d.value_number) + (d.unit_key ? " " + String(d.unit_key).toUpperCase() : "") : (d.value_date ? fmtDate(d.value_date) : ""));
      return val ? '<div class="catEvFieldV1"><small data-no-i18n="true">' + esc(label) + '</small><b data-no-i18n="true">' + esc(val) + '</b></div>' : "";
    }).join("");
    var srcRows = [
      e.id ? [T("ID события"), {html:'<span data-no-i18n="true">' + esc(e.id) + '</span>'}] : null,
      e.evidence_type_key ? [T("Тип источника"), termOr(r, "evidence_type", e.evidence_type_key, e.evidence_type_key)] : null,
      e.verification_key ? [T("Подтверждение"), termOr(r, "verification", e.verification_key, e.verification_key)] : null,
      e.organization_name ? [T("Организация"), {html:'<span data-no-i18n="true">' + esc(e.organization_name) + '</span>'}] : null
    ].filter(Boolean);
    return '<div class="catTimelineItemV1"><span class="catTlDotV1 ' + tone + '"></span><div class="catTlBodyV1">'
      + '<div class="catTlHeadV1"><b data-no-i18n="true">' + esc(title) + '</b><span class="catEvTypeTagV1" data-no-i18n="true">' + esc(String(e.type_key || "").toUpperCase()) + '</span><small>' + esc(dateTxt) + '</small></div>'
      + (sentence ? '<p class="catEvDescV1" data-no-i18n="true">' + esc(sentence) + '</p>' : "")
      + (subtitle ? '<span class="catResBadgeV1 isNeutralV1" data-no-i18n="true">' + esc(subtitle) + '</span>' : "")
      + (fields ? '<div class="catEvFieldGridV1">' + fields + '</div>' : "")
      + (srcRows.length ? '<details class="catEvSourceDetailsV1"><summary>' + esc(T("Источник события")) + '</summary>' + rowsHtml(srcRows, true) + '</details>' : "")
    + '</div></div>';
  }
  function mileageChartSvg(readings){
    var w = 600, h = 56, pad = 6;
    var kms = readings.map(function(r){ return r.km; });
    var min = Math.min.apply(null, kms), max = Math.max.apply(null, kms);
    if(max === min) max = min + 1;
    var n = readings.length;
    var pts = readings.map(function(r, i){
      var x = pad + (n > 1 ? (i / (n - 1)) : 0) * (w - 2 * pad);
      var y = h - pad - ((r.km - min) / (max - min)) * (h - 2 * pad);
      return [x, y];
    });
    var path = pts.map(function(p, i){ return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var area = path + " L" + pts[pts.length - 1][0].toFixed(1) + "," + (h - pad) + " L" + pts[0][0].toFixed(1) + "," + (h - pad) + " Z";
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" class="catMileageChartV1"><path d="' + area + '" fill="rgba(32,178,107,.1)" stroke="none"/><path d="' + path + '" fill="none" stroke="#20b26b" stroke-width="2"/></svg>';
  }
  function niceStep(raw){
    if(!raw || !isFinite(raw) || raw <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }
  function mileageChartFull(readings){
    var w = 640, h = 190, padL = 58, padR = 10, padT = 10, padB = 10;
    var kms = readings.map(function(r){ return r.km; });
    var maxV = Math.max.apply(null, kms);
    var step = niceStep(maxV / 4);
    var top = Math.max(step, Math.ceil(maxV / step) * step);
    var n = readings.length, plotW = w - padL - padR, plotH = h - padT - padB;
    var pts = readings.map(function(r, i){
      var x = padL + (n > 1 ? (i / (n - 1)) : 0) * plotW;
      var y = padT + plotH - (r.km / top) * plotH;
      return [x, y];
    });
    var path = pts.map(function(p, i){ return (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var area = path + " L" + pts[pts.length - 1][0].toFixed(1) + "," + (padT + plotH) + " L" + pts[0][0].toFixed(1) + "," + (padT + plotH) + " Z";
    var grid = "";
    for(var i = 0; i <= 4; i++){
      var val = top - (top / 4) * i;
      var y = padT + plotH * (i / 4);
      grid += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (w - padR) + '" y2="' + y.toFixed(1) + '" stroke="var(--line-2)" stroke-width="1"/>'
        + '<text x="' + (padL - 8) + '" y="' + (y + 3).toFixed(1) + '" font-size="10" text-anchor="end" fill="var(--muted)" data-no-i18n="true">' + fmtNum(Math.round(val)) + '</text>';
    }
    var dots = pts.map(function(p, i){ return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.6" fill="#20b26b"><title data-no-i18n="true">' + esc(fmtDate(readings[i].date)) + ": " + fmtNum(readings[i].km) + ' км</title></circle>'; }).join("");
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="catMileageFullChartV1">' + grid
      + '<path d="' + area + '" fill="rgba(32,178,107,.08)" stroke="none"/><path d="' + path + '" fill="none" stroke="#20b26b" stroke-width="2"/>' + dots + '</svg>';
  }
  document.addEventListener("click", function(e){
    var rb = e.target.closest("[data-hist-report]");
    if(rb){ histTabState.reportIdx = parseInt(rb.getAttribute("data-hist-report"), 10) || 0; renderHistoryTab(); return; }
    var ob = e.target.closest("#catHistOrderBtnV1");
    if(ob){ histTabState.order = histTabState.order === "asc" ? "desc" : "asc"; renderHistoryTab(); }
  });

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

  // ============ «Похожие автомобили» / «Другие модели <Марка>» (05.11.2026, эталон autopartner.by/korea) ============
  // Своя подборка через наш же /api/catalog action=search|models — не выдумываем отдельный провайдерский
  // эндпоинт "похожих" (его нет в OpenAPI-спеке api.auctionsapi.com), а честно собираем из уже реальных,
  // доступных нам данных: тот же brand+model±2 года для похожих, полный список моделей марки для "других".
  function carLinkHref(car){
    var l = pickListing(car);
    var p = new URLSearchParams();
    if(l && l.external){ p.set("domain_id", l.external.domain.id); p.set("listing_id", l.external.id); }
    var q = p.toString();
    return "/catalog/" + encodeURIComponent(car.id) + (q ? "?" + q : "");
  }
  function simCardHtml(car){
    var l = pickListing(car);
    var img = l && Array.isArray(l.images) && l.images.length ? firstImageUrl(l.images[0]) : "";
    var price = priceBlock(car, l);
    return '<a class="catSimCardV1" href="' + esc(carLinkHref(car)) + '">'
      + (img ? '<img src="' + esc(img) + '" loading="lazy" referrerpolicy="no-referrer" alt="">' : '<div class="catSimNoPhotoV1"></div>')
      + '<div class="catSimBodyV1"><b data-no-i18n="true">' + esc(titleOf(car, l)) + '</b>'
      + '<span data-no-i18n="true">' + esc(price.amt) + (price.cur ? (" " + esc(price.cur)) : "") + '</span></div>'
    + '</a>';
  }
  function renderSimilarAndModels(){
    var car = state.car;
    var secSim = document.getElementById("catSimilarSecV1");
    var rowSim = document.getElementById("catSimilarRowV1");
    if(secSim && rowSim){
      if(!car.brand || !car.model){ secSim.hidden = true; }
      else{
        var p = new URLSearchParams();
        p.set("action", "search"); p.set("lang", lang());
        p.set("brand_id", car.brand.id);
        p.set("model_id", car.brand.id + ":" + car.model.id);
        if(car.year){ p.set("year_from", String(car.year - 2)); p.set("year_to", String(car.year + 2)); }
        p.set("per_page", "12"); p.set("sort", "newest");
        fetch("/api/catalog?" + p.toString()).then(function(r){ return r.json(); }).then(function(d){
          var items = ((d && d.items) || []).filter(function(c){ return c.id !== car.id; }).slice(0, 10);
          if(!items.length){ secSim.hidden = true; return; }
          secSim.hidden = false;
          rowSim.innerHTML = items.map(simCardHtml).join("");
        }).catch(function(){ secSim.hidden = true; });
      }
    }

    var secModels = document.getElementById("catOtherModelsSecV1");
    var rowModels = document.getElementById("catOtherModelsRowV1");
    var titleModels = document.getElementById("catOtherModelsTitleV1");
    if(secModels && rowModels){
      if(!car.brand){ secModels.hidden = true; }
      else{
        if(titleModels) titleModels.textContent = T("Другие модели") + " " + car.brand.name;
        fetch("/api/catalog?action=models&brand_id=" + encodeURIComponent(car.brand.id) + "&lang=" + encodeURIComponent(lang()))
          .then(function(r){ return r.json(); }).then(function(d){
            var items = ((d && d.items) || []).filter(function(m){ return !car.model || m.id !== car.model.id; }).slice(0, 24);
            if(!items.length){ secModels.hidden = true; return; }
            secModels.hidden = false;
            rowModels.innerHTML = items.map(function(m){
              var mp = new URLSearchParams(); mp.set("brand_id", car.brand.id); mp.set("model_id", car.brand.id + ":" + m.id);
              return '<a class="catModelTileV1" href="/catalog?' + mp.toString() + '" data-no-i18n="true">' + esc(m.name || ("ID " + m.id)) + '</a>';
            }).join("");
          }).catch(function(){ secModels.hidden = true; });
      }
    }
  }

  load();
})();
