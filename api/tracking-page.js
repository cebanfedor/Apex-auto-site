const fs = require("fs");
const path = require("path");
const {describeTrack} = require("../server/og-track");

// /tracking: страница-обёртка. С ?vin=… (или ?lot=…) подставляем в превью ссылки машину и статус доставки:
// «2020 Tesla Model 3 — Морская перевозка», а в картинке — фото, прогресс этапов и дата выдачи (/og/track/<VIN>).
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function fetchTrack(req, param, value){
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apexauto.md";
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 5000);
  try{
    const r = await fetch(`${req.headers["x-forwarded-proto"] || "https"}://${host}/api/w8-tracking?${param}=${encodeURIComponent(value)}`, {signal:ctrl.signal, headers:{accept:"application/json"}});
    return r.ok ? await r.json().catch(() => null) : null;
  }catch(e){ return null; }
  finally{ clearTimeout(timer); }
}

module.exports = async function(req, res){
  let html;
  try{ html = fs.readFileSync(path.join(__dirname, "../tracking.html"), "utf8"); }
  catch(e){ res.status(500).send("tracking.html not found"); return; }
  const vinQ = String(req.query.vin || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lotQ = String(req.query.lot || "").trim().replace(/[^0-9]/g, "");
  let t = null;
  if(/^[A-HJ-NPR-Z0-9]{17}$/.test(vinQ)) t = describeTrack(await fetchTrack(req, "vin", vinQ));
  else if(lotQ.length >= 5 && lotQ.length <= 12) t = describeTrack(await fetchTrack(req, "lot", lotQ));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if(!t || !/^[A-HJ-NPR-Z0-9]{17}$/.test(t.vin)){
    res.setHeader("Cache-Control", "public, s-maxage=600, max-age=60, stale-while-revalidate=3600");
    res.status(200).send(html);
    return;
  }
  const name = t.vehicle || "Ваш автомобиль";
  const title = `${name} — ${t.statusLabel} | Отслеживание Apex Auto`;
  const desc = [`VIN ${t.vin}.`, `Статус: ${t.statusLabel}.`, t.total ? `Этап ${Math.min(t.done, t.total)} из ${t.total}.` : "", t.eta ? t.eta + "." : "", "Отслеживание доставки авто из США и Канады в Молдову — Apex Auto."].filter(Boolean).join(" ");
  const img = `https://apexauto.md/og/track/${t.vin}?v=1`;
  const url = `https://apexauto.md/tracking?vin=${t.vin}`;
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(img)}">\n  <meta property="og:image:type" content="image/png">\n  <meta property="og:image:alt" content="${esc(name + " — " + t.statusLabel)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(desc)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(img)}">`)
    .replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
  res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60, stale-while-revalidate=1800");
  res.status(200).send(html);
};
