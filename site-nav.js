/* Шапка сайта (06.11.2026): меню «Автомобили» (США · Канада · Корея) и поиск с выбором страны.
   Разметка — в каждом HTML (видна без JS и поисковикам), здесь только поведение:
   открытие меню, живые счётчики, куда вести поиск. Классы .navMegaV1 / .hdrSearchV1 — styles.css. */
(function(){
  "use strict";
  var LANG = function(){ return String(window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2); };
  var WORD = {ru:{cars:"авто", lots:"лотов"}, ro:{cars:"auto", lots:"loturi"}, en:{cars:"cars", lots:"lots"}};
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

  // Счётчики: Корея — точное число объявлений Encar, аукционы — общее число лотов США и Канады.
  // По одной стране база даёт только грубую оценку, поэтому разбивку США/Канада не показываем.
  var countsLoaded = false;
  function cacheGet(k){ try{ var v = JSON.parse(sessionStorage.getItem(k) || "null"); if(v && Date.now() - v.t < 30 * 60e3) return v.n; }catch(e){} return null; }
  function cacheSet(k, n){ try{ sessionStorage.setItem(k, JSON.stringify({t:Date.now(), n:n})); }catch(e){} }
  function getJson(url){ return fetch(url, {credentials:"same-origin"}).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; }); }
  function paint(){
    var kr = cacheGet("apexMegaKr"), auc = cacheGet("apexMegaAuc");
    document.querySelectorAll('[data-mega-count="kr"]').forEach(function(el){ if(kr) el.textContent = fmt(kr) + " " + w("cars"); });
    document.querySelectorAll('[data-mega-count="auc"]').forEach(function(el){ if(auc) el.textContent = fmt(auc) + " " + w("lots"); });
  }
  function loadCounts(){
    paint();
    if(countsLoaded) return; countsLoaded = true;
    if(!cacheGet("apexMegaKr")) getJson("/api/catalog?action=search&per_page=1").then(function(d){ if(d && d.total > 0){ cacheSet("apexMegaKr", d.total); paint(); } });
    if(!cacheGet("apexMegaAuc")) getJson("/api/auctions?action=count").then(function(d){ if(d && d.total > 1000){ cacheSet("apexMegaAuc", d.total); paint(); } });
  }

  // ---------- Поиск в шапке ----------
  var REGION_KEY = "apexHdrRegionV1";
  function defaultRegion(){
    var p = location.pathname;
    if(/^\/(korea|catalog)(\/|$)/.test(p)) return "kr";
    if(/^\/auctions/.test(p)){ var c = new URLSearchParams(location.search).get("country"); if(c === "CA") return "ca"; return "us"; }
    try{ var s = localStorage.getItem(REGION_KEY); if(s === "us" || s === "ca" || s === "kr") return s; }catch(e){}
    return "us";
  }
  var VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;
  var KR_ALIASES = {"хендай":"hyundai","хундай":"hyundai","хюндай":"hyundai","хендэ":"hyundai","киа":"kia","бмв":"bmw","мерседес":"mercedes-benz","мерс":"mercedes-benz","mercedes":"mercedes-benz","генезис":"genesis","тойота":"toyota","ауди":"audi","порше":"porsche","лексус":"lexus","тесла":"tesla","шевроле":"chevrolet","вольво":"volvo","фольксваген":"volkswagen","vw":"volkswagen","ниссан":"nissan","хонда":"honda","форд":"ford","мини":"mini","джип":"jeep","ленд":"land rover","рено":"renault samsung","ссангйонг":"ssangyong","санг":"ssangyong","кадиллак":"cadillac","линкольн":"lincoln","ягуар":"jaguar","пежо":"peugeot","мазерати":"maserati"};
  function norm(s){ return String(s || "").toLowerCase().replace(/klasse/g, "class").replace(/[\s\-_.]+/g, ""); }
  function koreaTarget(q){
    q = q.trim();
    if(!q) return Promise.resolve("/korea");
    if(VIN_RE.test(q)) return getJson("/api/catalog?action=vin&vin=" + encodeURIComponent(q)).then(function(d){ return d && d.car && d.car.id ? "/korea/" + encodeURIComponent(d.car.id) : "/korea"; });
    if(/^\d{6,10}$/.test(q)) return getJson("/api/catalog?action=listing&domain_id=55613&listing_id=" + q).then(function(d){ return d && d.car && d.car.id ? "/korea/" + encodeURIComponent(d.car.id) : "/korea"; });
    return getJson("/api/catalog?action=brands").then(function(d){
      var brands = (d && d.items) || [], low = q.toLowerCase(), words = low.split(/\s+/);
      var alias = KR_ALIASES[words[0]];
      if(alias){ low = (alias + " " + words.slice(1).join(" ")).trim(); }
      // Самая длинная марка, с которой начинается запрос («land rover range rover» → Land Rover)
      var brand = null;
      brands.forEach(function(b){ var n = String(b.name || "").toLowerCase(); if(n && (low === n || low.indexOf(n + " ") === 0) && (!brand || n.length > brand.name.length)) brand = b; });
      if(!brand) return "/korea";
      var rest = low.slice(String(brand.name).length).trim();
      var base = "/korea?brand_id=" + brand.id;
      if(!rest) return base;
      return getJson("/api/catalog?action=models&brand_id=" + brand.id).then(function(m){
        var models = (m && m.items) || [], r = norm(rest.replace(/^(\d)\s*(series|серия|seria)$/, "$1er"));
        var hit = models.find(function(x){ return norm(x.name) === r; }) || models.find(function(x){ var n = norm(x.name); return n && (r.indexOf(n) === 0 || n.indexOf(r) === 0); });
        return hit ? base + "&model_id=" + brand.id + ":" + hit.id : base;
      });
    });
  }
  function auctionsTarget(q, region){
    var p = new URLSearchParams();
    q = q.trim();
    if(VIN_RE.test(q)) p.set("vin", q.toUpperCase());
    else if(q) p.set("q", q);
    if(!/^\d{6,10}$/.test(q) && !VIN_RE.test(q)) p.set("country", region === "ca" ? "CA" : "US");
    var lang = LANG(); if(lang !== "ru") p.set("lang", lang);
    return "/auctions?" + p.toString();
  }
  function initSearch(){
    document.querySelectorAll("[data-hdr-search]").forEach(function(form){
      if(form._init) return; form._init = true;
      var sel = form.querySelector("select"), inp = form.querySelector("input[type=search]");
      if(sel) sel.value = defaultRegion();
      // На телефоне поле узкое — короткая подсказка, чтобы не обрезалась
      if(inp && isMobile()){ var ph = {ru:"Марка, модель или VIN", ro:"Marcă, model sau VIN", en:"Make, model or VIN"}; inp.placeholder = ph[LANG()] || ph.ru; }
      if(sel) sel.addEventListener("change", function(){ try{ localStorage.setItem(REGION_KEY, sel.value); }catch(e){} if(inp) inp.focus(); });
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var region = sel ? sel.value : "us", q = inp ? inp.value : "";
        form.classList.add("isBusyV1");
        var go = region === "kr" ? koreaTarget(q) : Promise.resolve(auctionsTarget(q, region));
        go.then(function(url){
          if(region === "kr" && LANG() !== "ru") url += (url.indexOf("?") < 0 ? "?" : "&") + "lang=" + LANG();
          location.href = url;
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
