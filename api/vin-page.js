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
    const r = await fetch(url, {headers:{accept:"application/json", ...(process.env.CRON_SECRET ? {"x-internal":process.env.CRON_SECRET} : {})}, signal:controller.signal});
    const payload = await r.json().catch(() => null);
    if(r.status === 503) return {_unavailable:true};   // база занята — не путаем с «VIN неизвестен» (иначе страница получит noindex)
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

  if(archive && archive._unavailable){
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Retry-After", "30");
    res.status(503).send(html.replace(`<section id="vinDetailV1" class="vinDetailV1"></section>`, `<section id="vinDetailV1" class="vinDetailV1"><p>Страница временно недоступна, обновите через минуту.</p></section>`));
    return;
  }

  if(!archive){
    html = html.replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60");
    res.status(404).send(html);
    return;
  }

  const lot = archive.lot || null;
  const history = archive.history || [];
  const lots = Array.isArray(archive.lots) ? archive.lots : [];
  const soldEntries = history.filter(e => e.status === "sold");
  const name = lot ? ([lot.year, lot.make, lot.model].filter(Boolean).join(" ") || lot.title) : "";
  const soldCount = soldEntries.length;
  const L3 = (ru, ro, en) => lang === "ro" ? ro : lang === "en" ? en : ru;
  const aucName = a => String(a || "").toLowerCase() === "iaai" ? "IAAI" : String(a || "").toLowerCase() === "copart" ? "Copart" : "";

  // Данные главного захода (из базы) — для заголовка, описания и фактов
  const isSold = !!lot && Number(lot.statusId) === 6 && Number(lot.finalBid) > 0;
  const price = lot ? (isSold ? Number(lot.finalBid) : (Number(lot.currentBid) || Number(lot.buyNow) || 0)) : 0;
  const miles = lot ? Number(lot.odometer) || 0 : 0;
  const odoTxt = miles > 0 ? `${miles.toLocaleString("ru-RU").replace(/ /g, " ")} ${L3("миль", "mile", "mi")} (≈ ${Math.round(miles * 1.609).toLocaleString("ru-RU").replace(/ /g, " ")} ${L3("км", "km", "km")})` : "";
  const dmgTxt = lot ? [lot.primaryDamage, lot.secondaryDamage].filter(x => x && !/^unknown$/i.test(String(x))).join(" / ") || String(lot.damage || "") : "";
  const docTxt = lot ? String(lot.document || "") : "";
  const dateTxt = lot && lot.auctionDate ? dateRu(lot.auctionDate, lang).split(",")[0].replace(/\.$/, "") : "";
  const aucTxt = lot ? aucName(lot.auction) : "";
  const lotNo = lot ? String(lot.lot || "") : "";
  const priceTxt = price ? money(price) : "";

  // Заголовок: VIN + машина + главное, что ищут (цена продажи); до ~70 знаков, VIN в начале
  const statusPart = isSold ? L3(`продан за ${priceTxt}`, `vândut cu ${priceTxt}`, `sold for ${priceTxt}`)
    : priceTxt ? L3(`ставка ${priceTxt}`, `ofertă ${priceTxt}`, `bid ${priceTxt}`) : L3("история торгов", "istoric licitații", "auction history");
  const title = name
    ? `VIN ${vin} — ${name}: ${statusPart} | Apex Auto`
    : t.title(vin);
  const descBits = [];
  if(name) descBits.push(`${name}, VIN ${vin}`);
  if(lotNo && aucTxt) descBits.push(L3(`лот ${lotNo} ${aucTxt}`, `lot ${lotNo} ${aucTxt}`, `lot ${lotNo} ${aucTxt}`));
  if(isSold) descBits.push(L3(`продан за ${priceTxt}`, `vândut cu ${priceTxt}`, `sold for ${priceTxt}`));
  else if(priceTxt) descBits.push(L3(`ставка ${priceTxt}`, `ofertă ${priceTxt}`, `bid ${priceTxt}`));
  if(odoTxt) descBits.push(L3(`пробег ${odoTxt.split(" (")[0]}`, `kilometraj ${odoTxt.split(" (")[0]}`, `mileage ${odoTxt.split(" (")[0]}`));
  if(dmgTxt) descBits.push(L3(`повреждение: ${dmgTxt}`, `daune: ${dmgTxt}`, `damage: ${dmgTxt}`));
  const tail = L3("История торгов, фото и цена под ключ в Молдову — Apex Auto.", "Istoric licitații, poze și preț la cheie în Moldova — Apex Auto.", "Auction history, photos and turnkey price to Moldova — Apex Auto.");
  const description = (name ? descBits.join(" · ") + ". " + tail : t.lead).slice(0, 300);
  const ogImage = lot && lot.id ? `https://apexauto.md/og/lot/${lot.id}?v=5${lang === "ru" ? "" : "&lang=" + lang}` : `https://apexauto.md/assets/og/${lang === "ru" ? "auctions.png" : lang === "ro" ? "auctions-ro.png" : "auctions-en.png"}`;

  // Активный заход (живой лот или последний из истории) — кнопка на страницу лота с калькулятором
  const activeLotNo = lot && Number(lot.statusId) !== 6 ? lot.lot : (archive.latest && archive.latest.lot);
  const activeAuction = lot && Number(lot.statusId) !== 6 ? lot.auction : (archive.latest && archive.latest.auction);
  const activeHref = activeAuction && activeLotNo ? `/auctions/${escAttr(String(activeAuction).toLowerCase())}-${escAttr(String(activeLotNo).replace(/[^\w-]/g, ""))}` : "";
  const lotHrefMain = lot && lot.auction && lot.lot ? `/auctions/${escAttr(String(lot.auction).toLowerCase())}-${escAttr(String(lot.lot).replace(/[^\w-]/g, ""))}` : "";

  // Лид-абзац: прямой ответ на запрос «VIN …» (его цитируют и поисковики, и ИИ-обзоры)
  const leadSentence = lot ? L3(
    `${name} с VIN ${vin} выставлялась на аукционе ${aucTxt}${lotNo ? ` (лот ${lotNo})` : ""}${dateTxt ? `, торги ${dateTxt}` : ""}. ${isSold ? `Продана за ${priceTxt}.` : priceTxt ? `Текущая ставка — ${priceTxt}.` : ""}${odoTxt ? ` Пробег: ${odoTxt}.` : ""}${dmgTxt ? ` Повреждение: ${dmgTxt}.` : ""}${docTxt ? ` Документ: ${docTxt}.` : ""} Ниже — все известные заходы на торги, фото и цена доставки в Молдову.`,
    `${name}, VIN ${vin}, a fost scoasă la licitația ${aucTxt}${lotNo ? ` (lot ${lotNo})` : ""}${dateTxt ? `, ${dateTxt}` : ""}. ${isSold ? `Vândută cu ${priceTxt}.` : priceTxt ? `Oferta curentă: ${priceTxt}.` : ""}${odoTxt ? ` Kilometraj: ${odoTxt}.` : ""}${dmgTxt ? ` Daune: ${dmgTxt}.` : ""} Mai jos: istoricul licitațiilor, poze și livrarea în Moldova.`,
    `${name}, VIN ${vin}, was listed at ${aucTxt}${lotNo ? ` (lot ${lotNo})` : ""}${dateTxt ? `, auction ${dateTxt}` : ""}. ${isSold ? `Sold for ${priceTxt}.` : priceTxt ? `Current bid: ${priceTxt}.` : ""}${odoTxt ? ` Mileage: ${odoTxt}.` : ""}${dmgTxt ? ` Damage: ${dmgTxt}.` : ""} Below: auction history, photos and delivery to Moldova.`
  ) : t.lead;
  const h1 = name ? L3(`${name} — VIN ${vin}: история аукциона и цена`, `${name} — VIN ${vin}: istoric licitație și preț`, `${name} — VIN ${vin}: auction history and price`) : t.h1(vin);

  // Фотографии (до 8) — подписи содержат VIN и марку
  const imgs = lot ? (Array.isArray(lot.images) ? lot.images : []).filter(u => /^https?:\/\//i.test(String(u || ""))).slice(0, 8) : [];
  const photosHtml = imgs.length ? `<div class="vhPhotosV1">${imgs.map((u, i) => `<img src="${escAttr(u)}" alt="${escAttr(`${name} VIN ${vin} — ${L3("фото", "poza", "photo")} ${i + 1}`)}" loading="${i === 0 ? "eager" : "lazy"}"${i === 0 ? ' fetchpriority="high"' : ""} referrerpolicy="no-referrer">`).join("")}</div>` : "";

  // Таблица характеристик
  const fRow = (k, v) => v ? `<tr><th scope="row">${escHtml(k)}</th><td data-no-i18n="true">${escHtml(v)}</td></tr>` : "";
  const specParts = lot ? [lot.engine, lot.fuel, lot.transmission, lot.drive && String(lot.drive).replace(/4×4/, "4WD")].filter(Boolean).join(" · ") : "";
  const factsTable = lot ? `<table class="vhFactsTblV1"><tbody>
      ${fRow("VIN", vin)}
      ${fRow(L3("Автомобиль", "Mașină", "Vehicle"), name)}
      ${fRow(L3("Площадка", "Platformă", "Auction"), aucTxt)}
      ${fRow(L3("Номер лота", "Număr lot", "Lot number"), lotNo)}
      ${fRow(L3("Дата торгов", "Data licitației", "Auction date"), dateTxt)}
      ${fRow(isSold ? L3("Цена продажи", "Preț de vânzare", "Sold price") : L3("Ставка", "Ofertă", "Bid"), priceTxt)}
      ${fRow(L3("Пробег", "Kilometraj", "Mileage"), odoTxt)}
      ${fRow(L3("Повреждение", "Daune", "Damage"), dmgTxt)}
      ${fRow(L3("Документ", "Document", "Title"), docTxt)}
      ${fRow(L3("Локация", "Locație", "Location"), lot.location && (lot.location.text || lot.location.name || (typeof lot.location === "string" ? lot.location : "")))}
      ${fRow(L3("Двигатель и привод", "Motor și tracțiune", "Engine & drive"), specParts)}
    </tbody></table>` : "";

  // Вопросы-ответы (и видимый текст, и FAQPage JSON-LD — только факты из базы)
  const faq = [];
  if(lot && name){
    faq.push([L3(`Сколько стоит ${name} с аукциона?`, `Cât costă ${name} la licitație?`, `How much is ${name} at auction?`),
      isSold ? L3(`${name} (VIN ${vin}) была продана на ${aucTxt} за ${priceTxt}. Это цена на аукционе без сборов, доставки и растаможки.`, `${name} (VIN ${vin}) a fost vândută pe ${aucTxt} cu ${priceTxt}. Prețul este fără taxe, transport și vămuire.`, `${name} (VIN ${vin}) sold at ${aucTxt} for ${priceTxt}. That is the hammer price, without fees, shipping or customs.`)
      : priceTxt ? L3(`Текущая ставка на ${aucTxt}: ${priceTxt} (без сборов, доставки и растаможки).`, `Oferta curentă pe ${aucTxt}: ${priceTxt} (fără taxe, transport și vămuire).`, `Current bid at ${aucTxt}: ${priceTxt} (excluding fees, shipping and customs).`)
      : L3("Ставки по этому лоту пока не указаны.", "Încă nu sunt oferte pentru acest lot.", "No bids are shown for this lot yet.")]);
  }
  faq.push([L3("Можно ли привезти эту машину в Молдову?", "Se poate aduce această mașină în Moldova?", "Can this car be shipped to Moldova?"),
    L3("Да. Apex Auto покупает автомобили на Copart и IAAI, организует доставку в порт, морем в Европу и в Кишинёв и растаможку. Рассчитаем стоимость под ключ по этому VIN.", "Da. Apex Auto cumpără mașini de pe Copart și IAAI, organizează transportul spre port, pe mare spre Europa și Chișinău, plus vămuirea. Calculăm costul la cheie pentru acest VIN.", "Yes. Apex Auto buys cars at Copart and IAAI and handles shipping to the port, sea freight to Europe and Chisinau, and customs. We can quote the turnkey price for this VIN.")]);
  faq.push([L3("Как проверить историю аукциона по VIN?", "Cum verific istoricul licitației după VIN?", "How do I check auction history by VIN?"),
    L3("Введите VIN в строку поиска на сайте: мы покажем все заходы машины на торги Copart и IAAI, ставки и цены продажи, повторные выставления и фото.", "Introduceți VIN-ul în căutare: afișăm toate aparițiile mașinii la licitațiile Copart și IAAI, ofertele și prețurile de vânzare, relistările și pozele.", "Enter the VIN in the site search: we show every Copart and IAAI auction appearance of the car, bids and sold prices, relistings and photos.")]);
  const faqHtml = `<section class="vhFaqV1"><h2>${escHtml(L3("Частые вопросы", "Întrebări frecvente", "FAQ"))}</h2>${faq.map(f => `<details><summary>${escHtml(f[0])}</summary><p>${escHtml(f[1])}</p></details>`).join("")}</section>`;

  const activeHtml = activeHref ? `<div class="vhActiveV1"><span>${escHtml(t.activeNote)}</span><a class="dbBtnPrimary" href="${activeHref}">${escHtml(t.goLot)}</a></div>` : "";
  const calcLink = lotHrefMain ? `<a class="dbBtnPrimary" href="${lotHrefMain}">${escHtml(L3("Рассчитать под ключ →", "Calculează la cheie →", "Calculate turnkey price →"))}</a>` : `<a class="dbBtnPrimary" href="/#calculator">${escHtml(L3("Калькулятор под ключ →", "Calculator la cheie →", "Turnkey calculator →"))}</a>`;

  const bodyHtml = `
    <nav class="auctionCrumbsV1" aria-label="breadcrumb"><span class="crumbRootV1"><a href="/">${escHtml(t.backHome)}</a> / <a href="/vin-check">${escHtml(L3("Проверка VIN", "Verificare VIN", "VIN check"))}</a> / </span><span class="crumbCurV1" data-no-i18n="true">VIN ${escHtml(vin)}</span></nav>
    <h1 data-no-i18n="true">${escHtml(h1)}</h1>
    <p class="vhLeadV1" data-no-i18n="true">${escHtml(leadSentence)}</p>
    ${photosHtml}
    ${factsTable}
    ${activeHtml}
    <h2 class="vhH2V1">${escHtml(L3("История торгов по VIN", "Istoricul licitațiilor după VIN", "Auction history by VIN"))}</h2>
    ${history.length ? `
    <table class="vhTableV1">
      <thead><tr><th>${escHtml(t.date)}</th><th>${escHtml(t.lotCol)}</th><th>${escHtml(t.status)}</th><th>${escHtml(t.bidCol)}</th></tr></thead>
      <tbody>${historyRowsHtml(history, lang, t)}</tbody>
    </table>` : `<p>${escHtml(t.noHistory)}</p>`}
    ${faqHtml}
    <div class="dRecoV2" style="margin-top:24px">
      <div>
        <p>${escHtml(L3("Хотите такую машину в Молдове? Apex Auto купит на аукционе, доставит и растаможит под ключ в Кишинёве.", "Vreți o astfel de mașină în Moldova? Apex Auto o cumpără la licitație, o livrează și o vămuiește la cheie în Chișinău.", "Want this car in Moldova? Apex Auto buys it at auction, ships and clears customs, turnkey in Chisinau."))}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">${calcLink}<a class="dbBtnPrimary" href="/contacts" style="background:#14181f">${escHtml(t.ctaBtn)}</a></div>
      </div>
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

  const faqLd = {"@context":"https://schema.org", "@type":"FAQPage", mainEntity:faq.map(f => ({"@type":"Question", name:f[0], acceptedAnswer:{"@type":"Answer", text:f[1]}}))};
  const crumbLd = {"@context":"https://schema.org", "@type":"BreadcrumbList", itemListElement:[
    {"@type":"ListItem", position:1, name:t.backHome, item:"https://apexauto.md/"},
    {"@type":"ListItem", position:2, name:L3("Проверка VIN", "Verificare VIN", "VIN check"), item:"https://apexauto.md/vin-check"},
    {"@type":"ListItem", position:3, name:`VIN ${vin}`, item:baseUrl}]};
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
    .replace("</head>", `${ld ? `<script type="application/ld+json">${safeJson(ld)}</script>\n` : ""}<script type="application/ld+json">${safeJson(faqLd)}</script>\n<script type="application/ld+json">${safeJson(crumbLd)}</script>\n<script type="application/json" id="ssrVinV1">${safeJson({vin, hasLot:!!lot})}</script>\n</head>`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=1800, max-age=120, stale-while-revalidate=86400");
  res.status(200).send(html);
};
