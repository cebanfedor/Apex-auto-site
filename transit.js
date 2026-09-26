/* Продажа авто в пути — объявления (страница /in-transit).
   Данные: /api/hot-lots?type=transit (админка → Автомобили, статус «Продаётся в пути»).
   Список карточек + карточка объявления по ?id=N (ссылкой можно делиться). */
(function(){
  "use strict";

  var grid = document.getElementById("transitGridV1");
  var listWrap = document.getElementById("transitListWrapV1");
  var detail = document.getElementById("transitDetailV1");
  var countEl = document.getElementById("transitCountV1");
  var hero = document.getElementById("transitHeroV1");
  if(!grid || !detail) return;

  var PHONE = "+37368832032";
  var ITEMS = [];

  // Всё, что пришло из админки, экранируем (описание/марка — свободный текст).
    /* Ссылка = номер + название + VIN: /in-transit/3-2019-lincoln-mkz-rezerve-ii-3ln6l5mu7kr624453 (тот же алгоритм — server/slug.js) */
  function slugWords(s, max){
    return String(s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(t){ return t[0].toUpperCase() + t.slice(1); }).join("-").slice(0, max).replace(/-+$/g, "");
  }
  function withLang(u){
    var l = window.APEX_LANG; if(l !== "ro" && l !== "en") return u;
    return u + (u.indexOf("?") === -1 ? "?" : "&") + "lang=" + l;
  }
  function transitHref(it){
    var vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(it.vin || "").trim()) ? String(it.vin).trim().toUpperCase() : "";
    return "/in-transit/" + [String(it.id), slugWords(it.title, 60), vin].filter(Boolean).join("-");
  }

  /* Лёгкие копии фото: Supabase Storage — свой ресайз (241 КБ → ~80 КБ), Copart _hrs (250 КБ) → _ful (150 КБ) */
  function photoSized(url, w){
    var u = String(url || "");
    if(/\.supabase\.co\/storage\/v1\/object\/public\//.test(u)) return u.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/") + "?width=" + (w || 640) + "&quality=72";
    if(/cs\.copart\.com\/.*_hrs\.jpg/i.test(u)) return u.replace(/_hrs\.jpg/i, "_ful.jpg");
    return u;
  }
function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function money(n){ return n ? "$" + Math.round(n).toLocaleString("en-US").replace(/,/g, " ") : ""; }
  function lang(){ return window.APEX_LANG || document.documentElement.lang || "ru"; }

  // Этапы трекинга → короткая подпись «где сейчас авто» (ключи — как в /api/w8-tracking).
  var STAGES = {
    "Car won":"Куплен на аукционе", "Left auction":"Выехал с аукциона",
    "Delivered to loading place":"Прибыл на склад / порт", "Loading":"Погружен в контейнер",
    "Arrival":"Порт Клайпеда", "Chisinau":"Кишинёв",
    "D_PURCHASED":"Куплен", "D_TO_ORIGIN":"В пути на склад", "D_AT_ORIGIN":"На складе / в порту отправки",
    "D_SEA":"Морская перевозка", "D_TO_DEST":"В пути по Европе", "D_AT_DEST":"На складе в Европе", "D_ARRIVED":"Прибыл",
    "A_PURCHASED":"Оплачен", "A_DISPATCHED":"В пути на склад", "A_DELIVERED":"Прибыл на склад",
    "A_LOADED":"Погружен в контейнер", "A_UNLOADED":"Выгружен из контейнера",
    "A_EU_DISPATCHED":"В пути к месту выдачи", "A_READY":"Готов к выдаче"
  };

  // Значения из админки бывают «как набрали»: пробег без пробелов, объём без «л», топливо по-английски
  var FUEL_RU = {hybrid:"Гибрид", "plug-in hybrid":"Plug-in гибрид", "plug in hybrid":"Plug-in гибрид", phev:"Plug-in гибрид", gasoline:"Бензин", petrol:"Бензин", gas:"Бензин", diesel:"Дизель", electric:"Электро", ev:"Электро"};
  function fmtKm(v){
    var m = String(v == null ? "" : v).trim().match(/^(\d[\d\s.,]*)\s*(км|km|mi|миль|miles)?$/i);
    if(!m) return String(v || "");
    var n = Number(m[1].replace(/[\s.,]/g, ""));
    if(!isFinite(n) || n <= 0) return String(v || "");
    return n.toLocaleString("en-US").replace(/,/g, "\u00a0") + "\u00a0" + (m[2] || "км").toLowerCase().replace("miles", "миль").replace("mi", "миль").replace("km", "км");
  }
  function fmtEngine(v){ var s = String(v == null ? "" : v).trim(); return /^\d(\.\d)?$/.test(s) ? s + "\u00a0л" : s; }
  function fmtFuel(v){ var s = String(v == null ? "" : v).trim(); var r = FUEL_RU[s.toLowerCase()]; return r ? T(r) : s; }

  function fmtEta(d){
    if(!d) return "";
    var dt = new Date(d + "T00:00:00");
    return isNaN(dt) ? "" : dt.toLocaleDateString(lang() === "ro" ? "ro-RO" : lang() === "en" ? "en-GB" : "ru-RU", {day:"numeric", month:"long", year:"numeric"}).replace(/\s?г\.$/, "");
  }

  function chips(it){
    return [fmtKm(it.mileage), fmtFuel(it.fuel), fmtEngine(it.engine), it.damage].filter(Boolean)
      .map(function(x){ return "<span>" + esc(x) + "</span>"; }).join("");
  }

  function card(it){
    var img = it.photos[0]
      ? '<img src="' + esc(photoSized(it.photos[0], 640)) + '" alt="' + esc(it.title) + '" width="640" height="480" loading="lazy" decoding="async" data-fb="' + esc(it.photos[0]) + '">'
      : '<div class="transitNoImgV1"></div>';
    return '<a class="transitCardV1' + (it.sold ? " isSoldV1" : "") + '" href="' + transitHref(it) + '" data-transit-id="' + esc(it.id) + '">'
      + '<div class="transitCardImgV1">' + img
        + '<span class="transitBadgeV1">' + esc(T(it.sold ? "Продан" : "В пути")) + '</span>'
        + (it.photos.length > 1 ? '<span class="transitPhotoCntV1">' + it.photos.length + ' ' + esc(T("фото")) + '</span>' : "")
      + '</div>'
      + '<div class="transitCardBodyV1">'
        + '<h3 data-no-i18n="true">' + esc(it.title) + '</h3>'
        + '<div class="transitChipsV1">' + chips(it) + '</div>'
        + '<div class="transitCardFootV1">'
          + '<b class="transitPriceV1"' + (it.price ? " data-num" : "") + ' data-no-i18n="true">' + (it.price ? money(it.price) : esc(T("Цена по запросу"))) + '</b>'
          + '<span class="transitMoreV1">' + esc(T("Подробнее")) + ' →</span>'
        + '</div>'
      + '</div>'
    + '</a>';
  }

  function skeletons(){
    var out = "";
    for(var i = 0; i < 3; i++) out += '<div class="transitCardV1 transitSkelV1"><div class="transitCardImgV1"></div><div class="transitCardBodyV1"><i></i><i></i><i></i></div></div>';
    return out;
  }

  function renderList(){
    var active = ITEMS.filter(function(x){ return !x.sold; }).length;
    if(countEl) countEl.textContent = active ? String(active) : "";
    if(!ITEMS.length){
      grid.innerHTML = '<div class="transitEmptyV1">'
        + '<h3>' + esc(T("Сейчас все авто в пути уже проданы")) + '</h3>'
        + '<p>' + esc(T("Новые машины появляются каждую неделю. Напишите нам — расскажем, что едет следующим рейсом, или подберём авто под ваш бюджет.")) + '</p>'
        + '<div class="transitEmptyBtnsV1">'
          + '<a class="transitBtnV1 isRedV1" href="https://t.me/fedukusa" target="_blank" rel="noopener">' + esc(T("Написать в Telegram")) + '</a>'
          + '<a class="transitBtnV1" href="/auctions">' + esc(T("Смотреть аукционы")) + '</a>'
        + '</div></div>';
      return;
    }
    grid.innerHTML = ITEMS.map(card).join("");
  }

  /* ── Карточка объявления ── */
  function waLink(it){
    var text = (lang() === "ro" ? "Bună ziua! Mă interesează auto în tranzit: "
      : lang() === "en" ? "Hello! I'm interested in the car in transit: "
      : "Здравствуйте! Интересует авто в пути: ")
      + it.title + (it.price ? " — " + money(it.price) : "") + " " + location.origin + transitHref(it);
    // Не wa.me: site-content.js переписывает все ссылки wa.me (href и текст) на общий контакт —
    // терялся заготовленный текст про конкретное авто, а кнопка превращалась в «WhatsApp: 068…».
    return "https://api.whatsapp.com/send?phone=" + PHONE.replace(/\D/g, "") + "&text=" + encodeURIComponent(text);
  }

  function specRow(label, value, noI18n){
    return value ? '<div><span>' + esc(T(label)) + '</span><b' + (noI18n ? ' data-no-i18n="true"' : "") + '>' + esc(value) + '</b></div>' : "";
  }

  function renderDetail(it){
    var photos = it.photos;
    var gallery = photos.length
      ? '<div class="transitGalV1">'
          + '<div class="transitGalMainV1"><img id="transitMainImgV1" src="' + esc(photos[0]) + '" alt="' + esc(it.title) + '">'
            + (photos.length > 1 ? '<button type="button" class="transitGalNavV1 isPrevV1" data-gal="-1" aria-label="Предыдущее фото">‹</button><button type="button" class="transitGalNavV1 isNextV1" data-gal="1" aria-label="Следующее фото">›</button><span class="transitGalCntV1" id="transitGalCntV1">1 / ' + photos.length + '</span>' : "")
          + '</div>'
          + (photos.length > 1 ? '<div class="transitThumbsV1">' + photos.map(function(p, i){
              return '<button type="button" class="' + (i === 0 ? "isActiveV1" : "") + '" data-thumb="' + i + '"><img src="' + esc(photoSized(p, 200)) + '" alt="" width="100" height="75" loading="lazy" decoding="async" data-fb="' + esc(p) + '"></button>';
            }).join("") + '</div>' : "")
        + '</div>'
      : '<div class="transitGalV1"><div class="transitGalMainV1 transitNoImgV1"></div></div>';

    detail.innerHTML = '<a class="transitBackV1" href="/in-transit" data-transit-back="1">← ' + esc(T("Все авто в пути")) + '</a>'
      + '<div class="transitDetailGridV1">'
        + gallery
        + '<aside class="transitInfoV1">'
          + '<span class="transitBadgeV1 isInlineV1">' + esc(T(it.sold ? "Продан" : "В пути")) + '</span>'
          + '<h1 data-no-i18n="true">' + esc(it.title) + '</h1>'
          + '<div class="transitPriceBigV1" data-no-i18n="true">' + (it.price ? money(it.price) : esc(T("Цена по запросу"))) + '</div>'
          + '<div class="transitSpecsV1">'
            + specRow("Год", it.year || "", true)
            + specRow("Пробег", fmtKm(it.mileage), true)
            + specRow("Двигатель", fmtEngine(it.engine), true)
            + specRow("Топливо", fmtFuel(it.fuel), true)
            + specRow("Повреждения", it.damage)
            + specRow("VIN", it.vin, true)
            + specRow("Оценка ремонта", it.repairEstimate ? "≈ " + money(it.repairEstimate) : "", true)
            + specRow("Ожидается в Кишинёве", fmtEta(it.eta), true)
          + '</div>'
          + (it.priceIncludes ? '<p class="transitInclV1"><b>' + esc(T("Цена включает")) + ':</b> <span data-no-i18n="true">' + esc(it.priceIncludes) + '</span></p>' : "")
          + '<div id="transitWhereV1" class="transitWhereV1" hidden></div>'
          + (it.sold ? "" :
            '<div class="transitCtaV1">'
              + '<a class="transitBtnV1 isRedV1" href="' + esc(waLink(it)) + '" target="_blank" rel="noopener">WhatsApp</a>'
              + '<a class="transitBtnV1 isDarkV1" href="https://t.me/fedukusa" target="_blank" rel="noopener">Telegram</a>'
              + '<a class="transitBtnV1" href="tel:' + PHONE + '" data-no-i18n="true">068-832-032</a>'
            + '</div>'
            + '<form id="transitLeadV1" class="transitLeadV1" novalidate>'
              + '<b>' + esc(T("Забронировать или узнать подробнее")) + '</b>'
              + '<input name="name" type="text" autocomplete="name" placeholder="' + esc(T("Ваше имя")) + '" required>'
              + '<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="' + esc(T("Телефон или Telegram")) + '" required>'
              + '<input name="hp_website" type="text" tabindex="-1" autocomplete="off" class="transitHpV1" aria-hidden="true">'
              + '<button type="submit" class="transitBtnV1 isRedV1">' + esc(T("Оставить заявку")) + '</button>'
              + '<small id="transitLeadMsgV1"></small>'
            + '</form>')
          + '<button type="button" class="transitShareV1" data-transit-share="1">' + esc(T("Скопировать ссылку на объявление")) + '</button>'
        + '</aside>'
      + '</div>'
      + (it.description ? '<div class="transitDescV1"><h2>' + esc(T("Описание")) + '</h2><p data-no-i18n="true">' + esc(it.description) + '</p></div>' : "");

    detail.hidden = false;
    listWrap.hidden = true;
    if(hero) hero.hidden = true;   // объявление — самостоятельная страница, без общего hero
    document.title = it.title + (it.price ? " — " + money(it.price) : "") + " | Apex Auto";
    window.scrollTo(0, 0);
    bindDetail(it);
    if(it.vin && it.vin.length === 17) loadWhere(it);
  }

  function bindDetail(it){
    var idx = 0, photos = it.photos;
    var main = document.getElementById("transitMainImgV1");
    var cnt = document.getElementById("transitGalCntV1");
    function show(i){
      if(!main || !photos.length) return;
      idx = (i + photos.length) % photos.length;
      main.src = photos[idx];
      if(cnt) cnt.textContent = (idx + 1) + " / " + photos.length;
      detail.querySelectorAll("[data-thumb]").forEach(function(b){
        b.classList.toggle("isActiveV1", Number(b.dataset.thumb) === idx);
      });
    }
    detail.onclick = function(e){
      var t = e.target.closest("[data-gal],[data-thumb],[data-transit-share],[data-transit-back]");
      if(!t) return;
      if(t.dataset.gal){ show(idx + Number(t.dataset.gal)); }
      else if(t.dataset.thumb != null && t.hasAttribute("data-thumb")){ show(Number(t.dataset.thumb)); }
      else if(t.dataset.transitShare){
        var url = location.origin + withLang(transitHref(it));
        (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){
          t.textContent = T("Ссылка скопирована");
        }).catch(function(){ window.prompt("", url); });
      }
      else if(t.dataset.transitBack){ e.preventDefault(); history.pushState({}, "", withLang("/in-transit")); route(); }
    };
    // Свайп по главному фото на телефоне
    var sx = null;
    if(main){
      main.addEventListener("touchstart", function(e){ sx = e.touches[0].clientX; }, {passive:true});
      main.addEventListener("touchend", function(e){
        if(sx == null) return;
        var dx = e.changedTouches[0].clientX - sx; sx = null;
        if(Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1));
      }, {passive:true});
    }
    var form = document.getElementById("transitLeadV1");
    if(form) form.addEventListener("submit", function(e){
      e.preventDefault();
      var msg = document.getElementById("transitLeadMsgV1");
      var name = form.name.value.trim(), phone = form.phone.value.trim();
      if(name.length < 2 || phone.length < 5){ msg.textContent = T("Укажите имя и контакт для связи"); return; }
      var btn = form.querySelector("button"); btn.disabled = true;
      fetch("/api/auctions?action=lead", {
        method:"POST", headers:{"content-type":"application/json"},
        body:JSON.stringify({
          name:name, phone:phone, hp_website:form.hp_website.value, source:"Авто в пути", vin:it.vin || "",
          comment:"Объявление #" + it.id + ": " + it.title + (it.price ? " — " + money(it.price) : "") + " · " + location.origin + transitHref(it)
        })
      }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return r.ok && d.ok; }); })
        .catch(function(){ return false; })
        .then(function(ok){
          if(ok){ form.innerHTML = '<div class="transitLeadOkV1"><b>' + esc(T("Заявка отправлена!")) + '</b><span>' + esc(T("Мы свяжемся с вами в ближайшее время.")) + '</span></div>'; }
          else { btn.disabled = false; msg.textContent = T("Не удалось отправить. Напишите нам в WhatsApp или Telegram."); }
        });
    });
  }

  // «Где сейчас авто» — из нашего трекинга по VIN (если машина уже в системе перевозчика).
  function loadWhere(it){
    fetch("/api/w8-tracking?vin=" + encodeURIComponent(it.vin))
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        var box = document.getElementById("transitWhereV1");
        if(!d || !box || !Array.isArray(d.stages)) return;
        var curStage = d.stages.filter(function(s){ return s.status === "current"; })[0]
          || d.stages.filter(function(s){ return s.status === "completed"; }).pop();
        if(!curStage) return;
        var eta = d.etaChisinau || (d.container && d.container.portArrival) || d.expectedDate || "";
        var etaTxt = "";
        if(eta){
          var dt = new Date(eta);
          if(!isNaN(dt)) etaTxt = dt.toLocaleDateString(lang() === "ro" ? "ro-RO" : lang() === "en" ? "en-GB" : "ru-RU", {day:"numeric", month:"long", year:"numeric"}).replace(/\s?г\.$/, "");
        }
        box.innerHTML = '<div><span>' + esc(T("Где сейчас авто")) + '</span><b>' + esc(T(STAGES[curStage.title] || curStage.title)) + '</b></div>'
          + (etaTxt ? '<div><span>' + esc(T(d.etaChisinau ? "Ориентировочно в Кишинёве" : "Ожидаемое прибытие")) + '</span><b data-no-i18n="true">' + esc(etaTxt) + '</b></div>' : "")
          + '<a href="/tracking?vin=' + encodeURIComponent(it.vin) + '">' + esc(T("Отследить авто")) + ' →</a>';
        box.hidden = false;
      }).catch(function(){});
  }

  /* ── Роутинг: /in-transit ↔ /in-transit?id=N ── */
  function route(){
    // /in-transit/<id> (серверная страница объявления) или старый вид ?id=
    var id = (location.pathname.match(/^\/in-transit\/(\d+)/) || [])[1] || new URLSearchParams(location.search).get("id");
    var it = id ? ITEMS.filter(function(x){ return String(x.id) === String(id); })[0] : null;
    if(it){ renderDetail(it); return; }
    detail.hidden = true; detail.innerHTML = "";
    listWrap.hidden = false;
    if(hero) hero.hidden = false;
    document.title = T("Продажа авто в пути") + " | Apex Auto";
  }

  grid.addEventListener("click", function(e){
    var a = e.target.closest("[data-transit-id]");
    if(!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    history.pushState({}, "", withLang(a.getAttribute("href")));
    route();
  });
  window.addEventListener("popstate", route);

  // Серверная страница объявления уже вшила список в HTML — второй запрос не нужен.
  var ssrEl = document.getElementById("ssrTransitV1"), ssr = null;
  if(ssrEl){ try{ ssr = JSON.parse(ssrEl.textContent); }catch(e){ ssr = null; } }
  if(ssr && Array.isArray(ssr.items)){
    ITEMS = ssr.items; renderList(); route();
  }else{
    grid.innerHTML = skeletons();
    fetch("/api/hot-lots?type=transit")
      .then(function(r){ return r.json(); })
      .then(function(d){ ITEMS = Array.isArray(d.items) ? d.items : []; })
      .catch(function(){ ITEMS = []; })
      .then(function(){ renderList(); route(); });
  }
})();
