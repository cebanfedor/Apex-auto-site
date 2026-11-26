const {MODELS} = require("../server/model-index");

// Карта сайта страниц /models/<slug> (50 самых массовых моделей каталога) + хаб /models, с hreflang ru/ro/en.
const BASE = "https://apexauto.md";
module.exports = function(req, res){
  const day = new Date().toISOString().slice(0, 10);
  const url = path => `  <url>
    <loc>${BASE}${path}</loc>
    <xhtml:link rel="alternate" hreflang="ru" href="${BASE}${path}"/>
    <xhtml:link rel="alternate" hreflang="ro" href="${BASE}${path}?lang=ro"/>
    <xhtml:link rel="alternate" hreflang="en" href="${BASE}${path}?lang=en"/>
    <lastmod>${day}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${path === "/models" ? "0.7" : "0.6"}</priority>
  </url>`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[url("/models"), ...MODELS.map(m => url(`/models/${m.slug}`))].join("\n")}\n</urlset>\n`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
  res.status(200).send(body);
};
