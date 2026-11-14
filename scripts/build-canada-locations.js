// Собирает compact canada-locations.js (CANADA_LOCATIONS + координаты + таблица городов, ~12 КБ) из locations.js (~290 КБ) —
// чтобы страницы /canada/<id> не грузили весь locations.js ради тарифов доставки по Канаде.
// Координаты — ПРИБЛИЖЁННЫЕ (центр города площадки), нужны только чтобы выбрать ближайшую площадку; точный адрес двора не нужен.
// Запуск: node scripts/build-canada-locations.js (после правки CANADA_LOCATIONS в locations.js или таблиц ниже).
const fs = require("fs"), path = require("path");
const { CANADA_LOCATIONS } = require("../locations.js");

// Город (lat, lon): площадки Copart/IAAI и крупные города, где стоят авто дилерских аукционов
const C = {
  "montreal":[45.50,-73.57], "laval":[45.57,-73.75], "saint-eustache":[45.56,-73.90], "mascouche":[45.75,-73.60], "quebec city":[46.81,-71.21],
  "ottawa":[45.42,-75.70], "toronto":[43.65,-79.38], "london":[42.98,-81.25], "cookstown":[44.20,-79.65], "tottenham":[44.02,-79.80],
  "oshawa":[43.90,-78.85], "stouffville":[43.97,-79.25], "hamilton":[43.26,-79.87], "caledon east":[43.87,-79.99], "sudbury":[46.49,-81.00],
  "halifax":[44.65,-63.57], "moncton":[46.09,-64.78], "st. john's":[47.56,-52.71], "saskatoon":[52.13,-106.67], "regina":[50.45,-104.62],
  "moose jaw":[50.39,-105.53], "north battleford":[52.78,-108.29], "prince albert":[53.20,-105.75], "yorkton":[51.21,-102.46], "lloydminster":[53.28,-110.00],
  "meadow lake":[54.13,-108.43], "calgary":[51.05,-114.07], "edmonton":[53.55,-113.49], "winnipeg":[49.90,-97.14], "niverville":[49.60,-97.04],
  "stony mountain":[50.10,-97.20], "st claude":[49.67,-98.34], "steinbach":[49.53,-96.68], "vancouver":[49.28,-123.12], "surrey":[49.19,-122.85],
  "mission":[49.13,-122.31], "abbotsford":[49.05,-122.31], "new westminster":[49.20,-122.91], "victoria":[48.43,-123.37], "kamloops":[50.67,-120.33],
  "kelowna":[49.89,-119.50], "penticton":[49.50,-119.59], "princeton":[49.46,-120.51], "chetwynd":[55.70,-121.63], "nanaimo":[49.17,-123.94], "vernon":[50.27,-119.27],
  // дополнительные города (только для определения точки лота)
  "mississauga":[43.59,-79.64], "brampton":[43.73,-79.76], "markham":[43.86,-79.34], "vaughan":[43.84,-79.51], "kitchener":[43.45,-80.49], "waterloo":[43.46,-80.52],
  "windsor":[42.32,-83.04], "barrie":[44.39,-79.69], "kingston":[44.23,-76.49], "peterborough":[44.30,-78.32], "niagara falls":[43.09,-79.08], "st. catharines":[43.16,-79.24],
  "burlington":[43.33,-79.80], "guelph":[43.55,-80.25], "cambridge":[43.36,-80.31], "brantford":[43.14,-80.26], "thunder bay":[48.38,-89.25], "sault ste. marie":[46.52,-84.35],
  "gatineau":[45.48,-75.70], "sherbrooke":[45.40,-71.89], "trois-rivieres":[46.34,-72.54], "saguenay":[48.43,-71.07], "longueuil":[45.53,-73.52], "levis":[46.80,-71.18],
  "fredericton":[45.96,-66.64], "saint john":[45.27,-66.06], "charlottetown":[46.24,-63.13], "sydney":[46.14,-60.19], "red deer":[52.27,-113.81], "lethbridge":[49.69,-112.84],
  "medicine hat":[50.04,-110.68], "grande prairie":[55.17,-118.80], "fort mcmurray":[56.73,-111.38], "brandon":[49.85,-99.95], "richmond":[49.17,-123.14], "burnaby":[49.25,-122.98],
  "richmond hill":[43.88,-79.44], "oakville":[43.45,-79.68], "pickering":[43.84,-79.09], "ajax":[43.85,-79.02], "whitby":[43.90,-78.94], "newmarket":[44.06,-79.46], "aurora":[44.00,-79.47], "milton":[43.52,-79.88], "scarborough":[43.77,-79.26], "etobicoke":[43.65,-79.57], "north york":[43.76,-79.41], "coquitlam":[49.28,-122.79], "langley":[49.10,-122.66], "prince george":[53.92,-122.75]
};
// Провинция города — чтобы «Richmond Hill, Ontario» не принять за Richmond (BC)
const PROV = {
  QC:["montreal","laval","saint-eustache","mascouche","quebec city","gatineau","sherbrooke","trois-rivieres","saguenay","longueuil","levis"],
  NS:["halifax","sydney"], NB:["moncton","fredericton","saint john"], NF:["st. john's"], PE:["charlottetown"],
  MB:["winnipeg","niverville","stony mountain","st claude","steinbach","brandon"],
  SK:["saskatoon","regina","moose jaw","north battleford","prince albert","yorkton","lloydminster","meadow lake"],
  AB:["calgary","edmonton","red deer","lethbridge","medicine hat","grande prairie","fort mcmurray"],
  BC:["vancouver","surrey","mission","abbotsford","new westminster","victoria","kamloops","kelowna","penticton","princeton","chetwynd","nanaimo","vernon","richmond","burnaby","coquitlam","langley","prince george"]
};
for(const k of Object.keys(C)){ const pv = Object.keys(PROV).find(x => PROV[x].includes(k)) || "ON"; C[k].push(pv); }
// Центры провинций — запасной вариант, когда города нет в таблице
const P = {ON:[44.5,-79.8], QC:[46.0,-72.5], NS:[44.9,-63.2], NB:[46.2,-66.0], NF:[48.5,-56.0], NL:[48.5,-56.0], PE:[46.3,-63.2], MB:[49.9,-97.3], SK:[52.0,-106.0], AB:[52.5,-114.0], BC:[50.5,-121.0]};

