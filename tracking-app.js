(function(){
  const input = document.getElementById('trackInputV401');
  const btn   = document.getElementById('trackBtnV401');
  const area  = document.getElementById('trackResultAreaV401');

  // Current photo categories (set after each render)
  let _photoCats = [];
  let _lastData = null;

  // Expose for i18n re-render on language switch
  window._trackRerender = function() {
    if (_lastData) {
      area.innerHTML = renderResult(_lastData);
      _photoCats = _lastData.photoCategories || [];
    }
  };

  // Update prev/next arrow disabled states
  function updateArrows(idx, total) {
    const prev = area.querySelector('.trackGalleryArrowV401.isPrevV401');
    const next = area.querySelector('.trackGalleryArrowV401.isNextV401');
    if (prev) prev.disabled = idx === 0;
    if (next) next.disabled = idx >= total - 1;
  }

  // Switch to thumb by index (shared by arrows + thumb clicks)
  window._galleryGoTo = function(idx) { goToPhoto(idx); };

  function goToPhoto(idx) {
    const thumbs = [...area.querySelectorAll('.trackThumbV401')];
    if (!thumbs.length || idx < 0 || idx >= thumbs.length) return;
    const thumb = thumbs[idx];
    const src = thumb.dataset.src;
    const total = thumbs.length;
    const mainImg = document.getElementById('trackGalleryImgV401');
    const mainLink = document.getElementById('trackGalleryLinkV401');
    if (mainImg) { mainImg.removeAttribute('data-fb-done'); mainImg.setAttribute('data-fb', src); mainImg.src = pv(src, 960); }
    if (mainLink) mainLink.href = src;
    // следующее фото подгружаем заранее — листание без пауз
    [idx + 1, idx - 1].forEach(function(k) { if (thumbs[k]) new Image().src = pv(thumbs[k].dataset.src, 960); });
    thumbs.forEach(b => b.classList.remove('isActiveV401'));
    thumb.classList.add('isActiveV401');
    const counter = area.querySelector('.trackPhotoCountV401');
    if (counter) counter.textContent = (idx + 1) + ' / ' + total;
    thumb.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    updateArrows(idx, total);
  }

  // Photo gallery: delegate tab + thumb + arrow clicks on the result area
  area.addEventListener('click', function(e) {
    // Arrow click
    const arrow = e.target.closest('.trackGalleryArrowV401');
    if (arrow) {
      const thumbs = [...area.querySelectorAll('.trackThumbV401')];
      const activeThumb = area.querySelector('.trackThumbV401.isActiveV401');
      const currentIdx = activeThumb ? +activeThumb.dataset.idx : 0;
      goToPhoto(currentIdx + (arrow.classList.contains('isPrevV401') ? -1 : 1));
      return;
    }
    // Category tab click
    const tab = e.target.closest('.trackPhotoTabV401');
    if (tab) {
      const catIdx = +tab.dataset.catIdx;
      const cat = _photoCats[catIdx];
      if (!cat) return;
      area.querySelectorAll('.trackPhotoTabV401').forEach((t, i) => t.classList.toggle('isActiveV401', i === catIdx));
      const counter = area.querySelector('.trackPhotoCountV401');
      if (counter) counter.textContent = '1 / ' + cat.photos.length;
      const mainImg = document.getElementById('trackGalleryImgV401');
      const mainLink = document.getElementById('trackGalleryLinkV401');
      if (mainImg && cat.photos[0]) { mainImg.removeAttribute('data-fb-done'); mainImg.setAttribute('data-fb', cat.photos[0]); mainImg.src = pv(cat.photos[0], 960); mainLink.href = cat.photos[0]; }
      const thumbsDiv = area.querySelector('.trackGalleryThumbsV401');
      if (thumbsDiv) {
        thumbsDiv.innerHTML = cat.photos.map((url, i) =>
          `<button class="trackThumbV401${i === 0 ? ' isActiveV401' : ''}" data-src="${esc(url)}" data-idx="${i}" data-total="${cat.photos.length}"><img src="${esc(pv(url, 160))}" data-fb="${esc(url)}" alt="${i + 1}" width="76" height="57" decoding="async" loading="${i < 6 ? 'eager' : 'lazy'}"></button>`
        ).join('');
      }
      updateArrows(0, cat.photos.length);
      return;
    }
    // Thumb click
    const thumb = e.target.closest('.trackThumbV401');
    if (!thumb) return;
    e.preventDefault();
    goToPhoto(+thumb.dataset.idx);
  });

  // Stage label map
  const STAGE_LABELS = {
    "Car won":                    "Куплен на аукционе",
    "Left auction":               "Выехал с аукциона",
    "Delivered to loading place": "Прибыл на склад / порт",
    "Loading":                    "Погружен в контейнер",
    "Arrival":                    "Порт Клайпеда",
    "Chisinau":                   "Кишинёв",
    // Провайдер №2 (Dealer API): этапы из пары «состояние + локация»
    "D_PURCHASED":                "Куплен",
    "D_TO_ORIGIN":                "В пути на склад",
    "D_AT_ORIGIN":                "На складе / в порту отправки",
    "D_SEA":                      "Морская перевозка",
    "D_TO_DEST":                  "В пути по Европе",
    "D_AT_DEST":                  "На складе в Европе",
    "D_ARRIVED":                  "Прибыл",
    // Провайдер №3 (AvtoShipping): статусы 0..6 их трекинга
    "A_PURCHASED":                "Оплачен",
    "A_DISPATCHED":               "В пути на склад",
    "A_DELIVERED":                "Прибыл на склад",
    "A_LOADED":                   "Погружен в контейнер",
    "A_UNLOADED":                 "Выгружен из контейнера",
    "A_EU_DISPATCHED":            "В пути к месту выдачи",
    "A_READY":                    "Готов к выдаче",
  };

  // Stage icons (SVG paths)
  const STAGE_ICONS = {
    "Car won":                    '<path d="M20 6 9 17 4 12"/>',
    "Left auction":               '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    "Delivered to loading place": '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    "Loading":                    '<path d="M12 22V12M12 12l-4 4M12 12l4 4"/><rect x="2" y="3" width="20" height="7" rx="1"/>',
    "Arrival":                    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    "Chisinau":                   '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  };

  // Экранирование: данные приходят из api/w8-tracking.js, который парсит
  // стороннюю RSC-разметку w8shipping.ua. Без esc() HTML в этих полях (или в
  // URL фото) исполнился бы у пользователя (DOM XSS). Годится для текста и для
  // значений в двойных кавычках (src/href).
  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
    });
  }

  // Оригиналы у провайдера 2000×1500 (300–400 КБ) — на телефоне это и есть «плохо грузит».
  // Отдаём уменьшенные копии через Vercel Image (кэш в CDN), при ошибке — оригинал (data-fb).
  var PV_HOSTS = /^https:\/\/(storage-lavto\.lionwood\.software|static\.w8shipping\.com)\//i;
  function pv(url, w) {
    url = String(url || "");
    if (!PV_HOSTS.test(url)) return url;
    return "/_vercel/image?url=" + encodeURIComponent(url) + "&w=" + w + "&q=75";
  }
  window._trackPv = pv;

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime())) return "";
    const locale = { ru: "ru-RU", ro: "ro-RO", en: "en-US" }[window.APEX_LANG || "ru"] || "ru-RU";
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  }

  function stageIcon(title, status) {
    const path = STAGE_ICONS[title] || '<circle cx="12" cy="12" r="4"/>';
    if (status === "completed") {
      return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17 4 12"/></svg>`;
    }
    return `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
  }

  function stageClass(status) {
    if (status === "completed") return "trackStageV401 isDoneV401";
    if (status === "current")   return "trackStageV401 isCurrentV401";
    return "trackStageV401 isTodoV401";
  }

  function logDotClass(status) {
    if (status === "completed") return "trackLogDotV401 isCompletedV401";
    if (status === "current")   return "trackLogDotV401 isCurrentV401";
    return "trackLogDotV401 isPendingV401";
  }

  function renderResult(d) {
    // Build augmented stages: add synthetic Кишинёв, fix Klaipeda status by date
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const stages = (d.stages || []).map(s => Object.assign({}, s));

    const portDate = d.container?.portArrival ? new Date(d.container.portArrival + "T00:00:00") : null;

    // If Klaipeda arrival date is past → mark it completed (W8 may still say "current")
    if (portDate && today >= portDate) {
      const kl = stages.find(s => s.title === "Arrival");
      if (kl) kl.status = "completed";
    }

    // Always add Chisinau as final destination
    const chisinauDate = d.etaChisinau || null;
    let chisinauStatus = "todo";
    if (chisinauDate) {
      const etaDate = new Date(chisinauDate + "T00:00:00");
      if (today >= etaDate) chisinauStatus = "completed";
      else if (portDate && today >= portDate) chisinauStatus = "current";
    }
    // Синтетический «Кишинёв» (+14 дней от Клайпеды) — логика W8; у Dealer API свой маршрут
    if (d.source !== "dealer" && (d.source !== "avtoshipping" || d.etaChisinau)) stages.push({ title: "Chisinau", date: chisinauDate, status: chisinauStatus });

    const eta = d.source === "dealer" ? d.expectedDate : (d.etaChisinau || d.container?.portArrival);
    const etaDisplay = eta ? fmtDate(eta) : null;
    const isEstimate = !!d.etaChisinau;

    // Badge: find current or last completed stage
    const activeStage = stages.find(s => s.status === "current")
      || [...stages].reverse().find(s => s.status === "completed");
    let statusLabel = "В обработке";
    if (activeStage) {
      if (activeStage.title === "Chisinau" && activeStage.status === "completed") statusLabel = "Доставлен в Кишинёв";
      else if (activeStage.title === "Chisinau") statusLabel = "В пути до Кишинёва";
      else { statusLabel = STAGE_LABELS[activeStage.title] || activeStage.title; if (d.source === "dealer" && d.statusDetail) statusLabel += " · " + d.statusDetail; }
    }

    // Build stages HTML
    const stagesHtml = stages.map(s => `
      <div class="${stageClass(s.status)}">
        <div class="trackStageDotV401">${stageIcon(s.title, s.status)}</div>
        <div class="trackStageNameV401">${esc(STAGE_LABELS[s.title] || s.title)}</div>
        <div class="trackStageDateV401">${s.date ? fmtDate(s.date) : "—"}</div>
      </div>
    `).join("");

    // Build log HTML (reverse order — latest first, include current)
    const completedStages = stages.filter(s => s.status === "completed" || s.status === "current").reverse();
    const logHtml = completedStages.map(s => `
      <div class="trackLogItemV401">
        <div class="trackLogLineV401"></div>
        <div class="${logDotClass(s.status)}"></div>
        <div class="trackLogBodyV401">
          <div class="trackLogEventV401">${esc(STAGE_LABELS[s.title] || s.title)}</div>
        </div>
        <div class="trackLogDateV401">${fmtDate(s.date)}</div>
      </div>
    `).join("");

    return `
      <div class="trackVehCardV401">
        <div class="trackVehStatusV401">${statusLabel}</div>
        <div class="trackVehNameV401">${esc(d.vehicle || "Автомобиль")}</div>
        <div class="trackVehMetaV401">
          ${d.lotNumber ? `<span>Лот: <strong>${esc(d.lotNumber)}</strong></span>` : ""}
          ${d.auction   ? `<span>Аукцион: <strong>${esc(String(d.auction).toUpperCase())}</strong></span>` : ""}
          ${d.city      ? `<span>Локация: <strong>${esc(d.city)}</strong></span>` : ""}
        </div>
        ${d.vin ? `<div class="trackVehVinV401">VIN: <b>${esc(d.vin)}</b></div>` : ""}
        ${(d.titleStatus || d.keys) ? `
        <div class="trackDocsV401">
          ${d.titleStatus === "yes" ? `
            <div class="trackDocBadgeV401 isOkV401">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
              Тайтл получен
              ${d.titleReceived ? `<small>${d.titleReceived.slice(0,10)}</small>` : ""}
            </div>` : ""}
          ${d.titleStatus === "no" ? `
            <div class="trackDocBadgeV401 isPendingV401">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Тайтл в обработке
            </div>` : ""}
          ${d.keys === "yes" ? `
            <div class="trackDocBadgeV401 isOkV401">
              <svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              Ключи есть
            </div>` : ""}
          ${d.keys === "no" ? `
            <div class="trackDocBadgeV401 isPendingV401">
              <svg viewBox="0 0 24 24"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
              Ключи отсутствуют
            </div>` : ""}
        </div>` : ""}
      </div>

        ${d.photoCategories?.length ? (function(){
          const cats = d.photoCategories;
          const first = cats[0];
          const total = first.photos.length;
          const tabs = cats.map((c, i) =>
            `<button class="trackPhotoTabV401${i === 0 ? " isActiveV401" : ""}" data-cat-idx="${i}">${esc(c.label)} <span class="tabCountV401">${c.photos.length}</span></button>`
          ).join("");
          const thumbs = first.photos.map((url, i) =>
            `<button class="trackThumbV401${i === 0 ? " isActiveV401" : ""}" data-src="${esc(url)}" data-idx="${i}" data-total="${total}"><img src="${esc(pv(url, 160))}" data-fb="${esc(url)}" alt="${i + 1}" width="76" height="57" decoding="async" loading="${i < 6 ? "eager" : "lazy"}"></button>`
          ).join("");
          return `
      <div class="trackPhotosCardV401">
        <div class="trackCardTitleV401">Фото <span class="trackPhotoCountV401">1 / ${total}</span></div>
        <div class="trackPhotoTabsV401">${tabs}</div>
        <div class="trackGalleryWrapV401">
          <button class="trackGalleryArrowV401 isPrevV401" aria-label="Предыдущее фото" disabled>&#8249;</button>
          <a class="trackGalleryMainV401" id="trackGalleryLinkV401" href="${esc(first.photos[0])}" target="_blank" rel="noopener">
            <img id="trackGalleryImgV401" src="${esc(pv(first.photos[0], 960))}" data-fb="${esc(first.photos[0])}" alt="Фото автомобиля" fetchpriority="high" decoding="async">
            <span class="trackGalleryExpandV401"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Увеличить</span>
          </a>
          <button class="trackGalleryArrowV401 isNextV401" aria-label="Следующее фото"${total <= 1 ? " disabled" : ""}>&#8250;</button>
        </div>
        <div class="trackGalleryThumbsV401">${thumbs}</div>
      </div>`;
        })() : d.photos?.length ? `
      <div class="trackPhotosCardV401">
        <div class="trackCardTitleV401">Фото <span class="trackPhotoCountV401">1 / ${d.photos.length}</span></div>
        <div class="trackGalleryWrapV401">
          <button class="trackGalleryArrowV401 isPrevV401" aria-label="Предыдущее фото" disabled>&#8249;</button>
          <a class="trackGalleryMainV401" id="trackGalleryLinkV401" href="${esc(d.photos[0])}" target="_blank" rel="noopener">
            <img id="trackGalleryImgV401" src="${esc(pv(d.photos[0], 960))}" data-fb="${esc(d.photos[0])}" alt="Фото автомобиля" fetchpriority="high" decoding="async">
            <span class="trackGalleryExpandV401"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>Увеличить</span>
          </a>
          <button class="trackGalleryArrowV401 isNextV401" aria-label="Следующее фото"${d.photos.length <= 1 ? " disabled" : ""}>&#8250;</button>
        </div>
        <div class="trackGalleryThumbsV401">
          ${d.photos.map((url, i) => `<button class="trackThumbV401${i === 0 ? " isActiveV401" : ""}" data-src="${esc(url)}" data-idx="${i}" data-total="${d.photos.length}"><img src="${esc(pv(url, 160))}" data-fb="${esc(url)}" alt="${i + 1}" width="76" height="57" decoding="async" loading="${i < 6 ? "eager" : "lazy"}"></button>`).join("")}
        </div>
      </div>` : ""}

    ${etaDisplay ? `
      <div class="trackEtaV401">
        <div class="trackEtaIconV401">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </div>
        <div>
          <div class="trackEtaLabelV401">${d.source === "dealer" ? "Ожидаемая дата" : (isEstimate ? "Ориентировочное прибытие" : "Ожидаемое прибытие")}</div>
          <div class="trackEtaValV401">${etaDisplay}${d.source === "dealer" ? (d.arrivedCity ? " · <span>" + esc(d.arrivedCity) + "</span>" : "") : " · <span>Кишинёв</span>"}</div>
          ${isEstimate ? '<div class="trackEtaHintV401">После выгрузки в порту Клайпеда — доставка до Кишинёва 10–15 дней</div>' : ""}
        </div>
        ${d.container?.number ? `
        <div class="trackEtaNoteV401">
          Контейнер<br><strong>${esc(d.container.number)}</strong>
        </div>` : ""}
      </div>` : ""}

      <div class="trackStagesCardV401">
        <div class="trackCardTitleV401">Маршрут доставки</div>
        <div class="trackStagesWrapV401">
          <div class="trackStagesV401">${stagesHtml}</div>
        </div>
      </div>

      <div class="trackLogCardV401">
        <div class="trackCardTitleV401">История событий</div>
        <div class="trackLogV401">${logHtml || '<p style="color:var(--muted);font-size:14px;">Событий пока нет</p>'}</div>
        <a class="trackCtaV401" href="https://t.me/fedukusa" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24"><path d="M21.2 2.8L2 10.4l6.6 2.2 2.2 6.6 4-4.8 5.4 4.2z"/></svg>
          Вопросы по доставке — написать Федору
        </a>
      </div>
    `;
  }

  function showLoading() {
    area.innerHTML = `
      <div class="trackStateV401">
        <div class="trackSpinnerV401"></div>
        <h3>Ищем информацию...</h3>
        <p>Запрашиваем данные о вашем автомобиле</p>
      </div>`;
    area.classList.add("isVisibleV401");
  }

  function showError(msg) {
    area.innerHTML = `
      <div class="trackStateV401">
        <div class="trackStateIconV401">🔍</div>
        <h3>Не найдено</h3>
        <p>${msg}</p>
      </div>`;
  }

  async function search() {
    const q = input.value.trim();
    if (!q) {
      input.focus();
      input.style.borderColor = "var(--red)";
      input.style.boxShadow = "0 0 0 3px rgba(237,0,18,0.18)";
      setTimeout(() => { input.style.borderColor = ""; input.style.boxShadow = ""; }, 1200);
      return;
    }

    showLoading();
    btn.disabled = true;

    // decide vin vs lot (VIN = 17 chars, lot = numeric)
    const isLot = /^\d+$/.test(q);
    const param = isLot ? "lot" : "vin";

    try {
      const res = await fetch(`/api/w8-tracking?${param}=${encodeURIComponent(q)}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        showError(data.message || "Автомобиль не найден. Проверьте VIN или номер лота.");
      } else {
        _lastData = data;
        area.innerHTML = renderResult(data);
        _photoCats = data.photoCategories || [];
      }
    } catch (e) {
      showError("Не удалось подключиться к сервису. Попробуйте позже.");
    } finally {
      btn.disabled = false;
    }

    // Update URL without reload
    const url = new URL(window.location);
    url.searchParams.set(param, q);
    history.replaceState({}, "", url);
  }

  btn.addEventListener("click", search);
  input.addEventListener("keydown", e => { if (e.key === "Enter") search(); });

  // Auto-search if vin/lot in URL
  const params = new URLSearchParams(window.location.search);
  const preVin = params.get("vin") || params.get("lot");
  if (preVin) {
    input.value = preVin;
    search();
  }
})();

