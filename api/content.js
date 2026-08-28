const {sendJson, methodNotAllowed, readBody} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");

const CONTENT_KEY = "site";

const DEFAULT_CONTENT = {
  logo_url:"",
  phone:"068-832-032",
  telegram:"https://t.me/fedukusa",
  whatsapp:"https://wa.me/37368832032",
  hero_title:"Авто из США в Кишинёв — цена под ключ до того, как участвовать в торгах",
  hero_text:"Видите аукционный сбор, доставку, страховку и таможню ещё до ставки. BMW X5, Tesla Model 3, Honda CR-V — без скрытых расходов при получении.",
  benefits:[
    "Подбор и проверка лота",
    "Расчет стоимости под ключ",
    "Участие в торгах",
    "Документы, доставка и сопровождение"
  ]
};

const RATES_CACHE_KEY = "mdl_sell_rates_v3";
const RATES_TTL = 3600;
// Типовая маржа молдавских банков: курс продажи ≈ курс НБМ + 1.2%
const BANK_SELL_MARGIN = 1.012;

async function fetchBnmRates() {
  const r = await fetch("https://bnm.md/ro", {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ApexAuto/1.0)" },
  });
  if (!r.ok) throw new Error(`BNM fetch ${r.status}`);
  const html = await r.text();

  // БНМ встраивает курсы в JS-конфиг: "840":{"code":"840","amount":"1","rate":17.6254}
  // Код 840 = USD, 978 = EUR. Берём последнее вхождение (самая свежая дата).
  const usdMatches = [...html.matchAll(/"840":\{"code":"840","amount":"1","rate":(\d+\.\d+)\}/g)];
  const eurMatches = [...html.matchAll(/"978":\{"code":"978","amount":"1","rate":(\d+\.\d+)\}/g)];
  if (!usdMatches.length || !eurMatches.length) throw new Error("BNM parse failed");

  const usdBnm = parseFloat(usdMatches[usdMatches.length - 1][1]);
  const eurBnm = parseFloat(eurMatches[eurMatches.length - 1][1]);

  return {
    usdMdl: +(usdBnm * BANK_SELL_MARGIN).toFixed(2),
    eurMdl: +(eurBnm * BANK_SELL_MARGIN).toFixed(2),
    source: "bnm",
    date: new Date().toISOString(),
  };
}

// CAD→USD по Non-Cash курсу TD Bank (тот же, что на ix0.apps.td.com/en/fxcal):
// им оплачиваются канадские аукционы. Fallback — frankfurter (ECB), затем 0.6923.
async function fetchCadUsdRate() {
  try {
    const r = await fetch("https://ix0.apps.td.com/api/fxcal/non-cash-gfx-rates/en", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ApexAuto/1.0)" },
    });
    const data = await r.json();
    const usd = (data?.conversionTableFXCAL || []).find((row) => row.currencyCode === "USD");
    // Направление «отправляем USD → получаем CAD»: за 1 USD дают currencyRateRec CAD
    // (у TD: 39,000 CAD = 29,008 USD при Rec 1.3444 → CAD→USD 0.7438)
    const rec = Number(usd?.currencyRateRec);
    if (rec > 0) return +(1 / rec).toFixed(4);
  } catch {}
  try {
    const r = await fetch("https://api.frankfurter.app/latest?from=CAD&to=USD");
    const data = await r.json();
    const rate = Number(data?.rates?.USD);
    if (rate > 0) return +rate.toFixed(4);
  } catch {}
  return 0.6923;
}

