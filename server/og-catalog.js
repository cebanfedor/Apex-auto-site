// Превью каталога с фильтрами: /auctions?make=48&model=1904&fuel=5 → «Ford Fusion · Plug-in гибрид — 12 лотов…».
// Одна и та же логика для текста страницы (api/catalog-page.js) и картинки (api/og.js, /og/catalog).
const LOC = {
  ru:{fuel:{4:"Бензин", 1:"Дизель", 3:"Гибрид", 5:"Plug-in гибрид", 2:"Электро"}, tab:{soon:"Сегодня и завтра", buy_now:"Купить сейчас", archived:"Архив продаж"}, sale:{timed:"Timed", no_reserve:"Без резерва", on_approval:"На утверждении"},
    from:y => `с ${y} года`, to:y => `до ${y} года`, budget:n => `до $${n} под ключ`, noBan:"без запрета экспорта", canada:"Канада", catalog:"Каталог аукционов", kicker:"КАТАЛОГ АУКЦИОНОВ COPART И IAAI", sub:"Фото · история по VIN · цена под ключ", lots:["лот", "лота", "лотов"], onAuctions:"на аукционах", auctionsCatalog:"каталог аукционов",
    descTail:"фото, история продаж по VIN и цена под ключ до Кишинёва. Подбор и доставка от Apex Auto.", descWith:"с Copart и IAAI", descNo:"лоты с Copart и IAAI"},
  ro:{fuel:{4:"Benzină", 1:"Diesel", 3:"Hibrid", 5:"Hibrid plug-in", 2:"Electric"}, tab:{soon:"Azi și mâine", buy_now:"Cumpără acum", archived:"Arhiva vânzărilor"}, sale:{timed:"Timed", no_reserve:"Fără rezervă", on_approval:"În aprobare"},
    from:y => `din ${y}`, to:y => `până în ${y}`, budget:n => `până la $${n} la cheie`, noBan:"fără interdicție la export", canada:"Canada", catalog:"Catalog licitații", kicker:"CATALOG LICITAȚII COPART ȘI IAAI", sub:"Foto · istoric după VIN · preț la cheie", lots:["lot", "loturi", "loturi"], onAuctions:"la licitații", auctionsCatalog:"catalog licitații",
    descTail:"fotografii, istoric de vânzări după VIN și preț la cheie până la Chișinău. Selecție și livrare de la Apex Auto.", descWith:"de la Copart și IAAI", descNo:"loturi de la Copart și IAAI"},
  en:{fuel:{4:"Gasoline", 1:"Diesel", 3:"Hybrid", 5:"Plug-in hybrid", 2:"Electric"}, tab:{soon:"Today and tomorrow", buy_now:"Buy now", archived:"Sales archive"}, sale:{timed:"Timed", no_reserve:"No reserve", on_approval:"On approval"},
    from:y => `from ${y}`, to:y => `up to ${y}`, budget:n => `up to $${n} turnkey`, noBan:"no export ban", canada:"Canada", catalog:"Auction catalog", kicker:"COPART AND IAAI AUCTION CATALOG", sub:"Photos · VIN history · turnkey price", lots:["lot", "lots", "lots"], onAuctions:"at auctions", auctionsCatalog:"auction catalog",
    descTail:"photos, VIN sales history and a turnkey price to Chisinau. Sourcing and delivery by Apex Auto.", descWith:"from Copart and IAAI", descNo:"lots from Copart and IAAI"}
};
const FUEL = LOC.ru.fuel, TAB = LOC.ru.tab, SALE = LOC.ru.sale;
const KEYS = ["make", "model", "generation", "makeAny", "fuel", "phev", "state", "yearFrom", "yearTo", "auction", "tab", "saleStatus", "budget", "vehicleType", "body", "drive", "country", "smart", "name", "damage", "noBan", "bidTo", "buyNowTo"];

