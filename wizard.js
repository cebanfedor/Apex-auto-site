/* Мастер «Подбери мне» (26.11.2026): 5 коротких вопросов → готовая ссылка на каталог с фильтрами.
   Открывается по клику на любой элемент с атрибутом data-open-wizard. Стили встроены (не зависят от версий CSS).
   Параметры совпадают с полями формы каталога: budget, body, fuel, yearFrom, condition, smart, sellerKind. */
(function(){
  "use strict";
  if(window.__apexWizard) return; window.__apexWizard = true;
  var lang = (window.APEX_LANG || document.documentElement.lang || "ru").slice(0, 2);
  if(lang !== "ro" && lang !== "en") lang = "ru";
  var TX = {
    ru: {title:"Подбери мне авто", sub:"5 вопросов — и покажу подходящие лоты", back:"Назад", close:"Закрыть", any:"Не важно", show:"Показать авто",
      q1:"Какой бюджет под ключ в Кишинёве?", q2:"Какой кузов?", q3:"Какое топливо?", q4:"Какой возраст?", q5:"Что ещё важно?",
      b1:"до $8 000", b2:"до $12 000", b3:"до $18 000", b4:"до $25 000", b5:"до $35 000",
      sedan:"Седан", suv:"Кроссовер / SUV", pickup:"Пикап", van:"Минивэн", coupe:"Купе / кабриолет", hatch:"Хэтчбек / универсал",
      gas:"Бензин", hybrid:"Гибрид", ev:"Электро", diesel:"Дизель",
      y1:"2022 и новее", y2:"2019 и новее", y3:"2016 и новее",
      runs:"Заводится и едет", clean:"Без перекупов (Clean Select)", ins:"Только от страховых компаний",
      note:"Бюджет — это полная цена с доставкой и растаможкой. Ставку на аукционе мы посчитаем сами."},
    ro: {title:"Alege-mi o mașină", sub:"5 întrebări — și îți arăt loturile potrivite", back:"Înapoi", close:"Închide", any:"Nu contează", show:"Arată mașinile",
      q1:"Ce buget la cheie în Chișinău?", q2:"Ce tip de caroserie?", q3:"Ce combustibil?", q4:"Ce vechime?", q5:"Ce mai contează?",
      b1:"până la $8 000", b2:"până la $12 000", b3:"până la $18 000", b4:"până la $25 000", b5:"până la $35 000",
      sedan:"Sedan", suv:"Crossover / SUV", pickup:"Pick-up", van:"Monovolum", coupe:"Coupe / decapotabilă", hatch:"Hatchback / break",
      gas:"Benzină", hybrid:"Hibrid", ev:"Electric", diesel:"Diesel",
      y1:"2022 și mai noi", y2:"2019 și mai noi", y3:"2016 și mai noi",
      runs:"Pornește și merge", clean:"Fără revânzători (Clean Select)", ins:"Doar de la companii de asigurări",
      note:"Bugetul este prețul total cu livrare și vămuire. Oferta la licitație o calculăm noi."},
    en: {title:"Find me a car", sub:"5 questions — then I'll show matching lots", back:"Back", close:"Close", any:"Doesn't matter", show:"Show cars",
      q1:"What's your turnkey budget in Chișinău?", q2:"Which body type?", q3:"Which fuel?", q4:"How old?", q5:"Anything else?",
      b1:"up to $8,000", b2:"up to $12,000", b3:"up to $18,000", b4:"up to $25,000", b5:"up to $35,000",
      sedan:"Sedan", suv:"Crossover / SUV", pickup:"Pickup", van:"Minivan", coupe:"Coupe / convertible", hatch:"Hatchback / wagon",
      gas:"Gasoline", hybrid:"Hybrid", ev:"Electric", diesel:"Diesel",
      y1:"2022 or newer", y2:"2019 or newer", y3:"2016 or newer",
      runs:"Starts and drives", clean:"No flippers (Clean Select)", ins:"Insurance-company sellers only",
      note:"Budget is the full price including delivery and customs. We'll work out the auction bid for you."}
  };
  var t = TX[lang];
  // Шаги: [ключ ответа, вопрос, варианты [подпись, значение]]
  var STEPS = [
    ["budget", t.q1, [[t.b1, "8000"], [t.b2, "12000"], [t.b3, "18000"], [t.b4, "25000"], [t.b5, "35000"], [t.any, ""]]],
    ["body", t.q2, [[t.sedan, "1"], [t.suv, "5"], [t.pickup, "4"], [t.van, "7"], [t.coupe, "3,6"], [t.hatch, "11,2"], [t.any, ""]]],
    ["fuel", t.q3, [[t.gas, "4"], [t.hybrid, "3,5"], [t.ev, "2"], [t.diesel, "1"], [t.any, ""]]],
    ["yearFrom", t.q4, [[t.y1, "2022"], [t.y2, "2019"], [t.y3, "2016"], [t.any, ""]]]
  ];
  var ans = {}, step = 0, root = null, extra = {condition: false, smart: true, sellerKind: false};

  function css(){
    if(document.getElementById("wizCssV1")) return;
    var s = document.createElement("style"); s.id = "wizCssV1";
    s.textContent =
      ".wizV1{position:fixed;inset:0;z-index:var(--z-overlay,10001);display:flex;align-items:flex-end;justify-content:center;visibility:hidden;pointer-events:none}" +
      ".wizV1.isOpenV1{visibility:visible;pointer-events:auto}" +
      ".wizV1::before{content:'';position:absolute;inset:0;background:rgba(15,18,24,.55);opacity:0;transition:opacity .2s}" +
      ".wizV1.isOpenV1::before{opacity:1}" +
      ".wizBoxV1{position:relative;width:100%;max-width:520px;max-height:92dvh;overflow:auto;padding:12px 18px calc(18px + env(safe-area-inset-bottom));border-radius:22px 22px 0 0;background:#fff;box-shadow:0 -14px 44px rgba(17,20,26,.28);transform:translateY(105%);transition:transform .26s cubic-bezier(.2,.8,.2,1);font-family:Onest,Inter,system-ui,sans-serif;color:#11141a}" +
      ".wizV1.isOpenV1 .wizBoxV1{transform:none}" +
      "@media (min-width:700px){.wizV1{align-items:center}.wizBoxV1{border-radius:22px;padding-bottom:20px;transform:translateY(24px) scale(.98);opacity:0;transition:transform .22s,opacity .22s}.wizV1.isOpenV1 .wizBoxV1{transform:none;opacity:1}}" +
      ".wizGripV1{width:40px;height:4px;margin:0 auto 10px;border-radius:4px;background:#d5dae2}" +
      "@media (min-width:700px){.wizGripV1{display:none}}" +
      ".wizTopV1{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}" +
      ".wizTopV1 b{font:800 18px Onest,system-ui,sans-serif}" +
      ".wizTopV1 button{width:36px;height:36px;border:0;border-radius:50%;background:#f1f4f8;color:#44505f;font-size:20px;line-height:1;cursor:pointer}" +
      ".wizSubV1{margin:0 0 12px;font-size:13.5px;color:#667080}" +
      ".wizDotsV1{display:flex;gap:6px;margin:0 0 16px}" +
      ".wizDotsV1 i{flex:1;height:5px;border-radius:5px;background:#e6eaf0;transition:background .2s}" +
      ".wizDotsV1 i.isDoneV1{background:#ed0012}" +
      ".wizQV1{margin:0 0 12px;font:800 20px/1.25 Onest,system-ui,sans-serif;letter-spacing:-.01em}" +
      ".wizOptsV1{display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
      ".wizOptsV1 button{min-height:54px;padding:8px 12px;border:1.5px solid #dee1e6;border-radius:14px;background:#fff;font:700 15px/1.2 Onest,system-ui,sans-serif;color:#11141a;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .08s,border-color .15s,background .15s}" +
      ".wizOptsV1 button:active{transform:scale(.97)}" +
      ".wizOptsV1 button.isSelV1{border-color:#ed0012;background:#fff1f2;color:#b00010}" +
      ".wizOptsV1 button.isAnyV1{color:#667080;font-weight:600}" +
      ".wizOptsV1.isListV1{grid-template-columns:1fr}" +
      ".wizOptsV1.isListV1 button{display:flex;align-items:center;gap:12px;text-align:left}" +
      ".wizOptsV1.isListV1 button::before{content:'';flex:none;width:22px;height:22px;border:2px solid #c3cad4;border-radius:7px;background:#fff center/14px no-repeat;transition:all .15s}" +
      ".wizOptsV1.isListV1 button.isSelV1::before{border-color:#ed0012;background-color:#ed0012;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23fff' stroke-width='3.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7'/%3E%3C/svg%3E\")}" +
      ".wizNavV1{display:flex;gap:10px;margin-top:16px}" +
      ".wizNavV1 button{flex:1;min-height:50px;border:0;border-radius:14px;font:800 16px Onest,system-ui,sans-serif;cursor:pointer}" +
      ".wizBackV1{background:#f1f4f8;color:#44505f;flex:0 0 36%!important}" +
      ".wizGoV1{background:#ed0012;color:#fff;box-shadow:0 8px 20px rgba(237,0,18,.3)}" +
      ".wizNoteV1{margin:12px 0 0;font-size:12.5px;line-height:1.4;color:#667080}" +
      "@media (prefers-reduced-motion:reduce){.wizBoxV1,.wizV1::before{transition:none}}";
    document.head.appendChild(s);
  }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  function render(){
    var last = step >= STEPS.length;
    var dots = "";
    for(var i = 0; i < STEPS.length + 1; i++) dots += '<i class="' + (i <= step ? "isDoneV1" : "") + '"></i>';
    var body;
    if(!last){
      var st = STEPS[step];
      body = '<h3 class="wizQV1">' + esc(st[1]) + '</h3><div class="wizOptsV1">' +
        st[2].map(function(o){ var sel = ans[st[0]] === o[1] && ans[st[0]] !== undefined; return '<button type="button" data-v="' + esc(o[1]) + '" class="' + (sel ? "isSelV1 " : "") + (o[1] === "" ? "isAnyV1" : "") + '">' + esc(o[0]) + '</button>'; }).join("") + '</div>';
    }else{
      body = '<h3 class="wizQV1">' + esc(t.q5) + '</h3><div class="wizOptsV1 isListV1">' +
        [["condition", t.runs], ["smart", t.clean], ["sellerKind", t.ins]].map(function(o){ return '<button type="button" data-x="' + o[0] + '" class="' + (extra[o[0]] ? "isSelV1" : "") + '">' + esc(o[1]) + '</button>'; }).join("") + '</div>' +
        '<p class="wizNoteV1">' + esc(t.note) + '</p>' +
        '<div class="wizNavV1"><button type="button" class="wizBackV1" data-back>' + esc(t.back) + '</button><button type="button" class="wizGoV1" data-go>' + esc(t.show) + ' →</button></div>';
    }
    root.querySelector(".wizBoxV1").innerHTML =
      '<div class="wizGripV1"></div><div class="wizTopV1"><b>' + esc(t.title) + '</b><button type="button" data-close aria-label="' + esc(t.close) + '">×</button></div>' +
      '<p class="wizSubV1">' + esc(t.sub) + '</p><div class="wizDotsV1">' + dots + '</div>' + body +
      (!last && step > 0 ? '<div class="wizNavV1"><button type="button" class="wizBackV1" data-back>' + esc(t.back) + '</button></div>' : "");
  }
  function go(){
    var q = [];
    if(ans.budget) q.push("budget=" + ans.budget);
    if(ans.body) q.push("body=" + ans.body);
    if(ans.fuel) q.push("fuel=" + ans.fuel);
    if(ans.yearFrom) q.push("yearFrom=" + ans.yearFrom);
    if(extra.condition) q.push("condition=0");
    if(extra.smart) q.push("smart=1");
    if(extra.sellerKind) q.push("sellerKind=1");
    q.push("tab=all", "sort=soon");
    if(lang !== "ru") q.push("lang=" + lang);
    try{ localStorage.setItem("apexWizardV1", JSON.stringify({ans: ans, extra: extra, t: Date.now()})); }catch(e){}
    try{ if(window.apexTrack) window.apexTrack("wizard_done"); }catch(_){}
    location.href = "/auctions?" + q.join("&");
  }
  function open(){
    try{ if(window.apexTrack) window.apexTrack("wizard_start"); }catch(_){}
    css();
    if(!root){
      root = document.createElement("div"); root.className = "wizV1"; root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", t.title);
      root.innerHTML = '<div class="wizBoxV1"></div>';
      document.body.appendChild(root);
      root.addEventListener("click", function(e){
        if(e.target === root || e.target.closest("[data-close]")){ close(); return; }
        if(e.target.closest("[data-back]")){ step = Math.max(0, step - 1); render(); return; }
        if(e.target.closest("[data-go]")){ go(); return; }
        var x = e.target.closest("[data-x]");
        if(x){ extra[x.dataset.x] = !extra[x.dataset.x]; render(); return; }
        var b = e.target.closest("[data-v]");
        if(b){
          ans[STEPS[step][0]] = b.dataset.v;
          step++;
          setTimeout(render, 90);
          b.classList.add("isSelV1");
        }
      });
      document.addEventListener("keydown", function(e){ if(e.key === "Escape") close(); });
    }
    step = 0; ans = {};
    render();
    root.classList.add("isOpenV1");
    document.documentElement.style.overflow = "hidden";
    try{ if(window.apexSheetClose) window.apexSheetClose(); }catch(e){}
  }
  function close(){
    if(!root) return;
    root.classList.remove("isOpenV1");
    document.documentElement.style.overflow = "";
  }
  document.addEventListener("click", function(e){
    var el = e.target.closest("[data-open-wizard]");
    if(el){ e.preventDefault(); open(); }
  });
  window.apexWizard = {open: open, close: close};
  if(/[?&]wizard=1\b/.test(location.search)) setTimeout(open, 300);
})();