async function fetchFallbackRates() {
  const apiKey = process.env.FXRATES_API_KEY;
  const url = `https://api.fxratesapi.com/latest?currencies=MDL,EUR&base=USD${apiKey ? `&api_key=${apiKey}` : ""}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fxrates ${r.status}`);
  const data = await r.json();
  if (!data.success) throw new Error("fxrates error");
  const usdMdl = data.rates?.MDL;
  const eurUsd = data.rates?.EUR;
  return {
    usdMdl: usdMdl ? +(usdMdl * BANK_SELL_MARGIN).toFixed(2) : null,
    eurMdl: (usdMdl && eurUsd) ? +((usdMdl / eurUsd) * BANK_SELL_MARGIN).toFixed(2) : null,
    source: "fxrates",
    date: data.date,
  };
}

// Supabase может тормозить — кеш курсов никогда не ждём дольше 3с,
// иначе весь /api/content?rates=1 висит и фронт остаётся на дефолтных курсах.
function sbTimeout(promise, ms, fallback) {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function fetchRates() {
  // Проверяем кэш
  try {
    const cached = await sbTimeout(supabase.list("api_cache", {
      cache_key: `eq.${RATES_CACHE_KEY}`,
      expires_at: `gt.${new Date().toISOString()}`,
      select: "data", limit: 1,
    }), 3000, null);
    if (cached?.[0]?.data) return cached[0].data;
  } catch {}

  // Пробуем БНМ, затем fxratesapi как резерв; CAD→USD (TD Bank) — параллельно
  let payload;
  const cadUsdPromise = fetchCadUsdRate();
  try {
    payload = await fetchBnmRates();
  } catch {
    payload = await fetchFallbackRates();
  }
  payload.cadUsd = await cadUsdPromise;

  // Кэшируем
  try {
    const expires = new Date(Date.now() + RATES_TTL * 1000).toISOString();
    await sbTimeout(supabase.upsert("api_cache", { cache_key: RATES_CACHE_KEY, data: payload, expires_at: expires }, "cache_key"), 3000, null);
  } catch {}

  return payload;
}

module.exports = async function handler(request, response){
  // /api/calc приходит сюда через rewrite: расчёт открыт всем и не требует админ-доступа
  const requestUrl = new URL(request.url, "http://localhost");
  if(requestUrl.searchParams.get("calc") === "1" || /^\/api\/calc\b/.test(requestUrl.pathname)){
    return require("../server/calc-handler")(request, response);
  }

  if(request.method !== "GET" && !requireAdmin(request, response)) return;

  try{
    if(request.method === "GET"){
      // Режим курса валют: /api/content?rates=1
      if(request.query?.rates === "1" || new URL(request.url, "http://x").searchParams.get("rates") === "1"){
        try {
          const rates = await fetchRates();
          sendJson(response, 200, { ok: true, ...rates });
        } catch(e) {
          sendJson(response, 502, { ok: false, error: e.message });
        }
        return;
      }

      const rows = await supabase.list("site_content", {select:"*", key:`eq.${CONTENT_KEY}`, limit:1});
      sendJson(response, 200, {ok:true,content:rows[0]?.content || DEFAULT_CONTENT});
      return;
    }

    if(request.method === "PUT" || request.method === "POST"){
      const body = await readBody(request);
      const rows = await supabase.list("site_content", {select:"id", key:`eq.${CONTENT_KEY}`, limit:1});
      const payload = {key:CONTENT_KEY, content:{...DEFAULT_CONTENT, ...(body.content || body)}};
      const item = rows[0]?.id
        ? await supabase.update("site_content", rows[0].id, payload)
        : await supabase.create("site_content", payload);
      sendJson(response, 200, {ok:true,item,content:item?.content || payload.content});
      return;
    }

    methodNotAllowed(response, ["GET","POST","PUT"]);
  }catch(error){
    if(request.method === "GET" && /Missing SUPABASE/i.test(error.message || "")){
      sendJson(response, 200, {ok:true,content:DEFAULT_CONTENT,mode:"fallback"});
      return;
    }
    sendJson(response, error.status || 500, {ok:false,error:error.message,details:error.details || null});
  }
};

// курс нужен и калькулятору (/api/calc) — источник должен быть один
module.exports.fetchRates = fetchRates;
