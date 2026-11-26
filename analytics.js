(function(){
  if(/^\/admin/.test(location.pathname)) return;
  try{
    if(/[?&]notrack=1/.test(location.search)) localStorage.setItem("apexNoTrack", "1");
    if(/[?&]notrack=0/.test(location.search)) localStorage.removeItem("apexNoTrack");
    if(localStorage.getItem("apexNoTrack")) return;
  }catch(e){}
  var URL_ = "/api/track", last = "";
  function send(o){
    try{
      var body = JSON.stringify(o);
      if(navigator.sendBeacon){ navigator.sendBeacon(URL_, new Blob([body], {type:"application/json"})); }
      else{ fetch(URL_, {method:"POST", headers:{"content-type":"application/json"}, body:body, keepalive:true}); }
    }catch(e){}
  }
  function view(){
    var p = location.pathname;
    if(p === last) return;
    last = p;
    send({p:p, r:document.referrer});
  }
  view();
  ["pushState", "replaceState"].forEach(function(fn){
    var orig = history[fn];
    history[fn] = function(){ var r = orig.apply(this, arguments); try{ view(); }catch(e){} return r; };
  });
  window.addEventListener("popstate", view);
  setInterval(function(){ if(!document.hidden) send({p:location.pathname, hb:1}); }, 45000);
  window.apexTrack = function(ev){ send({p:location.pathname, e:ev}); };
  // ---- воронка заявок (27.11.2026): куда нажимают и откуда уходят заявки ----
  document.addEventListener("click", function(e){
    try{
      var hc = e.target && e.target.closest ? e.target.closest("[data-hero-cta]") : null;
      if(hc) window.apexTrack("hero_cta:" + String(hc.getAttribute("data-hero-cta")).replace(/[^a-z0-9_]/g, "").slice(0, 20));
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if(!a) return;
      if(a.id === "tgBtn"){ window.apexTrack("calc_share:tg"); return; }
      var h = a.getAttribute("href") || "", k = "";
      if(/^tel:/i.test(h)) k = "phone";
      else if(/^mailto:/i.test(h)) k = "email";
      else if(/(^|\/\/)(t\.me|telegram\.me)\//i.test(h) || /^tg:/i.test(h)) k = "tg";
      else if(/whatsapp|wa\.me/i.test(h)) k = "wa";
      if(k) window.apexTrack("contact_click:" + k);
    }catch(_){}
  }, true);
  // успешная отправка любой формы-заявки (action=lead): источник — по странице
  try{
    var of = window.fetch;
    window.fetch = function(u, o){
      var p = of.apply(this, arguments);
      try{
        if(o && String(o.method || "").toUpperCase() === "POST" && /action=lead/.test(String(u && u.url || u))){
          var path = location.pathname;
          var src = path === "/" ? "home" : /^\/auctions\/./.test(path) ? "lot" : /^\/auctions/.test(path) ? "catalog" : /^\/in-transit/.test(path) ? "transit" : /^\/(korea|canada)/.test(path) ? "carcat" : /^\/contacts/.test(path) ? "contacts" : /^\/vin/.test(path) ? "vin" : "other";
          p.then(function(r){ if(r && r.ok) window.apexTrack("lead_sent:" + src); }).catch(function(){});
        }
      }catch(_){}
      return p;
    };
  }catch(_){}
})();
