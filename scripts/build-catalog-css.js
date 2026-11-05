#!/usr/bin/env node
/* Сборка catalog-ref.css — стили каталога Encar (/catalog, /catalog/<id>) 1:1 с эталоном dev.autopartner.by/korea.
   Источник — скомпилированный Tailwind+компонентный бандл эталона (не хранится в репозитории, ~640 КБ):
     node scripts/build-catalog-css.js /path/to/app-B62EBzSW.css,/path/to/app-Cu3VXzGf.css
   Что делает: (1) оставляет только правила, чьи классы реально используются в catalog.html/catalog.js/
   catalog-car.html/catalog-car.js/catalog-car-art.js (Tailwind-утилиты + их компоненты catalog-, cf-, vcard, lot-);
   (2) выбрасывает «голые» элементные селекторы (preflight эталона ломал бы шапку/подвал нашего сайта — вместо него
   свой preflight, ограниченный контейнером .apx-korea, в catalog-ref.extra.css) и тёмную тему (.dark);
   (3) перекрашивает их оранжевый бренд (#f97316/#ea580c/#fb923c/#c2410c…) в наш красный (--red #ed0012);
   (4) дописывает catalog-ref.extra.css (правки под наш сайт: шрифты, шапка, лайтбокс, модалка, тосты).
   Результат коммитится как catalog-ref.css; при изменении классов в HTML/JS — пересобрать. */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const srcArg = process.argv[2];
if(!srcArg){ console.error("usage: node scripts/build-catalog-css.js <ref1.css,ref2.css>"); process.exit(1); }
const css = srcArg.split(",").map(f => fs.readFileSync(f, "utf8")).join("\n");
const htmlFiles = ["catalog.html", "catalog.js", "catalog-car.html", "catalog-car.js", "catalog-car-art.js"].map(f => path.join(root, f));
const html = htmlFiles.map(f => fs.readFileSync(f, "utf8")).join("\n");

