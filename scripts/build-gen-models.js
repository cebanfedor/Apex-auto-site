// Строит server/gen-models.js: model_id → [make_id, "Марка", "Модель"] для моделей из server/gen-table.js.
// Названия берём из комментариев таблицы («// BMW X5»: марка + модель, как в справочнике фида), id марки — из списка производителей (https://apexauto.md/api/auctions?action=manufacturers).
const fs = require("fs"), path = require("path");
(async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "gen-table.js"), "utf8");
  const r = await fetch(`https://apexauto.md/api/auctions?action=manufacturers&x=${Date.now()}`);
  const j = await r.json();
  const makes = (j.items || j.manufacturers || j.data || []).map(m => ({id:m.id, name:String(m.name)})).sort((a, b) => b.name.length - a.name.length);
  const out = {}; let miss = [];
  for(const line of src.split("\n")){
    const m = line.match(/^\s*(\d+):.*\/\/ (.*)$/);
    if(!m) continue;
    const label = m[2].replace(/\s+—.*$/, "").trim();
    const mk = makes.find(x => label.toLowerCase().startsWith(x.name.toLowerCase() + " ") || label.toLowerCase() === x.name.toLowerCase());
    if(!mk){ miss.push(label); continue; }
    out[m[1]] = [mk.id, mk.name, label.slice(mk.name.length).trim()];
  }
  fs.writeFileSync(path.join(__dirname, "..", "server", "gen-models.js"),
    "// model_id → [make_id, марка, модель] для моделей таблицы поколений. Сгенерировано scripts/build-gen-models.js.\nmodule.exports = {\n" +
    Object.entries(out).map(([id, v]) => `  ${id}:${JSON.stringify(v)},`).join("\n") + "\n};\n");
  console.error(`models ${Object.keys(out).length}, unmatched ${miss.length}`, miss.slice(0, 10));
})();
