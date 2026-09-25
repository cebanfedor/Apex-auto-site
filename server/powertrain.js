// Тип силовой установки лота по VIN. Источник истины — NHTSA vPIC (Electrification Level); фид auctionsapi путает
// (CX-90 Hybrid у него «бензин», CX-90 PHEV — «гибрид»). Запасной путь — правила по названию и таблица EPA.
//
// Коды (api_lots.fuel_x, lot.fuelKind): 1 дизель · 2 электро · 3 гибрид (HEV) · 4 бензин (в т.ч. mild-hybrid 48V) · 5 plug-in гибрид (PHEV).
// Источник (api_lots.fuel_src, lot.fuelSrc): 1 vPIC · 2 правила по названию/EPA · 4 vPIC: mild-hybrid (для расчёта = бензин).
const EPA = (() => { try{ return require("./epa-powertrain.js"); }catch(_){ return {}; } })();
const calc = (() => { try{ return require("../calc-core.js"); }catch(_){ return null; } })();

const VPIC_BATCH = "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/";
const KIND_NAME = {1:"Дизель", 2:"Электро", 3:"Гибрид", 4:"Бензин", 5:"Plug-in гибрид"};
const validVin = v => /^[A-HJ-NPR-Z0-9]{17}$/i.test(String(v || ""));
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// vPIC: до 50 VIN за запрос (больше — тихо пустые ответы). Возвращает Map(VIN → поля) или null при сбое сети/сервиса.
async function vpicBatch(vins, timeoutMs = 15000){
  const list = [...new Set(vins.map(v => String(v).toUpperCase()).filter(validVin))].slice(0, 50);
  if(!list.length) return new Map();
  for(let attempt = 0; attempt < 2; attempt++){
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try{
      const r = await fetch(VPIC_BATCH, {method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:"format=json&data=" + list.join(";"), signal:ctrl.signal});
      if(!r.ok) throw new Error("vpic " + r.status);
      const j = await r.json();
      const m = new Map();
      for(const x of (j && j.Results) || []) if(x && x.VIN) m.set(String(x.VIN).toUpperCase(), x);
      return m;
    }catch(e){ /* повтор */ }
    finally{ clearTimeout(timer); }
  }
  return null;
}

// Поля vPIC → {x, src, level} или null, если VIN не расшифрован
function kindFromVpic(d){
  if(!d || (!d.Make && !d.Model)) return null;
  const lvl = String(d.ElectrificationLevel || "").toLowerCase();
  const p1 = String(d.FuelTypePrimary || "").toLowerCase(), p2 = String(d.FuelTypeSecondary || "").toLowerCase();
  if(/phev|plug-in/.test(lvl)) return {x:5, src:1, level:"PHEV"};
  if(/bev|battery electric|fcev|fuel cell/.test(lvl)) return {x:2, src:1, level:"BEV"};
  if(/mild/.test(lvl)) return {x:/diesel/.test(p1) ? 1 : 4, src:4, level:"MHEV"};   // 48V mild-hybrid: для таможни и фильтров — обычный бензин/дизель
  if(/hev|hybrid/.test(lvl)) return {x:3, src:1, level:"HEV"};
  if(p1 === "electric" && /gasoline|diesel/.test(p2)) return {x:5, src:1, level:"REEV"};   // Volt, i3 REx: электро + бензиновый генератор
  if(p1 === "electric") return {x:2, src:1, level:"BEV"};
  if(/diesel/.test(p1)) return {x:1, src:1, level:""};
  if(p1) return {x:4, src:1, level:""};
  return null;
}

// Что EPA знает про модель в этом году: строка вариантов вроде "GHP" или "" (нет данных)
function epaFlags(make, model, year){
  const spec = EPA[norm(make) + "|" + norm(model)];
  if(!spec || !year) return "";
  for(const part of spec.split(",")){
    const [yrs, fl] = part.split(":");
    const [a, b] = yrs.split("-").map(Number);
    if(year >= a && year <= (b || a)) return fl;
  }
  return "";
}

// Запасное правило (VIN не расшифровался): фид + название + EPA
function kindFromRules({make, model, year, title, fuelId}){
  const feed = Number(fuelId) || 0;
  const t = String(title || "");
  const phevTitle = calc && calc.isPluginHybrid ? calc.isPluginHybrid(make, model, t, year) : /plug[\s-]?in|phev|4xe|prime|energi/i.test(t);
  const hybridTitle = /\bhybrid\b|\bhv\b|\bhev\b/i.test(t);
  const fl = epaFlags(make, model, Number(year));
  // В этом году у модели ВСЕ варианты гибридные (Prius, Niro…) — фид мог написать «бензин» по ошибке
  const allHybrid = !!fl && !/[GDE]/.test(fl);
  if(allHybrid && (feed === 3 || feed === 4)){
    if(phevTitle || (fl.includes("P") && !fl.includes("H"))) return {x:5, src:2};
    return {x:3, src:2};
  }
  if(feed === 3){
    if(phevTitle) return {x:5, src:2};
    if(fl.includes("P") && !fl.includes("H")) return {x:5, src:2};
    return {x:3, src:2};
  }
  if(feed === 1 || feed === 2) return {x:feed, src:2};
  if(phevTitle && feed !== 0 && /plug[\s-]?in|phev|4xe|energi|prime/i.test(t)) return {x:5, src:2};
  if(hybridTitle && !/mild/i.test(t)) return {x:3, src:2};
  return {x:4, src:2};
}

