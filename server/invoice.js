// Счета клиентам (27.11.2026): менеджер формирует счёт по сделке в админке → клиент открывает страницу
// /invoice/<токен> (печать в PDF), оплаты отмечаются вручную. Хранится в alert_meta (миграций не нужно):
//   inv:<токен>   → {token, deal_id, no, title, vin, client, lines:[{name, usd}], rate, note, created, paid:[{usd, at, note}], chat}
//   invset        → {requisites}
const crypto = require("crypto");

const SELLER = {name: "Apex Auto Import S.R.L.", idno: "1026023053147", address: "Chișinău, Strada Bucovinei 9F", phone: "+373 68 832 032", email: "apexauto.import@gmail.com", site: "apexauto.md"};
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = v => { const n = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const okToken = t => typeof t === "string" && /^[A-Za-z0-9_-]{20,40}$/.test(t);
const newToken = () => crypto.randomBytes(18).toString("base64url");

// Строки счёта: «Название | сумма $» по одной в строке (допустим минус — скидка)
function parseLines(v){
  const raw = Array.isArray(v) ? v : String(v || "").split(/\r?\n/);
  const out = [];
  for(const item of raw){
    let name, usd;
    if(item && typeof item === "object"){ name = item.name; usd = num(item.usd); }
    else{
      const s = String(item || "").trim(); if(!s) continue;
      const i = s.lastIndexOf("|");
      if(i < 0) continue;
      name = s.slice(0, i); usd = num(s.slice(i + 1));
    }
    name = String(name || "").trim().slice(0, 140);
    if(name && usd) out.push({name, usd});
  }
  return out.slice(0, 30);
}
// Строки по сохранённому расчёту сделки (доставка, море, таможня и брокер переводятся из лей по курсу, скидка — минусом)
function linesFromCalc(c){
  c = c || {};
  const out = [], rate = num(c.usd_mdl) || 0;
  const add = (name, usd) => { usd = num(usd); if(usd) out.push({name, usd}); };
  add("Доставка по США", c.land_usd);
  add("Морская доставка и дорога до Кишинёва", c.sea_usd);
  if(rate > 0){
    add("Таможенные платежи", num(c.customs_mdl) / rate);
    add("Брокер и утилизационный сбор", num(c.broker_mdl) / rate);
  }
  if(c.discount_on && num(c.discount_usd)) add("Скидка клиенту" + (c.note ? " (" + String(c.note).slice(0, 60) + ")" : ""), -Math.abs(num(c.discount_usd)));
  return out;
}
const total = lines => Math.round((lines || []).reduce((a, l) => a + (Number(l.usd) || 0), 0) * 100) / 100;
const paidSum = inv => Math.round(((inv && inv.paid) || []).reduce((a, p) => a + (Number(p.usd) || 0), 0) * 100) / 100;

const L = {
  ru: {h: "Счёт", no: "№", from: "Дата", seller: "Поставщик", buyer: "Плательщик", car: "Автомобиль", item: "Услуга / статья", sum: "Сумма, $", total: "Итого к оплате", mdl: "≈ в леях по курсу", paid: "Оплачено", left: "Осталось оплатить", req: "Реквизиты для оплаты", note: "Примечание", print: "Печать / сохранить в PDF", st: {paid: "ОПЛАЧЕН", part: "ЧАСТИЧНО ОПЛАЧЕН", due: "К ОПЛАТЕ"}, vat: "Без НДС. Сумма указана в долларах США; расчёт в леях — по курсу банка на день оплаты.", pays: "Платежи"},
  ro: {h: "Factură", no: "Nr.", from: "Data", seller: "Furnizor", buyer: "Plătitor", car: "Automobil", item: "Serviciu / articol", sum: "Suma, $", total: "Total de plată", mdl: "≈ în lei la cursul", paid: "Achitat", left: "Rest de plată", req: "Rechizite de plată", note: "Notă", print: "Tipărește / salvează PDF", st: {paid: "ACHITAT", part: "PARȚIAL ACHITAT", due: "DE PLATĂ"}, vat: "Sumă în dolari SUA; calculul în lei — la cursul băncii din ziua plății.", pays: "Plăți"},
  en: {h: "Invoice", no: "No.", from: "Date", seller: "Supplier", buyer: "Payer", car: "Vehicle", item: "Service / item", sum: "Amount, $", total: "Total due", mdl: "≈ in MDL at rate", paid: "Paid", left: "Left to pay", req: "Payment details", note: "Note", print: "Print / save as PDF", st: {paid: "PAID", part: "PARTLY PAID", due: "DUE"}, vat: "Amount in US dollars; MDL settlement at the bank rate on the payment day.", pays: "Payments"}
};
const fmt = n => Number(n).toLocaleString("ru-RU", {minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2});
const fmtDate = (iso, lang) => { try{ return new Date(iso).toLocaleDateString(lang === "en" ? "en-GB" : lang === "ro" ? "ro-RO" : "ru-RU", {timeZone: "Europe/Chisinau", day: "2-digit", month: "long", year: "numeric"}); }catch(_){ return String(iso || "").slice(0, 10); } };

function renderInvoice(inv, requisites, lang){
  lang = L[lang] ? lang : "ru";
  const T = L[lang];
  const sum = total(inv.lines), paid = paidSum(inv), left = Math.max(0, Math.round((sum - paid) * 100) / 100);
  const state = sum > 0 && left <= 0 ? "paid" : paid > 0 ? "part" : "due";
  const rows = (inv.lines || []).map(l => `<tr><td>${esc(l.name)}</td><td class="r">${l.usd < 0 ? "−" : ""}${fmt(Math.abs(l.usd))}</td></tr>`).join("");
  const pays = (inv.paid || []).length ? `<h3>${T.pays}</h3><table class="p">${inv.paid.map(p => `<tr><td>${esc(fmtDate(p.at, lang))}${p.note ? " · " + esc(p.note) : ""}</td><td class="r">${fmt(p.usd)} $</td></tr>`).join("")}</table>` : "";
  const mdl = Number(inv.rate) > 0 ? `<p class="m">${T.mdl} ${fmt(inv.rate)}: <b>${fmt(Math.round(left * inv.rate))} MDL</b></p>` : "";
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${T.h} ${esc(inv.no)} — Apex Auto</title>
<style>
:root{--red:#ed0012;--ink:#171a21;--mut:#667080;--line:#e3e6ec}
*{box-sizing:border-box}body{margin:0;background:#f1f3f7;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--ink)}
.sheet{max-width:780px;margin:24px auto;background:#fff;border:1px solid var(--line);border-radius:16px;padding:36px 40px}
header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:20px}
h1{margin:0;font-size:28px;letter-spacing:-.01em}.sub{color:var(--mut);font-size:14px}
.badge{display:inline-block;padding:5px 12px;border-radius:999px;font-weight:800;font-size:12px;letter-spacing:.06em}
.badge.due{background:#fff1f2;color:var(--red)}.badge.part{background:#fff6e5;color:#b45309}.badge.paid{background:#e8f7ee;color:#157347}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:18px}.cols h3,.sheet h3{margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut)}
.cols p{margin:0}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
.r{text-align:right;white-space:nowrap}.tot td{font-size:18px;font-weight:800;border-bottom:0}
.m{color:var(--mut);margin:2px 0}pre{white-space:pre-wrap;font:inherit;background:#f6f7fb;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin:6px 0 14px}
.btn{display:inline-block;margin-top:14px;background:var(--red);color:#fff;border:0;border-radius:12px;padding:12px 20px;font:700 15px inherit;cursor:pointer}
.foot{margin-top:18px;color:var(--mut);font-size:12.5px}.p td{padding:6px 8px}
@media(max-width:640px){.sheet{margin:0;border-radius:0;border-width:0;padding:22px 16px}.cols{grid-template-columns:1fr}header{flex-direction:column}h1{font-size:24px}}
@media print{body{background:#fff}.sheet{border:0;margin:0;padding:0;max-width:none}.btn{display:none}}
</style></head><body><div class="sheet">
<header><div><h1>${T.h} ${T.no} ${esc(inv.no)}</h1><div class="sub">${T.from}: ${esc(fmtDate(inv.created, lang))}</div></div><span class="badge ${state}">${T.st[state]}</span></header>
<div class="cols"><div><h3>${T.seller}</h3><p><b>${esc(SELLER.name)}</b><br>IDNO ${esc(SELLER.idno)}<br>${esc(SELLER.address)}<br>${esc(SELLER.phone)} · ${esc(SELLER.email)}</p></div>
<div><h3>${T.buyer}</h3><p><b>${esc(inv.client || "—")}</b></p><h3 style="margin-top:10px">${T.car}</h3><p>${esc(inv.title || "")}${inv.vin ? "<br>VIN " + esc(inv.vin) : ""}</p></div></div>
<table><thead><tr><th>${T.item}</th><th class="r">${T.sum}</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="tot"><td>${T.total}</td><td class="r">${fmt(sum)} $</td></tr></tfoot></table>
${paid > 0 ? `<p class="m">${T.paid}: <b>${fmt(paid)} $</b> · ${T.left}: <b>${fmt(left)} $</b></p>` : ""}${mdl}${pays}
${requisites ? `<h3 style="margin-top:18px">${T.req}</h3><pre>${esc(requisites)}</pre>` : ""}
${inv.note ? `<h3>${T.note}</h3><p>${esc(inv.note)}</p>` : ""}
<p class="foot">${T.vat}</p>
<button class="btn" onclick="window.print()">${T.print}</button></div></body></html>`;
}

module.exports = {SELLER, parseLines, linesFromCalc, total, paidSum, renderInvoice, newToken, okToken, num};