// Оставляем только известные фильтры (для безопасной подстановки в URL картинки и запроса к API)
function cleanQuery(q){
  const p = new URLSearchParams();
  for(const k of KEYS){
    const v = q[k] == null ? "" : String(Array.isArray(q[k]) ? q[k][0] : q[k]).trim();
    if(v && /^[\w ,.\-|]{1,80}$/.test(v)) p.set(k, v);
  }
  return p;
}
const isFiltered = p => [...p.keys()].some(k => !(k === "tab" && p.get(k) === "all") && !(k === "auction" && p.get(k) === "all"));

async function getJson(url, ms = 6000){
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), ms);
  try{ const r = await fetch(url, {signal:ctrl.signal, headers:{accept:"application/json"}}); return r.ok ? await r.json().catch(() => null) : null; }
  catch(e){ return null; }
  finally{ clearTimeout(timer); }
}

async function describeCatalog(origin, p, lang){
  const X = LOC[lang] || LOC.ru;
  const search = await getJson(`${origin}/api/auctions?action=search&per_page=1&${p.toString()}`);
  const total = search && Number(search.total) >= 0 ? Number(search.total) : null;
  const first = search && search.items && search.items[0];
  const makeIds = String(p.get("make") || "").split(",").filter(Boolean);
  const modelIds = String(p.get("model") || "").split(",").filter(Boolean);
  let names = "";
  if(makeIds.length === 1 && modelIds.length === 1 && first && first.make){
    names = [first.make, String(first.model || "").replace(/^\s+/, "")].filter(Boolean).join(" ");
  }else if(makeIds.length){
    const m = await getJson(`${origin}/api/auctions?action=manufacturers`);
    const list = (m && m.items) || [];
    names = makeIds.map(id => (list.find(x => String(x.id) === id) || {}).name).filter(Boolean).slice(0, 3).join(", ");
    if(modelIds.length === 1 && first && first.model && first.make && makeIds.length === 1) names += " " + first.model;
  }
  const chips = [];
  const fuels = String(p.get("fuel") || "").split(",").filter(x => X.fuel[x]).map(x => X.fuel[x]);
  if(p.get("phev") === "1" && !fuels.includes(X.fuel[5])) fuels.push(X.fuel[5]);
  if(fuels.length) chips.push(fuels.join(" / "));
  const yf = p.get("yearFrom"), yt = p.get("yearTo");
  if(yf || yt) chips.push(yf && yt ? (yf === yt ? yf : `${yf}–${yt}`) : yf ? X.from(yf) : X.to(yt));
  if(p.get("state")) chips.push(String(p.get("state")).toUpperCase());
  if(/^(copart|iaai)$/.test(p.get("auction") || "")) chips.push(p.get("auction") === "copart" ? "Copart" : "IAAI");
  if(X.tab[p.get("tab")]) chips.push(X.tab[p.get("tab")]);
  String(p.get("saleStatus") || "").split(",").filter(x => X.sale[x]).forEach(x => chips.push(X.sale[x]));
  if(Number(p.get("budget")) >= 1000) chips.push(`до $${Number(p.get("budget")).toLocaleString("en-US").replace(/,/g, " ")} под ключ`);
  if(p.get("smart") === "1") chips.push("Clean Select");
  if(p.get("noBan") === "1") chips.push(X.noBan);
  if(p.get("country") && /^ca$/i.test(p.get("country"))) chips.push(X.canada);
  const base = names || (chips.length ? chips.shift() : X.catalog);
  const headline = [base, ...chips].join(" · ");
  const totalTxt = total != null && total >= 0 && total < 1e5 ? `${total.toLocaleString("en-US").replace(/,/g, " ")} ${plural(total, X.lots[0], X.lots[1], X.lots[2])}` : "";
  return {X, names: base, chips, headline, total, totalTxt, image: first && (first.images && first.images[0] || first.image)};
}
function plural(n, a, b, c){ const m = n % 100, d = n % 10; return m >= 11 && m <= 14 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; }

module.exports = {cleanQuery, isFiltered, describeCatalog};
