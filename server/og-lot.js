// Факты о лоте для превью ссылок: и текст (og:description), и картинка (server/og-card.js) берут отсюда — чтобы совпадали.
const {money, dateRu} = require("./og-card");

const isCanada = lot => /,\s*canada\s*$|\b(ontario|quebec|alberta|british columbia|manitoba|saskatchewan|nova scotia|new brunswick|newfoundland)\b/i.test(String(lot.location || ""));

const titleCase = s => String(s || "").replace(/\b([a-zA-Z])([a-zA-Z']*)/g, (m, a, b) => a.toUpperCase() + b.toLowerCase());
const cleanLoc = s => titleCase(String(s || "").replace(/\s+/g, " ").trim());

const L = {
  ru:{drive:"Привод", lot:"Лот", date:"Дата торгов", loc:"Локация", cond:"Состояние", odo:"Пробег", tail:"Расчёт под ключ до Кишинёва — Apex Auto.", auto:"Автомат.", man:"Механика", mi:"миль", ok:"Заводится и едет", start:"Заводится", no:"Не на ходу", sold:"Продан", bid:"Текущая ставка", buy:"Купить сейчас", noBid:"Ставок пока нет", auction:"Торги", sale:"Продан"},
  ro:{drive:"Tracțiune", lot:"Lot", date:"Data licitației", loc:"Locație", cond:"Stare", odo:"Rulaj", tail:"Calcul la cheie până la Chișinău — Apex Auto.", auto:"Automat", man:"Manual", mi:"mile", ok:"Pornește și merge", start:"Pornește", no:"Nu merge", sold:"Vândut", bid:"Oferta curentă", buy:"Cumpără acum", noBid:"Fără oferte", auction:"Licitație", sale:"Vândut"},
  en:{drive:"Drive", lot:"Lot", date:"Auction date", loc:"Location", cond:"Condition", odo:"Mileage", tail:"Turnkey estimate to Chisinau — Apex Auto.", auto:"Automatic", man:"Manual", mi:"mi", ok:"Runs and drives", start:"Starts", no:"Does not run", sold:"Sold", bid:"Current bid", buy:"Buy now", noBid:"No bids yet", auction:"Auction", sale:"Sold"}
};
const KIND = {ru:{2:"Электро", 3:"Гибрид", 5:"Plug-in гибрид"}, ro:{2:"Electric", 3:"Hibrid", 5:"Hibrid plug-in"}, en:{2:"Electric", 3:"Hybrid", 5:"Plug-in hybrid"}};

function facts(lot, lang = "ru"){
  const t = L[lang] || L.ru;
  const cond = /run_?and_?drive|runs? and drives?/i.test(String(lot.condition || "")) ? t.ok
    : /start/i.test(String(lot.condition || "")) ? t.start
    : /no_?start|not|inoperable|non/i.test(String(lot.condition || "")) ? t.no : "";
  const trans = /auto/i.test(String(lot.transmission || "")) ? t.auto : /manual|mech/i.test(String(lot.transmission || "")) ? t.man : "";
  const odo = Number(lot.odometer) > 0 ? `${Math.round(Number(lot.odometer)).toLocaleString("en-US").replace(/,/g, " ")} ${t.mi}` : "";
  const ts = Date.parse(lot.auctionDate || "");
  const sold = Number(lot.statusId) === 6 && Number(lot.finalBid) > 0 && Number.isFinite(ts) && ts < Date.now();
  let price = "", priceLabel = "";
  if(sold){ price = money(lot.finalBid); priceLabel = t.sold; }
  else if(Number(lot.currentBid) > 0){ price = money(lot.currentBid); priceLabel = t.bid; }
  else if(Number(lot.buyNow) > 0){ price = money(lot.buyNow); priceLabel = t.buy; }
  const dateShort = Number.isFinite(ts) ? new Intl.DateTimeFormat("ru-RU", {timeZone:"Europe/Chisinau", day:"2-digit", month:"2-digit", year:"numeric"}).format(new Date(ts)) : "";
  const kind = KIND[lang] && KIND[lang][lot.fuelKind];
  return {t, cond, trans, odo, sold, price, priceLabel, dateShort, kind, canada:isCanada(lot), loc:cleanLoc(lot.location),
    dateCard: Number.isFinite(ts) ? (sold ? `${t.sale} ${dateRu(lot.auctionDate).split(",")[0]}` : `${t.auction} ${dateRu(lot.auctionDate)}`) : ""};
}

// og:description в стиле «RWD • Автомат. Лот: … Дата торгов: … Локация: … Состояние: … Пробег: …»
function description(lot, lang = "ru"){
  const f = facts(lot, lang), t = f.t;
  const head = [lot.drive && String(lot.drive).replace(/4×4/, "4WD"), f.trans].filter(Boolean).join(" • ");
  const headFull = [head, f.kind].filter(Boolean).join(" • ");
  const parts = [
    headFull ? headFull + "." : "",
    `${t.lot}: ${lot.lot}.`,
    f.dateShort ? `${t.date}: ${f.dateShort}.` : "",
    f.loc ? `${t.loc}: ${f.loc}.` : "",
    f.cond ? `${t.cond}: ${f.cond}.` : "",
    f.odo ? `${t.odo}: ${f.odo}.` : "",
    f.price ? `${f.priceLabel}: ${f.price}.` : "",
    t.tail
  ].filter(Boolean);
  return parts.join(" ").replace(/\.\s*\./g, ".").replace(/\s+/g, " ").trim();
}

// Данные для картинки
function cardData(lot, lang = "ru"){
  const f = facts(lot, lang);
  const chips = [f.odo, f.cond, f.loc && f.loc.replace(/,\s*(Canada|USA)$/i, "")].filter(Boolean);
  const tagMap = {2:"Электро", 3:"Гибрид", 5:"Plug-in"};
  return {
    title: lot.title || [lot.year, lot.make, lot.model].filter(Boolean).join(" "),
    auction: lot.auction, canada:f.canada, image: (lot.images && lot.images[0]) || lot.image,
    price: f.price, priceLabel: f.price ? f.priceLabel : f.t.noBid, date: f.dateCard, chips,
    tag: tagMap[lot.fuelKind] || "", tagBg: lot.fuelKind === 2 ? "#1f7ae0" : "#1c9c5b"
  };
}

module.exports = {facts, description, cardData, isCanada};
