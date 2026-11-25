/* Присутствие клиента для менеджера (кабинет v3, 26.11.2026): раз в минуту «я на сайте» — только если клиент подключил Telegram
   (есть токен) и в последние 5 минут что-то делал на странице. Менеджер видит в админке «онлайн сейчас» и на какой странице клиент. */
(function(){
  "use strict";
  var TOKEN = "apexAlertTokenV1", BOUND = "apexCabBoundV1", IDLE = 5 * 60e3, EVERY = 60e3;
  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  var tk = ls(TOKEN);
  if(!tk) return;
  try{
    var b = JSON.parse(ls(BOUND) || "null");
    if(b && b.tk === tk && b.b === false && Date.now() - b.t < 10 * 60e3) return;   // токен есть, но Telegram не привязан
  }catch(e){}
  var first = true, last = Date.now(), dead = false, timer = null;
  function touch(){ last = Date.now(); }
  ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"].forEach(function(ev){ window.addEventListener(ev, touch, {passive:true}); });
  function ping(){
    if(dead || document.hidden || Date.now() - last > IDLE) return;
    var body = JSON.stringify({token:tk, p:location.pathname.slice(0, 200), h:String(document.title || "").slice(0, 120), first:first});
    fetch("/api/auctions?action=cabping", {method:"POST", headers:{"content-type":"application/json"}, body:body, keepalive:true})
      .then(function(r){ return r.json(); })
      .then(function(r){
        if(r && r.ok){ first = false; return; }
        if(r && (r.error === "unbound" || r.error === "unknown_token")){ dead = true; clearInterval(timer); }
      }).catch(function(){});
  }
  document.addEventListener("visibilitychange", function(){ if(!document.hidden) ping(); });
  var start = function(){ ping(); timer = setInterval(ping, EVERY); };
  if("requestIdleCallback" in window) requestIdleCallback(start, {timeout:5000}); else setTimeout(start, 2000);
})();
