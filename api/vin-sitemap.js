const {list} = require("../server/supabase");

// Динамический сайтмап для /vin/<VIN> (Федор 05.10.2026): страницы постоянные, объём растёт
// каждый день (vin_hist копится при каждой проверке VIN по сайту) — статический sitemap.xml
// для этого не годится. Отдельный файл, подключён второй строкой Sitemap: в robots.txt (сам
// sitemap.xml не трогаем). Лимит 5000 — старт консервативный: сначала даём Google переварить
// пул без риска «тонких» страниц, расширять по факту индексации (Search Console Coverage).
const LIMIT = 5000;

module.exports = async function(req, res){
  let rows = [];
  try{
    rows = await list("vin_hist", {select:"vin,checked_at,rounds_n", order:"checked_at.desc", limit:LIMIT});
  }catch(e){
    rows = [];
  }
  const urls = (Array.isArray(rows) ? rows : [])
    .filter(r => r.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(r.vin)) && Number(r.rounds_n) > 0)
    .map(r => {
      const lastmod = r.checked_at ? new Date(r.checked_at).toISOString().slice(0, 10) : "";
      return `<url><loc>https://apexauto.md/vin/${String(r.vin).toUpperCase()}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>monthly</changefreq></url>`;
    });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
};
