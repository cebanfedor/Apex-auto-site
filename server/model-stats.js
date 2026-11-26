// Сводка по проданным лотам модели (для страницы /models/<slug>). Чистые функции — без сети и базы.

function pct(sorted, p){
  if(!sorted.length) return 0;
  if(sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
const round50 = n => Math.round(n / 50) * 50;
const stat = vals => {
  const s = vals.slice().sort((a, b) => a - b);
  return {n:s.length, median:round50(pct(s, 0.5)), p25:round50(pct(s, 0.25)), p75:round50(pct(s, 0.75))};
};

// Группы повреждений (как пишет площадка в «Primary Damage») → ключ для сводки
function damageKey(raw){
  const d = String(raw || "").toLowerCase().trim();
  if(!d || d === "unknown") return "";
  if(/front/.test(d)) return "front";
  if(/rear/.test(d)) return "rear";
  if(/side/.test(d)) return "side";
  if(/hail/.test(d)) return "hail";
  if(/mechanical|engine|transmission/.test(d)) return "mechanical";
  if(/normal wear|minor dent|scratch|vandal|stripped|top/.test(d)) return "minor";
  return "other";
}

/**
 * rows: [{final_bid, year, odometer_mi, damage, sale_date}] — проданные лоты (цена молотка, без сборов).
 * Возвращает null, если данных меньше minN.
 */
function summarize(rows, {minN = 30, minYearN = 5, minDamageN = 8} = {}){
  const sales = (rows || []).filter(r => Number(r.final_bid) > 0);
  if(sales.length < minN) return null;
  const all = stat(sales.map(r => Number(r.final_bid)));
  const miles = sales.map(r => Number(r.odometer_mi)).filter(m => m > 100 && m < 500000).sort((a, b) => a - b);
  const byYear = new Map();
  for(const r of sales){
    const y = Number(r.year);
    if(!(y >= 1990 && y <= 2100)) continue;
    if(!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(Number(r.final_bid));
  }
  const years = [...byYear.entries()].filter(([, v]) => v.length >= minYearN)
    .map(([year, v]) => ({year, ...stat(v)})).sort((a, b) => b.year - a.year).slice(0, 12);
  const byDmg = new Map();
  for(const r of sales){
    const k = damageKey(r.damage);
    if(!k) continue;
    if(!byDmg.has(k)) byDmg.set(k, []);
    byDmg.get(k).push(Number(r.final_bid));
  }
  const damages = [...byDmg.entries()].filter(([, v]) => v.length >= minDamageN)
    .map(([key, v]) => ({key, ...stat(v), share:Math.round(v.length / sales.length * 100)}))
    .sort((a, b) => b.n - a.n).slice(0, 6);
  const dates = sales.map(r => Date.parse(r.sale_date)).filter(Number.isFinite).sort((a, b) => a - b);
  const auctions = {copart:0, iaai:0};
  for(const r of sales){ const a = String(r.auction || "").toLowerCase(); if(a in auctions) auctions[a]++; }
  return {
    n:all.n, median:all.median, p25:all.p25, p75:all.p75,
    medianMiles:miles.length >= 10 ? Math.round(pct(miles, 0.5) / 100) * 100 : 0,
    years, damages, auctions,
    from:dates.length ? new Date(dates[0]).toISOString().slice(0, 10) : "",
    to:dates.length ? new Date(dates[dates.length - 1]).toISOString().slice(0, 10) : ""
  };
}

module.exports = {summarize, damageKey, pct};
