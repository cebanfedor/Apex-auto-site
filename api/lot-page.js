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
    return r.ok && payload && payload.ok !== false ? payload.lot : null;
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

  const ogUrl = `https://apexauto.md/auctions/${slug}`;
  let ogTitle = "Аукционы Copart и IAAI — каталог авто из США | Apex Auto";
  let ogDesc = "Каталог авто с аукционов Copart и IAAI: поиск по VIN и лоту, фильтры, фото, страница лота и заявка. Расчёт под ключ до Кишинёва от Apex Auto.";
  let ogImage = "https://apexauto.md/assets/hot/bmw-530e.jpg";

  const match = slug.match(/^(iaai|copart)-(.+)$/i);
  let lot = null;
  let debugError = null;
  if(match){
    try{
      lot = await fetchOwnDetail(req, match[1].toLowerCase(), match[2]);
      if(lot && lot.title){
        const title = [lot.year, lot.make, lot.model].filter(Boolean).join(" ") || lot.title;
        ogTitle = `${title} | Apex Auto`;
        const parts = [];
        if(lot.odometerText) parts.push(lot.odometerText);
        if(lot.primaryDamage) parts.push(lot.primaryDamage);
        if(lot.location) parts.push(lot.location);
        ogDesc = `${title}${parts.length ? ". " + parts.join(" · ") : ""}. Доставка под ключ до Кишинёва от Apex Auto.`;
        if(lot.image) ogImage = lot.image;
      }
    }catch(e){
      debugError = e.message;
    }
  }else{
    debugError = "slug did not match";
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
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeAttr(ogUrl)}">`)
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
    html = html.replace("</head>", `<script>window.__ssrLot=${json};</script>\n</head>`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=900, max-age=120, stale-while-revalidate=3600");
  res.status(200).send(html);
};
