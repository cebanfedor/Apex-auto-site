export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { vin, lot } = req.query;
  const query = vin || lot;
  if (!query) return res.status(400).json({ error: "vin or lot required" });

  const paramKey = vin ? "vin" : "lot";
  const url = `https://dc.w8shipping.ua/ru/cargo-tracking?${paramKey}=${encodeURIComponent(query)}`;

  let html;
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ApexAutoTracker/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return res.status(502).json({ error: "W8 fetch failed", status: r.status });
    html = await r.text();
  } catch (e) {
    return res.status(502).json({ error: "W8 unreachable", detail: e.message });
  }

  // Extract all Next.js RSC payload chunks
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html)) !== null) chunks.push(m[1]);
  const rsc = chunks.join("").replace(/\\n/g, "\n").replace(/\\\\/g, "\\").replace(/\\"/g, '"');

  if (!rsc.includes("tracking-results") && !rsc.includes("Car won")) {
    return res.status(404).json({ error: "not_found", message: "Лот или VIN не найден в системе W8" });
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

  const data = {
    vehicle: vehicleDecoded,
    vin: vinCode,
    auction: extractLabel("Auction"),
    city: extractLabel("City"),
    lotNumber: extractLabel("Lot number"),
    keys: rsc.includes('"Yes"') ? "yes" : rsc.includes('"No"') ? "no" : null,
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
