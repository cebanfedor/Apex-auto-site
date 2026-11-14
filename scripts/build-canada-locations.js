// Собирает compact canada-locations.js (только CANADA_LOCATIONS, ~8 КБ) из locations.js (~290 КБ) —
// чтобы страницы /canada/<id> не грузили весь locations.js ради тарифов доставки по Канаде.
// Запуск: node scripts/build-canada-locations.js (после правки CANADA_LOCATIONS в locations.js).
const fs = require("fs"), path = require("path");
const { CANADA_LOCATIONS } = require("../locations.js");
const rows = CANADA_LOCATIONS.map(l => "  " + JSON.stringify(l)).join(",\n");
const out = "/* СГЕНЕРИРОВАНО scripts/build-canada-locations.js из locations.js (CANADA_LOCATIONS) — руками не править. */\n"
  + "(function(r){ r.CANADA_LOCATIONS = [\n" + rows + "\n]; })(typeof window !== \"undefined\" ? window : globalThis);\n";
fs.writeFileSync(path.join(__dirname, "..", "canada-locations.js"), out);
console.log("ok", CANADA_LOCATIONS.length, "locations,", out.length, "bytes");
