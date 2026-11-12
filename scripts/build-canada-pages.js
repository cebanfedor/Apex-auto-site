// Собирает страницы раздела «Авто из Канады» (OpenLane) из корейских: canada.html ← catalog.html, canada-car.html ← catalog-car.html.
// Движок один (catalog.js / catalog-car.js): <main data-cat-src="ca"> переключает источник, запросы идут с src=ca.
// Запуск после ЛЮБОЙ правки catalog.html / catalog-car.html:  node scripts/build-canada-pages.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
function build(src, dst, reps){
  let s = fs.readFileSync(path.join(root, src), "utf8");
  for(const [a, b, all] of reps){
    if(!s.includes(a)) throw new Error(`${src}: не найдено «${a.slice(0, 60)}»`);
    s = all ? s.split(a).join(b) : s.replace(a, b);
  }
  s = s.replace("<!DOCTYPE html>", "<!DOCTYPE html>\n<!-- СГЕНЕРИРОВАНО scripts/build-canada-pages.js из " + src + " — руками не править -->");
  fs.writeFileSync(path.join(root, dst), s);
  console.log("ok", dst);
}
const DESC = "Авто из Канады с дилерских аукционов: машины после лизинга и trade-in, с отчётом о состоянии и Carfax. Фильтры по марке, модели, цене, году и пробегу; доставка под ключ в Молдову.";
const MAIN = ['<main id="main" class="apx-korea relative', '<main id="main" data-cat-src="ca" class="apx-korea relative'];
build("catalog.html", "canada.html", [
  // расчёт «под ключ» (korea-calc.js) — только для Кореи
  ['  <script src="/calc-core.js?v=core-v21" defer></script>\n  <script src="/korea-calc.js?v=kr-v5" defer></script>\n', ''],
  ["<title>Авто из Кореи — каталог Encar | Apex Auto</title>", "<title>Авто из Канады — дилерские аукционы | Apex Auto</title>"],
  [/<meta name="description" content="[^"]*">/.exec(fs.readFileSync(path.join(root, "catalog.html"), "utf8"))[0], `<meta name="description" content="${DESC}">`],
  ['<link rel="canonical" href="https://apexauto.md/korea">', '<link rel="canonical" href="https://apexauto.md/canada">'],
  ['<meta property="og:title" content="Авто из Кореи — каталог Encar | Apex Auto">', '<meta property="og:title" content="Авто из Канады — дилерские аукционы | Apex Auto">'],
  ['<meta property="og:description" content="Авто из Южной Кореи с пробегом и историей, доставка под ключ в Молдову.">', '<meta property="og:description" content="Авто из Канады с дилерских аукционов, доставка под ключ в Молдову.">'],
  ['<meta property="og:url" content="https://apexauto.md/korea">', '<meta property="og:url" content="https://apexauto.md/canada">'],
  ['<meta property="og:image" content="https://apexauto.md/assets/og/korea.png?v=1">', '<meta property="og:image" content="https://apexauto.md/assets/og/canada.png?v=1">'],
  ['<meta name="twitter:title" content="Авто из Кореи — каталог Encar | Apex Auto">', '<meta name="twitter:title" content="Авто из Канады — дилерские аукционы | Apex Auto">'],
  ['<meta name="twitter:description" content="Авто из Южной Кореи с пробегом и историей, доставка под ключ в Молдову.">', '<meta name="twitter:description" content="Авто из Канады с дилерских аукционов, доставка под ключ в Молдову.">'],
  ['<meta name="twitter:image" content="https://apexauto.md/assets/og/korea.png?v=1">', '<meta name="twitter:image" content="https://apexauto.md/assets/og/canada.png?v=1">'],
  ['hreflang="ru" href="https://apexauto.md/korea"', 'hreflang="ru" href="https://apexauto.md/canada"'],
  ['hreflang="ro" href="https://apexauto.md/korea?lang=ro"', 'hreflang="ro" href="https://apexauto.md/canada?lang=ro"'],
  ['hreflang="en" href="https://apexauto.md/korea?lang=en"', 'hreflang="en" href="https://apexauto.md/canada?lang=en"'],
  ['hreflang="x-default" href="https://apexauto.md/korea"', 'hreflang="x-default" href="https://apexauto.md/canada"'],
  ['"name":"Авто из Кореи — каталог Encar","url":"https://apexauto.md/korea"', '"name":"Авто из Канады — дилерские аукционы","url":"https://apexauto.md/canada"'],
  ['"name":"Авто из Кореи","item":"https://apexauto.md/korea"', '"name":"Авто из Канады","item":"https://apexauto.md/canada"'],
  MAIN,
  ['class="navQuickV1" href="/canada"', 'class="navQuickV1 active" href="/canada"'],
  ['class="navQuickV1 active" href="/korea"', 'class="navQuickV1" href="/korea"'],
  ['<span class="crumb-current">Авто из Кореи</span>', '<span class="crumb-current">Авто из Канады</span>'],
  ['sm:text-[40px]">Авто из Кореи</h1>', 'sm:text-[40px]">Авто из Канады</h1>'],
  ['<p class="catalog-intro">Авто из Южной Кореи с пробегом и историей, доставка под ключ.</p>', '<p class="catalog-intro">Дилерские аукционы Канады: машины после лизинга и trade-in, с отчётом о состоянии. Доставка под ключ.</p>'],
]);
build("catalog-car.html", "canada-car.html", [
  // расчёт доставки и растаможки (korea-calc.js) — только для Кореи; в Канаде блока нет, скрипты не нужны
  ['  <script src="/calc-core.js?v=core-v21" defer></script>\n  <script src="/korea-calc.js?v=kr-v5" defer></script>\n', ''],
  ['<title id="catCarTitleTagV1">Автомобиль из Кореи | Apex Auto</title>', '<title id="catCarTitleTagV1">Автомобиль из Канады | Apex Auto</title>'],
  MAIN,
  ['class="navQuickV1" href="/canada"', 'class="navQuickV1 active" href="/canada"'],
  ['class="navQuickV1 active" href="/korea"', 'class="navQuickV1" href="/korea"'],
  ['<a href="/korea" class="crumb">Авто из Кореи</a>', '<a href="/canada" class="crumb">Авто из Канады</a>'],
  ['<a class="btn btn-dark btn-sm" href="/korea">← Вернуться в каталог</a>', '<a class="btn btn-dark btn-sm" href="/canada">← Вернуться в каталог</a>'],
]);
