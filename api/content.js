const {sendJson, methodNotAllowed, readBody} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");

const CONTENT_KEY = "site";

const DEFAULT_CONTENT = {
  logo_url:"",
  phone:"068-832-032",
  telegram:"https://t.me/fedukusa",
  whatsapp:"https://wa.me/37368832032",
  hero_title:"Рассчитайте полную стоимость автомобиля до Кишинева",
  hero_text:"Цена покупки автомобиля, аукционные сборы, доставка, страховка, таможенные платежи и сопровождение сделки — в одном понятном расчете.",
  benefits:[
    "Подбор и проверка лота",
    "Расчет стоимости под ключ",
    "Участие в торгах",
    "Документы, доставка и сопровождение"
  ]
};

module.exports = async function handler(request, response){
  if(request.method !== "GET" && !requireAdmin(request, response)) return;

  try{
    if(request.method === "GET"){
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
