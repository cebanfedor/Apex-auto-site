// Дописывает в server/gen-table.js поколения, которые есть у DreamBid, а у нас нет (в основном старые кузова американских моделей).
// Не трогает существующие записи и не добавляет ничего, что пересекается с ними по годам. Запуск: node scripts/merge-dreambid.js (один раз; повторный запуск ничего не добавит).
const fs = require("fs"), path = require("path");
const {dbFor, matchGens} = require("./dreambid-match");
const GM = require("../server/gen-models");
const file = path.join(__dirname, "..", "server", "gen-table.js");
const lines = fs.readFileSync(file, "utf8").split("\n");
let added = 0, models = 0; const report = [];
for(let li = 0; li < lines.length; li++){
  const m = lines[li].match(/^(\s*)(\d+):(\[\[.*\]\]),(\s*\/\/.*)$/);
  if(!m) continue;
  const id = m[2], meta = GM[id]; if(!meta) continue;
  const db = dbFor(meta[1], meta[2]); if(!db) continue;
  let entries; try{ entries = JSON.parse(m[3]); }catch(e){ continue; }
  const matched = matchGens(entries, db.gens);
  const used = new Set(matched.filter(Boolean));
  const extras = db.gens.filter(g => !used.has(g));
  let changed = false;
  for(const g of extras){
    const [roman, chassis, from, to] = g;
    const gTo = to || 2100;
    const overlaps = entries.some(([f, t]) => f <= gTo && (t || 2100) >= from && Math.min(gTo, t || 2100) - Math.max(from, f) >= 1);
    if(overlaps) continue;
    entries.push([from, to || 0, chassis || `Gen ${roman}`]);
    changed = true; added++; report.push(`${meta[1]} ${meta[2]}: +${from}-${to || ""} ${chassis || "Gen " + roman}`);
  }
  if(changed){
    entries.sort((a, b) => a[0] - b[0]);
    lines[li] = `${m[1]}${id}:${JSON.stringify(entries)},${m[4]}`;
    models++;
  }
}
fs.writeFileSync(file, lines.join("\n"));
console.error(`added ${added} generations in ${models} models`);
console.error(report.slice(0, 60).join("\n"));
