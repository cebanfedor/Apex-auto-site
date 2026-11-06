// Серверная обёртка страницы машины из каталогов Кореи и Канады (/korea/<…>, /canada/<…>; rewrites в vercel.json).
// Зачем: шаблон catalog-car.html / canada-car.html рисуется скриптом в браузере, а Telegram/WhatsApp/Facebook
// JS не выполняют — без серверных og:* ссылка уходила вообще без превью (Федор 06.11.2026).
// Делаем как у лотов США (api/lot-page.js): заголовок, описание, картинка-карточка /og/cat/<src>/<id>,
// и 301 на ссылку с названием и VIN (server/slug.js catSlug), если пришли по голому id или устаревшему названию.
const fs = require("fs");
const path = require("path");
const {catSlug, parseCatSlug} = require("../server/slug");
const ogc = require("../server/og-catcar");

const escAttr = s => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escHtml = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function template(src){
  // пути — литералы, чтобы сборщик Vercel положил оба файла в функцию
  try{ return src === "ca" ? fs.readFileSync(path.join(__dirname, "../canada-car.html"), "utf8") : fs.readFileSync(path.join(__dirname, "../catalog-car.html"), "utf8"); }
  catch(e){ return null; }
}

module.exports = async function(req, res){
  const src = String(req.query.src || "") === "ca" ? "ca" : "kr";
  const BASE = src === "ca" ? "/canada" : "/korea";
  const slug = String(req.query.slug || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200);
  const id = parseCatSlug(slug);
  const langQ = String(req.query.lang || "").toLowerCase();
  const lang = langQ.startsWith("ro") ? "ro" : langQ.startsWith("en") ? "en" : "ru";

  // остальные параметры адреса (?listing=, ?lang=, старые ?domain_id=&listing_id=) сохраняем
  const rest = new URLSearchParams();
  for(const [k, v] of Object.entries(req.query || {})) if(k !== "slug" && k !== "src" && v != null) rest.set(k, Array.isArray(v) ? v[0] : String(v));
  const qs = rest.toString() ? "?" + rest.toString() : "";

  const {car, notFound} = await ogc.fetchCar(src, id);

  if(car){
    const pretty = catSlug(car);
    if(pretty && pretty !== slug){
      res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=300");
      res.setHeader("Location", `${BASE}/${pretty}${qs}`);
      res.status(301).end();
      return;
    }
  }

  let html = template(src);
  if(!html){ res.status(500).send("template not found"); return; }

  if(car){
    let s = null;
    try{ s = await ogc.summary(src, car, lang); }catch(e){ s = null; }
    if(s){
      const pageUrl = `https://apexauto.md${BASE}/${slug}${lang === "ru" ? "" : `?lang=${lang}`}`;
      const t = `${s.title} — ${s.page} | Apex Auto`;
      const img = `https://apexauto.md/og/cat/${src}/${encodeURIComponent(car.id)}?v=1${lang === "ru" ? "" : "&lang=" + lang}`;
      const meta = [
        `<meta name="description" content="${escAttr(s.desc)}">`,
        `<link rel="canonical" href="${escAttr(pageUrl)}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="Apex Auto">`,
        `<meta property="og:title" content="${escAttr(t)}">`,
        `<meta property="og:description" content="${escAttr(s.desc)}">`,
        `<meta property="og:url" content="${escAttr(pageUrl)}">`,
        `<meta property="og:image" content="${escAttr(img)}">`,
        `<meta property="og:image:width" content="1200">`,
        `<meta property="og:image:height" content="630">`,
        `<meta property="og:image:type" content="image/png">`,
        `<meta property="og:image:alt" content="${escAttr(s.title)}">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${escAttr(t)}">`,
        `<meta name="twitter:description" content="${escAttr(s.desc)}">`,
        `<meta name="twitter:image" content="${escAttr(img)}">`
      ].join("\n  ");
      html = html
        .replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`)
        .replace(/<title([^>]*)>[^<]*<\/title>/, (m, a) => `<title${a}>${escHtml(t)}</title>\n  ${meta}`);
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if(notFound && !car){
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(404).send(html);
    return;
  }
  // машина не успела загрузиться (таймаут) — страница всё равно работает, но в CDN её почти не держим
  res.setHeader("Cache-Control", car ? "public, s-maxage=900, max-age=120, stale-while-revalidate=3600" : "public, s-maxage=30, max-age=0");
  res.status(200).send(html);
};
