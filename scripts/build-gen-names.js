// Строит server/gen-names.js: римский номер поколения для каждой записи таблицы server/gen-table.js.
// Номер берём из справочника фида (auctionsapi /generations/<model_id>: «VI (F3x)») — ближайшее по году начала (±3),
// только «чистые» римские имена (без «III 1» — это рестайлинги). Запуск: node scripts/build-gen-names.js  (нужен доступ к https://apexauto.md)
const fs = require("fs"), path = require("path");
const TABLE = require("../server/gen-table");
const ids = Object.keys(TABLE);
const RAW = path.join(__dirname, "..", "..", "gen-raw.json");   // кэш ответов, чтобы не дёргать API повторно
async function fetchRaw(){
  let raw = {};
  try{ raw = JSON.parse(fs.readFileSync(RAW, "utf8")); }catch(e){}
  const todo = ids.filter(id => !(id in raw));
  for(let i = 0; i < todo.length; i += 25){
    const part = todo.slice(i, i + 25);
    const r = await fetch(`https://apexauto.md/api/auctions?action=rawgens&ids=${part.join(",")}&x=${Date.now()}`);
    const j = await r.json();
    for(const id of part) raw[id] = j.gens && j.gens[id] !== undefined ? j.gens[id] : null;
    fs.writeFileSync(RAW, JSON.stringify(raw));
    process.stderr.write(`raw ${Math.min(i + 25, todo.length)}/${todo.length}\\n`);
  }
  return raw;
}
const VALS = {I:1, V:5, X:10, L:50};
function fromRoman(r){ let t = 0; for(let i = 0; i < r.length; i++){ const a = VALS[r[i]], b = VALS[r[i + 1]] || 0; t += a < b ? -a : a; } return t; }
function toRoman(n){ const m = [[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]]; let o = ""; for(const [v, r] of m) while(n >= v){ o += r; n -= v; } return o; }
(async () => {
  const raw = await fetchRaw();
  const out = {}; const report = {ok:0, none:0, dup:0};
  for(const id of ids){
    const feed = (raw[id] || []).map(([gid, name, from, to]) => {
      const m = String(name || "").trim().match(/^([IVXL]+)(?:\s*\(.*\))?$/);
      return m && from ? {roman:m[1], from:Number(from)} : null;
    }).filter(Boolean);
    const entries = TABLE[id];
    // 1) совпадение с фидом по году начала; «надёжное» — в пределах ±1 года
    const match = entries.map(([from]) => {
      const c = feed.map(f => ({f, d:Math.abs(f.from - from)})).filter(x => x.d <= 3).sort((a, b) => a.d - b.d || a.f.from - b.f.from);
      return c.length ? {roman:c[0].f.roman, d:c[0].d} : null;
    });
    // 2) фид местами врёт (Corolla E110 «IX» вместо VIII, Audi A4 B7 «IV»), а таблица идёт подряд — поэтому берём сдвиг
    //    «номер = позиция + сдвиг», самый частый среди надёжных совпадений; если с ним согласно ≥60% — нумеруем по позициям
    const conf = match.map((m, i) => m && m.d <= 1 ? {i, v:fromRoman(m.roman)} : null).filter(Boolean);
    let res = entries.map(() => "");
    const cnt = {};
    conf.forEach(c => { const o = c.v - (c.i + 1); cnt[o] = (cnt[o] || 0) + 1; });
    const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
    if(conf.length >= 2 && best && best[1] / conf.length >= 0.6){
      const off = Number(best[0]);
      res = res.map((_, i) => (i + 1 + off) >= 1 && (i + 1 + off) <= 20 ? toRoman(i + 1 + off) : "");
    }else if(conf.length >= 1){
      conf.forEach(c => { res[c.i] = match[c.i].roman; });
      // одинаковый номер у двух записей (рестайлинг отдельной строкой) — оставляем у более ранней
      const seen = new Set();
      res.forEach((r, i) => { if(r && seen.has(r)){ res[i] = ""; report.dup++; } if(r) seen.add(r); });
    }
    res.forEach(r => r ? report.ok++ : report.none++);
    out[id] = res;
  }
  // Ручные поправки там, где справочник фида не даёт номеров или путает (Golf: Mk1…Mk8 = I…VIII, Audi A4 B5…B9 = I…V и т.п.)
  const MANUAL = {
    58:["I","II","III","IV","V"],                          // Audi A4 B5–B9
    970:["I","II","III","IV","V","VI","VII","VIII"],       // VW Golf A1–A8
    2322:["I","II","III","IV","V","VI","VII","VIII"],      // VW Golf GTI
    1052:["I","II","III"],                                 // Mercedes CLS C219/C218/C257
    757:["I","III","IV","V","VI","VII","VIII"]             // Porsche 911: 901, 964, 993, 996, 997, 991, 992 (G-серии в таблице нет)
  };
  for(const id in MANUAL) if(out[id] && out[id].length === MANUAL[id].length) out[id] = MANUAL[id];
  const lines = Object.entries(out).map(([id, arr]) => `  ${id}:${JSON.stringify(arr)},`);
  fs.writeFileSync(path.join(__dirname, "..", "server", "gen-names.js"),
    "// Римские номера поколений по записям server/gen-table.js (тот же порядок). Сгенерировано scripts/build-gen-names.js из справочника фида.\n// \"\" — номер не определился (показываем только код кузова).\nmodule.exports = {\n" + lines.join("\n") + "\n};\n");
  console.error(JSON.stringify(report));
})();
