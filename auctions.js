(function(){
  const $ = selector => document.querySelector(selector);
  function debounce(fn, ms){
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }
  // Discovery mode: fresh open with no URL params → default to run-and-drive + insurance shuffle
  let discoveryMode = !location.search.length;
  const INS_RE = /insurance|geico|progressive|allstate|usaa|state.?farm|farmers|nationwide|liberty.?mutual|travelers|erie|metlife|kemper|csaa/i;
  function exitDiscovery(){ discoveryMode = false; }
  const state = {
    auction:"all",
    tab:"all",
    page:1,
    perPage:100,
    displayPage:1,
    displayPageSize:30,
    filteredCount:0,
    total:0,
    hasMore:false,
    loading:false,
    items:[],
    selectedLot:null
  };

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  // Title-case for lowercase English API values ("rogersville, missouri" → "Rogersville, Missouri",
  // "nj"→"NJ"). Preserves already-uppercase tokens (AWD, V6). Not for Russian text.
  function tc(text){
    if(text == null || text === "") return text;
    return String(text).replace(/[A-Za-z0-9]+/g, w => {
      if(w === w.toUpperCase()) return w;
      if(/^[a-z]{2}$/.test(w)) return w.toUpperCase();
      return w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  function upAbbr(text){ // short drive/trans codes: rwd→RWD, at→AT
    const t = String(text || "").trim();
    return t && t.length <= 4 ? t.toUpperCase() : tc(t);
  }
  function cleanEngine(raw){
    const s = String(raw || "");
    const displ = s.match(/\b(\d+\.\d+)/);
    const turbo = /\bturbo\b/i.test(s) ? "Turbo" : "";
    const sc    = /supercharg/i.test(s)  ? "SC"    : "";
    return [displ ? displ[1] : "", turbo || sc].filter(Boolean).join(" ");
  }
  function cleanTrans(raw){
    const s = String(raw || "").toLowerCase();
    if(!s) return "";
    if(/cvt/.test(s)) return "CVT";
    if(/auto|^at$/.test(s)) return "AT";
    if(/manual|^mt$/.test(s)) return "MT";
    return upAbbr(raw);
  }

  function money(value){
    const number = Number(value || 0);
    return number ? `$${Math.round(number).toLocaleString("en-US")}` : "—";
  }

  // ---- Русские значения enum-полей API (повреждения, топливо, цвет, кузов) ----
  const RU_DAMAGE = {
    "front end":"Спереди","rear end":"Сзади","left front":"Слева спереди","right front":"Справа спереди",
    "left rear":"Слева сзади","right rear":"Справа сзади","left side":"Левая сторона","right side":"Правая сторона",
    "side":"Сбоку","all over":"По всему кузову","top/roof":"Крыша","roof":"Крыша",
    "undercarriage":"Днище / подвеска","mechanical":"Механическое","engine damage":"Двигатель",
    "transmission":"Трансмиссия","electrical":"Электрика","interior":"Салон",
    "minor dent/scratches":"Мелкие вмятины / царапины","minor dents/scratches":"Мелкие вмятины / царапины",
    "normal wear":"Естественный износ","wear and tear":"Естественный износ",
    "hail":"Град","water/flood":"Затопление","flood":"Затопление","water":"Затопление",
    "burn":"Огонь","burn - engine":"Огонь · двигатель","burn - interior":"Огонь · салон",
    "rollover":"Переворот","vandalism":"Вандализм","theft":"После угона","stripped":"Разукомплектован",
    "frame damage":"Повреждение рамы","suspension":"Подвеска","biohazard/chemical":"Био / химия",
    "bio chemical":"Био / химия","biohazard chemical":"Био / химия",
    "partial repair":"Частичный ремонт","repossession":"Изъятие (repo)","storm damage":"Шторм",
    "rejected repair":"Отказ от ремонта","missing/altered vin":"Проблема с VIN","replaced vin":"Заменён VIN",
    "unknown":"Не указано","none":"Без повреждений"
  };
  const RU_FUEL = {
    gasoline:"Бензин",gas:"Бензин",petrol:"Бензин",diesel:"Дизель",hybrid:"Гибрид",
    "plug-in hybrid":"Plug-in гибрид","hybrid electric":"Гибрид",phev:"Plug-in гибрид",
    electric:"Электро",flexible:"Флекс (бензин/этанол)","flexible fuel":"Флекс (бензин/этанол)",
    flex:"Флекс (бензин/этанол)",cng:"Газ (CNG)",lpg:"Газ (LPG)",hydrogen:"Водород",other:"Другое"
  };
  const RU_COLOR = {
    white:"Белый",black:"Чёрный",silver:"Серебристый",gray:"Серый",grey:"Серый",blue:"Синий",
    red:"Красный",green:"Зелёный",brown:"Коричневый",beige:"Бежевый",tan:"Бежевый",gold:"Золотистый",
    orange:"Оранжевый",yellow:"Жёлтый",purple:"Фиолетовый",burgundy:"Бордовый",maroon:"Бордовый",
    charcoal:"Графитовый",cream:"Кремовый",turquoise:"Бирюзовый",teal:"Бирюзовый",pink:"Розовый",
    "two tone":"Двухцветный","two-tone":"Двухцветный"
  };
  const RU_BODY = {
    sedan:"Седан",suv:"Внедорожник","sport utility vehicle":"Внедорожник",crossover:"Кроссовер",
    coupe:"Купе",convertible:"Кабриолет",hatchback:"Хэтчбек",wagon:"Универсал",liftback:"Лифтбек",
    fastback:"Фастбек",roadster:"Родстер",pickup:"Пикап","pickup truck":"Пикап",van:"Минивен / Бус",
    minivan:"Минивэн","cargo van":"Грузовой бус",truck:"Грузовик",motorcycle:"Мотоцикл",
    atv:"Квадроцикл",bus:"Автобус",limousine:"Лимузин","chassis cab":"Шасси-кабина"
  };
  function ruEnum(map, raw){
    if(raw == null || raw === "") return raw;
    const k = String(raw).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return map[k] || map[k.replace(/ /g, "-")] || tc(raw);
  }
  // ---- Документы: сырую строку API («Nm - Cert Of Title-Salvage») приводим
  // к виду «вердикт + NM · Salvage». Для Молдовы плохих документов нет:
  // Bill of Sale / ACQ / Parts Only / Junk / COD оформляются, но требуют
  // переделки (~30–40 дней) — без неё авто нельзя экспортировать.
  const DOC_TYPES = [
    [/certificate of destruction|cert of destruction|\bcod\b|destruction/, "Certificate of Destruction", "rework"],
    [/non.?repair/, "Non-Repairable", "rework"],
    [/junk|parts only|dismantl/, "Junk / Parts Only", "rework"],
    [/bill of sale/, "Bill of Sale", "rework"],
    [/\bacq\b|acquisition/, "ACQ (Bill of Sale)", "rework"],
    [/reconstructed|r=reconstr/, "Reconstructed", "good"],
    [/rebuil/, "Rebuilt", "good"],
    [/salvage histor|salv histor/, "Salvage History", "good"],
    [/salvage|\bsalv\b/, "Salvage", "good"],
    [/clean|clear/, "Clean", "good"],
    [/^cert(ificate)?\s+of\s+title\s*$/, "Clean", "good"]
  ];
  function parseDocTitle(raw){
    const s = String(raw || "").trim();
    if(!s) return null;
    const m = s.match(/^\s*([A-Za-z]{2})\s*[-–·•]\s*(.*)$/);
    const state = m ? m[1].toUpperCase() : "";
    const rest = (m ? m[2] : s).toLowerCase();
    for(const [re, label, tone] of DOC_TYPES){
      if(re.test(rest)) return {state, label, tone};
    }
    return {state, label:tc(m ? m[2] : s), tone:"neutral"};
  }
  function docShort(raw){
    const d = parseDocTitle(raw);
    if(!d) return "";
    return d.state ? `${d.state} · ${d.label}` : d.label;
  }

  // "Front End / Right Rear" → каждая часть переводится отдельно;
  // цельные ключи с "/" (Minor Dent/Scratches) ловятся до разбиения
  function ruDamage(raw){
    if(raw == null || raw === "") return raw;
    const whole = String(raw).toLowerCase().replace(/\s+/g, " ").trim();
    if(RU_DAMAGE[whole]) return RU_DAMAGE[whole];
    return String(raw).split("/").map(p => ruEnum(RU_DAMAGE, p)).join(" / ");
  }

  function dateText(value){
    if(!value) return "—";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return String(value).slice(0, 16);
    return date.toLocaleDateString("ru-RU");
  }

  // ---- Favorites (localStorage) ----
  const FAV_KEY = "apexFavsV1";
  function favLoad(){ try{ return JSON.parse(localStorage.getItem(FAV_KEY) || "{}") || {}; }catch(e){ return {}; } }
  function favSave(map){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(map)); }catch(e){} }
  function favHas(id){ return id != null && !!favLoad()[id]; }
  function favCompact(lot){
    const keep = ["id","auction","title","year","make","model","vin","lot","url","location","auctionDate","currentBid","finalBid","buyNow","odometer","odometerText","primaryDamage","secondaryDamage","damage","document","engine","drive","transmission","fuel","condition","seller","keys","estimatedRetailValue","photoCount","image","images","lotStatus","statusId","statusName","saleStatus","saleStatusKey","timed","priceHistory"];
    const o = {}; keep.forEach(k => { if(lot[k] !== undefined) o[k] = lot[k]; }); return o;
  }
  function favToggle(lot){
    if(!lot || lot.id == null) return false;
    const map = favLoad();
    if(map[lot.id]) delete map[lot.id]; else map[lot.id] = favCompact(lot);
    favSave(map);
    updateFavCount();
    return !!favLoad()[lot.id];
  }
  function favList(){ return Object.values(favLoad()).reverse(); }
  function updateFavCount(){
    const n = Object.keys(favLoad()).length;
    const el = document.getElementById("favCount");
    if(el) el.textContent = n ? ` (${n})` : "";
    document.querySelectorAll("[data-fav]").forEach(s => s.classList.toggle("is-fav", favHas(s.dataset.fav)));
  }

  // ---- URL state sync (shareable searches, survives refresh) ----
  function syncUrl(){
    if(parseSlug(currentSlug())) return; // on a detail page — leave its path
    const p = formParams();
    p.delete("page"); p.delete("per_page");
    if(p.get("sort") === "soon") p.delete("sort");
    if(p.get("auction") === "all") p.delete("auction");
    if(p.get("tab") === "all") p.delete("tab");
    const qs = p.toString();
    try{ history.replaceState(null, "", qs ? `${location.pathname}?${qs}` : location.pathname); }catch(e){}
  }
  function restoreFromUrl(){
    const p = new URLSearchParams(location.search);
    if(!Array.from(p.keys()).length) return;
    const setActive = (sel, attr, val) => document.querySelectorAll(sel).forEach(b => b.classList.toggle("active", b.getAttribute(attr) === val));
    if(p.get("tab")){ state.tab = p.get("tab"); setActive("[data-tab]", "data-tab", state.tab); }
    if(p.get("auction")){ state.auction = p.get("auction"); setActive("[data-auction-switch]", "data-auction-switch", state.auction); }
    if(p.get("sort") && $("#auctionSort")) $("#auctionSort").value = p.get("sort");
    const smartPrefill = p.get("vin") || p.get("q") || p.get("name") || p.get("make");
    if(smartPrefill && $("#auctionSmartSearch")) $("#auctionSmartSearch").value = smartPrefill;
    const form = $("#auctionFiltersForm");
    if(form) for(const [k, v] of p.entries()){
      const radios = form.querySelectorAll(`[name="${k}"]`);
      if(radios.length && radios[0].type === "radio"){
        radios.forEach(r => { r.checked = (r.value === v); });
      }else if(form.elements[k]){
        try{ form.elements[k].value = v; }catch(e){}
      }
    }
    document.querySelectorAll("[data-range]").forEach(r => { if(r._applyNums) r._applyNums(); else if(r._refresh) r._refresh(); });
  }

  function saleClass(value){
    const text = String(value || "").toLowerCase();
    if(text.includes("без")) return "noReserve";
    if(text.includes("утверж")) return "approval";
    if(text.includes("миним")) return "minimum";
    if(text.includes("timed")) return "timed";
    return "";
  }

  // Полное имя с версией/тримом из API — как у DreamBid: «BMW 4 Series 430i»,
  // а не «BMW 4er». year+make+model — только фоллбек.
  function lotTitle(lot){
    const raw = String(lot.title || "").trim();
    if(raw){
      return raw
        .replace(/\b([sx])drive\s*(\d+)\s*i\b/gi, (m, p, d) => `${p.toLowerCase()}Drive${d}i`)
        .replace(/\b(\d{3})\s*I\b/g, "$1i")
        .replace(/\b(\d{3})E\b/g, "$1e")
        .replace(/\b(M\d{2,3})I\b/g, "$1i");
    }
    return [lot.year, lot.make, displayModel(lot.model)].filter(Boolean).join(" ") || "Автомобиль";
  }

  // «4er/5er» из справочника API → человеческое «4 Series/5 Series» (крошки, фоллбеки)
  function displayModel(model){
    const m = String(model || "");
    const ser = m.match(/^(\d)er$/i);
    return ser ? `${ser[1]} Series` : m;
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

  // One smart search box: VIN (11+ alnum with letters+digits) → vin,
  // pure 6-10 digit number → lot, anything else → make/model title search.
  function parseSmartSearch(raw){
    const value = String(raw || "").trim();
    if(!value) return {};
    const compact = value.replace(/[^A-Za-z0-9]/g, "");
    if(compact.length >= 11 && /[A-Za-z]/.test(compact) && /\d/.test(compact) && !/\s/.test(value)) return {vin:compact};
    if(/^\d{6,10}$/.test(compact) && /^[\d\s-]+$/.test(value)) return {lot:compact};
    return {name:value};
  }

  function formParams(){
    const form = $("#auctionFiltersForm");
    const params = new URLSearchParams(new FormData(form));
    // Top smart search: VIN → vin, lot number → search_query, text → "name" (title search).
    const smart = parseSmartSearch($("#auctionSmartSearch")?.value);
    if(smart.vin) params.set("vin", smart.vin);
    else if(smart.lot) params.set("q", smart.lot);
    else if(smart.name) params.set("name", smart.name);
    params.set("auction", state.auction);
    params.set("tab", state.tab);
    params.set("sort", $("#auctionSort").value);
    params.set("page", state.page);
    params.set("per_page", String(state.perPage));
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
    if(/не на ходу|\bнет\b|non[ -]|not |bill of sale|parts only|flood|water|missing|отсут|продан ранее|переставлялся/.test(text)) return "bad";
    if(/approval|утвержд|minimum|минимум|timed|salvage|starts|стартует|резерв|upcoming|unknown|переделк/.test(text)) return "warn";
    if(/run|drive|clear|\byes\b|\bда\b|заводится|едет|хорош|впервые|не продавалась|есть|на ходу|live|available|no reserve|без резерва|страховая|\bpresent\b/.test(text)) return "good";
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
    /* Pure EV only — hybrids ("Electric And Gas Hybrid") still pay customs */
    if(fuel.includes("electric") && !fuel.includes("hybrid")) return 0;
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
    if(/van|cargo|sprinter|transit|minivan/.test(b + t)) return "vanLarge";
    if(/suv|utility|cuv|crossover/.test(b)) return "suv";
    return "sedan";
  }
  function landRouteLabel(lot){ const from = lot.location || "Локация США"; return `${from} → порт США`; }
  function seaRouteLabel(lot){ const port = lot.port || (String(lot.location||"").toLowerCase().includes("tx") ? "Houston" : "порт США"); return `${port} → Кишинёв`; }

  function mapFuel(raw, greenOverride, lot){
    const f = String(raw || "").toLowerCase();
    if(/plug|phev/.test(f)) return "phev";
    if(/hybrid|гибрид/.test(f)) return "hybrid";
    if(/electric|электро|tesla/.test(f)){
      /* Only reclassify as hybrid if there's real engine displacement (e.g. "2.0L").
         Cylinders field is unreliable — VIN decode can return 4 for pure EVs like BMW i7. */
      if(lot){
        const hasDisplacement = lot.engine && /\d+\.\d/i.test(String(lot.engine));
        if(hasDisplacement) return "hybrid";
      }
      return "electric";
    }
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
    // 1. Strict: city + state match
    let m = byAuction.find(l => {
      const lc = String(l.city || "").toLowerCase();
      const ls = String(l.state || "").toLowerCase();
      return city && (lc === city || lc.includes(city) || city.includes(lc)) && (!state || ls === state);
    });
    // 2. City-only match — API sometimes returns wrong state (e.g. "Acworth, Florida" for GA)
    if(!m && city) m = byAuction.find(l => {
      const lc = String(l.city || "").toLowerCase();
      return lc === city || lc.includes(city) || city.includes(lc);
    });
    // 3. City string anywhere in location name, displayName, or city field
    if(!m && city) m = byAuction.find(l => {
      const hay = (String(l.displayName || "") + " " + String(l.location || "") + " " + String(l.city || "")).toLowerCase();
      return hay.includes(city);
    });
    return m || null;
  }
  // Живые курсы MDL — тот же источник, что у калькулятора на главной (/api/content?rates=1),
  // чтобы итоги на странице лота и на главной совпадали до копейки.
  const liveRates = {usdMdl:17.45, eurMdl:20.28};
  let ratesFetched = false;
  function applyLiveRatesToInputs(){
    const u = $("#lotCalcUsdMdl"), e = $("#lotCalcEurMdl");
    if(u) u.value = liveRates.usdMdl.toFixed(2);
    if(e) e.value = liveRates.eurMdl.toFixed(2);
    if(u || e){ try{ updateLotCalculator(); }catch(_){} }
  }
  async function fetchLiveRates(){
    if(ratesFetched){ applyLiveRatesToInputs(); return; }
    try{
      const r = await fetch("/api/content?rates=1");
      if(!r.ok) return;
      const data = await r.json();
      if(Number(data?.usdMdl) > 0) liveRates.usdMdl = Number(data.usdMdl);
      if(Number(data?.eurMdl) > 0) liveRates.eurMdl = Number(data.eurMdl);
      ratesFetched = true;
      applyLiveRatesToInputs();
    }catch(_){}
  }

  function calcLotTotal(lot, options = {}){
    const bid = Number(options.bid != null ? options.bid : (lot.currentBid || lot.buyNow || 0));
    const kind = options.vehicleType || vehicleKind(lot);
    const fuel = options.fuel || mapFuel(lot.fuel, !!options.green, lot);
    const loc = findLotLocation(lot);
    const engineLiters = options.engineLiters != null ? Number(options.engineLiters) : numberFromEngine(lot.engine);
    const usdMdl = Number(options.usdMdl) > 0 ? Number(options.usdMdl) : liveRates.usdMdl;
    const eurMdl = Number(options.eurMdl) > 0 ? Number(options.eurMdl) : liveRates.eurMdl;
    const r = (window.ApexCalc && window.ApexCalc.compute) ? window.ApexCalc.compute({
      lotPrice:bid, auction:String(lot.auction || "copart").toLowerCase(),
      vehicleType:kind, fuel, engineLiters,
      year:Number(lot.year) || new Date().getFullYear(),
      insurance:options.insurance !== false, exportDocs:!!options.exportDocs, offsite:!!options.offsite,
      location:loc, usdMdl, eurMdl
    }) : null;
    if(!r){
      const auctionFee = auctionFeeFor(bid, lot.auction);
      return {bid, auctionFee, land:0, sea:0, insurance:0, exportDocs:0, service:300, customsUsd:0,
        total:bid + auctionFee, totalMdl:0, totalEur:0, kind, green:false, usdMdl, eurMdl,
        landRoute:landRouteLabel(lot), seaRoute:seaRouteLabel(lot)};
    }
    return {
      bid:r.lot, auctionFee:r.auctionFee, land:r.land, sea:r.sea,
      insurance:Math.round(r.insurance), exportDocs:r.exportDocs, service:Math.round(r.company),
      customsUsd:Math.round(r.customsUsd), total:Math.round(r.totalUsd),
      totalMdl:Math.round(r.totalMdl), totalEur:Math.round(r.totalEur),
      kind, green:["hybrid","phev","electric"].includes(fuel), usdMdl, eurMdl,
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
    play:'<circle cx="12" cy="12" r="9"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/>',
    excl:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.2M12 16v.4"/>',
    dot:'<circle cx="12" cy="12" r="7.5"/><path d="M8.5 12h7"/>',
    ext:'<path d="M14 5h5v5M19 5l-7 7M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5"/>',
    copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    gem:'<path d="M5 9L12 2l7 7M5 9l7 13 7-13H5z"/>',
    key:'<circle cx="7.5" cy="15.5" r="4.5"/><path d="M11 12l8-8M16 4l2 2M14 6l2 2"/>',
    drive:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"/>',
    fuel:'<path d="M3 22V8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v14"/><path d="M3 22h12"/><path d="M15 10h2a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h0a1 1 0 0 0 1-1V9l-3-3"/><path d="M3 14h12"/>',
    person:'<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'
  };
  function dbIco(name){
    return `<svg class="dbIco" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DB_ICONS[name] || ""}</svg>`;
  }
  function dbDate(value, withYear){
    if(!value) return "Future";
    const d = new Date(value);
    if(Number.isNaN(d.getTime())) return String(value).slice(0, 16);
    const lang = window.APEX_LANG || "ru";
    const loc = lang === "ro" ? "ro-RO" : lang === "en" ? "en-US" : "ru-RU";
    const opts = {weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"};
    if(withYear) opts.year = "numeric";
    return d.toLocaleString(loc, opts);
  }
  function dbOdo(text){
    if(!text) return "";
    const num = Number(String(text).replace(/[^\d.]/g, ""));
    if(!num) return escapeHtml(text);
    const fmt = v => Math.round(v).toLocaleString("ru-RU");
    if(/mi/i.test(text)) return `${fmt(num)} миль ≈ ${fmt(num * 1.609)} км`;
    return `${fmt(num)} км`;
  }
  // "Live скоро начнётся" only within 1 hour of the start; otherwise hide the line.
  function dbLive(lot){
    const s = String(lot.statusName || lot.lotStatus || "").toLowerCase();
    const dd = lot.auctionDate ? new Date(lot.auctionDate) : null;
    const upcoming = dd && !Number.isNaN(dd.getTime()) && dd.getTime() > Date.now();
    if(!upcoming && /sold|завер|not_sold/.test(s)) return ["Торги завершены", "done"];
    if(/buy/.test(s)) return ["Купить сейчас", "buy"];
    const d = lot.auctionDate ? new Date(lot.auctionDate) : null;
    if(d && !Number.isNaN(d.getTime())){
      const diff = d.getTime() - Date.now();
      if(diff <= 0 && diff > -3 * 3600 * 1000) return ["Идут торги", "live"];
      if(diff > 0 && diff <= 3600 * 1000) return ["Live скоро начнётся", "soon"];
      return ["", ""];
    }
    if(/\blive\b|active|идут/.test(s)) return ["Идут торги", "live"];
    return ["", ""];
  }
  // Condition → Russian label + tone + icon. Full AuctionsAPI enum:
  // 0 run_and_drives, 1 for_repair, 2 to_be_dismantled, 3 not_run, 4 used,
  // 5 unconfirmed, 6 engine_starts, 7 enhanced.
  function conditionInfo(raw){
    const t = String(raw || "").toLowerCase().replace(/[_-]+/g, " ").trim();
    if(!t) return {label:"—", tone:"neutral", icon:"q"};
    if(/run and drive|runs and drives|заводится и едет/.test(t))
      return {label:"Заводится и едет", tone:"good", icon:"check"};
    if(/engine start|стартует|^заводится$|заводится(?!.*едет)/.test(t))
      return {label:"Заводится", tone:"warn", icon:"excl"};
    if(/to be dismantled|dismantl|на разбор/.test(t))
      return {label:"На разбор", tone:"bad", icon:"warn"};
    if(/for repair|на запчаст|ремонт/.test(t))
      return {label:"На запчасти / ремонт", tone:"warn", icon:"excl"};
    if(/unconfirmed|не подтвержд/.test(t))
      return {label:"Не подтверждено", tone:"neutral", icon:"q"};
    if(/^used$|^б ?\/? ?у$|^used /.test(t))
      return {label:"Б/у", tone:"neutral", icon:"dot"};
    if(/enhanced|inop|non run|not run|stationary|не на ходу|не заводится/.test(t))
      return {label:"Не на ходу", tone:"neutral", icon:"q"};
    return {label: tc(raw), tone: statusTone(raw) || "neutral", icon:"q"};
  }
  // Auction brand badge — links straight to the lot on Copart/IAAI.
  function aucLinkBadge(lot){
    const a = lot.auction === "iaai" ? "iaai" : "copart";
    const word = a === "iaai" ? "IAAI" : "Copart";
    const href = lot.url || "#";
    return `<a class="aucMark aucMark--${a}" href="${escapeHtml(href)}" target="_blank" rel="noopener nofollow" title="Открыть лот ${escapeHtml(lot.lot || "")} на ${word}"><span class="aucWordV1">${word}</span>${dbIco("ext")}</a>`;
  }
  // Click-to-copy chip (VIN / lot number).
  function copyChip(value, label, cls, preIcon){
    if(!value) return `<span class="${cls}">${preIcon ? dbIco(preIcon) : ""}—</span>`;
    return `<span class="${cls} copyChipV1" role="button" tabindex="0" data-copy="${escapeHtml(value)}" title="${escapeHtml(label)}">${preIcon ? dbIco(preIcon) : ""}<span class="copyTextV1">${escapeHtml(value)}</span>${dbIco("copy")}</span>`;
  }
  function dbSpec(icon, value){
    if(!value) return "";
    return `<li>${dbIco(icon)}<span>${value}</span></li>`;
  }
  function dbCheck(label, value){
    if(value == null || value === "") return ""; // hide fields the API didn't provide
    const tone = statusTone(value) || "neutral";
    const icon = tone === "good" ? "check" : tone === "bad" ? "warn" : tone === "warn" ? "warn" : "q";
    return `<li class="dbCheck ${tone}">${dbIco(icon)}<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span></li>`;
  }
  function dbCondition(raw){
    const c = conditionInfo(raw);
    return `<li class="dbCheck ${c.tone}">${dbIco(c.icon)}<span><b>Состояние:</b> ${escapeHtml(c.label)}</span></li>`;
  }
  function dbCheckFuel(raw){
    if(!raw) return "";
    const val = ruEnum(RU_FUEL, raw);
    const low = String(raw).toLowerCase();
    const tone = /electric|электро/.test(low) ? "good" : /hybrid|гибрид|phev|plug/.test(low) ? "good" : "neutral";
    return `<li class="dbCheck ${tone}">${dbIco("fuel")}<span><b>Топливо:</b> ${escapeHtml(val)}</span></li>`;
  }
  function dbCheckSeller(raw){
    const val = raw ? tc(raw) : "";
    const display = val || "Неизвестен";
    const isInsurance = /страховая|insurance|geico|progressive|allstate|usaa|state farm|farmers|nationwide|liberty mutual|travelers|erie|metlife|kemper|csaa/i.test(display);
    const tone = isInsurance ? "good" : "neutral";
    return `<li class="dbCheck ${tone}">${dbIco(isInsurance ? "check" : "person")}<span><b>Продавец:</b> ${escapeHtml(display)}</span></li>`;
  }
  function dbCheckKey(raw){
    if(!raw) return "";
    const val = tc(raw);
    const low = val.toLowerCase();
    const isYes = /^да$|^yes$|^present$|^available$/i.test(low);
    const isNo = /^нет$|^no$|not present|not available/i.test(low);
    const tone = isYes ? "good" : isNo ? "bad" : "neutral";
    return `<li class="dbCheck ${tone}">${dbIco("key")}<span><b>Ключ:</b> ${escapeHtml(val)}</span></li>`;
  }
  function dbCheckHistory(rawHistory, currentLot){
    // Запись текущих торгов (h.current) — не история продаж
    const history = (Array.isArray(rawHistory) ? rawHistory : []).filter(h => !h.current);
    const count = history.length;
    if(count === 0){
      return `<li class="dbCheck good">${dbIco("check")}<span><b>История:</b> Ранее не продавалась</span></li>`;
    }
    const wasSold = history.some(h => { const s = String(h.status || "").toLowerCase(); return s.includes("sold") && !s.includes("not"); });
    const lotNumbers = new Set(history.map(h => h.lot).filter(Boolean));
    const relisted = currentLot && lotNumbers.size > 0 && (lotNumbers.size > 1 || (lotNumbers.size === 1 && !lotNumbers.has(String(currentLot))));
    const records = count === 1 ? "1 запись" : count < 5 ? `${count} записи` : `${count} записей`;
    if(wasSold){
      return `<li class="dbCheck bad">${dbIco("warn")}<span><b>История:</b> ${escapeHtml(records)} • Был продан ранее!</span></li>`;
    }
    if(relisted){
      return `<li class="dbCheck bad">${dbIco("warn")}<span><b>История:</b> ${escapeHtml(records)} • Переставлялся!</span></li>`;
    }
    return `<li class="dbCheck neutral">${dbIco("dot")}<span><b>История:</b> ${escapeHtml(records)}</span></li>`;
  }

  function histStatusLabel(name){
    const t = String(name || "").toLowerCase();
    if(t.includes("sold") && !t.includes("not")) return ["Продан", "histSold"];
    if(t.includes("not_sold") || t === "not sold") return ["Не продан", "histUnsold"];
    if(t.includes("approval")) return ["На утверждении", "histPend"];
    if(t.includes("upcoming") || t.includes("future")) return ["Предстоит", "histPend"];
    if(t.includes("cancel")) return ["Отменён", "histUnsold"];
    return [name ? name.replace(/_/g, " ") : "", "histPend"];
  }

  function renderPriceHistory(history){
    if(!Array.isArray(history) || !history.length) return "";
    const bids = history.map(h => Number(h.bid || h.buyNow || 0)).filter(Boolean);
    const max = Math.max(1, ...bids);
    const min = bids.length ? Math.min(...bids) : 0;
    const hi = bids.length ? Math.max(...bids) : 0;
    const rows = history.slice(0, 12).map(h => {
      const val = Number(h.bid || h.buyNow || 0);
      const [label, cls] = histStatusLabel(h.status);
      const pct = Math.max(6, Math.round(val / max * 100));
      return `<div class="histRowV1">
        <span class="histDateV1">${escapeHtml(dbDate(h.date))}</span>
        <span class="histBarWrapV1"><span class="histBarV1" style="width:${pct}%"></span></span>
        <span class="histStatusV1 ${cls}">${escapeHtml(label)}</span>
        <b class="histBidV1">${escapeHtml(money(val))}</b>
      </div>`;
    }).join("");
    const range = bids.length ? `${money(min)} – ${money(hi)}` : "";
    return `<section class="dSec">
      <div class="dSecHead">История цены <span class="histCountV1">${history.length} ${plural(history.length, "запись", "записи", "записей")}${range ? ` · ${escapeHtml(range)}` : ""}</span></div>
      <div class="histListV1">${rows}</div>
    </section>`;
  }

  function plural(n, one, few, many){
    const m10 = n % 10, m100 = n % 100;
    if(m10 === 1 && m100 !== 11) return one;
    if(m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  // Обратный отсчёт до торгов, как у крупных каталогов: "5h 33m" при < 72ч.
  function timeLeftLabel(auctionDate){
    if(!auctionDate) return "";
    const t = new Date(auctionDate).getTime();
    if(Number.isNaN(t)) return "";
    const diff = t - Date.now();
    if(diff <= 0 || diff > 72 * 3600e3) return "";
    const h = Math.floor(diff / 3600e3);
    const m = Math.floor((diff % 3600e3) / 60e3);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  // Перевыставленный лот хранит finalBid прошлых торгов: если дата аукциона в будущем,
  // лот снова активен — finalBid остаётся только в истории цены, показываем current bid.
  function lotSaleState(lot){
    const t = lot.auctionDate ? new Date(lot.auctionDate).getTime() : NaN;
    const upcoming = Number.isFinite(t) && t > Date.now();
    const soldLike = lot.statusId === 6 || lot.statusId === 4 || /sold|not_sold|approval/i.test(lot.statusName || lot.lotStatus || "") || lot.finalBid > 0;
    const isSold = soldLike && !upcoming;
    const finalBid = isSold ? (lot.finalBid || lot.priceHistory?.[0]?.bid || 0) : 0;
    return {isSold, finalBid};
  }

  function renderCard(lot){
    const title = lotTitle(lot);
    const [liveLabel, liveTone] = dbLive(lot);
    const isNew = /upcoming|new/i.test(lot.lotStatus || "");
    const engineLine = [cleanEngine(lot.engine), upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" • ");
    const estimate = lot.estimatedRetailValue ? money(lot.estimatedRetailValue) : "";
    const {isSold, finalBid: effectiveFinalBid} = lotSaleState(lot);
    const priceVal = isSold && effectiveFinalBid ? effectiveFinalBid : (lot.currentBid || lot.buyNow);
    const priceLabel = isSold && effectiveFinalBid ? "Финальная цена" : "Текущая цена";
    const price = money(priceVal);
    const photos = lot.photoCount || lot.images?.length || 1;
    return `<article class="dbCard">
      <div class="dbPhoto" data-lid="${escapeHtml(String(lot.id))}">
        <a class="dbPhotoLink" href="${detailHref(lot)}">
          ${lot.image ? `<img src="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy" class="dbSlideImg">` : `<span class="dbNoPhoto">Нет фото</span>`}
        </a>
        <span class="dbBadgesRowV3"><span class="dbAuc">${escapeHtml(lot.auction.toUpperCase())}</span>${lot.video ? `<span class="dbVideoBadgeV3">▶ Видео</span>` : ""}</span>
        <span class="dbPhotoCount">1/${escapeHtml(String(photos))}</span>
        <span class="dbPhotoPrice${isSold ? " dbPhotoPriceSold" : ""}">${price}</span>
        <span class="dbFav${favHas(lot.id) ? " is-fav" : ""}" role="button" data-fav="${escapeHtml(lot.id)}" title="В избранное">${dbIco("star")}</span>
        ${photos > 1 ? `<button class="dbSlideBtn dbSlidePrev" type="button" aria-label="Предыдущее фото" data-dir="-1">‹</button><button class="dbSlideBtn dbSlideNext" type="button" aria-label="Следующее фото" data-dir="1">›</button>` : ""}
      </div>
      <div class="dbBody">
        <a class="dbTitle" href="${detailHref(lot)}">${escapeHtml(title)}</a>
        <div class="dbCols">
          <div class="dbLeftCol">
            <div class="dbIds">
              ${copyChip(lot.vin, "Скопировать VIN", "dbVin", "vin")}
              ${isNew ? `<span class="dbNew">Новый лот</span>` : ""}
            </div>
            <ul class="dbSpecs">
              ${dbSpec("engine", escapeHtml(engineLine))}
              ${dbSpec("odo", dbOdo(lot.odometerText))}
              ${dbSpec("damage", escapeHtml(ruDamage(lot.damage)))}
              ${dbSpec("doc", escapeHtml(docShort(lot.document)))}
              ${dbSpec("pin", escapeHtml(tc(lot.location)))}
            </ul>
          </div>
          <div class="dbChecksCol">
            <div class="dbLotRowV1">
              ${copyChip(lot.lot, "Скопировать номер лота", "dbLotNo", "")}
              ${aucLinkBadge(lot)}
            </div>
            <ul class="dbChecks">
              ${dbCondition(lot.condition)}
              ${dbCheckFuel(lot.fuel)}
              ${dbCheckSeller(lot.seller)}
              ${dbCheckKey(lot.keys)}
              ${dbCheckHistory(lot.priceHistory, lot.lot)}
              ${lot.vin ? `<li class="dbVinRepV3">${dbIco("gem")}<a href="${detailHref(lot)}">Отчёт VIN</a></li>` : ""}
            </ul>
          </div>
        </div>
        <button class="dbExpandV1" type="button">Развернуть</button>
      </div>
      <aside class="dbAside">
        <div class="dbWhen">
          <span>${dbIco("calendar")}${escapeHtml(dbDate(lot.auctionDate))}</span>
          ${(() => { const tl = isSold ? "" : timeLeftLabel(lot.auctionDate); return tl ? `<span class="dbCountdownV1${new Date(lot.auctionDate).getTime() - Date.now() < 6*3600e3 ? " dbCountdownSoonV1" : ""}">${dbIco("clock")}${tl}</span>` : ""; })()}
          ${liveLabel ? `<span class="dbLive ${liveTone}">${dbIco("clock")}${escapeHtml(liveLabel)}</span>` : ""}
        </div>
        <div class="dbPriceWrap">
          ${estimate ? `<div class="dbEst">${dbIco("chart")}<span>оценка ${escapeHtml(estimate)}</span></div>` : ""}
          <div class="dbPriceBox${isSold ? " dbPriceSold" : ""}">
            <span>${priceLabel}</span>
            <b>${price}</b>
          </div>
          ${lot.saleStatus ? `<div class="dbSale ${saleClass(lot.saleStatus)}">${escapeHtml(lot.saleStatus)}</div>` : ""}
        </div>
      </aside>
    </article>`;
  }

  function matchSale(lot, sale){
    if(!sale) return true;
    if(sale === "timed") return !!lot.timed;
    if(sale === "on_approval") return lot.statusId === 4 || /approval/i.test(lot.statusName || "");
    return lot.saleStatusKey === sale;
  }

  function matchDateRange(lot, dateFrom, dateTo){
    if(!dateFrom && !dateTo) return true;
    if(!lot.auctionDate) return !dateFrom; // undated lots: show only when no "from" is set
    const lotDay = String(lot.auctionDate).slice(0, 10); // "YYYY-MM-DD"
    if(dateFrom && lotDay < dateFrom) return false;
    if(dateTo   && lotDay > dateTo)   return false;
    return true;
  }

  function skeletonCards(n = 6){
    const one = `<article class="dbCard dbSkelV1">
      <div class="dbPhoto skBoxV1"></div>
      <div class="dbBody">
        <div class="skLineV1 skW60"></div>
        <div class="skLineV1 skW40"></div>
        <div class="dbCols">
          <ul class="dbSpecs">${"<li><span class='skLineV1 skW80'></span></li>".repeat(5)}</ul>
          <ul class="dbChecks">${"<li><span class='skLineV1 skW80'></span></li>".repeat(4)}</ul>
        </div>
      </div>
      <aside class="dbAside"><div class="skLineV1 skW80"></div><div class="dbPriceBox skBoxV1" style="height:60px"></div></aside>
    </article>`;
    return one.repeat(n);
  }

  function renderCards(){
    const box = $("#auctionCards");
    const sale     = document.querySelector('input[name="saleStatus"]:checked')?.value || "";
    const dateFrom = document.querySelector('input[name="auctionDateFrom"]')?.value || "";
    const dateTo   = document.querySelector('input[name="auctionDateTo"]')?.value || "";
    const filtered = state.items.filter(lot => matchSale(lot, sale) && matchDateRange(lot, dateFrom, dateTo));
    state.filteredCount = filtered.length;
    const start = (state.displayPage - 1) * state.displayPageSize;
    const pageItems = filtered.slice(start, start + state.displayPageSize);
    box.innerHTML = pageItems.map(renderCard).join("");
    if(sale){
      $("#auctionResultLabel").textContent = `показано ${filtered.length} (фильтр статуса продажи)`;
    }
    renderPagination();
  }

  function renderPagination(){
    const box = document.getElementById("paginationV1");
    if(!box) return;
    const totalPages = Math.ceil(state.filteredCount / state.displayPageSize);
    const showPageNums = totalPages > 1;
    if(!showPageNums && !state.hasMore){ box.hidden = true; return; }
    box.hidden = false;
    let html = "";
    if(showPageNums){
      const p = state.displayPage;
      const vis = new Set([1, totalPages]);
      for(let i = Math.max(1, p - 2); i <= Math.min(totalPages, p + 2); i++) vis.add(i);
      const pages = [...vis].sort((a, b) => a - b);
      html += `<button class="pgBtnV1 pgNavV1"${p === 1 ? " disabled" : ""} data-page="${p - 1}">&#8249;</button>`;
      let prev = 0;
      for(const num of pages){
        if(num - prev > 1) html += `<span class="pgEllipsisV1">…</span>`;
        html += `<button class="pgBtnV1${num === p ? " pgActiveV1" : ""}" data-page="${num}">${num}</button>`;
        prev = num;
      }
      html += `<button class="pgBtnV1 pgNavV1"${p === totalPages ? " disabled" : ""} data-page="${p + 1}">&#8250;</button>`;
    }
    if(state.hasMore){
      html += `<button class="pgLoadMoreBtnV1" id="pgLoadMoreBtn"${state.loading ? " disabled" : ""}>Показать ещё лоты</button>`;
    }
    box.innerHTML = html;
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

  function renderFavorites(){
    state.items = favList();
    state.hasMore = false;
    $("#auctionCards").innerHTML = "";
    const pg = document.getElementById("paginationV1"); if(pg) pg.hidden = true;
    $("#auctionResultCount").textContent = state.items.length;
    $("#auctionResultLabel").textContent = "в избранном";
    renderCards(false);
    setMessage(state.items.length ? "" : "В избранном пусто. Нажмите ★ на карточке лота, чтобы сохранить его сюда.");
    syncUrl();
  }

  async function loadLots({_retry = false, append = false} = {}){
    if(state.tab === "favorites"){ renderFavorites(); return; }
    if(state.loading) return;
    state.loading = true;
    setMessage("");
    // Stale-while-revalidate: dim existing cards on page change, skeleton on first load
    if(state.items.length === 0) $("#auctionCards").innerHTML = skeletonCards(6);
    else $("#auctionCards").classList.add("lotsRefreshingV1");
    const archived = state.tab === "archived";
    try{
      const payload = await api(`/api/auctions?action=search&${formParams()}`);
      let nextItems = payload.items || [];
      // Discovery mode: 2020+, insurance sellers (if enough) — sorted by auction date
      if(discoveryMode){
        const fresh = nextItems.filter(l => Number(l.year) >= 2020);
        if(fresh.length >= 8) nextItems = fresh;
        const ins = nextItems.filter(l => INS_RE.test(String(l.seller || "")));
        if(ins.length >= 8) nextItems = ins;
      }
      state.hasMore = Boolean(payload.hasMore);
      state.total = payload.total || 0;
      if(append){
        const prevCount = state.items.length;
        state.items = [...state.items, ...nextItems];
        state.displayPage = Math.floor(prevCount / state.displayPageSize) + 1;
      } else {
        state.items = nextItems;
        state.displayPage = 1;
      }
      $("#auctionResultCount").textContent = state.total
        ? state.total.toLocaleString("ru-RU")
        : state.items.length;
      $("#auctionResultLabel").textContent = state.total
        ? (discoveryMode ? "лотов доступно на аукционах" : archived ? "лотов в архиве" : "лотов найдено")
        : `Показано ${state.items.length} лотов`;
      renderCards();
      updateFavCount();
      if(!state.items.length) setMessage(archived ? "В архиве пока нет завершённых лотов по этим фильтрам." : "По этим фильтрам лоты не найдены. Попробуйте изменить параметры поиска.");
    }catch(error){
      state.hasMore = false;
      if(isLocalHost()){
        state.items = demoLots();
        state.total = state.items.length;
        $("#auctionResultCount").textContent = "373 909";
        $("#auctionResultLabel").textContent = "демо-лоты (локально, без AUCTIONS_API_KEY)";
        renderCards();
      }else if(!_retry){
        // Auto-retry once after 2s before showing error — handles transient API blips
        state.loading = false;
        setTimeout(() => loadLots({_retry:true, append}), 2000);
        return;
      }else{
        // Keep showing existing cards if we have them; just flag the error
        if(!state.items.length){
          $("#auctionResultCount").textContent = "—";
          setMessage("Сервис временно недоступен. Попробуйте обновить страницу через минуту.");
        }else{
          setMessage("Не удалось обновить данные. Показаны последние загруженные лоты.");
        }
      }
    }finally{
      state.loading = false;
      $("#auctionCards").classList.remove("lotsRefreshingV1");
      syncUrl();
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
    const usd = calc.usdMdl || liveRates.usdMdl;
    const eur = calc.eurMdl || 20.28;
    const mdl = Math.round(calc.totalMdl || calc.total * usd).toLocaleString("ru-RU");
    const eurV = Math.round(calc.totalEur || calc.total * usd / eur).toLocaleString("ru-RU");
    return `${mdl} MDL · €${eurV}`;
  }

  function calcRow(label, value, sub){
    return `<div class="calcRowV2"><span>${escapeHtml(label)}${sub ? `<small>${escapeHtml(sub)}</small>` : ""}</span><b>${money(value)}</b></div>`;
  }

  // Свёрнутые секции калькулятора переживают перерисовку при изменении инпутов
  const calcClosedSecs = new Set();
  function calcSec(key, title, subtotal, rowsHtml){
    const closed = calcClosedSecs.has(key);
    return `
      <section class="calcSecV2${closed ? " calcClosedV1" : ""}" data-calc-sec="${key}">
        <div class="calcSecHeadV2" role="button" tabindex="0" data-calc-toggle="${key}">
          <span><svg class="calcChevV1" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="2 3.5 5 6.5 8 3.5"/></svg>${title}</span><b>${money(subtotal)}</b>
        </div>
        ${rowsHtml}
      </section>`;
  }
  function renderCalcRows(calc){
    const shippingSub = calc.bid + calc.auctionFee + calc.land + calc.sea;
    const clearingSub = calc.customsUsd + calc.insurance + calc.exportDocs + calc.service;
    return calcSec("ship", "Калькулятор стоимости", shippingSub, `
        ${calcRow("Ставка", calc.bid)}
        ${calcRow("Аукционный сбор", calc.auctionFee)}
        ${calcRow("Доставка по США", calc.land, calc.landRoute)}
        ${calcRow("Доставка морем", calc.sea, calc.seaRoute)}`)
      + calcSec("clear", "Таможня и оформление", clearingSub, `
        ${calcRow("Таможенные платежи", calc.customsUsd)}
        ${calcRow("Страховка", calc.insurance)}
        ${calcRow("Экспортные документы", calc.exportDocs)}
        ${calcRow("Сопровождение Apex Auto", calc.service)}`);
  }

  function renderLotCalculator(lot){
    const {isSold, finalBid: effectiveFinalBid} = lotSaleState(lot);
    const initialBid = (isSold && effectiveFinalBid ? effectiveFinalBid : (lot.currentBid || lot.buyNow)) || 0;
    const bidLabel = isSold && effectiveFinalBid ? "Финальная цена" : "Текущая ставка";
    const kind = vehicleKind(lot);
    const fuelVal = mapFuel(lot.fuel, false, lot);
    const engL = numberFromEngine(lot.engine);
    const calc = calcLotTotal(lot, {bid:initialBid, insurance:true, exportDocs:false, vehicleType:kind, fuel:fuelVal, engineLiters:engL});
    const est = lot.estimatedRetailValue ? `оценка ${money(lot.estimatedRetailValue)}` : "";
    const fOpt = v => `<option value="${v}"${fuelVal===v?" selected":""}>`;
    const countdown = isSold ? "" : timeLeftLabel(lot.auctionDate);
    return `<aside class="lotCalcV2">
      ${isSold && effectiveFinalBid ? `<div class="calcSoldBannerV2">Продана · Финальная ставка <b>${money(effectiveFinalBid)}</b></div>` : ""}
      <div class="calcTopV2">
        <div class="calcBidLabelV2${isSold ? " calcSoldV2" : ""}"><span>${bidLabel}</span><b>${money(initialBid)}</b></div>
        ${est ? `<div class="calcEstV2">${dbIco("chart")}${escapeHtml(est)}</div>` : ""}
      </div>
      <div id="lotMarketLineV1" class="calcMarketV1" hidden></div>
      ${countdown ? `<div class="calcCountdownV1">${dbIco("clock")}<span>Осталось <b id="lotCalcCountdown">${countdown}</b> до начала торгов</span></div>` : ""}
      ${!isSold ? `<button class="dbBtnPrimary calcTopCtaV1" type="button" data-lead="${escapeHtml(lot.id)}">Оставить заявку</button>` : ""}
      ${isSold && !effectiveFinalBid ? `<div class="calcDoneV2">${dbIco("check")}Торги завершены</div>` : ""}
      ${lot.saleStatus && !isSold ? `<div class="calcSaleV2 ${saleClass(lot.saleStatus)}">${escapeHtml(lot.saleStatus)}</div>` : ""}
      <div class="calcStepperV2">
        <button type="button" data-bid-step="-500" aria-label="Уменьшить ставку">−</button>
        <input id="lotBidInput" data-calc-input type="number" min="0" step="100" value="${escapeHtml(initialBid || "")}" placeholder="Ваша ставка, $">
        <button type="button" data-bid-step="500" aria-label="Увеличить ставку">+</button>
      </div>
      <div class="calcOptsV2">
        <div class="calcPairV1">
          <label class="calcOptColV1">
            <span>Тип кузова</span>
            <select id="lotCalcVehType" data-calc-input class="calcSelectV2">
              ${["sedan","crossover","suv","pickup","vanLarge","moto","atv"].map(v => `<option value="${v}"${kind===v?" selected":""}>${{sedan:"Седан",crossover:"Кроссовер",suv:"Внедорожник",pickup:"Пикап",vanLarge:"Минивен / Бус",moto:"Мото",atv:"Квадро / ATV"}[v]}</option>`).join("")}
            </select>
          </label>
          <label class="calcOptColV1">
            <span>Топливо</span>
            <select id="lotCalcFuel" data-calc-input class="calcSelectV2">
              ${fOpt("gasoline")}Бензин</option>
              ${fOpt("diesel")}Дизель</option>
              ${fOpt("hybrid")}Гибрид</option>
              ${fOpt("phev")}Plug-in гибрид</option>
              ${fOpt("electric")}Электро</option>
            </select>
          </label>
          <label class="calcOptColV1">
            <span>Объём двигателя</span>
            <select id="lotCalcEngine" data-calc-input class="calcSelectV2">
              ${Array.from({length:70}, (_, i) => ((i + 1) / 10).toFixed(1)).map(v => `<option value="${v}"${Number(v) === Math.min(7, Math.max(0.1, Math.round((engL || 2) * 10) / 10)) ? " selected" : ""}>${v} л</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="calcPairRowV1">
          <label class="calcOptV2"><input type="checkbox" id="lotCalcExportDocs" data-calc-input><span>Экспортные документы</span><i>+$400</i></label>
          <div class="calcOptV2 calcOptFixedV1">${dbIco("check")}<span>Страховка 1%</span><i>включена</i></div>
        </div>
      </div>
      <div id="lotCalcBody" class="calcBodyV2">${renderCalcRows(calc)}</div>
      <div class="calcGrandV2">
        <span>Итого под ключ до Кишинёва</span>
        <b id="lotCalcTotal">${money(calc.total)}</b>
        <small id="lotCalcTotalAlt">${altCurrency(calc)}</small>
      </div>
      <div class="calcRatesV2">
        <label><span>USD → MDL</span><input id="lotCalcUsdMdl" data-calc-input type="number" step="0.01" min="1" value="${liveRates.usdMdl.toFixed(2)}"></label>
        <label><span>EUR → MDL</span><input id="lotCalcEurMdl" data-calc-input type="number" step="0.01" min="1" value="${liveRates.eurMdl.toFixed(2)}"></label>
      </div>
      <div class="calcEtaV1">${dbIco("calendar")}<span>Ориентировочная выдача в Кишинёве: <b>${deliveryWindow(lot)}</b></span></div>
      <div class="calcCtasV2">
        <button class="dbBtnPrimary" type="button" data-lead="${escapeHtml(lot.id)}">Оставить заявку</button>
        <button class="dbBtnGhost" type="button" data-copy-calc>Скопировать расчёт</button>
        <a class="dbBtnGhost" href="${calcHref(lot)}">Открыть в полном калькуляторе</a>
      </div>
      <p class="calcNoteV2">Расчёт предварительный, для ориентира. Итоговую сумму подтверждаем перед покупкой. Курсы валют — по данным НБМ (bnm.md).</p>
    </aside>`;
  }

  // Ориентир выдачи: дата торгов (или сегодня, если торги прошли) + 6–12 недель доставки
  function deliveryWindow(lot){
    const t = lot.auctionDate ? new Date(lot.auctionDate).getTime() : NaN;
    const base = Math.max(Number.isFinite(t) ? t : 0, Date.now());
    const lang = window.APEX_LANG || "ru";
    const loc = lang === "ro" ? "ro-RO" : lang === "en" ? "en-US" : "ru-RU";
    const f = ms => new Date(ms).toLocaleDateString(loc, {day:"numeric", month:"short"});
    return `${f(base + 42 * 864e5)} – ${f(base + 84 * 864e5)}`;
  }

  function updateLotCalculator(){
    if(!state.selectedLot || !$("#lotBidInput")) return;
    const veh = $("#lotCalcVehType")?.value || vehicleKind(state.selectedLot);
    const fuel = $("#lotCalcFuel")?.value || mapFuel(state.selectedLot.fuel, false, state.selectedLot);
    const engineLiters = Number($("#lotCalcEngine")?.value) || numberFromEngine(state.selectedLot.engine);
    const usdMdl = Number($("#lotCalcUsdMdl")?.value) || liveRates.usdMdl;
    const eurMdl = Number($("#lotCalcEurMdl")?.value) || liveRates.eurMdl;
    const calc = calcLotTotal(state.selectedLot, {
      bid:Number($("#lotBidInput").value || 0),
      insurance:true, // страховка обязательна — в стоимости всегда
      exportDocs:$("#lotCalcExportDocs")?.checked,
      vehicleType:veh, fuel, engineLiters, usdMdl, eurMdl
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

  function dMain(label, value, iconOverride){
    if(value == null || value === "") return "";
    const t = statusTone(value) || "neutral";
    const ic = iconOverride || (t === "good" ? "check" : t === "bad" ? "warn" : t === "warn" ? "warn" : "q");
    return `<div class="dRowV2"><span class="dRowLbl">${escapeHtml(label)}</span><span class="dRowVal dTone-${t}"><span class="dValUnit">${dbIco(ic)}<span>${escapeHtml(value)}</span></span></span></div>`;
  }
  function dPlain(label, valueHtml, iconName, tone){
    if(valueHtml == null || valueHtml === "") return "";
    const inner = iconName ? `<span class="dValUnit">${dbIco(iconName)}<span>${valueHtml}</span></span>` : valueHtml;
    return `<div class="dRowV2"><span class="dRowLbl">${escapeHtml(label)}</span><span class="dRowVal${tone ? ` dTone-${tone}` : ""}">${inner}</span></div>`;
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
      <div id="lbStage" class="lbStageV1"></div>
      <button class="lbNavV1 lbNextV1" type="button" data-lb-next aria-label="Следующее фото">›</button>`;
    document.body.appendChild(el);
    return el;
  }
  function renderLightbox(){
    const stage = document.getElementById("lbStage");
    const item = lb.images[lb.index];
    if(stage && item){
      // Перерисовка innerHTML заодно останавливает видео при листании
      if(item.type === "video"){
        stage.innerHTML = `<video class="lbImgV1" src="${escapeHtml(item.src)}" controls autoplay playsinline${item.poster ? ` poster="${escapeHtml(item.poster)}"` : ""}></video>`;
      }else{
        stage.innerHTML = `<img class="lbImgV1" src="${escapeHtml(item.src)}" alt="">`;
      }
    }
    const c = document.getElementById("lbCount");
    if(c) c.textContent = `${lb.index + 1} / ${lb.images.length}`;
    const multi = lb.images.length > 1;
    document.querySelectorAll(".lbNavV1").forEach(b => b.style.display = multi ? "" : "none");
  }
  function openLightbox(images, index){
    if(!images || !images.length) return;
    // Принимаем и строки-URL (старые вызовы), и медиа-объекты {type, src, poster}
    lb.images = images.map(m => typeof m === "string" ? {type:"image", src:m} : m);
    lb.index = Math.max(0, Math.min(index || 0, images.length - 1));
    const el = ensureLightbox();
    el.hidden = false;
    document.body.classList.add("lbOpenV1");
    renderLightbox();
  }
  function closeLightbox(){
    const el = document.getElementById("lotLightbox");
    if(el) el.hidden = true;
    // Убираем содержимое сцены — иначе скрытое видео продолжает играть звуком
    const stage = document.getElementById("lbStage");
    if(stage) stage.innerHTML = "";
    document.body.classList.remove("lbOpenV1");
  }
  function lbMove(step){
    if(!lb.images.length) return;
    lb.index = (lb.index + step + lb.images.length) % lb.images.length;
    renderLightbox();
  }
  function lbCopyLink(){
    const url = lb.images[lb.index] && lb.images[lb.index].src;
    if(!url) return;
    navigator.clipboard?.writeText(url);
    const btn = document.querySelector("[data-lb-copy]");
    if(btn){ btn.textContent = "Скопировано"; setTimeout(() => { btn.textContent = "Скопировать ссылку"; }, 1500); }
  }

  function renderSimilarCard(lot){
    const title = lotTitle(lot);
    const specLine = [cleanEngine(lot.engine), upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" • ");
    const cond = [conditionInfo(lot.condition).label, dbOdo(lot.odometerText)].filter(v => v && v !== "—").join(" · ");
    const {isSold, finalBid: effectiveBid} = lotSaleState(lot);
    const bid = isSold && effectiveBid ? effectiveBid : (lot.currentBid || lot.buyNow);
    return `<a class="simCardV1" href="${detailHref(lot)}">
      <div class="simPhotoV1">${lot.image ? `<img src="${escapeHtml(lot.image)}" alt="${escapeHtml(title)}" loading="lazy">` : ""}${Number(bid) > 0 ? `<span class="simBidV1">${money(bid)}</span>` : ""}</div>
      <h4>${escapeHtml(title)}</h4>
      <span class="simVinV1">${dbIco("vin")}${escapeHtml(lot.vin || "—")}</span>
      <span>${dbIco("engine")}${escapeHtml(specLine || "—")}</span>
      <span>${dbIco("odo")}${escapeHtml(cond || "—")}</span>
    </a>`;
  }

  async function loadSimilarActive(lot){
    const box = document.getElementById("similarActiveLots");
    const sec = document.getElementById("similarActiveSection");
    if(!box || !sec) return;
    let items = [];
    try{
      if(isLocalHost()) throw new Error("local-demo");
      const params = new URLSearchParams({action:"search", per_page:"12", sort:"soon"});
      if(lot.makeId) params.set("make", String(lot.makeId));
      if(lot.modelId) params.set("model", String(lot.modelId));
      const payload = await api(`/api/auctions?${params}`);
      items = (payload.items || []).filter(x => String(x.id) !== String(lot.id)).slice(0, 12);
    }catch(error){
      if(isLocalHost()) items = demoLots().filter(x => String(x.id) !== String(lot.id)).slice(0, 6);
    }
    if(!items.length) return;
    box.innerHTML = items.map(renderSimilarCard).join("");
    sec.hidden = false;
  }

  async function loadSimilarArchived(lot){
    const box = document.getElementById("similarArchivedLots");
    const sec = document.getElementById("similarArchivedSection");
    if(!box || !sec) return;
    try{
      const params = new URLSearchParams({action:"search", per_page:"12", tab:"archived"});
      if(lot.makeId) params.set("make", String(lot.makeId));
      if(lot.modelId) params.set("model", String(lot.modelId));
      const payload = await api(`/api/auctions?${params}`);
      const items = (payload.items || []).filter(x => String(x.id) !== String(lot.id)).slice(0, 12);
      if(!items.length) return;
      box.innerHTML = items.map(renderSimilarCard).join("");
      sec.hidden = false;
    }catch(e){ /* archived similar is optional */ }
  }

  function renderDetail(lot){
    // Keep the address bar shareable: VIN/lot search renders the detail in place,
    // so push the canonical /auctions/<auction>-<lot> URL if we're not on it yet.
    try{
      if(lot && lot.auction && lot.lot){
        const href = detailHref(lot);
        if(location.pathname !== href) history.pushState({apexLot:1}, "", href);
      }
    }catch(e){}
    const images = lot.images?.length ? lot.images : [lot.image].filter(Boolean);
    const title = lotTitle(lot);
    const dmgParts = String(lot.damage || "").split("/").map(s => s.trim()).filter(Boolean);
    const primaryDmg = lot.primaryDamage || dmgParts[0] || "";
    const secondaryDmg = lot.secondaryDamage || dmgParts[1] || "";
    const driveLine = [cleanEngine(lot.engine), upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" · ");
    const specLine  = [cleanEngine(lot.engine), upAbbr(lot.drive), cleanTrans(lot.transmission)].filter(Boolean).join(" • ");
    const vinReport = lot.vin ? `https://www.google.com/search?q=${encodeURIComponent(lot.vin)}` : "";
    // History summary for Главное section
    // Запись текущих торгов (h.current) — не история: впервые выставленная
    // машина не должна выглядеть как «продавалась ранее»
    const pastHistory = (Array.isArray(lot.priceHistory) ? lot.priceHistory : []).filter(h => !h.current);
    const histCount = pastHistory.length;
    const wasSoldBefore = histCount > 0 && pastHistory.some(h => { const s = String(h.status || "").toLowerCase(); return s.includes("sold") && !s.includes("not"); });
    const histStr = histCount === 0 ? "Ранее не продавалась" : wasSoldBefore ? "Был продан ранее" : `${histCount} ${plural(histCount, "запись", "записи", "записей")}`;
    // Seller type detection — как у DreamBid: галочка в слоте иконки + обычный
    // текст «Страховая · Имя», без цветных плашек внутри таблицы
    const isIns = /insurance|state farm|allstate|progressive|geico|nationwide|farmers|usaa|liberty mutual|statefarm/i.test(String(lot.seller || ""));
    const sellerName = tc(String(lot.seller || "")).replace(/\s*·\s*Страховая\s*$/i, "");
    $("#auctionCatalog").hidden = true;
    const detail = $("#auctionDetail");
    detail.hidden = false;
    detail.innerHTML = `
      <div class="detailTopRowV1">
        <a class="detailBackV1" href="/auctions">← Вернуться к каталогу</a>
        <form class="detailSearchV1" data-detail-search>
          <input type="search" placeholder="VIN, номер лота или марка/модель" aria-label="Поиск по аукционам" autocomplete="off">
          <button type="submit">Найти</button>
        </form>
      </div>
      <section class="auctionDetailPanelV1">
        <div class="detailHeaderV1">
          <div>
            <span class="auctionCrumbsV1"><a href="/">Главная</a> / <a href="/auctions">Аукционы</a>${lot.make ? ` / <a href="${lot.makeId ? `/auctions?make=${lot.makeId}` : `/auctions?name=${encodeURIComponent(lot.make)}`}">${escapeHtml(lot.make)}</a>` : ""}${lot.make && lot.model ? ` / <a href="${lot.makeId && lot.modelId ? `/auctions?make=${lot.makeId}&model=${lot.modelId}` : `/auctions?name=${encodeURIComponent(`${lot.make} ${lot.model}`)}`}">${escapeHtml(displayModel(lot.model))}</a>` : ""} / ${escapeHtml(lot.auction.toUpperCase())} ${escapeHtml(lot.lot || "")}</span>
            <div class="dTitleRowV1">
              <h1>${escapeHtml(title)}</h1>
              <button type="button" class="dShareBtnV1" data-share-page>${dbIco("ext")}<span>Поделиться</span></button>
            </div>
            <p class="dSpecLine">${dbIco("engine")}<span>${escapeHtml(specLine || "—")}</span>${lot.vin ? copyChip(lot.vin, "Скопировать VIN", "dSpecVin", "vin") : ""}</p>
          </div>
          <div class="dHeadActionsV1">
            <button type="button" class="dFavBtnV1${favHas(lot.id) ? " is-fav" : ""}" data-fav="${escapeHtml(lot.id)}">${dbIco("star")}<span>${favHas(lot.id) ? "В избранном" : "В избранное"}</span></button>
            ${vinReport ? `<a class="dVinBtn" href="${vinReport}" target="_blank" rel="noopener">Отчёт истории VIN</a>` : ""}
          </div>
        </div>
        <div class="lotDetailGridV1">
          <div class="detailGalleryV1">
            <div class="dGalMainV2" data-lb-open role="button" tabindex="0" aria-label="Открыть фото в HD">
              <img id="detailMainImage" class="detailMainImageV1" src="${escapeHtml(images[0] || "")}" alt="${escapeHtml(title)}">
              <span class="dAuc dGalChipV2">${escapeHtml(lot.auction.toUpperCase())}</span>
              ${images.length > 1 ? `
              <button class="dGalNavV1 dGalPrevV1" type="button" data-gal-step="-1" aria-label="Предыдущее фото">‹</button>
              <button class="dGalNavV1 dGalNextV1" type="button" data-gal-step="1" aria-label="Следующее фото">›</button>` : ""}
              <div class="dGalBadgesV2">
                ${lot.video ? `<span class="dGalTagV2" data-open-video role="button">${dbIco("play")} Видео</span>` : ""}
                ${lot.has360 || lot.spin ? `<span class="dGalTagV2">360°</span>` : ""}
                <span class="dGalTagV2">${dbIco("zoom")} HD · ${escapeHtml(images.length || 1)} фото</span>
              </div>
            </div>
            <div class="detailThumbsV1">
              ${images.map((src, i) => `<img class="dThumbV2${i === 0 ? " isActiveThumbV2" : ""}" src="${escapeHtml(src)}" alt="${escapeHtml(title)}" data-detail-image="${escapeHtml(src)}" data-detail-index="${i}"${i > 0 ? ' loading="lazy"' : ""}>`).join("")}
              ${lot.video ? `<span class="dThumbV2 dThumbVideoV1" role="button" data-open-video title="Видео осмотра"><img src="${escapeHtml(images[0] || "")}" alt="Видео осмотра" loading="lazy"><i class="dThumbPlayV1">${dbIco("play")}</i></span>` : ""}
            </div>
          </div>
          <div class="lotDetailCenterV1">
            <section class="dSec">
              <div class="dSecHead">Главное</div>
              ${dMain("Состояние", conditionInfo(lot.condition).label)}
              ${lot.seller ? dMain("Продавец", isIns ? `Страховая · ${sellerName}` : sellerName, isIns ? "check" : "person") : ""}
              ${(() => {
                const k = String(lot.keys || "").trim();
                if(!k) return "";
                const yes = /^(yes|да|present|available)/i.test(k);
                const no = /^(no|нет|not )/i.test(k);
                // Ключ есть — зелёный, нет — жёлтый (внимание, но не приговор)
                return dPlain("Ключ доступен", escapeHtml(tc(k)), "key", yes ? "good" : no ? "warn" : "neutral");
              })()}
              ${(() => {
                const doc = parseDocTitle(lot.document || lot.titleStatus);
                if(!doc) return "";
                const verdict = doc.tone === "rework" ? "Требуется переделка · 30–40 дней" : doc.tone === "good" ? "Хорошие" : tc(doc.label);
                const icon = doc.tone === "rework" ? "excl" : "doc";
                const docTone = doc.tone === "rework" ? "warn" : doc.tone === "good" ? "good" : "neutral";
                return dMain("Статус документов", verdict, icon)
                  + dPlain("Тип документа", escapeHtml(docShort(lot.document || lot.titleStatus)), "doc", docTone);
              })()}
              ${dMain("История", histStr)}
              ${dPlain("Привод", escapeHtml(driveLine), "drive")}
              ${dPlain("Пробег", `${escapeHtml(dbOdo(lot.odometerText))}${lot.odometerStatus && !/actual|факт/i.test(lot.odometerStatus) ? ` <span class="odoWarnV1">${escapeHtml(tc(lot.odometerStatus))}</span>` : ""}`, "odo")}
              ${primaryDmg ? dMain("Основное повреждение", ruDamage(primaryDmg), "damage") : ""}
              ${secondaryDmg ? dMain("Вторичное повреждение", ruDamage(secondaryDmg), "damage") : ""}
              ${lot.saleType ? dMain("Тип ущерба", ruDamage(lot.saleType), "damage") : ""}
              ${vinReport ? dPlain("Экстра", `<a class="dLink" href="${vinReport}" target="_blank" rel="noopener">Отчет VIN</a>`, "gem") : ""}
            </section>
            <div class="dRecoV2">${dbIco("check")}<div><b>Apex Auto рекомендует</b><p>Поможем проверить лот, документы и историю, рассчитать стоимость под ключ до Кишинёва и сопроводить сделку от ставки до выдачи.</p></div></div>
            <section class="dSec">
              <div class="dSecHead">Аукцион</div>
              ${dPlain("VIN", copyChip(lot.vin, "Скопировать VIN", "dCopyValV1", ""))}
              ${dPlain("Номер лота", `${copyChip(lot.lot, "Скопировать номер лота", "dCopyValV1", "")} ${aucLinkBadge(lot)}`)}
              ${lot.saleStatus ? dPlain("Статус продажи", escapeHtml(lot.saleStatus)) : ""}
              ${lot.seller ? dPlain("Тип продавца", isIns ? "Страховая" : "Дилер / банк") : ""}
              ${dPlain("Продавец", escapeHtml(sellerName))}
              ${dPlain("Дата аукциона", escapeHtml(dbDate(lot.auctionDate, true)))}
              ${(() => {
                // Локация — официальная площадка из нашей базы (та же, что в
                // калькуляторе); сырое значение API — только фоллбек
                const matched = findLotLocation(lot);
                const label = matched ? String(matched.displayName || matched.location || "").split("→")[0].trim() : "";
                return dPlain("Локация", escapeHtml(label || tc(lot.location)));
              })()}
              ${lot.estimatedRetailValue ? dPlain("Оценка (ACV)", money(lot.estimatedRetailValue)) : ""}
            </section>
            <section class="dSec">
              <div class="dSecHead">Описание</div>
              ${dPlain("Тип топлива", escapeHtml(ruEnum(RU_FUEL, lot.fuel)))}
              ${dPlain("Цвет кузова", escapeHtml(ruEnum(RU_COLOR, lot.color)))}
              ${dPlain("Тип кузова", escapeHtml(ruEnum(RU_BODY, lot.body)))}
              ${lot.cylinders ? dPlain("Цилиндры", escapeHtml(lot.cylinders)) : ""}
              ${lot.preAccidentPrice ? dPlain("Оценка до аварии", money(lot.preAccidentPrice)) : ""}
              ${lot.cleanWholesalePrice ? dPlain("Оптовая (clean)", money(lot.cleanWholesalePrice)) : ""}
              ${lot.video ? dPlain("Видео осмотра", `<button type="button" class="dLink dLinkBtnV1" data-open-video>Смотреть видео</button>`) : ""}
            </section>
            ${renderPriceHistory(lot.priceHistory)}
            <section class="dSec lotStatsBoxV1" id="lotStatsBox" hidden></section>
          </div>
          ${renderLotCalculator(lot)}
        </div>
        <section class="simSecV1" id="similarActiveSection" hidden>
          <h2>Похожие текущие аукционы</h2>
          <div class="simGridV1" id="similarActiveLots"></div>
        </section>
        <section class="simSecV1" id="similarArchivedSection" hidden>
          <h2>Похожие архивные аукционы</h2>
          <div class="simGridV1" id="similarArchivedLots"></div>
        </section>
      </section>
    `;
    state.selectedLot = lot;
    state.detailImages = images;
    // Единый медиа-набор для лайтбокса: фото + видео осмотра последней плиткой
    state.detailMedia = images.map(src => ({type:"image", src}));
    if(lot.video) state.detailMedia.push({type:"video", src:lot.video, poster:images[0] || ""});
    state.detailIndex = 0;
    setSeo(lot);
    updateLotCalculator();
    loadSimilarActive(lot);
    loadSimilarArchived(lot);
    loadStats(lot);
    fetchLiveRates();
    startLotCountdown(lot);
  }

  // Живой отсчёт до торгов в сайдбаре (обновление раз в 30 сек)
  let lotCdTimer = null;
  function startLotCountdown(lot){
    if(lotCdTimer){ clearInterval(lotCdTimer); lotCdTimer = null; }
    if(!document.getElementById("lotCalcCountdown")) return;
    lotCdTimer = setInterval(() => {
      const node = document.getElementById("lotCalcCountdown");
      if(!node){ clearInterval(lotCdTimer); lotCdTimer = null; return; }
      const tl = timeLeftLabel(lot.auctionDate);
      if(tl){ node.textContent = tl; return; }
      const box = node.closest(".calcCountdownV1");
      if(box) box.innerHTML = `${dbIco("clock")}<span>Торги начались</span>`;
      clearInterval(lotCdTimer); lotCdTimer = null;
    }, 30e3);
  }

  // Market statistics for this make/model (avg sale price, range, sample size).
  async function loadStats(lot){
    const box = document.getElementById("lotStatsBox");
    if(!box || !lot.makeId || !lot.modelId) return;
    try{
      const params = new URLSearchParams({manufacturer_id:String(lot.makeId), model_id:String(lot.modelId)});
      if(lot.year) params.set("year", String(lot.year));
      const r = await api(`/api/auctions?action=statistics&${params}`);
      const rows = Array.isArray(r.stats) ? r.stats : [];
      if(!rows.length) return;
      const yr = Number(lot.year) || null;
      let scope = yr ? rows.filter(x => Number(x.year) === yr) : rows;
      if(!scope.length) scope = rows;
      let sumW = 0, cnt = 0, min = Infinity, max = 0;
      scope.forEach(x => {
        const c = Number(x.lot_count) || 0, avg = Number(x.avg_final_bid) || 0;
        if(avg > 0 && c > 0){ sumW += avg * c; cnt += c; }
        const mn = Number(x.min_final_bid) || 0, mx = Number(x.max_final_bid) || 0;
        if(mn > 0) min = Math.min(min, mn);
        if(mx > 0) max = Math.max(max, mx);
      });
      if(!cnt) return;
      const avg = Math.round(sumW / cnt);
      const title = [yr, lot.make, lot.model].filter(Boolean).join(" ");
      box.innerHTML = `
        <div class="dSecHead">Рыночная статистика <span class="histCountV1">${escapeHtml(title)} · ${cnt} ${plural(cnt, "продажа", "продажи", "продаж")}</span></div>
        <div class="statGridV1">
          <div class="statCellV1"><span>Средняя цена продажи</span><b>${money(avg)}</b></div>
          ${min < Infinity && max ? `<div class="statCellV1"><span>Диапазон</span><b>${money(min)} – ${money(max)}</b></div>` : ""}
          <div class="statCellV1"><span>Анализ лотов</span><b>${cnt}</b></div>
        </div>
        <p class="statNoteV1">По данным проданных лотов Copart и IAAI${yr ? ` за ${yr} год` : ""}. Помогает оценить адекватную ставку.</p>`;
      box.hidden = false;
      // Короткая строка рынка в сайдбаре калькулятора — как «оценочная стоимость» у DreamBid
      const marketLine = document.getElementById("lotMarketLineV1");
      if(marketLine){
        marketLine.innerHTML = `${dbIco("chart")}<span>Рынок: средняя ${money(avg)} · ${cnt} ${plural(cnt, "продажа", "продажи", "продаж")}</span>`;
        marketLine.hidden = false;
      }
    }catch(e){ /* stats optional — ignore */ }
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

  // VIN report — uses the dedicated /search-vin endpoint (car info + price history).
  async function openVinReport(vin){
    const clean = String(vin || "").replace(/[^A-Za-z0-9]/g, "");
    $("#auctionCatalog").hidden = true;
    $("#auctionDetail").hidden = false;
    $("#auctionDetail").innerHTML = '<div class="auctionMessageV1">Получаем отчёт по VIN…</div>';
    window.scrollTo(0, 0);
    try{
      const payload = await api(`/api/auctions?action=vin&vin=${encodeURIComponent(clean)}`);
      renderDetail(payload.lot);
    }catch(error){
      $("#auctionDetail").innerHTML = `<a class="detailBackV1" href="/auctions">← Назад к каталогу</a>
        <div class="vinEmptyV1">
          <h2>По VIN ${escapeHtml(clean)} лот не найден</h2>
          <p>Возможно, машина ещё не выставлена на Copart/IAAI или VIN указан с ошибкой. Проверьте номер или оставьте заявку — найдём и проверим вручную.</p>
          <a class="vinLeadBtnV1" href="/index.html#lead">Оставить заявку</a>
        </div>`;
    }
  }

  window.addEventListener("popstate", () => { location.reload(); });

  function triggerSearch(){
    const smart = parseSmartSearch($("#auctionSmartSearch")?.value);
    // A complete VIN → open the VIN report instead of filtering the list.
    if(smart.vin){ openVinReport(smart.vin); return; }
    state.page = 1; state.displayPage = 1;
    loadLots();
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
      range._applyNums = fromNum; // sync slider position from the number inputs (used on URL restore)
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

    // Damage, color, state: mutable arrays — filled from API on load
    let damages = [];
    let colors  = [];
    let states  = [];

    // Damage: sent as text (confirmed filterable by API)
    setupCombo("filterDamageV2", "damageMenuV2", () => damages);

    // Color: no hidden id — text value goes directly to API
    setupCombo("filterColorV2", "colorMenuV2", () => colors);

    // State: store state_code (e.g. "CA"), NOT numeric id
    const stateId = document.getElementById("filterStateIdV2");
    setupCombo("filterStateV2", "stateMenuV2", () => states, (opt) => {
      if(stateId) stateId.value = opt.code || String(opt.id || "");
    });
    document.getElementById("filterStateV2")?.addEventListener("input", () => { if(stateId) stateId.value = ""; });

    // Fetch dict options — silent fail; combos populate once data arrives
    const country = document.querySelector('input[name="country"]:checked')?.value || "US";
    api("/api/auctions?action=usadict&dict=damages").then(r => { damages = r.items || []; }).catch(() => {});
    api("/api/auctions?action=usadict&dict=colors").then(r => { colors = r.items || []; }).catch(() => {});
    api(`/api/auctions?action=usadict&dict=states&country=${country}`).then(r => { states = r.items || []; }).catch(() => {});
  }

  function bindEvents(){
    // Поиск со страницы лота: VIN → фильтр по VIN, номер лота → поиск лота,
    // текст → поиск по названию; уводим в каталог с готовым запросом
    document.addEventListener("submit", event => {
      const form = event.target.closest("[data-detail-search]");
      if(!form) return;
      event.preventDefault();
      const smart = parseSmartSearch(form.querySelector("input")?.value);
      if(smart.vin) location.href = `/auctions?vin=${encodeURIComponent(smart.vin)}`;
      else if(smart.lot) location.href = `/auctions?q=${encodeURIComponent(smart.lot)}`;
      else if(smart.name) location.href = `/auctions?name=${encodeURIComponent(smart.name)}`;
    });
    // «Поделиться» — системный share на мобильном, буфер обмена на десктопе
    $("#shareCatalogBtn")?.addEventListener("click", async () => {
      const btn = $("#shareCatalogBtn");
      const url = location.href;
      try{
        if(navigator.share){ await navigator.share({title:document.title, url}); return; }
        await navigator.clipboard.writeText(url);
        const label = btn.querySelector("span");
        if(label){ const t = label.textContent; label.textContent = "Скопировано"; setTimeout(() => { label.textContent = t; }, 1400); }
      }catch(_){}
    });
    // Инфо-баннер: показываем, пока пользователь не закрыл
    (function(){
      const banner = $("#auctionInfoBanner");
      if(!banner) return;
      try{ if(!localStorage.getItem("apexAucInfoHidden")) banner.hidden = false; }catch(_){ banner.hidden = false; }
      $("#infoCloseBtn")?.addEventListener("click", () => {
        banner.hidden = true;
        try{ localStorage.setItem("apexAucInfoHidden", "1"); }catch(_){}
      });
    })();
    $("#auctionSearchBtn").addEventListener("click", () => { exitDiscovery(); triggerSearch(); });
    ["#auctionSmartSearch"].forEach(selector => {
      $(selector)?.addEventListener("keydown", event => {
        if(event.key === "Enter"){ event.preventDefault(); triggerSearch(); }
      });
    });
    (function initSortDrop(){
      const drop = document.getElementById("sortDropV1");
      const trig = document.getElementById("sortDropTrigV1");
      const menu = document.getElementById("sortDropMenuV1");
      const lbl  = document.getElementById("sortDropLabelV1");
      const inp  = document.getElementById("auctionSort");
      if(!drop) return;
      function setSort(val, silent){
        const opt = menu.querySelector(`[data-sort="${val}"]`);
        if(!opt) return;
        menu.querySelectorAll(".sortOptV1").forEach(el => el.classList.remove("sortOptActiveV1"));
        opt.classList.add("sortOptActiveV1");
        lbl.textContent = opt.textContent.trim();
        inp.value = val;
        if(!silent){ exitDiscovery(); state.page = 1; state.displayPage = 1; loadLots(); }
      }
      const urlSort = new URLSearchParams(location.search).get("sort");
      if(urlSort) setSort(urlSort, true);
      trig.addEventListener("click", e => { e.stopPropagation(); drop.classList.toggle("openV1"); menu.hidden = !menu.hidden; });
      document.addEventListener("click", e => { if(!drop.contains(e.target)){ drop.classList.remove("openV1"); menu.hidden = true; } });
      menu.addEventListener("click", e => {
        const opt = e.target.closest(".sortOptV1");
        if(!opt || opt.classList.contains("sortOptActiveV1")) return;
        setSort(opt.dataset.sort);
        drop.classList.remove("openV1"); menu.hidden = true;
      });
    }());
    document.querySelectorAll("[data-auction-switch]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-auction-switch]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        state.auction = button.dataset.auctionSwitch;
        exitDiscovery(); state.page = 1; state.displayPage = 1;
        loadLots();
      });
    });
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-tab]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        state.tab = button.dataset.tab || "all";
        exitDiscovery(); state.page = 1; state.displayPage = 1;
        loadLots();
      });
    });
    $("#auctionFiltersForm").addEventListener("submit", event => {
      event.preventDefault();
      exitDiscovery(); state.page = 1; state.displayPage = 1;
      document.body.classList.remove("filtersOpenV1");
      loadLots();
    });
    $("#resetFiltersBtn").addEventListener("click", () => {
      $("#auctionFiltersForm").reset();
      ["#auctionSmartSearch"].forEach(selector => {
        const input = $(selector);
        if(input) input.value = "";
      });
      document.querySelectorAll(".dateQuickV2 button.active").forEach(b => b.classList.remove("active"));
      document.querySelectorAll("[data-range]").forEach(range => { if(range._refresh) range._refresh(); });
      state.page = 1; state.displayPage = 1;
      loadLots();
    });
    document.getElementById("paginationV1")?.addEventListener("click", e => {
      if(e.target.id === "pgLoadMoreBtn"){
        if(state.loading || !state.hasMore) return;
        state.page++;
        loadLots({append: true});
        return;
      }
      const btn = e.target.closest(".pgBtnV1");
      if(!btn || btn.disabled || btn.classList.contains("pgActiveV1")) return;
      const page = parseInt(btn.dataset.page);
      if(!page || page < 1) return;
      const loadedPages = Math.ceil(state.items.length / state.displayPageSize);
      if(page > loadedPages && state.hasMore){
        state.page++;
        state.displayPage = page;
        loadLots({append: true});
        return;
      }
      state.displayPage = page;
      const cardsTop = document.getElementById("auctionCards")?.offsetTop ?? 0;
      window.scrollTo({top: Math.max(0, cardsTop - 80), behavior:"smooth"});
      renderCards();
    });
    const sidebar = $("#auctionFilters");
    function openFiltersDrawer(){ document.body.classList.add("filtersOpenV1"); }
    function closeFiltersDrawer(){ document.body.classList.remove("filtersOpenV1"); }
    $("#openFiltersBtn").addEventListener("click", openFiltersDrawer);
    $("#searchSettingsBtn")?.addEventListener("click", openFiltersDrawer);
    $("#closeFiltersBtn").addEventListener("click", closeFiltersDrawer);
    document.addEventListener("click", event => {
      const slideBtn = event.target.closest(".dbSlideBtn");
      if(slideBtn){
        event.preventDefault();
        event.stopPropagation();
        const card = slideBtn.closest(".dbPhoto");
        if(!card) return;
        const lid = card.dataset.lid;
        const lot = state.items.find(l => String(l.id) === String(lid));
        if(!lot || !lot.images?.length) return;
        const img = card.querySelector(".dbSlideImg");
        const counter = card.querySelector(".dbPhotoCount");
        const dir = parseInt(slideBtn.dataset.dir) || 1;
        let idx = parseInt(img?.dataset.slide || "0");
        idx = (idx + dir + lot.images.length) % lot.images.length;
        if(img){ img.src = lot.images[idx]; img.dataset.slide = idx; }
        if(counter) counter.textContent = `${idx + 1}/${lot.images.length}`;
        return;
      }
      const copyEl = event.target.closest("[data-copy]");
      if(copyEl){
        event.preventDefault();
        event.stopPropagation();
        const val = copyEl.dataset.copy || "";
        const done = () => { copyEl.classList.add("copiedV1"); setTimeout(() => copyEl.classList.remove("copiedV1"), 1100); };
        if(navigator.clipboard && navigator.clipboard.writeText){
          navigator.clipboard.writeText(val).then(done).catch(() => {
            const ta = document.createElement("textarea"); ta.value = val; document.body.appendChild(ta); ta.select();
            try{ document.execCommand("copy"); }catch(e){} ta.remove(); done();
          });
        }else{
          const ta = document.createElement("textarea"); ta.value = val; document.body.appendChild(ta); ta.select();
          try{ document.execCommand("copy"); }catch(e){} ta.remove(); done();
        }
        return;
      }
      const expBtn = event.target.closest(".dbExpandV1");
      if(expBtn){
        event.preventDefault();
        const card = expBtn.closest(".dbCard");
        const open = card.classList.toggle("dbOpenV1");
        expBtn.textContent = open ? "Свернуть" : "Развернуть";
        return;
      }
      const favBtn = event.target.closest("[data-fav]");
      if(favBtn){
        event.preventDefault();
        event.stopPropagation();
        const id = favBtn.dataset.fav;
        const lot = state.items.find(l => String(l.id) === String(id)) || (state.selectedLot && String(state.selectedLot.id) === String(id) ? state.selectedLot : null);
        if(lot){
          const on = favToggle(lot);
          favBtn.classList.toggle("is-fav", on);
          const label = favBtn.querySelector("span");
          if(label) label.textContent = on ? "В избранном" : "В избранное";
          if(state.tab === "favorites") renderFavorites();
        }
        return;
      }
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
      const calcToggle = event.target.closest("[data-calc-toggle]");
      if(calcToggle){
        const key = calcToggle.dataset.calcToggle;
        const sec = calcToggle.closest("[data-calc-sec]");
        if(calcClosedSecs.has(key)) calcClosedSecs.delete(key); else calcClosedSecs.add(key);
        sec?.classList.toggle("calcClosedV1", calcClosedSecs.has(key));
      }
      const shareBtn = event.target.closest("[data-share-page]");
      if(shareBtn){
        (async () => {
          const url = location.href;
          try{
            if(navigator.share){ await navigator.share({title:document.title, url}); return; }
            await navigator.clipboard.writeText(url);
            const label = shareBtn.querySelector("span");
            if(label){ const old = label.textContent; label.textContent = "Скопировано"; setTimeout(() => { label.textContent = old; }, 1600); }
          }catch(e){}
        })();
      }
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
      const galStep = event.target.closest("[data-gal-step]");
      if(galStep){
        // Листание главного фото стрелками — без открытия лайтбокса
        const imgs = state.detailImages || [];
        if(imgs.length > 1){
          state.detailIndex = ((state.detailIndex || 0) + Number(galStep.dataset.galStep) + imgs.length) % imgs.length;
          const main = $("#detailMainImage");
          if(main) main.src = imgs[state.detailIndex];
          document.querySelectorAll(".detailThumbsV1 .dThumbV2").forEach(t => t.classList.toggle("isActiveThumbV2", Number(t.dataset.detailIndex) === state.detailIndex));
        }
        return;
      }
      if(event.target.closest("[data-open-video]")){
        const media = state.detailMedia || [];
        const vi = media.findIndex(m => m.type === "video");
        if(vi >= 0) openLightbox(media, vi);
        return;
      }
      if(event.target.closest("[data-lb-open]")){
        openLightbox(state.detailMedia || state.detailImages || [], state.detailIndex || 0);
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

  // Fire-and-forget пинг синхронизации каталога: сайт сам поддерживает базу
  // лотов свежей от трафика (endpoint защищён локом, чаще раза в ~5 мин не сработает).
  function pingLotsSync(){
    try{
      const KEY = "apexLotsSyncPing";
      const last = Number(localStorage.getItem(KEY) || 0);
      if(Date.now() - last < 15 * 60e3) return;
      localStorage.setItem(KEY, String(Date.now()));
      fetch("/api/sync-lots?source=web").catch(() => {});
    }catch(e){}
  }

  async function initAuctions(){
    closeLead();
    bindEvents();
    initRanges();
    initCarData();
    updateFavCount();
    pingLotsSync();
    const isDetail = await loadDetailFromUrl();
    if(!isDetail){
      restoreFromUrl();
      // Discovery mode: pre-select "Заводится и едет" when no URL params
      if(discoveryMode){
        const r = document.querySelector('input[name="condition"][value="0"]');
        if(r) r.checked = true;
      }
      loadLots();
    }
  }

  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", () => { initAuctions(); fetchLiveRates(); });
  }else{
    initAuctions();
    fetchLiveRates();
  }
})();
