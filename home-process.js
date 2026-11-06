/* Главная, «Как мы работаем»: запуск анимации, когда блок появился на экране (06.11.2026).
   Без JS или при «уменьшить движение» блок просто виден целиком (прячем шаги только после класса isReadyV1).
   Дальше всё делает CSS: линия прорисовывается, шаги всплывают по очереди, по линии бежит красная точка и подсвечивает шаги. */
(function(){
  "use strict";
  var sec = document.getElementById("how");
  if(!sec || !sec.classList.contains("procV2")) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if(reduce || !("IntersectionObserver" in window)) return;
  sec.classList.add("isReadyV1");
  var io = new IntersectionObserver(function(es){
    if(es[0].isIntersecting){ sec.classList.add("isInV1"); io.disconnect(); }
  }, {threshold: 0.25});
  io.observe(sec);
  // страховка: если блок уже над экраном (якорь/быстрая прокрутка), показываем без анимации ожидания
  setTimeout(function(){ if(sec.getBoundingClientRect().top < 0) sec.classList.add("isInV1"); }, 1200);
})();
