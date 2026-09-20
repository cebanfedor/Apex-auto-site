const fs = require("fs");
const path = require("path");

// SSR-обёртка объявления «Продажа авто в пути»: /in-transit/<id>.
// Зачем: (1) превью ссылки в WhatsApp/Telegram — фото машины, название и цена вместо
// общей картинки сайта; (2) Google видит объявление (заголовок, цена, описание, JSON-LD),
// а не пустой контейнер, который заполняет скрипт. Данные берём через свой
// /api/hot-lots?type=transit (edge-кэш), список вшиваем в HTML — клиент не делает 2-й запрос.
const SSR_FETCH_MS = 4000;

async function fetchItems(req){
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apexauto.md";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SSR_FETCH_MS);
  try{
    const r = await fetch(`${proto}://${host}/api/hot-lots?type=transit`, {headers:{accept:"application/json"}, signal:controller.signal});
    const payload = await r.json().catch(() => null);
    if(!r.ok || !payload || payload.mode === "fallback") return null;   // база не ответила — не знаем
    return Array.isArray(payload.items) ? payload.items : null;
  }catch(e){ return null; }
  finally{ clearTimeout(timer); }
}

function escAttr(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escHtml(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function money(n){ return n ? "$" + Math.round(n).toLocaleString("en-US").replace(/,/g, " ") : ""; }

module.exports = async function(req, res){
  const id = String(req.query.id || "").replace(/[^0-9]/g, "").slice(0, 12);
  let html;
  try{
    html = fs.readFileSync(path.join(__dirname, "../in-transit.html"), "utf8");
  }catch(e){
    res.status(500).send("in-transit.html not found");
    return;
  }

  const items = await fetchItems(req);
  const it = items && id ? items.find(x => String(x.id) === id) : null;
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  // База ответила, а объявления нет (удалено/опечатка) → 404 + noindex; страница покажет список.
  if(items && !it){
    html = html.replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
    res.setHeader("Cache-Control", "public, s-maxage=120, max-age=30");
    res.status(404).send(html);
    return;
  }
  // База не ответила → отдаём страницу как есть (клиент дорисует), но не кэшируем надолго.
  if(!it){
    res.setHeader("Cache-Control", "public, s-maxage=30, max-age=0");
    res.status(200).send(html);
    return;
  }

  const url = `https://apexauto.md/in-transit/${id}`;
  const price = money(it.price);
  const title = `${it.title}${price ? " — " + price : ""} · авто в пути | Apex Auto`;
  const specs = [it.mileage, it.fuel, it.engine, it.damage].filter(Boolean).join(" · ");
  const descSrc = String(it.description || "").replace(/\s+/g, " ").trim();
  const desc = [`${it.title}${price ? " за " + price : ""}${it.sold ? " — продан" : " — едет в Молдову, можно забронировать"}.`, specs, descSrc]
    .filter(Boolean).join(" ").slice(0, 300);
  const image = it.photos && it.photos[0] ? it.photos[0] : "https://apexauto.md/assets/og/hot.png";

  const ld = {
    "@context":"https://schema.org",
    "@type":"Car",
    name:it.title,
    url,
    ...(it.photos && it.photos.length ? {image:it.photos.slice(0, 8)} : {}),
    ...(descSrc ? {description:descSrc.slice(0, 500)} : {}),
    ...(it.make ? {brand:{"@type":"Brand", name:it.make}} : {}),
    ...(it.model ? {model:it.model} : {}),
    ...(it.year ? {vehicleModelDate:String(it.year)} : {}),
    ...(it.vin && it.vin.length === 17 ? {vehicleIdentificationNumber:it.vin} : {}),
    ...(it.fuel ? {fuelType:it.fuel} : {}),
    itemCondition:"https://schema.org/UsedCondition",
    ...(it.price ? {offers:{
      "@type":"Offer", price:String(Math.round(it.price)), priceCurrency:"USD", url,
      availability:it.sold ? "https://schema.org/SoldOut" : "https://schema.org/PreOrder",
      seller:{"@type":"Organization", name:"Apex Auto", url:"https://apexauto.md"}
    }} : {})
  };
  const safeJson = o => JSON.stringify(o).replace(/</g, "\\u003c");

  // Статичное содержимое объявления — для поисковиков и на долю секунды до скрипта.
  const ssrBody = `<a class="transitBackV1" href="/in-transit">← Все авто в пути</a>`
    + `<div class="transitInfoV1"><h1 data-no-i18n="true">${escHtml(it.title)}</h1>`
    + (price ? `<div class="transitPriceBigV1" data-no-i18n="true">${escHtml(price)}</div>` : "")
    + (specs ? `<p data-no-i18n="true">${escHtml(specs)}</p>` : "")
    + (it.photos && it.photos[0] ? `<img src="${escAttr(it.photos[0])}" alt="${escAttr(it.title)}" style="max-width:100%;border-radius:16px">` : "")
    + (descSrc ? `<p data-no-i18n="true" style="white-space:pre-line">${escHtml(it.description)}</p>` : "")
    + `</div>`;

  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escAttr(desc)}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escAttr(url)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escAttr(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escAttr(desc)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escAttr(url)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escAttr(image)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escAttr(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escAttr(desc)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escAttr(image)}">`)
    .replace(`<section id="transitDetailV1" class="transitDetailV1" hidden></section>`,
      `<section id="transitDetailV1" class="transitDetailV1">${ssrBody}</section>`)
    .replace(`<section class="hotHeroV101 transitHeroV1" id="transitHeroV1">`, `<section class="hotHeroV101 transitHeroV1" id="transitHeroV1" hidden>`)
    .replace(`<section id="transitListWrapV1" class="transitListWrapV1">`, `<section id="transitListWrapV1" class="transitListWrapV1" hidden>`)
    .replace("</head>", `<script type="application/ld+json">${safeJson(ld)}</script>\n<script type="application/json" id="ssrTransitV1">${safeJson({items})}</script>\n</head>`);

  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60, stale-while-revalidate=3600");
  res.status(200).send(html);
};
