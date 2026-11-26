const fs = require("fs");
const path = require("path");
const {MODELS, bySlug} = require("../server/model-index");
const {money} = require("../server/og-card");

// SSR-страница /models/<slug> (26.11.2026): «Toyota Camry с аукционов США — цены продаж и доставка в Молдову».
// Данные — реальные продажи из нашей базы (action=modelstats, без запросов к провайдеру). Цифры не выдумываем:
// мало продаж (<30) — страница отдаётся с noindex и без таблиц.
const SSR_FETCH_MS = 7000;
const MIN_INDEX_N = 30;

const escAttr = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escHtml = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const safeJson = o => JSON.stringify(o).replace(/</g, "\\u003c");

const MONTHS = {
  ru:["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."],
  ro:["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."],
  en:["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
};
const ym = (iso, lang) => { const m = /^(\d{4})-(\d{2})/.exec(iso || ""); return m ? `${MONTHS[lang][Number(m[2]) - 1]} ${m[1]}` : ""; };
const num = n => Math.round(Number(n) || 0).toLocaleString("en-US").replace(/,/g, " ");

const DMG = {
  front:{ru:"Передняя часть", ro:"Față", en:"Front end"},
  rear:{ru:"Задняя часть", ro:"Spate", en:"Rear end"},
  side:{ru:"Бок", ro:"Lateral", en:"Side"},
  hail:{ru:"Град", ro:"Grindină", en:"Hail"},
  mechanical:{ru:"Механика", ro:"Mecanică", en:"Mechanical"},
  minor:{ru:"Лёгкие повреждения и износ", ro:"Daune ușoare și uzură", en:"Minor damage and wear"},
  other:{ru:"Другое", ro:"Altele", en:"Other"}
};

async function fetchStats(req, m){
  const {selfOrigin} = require("../server/origin");
  const url = `${selfOrigin(req)}/api/auctions?action=modelstats&make_id=${m.makeId}&model_id=${m.modelId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SSR_FETCH_MS);
  try{
    const r = await fetch(url, {headers:{accept:"application/json", ...(process.env.CRON_SECRET ? {"x-internal":process.env.CRON_SECRET} : {})}, signal:controller.signal});
    if(r.status === 503) return {_unavailable:true};
    const p = await r.json().catch(() => null);
    if(!r.ok || !p || p.ok === false) return {_unavailable:true};
    return p;
  }catch(e){ return {_unavailable:true}; }
  finally{ clearTimeout(timer); }
}

const HREF = {
  importCost:{ru:"/import-cost", ro:"/ro/cost-import-auto", en:"/en/car-import-cost"},
  damages:{ru:"/damages", ro:"/ro/daune-auto", en:"/damages?lang=en"},
  fees:{ru:"/auction-fees", ro:"/ro/taxele-licitatiilor", en:"/auction-fees?lang=en"}
};

function render(html, {lang, title, description, canonical, alts, ogImage, body, robots, ld, status, res}){
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escAttr(canonical)}">${alts}`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escAttr(description)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escAttr(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escAttr(description)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escAttr(canonical)}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escAttr(ogImage)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escAttr(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escAttr(description)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escAttr(ogImage)}">`)
    .replace(`<section id="vinDetailV1" class="vinDetailV1"></section>`, `<section id="vinDetailV1" class="vinDetailV1">${body}</section>`)
    .replace("</head>", `${robots ? `<meta name="robots" content="${robots}">\n` : ""}${(ld || []).map(o => `<script type="application/ld+json">${safeJson(o)}</script>\n`).join("")}</head>`);
  return html;
}

const statBox = (k, v) => `<div style="flex:1 1 150px;min-width:140px;padding:14px 16px;border:1px solid var(--aLine,#e6eaf0);border-radius:14px;background:#fff"><div style="font-size:12px;color:var(--aMuted,#6b7280);text-transform:uppercase;letter-spacing:.04em">${escHtml(k)}</div><div style="font-size:22px;font-weight:800;margin-top:4px" data-no-i18n="true">${escHtml(v)}</div></div>`;

module.exports = async function(req, res){
  let html;
  try{ html = fs.readFileSync(path.join(__dirname, "../vin.html"), "utf8"); }
  catch(e){ res.status(500).send("template not found"); return; }

  const langQ = String(req.query.lang || "").toLowerCase();
  const lang = langQ.startsWith("ro") ? "ro" : langQ.startsWith("en") ? "en" : "ru";
  const L3 = (ru, ro, en) => lang === "ro" ? ro : lang === "en" ? en : ru;
  const slug = String(req.query.slug || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const base = slug ? `https://apexauto.md/models/${slug}` : "https://apexauto.md/models";
  const canonical = lang === "ru" ? base : `${base}?lang=${lang}`;
  const alts = `\n  <link rel="alternate" hreflang="ru" href="${base}">\n  <link rel="alternate" hreflang="ro" href="${base}?lang=ro">\n  <link rel="alternate" hreflang="en" href="${base}?lang=en">\n  <link rel="alternate" hreflang="x-default" href="${base}">`;
  const ogImage = `https://apexauto.md/assets/og/${lang === "ru" ? "auctions.png" : lang === "ro" ? "auctions-ro.png" : "auctions-en.png"}`;
  const langQs = lang === "ru" ? "" : `?lang=${lang}`;

  // ---- хаб /models: список моделей со ссылками (без базы)
  if(!slug){
    const title = L3("Цены на авто с аукционов США по моделям | Apex Auto", "Prețuri auto de la licitațiile din SUA pe modele | Apex Auto", "Auction car prices by model (USA) | Apex Auto");
    const description = L3("Реальные цены продаж популярных моделей на Copart и IAAI: Toyota Camry, Honda Civic, Tesla Model 3 и другие. Доставка в Молдову под ключ.", "Prețuri reale de vânzare pentru modelele populare la Copart și IAAI: Toyota Camry, Honda Civic, Tesla Model 3 și altele. Livrare la cheie în Moldova.", "Real sale prices of popular models at Copart and IAAI: Toyota Camry, Honda Civic, Tesla Model 3 and more. Turnkey delivery to Moldova.");
    const items = MODELS.map(m => `<li><a href="/models/${m.slug}${langQs}" data-no-i18n="true">${escHtml(m.name)}</a></li>`).join("");
    const body = `<nav class="auctionCrumbsV1" aria-label="breadcrumb"><span class="crumbRootV1"><a href="/">${L3("Главная", "Acasă", "Home")}</a> / </span><span class="crumbCurV1">${L3("Модели", "Modele", "Models")}</span></nav>
      <h1>${escHtml(L3("Цены на авто с аукционов США по моделям", "Prețuri auto de la licitațiile din SUA pe modele", "Auction car prices by model (USA)"))}</h1>
      <p class="vhLeadV1">${escHtml(L3("Выберите модель — покажем, за сколько реально продавались такие машины на Copart и IAAI, по каким повреждениям и годам.", "Alegeți modelul — arătăm cu cât s-au vândut de fapt astfel de mașini la Copart și IAAI, pe daune și ani.", "Pick a model to see what such cars actually sold for at Copart and IAAI, by damage and year."))}</p>
      <ul style="columns:2;column-gap:32px;line-height:2;padding-left:18px">${items}</ul>`;
    const ld = [{"@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement:[
      {"@type":"ListItem", position:1, name:L3("Главная", "Acasă", "Home"), item:"https://apexauto.md/"},
      {"@type":"ListItem", position:2, name:L3("Модели", "Modele", "Models"), item:base}]}];
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=21600, max-age=300, stale-while-revalidate=86400");
    res.status(200).send(render(html, {lang, title, description, canonical, alts, ogImage, body, robots:"", ld}));
    return;
  }

  const m = bySlug(slug);
  if(!m){
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(404).send(render(html, {lang, title:"404 | Apex Auto", description:"", canonical, alts:"", ogImage, body:"", robots:"noindex"}));
    return;
  }

  const payload = await fetchStats(req, m);
  if(payload._unavailable){
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "30");
    res.status(503).send(render(html, {lang, title:`${m.name} | Apex Auto`, description:"", canonical, alts:"", ogImage, body:`<p>${escHtml(L3("Страница временно недоступна, обновите через минуту.", "Pagina este temporar indisponibilă, reîncărcați peste un minut.", "This page is temporarily unavailable, please refresh in a minute."))}</p>`, robots:"noindex"}));
    return;
  }
  const st = payload.stats;
  const name = m.name;
  const crumbs = `<nav class="auctionCrumbsV1" aria-label="breadcrumb"><span class="crumbRootV1"><a href="/">${L3("Главная", "Acasă", "Home")}</a> / <a href="/models${langQs}">${L3("Модели", "Modele", "Models")}</a> / </span><span class="crumbCurV1" data-no-i18n="true">${escHtml(name)}</span></nav>`;
  const catalogHref = `/auctions?make=${m.makeId}&model=${m.modelId}`;
  const calcHref = "/#calculator";
  const importHref = HREF.importCost[lang];
  const title = L3(`${name} с аукционов США: цены продаж и доставка в Молдову | Apex Auto`, `${name} de la licitațiile din SUA: prețuri și livrare în Moldova | Apex Auto`, `${name} from US auctions: sale prices and delivery to Moldova | Apex Auto`);
  const h1 = L3(`${name} с аукционов США: цены продаж и доставка в Молдову`, `${name} de la licitațiile din SUA: prețuri de vânzare și livrare în Moldova`, `${name} from US auctions: sale prices and delivery to Moldova`);

  if(!st || st.n < MIN_INDEX_N){
    const description = L3(`${name} на аукционах Copart и IAAI: смотрите текущие лоты и считайте цену под ключ с доставкой в Молдову.`, `${name} la licitațiile Copart și IAAI: vedeți loturile curente și calculați prețul la cheie cu livrare în Moldova.`, `${name} at Copart and IAAI auctions: browse current lots and calculate the turnkey price with delivery to Moldova.`);
    const body = `${crumbs}<h1>${escHtml(h1)}</h1>
      <p class="vhLeadV1">${escHtml(L3("Статистика продаж по этой модели пока собирается. Текущие лоты и расчёт под ключ доступны уже сейчас.", "Statistica vânzărilor pentru acest model se colectează încă. Loturile curente și calculul la cheie sunt disponibile deja.", "Sales statistics for this model are still being collected. Current lots and the turnkey calculator are available now."))}</p>
      <p><a class="dbBtnPrimary" href="${catalogHref}">${escHtml(L3("Смотреть лоты", "Vezi loturile", "Browse lots"))} →</a></p>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=1800, max-age=120, stale-while-revalidate=86400");
    res.status(200).send(render(html, {lang, title, description, canonical, alts, ogImage, body, robots:"noindex"}));
    return;
  }

  const period = [ym(st.from, lang), ym(st.to, lang)].filter(Boolean);
  const periodTxt = period.length === 2 ? `${period[0]} – ${period[1]}` : "";
  const description = L3(
    `${name} на Copart и IAAI: медианная цена продажи ${money(st.median)}, чаще всего ${money(st.p25)}–${money(st.p75)} (${st.n} продаж). Доставка и растаможка в Молдове — Apex Auto.`,
    `${name} la Copart și IAAI: prețul median de vânzare ${money(st.median)}, de obicei ${money(st.p25)}–${money(st.p75)} (${st.n} vânzări). Livrare și vămuire în Moldova — Apex Auto.`,
    `${name} at Copart and IAAI: median sale price ${money(st.median)}, usually ${money(st.p25)}–${money(st.p75)} (${st.n} sales). Delivery and customs in Moldova — Apex Auto.`);

  const lead = L3(
    `По ${st.n} проданным лотам ${name} на аукционах Copart и IAAI (США${periodTxt ? `, ${periodTxt}` : ""}) медианная цена продажи составила ${money(st.median)}, а большинство машин ушло в диапазоне ${money(st.p25)}–${money(st.p75)}. Это цена на торгах без сборов аукциона, доставки и растаможки.`,
    `Din ${st.n} loturi ${name} vândute la licitațiile Copart și IAAI (SUA${periodTxt ? `, ${periodTxt}` : ""}) prețul median de vânzare a fost ${money(st.median)}, iar majoritatea mașinilor s-au vândut între ${money(st.p25)} și ${money(st.p75)}. Este prețul la licitație, fără taxele licitației, transport și vămuire.`,
    `Across ${st.n} sold ${name} lots at Copart and IAAI (USA${periodTxt ? `, ${periodTxt}` : ""}) the median sale price was ${money(st.median)}, and most cars sold between ${money(st.p25)} and ${money(st.p75)}. This is the auction price, excluding auction fees, shipping and customs.`);

  const boxes = [
    statBox(L3("Продаж", "Vânzări", "Sales"), String(st.n)),
    statBox(L3("Медиана", "Mediană", "Median"), money(st.median)),
    statBox(L3("Типичный диапазон", "Interval tipic", "Typical range"), `${money(st.p25)}–${money(st.p75)}`),
    st.medianMiles ? statBox(L3("Медианный пробег", "Kilometraj median", "Median mileage"), `${num(st.medianMiles)} ${L3("миль", "mile", "mi")}`) : ""
  ].join("");

  const yearsHtml = st.years && st.years.length ? `<h2 class="vhH2V1">${escHtml(L3("Цены продаж по годам выпуска", "Prețuri de vânzare pe ani de fabricație", "Sale prices by model year"))}</h2>
    <table class="vhTableV1"><thead><tr><th>${escHtml(L3("Год", "An", "Year"))}</th><th>${escHtml(L3("Продаж", "Vânzări", "Sales"))}</th><th>${escHtml(L3("Медиана", "Mediană", "Median"))}</th><th>${escHtml(L3("Диапазон", "Interval", "Range"))}</th></tr></thead><tbody>${st.years.map(y => `<tr><td data-no-i18n="true">${y.year}</td><td data-no-i18n="true">${y.n}</td><td data-no-i18n="true">${escHtml(money(y.median))}</td><td data-no-i18n="true">${escHtml(money(y.p25))}–${escHtml(money(y.p75))}</td></tr>`).join("")}</tbody></table>
    <p style="font-size:12.5px;color:var(--aMuted,#6b7280)">${escHtml(L3("Показаны годы, по которым есть не меньше 5 продаж.", "Sunt afișați anii cu cel puțin 5 vânzări.", "Years with at least 5 sales are shown."))}</p>` : "";

  const dmgHtml = st.damages && st.damages.length ? `<h2 class="vhH2V1">${escHtml(L3("Какие повреждения встречаются и сколько они стоят", "Ce daune apar și cât costă", "Which damage types occur and what they sell for"))}</h2>
    <table class="vhTableV1"><thead><tr><th>${escHtml(L3("Повреждение", "Daună", "Damage"))}</th><th>${escHtml(L3("Доля", "Pondere", "Share"))}</th><th>${escHtml(L3("Медиана", "Mediană", "Median"))}</th><th>${escHtml(L3("Диапазон", "Interval", "Range"))}</th></tr></thead><tbody>${st.damages.map(d => `<tr><td>${escHtml((DMG[d.key] || DMG.other)[lang])}</td><td data-no-i18n="true">${d.share}%</td><td data-no-i18n="true">${escHtml(money(d.median))}</td><td data-no-i18n="true">${escHtml(money(d.p25))}–${escHtml(money(d.p75))}</td></tr>`).join("")}</tbody></table>
    <p style="font-size:12.5px;color:var(--aMuted,#6b7280)">${L3(`Что значит каждое повреждение и когда оно опасно — в статье <a href="${HREF.damages.ru}">«Какие повреждения опасны, а какие нет»</a>.`, `Ce înseamnă fiecare daună și când este periculoasă — în articolul <a href="${HREF.damages.ro}">„Ce daune sunt periculoase”</a>.`, `What each damage means and when it is dangerous — in <a href="${HREF.damages.en}">our damage guide</a>.`)}</p>` : "";

  const topDmg = st.damages && st.damages[0];
  const faq = [
    [L3(`Сколько стоит ${name} на аукционе в США?`, `Cât costă ${name} la licitație în SUA?`, `How much does ${name} cost at a US auction?`),
      L3(`По ${st.n} продажам на Copart и IAAI медианная цена ${name} — ${money(st.median)}, чаще всего ${money(st.p25)}–${money(st.p75)}. Это цена торгов без сборов аукциона, доставки и растаможки.`, `Pe baza a ${st.n} vânzări la Copart și IAAI, prețul median pentru ${name} este ${money(st.median)}, de obicei ${money(st.p25)}–${money(st.p75)}. Este prețul licitației, fără taxe, transport și vămuire.`, `Based on ${st.n} sales at Copart and IAAI, the median price of ${name} is ${money(st.median)}, usually ${money(st.p25)}–${money(st.p75)}. This is the auction price, without fees, shipping or customs.`)]
  ];
  if(topDmg){
    const dn = (DMG[topDmg.key] || DMG.other)[lang];
    faq.push([L3(`Какие повреждения у ${name} встречаются чаще всего?`, `Ce daune apar cel mai des la ${name}?`, `What damage is most common on ${name}?`),
      L3(`Чаще всего встречается повреждение «${dn}» — ${topDmg.share}% продаж, медианная цена ${money(topDmg.median)}.`, `Cea mai frecventă daună este „${dn}” — ${topDmg.share}% din vânzări, preț median ${money(topDmg.median)}.`, `The most common damage is “${dn}” — ${topDmg.share}% of sales, median price ${money(topDmg.median)}.`)]);
  }
  faq.push([L3(`Во сколько обойдётся ${name} под ключ в Молдове?`, `Cât costă ${name} la cheie în Moldova?`, `What is the turnkey cost of ${name} in Moldova?`),
    L3("К цене лота добавляются сборы аукциона, доставка по США и морем, страховка, растаможка и комиссии. Точная сумма зависит от года, объёма двигателя и типа топлива — её считает калькулятор; пример расчёта есть в статье о стоимости.", "La prețul lotului se adaugă taxele licitației, transportul în SUA și pe mare, asigurarea, vămuirea și comisioanele. Suma exactă depinde de an, capacitatea motorului și combustibil — o calculează calculatorul; un exemplu găsiți în articolul despre costuri.", "The lot price is increased by auction fees, shipping in the USA and by sea, insurance, customs and commissions. The exact amount depends on the year, engine size and fuel type — the calculator works it out; the cost article has a worked example.")]);
  const faqHtml = `<section class="vhFaqV1"><h2>${escHtml(L3("Частые вопросы", "Întrebări frecvente", "FAQ"))}</h2>${faq.map(f => `<details><summary>${escHtml(f[0])}</summary><p>${escHtml(f[1])}</p></details>`).join("")}</section>`;

  const sameMake = MODELS.filter(x => x.makeId === m.makeId && x.slug !== m.slug);
  const others = [...sameMake, ...MODELS.filter(x => x.makeId !== m.makeId)].slice(0, 12);
  const othersHtml = `<h2 class="vhH2V1">${escHtml(L3("Другие модели", "Alte modele", "Other models"))}</h2><p>${others.map(x => `<a href="/models/${x.slug}${langQs}" data-no-i18n="true" style="display:inline-block;margin:0 14px 8px 0">${escHtml(x.name)}</a>`).join("")}<a href="/models${langQs}" style="display:inline-block;margin:0 0 8px 0">${escHtml(L3("Все модели →", "Toate modelele →", "All models →"))}</a></p>`;

  const body = `${crumbs}
    <h1 data-no-i18n="true">${escHtml(h1)}</h1>
    <p class="vhLeadV1" data-no-i18n="true">${escHtml(lead)}</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 22px">${boxes}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
      <a class="dbBtnPrimary" href="${catalogHref}">${escHtml(L3(`Смотреть лоты ${name}`, `Vezi loturile ${name}`, `Browse ${name} lots`))} →</a>
      <a class="dbBtnPrimary" href="${calcHref}" style="background:#14181f">${escHtml(L3("Рассчитать под ключ", "Calculează la cheie", "Calculate turnkey price"))}</a>
    </div>
    ${yearsHtml}
    ${dmgHtml}
    <h2 class="vhH2V1">${escHtml(L3("Сколько получится под ключ", "Cât costă la cheie", "What it costs turnkey"))}</h2>
    <p>${L3(`К цене лота добавляются сборы аукциона, доставка до порта и морем, страховка, растаможка по правилам Молдовы и комиссии. Четыре примера расчёта — в статье <a href="${importHref}">«Сколько стоит привезти авто из США»</a>, а точную сумму для конкретного лота ${escHtml(name)} считает <a href="${calcHref}">калькулятор</a>. Подробно о сборах — <a href="${HREF.fees.ru}">Auction Fee на Copart и IAAI</a>.`, `La prețul lotului se adaugă taxele licitației, transportul până la port și pe mare, asigurarea, vămuirea conform regulilor din Moldova și comisioanele. Patru exemple de calcul — în articolul <a href="${importHref}">„Cât costă aducerea unei mașini din SUA”</a>, iar suma exactă pentru un lot ${escHtml(name)} o calculează <a href="${calcHref}">calculatorul</a>. Detalii despre taxe — <a href="${HREF.fees.ro}">taxele licitațiilor Copart și IAAI</a>.`, `Auction fees, shipping to the port and by sea, insurance, customs under Moldovan rules and commissions are added to the lot price. Four worked examples are in <a href="${importHref}">our import cost article</a>, and the <a href="${calcHref}">calculator</a> works out the exact amount for a specific ${escHtml(name)} lot. More on fees: <a href="${HREF.fees.en}">Copart and IAAI auction fees</a>.`)}</p>
    ${faqHtml}
    ${othersHtml}
    <p style="margin-top:18px;font-size:12.5px;color:var(--aMuted,#6b7280)">${escHtml(L3("Источник — наша база проданных лотов Copart и IAAI (США). Учтены цены торгов без сборов; лоты с утилизационными документами, огнём и водой исключены. Цифры обновляются автоматически.", "Sursa — baza noastră de loturi vândute Copart și IAAI (SUA). Sunt luate în calcul prețurile de licitație fără taxe; loturile cu documente de casare, foc și apă sunt excluse. Cifrele se actualizează automat.", "Source — our database of sold Copart and IAAI lots (USA). Auction prices excluding fees; lots with destruction titles, fire and water damage are excluded. Figures update automatically."))}</p>`;

  const ld = [
    {"@context":"https://schema.org", "@type":"FAQPage", mainEntity:faq.map(f => ({"@type":"Question", name:f[0], acceptedAnswer:{"@type":"Answer", text:f[1]}}))},
    {"@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement:[
      {"@type":"ListItem", position:1, name:L3("Главная", "Acasă", "Home"), item:"https://apexauto.md/"},
      {"@type":"ListItem", position:2, name:L3("Модели", "Modele", "Models"), item:"https://apexauto.md/models"},
      {"@type":"ListItem", position:3, name, item:canonical}]}
  ];
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=21600, max-age=300, stale-while-revalidate=86400");
  res.status(200).send(render(html, {lang, title, description, canonical, alts, ogImage, body, robots:"", ld}));
};
