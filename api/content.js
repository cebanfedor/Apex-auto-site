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

const RATES_CACHE_KEY = "fxrates_usd_mdl";
const RATES_TTL = 3600;

async function fetchRates() {
  // Проверяем кэш
  try {
    const cached = await supabase.list("api_cache", {
      cache_key: `eq.${RATES_CACHE_KEY}`,
      expires_at: `gt.${new Date().toISOString()}`,
      select: "data", limit: 1,
    });
    if (cached?.[0]?.data) return cached[0].data;
  } catch {}

  // Запрашиваем свежий курс
  const apiKey = process.env.FXRATES_API_KEY;
  const url = `https://api.fxratesapi.com/latest?currencies=MDL,EUR&base=USD${apiKey ? `&api_key=${apiKey}` : ""}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fxrates ${r.status}`);
  const data = await r.json();
  if (!data.success) throw new Error("fxrates error");

  const usdMdl = data.rates?.MDL;
  const eurUsd = data.rates?.EUR;
  const payload = {
    usdMdl: usdMdl ? +usdMdl.toFixed(2) : null,
    eurMdl: (usdMdl && eurUsd) ? +(usdMdl / eurUsd).toFixed(2) : null,
    date: data.date,
  };

  // Кэшируем
  try {
    const expires = new Date(Date.now() + RATES_TTL * 1000).toISOString();
    await supabase.upsert("api_cache", { cache_key: RATES_CACHE_KEY, data: payload, expires_at: expires }, "cache_key");
  } catch {}

  return payload;
}

module.exports = async function handler(request, response){
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
