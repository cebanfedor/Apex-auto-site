/* Telegram Mini App (27.11.2026): кабинет открывается внутри Telegram и входит сам — без «Start»-ссылки и токенов.
   Telegram кладёт подписанные данные в адрес (#tgWebAppData=…); сервер проверяет подпись токеном бота (action=cabtg),
   привязывает устройство к chat_id и возвращает токен кабинета. Вне Telegram скрипт ничего не делает. */
(function(){
  "use strict";
  var raw = null;
  try{ raw = new URLSearchParams(String(location.hash || "").replace(/^#/, "")).get("tgWebAppData"); }catch(e){}
  try{
    if(raw) sessionStorage.setItem("apexTgInit", raw);
    else raw = sessionStorage.getItem("apexTgInit");
  }catch(e){}
  if(!raw) return;
  var de = document.documentElement;
  de.classList.add("inTgV1");                       // стили «как приложение»: без шапки сайта и подвала (cabinet.css)
  var K = "apexAlertTokenV1", DONE = "apexTgBoundV1";
  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function sdk(){
    var s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = function(){
      try{ var w = window.Telegram.WebApp; w.ready(); w.expand(); if(w.setHeaderColor) w.setHeaderColor("#ffffff"); }catch(e){}
    };
    (document.head || de).appendChild(s);
  }
  sdk();
  var tok = ls(K) || "";
  var done = null; try{ done = JSON.parse(ls(DONE) || "null"); }catch(e){}
  if(tok && done && done.tk === tok) return;        // это устройство уже привязано
  // Привязка нужна до того, как остальные скрипты прочитают токен: прячем страницу и перезагружаем после ответа сервера
  de.style.visibility = "hidden";
  var fallback = setTimeout(function(){ de.style.visibility = ""; }, 5000);
  fetch("/api/auctions?action=cabtg", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({token: tok, initData: raw})})
    .then(function(r){ return r.json(); })
    .then(function(r){
      if(r && r.ok && r.token){
        try{ localStorage.setItem(K, r.token); localStorage.setItem(DONE, JSON.stringify({tk: r.token})); localStorage.removeItem("apexCabBoundV1"); }catch(e){}
        clearTimeout(fallback);
        location.reload();
        return;
      }
      clearTimeout(fallback); de.style.visibility = "";
    })
    .catch(function(){ clearTimeout(fallback); de.style.visibility = ""; });
})();
