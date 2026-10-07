const fs = require("fs");
const path = require("path");
const {isValidVin} = require("../server/validators");
const {lotSlug} = require("../server/slug");
const {facts: lotFacts} = require("../server/og-lot");
const {lotJsonLd, fuelText} = require("../server/lot-jsonld");
const {money, dateRu} = require("../server/og-card");

// SSR-страница /vin/<VIN> — постоянная, не привязана к живому лоту (Федор 05.10.2026: «хочу
// попадать в поиске по VIN, как BidCars»). В отличие от /auctions/<slug> (умирает вместе с
// лотом), эта страница остаётся и после продажи/снятия с торгов — источник: action=vinarchive
// (живой фид + фолбэк на накопленную vin_hist, см. api/auctions.js).
const SSR_FETCH_MS = 6000;

async function fetchArchive(req, vin){
  const {selfOrigin} = require("../server/origin");
  const url = `${selfOrigin(req)}/api/auctions?action=vinarchive&vin=${encodeURIComponent(vin)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SSR_FETCH_MS);
  try{
    const r = await fetch(url, {headers:{accept:"application/json"}, signal:controller.signal});
    const payload = await r.json().catch(() => null);
    if(!r.ok || !payload || payload.ok === false) return null;
    return payload;
  }catch(e){ return null; }
  finally{ clearTimeout(timer); }
}

function escAttr(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escHtml(s){ return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

const TXT = {
  ru:{
    title:v => `Проверка VIN ${v} — история аукционных торгов | Apex Auto`,
    titleCar:(v, name) => `${name} · VIN ${v} — история продаж на аукционах | Apex Auto`,
    h1:v => `История аукционных торгов — VIN ${v}`,
    lead:"Все заходы этого автомобиля на торги Copart и IAAI, которые нам известны: даты, номера лотов, ставки и статус продажи.",
    sold:"Продан", notSold:"Не продан", noBid:"Без ставок", timed:"Timed", current:"Текущие торги",
    date:"Дата", lotCol:"Лот", status:"Статус", bidCol:"Ставка",
    noHistory:"По этому VIN у нас пока нет сохранённой истории торгов.",
    activeNote:"Сейчас этот автомобиль снова выставлен на торги:",
    goLot:"Смотреть лот →", cta:"Нашли похожий автомобиль? Оставим заявку и посчитаем доставку под ключ до Кишинёва.",
    ctaBtn:"Оставить заявку", soldFor:"продан за", notSoldRound:"торги прошли, не продан",
    crumbs:"VIN", backHome:"Главная", other:"Другие проверки", checkOther:"Проверить другой VIN →",
    source:"Источник — наша база аукционных данных (Copart, IAAI), обновляется при каждой проверке.",
  },
  ro:{
    title:v => `Verificare VIN ${v} — istoricul licitațiilor | Apex Auto`,
    titleCar:(v, name) => `${name} · VIN ${v} — istoric vânzări la licitații | Apex Auto`,
    h1:v => `Istoricul licitațiilor — VIN ${v}`,
    lead:"Toate aparițiile acestei mașini la licitațiile Copart și IAAI cunoscute de noi: date, numere de lot, oferte și statutul vânzării.",
    sold:"Vândut", notSold:"Nevândut", noBid:"Fără oferte", timed:"Timed", current:"Licitație curentă",
    date:"Data", lotCol:"Lot", status:"Status", bidCol:"Ofertă",
    noHistory:"Pentru acest VIN nu avem încă istoric salvat de licitații.",
    activeNote:"Acum această mașină este din nou la licitație:",
    goLot:"Vezi lotul →", cta:"Ați găsit o mașină similară? Lăsați o cerere și calculăm livrarea la cheie până la Chișinău.",
    ctaBtn:"Lasă o cerere", soldFor:"vândut cu", notSoldRound:"licitație încheiată, nevândut",
    crumbs:"VIN", backHome:"Acasă", other:"Alte verificări", checkOther:"Verifică alt VIN →",
    source:"Sursă — baza noastră de date de licitații (Copart, IAAI), se actualizează la fiecare verificare.",
  },
  en:{
    title:v => `VIN check ${v} — auction sale history | Apex Auto`,
    titleCar:(v, name) => `${name} · VIN ${v} — auction sale history | Apex Auto`,
    h1:v => `Auction sale history — VIN ${v}`,
    lead:"Every appearance of this car at Copart and IAAI auctions known to us: dates, lot numbers, bids and sale status.",
    sold:"Sold", notSold:"Not sold", noBid:"No bids", timed:"Timed", current:"Live auction now",
    date:"Date", lotCol:"Lot", status:"Status", bidCol:"Bid",
    noHistory:"We don't have saved auction history for this VIN yet.",
    activeNote:"This car is currently listed again:",
    goLot:"View lot →", cta:"Found a similar car? Leave a request and we'll quote turnkey delivery to Chisinau.",
    ctaBtn:"Leave a request", soldFor:"sold for", notSoldRound:"auction ended, not sold",
    crumbs:"VIN", backHome:"Home", other:"Other checks", checkOther:"Check another VIN →",
    source:"Source — our own auction data store (Copart, IAAI), refreshed on every check.",
  }
};

function statusLabel(e, t){
  if(e.current) return t.current;
  if(e.status === "sold") return t.sold;
  if(e.timed) return t.timed;
  if(e.prebid) return t.noBid;
  return t.notSold;
}

function historyRowsHtml(history, lang, t){
  const rows = (Array.isArray(history) ? history : []).slice(0, 60).map(e => {
    const dt = dateRu(e.date, lang).split(",")[0] || "";
    const auc = String(e.auction || "").toLowerCase();
    const aucName = auc === "iaai" ? "IAAI" : auc === "copart" ? "Copart" : escHtml(auc);
    const lotHref = auc && e.lot ? `/auctions/${escAttr(auc)}-${escAttr(String(e.lot).replace(/[^\w-]/g, ""))}` : "";
    const sold = e.status === "sold";
    const bid = sold && !e.noPrice ? money(e.bid) : (e.bid > 0 ? money(e.bid) : "—");
    const statusTone = sold ? "good" : (e.current || e.timed) ? "neutral" : "warn";
    return `<tr>
      <td data-no-i18n="true">${escHtml(dt)}</td>
      <td>${lotHref ? `<a href="${lotHref}" data-no-i18n="true">${aucName} ${escHtml(String(e.lot))}</a>` : `${aucName} ${escHtml(String(e.lot || ""))}`}</td>
      <td><span class="vhStatusV1 vhStatus-${statusTone}">${escHtml(statusLabel(e, t))}</span></td>
      <td data-no-i18n="true">${escHtml(bid)}</td>
    </tr>`;
  }).join("");
  return rows;
}

module.exports = async function(req, res){
  const vinRaw = String(req.query.vin || "").replace(/[^a-zA-Z0-9]/g, "");
  const vin = vinRaw.toUpperCase();

  let html;
  try{
    html = fs.readFileSync(path.join(__dirname, "../vin.html"), "utf8");
  }catch(e){
    res.status(500).send("vin.html not found");
    return;
  }

  if(!isValidVin(vin)){
    html = html.replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(404).send(html);
    return;
  }

  // Канонический адрес всегда заглавными буквами — старый/смешанный регистр ведём на него 301-м.
  if(vinRaw !== vin){
    const qs = req.query.lang ? `?lang=${encodeURIComponent(req.query.lang)}` : "";
    res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=300");
    res.setHeader("Location", `/vin/${vin}${qs}`);
    res.status(301).end();
    return;
  }

  const langQ = String(req.query.lang || "").toLowerCase();
  const lang = langQ.startsWith("ro") ? "ro" : langQ.startsWith("en") ? "en" : "ru";
  const t = TXT[lang];
  const baseUrl = `https://apexauto.md/vin/${vin}`;
  const url = lang === "ru" ? baseUrl : `${baseUrl}?lang=${lang}`;

  const archive = await fetchArchive(req, vin);

  if(!archive){
    html = html.replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(404).send(html);
    return;
  }

  const lot = archive.lot || null;
  const history = archive.history || [];
  const soldEntries = history.filter(e => e.status === "sold");
  const name = lot ? ([lot.year, lot.make, lot.model].filter(Boolean).join(" ") || lot.title) : "";
  const title = name ? t.titleCar(vin, name) : t.title(vin);
  const soldCount = soldEntries.length;
  const descParts = [
    name ? `${name}.` : "",
    soldCount ? `${soldCount === 1 ? "1 продажа" : soldCount + " продаж"} по VIN ${vin} на Copart/IAAI.` : `История торгов по VIN ${vin} на Copart и IAAI.`,
  ];
  const description = (lang === "ru" ? descParts.join(" ") : t.lead).slice(0, 300);
  const ogImage = lot && lot.id ? `https://apexauto.md/og/lot/${lot.id}?v=2${lang === "ru" ? "" : "&lang=" + lang}` : `https://apexauto.md/assets/og/${lang === "ru" ? "auctions.png" : lang === "ro" ? "auctions-ro.png" : "auctions-en.png"}`;

  // Активный заход (из live lot или из фолбэка vin_hist.latest) — если он есть и это не текущий просматриваемый лот
  const activeLotNo = lot && Number(lot.statusId) !== 6 ? lot.lot : (archive.latest && archive.latest.lot);
  const activeAuction = lot && Number(lot.statusId) !== 6 ? lot.auction : (archive.latest && archive.latest.auction);
  const activeHref = activeAuction && activeLotNo ? `/auctions/${escAttr(String(activeAuction).toLowerCase())}-${escAttr(String(activeLotNo).replace(/[^\w-]/g, ""))}` : "";

  const factsHtml = lot ? (() => {
    const f = lotFacts(lot, lang);
    const specLine = [lot.drive && String(lot.drive).replace(/4×4/, "4WD"), f.trans, f.kind].filter(Boolean).join(" · ");
    const img = (Array.isArray(lot.images) && lot.images[0]) || lot.image || "";
    return `<div class="vhFactsV1">
      ${img ? `<img src="${escAttr(img)}" alt="${escAttr(name)}" loading="eager" fetchpriority="high" style="width:100%;max-width:420px;border-radius:14px;display:block;margin:0 0 14px">` : ""}
      <h2 data-no-i18n="true">${escHtml(name)}</h2>
      ${specLine ? `<p class="vhSpecV1" data-no-i18n="true">${escHtml(specLine)}</p>` : ""}
      <p class="vhSpecV1" data-no-i18n="true">${[f.cond, f.odo].filter(Boolean).join(" · ")}</p>
    </div>`;
  })() : "";

  const activeHtml = activeHref ? `<div class="vhActiveV1"><span>${escHtml(t.activeNote)}</span> <a class="dbBtnPrimary" href="${activeHref}" style="display:inline-block;margin-top:8px">${escHtml(t.goLot)}</a></div>` : "";

  const bodyHtml = `
    <nav class="auctionCrumbsV1" aria-label="breadcrumb"><span class="crumbRootV1"><a href="/">${escHtml(t.backHome)}</a> / </span><span class="crumbCurV1" data-no-i18n="true">VIN ${escHtml(vin)}</span></nav>
    <h1 data-no-i18n="true">${escHtml(t.h1(vin))}</h1>
    <p class="vhLeadV1">${escHtml(t.lead)}</p>
    ${factsHtml}
    ${activeHtml}
    ${history.length ? `
    <table class="vhTableV1">
      <thead><tr><th>${escHtml(t.date)}</th><th>${escHtml(t.lotCol)}</th><th>${escHtml(t.status)}</th><th>${escHtml(t.bidCol)}</th></tr></thead>
      <tbody>${historyRowsHtml(history, lang, t)}</tbody>
    </table>` : `<p>${escHtml(t.noHistory)}</p>`}
    <div class="dRecoV2" style="margin-top:24px">
      <p>${escHtml(t.cta)}</p>
      <a class="dbBtnPrimary" href="/contacts" style="display:inline-block;margin-top:10px">${escHtml(t.ctaBtn)}</a>
    </div>
    <p style="margin-top:18px;font-size:12.5px;color:var(--aMuted,#6b7280)">${escHtml(t.source)}</p>
  `;

  let ld = null;
  try{
    if(lot){
      ld = lotJsonLd(lot, {url, lang, description});
    }else{
      ld = JSON.parse(JSON.stringify({
        "@context":"https://schema.org", "@type":"Car",
        vehicleIdentificationNumber:vin, url, description,
        itemCondition:"https://schema.org/UsedCondition"
      }));
    }
  }catch(e){ ld = null; }
  const safeJson = o => JSON.stringify(o).replace(/</g, "\\u003c");

  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escAttr(url)}">\n  <link rel="alternate" hreflang="ru" href="${escAttr(baseUrl)}">\n  <link rel="alternate" hreflang="ro" href="${escAttr(baseUrl)}?lang=ro">\n  <link rel="alternate" hreflang="en" href="${escAttr(baseUrl)}?lang=en">\n  <link rel="alternate" hreflang="x-default" href="${escAttr(baseUrl)}">`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${escAttr(description)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escAttr(title)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escAttr(description)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${escAttr(url)}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escAttr(ogImage)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${escAttr(title)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${escAttr(description)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escAttr(ogImage)}">`)
    .replace(`<section id="vinDetailV1" class="vinDetailV1"></section>`, `<section id="vinDetailV1" class="vinDetailV1">${bodyHtml}</section>`)
    .replace("</head>", `${ld ? `<script type="application/ld+json">${safeJson(ld)}</script>\n` : ""}<script type="application/json" id="ssrVinV1">${safeJson({vin, hasLot:!!lot})}</script>\n</head>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=1800, max-age=120, stale-while-revalidate=86400");
  res.status(200).send(html);
};
