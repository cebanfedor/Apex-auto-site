/* Главная: блок «Авто в пути — в продаже». Показывается, только если есть активные
   объявления (админка → Автомобили → «Продаётся в пути»). Карточки — те же, что на /in-transit. */
(function(){
  /* Ссылка = номер + название + VIN: /in-transit/3-2019-lincoln-mkz-rezerve-ii-3ln6l5mu7kr624453 (тот же алгоритм — server/slug.js) */
  function slugWords(s, max){
    return String(s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(t){ return t[0].toUpperCase() + t.slice(1); }).join("-").slice(0, max).replace(/-+$/g, "");
  }
  function transitHref(it){
    var vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(it.vin || "").trim()) ? String(it.vin).trim().toUpperCase() : "";
    return "/in-transit/" + [String(it.id), slugWords(it.title, 60), vin].filter(Boolean).join("-");
  }


  "use strict";
  var sec = document.getElementById("homeTransitV1");
  var grid = document.getElementById("homeTransitGridV1");
  if(!sec || !grid) return;
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
  function card(it){
    var chips = [it.mileage, it.fuel, it.damage].filter(Boolean).map(function(x){ return "<span>" + esc(x) + "</span>"; }).join("");
    return '<a class="transitCardV1" href="' + transitHref(it) + '">'
      + '<div class="transitCardImgV1">'
        + (it.photos[0] ? '<img src="' + esc(photoSized(it.photos[0], 640)) + '" alt="' + esc(it.title) + '" width="640" height="480" loading="lazy" decoding="async" data-fb="' + esc(it.photos[0]) + '">' : '<div class="transitNoImgV1"></div>')
        + '<span class="transitBadgeV1">' + esc(T("В пути")) + '</span>'
      + '</div>'
      + '<div class="transitCardBodyV1">'
        + '<h3 data-no-i18n="true">' + esc(it.title) + '</h3>'
        + '<div class="transitChipsV1">' + chips + '</div>'
        + '<div class="transitCardFootV1">'
          + '<b class="transitPriceV1"' + (it.price ? " data-num" : "") + ' data-no-i18n="true">' + (it.price ? money(it.price) : esc(T("Цена по запросу"))) + '</b>'
          + '<span class="transitMoreV1">' + esc(T("Подробнее")) + ' →</span>'
        + '</div>'
      + '</div></a>';
  }
  fetch("/api/hot-lots?type=transit")
    .then(function(r){ return r.json(); })
    .then(function(d){
      var items = (d.items || []).filter(function(x){ return !x.sold; }).slice(0, 4);
      if(!items.length) return;
      grid.innerHTML = items.map(card).join("");
      sec.hidden = false;
    }).catch(function(){});
})();
