// JSON-LD для страницы лота (schema.org Car + Offer). Страницы лотов — самый массовый
// класс страниц сайта; раньше они шли БЕЗ structured data. Это даёт и SEO (понимание
// сущности «автомобиль» поисковиком), и особенно AEO (ChatGPT/Perplexity/Gemini извлекают
// факты: марка/модель/год/пробег/VIN/топливо/привод/цена/состояние/продавец).
// ⚠️ Только факты из фида — ничего не выдумываем. Цена = то, что показано пользователю.
const {isCanada} = require("./og-lot");

const q = v => (v == null || v === "" ? undefined : v);

function fuelText(lot){
  const k = Number(lot.fuelKind);
  if(k === 2) return "Electric";
  if(k === 3) return "Hybrid electric";
  if(k === 5) return "Plug-in hybrid";
  const f = String(lot.fuel || "").toLowerCase();
  if(/diesel|дизель/.test(f)) return "Diesel";
  if(/electr|электро/.test(f)) return "Electric";
  if(/hybrid|гибрид/.test(f)) return "Hybrid electric";
  return f ? "Gasoline" : undefined;
}

function lotJsonLd(lot, opts = {}){
  const {url, description} = opts;
  const year = Number(lot.year) || 0;
  const miles = Number(lot.odometer) || 0;
  const ca = isCanada(lot);
  const ts = Date.parse(lot.auctionDate || "");
  const sold = Number(lot.statusId) === 6 && Number(lot.finalBid) > 0 && Number.isFinite(ts) && ts < Date.now();
  const price = sold ? Number(lot.finalBid) : (Number(lot.currentBid) || Number(lot.buyNow) || 0);
  const vin = /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(lot.vin || "")) ? String(lot.vin).toUpperCase() : undefined;
  const imgs = (Array.isArray(lot.images) && lot.images.length ? lot.images : (lot.image ? [lot.image] : [])).filter(Boolean).slice(0, 6);
  const transRaw = String(lot.transmission || "");
  const car = {
    "@context": "https://schema.org",
    "@type": "Car",
    name: q(lot.title) || [year || undefined, lot.make, lot.model].filter(Boolean).join(" ") || undefined,
    url: q(url),
    description: q(description),
    vehicleIdentificationNumber: vin,
    brand: lot.make ? {"@type": "Brand", name: lot.make} : undefined,
    model: q(lot.model),
    vehicleModelDate: year ? String(year) : undefined,
    image: imgs.length ? imgs : undefined,
    mileageFromOdometer: miles > 0 ? {"@type": "QuantitativeValue", value: Math.round(miles), unitCode: "SMI"} : undefined,
    fuelType: fuelText(lot),
    driveWheelConfiguration: q(lot.drive),
    vehicleTransmission: /auto/i.test(transRaw) ? "Automatic" : /manual|mech/i.test(transRaw) ? "Manual" : undefined,
    itemCondition: "https://schema.org/UsedCondition"
  };
  if(price > 0){
    car.offers = {
      "@type": "Offer",
      priceCurrency: ca ? "CAD" : "USD",
      price: Math.round(price),
      availability: sold ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/UsedCondition",
      url: q(url),
      seller: {"@type": "Organization", name: "Apex Auto", url: "https://apexauto.md"}
    };
  }
  return JSON.parse(JSON.stringify(car)); // выкидывает undefined-поля
}

module.exports = {lotJsonLd, fuelText};
