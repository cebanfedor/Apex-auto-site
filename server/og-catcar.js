// Превью ссылок на машину из каталогов Кореи (/korea/<…>) и Канады (/canada/<…>): данные машины, цена в $, тексты RU/RO/EN.
// Используется серверной страницей api/catalog-car-page.js (title/description/og:*) и картинкой /og/cat/<src>/<id> (api/og.js).
// Канада: источник (OpenLane) клиентам не называем — ни в тексте, ни в картинке.
const cat = require("./catalog-api");

const TX = {
  ru:{from:{kr:"из Кореи", ca:"из Канады"}, tag:{kr:"Корея", ca:"Канада"}, km:"км", vin:"VIN",
      bid:"Текущая ставка", start:"Стартовая ставка", price:"Цена", avg:"Средняя цена продаж", priceWord:"Цена",
      tail:"Доставка под ключ в Молдову — Apex Auto.", page:{kr:"Авто из Кореи", ca:"Авто из Канады"},
      fuel:{1:"дизель", 2:"электро", 3:"гибрид", 4:"бензин", 5:"газ", 7:"водород"}, trans:{1:"автомат", 2:"механика"}, mileage:"пробег"},
  ro:{from:{kr:"din Coreea", ca:"din Canada"}, tag:{kr:"Coreea", ca:"Canada"}, km:"km", vin:"VIN",
      bid:"Oferta curentă", start:"Oferta de pornire", price:"Preț", avg:"Preț mediu de vânzare", priceWord:"Preț",
      tail:"Livrare la cheie în Moldova — Apex Auto.", page:{kr:"Mașini din Coreea", ca:"Mașini din Canada"},
      fuel:{1:"diesel", 2:"electric", 3:"hibrid", 4:"benzină", 5:"gaz", 7:"hidrogen"}, trans:{1:"automată", 2:"manuală"}, mileage:"rulaj"},
  en:{from:{kr:"from Korea", ca:"from Canada"}, tag:{kr:"Korea", ca:"Canada"}, km:"km", vin:"VIN",
      bid:"Current bid", start:"Starting bid", price:"Price", avg:"Average sale price", priceWord:"Price",
      tail:"Turnkey delivery to Moldova — Apex Auto.", page:{kr:"Cars from Korea", ca:"Cars from Canada"},
      fuel:{1:"diesel", 2:"electric", 3:"hybrid", 4:"petrol", 5:"LPG", 7:"hydrogen"}, trans:{1:"automatic", 2:"manual"}, mileage:"mileage"}
};
const langOf = l => (l === "ro" || l === "en") ? l : "ru";
const num = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

async function fetchCar(src, id, ms = 5000){
  if(!id) return {car:null, notFound:false};
  try{
    const data = await Promise.race([
      cat.catalogFetch(`/cars/${encodeURIComponent(id)}`, "lang=en", {src, timeoutMs:ms, retries:0}),
      new Promise(res => setTimeout(() => res("__timeout"), ms + 500))
    ]);
    if(data === "__timeout") return {car:null, notFound:false};
    const car = data && (data.data || data);
    return {car:car && car.id ? car : null, notFound:false};
  }catch(e){
    return {car:null, notFound:!!(e && (e.kind === "not_found" || e.status === 404))};
  }
}
function defaultListing(car){
  const ls = Array.isArray(car && car.listings) ? car.listings : [];
  return ls.filter(l => !l.archived)[0] || ls[0] || null;
}
// Та же логика цены, что listingPrice в catalog-car.js
function priceOf(listing, src){
  if(!listing) return null;
  const cur = (listing.price && listing.price.currency && listing.price.currency.name) || (src === "ca" ? "cad" : "krw");
  if(src === "ca"){
    const sd = listing.source_data || {}, oa = sd.openlane_auction || {}, mv = oa.market_value || {};
    const st = Number(sd.starting_bid || oa.start_price || 0);
    if(Number(listing.current_bid) > 0 && Number(listing.current_bid) !== st) return {amount:Number(listing.current_bid), cur, kind:"bid"};
    if(st >= 500) return {amount:st, cur, kind:"start"};
    if(listing.price && listing.price.price > 0) return {amount:listing.price.price, cur, kind:"price"};
    if(Number(mv.average_price) > 0) return {amount:Math.round(mv.average_price), cur:"cad", kind:"avg"};
    return null;
  }
  if(listing.is_auction && Number(listing.current_bid) > 0) return {amount:Number(listing.current_bid), cur, kind:"bid"};
  if(listing.price && listing.price.price > 0) return {amount:listing.price.price, cur, kind:"price"};
  return null;
}
function toUsd(p, rates){
  if(!p) return null;
  const c = String(p.cur || "").toLowerCase();
  if(c === "usd") return p.amount;
  if(c === "krw" && rates && rates.usdKrw) return p.amount / rates.usdKrw;
  if(c === "cad" && rates && rates.usdCad) return p.amount / rates.usdCad;
  if(c === "eur" && rates && rates.usdEur) return p.amount / rates.usdEur;
  return null;
}
async function getRatesSafe(){
  try{ const g = require("../api/catalog").getRates; return g ? await Promise.race([g(), new Promise(res => setTimeout(() => res(null), 4000))]) : null; }catch(e){ return null; }
}
// Всё, что нужно для превью
async function summary(src, car, lang){
  const L = TX[langOf(lang)];
  const listing = defaultListing(car);
  const title = [car.year, car.brand && car.brand.name, car.model && car.model.name].filter(Boolean).join(" ") || "Auto";
  const vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(car.vin || "")) ? String(car.vin).toUpperCase() : "";
  const km = listing && Number(listing.odometer) > 0 ? num(listing.odometer) + " " + L.km : "";
  const fuel = car.fuel && L.fuel[car.fuel.id] || "";
  const trans = car.transmission && L.trans[car.transmission.id] || "";
  const p = priceOf(listing, src);
  const rates = p ? await getRatesSafe() : null;
  const usd = toUsd(p, rates);
  const priceTxt = usd ? "$" + num(usd) : (p ? num(p.amount) + " " + String(p.cur).toUpperCase() : "");
  const priceLabel = p ? ({bid:L.bid, start:L.start, price:L.price, avg:L.avg})[p.kind] : "";
  const imgs = listing && Array.isArray(listing.images) ? listing.images : [];
  const img = imgs[0] ? (imgs[0].original || imgs[0].preview || imgs[0].downloaded || "") : "";
  const facts = [km && L.mileage + " " + km, fuel, trans].filter(Boolean).join(", ");
  const desc = `${title} ${L.from[src]}` + (facts ? `: ${facts}.` : ".") + (vin ? ` ${L.vin} ${vin}.` : "") +
    (priceTxt ? ` ${priceLabel || L.priceWord}: ${usd ? "≈ " : ""}${priceTxt}.` : "") + " " + L.tail;
  return {title, vin, km, fuel, trans, price:priceTxt, priceLabel, image:img, desc, tag:L.tag[src], page:L.page[src], from:L.from[src]};
}
module.exports = {fetchCar, summary, defaultListing, priceOf};
