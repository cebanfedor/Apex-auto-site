// Живые данные с аукционов Copart/IAAI (06.11.2026, Федор: «продано вчера N машин, новых гибридов, самая дорогая…»,
// «придумай блоки, бегущие дорожки — чтобы клиенту было интересно и постоянно новая инфа»).
// Один запрос /api/auctions?action=facts (наша база лотов, кэш 15–30 мин) на три виджета:
//   [data-auction-facts]  — карточка в шапке /korea и /canada: 3 факта, раз в 5 с один сменяется;
//   [data-auction-ticker] — бегущая строка «только что продано» вперемешку с фактами;
//   [data-auction-pulse]  — блок на главной: плитки с цифрами + карточки последних продаж.
// Ничего не выдумываем: нет цифры — нет факта; данных мало — виджет остаётся скрытым / прежним.
(function(){
  "use strict";
  var card = document.querySelector("[data-auction-facts]");
  var tickers = Array.prototype.slice.call(document.querySelectorAll("[data-auction-ticker]"));
  var pulse = document.querySelector("[data-auction-pulse]");
  if(!card && !tickers.length && !pulse) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Каталоги Кореи и Канады показывают СВОИ факты (06.11.2026, Федор: «в Корее про Корею, в Канаде про Канаду»): /api/catalog?action=facts
  var catMain = document.querySelector("main.apx-korea");
  var PAGE_SRC = catMain ? (catMain.getAttribute("data-cat-src") === "ca" ? "ca" : "kr") : "";

  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function num(n){ return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
  function ago(at){
    var ms = Date.now() - Date.parse(at || "");
    if(!isFinite(ms)) return "";
    var m = Math.round(ms / 60000);
    if(m < 2) return T("Только что");
    if(m < 60) return m + " " + T("мин. назад");
    return Math.round(m / 60) + " " + T("ч. назад");
  }
  // фото уменьшаем так же, как карточки лотов на главной (home-lots.js)
  function thumb(url, w){
    var u = String(url || "");
    if(/vis\.iaai\.com\/resizer/i.test(u)) return u.replace(/width=\d+/i, "width=" + w).replace(/height=\d+/i, "height=" + Math.round(w * .75));
    if(/cs\.copart\.com\//i.test(u)) return "/_vercel/image?url=" + encodeURIComponent(u.replace(/_hrs\.jpg/i, "_ful.jpg")) + "&w=" + (w <= 160 ? 160 : 640) + "&q=75";
    return u;
  }
  function cached(k){ try{ var v = JSON.parse(sessionStorage.getItem(k) || "null"); return v && v.n > 0 ? v.n : null; }catch(e){ return null; } }

  var data = null;
  // Все факты, какие удалось посчитать. Порядок = порядок показа.
  function facts(d){
    var f = [];
    function add(n, cap, extra){ if(typeof n === "number" && n > 0) f.push({n: n, cap: cap, extra: extra || null}); }
    add(d.soldYesterday, "машин продано вчера на Copart и IAAI");
    if(d.topSale && d.topSale.price > 0) f.push({money: d.topSale.price, cap: "самая дорогая продажа вчера", extra: d.topSale});
    if(typeof d.resaleSoon === "number" && d.resaleSoon > 0) f.push({n: d.resaleSoon, cap: "перекупов на торгах за 3 дня — Clean Select их скрывает", href: "/auctions?smart=1"});
    if(d.topBuyNow && d.topBuyNow.price > 0) f.push({money: d.topBuyNow.price, cap: "самый дорогой Buy Now на торгах", extra: d.topBuyNow});
    add(d.exoticActive, "суперкаров на торгах: Ferrari, Lamborghini, Rolls-Royce…");
    add(d.newHybrids24h, "новых гибридов в США за сутки");
    add(d.todayLots, "лотов на торгах сегодня и завтра");
    if(d.freshSoldYesterday > 0 && d.freshYear) f.push({n: d.freshSoldYesterday, cap: "машин {Y}+ года продано вчера", year: d.freshYear});
    add(d.newEv24h, "новых электромобилей в США за сутки");
    add(d.teslaSoldYesterday, "Tesla продано вчера на аукционах");
    add(d.buyNowActive, "лотов можно купить сразу — Buy Now");
    add(d.newLots24h, "новых лотов на аукционах за сутки");
    add(d.soldYesterdayCa, "машин продано вчера на аукционах Канады");
    add(cached("apexMegaKr"), "авто в каталоге Кореи прямо сейчас");
    add(cached("apexMegaCa"), "целых авто на дилерских аукционах Канады");
    return f;
  }
  function pageFacts(d){
    var f = [], B = PAGE_SRC === "ca" ? "/canada" : "/korea", Y = d.freshYear;
    function add(n, cap, href, yr){ if(typeof n === "number" && n > 0) f.push({n: n, cap: cap, href: href, year: yr}); }
    function top(){ if(d.topCar && d.topCar.usd > 0) f.push({money: d.topCar.usd, cap: "самая дорогая машина в каталоге", extra: {title: d.topCar.title, href: d.topCar.href}}); }
    function fresh(){ if(d.newest && d.newest.at && Date.now() - Date.parse(d.newest.at) < 48 * 3600e3) f.push({big: ago(d.newest.at), cap: "новое объявление", extra: {title: d.newest.title, href: d.newest.href}}); }
    function rate(){ if(d.rate && d.rate.v > 0) f.push({big: "1 $ = " + (d.rate.cur === "KRW" ? num(d.rate.v) + " ₩" : d.rate.v.toFixed(2) + " CAD"), cap: "курс доллара сегодня"}); }
    if(PAGE_SRC === "ca"){
      top(); fresh();
      add(d.total, "целых авто на дилерских аукционах Канады", B);
      add(d.auctionSoon, "авто на ближайших торгах", B + "?sort=auction_nearest");
      add(d.exotic, "суперкаров: Ferrari, Lamborghini, Bentley…", B + "?sort=expensive");
      add(d.inspections, "с отчётом об осмотре и фото", B + "?has_inspections=1");
      rate();
      add(d.fresh, "машин {Y}+ года", B + "?year_from=" + Y, Y);
      add(d.porsche, "Porsche в продаже");
      add(d.pickups, "пикапов в продаже", B + "?body_type_id=4");
      add(d.hybrids, "гибридов в продаже", B + "?fuel_id=3");
      add(d.ev, "электромобилей в продаже", B + "?fuel_id=2");
      add(d.lowkm, "с пробегом до 50 000 км", B + "?odometer_to=50000");
    }else{
      top(); fresh();
      add(d.total, "авто в каталоге Кореи прямо сейчас", B);
      add(d.exotic, "суперкаров: Ferrari, Lamborghini, Bentley…", B + "?sort=expensive");
      add(d.inspections, "с отчётом техосмотра", B + "?has_inspections=1");
      rate();
      add(d.history, "с историей владельцев и страховых случаев", B + "?has_history_reports=1");
      add(d.fresh, "машин {Y}+ года", B + "?year_from=" + Y, Y);
      add(d.porsche, "Porsche в продаже");
      add(d.hybrids, "гибридов в продаже", B + "?fuel_id=3");
      add(d.ev, "электромобилей в продаже", B + "?fuel_id=2");
      add(d.lowkm, "с пробегом до 30 000 км", B + "?odometer_to=30000");
    }
    return f;
  }
  function capOf(it){ var c = T(it.cap); return it.year ? c.replace("{Y}", it.year) : c; }
  function bigOf(it){ return it.big ? esc(it.big) : it.money ? "$" + num(it.money) : num(it.n); }

  // Смена фактов по одному: в каждом виджете свой набор «слотов», раз в N мс один слот получает следующий факт.
  function rotator(root, sel, pool, slots, html, every){
    var shown = pool.slice(0, slots).map(function(_, i){ return i; }), next = shown.length % pool.length, slot = -1, paused = false;
    root.addEventListener("mouseenter", function(){ paused = true; });
    root.addEventListener("mouseleave", function(){ paused = false; });
    if(pool.length <= slots) return shown;
    setInterval(function(){
      if(paused || document.hidden) return;
      slot = (slot + 1) % shown.length;
      var el = root.querySelectorAll(sel)[slot];
      var idx = next; next = (next + 1) % pool.length;
      while(shown.indexOf(idx) >= 0){ idx = next; next = (next + 1) % pool.length; }
      shown[slot] = idx;
      if(!el) return;
      el.classList.add("isOutV1");
      setTimeout(function(){ el.innerHTML = html(pool[idx]); el.classList.remove("isOutV1"); }, 320);
    }, every);
    return shown;
  }

  // ---- 1. Карточка в шапке каталогов Кореи и Канады
  function cardItem(it){
    var sub = "";
    if(it.extra && it.extra.title){
      sub = it.extra.href ? '<a class="afLotV1" href="' + esc(it.extra.href) + '" title="' + esc(it.extra.title) + '">' + esc(it.extra.title) + "</a>" : '<em class="afLotV1">' + esc(it.extra.title) + "</em>";
    }
    var cap = it.href ? '<a class="afCapLnkV1" href="' + esc(it.href) + '">' + esc(capOf(it)) + "</a>" : '<span title="' + esc(capOf(it)) + '">' + esc(capOf(it)) + "</span>";
    return '<b class="afNumV1">' + bigOf(it) + '</b><div class="afCapV1">' + cap + sub + "</div>";
  }
  var cardPool = null, cardShown = null;
  function renderCard(){
    if(!card || !cardPool) return;
    card.classList.add("isFactsV1");
    card.hidden = false;
    var ttl = PAGE_SRC === "ca" ? '<div class="catHeroCardTtlV1 afTtlV1"><i class="afLiveV1" aria-hidden="true"></i>' + esc(T("Канада сейчас")) + "</div>"
      : PAGE_SRC === "kr" ? '<div class="catHeroCardTtlV1 afTtlV1"><i class="afLiveV1" aria-hidden="true"></i>' + esc(T("Корея сейчас")) + "</div>"
      : '<a class="catHeroCardTtlV1 afTtlV1" href="/auctions"><i class="afLiveV1" aria-hidden="true"></i>' + esc(T("Аукционы США и Канады")) + ' <span aria-hidden="true">→</span></a>';
    card.innerHTML = ttl +
      '<ul class="afListV1" aria-live="polite">' + cardShown.map(function(i){ return "<li>" + cardItem(cardPool[i]) + "</li>"; }).join("") + "</ul>";
  }
  function startCard(d){
    if(!card) return;
    var pool = PAGE_SRC ? pageFacts(d) : facts(d);
    if(pool.length < 2) return;   // мало цифр — оставляем прежнюю карточку
    cardPool = pool; cardShown = pool.slice(0, 3).map(function(_, i){ return i; });
    renderCard();
    cardShown = rotator(card, ".afListV1 li", pool, 3, cardItem, 5000);
  }

  // ---- 2. Бегущая строка: продажи вперемешку с фактами
  var pulseCards = 0;   // сколько продаж уже показано карточками в «Пульсе» — строка внутри него начинает со следующих
  function tickerItems(d, skip){
    var sales = PAGE_SRC ? [] : (d.recentSales || []).slice(skip || 0, (skip || 0) + 18), fs = PAGE_SRC ? pageFacts(d) : facts(d), out = [], fi = 0;
    sales.forEach(function(s, i){
      out.push('<a class="tkItemV1" href="' + esc(s.href || "/auctions") + '">' +
        (s.img ? '<img src="' + esc(thumb(s.img, 160)) + '" alt="" width="40" height="30" loading="lazy" onerror="this.remove()">' : "") +
        "<b>" + esc(s.title) + "</b><em>$" + num(s.price) + "</em><span>" + esc(ago(s.at)) + "</span></a>");
      if(i % 3 === 2 && fi < fs.length){ var it = fs[fi++]; out.push('<span class="tkItemV1 isFactV1"><i aria-hidden="true"></i><b>' + bigOf(it) + "</b> " + esc(capOf(it)) + "</span>"); }
    });
    if(!sales.length) fs.forEach(function(it){ var tag = it.href ? 'a href="' + esc(it.href) + '"' : "span"; out.push("<" + tag + ' class="tkItemV1 isFactV1"><i aria-hidden="true"></i><b>' + bigOf(it) + "</b> " + esc(capOf(it)) + "</" + tag.split(" ")[0] + ">"); });
    return out;
  }
  function renderTickers(){
    if(!data) return;
    tickers.forEach(function(el){
      var items = tickerItems(data, el.hasAttribute("data-skip-cards") ? pulseCards : 0);
      if(items.length < 3) return;
      var seq = items.join("");
      var lbl = PAGE_SRC ? '<span class="tkLiveV1"><i aria-hidden="true"></i>' + esc(T(PAGE_SRC === "ca" ? "Канада сейчас" : "Корея сейчас")) + "</span>"
        : '<a class="tkLiveV1" href="/auctions?tab=archived"><i aria-hidden="true"></i>' + esc(T("Продано сейчас")) + "</a>";
      el.innerHTML = '<div class="tkV1">' + lbl +
        '<div class="tkViewV1"><div class="tkTrackV1"><div class="tkSeqV1">' + seq + '</div><div class="tkSeqV1" aria-hidden="true">' + seq + "</div></div></div></div>";
      el.hidden = false;
      el.querySelectorAll('.tkSeqV1[aria-hidden] a').forEach(function(a){ a.tabIndex = -1; });
      var track = el.querySelector(".tkTrackV1"), one = el.querySelector(".tkSeqV1");
      if(!reduce && track && one) track.style.animationDuration = Math.max(30, Math.round(one.scrollWidth / 42)) + "s";
    });
  }

  // ---- 3. Блок «Пульс аукционов» на главной
  function tileItem(it){
    var sub = it.extra && it.extra.title ? '<small>' + esc(it.extra.title) + "</small>" : "";
    var inner = "<b>" + bigOf(it) + "</b><span>" + esc(capOf(it)) + "</span>" + sub;
    return it.extra && it.extra.href ? '<a href="' + esc(it.extra.href) + '">' + inner + "</a>" : inner;
  }
  function saleCard(s){
    return '<a class="homeLotCardV1" href="' + esc(s.href || "/auctions") + '">' +
      '<div class="homeLotImgV1"><img src="' + esc(thumb(s.img, 300)) + '" alt="' + esc(s.title) + '" width="300" height="225" loading="lazy" onerror="this.style.display=\'none\'">' +
      '<span class="homeLotPriceV1"><small>' + esc(T("Продан")) + "</small> $" + num(s.price) + "</span>" +
      (s.auction ? '<span class="homeLotAucV1">' + esc(String(s.auction).toUpperCase()) + "</span>" : "") + "</div>" +
      '<div class="homeLotBodyV1"><h3 class="homeLotTitleV1">' + esc(s.title) + '</h3><div class="homeLotMetaV1"><span class="homeLotSubV1">' + esc(ago(s.at)) + "</span></div></div></a>";
  }
  var pulsePool = null, pulseShown = null;
  function renderPulse(){
    if(!pulse || !data) return;
    var stats = pulse.querySelector("[data-pulse-stats]"), grid = pulse.querySelector("[data-pulse-sales]");
    if(stats && pulsePool) stats.innerHTML = pulseShown.map(function(i){ return '<div class="pulseTileV1">' + tileItem(pulsePool[i]) + "</div>"; }).join("");
    var sales = data.recentSales || [];
    if(grid){
      if(sales.length >= 4){
        grid.closest("[data-pulse-sales-wrap]").hidden = false;   // показать до замера колонок: у скрытой сетки их не посчитать
        var cols = (getComputedStyle(grid).gridTemplateColumns || "").split(" ").filter(Boolean).length || 4;
        pulseCards = Math.min(sales.length, cols <= 2 ? 4 : cols);
        grid.innerHTML = sales.slice(0, pulseCards).map(saleCard).join("");
        grid.closest("[data-pulse-sales-wrap]").hidden = false;
      }else grid.closest("[data-pulse-sales-wrap]").hidden = true;
    }
  }
  function startPulse(d){
    if(!pulse) return;
    var pool = facts(d);
    if(pool.length < 4 && !(d.recentSales || []).length) return;
    pulse.hidden = false;
    pulsePool = pool; pulseShown = pool.slice(0, 4).map(function(_, i){ return i; });
    renderPulse();
    var stats = pulse.querySelector("[data-pulse-stats]");
    if(stats && pool.length > 4) pulseShown = rotator(stats, ".pulseTileV1", pool, 4, tileItem, 6000);
  }

  window._factsRerender = function(){ renderCard(); renderPulse(); renderTickers(); };
  // словарь RO/EN догрузился позже, чем собрались подписи («ч. назад», «машин 2024+ года») — пересобираем
  document.addEventListener("apex-dict-ready", function(){ try{ window._factsRerender(); }catch(e){} });

  // Карточка видна только на широком экране, строка в каталогах — только на узком: без видимых виджетов не тратим запрос.
  function wide(){ return !!(window.matchMedia && matchMedia("(min-width: 1180px)").matches); }
  function anyVisible(){
    if(pulse) return true;
    if(tickers.some(function(el){ return !(el.classList.contains("tkNarrowV1") && wide()); })) return true;
    return !!card && wide();
  }
  function load(){
    if(!anyVisible()) return;
    fetch(PAGE_SRC ? "/api/catalog?action=facts&src=" + PAGE_SRC : "/api/auctions?action=facts").then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ if(!d || !d.ok) return; data = d; startCard(d); startPulse(d); renderTickers(); }).catch(function(){});
  }
  // Блок на главной далеко внизу — грузим, когда до него недалеко докрутили; остальное сразу.
  if(pulse && !card && tickers.every(function(el){ return pulse.contains(el); }) && "IntersectionObserver" in window){
    var io = new IntersectionObserver(function(es){ if(es.some(function(e){ return e.isIntersecting; })){ io.disconnect(); load(); } }, {rootMargin: "800px 0px"});
    // сам блок скрыт до данных, а скрытый элемент в зону видимости не попадает — следим за меткой высотой 1px перед ним
    var mark = document.createElement("div"); mark.setAttribute("aria-hidden", "true"); mark.style.height = "1px";
    pulse.parentNode.insertBefore(mark, pulse);
    io.observe(mark);
  }else load();
})();
