/* Избранное целых авто (/korea, /canada) — в ОДНОЙ стопке с избранным лотов Copart/IAAI (26.11.2026, Федор: «избранные должны быть все в одной стопке»).
   Раньше каталоги Кореи/Канады писали в отдельный ключ apexCatFavV1, который не читали ни кабинет, ни вкладка «Избранное», ни нижняя панель.
   Теперь запись лежит в общем apexFavsV1 с ключом kr-<id> / ca-<id> и синхронизируется кабинетом (cab-sync.js → cab_items kind=fav). */
(function(){
  "use strict";
  var KEY = "apexFavsV1", OLD = "apexCatFavV1";
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }catch(e){ return {}; } }
  function save(m){ try{ localStorage.setItem(KEY, JSON.stringify(m)); }catch(e){} }
  function cab(){ return window.apexCab || null; }
  function key(src, id){ return (src === "ca" ? "ca" : "kr") + "-" + id; }
  function changed(){ try{ document.dispatchEvent(new Event("apex-fav-changed")); }catch(e){} }

  function has(src, id){ return !!load()[key(src, id)]; }
  // info: {carId, url, title, image, usd, vin, year, odoKm}; возвращает новое состояние (true = в избранном)
  function toggle(src, info){
    var k = key(src, info.carId), m = load(), on;
    if(m[k]){ delete m[k]; on = false; }
    else{
      m[k] = {id:k, catalog:true, src:src === "ca" ? "ca" : "kr", carId:info.carId, url:info.url || "", title:info.title || "", image:info.image || "",
        usd:Number(info.usd) > 0 ? Math.round(info.usd) : 0, vin:info.vin || "", year:info.year || "", odoKm:Number(info.odoKm) > 0 ? Math.round(info.odoKm) : 0, addedAt:Date.now()};
      on = true;
      var keys = Object.keys(m);
      if(keys.length > 500) keys.slice(0, keys.length - 500).forEach(function(x){ delete m[x]; });
    }
    save(m);
    try{ var c = cab(); if(c) on ? c.put("fav", k, m[k]) : c.del("fav", k); }catch(e){}
    changed();
    return on;
  }
  function remove(k){
    var m = load(); if(!m[k]) return;
    delete m[k]; save(m);
    try{ var c = cab(); if(c) c.del("fav", k); }catch(e){}
    changed();
  }
  function list(){
    var m = load();
    return Object.keys(m).reverse().map(function(k){ return m[k]; }).filter(function(o){ return o && o.catalog; });
  }

  // Разовый перенос старых отметок (apexCatFavV1 → apexFavsV1)
  (function migrate(){
    var old; try{ old = JSON.parse(localStorage.getItem(OLD) || "null"); }catch(e){ old = null; }
    if(!old || typeof old !== "object"){ try{ localStorage.removeItem(OLD); }catch(e){} return; }
    var m = load(), added = [];
    Object.keys(old).forEach(function(id){
      var o = old[id]; if(!o) return;
      var src = /\/canada\//.test(String(o.url || "")) ? "ca" : "kr", k = key(src, id), url = String(o.url || "");
      if(m[k]) return;
      try{ var u = new URL(url, location.origin); url = u.pathname; }catch(e){}
      m[k] = {id:k, catalog:true, src:src, carId:id, url:url, title:o.title || "", image:o.image || "", usd:0, vin:"", year:"", odoKm:0, addedAt:Date.now()};
      added.push(k);
    });
    save(m);
    try{ localStorage.removeItem(OLD); }catch(e){}
    if(added.length) setTimeout(function(){ var c = cab(); if(c) added.forEach(function(k){ c.put("fav", k, m[k]); }); changed(); }, 1500);
  })();

  window.apexCatFav = {key:key, has:has, toggle:toggle, remove:remove, list:list};
})();
