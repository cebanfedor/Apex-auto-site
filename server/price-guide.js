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
// ⚠️ 28.09.2026 (Федор, Tesla Model Y CoD 7SAYGDEF8PF704867 — ушла в $4.2-5.8к вместо реальных
// $8-10к): документ раньше решал ВСЁ — «утиль»-статус (Certificate of Destruction/Non-Repairable/
// Junk/Parts Only/Bill of Sale) сразу обнулял до 0.5, игнорируя реальные повреждения. По факту
// бумага почти никогда не должна определять цену — только реальное состояние/повреждения. Теперь:
// Bill of Sale / ACQ — небольшая скидка сверху обычного коэффициента; Clean/Clear title — небольшая
// надбавка; ВСЕ остальные документы (включая Certificate of Destruction и другой «утиль»-статус) —
// роли не играют вообще, цену определяют повреждения/состояние ниже.
const RE_DOC_CHEAPER = /bill of sale|\bacq\b/i;
const RE_DOC_PREMIUM = /\bclean\b|\bclear\b/i;
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
  let coef;
  if(RE_TOTAL.test(all)) coef = 0.6;
  else if(RE_STRUCT.test(all)) coef = runs ? 0.8 : 0.7;
  else if(RE_MECH.test(d1)) coef = runs ? 0.85 : 0.75;
  else{
    const has2 = d2 && !RE_COSMETIC.test(d2);
    const cosmetic1 = !d1 || RE_COSMETIC.test(d1);
    if(cosmetic1 && !has2) coef = runs ? 1.1 : (noStart ? 0.95 : 1.0);
    else if(/hail/i.test(d1) && !has2) coef = runs ? 1.0 : 0.9;
    else if(!has2) coef = runs ? 1.0 : (noStart ? 0.9 : 0.95);      // один удар
    else coef = runs ? 0.9 : (noStart ? 0.8 : 0.85);                // две зоны
  }
  const doc = String(meta.doc || "");
  if(RE_DOC_CHEAPER.test(doc)) coef *= 0.92;
  else if(RE_DOC_PREMIUM.test(doc)) coef *= 1.05;
  return coef;
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
// Вилка ориентира (26.09.2026, Федор: у DreamBid разброс — несколько тысяч долларов, не $1000–1500):
// раньше ±0.05 к коэффициенту давало от силы 10% ширины (Honda Civic: $9800–$10900 при медиане $10400).
// Сверка с живыми карточками DreamBid (app.dreambid.pl/api/lots/<key>, поле avg_final_bid) — у них разброс
// ~30% от середины (тот же Civic: $9650–$13050 при среднем $11350, 30%; Pacifica $4800–$6500, 35%).
// ±15% от середины — тот же порядок, что и у ACV-оценки (estimateFromAcv), полосы не выглядят разнородно.
const GUIDE_BAND_FRAC = 0.15;
function guideBand(base, k, coef){
  const g = Number(base) * (Number(k) || 1.2);
  if(!(g > 0)) return null;
  const mid = g * coef;
  return {lo:round100(mid * (1 - GUIDE_BAND_FRAC)), mid:round100(mid), hi:round100(mid * (1 + GUIDE_BAND_FRAC))};
}


