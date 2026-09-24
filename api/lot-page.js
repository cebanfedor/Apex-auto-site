const fs = require("fs");
const path = require("path");

// SSR-обёртка страницы лота: OG-теги для шаринга + данные лота, вшитые
// в HTML (window.__ssrLot) — фронт рендерит мгновенно, без второго запроса.
// Данные берём через СВОЙ /api/auctions (общий CDN/Supabase-кеш и полная
// нормализация), а не напрямую из auctionsapi: при прогретом кеше это
// миллисекунды. Ждём не дольше 4с — иначе отдаём HTML без данных, и фронт
// подгрузит их сам, как раньше.
const SSR_FETCH_MS = 4000;

async function fetchOwnDetail(req, auction, lotId){
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apexauto.md";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const url = `${proto}://${host}/api/auctions?action=detail&auction=${encodeURIComponent(auction)}&lot=${encodeURIComponent(lotId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SSR_FETCH_MS);
  try{
    const r = await fetch(url, {headers:{accept:"application/json"}, signal:controller.signal});
    const payload = await r.json().catch(() => null);
    // 404 от своего API = лота нет ни в фиде, ни в архиве (не таймаут и не сбой).
    if(r.status === 404) return {lot:null, notFound:true};
    return {lot:r.ok && payload && payload.ok !== false ? payload.lot : null, notFound:false};
  }finally{ clearTimeout(timer); }
}

function escapeAttr(str){
  return String(str || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeHtml(str){
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

module.exports = async function(req, res){
  const slug = String(req.query.slug || "").replace(/[^a-zA-Z0-9_-]/g, "");

  // Языковые версии для поиска: ?lang=ro|en — свой title/description, <html lang>, каноникал на
  // себя и hreflang-связки. Без этого Google видел только русскую версию (язык переключался
  // скриптом уже в браузере), и румыноязычные запросы шли мимо.
  const langQ = String(req.query.lang || "").toLowerCase();
  const lang = langQ.startsWith("ro") ? "ro" : langQ.startsWith("en") ? "en" : "ru";
  const baseUrl = `https://apexauto.md/auctions/${slug}`;
  const ogUrl = lang === "ru" ? baseUrl : `${baseUrl}?lang=${lang}`;
  const TXT = {
    ru:{t:"Аукционы Copart и IAAI — каталог авто из США | Apex Auto",
        d:"Каталог авто с аукционов Copart и IAAI: поиск по VIN и лоту, фильтры, фото, страница лота и заявка. Расчёт под ключ до Кишинёва от Apex Auto.",
        tail:"Доставка под ключ до Кишинёва от Apex Auto.", lot:"лот"},
    ro:{t:"Licitații Copart și IAAI — catalog auto din SUA | Apex Auto",
        d:"Catalog de mașini de la licitațiile Copart și IAAI: căutare după VIN și lot, filtre, fotografii, pagina lotului și cerere. Calcul la cheie până la Chișinău de la Apex Auto.",
        tail:"Livrare la cheie până la Chișinău de la Apex Auto.", lot:"lot"},
    en:{t:"Copart and IAAI auctions — cars from the USA | Apex Auto",
        d:"Catalog of cars from Copart and IAAI auctions: search by VIN and lot, filters, photos, lot page and request. Turnkey estimate to Chișinău by Apex Auto.",
        tail:"Turnkey delivery to Chișinău by Apex Auto.", lot:"lot"}
  }[lang];
  let ogTitle = TXT.t;
  let ogDesc = TXT.d;
  let ogImage = "https://apexauto.md/assets/hot/bmw-530e.jpg";

  const match = slug.match(/^(iaai|copart)-(.+)$/i);
  let lot = null;
  let notFound = false;
  let debugError = null;
  if(match){
    try{
      const got = await fetchOwnDetail(req, match[1].toLowerCase(), match[2]);
      lot = got.lot; notFound = got.notFound;
      if(lot && lot.title){
        const title = [lot.year, lot.make, lot.model].filter(Boolean).join(" ") || lot.title;
        ogTitle = `${title} — ${match[1].toUpperCase()} ${TXT.lot} ${match[2]} | Apex Auto`;
        const parts = [];
        if(lot.odometerText) parts.push(lot.odometerText);
        if(lot.primaryDamage && lang !== "ro") parts.push(lot.primaryDamage);
        if(lot.location) parts.push(lot.location);
        ogDesc = `${title}${parts.length ? ". " + parts.join(" · ") : ""}. ${TXT.tail}`;
        if(lot.image) ogImage = lot.image;
      }
    }catch(e){
      debugError = e.message;
    }
  }else{
    debugError = "slug did not match";
    notFound = true;
  }

  if(req.query.debug === "1"){
    const {isAuthenticated} = require("../server/auth");
    if(!isAuthenticated(req)){
      res.status(401).json({ok:false,error:"Unauthorized"});
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({slug, match:!!match, hasLot:!!lot, ogTitle, ogImage, error:debugError}));
    return;
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
    .replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeAttr(ogUrl)}">\n  <link rel="alternate" hreflang="ru" href="${escapeAttr(baseUrl)}">\n  <link rel="alternate" hreflang="ro" href="${escapeAttr(baseUrl)}?lang=ro">\n  <link rel="alternate" hreflang="en" href="${escapeAttr(baseUrl)}?lang=en">\n  <link rel="alternate" hreflang="x-default" href="${escapeAttr(baseUrl)}">`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeAttr(ogDesc)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeAttr(ogTitle)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeAttr(ogDesc)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escapeAttr(ogUrl)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeAttr(ogImage)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escapeAttr(ogTitle)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escapeAttr(ogDesc)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`);

  // Вшиваем нормализованный лот: фронт рендерит без второго запроса к API.
  // </script> внутри JSON экранируем, чтобы не разорвать тег.
  if(lot){
    const json = JSON.stringify(lot).replace(/</g, "\\u003c");
    // type=application/json — блок данных, а не исполняемый скрипт: его не режет CSP
    // (инлайн <script>window.__ssrLot=…</script> блокировался — хеш у него каждый раз новый,
    // и SSR-ускорение молча не работало). Клиент читает #ssrLotV1.
    html = html.replace("</head>", `<script type="application/json" id="ssrLotV1">${json}</script>\n</head>`);
  }

  // Лота не существует → честный 404 + noindex. Раньше отдавали 200 с общей страницей
  // каталога и каноникалом на себя — Google копил это как «soft 404» и дубли.
  if(notFound && !lot){
    html = html.replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(404).send(html);
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // История по VIN не загрузилась → страницу в CDN почти не держим (клиент к тому же сам перезапросит лот)
  res.setHeader("Cache-Control", lot && lot.vinChecked === false ? "public, s-maxage=20, max-age=0" : "public, s-maxage=900, max-age=120, stale-while-revalidate=3600");
  res.status(200).send(html);
};
