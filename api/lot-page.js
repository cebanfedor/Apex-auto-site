const fs = require("fs");
const path = require("path");

const AUCTIONS_API_BASE = "https://auctionsapi.com/api";

function safeName(value){
  return value && typeof value === "object" ? value.name || value.title || value.value || "" : String(value || "");
}

function safeNumber(value){
  if(value && typeof value === "object"){
    return safeNumber(value.value || value.amount || value.usd || value.price || value.bid);
  }
  const n = Number(String(value || "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeAuction(value){
  const text = (value && typeof value === "object" ? (value.name || value.title || "") : String(value || "")).toLowerCase();
  if(text.includes("iaai") || text === "1" || value === 1) return "iaai";
  return "copart";
}

function auctionsApiDomain(auction){
  return auction === "iaai" ? "iaai_com" : "copart_com";
}

function imageList(value){
  const sources = [
    value?.images?.normal, value?.images?.big, value?.images,
    value?.photos, value?.photo, value?.image, value?.image_url, value?.thumbnail
  ];
  const list = [];
  for(const s of sources){
    if(Array.isArray(s)) list.push(...s);
    else if(s) list.push(s);
  }
  return list
    .map(item => typeof item === "string" ? item : item?.url || item?.src || "")
    .filter(Boolean)
    .filter((item, i, all) => all.indexOf(item) === i);
}

function extractLotData(source, fallbackAuction){
  const item = source?.data && !Array.isArray(source.data) ? source.data : source;
  const lots = Array.isArray(item?.lots) ? item.lots : [];
  const lot = lots[0] || item?.lot || item;
  const auction = normalizeAuction(item?.auction || lot?.auction || item?.domain || lot?.domain || fallbackAuction);
  const year = safeNumber(item?.year);
  const make = safeName(item?.manufacturer || item?.make || item?.brand);
  const model = safeName(item?.model);
  const title = item?.title || [year, make, model].filter(Boolean).join(" ") || "";
  const odometer = safeNumber(lot?.odometer?.mi || lot?.odometer || item?.odometer || item?.mileage);
  const primaryDamage = safeName(lot?.damage?.main || lot?.primary_damage || item?.primary_damage || item?.damage);
  const location = (() => {
    const loc = lot?.location || item?.location;
    if(!loc) return safeName(lot?.branch || lot?.selling_branch);
    if(typeof loc === "string") return loc;
    const city = safeName(loc.city || loc.name);
    const state = safeName(loc.state || loc.state_code);
    return [city, state].filter(Boolean).join(", ");
  })();
  const images = imageList(lot).length ? imageList(lot) : imageList(item);
  return {title, year, make, model, odometer, damage: primaryDamage, location, images, auction};
}

async function fetchJson(url){
  const key = process.env.AUCTIONS_API_KEY;
  const resp = await fetch(url, {
    headers: key ? {"X-Api-Key": key, "Authorization": `Bearer ${key}`} : {},
    signal: AbortSignal.timeout(8000)
  });
  if(!resp.ok) throw new Error(`API ${resp.status}`);
  return resp.json();
}

function escapeAttr(str){
  return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(str){
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = async function(req, res){
  const slug = String(req.query.slug || "").replace(/[^a-zA-Z0-9_-]/g, "");

  const ogUrl = `https://apexauto.md/auctions/${slug}`;
  let ogTitle = "Аукционы Copart и IAAI — каталог авто из США | Apex Auto";
  let ogDesc = "Каталог авто с аукционов Copart и IAAI: поиск по VIN и лоту, фильтры, фото, страница лота и заявка. Расчёт под ключ до Кишинёва от Apex Auto.";
  let ogImage = "https://apexauto.md/assets/hot/bmw-530e.jpg";

  const match = slug.match(/^(iaai|copart)-(.+)$/i);
  if(match && process.env.AUCTIONS_API_KEY){
    try{
      const auction = match[1].toLowerCase();
      const lotId = match[2];
      const domain = auctionsApiDomain(auction);
      const payload = await fetchJson(`${AUCTIONS_API_BASE}/search-lot/${encodeURIComponent(lotId)}/${domain}?prices_history=1`);
      const lot = extractLotData(payload, auction);

      if(lot.title){
        ogTitle = `${lot.title} | Apex Auto`;
        const parts = [];
        if(lot.odometer) parts.push(`${lot.odometer.toLocaleString("en-US")} mi`);
        if(lot.damage) parts.push(lot.damage);
        if(lot.location) parts.push(lot.location);
        ogDesc = `${lot.title}${parts.length ? ". " + parts.join(" · ") : ""}. Доставка под ключ до Кишинёва от Apex Auto.`;
        if(lot.images && lot.images.length > 0) ogImage = lot.images[0];
      }
    }catch(e){
      // fallback to generic OG tags — page still renders fine client-side
    }
  }

  let html;
  try{
    html = fs.readFileSync(path.join(__dirname, "../auctions.html"), "utf8");
  }catch(e){
    res.status(500).send("auctions.html not found");
    return;
  }

  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(ogTitle)}</title>`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeAttr(ogUrl)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttr(ogTitle)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttr(ogDesc)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeAttr(ogUrl)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeAttr(ogImage)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeAttr(ogTitle)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeAttr(ogDesc)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=300");
  res.status(200).send(html);
};
