// Превью каталога с фильтрами: /auctions?make=48&model=1904&fuel=5 → «Ford Fusion · Plug-in гибрид — 12 лотов…».
// Одна и та же логика для текста страницы (api/catalog-page.js) и картинки (api/og.js, /og/catalog).
const FUEL = {4:"Бензин", 1:"Дизель", 3:"Гибрид", 5:"Plug-in гибрид", 2:"Электро"};
const TAB = {soon:"Сегодня и завтра", buy_now:"Купить сейчас", archived:"Архив продаж"};
const SALE = {timed:"Timed", no_reserve:"Без резерва", on_approval:"На утверждении"};
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

async function describeCatalog(origin, p){
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
  const fuels = String(p.get("fuel") || "").split(",").filter(x => FUEL[x]).map(x => FUEL[x]);
  if(p.get("phev") === "1" && !fuels.includes(FUEL[5])) fuels.push(FUEL[5]);
  if(fuels.length) chips.push(fuels.join(" / "));
  const yf = p.get("yearFrom"), yt = p.get("yearTo");
  if(yf || yt) chips.push(yf && yt ? (yf === yt ? yf : `${yf}–${yt}`) : yf ? `с ${yf} года` : `до ${yt} года`);
  if(p.get("state")) chips.push(String(p.get("state")).toUpperCase());
  if(/^(copart|iaai)$/.test(p.get("auction") || "")) chips.push(p.get("auction") === "copart" ? "Copart" : "IAAI");
  if(TAB[p.get("tab")]) chips.push(TAB[p.get("tab")]);
  String(p.get("saleStatus") || "").split(",").filter(x => SALE[x]).forEach(x => chips.push(SALE[x]));
  if(Number(p.get("budget")) >= 1000) chips.push(`до $${Number(p.get("budget")).toLocaleString("en-US").replace(/,/g, " ")} под ключ`);
  if(p.get("smart") === "1") chips.push("Clean Select");
  if(p.get("noBan") === "1") chips.push("без запрета экспорта");
  if(p.get("country") && /^ca$/i.test(p.get("country"))) chips.push("Канада");
  const base = names || (chips.length ? chips.shift() : "Каталог аукционов");
  const headline = [base, ...chips].join(" · ");
  const totalTxt = total != null && total >= 0 && total < 1e5 ? `${total.toLocaleString("en-US").replace(/,/g, " ")} ${plural(total, "лот", "лота", "лотов")}` : "";
  return {names: base, chips, headline, total, totalTxt, image: first && (first.images && first.images[0] || first.image)};
}
function plural(n, a, b, c){ const m = n % 100, d = n % 10; return m >= 11 && m <= 14 ? c : d === 1 ? a : d >= 2 && d <= 4 ? b : c; }

module.exports = {cleanQuery, isFiltered, describeCatalog};
