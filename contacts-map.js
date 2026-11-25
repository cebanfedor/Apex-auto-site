// Контакты: настоящая карта Кишинёва с анимацией проезда к офису (MapLibre GL + OpenFreeMap, данные © OpenStreetMap).
// Маршрут — реальная геометрия по дорогам (OSRM, от памятника Штефану чел Маре до Bucovina 9F, ≈7,6 км),
// зашита в файл: к роутингу при открытии страницы не обращаемся. Если WebGL/тайлы недоступны — остаётся SVG-схема.
(function(){
  var box = document.getElementById("routeBoxV1");
  var mapEl = document.getElementById("routeMapV1");
  if(!box || !mapEl) return;

  var OFFICE = [28.88589, 47.06835];
  var ROUTE = [[28.83244,47.0246],[28.83362,47.02381],[28.83374,47.02373],[28.83385,47.02365],[28.8341,47.02383],[28.83413,47.02385],[28.8351,47.02453],[28.83587,47.02506],[28.83596,47.02512],[28.83606,47.0252],[28.83691,47.0258],[28.83706,47.02591],[28.8371,47.02593],[28.83807,47.02659],[28.83816,47.02666],[28.83824,47.02671],[28.83926,47.02741],[28.83942,47.02753],[28.83933,47.02759],[28.83834,47.02828],[28.83832,47.02829],[28.8383,47.02831],[28.83829,47.02834],[28.83828,47.02836],[28.83828,47.02839],[28.8383,47.02841],[28.83832,47.02844],[28.83834,47.02846],[28.83845,47.02854],[28.83885,47.02882],[28.83994,47.02955],[28.84023,47.02974],[28.84047,47.02991],[28.84135,47.03051],[28.84186,47.03086],[28.84191,47.0309],[28.84368,47.03209],[28.84383,47.0322],[28.84387,47.03222],[28.84391,47.03225],[28.84395,47.03228],[28.84443,47.0326],[28.84518,47.03311],[28.84521,47.03314],[28.84534,47.03327],[28.84576,47.03372],[28.8458,47.03375],[28.84601,47.03389],[28.84654,47.03425],[28.8473,47.03476],[28.84797,47.03522],[28.8488,47.03578],[28.84902,47.03593],[28.84911,47.03599],[28.84986,47.0365],[28.84989,47.03652],[28.85049,47.03693],[28.85068,47.03706],[28.8516,47.03769],[28.85194,47.03792],[28.8521,47.03803],[28.85261,47.03838],[28.8532,47.03868],[28.85337,47.03876],[28.8536,47.03887],[28.85389,47.03899],[28.85408,47.03908],[28.85482,47.03916],[28.85499,47.03918],[28.85526,47.03919],[28.85558,47.03919],[28.85757,47.03905],[28.8583,47.039],[28.85853,47.03898],[28.85864,47.03898],[28.85875,47.03898],[28.8589,47.03899],[28.85898,47.03902],[28.85905,47.03904],[28.85911,47.03907],[28.85916,47.0391],[28.8592,47.03914],[28.85928,47.03924],[28.85933,47.03935],[28.85939,47.03949],[28.85947,47.03968],[28.85954,47.03985],[28.85958,47.03994],[28.85964,47.04009],[28.85966,47.04015],[28.8597,47.04024],[28.85986,47.04064],[28.8602,47.04146],[28.86045,47.04208],[28.86052,47.04226],[28.86076,47.04286],[28.86085,47.04307],[28.86094,47.04328],[28.86097,47.04335],[28.86111,47.04367],[28.86122,47.04389],[28.86124,47.04395],[28.86132,47.04404],[28.8615,47.04427],[28.86153,47.0443],[28.86155,47.04433],[28.86156,47.04437],[28.86157,47.04445],[28.86157,47.04461],[28.86171,47.04502],[28.86177,47.04515],[28.8619,47.04551],[28.86207,47.04595],[28.86207,47.04615],[28.8624,47.047],[28.86243,47.04708],[28.86263,47.04762],[28.8632,47.0491],[28.86331,47.0494],[28.86337,47.04956],[28.86342,47.0497],[28.8635,47.04991],[28.86367,47.05034],[28.86372,47.05048],[28.86383,47.05077],[28.86386,47.05086],[28.86404,47.05134],[28.86436,47.05219],[28.86457,47.05272],[28.8647,47.05305],[28.86471,47.05309],[28.86491,47.0536],[28.86493,47.05367],[28.8654,47.05487],[28.86549,47.05512],[28.86553,47.05522],[28.86557,47.05532],[28.86564,47.05551],[28.86584,47.05603],[28.86585,47.05606],[28.86645,47.05761],[28.86649,47.05773],[28.86664,47.05794],[28.86669,47.05799],[28.86675,47.05804],[28.86687,47.05814],[28.86722,47.05842],[28.86753,47.05867],[28.8676,47.05874],[28.86767,47.05885],[28.86774,47.05894],[28.86782,47.05902],[28.86789,47.05907],[28.86801,47.05915],[28.86814,47.05923],[28.86825,47.05922],[28.86837,47.05923],[28.86848,47.05924],[28.86897,47.05932],[28.87042,47.05954],[28.87217,47.0598],[28.87283,47.0599],[28.87305,47.05993],[28.87328,47.05995],[28.87342,47.05996],[28.87341,47.06007],[28.8734,47.06028],[28.87335,47.06089],[28.87334,47.06096],[28.87329,47.06168],[28.87328,47.06173],[28.87328,47.06183],[28.87321,47.06266],[28.87321,47.0627],[28.87322,47.06275],[28.87323,47.06279],[28.87326,47.06287],[28.87323,47.06301],[28.8732,47.06305],[28.87315,47.0631],[28.87309,47.06314],[28.87301,47.06317],[28.87287,47.0632],[28.87289,47.06328],[28.87317,47.06408],[28.87334,47.06451],[28.87359,47.06514],[28.87377,47.06562],[28.87392,47.06605],[28.87446,47.06748],[28.87447,47.0675],[28.87475,47.06821],[28.8748,47.0683],[28.87485,47.06839],[28.87486,47.06849],[28.87489,47.06864],[28.87639,47.06857],[28.87731,47.06853],[28.87781,47.06851],[28.87793,47.06851],[28.878,47.06851],[28.87827,47.06849],[28.8784,47.06849],[28.87848,47.06849],[28.87855,47.06849],[28.87992,47.06842],[28.87998,47.06842],[28.88053,47.0684],[28.88075,47.06839],[28.88084,47.06839],[28.88115,47.06837],[28.88164,47.06835],[28.8818,47.06835],[28.8821,47.06834],[28.88235,47.06833],[28.88248,47.06832],[28.88301,47.0683],[28.88395,47.06826],[28.88502,47.06821],[28.88587,47.06818],[28.88589,47.06835]];
  var STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var lang = (window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2);
  var COOP = {
    ru: {"CooperativeGesturesHandler.WindowsHelpText": "Ctrl + колесо — масштаб", "CooperativeGesturesHandler.MacHelpText": "⌘ + колесо — масштаб", "CooperativeGesturesHandler.MobileHelpText": "Двумя пальцами — двигать карту"},
    ro: {"CooperativeGesturesHandler.WindowsHelpText": "Ctrl + rotița mouse-ului pentru zoom", "CooperativeGesturesHandler.MacHelpText": "⌘ + rotița mouse-ului pentru zoom", "CooperativeGesturesHandler.MobileHelpText": "Folosește două degete pentru a muta harta"},
    en: {"CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll to zoom", "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll to zoom", "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to move the map"}
  }[lang] || null;

  // ---- геометрия маршрута ----
  var R = Math.PI / 180;
  function dist(a, b){ // метры, equirectangular — для 7 км достаточно
    var x = (b[0] - a[0]) * Math.cos((a[1] + b[1]) / 2 * R) * 111320, y = (b[1] - a[1]) * 110540;
    return Math.sqrt(x * x + y * y);
  }
  var cum = [0];
  for(var i = 1; i < ROUTE.length; i++) cum.push(cum[i - 1] + dist(ROUTE[i - 1], ROUTE[i]));
  var TOTAL = cum[cum.length - 1];
  function at(d){ // точка на расстоянии d от старта
    d = Math.max(0, Math.min(TOTAL, d));
    var lo = 0, hi = cum.length - 1;
    while(hi - lo > 1){ var m = (lo + hi) >> 1; if(cum[m] <= d) lo = m; else hi = m; }
    var seg = cum[hi] - cum[lo] || 1, t = (d - cum[lo]) / seg;
    return {p: [ROUTE[lo][0] + (ROUTE[hi][0] - ROUTE[lo][0]) * t, ROUTE[lo][1] + (ROUTE[hi][1] - ROUTE[lo][1]) * t], i: lo};
  }
  function slice(d){ var a = at(d), out = ROUTE.slice(0, a.i + 1); out.push(a.p); return out; }
  function bearing(a, b){
    var y = Math.sin((b[0] - a[0]) * R) * Math.cos(b[1] * R);
    var x = Math.cos(a[1] * R) * Math.sin(b[1] * R) - Math.sin(a[1] * R) * Math.cos(b[1] * R) * Math.cos((b[0] - a[0]) * R);
    return (Math.atan2(y, x) / R + 360) % 360;
  }
  function angDiff(a, b){ var d = ((b - a + 540) % 360) - 180; return d; }
  function ease(t){ return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function line(coords){ return {type: "Feature", properties: {}, geometry: {type: "LineString", coordinates: coords}}; }

  // ---- состояние ----
  var map = null, ready = false, visible = false, started = false, done = false, taken = false;
  var t0 = 0, elapsed = 0, lastTs = 0, raf = 0, bear = 0;
  var DUR_INTRO = 2200, DUR_DRIVE = 13500, DUR_OUTRO = 3200;   // мс
  var carEl, startEl, pinEl, replayEl, carMarker;

  function mk(cls, html){ var d = document.createElement("div"); d.className = cls; if(html) d.innerHTML = html; return d; }

  function load(cb){
    if(window.maplibregl) return cb();
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/vendor/maplibre/maplibre-gl.css?v=4.7.1"; document.head.appendChild(l);
    var s = document.createElement("script"); s.src = "/vendor/maplibre/maplibre-gl.js?v=4.7.1"; s.onload = cb; s.onerror = function(){ /* остаётся SVG-схема */ };
    document.head.appendChild(s);
  }

  function build(){
    var center = [28.855, 47.047];
    try{
      map = new maplibregl.Map({
        container: mapEl, style: STYLE_URL, center: center, zoom: 11.6, pitch: 0, bearing: 0,
        attributionControl: false, fadeDuration: 150, maxPitch: 70, locale: COOP || undefined,
        cooperativeGestures: true, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        renderWorldCopies: false, trackResize: true
      });
    }catch(e){ return; }
    map.addControl(new maplibregl.AttributionControl({compact: true, customAttribution: "OpenFreeMap · © OpenMapTiles"}), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({showCompass: false}), "top-right");
    var failed = false;
    map.on("error", function(ev){ if(!ready && ev && ev.error && !failed){ failed = true; try{ map.remove(); }catch(e){} box.classList.remove("hasMapV1"); } });
    map.on("load", function(){
      ready = true;
      try{ decorate(); }catch(e){}
      var at0 = box.querySelector(".maplibregl-ctrl-attrib"); if(at0){ at0.classList.remove("maplibregl-compact-show"); at0.removeAttribute("open"); }
      box.classList.add("hasMapV1");
      // маркеры
      startEl = mk("rmStartV1", '<i></i><b>Центр города</b>');
      carEl = mk("rmCarV1", '<svg viewBox="-9 -9 18 18" width="30" height="30"><circle r="8.4" fill="#16181d" stroke="#fff" stroke-width="2"/><path d="M-4 2.4v-3.2l1.8-2.4h4.4l1.8 2.4v3.2z" fill="#fff"/><circle cx="-2.2" cy="3" r="1.3" fill="#fff"/><circle cx="2.2" cy="3" r="1.3" fill="#fff"/></svg>');
      pinEl = mk("rmPinV1", '<span class="rmPulse"></span><span class="rmPulse rmPulse2"></span><svg viewBox="0 0 36 46" width="36" height="46"><path d="M18 45C9 33 1.5 26 1.5 17a16.5 16.5 0 0 1 33 0C34.5 26 27 33 18 45z" fill="#ed0012" stroke="#fff" stroke-width="2.5"/><circle cx="18" cy="17" r="6.2" fill="#fff"/></svg><div class="rmTagV1"><strong>Apex Auto</strong><small>Bucovina 9F</small></div>');
      new maplibregl.Marker({element: startEl, anchor: "left", offset: [-9, 0]}).setLngLat(ROUTE[0]).addTo(map);
      new maplibregl.Marker({element: pinEl, anchor: "bottom"}).setLngLat(OFFICE).addTo(map);
      carMarker = new maplibregl.Marker({element: carEl}).setLngLat(ROUTE[0]).addTo(map);
      pinEl.style.opacity = "0"; carEl.style.opacity = "0";
      replayEl = document.createElement("button"); replayEl.type = "button"; replayEl.className = "rmReplayV1"; replayEl.hidden = true;
      replayEl.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg><span>Повторить проезд</span>';
      replayEl.addEventListener("click", function(){ replayEl.hidden = true; play(); });
      box.appendChild(replayEl);
      // пользователь взял карту — прекращаем автопилот
      ["dragstart", "zoomstart", "pitchstart"].forEach(function(n){
        map.on(n, function(ev){ if(started && !done && ev && ev.originalEvent) takeover(); });
      });
      if(reduce){ finishStatic(); }
      else{ showOverview(); if(visible) play(); }
    });
  }

  function decorate(){
    // 3D-здания поверх плоской «Positron» + маршрут тремя слоями
    var layers = map.getStyle().layers, firstLabel = null;
    for(var i = 0; i < layers.length; i++){ if(layers[i].type === "symbol"){ firstLabel = layers[i].id; break; } }
    map.addLayer({id: "bld3d", type: "fill-extrusion", source: "openmaptiles", "source-layer": "building", minzoom: 14,
      paint: {"fill-extrusion-color": "#dfe3ea", "fill-extrusion-opacity": .85,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.4, ["coalesce", ["get", "render_height"], 8]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0]}}, firstLabel || undefined);
    map.addSource("route", {type: "geojson", data: line(ROUTE)});
    map.addSource("routeDone", {type: "geojson", data: line([ROUTE[0], ROUTE[0]])});
    var lp = {"line-cap": "round", "line-join": "round"};
    map.addLayer({id: "routeGhost", type: "line", source: "route", layout: lp, paint: {"line-color": "#ed0012", "line-opacity": .28, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 3, 16, 9]}}, firstLabel || undefined);
    map.addLayer({id: "routeCase", type: "line", source: "routeDone", layout: lp, paint: {"line-color": "#fff", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 7, 16, 16]}}, firstLabel || undefined);
    map.addLayer({id: "routeLine", type: "line", source: "routeDone", layout: lp, paint: {"line-color": "#ed0012", "line-width": ["interpolate", ["linear"], ["zoom"], 11, 4, 16, 10]}}, firstLabel || undefined);
  }

  function setProgress(d){ var s = map.getSource("routeDone"); if(s) s.setData(line(slice(d))); }
  function showOverview(){
    var b = new maplibregl.LngLatBounds(); ROUTE.forEach(function(p){ b.extend(p); });
    var narrow = box.clientWidth < 520;
    map.fitBounds(b, {padding: narrow ? {top: 70, bottom: 80, left: 36, right: 36} : {top: 60, bottom: 70, left: 70, right: 70}, duration: 0, pitch: 0, bearing: 0});
    startEl.style.opacity = "1";
  }
  function finishStatic(){ // без анимации: вся трасса и пин
    showOverview(); setProgress(TOTAL); pinEl.style.opacity = "1"; pinEl.classList.add("isOnV1"); done = true;
  }
  function takeover(){
    taken = true; done = true; cancelAnimationFrame(raf);
    setProgress(TOTAL); carEl.style.opacity = "0"; pinEl.style.opacity = "1"; pinEl.classList.add("isOnV1");
    replayEl.hidden = false;
  }

  var overviewCam = null;
  function frame(ts){
    if(!started || done) return;
    if(!lastTs) lastTs = ts;
    var dt = Math.min(250, ts - lastTs); lastTs = ts;   // реальное время; длинный шаг (вкладка висела) не «прыгает» дальше 0,25 с
    if(visible) elapsed += dt;
    var e = elapsed;
    if(e < DUR_INTRO){
      // короткая пауза на общем плане: линия-призрак, старт
      var k = ease(e / DUR_INTRO);
      carEl.style.opacity = String(k);
      raf = requestAnimationFrame(frame); return;
    }
    var t = (e - DUR_INTRO) / DUR_DRIVE;
    if(t < 1){
      var s = ease(t);                       // старт и финиш плавнее
      var d = TOTAL * s;
      var car = at(d);
      setProgress(d);
      carEl.style.opacity = "1";
      moveCar(car.p);
      // камера: зум и наклон плавно набираются, смотрим вперёд по ходу
      var look = at(Math.min(TOTAL, d + 260)).p;
      var tb = bearing(car.p, look);
      var k2 = Math.min(1, (e - DUR_INTRO) / 2600);
      bear += angDiff(bear, tb) * Math.min(1, dt / 420) * (k2 > 0 ? 1 : 0);
      var ahead = at(Math.min(TOTAL, d + 90)).p;   // камера чуть впереди машины
      var zoomT = 15.3 - 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.0)); // лёгкое «дыхание»
      var kz = ease(Math.min(1, (e - DUR_INTRO) / 2200));
      var from = overviewCam;
      map.jumpTo({center: [from.center[0] + (ahead[0] - from.center[0]) * kz, from.center[1] + (ahead[1] - from.center[1]) * kz],
        zoom: from.zoom + (zoomT - from.zoom) * kz, pitch: 58 * kz, bearing: from.bearing + angDiff(from.bearing, bear) * kz});
      raf = requestAnimationFrame(frame); return;
    }
    // финал: подъезд к офису, камера снижается и поворачивается к метке
    var o = Math.min(1, (e - DUR_INTRO - DUR_DRIVE) / DUR_OUTRO);
    if(!pinEl.classList.contains("isOnV1")){ pinEl.style.opacity = "1"; pinEl.classList.add("isOnV1"); }
    setProgress(TOTAL); moveCar(OFFICE); carEl.style.opacity = String(1 - Math.min(1, o * 3));
    if(o < 1){
      var k3 = ease(o);
      map.jumpTo({center: OFFICE, zoom: 14.7 + 1.7 * k3, pitch: 58 - 8 * k3});
      raf = requestAnimationFrame(frame); return;
    }
    done = true; replayEl.hidden = false;
  }
  function moveCar(p){ carMarker.setLngLat(p); }

  function play(){
    if(!ready || reduce) return;
    cancelAnimationFrame(raf);
    started = true; done = false; taken = false; elapsed = 0; lastTs = 0;
    pinEl.style.opacity = "0"; pinEl.classList.remove("isOnV1"); carEl.style.opacity = "0";
    setProgress(0);
    map.stop(); showOverview();
    var c = map.getCenter(); overviewCam = {center: [c.lng, c.lat], zoom: map.getZoom(), bearing: 0};
    bear = bearing(ROUTE[0], at(300).p);
    moveCar(ROUTE[0]);
    raf = requestAnimationFrame(frame);
  }

  // ---- ленивый запуск ----
  if(!("IntersectionObserver" in window)) return;
  var loaded = false;
  var pre = new IntersectionObserver(function(l){
    if(l[0].isIntersecting && !loaded){ loaded = true; pre.disconnect(); load(build); }
  }, {rootMargin: "400px 0px"});
  pre.observe(box);
  var vis = new IntersectionObserver(function(l){
    visible = l[0].isIntersecting && l[0].intersectionRatio >= .35;
    if(visible && ready && !started && !reduce) play();
  }, {threshold: [0, .35, .6]});
  vis.observe(box);
})();
