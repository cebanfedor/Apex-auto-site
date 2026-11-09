// Динамические строки каталога должны переводиться без словарной записи «целиком» (иначе мигает русский на RO/EN)
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function load(){
  const win = { location: { search: "?lang=en", href: "http://x/?lang=en" } };
  const ctx = {
    window: win, localStorage: { getItem(){ return "en"; }, setItem(){} },
    location: win.location, history: { replaceState(){} }, navigator: { language: "ru" },
    URL, URLSearchParams, console,
    document: { currentScript: null, addEventListener(){}, querySelectorAll(){ return []; }, documentElement: { classList: { add(){}, remove(){} } }, createElement(){ return {}; }, head: { appendChild(){} } }
  };
  ctx.self = ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "i18n-dict.js"), "utf8"), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "i18n.js"), "utf8"), ctx);
  return new Promise(res => win.__apexEnsureDict(() => res(win.i18nT)));
}

test("составные и счётные строки переводятся по частям", async () => {
  const T = await load();
  assert.strictEqual(T("100 512 миль ≈ 161 758 км", "en"), "100 512 mi ≈ 161 758 km");
  assert.strictEqual(T("Спереди / Град", "en"), "Front end / Hail");
  assert.strictEqual(T("Выставлялась ранее (2)", "en"), "Listed before (2)");
  assert.strictEqual(T("Менялся лот: 3", "en"), "Lot changed: 3");
  assert.strictEqual(T("12 мин. назад", "en"), "12 min ago");
  assert.strictEqual(T("3 ч. назад", "ro"), "3 ore în urmă");
  assert.strictEqual(T("машин 2024+ года", "en"), "2024+ model-year cars");
});
