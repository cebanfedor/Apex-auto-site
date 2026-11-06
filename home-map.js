/* Главная: карта мира за текстом hero (06.11.2026, Федор: «карта мира с точками, еле видна, стрелки в Молдову»).
   Тонкая точечная суша (шаг 2°, береговые контуры — свои, упрощённые, закодированы строкой ROWS: ряд = широта, «старт.длина» = отрезки точек)
   + дуги из США, Канады, Кореи и Европы в Кишинёв: по каждой дуге едет «машина» со шлейфом, на конце — стрелка, у Кишинёва красный пульс.
   Рисуется на canvas внутри плашки hero (позади текста и карточки поиска), на телефоне скрыта. Пауза, когда плашка не на экране или вкладка скрыта;
   при «уменьшить движение» — одна статичная картинка. Подписей нет → переводить нечего. */
(function(){
  "use strict";
  var panel = document.querySelector(".heroCalmGridV1");
  var cv = document.getElementById("heroMapV1");
  if(!panel || !cv || !cv.getContext) return;
  var ctx = cv.getContext("2d");

  // --- суша: ряды от 79°N вниз с шагом 2°, колонки от -169° с шагом 2° ---
  var ROWS = "39.10,50.26,91.7;32.5,40.2,50.26,92.2,135.3;29.9,56.19,114.2,130.11;41.4,57.18,112.2,127.18;7.1,24.3,41.6,57.17,111.2,119.2,123.39;3.22,27.7,37.3,43.8,58.14,94.8,114.8,123.52;2.51,58.11,92.13,107.71;1.52,59.7,73.5,91.5,97.5,106.73;2.37,50.3,60.4,89.5,96.78;2.36,46.4,61.3,88.6,96.75;4.5,16.22,46.7,88.6,97.59,164.3;5.2,18.20,46.8,82.2,89.1,91.2,96.59,163.3;19.25,46.9,81.1,83.1,89.1,95.59,163.3;21.35,80.2,83.3,87.68,156.1,163.2;21.35,82.3,86.69,156.1;23.29,56.2,84.71,156.1;23.31,58.1,84.70;23.30,84.7,92.8,101.2,104.4,112.42;23.27,80.7,90.2,94.5,105.4,111.41,155.2;23.26,80.5,92.2,95.9,105.5,112.38,155.1;23.25,80.5,93.1,95.1,98.11,112.32,147.2,155.1;24.23,82.2,89.1,92.1,96.1,99.11,111.35,148.2,153.2;25.22,82.8,103.42,148.1,151.4;26.19,81.9,103.42,150.1;27.18,80.13,95.4,100.46;29.8,43.2,79.30,110.36;28.1,30.6,44.1,78.24,103.7,111.34;29.1,31.5,77.25,104.6,118.26;32.4,77.26,104.11,120.23,145.1;32.4,40.1,45.2,77.26,105.9,120.8,131.8;33.4,39.2,48.2,77.27,105.9,121.6,132.6,139.1;35.6,77.27,106.6,122.4,132.6,145.1;38.5,76.29,106.4,122.3,134.5,145.1;41.2,77.29,107.1,122.3,134.6;42.1,47.3,77.30,108.3,123.2,134.1,137.2;43.12,78.32,123.1,134.1,147.1;46.10,79.30,125.1,135.1,147.1;46.13,81.1,84.1,88.21,135.1,143.1;46.14,90.18,133.2,136.1,141.3;45.15,90.17,134.2,139.5;45.16,90.16,135.2,140.3,145.1;45.20,90.15,135.3,141.2,144.2,151.1,153.3;44.23,91.14,137.1,153.5;45.23,91.14,138.3,154.5;46.21,92.13,155.1,157.2;46.21,92.13;47.19,92.13,109.1,150.3,156.1;47.19,91.14,109.1,147.6,156.2;49.16,91.13,107.3,146.8,155.3;50.15,91.12,107.3,145.13;50.15,92.11,107.2,143.16;50.13,92.11,107.2,142.18;50.11,92.10,107.1,142.19;50.11,93.8,142.20;49.11,93.8,142.20;49.10,94.6,142.19;49.10,94.5,142.5,152.9;49.7,154.6;48.8,155.5,172.1;48.6,172.2;48.6,158.1,171.2;48.5,158.1,170.2;48.4,169.2;47.5;47.4;48.2;49.2;;";
  var STEP = 2, LON0 = -169, LAT0 = 79;
  var land = [];
  ROWS.split(";").forEach(function(row, r){
    if(!row) return;
    row.split(",").forEach(function(run){
      var p = run.split("."), a = +p[0], n = +p[1];
      for(var c = a; c < a + n; c++) land.push([LON0 + c * STEP, LAT0 - r * STEP]);
    });
  });
  var LON_MIN = -170, LON_SPAN = 361, LAT_MAX = 80, LAT_SPAN = 136;

  // --- маршруты: откуда → Кишинёв (lon, lat) ---
  var DEST = [28.9, 47.0];
  var ROUTES = [
    {from:[-118.2, 34.0]},   // США, Калифорния
    {from:[-95.4, 29.7]},    // США, Техас
    {from:[-74.0, 40.7]},    // США, Нью-Джерси
    {from:[-73.6, 45.5]},    // Канада, Монреаль
    {from:[8.7, 50.1]},      // Европа, Германия
    {from:[126.7, 37.5]}     // Корея, Инчхон
  ];

  var RED = "237,0,18", INK = "20,24,31";
  var dpr = 1, W = 0, H = 0, S = 1, OX = 0, OY = 0;
  var stat = document.createElement("canvas");
  var arcs = [];
  var raf = 0, running = false, visible = true, last = 0;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function proj(lon, lat){ return [OX + (lon - LON_MIN) * S, OY + (LAT_MAX - lat) * S]; }

  function layout(){
    if(!panel.clientWidth || getComputedStyle(cv).display === "none"){ stop(); W = 0; return false; }
    var pr = panel.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(pr.width); H = Math.round(pr.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    stat.width = cv.width; stat.height = cv.height;
    // область карты: вся плашка (карточка поиска лежит поверх и слегка матовая — Азия/Корея просвечивают под ней)
    var bx0 = 10, bx1 = W - 10, by0 = 8, by1 = H - 8;
    var bw = bx1 - bx0, bh = by1 - by0;
    S = Math.min(bw / LON_SPAN, bh / LAT_SPAN);
    OX = bx0 + (bw - LON_SPAN * S) / 2;
    OY = by0 + (bh - LAT_SPAN * S) / 2;
    // статичный слой: точки суши
    var sc = stat.getContext("2d");
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);
    sc.clearRect(0, 0, W, H);
    var step = STEP * S, r = Math.max(0.7, step * 0.2);
    sc.fillStyle = "rgba(" + INK + ",0.22)";
    sc.beginPath();
    for(var i = 0; i < land.length; i++){
      var p = proj(land[i][0], land[i][1]);
      sc.moveTo(p[0] + r, p[1]); sc.arc(p[0], p[1], r, 0, 6.2832);
    }
    sc.fill();
    // дуги
    var d = proj(DEST[0], DEST[1]);
    arcs = ROUTES.map(function(rt, k){
      var o = proj(rt.from[0], rt.from[1]);
      var dx = d[0] - o[0], dy = d[1] - o[1], dist = Math.sqrt(dx * dx + dy * dy);
      var mx = (o[0] + d[0]) / 2, my = (o[1] + d[1]) / 2;
      var h = Math.max(10, Math.min(dist * 0.24, my - by0 - 6));
      return {o:o, d:d, cx:mx, cy:my - 2 * h, dist:dist, dur:2600 + dist * 7.5, phase:k * 1100};
    });
    return true;
  }

  function pt(a, t){
    var u = 1 - t;
    return [u * u * a.o[0] + 2 * u * t * a.cx + t * t * a.d[0], u * u * a.o[1] + 2 * u * t * a.cy + t * t * a.d[1]];
  }
  function tan(a, t){
    var u = 1 - t;
    return [2 * u * (a.cx - a.o[0]) + 2 * t * (a.d[0] - a.cx), 2 * u * (a.cy - a.o[1]) + 2 * t * (a.d[1] - a.cy)];
  }

  function frame(now){
    if(!W) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(stat, 0, 0, W, H);
    var i, a, t, p, q, k;
    // линии маршрутов (бегущий пунктир по направлению к Кишинёву)
    ctx.lineWidth = 1.1; ctx.lineCap = "round";
    for(i = 0; i < arcs.length; i++){
      a = arcs[i];
      ctx.strokeStyle = "rgba(" + RED + ",0.34)";
      ctx.setLineDash([2, 6]);
      ctx.lineDashOffset = reduce ? 0 : -(now * 0.022);
      ctx.beginPath(); ctx.moveTo(a.o[0], a.o[1]); ctx.quadraticCurveTo(a.cx, a.cy, a.d[0], a.d[1]); ctx.stroke();
    }
    ctx.setLineDash([]);
    // стрелка у конца дуги + пункт отправления
    for(i = 0; i < arcs.length; i++){
      a = arcs[i];
      p = pt(a, 0.93); q = tan(a, 0.93);
      var ang = Math.atan2(q[1], q[0]);
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(ang);
      ctx.fillStyle = "rgba(" + RED + ",0.5)";
      ctx.beginPath(); ctx.moveTo(4.5, 0); ctx.lineTo(-3.5, -3); ctx.lineTo(-1.8, 0); ctx.lineTo(-3.5, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "rgba(" + INK + ",0.38)";
      ctx.beginPath(); ctx.arc(a.o[0], a.o[1], 2.2, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = "rgba(" + INK + ",0.22)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(a.o[0], a.o[1], 4.6, 0, 6.2832); ctx.stroke();
    }
    // «машины» в пути: точка + затухающий шлейф
    if(!reduce){
      for(i = 0; i < arcs.length; i++){
        a = arcs[i];
        t = ((now + a.phase) % (a.dur * 1.3)) / a.dur;
        if(t > 1) continue;
        for(k = 14; k >= 1; k--){
          var tt = t - k * 0.012; if(tt < 0) continue;
          p = pt(a, tt);
          ctx.fillStyle = "rgba(" + RED + "," + (0.5 * (1 - k / 15)).toFixed(3) + ")";
          ctx.beginPath(); ctx.arc(p[0], p[1], 2.4 * (1 - k / 22), 0, 6.2832); ctx.fill();
        }
        p = pt(a, t);
        ctx.fillStyle = "rgba(" + RED + ",0.9)";
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.7, 0, 6.2832); ctx.fill();
      }
    }
    // Кишинёв: пульс + ядро
    var d = arcs.length ? arcs[0].d : proj(DEST[0], DEST[1]);
    if(!reduce){
      for(k = 0; k < 2; k++){
        var ph = ((now / 2600) + k * 0.5) % 1;
        ctx.strokeStyle = "rgba(" + RED + "," + (0.38 * (1 - ph)).toFixed(3) + ")"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(d[0], d[1], 4 + ph * 16, 0, 6.2832); ctx.stroke();
      }
    }
    ctx.fillStyle = "rgba(" + RED + ",0.95)"; ctx.beginPath(); ctx.arc(d[0], d[1], 3.6, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(d[0], d[1], 3.6, 0, 6.2832); ctx.stroke();
  }

  function loop(now){
    if(!running) return;
    raf = requestAnimationFrame(loop);
    if(now - last < 32) return;            // ~30 кадров/с
    last = now; frame(now);
  }
  function start(){ if(running || reduce || !W || !visible || document.hidden) return; running = true; raf = requestAnimationFrame(loop); }
  function stop(){ running = false; if(raf) cancelAnimationFrame(raf); raf = 0; }
  function redraw(){ if(layout()){ frame(performance.now()); start(); } }

  var rt;
  function onResize(){ clearTimeout(rt); rt = setTimeout(redraw, 120); }
  if("ResizeObserver" in window) new ResizeObserver(onResize).observe(panel); else window.addEventListener("resize", onResize);
  if("IntersectionObserver" in window){
    new IntersectionObserver(function(es){ visible = es[0].isIntersecting; if(visible) start(); else stop(); }, {threshold:0}).observe(panel);
  }
  document.addEventListener("visibilitychange", function(){ if(document.hidden) stop(); else start(); });
  redraw();
})();
