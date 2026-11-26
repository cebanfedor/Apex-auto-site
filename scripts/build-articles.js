#!/usr/bin/env node
// Сборка статей блога «Запчасти и ремонт» на трёх языках из одних данных:
//   node scripts/build-articles.js [--og]
// Источник: content/articles/<slug>.<ru|ro|en>.json (структура — см. ru-файлы; ссылки [[текст|slug]], **жирный**).
// Результат: <slug>.html (RU), ro-<сегмент>.html (RO), en-<сегмент>.html (EN) + блок статей в blog.html / ro-blog.html,
// sitemap.xml, rewrites в vercel.json, правила в local-server.js. --og дополнительно рисует превью assets/og/<slug>[-ro|-en].png
// (нужен npm i --no-save @resvg/resvg-js). Скрипт идемпотентен: перезапуск перезаписывает сгенерированное.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const rd = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const wr = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);
const SITE = "https://apexauto.md";
const LANGS = ["ru", "ro", "en"];

// slug -> адреса по языкам (path без домена). Для старых страниц EN идёт через ?lang=en (словарь i18n).
const PAGES = {
  airbag:                { ru: "/airbag", ro: "/ro/airbag", en: "/en/airbag" },
  painting:              { ru: "/painting", ro: "/ro/vopsire-auto", en: "/en/car-painting" },
  "car-electronics":     { ru: "/car-electronics", ro: "/ro/electronica-auto", en: "/en/car-electronics" },
  suspension:            { ru: "/suspension", ro: "/ro/suspensie-auto", en: "/en/car-suspension" },
  "car-interior":        { ru: "/car-interior", ro: "/ro/interior-auto", en: "/en/car-interior" },
  "repair-guide":        { ru: "/repair-guide", ro: "/ro/ghid-reparatii", en: "/en/repair-guide" },
  "body-panels":         { ru: "/body-panels", ro: "/ro/inlocuire-elemente-caroserie", en: "/en/body-panel-replacement" },
  "rear-quarter":        { ru: "/rear-quarter", ro: "/ro/inlocuire-aripa-spate", en: "/en/rear-quarter-replacement" },
  "frame-rails":         { ru: "/frame-rails", ro: "/ro/indreptare-lonjeroane", en: "/en/frame-rail-straightening" },
  "engine-transmission": { ru: "/engine-transmission", ro: "/ro/inlocuire-motor-cutie", en: "/en/engine-transmission-swap" },
  damages:               { ru: "/damages", ro: "/ro/daune-auto", en: "/damages?lang=en", old: true },
  customs:               { ru: "/customs", ro: "/ro/vamuirea-auto", en: "/customs?lang=en", old: true },
  "vin-check":           { ru: "/vin-check", ro: "/ro/verificare-vin", en: "/vin-check?lang=en", old: true },
  blog:                  { ru: "/blog", ro: "/ro/blog", en: "/blog?lang=en", old: true }
};
const ORDER = ["repair-guide", "body-panels", "rear-quarter", "frame-rails", "engine-transmission", "airbag", "painting", "car-electronics", "suspension", "car-interior"];
const fileOf = (slug, lang) => lang === "ru" ? `${slug}.html` : `${lang}-${PAGES[slug][lang].split("/").pop()}.html`;
const urlOf = (slug, lang) => SITE + PAGES[slug][lang];
const hrefOf = (slug, lang) => PAGES[slug][lang];

