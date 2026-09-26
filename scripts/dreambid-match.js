// Сопоставление наших моделей (server/gen-models.js) с моделями справочника DreamBid (scripts/dreambid-gens.json: slug → [[римский номер, кузов, с, по]]).
// Справочник снят с https://app.dreambid.pl/api/dictionaries/models (публичный, 26.09.2026); их model id не совпадают с нашими (фид auctionsapi), сверка идёт по названию.
const fs = require("fs"), path = require("path");
const DB = JSON.parse(fs.readFileSync(path.join(__dirname, "dreambid-gens.json"), "utf8"));
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const fix = s => String(s).toLowerCase().replace(/(\d)er\b/, "$1 series").replace(/-?klasse/, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, "");
const ALIAS = {mazdamx5:"mazdamx5miata", chevroletbolt:"chevroletboltev", dodgeram:"dodge1500", chevroletsilverado:"chevroletsilverado1500",
  subaruxv:"subarucrosstrek", nissannavarafrontier:"nissanfrontier", jeeplibertypatriot:"jeeppatriot", jeeplibertynorthamerica:"jeepliberty", volkswagenpassatcc:"volkswagencc"};
const bySlug = new Map(Object.entries(DB).map(([slug, gens]) => [norm(slug), {slug, gens}]));
function dbFor(makeName, modelName){ const k = fix(makeName + " " + modelName); return bySlug.get(ALIAS[k] || k) || null; }
// ближайшее по году начала поколение DreamBid (±3), каждое используется не более одного раза
function matchGens(entries, dbGens){
  const used = new Set();
  return entries.map(([from]) => {
    const c = dbGens.map((g, i) => ({g, i, d:Math.abs(g[2] - from)})).filter(x => x.d <= 3 && !used.has(x.i)).sort((a, b) => a.d - b.d)[0];
    if(c){ used.add(c.i); return c.g; }
    return null;
  });
}
module.exports = {dbFor, matchGens, DB};
