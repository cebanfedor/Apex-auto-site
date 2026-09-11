/* Живой блок лотов с аукциона на главной (под калькулятором).
   Витрина, а не весь каталог: показываем только «вкусные» лоты —
   ГИБРИДЫ / PHEV / ЭЛЕКТРО / BMW, от 2020 года, ТОЛЬКО «заводится и едет»
   (condition run_and_drives — как «На ходу» на сайте), ВПЕРВЫЕ на аукционе
   (пустая история продаж) и БЕЗ «котлет» (без тяжёлых/утильных повреждений).
   Лёгкий самостоятельный модуль (не тянет тяжёлый auctions.js). Русский текст;
   RO/EN подхватывает i18n (MutationObserver + словарь). */
(function () {
  "use strict";
  var grid = document.getElementById("homeLotsGrid");
  var sec = document.getElementById("homeLots");
  if (!grid || !sec) return;

  var COUNT = 8;
  var YEAR_MIN = 2020;
  var BMW_ID = 16;
  // Наборы запросов: гибрид, plug-in гибрид, электро — по топливу; BMW — по марке
  // (любое топливо). yearFrom режем сразу на сервере, остальное — на клиенте.
  var QUERIES = [
    { fuel: "hybrid" },
    { fuel: "plug_in_hybrid" },
    { fuel: "electric" },
    { make: BMW_ID }
  ];
  // «Котлеты»: тяжёлые/структурные и утильные повреждения — не витрина.
  var JUNK_RE = /all over|roll ?over|undercarriage|frame|strip|burn|fire|flood|water|biohazard|vandal|missing|total/i;

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
    return String(d.getMonth() + 1).padStart(2, "0") + "/" + String(d.getFullYear()).slice(2);
  }
  // Заводится И едет: у API это condition === "run_and_drives" (сайт так и
  // помечает «На ходу»); enhanced/engine_starts/not_run — НЕ подходят.
  function runsAndDrives(it) {
    return String(it.condition || "").toLowerCase() === "run_and_drives";
  }
  // Впервые на аукционе: нет прошлых продаж в истории.
  function firstTime(it) {
    var ph = it.priceHistory;
    return !ph || (Array.isArray(ph) && ph.length === 0);
  }
  // Без «котлет»: без тяжёлых/утильных повреждений (осн. + доп.).
  function notWreck(it) {
    var d = (String(it.damage || "") + " " + String(it.secondaryDamage || "")).trim();
    return !JUNK_RE.test(d);
  }
  function keep(it) {
    return it && it.image && Number(it.year) >= YEAR_MIN && runsAndDrives(it) && firstTime(it) && notWreck(it);
  }

  function specLine(it) {
    var parts = [];
    if (it.engine) parts.push(String(it.engine).replace(/\s+/g, " ").trim());
    if (it.drive) parts.push(String(it.drive).toUpperCase());
    if (it.transmission) parts.push(String(it.transmission).replace(/automatic/i, "AT").replace(/manual/i, "MT"));
    return parts.filter(Boolean).slice(0, 3).join(" • ");
  }
  function price(it) {
    return Number(it.currentBid) || Number(it.finalBid) || Number(it.buyNow) || 0;
  }

  function card(it) {
    var title = it.title || [it.year, it.make, it.model].filter(Boolean).join(" ");
    var img = it.image || "";
    var auc = (it.auction || "").toUpperCase();
    var p = price(it);
    var km = kmFromMi(it.odometer);
    var date = shortDate(it.auctionDate || it.saleDate);
    var meta = ['<i class="homeLotRunV1">На ходу</i>', km ? "<span>" + esc(km) + "</span>" : "", date ? "<span>" + esc(date) + "</span>" : ""]
      .filter(Boolean)
      .join('<span class="homeLotDotV1">·</span>');
    return (
      '<a class="homeLotCardV1" href="/auctions/' + esc(it.id) + '">' +
      '<div class="homeLotImgV1">' +
      (img ? '<img src="' + esc(img) + '" alt="' + esc(title) + '" loading="lazy" onerror="this.style.display=\'none\'">' : "") +
      (p ? '<span class="homeLotPriceV1">' + esc(money(p)) + "</span>" : "") +
      (auc ? '<span class="homeLotAucV1">' + esc(auc) + "</span>" : "") +
      "</div>" +
      '<div class="homeLotBodyV1">' +
      '<h3 class="homeLotTitleV1">' + esc(title) + "</h3>" +
      '<div class="homeLotSpecV1">' + esc(specLine(it)) + "</div>" +
      '<div class="homeLotMetaV1">' + meta + "</div>" +
      "</div>" +
      "</a>"
    );
  }

  function skeleton() {
    var s = "";
    for (var i = 0; i < COUNT; i++) s += '<div class="homeLotSkelV1"></div>';
    grid.innerHTML = s;
  }

  function fetchQuery(q) {
    var p = new URLSearchParams({ action: "search", per_page: "40", sort: "soon", yearFrom: String(YEAR_MIN) });
    if (q.fuel) p.set("fuel", q.fuel);
    if (q.make) p.set("make", String(q.make));
    return fetch("/api/auctions?" + p.toString())
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.items) || []; })
      .catch(function () { return []; });
  }

  function load() {
    skeleton();
    Promise.all(QUERIES.map(fetchQuery))
      .then(function (lists) {
        var seen = {}, out = [];
        lists.forEach(function (items) {
          items.forEach(function (it) {
            if (!it || seen[it.id] || !keep(it)) return;
            seen[it.id] = 1;
            out.push(it);
          });
        });
        // Свежие первыми (ближайшие торги).
        out.sort(function (a, b) {
          return new Date(a.auctionDate || 0) - new Date(b.auctionDate || 0);
        });
        if (!out.length) { sec.hidden = true; return; }
        grid.innerHTML = out.slice(0, COUNT).map(card).join("");
      })
      .catch(function () { sec.hidden = true; });
  }

  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 1500 });
  else setTimeout(load, 200);
})();