// ---- Оценка по ACV лота (26.09.2026) ----
// Оценочная стоимость (ACV/estimated retail value) в фиде — это appraisal КОНКРЕТНОГО VIN на момент
// повреждения: она уже учитывает год, пробег, комплектацию и трим этой машины. Для моделей вне таблицы
// Федора это точнее «усреднённой по кузову» цены (там терялись премиальные версии/свежие пробеги).
// Коэффициенты ниже — НЕ придуманы: выверены по НАШЕЙ базе проданных лотов, ?action=acvcalib
// (26.09.2026, выборка ~5300 продаж с известной ACV): медиана finalBid/ACV по каждому состоянию.
// «Слух», что ставка = 50–60% ACV, подтвердился только для почти целых машин (coef 1.10 → ~42%);
// для среднего повреждённого лота реальная медиана — 27–30%, для тяжёлых — 17–21%.
const ACV_RATIO_BY_COEF = {
  "1.1":0.42, "1":0.29, "0.95":0.27, "0.9":0.27, "0.85":0.23,
  "0.8":0.21, "0.75":0.19, "0.7":0.18, "0.6":0.17, "0.5":0.16
};
function acvRatioFor(coef){
  const key = Number(coef).toFixed(2).replace(/0$/, "").replace(/\.$/, "");
  if(ACV_RATIO_BY_COEF[key] != null) return ACV_RATIO_BY_COEF[key];
  const c = Number(coef) || 1;
  const keys = Object.keys(ACV_RATIO_BY_COEF).map(Number).sort((a, b) => a - b);
  const near = keys.reduce((a, b) => Math.abs(b - c) < Math.abs(a - c) ? b : a);
  return ACV_RATIO_BY_COEF[String(near)];
}
// Пробег двигает долю ACV, которую реально платят, даже когда сама ACV его уже учла (та же база,
// точка отсчёта 60–100 тыс. миль): свежий малопробежный экземпляр разбирают на запчасти охотнее.
function acvMileageAdj(odometerMi){
  const mi = Number(odometerMi) || 0;
  if(!mi) return 1;
  if(mi <= 30000) return 1.15;
  if(mi <= 60000) return 1.13;
  if(mi <= 100000) return 1.0;
  if(mi <= 150000) return 0.88;
  if(mi <= 220000) return 0.76;
  return 0.65;
}
// Сработавшие подушки — конкретный факт по ЭТОМУ лоту, ACV его ещё не учла.
// ⚠️ 28.09.2026 (Федор): отсутствие ключа в 99% случаев НЕ влияет на цену — ключ дублируют/делают
// новый копеечно, покупатели на аукционах это не считают проблемой. Скидка ×0.6 убрана.
// ⚠️ 28.09.2026 (Федор, BMW X3 xDrive30e Copart 65917076: ориентир $7.3-9.8к при реальной недавней
// продаже ТОГО ЖЕ трима за $13.4к, «plug-in гибриды всегда дороже») — ACV_RATIO_BY_COEF выше калибровалась
// по ВСЕМУ каталогу разом, а он на 90% бензин: гибриды/plug-in там разбавлены и топят их надбавку.
// Отдельная калибровка по топливу (?action=acvcalib&fuel=…, выборка n=5549, гибридов 257, plug-in 39):
// медиана finalBid/ACV — бензин 0.271 (база, множитель 1.0) · дизель 0.313 (1.15×) · электро 0.361 (1.30×) ·
// гибрид 0.378 (1.35×) · plug-in 0.496 (1.75×, в 1.8 раза дороже бензина при том же ACV/повреждении —
// значит батарея+тех.начинка держат цену даже разбитыми). Множители чуть занижены от чистой медианы —
// подстраховка на случай, если состав выборки сместится. fuel = fuel_x (1 дизель·2 электро·3 гибрид·4
// бензин·5 plug-in), не сырой fuel_id фида (путает гибрид/plug-in/mild-hybrid).
const ACV_FUEL_MULT = {1:1.15, 2:1.30, 3:1.35, 5:1.75};
function acvFuelAdj(fuelX){
  return ACV_FUEL_MULT[Number(fuelX)] || 1;
}
function acvExtraAdj({airbags, fuel} = {}){
  let f = 1;
  if(/deploy/i.test(String(airbags || ""))) f *= 0.8;
  f *= acvFuelAdj(fuel);
  return f;
}
// Вилка по ACV: ±15% вокруг середины, потолок — не выше 90% ACV (дороже целой машины салважный лот не берут).
function estimateFromAcv(acv, coef, odometerMi, extra){
  const a = Number(acv) || 0;
  if(a < 500) return null;
  const ratio = acvRatioFor(coef) * acvMileageAdj(odometerMi) * acvExtraAdj(extra || {});
  const mid = a * Math.min(ratio, 0.9);
  if(!(mid > 0)) return null;
  return {lo:round100(mid * 0.85), mid:round100(mid), hi:round100(Math.min(mid * 1.15, a * 0.9))};
}

module.exports = {mileageFactor, loadGuide, resetGuideCache, matchGuide, conditionCoef, guideBand, fuelClass, normMake, squash,
  acvRatioFor, acvMileageAdj, acvExtraAdj, acvFuelAdj, estimateFromAcv};