(function(){
  const lb      = document.getElementById('trackLightboxV401');
  const lbImg   = document.getElementById('trackLightboxImgV401');
  const lbClose = document.getElementById('trackLightboxCloseV401');
  const lbPrev  = document.getElementById('lbPrevV401');
  const lbNext  = document.getElementById('lbNextV401');
  const lbCount = document.getElementById('lbCounterV401');
  const area    = document.getElementById('trackResultAreaV401');
  let _lbIdx = 0;

  // ── Zoom / pan state ──────────────────────────────────
  let _zoom = 1, _panX = 0, _panY = 0;

  function applyZoom() {
    lbImg.style.transform = `translate(${_panX}px,${_panY}px) scale(${_zoom})`;
    lbImg.style.cursor = _zoom > 1 ? 'grab' : '';
  }

  function resetZoom() {
    _zoom = 1; _panX = 0; _panY = 0;
    lbImg.style.transform = '';
    lbImg.style.cursor = '';
  }

  // ── Gallery helpers ───────────────────────────────────
  function getThumbs() {
    return [...area.querySelectorAll('.trackThumbV401')];
  }

  function updateLbState(idx) {
    const thumbs = getThumbs();
    const total = thumbs.length;
    _lbIdx = idx;
    lbPrev.disabled = idx === 0;
    lbNext.disabled = idx >= total - 1;
    if (lbCount) lbCount.textContent = (idx + 1) + ' / ' + total;
  }

  // Показываем уже загруженную 960-ю версию сразу, а чёткую 1600 подменяем, когда она догрузится.
  function showLbPhoto(orig) {
    const pv = window._trackPv || (u => u);
    const lo = pv(orig, 960), hi = pv(orig, 1600);
    lbImg.removeAttribute('data-fb-done');
    lbImg.setAttribute('data-fb', orig);
    lbImg.src = lo;
    if (hi === lo) return;
    const big = new Image();
    big.onload = function() { if (lbImg.getAttribute('data-fb') === orig) lbImg.src = hi; };
    big.src = hi;
  }

  function openLightbox(src, idx) {
    showLbPhoto(src);
    lb.classList.add('isOpenV401');
    document.body.style.overflow = 'hidden';
    updateLbState(idx || 0);
    resetZoom();
  }

  function closeLightbox() {
    lb.classList.remove('isOpenV401');
    document.body.style.overflow = '';
    resetZoom();
  }

  function lbNavigate(dir) {
    const thumbs = getThumbs();
    const newIdx = _lbIdx + dir;
    if (newIdx < 0 || newIdx >= thumbs.length) return;
    showLbPhoto(thumbs[newIdx].dataset.src);
    if (window._galleryGoTo) window._galleryGoTo(newIdx);
    updateLbState(newIdx);
    resetZoom();
  }

  // ── Standard controls ─────────────────────────────────
  lb.addEventListener('click', function(e) {
    if (e.target === lb && _zoom === 1) closeLightbox();
  });
  lbClose.addEventListener('click', closeLightbox);
  lbPrev.addEventListener('click', function(e) { e.stopPropagation(); lbNavigate(-1); });
  lbNext.addEventListener('click', function(e) { e.stopPropagation(); lbNavigate(1); });

  document.addEventListener('keydown', function(e) {
    if (!lb.classList.contains('isOpenV401')) return;
    if (e.key === 'Escape')     closeLightbox();
    if (e.key === 'ArrowLeft')  lbNavigate(-1);
    if (e.key === 'ArrowRight') lbNavigate(1);
  });

  area.addEventListener('click', function(e) {
    const link = e.target.closest('.trackGalleryMainV401');
    if (!link) return;
    e.preventDefault();
    const activeThumb = area.querySelector('.trackThumbV401.isActiveV401');
    const idx = activeThumb ? +activeThumb.dataset.idx : 0;
    const src = activeThumb ? activeThumb.dataset.src : document.getElementById('trackGalleryImgV401')?.getAttribute('data-fb');
    if (src) openLightbox(src, idx);
  }, true);

  // ── Desktop: double-click to zoom / reset ────────────
  // On lb (not lbImg) so it fires even when the scaled image hits the backdrop area.
  // 150ms debounce prevents two synthetic dblclick events (browser automation quirk)
  // while being imperceptible to real users.
  let _dblClickAt = 0;
  lb.addEventListener('dblclick', function(e) {
    if (e.target === lbClose || e.target === lbPrev || e.target === lbNext) return;
    const now = Date.now();
    if (now - _dblClickAt < 150) return;
    _dblClickAt = now;
    e.preventDefault();
    if (_zoom > 1) { resetZoom(); } else { _zoom = 2.5; _panX = 0; _panY = 0; applyZoom(); }
  });

  // ── Desktop: scroll to zoom ───────────────────────────
  lb.addEventListener('wheel', function(e) {
    if (!lb.classList.contains('isOpenV401')) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 0.87;
    _zoom = Math.max(1, Math.min(6, _zoom * factor));
    if (_zoom === 1) { _panX = 0; _panY = 0; }
    applyZoom();
  }, { passive: false });

  // ── Mobile: pinch-to-zoom + pan + double-tap ──────────
  let _pinchDist0 = 0, _pinchZoom0 = 1, _isPinching = false, _pinchEndAt = 0;
  let _dragX0 = 0, _dragY0 = 0, _panX0 = 0, _panY0 = 0;
  let _swipeStartX = 0, _tapLast = 0;

  lb.addEventListener('touchstart', function(e) {
    if (e.touches.length === 2) {
      _isPinching = true;
      _pinchDist0 = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      _pinchZoom0 = _zoom;
      e.preventDefault();
    } else if (e.touches.length === 1 && !_isPinching) {
      const t = e.touches[0];
      _swipeStartX = t.clientX;
      if (_zoom > 1) {
        _dragX0 = t.clientX; _dragY0 = t.clientY;
        _panX0 = _panX; _panY0 = _panY;
      }
    }
  }, { passive: false });

  lb.addEventListener('touchmove', function(e) {
    if (e.touches.length === 2 && _isPinching) {
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      _zoom = Math.max(1, Math.min(6, _pinchZoom0 * (d / _pinchDist0)));
      if (_zoom === 1) { _panX = 0; _panY = 0; }
      applyZoom();
    } else if (e.touches.length === 1 && _zoom > 1) {
      e.preventDefault();
      _panX = _panX0 + (e.touches[0].clientX - _dragX0);
      _panY = _panY0 + (e.touches[0].clientY - _dragY0);
      applyZoom();
    }
  }, { passive: false });

  lb.addEventListener('touchend', function(e) {
    if (_isPinching) {
      if (e.touches.length < 2) { _isPinching = false; _pinchEndAt = Date.now(); }
      return;
    }
    if (Date.now() - _pinchEndAt < 250) return; // ignore tap right after pinch
    if (_zoom > 1) return; // when zoomed: no swipe/tap actions

    const now = Date.now();
    if (_tapLast && now - _tapLast < 300) {
      // Double-tap → zoom in
      _zoom = 2.5; _panX = 0; _panY = 0;
      applyZoom();
      _tapLast = 0;
      return;
    }
    _tapLast = now;

    // Single-finger swipe to navigate (only when not zoomed)
    if (e.changedTouches.length > 0) {
      const dx = e.changedTouches[0].clientX - _swipeStartX;
      if (Math.abs(dx) > 44) {
        lbNavigate(dx < 0 ? 1 : -1);
        _tapLast = 0;
      }
    }
  });

  // ── Main gallery swipe ────────────────────────────────
  let _galSwipeX = 0;
  area.addEventListener('touchstart', e => {
    if (e.target.closest('.trackGalleryWrapV401')) _galSwipeX = e.touches[0].clientX;
  }, { passive: true });
  area.addEventListener('touchend', e => {
    if (!e.target.closest('.trackGalleryWrapV401')) return;
    const dx = e.changedTouches[0].clientX - _galSwipeX;
    if (Math.abs(dx) > 40) {
      const active = area.querySelector('.trackThumbV401.isActiveV401');
      const idx = active ? +active.dataset.idx : 0;
      if (window._galleryGoTo) window._galleryGoTo(idx + (dx < 0 ? 1 : -1));
    }
  });
})();
