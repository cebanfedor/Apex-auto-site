// Индекс моделей для страниц /models/<slug> — «цены продаж Toyota Camry на аукционах США».
// Список — те же 50 моделей, что лежат в sitemap.xml (подобраны по РЕАЛЬНОМУ числу авто в каталоге,
// 27.09.2026). Названия марок/моделей — из server/gen-models.js, отображаемые имена — ниже.
const GM = require("./gen-models");

// model_id → отображаемое имя (где справочник отдаёт технические/устаревшие названия)
const DISPLAY = {
  906: "RAV4",
  2741: "Model 3",
  93: "3 Series",
  1884: "Crosstrek",
  1097: "Frontier",
  1016: "Ram 1500",
  356: "CR-V"
};

const TOP_MODEL_IDS = [872,354,876,356,394,1364,906,323,431,1904,398,429,1483,305,1600,448,1385,432,828,1686,324,1501,1321,3219,2741,93,1449,910,138,481,1471,3119,150,678,243,1390,860,1884,1485,476,338,1427,1020,131,1097,1016,302,2999,163,2231];

function slugify(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function build(){
  const list = [];
  const seen = new Set();
  for(const id of TOP_MODEL_IDS){
    const e = GM[id];
    if(!e) continue;
    const [makeId, make, model] = e;
    const display = DISPLAY[id] || String(model).replace(/\s*\(.*$/, "").trim();
    const slug = slugify(`${make}-${display}`);
    if(!slug || seen.has(slug)) continue;
    seen.add(slug);
    list.push({slug, makeId, modelId:id, make, model:display, name:`${make} ${display}`});
  }
  return list;
}

const MODELS = build();
const BY_SLUG = new Map(MODELS.map(m => [m.slug, m]));

module.exports = {MODELS, bySlug:s => BY_SLUG.get(String(s || "").toLowerCase()) || null, slugify, TOP_MODEL_IDS};
