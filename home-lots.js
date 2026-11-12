/* Живой блок лотов с аукциона на главной (под калькулятором).
   Витрина, а не весь каталог: ГИБРИД / PHEV / ЭЛЕКТРО / BMW, от 2020 года,
   только «заводится и едет», ВПЕРВЫЕ на аукционе и БЕЗ «котлет». Вся фильтрация
   и проверка истории — на сервере (action=showcase, edge-кэш 30 мин: одна
   пересборка на всех). Клиент только рисует компактные карточки. Русский текст;
   RO/EN подхватывает i18n (MutationObserver + словарь). */
(function () {
  function lotSlugV(lot){
    function w(s, m){ return String(s || "").normalize("NFKD").replace(/[^\x00-\x7F]/g, "").split(/[^A-Za-z0-9]+/).filter(Boolean).map(function(t){ return t[0].toUpperCase() + t.slice(1); }).join("-").slice(0, m).replace(/-+$/g, ""); }
    var vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(lot.vin || "").trim()) ? String(lot.vin).trim().toUpperCase() : "";
    return [String(lot.auction || "").toLowerCase() + "-" + lot.lot, w(lot.title || [lot.year, lot.make, lot.model].filter(Boolean).join(" "), 60), vin].filter(Boolean).join("-");
  }

  "use strict";
  var grid = document.getElementById("homeLotsGrid");
  var sec = document.getElementById("homeLots");
  if (!grid || !sec) return;

  // Число карточек = колонки × ряды, чтобы последний ряд всегда был полным
  // (колонок 6/5/3/2 по ширине — см. .homeLotsGridV1 в styles.css).
  function cols() {
    var t = getComputedStyle(grid).gridTemplateColumns || "";
    return Math.max(1, t.split(" ").filter(Boolean).length);
  }
  function countFor(c, avail) {
    var rows = c >= 5 ? 2 : c >= 3 ? 3 : 4;
    var n = c * rows;
    if (avail != null && avail < n) n = Math.max(c, Math.floor(avail / c) * c);
    return avail != null ? Math.min(n, avail) : n;
  }
  var pool = null, shownCols = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) {
    n = Number(n) || 0;
    return "$" + n.toLocaleString("en-US");
  }
  function kmFromMi(mi) {
    mi = Number(mi) || 0;
    return mi ? Math.round((mi * 1.609) / 1000) + " " + T("тыс. км") : "";
  }
  function shortDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    // «26 сент.» вместо «09/26» (Федор 23.09.2026: MM/YY читался как непонятно что)
    var t = d.toLocaleDateString(({ro:"ro-RO", en:"en-GB"})[window.APEX_LANG] || "ru-RU", {day:"numeric", month:"short"}).replace(/ /g, "\u00a0");
    return d.getFullYear() !== new Date().getFullYear() ? t + " " + d.getFullYear() : t;
  }
  function specLine(it) {
    var parts = [];
    // Объём из строки фида («2.5l 4» → «2.5 л»); у электро в фиде мусор («u u ux») — без объёма не показываем.
    var em = String(it.engine || "").match(/(\d+\.\d+)/);
    if (em) parts.push(em[1] + "\u00a0" + T("л") + (/\bturbo\b/i.test(it.engine) ? " Turbo" : ""));
    else if (/electric|электр/i.test(String(it.fuel || ""))) parts.push(T("Электро"));
    if (it.drive) parts.push(String(it.drive).toUpperCase());
    if (it.transmission) parts.push(String(it.transmission).replace(/automatic/i, "AT").replace(/manual/i, "MT"));
    return parts.filter(Boolean).slice(0, 3).join(" • ");
  }
  // Цена на карточке — ТОЛЬКО актуальная: текущая ставка, иначе «Купить сейчас».
  // finalBid НЕ показываем: у перевыставленного лота это цена ПРОШЛОЙ продажи (BMW M4: старые
  // $78 000 при текущей ставке $0 и выкупе $41 500) — выглядело как бредовая цена.
  function T(x) { return typeof window.i18nT === "function" ? window.i18nT(x) : x; }
  function price(it) {
    var bid = Number(it.currentBid) || 0, bn = Number(it.buyNow) || 0;
    if (bid > 0) return {v: bid, label: "Ставка"};
    if (bn > 0) return {v: bn, label: "Купить сейчас"};
    return null;
  }

  function card(it) {
    var title = it.title || [it.year, it.make, it.model].filter(Boolean).join(" ");
    var img = it.image || "";
    // Карточка ~297px (27.09.2026, PageSpeed: раньше даже _ful — 900×680+, 93% байт фото «трата»;
    // 27.09 вечер — даже 400×300 давал «превышает контейнер 297×223», сузили до 300×225):
    // IAAI 1280×960 → 300×225 через их же resizer; Copart — через Vercel Image (remotePattern в
    // vercel.json) до реального размера карточки, не просто _hrs→_ful (тот всё ещё в разы больше).
    if(/vis\.iaai\.com\/resizer/i.test(img)) img = img.replace(/width=\d+/i, "width=300").replace(/height=\d+/i, "height=225");
    else if(/cs\.copart\.com\//i.test(img)) img = "/_vercel/image?url=" + encodeURIComponent(img.replace(/_hrs\.jpg/i, "_ful.jpg")) + "&w=300&q=75";
    var auc = (it.auction || "").toUpperCase();
    var p = price(it);
    var km = kmFromMi(it.odometer);
    var date = shortDate(it.auctionDate || it.saleDate);
    var sub = [km, date].filter(Boolean).map(esc).join(" · ");
    return (
      '<a class="homeLotCardV1" href="/auctions/' + esc(it.auction && it.lot ? lotSlugV(it) : it.id) + '">' +
      '<div class="homeLotImgV1">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(title) + '" width="300" height="225" loading="lazy" onerror="this.style.display=\'none\'">' : "") +
      (p ? '<span class="homeLotPriceV1"><small>' + esc(T(p.label)) + "</small> " + esc(money(p.v)) + "</span>"
         : '<span class="homeLotPriceV1 homeLotNoBidV1">' + esc(T("Ставок пока нет")) + "</span>") +
      (auc ? '<span class="homeLotAucV1">' + esc(auc) + "</span>" : "") +
      "</div>" +
      '<div class="homeLotBodyV1">' +
      '<h3 class="homeLotTitleV1">' + esc(title) + "</h3>" +
      '<div class="homeLotSpecV1">' + esc(specLine(it)) + "</div>" +
      '<div class="homeLotMetaV1"><i class="homeLotRunV1">На ходу</i>' +
      (sub ? '<span class="homeLotSubV1">' + sub + "</span>" : "") +
      "</div>" +
      "</div>" +
      "</a>"
    );
  }

  function skeleton() {
    var s = "", n = countFor(cols());
    for (var i = 0; i < n; i++) s += '<div class="homeLotSkelV1"></div>';
    grid.innerHTML = s;
  }

  function render() {
    if (!pool) return;
    shownCols = cols();
    grid.innerHTML = pool.slice(0, countFor(shownCols, pool.length)).map(card).join("");
  }

  function load() {
    skeleton();
    fetch("/api/auctions?action=showcase")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var items = (j && j.items) || [];
        if (!items.length) { sec.hidden = true; return; }
        // Сервер отдаёт пул до 24 — перемешиваем, чтобы витрина менялась на каждом заходе.
        for (var i = items.length - 1; i > 0; i--) { var k = Math.floor(Math.random() * (i + 1)); var t = items[i]; items[i] = items[k]; items[k] = t; }
        pool = items;
        render();
      })
      .catch(function () { sec.hidden = true; });
  }

  document.addEventListener("apex-dict-ready", function () { if (pool) render(); });
  var rt;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(function () { if (pool && cols() !== shownCols) render(); }, 150);
  }
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(grid);
  else window.addEventListener("resize", onResize);

  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 1500 });
  else setTimeout(load, 200);
})();
