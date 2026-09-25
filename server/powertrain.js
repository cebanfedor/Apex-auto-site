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

module.exports = {vpicBatch, kindFromVpic, kindFromRules, epaFlags, decide, validVin, KIND_NAME};
