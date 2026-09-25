const fs = require("fs");
const path = require("path");
const {cleanQuery, isFiltered, describeCatalog} = require("../server/og-catalog");

// /auctions: страница каталога. С фильтрами (?make=…&model=…&fuel=5) — своё превью ссылки: «Ford Fusion — 7 328 лотов на аукционах…»
// и картинка /og/catalog?… (фото первого лота + название + число лотов). Без фильтров — страница как есть.
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function(req, res){
  let html;
  try{ html = fs.readFileSync(path.join(__dirname, "../auctions.html"), "utf8"); }
  catch(e){ res.status(500).send("auctions.html not found"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const p = cleanQuery(req.query);
  if(!isFiltered(p) || req.query.vin || req.query.q){
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60, stale-while-revalidate=3600");
    res.status(200).send(html);
    return;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apexauto.md";
  const origin = `${req.headers["x-forwarded-proto"] || "https"}://${host}`;
  let d = null;
  try{ d = await describeCatalog(origin, p); }catch(e){ d = null; }
  if(!d){ res.setHeader("Cache-Control", "public, s-maxage=60, max-age=0"); res.status(200).send(html); return; }
  const title = `${d.headline}${d.totalTxt ? " — " + d.totalTxt + " на аукционах" : " — каталог аукционов"} | Apex Auto`;
  const desc = `${d.headline}: ${d.totalTxt ? d.totalTxt + " с Copart и IAAI, " : "лоты с Copart и IAAI, "}фото, история продаж по VIN и цена под ключ до Кишинёва. Подбор и доставка от Apex Auto.`;
  const img = `https://apexauto.md/og/catalog?${p.toString()}&v=1`;
  const url = `https://apexauto.md/auctions?${p.toString()}`;
  html = html
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
