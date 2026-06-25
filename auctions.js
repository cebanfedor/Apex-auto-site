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
    // Top search bar: make/model text → "name" (title search), VIN → vin, LOT → search_query.
    const nameText = [$("#auctionMakeSearch")?.value.trim(), $("#auctionModelSearch")?.value.trim()].filter(Boolean).join(" ");
    const vin = $("#auctionVinSearch")?.value.trim();
    const lot = $("#auctionLotSearch")?.value.trim();
    if(nameText) params.set("name", nameText);
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
    // Mileage may be entered in km; the API has native odometer_from_km/to_km params.
    const odoUnit = document.querySelector("[data-odo-unit].active")?.dataset.odoUnit;
    if(odoUnit === "km"){
      [["mileageFrom","mileageFromKm"], ["mileageTo","mileageToKm"]].forEach(([from, to]) => {
        const v = params.get(from);
        if(v){ params.set(to, v); params.delete(from); }
      });
    }
    // sale_date_to is exclusive (treated as 00:00) — bump the "До" day by 1 so the picked day is included.
    const dTo = params.get("auctionDateTo");
    if(dTo){
      const d = new Date(dTo + "T00:00:00");
      if(!Number.isNaN(d.getTime())){
        d.setDate(d.getDate() + 1);
        params.set("auctionDateTo", d.toISOString().slice(0, 10));
      }
    }
    return params;
  }

  function statusTone(value){
    const text = String(value || "").toLowerCase();
    if(!value) return "";
    if(/не на ходу|\bнет\b|non[ -]|not |bill of sale|parts only|flood|water|missing|отсут/.test(text)) return "bad";
    if(/approval|утвержд|minimum|минимум|timed|salvage|starts|стартует|резерв|upcoming|unknown/.test(text)) return "warn";
    if(/run|drive|clear|\byes\b|\bда\b|заводится|едет|хорош|впервые|есть|на ходу|live|available|no reserve|без резерва/.test(text)) return "good";
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

  function vehicleKind(lot, override){
    if(override) return override;
    const b = String(lot.body || lot.bodyStyle || "").toLowerCase();
    const t = (String(lot.model || "") + " " + String(lot.make || "")).toLowerCase();
    if(/pickup|truck|silverado|sierra|ram|f-150|f150|tundra|tacoma/.test(b + t)) return "pickup";
    if(/van|cargo|sprinter|transit|minivan/.test(b + t)) return "van";
    if(/suv|utility|cuv|crossover/.test(b)) return "suv";
    return "sedan";
  }
  function landMultFor(kind){ return kind === "suv" ? 1.2 : kind === "crossover" ? 1.1 : (kind === "pickup" || kind === "van") ? 1.5 : 1; }
  function seaSurchargeFor(kind){ return kind === "suv" ? 300 : kind === "crossover" ? 200 : (kind === "pickup" || kind === "van") ? 500 : 0; }
  function landRouteLabel(lot){ const from = lot.location || "Локация США"; return `${from} → порт США`; }
  function seaRouteLabel(lot){ const port = lot.port || (String(lot.location||"").toLowerCase().includes("tx") ? "Houston" : "порт США"); return `${port} → Кишинёв`; }

  function mapFuel(raw, greenOverride){
    const f = String(raw || "").toLowerCase();
    if(/electric|электро|tesla/.test(f)) return "electric";
    if(/plug|phev/.test(f)) return "phev";
    if(/hybrid|гибрид/.test(f)) return "hybrid";
    if(/diesel|дизель/.test(f)) return "diesel";
    return greenOverride ? "hybrid" : "gasoline";
  }
  function findLotLocation(lot){
    const locs = window.LOCATIONS || [];
    if(!locs.length) return null;
    const auction = String(lot.auction || "").toLowerCase();
    const byAuction = locs.filter(l => {
      const a = String(l.auction || "").toLowerCase();
      if(!a) return true;
      if(auction.includes("copart")) return a.includes("copart");
      if(auction.includes("iaai")) return a.includes("iaai");
      return true;
    });
    const src = String(lot.location || "").toLowerCase().replace(/[^a-z0-9, ]/g, "").trim();
    if(!src) return null;
    const tokens = src.split(",").map(s => s.trim()).filter(Boolean);
    const city = tokens[0] || "";
    const state = (tokens[1] || "").slice(0, 2);
    let m = byAuction.find(l => {
      const lc = String(l.city || "").toLowerCase();
      const ls = String(l.state || "").toLowerCase();
      return city && (lc === city || lc.includes(city) || city.includes(lc)) && (!state || ls === state);
    });
    if(!m && city) m = byAuction.find(l => String(l.displayName || l.location || "").toLowerCase().includes(city));
    return m || null;
  }
  function calcLotTotal(lot, options = {}){
    const bid = Number(options.bid != null ? options.bid : (lot.currentBid || lot.buyNow || 0));
    const kind = options.vehicleType || vehicleKind(lot);
    const fuel = mapFuel(lot.fuel, !!options.green);
    const loc = findLotLocation(lot);
    const r = (window.ApexCalc && window.ApexCalc.compute) ? window.ApexCalc.compute({
      lotPrice:bid, auction:String(lot.auction || "copart").toLowerCase(),
      vehicleType:kind, fuel, engineLiters:numberFromEngine(lot.engine),
      year:Number(lot.year) || new Date().getFullYear(),
      insurance:options.insurance !== false, exportDocs:!!options.exportDocs, offsite:!!options.offsite,
      location:loc, usdMdl:17.45, eurMdl:20.28
    }) : null;
    if(!r){
      const auctionFee = auctionFeeFor(bid, lot.auction);
      return {bid, auctionFee, land:0, sea:0, insurance:0, exportDocs:0, service:300, customsUsd:0,
        total:bid + auctionFee, totalMdl:0, totalEur:0, kind, green:false,
        landRoute:landRouteLabel(lot), seaRoute:seaRouteLabel(lot)};
    }
    return {
      bid:r.lot, auctionFee:r.auctionFee, land:r.land, sea:r.sea,
      insurance:Math.round(r.insurance), exportDocs:r.exportDocs, service:Math.round(r.company),
      customsUsd:Math.round(r.customsUsd), total:Math.round(r.totalUsd),
      totalMdl:Math.round(r.totalMdl), totalEur:Math.round(r.totalEur),
      kind, green:["hybrid","phev","electric"].includes(fuel),
      landRoute: r.route || landRouteLabel(lot),
      seaRoute: r.port ? `${r.port} → Кишинёв` : seaRouteLabel(lot)
    };
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
    vin:'<rect x="3" y="7" width="18" height="10" rx="1"/><path d="M6 10v4M9 10v4M12 10v4M15 10v4M18 10v4"/>',
    zoom:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4M11 8v6M8 11h6"/>',
    play:'<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>'
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

  function altCurrency(calc){
    const mdl = Math.round(calc.totalMdl || calc.total * 17.45).toLocaleString("ru-RU");
    const eur = Math.round(calc.totalEur || calc.total * 17.45 / 20.28).toLocaleString("ru-RU");
    return `${mdl} MDL · €${eur}`;
  }

  function calcRow(label, value, sub){
    return `<div class="calcRowV2"><span>${escapeHtml(label)}${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span><b>${money(value)}</b></div>`;
  }

  function renderCalcRows(calc){
    const shippingSub = calc.bid + calc.auctionFee + calc.land + calc.sea;
    const clearingSub = calc.customsUsd + calc.insurance + calc.exportDocs + calc.service;
    return `
      <section class="calcSecV2">
        <div class="calcSecHeadV2"><span>Калькулятор стоимости</span><b>${money(shippingSub)}</b></div>
        ${calcRow("Ставка", calc.bid)}
        ${calcRow("Аукционный сбор", calc.auctionFee)}
        ${calcRow("Доставка по США", calc.land, calc.landRoute)}
        ${calcRow("Доставка морем", calc.sea, calc.seaRoute)}
      </section>
      <section class="calcSecV2">
        <div class="calcSecHeadV2"><span>Таможня и оформление</span><b>${money(clearingSub)}</b></div>
        ${calcRow("Таможенные платежи", calc.customsUsd)}
        ${calcRow("Страховка", calc.insurance)}
        ${calcRow("Экспортные документы", calc.exportDocs)}
        ${calcRow("Сопровождение Apex Auto", calc.service)}
      </section>`;
  }

  function renderLotCalculator(lot){
    const initialBid = lot.currentBid || lot.buyNow || 0;
    const kind = vehicleKind(lot);
    const calc = calcLotTotal(lot, {bid:initialBid, insurance:true, exportDocs:false, vehicleType:kind});
    const est = lot.estimatedRetailValue ? `оценка ${money(lot.estimatedRetailValue)}` : "";
    return `<aside class="lotCalcV2">
      <div class="calcTopV2">
        <div class="calcBidLabelV2"><span>Текущая ставка</span><b>${money(initialBid)}</b></div>
        ${est ? `<div class="calcEstV2">${dbIco("chart")}${escapeHtml(est)}</div>` : ""}
      </div>
      ${lot.saleStatus ? `<div class="calcSaleV2 ${saleClass(lot.saleStatus)}">${escapeHtml(lot.saleStatus)}</div>` : ""}
      <div class="calcStepperV2">
        <button type="button" data-bid-step="-500" aria-label="Уменьшить ставку">−</button>
        <input id="lotBidInput" data-calc-input type="number" min="0" step="100" value="${escapeHtml(initialBid || "")}" placeholder="Ваша ставка, $">
        <button type="button" data-bid-step="500" aria-label="Увеличить ставку">+</button>
      </div>
      <div class="calcOptsV2">
        <label class="calcOptV2"><input type="checkbox" id="lotVehSuv" data-calc-input ${kind === "suv" || kind === "crossover" ? "checked" : ""}><span>SUV / кроссовер</span><i>+20% по США · +$300 море</i></label>
        <label class="calcOptV2"><input type="checkbox" id="lotVehPickup" data-calc-input ${kind === "pickup" || kind === "van" ? "checked" : ""}><span>Пикап / минивэн</span><i>+50% по США · +$500 море</i></label>
        <label class="calcOptV2"><input type="checkbox" id="lotGreen" data-calc-input><span>Гибрид / электро</span><i>+$100 море</i></label>
        <label class="calcOptV2"><input type="checkbox" id="lotCalcExportDocs" data-calc-input><span>Экспортные документы</span><i>+$400</i></label>
        <label class="calcOptV2"><input type="checkbox" id="lotCalcInsurance" data-calc-input checked><span>Страховка 1%</span><i>защита в пути</i></label>
      </div>
      <div id="lotCalcBody" class="calcBodyV2">${renderCalcRows(calc)}</div>
      <div class="calcGrandV2">
        <span>Итого под ключ до Кишинёва</span>
        <b id="lotCalcTotal">${money(calc.total)}</b>
        <small id="lotCalcTotalAlt">${altCurrency(calc)}</small>
      </div>
      <div class="calcCtasV2">
        <button class="dbBtnPrimary" type="button" data-lead="${escapeHtml(lot.id)}">Оставить заявку</button>
        <button class="dbBtnGhost" type="button" data-copy-calc>Скопировать расчёт</button>
        <a class="dbBtnGhost" href="${calcHref(lot)}">Открыть в полном калькуляторе</a>
      </div>
      <p class="calcNoteV2">Расчёт предварительный, для ориентира. Итоговую сумму подтверждаем перед покупкой.</p>
    </aside>`;
  }

  function updateLotCalculator(){
    if(!state.selectedLot || !$("#lotBidInput")) return;
    const veh = $("#lotVehPickup")?.checked ? "pickup" : $("#lotVehSuv")?.checked ? "suv" : "sedan";
    const calc = calcLotTotal(state.selectedLot, {
      bid:Number($("#lotBidInput").value || 0),
      insurance:$("#lotCalcInsurance")?.checked,
      exportDocs:$("#lotCalcExportDocs")?.checked,
      green:$("#lotGreen")?.checked,
      vehicleType:veh
    });
    $("#lotCalcBody").innerHTML = renderCalcRows(calc);
    $("#lotCalcTotal").textContent = money(calc.total);
    $("#lotCalcTotalAlt").textContent = altCurrency(calc);
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

  function dMain(label, value){
    if(value == null || value === "") return "";
    const t = statusTone(value) || "neutral";
    const ic = t === "good" ? "check" : t === "bad" ? "warn" : t === "warn" ? "warn" : "q";
    return `<div class="dRowV2"><span class="dRowLbl">${escapeHtml(label)}</span><span class="dRowVal dTone-${t}">${dbIco(ic)}<span>${escapeHtml(value)}</span></span></div>`;
  }
  function dPlain(label, valueHtml){
    if(valueHtml == null || valueHtml === "") return "";
    return `<div class="dRowV2"><span class="dRowLbl">${escapeHtml(label)}</span><span class="dRowVal">${valueHtml}</span></div>`;
  }

  const lb = {images:[], index:0};
  function ensureLightbox(){
    let el = document.getElementById("lotLightbox");
    if(el) return el;
    el = document.createElement("div");
    el.id = "lotLightbox";
    el.className = "lbV1";
    el.hidden = true;
    el.innerHTML = `
      <div class="lbTopV1">
        <span id="lbCount" class="lbCountV1"></span>
        <div class="lbActionsV1">
          <button class="lbBtnV1" type="button" data-lb-copy>Скопировать ссылку</button>
          <button class="lbBtnV1 lbCloseV1" type="button" data-lb-close aria-label="Закрыть">✕</button>
        </div>
      </div>
      <button class="lbNavV1 lbPrevV1" type="button" data-lb-prev aria-label="Предыдущее фото">‹</button>
      <img id="lbImg" class="lbImgV1" alt="">
      <button class="lbNavV1 lbNextV1" type="button" data-lb-next aria-label="Следующее фото">›</button>`;
    document.body.appendChild(el);
    return el;
  }
  function renderLightbox(){
    const img = document.getElementById("lbImg");
    if(img) img.src = lb.images[lb.index] || "";
    const c = document.getElementById("lbCount");
    if(c) c.textContent = `${lb.index + 1} / ${lb.images.length}`;
    const multi = lb.images.length > 1;
    document.querySelectorAll(".lbNavV1").forEach(b => b.style.display = multi ? "" : "none");
  }
  function openLightbox(images, index){
    if(!images || !images.length) return;
    lb.images = images;
    lb.index = Math.max(0, Math.min(index || 0, images.length - 1));
    const el = ensureLightbox();
    el.hidden = false;
    document.body.classList.add("lbOpenV1");
    renderLightbox();
  }
  function closeLightbox(){
    const el = document.getElementById("lotLightbox");
    if(el) el.hidden = true;
    document.body.classList.remove("lbOpenV1");
  }
  function lbMove(step){
    if(!lb.images.length) return;
    lb.index = (lb.index + step + lb.images.length) % lb.images.length;
    renderLightbox();
  }
  function lbCopyLink(){
    const url = lb.images[lb.index];
    if(!url) return;
    navigator.clipboard?.writeText(url);
    const btn = document.querySelector("[data-lb-copy]");
    if(btn){ btn.textContent = "Скопировано"; setTimeout(() => { btn.textContent = "Скопировать ссылку"; }, 1500); }
  }

  function renderSimilarCard(lot){
    const title = lotTitle(lot);
    const specLine = [lot.engine, lot.drive, lot.transmission].filter(Boolean).join(" • ");
    const cond = [lot.condition, dbOdo(lot.odometerText)].filter(Boolean).join(" · ");
    return `<a class="simCardV1" href="${detailHref(lot)}">
      <div class="simPhotoV1">${lot.image ? `<img src="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy">` : ""}<span class="simBidV1">${money(lot.currentBid || lot.buyNow)}</span></div>
      <h4>${escapeHtml(title)}</h4>
      <span class="simVinV1">${dbIco("vin")}${escapeHtml(lot.vin || "—")}</span>
      <span>${dbIco("engine")}${escapeHtml(specLine || "—")}</span>
      <span>${dbIco("odo")}${escapeHtml(cond || "—")}</span>
    </a>`;
  }

  async function loadSimilar(lot){
    const box = document.getElementById("similarLots");
    const sec = document.getElementById("similarSection");
    if(!box || !sec) return;
    let items = [];
    try{
      if(isLocalHost()) throw new Error("local-demo");
      const params = new URLSearchParams({action:"search", auction:lot.auction || "copart", make:lot.make || "", model:lot.model || "", per_page:"12", sort:"soon"});
      const payload = await api(`/api/auctions?${params}`);
      items = (payload.items || []).filter(x => String(x.id) !== String(lot.id)).slice(0, 12);
    }catch(error){
      if(isLocalHost()) items = demoLots().filter(x => String(x.id) !== String(lot.id));
    }
    if(!items.length) return;
    box.innerHTML = items.map(renderSimilarCard).join("");
    sec.hidden = false;
  }

  function renderDetail(lot){
    const images = lot.images?.length ? lot.images : [lot.image].filter(Boolean);
    const title = lotTitle(lot);
    const dmgParts = String(lot.damage || "").split("/").map(s => s.trim()).filter(Boolean);
    const primaryDmg = lot.primaryDamage || dmgParts[0] || "";
    const secondaryDmg = lot.secondaryDamage || dmgParts[1] || "";
    const driveLine = [lot.engine, lot.cylinders && `${lot.cylinders} цил`, lot.drive, lot.transmission].filter(Boolean).join(" · ");
    const specLine = [lot.engine, lot.cylinders && `${lot.cylinders} цил`, lot.drive, lot.transmission].filter(Boolean).join(" • ");
    const vinReport = lot.vin ? `https://www.google.com/search?q=${encodeURIComponent(lot.vin)}` : "";
    $("#auctionCatalog").hidden = true;
    const detail = $("#auctionDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a>
      <section class="auctionDetailPanelV1">
        <div class="detailHeaderV1">
          <div>
            <span class="auctionCrumbsV1">Главная / Аукционы / ${escapeHtml(lot.auction.toUpperCase())} ${escapeHtml(lot.lot || "")}</span>
            <h1>${escapeHtml(title)}</h1>
            <p class="dSpecLine">${dbIco("engine")}<span>${escapeHtml(specLine || "—")}</span>${lot.vin ? `<span class="dSpecVin">${dbIco("vin")}${escapeHtml(lot.vin)}</span>` : ""}</p>
          </div>
          ${vinReport ? `<a class="dVinBtn" href="${vinReport}" target="_blank" rel="noopener">Отчёт истории VIN</a>` : ""}
        </div>
        <div class="lotDetailGridV1">
          <div class="detailGalleryV1">
            <div class="dGalMainV2" data-lb-open role="button" tabindex="0" aria-label="Открыть фото в HD">
              <img id="detailMainImage" class="detailMainImageV1" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(title)}">
              <span class="dAuc dGalChipV2">${escapeHtml(lot.auction.toUpperCase())}</span>
              <div class="dGalBadgesV2">
                ${lot.video ? `<span class="dGalTagV2">${dbIco("play")} Видео</span>` : ""}
                ${lot.has360 || lot.spin ? `<span class="dGalTagV2">360°</span>` : ""}
                <span class="dGalTagV2">${dbIco("zoom")} HD · ${escapeHtml(images.length || 1)} фото</span>
              </div>
            </div>
            <div class="detailThumbsV1">
              ${images.map((src, i) => `<img class="dThumbV2${i === 0 ? " isActiveThumbV2" : ""}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" data-detail-image="${escapeHtml(src)}" data-detail-index="${i}">`).join("")}
            </div>
          </div>
          <div class="lotDetailCenterV1">
            <section class="dSec">
              <div class="dSecHead">Главное</div>
              ${dMain("Состояние", lot.condition)}
              ${dMain("Продавец", lot.seller)}
              ${dMain("Ключ доступен", lot.keys)}
              ${dMain("Статус документов", lot.document)}
              ${dMain("История", lot.priceHistory?.length ? `${lot.priceHistory.length} записи` : "Впервые в продаже")}
              ${dPlain("Привод", escapeHtml(driveLine))}
              ${dPlain("Пробег", escapeHtml(dbOdo(lot.odometerText)))}
              ${dMain("Основное повреждение", primaryDmg)}
              ${dMain("Вторичное повреждение", secondaryDmg)}
              ${dPlain("Тип документа", escapeHtml(lot.document))}
              ${vinReport ? dPlain("Экстра", `<a class="dLink" href="${vinReport}" target="_blank" rel="noopener">Отчёт VIN</a>`) : ""}
            </section>
            <div class="dRecoV2">${dbIco("check")}<div><b>Apex Auto рекомендует</b><p>Поможем проверить лот, документы и историю, рассчитать стоимость под ключ до Кишинёва и сопроводить сделку от ставки до выдачи.</p></div></div>
            <section class="dSec">
              <div class="dSecHead">Аукцион</div>
              ${dPlain("VIN", escapeHtml(lot.vin))}
              ${dPlain("Номер лота", `${escapeHtml(lot.lot || "—")} <span class="dAucMini">${escapeHtml(lot.auction.toUpperCase())}</span>`)}
              ${dPlain("Статус продажи", escapeHtml(lot.saleStatus))}
              ${dPlain("Продавец", escapeHtml(lot.seller))}
              ${dPlain("Дата аукциона", escapeHtml(dbDate(lot.auctionDate)))}
              ${dPlain("Локация", escapeHtml(lot.location))}
              ${dPlain("Оценка (ACV)", lot.estimatedRetailValue ? money(lot.estimatedRetailValue) : "")}
            </section>
            <section class="dSec">
              <div class="dSecHead">Описание</div>
              ${dPlain("Тип топлива", escapeHtml(lot.fuel))}
              ${dPlain("Цвет кузова", escapeHtml(lot.color))}
              ${dPlain("Тип кузова", escapeHtml(lot.body))}
              ${dPlain("Цилиндры", escapeHtml(lot.cylinders))}
            </section>
            ${Array.isArray(lot.priceHistory) && lot.priceHistory.length ? `<section class="dSec">
              <div class="dSecHead">История цены</div>
              <div class="priceHistoryV1">${lot.priceHistory.slice(0, 8).map(item => `<span>${escapeHtml(item.date || item.sale_date || "")} ${escapeHtml(money(item.price || item.bid || item.amount))}</span>`).join("")}</div>
            </section>` : ""}
          </div>
          ${renderLotCalculator(lot)}
        </div>
        <section class="simSecV1" id="similarSection" hidden>
          <h2>Похожие лоты</h2>
          <div class="simGridV1" id="similarLots"></div>
        </section>
      </section>
    `;
    state.selectedLot = lot;
    state.detailImages = images;
    state.detailIndex = 0;
    setSeo(lot);
    updateLotCalculator();
    loadSimilar(lot);
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
      const demo = isLocalHost() && demoLots().find(l => String(l.lot) === String(slug.lot));
      if(demo){
        renderDetail(demo);
      }else{
        $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a><div class="auctionMessageV1">${escapeHtml(error.message || "Лот временно недоступен.")}</div>`;
      }
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

  function rangeUnitFactor(rangeEl){
    const t = rangeEl.closest("details")?.querySelector("[data-odo-unit].active");
    return (t && t.dataset.odoUnit === "km") ? 1.609 : 1;
  }
  function initRanges(){
    document.querySelectorAll("[data-range]").forEach(range => {
      if(range.dataset.init) return;
      range.dataset.init = "1";
      const min = Number(range.dataset.min), max = Number(range.dataset.max);
      const lo = range.querySelector(".rLoV2"), hi = range.querySelector(".rHiV2"), fill = range.querySelector(".rangeFillV2");
      const nums = range.querySelectorAll(".rangeNumsV2 input"), numLo = nums[0], numHi = nums[1];
      const pct = v => ((v - min) / (max - min)) * 100;
      const paint = () => {
        const a = Math.min(Number(lo.value), Number(hi.value)), b = Math.max(Number(lo.value), Number(hi.value));
        fill.style.left = pct(a) + "%";
        fill.style.width = (pct(b) - pct(a)) + "%";
      };
      const fromSlider = () => {
        let a = Number(lo.value), b = Number(hi.value);
        if(a > b){ const t = a; a = b; b = t; lo.value = a; hi.value = b; }
        const f = rangeUnitFactor(range);
        numLo.value = a > min ? Math.round(a * f) : "";
        numHi.value = b < max ? Math.round(b * f) : "";
        paint();
      };
      const fromNum = () => {
        const f = rangeUnitFactor(range);
        lo.value = numLo.value !== "" ? Math.min(max, Math.max(min, Number(numLo.value) / f)) : min;
        hi.value = numHi.value !== "" ? Math.min(max, Math.max(min, Number(numHi.value) / f)) : max;
        paint();
      };
      lo.addEventListener("input", fromSlider);
      hi.addEventListener("input", fromSlider);
      if(numLo) numLo.addEventListener("input", fromNum);
      if(numHi) numHi.addEventListener("input", fromNum);
      range._refresh = fromSlider;
      paint();
    });
  }

  // optionsFn returns an array of strings or {id,name,image,qty}. onPick(option) fires on selection.
  function setupCombo(inputId, menuId, optionsFn, onPick){
    const input = document.getElementById(inputId);
    const menu = document.getElementById(menuId);
    if(!input || !menu) return;
    const wrap = input.closest(".comboV2");
    const norm = o => (typeof o === "string" ? {id:null, name:o} : o);
    const render = (showAll) => {
      const q = showAll ? "" : input.value.trim().toLowerCase();
      const opts = (optionsFn() || []).map(norm).filter(o => !q || String(o.name).toLowerCase().includes(q));
      menu._opts = opts;
      menu.innerHTML = opts.length
        ? opts.map((o, i) => `<div class="comboOptV2" data-i="${i}">${o.image ? `<img class="comboLogoV2" src="${escapeHtml(o.image)}" alt="" loading="lazy">` : ""}<span>${escapeHtml(o.name)}</span>${o.qty ? `<span class="comboQtyV2">${escapeHtml(o.qty)}</span>` : ""}</div>`).join("")
        : `<div class="comboEmptyV2">Ничего не найдено</div>`;
    };
    const close = () => { menu.hidden = true; };
    input.addEventListener("focus", () => { render(true); menu.hidden = false; setTimeout(() => { try{ input.select(); }catch(e){} }, 0); });
    input.addEventListener("click", () => { render(true); menu.hidden = false; });
    input.addEventListener("input", () => { render(false); menu.hidden = false; });
    input.addEventListener("keydown", e => { if(e.key === "Escape") close(); });
    menu.addEventListener("mousedown", e => {
      const el = e.target.closest("[data-i]");
      if(!el) return;
      e.preventDefault();
      const opt = menu._opts[Number(el.dataset.i)];
      input.value = opt.name;
      close();
      if(onPick) onPick(opt);
    });
    document.addEventListener("click", e => { if(e.target.closest(".comboV2") !== wrap) close(); });
  }

  function initCarData(){
    const data = window.CAR_DATA || {};
    const makeInput = document.getElementById("filterMakeV2");
    const makeId = document.getElementById("filterMakeIdV2");
    const modelInput = document.getElementById("filterModelV2");
    const modelId = document.getElementById("filterModelIdV2");
    const genInput = document.getElementById("filterGenV2");
    const genId = document.getElementById("filterGenIdV2");
    let manufacturers = [];
    let models = [];
    let generations = [];

    function resetGenerations(){
      generations = [];
      if(genInput){ genInput.value = ""; genInput.placeholder = "Сначала выберите модель"; }
      if(genId) genId.value = "";
    }

    // Make + Model: live from API (manufacturer_id / model_id); fall back to static names locally.
    setupCombo("filterMakeV2", "makeMenuV2", () => manufacturers, async (opt) => {
      if(makeId) makeId.value = opt.id != null ? opt.id : "";
      if(modelInput){ modelInput.value = ""; modelInput.placeholder = "Загрузка моделей…"; }
      if(modelId) modelId.value = "";
      models = [];
      resetGenerations();
      if(opt.id != null){
        try{ const r = await api(`/api/auctions?action=models&manufacturer_id=${encodeURIComponent(opt.id)}`); models = r.items || []; }
        catch(e){ models = []; }
      }else{
        const key = Object.keys(data.models || {}).find(k => k.toLowerCase() === String(opt.name).toLowerCase());
        models = key ? data.models[key].map(n => ({id:null, name:n})) : [];
      }
      if(modelInput) modelInput.placeholder = models.length ? "Выбрать модель" : "Модель (введите вручную)";
    });
    makeInput?.addEventListener("input", () => { if(makeId) makeId.value = ""; });

    setupCombo("filterModelV2", "modelMenuV2", () => models, async (opt) => {
      if(modelId) modelId.value = opt.id != null ? opt.id : "";
      resetGenerations();
      if(opt.id != null){
        if(genInput) genInput.placeholder = "Загрузка поколений…";
        try{ const r = await api(`/api/auctions?action=generations&model_id=${encodeURIComponent(opt.id)}`); generations = r.items || []; }
        catch(e){ generations = []; }
        if(genInput) genInput.placeholder = generations.length ? "Любое поколение" : "Поколения не найдены";
      }
    });
    modelInput?.addEventListener("input", () => { if(modelId) modelId.value = ""; resetGenerations(); });

    // Generation → generation_id (depends on the selected model)
    setupCombo("filterGenV2", "genMenuV2", () => generations, (opt) => { if(genId) genId.value = opt.id != null ? opt.id : ""; });
    genInput?.addEventListener("input", () => { if(genId) genId.value = ""; });

    api(`/api/auctions?action=manufacturers`).then(r => { manufacturers = r.items || []; }).catch(() => {
      manufacturers = (data.makes || []).map(n => ({id:null, name:n}));
    });

    // Damage list (standard descriptions; sent as text — confirmed filterable)
    setupCombo("filterDamageV2", "damageMenuV2", () => data.damages || []);

    // Color → color id
    const colorId = document.getElementById("filterColorIdV2");
    setupCombo("filterColorV2", "colorMenuV2", () => data.colors || [], (opt) => { if(colorId) colorId.value = opt.id != null ? opt.id : ""; });
    document.getElementById("filterColorV2")?.addEventListener("input", () => { if(colorId) colorId.value = ""; });

    // State → state_code
    const stateId = document.getElementById("filterStateIdV2");
    setupCombo("filterStateV2", "stateMenuV2", () => data.states || [], (opt) => { if(stateId) stateId.value = opt.id != null ? opt.id : ""; });
    document.getElementById("filterStateV2")?.addEventListener("input", () => { if(stateId) stateId.value = ""; });
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
      document.querySelectorAll(".dateQuickV2 button.active").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("[data-range]").forEach(range => { if(range._refresh) range._refresh(); });
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
      const odoBtn = event.target.closest("[data-odo-unit]");
      if(odoBtn){
        const wrap = odoBtn.closest("details");
        wrap.querySelectorAll("[data-odo-unit]").forEach(b => b.classList.toggle("active", b === odoBtn));
        const range = wrap.querySelector("[data-range]");
        if(range && range._refresh) range._refresh();
      }
      const dq = event.target.closest("[data-date-range]");
      if(dq){
        const form = $("#auctionFiltersForm");
        const pad = n => String(n).padStart(2, "0");
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        const from = new Date(); from.setHours(0, 0, 0, 0);
        const to = new Date(from);
        const kind = dq.dataset.dateRange;
        if(kind === "tomorrow"){ from.setDate(from.getDate() + 1); to.setDate(to.getDate() + 1); }
        else if(kind === "week"){ to.setDate(to.getDate() + 7); }
        else if(kind === "nextweek"){ from.setDate(from.getDate() + 7); to.setDate(to.getDate() + 14); }
        if(form.auctionDateFrom) form.auctionDateFrom.value = fmt(from);
        if(form.auctionDateTo) form.auctionDateTo.value = fmt(to);
        dq.closest(".dateQuickV2").querySelectorAll("button").forEach(b => b.classList.toggle("active", b === dq));
      }
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
      if(thumb){
        if($("#detailMainImage")) $("#detailMainImage").src = thumb.dataset.detailImage;
        state.detailIndex = Number(thumb.dataset.detailIndex || 0);
        document.querySelectorAll(".detailThumbsV1 .dThumbV2").forEach(t => t.classList.remove("isActiveThumbV2"));
        thumb.classList.add("isActiveThumbV2");
      }
      // Lightbox controls
      if(event.target.closest("[data-lb-copy]")){ lbCopyLink(); return; }
      if(event.target.closest("[data-lb-prev]")){ lbMove(-1); return; }
      if(event.target.closest("[data-lb-next]")){ lbMove(1); return; }
      if(event.target.closest("[data-lb-close]")){ closeLightbox(); return; }
      if(event.target.id === "lotLightbox"){ closeLightbox(); return; }
      if(event.target.closest("[data-lb-open]")){
        openLightbox(state.detailImages || [], state.detailIndex || 0);
        return;
      }
      if(event.target.closest("[data-close-lead]") || event.target.id === "leadModal") closeLead();
    });
    document.addEventListener("input", event => {
      if(event.target.closest("[data-calc-input]")) updateLotCalculator();
    });
    document.addEventListener("change", event => {
      if(event.target.closest("[data-calc-input]")) updateLotCalculator();
    });
    document.addEventListener("keydown", event => {
      const lbOpen = document.getElementById("lotLightbox") && !document.getElementById("lotLightbox").hidden;
      if(lbOpen){
        if(event.key === "Escape"){ closeLightbox(); return; }
        if(event.key === "ArrowLeft"){ lbMove(-1); return; }
        if(event.key === "ArrowRight"){ lbMove(1); return; }
      }
      if(event.key === "Escape") closeLead();
    });
    $("#auctionLeadForm").addEventListener("submit", submitLead);
  }

  async function initAuctions(){
    closeLead();
    bindEvents();
    initRanges();
    initCarData();
    const isDetail = await loadDetailFromUrl();
    if(!isDetail) loadLots();
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", initAuctions);
  }else{
    initAuctions();
  }
})();
