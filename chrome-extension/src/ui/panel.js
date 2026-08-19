/* panel.js — одно окно: карточка лота, прозрачный расчёт, фото и текст поста.
   Любое изменение ставки или параметров сразу пересчитывает смету и обновляет пост. */
(function () {
  "use strict";
  const ApexX = window.ApexX;
  const U = ApexX.util;
  const D = ApexX.dict;
  const T = ApexX.templates;

  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "popup"; // popup | inline | window
  const inline = mode === "inline";
  const $ = (id) => document.getElementById(id);

  if (mode === "popup") document.body.classList.add("popupMode");
  if (mode === "window" || mode === "side") document.body.classList.add("windowMode");

  const hasExtensionApi =
    typeof chrome !== "undefined" && chrome.runtime && chrome.storage && chrome.storage.local;
  const demoMode = params.get("demo") === "1" || !hasExtensionApi;

  const state = {
    tabId: Number(params.get("tabId")) || null,
    settings: null,
    lot: null,
    estimate: null,
    selected: new Set(),
    locationManual: null,
    locOptions: [],
    locActive: -1,
    calcError: "",
    rates: { usdMdl: 0, eurMdl: 0, source: "" },
    saleAt: 0,
    draftRestored: false,
    calcSeq: 0,
    calcFrom: "",
    network: "telegram",
    lang: "ru",
    textDirty: false,
    apiError: ""
  };

  /* ---------- инфраструктура ---------- */

  function send(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(response || { ok: false, error: "Пустой ответ" });
      });
    });
  }

  function status(text, kind) {
    const node = $("status");
    node.textContent = text;
    node.className = "status" + (kind ? " " + kind : "");
    node.classList.toggle("hidden", !text);
  }

  async function resolveTab() {
    if (state.tabId) return state.tabId;
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tabId = tabs && tabs[0] && tabs[0].id;
    return state.tabId;
  }

  const money = (value) => U.money(Math.round(Number(value || 0)));

  /* ---------- сбор ---------- */

  /* Демо-лот: panel.html?demo=1 открывается в обычной вкладке без аукциона —
     так можно проверять вёрстку и расчёт, не заходя на Copart. */
  function demoSaleDate() {
    const d = new Date(Date.now() + 864e5); // завтра
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} 17:00`;
  }

  const DEMO_LOT = {
    auction: "copart", auctionLabel: "Copart", lot: "61881256", title: "2021 BMW X1 xDrive28i",
    year: "2021", make: "BMW", model: "X1", trim: "xDrive28i", bodyStyle: "Automobile",
    vin: "WBXJG9C0XM5T68911", location: "NJ - TRENTON", saleDate: demoSaleDate(),
    saleStatus: "MINIMUM_BID", odometer: "35,389 mi", odometerValue: 35389,
    primaryDamage: "Water/Flood", titleDoc: "NJ - Cert Of Title-salvage Flood",
    engine: "2.0L 4", cylinders: "4", fuel: "Gas", transmission: "Automatic",
    drive: "All Wheel Drive", colorExt: "Blue", keys: "Yes", seller: "Insurance Company",
    currentBid: 9500, estRetail: 21009, imagesDuplicates: 14,
    images: Array.from({ length: 12 }, (_, i) => `https://placehold.co/400x300?text=Photo+${i + 1}`),
    extra: { "Lot Condition": "Runs and drives", "Sale Doc State": "NJ" },
    sources: ["copart-dom", "copart-api", "apex-site"], url: "https://www.copart.com/lot/61881256"
  };

  async function collect() {
    if (demoMode) {
      state.lot = JSON.parse(JSON.stringify(DEMO_LOT));
      state.apiError = "";
      state.selected = new Set(state.lot.images.slice(0, 10));
      $("main").classList.remove("hidden");
      $("actionBar").classList.remove("hidden");
      renderLot();
      renderPhotos();
      fillCalcInputs();
      recompute();
      await Promise.all([showPublishHistory(), showReminder(), restoreDraft()]);
      return status("Демо-режим: данные подставлены вручную", "ok");
    }
    status("Собираю данные лота…");
    const tabId = await resolveTab();
    if (!tabId) return status("Не вижу активную вкладку", "error");

    const response = await send({ type: "apex:collect", tabId });
    if (!response.ok) return status(response.error || "Не удалось собрать лот", "error");

    state.lot = response.lot;
    state.apiError = response.apiError || "";
    state.selected = new Set(state.lot.images.slice(0, 10));
    state.textDirty = false;

    $("main").classList.remove("hidden");
    $("actionBar").classList.remove("hidden");

    renderLot();
    renderPhotos();
    fillCalcInputs();
    recompute();
    await Promise.all([showPublishHistory(), showReminder(), restoreDraft()]);

    const dup = state.lot.imagesDuplicates ? `, дублей и повторных кадров убрано ${state.lot.imagesDuplicates}` : "";
    status(
      (state.draftRestored ? "Восстановлен ваш черновик текста. " : "") +
        `Готово. Фото: ${state.lot.images.length}${dup}.` +
        (state.lot.vinMasked ? " VIN аукцион показывает частично — полный приходит из API." : "") +
        (state.apiError ? ` API: ${state.apiError}` : ""),
      "ok"
    );
  }

  /* ---------- карточка лота ---------- */

  const MONTHS = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"
  ];

  /** «26.08.2026 16:30 EEST» → {text: «26 августа, 16:30», when: today | tomorrow | later}. */
  function saleDateChip(value) {
    const raw = U.clean(value);
    if (!raw) return null;
    const parts = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,]+(\d{1,2}:\d{2}))?/);
    if (!parts) return { text: raw, when: "later" };
    const day = Number(parts[1]);
    const month = Number(parts[2]) - 1;
    const year = Number(parts[3]);
    const time = parts[4] ? ", " + parts[4] : "";
    const label = `${day} ${MONTHS[month] || ""}${time}`.trim();

    const sale = new Date(year, month, day);
    const today = new Date();
    const days = Math.round((sale - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 864e5);
    if (days === 0) return { text: `сегодня, ${label}`, when: "today" };
    if (days === 1) return { text: `завтра, ${label}`, when: "tomorrow" };
    return { text: label, when: "later" };
  }

  /** «21.08.2026, 17:00» → время в миллисекундах (в часовом поясе, указанном аукционом). */
  function saleTimestamp(value) {
    const parts = String(value || "").match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?\s*(AM|PM)?/i);
    if (!parts) return 0;
    let hour = Number(parts[4] || 0);
    const ampm = (parts[6] || "").toUpperCase();
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
    const date = new Date(Number(parts[3]), Number(parts[2]) - 1, Number(parts[1]), hour, Number(parts[5] || 0));
    return date.getTime() || 0;
  }

  function renderLot() {
    const lot = state.lot;
    $("lotTitle").textContent = lot.title || "Лот без названия";
    $("lotBadge").textContent = `${lot.auctionLabel} • ${lot.lot || "—"}`;
    $("lotLink").href = lot.url || lot.pageUrl || "#";

    // сегодня — зелёный, завтра — оранжевый, дальше — синий
    const saleDate = saleDateChip(lot.saleDate);
    const dateChip = $("lotDate");
    dateChip.textContent = saleDate ? "🗓 Торги " + saleDate.text : "";
    dateChip.classList.toggle("hidden", !saleDate);
    dateChip.classList.toggle("chipToday", !!saleDate && saleDate.when === "today");
    dateChip.classList.toggle("chipTomorrow", !!saleDate && saleDate.when === "tomorrow");

    const damage = T.damageText(lot);
    $("lotDamage").textContent = damage;
    $("lotDamage").classList.toggle("hidden", !damage);

    const saleStatus = D.ru("saleStatus", lot.saleStatus);
    $("lotStatus").textContent = saleStatus;
    $("lotStatus").classList.toggle("hidden", !saleStatus);

    $("bidCurrentValue").textContent = lot.currentBid ? money(lot.currentBid) : "нет";
    $("btnBidCurrent").disabled = !lot.currentBid;
  }

  /* ---------- расчёт ---------- */

  function fillCalcInputs() {
    const lot = state.lot;
    const calc = state.settings.calc;
    state.locationManual = null;
    $("calcBid").value = Number(lot.currentBid || lot.buyNow || 0) || "";
    $("calcType").value = ApexX.calc.vehicleTypeCode(lot);
    $("calcFuel").value = ApexX.calc.fuelCode(lot.fuel || lot.engine, lot);
    $("calcEngine").value = ApexX.calc.engineLiters(lot);
    $("calcExport").checked = !!calc.exportDocs;
    $("calcOffsite").checked = !!calc.offsite;
    const location = ApexX.calc.findLocation(lot);
    $("calcLocation").value = location ? locationLabel(location) : U.clean(lot.location || "");
    $("calcPort").value = (location && location.autoPort) || calc.defaultPort || "nj";
  }

  /* ---------- выбор площадки вручную ---------- */

  function locationLabel(item) {
    return item.displayName || item.location || [item.city, item.state].filter(Boolean).join(", ");
  }

  /** Список площадок под полем: фильтр по городу, штату или индексу. */
  function locationMatches(query) {
    const list = window.LOCATIONS || [];
    const q = U.norm(query);
    const auction = String(state.lot.auction || "").toLowerCase();
    const lotState = U.norm(String(state.lot.state || state.lot.location || "").match(/\b[A-Za-z]{2}\b/) || "");
    const scored = [];

    for (const item of list) {
      const label = locationLabel(item);
      const haystack = U.norm([item.location, item.city, item.state, item.zip].filter(Boolean).join(" "));
      let score;
      if (!q) {
        // без запроса показываем площадки штата лота — обычно нужна соседняя
        if (!lotState || U.norm(item.state) !== lotState) continue;
        score = 0;
      } else if (haystack.startsWith(q)) score = 0;
      else if (haystack.includes(q)) score = 1;
      else continue;

      if (String(item.auction || "").toLowerCase() !== auction) score += 0.5;
      scored.push({ item, label, score });
      if (scored.length > 400) break;
    }

    return scored.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label)).slice(0, 80);
  }

  function renderLocationList(query) {
    state.locOptions = locationMatches(query);
    state.locActive = -1;
    const box = $("locList");
    if (!state.locOptions.length) {
      box.innerHTML = '<div class="comboEmpty">Ничего не найдено — введите город, штат или индекс</div>';
      return;
    }
    box.innerHTML = state.locOptions
      .map(
        (option, i) =>
          `<div class="comboItem" data-index="${i}">
             <b>${U.escapeHtml(option.label)}</b>
             <i>${U.escapeHtml(option.item.auction || "")} · доставка $${Number(option.item.landPrice || option.item.autoLand || 0)}</i>
           </div>`
      )
      .join("");
  }

  function openLocationList(query) {
    renderLocationList(query !== undefined ? query : $("calcLocation").value);
    $("locList").classList.remove("hidden");
  }

  function closeLocationList() {
    $("locList").classList.add("hidden");
    state.locActive = -1;
  }

  function chooseLocation(index) {
    const option = state.locOptions[index];
    if (!option) return;
    state.locationManual = Object.assign({}, option.item, { matchLevel: "manual" });
    $("calcLocation").value = option.label;
    closeLocationList();
    recompute();
  }

  function highlightLocation(delta) {
    const items = Array.from($("locList").querySelectorAll(".comboItem"));
    if (!items.length) return;
    state.locActive = (state.locActive + delta + items.length) % items.length;
    items.forEach((node, i) => node.classList.toggle("active", i === state.locActive));
    const active = items[state.locActive];
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  /** Точное совпадение введённой строки с площадкой из базы. */
  function locationFromInput() {
    const value = U.clean($("calcLocation").value);
    if (!value) return null;
    const list = window.LOCATIONS || [];
    const norm = U.norm(value);
    const hit =
      list.find((item) => U.norm(locationLabel(item)) === norm) ||
      list.find((item) => U.norm(item.location) === norm);
    return hit ? Object.assign({}, hit, { matchLevel: "manual" }) : null;
  }

  function currentLocation() {
    if (state.locationManual) return state.locationManual;
    return ApexX.calc.findLocation(state.lot);
  }

  function renderLocationNote(location) {
    const note = $("locNote");
    if (!location) {
      note.textContent = $("calcLocation").value
        ? "Такой площадки нет в базе — выберите из подсказок или задайте порт вручную."
        : "Площадка не определена — доставка до порта не посчитана.";
      return;
    }
    const level = location.matchLevel;
    note.textContent =
      level === "manual"
        ? `Выбрано вручную · ${location.displayName || ""} · доставка $${location.landPrice || location.autoLand || 0}`
        : level === "state"
        ? "Точной площадки нет в базе — взята ближайшая в штате, проверьте."
        : `Определено автоматически · ${location.displayName || ""}`;
  }

  /** Параметры расчёта — одинаковые для сайта и для локального запаса. */
  function calcParams() {
    const calc = state.settings.calc;
    const location = currentLocation();
    return {
      location,
      bid: Number($("calcBid").value || 0),
      vehicleType: $("calcType").value,
      fuel: $("calcFuel").value,
      engineLiters: Number($("calcEngine").value || 2),
      insurance: true,
      exportDocs: $("calcExport").checked,
      offsite: $("calcOffsite").checked,
      port: $("calcPort").value,
      marginUsd: Number(calc.marginUsd || 0),
      usdMdl: Number(state.rates.usdMdl || calc.usdMdl),
      eurMdl: Number(state.rates.eurMdl || calc.eurMdl)
    };
  }

  /* Расчёт считает калькулятор apexauto.md — чтобы сайт, менеджеры и расширение
     показывали одни и те же цифры. Локальные формулы включаются, только если сайт недоступен. */
  async function fetchSiteEstimate(params) {
    const calc = state.settings.calc;
    const endpoint = (calc.endpoint || "").trim();
    if (calc.source === "local" || !endpoint) return null;

    const location = params.location;
    const payload = {
      lotPrice: params.bid,
      auction: state.lot.auction,
      vehicleType: params.vehicleType,
      fuel: params.fuel,
      engineLiters: params.engineLiters,
      year: Number(state.lot.year || 0) || undefined,
      insurance: true,
      exportDocs: params.exportDocs,
      offsite: params.offsite,
      marginUsd: params.marginUsd,
      // «auto» — сервер подставит курс БНМ, тот же, что на сайте
      usdMdl: calc.ratesMode === "manual" ? Number(calc.usdMdl) : "auto",
      eurMdl: calc.ratesMode === "manual" ? Number(calc.eurMdl) : "auto",
      port: (location && location.autoPort) || params.port,
      landPrice: location ? Number(location.landPrice || location.autoLand || 0) : 0,
      locationName: (location && location.displayName) || "",
      portLabel: (location && location.portLabel) || ""
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || `HTTP ${response.status}`);
    }
    return data;
  }

  /** Ответ сайта → та же форма, что у локального расчёта, чтобы вьюха не различала источник. */
  function estimateFromSite(data, params) {
    const b = data.breakdown;
    return {
      lot: b.lot,
      auctionFee: b.auctionFee,
      land: b.land,
      sea: b.sea,
      exportDocs: b.exportDocs,
      insurance: b.insurance,
      company: b.company,
      customsUsd: b.customsUsd,
      customsMdlValue: b.customsMdl,
      customs: {
        cc: data.customs.cc,
        rate: data.customs.rate,
        luxury: data.customs.luxuryMdl,
        luxuryPct: data.customs.luxuryPct,
        baseExcise: b.customsMdl - (data.customs.luxuryMdl || 0)
      },
      totalUsd: data.total.usd,
      totalMdl: data.total.mdl,
      totalEur: data.total.eur,
      route: data.route,
      port: data.portLabel,
      location: params.location,
      input: {
        lotPrice: b.lot,
        vehicleType: params.vehicleType,
        fuel: params.fuel,
        engineLiters: params.engineLiters
      }
    };
  }

  function recompute() {
    if (!state.lot) return;
    const calc = state.settings.calc;
    const location = currentLocation();
    renderLocationNote(location);
    const params = calcParams();
    const seq = ++state.calcSeq;

    // сразу показываем локальный результат, чтобы поле не «висело», затем заменяем ответом сайта
    state.calcFrom = "local";
    state.estimate = ApexX.calc.estimate(state.lot, {
      bid: Number($("calcBid").value || 0),
      vehicleType: $("calcType").value,
      fuel: $("calcFuel").value,
      engineLiters: Number($("calcEngine").value || 2),
      insurance: true, // страховка груза включена всегда
      exportDocs: $("calcExport").checked,
      offsite: $("calcOffsite").checked,
      port: $("calcPort").value,
      marginUsd: Number(calc.marginUsd || 0),
      usdMdl: Number(calc.usdMdl),
      eurMdl: Number(calc.eurMdl),
      location
    });
    renderBreakdown();
    if (!state.textDirty) buildText();

    fetchSiteEstimate(params)
      .then((data) => {
        if (!data || seq !== state.calcSeq) return; // пришёл ответ на устаревший запрос
        if (data.rates && Number(data.rates.usdMdl) > 0) {
          state.rates = {
            usdMdl: Number(data.rates.usdMdl),
            eurMdl: Number(data.rates.eurMdl),
            source: data.rates.source || ""
          };
        }
        state.estimate = estimateFromSite(data, params);
        state.calcFrom = "site";
        renderBreakdown();
        if (!state.textDirty) buildText();
      })
      .catch((error) => {
        if (seq !== state.calcSeq) return;
        state.calcFrom = "offline";
        state.calcError = String((error && error.message) || error);
        renderBreakdown();
      });
  }

  /** Пояснение к строке растаможки — чтобы было видно, из чего она сложилась. */
  function customsHint(est) {
    const customs = est.customs || {};
    const type = est.input.vehicleType;
    const fuel = est.input.fuel;
    const mdl = (value) => Math.round(Number(value || 0)).toLocaleString("ru-RU").replace(/ /g, " ");

    if (type === "moto" || type === "pickup" || type === "vanLarge") {
      return `НДС 20% от таможенной стоимости — ${mdl(customs.baseExcise)} MDL`;
    }
    const parts = [];
    if (fuel === "electric") parts.push("электромобиль — акциза нет");
    else if (customs.cc && customs.rate) {
      const discount = fuel === "phev" ? " × 0.5 (plug-in)" : fuel === "hybrid" ? " × 0.75 (гибрид)" : "";
      parts.push(`акциз ${customs.cc} см³ × ${customs.rate} MDL${discount} = ${mdl(customs.baseExcise)} MDL`);
    }
    if (customs.luxury) parts.push(`налог на роскошь ${customs.luxuryPct}% = ${mdl(customs.luxury)} MDL`);
    return parts.join(" · ");
  }

  function renderBreakdown() {
    const est = state.estimate;
    const calc = state.settings.calc;
    const rows = [];
    const add = (name, value, hint) =>
      rows.push(
        `<li><span class="name">${U.escapeHtml(name)}${hint ? `<i class="hint">${U.escapeHtml(hint)}</i>` : ""}</span>` +
          `<span class="value">${value}</span></li>`
      );

    add("Ставка на аукционе", money(est.lot));
    add(
      "Сбор аукциона",
      money(est.auctionFee),
      state.lot.auction === "iaai" ? "тарифная сетка IAAI (+$50 к базе)" : "тарифная сетка Copart"
    );
    const level = est.location && est.location.matchLevel;
    const landHint = !est.location
      ? "локация лота не найдена в базе — проверьте порт вручную"
      : level === "state"
      ? `${est.route} · точной площадки нет в базе, взята ближайшая в штате`
      : est.route;
    add("Доставка до порта", est.land ? money(est.land) : "—", landHint);
    add("Морская доставка", money(est.sea), [est.port, "с учётом типа кузова и топлива"].filter(Boolean).join(" · "));
    if (est.exportDocs) add("Экспортные документы", money(est.exportDocs));
    add("Страховка груза", money(est.insurance), "1% от ставки и сбора аукциона — включена всегда");
    add(
      "Наши услуги",
      money(est.company),
      Number(calc.marginUsd) ? `база + ваша наценка ${money(calc.marginUsd)}` : "фикс $300, от $40 000 — 1%"
    );
    add("Растаможка в Молдове", money(est.customsUsd), customsHint(est));

    $("calcRows").innerHTML = rows.join("");
    $("totalUsd").textContent = money(est.totalUsd);
    $("totalAlt").textContent =
      `${U.money(Math.round(est.totalMdl), "MDL")} · €${Math.round(est.totalEur).toLocaleString("ru-RU").replace(/ /g, " ")}`;
    const sourceNote =
      state.calcFrom === "site"
        ? "Считал калькулятор apexauto.md"
        : state.calcFrom === "offline"
        ? `Сайт не ответил (${state.calcError || "нет связи"}) — расчёт по локальной копии формул`
        : state.settings.calc.source === "local"
        ? "Локальный расчёт (выбран в настройках)"
        : "Считаю на apexauto.md…";
    const usd = state.rates.usdMdl || calc.usdMdl;
    const eur = state.rates.eurMdl || calc.eurMdl;
    const ratesNote =
      calc.ratesMode === "manual"
        ? "курс задан вручную"
        : state.rates.source === "bnm"
        ? "курс БНМ"
        : state.rates.source
        ? "курс " + state.rates.source
        : "курс по умолчанию";
    $("totalNote").textContent =
      `${sourceNote} · ${ratesNote}: 1$ = ${usd} MDL, 1€ = ${eur} MDL. Всё включено, кроме учёта в Молдове.`;
    $("actionTotal").textContent = "под ключ " + money(est.totalUsd);
  }

  /* ---------- фото ---------- */

  function renderPhotos() {
    const lot = state.lot;
    $("photoCount").textContent = lot.images.length ? `(${lot.images.length})` : "(нет)";
    $("photos").innerHTML = lot.images
      .map(
        (src, i) =>
          `<div class="photo${state.selected.has(src) ? " sel" : ""}" data-src="${U.escapeHtml(src)}">
             <span class="num">${i + 1}</span><img src="${U.escapeHtml(src)}" loading="lazy" alt="">
           </div>`
      )
      .join("");
    updatePhotoMeta();
  }

  function updatePhotoMeta() {
    const count = state.selected.size;
    $("actionPhotos").textContent = count ? `выбрано фото: ${count}` : "фото не выбраны";
  }

  /* ---------- журнал, черновик, напоминание ---------- */

  const DATE_FMT = { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" };
  const NETWORK_NAMES = { telegram: "Telegram", facebook: "Facebook", instagram: "Instagram" };

  async function showPublishHistory() {
    const chip = $("lotPublished");
    const history = await ApexX.journal.publicationsFor(state.lot);
    if (!history.length) {
      chip.classList.add("hidden");
      return;
    }
    const last = history[0];
    const where = ApexX.util.uniq(history.map((item) => NETWORK_NAMES[item.network] || item.network)).join(", ");
    chip.textContent = `✓ Уже публиковали ${new Date(last.at).toLocaleString("ru-RU", DATE_FMT)} · ${where}`;
    chip.title = `Публикаций: ${history.length}`;
    chip.classList.remove("hidden");
  }

  async function showReminder() {
    const button = $("btnRemind");
    state.saleAt = saleTimestamp(state.lot.saleDate);
    if (!state.saleAt || state.saleAt < Date.now()) {
      button.classList.add("hidden");
      return;
    }
    const existing = await ApexX.journal.reminderFor(state.lot);
    button.classList.remove("hidden");
    if (existing && existing.at > Date.now()) {
      button.classList.add("active");
      button.textContent = `🔔 Напомню ${new Date(existing.at).toLocaleString("ru-RU", DATE_FMT)}`;
      button.dataset.on = "1";
    } else {
      button.classList.remove("active");
      const minutes = state.saleAt - Date.now() > 3600000 ? 60 : 10;
      button.textContent = `🔔 Напомнить за ${minutes} мин`;
      button.dataset.on = "";
    }
  }

  async function toggleReminder() {
    const button = $("btnRemind");
    if (button.dataset.on) {
      if (demoMode) await ApexX.journal.dropReminder(state.lot);
      else await send({ type: "apex:reminderCancel", lot: state.lot });
      await showReminder();
      return status("Напоминание отменено", "ok");
    }
    const minutesBefore = state.saleAt - Date.now() > 3600000 ? 60 : 10;
    const whenMs = state.saleAt - minutesBefore * 60000;
    // в демо будильник ставить некому — просто сохраняем запись, чтобы проверить интерфейс
    const response = demoMode
      ? { ok: true, reminder: await ApexX.journal.saveReminder(state.lot, whenMs, minutesBefore) }
      : await send({ type: "apex:reminder", lot: state.lot, whenMs, minutesBefore });
    if (!response.ok) return status(response.error || "Не удалось поставить напоминание", "error");
    await showReminder();
    status(`Напомню за ${minutesBefore} мин до торгов`, "ok");
  }

  /** Черновик: правки текста и ставка переживают закрытие панели. */
  async function restoreDraft() {
    const draft = await ApexX.journal.loadDraft(state.lot);
    if (!draft || !draft.text) return;
    if (draft.bid) $("calcBid").value = draft.bid;
    if (draft.lang) {
      state.lang = draft.lang;
      document.querySelectorAll(".lang").forEach((b) => b.classList.toggle("active", b.dataset.lang === draft.lang));
    }
    if (draft.network) {
      state.network = draft.network;
      document.querySelectorAll(".net").forEach((b) => b.classList.toggle("active", b.dataset.net === draft.network));
      $("btnPublish").textContent = "Опубликовать в " + (NETWORK_NAMES[draft.network] || draft.network);
    }
    recompute();
    $("postText").value = draft.text;
    state.textDirty = true;
    state.draftRestored = true;
    status(`Восстановлен черновик от ${new Date(draft.at).toLocaleString("ru-RU", DATE_FMT)}`, "ok");
  }

  function saveDraftSoon() {
    clearTimeout(saveDraftSoon.timer);
    saveDraftSoon.timer = setTimeout(() => {
      if (!state.lot) return;
      ApexX.journal.saveDraft(state.lot, {
        text: $("postText").value,
        lang: state.lang,
        network: state.network,
        bid: Number($("calcBid").value || 0)
      });
    }, 600);
  }

  /* ---------- пост ---------- */

  function buildText() {
    if (!state.lot) return;
    $("postText").value = T.build(state.network, state.lot, state.estimate, state.settings, state.lang);
    state.textDirty = false;
  }

  /* ---------- события ---------- */

  function bind() {
    ["calcBid", "calcType", "calcFuel", "calcEngine", "calcPort", "calcExport", "calcOffsite"].forEach(
      (id) => {
        $(id).addEventListener("input", recompute);
        $(id).addEventListener("change", recompute);
      }
    );
    $("calcLocation").addEventListener("input", (event) => {
      openLocationList(event.target.value);
      state.locationManual = locationFromInput();
      recompute();
    });
    $("calcLocation").addEventListener("focus", (event) => {
      event.target.select();
      openLocationList("");
    });
    $("calcLocation").addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if ($("locList").classList.contains("hidden")) openLocationList();
        else highlightLocation(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter" && state.locActive >= 0) {
        event.preventDefault();
        chooseLocation(state.locActive);
      } else if (event.key === "Escape") {
        closeLocationList();
      }
    });
    $("btnLocOpen").addEventListener("click", () => {
      if ($("locList").classList.contains("hidden")) {
        openLocationList("");
        $("calcLocation").focus();
      } else closeLocationList();
    });
    // mousedown вместо click: иначе blur успевает закрыть список раньше выбора
    $("locList").addEventListener("mousedown", (event) => {
      const item = event.target.closest(".comboItem");
      if (!item) return;
      event.preventDefault();
      chooseLocation(Number(item.dataset.index));
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".combo")) closeLocationList();
    });
    $("btnLocAuto").addEventListener("click", () => {
      state.locationManual = null;
      const auto = ApexX.calc.findLocation(state.lot);
      $("calcLocation").value = auto ? locationLabel(auto) : U.clean(state.lot.location || "");
      closeLocationList();
      recompute();
    });
    $("btnBidCurrent").addEventListener("click", () => {
      $("calcBid").value = Number(state.lot.currentBid || 0) || "";
      recompute();
    });

    document.querySelectorAll(".lang").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".lang").forEach((b) => b.classList.toggle("active", b === button));
        state.lang = button.dataset.lang;
        state.textDirty = false;
        buildText();
        status(state.lang === "ro" ? "Текст переключён на румынский" : "Текст переключён на русский", "ok");
      });
    });

    document.querySelectorAll(".net").forEach((net) => {
      net.addEventListener("click", () => {
        document.querySelectorAll(".net").forEach((n) => n.classList.toggle("active", n === net));
        state.network = net.dataset.net;
        $("btnPublish").textContent =
          "Опубликовать в " + { telegram: "Telegram", facebook: "Facebook", instagram: "Instagram" }[state.network];
        state.textDirty = false;
        buildText();
      });
    });

    $("photos").addEventListener("click", (event) => {
      const cell = event.target.closest(".photo");
      if (!cell) return;
      const src = cell.dataset.src;
      if (state.selected.has(src)) state.selected.delete(src);
      else state.selected.add(src);
      cell.classList.toggle("sel", state.selected.has(src));
      updatePhotoMeta();
    });
    $("btnPickFirst").addEventListener("click", () => {
      state.selected = new Set(state.lot.images.slice(0, 10));
      renderPhotos();
    });
    $("btnPickNone").addEventListener("click", () => {
      state.selected = new Set();
      renderPhotos();
    });
    $("btnDownload").addEventListener("click", async () => {
      const urls = Array.from(state.selected);
      if (!urls.length) return status("Сначала выберите фото", "error");
      status("Скачиваю фото…");
      const response = await send({ type: "apex:download", urls, lot: state.lot });
      status(response.ok ? `Скачано файлов: ${response.count}` : response.error, response.ok ? "ok" : "error");
    });

    $("btnRemind").addEventListener("click", toggleReminder);
    $("postText").addEventListener("input", () => {
      state.textDirty = true;
      saveDraftSoon();
    });
    $("btnRebuild").addEventListener("click", () => {
      state.textDirty = false;
      buildText();
      ApexX.journal.dropDraft(state.lot); // черновик больше не нужен — вернулись к шаблону
      status("Текст пересобран по шаблону", "ok");
    });
    $("btnCopy").addEventListener("click", async () => {
      await navigator.clipboard.writeText($("postText").value);
      status("Текст скопирован", "ok");
    });
    $("btnPublish").addEventListener("click", async () => {
      const text = $("postText").value.trim();
      if (!text) return status("Текст поста пустой", "error");
      const images = state.lot.images.filter((src) => state.selected.has(src)).slice(0, 10);
      $("btnPublish").disabled = true;
      status("Публикую…");
      const response = await send({
        type: "apex:publish",
        network: state.network,
        lang: state.lang,
        lot: state.lot,
        text,
        images,
        link: state.lot.url || state.lot.pageUrl || ""
      });
      $("btnPublish").disabled = false;
      if (response.ok) {
        status("Опубликовано ✓" + (response.note ? " · " + response.note : ""), "ok");
        $("publishNote").textContent = response.postId ? "ID поста: " + response.postId : "";
        await ApexX.journal.dropDraft(state.lot);
        await showPublishHistory();
      } else {
        status("Ошибка публикации: " + response.error, "error");
        $("publishNote").textContent = "Проверьте токены и права доступа в настройках расширения.";
      }
    });

    // Боковая панель Chrome: живёт внутри окна браузера и не закрывается при клике мимо
    $("btnWindow").addEventListener("click", async () => {
      const tabId = await resolveTab();
      const path = `src/ui/panel.html?mode=side&tabId=${tabId}`;
      try {
        await chrome.sidePanel.setOptions({ tabId, path, enabled: true });
        await chrome.sidePanel.open({ tabId });
        if (mode === "popup") window.close();
      } catch (error) {
        status("Боковая панель недоступна в этой версии Chrome: " + ((error && error.message) || error), "error");
      }
    });
    $("btnReload").addEventListener("click", collect);
    $("btnOptions").addEventListener("click", () => send({ type: "apex:openOptions" }));
    $("btnClose").addEventListener("click", async () => {
      if (inline) chrome.tabs.sendMessage(await resolveTab(), { type: "apex:closePanel" });
      else window.close();
    });
  }

  async function init() {
    state.settings = demoMode ? JSON.parse(JSON.stringify(ApexX.settings.DEFAULTS)) : await ApexX.settings.load();
    // отладка через local-server: панель открыта по http, значит и считать надо на нём же
    if (demoMode && /^https?:$/.test(location.protocol)) {
      state.settings.calc.endpoint = location.origin + "/api/calc";
    }
    bind();
    await collect();
  }

  init();
})();
