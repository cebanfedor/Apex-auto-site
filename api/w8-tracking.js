// Rate-limit по IP: публичный трекинг инициирует исходящий скрейп w8shipping.ua
// (+ иногда NHTSA). Без лимита эндпоинт можно использовать как усилитель нагрузки
// или для перебора VIN. In-memory (per-instance), как в других роутах. P2-5.
const w8RateMap = new Map();
const W8_RATE_MAX = 20;             // запросов
const W8_RATE_WINDOW = 10 * 60e3;   // за 10 минут
function checkW8Rate(ip){
  const now = Date.now();
  const hits = (w8RateMap.get(ip) || []).filter(t => now - t < W8_RATE_WINDOW);
  if(hits.length >= W8_RATE_MAX){ w8RateMap.set(ip, hits); return false; }
  hits.push(now);
  w8RateMap.set(ip, hits);
  if(w8RateMap.size > 5000) w8RateMap.clear();
  return true;
}
function w8ClientIp(req){
  const xf = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket?.remoteAddress || "unknown";
}

// ===================== Провайдер №2: Dealer API перевозчика =====================
// Read-only /purchases c заголовком x-api-key (ключ и адрес — ТОЛЬКО из env:
// DEALER_API_KEY, DEALER_API_BASE). Ключ открывает ВСЕ покупки дилера с ценами и
// документами, поэтому наружу ходим только по точному VIN/лоту и отдаём очищенный
// ответ: без price, documents, ownership, _id. Список /purchases не выставляется.
const DEALER_PHOTO_LABELS = {
  auction:"С аукциона", warehouse:"Со склада", port_departure:"Порт отправки",
  port_arrival:"Порт прибытия", driver_photo_USA:"Фото водителя (США)",
  driver_photo_USA_EU:"Фото водителя (порт ЕС)", driver_photo_EU:"Фото водителя (ЕС)",
  warehouse_poland_handover:"Передача на складе (Польша)", customs:"Таможня"
};
const DEALER_DETAIL = {
  TO_WAREHOUSE:"едет на склад", TO_PLATFORM:"едет на площадку", AT_WAREHOUSE:"на складе",
  AT_PLATFORM:"на площадке", LOADED_IN_CONTAINER:"погружен в контейнер",
  UNLOADED_FROM_CONTAINER:"выгружен из контейнера"
};
function dealerConfig(){
  const base = String(process.env.DEALER_API_BASE || "").trim().replace(/\/+$/, "");
  const key = String(process.env.DEALER_API_KEY || "").trim();
  return base && key ? {base, key} : null;
}
async function dealerFetch(path){
  const cfg = dealerConfig();
  if(!cfg) return {status:0, json:null};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try{
    const r = await fetch(cfg.base + path, {headers:{"x-api-key":cfg.key, accept:"application/json"}, signal:controller.signal});
    let json = null; try{ json = await r.json(); }catch(_){}
    return {status:r.status, json};
  }finally{ clearTimeout(timer); }
}
async function lookupDealer(paramKey, query){
  if(!dealerConfig()) return null;
  const q = paramKey === "vin" ? String(query).toUpperCase() : String(query);
  const {status, json} = await dealerFetch("/purchases?" + paramKey + "=" + encodeURIComponent(q) + "&$limit=1");
  if(status !== 200){ if(status) console.error("dealer-tracking upstream status:", status); return null; }
  const p = json && Array.isArray(json.data) ? json.data[0] : null;
  return p || null;
}
// API отдаёт только ТЕКУЩИЙ шаг (истории нет), а IN_TRANSIT/ON_LOCATION повторяются
// на стороне отправления и в Европе (различает location) — таймлайн собираем из
// пары «состояние + локация». Для машин из ЕС цепочка короткая, без моря.
function dealerStages(p){
  const cds = p.currentDeliveryStatus || null;
  const eu = String(p.fromCountry || "").toUpperCase() === "EU";
  const chain = eu
    ? ["D_PURCHASED", "D_TO_DEST", "D_AT_DEST", "D_ARRIVED"]
    : ["D_PURCHASED", "D_TO_ORIGIN", "D_AT_ORIGIN", "D_SEA", "D_TO_DEST", "D_AT_DEST", "D_ARRIVED"];
  let idx = 0;
  if(cds){
    const st = String(cds.state || ""), destSide = ["PL", "UA", "EU"].includes(String(cds.location || ""));
    if(eu) idx = st === "ARRIVED" ? 3 : st === "ON_LOCATION" ? 2 : st === "PURCHASED" ? 0 : 1;
    else idx = st === "ARRIVED" ? 6 : st === "IN_SHIPMENT" ? 3 : st === "ON_LOCATION" ? (destSide ? 5 : 2) : st === "IN_TRANSIT" ? (destSide ? 4 : 1) : 0;
  }
  const finished = cds && String(cds.status || "") === "finished";
  const day = v => (v ? String(v).slice(0, 10) : null);
  return chain.map((title, i) => ({
    title,
    date: i === idx && cds ? day(cds.date || cds.expectedDate) : null,
    status: i < idx ? "completed" : i === idx ? (finished || !cds ? "completed" : "current") : "todo"
  }));
}
function mapDealer(p, vinQuery){
  const cds = p.currentDeliveryStatus || {};
  const images = p.images && typeof p.images === "object" ? p.images : {};
  const photoCategories = Object.keys(DEALER_PHOTO_LABELS)
    .filter(k => Array.isArray(images[k]) && images[k].length)
    .map(k => ({type:k, label:DEALER_PHOTO_LABELS[k], photos:images[k].filter(u => /^https:\/\//i.test(String(u)))}))
    .filter(c => c.photos.length);
  const vehicle = p.title || [p.year, p.make, p.model].filter(Boolean).join(" ") || null;
  return {
    vehicle,
    vin: p.vin || vinQuery || null,
    auction: null,
    city: p.location || null,
    lotNumber: p.lot || null,
    keys: p.keys ? (p.keys.has_keys ? "yes" : "no") : null,
    titleStatus: p.title_doc == null ? null : (p.title_doc ? "yes" : "no"),
    titleReceived: null,
    container: {
      number: cds.container_number || null, booking: null,
      loadingPort: cds.portOut || null, destinationPort: cds.portIn || null, portArrival: null
    },
    etaChisinau: null,
    expectedDate: cds.expectedDate ? String(cds.expectedDate).slice(0, 10) : null,
    statusDetail: DEALER_DETAIL[cds.stateValue] || null,
    arrivedCity: cds.city || null,
    fromCountry: p.fromCountry || null,
    stages: dealerStages(p),
    photos: photoCategories.flatMap(c => c.photos).slice(0, 12),
    photoCategories,
    source: "dealer"
  };
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowedOrigins = ["https://apexauto.md", "http://localhost:8081"];
  if(allowedOrigins.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  if(!checkW8Rate(w8ClientIp(req))){
    return res.status(429).json({ error: "rate_limited", message: "Слишком много запросов. Подождите пару минут." });
  }
  // Диагностика подключения провайдера №2: только булевы/код статуса, без данных.
  if(String(req.query.diag || "") === "1"){
    let upstream = 0;
    if(dealerConfig()){ try{ upstream = (await dealerFetch("/purchases?$limit=1&$select[]=_id")).status; }catch(_){ upstream = -1; } }
    res.setHeader("Cache-Control", "no-store");
    return res.json({dealerConfigured: !!dealerConfig(), dealerUpstreamStatus: upstream});
  }
  const { vin, lot } = req.query;
  const query = vin || lot;
  if (!query) return res.status(400).json({ error: "vin or lot required" });

  const paramKey = vin ? "vin" : "lot";
  // Сначала — Dealer API (свой кабинет дилера, данные богаче); не нашли — W8.
  try{
    const dealer = await lookupDealer(paramKey, String(query).trim());
    if(dealer){
      res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");
      return res.json(mapDealer(dealer, vin));
    }
  }catch(e){ console.error("dealer-tracking error:", e?.message || e); }
  const url = `https://dc.w8shipping.ua/ru/cargo-tracking?${paramKey}=${encodeURIComponent(query)}`;

  let html;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ApexAutoTracker/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return res.status(502).json({ error: "W8 fetch failed" });
    html = await r.text();
  } catch (e) {
    // Не отдаём наружу e.message/upstream-статус (публичный эндпоинт) — логируем серверно.
    console.error("w8-tracking error:", e?.message || e);
    return res.status(502).json({ error: "W8 unreachable" });
  }

  // Extract all Next.js RSC payload chunks
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) chunks.push(m[1]);
  const rsc = chunks.join("").replace(/\\n/g, "\n").replace(/\\\\/g, "\\").replace(/\\"/g, '"');

  if (!rsc.includes("tracking-results") && !rsc.includes("Car won")) {
    return res.status(404).json({ error: "not_found", message: "Автомобиль не найден. Проверьте VIN или номер лота." });
  }

  // --- helpers ---
  function extractLabel(key) {
    const rx = new RegExp(`"label":"${key}","value":"([^"]+)"`, "i");
    const m = rx.exec(rsc);
    return m ? m[1] : null;
  }

  function extractLabelAlt(key) {
    // alternate order value/label
    const rx = new RegExp(`"value":"([^"]+)","[^"]*":"[^"]*","label":"${key}"`, "i");
    const m = rx.exec(rsc);
    return m ? m[1] : null;
  }

  // Vehicle name (h2 text child)
  let vehicleName = null;
  const nameMatch = rsc.match(/"baggage-claim[^"]*"[^}]+\}[^\]]+\][^,]+,\s*"([0-9]{4}\s+[A-Z][^"]+)"\]/i);
  if (nameMatch) vehicleName = nameMatch[1];

  // Tracking stages
  let stages = [];
  const stagesMatch = rsc.match(/"items":\[(\{"title":"[^}]+\}(?:,\{"title":"[^}]+\})*)\]/);
  if (stagesMatch) {
    try {
      stages = JSON.parse("[" + stagesMatch[1] + "]");
    } catch (_) {}
  }

  // Color
  let color = null;
  const colorMatch = rsc.match(/"backgroundColor":"([^"]+)"/);
  if (colorMatch) color = colorMatch[1];

  const vinCode = extractLabel("VIN number") || (vin ? vin : null);
  const portArrival = extractLabel("Expected arrival date");

  // ETA Chisinau = port arrival + 14 days (skip weekend if Friday/Saturday)
  let etaChisinau = null;
  if (portArrival) {
    const d = new Date(portArrival + "T00:00:00Z");
    const dow = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
    let days = 14;
    if (dow === 5) days += 2;
    else if (dow === 6) days += 1;
    d.setUTCDate(d.getUTCDate() + days);
    etaChisinau = d.toISOString().slice(0, 10);
  }

  // Photos categorized from W8 RSC attachments
  const PHOTO_LABELS = {
    "item_photo":               "Со склада",
    "item_interior_photo":      "Салон",
    "item_pickup_photo":        "С аукциона",
    "item_at_destination_photo":"С выгрузки",
    "item_damaged_photo":       "Повреждения",
    "item_keys_photo":          "Ключи",
    "item_battery_photo":       "Аккумулятор",
  };
  const photoMap = Object.create(null);
  const photoRe = /"attachment_type":"([^"]+)","url":"(https:\/\/static\.w8shipping\.com\/images\/auto\/[^"]+)"/g;
  let pmt;
  while ((pmt = photoRe.exec(rsc)) !== null) {
    const type = pmt[1], url = pmt[2];
    if (!photoMap[type]) photoMap[type] = [];
    photoMap[type].push(url);
  }
  const photoCategories = Object.entries(photoMap)
    .filter(([, arr]) => arr.length > 0)
    .map(([type, photos]) => ({ type, label: PHOTO_LABELS[type] || type, photos }));
  const photos = photoCategories.flatMap(c => c.photos).slice(0, 12);

  // NHTSA VIN decode (only if vehicle name not in RSC)
  let vehicleDecoded = vehicleName;
  if (!vehicleDecoded && vinCode) {
    try {
      const r = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vinCode)}?format=json`,
        { headers: { "Accept": "application/json" } }
      );
      if (r.ok) {
        const j = await r.json();
        const row = j.Results?.[0];
        if (row?.ModelYear && row?.Make && row?.Model) {
          vehicleDecoded = `${row.ModelYear} ${row.Make} ${row.Model}`;
        }
      }
    } catch (_) {}
  }

  const titleStatus   = extractLabel("Title status");    // "Yes" / "No"
  const titleReceived = extractLabel("Title status received"); // e.g. "2026-07-15 08:51 Txcars"
  const keysVal       = extractLabel("Keys");             // "Yes" / "No"

  const data = {
    vehicle: vehicleDecoded,
    vin: vinCode,
    auction: extractLabel("Auction"),
    city: extractLabel("City"),
    lotNumber: extractLabel("Lot number"),
    keys: keysVal ? (keysVal.toLowerCase() === "yes" ? "yes" : "no") : null,
    titleStatus: titleStatus ? (titleStatus.toLowerCase() === "yes" ? "yes" : "no") : null,
    titleReceived,
    container: {
      number: extractLabel("Container number"),
      booking: extractLabel("Booking number"),
      loadingPort: extractLabel("Loading port"),
      destinationPort: extractLabel("Destination port"),
      portArrival,
    },
    etaChisinau,
    stages,
    photos,
    photoCategories,
    source: "w8shipping",
  };

  // cache 10 min
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=60");
  res.json(data);
}
