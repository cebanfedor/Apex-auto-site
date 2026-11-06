/* Главная: FAQ сворачивается до первых 8 вопросов, остальные — по кнопке «Показать все вопросы» (06.11.2026).
   Разметка отдаёт все вопросы (и в FAQPage JSON-LD они все), прячет лишние только CSS при классе isCollapsedV1,
   который ставит этот скрипт: без JS все вопросы видны. Открытый вопрос из ссылки/поиска по странице не теряется. */
(function(){
  "use strict";
  var list = document.querySelector(".apexFaqListV205");
  var wrap = document.querySelector(".apexFaqMoreWrapV1");
  var btn = document.getElementById("faqMoreV1");
  if(!list || !wrap || !btn || !list.querySelector(".apexFaqExtraV1")) return;
  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }
  function paint(){
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.textContent = T(open ? "Свернуть" : "Показать все вопросы");
  }
  list.classList.add("isCollapsedV1");
  wrap.hidden = false;
  btn.addEventListener("click", function(){
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    list.classList.toggle("isCollapsedV1", open);
    paint();
    if(open){ var h = document.getElementById("faq"); if(h && h.scrollIntoView) h.scrollIntoView({block:"start", behavior:"smooth"}); }
  });
  // перевод языка на лету: подпись кнопки перерисовываем после переключения
  document.addEventListener("click", function(e){ if(e.target.closest && e.target.closest("[data-lang]")) setTimeout(paint, 80); });
  paint();
})();
