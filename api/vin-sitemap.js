const {list} = require("../server/supabase");
const {transitSlug} = require("../server/slug");

// Динамический сайтмап для VIN-страниц (Федор 05.10.2026): объём растёт каждый день
// (vin_hist копится при каждой проверке VIN по сайту) — статический sitemap.xml для этого
// не годится. Отдельный файл, подключён второй строкой Sitemap: в robots.txt (сам sitemap.xml
// не трогаем). Лимит 5000 — старт консервативный: сначала даём Google переварить пул без риска
// «тонких» страниц, расширять по факту индексации (Search Console Coverage).
const LIMIT = 5000;

module.exports = async function(req, res){
  const urls = [];

  // 1) Аукционные постоянные VIN-страницы /vin/<VIN> из vin_hist.
  try{
    const rows = await list("vin_hist", {select:"vin,checked_at,rounds_n", order:"checked_at.desc", limit:LIMIT});
    (Array.isArray(rows) ? rows : [])
      .filter(r => r.vin && /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(r.vin)) && Number(r.rounds_n) > 0)
      .forEach(r => {
        const lastmod = r.checked_at ? new Date(r.checked_at).toISOString().slice(0, 10) : "";
        urls.push(`<url><loc>https://apexauto.md/vin/${String(r.vin).toUpperCase()}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>monthly</changefreq></url>`);
      });
  }catch(e){ /* best-effort */ }

  // 2) «Авто в пути» (админские объявления, таблица vehicles) — страницы /in-transit/<slug>
  //    индексируемы и содержат VIN+JSON-LD, но их не было НИ в sitemap.xml, НИ в vin_hist
  //    (это не аукционные лоты) → Google их не находил. Добавляем сюда (Федор 09.10.2026:
  //    «почему нашего сайта с VIN в гугле нет?» — для in-transit машины страница была, но
  //    ни в одном сайтмапе). Слуг строим тем же transitSlug, что и каноникал страницы.
  try{
    const veh = await list("vehicles", {
      select: "id,vin,year,make,model,created_at",
      status: "in.(\"Продаётся в пути\",\"Продан в пути\")",
      order: "created_at.desc",
      limit: "200"
    });
    (Array.isArray(veh) ? veh : []).forEach(v => {
      if(!v.id) return;
      const title = [v.year, v.make, v.model].filter(Boolean).join(" ").trim();
      const slug = transitSlug({id: v.id, title, vin: v.vin});
      const lastmod = v.created_at ? new Date(v.created_at).toISOString().slice(0, 10) : "";
      urls.push(`<url><loc>https://apexauto.md/in-transit/${slug}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq></url>`);
    });
  }catch(e){ /* best-effort */ }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
};
