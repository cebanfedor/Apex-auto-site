/* Счётчик расхода auctionsapi — только для админа (26.11.2026).
   • в админке — бейдж в шапке (#apiBadgeV1);
   • на публичных страницах — плавающая плашка слева внизу, ТОЛЬКО если в этом браузере был вход админа (localStorage apexAdminV1=1).
   Данные: GET /api/auctions?action=apibadge (admin-only, ~без нагрузки: значение держит предохранитель). */
(function(){
  "use strict";
  var host = document.getElementById("apiBadgeV1");
  var inAdmin = !!host;
  if(!inAdmin){
    var flag = false;
    try{ flag = localStorage.getItem("apexAdminV1") === "1"; }catch(_){}
    if(!flag || /^\/admin/.test(location.pathname)) return;
  }
  var el = host;
  if(!el){
    el = document.createElement("a");
    el.id = "apiBadgeV1"; el.className = "apiBadgeFloatV1"; el.href = "/api/auctions?action=apiusage&hours=3"; el.target = "_blank"; el.rel = "noopener";
    el.hidden = true;
    var st = document.createElement("style");
    st.textContent =
      ".apiBadgeFloatV1{position:fixed;left:12px;bottom:12px;z-index:8000;font:600 12px/1 Inter,system-ui,sans-serif;padding:8px 11px;border-radius:999px;background:#12151c;color:#fff;" +
      "box-shadow:0 4px 14px rgba(0,0,0,.25);text-decoration:none;display:inline-flex;align-items:center;gap:7px;opacity:.92}" +
      ".apiBadgeFloatV1:hover{opacity:1}" +
      "body.mBarOnV1 .apiBadgeFloatV1{bottom:68px}" +
      ".apiBadgeV1Dot{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:none}" +
      ".apiBadgeV1Dot.l1{background:#eab308}.apiBadgeV1Dot.l2{background:#f97316}.apiBadgeV1Dot.l3,.apiBadgeV1Dot.blk{background:#ef4444}";
    document.head.appendChild(st);
    document.body.appendChild(el);
  }
  function fmt(n){ return Math.round(n).toLocaleString("ru-RU").replace(/ /g, " "); }
  function paint(d){
    var used = Number(d.used) || 0, limit = Number(d.limit) || 500000, pct = Math.round(used / limit * 100);
    var cls = d.blockedUntil ? "blk" : ("l" + (d.level || 0));
    var hm = function(iso){ try{ return new Date(iso).toLocaleTimeString("ru-RU", {hour:"2-digit", minute:"2-digit"}); }catch(_){ return ""; } };
    var tip = "Запросы к auctionsapi за сутки: " + fmt(used) + " из " + fmt(limit) + " (" + pct + "%)\n" +
      "Сейчас ≈ " + fmt(d.perHour || 0) + " в час · уровень защиты " + (d.level || 0) + "\n" +
      "Сброс лимита: " + hm(d.resetAt) + (d.blockedUntil ? "\nПровайдер ограничил запросы до " + hm(d.blockedUntil) : "");
    el.title = tip;
    el.innerHTML = '<i class="apiBadgeV1Dot ' + cls + '"></i><span>API ' + fmt(used) + " / " + Math.round(limit / 1000) + "k · " + pct + "%</span>";
    el.hidden = false;
    if(inAdmin) el.className = "apiBadgeAdminV1 " + cls;
  }
  var timer = 0;
  function load(){
    fetch("/api/auctions?action=apibadge&_=" + Date.now(), {credentials:"same-origin", cache:"no-store"}).then(function(r){
      if(r.status === 401){
        if(!inAdmin){ try{ localStorage.removeItem("apexAdminV1"); }catch(_){} el.remove(); clearInterval(timer); }
        else el.hidden = true;
        return null;
      }
      return r.ok ? r.json() : null;
    }).then(function(d){ if(d && d.ok) paint(d); }).catch(function(){});
  }
  load();
  timer = setInterval(function(){ if(!document.hidden) load(); }, 60000);
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) load(); });
})();
