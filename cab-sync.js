/* Личный кабинет — слой синхронизации (24.11.2026). Аккаунт = Telegram: секретный токен (apexAlertTokenV1, тот же, что у
   уведомлений) привязан ботом к chat_id; на сервере (cab_items) лежат избранное, заметки, «мои машины» и недавние.
   Пока Telegram не подключён или таблицы нет — всё остаётся в localStorage устройства, ничего не ломается. */
(function(){
  "use strict";
  var TOKEN = "apexAlertTokenV1", BOUND = "apexCabBoundV1", SEEDED = "apexCabSeededV1", PULLED = "apexCabPulledV1";
  var FAV = "apexFavsV1", NOTE = "apexNotesV1", REC = "apexRecentV1";
  var PULL_EVERY = 10 * 60e3, UNBOUND_RETRY = 10 * 60e3;

  function ls(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
  function jget(k, d){ try{ var v = JSON.parse(ls(k) || "null"); return v == null ? d : v; }catch(e){ return d; } }
  function token(){ return ls(TOKEN) || ""; }

  function boundState(){ var s = jget(BOUND, null); return s && s.tk === token() ? s : null; }
  function setBound(b, ready){ lsSet(BOUND, JSON.stringify({tk:token(), b:!!b, r:ready !== false, t:Date.now()})); }
  function canWrite(){
    if(!token()) return false;
    var s = boundState();
    if(!s) return true;                                   // ещё не знаем — пробуем
    if(s.b && s.r) return true;
    return Date.now() - s.t > UNBOUND_RETRY;              // не привязан / нет таблицы — повтор не чаще раза в 10 мин
  }

  function call(action, body){
    var opts = body ? {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(Object.assign({token:token()}, body))} : {};
    var url = "/api/auctions?action=" + action + (body ? "" : "&token=" + encodeURIComponent(token()));
    return fetch(url, opts).then(function(r){ return r.json(); }).catch(function(){ return null; });
  }
  function noteResult(r){
    if(!r) return;
    if(r.ok) setBound(true, true);
    else if(r.error === "unbound" || r.error === "unknown_token") setBound(false, true);
    else if(r.error === "no_table") setBound(true, false);
  }

  function put(kind, key, data){
    if(!canWrite()) return Promise.resolve(null);
    return call("cabput", {kind:kind, key:key, data:data}).then(function(r){ noteResult(r); return r; });
  }
  function del(kind, key){
    if(!canWrite()) return Promise.resolve(null);
    return call("cabdel", {kind:kind, key:key}).then(function(r){ noteResult(r); return r; });
  }

  // Журнал действий для менеджера (просмотр лота, поиск в каталоге). Только после подключения Telegram; сервер сам убирает повторы.
  function event(kind, key, data){
    if(!canWrite()) return Promise.resolve(null);
    return call("cabevent", {kind:kind, key:key, data:data || {}}).then(function(r){
      if(r && (r.error === "unbound" || r.error === "unknown_token")) setBound(false, true);
      return r;
    });
  }

  // ---- недавние просмотры ----
  var RECENT_KEEP = ["id","auction","lot","title","year","make","model","vin","image","auctionDate","currentBid","buyNow","finalBid","statusId","saleStatus","primaryDamage","odometerText","location","catalog","src","carId","url","usd","odoKm"];
  function recentList(){ var a = jget(REC, []); return Array.isArray(a) ? a : []; }
  function recentPush(lot){
    if(!lot || !lot.id || !/^(copart|iaai|kr|ca)-/.test(lot.id)) return;
    var o = {};
    RECENT_KEEP.forEach(function(k){ if(lot[k] !== undefined && lot[k] !== null) o[k] = lot[k]; });
    if(!o.image && lot.images && lot.images[0]) o.image = lot.images[0];
    o.viewedAt = Date.now();
    var list = recentList().filter(function(x){ return x && x.id !== o.id; });
    list.unshift(o);
    lsSet(REC, JSON.stringify(list.slice(0, 40)));
    put("view", o.id, o);
    if(!viewSent[o.id]){ viewSent[o.id] = 1; event("view", o.id, o); }
  }
  var viewSent = {};

  // ---- загрузка с сервера и слияние в localStorage ----
  var pulling = null;
  function applyServer(items){
    var favs = {};
    (items.fav || []).slice().reverse().forEach(function(it){ if(it.data) favs[it.key] = it.data; });
    lsSet(FAV, JSON.stringify(favs));
    var notes = {};
    (items.note || []).forEach(function(it){ if(it.data && it.data.text) notes[it.key] = {text:it.data.text, updatedAt:it.data.updatedAt || it.t}; });
    lsSet(NOTE, JSON.stringify(notes));
    var rec = (items.view || []).map(function(it){ return it.data; }).filter(Boolean).sort(function(a, b){ return (b.viewedAt || 0) - (a.viewedAt || 0); });
    lsSet(REC, JSON.stringify(rec.slice(0, 40)));
  }
  function seedFromLocal(){
    var out = [];
    var favs = jget(FAV, {}); Object.keys(favs).reverse().forEach(function(id){ out.push({kind:"fav", key:id, data:favs[id]}); });
    var notes = jget(NOTE, {}); Object.keys(notes).forEach(function(id){ if(notes[id] && notes[id].text) out.push({kind:"note", key:id, data:notes[id]}); });
    recentList().slice(0, 30).forEach(function(v){ if(v && v.id) out.push({kind:"view", key:v.id, data:v}); });
    var cars = jget("apexCabCarsV1", []);
    (Array.isArray(cars) ? cars : []).forEach(function(c){ if(c && c.vin) out.push({kind:"car", key:c.vin, data:{label:c.label || "", addedAt:c.addedAt}}); });
    return out;
  }
  function pull(force){
    if(!token()) return Promise.resolve(null);
    if(!force){
      var last = Number(ls(PULLED) || 0), st = boundState();
      if(st && (!st.b || !st.r) && Date.now() - st.t < UNBOUND_RETRY) return Promise.resolve(null);
      if(Date.now() - last < PULL_EVERY) return Promise.resolve(null);
    }
    if(pulling) return pulling;
    pulling = call("cabload").then(function(r){
      if(!r || !r.ok) return null;
      if(!r.bound){ setBound(false, true); return r; }
      if(r.ready === false){ setBound(true, false); return r; }
      setBound(true, true);
      var first = ls(SEEDED) !== token();
      var step = first ? (function(){
        var items = seedFromLocal();
        return (items.length ? call("cabbulk", {items:items}) : Promise.resolve(null)).then(function(){ lsSet(SEEDED, token()); return call("cabload"); });
      })() : Promise.resolve(r);
      return step.then(function(r2){
        if(!r2 || !r2.ok || !r2.items) return r;
        applyServer(r2.items);
        lsSet(PULLED, String(Date.now()));
        try{ document.dispatchEvent(new CustomEvent("apex-cab-pulled", {detail:r2})); }catch(e){}
        return r2;
      });
    }).then(function(x){ pulling = null; return x; }, function(){ pulling = null; return null; });
    return pulling;
  }

  function logout(){
    [TOKEN, BOUND, SEEDED, PULLED, "apexAlertLotsV1", "apexCabCarsV1"].forEach(lsDel);
  }

  window.apexCab = {token:token, event:event, put:put, del:del, pull:pull, recentPush:recentPush, recentList:recentList, call:call, setBound:setBound, boundState:boundState, logout:logout, keys:{TOKEN:TOKEN, SEEDED:SEEDED, PULLED:PULLED}};

  // фоновая подтяжка на страницах сайта (только если уже есть токен)
  if(token()){
    var run = function(){ pull(false); };
    if("requestIdleCallback" in window) requestIdleCallback(run, {timeout:6000}); else setTimeout(run, 2500);
  }
})();
