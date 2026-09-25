// Картинки для превью ссылок: /og/lot/<id>, /og/transit/<id>, /og/track/<vin> (rewrites в vercel.json). 1200×630 PNG.
// Любая ошибка → брендовая картинка (а не 500): скрейперы Telegram/WhatsApp не должны остаться без превью.
const og = require("../server/og-card");
const ogLot = require("../server/og-lot");
const ogCatalog = require("../server/og-catalog");

const {describeTrack} = require("../server/og-track");

function origin(req){
  const host = req.headers["x-forwarded-host"] || req.headers.host || "apexauto.md";
  return `${req.headers["x-forwarded-proto"] || "https"}://${host}`;
}
async function getJson(url, ms = 7000){
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), ms);
  try{ const r = await fetch(url, {signal:ctrl.signal, headers:{accept:"application/json"}}); return r.ok ? await r.json().catch(() => null) : null; }
  catch(e){ return null; }
  finally{ clearTimeout(timer); }
}
const langOf = req => /^ro/i.test(String(req.query.lang || "")) ? "ro" : /^en/i.test(String(req.query.lang || "")) ? "en" : "ru";
async function buildLot(req, id){
  const m = String(id).match(/^(copart|iaai)-(\d{5,12})/i); if(!m) return null;
  const j = await getJson(`${origin(req)}/api/auctions?action=detail&auction=${m[1].toLowerCase()}&lot=${m[2]}`);
  const lot = j && j.ok !== false && j.lot; if(!lot) return null;
  return og.lotCard(ogLot.cardData(lot, langOf(req)));
}
async function buildTransit(req, id){
  const lang = langOf(req);
  const j = await getJson(`${origin(req)}/api/hot-lots?type=transit`);
  const it = j && Array.isArray(j.items) && j.items.find(x => String(x.id) === String(id)); if(!it) return null;
  const W = {ru:{sold:"Продан", price:"Цена", tag:"В пути в Молдову", book:"Можно забронировать", footer:"apexauto.md · доставка авто из США и Канады под ключ"},
    ro:{sold:"Vândut", price:"Preț", tag:"În drum spre Moldova", book:"Se poate rezerva", footer:"apexauto.md · livrare auto din SUA și Canada la cheie"},
    en:{sold:"Sold", price:"Price", tag:"On the way to Moldova", book:"Available to reserve", footer:"apexauto.md · turnkey car delivery from the USA and Canada"}}[lang];
  return og.lotCard({title:it.title, auction:"", image:it.photos && it.photos[0], price:og.money(it.price), priceLabel: it.sold ? W.sold : W.price, tag: it.sold ? W.sold : W.tag, tagBg: it.sold ? "#6b7280" : "#1c9c5b",
    chips:[it.mileage, it.fuel, it.engine].filter(Boolean), date: it.sold ? "" : W.book, footer:W.footer});
}
async function buildTrack(req, vin){
  if(!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return null;
  const t = describeTrack(await getJson(`${origin(req)}/api/w8-tracking?vin=${encodeURIComponent(vin)}`), langOf(req) === "ru" ? "" : langOf(req));
  if(!t) return null;
  return og.trackCard({vehicle:t.vehicle, fallbackName:t.fallback, label:t.label, footer:t.footer, vin:t.vin || String(vin).toUpperCase(), statusLabel:t.statusLabel, delivered:t.delivered, stages:t.stages, sub:t.eta, image:t.image});
}

async function buildCatalog(req){
  const p = ogCatalog.cleanQuery(req.query);
  const lang = langOf(req); const d = await ogCatalog.describeCatalog(origin(req), p, lang);
  if(!d) return null;
  const uri = d.image ? await og.fetchImage(og.bigPhoto(d.image)) : null;
  const sub = [d.totalTxt, ...d.chips].filter(Boolean).join(" · ") || d.X.sub;
  return og.pageCard({kicker:d.X.kicker, title:d.names, sub, path:"apexauto.md/auctions" + (lang === "ru" ? "" : `?lang=${lang}`), image:uri});
}

module.exports = async function(req, res){
  const type = String(req.query.type || ""), id = String(req.query.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  let png = null, ttl = "public, max-age=300, s-maxage=1800, stale-while-revalidate=86400";
  try{
    if(type === "lot") png = await buildLot(req, id);
    else if(type === "transit") png = await buildTransit(req, id);
    else if(type === "catalog"){ png = await buildCatalog(req); }
    else if(type === "track"){ png = await buildTrack(req, id); ttl = "public, max-age=120, s-maxage=600, stale-while-revalidate=3600"; }
  }catch(e){ png = null; }
  if(!png){
    ttl = "public, max-age=60, s-maxage=120";
    try{ png = await og.brandCard(type === "track" ? "Отслеживание автомобиля" : "Авто из США и Канады под ключ в Молдову", type === "track" ? "Статус доставки по VIN" : "Каталог аукционов Copart и IAAI"); }
    catch(e){ res.status(500).send("og error"); return; }
  }
  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", ttl);
  res.status(200).send(png);
};
