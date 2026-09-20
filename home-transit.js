/* Главная: блок «Авто в пути — в продаже». Показывается, только если есть активные
   объявления (админка → Автомобили → «Продаётся в пути»). Карточки — те же, что на /in-transit. */
(function(){
  "use strict";
  var sec = document.getElementById("homeTransitV1");
  var grid = document.getElementById("homeTransitGridV1");
  if(!sec || !grid) return;
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function money(n){ return n ? "$" + Math.round(n).toLocaleString("en-US").replace(/,/g, " ") : ""; }
  function card(it){
    var chips = [it.mileage, it.fuel, it.damage].filter(Boolean).map(function(x){ return "<span>" + esc(x) + "</span>"; }).join("");
    return '<a class="transitCardV1" href="/in-transit/' + encodeURIComponent(it.id) + '">'
      + '<div class="transitCardImgV1">'
        + (it.photos[0] ? '<img src="' + esc(it.photos[0]) + '" alt="' + esc(it.title) + '" loading="lazy">' : '<div class="transitNoImgV1"></div>')
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
