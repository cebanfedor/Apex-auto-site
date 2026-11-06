// Живые факты с аукционов Copart/IAAI в карточке шапки /korea и /canada (06.11.2026, Федор:
// «продано вчера N машин, добавилось за сутки N гибридов, самая дорогая продажа вчера…»).
// Данные — /api/auctions?action=facts (наша база лотов, кэш 30 мин). Показываем 3 факта, раз в 5 с
// один сменяется следующим. Нет данных — карточка остаётся прежней («Почему через Apex Auto»).
(function(){
  "use strict";
  var card = document.querySelector("[data-auction-facts]");
  if(!card) return;
  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function num(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  var data = null, pool = [], shown = [], next = 0, timer = 0, paused = false;

  function build(d){
    var f = [];
    function add(n, cap, extra){ if(typeof n === "number" && n > 0) f.push({n: n, cap: cap, extra: extra || null}); }
    add(d.soldYesterday, "машин продано вчера на Copart и IAAI");
    if(d.topSale && d.topSale.price > 0) f.push({money: d.topSale.price, cap: "самая дорогая продажа вчера", extra: d.topSale});
    add(d.newHybrids24h, "новых гибридов в США за сутки");
    add(d.todayLots, "лотов на торгах сегодня");
    add(d.newEv24h, "новых электромобилей в США за сутки");
    add(d.newLots24h, "новых лотов на аукционах за сутки");
    add(d.soldYesterdayCa, "машин продано вчера на аукционах Канады");
    return f;
  }
  function itemHtml(it){
    var big = it.money ? "$" + num(it.money) : num(it.n);
    var sub = "";
    if(it.extra && it.extra.title){
      sub = it.extra.href ? '<a class="afLotV1" href="' + esc(it.extra.href) + '">' + esc(it.extra.title) + "</a>" : '<em class="afLotV1">' + esc(it.extra.title) + "</em>";
    }
    return '<b class="afNumV1">' + big + '</b><div class="afCapV1"><span>' + esc(T(it.cap)) + "</span>" + sub + "</div>";
  }
  function render(){
    if(!pool.length) return;
    card.classList.add("isFactsV1");
    card.innerHTML = '<a class="catHeroCardTtlV1 afTtlV1" href="/auctions"><i class="afLiveV1" aria-hidden="true"></i>' + esc(T("Аукционы США и Канады")) + ' <span aria-hidden="true">→</span></a>' +
      '<ul class="afListV1" aria-live="polite">' + shown.map(function(i){ return '<li data-i="' + i + '">' + itemHtml(pool[i]) + "</li>"; }).join("") + "</ul>";
  }
  function rotate(){
    if(paused || document.hidden || pool.length <= shown.length) return;
    var slot = rotate.slot = ((rotate.slot || 0) + 1) % shown.length;
    var li = card.querySelectorAll(".afListV1 li")[slot];
    var idx = next; next = (next + 1) % pool.length;
    while(shown.indexOf(idx) >= 0){ idx = next; next = (next + 1) % pool.length; }
    shown[slot] = idx;
    if(!li) return;
    li.classList.add("isOutV1");
    setTimeout(function(){ li.innerHTML = itemHtml(pool[idx]); li.setAttribute("data-i", idx); li.classList.remove("isOutV1"); }, 320);
  }
  function start(d){
    data = d; pool = build(d);
    if(pool.length < 2) return;   // мало цифр — оставляем прежнюю карточку
    shown = pool.slice(0, 3).map(function(_, i){ return i; });
    next = shown.length % pool.length;
    render();
    card.addEventListener("mouseenter", function(){ paused = true; });
    card.addEventListener("mouseleave", function(){ paused = false; });
    if(!timer) timer = setInterval(rotate, 5000);
  }
  window._factsRerender = function(){ if(data && pool.length >= 2) render(); };
  // карточка видна только на широком экране — на узком не тратим запрос
  if(window.matchMedia && !matchMedia("(min-width: 1180px)").matches) return;
  fetch("/api/auctions?action=facts").then(function(r){ return r.ok ? r.json() : null; })
    .then(function(d){ if(d && d.ok) start(d); }).catch(function(){});
})();
