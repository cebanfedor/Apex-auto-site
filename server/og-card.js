// Картинки для превью ссылок (Telegram, WhatsApp, Facebook, Viber, X): 1200×630 PNG — фото + название + цена + бренд.
// SVG собирается вручную и рисуется через resvg (без браузера); шрифты Onest лежат в assets/og-fonts (латиница + кириллица).
const fs = require("fs");
const path = require("path");

const W = 1200, H = 630;
const RED = "#ed0012";
const FONT_DIR = path.join(__dirname, "../assets/og-fonts");
const FONT_FILES = ["Onest-Medium.ttf", "Onest-Bold.ttf", "Onest-ExtraBold.ttf"].map(f => path.join(FONT_DIR, f)).filter(f => fs.existsSync(f));

let Resvg = null;
function loadResvg(){ if(!Resvg) Resvg = require("@resvg/resvg-js").Resvg; return Resvg; }

const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const money = n => Number(n) > 0 ? "$" + Math.round(Number(n)).toLocaleString("en-US").replace(/,/g, " ") : "";
const MONTHS = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
function dateRu(iso){
  const t = Date.parse(iso || ""); if(!Number.isFinite(t)) return "";
  const p = new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Chisinau", day:"numeric", month:"numeric", hour:"2-digit", minute:"2-digit", hour12:false}).formatToParts(new Date(t));
  const g = k => (p.find(x => x.type === k) || {}).value || "";
  return `${g("day")} ${MONTHS[Number(g("month")) - 1] || ""}, ${g("hour")}:${g("minute")}`;
}

