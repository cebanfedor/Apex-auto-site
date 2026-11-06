/* Шапка сайта (06.11.2026): меню «Автомобили» (США · Канада · Корея) и поиск с выбором страны.
   Разметка — в каждом HTML (видна без JS и поисковикам), здесь только поведение:
   открытие меню, живые счётчики, куда вести поиск. Классы .navMegaV1 / .hdrSearchV1 — styles.css. */
(function(){
  "use strict";
  var LANG = function(){ return String(window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2); };
  var WORD = {
    ru:{cars:"авто", lots:"лотов", ca:"Канада", caAuc:"Аукционы Канады", usca:"США и Канада", kr:"Корея", none:"не найдено", found:"найдено", byVin:"история по VIN", byLot:"по номеру лота", noKr:"марка не распознана", where:"Где показать результаты"},
    ro:{cars:"auto", lots:"loturi", ca:"Canada", caAuc:"Licitații Canada", usca:"SUA și Canada", kr:"Coreea", none:"nu s-a găsit", found:"găsit", byVin:"istoric după VIN", byLot:"după numărul lotului", noKr:"marca nu a fost recunoscută", where:"Unde afișăm rezultatele"},
    en:{cars:"cars", lots:"lots", ca:"Canada", caAuc:"Canada auctions", usca:"USA & Canada", kr:"Korea", none:"not found", found:"found", byVin:"VIN history", byLot:"by lot number", noKr:"make not recognised", where:"Where to show results"}
  };
  function w(k){ var l = WORD[LANG()] || WORD.ru; return l[k]; }
  function fmt(n){ try{ return Number(n).toLocaleString("ru-RU").replace(/,/g, " "); }catch(e){ return String(n); } }
  function isMobile(){ return window.matchMedia("(max-width: 820px)").matches; }

  // ---------- Меню «Автомобили» ----------
  function initMega(){
    document.querySelectorAll(".navMegaV1").forEach(function(mega){
      var btn = mega.querySelector(".navMegaBtnV1");
      if(!btn || btn._megaInit) return;
      btn._megaInit = true;
      var t;
      function setOpen(on){ mega.classList.toggle("open", on); btn.setAttribute("aria-expanded", on ? "true" : "false"); if(on) loadCounts(); }
      mega.addEventListener("mouseenter", function(){ if(isMobile()) return; clearTimeout(t); t = setTimeout(function(){ setOpen(true); }, 80); });
      mega.addEventListener("mouseleave", function(){ if(isMobile()) return; clearTimeout(t); t = setTimeout(function(){ setOpen(false); }, 180); });
      btn.addEventListener("click", function(e){ e.stopPropagation(); clearTimeout(t); setOpen(!mega.classList.contains("open")); });
      mega.addEventListener("click", function(e){ e.stopPropagation(); });
      mega.querySelectorAll("a").forEach(function(a){ a.addEventListener("click", function(){ setOpen(false); }); });
    });
  }
  document.addEventListener("click", function(){ document.querySelectorAll(".navMegaV1.open").forEach(function(m){ m.classList.remove("open"); var b = m.querySelector(".navMegaBtnV1"); if(b) b.setAttribute("aria-expanded", "false"); }); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") document.querySelectorAll(".navMegaV1.open").forEach(function(m){ m.classList.remove("open"); }); });

  // Счётчики: Корея (Encar) и Канада (OpenLane) — точное число объявлений, аукционы — общее число лотов США и Канады.
  // По одной стране база аукционов даёт только грубую оценку, поэтому разбивку США/Канада для Copart/IAAI не показываем.
  var countsLoaded = false;
  function cacheGet(k){ try{ var v = JSON.parse(sessionStorage.getItem(k) || "null"); if(v && Date.now() - v.t < 30 * 60e3) return v.n; }catch(e){} return null; }
  function cacheSet(k, n){ try{ sessionStorage.setItem(k, JSON.stringify({t:Date.now(), n:n})); }catch(e){} }
  function getJson(url){ return fetch(url, {credentials:"same-origin"}).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }); }
  function paint(){
    var kr = cacheGet("apexMegaKr"), ca = cacheGet("apexMegaCa"), auc = cacheGet("apexMegaAuc");
    document.querySelectorAll('[data-mega-count="kr"]').forEach(function(el){ if(kr) el.textContent = fmt(kr) + " " + w("cars"); });
    document.querySelectorAll('[data-mega-count="ca"]').forEach(function(el){ if(ca) el.textContent = "OpenLane · " + fmt(ca) + " " + w("cars"); });
    document.querySelectorAll('[data-mega-count="auc"]').forEach(function(el){ if(auc) el.textContent = fmt(auc) + " " + w("lots"); });
  }
  function loadCounts(){
    paint();
    if(countsLoaded) return; countsLoaded = true;
    if(!cacheGet("apexMegaKr")) getJson("/api/catalog?action=search&per_page=1").then(function(d){ if(d && d.total > 0){ cacheSet("apexMegaKr", d.total); paint(); } });
    if(!cacheGet("apexMegaCa")) getJson("/api/catalog?src=ca&action=search&per_page=1").then(function(d){ if(d && d.total > 0){ cacheSet("apexMegaCa", d.total); paint(); } });
    if(!cacheGet("apexMegaAuc")) getJson("/api/auctions?action=count").then(function(d){ if(d && d.total > 1000){ cacheSet("apexMegaAuc", d.total); paint(); } });
  }

  // ---------- Поиск в шапке ----------
  // Регионы: all — везде; us — аукционы США; ca — Канада (OpenLane + Copart/IAAI Канада); kr — Корея (Encar).
  var REGION_KEY = "apexHdrRegionV1";
  function defaultRegion(){
    var p = location.pathname;
    if(/^\/(korea|catalog)(\/|$)/.test(p)) return "kr";
    if(/^\/canada(\/|$)/.test(p)) return "ca";
    if(/^\/auctions/.test(p)){ var c = new URLSearchParams(location.search).get("country"); if(c === "CA") return "ca"; return "us"; }
    try{ var s = localStorage.getItem(REGION_KEY); if(s === "all" || s === "us" || s === "ca" || s === "kr") return s; }catch(e){}
    return "all";
  }
  var VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
  var KR_ALIASES = {"хендай":"hyundai","хундай":"hyundai","хюндай":"hyundai","хендэ":"hyundai","киа":"kia","бмв":"bmw","мерседес":"mercedes-benz","мерс":"mercedes-benz","mercedes":"mercedes-benz","генезис":"genesis","тойота":"toyota","ауди":"audi","порше":"porsche","лексус":"lexus","тесла":"tesla","шевроле":"chevrolet","вольво":"volvo","фольксваген":"volkswagen","vw":"volkswagen","ниссан":"nissan","хонда":"honda","форд":"ford","мини":"mini","джип":"jeep","ленд":"land rover","рено":"renault samsung","ссангйонг":"ssangyong","санг":"ssangyong","кадиллак":"cadillac","линкольн":"lincoln","ягуар":"jaguar","пежо":"peugeot","мазерати":"maserati","додж":"dodge","рам":"ram","джмс":"gmc","бьюик":"buick","акура":"acura","инфинити":"infiniti","субару":"subaru","мазда":"mazda","крайслер":"chrysler"};
  function norm(s){ return String(s || "").toLowerCase().replace(/klasse/g, "class").replace(/[\s\-_.]+/g, ""); }
  // Каталоги api.auctionsapi.com: kr — Encar (/korea), ca — OpenLane (/canada)
  var CATS = {kr:{base:"/korea", api:"/api/catalog?", domain:55613}, ca:{base:"/canada", api:"/api/catalog?src=ca&", domain:55835}};
  function catTarget(q, src){ return catResolve(q, src).then(function(r){ return r.url; }); }
  // Куда вести в каталоге и есть ли там что-то: {url, found, count}
  function catResolve(q, src){
    var C = CATS[src] || CATS.kr;
    q = q.trim();
    var miss = {url:C.base, found:false, count:0};
    if(!q) return Promise.resolve({url:C.base, found:true, count:null});
    var byCar = function(d){ return d && d.car && d.car.id ? {url:C.base + "/" + encodeURIComponent(d.car.id), found:true, count:1} : miss; };
    if(VIN_RE.test(q)) return getJson(C.api + "action=vin&vin=" + encodeURIComponent(q)).then(byCar);
    if(/^\d{6,10}$/.test(q)) return src === "ca" ? Promise.resolve(miss) : getJson(C.api + "action=listing&domain_id=" + C.domain + "&listing_id=" + q).then(byCar);
    return getJson(C.api + "action=brands").then(function(d){
      var brands = (d && d.items) || [], low = q.toLowerCase(), words = low.split(/\s+/);
      var alias = KR_ALIASES[words[0]];
      if(alias){ low = (alias + " " + words.slice(1).join(" ")).trim(); }
      // Самая длинная марка, с которой начинается запрос («land rover range rover» → Land Rover)
      var brand = null;
      brands.forEach(function(b){ var n = String(b.name || "").toLowerCase(); if(n && (low === n || low.indexOf(n + " ") === 0) && (!brand || n.length > brand.name.length)) brand = b; });
      if(!brand) return {url:C.base, found:false, count:0, noBrand:true};
      var rest = low.slice(String(brand.name).length).trim();
      var base = C.base + "?brand_id=" + brand.id;
      var withCount = function(url){
        return getJson(C.api + "action=search&per_page=1&" + url.split("?")[1]).then(function(d){
          var n = d && typeof d.total === "number" ? d.total : null;
          return {url:url, found:n === null ? true : n > 0, count:n};
        });
      };
      if(!rest) return withCount(base);
      return getJson(C.api + "action=models&brand_id=" + brand.id).then(function(m){
        var models = (m && m.items) || [], r = norm(rest.replace(/^(\d)\s*(series|серия|seria)$/, "$1er"));
        var hit = models.find(function(x){ return norm(x.name) === r; }) || models.find(function(x){ var n = norm(x.name); return n && (r.indexOf(n) === 0 || n.indexOf(r) === 0); });
        return withCount(hit ? base + "&model_id=" + brand.id + ":" + hit.id : base);
      });
    });
  }
  // Аукционы ищут по названию лота на английском: русскую марку меняем на латинскую
  // («хендай соната» → «hyundai»; остальные русские слова поиск по названию не найдёт — убираем)
  function enQuery(q){
    var words = q.trim().split(/\s+/), alias = KR_ALIASES[words[0].toLowerCase()];
    if(!alias) return q.trim();
    var rest = words.slice(1).filter(function(x){ return !/[а-яё]/i.test(x); });
    return (alias + " " + rest.join(" ")).trim();
  }
  function auctionsTarget(q, region){
    var p = new URLSearchParams();
    q = enQuery(q);
    if(VIN_RE.test(q)) p.set("vin", q.toUpperCase());
    else if(q) p.set("q", q);
    if((region === "us" || region === "ca") && !/^\d{6,10}$/.test(q) && !VIN_RE.test(q)) p.set("country", region === "ca" ? "CA" : "US");
    var lang = LANG(); if(lang !== "ru") p.set("lang", lang);
    return "/auctions?" + p.toString();
  }
  function krLang(url){ return LANG() !== "ru" ? url + (url.indexOf("?") < 0 ? "?" : "&") + "lang=" + LANG() : url; }

  // ---------- «Везде» и «Канада»: список площадок под строкой поиска ----------
  // Везде: аукционы США и Канады (Copart · IAAI) + Канада (OpenLane) + Корея (Encar). Канада: OpenLane + Copart/IAAI Канада.
  // Номер лота / VIN: если в каталогах нет — сразу на аукционы. Текст — список строк с числом найденного.
  function aucCount(q, region){
    var p = new URLSearchParams({action:"search", per_page:"1", tab:"all", auction:"all"});
    if(VIN_RE.test(q)) return Promise.resolve(null);
    if(/^\d{6,10}$/.test(q)) return Promise.resolve(null);
    p.set("name", enQuery(q));
    if(region === "ca") p.set("country", "CA");
    return getJson("/api/auctions?" + p.toString()).then(function(d){ return d && typeof d.total === "number" ? d.total : null; });
  }
  function closeRes(){ document.querySelectorAll(".hdrResV1").forEach(function(el){ el.remove(); }); document.querySelectorAll(".hdrSearchV1.isBusyV1").forEach(function(f){ f.classList.remove("isBusyV1"); }); }
  document.addEventListener("click", function(e){ if(!e.target.closest(".hdrSearchV1")) closeRes(); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape") closeRes(); });
  function flag(i){ var f = document.querySelectorAll(".navMegaCardV1 .navMegaFlagV1")[i]; return f ? f.outerHTML : ""; }
  function row(key, flagHtml, title, sub, url){
    return '<a class="hdrResRowV1" data-res="' + key + '" href="' + url + '">' + flagHtml + '<span><b>' + title + '</b><small>' + sub + '</small></span><em data-res-n>…</em><i aria-hidden="true">→</i></a>';
  }
  function within(pr, ms){ return Promise.race([pr, new Promise(function(r){ setTimeout(function(){ r(undefined); }, ms); })]); }
  function searchMulti(form, q, region){
    q = q.trim();
    if(!q){ location.href = region === "ca" ? "/canada" : auctionsTarget("", "all"); return; }
    var isVin = VIN_RE.test(q), isNum = /^\d{6,10}$/.test(q);
    var aucUrl = auctionsTarget(q, region);
    var cats = region === "ca" ? ["ca"] : ["ca", "kr"];
    var res = {};
    cats.forEach(function(k){ res[k] = catResolve(q, k).catch(function(){ return {url:CATS[k].base, found:false, count:0}; }); });
    var box;
    function openBox(){
      closeRes();
      box = document.createElement("div");
      box.className = "hdrResV1";
      box.setAttribute("role", "menu");
      var aucSub = isVin ? w("byVin") : isNum ? w("byLot") : "Copart · IAAI";
      var aucRow = row("auc", flag(region === "ca" ? 1 : 0), region === "ca" ? w("caAuc") : w("usca"), aucSub, aucUrl);
      var caRow = row("ca", flag(1), w("ca"), "OpenLane", "/canada");
      var krRow = row("kr", flag(2), w("kr"), "Encar", "/korea");
      box.innerHTML = '<p class="hdrResCapV1">' + w("where") + '</p>' + (region === "ca" ? caRow + aucRow : aucRow + caRow + krRow);
      form.appendChild(box);
      if(isVin || isNum) box.querySelector('[data-res="auc"] em').textContent = "";
    }
    function setN(rowEl, n, found){
      var em = rowEl.querySelector("em");
      if(typeof n === "number") em.textContent = n > 0 ? fmt(n) : w("none");
      else em.textContent = found === false ? w("none") : found ? w("found") : "";
      rowEl.classList.toggle("isEmptyV1", n === 0 || found === false);
    }
    function fillAuc(n){
      if(!box || !box.isConnected) return;
      setN(box.querySelector('[data-res="auc"]'), typeof n === "number" ? n : null, typeof n === "number" ? n > 0 : null);
      done();
    }
    function fillCat(k, r){
      if(!box || !box.isConnected) return;
      var el = box.querySelector('[data-res="' + k + '"]');
      if(!el) return;
      if(!r){ el.querySelector("em").textContent = ""; done(); return; }
      el.setAttribute("href", krLang(r.url));
      if(r.noBrand){ el.querySelector("em").textContent = ""; el.querySelector("small").textContent = w("noKr"); el.classList.add("isEmptyV1"); }
      else setN(el, r.count, r.found);
      done();
    }
    function done(){
      if([].some.call(box.querySelectorAll("em"), function(e){ return e.textContent === "…"; })) return;
      form.classList.remove("isBusyV1");
      var first = box.querySelector(".hdrResRowV1:not(.isEmptyV1)");
      if(first && document.activeElement && document.activeElement.closest(".hdrSearchV1")) try{ first.focus({preventScroll:true}); }catch(e){}
    }
    if(isVin || isNum){
      // Сначала смотрим каталоги: нигде нет — это лот/VIN аукционов, ведём сразу
      Promise.all(cats.map(function(k){ return within(res[k], 8000); })).then(function(list){
        if(!list.some(function(r){ return r && r.found; })){ location.href = aucUrl; return; }
        openBox();
        cats.forEach(function(k, i){ fillCat(k, list[i]); });
        if(region !== "ca") ["ca", "kr"].forEach(function(k){ if(cats.indexOf(k) < 0) fillCat(k, null); });
      });
      return;
    }
    openBox();
    // Каждая строка обновляется сама; не пришло число (аукционы 12 с, каталоги 6 с) — остаётся просто ссылкой
    within(aucCount(q, region).catch(function(){ return null; }), 12000).then(fillAuc);
    cats.forEach(function(k){ within(res[k], 6000).then(function(r){ fillCat(k, r || {url:CATS[k].base, count:null, found:null}); }); });
  }
  function initSearch(){
    document.querySelectorAll("[data-hdr-search]").forEach(function(form){
      if(form._init) return; form._init = true;
      var sel = form.querySelector("select"), inp = form.querySelector("input[type=search]");
      if(sel) sel.value = defaultRegion();
      // На телефоне поле узкое — короткая подсказка, чтобы не обрезалась
      if(inp && isMobile()){ var ph = {ru:"Марка, модель или VIN", ro:"Marcă, model sau VIN", en:"Make, model or VIN"}; inp.placeholder = ph[LANG()] || ph.ru; }
      if(inp) inp.addEventListener("input", closeRes);
      form.addEventListener("keydown", function(e){
        if(e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        var rows = [].slice.call(form.querySelectorAll(".hdrResRowV1"));
        if(!rows.length) return;
        e.preventDefault();
        var i = rows.indexOf(document.activeElement);
        i = e.key === "ArrowDown" ? (i + 1) % rows.length : (i <= 0 ? rows.length - 1 : i - 1);
        rows[i].focus();
      });
      if(sel) sel.addEventListener("change", function(){ try{ localStorage.setItem(REGION_KEY, sel.value); }catch(e){} if(inp) inp.focus(); });
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var region = sel ? sel.value : "us", q = inp ? inp.value : "";
        form.classList.add("isBusyV1");
        if(region === "all" || region === "ca"){ searchMulti(form, q, region); return; }
        var go = region === "kr" ? catTarget(q, "kr") : Promise.resolve(auctionsTarget(q, region));
        go.then(function(url){
          location.href = region === "kr" ? krLang(url) : url;
        }).catch(function(){ location.href = region === "kr" ? "/korea" : "/auctions"; });
      });
    });
    // Иконка поиска на телефоне: открыли — сразу фокус в поле
    document.querySelectorAll(".hdrSearchToggleV1").forEach(function(t){
      t.addEventListener("change", function(){ if(t.checked){ var nav = document.getElementById("navToggleV210"); if(nav) nav.checked = false; var i = document.querySelector(".hdrSearchV1 input[type=search]"); if(i) setTimeout(function(){ i.focus(); }, 30); } });
    });
    var navT = document.getElementById("navToggleV210");
    if(navT) navT.addEventListener("change", function(){ if(navT.checked) document.querySelectorAll(".hdrSearchToggleV1").forEach(function(t){ t.checked = false; }); });
  }

  function boot(){
    initMega(); initSearch();
    var idle = window.requestIdleCallback || function(f){ return setTimeout(f, 2500); };
    idle(function(){ paint(); });
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
