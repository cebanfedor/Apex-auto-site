(function(){
  "use strict";

  /* ── Part 1: Admin curated lots (hotLiveSectionV349) ── */
  var liveGrid = document.getElementById("hotLiveGridV349");
  var liveSection = document.getElementById("hotLiveSectionV349");

  if(liveGrid && liveSection){
    function fmtC(n){ return n ? "$" + Math.round(n).toLocaleString("en-US") : ""; }

    function renderCuratedCard(lot){
      var bid = fmtC(lot.currentBid);
      var buyNow = lot.buyNow > 0 ? fmtC(lot.buyNow) : "";
      var badge = lot.auction === "iaai" ? "IAAI" : "Copart";
      var badgeCls = lot.auction === "iaai" ? "hotLiveBadgeIAAIV349" : "hotLiveBadgeCopartV349";
      var imgSrc = lot.image || (lot.images && lot.images[0]) || "";
      var isExt = !lot.detailPath;
      var href = lot.detailPath || lot.lotUrl || "#";
      var extAttr = isExt ? ' target="_blank" rel="noopener"' : "";
      var title = lot.title || "";
      var imgHtml = imgSrc
        ? '<a href="' + href + '"' + extAttr + '><img class="hotLiveImgV349" src="' + imgSrc + '" alt="' + title + '" loading="lazy"></a>'
        : '<div class="hotLiveImgV349 hotLiveImgEmptyV349"></div>';
      var fuel = lot.fuel ? '<span class="hotLiveFuelV349">' + lot.fuel + '</span>' : "";
      var metaHtml = (lot.odometerText || lot.damage)
        ? '<div class="hotLiveDetailsRowV349">'
            + (lot.odometerText ? '<span>' + lot.odometerText + '</span>' : "")
            + (lot.damage ? '<span>' + lot.damage + '</span>' : "")
          + '</div>'
        : "";
      return '<article class="hotLiveCardV349">'
        + imgHtml
        + '<div class="hotLiveBodyV349">'
          + '<div class="hotLiveMetaTopV349">'
            + '<span class="hotLiveBadgeV349 ' + badgeCls + '">' + badge + '</span>'
            + fuel
          + '</div>'
          + '<div class="hotLiveTitleTextV349">' + title + '</div>'
          + '<div class="hotLivePriceRowV349">'
            + '<span class="hotLiveBidLabelV349">Ставка</span>'
            + '<span class="hotLiveBidAmtV349">' + (bid || "—") + '</span>'
            + (buyNow ? '<span class="hotLiveBuyNowV349">BuyNow ' + buyNow + '</span>' : "")
          + '</div>'
          + metaHtml
          + (lot.description ? '<p class="hotLiveDescV349">' + lot.description + '</p>' : "")
          + '<div class="hotLiveActionsV349">'
            + '<a href="' + href + '"' + extAttr + ' class="hotLiveBtnDetailV349">Подробнее</a>'
            + '<a href="/index.html#calculator" class="hotLiveBtnCalcV349">Расчёт</a>'
          + '</div>'
        + '</div>'
      + '</article>';
    }

    function renderCuratedSkels(){
      var out = "";
      for(var i = 0; i < 3; i++){
        out += '<div class="hotLiveCardV349">'
          + '<div class="hotLiveImgV349 hotLiveSkeletonV349"></div>'
          + '<div class="hotLiveBodyV349" style="gap:10px">'
            + '<div style="height:12px;border-radius:5px" class="hotLiveSkeletonV349"></div>'
            + '<div style="height:18px;border-radius:5px" class="hotLiveSkeletonV349"></div>'
            + '<div style="height:14px;width:55%;border-radius:5px" class="hotLiveSkeletonV349"></div>'
            + '<div style="height:11px;border-radius:5px" class="hotLiveSkeletonV349"></div>'
          + '</div>'
        + '</div>';
      }
      return out;
    }

    liveGrid.innerHTML = renderCuratedSkels();
    liveSection.style.display = "";

    fetch("/api/hot-lots")
      .then(function(r){ return r.json(); })
      .then(function(data){
        var items = data.items || [];
        if(!items.length){ liveSection.style.display = "none"; return; }
        liveGrid.innerHTML = items.map(renderCuratedCard).join("");
      })
      .catch(function(){ liveSection.style.display = "none"; });
  }

  /* ── Part 2: Гибриды и электро 2018–2026 ── */
  var apiGrid = document.getElementById("hotApiGridV351");
  if(!apiGrid) return;

  var YEAR_FROM = 2018;
  var SHOW_COUNT = 20;

  /* Fetch a page sorted by price descending — highest bids = most sought-after = better condition */
  function fetchPage(page){
    return fetch(
      "/api/auctions?action=search" +
      "&yearFrom=" + YEAR_FROM +
      "&sort=price_desc" +
      "&per_page=50&page=" + page
    ).then(function(r){ return r.json(); })
     .then(function(d){ return d.items || []; })
     .catch(function(){ return []; });
  }

  /* Classify fuel type, using engine displacement to detect disguised hybrids.
     Pure EVs never have displacement like "2.0L" — cylinders field is unreliable
     (VIN decode can return 4 for BMW i7 even though it has no combustion engine). */
  function classifyFuel(lot){
    var f = (lot.fuel || "").toUpperCase();
    if(f.indexOf("HYBRID") !== -1 || f.indexOf("PLUG") !== -1 || f.indexOf("PHEV") !== -1) return "hybrid";
    if(f.indexOf("ELECTRIC") !== -1){
      /* Only reclassify as hybrid if there's a real engine displacement (e.g. "2.0L") */
      var hasDisplacement = lot.engine && /\d+\.\d/i.test(String(lot.engine));
      return hasDisplacement ? "hybrid" : "electric";
    }
    return "other";
  }

  /* Client-side: is this car hybrid or electric? */
  function isGreenCar(lot){
    var type = classifyFuel(lot);
    return type === "hybrid" || type === "electric";
  }

  /* Damage score: 0 = skip always, 1 = heavy collision, 2 = moderate, 3 = mechanical, 4 = cosmetic only */
  function damageScore(lot){
    var d = (lot.damage || lot.primaryDamage || "").toUpperCase();
    if(/FIRE|FLOOD|BURN|SUBMERGE|ROLLOVER|WATER|ALL OVER/.test(d)) return 0;
    if(/MINOR|NORMAL WEAR|HAIL|PAINT|GLASS|LIGHT|VANDAL|COSMETIC/.test(d)) return 4;
    if(/MECHANICAL|ELECTRICAL/.test(d)) return 3;
    if(/REAR END/.test(d)) return 2;
    if(/FRONT END|SIDE|MAJOR/.test(d)) return 1;
    return 2;
  }

  function shuffle(arr){
    for(var i = arr.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function fuelBadgeHtml(lot){
    var type = classifyFuel(lot);
    if(type === "hybrid") return '<span class="hotApiFuelBadgeV352 hotApiFuelHybV352">ГИБРИД</span>';
    if(type === "electric") return '<span class="hotApiFuelBadgeV352 hotApiFuelElecV352">ЭЛЕКТРО</span>';
    return "";
  }

  function fmtP(n){ return n ? "$" + Math.round(n).toLocaleString("en-US") : ""; }

  function renderCard(lot){
    var img = lot.image || (lot.images && lot.images[0]) || "";
    var auc = lot.auction || "copart";
    var badgeCls = auc === "iaai" ? "hotApiBadgeIAAIV351" : "hotApiBadgeCopartV351";
    var badgeLabel = auc === "iaai" ? "IAAI" : "Copart";
    var href = lot.lot ? "/auctions/" + auc + "-" + lot.lot : "#";
    var bid = fmtP(lot.currentBid);
    var bn  = fmtP(lot.buyNow);
    var priceVal   = bid || bn || "—";
    var priceLabel = (lot.buyNow && !lot.currentBid) ? "Buy Now" : "Цена на аукционе";
    var title = lot.title || "Автомобиль";

    var imgHtml = img
      ? '<img class="hotApiCardImgV351" src="' + img + '" alt="' + title + '" loading="lazy">'
      : '<div class="hotApiCardImgV351 hotApiImgEmptyV351"></div>';

    var specs = [];
    if(lot.odometerText) specs.push({l:"Пробег",  v:lot.odometerText});
    if(lot.fuel)         specs.push({l:"Топливо", v:lot.fuel});
    if(lot.drive)        specs.push({l:"Привод",  v:lot.drive});
    if(lot.transmission) specs.push({l:"Коробка", v:lot.transmission});
    var specsHtml = specs.length
      ? '<ul class="hotApiSpecsV351">'
          + specs.slice(0,4).map(function(s){
              return '<li><span>' + s.l + '</span><b>' + s.v + '</b></li>';
            }).join("")
          + '</ul>'
      : "";

    return '<article class="hotApiCardV351">'
      + '<div class="hotApiImgWrapV351">'
        + imgHtml
        + fuelBadgeHtml(lot)
        + '<span class="hotApiAucBadgeV351 ' + badgeCls + '">' + badgeLabel + '</span>'
      + '</div>'
      + '<div class="hotApiBodyV351">'
        + (lot.body ? '<div class="hotApiCarBodyV351">' + lot.body + '</div>' : '')
        + '<div class="hotApiTitleV351">' + title + '</div>'
        + specsHtml
        + '<div class="hotApiPriceRowV351">'
          + '<span class="hotApiPriceAmtV351">' + priceVal + '</span>'
          + '<span class="hotApiPriceLblV351">'  + priceLabel + '</span>'
        + '</div>'
        + '<div class="hotApiActionsV351">'
          + '<a href="/index.html#calculator" class="hotApiBtn1V351">Рассчитать "под ключ"</a>'
          + '<a href="' + href + '" class="hotApiBtn2V351">Подробнее</a>'
        + '</div>'
      + '</div>'
    + '</article>';
  }

  function renderSkels(n){
    var out = "";
    for(var i = 0; i < n; i++){
      out += '<div class="hotApiCardV351 hotApiSkeletonCardV351">'
        + '<div class="hotApiCardImgV351 hotApiSkelBgV351"></div>'
        + '<div class="hotApiBodyV351" style="gap:10px;padding-top:14px">'
          + '<div class="hotApiSkelLineV351" style="width:38%;height:11px"></div>'
          + '<div class="hotApiSkelLineV351" style="width:82%;height:16px;margin-top:2px"></div>'
          + '<div class="hotApiSkelLineV351" style="width:65%;height:11px;margin-top:4px"></div>'
          + '<div class="hotApiSkelLineV351" style="width:48%;height:24px;margin-top:6px"></div>'
          + '<div class="hotApiSkelLineV351" style="width:100%;height:38px;border-radius:8px;margin-top:4px"></div>'
        + '</div>'
      + '</div>';
    }
    return out;
  }

  /* Show skeletons while loading */
  apiGrid.innerHTML = renderSkels(SHOW_COUNT);

  /* Random start within pages 1-5 (highest-price range = better condition) */
  var startPage = Math.floor(Math.random() * 5) + 1;

  /* Fetch 3 consecutive pages in parallel starting from a random offset */
  Promise.all([fetchPage(startPage), fetchPage(startPage + 1), fetchPage(startPage + 2)]).then(function(pages){
    var all = [];
    pages.forEach(function(items){ all = all.concat(items); });

    /* Deduplicate */
    var seen = {};
    all = all.filter(function(l){
      var k = l.id || l.lot;
      if(!k || seen[k]) return false;
      seen[k] = true;
      return true;
    });

    /* Client-side: only hybrid / electric */
    all = all.filter(isGreenCar);

    /* Year >= 2018 (double-check even if API filtered) */
    all = all.filter(function(l){ return !l.year || l.year >= YEAR_FROM; });

    /* Must have photo */
    all = all.filter(function(l){ return l.image || (l.images && l.images.length); });

    /* Remove catastrophic damage (fire/flood/rollover/all over) */
    all = all.filter(function(l){ return damageScore(l) > 0; });

    /* Only Run & Drive — car starts and moves */
    var runDrive = all.filter(function(l){
      return /run/i.test(l.condition || "");
    });
    /* Fall back to all if too few Run & Drive found */
    if(runDrive.length >= 8) all = runDrive;

    /* Sort by damage score descending */
    all.sort(function(a, b){ return damageScore(b) - damageScore(a); });

    /* Prefer cosmetic/mechanical only (score 3-4): hail, glass, paint, mechanical */
    var goodPool = all.filter(function(l){ return damageScore(l) >= 3; });
    /* Fallback: include moderate collision (score 2) if not enough */
    var pool = goodPool.length >= SHOW_COUNT ? goodPool
             : all.filter(function(l){ return damageScore(l) >= 2; });
    /* Last resort: everything non-zero */
    if(pool.length < 8) pool = all;

    shuffle(pool);
    var rawCount = Math.min(pool.length, SHOW_COUNT);
    var display = pool.slice(0, Math.floor(rawCount / 4) * 4 || rawCount);

    apiGrid.innerHTML = "";

    if(!display.length){
      apiGrid.innerHTML = '<div class="hotApiEmptyV351">Гибриды и электрокары не найдены. Попробуйте позже.</div>';
      return;
    }

    var frag = document.createDocumentFragment();
    display.forEach(function(lot){
      var wrap = document.createElement("div");
      wrap.innerHTML = renderCard(lot);
      frag.appendChild(wrap.firstChild);
    });
    apiGrid.appendChild(frag);

  }).catch(function(){
    apiGrid.innerHTML = '<div class="hotApiEmptyV351">Не удалось загрузить автомобили. Попробуйте позже.</div>';
  });

})();
