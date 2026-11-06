/* Главная: блок «Авто из Кореи» (06.11.2026). Данные — /api/catalog?action=showcase: сервер уже отфильтровал
   (техосмотр + история, нормальная цена, есть фото) и посчитал цену в $ по нашему курсу; кэш 15 мин.
   Цена — цена В КОРЕЕ (без доставки и растаможки) — так и подписана. Если данных нет — блок остаётся скрытым.
   Карточки и сетка — те же, что у «Свежих лотов» (.homeLotCardV1), число карточек = колонки × ряды. */
(function(){
  "use strict";
  var sec = document.getElementById("homeKorea");
  var grid = document.getElementById("homeKoreaGrid");
  if(!sec || !grid) return;
  var FUELS = {1:"Дизель", 2:"Электро", 3:"Гибрид", 4:"Бензин", 5:"Газ"};
  var TRANS = {1:"АКПП", 2:"МКПП"};
  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ return "$" + Math.round(n).toLocaleString("en-US").replace(/,/g, " "); }
  function cols(){ return Math.max(1, (getComputedStyle(grid).gridTemplateColumns || "").split(" ").filter(Boolean).length); }
  // 5–6 колонок — один ряд, 2–3 колонки — два ряда: последний ряд всегда полный
  function countFor(c, avail){
    var n = c * (c >= 5 ? 1 : 2);
    if(avail < n) n = Math.max(c, Math.floor(avail / c) * c);
    return Math.min(n, avail);
  }
  function spec(it){
    var p = [];
    if(it.engine) p.push(it.engine.toFixed(1) + " " + T("л"));
    if(FUELS[it.fuel]) p.push(T(FUELS[it.fuel]));
    if(TRANS[it.trans]) p.push(T(TRANS[it.trans]));
    return p.join(" • ");
  }
  function card(it){
    var checks = it.insp && it.hist ? T("Техосмотр · История") : it.insp ? T("Техосмотр") : T("История");
    var km = it.km ? Math.round(it.km / 1000) + " " + T("тыс. км") : "";
    return '<a class="homeLotCardV1" href="' + esc(it.href) + '">'
      + '<div class="homeLotImgV1">'
        + '<img src="' + esc(it.img) + '" alt="' + esc(it.title) + '" width="300" height="225" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'">'
        + '<span class="homeLotPriceV1"><small>' + esc(T("В Корее")) + "</small> " + esc(money(it.usd)) + "</span>"
        + '<span class="homeLotAucV1">ENCAR</span>'
      + "</div>"
      + '<div class="homeLotBodyV1">'
        + '<h3 class="homeLotTitleV1" data-no-i18n="true">' + esc(it.title) + "</h3>"
        + '<div class="homeLotSpecV1">' + esc(spec(it)) + "</div>"
        + '<div class="homeLotMetaV1"><i class="homeLotRunV1">' + esc(checks) + "</i>" + (km ? '<span class="homeLotSubV1">' + esc(km) + "</span>" : "") + "</div>"
      + "</div></a>";
  }
  var pool = null, shown = 0;
  function render(){
    if(!pool) return;
    var c = cols(), n = countFor(c, pool.length);
    if(c === shown && grid.childElementCount === n) return;
    shown = c;
    grid.innerHTML = pool.slice(0, n).map(card).join("");
  }
  function load(){
    fetch("/api/catalog?action=showcase")
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){
        var items = d && d.ok && Array.isArray(d.items) ? d.items : [];
        if(items.length < 4) return;           // меньше четырёх — полный ряд не собрать, блок не показываем
        pool = items;
        sec.hidden = false;
        render();
      }).catch(function(){});
  }
  document.addEventListener("apex-dict-ready", function(){ if(pool){ shown = 0; render(); } });
  var rt;
  function onResize(){ clearTimeout(rt); rt = setTimeout(render, 150); }
  if("ResizeObserver" in window) new ResizeObserver(onResize).observe(grid);
  else window.addEventListener("resize", onResize);
  if("requestIdleCallback" in window) requestIdleCallback(load, {timeout: 2000});
  else setTimeout(load, 300);
})();
