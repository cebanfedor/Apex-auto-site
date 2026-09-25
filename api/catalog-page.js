const fs = require("fs");
const path = require("path");
const {cleanQuery, isFiltered, describeCatalog} = require("../server/og-catalog");
const {PAGES} = require("../server/og-pages");

// /auctions: страница каталога. С фильтрами (?make=…&model=…&fuel=5) — своё превью ссылки: «Ford Fusion — 7 328 лотов на аукционах…»
// и картинка /og/catalog?… (фото первого лота + название + число лотов). Без фильтров — страница как есть.
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function(req, res){
  let html;
  try{ html = fs.readFileSync(path.join(__dirname, "../auctions.html"), "utf8"); }
  catch(e){ res.status(500).send("auctions.html not found"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const p = cleanQuery(req.query);
  const lang = /^ro/i.test(String(req.query.lang || "")) ? "ro" : /^en/i.test(String(req.query.lang || "")) ? "en" : "ru";
  const suffix = lang === "ru" ? "" : `lang=${lang}`;
  // Каталог без фильтров, но на RO/EN — готовые тексты страницы
  if(lang !== "ru" && (!isFiltered(p) || req.query.vin || req.query.q)){
    const tr = PAGES.auctions[lang], url = `https://apexauto.md/auctions?lang=${lang}`, img = `https://apexauto.md/assets/og/auctions-${lang}.png?v=4`;
    html = html.replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`).replace(/<title>[^<]*<\/title>/, `<title>${esc(tr.t)}</title>`)
      .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(tr.d)}">`)
      .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(tr.t)}">`).replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(tr.d)}">`)
      .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}">`).replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(img)}">`)
      .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(tr.t)}">`).replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(tr.d)}">`)
      .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(img)}">`);
    res.setHeader("Cache-Control", "public, s-maxage=1800, max-age=60, stale-while-revalidate=86400");
    res.status(200).send(html);
    return;
  }
  if(!isFiltered(p) || req.query.vin || req.query.q){
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60, stale-while-revalidate=3600");
    res.status(200).send(html);
    return;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apexauto.md";
  const origin = `${req.headers["x-forwarded-proto"] || "https"}://${host}`;
  let d = null;
  try{ d = await describeCatalog(origin, p, lang); }catch(e){ d = null; }
  if(!d){ res.setHeader("Cache-Control", "public, s-maxage=60, max-age=0"); res.status(200).send(html); return; }
  const X = d.X;
  const title = `${d.headline}${d.totalTxt ? " — " + d.totalTxt + " " + X.onAuctions : " — " + X.auctionsCatalog} | Apex Auto`;
  const desc = `${d.headline}: ${d.totalTxt ? d.totalTxt + " " + X.descWith + ", " : X.descNo + ", "}${X.descTail}`;
  const img = `https://apexauto.md/og/catalog?${p.toString()}${suffix ? "&" + suffix : ""}&v=1`;
  const url = `https://apexauto.md/auctions?${p.toString()}${suffix ? "&" + suffix : ""}`;
  html = html
    .replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(img)}">`)
    .replace(/<meta property="og:image:type"[^>]*>/, `<meta property="og:image:type" content="image/png">\n  <meta property="og:image:alt" content="${esc(d.headline)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(desc)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(img)}">`);
  res.setHeader("Cache-Control", "public, s-maxage=600, max-age=60, stale-while-revalidate=3600");
  res.status(200).send(html);
};
