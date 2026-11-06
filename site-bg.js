// Живой фон сайта (06.11.2026, Федор: «как на api.auctionsapi.com/catalog, только в наших цветах»).
// Сетка точек на canvas за всем содержимым страницы: по сетке пробегают подсвеченные волны,
// вокруг курсора точки загораются красным и растут, за курсором тянется затухающий след.
// Дёшево: сетка точек рисуется один раз в отдельный слой, каждый кадр дорисовываются только
// активные точки (волна + курсор). Пауза при скрытой вкладке; при «меньше анимации» — статичные точки.
(function(){
  "use strict";
  if(window.__apexBgV1) return; window.__apexBgV1 = true;
  var STEP = 22;                       // шаг сетки, px
  var BASE = "rgba(31,41,55,.16)";     // обычная точка
  var RED = [237, 0, 18];              // фирменный красный
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia && matchMedia("(hover: hover) and (pointer: fine)").matches;

  var cv = document.createElement("canvas");
  cv.className = "siteBgCanvasV1";
  cv.setAttribute("aria-hidden", "true");
  var ctx = cv.getContext("2d");
  if(!ctx) return;
  var base = document.createElement("canvas"), bctx = base.getContext("2d");
  var W = 0, H = 0, dpr = 1, cols = 0, rows = 0, ox = 0, oy = 0;

  // стабильный «случайный» множитель для каждой точки — чтобы волна мерцала неровно
  function hash(i, j){ var h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

  // «Тихие зоны» (06.11.2026, Федор: «текст не читается, точки мешают»): под текстом точки становятся мельче и тусклее,
  // плавно, без подложек и рамок; вокруг фон живой. Под текстом не пропадают совсем (Федор: «по центру пусто — суть теряется»).
  // Какой текст: ЛЮБОЙ, что стоит прямо на фоне страницы (заголовки, ссылки, подписи, крошки), — находим сами: текстовые узлы,
  // у которых ни один предок не закрашен плотным фоном (текст в белых карточках не трогаем — там точек и так не видно).
  // Плюс явные: h1 и элементы с атрибутом data-bg-quiet.
  var QUIET_SEL = "[data-bg-quiet], h1", PAD_EL = 10, PAD_TXT = 7, FEATHER = 48;
  var BASE_FLOOR = 0.45;  // яркость обычной точки под текстом (от обычной)
  var ACT_FLOOR = 0.32;   // яркость волны/подсветки курсора под текстом
  var SIZE_FLOOR = 0.2;   // насколько точка волны «раздувается» под текстом (от обычного)
  var SKIP_TAGS = { SCRIPT:1, STYLE:1, NOSCRIPT:1, TEMPLATE:1, SVG:1, svg:1, CANVAS:1, IFRAME:1, TEXTAREA:1, SELECT:1, OPTION:1 };
  var targets = [], targetsDirty = true, lastScan = 0, range = document.createRange();
  function alphaOf(c){ var m = /rgba?\(([^)]+)\)/.exec(c || ""); if(!m) return c && c !== "transparent" ? 1 : 0; var p = m[1].split(/[ ,\/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; }
  function scanTargets(){
    var memo = new Map();
    function onBg(el){
      if(!el || el === document.body || el === document.documentElement) return true;
      if(memo.has(el)) return memo.get(el);
      var cs = getComputedStyle(el), r;
      if(cs.display === "none" || cs.visibility === "hidden") r = false;
      else if(cs.backgroundImage && cs.backgroundImage !== "none") r = false;
      else if(alphaOf(cs.backgroundColor) >= 0.55) r = false;
      else r = onBg(el.parentElement);
      memo.set(el, r); return r;
    }
    var out = [], seen = new Set();
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: function(n){
      if(!n.nodeValue || !/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      for(var e = n.parentElement; e && e !== document.body; e = e.parentElement) if(SKIP_TAGS[e.tagName]) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    for(var n = w.nextNode(); n; n = w.nextNode()) if(onBg(n.parentElement)) out.push({ t: n });
    var els = document.querySelectorAll(QUIET_SEL);
    for(var i = 0; i < els.length; i++) if(!seen.has(els[i])){ seen.add(els[i]); out.push({ e: els[i] }); }
    targets = out; targetsDirty = false; lastScan = performance.now();
  }
  // маска яркости по точкам сетки: 1 — обычная, 0 — под текстом (дальше подтягивается к *_FLOOR)
  var mask = null, zonesKey = "", lastSY = -1, lastSX = -1, lastRectAt = 0;
  function readZones(force){
    var now = performance.now();
    if(targetsDirty && (!lastScan || now - lastScan > 1500)) scanTargets();
    var sy = window.scrollY, sx = window.scrollX;
    if(!force && sy === lastSY && sx === lastSX && now - lastRectAt < 700) return false;
    lastSY = sy; lastSX = sx; lastRectAt = now;
    var zs = [], key = "";
    for(var i = 0; i < targets.length; i++){
      var tg = targets[i], r, pad;
      if(tg.t){ if(!tg.t.isConnected) continue; range.selectNodeContents(tg.t); r = range.getBoundingClientRect(); pad = PAD_TXT; }
      else { if(!tg.e.isConnected) continue; r = tg.e.getBoundingClientRect(); pad = PAD_EL; }
      if(!r.width || !r.height || r.bottom < -FEATHER || r.top > H + FEATHER || r.right < -FEATHER || r.left > W + FEATHER) continue;
      var z = [r.left - pad, r.top - pad, r.right + pad, r.bottom + pad];
      zs.push(z); key += (z[0] | 0) + "," + (z[1] | 0) + "," + (z[2] | 0) + "," + (z[3] | 0) + ";";
    }
    if(key === zonesKey && mask) return false;
    zonesKey = key;
    var n = cols * rows;
    if(!mask || mask.length !== n) mask = new Float32Array(n);
    mask.fill(1);
    for(var k = 0; k < zs.length; k++){
      var z2 = zs[k];
      var i0 = Math.max(0, Math.floor((z2[0] - FEATHER - ox) / STEP)), i1 = Math.min(cols - 1, Math.ceil((z2[2] + FEATHER - ox) / STEP));
      var j0 = Math.max(0, Math.floor((z2[1] - FEATHER - oy) / STEP)), j1 = Math.min(rows - 1, Math.ceil((z2[3] + FEATHER - oy) / STEP));
      for(var a = i0; a <= i1; a++){
        var x = ox + a * STEP, dx = x < z2[0] ? z2[0] - x : (x > z2[2] ? x - z2[2] : 0);
        for(var b = j0; b <= j1; b++){
          var y = oy + b * STEP, dy = y < z2[1] ? z2[1] - y : (y > z2[3] ? y - z2[3] : 0);
          var d = Math.sqrt(dx * dx + dy * dy);
          if(d >= FEATHER) continue;
          var f = d / FEATHER; f = f * f * (3 - 2 * f);
          var idx = a * rows + b;
          if(f < mask[idx]) mask[idx] = f;
        }
      }
    }
    return true;
  }
  function quietAt(i, j){ return mask ? mask[i * rows + j] : 1; }
  function drawBase(){
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bctx.clearRect(0, 0, W, H);
    bctx.fillStyle = BASE;
    bctx.beginPath();
    var soft = [];
    for(var i = 0; i < cols; i++) for(var j = 0; j < rows; j++){
      var x = ox + i * STEP, y = oy + j * STEP, q = quietAt(i, j);
      q = BASE_FLOOR + (1 - BASE_FLOOR) * q;
      if(q >= 0.98){ bctx.moveTo(x + 1, y); bctx.arc(x, y, 1, 0, 6.2832); }
      else soft.push(x, y, q);
    }
    bctx.fill();
    for(var s = 0; s < soft.length; s += 3){
      bctx.globalAlpha = soft[s + 2];
      bctx.beginPath(); bctx.arc(soft[s], soft[s + 1], 1, 0, 6.2832); bctx.fill();
    }
    bctx.globalAlpha = 1;
  }
  function paintStatic(){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0);
  }

  function resize(){
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = base.width = Math.round(W * dpr);
    cv.height = base.height = Math.round(H * dpr);
    cols = Math.ceil(W / STEP) + 1; rows = Math.ceil(H / STEP) + 1;
    ox = (W - (cols - 1) * STEP) / 2; oy = STEP / 2;
    mask = null; zonesKey = "";
    readZones(true);
    drawBase();
    paintStatic();
  }

  // курсор: точка подсветки догоняет курсор, позади — след из прошлых положений
  var mouse = { x: -9999, y: -9999, tx: -9999, ty: -9999, on: false, power: 0 };
  var trail = [];
  if(fine){
    window.addEventListener("pointermove", function(e){
      if(e.pointerType && e.pointerType !== "mouse") return;
      mouse.tx = e.clientX; mouse.ty = e.clientY;
      if(!mouse.on){ mouse.x = mouse.tx; mouse.y = mouse.ty; mouse.on = true; }
    }, { passive: true });
    document.addEventListener("mouseleave", function(){ mouse.on = false; });
    window.addEventListener("blur", function(){ mouse.on = false; });
  }

  // волны: вертикальные полосы бегут слева направо, новая появляется раз в несколько секунд
  var waves = [];
  function spawnWave(now){ waves.push({ t0: now, speed: 110 + Math.random() * 60, width: 34 + Math.random() * 26, seed: Math.random() * 1000 }); }

  function dot(x, y, a, r){
    ctx.fillStyle = "rgba(" + RED[0] + "," + RED[1] + "," + RED[2] + "," + a.toFixed(3) + ")";
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  var energy; // переиспользуемый буфер интенсивностей активных точек
  var last = 0, nextWave = 0, raf = 0, FRAME = 1000 / 40;
  function frame(now){
    raf = requestAnimationFrame(frame);
    if(now - last < FRAME) return;
    last = now;
    if(now >= nextWave){ spawnWave(now); nextWave = now + 2600 + Math.random() * 2600; }

    // курсор
    mouse.power += ((mouse.on ? 1 : 0) - mouse.power) * 0.08;
    mouse.x += (mouse.tx - mouse.x) * 0.22; mouse.y += (mouse.ty - mouse.y) * 0.22;
    if(mouse.on){ trail.unshift({ x: mouse.x, y: mouse.y }); if(trail.length > 10) trail.length = 10; }
    else if(trail.length) trail.pop();

    if(readZones()) drawBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var n = cols * rows;
    if(!energy || energy.length !== n) energy = new Float32Array(n);
    var touched = [];
    function add(i, j, v){ if(i < 0 || j < 0 || i >= cols || j >= rows || v <= 0.02) return; var k = i * rows + j; if(!energy[k]) touched.push(k); energy[k] = Math.min(1.4, energy[k] + v); }

    // волны
    for(var w = waves.length - 1; w >= 0; w--){
      var wv = waves[w], cx = -80 + (now - wv.t0) / 1000 * wv.speed;
      if(cx - wv.width * 3 > W){ waves.splice(w, 1); continue; }
      var i0 = Math.max(0, Math.floor((cx - wv.width * 2.5 - ox) / STEP)), i1 = Math.min(cols - 1, Math.ceil((cx + wv.width * 2.5 - ox) / STEP));
      for(var i = i0; i <= i1; i++){
        var dx = (ox + i * STEP - cx) / wv.width, g = Math.exp(-dx * dx);
        if(g < 0.05) continue;
        for(var j = 0; j < rows; j++){
          var hr = hash(i + Math.floor(wv.seed), j);
          if(hr < 0.3) continue;                                      // не все точки загораются — неровный «бегущий» столбец
          var tw = 0.55 + 0.45 * Math.sin(now / 380 + hr * 12);
          add(i, j, g * (0.4 + 0.6 * hr) * tw * 0.9);
        }
      }
    }
    // курсор и его след
    if(mouse.power > 0.02 || trail.length){
      var R = 95;
      for(var s = 0; s < trail.length + 1; s++){
        var p = s === 0 ? mouse : trail[s - 1];
        var k0 = s === 0 ? mouse.power : mouse.power * 0.55 * (1 - s / (trail.length + 1));
        if(k0 < 0.03) continue;
        var rr = s === 0 ? R : R * 0.7;
        var ia = Math.max(0, Math.floor((p.x - rr - ox) / STEP)), ib = Math.min(cols - 1, Math.ceil((p.x + rr - ox) / STEP));
        var ja = Math.max(0, Math.floor((p.y - rr - oy) / STEP)), jb = Math.min(rows - 1, Math.ceil((p.y + rr - oy) / STEP));
        for(var a = ia; a <= ib; a++) for(var b = ja; b <= jb; b++){
          var ddx = ox + a * STEP - p.x, ddy = oy + b * STEP - p.y, d = Math.sqrt(ddx * ddx + ddy * ddy);
          if(d > rr) continue;
          var f = 1 - d / rr; f = f * f * (3 - 2 * f);
          add(a, b, f * k0 * (s === 0 ? 1 : 0.6));
        }
      }
    }
    for(var t = 0; t < touched.length; t++){
      var key = touched[t], e = energy[key]; energy[key] = 0;
      var ci = (key / rows) | 0, cj = key - ci * rows;
      var v = Math.min(1, e), dx0 = ox + ci * STEP, dy0 = oy + cj * STEP, qq = quietAt(ci, cj);
      dot(dx0, dy0, (0.15 + 0.7 * v) * (ACT_FLOOR + (1 - ACT_FLOOR) * qq), 1 + 1.7 * v * (SIZE_FLOOR + (1 - SIZE_FLOOR) * qq));
    }
  }

  function start(){
    if(raf || reduce) return;
    last = 0; nextWave = performance.now() + 400;
    raf = requestAnimationFrame(frame);
  }
  function stop(){ if(raf){ cancelAnimationFrame(raf); raf = 0; } }

  function init(){
    document.body.insertBefore(cv, document.body.firstChild);
    try{
      new MutationObserver(function(){ targetsDirty = true; lastRectAt = 0; }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }catch(e){}
    window.addEventListener("load", function(){ targetsDirty = true; lastScan = 0; lastRectAt = 0; });
    resize();
    var rt = 0;
    window.addEventListener("resize", function(){ clearTimeout(rt); rt = setTimeout(resize, 120); });
    document.addEventListener("visibilitychange", function(){ document.hidden ? stop() : start(); });
    if(reduce){
      var st = 0, upd = function(){ st = 0; if(readZones(true)){ drawBase(); paintStatic(); } };
      window.addEventListener("scroll", function(){ if(!st) st = requestAnimationFrame(upd); }, { passive: true });
      setTimeout(upd, 800); setTimeout(upd, 2500);
    }
    start();
  }
  if(document.body) init(); else document.addEventListener("DOMContentLoaded", init);
})();
