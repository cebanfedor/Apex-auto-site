/* Нижняя панель вкладок на телефоне (≤820px, v2 — 26.11.2026): Каталог · Избранное · [Расчёт] · Кабинет · Связь.
   «Связь» открывает шит с кнопками Позвонить / WhatsApp / Telegram (и установка приложения, если доступна).
   Подключается на всех публичных страницах, стили встроены сюда же — не зависят от версий CSS.
   Не показываем: админка, страницы объявлений/лотов (там своя липкая панель с ценой и заявкой),
   пока открыта шторка фильтров/модалка, и пока в фокусе поле ввода (экранная клавиатура). */
(function(){
  "use strict";
  var path = location.pathname.replace(/\/+$/, "") || "/";
  if(/^\/admin/.test(path)) return;
  var LOT_RE = /^\/(auctions|in-transit)\/[^/]+/;
  if(window.__mBarV1) return; window.__mBarV1 = true;

  var PHONE = "+37368832032", WA = "37368832032", TG = "fedukusa";
  var lang = (window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2);
  var T = {
    ru: {cat:"Каталог", fav:"Избранное", calc:"Расчёт", cab:"Кабинет", contact:"Связь", call:"Позвонить", wa:"WhatsApp", tg:"Telegram", aria:"Навигация", msg:"Здравствуйте! Пишу с сайта apexauto.md", close:"Закрыть", head:"Связаться с менеджером", install:"Установить приложение", installD:"Иконка на главном экране и уведомления"},
    ro: {cat:"Catalog", fav:"Favorite", calc:"Calcul", cab:"Cont", contact:"Contact", call:"Sună", wa:"WhatsApp", tg:"Telegram", aria:"Navigare", msg:"Bună ziua! Vă scriu de pe site-ul apexauto.md", close:"Închide", head:"Contactează managerul", install:"Instalează aplicația", installD:"Pictogramă pe ecranul principal și notificări"},
    en: {cat:"Catalog", fav:"Favourites", calc:"Calculate", cab:"Account", contact:"Contact", call:"Call", wa:"WhatsApp", tg:"Telegram", aria:"Navigation", msg:"Hello! I'm writing from apexauto.md", close:"Close", head:"Contact your manager", install:"Install the app", installD:"Home-screen icon and notifications"}
  };
  var t = T[lang] || T.ru;

  function css(){
    var s = document.createElement("style");
    s.textContent =
      ".mBarV1,.mSheetV1{display:none}" +
      "@media (max-width:820px){" +
      ".mBarV1{display:grid;grid-template-columns:repeat(5,1fr);align-items:end;position:fixed;left:0;right:0;bottom:0;z-index:var(--z-fab,9000);padding:4px 4px calc(4px + env(safe-area-inset-bottom));background:rgba(255,255,255,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-top:1px solid #e6eaf0;box-shadow:0 -6px 22px rgba(17,20,26,.08);transition:transform .18s ease;view-transition-name:apexbar}" +
      ".mBarV1 a,.mBarV1 button{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;height:48px;padding:0;border:0;border-radius:12px;background:none;font:600 10.5px/1.1 var(--font-body,Onest,system-ui,sans-serif);color:#667080;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
      ".mBarV1 span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".mBarV1 svg{width:22px;height:22px;flex:none}" +
      ".mBarV1 a:active,.mBarV1 button:active{transform:scale(.94)}" +
      ".mBarV1 .isOnV1{color:#ed0012}" +
      ".mBarV1 .isOnV1::before{content:'';position:absolute;top:-5px;width:22px;height:3px;border-radius:0 0 3px 3px;background:#ed0012}" +
      ".mBarV1 .mbCalcV1{color:#11141a}" +
      ".mBarV1 .mbCalcV1 i{display:flex;align-items:center;justify-content:center;width:46px;height:46px;margin-top:-20px;border-radius:50%;background:#ed0012;color:#fff;box-shadow:0 6px 16px rgba(237,0,18,.38),0 0 0 4px #fff}" +
      ".mBarV1 .mbCalcV1 svg{width:22px;height:22px}" +
      ".mBarV1 .mbCalcV1 span{margin-top:1px}" +
      ".mBarV1 b{position:absolute;top:2px;left:calc(50% + 6px);min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:#ed0012;color:#fff;font:800 10px/16px var(--font-body,Onest,system-ui,sans-serif);text-align:center}" +
      ".mBarV1 b[hidden]{display:none}" +
      "body.mBarOnV1{padding-bottom:calc(58px + env(safe-area-inset-bottom))}" +
      "body.mBarOnV1 .fabContactV341{display:none}" +
      /* Cookie-баннер на телефоне — компактный и НАД панелью */
      "body.mBarOnV1 .cookieConsentV1{bottom:calc(58px + env(safe-area-inset-bottom));padding:6px 8px}" +
      "body.mBarOnV1 .cookieConsentBoxV1{padding:10px 12px;gap:8px;border-radius:14px}" +
      "body.mBarOnV1 .cookieConsentBoxV1 p{font-size:12px;line-height:1.4}" +
      "body.mBarOnV1 .cookieConsentBtnsV1 button{min-height:38px;padding:8px 14px;font-size:13px}" +
      "body.mBarLotV1 .mBarV1{display:none!important}" +
      "body.mBarHideV1 .mBarV1,body.filtersOpenV1 .mBarV1,body:has(.catalog-sidebar.is-open) .mBarV1,body:has(.auctionModalV1:not([hidden])) .mBarV1{transform:translateY(120%);pointer-events:none}" +
      /* шит «Связь» */
      ".mSheetV1{display:block;position:fixed;inset:0;z-index:var(--z-overlay,10001);visibility:hidden;pointer-events:none}" +
      ".mSheetV1.isOpenV1{visibility:visible;pointer-events:auto}" +
      ".mSheetV1::before{content:'';position:absolute;inset:0;background:rgba(15,18,24,.5);opacity:0;transition:opacity .2s}" +
      ".mSheetV1.isOpenV1::before{opacity:1}" +
      ".mSheetBoxV1{position:absolute;left:0;right:0;bottom:0;display:grid;gap:10px;padding:10px 14px calc(16px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:#fff;box-shadow:0 -12px 40px rgba(17,20,26,.25);transform:translateY(105%);transition:transform .24s cubic-bezier(.2,.8,.2,1)}" +
      ".mSheetV1.isOpenV1 .mSheetBoxV1{transform:none}" +
      ".mSheetGripV1{width:40px;height:4px;margin:0 auto 4px;border-radius:4px;background:#d5dae2}" +
      ".mSheetBoxV1 h3{margin:0 0 2px;font:800 17px var(--font-display,Onest,system-ui,sans-serif);color:#11141a;text-align:center}" +
      ".mSheetBoxV1 a,.mSheetBoxV1 button.mRowV1{display:flex;align-items:center;gap:12px;min-height:54px;padding:0 16px;border:0;border-radius:15px;font:700 16px var(--font-body,Onest,system-ui,sans-serif);text-decoration:none;text-align:left;cursor:pointer}" +
      ".mSheetBoxV1 svg{width:22px;height:22px;flex:none}" +
      ".mSheetBoxV1 .mCallV1{background:#ed0012;color:#fff}" +
      ".mSheetBoxV1 .mWaV1{background:#e8f8ee;color:#0b6b38}" +
      ".mSheetBoxV1 .mTgV1{background:#e6f4fc;color:#14658f}" +
      ".mSheetBoxV1 .mInstV1{background:#f3f5f8;color:#11141a;flex-direction:column;align-items:flex-start;gap:1px;justify-content:center}" +
      ".mSheetBoxV1 .mInstV1 small{font:500 12.5px var(--font-body,Onest,system-ui,sans-serif);color:#667080}" +
      ".mSheetBoxV1 .mInstV1[hidden]{display:none}" +
      ".mSheetCloseV1{background:none!important;color:#667080!important;justify-content:center;min-height:44px!important;font-weight:600!important;font-size:14.5px!important}" +
      "}" +
      "@media (prefers-reduced-motion:reduce){.mSheetBoxV1,.mSheetV1::before{transition:none}}";
    document.head.appendChild(s);
  }

  var I = {
    cat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M3.5 13l2-6.2A2 2 0 0 1 7.4 5.4h9.2a2 2 0 0 1 1.9 1.4l2 6.2V17H3.5v-4z"/><circle cx="7.5" cy="17.5" r="1.4"/><circle cx="16.5" cy="17.5" r="1.4"/></svg>',
    fav:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-4.6-9.3-9.1C1.1 8.7 3 5.5 6.2 5.5c2 0 3.4 1.1 4.1 2.2h3.4c.7-1.1 2.1-2.2 4.1-2.2 3.2 0 5.1 3.2 3.5 6.4C19 16.4 12 21 12 21z"/></svg>',
    calc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h4"/></svg>',
    cab:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    contact:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8.5 8.5 0 0 1-12.3 7.6L3 21l1.4-5.5A8.5 8.5 0 1 1 21 12z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg>',
    call:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>',
    wa:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a5 5 0 0 0 5 5l1.2-1.2-2-1-1 .7a3.5 3.5 0 0 1-1.7-1.7l.7-1-1-2z" fill="currentColor" stroke="none"/></svg>',
    tg:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 3 2.8 10.4c-.8.3-.8 1.3 0 1.6l4.7 1.6 1.8 5.6c.2.7 1.1.9 1.6.4l2.6-2.4 4.7 3.5c.6.4 1.4.1 1.6-.6L22.9 4.4c.2-.9-.6-1.6-1.4-1.4z"/><path d="m9.3 13.6 8-6.2"/></svg>'
  };

  function msg(){
    var title = (document.title || "").replace(/\s*[|—-]\s*Apex ?Auto.*$/i, "").trim();
    return t.msg + (title ? " — " + title : "") + "\n" + location.href.split("#")[0];
  }
  function favCount(){
    try{ var m = JSON.parse(localStorage.getItem("apexFavsV1") || "{}"); return m && typeof m === "object" ? Object.keys(m).length : 0; }catch(e){ return 0; }
  }

  function build(){
    css();
    var calcHref = path === "/" ? "#calculator" : "/#calculator";
    var nav = document.createElement("nav");
    nav.className = "mBarV1"; nav.setAttribute("aria-label", t.aria);
    nav.innerHTML =
      '<a data-tab="cat" href="/auctions">' + I.cat + '<span>' + t.cat + '</span></a>' +
      '<a data-tab="fav" href="/cabinet#fav">' + I.fav + '<span>' + t.fav + '</span><b hidden></b></a>' +
      '<a class="mbCalcV1" data-tab="calc" href="' + calcHref + '"><i>' + I.calc + '</i><span>' + t.calc + '</span></a>' +
      '<a data-tab="cab" href="/cabinet">' + I.cab + '<span>' + t.cab + '</span></a>' +
      '<button type="button" data-tab="contact" aria-haspopup="dialog">' + I.contact + '<span>' + t.contact + '</span></button>';
    document.body.appendChild(nav);
    // Страница лота / объявления — своя липкая панель с ценой и заявкой; каталог открывает лот без перезагрузки,
    // поэтому следим за адресом (pushState/popstate), а не только за первым заходом.
    function lotSync(){
      var onLot = LOT_RE.test(location.pathname.replace(/\/+$/, ""));
      document.body.classList.toggle("mBarLotV1", onLot);
      document.body.classList.toggle("mBarOnV1", !onLot);
    }
    ["pushState", "replaceState"].forEach(function(k){
      var orig = history[k];
      history[k] = function(){ var r = orig.apply(this, arguments); try{ lotSync(); }catch(e){} return r; };
    });
    window.addEventListener("popstate", lotSync);
    lotSync();

    // активная вкладка
    function mark(){
      var h = location.hash, on = "";
      if(/^\/(auctions|korea|canada)$/.test(path)) on = "cat";
      else if(path === "/cabinet") on = h === "#fav" ? "fav" : "cab";
      Array.prototype.forEach.call(nav.querySelectorAll("[data-tab]"), function(el){ el.classList.toggle("isOnV1", el.getAttribute("data-tab") === on); });
      var n = favCount(), b = nav.querySelector('[data-tab="fav"] b');
      if(b){ b.textContent = n > 99 ? "99+" : String(n); b.hidden = !n; }
    }
    mark();
    window.addEventListener("hashchange", mark);
    window.addEventListener("storage", mark);
    document.addEventListener("apex-cab-pulled", mark);
    document.addEventListener("visibilitychange", function(){ if(!document.hidden) mark(); });
    // На странице кабинета «Избранное» переключает вкладку без перехода
    if(path === "/cabinet"){
      nav.querySelector('[data-tab="fav"]').addEventListener("click", function(e){ e.preventDefault(); location.hash = "#fav"; });
      nav.querySelector('[data-tab="cab"]').addEventListener("click", function(e){ e.preventDefault(); location.hash = "#over"; });
    }
    // «Расчёт» на главной — плавный скролл к калькулятору
    if(path === "/"){
      nav.querySelector(".mbCalcV1").addEventListener("click", function(e){
        var el = document.getElementById("calculator");
        if(el){ e.preventDefault(); el.scrollIntoView({behavior:"smooth", block:"start"}); }
      });
    }

    // шит «Связь»
    var sheet = document.createElement("div");
    sheet.className = "mSheetV1"; sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", t.head);
    sheet.innerHTML =
      '<div class="mSheetBoxV1"><div class="mSheetGripV1"></div><h3>' + t.head + '</h3>' +
      '<a class="mCallV1" href="tel:' + PHONE + '">' + I.call + '<span>' + t.call + ' 068-832-032</span></a>' +
      '<a class="mWaV1" href="" target="_blank" rel="noopener">' + I.wa + '<span>' + t.wa + '</span></a>' +
      '<a class="mTgV1" href="https://t.me/' + TG + '" target="_blank" rel="noopener">' + I.tg + '<span>' + t.tg + '</span></a>' +
      '<button type="button" class="mRowV1 mInstV1" data-install hidden><span>' + t.install + '</span><small>' + t.installD + '</small></button>' +
      '<button type="button" class="mRowV1 mSheetCloseV1">' + t.close + '</button></div>';
    document.body.appendChild(sheet);
    function open(){ sheet.querySelector(".mWaV1").href = "https://api.whatsapp.com/send?phone=" + WA + "&text=" + encodeURIComponent(msg()); sheet.classList.add("isOpenV1"); document.documentElement.style.overflow = "hidden"; try{ document.dispatchEvent(new CustomEvent("apex-sheet-open", {detail:{sheet:sheet}})); }catch(e){} }
    function close(){ sheet.classList.remove("isOpenV1"); document.documentElement.style.overflow = ""; }
    nav.querySelector('[data-tab="contact"]').addEventListener("click", open);
    sheet.addEventListener("click", function(e){ if(e.target === sheet || e.target.closest(".mSheetCloseV1") || e.target.closest("a")) close(); });
    document.addEventListener("keydown", function(e){ if(e.key === "Escape") close(); });
    window.apexSheetClose = close;

    // Пока в фокусе поле ввода — прячем (иначе на iOS панель прыгает над клавиатурой и закрывает поле).
    var isField = function(e){ return e && /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName) && !/^(checkbox|radio|button|submit)$/.test(e.type || ""); };
    document.addEventListener("focusin", function(e){ if(isField(e.target)) document.body.classList.add("mBarHideV1"); });
    document.addEventListener("focusout", function(){ setTimeout(function(){ if(!isField(document.activeElement)) document.body.classList.remove("mBarHideV1"); }, 80); });
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
})();
