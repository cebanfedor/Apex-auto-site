(function(){
  const $ = selector => document.querySelector(selector);
  const state = {
    auction:"copart",
    tab:"all",
    page:1,
    hasMore:false,
    loading:false,
    items:[],
    selectedLot:null
  };

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function money(value){
    const number = Number(value || 0);
    return number ? `$${Math.round(number).toLocaleString("en-US")}` : "—";
  }

  function dateText(value){
    if(!value) return "—";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleDateString("ru-RU");
  }

  function saleClass(value){
    const text = String(value || "").toLowerCase();
    if(text.includes("без")) return "noReserve";
    if(text.includes("утверж")) return "approval";
    if(text.includes("миним")) return "minimum";
    if(text.includes("timed")) return "timed";
    return "";
  }

  function lotTitle(lot){
    return [lot.year, lot.make, lot.model].filter(Boolean).join(" ") || lot.title || "Автомобиль";
  }

  function detailHref(lot){
    return `/auctions/${encodeURIComponent(lot.auction)}-${encodeURIComponent(lot.lot)}`;
  }

  function calcHref(lot){
    const url = lot.url || (lot.auction === "iaai"
      ? `https://www.iaai.com/VehicleDetail/${lot.lot}~US`
      : `https://www.copart.com/lot/${lot.lot}`);
    const params = new URLSearchParams({
      lot:url,
      auction:lot.auction || "",
      lotNumber:lot.lot || "",
      vin:lot.vin || "",
      price:String(lot.currentBid || lot.buyNow || ""),
      year:String(lot.year || ""),
      make:lot.make || "",
      model:lot.model || "",
      location:lot.location || ""
    });
    return `/index.html?${params}`;
  }

  async function api(path, options = {}){
    const response = await fetch(path, {
      credentials:"same-origin",
      headers: options.body ? {"content-type":"application/json"} : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if(!response.ok || payload.ok === false) throw new Error(payload.error || "Запрос не выполнен");
    return payload;
  }

  function formParams(){
    const form = $("#auctionFiltersForm");
    const params = new URLSearchParams(new FormData(form));
    const make = $("#auctionMakeSearch")?.value.trim();
    const model = $("#auctionModelSearch")?.value.trim();
    const vin = $("#auctionVinSearch")?.value.trim();
    const lot = $("#auctionLotSearch")?.value.trim();
    if(make) params.set("make", make);
    if(model) params.set("model", model);
    if(vin) params.set("vin", vin);
    if(lot) params.set("q", lot);
    params.set("auction", state.auction);
    params.set("tab", state.tab);
    params.set("sort", $("#auctionSort").value);
    params.set("page", state.page);
    params.set("per_page", "50");
    Array.from(params.entries()).forEach(([key, value]) => {
      if(!value) params.delete(key);
    });
    return params;
  }

  function statusTone(value){
    const text = String(value || "").toLowerCase();
    if(!value) return "";
    if(/run|drive|clear|yes|без|no reserve|live|available/.test(text)) return "good";
    if(/approval|minimum|salvage|starts|unknown|timed|upcoming/.test(text)) return "warn";
    if(/non|not|bill|parts|flood|water|sold|missing/.test(text)) return "bad";
    return "";
  }

  function statusItem(label, value, tone){
    return `<div class="checkStatusV1 ${tone || statusTone(value)}">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value || "—")}</b>
    </div>`;
  }

  function numberFromEngine(engine){
    const match = String(engine || "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(l|л|liter)?/i);
    return match ? Number(match[1]) : 2;
  }

  function auctionFeeFor(price, auction){
    const p = Number(price || 0);
    if(!p) return 0;
    if(auction === "iaai"){
      if(p <= 999) return 250;
      if(p <= 1999) return 350;
      if(p <= 3999) return 500;
      if(p <= 7999) return 700;
      if(p <= 14999) return 950;
      return Math.round(p * 0.075);
    }
    if(p <= 999) return 230;
    if(p <= 1999) return 330;
    if(p <= 3999) return 480;
    if(p <= 7999) return 650;
    if(p <= 14999) return 900;
    return Math.round(p * 0.07);
  }

  function landShippingFor(lot){
    const locations = window.LOCATIONS || [];
    const auction = String(lot.auction || "").toLowerCase();
    const source = String(lot.location || "").toLowerCase();
    const match = locations.find(item => {
      const itemAuction = String(item.auction || "").toLowerCase();
      const label = String(item.label || item.name || item.location || "").toLowerCase();
      return (!itemAuction || itemAuction === auction) && source && (label.includes(source) || source.includes(label.split("→")[0].trim().toLowerCase()));
    });
    return Number(match?.price || match?.land || match?.value || 0) || 0;
  }

  function seaShippingFor(lot){
    const port = String(lot.port || lot.destination || "").toLowerCase();
    if(port.includes("los angeles")) return 2700;
    if(port.includes("savannah")) return 2300;
    if(port.includes("houston")) return 2400;
    return 2400;
  }

  function customsFor(lot){
    const fuel = String(lot.fuel || "").toLowerCase();
    if(fuel.includes("electric")) return 0;
    const year = Number(lot.year || new Date().getFullYear());
    const age = Math.max(0, new Date().getFullYear() - year);
    const engineCc = Math.round(numberFromEngine(lot.engine) * 1000);
    const rate = fuel.includes("diesel") ? 0.034 : 0.028;
    const ageFactor = age <= 3 ? 0.78 : age <= 7 ? 1 : 1.18;
    return Math.round(engineCc * rate * ageFactor * 19.4);
  }

  function calcLotTotal(lot, options = {}){
    const bid = Number(options.bid || lot.currentBid || lot.buyNow || 0);
    const auctionFee = auctionFeeFor(bid, lot.auction);
    const land = (landShippingFor(lot) || 0) + (landShippingFor(lot) ? 100 : 0);
    const sea = seaShippingFor(lot);
    const insurance = options.insurance === false ? 0 : Math.round(bid * 0.01);
    const exportDocs = options.exportDocs ? 400 : 0;
    const service = Math.max(300, Math.round((bid + auctionFee) * 0.025));
    const customsUsd = Math.round(customsFor(lot) / 17.45);
    const total = bid + auctionFee + land + sea + insurance + exportDocs + service + customsUsd;
    return {bid, auctionFee, land, sea, insurance, exportDocs, service, customsUsd, total};
  }

  function setMessage(text){
    const box = $("#auctionMessage");
    box.hidden = !text;
    box.textContent = text || "";
  }

  function renderCard(lot){
    const title = lotTitle(lot);
    return `<article class="auctionCardV1 auctionLotRowV1">
      <div class="auctionPhotoZoneV1">
        <a class="auctionCardImageV1" href="${detailHref(lot)}">
          ${lot.image ? `<img src="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy">` : ""}
          <span class="auctionChipV1">${escapeHtml(lot.auction.toUpperCase())}</span>
          <span class="photoCountV1">${escapeHtml(lot.photoCount || lot.images?.length || 0)} фото</span>
        </a>
        <div class="rowIconBarV1" aria-label="Действия с лотом">
          <button class="rowIconBtnV1" type="button" title="Добавить в избранное">♡</button>
          <button class="rowIconBtnV1" type="button" title="Скрыть лот">−</button>
          ${lot.vin ? `<a class="vinReportV1" href="https://www.google.com/search?q=${encodeURIComponent(lot.vin)}" target="_blank" rel="noopener">Отчет VIN</a>` : ""}
        </div>
      </div>
      <div class="auctionCardBodyV1">
        <div class="auctionLotMainV1">
          <h3>${escapeHtml(title)}</h3>
          <a class="detailInlineV1" href="${detailHref(lot)}">Подробнее</a>
        </div>
        <div class="auctionBadgesV1">
          <span class="lotStatusV1">${escapeHtml(lot.lotStatus || "Live")}</span>
          ${lot.saleStatus ? `<span class="saleBadgeV1 ${saleClass(lot.saleStatus)}">${escapeHtml(lot.saleStatus)}</span>` : ""}
        </div>
        <div class="auctionMetaGridV1">
          <div><span>VIN</span><b>${escapeHtml(lot.vin || "—")}</b></div>
          <div><span>LOT</span><b>${escapeHtml(lot.lot || "—")}</b></div>
          <div><span>Двигатель</span><b>${escapeHtml(lot.engine || "—")}</b></div>
          <div><span>Топливо</span><b>${escapeHtml(lot.fuel || "—")}</b></div>
          <div><span>КПП / привод</span><b>${escapeHtml([lot.transmission, lot.drive].filter(Boolean).join(" / ") || "—")}</b></div>
          <div><span>Пробег</span><b>${escapeHtml(lot.odometerText || "—")}</b></div>
          <div><span>Повреждение</span><b>${escapeHtml(lot.damage || "—")}</b></div>
          <div><span>Документ</span><b>${escapeHtml(lot.document || "—")}</b></div>
          <div><span>Локация</span><b>${escapeHtml(lot.location || "—")}</b></div>
        </div>
      </div>
      <aside class="auctionLotChecksV1">
        ${statusItem("Состояние авто", lot.condition || lot.lotStatus)}
        ${statusItem("Документы", lot.document)}
        ${statusItem("Ключ", lot.keys)}
        ${statusItem("Продавец", lot.seller)}
        ${statusItem("История", lot.priceHistory?.length ? "есть" : "проверить")}
        ${statusItem("Статус продажи", lot.saleStatus || "—")}
      </aside>
      <aside class="auctionLotPriceV1">
        <div class="auctionSideFactsV1">
          <div><span>Дата торгов</span><b>${escapeHtml(dateText(lot.auctionDate))}</b></div>
          <div><span>Локация</span><b>${escapeHtml(lot.location || "—")}</b></div>
        </div>
        <div class="auctionPriceRowV1">
          <strong>Ставка<br>${money(lot.currentBid)}</strong>
          <strong>Buy Now<br>${money(lot.buyNow)}</strong>
        </div>
        <div class="auctionCardActionsV1">
          <a class="auctionBtnGhostV1" href="${detailHref(lot)}">Подробнее</a>
          <a class="auctionBtnGhostV1" href="${calcHref(lot)}">Рассчитать доставку</a>
          <button class="auctionBtnPrimaryV1 fullV1" type="button" data-lead="${escapeHtml(lot.id)}">Оставить заявку</button>
        </div>
      </aside>
    </article>`;
  }

  function renderCards(append = false){
    const box = $("#auctionCards");
    const html = state.items.map(renderCard).join("");
    box.innerHTML = append ? box.innerHTML + html : html;
    $("#loadMoreLots").hidden = !state.hasMore;
  }

  async function loadLots({append = false} = {}){
    if(state.loading) return;
    state.loading = true;
    setMessage("");
    if(!append) $("#auctionCards").innerHTML = "";
    try{
      const payload = await api(`/api/auctions?action=search&${formParams()}`);
      state.hasMore = Boolean(payload.hasMore);
      const nextItems = payload.items || [];
      state.items = append ? state.items.concat(nextItems) : nextItems;
      $("#auctionResultCount").textContent = payload.total || state.items.length || 0;
      $("#auctionResultLabel").textContent = payload.total
        ? (payload.cached ? "лотов найдено · кэш" : "лотов найдено")
        : `Показано ${state.items.length} лотов`;
      renderCards(false);
      if(!state.items.length) setMessage("По этим фильтрам лоты не найдены. Попробуйте изменить параметры поиска.");
    }catch(error){
      state.hasMore = false;
      $("#loadMoreLots").hidden = true;
      $("#auctionResultCount").textContent = "0";
      setMessage(error.message || "Не удалось загрузить реальные лоты AuctionsAPI. Проверьте AUCTIONS_API_KEY или попробуйте позже.");
    }finally{
      state.loading = false;
    }
  }

  function currentSlug(){
    const match = location.pathname.match(/^\/auctions\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : new URLSearchParams(location.search).get("slug");
  }

  function parseSlug(slug){
    const match = String(slug || "").match(/^(copart|iaai)-(.+)$/i);
    return match ? {auction:match[1].toLowerCase(), lot:match[2]} : null;
  }

  function setSeo(lot){
    const title = `${lotTitle(lot)} — ${lot.auction.toUpperCase()} Lot ${lot.lot} | ApexAuto`;
    const description = `Лот ${lot.auction.toUpperCase()} ${lot.lot}: ${lotTitle(lot)}, VIN ${lot.vin || "не указан"}, пробег ${lot.odometerText || "не указан"}, повреждение ${lot.damage || "не указано"}, дата торгов ${dateText(lot.auctionDate)}.`;
    document.title = title;
    setMeta("name", "description", description);
    setMeta("property", "og:title", title);
    setMeta("property", "og:description", description);
    if(lot.image) setMeta("property", "og:image", lot.image);
  }

  function setMeta(type, key, value){
    const selector = type === "property" ? `meta[property="${key}"]` : `meta[name="${key}"]`;
    let meta = document.querySelector(selector);
    if(!meta){
      meta = document.createElement("meta");
      if(type === "property") meta.setAttribute("property", key);
      else meta.setAttribute("name", key);
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", value);
  }

  function spec(label, value){
    return `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value || "—")}</b></div>`;
  }

  function renderCalcRows(calc){
    return `
      <div><span>Ставка</span><b>${money(calc.bid)}</b></div>
      <div><span>Аукционный сбор</span><b>${money(calc.auctionFee)}</b></div>
      <div><span>Доставка по США</span><b>${money(calc.land)}</b></div>
      <div><span>Доставка в Chisinau</span><b>${money(calc.sea)}</b></div>
      <div><span>Страховка</span><b>${money(calc.insurance)}</b></div>
      <div><span>Экспортные документы</span><b>${money(calc.exportDocs)}</b></div>
      <div><span>Сопровождение ApexAuto</span><b>${money(calc.service)}</b></div>
      <div><span>Таможня</span><b>${money(calc.customsUsd)}</b></div>
    `;
  }

  function renderLotCalculator(lot){
    const initialBid = lot.currentBid || lot.buyNow || 0;
    const calc = calcLotTotal(lot, {bid:initialBid, insurance:true, exportDocs:false});
    return `<aside class="lotStickyV1">
      <section class="lotCalcCardV1">
        <span class="auctionsKickerV1">Расчет ApexAuto</span>
        <h2>Стоимость под ключ</h2>
        <div class="calcModeV1" role="group" aria-label="Выбор ставки">
          <button type="button" class="active" data-bid-mode="current">Текущая</button>
          <button type="button" data-bid-mode="buy">Buy Now</button>
          <button type="button" data-bid-mode="custom">Своя</button>
        </div>
        <div class="calcBidControlV1">
          <button type="button" data-bid-step="-500">−</button>
          <input id="lotBidInput" type="number" min="0" step="100" value="${escapeHtml(initialBid || "")}" placeholder="Ставка, $">
          <button type="button" data-bid-step="500">+</button>
        </div>
        <label class="calcToggleV1"><input id="lotCalcInsurance" type="checkbox" checked> Страховка 1%</label>
        <label class="calcToggleV1"><input id="lotCalcExportDocs" type="checkbox"> Экспортные документы +$400</label>
        <div id="lotCalcRows" class="calcRowsV1">${renderCalcRows(calc)}</div>
        <div class="calcTotalV1">
          <span>Итого</span>
          <strong id="lotCalcTotal">${money(calc.total)}</strong>
          <small id="lotCalcTotalAlt">${Math.round(calc.total * 17.45).toLocaleString("ru-RU")} MDL / €${Math.round(calc.total * 17.45 / 19.2).toLocaleString("ru-RU")}</small>
        </div>
        <div class="stickyCtasV1">
          <button class="auctionBtnPrimaryV1" type="button" data-lead="${escapeHtml(lot.id)}">Сделать расчет</button>
          <button class="auctionBtnGhostV1" type="button" data-lead="${escapeHtml(lot.id)}">Оставить заявку</button>
          <button class="auctionBtnGhostV1" type="button" data-copy-calc>Скопировать расчет</button>
          <a class="auctionBtnGhostV1" href="${calcHref(lot)}">Открыть в калькуляторе</a>
        </div>
      </section>
    </aside>`;
  }

  function updateLotCalculator(){
    if(!state.selectedLot || !$("#lotBidInput")) return;
    const calc = calcLotTotal(state.selectedLot, {
      bid:Number($("#lotBidInput").value || 0),
      insurance:$("#lotCalcInsurance")?.checked,
      exportDocs:$("#lotCalcExportDocs")?.checked
    });
    $("#lotCalcRows").innerHTML = renderCalcRows(calc);
    $("#lotCalcTotal").textContent = money(calc.total);
    $("#lotCalcTotalAlt").textContent = `${Math.round(calc.total * 17.45).toLocaleString("ru-RU")} MDL / €${Math.round(calc.total * 17.45 / 19.2).toLocaleString("ru-RU")}`;
    return calc;
  }

  function copyCalculation(){
    const calc = updateLotCalculator();
    if(!calc || !state.selectedLot) return;
    const text = [
      lotTitle(state.selectedLot),
      `Аукцион: ${String(state.selectedLot.auction || "").toUpperCase()}`,
      `LOT: ${state.selectedLot.lot || "—"}`,
      `VIN: ${state.selectedLot.vin || "—"}`,
      `Ставка: ${money(calc.bid)}`,
      `Итого под ключ: ${money(calc.total)}`
    ].join("\n");
    navigator.clipboard?.writeText(text);
  }

  function renderDetail(lot){
    const images = lot.images?.length ? lot.images : [lot.image].filter(Boolean);
    const title = lotTitle(lot);
    $("#auctionCatalog").hidden = true;
    const detail = $("#auctionDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a>
      <section class="auctionDetailPanelV1">
        <div class="detailHeaderV1">
          <span class="auctionCrumbsV1">Главная / Аукционы / ${escapeHtml(lot.auction.toUpperCase())} ${escapeHtml(lot.lot || "")}</span>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml([lot.engine, lot.fuel, lot.transmission, lot.drive, lot.odometerText].filter(Boolean).join(" · ") || "Данные лота загружены из AuctionsAPI")}</p>
        </div>
        <div class="lotDetailGridV1">
          <div class="detailGalleryV1">
            <img id="detailMainImage" class="detailMainImageV1" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(title)}">
            <div class="detailThumbsV1">
              ${images.map(src => `<img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" data-detail-image="${escapeHtml(src)}">`).join("")}
            </div>
          </div>
          <div class="lotDetailCenterV1">
            <section class="lotInfoBlockV1">
              <span class="auctionsKickerV1">Информация о лоте</span>
              <div class="auctionBadgesV1">
                <span class="lotStatusV1">${escapeHtml(lot.lotStatus || "Live")}</span>
                ${lot.saleStatus ? `<span class="saleBadgeV1 ${saleClass(lot.saleStatus)}">${escapeHtml(lot.saleStatus)}</span>` : ""}
              </div>
              <div class="lotQuickSpecV1">
                ${spec("VIN", lot.vin)}
                ${spec("LOT", lot.lot)}
                ${spec("Аукцион", lot.auction?.toUpperCase())}
                ${spec("Локация", lot.location)}
                ${spec("Дата торгов", dateText(lot.auctionDate))}
                ${spec("Пробег", lot.odometerText)}
              </div>
            </section>
            <section class="lotInfoBlockV1">
              <span class="auctionsKickerV1">Характеристики</span>
              <div class="detailSpecGridV1">
                ${spec("Primary damage", lot.primaryDamage)}
                ${spec("Secondary damage", lot.secondaryDamage)}
                ${spec("Документ / Title", lot.document)}
                ${spec("Двигатель", lot.engine)}
                ${spec("КПП", lot.transmission)}
                ${spec("Привод", lot.drive)}
                ${spec("Цилиндры", lot.cylinders)}
                ${spec("Топливо", lot.fuel)}
                ${spec("Цвет", lot.color)}
                ${spec("Ключи", lot.keys)}
                ${spec("Estimated retail value", money(lot.estimatedRetailValue))}
                ${spec("Seller", lot.seller)}
              </div>
            </section>
            <section class="lotInfoBlockV1">
              <h2>Почему стоит проверить этот лот перед покупкой</h2>
              <p>Перед ставкой важно сверить историю, документы, реальные повреждения, статус запуска и итоговую стоимость доставки. Это помогает не переплатить и заранее понимать бюджет восстановления.</p>
            </section>
            <section class="lotInfoBlockV1">
              <h2>ApexAuto assistance</h2>
              <p>Мы помогаем с проверкой лота, расчетом под ключ, участием в торгах, документами, логистикой и сопровождением автомобиля до выдачи в Молдове.</p>
            </section>
            ${Array.isArray(lot.priceHistory) && lot.priceHistory.length ? `<section class="priceHistoryV1">
              <h2>История цены</h2>
              ${lot.priceHistory.slice(0, 8).map(item => `<span>${escapeHtml(item.date || item.sale_date || "")} ${escapeHtml(money(item.price || item.bid || item.amount))}</span>`).join("")}
            </section>` : ""}
          </div>
          ${renderLotCalculator(lot)}
        </div>
      </section>
    `;
    state.selectedLot = lot;
    setSeo(lot);
    updateLotCalculator();
  }

  async function loadDetailFromUrl(){
    const slug = parseSlug(currentSlug());
    if(!slug) return false;
    $("#auctionCatalog").hidden = true;
    $("#auctionDetail").hidden = false;
    $("#auctionDetail").innerHTML = '<div class="auctionMessageV1">Загружаем данные лота...</div>';
    try{
      const payload = await api(`/api/auctions?action=detail&auction=${encodeURIComponent(slug.auction)}&lot=${encodeURIComponent(slug.lot)}`);
      renderDetail(payload.lot);
    }catch(error){
      $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a><div class="auctionMessageV1">${escapeHtml(error.message || "Лот временно недоступен.")}</div>`;
    }
    return true;
  }

  function openLead(lot){
    state.selectedLot = lot;
    const modal = $("#leadModal");
    const form = $("#auctionLeadForm");
    form.vin.value = lot.vin || "";
    form.lot.value = lot.lot || "";
    form.auction.value = lot.auction?.toUpperCase() || "";
    $("#leadFormStatus").textContent = "";
    modal.hidden = false;
    document.body.classList.add("leadModalOpenV1");
  }

  function closeLead(){
    const modal = $("#leadModal");
    if(modal) modal.hidden = true;
    document.body.classList.remove("leadModalOpenV1");
  }

  async function submitLead(event){
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    $("#leadFormStatus").textContent = "Отправляем заявку...";
    try{
      await api("/api/auctions?action=lead", {method:"POST", body:data});
      $("#leadFormStatus").textContent = "Заявка отправлена. Мы свяжемся с вами.";
      form.name.value = "";
      form.phone.value = "";
      form.comment.value = "";
    }catch(error){
      $("#leadFormStatus").textContent = error.message;
    }
  }

  function bindEvents(){
    $("#auctionSearchBtn").addEventListener("click", () => { state.page = 1; loadLots(); });
    ["#auctionMakeSearch", "#auctionModelSearch", "#auctionVinSearch", "#auctionLotSearch"].forEach(selector => {
      $(selector)?.addEventListener("keydown", event => {
        if(event.key === "Enter"){ event.preventDefault(); state.page = 1; loadLots(); }
      });
    });
    $("#auctionSort").addEventListener("change", () => { state.page = 1; loadLots(); });
    document.querySelectorAll("[data-auction-switch]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-auction-switch]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        state.auction = button.dataset.auctionSwitch;
        state.page = 1;
        loadLots();
      });
    });
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        state.tab = button.dataset.tab || "all";
        state.page = 1;
        loadLots();
      });
    });
    $("#auctionFiltersForm").addEventListener("submit", event => {
      event.preventDefault();
      state.page = 1;
      document.body.classList.remove("filtersOpenV1");
      loadLots();
    });
    $("#resetFiltersBtn").addEventListener("click", () => {
      $("#auctionFiltersForm").reset();
      ["#auctionMakeSearch", "#auctionModelSearch", "#auctionVinSearch", "#auctionLotSearch"].forEach(selector => {
        const input = $(selector);
        if(input) input.value = "";
      });
      state.page = 1;
      loadLots();
    });
    $("#loadMoreLots").addEventListener("click", () => {
      state.page += 1;
      loadLots({append:true});
    });
    $("#openFiltersBtn").addEventListener("click", () => document.body.classList.add("filtersOpenV1"));
    $("#searchSettingsBtn")?.addEventListener("click", () => document.body.classList.add("filtersOpenV1"));
    $("#closeFiltersBtn").addEventListener("click", () => document.body.classList.remove("filtersOpenV1"));
    document.addEventListener("click", event => {
      if(event.target.closest("#openFiltersBtn")) document.body.classList.add("filtersOpenV1");
      if(event.target.closest("#searchSettingsBtn")) document.body.classList.add("filtersOpenV1");
      if(event.target.closest("#closeFiltersBtn")) document.body.classList.remove("filtersOpenV1");
      const leadButton = event.target.closest("[data-lead]");
      if(leadButton){
        const lot = state.items.find(item => item.id === leadButton.dataset.lead) || state.selectedLot;
        if(lot) openLead(lot);
      }
      const bidMode = event.target.closest("[data-bid-mode]");
      if(bidMode && state.selectedLot){
        document.querySelectorAll("[data-bid-mode]").forEach(item => item.classList.remove("active"));
        bidMode.classList.add("active");
        const input = $("#lotBidInput");
        if(bidMode.dataset.bidMode === "current") input.value = state.selectedLot.currentBid || "";
        if(bidMode.dataset.bidMode === "buy") input.value = state.selectedLot.buyNow || "";
        input.focus();
        updateLotCalculator();
      }
      const bidStep = event.target.closest("[data-bid-step]");
      if(bidStep && $("#lotBidInput")){
        const input = $("#lotBidInput");
        input.value = Math.max(0, Number(input.value || 0) + Number(bidStep.dataset.bidStep || 0));
        updateLotCalculator();
      }
      if(event.target.closest("[data-copy-calc]")) copyCalculation();
      const thumb = event.target.closest("[data-detail-image]");
      if(thumb && $("#detailMainImage")) $("#detailMainImage").src = thumb.dataset.detailImage;
      if(event.target.closest("[data-close-lead]") || event.target.id === "leadModal") closeLead();
    });
    document.addEventListener("input", event => {
      if(event.target.id === "lotBidInput" || event.target.id === "lotCalcInsurance" || event.target.id === "lotCalcExportDocs"){
        updateLotCalculator();
      }
    });
    document.addEventListener("change", event => {
      if(event.target.id === "lotCalcInsurance" || event.target.id === "lotCalcExportDocs"){
        updateLotCalculator();
      }
    });
    document.addEventListener("keydown", event => {
      if(event.key === "Escape") closeLead();
    });
    $("#auctionLeadForm").addEventListener("submit", submitLead);
  }

  async function initAuctions(){
    closeLead();
    bindEvents();
    const isDetail = await loadDetailFromUrl();
    if(!isDetail) loadLots();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initAuctions);
  }else{
    initAuctions();
  }
})();
