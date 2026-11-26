// Публичная страница счёта /invoice/<токен> (токен — случайные 24 символа, найти перебором нельзя). Не индексируется.
const {sendJson} = require("../server/http");
const supabase = require("../server/supabase");
const inv = require("../server/invoice");

module.exports = async function handler(request, response){
  if(request.method !== "GET"){ sendJson(response, 405, {ok: false}); return; }
  const url = new URL(request.url, "https://apexauto.md");
  const token = url.searchParams.get("token") || "";
  const lang = ["ru", "ro", "en"].includes(url.searchParams.get("lang")) ? url.searchParams.get("lang") : "ru";
  const html = (code, body) => {
    response.statusCode = code;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-robots-tag", "noindex, nofollow");
    response.end(body);
  };
  if(!inv.okToken(token)){ html(404, "<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>Счёт не найден</title><body style='font-family:sans-serif;padding:40px'>Счёт не найден. Проверьте ссылку или напишите нам: apexauto.md/contacts"); return; }
  try{
    const rows = await supabase.rest(`/alert_meta?k=eq.${encodeURIComponent("inv:" + token)}&select=v&limit=1`);
    const rec = rows && rows[0] && rows[0].v;
    if(!rec){ html(404, "<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>Счёт не найден</title><body style='font-family:sans-serif;padding:40px'>Счёт не найден."); return; }
    const set = await supabase.rest(`/alert_meta?k=eq.invset&select=v&limit=1`).catch(() => []);
    html(200, inv.renderInvoice(rec, set && set[0] && set[0].v && set[0].v.requisites || "", lang));
  }catch(e){
    html(500, "<!doctype html><meta charset=utf-8><title>Ошибка</title><body style='font-family:sans-serif;padding:40px'>Не удалось загрузить счёт, попробуйте позже.");
  }
};
