const fs = require("fs");
const path = require("path");
const {PAGES} = require("../server/og-pages");

// Превью ссылок на языках RO/EN: /about?lang=ro, /guide?lang=en, /?lang=ro …
// Страницы русские, язык переключается скриптом уже в браузере — скрейперы (Telegram, WhatsApp, Facebook) его не видят.
// Здесь подставляем title/description/картинку нужного языка в тот же HTML (rewrites с has query lang=ro|en в vercel.json).
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

module.exports = async function(req, res){
  const key = String(req.query.page || "").replace(/[^a-z0-9-]/g, "");
  const lang = /^ro/i.test(String(req.query.lang || "")) ? "ro" : /^en/i.test(String(req.query.lang || "")) ? "en" : "";
  const def = PAGES[key];
  let html;
  try{ html = fs.readFileSync(path.join(__dirname, "../" + ((def && def.page) || key) + ".html"), "utf8"); }
  catch(e){ res.status(404).send("not found"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const tr = def && lang && def[lang];
  if(!tr || !tr.t){
    res.setHeader("Cache-Control", "public, s-maxage=300, max-age=60, stale-while-revalidate=3600");
    res.status(200).send(html);
    return;
  }
  const url = `https://apexauto.md${def.path ? "/" + def.path : "/"}?lang=${lang}`;
  const img = `https://apexauto.md/assets/og/${key}-${lang}.png?v=4`;
  const loc = {ro:"ro_RO", en:"en_US"}[lang];
  html = html
    .replace(/<html lang="[a-z-]*"/, `<html lang="${lang}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(tr.t)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(tr.d)}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${esc(url)}">`)
    .replace(/<meta property="og:locale"[^>]*>/, `<meta property="og:locale" content="${loc}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${esc(tr.t)}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${esc(tr.d)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${esc(url)}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${esc(img)}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${esc(tr.t)}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${esc(tr.d)}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${esc(img)}">`);
  res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=300, stale-while-revalidate=86400");
  res.status(200).send(html);
};
