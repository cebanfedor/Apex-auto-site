/* Нижняя панель связи на телефоне (≤820px): Позвонить · WhatsApp · Telegram · Рассчитать.
   Подключается на всех публичных страницах. Стили встроены сюда же — не зависят от версий CSS.
   Не показываем: админка, страницы объявлений/лотов (там своя липкая панель с ценой и заявкой),
   пока открыта шторка фильтров/модалка, и пока в фокусе поле ввода (экранная клавиатура). */
(function(){
  "use strict";
  var path = location.pathname.replace(/\/+$/, "") || "/";
  if(/^\/admin/.test(path)) return;
  if(/^\/(auctions|in-transit)\/[^/]+/.test(path)) return;   // страница лота / объявления — свой CTA
  if(window.__mBarV1) return; window.__mBarV1 = true;

  var PHONE = "+37368832032", WA = "37368832032", TG = "fedukusa";
  var lang = (window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2);
  var T = {
    ru: {call:"Позвонить", wa:"WhatsApp", tg:"Telegram", calc:"Рассчитать", aria:"Быстрая связь", msg:"Здравствуйте! Пишу с сайта apexauto.md"},
    ro: {call:"Sună", wa:"WhatsApp", tg:"Telegram", calc:"Calculează", aria:"Contact rapid", msg:"Bună ziua! Vă scriu de pe site-ul apexauto.md"},
    en: {call:"Call", wa:"WhatsApp", tg:"Telegram", calc:"Calculate", aria:"Quick contact", msg:"Hello! I'm writing from apexauto.md"}
  };
  var t = T[lang] || T.ru;

  function css(){
    var s = document.createElement("style");
    s.textContent =
      ".mBarV1{display:none}" +
      "@media (max-width:820px){" +
      ".mBarV1{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:var(--z-fab,9000);gap:5px;padding:5px 8px calc(5px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid #e6eaf0;box-shadow:0 -6px 22px rgba(17,20,26,.09);transition:transform .18s ease}" +
      ".mBarV1 a{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;height:38px;border-radius:11px;font:700 11px/1.1 var(--font-body,Onest,system-ui,sans-serif);color:#11141a;text-decoration:none;background:#f3f5f8;-webkit-tap-highlight-color:transparent}" +
      ".mBarV1 a:active{transform:scale(.97)}" +
      ".mBarV1 svg{width:16px;height:16px;flex:none}" +
      ".mBarV1 .mbCallV1{background:#ed0012;color:#fff}" +
      ".mBarV1 .mbWaV1{background:#e8f8ee;color:#0b6b38}" +
      ".mBarV1 .mbTgV1{background:#e6f4fc;color:#14658f}" +
      ".mBarV1 .mbCalcV1{background:#11141a;color:#fff}" +
      "body.mBarOnV1{padding-bottom:calc(50px + env(safe-area-inset-bottom))}" +
      "body.mBarOnV1 .fabContactV341{display:none}" +
      /* Cookie-баннер на телефоне — компактный и НАД панелью связи (раньше закрывал четверть экрана и саму панель) */
      "body.mBarOnV1 .cookieConsentV1{bottom:calc(50px + env(safe-area-inset-bottom));padding:6px 8px}" +
      "body.mBarOnV1 .cookieConsentBoxV1{padding:10px 12px;gap:8px;border-radius:14px}" +
      "body.mBarOnV1 .cookieConsentBoxV1 p{font-size:12px;line-height:1.4}" +
      "body.mBarOnV1 .cookieConsentBtnsV1 button{min-height:38px;padding:8px 14px;font-size:13px}" +
      "body.mBarHideV1 .mBarV1,body.filtersOpenV1 .mBarV1,body:has(.catalog-sidebar.is-open) .mBarV1,body:has(.auctionModalV1:not([hidden])) .mBarV1{transform:translateY(120%);pointer-events:none}" +
      "}";
    document.head.appendChild(s);
  }

  var I = {
    call:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    wa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a5 5 0 0 0 5 5l1.2-1.2-2-1-1 .7a3.5 3.5 0 0 1-1.7-1.7l.7-1-1-2z" fill="currentColor" stroke="none"/></svg>',
    tg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 3 2.8 10.4c-.8.3-.8 1.3 0 1.6l4.7 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6L22.9 4.4c.2-.9-.6-1.6-1.4-1.4z"/><path d="m9.3 13.6 8-6.2"/></svg>',
    calc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h4"/></svg>'
  };

  function msg(){
    var title = (document.title || "").replace(/\s*[|—-]\s*Apex ?Auto.*$/i, "").trim();
    return t.msg + (title ? " — " + title : "") + "\n" + location.href.split("#")[0];
  }

  function build(){
    css();
    var calcHref = path === "/" ? "#calculator" : "/#calculator";
    var nav = document.createElement("nav");
    nav.className = "mBarV1"; nav.setAttribute("aria-label", t.aria);
    nav.innerHTML =
      '<a class="mbCallV1" href="tel:' + PHONE + '">' + I.call + '<span>' + t.call + '</span></a>' +
      '<a class="mbWaV1" href="https://api.whatsapp.com/send?phone=' + WA + '&text=' + encodeURIComponent(msg()) + '" target="_blank" rel="noopener">' + I.wa + '<span>' + t.wa + '</span></a>' +
      '<a class="mbTgV1" href="https://t.me/' + TG + '" target="_blank" rel="noopener">' + I.tg + '<span>' + t.tg + '</span></a>' +
      '<a class="mbCalcV1" href="' + calcHref + '">' + I.calc + '<span>' + t.calc + '</span></a>';
    document.body.appendChild(nav);
    document.body.classList.add("mBarOnV1");
    // Пока в фокусе поле ввода — прячем (иначе на iOS панель прыгает над клавиатурой и закрывает поле).
    var isField = function(e){ return e && /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) && !/^(checkbox|radio|button|submit)$/.test(e.type || ""); };
    document.addEventListener("focusin", function(e){ if(isField(e.target)) document.body.classList.add("mBarHideV1"); });
    document.addEventListener("focusout", function(){ setTimeout(function(){ if(!isField(document.activeElement)) document.body.classList.remove("mBarHideV1"); }, 80); });
    // «Рассчитать» на главной — плавный скролл к калькулятору
    if(path === "/"){
      nav.querySelector(".mbCalcV1").addEventListener("click", function(e){
        var el = document.getElementById("calculator");
        if(el){ e.preventDefault(); el.scrollIntoView({behavior:"smooth", block:"start"}); }
      });
    }
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