// Грубая оценка ширины текста Onest (px на символ при размере 1): для переноса строк и подбора размера
function textW(s, size, bold){
  let w = 0;
  for(const ch of String(s)){
    if(/[A-ZА-ЯЁ]/.test(ch)) w += 0.68; else if(/[0-9]/.test(ch)) w += 0.6; else if(/[ .,:;!'|·\-–]/.test(ch)) w += 0.3; else if(/[mwшщжфюмw]/i.test(ch)) w += 0.78; else w += 0.56;
  }
  return w * size * (bold ? 1.04 : 1);
}
// До maxLines строк, слова целиком; лишнее — «…»
function wrap(text, size, maxW, maxLines, bold){
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for(let i = 0; i < words.length; i++){
    const next = cur ? cur + " " + words[i] : words[i];
    if(textW(next, size, bold) <= maxW || !cur) cur = next;
    else{ lines.push(cur); cur = words[i]; if(lines.length === maxLines) break; }
  }
  if(lines.length < maxLines && cur) lines.push(cur);
  const used = lines.join(" ").split(/\s+/).length;
  if(used < words.length && lines.length){ let last = lines[lines.length - 1]; while(last.length > 1 && textW(last + "…", size, bold) > maxW) last = last.slice(0, -1); lines[lines.length - 1] = last.replace(/[\s,.-]+$/, "") + "…"; }
  return lines;
}

// Перенос в 1–2 строки без «висячих» слов: при том же числе строк берём самую узкую раскладку
function balanced(text, size, maxW, maxLines, bold){
  const base = wrap(text, size, maxW, maxLines, bold);
  if(base.length !== 2) return base;
  let best = base, bestW = Math.max(...base.map(l => textW(l, size, bold)));
  for(let w = maxW - 30; w > maxW * 0.5; w -= 30){
    const l = wrap(text, size, w, maxLines, bold);
    if(l.length !== 2 || l.join(" ").length < base.join(" ").length) break;
    const mw = Math.max(...l.map(x => textW(x, size, bold)));
    if(mw < bestW){ best = l; bestW = mw; }
  }
  return best;
}

async function fetchImage(url, timeoutMs = 6000){
  if(!/^https:\/\//i.test(String(url || ""))) return null;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const r = await fetch(url, {signal:ctrl.signal, headers:{"user-agent":"Mozilla/5.0 (compatible; ApexAuto-OG/1.0)", accept:"image/*"}});
    if(!r.ok) return null;
    const type = String(r.headers.get("content-type") || "").split(";")[0];
    if(!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if(buf.length < 2000 || buf.length > 6e6) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  }catch(e){ return null; }
  finally{ clearTimeout(timer); }
}
// Лучшая версия фото аукциона для картинки 1200 px
function bigPhoto(url){
  const u = String(url || "");
  if(/cs\.copart\.com\/.*_(hrs|thb)\.jpg/i.test(u)) return u.replace(/_(hrs|thb)\.jpg/i, "_ful.jpg");
  if(/vis\.iaai\.com\/resizer/i.test(u)) return u.replace(/([?&])width=\d+/i, "$1width=1280").replace(/([?&])height=\d+/i, "$1height=960");
  return u;
}

const LOGO = `<g><rect width="52" height="52" rx="14" fill="${RED}"/><path d="M13 36l9-20h8l9 20h-7l-2-5.2h-8L20 36zm11.5-11h5l-2.5-6.4z" fill="#fff"/></g>`;
const FLAG_CA = `<g><rect width="44" height="24" rx="4" fill="#fff"/><rect width="11" height="24" rx="4" fill="#d52b1e"/><rect x="33" width="11" height="24" rx="4" fill="#d52b1e"/><rect x="9" width="4" height="24" fill="#d52b1e"/><rect x="31" width="4" height="24" fill="#d52b1e"/><rect x="11" width="22" height="24" fill="#fff"/><path fill="#d52b1e" transform="translate(11 2) scale(.9)" d="M11 1.5l1.6 3.2 2.3-.9-.8 4.9 2.6-2 .7 1.9-2.6 2 3.2 1-.6 2-4.5-.5.5 2.7H11.4v3.5h-1.8v-3.5H7.2l.5-2.7-4.5.5-.6-2 3.2-1-2.6-2 .7-1.9 2.6 2-.8-4.9 2.3.9z"/></g>`;

function pill(x, y, text, opts = {}){
  const size = opts.size || 24, padX = opts.padX || 18, h = opts.h || 44;
  const w = Math.ceil(textW(text, size, true)) + padX * 2;
  return {w, svg:`<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="${opts.r || 12}" fill="${opts.bg || "rgba(9,11,15,.72)"}"/><text x="${w / 2}" y="${h / 2 + size * 0.36}" text-anchor="middle" font-family="Onest" font-weight="700" font-size="${size}" fill="${opts.fg || "#fff"}" letter-spacing="${opts.ls || 0.5}">${esc(text)}</text></g>`};
}

function frame(inner){
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${inner}</svg>`;
}
function toPng(svg){
  const R = loadResvg();
  const img = new R(svg, {font:{fontFiles:FONT_FILES, loadSystemFonts:false, defaultFontFamily:"Onest"}, fitTo:{mode:"width", value:W}});
  return img.render().asPng();
}
const photoLayer = (uri, blur) => uri
  ? `<defs><clipPath id="c"><rect width="${W}" height="${H}"/></clipPath>${blur ? `<filter id="bl" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur}"/></filter>` : ""}</defs><g clip-path="url(#c)"><image href="${uri}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"${blur ? ' filter="url(#bl)"' : ""}/></g>`
  : `<defs><linearGradient id="bg0" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#232833"/><stop offset="1" stop-color="#0d0f14"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#bg0)"/><circle cx="1010" cy="120" r="260" fill="${RED}" opacity=".14"/>`;
const shade = `<defs><linearGradient id="sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#090b0f" stop-opacity=".55"/><stop offset=".22" stop-color="#090b0f" stop-opacity="0"/><stop offset=".42" stop-color="#090b0f" stop-opacity="0"/><stop offset=".78" stop-color="#090b0f" stop-opacity=".9"/><stop offset="1" stop-color="#090b0f" stop-opacity=".96"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sh)"/>`;
const brandTop = (badges = "") => `<g transform="translate(44 36)">${LOGO}<text x="66" y="37" font-family="Onest" font-weight="800" font-size="30" fill="#fff">Apex<tspan fill="${RED}">Auto</tspan></text></g>${badges}`;
const footer = txt => `<text x="44" y="${H - 28}" font-family="Onest" font-weight="500" font-size="22" fill="#fff" fill-opacity=".62">${esc(txt)}</text>`;

// ---------- Лот аукциона ----------
// lot: {title, auction, canada, image, price, priceLabel, chips[], date, sold}
async function lotCard(lot){
  const uri = await fetchImage(bigPhoto(lot.image));
  const titleLines = wrap(lot.title || "Автомобиль", 66, 700, 2, true);
  const tSize = titleLines.length > 1 || textW(lot.title || "", 66, true) > 700 ? 60 : 68;
  const fmtChip = c => String(c).replace(/^(\d{4,})(\s*(?:км|km|mi|миль|mile|mile[sn]?))/i, (m, n, u) => Number(n).toLocaleString("en-US").replace(/,/g, "\u00a0") + u);
  const chips = (lot.chips || []).filter(Boolean).map(fmtChip).slice(0, 4);
  // бейджи справа сверху
  let bx = W - 44, badges = "";
  const push = (svg, w) => { bx -= w; badges += svg.replace("__X__", String(bx)); bx -= 12; };
  if(lot.auction){ const auc = pill(0, 40, String(lot.auction).toUpperCase(), {size:24, h:44, bg:"rgba(9,11,15,.78)"}); push(`<g transform="translate(__X__ 0)">${auc.svg}</g>`, auc.w); }
  if(lot.canada){ push(`<g transform="translate(__X__ 40)"><rect width="66" height="44" rx="12" fill="#fff"/><g transform="translate(11 10)">${FLAG_CA}</g></g>`, 66); }
  if(lot.tag){ const t = pill(0, 40, lot.tag, {size:22, h:44, bg:lot.tagBg || "#1c9c5b"}); push(`<g transform="translate(__X__ 0)">${t.svg}</g>`, t.w); }
  const ty = 370 - (titleLines.length - 1) * 0;
  let y = 396;
  const titleSvg = titleLines.map((l, i) => `<text x="44" y="${y + i * (tSize + 6)}" font-family="Onest" font-weight="800" font-size="${tSize}" fill="#fff">${esc(l)}</text>`).join("");
  y += titleLines.length * (tSize + 6);
  const chipsSvg = chips.length ? `<text x="44" y="${y + 20}" font-family="Onest" font-weight="500" font-size="30" fill="#fff" fill-opacity=".92">${esc(chips.join("  ·  "))}</text>` : "";
  const priceBlock = lot.price
    ? `<g transform="translate(${W - 44} 0)"><text x="0" y="446" text-anchor="end" font-family="Onest" font-weight="500" font-size="26" fill="#fff" fill-opacity=".78">${esc(lot.priceLabel || "")}</text><text x="0" y="524" text-anchor="end" font-family="Onest" font-weight="800" font-size="84" fill="#fff">${esc(lot.price)}</text>${lot.date ? `<text x="0" y="562" text-anchor="end" font-family="Onest" font-weight="500" font-size="26" fill="#fff" fill-opacity=".78">${esc(lot.date)}</text>` : ""}</g>`
    : `${lot.priceLabel ? `<text x="${W - 44}" y="500" text-anchor="end" font-family="Onest" font-weight="800" font-size="46" fill="#fff">${esc(lot.priceLabel)}</text>` : ""}${lot.date ? `<text x="${W - 44}" y="548" text-anchor="end" font-family="Onest" font-weight="500" font-size="30" fill="#fff" fill-opacity=".85">${esc(lot.date)}</text>` : ""}`;
  const bar = `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${RED}"/>`;
  const svg = frame(photoLayer(uri) + shade + brandTop(badges) + titleSvg + chipsSvg + priceBlock + footer("apexauto.md · доставка авто из США и Канады под ключ") + bar);
  return toPng(svg);
}

// ---------- Отслеживание ----------
// t: {vehicle, vin, statusLabel, stageIndex, stageTotal, stages:[{label,status}], image, delivered}
async function trackCard(t){
  const uri = await fetchImage(bigPhoto(t.image));
  const name = wrap(t.vehicle || "Ваш автомобиль", 60, 1000, 2, true);
  const nameSvg = name.map((l, i) => `<text x="44" y="${262 + i * 68}" font-family="Onest" font-weight="800" font-size="60" fill="#fff">${esc(l)}</text>`).join("");
  const vinY = 262 + (name.length - 1) * 68 + 54;
  const subY = vinY + 52;
  const stages = t.stages || [];
  const n = stages.length || 1, x0 = 110, x1 = W - 110, gap = (x1 - x0) / Math.max(1, n - 1);
  const stageY = 486;
  let line = "", dots = "", labels = "";
  const done = stages.filter(s => s.status === "completed" || s.status === "current").length;
  if(n > 1){
    line = `<line x1="${x0}" y1="${stageY}" x2="${x1}" y2="${stageY}" stroke="#fff" stroke-opacity=".22" stroke-width="6" stroke-linecap="round"/>`;
    const lastDone = Math.max(0, stages.reduce((a, s, i) => (s.status === "completed" || s.status === "current") ? i : a, 0));
    line += `<line x1="${x0}" y1="${stageY}" x2="${x0 + gap * lastDone}" y2="${stageY}" stroke="${RED}" stroke-width="6" stroke-linecap="round"/>`;
  }
  stages.forEach((s, i) => {
    const cx = n > 1 ? x0 + gap * i : W / 2;
    const cur = s.status === "current", ok = s.status === "completed";
    dots += `<circle cx="${cx}" cy="${stageY}" r="${cur ? 17 : 12}" fill="${ok || cur ? RED : "#3a404c"}" ${cur ? 'stroke="#fff" stroke-width="5"' : ""}/>${ok ? `<path d="M${cx - 5} ${stageY} l3.5 3.5 6.5-7" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ""}`;
    const lab = wrap(s.label, 19, gap - 12, 2, cur);
    labels += lab.map((l, k) => `<text x="${cx}" y="${stageY + 52 + k * 24}" text-anchor="middle" font-family="Onest" font-weight="${cur ? 700 : 500}" font-size="19" fill="#fff" fill-opacity="${cur ? 1 : ok ? 0.75 : 0.42}">${esc(l)}</text>`).join("");
  });
  const status = pill(44, 116, t.statusLabel || "В обработке", {size:26, h:52, padX:22, bg:t.delivered ? "#1c9c5b" : RED, r:14});
  const svg = frame(photoLayer(uri, uri ? 14 : 0) + `<rect width="${W}" height="${H}" fill="#0b0d11" fill-opacity="${uri ? 0.66 : 0}"/>` + brandTop(`<text x="${W - 44}" y="70" text-anchor="end" font-family="Onest" font-weight="700" font-size="24" fill="#fff" fill-opacity=".8" letter-spacing="1.5">ОТСЛЕЖИВАНИЕ АВТО</text>`)
    + status.svg + nameSvg + (t.vin ? `<text x="44" y="${vinY}" font-family="Onest" font-weight="500" font-size="28" fill="#fff" fill-opacity=".8" letter-spacing="1">VIN ${esc(t.vin)}</text>` : "")
    + (t.sub ? `<text x="44" y="${subY}" font-family="Onest" font-weight="700" font-size="32" fill="#fff">${esc(t.sub)}</text>` : "")
    + line + dots + labels + footer("apexauto.md/tracking") + `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${RED}"/>`);
  return toPng(svg);
}

// ---------- Общая брендовая картинка (запасная) ----------
async function brandCard(title, sub){
  const lines = wrap(title, 72, 1000, 3, true);
  const svg = frame(photoLayer(null) + brandTop() + lines.map((l, i) => `<text x="44" y="${290 + i * 84}" font-family="Onest" font-weight="800" font-size="72" fill="#fff">${esc(l)}</text>`).join("")
    + (sub ? `<text x="44" y="${290 + lines.length * 84 + 14}" font-family="Onest" font-weight="500" font-size="32" fill="#fff" fill-opacity=".75">${esc(sub)}</text>` : "") + footer("apexauto.md") + `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${RED}"/>`);
  return toPng(svg);
}

// ---------- Страница сайта ----------
// p: {kicker, title, sub, path, photoPath (локальный файл) | image (data URI)}
async function pageCard(p){
  let uri = p.image || null;
  if(!uri && p.photoPath && fs.existsSync(p.photoPath)){
    const ext = path.extname(p.photoPath).slice(1).toLowerCase().replace("jpg", "jpeg");
    uri = `data:image/${ext};base64,${fs.readFileSync(p.photoPath).toString("base64")}`;
  }
  let size = 78, lines = balanced(p.title, size, 940, 3, true);
  if(lines.length > 2){ size = 66; lines = wrap(p.title, size, 940, 3, true); }
  const top = 250 - (lines.length - 1) * 26;
  const titleSvg = lines.map((l, i) => `<text x="44" y="${top + i * (size + 8)}" font-family="Onest" font-weight="800" font-size="${size}" fill="#fff">${esc(l)}</text>`).join("");
  const subLines = balanced(p.sub || "", 32, 980, 2, false);
  const subY = top + lines.length * (size + 8) - 4;
  const subSvg = subLines.map((l, i) => `<text x="44" y="${subY + 20 + i * 42}" font-family="Onest" font-weight="500" font-size="32" fill="#fff" fill-opacity=".82">${esc(l)}</text>`).join("");
  const side = `<defs><linearGradient id="sd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#090b0f" stop-opacity=".94"/><stop offset=".55" stop-color="#090b0f" stop-opacity=".72"/><stop offset="1" stop-color="#090b0f" stop-opacity=".25"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sd)"/>`;
  const kick = p.kicker ? `<rect x="44" y="${top - size - 44}" width="6" height="26" rx="3" fill="${RED}"/><text x="64" y="${top - size - 24}" font-family="Onest" font-weight="700" font-size="24" fill="#fff" fill-opacity=".9" letter-spacing="3">${esc(p.kicker)}</text>` : "";
  const svg = frame(photoLayer(uri) + (uri ? side : "") + brandTop() + kick + titleSvg + subSvg + footer(p.path || "apexauto.md") + `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${RED}"/>`);
  return toPng(svg);
}

module.exports = {lotCard, trackCard, brandCard, pageCard, money, dateRu, fetchImage, bigPhoto};
