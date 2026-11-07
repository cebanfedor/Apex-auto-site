// Контакты: схема проезда оживает при появлении на экране, блоки плавно выезжают.
// Без JS всё видно сразу (классы скрытия ставит только этот скрипт).
(function(){
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var loc = document.getElementById("contactLocationV1");
  var svg = loc && loc.querySelector(".routeSvgV1");
  if(reduce){
    if(svg && svg.pauseAnimations) try{ svg.pauseAnimations(); }catch(e){}
    if(loc) loc.classList.add("isInV1");
    return;
  }
  var targets = [].slice.call(document.querySelectorAll(".contactMethodV110, .contactLocationV306 > *, .contactPanelV110, .contactsTrustV1 li"));
  if(!("IntersectionObserver" in window)){ if(loc) loc.classList.add("isInV1"); return; }
  document.documentElement.classList.add("fxContactsV1");
  targets.forEach(function(el, i){ el.classList.add("fxItemV1"); el.style.setProperty("--fxd", ((i % 6) * 60) + "ms"); });
  var io = new IntersectionObserver(function(list){
    list.forEach(function(e){
      if(!e.isIntersecting) return;
      e.target.classList.add("fxShownV1");
      if(e.target === loc || (loc && loc.contains(e.target))) loc.classList.add("isInV1");
      io.unobserve(e.target);
    });
  }, {threshold: .18});
  targets.forEach(function(el){ io.observe(el); });
  if(loc) io.observe(loc);
  // машинка стартует вместе с рисованием маршрута
  if(svg && svg.pauseAnimations){
    try{ svg.pauseAnimations(); svg.setCurrentTime(0); }catch(e){}
    var go = new IntersectionObserver(function(l){
      l.forEach(function(e){
        if(e.isIntersecting){ try{ svg.unpauseAnimations(); }catch(_){} }
        else { try{ svg.pauseAnimations(); }catch(_){} }
      });
    }, {threshold: .25});
    go.observe(svg);
  }
})();
