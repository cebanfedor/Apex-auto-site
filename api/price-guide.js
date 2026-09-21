// Админ-API закрытой таблицы оценки (ориентир ставки). ВСЕ методы — только для админа.
const {sendJson, methodNotAllowed, readBody} = require("../server/http");
const {requireAdmin} = require("../server/auth");
const supabase = require("../server/supabase");
const {resetGuideCache} = require("../server/price-guide");

const FUELS = new Set(["any","gas","hybrid","plugin","electric","diesel"]);
function cleanRow(r){
  const name = String(r.name || "").trim().slice(0, 120);
  const make = String(r.make || "").trim().toLowerCase().slice(0, 40);
  const tokens = (Array.isArray(r.tokens) ? r.tokens : String(r.tokens || "").split(/[\s,]+/))
    .map(t => String(t).toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean).slice(0, 8);
  const base = Number(r.base_price);
  if(!name || !make || !tokens.length || !(base > 0)) return null;
  const yf = Number(r.year_from) || null, yt = Number(r.year_to) || null;
  const k = Number(r.k);
  return {name, note:String(r.note || "").trim().slice(0, 200) || null, make, tokens,
    year_from:yf && yf > 1980 && yf < 2100 ? yf : null, year_to:yt && yt > 1980 && yt < 2100 ? yt : null,
    fuel:FUELS.has(String(r.fuel)) ? String(r.fuel) : "any", base_price:Math.round(base),
    k:k > 0.5 && k < 3 ? Math.round(k * 100) / 100 : 1.2, active:r.active !== false, updated_at:new Date().toISOString()};
}

module.exports = async function handler(request, response){
  if(!requireAdmin(request, response)) return;
  response.setHeader("cache-control", "no-store");
  try{
    if(request.method === "GET"){
      const items = await supabase.list("price_guide", {select:"*", order:"make.asc,name.asc", limit:"2000"});
      sendJson(response, 200, {ok:true, items:items || []});
      return;
    }
    if(request.method === "PUT"){
      // Полная замена таблицы (импорт из Google Sheets): сначала валидируем всё, потом пишем.
      const body = await readBody(request);
      const rows = (Array.isArray(body && body.items) ? body.items : []).map(cleanRow).filter(Boolean);
      if(rows.length < 1 || rows.length > 2000){ sendJson(response, 400, {ok:false, error:"Нет корректных строк для импорта"}); return; }
      const old = await supabase.list("price_guide", {select:"id", limit:"5000"});
      for(let i = 0; i < rows.length; i += 200) await supabase.create("price_guide", rows.slice(i, i + 200));
      for(const o of (old || [])) await supabase.remove("price_guide", o.id);
      resetGuideCache();
      sendJson(response, 200, {ok:true, saved:rows.length});
      return;
    }
    methodNotAllowed(response, ["GET","PUT"]);
  }catch(error){
    sendJson(response, error.status || 500, {ok:false, error:String(error.message || error).slice(0, 300)});
  }
};
