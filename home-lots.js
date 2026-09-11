/* Живой блок лотов с аукциона на главной (под калькулятором).
   Лёгкий самостоятельный модуль: не тянет тяжёлый auctions.js, только fetch
   /api/auctions?action=search и компактные карточки (как у DreamBid), чтобы
   человек с телефона сразу видел машины и мог перейти в каталог. Русский текст;
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
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    return mm + "/" + String(d.getFullYear()).slice(2);
  }
  // Состояние → короткий цветной статус (как в карточках «похожих»).
  function condChip(cond) {
    var t = String(cond || "").toLowerCase();
    if (/run|drive|заводится|на ходу/.test(t) && !/non|not|inop|stationary|не на ходу/.test(t))
      return '<i class="homeLotRunV1">На ходу</i>';
    if (/non|not run|inop|stationary|не на ходу|не заводится/.test(t))
      return '<i class="homeLotNoRunV1">Не на ходу</i>';
    return "";
  }
  function specLine(it) {
    var parts = [];
    if (it.engine) parts.push(String(it.engine).replace(/\s+/g, " ").trim());
    if (it.drive) parts.push(String(it.drive).toUpperCase());
    if (it.transmission) parts.push(String(it.transmission).replace(/automatic/i, "AT").replace(/manual/i, "MT"));
    return parts.filter(Boolean).slice(0, 3).join(" • ");
  }
  function price(it) {
    var p = Number(it.currentBid) || Number(it.finalBid) || Number(it.buyNow) || 0;
    return p > 0 ? p : 0;
  }

  function card(it) {
    var title = it.title || [it.year, it.make, it.model].filter(Boolean).join(" ");
    var img = it.image || "";
    var auc = (it.auction || "").toUpperCase();
    var p = price(it);
    var km = kmFromMi(it.odometer);
    var date = shortDate(it.auctionDate || it.saleDate);
    var meta = [condChip(it.condition), km ? "<span>" + esc(km) + "</span>" : "", date ? "<span>" + esc(date) + "</span>" : ""]
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

  function render(items) {
    if (!items || !items.length) {
      sec.hidden = true;
      return;
    }
    grid.innerHTML = items.slice(0, COUNT).map(card).join("");
  }

  function load() {
    skeleton();
    var url = "/api/auctions?action=search&per_page=12&sort=soon";
    fetch(url)
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        var items = (j && j.items) || [];
        // Показываем только с фото — карточка без картинки выглядит бедно.
        items = items.filter(function (x) {
          return x && x.image;
        });
        render(items);
      })
      .catch(function () {
        sec.hidden = true;
      });
  }

  if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 1500 });
  else setTimeout(load, 200);
})();