// Площадка → город (по названию в locations.js)
function yardCity(n){
  const s = String(n).toLowerCase();
  const rules = [
    [/montreal \/ laval/, "laval"], [/saint-eustache|adesa/, "saint-eustache"], [/mascouche/, "mascouche"], [/daudelin/, "montreal"], [/quebec city/, "quebec city"], [/montreal/, "montreal"],
    [/oshawa/, "oshawa"], [/stouffville/, "stouffville"], [/hamilton/, "hamilton"], [/caledon/, "caledon east"], [/sudbury/, "sudbury"], [/cookstown/, "cookstown"], [/tottenham|north toronto/, "tottenham"],
    [/ottawa/, "ottawa"], [/toronto/, "toronto"], [/london/, "london"], [/halifax/, "halifax"], [/moncton/, "moncton"], [/st\. john/, "st. john's"],
    [/winnipeg|full tilt|kitson|terry/, "winnipeg"], [/niverville/, "niverville"], [/rockwood|stony mountain/, "stony mountain"], [/st claude/, "st claude"], [/steinbach/, "steinbach"],
    [/saskatoon|wismer/, "saskatoon"], [/regina/, "regina"], [/moose jaw/, "moose jaw"], [/north battleford/, "north battleford"], [/prince albert/, "prince albert"], [/yorkton/, "yorkton"],
    [/lloydminster/, "lloydminster"], [/meadow lake|mccallum/, "meadow lake"], [/calgary/, "calgary"], [/edmonton/, "edmonton"],
    [/surrey|achbc/, "surrey"], [/mission|jack2/, "mission"], [/vancouver/, "vancouver"], [/abbotsford/, "abbotsford"], [/new west/, "new westminster"], [/victoria/, "victoria"],
    [/kamloops/, "kamloops"], [/kelowna/, "kelowna"], [/penticton/, "penticton"], [/princeton/, "princeton"], [/chetwynd/, "chetwynd"], [/nanaimo/, "nanaimo"], [/vernon/, "vernon"]
  ];
  for(const [re, c] of rules) if(re.test(s)) return c;
  return null;
}

const missing = [];
const rows = CANADA_LOCATIONS.map(l => {
  const c = yardCity(l.name), xy = c ? C[c] : null;
  if(!xy) missing.push(l.name);
  return "  " + JSON.stringify(Object.assign({}, l, xy ? {lat:xy[0], lon:xy[1]} : {}));
}).join(",\n");
if(missing.length){ console.error("нет координат:", missing); process.exit(1); }
const out = "/* СГЕНЕРИРОВАНО scripts/build-canada-locations.js из locations.js (CANADA_LOCATIONS) — руками не править. lat/lon — приближённо (центр города). */\n"
  + "(function(r){ r.CANADA_LOCATIONS = [\n" + rows + "\n];\nr.CANADA_CITIES = " + JSON.stringify(C) + ";\nr.CANADA_PROV_CENTERS = " + JSON.stringify(P) + "; })(typeof window !== \"undefined\" ? window : globalThis);\n";
fs.writeFileSync(path.join(__dirname, "..", "canada-locations.js"), out);
console.log("ok", CANADA_LOCATIONS.length, "locations,", out.length, "bytes");
