/* Авто из Кореи — страница /korea (30.10.2026). Источник: /api/korea (live, domain_id=12 / Encar
   у auctionsapi.com). Цену сознательно не показываем — см. CLAUDE.md. Карточка открывает общую
   форму заявки (как «Узнать цену»), а не отдельную страницу лота — её для корейских машин пока нет. */
(function(){
  "use strict";

  var grid = document.getElementById("koreaGridV1");
  var countEl = document.getElementById("koreaCountV1");
  var moreWrap = document.getElementById("koreaMoreWrapV1");
  var moreBtn = document.getElementById("koreaMoreBtnV1");
  if(!grid) return;

  var PER_PAGE = 24;
  var state = {page:0, items:[], hasMore:true, loading:false, failed:false};

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }
  function T(s){ return typeof window.i18nT === "function" ? window.i18nT(s) : s; }

  function chips(it){
    var out = [];
    if(it.mileageText) out.push(it.mileageText);
    if(it.fuel) out.push(T(it.fuel));
    if(it.transmission) out.push(T(it.transmission));
    return out.map(function(x){ return "<span>" + esc(x) + "</span>"; }).join("");
  }

  function card(it, idx){
    var img = it.image
      ? '<img src="' + esc(it.image) + '" alt="' + esc(it.title) + '" width="640" height="480" loading="lazy" decoding="async">'
      : '<div class="koreaNoImgV1"></div>';
    return '<button type="button" class="koreaCardV1" data-korea-idx="' + idx + '">'
      + '<div class="koreaCardImgV1">' + img
        + '<span class="koreaBadgeV1">' + esc(T("Корея")) + '</span>'
        + (it.images.length > 1 ? '<span class="koreaPhotoCntV1">' + it.images.length + ' ' + esc(T("фото")) + '</span>' : "")
      + '</div>'
      + '<div class="koreaCardBodyV1">'
        + '<h3 data-no-i18n="true">' + esc(it.title) + '</h3>'
        + '<div class="koreaChipsV1">' + chips(it) + '</div>'
        + '<div class="koreaCardFootV1">'
          + '<span class="koreaPriceNoteV1">' + esc(T("Цена по запросу")) + '</span>'
          + '<span class="koreaMoreV1">' + esc(T("Узнать цену →")) + '</span>'
        + '</div>'
      + '</div>'
    + '</button>';
  }

  function skeletons(n){
    var out = "";
    for(var i = 0; i < n; i++) out += '<div class="koreaCardV1 koreaSkelV1"><div class="koreaCardImgV1"></div><div class="koreaCardBodyV1"><i></i><i></i><i></i></div></div>';
    return out;
  }

  function emptyState(){
    return '<div class="koreaEmptyV1">'
      + '<h3>' + esc(T("Сейчас список обновляется")) + '</h3>'
      + '<p>' + esc(T("Не смогли загрузить актуальные предложения из Кореи. Напишите нам — пришлём подборку вручную, пока список восстанавливается.")) + '</p>'
      + '<a class="transitBtnV1 isRedV1" href="https://t.me/fedukusa" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 20px;border-radius:12px;background:var(--red);color:#fff;font-weight:700;text-decoration:none;">' + esc(T("Написать в Telegram")) + '</a>'
    + '</div>';
  }

  function render(){
    if(countEl) countEl.textContent = state.items.length ? String(state.items.length) : "";
    if(!state.items.length){
      grid.innerHTML = state.loading ? skeletons(6) : emptyState();
    } else {
      grid.innerHTML = state.items.map(function(it, idx){ return card(it, idx); }).join("");
    }
    if(moreWrap) moreWrap.hidden = !state.items.length || !state.hasMore;
  }

  function load(){
    if(state.loading) return;
    state.loading = true;
    state.page += 1;
    if(state.page === 1) render(); // покажем скелетоны на первой загрузке
    if(moreBtn){ moreBtn.disabled = true; moreBtn.textContent = T("Загрузка…"); }
    fetch("/api/korea?page=" + state.page + "&per_page=" + PER_PAGE)
      .then(function(r){ return r.json(); })
      .then(function(d){
        var items = Array.isArray(d && d.items) ? d.items : [];
        state.items = state.items.concat(items);
        state.hasMore = !!(d && d.hasMore);
        state.failed = !items.length && state.page === 1 && (!d || d.mode === "fallback");
      })
      .catch(function(){
        state.hasMore = false;
        state.failed = state.page === 1;
      })
      .then(function(){
        state.loading = false;
        if(moreBtn){ moreBtn.disabled = false; moreBtn.textContent = T("Показать ещё"); }
        render();
      });
  }

  if(moreBtn) moreBtn.addEventListener("click", load);
  load();

  /* ── Модалка заявки по карточке ── */
  var modal = null;
  function ensureModal(){
    if(modal) return modal;
    modal = document.createElement("div");
    modal.id = "koreaModalV1";
    modal.className = "koreaModalV1";
    modal.hidden = true;
    modal.innerHTML = '<div class="koreaModalCardV1">'
      + '<button type="button" class="koreaModalCloseV1" data-korea-close aria-label="' + esc(T("Закрыть")) + '">✕</button>'
      + '<h3>' + esc(T("Узнать цену")) + '</h3>'
      + '<div class="koreaModalCarV1" id="koreaModalCarV1" data-no-i18n="true"></div>'
      + '<form id="koreaModalFormV1" novalidate>'
        + '<input name="name" type="text" autocomplete="name" placeholder="' + esc(T("Ваше имя")) + '" required>'
        + '<input name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="' + esc(T("Телефон или Telegram")) + '" required>'
        + '<input name="hp_website" type="text" tabindex="-1" autocomplete="off" class="koreaModalHpV1" aria-hidden="true">'
        + '<button type="submit">' + esc(T("Оставить заявку")) + '</button>'
        + '<small id="koreaModalMsgV1" class="koreaModalMsgV1"></small>'
      + '</form>'
    + '</div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function(e){
      if(e.target === modal || e.target.closest("[data-korea-close]")) closeModal();
    });
    modal.querySelector("#koreaModalFormV1").addEventListener("submit", submitLead);
    return modal;
  }

  var currentCar = null;
  function openModal(it){
    currentCar = it;
    var m = ensureModal();
    var carLine = m.querySelector("#koreaModalCarV1");
    if(carLine) carLine.textContent = it.title + (it.mileageText ? " — " + it.mileageText : "");
    var form = m.querySelector("#koreaModalFormV1");
    form.reset();
    form.hidden = false;
    var ok = m.querySelector(".koreaModalOkV1");
    if(ok) ok.remove();
    var msg = m.querySelector("#koreaModalMsgV1");
    if(msg) msg.textContent = "";
    m.hidden = false;
    document.body.classList.add("lbOpenV1");
  }
  function closeModal(){
    if(modal) modal.hidden = true;
    document.body.classList.remove("lbOpenV1");
  }
  document.addEventListener("keydown", function(e){
    if(e.key === "Escape" && modal && !modal.hidden) closeModal();
  });

  function submitLead(e){
    e.preventDefault();
    var form = e.target;
    var msg = document.getElementById("koreaModalMsgV1");
    var name = form.name.value.trim(), phone = form.phone.value.trim();
    if(name.length < 2 || phone.length < 5){ if(msg) msg.textContent = T("Укажите имя и контакт для связи"); return; }
    var btn = form.querySelector("button[type=submit]"); btn.disabled = true;
    var it = currentCar || {};
    fetch("/api/auctions?action=lead", {
      method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({
        name:name, phone:phone, hp_website:form.hp_website.value,
        source:"Авто из Кореи", vin:it.vin || "",
        page:location.href,
        comment:"Авто из Кореи" + (it.id ? " #" + it.id : "") + ": " + (it.title || "") + (it.mileageText ? " — " + it.mileageText : "")
      })
    }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(d){ return r.ok && d.ok; }); })
      .catch(function(){ return false; })
      .then(function(ok){
        if(ok){
          form.hidden = true;
          var card = form.closest(".koreaModalCardV1");
          var div = document.createElement("div");
          div.className = "koreaModalOkV1";
          div.innerHTML = "<b>" + esc(T("Заявка отправлена!")) + "</b><span>" + esc(T("Мы свяжемся с вами в ближайшее время.")) + "</span>";
          card.appendChild(div);
        } else {
          btn.disabled = false;
          if(msg) msg.textContent = T("Не удалось отправить. Напишите нам в WhatsApp или Telegram.");
        }
      });
  }

  grid.addEventListener("click", function(e){
    var c = e.target.closest("[data-korea-idx]");
    if(!c) return;
    var it = state.items[Number(c.getAttribute("data-korea-idx"))];
    if(it) openModal(it);
  });
})();
