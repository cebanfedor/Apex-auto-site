// Курс CAD→USD (TD Bank, «отправляем USD → получаем CAD») — ОДИН источник для всего сайта (06.11.2026, Федор:
// «курс Канады бери как на странице аукционов»): калькулятор лота (/api/content?rates=1) и каталог Канады (/api/catalog action=rates).
const {fetchT} = require("./fetchx");
const FALLBACK = 0.6923;
let cache = null;
async function fetchCadUsdRate(){
  if(cache && Date.now() - cache.t < 30 * 60e3) return cache.v;
  let v = 0;
  try{
    const r = await fetchT("https://ix0.apps.td.com/api/fxcal/non-cash-gfx-rates/en", {headers:{"User-Agent":"Mozilla/5.0 (compatible; ApexAuto/1.0)"}}, 6000);
    const data = await r.json();
    const usd = (data?.conversionTableFXCAL || []).find(row => row.currencyCode === "USD");
    // за 1 USD дают currencyRateRec CAD (у TD: 39,000 CAD = 29,008 USD при Rec 1.3444 → CAD→USD 0.7438)
    const rec = Number(usd?.currencyRateRec);
    if(rec > 0) v = +(1 / rec).toFixed(4);
  }catch(_){}
  if(!v){
    try{
      const r = await fetchT("https://api.frankfurter.app/latest?from=CAD&to=USD", {}, 6000);
      const data = await r.json();
      const rate = Number(data?.rates?.USD);
      if(rate > 0) v = +rate.toFixed(4);
    }catch(_){}
  }
  if(v){ cache = {t:Date.now(), v}; return v; }
  return cache ? cache.v : FALLBACK;
}
module.exports = {fetchCadUsdRate, FALLBACK};
