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

  const DB_ICONS = {
    engine:'<path d="M5 9h2l2-2h3v2h3l2 2h2v4h-2v2h-5l-2 2H9v-4H5z"/>',
    odo:'<circle cx="12" cy="13" r="7"/><path d="M12 13l3.5-2.5M12 4v1M5 13H4M20 13h-1"/>',
    damage:'<path d="M14.5 5.6a3.4 3.4 0 0 0-.7 3.8L5 18l1 1 8.6-8.6a3.4 3.4 0 0 0 3.8-.7 3.4 3.4 0 0 0 .8-3.6l-2 2-1.8-1.8 2-2a3.4 3.4 0 0 0-1.7.5z"/>',
    doc:'<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
    pin:'<path d="M12 21s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z"/><circle cx="12" cy="11" r="2"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/>',
    clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    chart:'<path d="M4 19V5M4 19h16"/><path d="M7 14l3-3 3 2 4-5"/>',
    check:'<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.4l2.4 2.4 5-5"/>',
    warn:'<path d="M12 4l8.5 15H3.5z"/><path d="M12 10v4M12 16.5v.5"/>',
    q:'<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.8.4-1 .9-1 1.6M12 16v.5"/>',
    star:'<path d="M12 4l2.3 4.9 5.2.7-3.8 3.7.9 5.2L12 16.7 7.4 18.2l.9-5.2L4.5 9.6l5.2-.7z"/>',
    vin:'<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M6 10v4M9 10v4M12 10v4M15 10v4M18 10v4"/>'
  };
  function dbIco(name){
    return `<svg class="dbIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DB_ICONS[name] || ""}</svg>`;
  }
  function dbDate(value){
    if(!value) return "—";
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return String(value).slice(0, 16);
    const lang = window.APEX_LANG || "ru";
    const loc = lang === "ro" ? "ro-RO" : lang === "en" ? "en-US" : "ru-RU";
    return d.toLocaleString(loc, {weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"});
  }
  function dbOdo(text){
    if(!text) return "";
    const num = Number(String(text).replace(/[^\d.]/g, ""));
    if(!num) return escapeHtml(text);
    const k = v => v >= 1000 ? Math.round(v / 1000) + "k" : String(Math.round(v));
    if(/mi/i.test(text)) return `${k(num)} mi ≈ ${k(num * 1.609)} km`;
    return `${k(num)} km`;
  }
  function dbLive(lot){
    const s = String(lot.lotStatus || "").toLowerCase();
    if(/live/.test(s)) return ["Идут торги", "live"];
    if(/upcoming|new|soon|скоро/.test(s)) return ["Live скоро начнётся", "soon"];
    if(/sold|завер/.test(s)) return ["Торги завершены", "done"];
    if(/buy/.test(s)) return ["Купить сейчас", "buy"];
    return [lot.lotStatus || "—", ""];
  }
  function dbSpec(icon, value){
    if(!value) return "";
    return `<li>${dbIco(icon)}<span>${value}</span></li>`;
  }
  function dbCheck(label, value){
    const tone = statusTone(value) || "neutral";
    const icon = tone === "good" ? "check" : tone === "bad" ? "warn" : tone === "warn" ? "warn" : "q";
    return `<li class="dbCheck ${tone}">${dbIco(icon)}<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value || "—")}</span></li>`;
  }

  function renderCard(lot){
    const title = lotTitle(lot);
    const [liveLabel, liveTone] = dbLive(lot);
    const isNew = /upcoming|new/i.test(lot.lotStatus || "");
    const engineLine = [lot.engine, lot.drive, lot.transmission].filter(Boolean).join(" • ");
    const estimate = lot.estimatedRetailValue ? money(lot.estimatedRetailValue) : "";
    const price = money(lot.currentBid || lot.buyNow);
    const photos = lot.photoCount || lot.images?.length || 1;
    return `<article class="dbCard">
      <a class="dbPhoto" href="${detailHref(lot)}">
        ${lot.image ? `<img src="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy">` : `<span class="dbNoPhoto">Нет фото</span>`}
        <span class="dbAuc">${escapeHtml(lot.auction.toUpperCase())}</span>
        <span class="dbPhotoCount">1/${escapeHtml(photos)}</span>
        <span class="dbFav" role="button" title="В избранное">${dbIco("star")}</span>
      </a>
      <div class="dbBody">
        <div class="dbHead">
          <a class="dbTitle" href="${detailHref(lot)}">${escapeHtml(title)}</a>
          <div class="dbIds">
            <span class="dbVin">${dbIco("vin")}${escapeHtml(lot.vin || "—")}</span>
            <span class="dbLotNo">${dbIco("warn")}${escapeHtml(lot.lot || "—")}</span>
            ${isNew ? `<span class="dbNew">Новый лот</span>` : ""}
          </div>
        </div>
        <div class="dbCols">
          <ul class="dbSpecs">
            ${dbSpec("engine", escapeHtml(engineLine))}
            ${dbSpec("odo", dbOdo(lot.odometerText))}
            ${dbSpec("damage", escapeHtml(lot.damage))}
            ${dbSpec("doc", escapeHtml(lot.document))}
            ${dbSpec("pin", escapeHtml(lot.location))}
            ${lot.vin ? `<li class="dbVinReport">${dbIco("doc")}<a href="https://www.google.com/search?q=${encodeURIComponent(lot.vin)}" target="_blank" rel="noopener">Отчет VIN</a></li>` : ""}
          </ul>
          <ul class="dbChecks">
            ${dbCheck("Состояние", lot.condition)}
            ${dbCheck("Продавец", lot.seller)}
            ${dbCheck("Ключ доступен", lot.keys)}
            ${dbCheck("Документы", lot.document)}
            ${dbCheck("История", lot.priceHistory?.length ? `${lot.priceHistory.length} записей` : "Впервые в продаже")}
          </ul>
        </div>
      </div>
      <aside class="dbAside">
        <div class="dbWhen">
          <span>${dbIco("calendar")}${escapeHtml(dbDate(lot.auctionDate))}</span>
          <span class="dbLive ${liveTone}">${dbIco("clock")}${escapeHtml(liveLabel)}</span>
        </div>
        <div class="dbPriceWrap">
          ${estimate ? `<div class="dbEst">${dbIco("chart")}<span>оценка ${escapeHtml(estimate)}</span></div>` : ""}
          <div class="dbPriceBox">
            <span>Текущая цена</span>
            <b>${price}</b>
          </div>
          ${lot.saleStatus ? `<div class="dbSale ${saleClass(lot.saleStatus)}">${escapeHtml(lot.saleStatus)}</div>` : ""}
          <div class="dbActions">
            <a class="dbBtnGhost" href="${calcHref(lot)}">Рассчитать доставку</a>
            <button class="dbBtnPrimary" type="button" data-lead="${escapeHtml(lot.id)}">Оставить заявку</button>
          </div>
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

  // Demo lots so the catalog is reviewable on localhost without AUCTIONS_API_KEY.
  function isLocalHost(){ return /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname); }
  function demoLots(){
    const base = o => Object.assign({
      id:"", auction:"copart", year:"", make:"", model:"", vin:"", lot:"", engine:"", drive:"",
      transmission:"", odometerText:"", damage:"", document:"", location:"", condition:"", seller:"",
      keys:"", priceHistory:[], photoCount:6, lotStatus:"upcoming", saleStatus:"На утверждении",
      currentBid:0, buyNow:0, estimatedRetailValue:0, auctionDate:"2026-06-24T19:30:00", image:""
    }, o);
    return [
      base({id:"demo1", year:"2017", make:"Ford", model:"Mustang EcoBoost", vin:"1FA6P8TH7H5205020", lot:"44500315", engine:"I4", drive:"RWD", transmission:"AT", odometerText:"105,000 mi", damage:"Front End / Bio-Chemical", document:"CA • Salvage", location:"Wilmington, CA", condition:"Не на ходу", seller:"Allied Solutions", keys:"Да", currentBid:1050, estimatedRetailValue:5500, image:"/assets/hot-bmw-5.png"}),
      base({id:"demo2", year:"2019", make:"Land Rover", model:"Range Rover Sport", vin:"SALWR2RE8KA828197", lot:"42923654", engine:"5.0L V8", drive:"4×4", transmission:"AT", odometerText:"78,000 mi", damage:"Front End", document:"CA • Salvage", location:"Los Angeles, CA", condition:"Заводится и едет", seller:"Progressive Insurance", keys:"Да", currentBid:15100, estimatedRetailValue:26000, image:"/assets/hot-bmw-x5.png"}),
      base({id:"demo3", year:"2021", make:"Mercedes-Benz", model:"E-Class", vin:"W1KZF8DB4MA948271", lot:"44758603", engine:"2.0L", drive:"RWD", transmission:"AT", odometerText:"41,000 mi", damage:"Rear End", document:"CA • Salvage", location:"Los Angeles, CA", condition:"Заводится и едет", seller:"GEICO", keys:"Да", currentBid:9800, estimatedRetailValue:21000, saleStatus:"Без резерва", image:"/assets/hot-mercedes-e.png"})
    ];
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
      if(isLocalHost()){
        state.items = demoLots();
        $("#auctionResultCount").textContent = "373 909";
        $("#auctionResultLabel").textContent = "демо-лоты (локально, без AUCTIONS_API_KEY)";
        renderCards(false);
      }else{
        $("#auctionResultCount").textContent = "0";
        setMessage(error.message || "Не удалось загрузить реальные лоты AuctionsAPI. Проверьте AUCTIONS_API_KEY или попробуйте позже.");
      }
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
