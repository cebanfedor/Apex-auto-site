/* Живой блок лотов с аукциона на главной (под калькулятором).
   Витрина, а не весь каталог: ГИБРИД / PHEV / ЭЛЕКТРО / BMW, от 2020 года,
   только «заводится и едет», ВПЕРВЫЕ на аукционе и БЕЗ «котлет». Вся фильтрация
   и проверка истории — на сервере (action=showcase, edge-кэш 30 мин: одна
   пересборка на всех). Клиент только рисует компактные карточки. Русский текст;
   RO/EN подхватывает i18n (MutationObserver + словарь). */
(function () {
  "use strict";
  var grid = document.getElementById("homeLotsGrid");
  var sec = document.getElementById("homeLots");
  if (!grid || !sec) return;

  var COUNT = 8;

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
    return mi ? Math.round((mi * 1.609) / 1000) + " тыс. км" : "";
  }
  function shortDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    // «26 сент.» вместо «09/26» (Федор 23.09.2026: MM/YY читался как непонятно что)
    var t = d.toLocaleDateString("ru-RU", {day:"numeric", month:"short"});
    return d.getFullYear() !== new Date().getFullYear() ? t + " " + d.getFullYear() : t;
  }
  function specLine(it) {
    var parts = [];
    if (it.engine) parts.push(String(it.engine).replace(/\s+/g, " ").trim());
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
    var auc = (it.auction || "").toUpperCase();
    var p = price(it);
    var km = kmFromMi(it.odometer);
    var date = shortDate(it.auctionDate || it.saleDate);
    var sub = [km, date].filter(Boolean).map(esc).join(" · ");
    return (
      '<a class="homeLotCardV1" href="/auctions/' + esc(it.id) + '">' +
      '<div class="homeLotImgV1">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : "") +
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
    var s = "";
    for (var i = 0; i < COUNT; i++) s += '<div class="homeLotSkelV1"></div>';
    grid.innerHTML = s;
  }

  function load() {
    skeleton();
    fetch("/api/auctions?action=showcase")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var items = (j && j.items) || [];
        if (!items.length) { sec.hidden = true; return; }
        // Сервер отдаёт пул до 24 — берём случайные 8, чтобы витрина менялась на каждом заходе.
        for (var i = items.length - 1; i > 0; i--) { var k = Math.floor(Math.random() * (i + 1)); var t = items[i]; items[i] = items[k]; items[k] = t; }
        grid.innerHTML = items.slice(0, COUNT).map(card).join("");
      })
      .catch(function () { sec.hidden = true; });
  }

  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 1500 });
  else setTimeout(load, 200);
})();