// строки интерфейса
const UI = {
  ru: { home: "Главная", blog: "Блог", parts: "Запчасти и ремонт", summary: "Кратко о главном", faq: "Частые вопросы", also: "Читайте также", all: "Все статьи блога →", by: "Редакция Apex Auto", byLine: "Блог «Запчасти и ремонт»", published: "Опубликовано", months: ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"], min: "мин чтения", locale: "ru_RU", nav: "Навигация", more: "Статья есть и на других языках" },
  ro: { home: "Principala", blog: "Blog", parts: "Piese și reparații", summary: "Pe scurt", faq: "Întrebări frecvente", also: "Citiți și", all: "Toate articolele din blog →", by: "Redacția Apex Auto", byLine: "Blog «Piese și reparații»", published: "Publicat", months: ["ianuarie","februarie","martie","aprilie","mai","iunie","iulie","august","septembrie","octombrie","noiembrie","decembrie"], min: "min de citit", locale: "ro_RO", nav: "Navigare", more: "" },
  en: { home: "Home", blog: "Blog", parts: "Parts & repair", summary: "Key takeaways", faq: "FAQ", also: "Read also", all: "All blog articles →", by: "Apex Auto editorial team", byLine: "Blog “Parts & repair”", published: "Published", months: ["January","February","March","April","May","June","July","August","September","October","November","December"], min: "min read", locale: "en_US", nav: "Navigation", more: "" }
};
const LEGAL = {
  ru: "Все права защищены. Материалы сайта, расчёты и оценки защищены авторским правом — копирование без разрешения запрещено.",
  ro: "Toate drepturile rezervate. Materialele site-ului, calculele și estimările sunt protejate de drepturile de autor — copierea fără permisiune este interzisă.",
  en: "All rights reserved. Site materials, calculations and estimates are protected by copyright — copying without permission is prohibited."
};
const TG = { ru: "Отправить лот в Telegram", ro: "Trimite lotul în Telegram", en: "Send the lot on Telegram" };
const BANNER = { ro: "Acest articol este disponibil și în română", en: "This article is also available in English" };
const BANNER_LINK = { ro: "deschideți versiunea în română →", en: "open the English version →" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const attr = (s) => esc(s).replace(/"/g, "&quot;");
const inline = (s, lang) => esc(s)
  .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, (m, t, slug) => { if (!PAGES[slug]) throw new Error("нет slug " + slug); return `<a href="${hrefOf(slug, lang)}">${t}</a>`; })
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
const MONTH_N = { ru: ["январь","февраль","март","апрель","май","июнь","июль","август","сентябрь","октябрь","ноябрь","декабрь"], ro: ["ianuarie","februarie","martie","aprilie","mai","iunie","iulie","august","septembrie","octombrie","noiembrie","decembrie"], en: ["January","February","March","April","May","June","July","August","September","October","November","December"] };
const metaLine = (slug, lang) => { const [y, m] = data[slug].ru.date.split("-").map(Number); return `${UI[lang].by} · ${MONTH_N[lang][m - 1]} ${y} · ${data[slug].ru.readMin} ${UI[lang].min}`; };
const dateText = (iso, lang) => { const [y, m, d] = iso.split("-").map(Number); return lang === "en" ? `${UI.en.months[m - 1]} ${d}, ${y}` : `${d} ${UI[lang].months[m - 1]} ${y}`; };

const data = {};
for (const slug of ORDER) { data[slug] = {}; for (const l of LANGS) data[slug][l] = JSON.parse(rd(`content/articles/${slug}.${l}.json`)); }

// ---------- шаблоны шапки/подвала из существующих страниц
const tplRU = rd("damages.html"), tplRO = rd("ro-daune-auto.html");
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)) + b.length);
const headerRU = between(tplRU, '<header class="siteHeader', "</header>");
const footerRU = between(tplRU, "<footer", "</footer>");
const headerRO0 = between(tplRO, '<header class="siteHeader', "</header>");
const footerRO0 = between(tplRO, "<footer", "</footer>");
const prefixRU = tplRU.slice(0, tplRU.indexOf('<meta name="viewport"'));            // <!doctype>, lang-скрипты, GA
const prefixRO = tplRO.slice(0, tplRO.indexOf('<meta name="viewport"'));
const headTailRU = tplRU.slice(tplRU.indexOf('<link rel="preload" href="/assets/fonts/inter-cyrillic'), tplRU.indexOf("</head>") + 7).replace('href="styles.css', 'href="/styles.css').replace('href="guide.css', 'href="/guide.css');
const headTailRO = tplRO.slice(tplRO.indexOf('<link rel="preload" href="/assets/fonts/inter-cyrillic'), tplRO.indexOf("</head>") + 7);