// --- какие классы используются ---
const used = new Set();
for(const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
for(const m of html.matchAll(/class=\\"([^"\\]*)\\"/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
for(const m of html.matchAll(/class="([^"]*?)'\s*\+/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
for(const m of html.matchAll(/classList\.(?:add|toggle|remove)\(\s*"([^"]+)"/g)) m[1].split(/\s*,\s*/).forEach(c => used.add(c.replace(/"/g, "")));
for(const m of html.matchAll(/"((?:[a-z0-9]+(?:[_-][a-z0-9]+)*)(?:__|--)?[a-z0-9_-]*)"/g)) { if(/^[a-z][a-z0-9_-]*$/.test(m[1]) && m[1].length > 1) used.add(m[1]); }
for(const m of html.matchAll(/'((?:[a-z0-9]+(?:[_-][a-z0-9]+)*)(?:__|--)?[a-z0-9_-]*)'/g)) { if(/^[a-z][a-z0-9_-]*$/.test(m[1]) && m[1].length > 1) used.add(m[1]); }
for(const m of html.matchAll(/setAttribute\("class",\s*"([^"]+)"/g)) m[1].split(/\s+/).forEach(c => c && used.add(c));
// 05.11.2026: шаблоны выше пропускали куски склейки вида (x ? " has-map" : "") → выпадали правила раскладки
// (.lot-rep__split.has-map в @container). Берём КАЖДОЕ слово из любых строковых литералов: лишний класс
// только оставит лишнее правило, а пропущенный ломает вёрстку.
for(const m of html.matchAll(/"([^"\\\n]*)"|'([^'\\\n]*)'/g)) (m[1] || m[2] || "").split(/\s+/).forEach(c => { if(c.length > 1 && /^[a-z!-][A-Za-z0-9_:\-\[\]\/.%()!#,]*$/.test(c)) used.add(c); });
// состояния/варианты, которые JS/CSS ставят динамически
["is-open","is-on","is-off","is-leaving","is-active","is-loaded","has-error","no-photo","is-list","is-stuck","is-ready","is-animated","is-checked","is-selected","is-shown","is-archived","is-sold","is-copied","is-hit","is-issue","is-ok","is-bad","is-warn","is-clean","is-info","is-main","is-muted","is-mono","is-make","is-link","is-left","is-none","is-claim","is-owner","is-plain","is-risk","is-paid","is-trace","is-damage","is-quiet","is-skeleton","is-burst","is-unburst","is-exterior","is-zoomed","is-linked","catalog-loading","rotate-180","overflow-hidden","max-sm:overflow-hidden","peer","sr-only","group","lot-share-enter","lot-share-from","lot-share-leave","lot-share-to","lot-zone-badge","lot-zone-badge__ring","lot-zone-badge__pop","lot-zone-shape","is-seen"].forEach(c => used.add(c));

// --- разбор CSS через CSSOM Chromium (Playwright): свой текстовый парсер спотыкался на экзотике lightningcss ---
const { chromium } = require("playwright");
function selClasses(sel){ const cls = []; const re = /\.((?:\\.|[A-Za-z0-9_-])+)/g; let m; while((m = re.exec(sel))) cls.push(m[1].replace(/\\(.)/g, "$1")); return cls; }
function keepSel(sel){
  if(/\.dark\b/.test(sel)) return false;
  if(/^:root/.test(sel.trim())) return true;
  const cls = selClasses(sel);
  if(!cls.length) return false; // элементные/атрибутные без класса — свой preflight
  return cls.every(c => used.has(c));
}
function splitSelectors(sel){ // запятые внутри экранированных имён классов (\,) и скобок не разделяют селекторы
  const out = []; let cur = "", depth = 0;
  for(let i = 0; i < sel.length; i++){ const c = sel[i]; if(c === "\\"){ cur += c + (sel[i + 1] || ""); i++; continue; } if(c === "(" || c === "[") depth++; if(c === ")" || c === "]") depth--; if(c === "," && depth === 0){ out.push(cur.trim()); cur = ""; continue; } cur += c; }
  if(cur.trim()) out.push(cur.trim()); return out;
}
function filterSelector(sel){ return splitSelectors(sel).filter(keepSel).join(","); }
async function purge(cssText){
  const browser = await chromium.launch(); const page = await browser.newPage();
  await page.setContent("<!doctype html><html><head><style id=\"s\"></style></head><body></body></html>");
  const tree = await page.evaluate((txt) => {
    document.getElementById("s").textContent = txt;
    const sheet = document.getElementById("s").sheet;
    function walk(rules){
      const out = [];
      for(const r of rules){
        if(r.type === 1) out.push({sel:r.selectorText, body:r.style.cssText});
        else if(r.type === 4) out.push({at:"@media " + r.conditionText, rules:walk(r.cssRules)});
        else if(r.type === 12) out.push({at:"@supports " + r.conditionText, rules:walk(r.cssRules)});
        else if(r.cssRules && r.conditionText !== undefined && r.constructor.name === "CSSContainerRule") out.push({at:"@container " + r.conditionText, rules:walk(r.cssRules)});
        else if(r.constructor.name === "CSSLayerBlockRule") out.push({at:"@layer " + r.name, rules:walk(r.cssRules)});
        else if(r.type === 7 || r.type === 5 || r.constructor.name === "CSSPropertyRule") out.push({raw:r.cssText});
      }
      return out;
    }
    return walk(sheet.cssRules);
  }, cssText);
  await browser.close();
  function emit(rules){
    let s = "";
    for(const r of rules){
      if(r.raw !== undefined){ s += r.raw; continue; }
      if(r.at){ const inner = emit(r.rules); if(inner) s += r.at + "{" + inner + "}"; }
      else { const sel = filterSelector(r.sel); if(sel) s += sel + "{" + r.body + "}"; }
    }
    return s;
  }
  return emit(tree);
}
(async () => {
let out = await purge(css);

// у :root эталона — только нужные переменные (их дизайн-токены), без swiper/лишнего
out = out.replace(/:root\{--swiper[^}]*\}/g, "").replace(/:root\{--f-brand-color:[^}]*\}/g, "");

// --- перекраска бренда (оранжевый → наш красный) ---
const MAP = [
  [/#f97316([0-9a-f]{2})?\b/gi, "#ed0012$1"], [/#ea580c([0-9a-f]{2})?\b/gi, "#c4000f$1"], [/#fb923c([0-9a-f]{2})?\b/gi, "#ff5a63$1"],
  [/#fdba74([0-9a-f]{2})?\b/gi, "#ffb3b8$1"], [/#c2410c([0-9a-f]{2})?\b/gi, "#b0000d$1"], [/#fed7aa([0-9a-f]{2})?\b/gi, "#ffd5d8$1"],
  [/#ffedd5([0-9a-f]{2})?\b/gi, "#ffe8ea$1"], [/#9a3412([0-9a-f]{2})?\b/gi, "#8a000a$1"], [/#7c2d12([0-9a-f]{2})?\b/gi, "#6a0008$1"],
  [/#fff7ed([0-9a-f]{2})?\b/gi, "#fff3f4$1"],
  [/rgb\(249 115 22/g, "rgb(237 0 18"], [/rgb\(251 146 60/g, "rgb(255 90 99"], [/rgb\(194 65 12/g, "rgb(176 0 13"], [/rgb\(234 88 12/g, "rgb(196 0 15"],
  [/rgb\(253 186 116/g, "rgb(255 179 184"], [/rgb\(154 52 18/g, "rgb(138 0 10"], [/rgb\(255 247 237/g, "rgb(255 243 244"],
  [/249 115 22/g, "237 0 18"], [/249_115_22/g, "237_0_18"]
];
MAP.forEach(([re, to]) => { out = out.replace(re, to); });

const extra = fs.readFileSync(path.join(root, "catalog-ref.extra.css"), "utf8");
const header = "/* catalog-ref.css — СГЕНЕРИРОВАНО scripts/build-catalog-css.js из CSS-бандла эталона dev.autopartner.by/korea + catalog-ref.extra.css. Не править руками: правки — в catalog-ref.extra.css, затем пересобрать. */\n";
fs.writeFileSync(path.join(root, "catalog-ref.css"), header + out + "\n" + extra);
console.log("used classes:", used.size, "| source:", css.length, "| purged:", out.length, "| total:", header.length + out.length + extra.length);
})();
