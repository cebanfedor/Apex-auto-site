// Telegram Mini App (27.11.2026): проверка подписи initData и вход клиента без «Start»-ссылки.
// Алгоритм из документации Telegram: secret = HMAC_SHA256("WebAppData", bot_token);
// hash = HMAC_SHA256(secret, отсортированные "key=value" без hash через \n).
const crypto = require("crypto");

function verifyInitData(initData, botToken, maxAgeSec){
  if(!initData || !botToken || typeof initData !== "string" || initData.length > 4096) return null;
  let params;
  try{ params = new URLSearchParams(initData); }catch(_){ return null; }
  const hash = params.get("hash");
  if(!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null;
  const pairs = [];
  for(const [k, v] of params.entries()) if(k !== "hash") pairs.push(`${k}=${v}`);
  pairs.sort();
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calc = crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  const a = Buffer.from(calc, "hex"), b = Buffer.from(hash.toLowerCase(), "hex");
  if(a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Math.floor(Date.now() / 1000) - Number(params.get("auth_date") || 0);
  if(!(age >= -60 && age <= (maxAgeSec || 86400))) return null;
  let user = null;
  try{ user = JSON.parse(params.get("user") || "null"); }catch(_){ user = null; }
  if(!user || !Number.isFinite(Number(user.id)) || Number(user.id) <= 0) return null;
  return {id: Number(user.id), first_name: String(user.first_name || "").slice(0, 60), lang: ["ru", "ro", "en"].includes(user.language_code) ? user.language_code : (user.language_code === "uk" ? "ru" : "ru"), isBot: !!user.is_bot};
}

// Кнопка «Кабинет» в сообщениях бота открывает Mini App внутри Telegram (в личном чате), остальные ссылки — обычные
function inlineButton(b){
  if(b && b.url && /^https:\/\/apexauto\.md\/cabinet(?:[#?\/]|$)/.test(b.url)) return {text: b.text, web_app: {url: b.url}};
  return {text: b.text, url: b.url};
}

module.exports = {verifyInitData, inlineButton};
