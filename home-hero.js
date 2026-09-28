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
    const AUTOPLAY_MS = 7000;
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
    function restart(){ clearInterval(timer); timer = setInterval(next, AUTOPLAY_MS); }
    restart();

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
    const makeSel = $("#heroSearchMake"), modelSel = $("#heroSearchModel"), genSel = $("#heroSearchGen"),
      genRow = $("#heroSearchGenRow"), yearFromSel = $("#heroSearchYearFrom"), yearToSel = $("#heroSearchYearTo"),
      vinInp = $("#heroSearchVin"), archiveChk = $("#heroSearchArchive"),
      btn = $("#heroSearchBtn"), countEl = $("#heroSearchCount");
    if(!makeSel || !btn) return;

    // Года — те же границы, что у полей yearFrom/yearTo в фильтрах каталога (1980..текущий+1).
    if(yearFromSel && yearToSel){
      const curYear = new Date().getFullYear() + 1;
      let opts = "";
      for(let y = curYear; y >= 1980; y--) opts += `<option value="${y}">${y}</option>`;
      yearFromSel.insertAdjacentHTML("beforeend", opts);
      yearToSel.insertAdjacentHTML("beforeend", opts);
      yearFromSel.addEventListener("change", scheduleCount);
      yearToSel.addEventListener("change", scheduleCount);
    }

    const cache = {makes:null, models:{}, gens:{}};
    let countToken = 0;

    function fillSelect(sel, items, phKey){
      sel.innerHTML = `<option value="">${escapeHtml(L(phKey))}</option>` +
        items.map(it => `<option value="${it.id}">${escapeHtml(it.name)}</option>`).join("");
    }
    function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

    async function ensureMakes(){
      if(cache.makes) return cache.makes;
      try{
        const r = await fetch("/api/auctions?action=manufacturers").then(x => x.json());
        cache.makes = Array.isArray(r.items) ? r.items : [];
      }catch(e){ cache.makes = []; }
      fillSelect(makeSel, cache.makes, "Выбрать марку");
      return cache.makes;
    }
    async function ensureModels(makeId){
      if(cache.models[makeId]) return cache.models[makeId];
      try{
        const r = await fetch("/api/auctions?action=models&manufacturer_id=" + encodeURIComponent(makeId)).then(x => x.json());
        cache.models[makeId] = Array.isArray(r.items) ? r.items : [];
      }catch(e){ cache.models[makeId] = []; }
      return cache.models[makeId];
    }
    async function ensureGens(modelId){
      if(cache.gens[modelId]) return cache.gens[modelId];
      try{
        const r = await fetch("/api/auctions?action=generations&model_id=" + encodeURIComponent(modelId)).then(x => x.json());
        cache.gens[modelId] = Array.isArray(r.items) ? r.items : [];
      }catch(e){ cache.gens[modelId] = []; }
      return cache.gens[modelId];
    }

    // Марки грузим один раз, как только человек впервые коснулся выпадашки (не мешаем LCP главной).
    let makesLoading = null;
    makeSel.addEventListener("pointerdown", () => { if(!makesLoading) makesLoading = ensureMakes(); }, {once:true});
    makeSel.addEventListener("focus", () => { if(!makesLoading) makesLoading = ensureMakes(); }, {once:true});

    makeSel.addEventListener("change", async () => {
      modelSel.innerHTML = `<option value="">${escapeHtml(L("Выбрать модель"))}</option>`;
      modelSel.disabled = true;
      genRow.hidden = true;
      genSel.innerHTML = `<option value="">${escapeHtml(L("Выбрать поколение"))}</option>`;
      if(!makeSel.value){ scheduleCount(); return; }
      const items = await ensureModels(makeSel.value);
      fillSelect(modelSel, items, "Выбрать модель");
      modelSel.disabled = false;
      scheduleCount();
    });

    modelSel.addEventListener("change", async () => {
      genRow.hidden = true;
      genSel.innerHTML = `<option value="">${escapeHtml(L("Выбрать поколение"))}</option>`;
      if(!modelSel.value){ scheduleCount(); return; }
      const items = await ensureGens(modelSel.value);
      if(items.length){
        fillSelect(genSel, items, "Выбрать поколение");
        genRow.hidden = false;
      }
      scheduleCount();
    });
    genSel.addEventListener("change", scheduleCount);
    archiveChk.addEventListener("change", scheduleCount);

    function buildParams(){
      const p = new URLSearchParams();
      if(makeSel.value) p.set("make", makeSel.value);
      if(modelSel.value) p.set("model", modelSel.value);
      if(genSel.value) p.set("generation", genSel.value);
      if(yearFromSel && yearFromSel.value) p.set("yearFrom", yearFromSel.value);
      if(yearToSel && yearToSel.value) p.set("yearTo", yearToSel.value);
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
      const vin = (vinInp.value || "").trim();
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
    vinInp.addEventListener("keydown", e => { if(e.key === "Enter") btn.click(); });
  }

  function boot(){ initSlider(); initSearch(); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
