// Ориентир ставки по экспертной таблице Федора («Таблица расчётов»).
// Формула: база (средняя цена продаж кузова/версии) × K (≈1.2) × коэффициент состояния.
// САМИ ЦИФРЫ таблицы здесь НЕ хранятся — они в закрытой таблице Supabase `price_guide`
// (RLS включён, доступ только сервисным ключом) и редактируются в админке. Наружу уходит
// только итоговая вилка. Каталог /server/ закрыт от прямого доступа в vercel.json.
const supabase = require("./supabase");

const GUIDE_TTL = 10 * 60e3;
let guideCache = {rows:null, at:0};

const MAKE_ALIAS = {vw:"volkswagen", mercedes:"mercedesbenz", "mercedes-benz":"mercedesbenz", "alfa romeo":"alfaromeo",
  "land rover":"landrover", chevy:"chevrolet"};
const squash = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function normMake(s){ const t = String(s || "").toLowerCase().trim(); return MAKE_ALIAS[t] || squash(t); }

// Токены «стога»: слова + склейки соседних пар («CR-V»→crv, «Model 3»→model3, «C 300»→c300, «Santa Fe»→santafe).
function hayTokens(){
  const set = new Set();
  for(const src of arguments){
    const w = String(src || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    w.forEach((x, i) => { set.add(x); if(w[i + 1]) set.add(x + w[i + 1]); if(w[i + 2]) set.add(x + w[i + 1] + w[i + 2]); });
  }
  return set;
}

async function loadGuide(){
  if(guideCache.rows && Date.now() - guideCache.at < GUIDE_TTL) return guideCache.rows;
  try{
    const rows = await supabase.list("price_guide", {select:"make,tokens,year_from,year_to,fuel,base_price,k", active:"eq.true", limit:"2000"});
    guideCache = {rows:Array.isArray(rows) ? rows : [], at:Date.now()};
  }catch(e){
    // таблицы ещё нет / база недоступна — работаем без ориентира по таблице
    guideCache = {rows:guideCache.rows || [], at:Date.now() - GUIDE_TTL + 60e3};
  }
  return guideCache.rows;
}
function resetGuideCache(){ guideCache = {rows:null, at:0}; }

function fuelClass(raw){
  const t = String(raw || "").toLowerCase();
  if(/plug|phev/.test(t)) return "plugin";
  if(/hybrid|гибрид/.test(t)) return "hybrid";
  if(/electric|электр|\bev\b/.test(t)) return "electric";
  if(/diesel|дизел/.test(t)) return "diesel";
  if(t) return "gas";
  return "";
}

// Подбор строки таблицы под лот. Все токены строки обязаны найтись в модели/названии/коде кузова;
// год — внутри диапазона; топливо — если задано в строке. Из подошедших — самая специфичная.
function matchGuide(rows, lot){
  const make = normMake(lot.make);
  const yr = Number(lot.year) || 0;
  if(!make || !yr || !rows || !rows.length) return null;
  const hay = hayTokens(lot.model, lot.title, lot.gen);
  const fc = fuelClass(lot.fuel);
  let best = null, bestScore = -1;
  for(const r of rows){
    if(normMake(r.make) !== make) continue;
    if(r.year_from && yr < r.year_from) continue;
    if(r.year_to && yr > r.year_to) continue;
    const tokens = Array.isArray(r.tokens) ? r.tokens : String(r.tokens || "").split(/[\s,]+/);
    const tk = tokens.map(squash).filter(Boolean);
    // Версии вида «40i/45e/530i» в названиях BMW склеены с приводом («xDrive40i») — допускаем суффикс.
    const has = t => hay.has(t) || (/^[a-z]?\d{2,3}[a-z]{1,2}$/.test(t) && [...hay].some(h => h.length > t.length && h.endsWith(t)));
    if(!tk.length || !tk.every(has)) continue;
    const rf = String(r.fuel || "any");
    if(rf !== "any"){
      // «hybrid» в таблице покрывает и плагин (фид часто пишет PHEV просто как Hybrid) и наоборот
      const ok = rf === fc || (rf === "hybrid" && fc === "plugin") || (rf === "plugin" && fc === "hybrid");
      if(!ok) continue;
    }else if(fc === "hybrid" || fc === "plugin" || fc === "electric"){
      // строка «без топлива» — про обычную версию; гибрид/электро той же модели по ней не оцениваем,
      // если в таблице есть отдельная строка под гибрид — она победит по специфичности ниже
    }
    const score = tk.length * 10 + (rf !== "any" ? 5 : 0) + (r.year_from ? 1 : 0) + (r.year_to ? 1 : 0);
    if(score > bestScore){ best = r; bestScore = score; }
  }
  return best;
}

// Коэффициент состояния по шкале Федора: 1.10 почти целая · 1.00 небольшой удар · 0.90 средний ·
// 0.80 сильный; ниже — тяжёлые случаи (он подтвердил, что шкалу можно продолжать вниз).
const RE_JUNK_DOC = /parts only|certificate of destruction|cert of destruction|non[- ]?repairable|junk|scrap|bill of sale/i;
const RE_TOTAL = /flood|water|burn|biohazard|bio ?chemical/i;
const RE_STRUCT = /all over|roll ?over|undercarriage|frame|strip/i;
const RE_MECH = /mechanical|engine|transmission|electrical/i;
const RE_COSMETIC = /minor dent|scratch|normal wear|wear (and|&) tear|^none$|damage history|vandalism|^unknown$|^-$/i;
function conditionCoef(meta){
  const d1 = String(meta.dmg || "").trim(), d2 = String(meta.dmg2 || "").trim();
  const all = `${d1} / ${d2}`;
  const c = String(meta.cond || "").toLowerCase();
  // «not_run» тоже содержит «run» — сначала отрицание. Явный флаг run от клиента приоритетнее текста.
  const noStart = meta.run === false || (meta.run !== true && /not|does|won|не завод|не на ходу|stationary/.test(c));
  const runs = !noStart && (meta.run === true || /run|drive|на ходу|заводится и едет/.test(c));
  if(RE_JUNK_DOC.test(String(meta.doc || ""))) return 0.5;
  if(RE_TOTAL.test(all)) return 0.6;
  if(RE_STRUCT.test(all)) return runs ? 0.8 : 0.7;
  if(RE_MECH.test(d1)) return runs ? 0.85 : 0.75;
  const has2 = d2 && !RE_COSMETIC.test(d2);
  const cosmetic1 = !d1 || RE_COSMETIC.test(d1);
  if(cosmetic1 && !has2) return runs ? 1.1 : (noStart ? 0.95 : 1.0);
  if(/hail/i.test(d1) && !has2) return runs ? 1.0 : 0.9;
  if(!has2) return runs ? 1.0 : (noStart ? 0.9 : 0.95);      // один удар
  return runs ? 0.9 : (noStart ? 0.8 : 0.85);                // две зоны
}

// Таблица Федора рассчитана на пробег ДО 100 тыс. миль (его слова, 22.09.2026). Выше — понижающая
// поправка: проверка на продажах показала, что BMW 3 с пробегом >100k уходят за ~0.3 от ориентира
// таблицы против ~0.8 у малопробежных. Ступени стартовые — Федор может поправить.
function mileageFactor(odometerMi){
  const mi = Number(odometerMi) || 0;
  if(mi <= 100000) return 1;
  if(mi <= 125000) return 0.8;
  if(mi <= 150000) return 0.65;
  if(mi <= 180000) return 0.5;
  return 0.4;
}

const round100 = v => Math.round(v / 100) * 100;
// Вилка ориентира: ±0.05 от коэффициента вокруг базы×K.
function guideBand(base, k, coef){
  const g = Number(base) * (Number(k) || 1.2);
  if(!(g > 0)) return null;
  return {lo:round100(g * (coef - 0.05)), mid:round100(g * coef), hi:round100(g * (coef + 0.05))};
}

module.exports = {mileageFactor, loadGuide, resetGuideCache, matchGuide, conditionCoef, guideBand, fuelClass, normMake, squash};