// Итог для одной строки: vPIC (если есть) → правила
function decide(row, vpicRow){
  const v = kindFromVpic(vpicRow);
  if(v) return v;
  return kindFromRules(row);
}

// ---- Полное название лота (Федор 25.09.2026: «пиши как на аукционе») ----
// Площадка режет название (Copart: «2022 Toyota Rav4 Hybri») и часто не пишет комплектацию («2023 Tesla Model Y»). Достраиваем:
// (1) обрезанное последнее слово, (2) комплектацию из NHTSA vPIC (Trim), (3) тип силовой установки по VIN («Hybrid» / «Plug-in Hybrid»).
const TITLE_WORDS = ["Hybrid", "Premium", "Limited", "Platinum", "Touring", "Titanium", "Convertible", "Performance", "Adventure", "Wilderness", "Outdoorsman", "Laramie", "Sahara", "Rubicon", "Overland", "Summit", "Denali", "Signature", "Prestige", "Luxury", "Sport", "Elite", "Select", "Preferred", "Reserve", "Ultimate", "Premier", "Inscription", "Momentum", "Executive", "Electric", "Plug-in", "Unlimited", "Standard", "Trailhawk", "Longitude", "Altitude", "Technology", "Advance", "Platinum"];
const NOISE_TRIM = /\b(FHEV|PHEV|HEV|MHEV|BEV|AWD|FWD|RWD|4WD|2WD|4X4)\b/gi;
function teslaConfig(other){
  const o = String(other || "");
  if(/dual motor/i.test(o)) return /performance/i.test(o) ? "Performance Dual Motor" : /standard|long range/i.test(o) ? "Long Range Dual Motor" : "Dual Motor";
  return "";
}
// Комплектация из полей vPIC («XSE», «Lariat», «Long Range Dual Motor» у Tesla)
// vPIC для части VIN отдаёт не комплектацию, а СПИСОК возможных («LE, SE, XSE, LE w/Convenience Tech pkg», «SEL/LE/GT/BE/SE») — такое не берём
function cleanTrim(t){
  t = String(t || "").replace(/\s+/g, " ").trim();
  if(!t || /[\/,()+;]|\bw\/|\bpkg\b|package/i.test(t) || t.split(" ").length > 4 || t.length > 28) return "";
  return t;
}
function trimFromVpic(d){
  if(!d) return "";
  if(String(d.Make || "").toLowerCase() === "tesla") return teslaConfig(d.OtherEngineInfo);
  let t = cleanTrim([d.Trim, d.Trim2].filter(Boolean).join(" ").replace(NOISE_TRIM, ""));
  if(/^(base|standard)$/i.test(t)) t = "";
  t = t.split(" ").map(w => (w.length > 4 && w === w.toUpperCase()) ? w[0] + w.slice(1).toLowerCase() : w).join(" ");
  return t.slice(0, 40);
}
function fullTitle(title, {trim, kind} = {}){
  let t = String(title || "").replace(/\s+/g, " ").trim();
  if(!t) return t;
  // 1. Обрезанное последнее слово: «Hybri» → «Hybrid»
  const toks = t.split(" ");
  const last = toks[toks.length - 1];
  if(t.length >= 20 && last.length >= 4 && !TITLE_WORDS.some(w => w.toLowerCase() === last.toLowerCase())){
    const w = TITLE_WORDS.find(x => x.length > last.length && x.toLowerCase().startsWith(last.toLowerCase()));
    if(w){ toks[toks.length - 1] = w; t = toks.join(" "); }
  }
  // 2. Комплектация из VIN, если её слов ещё нет в названии
  trim = cleanTrim(trim);   // и то, что уже лежит в базе (старые разборы), тоже проверяем
  if(trim){
    const have = new Set(t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
    // дописываем только недостающие слова: «Long Range» уже есть → добавится «Dual Motor», а не вся комплектация целиком
    const missing = trim.split(" ").filter(w => w && !have.has(w.toLowerCase()));
    if(missing.length) t += " " + missing.join(" ");
  }
  // 3. Гибрид / plug-in по VIN
  if(kind === 3 && !/hybri|\bhev\b|\bhv\b/i.test(t)) t += " Hybrid";
  if(kind === 5 && !/plug|phev|hybri|energi|prime|recharge|4xe|\d{2,3}x?e\b/i.test(t)) t += " Plug-in Hybrid";
  return t;
}

module.exports = {trimFromVpic, fullTitle, teslaConfig, vpicBatch, kindFromVpic, kindFromRules, epaFlags, decide, validVin, KIND_NAME};
