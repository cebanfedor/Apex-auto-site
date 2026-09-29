// Hero-слайдер (29.09.2026, Федор: «как у ДримБида») — 3 слайда, автопрокрутка + точки,
// первый слайд («Быстрый поиск авто») активен по умолчанию. Лёгкий отдельный файл: главная
// намеренно не грузит тяжёлый auctions.js — марки/модели/поколения тянутся тем же
// action=manufacturers|models|generations API, что и каталог, но лениво и с кэшем в памяти.
(function(){
  "use strict";
  const L = window.i18nT || (s => s);
  const $ = sel => document.querySelector(sel);

  /* ================= Слайдер ================= */
  function initSlider(){
    const track = document.getElementById("heroSlidesV1");
    const dotsWrap = document.getElementById("heroDotsV1");
    if(!track || !dotsWrap) return;
    const slides = Array.from(track.querySelectorAll(".heroSlideV1"));
    if(slides.length < 2) return;
    let idx = Math.max(0, slides.findIndex(s => s.classList.contains("heroSlideActiveV1")));
    const AUTOPLAY_MS = 10000;
    let timer = null;

    slides.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", `${L("Слайд")} ${i + 1}`);
      if(i === idx) b.classList.add("heroDotActiveV1");
      b.addEventListener("click", () => { go(i); restart(); });
      dotsWrap.appendChild(b);
    });
    const dots = Array.from(dotsWrap.children);

    function go(i){
      if(i === idx) return;
      slides[idx].classList.remove("heroSlideActiveV1");
      if(dots[idx]) dots[idx].classList.remove("heroDotActiveV1");
      idx = i;
      slides[idx].classList.add("heroSlideActiveV1");
      if(dots[idx]) dots[idx].classList.add("heroDotActiveV1");
    }
    function next(){ go((idx + 1) % slides.length); }
    function prev(){ go((idx - 1 + slides.length) % slides.length); }
    function restart(){ clearInterval(timer); timer = setInterval(next, AUTOPLAY_MS); }
    restart();

    const prevBtn = document.getElementById("heroArrowPrevV1"), nextBtn = document.getElementById("heroArrowNextV1");
    if(prevBtn) prevBtn.addEventListener("click", () => { prev(); restart(); });
    if(nextBtn) nextBtn.addEventListener("click", () => { next(); restart(); });

    // Не дёргать слайд, пока открыт/в фокусе виджет поиска (не сбрасывать выбор марки/модели).
    const card = document.querySelector(".heroSearchCardV1");
    if(card){
      card.addEventListener("focusin", () => clearInterval(timer));
      card.addEventListener("focusout", () => { setTimeout(() => { if(!card.contains(document.activeElement)) restart(); }, 30); });
    }
    document.addEventListener("visibilitychange", () => { if(document.hidden) clearInterval(timer); else restart(); });
  }

  /* ================= Виджет «Быстрый поиск авто» ================= */
  function initSearch(){
    const card = $(".heroSearchCardV1");
    const makeBtn = $("#heroSearchMakeBtn"), makePanel = $("#heroSearchMakePanel"),
      makeSearch = $("#heroSearchMakeSearch"), makeList = $("#heroSearchMakeList"),
      modelBtn = $("#heroSearchModelBtn"), modelPanel = $("#heroSearchModelPanel"),
      modelSearch = $("#heroSearchModelSearch"), modelList = $("#heroSearchModelList"),
      yearFromBtn = $("#heroSearchYearFromBtn"), yearFromPanel = $("#heroSearchYearFromPanel"), yearFromList = $("#heroSearchYearFromList"),
      yearToBtn = $("#heroSearchYearToBtn"), yearToPanel = $("#heroSearchYearToPanel"), yearToList = $("#heroSearchYearToList"),
      vinInp = $("#heroSearchVin"), archiveChk = $("#heroSearchArchive"),
      btn = $("#heroSearchBtn"), countEl = $("#heroSearchCount");
    if(!makeBtn || !btn) return;

    // Года — те же границы, что у полей yearFrom/yearTo в фильтрах каталога (1980..текущий+1).
    // 29.09.2026 (Федор: «выпадашка по году не выходит за пределы блока») — были нативные <select>:
    // браузер рисует их выпадающий список как системный попап поверх всего экрана, а не как свою
    // стилизованную панель внутри карточки (в отличие от марки/модели). Тот же createPicker, что и
    // у них — список просто статичный (без похода в сеть), без строки поиска.
    const yearItems = [];
    { const curYear = new Date().getFullYear() + 1; for(let y = curYear; y >= 1980; y--) yearItems.push({id:y, name:String(y)}); }

    const cache = {models:{}};
    const state = {makeId:"", makeName:"", modelId:"", modelName:"", yearFrom:"", yearTo:""};
    let countToken = 0;

    function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

    async function ensureModels(makeId){
      if(cache.models[makeId]) return cache.models[makeId];
      try{
        const r = await fetch("/api/auctions?action=models&manufacturer_id=" + encodeURIComponent(makeId)).then(x => x.json());
        cache.models[makeId] = Array.isArray(r.items) ? r.items : [];
      }catch(e){ cache.models[makeId] = []; }
      return cache.models[makeId];
    }

    // Свой выпадающий список (поиск + логотипы + счётчики, как «Марка/Модель» на /auctions) —
    // нативный <select> не перерисовывает уже открытый список при догрузке option'ов асинхронно,
    // человек видел пустой список пока марки ещё летели по сети (action=manufacturers).
    const pickers = [];
    function closeAllPanels(except){ pickers.forEach(p => { if(p !== except) p.close(); }); }
    function createPicker({btn, panel, search, list, getItems, onPick, emptyMsg}){
      let items = [], loaded = false, loading = null;
      function rowHtml(it){
        const logo = it.image ? `<img class="msLogoV1" src="${escapeHtml(it.image)}" alt="" loading="lazy">` : "";
        const qty = it.qty ? `<i>${Number(it.qty).toLocaleString("ru-RU")}</i>` : "";
        return `<button type="button" class="msRowV1" data-id="${escapeHtml(String(it.id))}">${logo}<span class="msNameV1">${escapeHtml(it.name)}</span>${qty}</button>`;
      }
      function render(filter){
        const f = (filter || "").trim().toLowerCase();
        const shown = f ? items.filter(it => it.name.toLowerCase().includes(f)) : items;
        list.innerHTML = shown.length ? shown.map(rowHtml).join("")
          : `<div class="heroSearchPanelEmptyV1">${escapeHtml(L(items.length ? "Ничего не найдено" : (emptyMsg || "Загрузка…")))}</div>`;
      }
      async function open(){
        closeAllPanels(pub);
        panel.hidden = false;
        btn.setAttribute("aria-expanded", "true");
        if(card) card.classList.add("heroSearchPanelOpenV1");
        if(search) search.value = "";
        render("");
        if(!loaded){
          if(!loading) loading = getItems().then(r => { items = r || []; loaded = true; });
          await loading;
          render("");
        }
        if(search) search.focus();
      }
      function close(){ panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
      btn.addEventListener("click", () => { if(btn.disabled) return; panel.hidden ? open() : close(); });
      if(search) search.addEventListener("input", () => render(search.value));
      list.addEventListener("click", e => {
        const row = e.target.closest(".msRowV1");
        if(!row) return;
        const it = items.find(x => String(x.id) === row.dataset.id);
        if(it) onPick(it);
        close();
      });
      const pub = {close, reset(){ items = []; loaded = false; loading = null; }};
      pickers.push(pub);
      return pub;
    }
    document.addEventListener("click", e => {
      if(e.target.closest(".heroSearchPickV1")) return;
      closeAllPanels();
      if(card) card.classList.remove("heroSearchPanelOpenV1");
    });
    document.addEventListener("keydown", e => { if(e.key === "Escape"){ closeAllPanels(); if(card) card.classList.remove("heroSearchPanelOpenV1"); } });

    const modelPicker = createPicker({
      btn: modelBtn, panel: modelPanel, search: modelSearch, list: modelList,
      getItems: () => ensureModels(state.makeId),
      onPick(it){
        state.modelId = String(it.id); state.modelName = it.name;
        modelBtn.querySelector("span").textContent = it.name;
        modelBtn.classList.add("hasValV1");
        scheduleCount();
      }
    });
    createPicker({
      btn: makeBtn, panel: makePanel, search: makeSearch, list: makeList,
      getItems: () => fetch("/api/auctions?action=manufacturers").then(x => x.json()).then(r => Array.isArray(r.items) ? r.items : []).catch(() => []),
      onPick(it){
        state.makeId = String(it.id); state.makeName = it.name;
        makeBtn.querySelector("span").textContent = it.name;
        makeBtn.classList.add("hasValV1");
        state.modelId = ""; state.modelName = "";
        modelBtn.querySelector("span").textContent = L("Выбрать модель");
        modelBtn.classList.remove("hasValV1");
        modelBtn.disabled = false;
        modelPicker.reset();
        scheduleCount();
      }
    });

    if(yearFromBtn && yearToBtn){
      createPicker({
        btn: yearFromBtn, panel: yearFromPanel, list: yearFromList,
        getItems: () => Promise.resolve(yearItems),
        onPick(it){
          state.yearFrom = String(it.id);
          yearFromBtn.querySelector("span").textContent = it.name;
          yearFromBtn.classList.add("hasValV1");
          scheduleCount();
        }
      });
      createPicker({
        btn: yearToBtn, panel: yearToPanel, list: yearToList,
        getItems: () => Promise.resolve(yearItems),
        onPick(it){
          state.yearTo = String(it.id);
          yearToBtn.querySelector("span").textContent = it.name;
          yearToBtn.classList.add("hasValV1");
          scheduleCount();
        }
      });
    }

    archiveChk.addEventListener("change", scheduleCount);

    function buildParams(){
      const p = new URLSearchParams();
      if(state.makeId) p.set("make", state.makeId);
      if(state.modelId) p.set("model", state.modelId);
      if(state.yearFrom) p.set("yearFrom", state.yearFrom);
      if(state.yearTo) p.set("yearTo", state.yearTo);
      p.set("tab", archiveChk.checked ? "archived" : "all");
      p.set("auction", "all");
      return p;
    }
    function fmtLots(n){
      const num = n.toLocaleString("ru-RU");
      const lang = window.APEX_LANG || "ru";
      if(lang !== "ru") return num + " " + L("лотов");
      const n10 = n % 10, n100 = n % 100;
      let word = "лотов";
      if(n100 < 11 || n100 > 14){
        if(n10 === 1) word = "лот"; else if(n10 >= 2 && n10 <= 4) word = "лота";
      }
      return num + " " + word;
    }
    let countTimer = null;
    function scheduleCount(){
      clearTimeout(countTimer);
      countTimer = setTimeout(refreshCount, 300);
    }
    async function refreshCount(){
      const p = buildParams();
      p.set("per_page", "1");
      p.set("action", "search");
      const my = ++countToken;
      try{
        const r = await fetch("/api/auctions?" + p.toString()).then(x => x.json());
        if(my !== countToken) return;
        countEl.textContent = r && r.ok ? fmtLots(Number(r.total) || 0) : "—";
      }catch(e){ if(my === countToken) countEl.textContent = "—"; }
    }
    // 29.09.2026: словарь RO/EN (i18n-dict.js, ~250 КБ) грузится параллельно с разбором
    // страницы (см. i18n.js ensureDict) — если запустить refreshCount() (L("лотов") внутри
    // fmtLots) ДО того, как словарь пришёл, перевод молча не находится и остаётся «лотов» на
    // RO/EN навсегда (fmtLots вызывается один раз, повторно текст никто не переводит). Тот же
    // класс гонки, что уже чинили в auctions.js (renderDetailI18nSafe) — здесь просто ждём
    // словарь перед первым вызовом; все ПОСЛЕДУЮЩИЕ вызовы (смена марки/модели) идут уже после.
    const lang = window.APEX_LANG || "ru";
    if(lang !== "ru" && window.__apexEnsureDict) window.__apexEnsureDict(refreshCount);
    else refreshCount();

    btn.addEventListener("click", () => {
      // VIN-поле убрано из hero (дублировало «Разобрать» под hero, 30.09.2026); vinInp может
      // отсутствовать — тогда всегда собираем поиск по марке/модели/году.
      const vin = vinInp ? (vinInp.value || "").trim() : "";
      const p = new URLSearchParams();
      if(vin){
        p.set("vin", vin);
        if(archiveChk.checked) p.set("tab", "archived");
      }else{
        const fp = buildParams();
        for(const [k, v] of fp.entries()) p.set(k, v);
      }
      location.href = "/auctions?" + p.toString();
    });
    if(vinInp) vinInp.addEventListener("keydown", e => { if(e.key === "Enter") btn.click(); });
  }

  function boot(){ initSlider(); initSearch(); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
