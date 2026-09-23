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
})();
