/* Web push на устройстве (26.11.2026): регистрация sw.js, подписка на уведомления, отправка подписки на сервер.
   Токен клиента — тот же apexAlertTokenV1, что у кабинета и уведомлений в Telegram. API: window.apexPush. */
(function(){
  "use strict";
  var TOKEN = "apexAlertTokenV1";
  function token(){ try{ return localStorage.getItem(TOKEN) || ""; }catch(e){ return ""; } }
  function api(action, body){
    return fetch("/api/auctions?action=" + action, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)}).then(function(r){ return r.json(); }).catch(function(){ return null; });
  }
  function b64(s){
    var p = "=".repeat((4 - s.length % 4) % 4), r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), a = new Uint8Array(r.length);
    for(var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i);
    return a;
  }
  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  var supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // На iPhone push работает только у приложения, добавленного на экран «Домой» (iOS 16.4+)
  var needInstall = isIOS && !standalone;

  function reg(){ return navigator.serviceWorker.register("/sw.js").then(function(){ return navigator.serviceWorker.ready; }); }
  function current(){
    if(!supported) return Promise.resolve(null);
    return navigator.serviceWorker.getRegistration("/").then(function(r){ return r ? r.pushManager.getSubscription() : null; }).catch(function(){ return null; });
  }
  // state: unsupported | needinstall | denied | off | on
  function state(){
    if(!supported) return Promise.resolve("unsupported");
    if(needInstall) return Promise.resolve("needinstall");
    if(Notification.permission === "denied") return Promise.resolve("denied");
    return current().then(function(s){ return s && Notification.permission === "granted" ? "on" : "off"; });
  }
  function enable(){
    if(!supported) return Promise.resolve({ok: false, error: "unsupported"});
    if(!token()) return Promise.resolve({ok: false, error: "no_token"});
    return Notification.requestPermission().then(function(p){
      if(p !== "granted") return {ok: false, error: "denied"};
      return fetch("/api/auctions?action=alertpushkey").then(function(r){ return r.json(); }).then(function(k){
        if(!k || !k.ok || !k.key) return {ok: false, error: "no_key"};
        return reg().then(function(r){
          return r.pushManager.getSubscription().then(function(old){
            // ключ мог смениться — старую подписку снимаем, иначе subscribe() упадёт
            return old ? old.unsubscribe().catch(function(){}) : null;
          }).then(function(){ return r.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64(k.key)}); });
        }).then(function(sub){
          return api("alertpushsub", {token: token(), sub: sub.toJSON()}).then(function(res){ return res && res.ok ? {ok: true} : {ok: false, error: (res && res.error) || "server"}; });
        });
      });
    }).catch(function(){ return {ok: false, error: "failed"}; });
  }
  function disable(){
    return current().then(function(s){
      if(!s) return {ok: true};
      var ep = s.endpoint;
      return s.unsubscribe().catch(function(){}).then(function(){ return api("alertpushunsub", {token: token(), endpoint: ep}); }).then(function(){ return {ok: true}; });
    }).catch(function(){ return {ok: false}; });
  }
  function test(){ return api("alertpushtest", {token: token()}); }
  window.apexPush = {supported: supported, isIOS: isIOS, standalone: standalone, needInstall: needInstall, state: state, enable: enable, disable: disable, test: test};
})();