// RO -> EN для статической шапки и подвала
const RO_EN = [
  ["Mașini din SUA, Canada, Coreea și Europa în Moldova", "Cars from the USA, Canada, Korea and Europe to Moldova"],
  ["Livrare auto din SUA și Canada în Moldova", "Car delivery from the USA and Canada to Moldova"],
  ["Mașini avariate · Copart și IAAI", "Damaged cars · Copart and IAAI"],
  ["Licitații de asigurări Copart · IAAI", "Insurance auctions Copart · IAAI"],
  ["Licitații pentru dealeri", "Dealer auctions"], ["Platforme pentru dealeri", "Dealer platforms"], ["Servicii online", "Online services"],
  ["Mașini din SUA", "Cars from the USA"], ["Mașini din Canada", "Cars from Canada"], ["Mașini din Coreea", "Cars from Korea"],
  ["Deja în drum spre Moldova", "Already on the way to Moldova"], ["Mașini gata", "Ready cars"],
  ["Licitații curente", "Current auctions"], ["Azi și mâine", "Today and tomorrow"], ["Cumpără acum", "Buy now"],
  ["Licitații Timed", "Timed auctions"], ["Arhiva vânzărilor", "Sales archive"], ["Selecții", "Collections"],
  ["Fără revânzători", "No resellers"], ["Electrice și hibride", "Electric and hybrid"], ["Noi, din 2024", "New, from 2024"],
  ["Coreea cu inspecție", "Korea with inspection"], ["Calculator la cheie", "Turnkey calculator"], ["Accize și taxe", "Excise and duties"],
  ["Istoricul mașinii", "Vehicle history"], ["Unde este mașina", "Where is the car"], ["Livrare și vămuire", "Delivery and customs"],
  ["Auto în tranzit", "Cars in transit"], ["Urmărire", "Tracking"], ["Ghid de cumpărare", "Buying guide"], ["Vămuirea în Moldova", "Customs clearance in Moldova"],
  ["Vămuirea", "Customs clearance"], ["Vămuire", "Customs"], ["Taxele licitațiilor", "Auction fees"], ["Verificare VIN", "VIN check"],
  ["Despre noi", "About us"], ["Contacte", "Contacts"], ["Contul meu", "My account"], ["Principala", "Home"], ["Automobile", "Cars"],
  ["SUA și Canada", "USA and Canada"], ["SUA/Canada", "USA/Canada"], ["Coreea", "Korea"], ["Peste tot", "Everywhere"], ["SUA", "USA"],
  ["Unde căutăm", "Where to search"], ["Caută după marcă, model, lot sau VIN", "Search by make, model, lot or VIN"], ["Marcă, model, lot sau VIN", "Make, model, lot or VIN"],
  ["Caută", "Search"], ["Căutare", "Search"], ["Sunați 068-832-032", "Call 068-832-032"], ["Meniu", "Menu"], ["Limba", "Language"],
  ["Avariate", "Damaged"], ["Întregi", "Intact"], ["întregi", "intact"], ["avariate", "damaged"], [">Util <", ">Useful <"],
  ["Mă puteți cunoaște ca", "You may know me as"], ["Din 2016", "Since 2016"], ["în domeniul auto", "in the car business"],
  ["APEX AUTO — din 2026", "APEX AUTO — since 2026"], ["în spatele brandului — 10 ani de experiență, din 2016", "10 years of experience behind the brand, since 2016"],
  ["2000+ mașini", "2000+ cars"], ["importate din 2016", "imported since 2016"], ["La cheie", "Turnkey"],
  ["selecție, licitații, acte și logistică", "selection, auctions, paperwork and logistics"], ["Telefon:", "Phone:"], ["Suntem în legătură:", "Stay in touch:"], ["Canal Telegram", "Telegram channel"]
];
function toEN(html) { let s = html; for (const [a, b] of RO_EN) s = s.split(a).join(b); return s; }
function localizeLinks(html, lang) {
  // ссылки шапки на старые статьи: RO-шаблон ведёт на /ro/..., для EN — на русские страницы с ?lang=en
  if (lang === "ro") return html;
  const map = { "/ro/blog": "/blog?lang=en", "/ro/ghid-auto-sua": "/guide?lang=en", "/ro/vamuirea-auto": "/customs?lang=en", "/ro/taxele-licitatiilor": "/auction-fees?lang=en", "/ro/verificare-vin": "/vin-check?lang=en", 'href="/about"': 'href="/about?lang=en"', 'href="/contacts"': 'href="/contacts?lang=en"' };
  let s = html; for (const [a, b] of Object.entries(map)) s = s.split(a).join(b); return s;
}
function switcher(slug, lang) {
  const st = "display:inline-flex;align-items:center;padding:6px 10px;font-size:13px;font-weight:700;";
  const item = (l, label) => l === lang ? `<span style="${st}color:var(--red);">${label}</span>` : `<a href="${hrefOf(slug, l)}" style="${st}color:var(--muted);text-decoration:none;">${label}</a>`;
  return `<div class="langSwitcherV165" aria-label="${lang === "en" ? "Language" : "Limba"}" data-no-i18n="true">\n        ${item("ru", "RU")}\n        ${item("en", "EN")}\n        ${item("ro", "RO")}\n      </div>`;
}
function headerFor(slug, lang) {
  if (lang === "ru") return headerRU;
  let h = lang === "en" ? toEN(headerRO0) : headerRO0;
  h = localizeLinks(h, lang);
  return h.replace(/<div class="langSwitcherV165"[\s\S]*?<\/div>/, () => switcher(slug, lang));
}
function footerFor(lang) {
  if (lang === "ru") return footerRU;
  let f = lang === "en" ? toEN(footerRO0) : footerRO0;
  f = localizeLinks(f, lang);
  f = f.replace(/Все права защищены\.[^<]*/, LEGAL[lang]);
  f = f.replace(/<a href="\/(?:ro\/)?(?:blog|vamuirea-auto)[^>]*class="contactBtn footerPrivacyV365"/, (m) => m);
  return f;
}

function cardsFor(lang, exclude) {
  return ORDER.filter((s) => s !== exclude).map((s) => ({ slug: s, ...data[s][lang].card, readMin: data[s].ru.readMin }));
}

function page(slug, lang) {
  const A = data[slug][lang], U = UI[lang], url = urlOf(slug, lang);
  const ogName = lang === "ru" ? slug : `${slug}-${lang}`;
  const img = `${SITE}/assets/og/${ogName}.png?v=1`;
  const alt = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${urlOf(slug, l).replace(/\?lang=en/, "")}">`).join("\n  ") + `\n  <link rel="alternate" hreflang="x-default" href="${urlOf(slug, "ru")}">`;
  const meta = `<meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(A.meta.title)}</title>
  <meta name="description" content="${attr(A.meta.description)}">
  <link rel="canonical" href="${url}">
  ${alt}
  <meta property="og:type" content="article">
  <meta property="article:author" content="Apex Auto">
  <meta property="article:published_time" content="${A.date}T00:00:00+03:00">
  <meta property="article:modified_time" content="${A.date}T00:00:00+03:00">
  <meta property="og:site_name" content="Apex Auto">
  <meta property="og:locale" content="${U.locale}">
  <meta property="og:title" content="${attr(A.meta.ogTitle)}">
  <meta property="og:description" content="${attr(A.meta.ogDesc)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${img}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/png">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(A.meta.ogTitle)}">
  <meta name="twitter:description" content="${attr(A.meta.ogDesc)}">
  <meta name="twitter:image" content="${img}">
  `;
  let prefix = lang === "ru" ? prefixRU : prefixRO;
  if (lang === "en") prefix = prefix.replace('<html lang="ro">', '<html lang="en">');
  const head = prefix + meta + (lang === "ru" ? headTailRU : headTailRO);

  const blocks = A.blocks.map((b) => {
    if (b.t === "h2") return `<h2>${inline(b.x, lang)}</h2>`;
    if (b.t === "p") return `<p>${inline(b.x, lang)}</p>`;
    if (b.t === "ul") return `<ul>${b.x.map((i) => `<li>${inline(i, lang)}</li>`).join("")}</ul>`;
    if (b.t === "ol") return `<ol>${b.x.map((i) => `<li>${inline(i, lang)}</li>`).join("")}</ol>`;
    if (b.t === "table") return `<div class="guideTable"><table><thead><tr>${b.head.map((h) => `<th>${inline(h, lang)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((r) => `<tr>${r.map((c, i) => `<td>${i === 0 ? `<strong>${inline(c, lang)}</strong>` : inline(c, lang)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    throw new Error("тип блока " + b.t);
  }).join("\n          ");
  const faq = A.faq.map((f) => `<div class="guideFaqItem"><dt>${inline(f.q, lang)}</dt><dd>${inline(f.a, lang)}</dd></div>`).join("\n            ");
  const rel = (A.related || []).map((s) => `<li><a href="${hrefOf(s, lang)}">${esc(data[s][lang].card.title)}</a></li>`).join("");
  const blogHref = hrefOf("blog", lang);
  const partsHref = lang === "en" ? "/blog?lang=en#parts" : blogHref + "#parts";
  const banner = lang === "ru"
    ? `<div id="artLangBannerV1" data-ro="${hrefOf(slug, "ro")}" data-en="${hrefOf(slug, "en")}" style="display:none;background:#fff3cd;border-bottom:2px solid #ffc107;padding:12px 20px;text-align:center;font-size:14px;"></div>\n  <script src="/lang-banner.js?v=2" defer></script>\n` : "";
  const body = `${banner}  <main class="guideMain">
    <div class="guideShell">

      <nav class="guideBreadcrumb" aria-label="${U.nav}">
        <a href="${lang === "ru" ? "/" : "/"}">${U.home}</a>
        <span>→</span>
        <a href="${blogHref}">${U.blog}</a>
        <span>→</span>
        <a href="${partsHref}">${U.parts}</a>
        <span>→</span>
        <span>${esc(A.card.tag)}</span>
      </nav>

      <article class="guideArticle">
        <header class="guideHeader">
          <span class="guideKicker">${esc(A.kicker)}</span>
          <h1>${esc(A.h1)}</h1>
          <p class="guideLead">${inline(A.lead, lang)}</p>
          <div class="guideAuthor">
            <div>
              <strong>${U.by}</strong>
              <span>${U.byLine}</span>
              <time datetime="${A.date}" style="display:block;font-size:12px;color:var(--muted);margin-top:2px;">${U.published}: ${dateText(A.date, lang)} · ${data[slug].ru.readMin} ${U.min}</time>
            </div>
          </div>
        </header>

        <div class="guideBody">

          <div class="guideSummaryBox">
            <h2 class="guideSummaryTitle">${U.summary}</h2>
            <ul>
              ${A.summary.map((s) => `<li>${inline(s, lang)}</li>`).join("\n              ")}
            </ul>
          </div>

          ${blocks}

          <h2>${U.faq}</h2>
          <dl class="guideFaq">
            ${faq}
          </dl>

          <h2>${U.also}</h2>
          <ul>${rel}</ul>

          <div class="guideCta">
            <h2>${esc(A.cta.h)}</h2>
            <p>${esc(A.cta.p)}</p>
            <div class="guideCtaBtns">
              <a href="https://t.me/fedukusa" target="_blank" rel="noopener" class="guideCtaPrimary">${esc(A.cta.b1)}</a>
              <a href="${hrefOf(A.cta.b2slug, lang)}" class="guideCtaGhost">${esc(A.cta.b2)}</a>
            </div>
          </div>
          <div style="text-align:center;margin-top:24px;">
            <a href="${blogHref}" style="display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font-size:14px;font-weight:600;text-decoration:none;">${U.all}</a>
          </div>

        </div>
      </article>
    </div>
  </main>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", headline: A.h1, description: A.meta.description, inLanguage: lang, datePublished: A.date, dateModified: A.date, mainEntityOfPage: url, author: { "@type": "Organization", name: "Apex Auto", url: SITE }, publisher: { "@type": "Organization", name: "Apex Auto", url: SITE, logo: { "@type": "ImageObject", url: SITE + "/apple-touch-icon.png" } }, image: `${SITE}/assets/og/${ogName}.png` },
    { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: lang, mainEntity: A.faq.map((f) => ({ "@type": "Question", name: f.q.replace(/\*\*|\[\[([^|\]]+)\|[^\]]+\]\]/g, "$1"), acceptedAnswer: { "@type": "Answer", text: f.a.replace(/\*\*/g, "").replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, "$1") } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemList: undefined, itemListElement: [[U.home, SITE], [U.blog, SITE + blogHref], [U.parts, SITE + partsHref], [A.card.tag, url]].map(([name, item], i) => ({ "@type": "ListItem", position: i + 1, name, item })) }
  ].map((o) => `<script type="application/ld+json">\n${JSON.stringify(o)}\n</script>`).join("\n");
  const scripts = `<script src="/analytics.js?v=1" defer></script>
<script src="/cookie-consent.js?v=1" defer></script>
<script src="/site-nav.js?v=v10" defer></script>
<script src="/cab-ping.js?v=v1" defer></script>
<script src="/mobile-bar.js?v=v10" defer></script>
<script src="/site-bg.js?v=v5" defer></script>`;
  const i18nTag = lang === "ru" ? '  <script src="i18n.js?v=multilang-v651" defer></script>\n' : "";
  return `${head}\n<body>\n  ${headerFor(slug, lang)}\n\n${body}\n\n  ${footerFor(lang)}\n${i18nTag}\n${ld}\n${scripts}\n</body>\n</html>\n`;
}

// ---------- страницы
for (const slug of ORDER) for (const l of LANGS) wr(fileOf(slug, l), page(slug, l));
console.log("страниц:", ORDER.length * 3);

// ---------- блог: блок статей RU/RO
function cardHtml(c, lang) {
  return `        <a class="blogCardV1" href="${hrefOf(c.slug, lang)}">
          <span class="tag">${esc(c.tag)}</span>
          <h2>${esc(c.title)}</h2>
          <p>${esc(c.text)}</p>
          <span class="meta">${metaLine(c.slug, lang)}</span>
        </a>`;
}
const BLOG_SEC = {
  ru: { h: "Запчасти и ремонт", p: "Как делается кузовной ремонт, замена агрегатов и из чего складывается стоимость. Без воды и без выдуманных цен: показываем, что реально сделать и когда это не стоит «миллион».", all: "Все статьи" },
  ro: { h: "Piese și reparații", p: "Cum se face reparația caroseriei, înlocuirea agregatelor și din ce se compune costul. Fără apă și fără prețuri inventate: arătăm ce se poate face și când nu costă «un milion».", all: "Toate articolele" }
};
function partsBlock(lang) {
  const S = BLOG_SEC[lang];
  const cards = ORDER.map((s) => cardHtml({ slug: s, ...data[s][lang].card, readMin: data[s].ru.readMin }, lang));
  return `<!-- parts:start -->
      <section class="blogSecV1" id="parts">
        <h2>${S.h}</h2>
        <p>${S.p}</p>
      </section>
      <div class="blogGridV1">
${cards.join("\n")}
      </div>
      <!-- parts:end -->

`;
}
const BLOG_CSS = `    .blogTabsV1 { display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0 6px; }
    .blogTabsV1 a { display: inline-flex; align-items: center; min-height: 36px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line); background: #fff; color: var(--ink-2); font-size: 14px; font-weight: 600; text-decoration: none; }
    .blogTabsV1 a:hover { border-color: var(--red); color: var(--red); }
    .blogSecV1 { margin: 44px 0 6px; scroll-margin-top: 90px; }
    .blogSecV1 h2 { font-size: clamp(22px, 2.4vw, 30px); font-weight: 800; letter-spacing: -0.02em; margin: 0 0 6px; }
    .blogSecV1 p { margin: 0 0 16px; max-width: 760px; font-size: 15px; line-height: 1.6; color: var(--ink-2); }
`;
function patchBlog(file, lang) {
  let s = rd(file);
  const block = partsBlock(lang);
  if (s.includes("<!-- parts:start -->")) s = s.replace(/<!-- parts:start -->[\s\S]*?<!-- parts:end -->\n\n/, () => block);
  else if (/<section class="blogSecV1" id="parts">/.test(s)) s = s.replace(/<section class="blogSecV1" id="parts">[\s\S]*?(?=      <div class="blogSubV1">)/, () => block.replace(/^<!-- parts:start -->\n/, "<!-- parts:start -->\n"));
  else s = s.replace('      <div class="blogSubV1">', () => block + '      <div class="blogSubV1">');
  if (!s.includes(".blogTabsV1")) s = s.replace("    .blogCardV1 { display: flex;", () => BLOG_CSS + "    .blogCardV1 { display: flex;");
  if (!s.includes('class="blogTabsV1"')) {
    const tabs = lang === "ru" ? '<a href="#all">Все статьи</a><a href="#parts">Запчасти и ремонт</a>' : '<a href="#all">Toate articolele</a><a href="#parts">Piese și reparații</a>';
    s = s.replace('      <div class="blogGridV1">', () => `      <nav class="blogTabsV1" aria-label="${lang === "ru" ? "Разделы блога" : "Secțiuni"}">${tabs}</nav>\n\n      <div class="blogGridV1" id="all">`);
  }
  wr(file, s);
}
patchBlog("blog.html", "ru");
patchBlog("ro-blog.html", "ro");

// ---------- словарь i18n для /blog?lang=ro|en (новые строки блока статей)
{
  const dictFile = "i18n-dict.js";
  let s = rd(dictFile);
  const entries = { ro: {}, en: {} };
  const add = (ru, ro, en) => { entries.ro[ru] = ro; entries.en[ru] = en; };
  add("Все статьи", "Toate articolele", "All articles");
  add("Запчасти и ремонт", "Piese și reparații", "Parts & repair");
  add(BLOG_SEC.ru.p, BLOG_SEC.ro.p, "How body repair and unit replacement are done and what the cost is made of. No fluff and no invented prices: we show what is actually doable and when it does not cost “a fortune”.");
  for (const slug of ORDER) { const r = data[slug].ru.card, o = data[slug].ro.card, e = data[slug].en.card; add(r.tag, o.tag, e.tag); add(r.title, o.title, e.title); add(r.text, o.text, e.text); }
  for (const slug of ORDER) add(metaLine(slug, "ru"), metaLine(slug, "ro"), metaLine(slug, "en"));
  const pairs = (l) => Object.entries(entries[l]).map(([k, v]) => `      ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  const blk = (l) => `,\n      /* articles:start */\n${pairs(l)}\n      /* articles:end */`;
  const strip = (t) => t.replace(/,\n      \/\* articles:start \*\/[\s\S]*?\/\* articles:end \*\//g, "");
  s = strip(s);
  const roEnd = s.indexOf("\n    },\n    en:{"), enEnd = s.indexOf("\n    }\n  };\n\n  const attrDict");
  if (roEnd < 0 || enEnd < 0) throw new Error("структура i18n-dict.js изменилась");
  s = s.slice(0, roEnd) + blk("ro") + s.slice(roEnd, enEnd) + blk("en") + s.slice(enEnd);
  wr(dictFile, s);
}

// ---------- sitemap
{
  let s = rd("sitemap.xml");
  for (const slug of ORDER) for (const l of LANGS) {
    const loc = urlOf(slug, l);
    if (!s.includes(`<loc>${loc}</loc>`)) s = s.replace("</urlset>", `  <url><loc>${loc}</loc><lastmod>${data[slug].ru.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>\n</urlset>`);
  }
  wr("sitemap.xml", s);
}

// ---------- vercel.json: rewrites и .html-редиректы
{
  let s = rd("vercel.json");
  const lines = [];
  for (const slug of ORDER) for (const l of LANGS) {
    const src = PAGES[slug][l];
    const rule = `    { "source": "${src}", "destination": "/${fileOf(slug, l)}" },`;
    if (!s.includes(`"source": "${src}", "destination"`)) lines.push(rule);
  }
  if (lines.length) s = s.replace('    { "source": "/damages", "destination": "/damages.html" },\n', (m) => m + lines.join("\n") + "\n");
  const ruSlugs = ORDER.filter((x) => x !== "airbag").map((x) => x);
  for (const x of ruSlugs) if (!new RegExp(`\\|${x}[|)]`).test(s.split("\n").find((l) => l.includes('"/:page(')) || "")) s = s.replace(/(\|cabinet\|airbag[^)]*)\)\.html/, `$1|${x}).html`);
  JSON.parse(s);
  wr("vercel.json", s);
}

// ---------- превью
if (process.argv.includes("--og")) {
  const { pageCard } = require("../server/og-card");
  (async () => {
    for (const slug of ORDER) for (const l of LANGS) {
      const o = data[slug][l].og, name = l === "ru" ? slug : `${slug}-${l}`;
      const png = await pageCard({ kicker: o.k, title: o.h, sub: o.s, path: "apexauto.md" + PAGES[slug][l], photoPath: null });
      fs.writeFileSync(path.join(ROOT, "assets/og", name + ".png"), png); console.log("og", name, png.length);
    }
  })();
}
