/* Мобильные доработки главной (07.11.2026): сворачиваем длинные тексты за кнопкой «Показать полностью».
   Содержимое остаётся в DOM (поисковики читают), на десктопе скрипт ничего не делает. */
(function(){
  "use strict";
  if(!window.matchMedia || !window.matchMedia("(max-width:640px)").matches) return;
  var lang = (window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2);
  var T = {ru:{more:"Показать полностью", less:"Свернуть"}, ro:{more:"Arată tot", less:"Restrânge"}, en:{more:"Show more", less:"Show less"}}[lang] || {more:"Показать полностью", less:"Свернуть"};
  // [селектор, высота в свёрнутом виде, px]
  var TARGETS = [[".apexSeoGridV431", 280], [".econTextV303", 330]];
  function clamp(el, h){
    if(el.dataset.mClamp || el.scrollHeight < h + 90) return;   // короткие не трогаем
    el.dataset.mClamp = "1";
    el.classList.add("mClampV1"); el.style.setProperty("--mch", h + "px");
    var b = document.createElement("button");
    b.type = "button"; b.className = "mClampBtnV1"; b.textContent = T.more; b.setAttribute("aria-expanded", "false");
    el.insertAdjacentElement("afterend", b);
    b.addEventListener("click", function(){
      var open = el.classList.toggle("mOpenV1");
      b.textContent = open ? T.less : T.more; b.setAttribute("aria-expanded", open ? "true" : "false");
      if(!open){ var y = el.getBoundingClientRect().top + window.scrollY - 70; window.scrollTo({top:y, behavior:"smooth"}); }
    });
  }
  function run(){ TARGETS.forEach(function(t){ document.querySelectorAll(t[0]).forEach(function(el){ clamp(el, t[1]); }); }); }
  if(document.readyState === "complete") setTimeout(run, 300); else window.addEventListener("load", function(){ setTimeout(run, 300); });
  // перевод RO/EN подставляется после загрузки словаря — высота текста меняется, пересчитывать не нужно (max-height фиксирован)
})();
