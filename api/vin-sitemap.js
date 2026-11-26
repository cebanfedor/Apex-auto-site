const {list} = require("../server/supabase");
const {transitSlug} = require("../server/slug");

// Карты сайта страниц /vin/<VIN> (SEO по VIN, Федор 05.10 и 26.11.2026: «хочу попадать в Google по VIN»).
//   /sitemap-vin.xml                  — ИНДЕКС: дни торгов (сегодня+7 … сегодня−14) + «transit»
//   /sitemap-vin/YYYY-MM-DD.xml       — VIN лотов, у которых торги в этот день: ещё не сыгравшие (idut/будущие) и проданные с ценой (2016+, популярные марки)
//   /sitemap-vin/transit.xml          — VIN, уже накопленные в vin_hist + объявления «Авто в пути»
// Только наша база (api_lots), без запросов к провайдеру. Результат — кэш CDN на 6 ч.
const POP_MAKES = [16, 88, 9, 147, 110, 94, 140, 76, 56, 85, 132, 99, 187];   // BMW Mercedes Audi VW Porsche MINI Toyota Lexus Honda Mazda Subaru Nissan Tesla
const MIN_YEAR = 2016, PAGE = 1000, MAX_PAGES = 10;   // до 10 тыс. VIN на день
const BASE = "https://apexauto.md";
const isVin = v => /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(v || ""));
const xml = body => `<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`;
const ymd = t => new Date(t).toISOString().slice(0, 10);

function send(res, status, body, maxAge){
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", maxAge ? `public, s-maxage=${maxAge}, stale-while-revalidate=86400` : "no-store");
  res.status(status).send(body);
}

async function dayUrls(day){
  const from = `${day}T00:00:00Z`, to = ymd(Date.parse(from) + 86400e3) + "T00:00:00Z";
  const seen = new Set(), urls = [];
  for(let p = 0; p < MAX_PAGES; p++){
    const rows = await list("api_lots", {
      select:"vin,synced_at",
      and:`(sale_date.gte.${from},sale_date.lt.${to})`,
      vin:"not.is.null",
      year:`gte.${MIN_YEAR}`,
      make_id:`in.(${POP_MAKES.join(",")})`,
      or:"(archived.eq.false,and(status_id.eq.6,final_bid.gt.0))",
      order:"sale_date.asc,id.asc",
      limit:String(PAGE), offset:String(p * PAGE)
    });
    const arr = Array.isArray(rows) ? rows : [];
    for(const r of arr){
      const v = String(r.vin || "").toUpperCase();
      if(!isVin(v) || seen.has(v)) continue;
      seen.add(v);
      urls.push(`<url><loc>${BASE}/vin/${v}</loc><lastmod>${r.synced_at ? ymd(r.synced_at) : day}</lastmod></url>`);
    }
    if(arr.length < PAGE) break;
  }
  return urls;
}

async function transitUrls(){
  const urls = [];
  try{
    const rows = await list("vin_hist", {select:"vin,checked_at,rounds_n", order:"checked_at.desc", limit:"1000"});
    (Array.isArray(rows) ? rows : []).filter(r => isVin(r.vin) && Number(r.rounds_n) > 0).forEach(r => {
      urls.push(`<url><loc>${BASE}/vin/${String(r.vin).toUpperCase()}</loc>${r.checked_at ? `<lastmod>${ymd(r.checked_at)}</lastmod>` : ""}</url>`);
    });
  }catch(e){ /* best-effort */ }
  try{
    const veh = await list("vehicles", {select:"id,vin,year,make,model,created_at", status:"in.(\"Продаётся в пути\",\"Продан в пути\")", order:"created_at.desc", limit:"200"});
    (Array.isArray(veh) ? veh : []).forEach(v => {
      if(!v.id) return;
      const title = [v.year, v.make, v.model].filter(Boolean).join(" ").trim();
      urls.push(`<url><loc>${BASE}/in-transit/${transitSlug({id:v.id, title, vin:v.vin})}</loc>${v.created_at ? `<lastmod>${ymd(v.created_at)}</lastmod>` : ""}</url>`);
    });
  }catch(e){ /* best-effort */ }
  return urls;
}

module.exports = async function(req, res){
  const part = String((req.query && req.query.day) || "");
  try{
    if(part === "transit"){
      return send(res, 200, xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${(await transitUrls()).join("\n")}\n</urlset>`), 3600);
    }
    if(/^\d{4}-\d{2}-\d{2}$/.test(part)){
      const t = Date.parse(part + "T00:00:00Z"), now = Date.now();
      if(!Number.isFinite(t) || t > now + 8 * 86400e3 || t < now - 40 * 86400e3) return send(res, 404, xml("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>"), 3600);
      const urls = await dayUrls(part);
      const past = t < now - 2 * 86400e3;
      return send(res, 200, xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`), past ? 43200 : 7200);
    }
    // индекс
    const today = Date.parse(ymd(Date.now()) + "T00:00:00Z");
    const items = [`<sitemap><loc>${BASE}/sitemap-vin/transit.xml</loc><lastmod>${ymd(Date.now())}</lastmod></sitemap>`];
    for(let d = 7; d >= -14; d--){
      const day = ymd(today + d * 86400e3);
      items.push(`<sitemap><loc>${BASE}/sitemap-vin/${day}.xml</loc><lastmod>${d >= -1 ? ymd(Date.now()) : day}</lastmod></sitemap>`);
    }
    return send(res, 200, xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join("\n")}\n</sitemapindex>`), 3600);
  }catch(e){
    return send(res, 503, xml("<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"></urlset>"), 0);
  }
};
