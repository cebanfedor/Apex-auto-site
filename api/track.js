// Лёгкая аналитика без cookie: просмотры страниц, «онлайн сейчас», события. Сводка для админки — GET ?stats=1&days=7.
// Посетитель = хэш(ip + ua + соль суток): без хранения идентификаторов в браузере и без персональных данных.
const crypto = require("crypto");
const {sendJson, getQuery, readBody} = require("../server/http");
const {isAuthenticated} = require("../server/auth");

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python|axios|node-fetch|go-http|vercel|GTmetrix|Chrome-Lighthouse/i;
const EVENTS = new Set(["fav_add", "save_search", "alert_search", "alert_lot", "alert_connected", "lead_open", "calc_use"]);
const SELF_HOSTS = new Set(["apexauto.md", "www.apexauto.md"]);
const rate = new Map();

function sbConf(){
  return {
    url:(process.env.SUPABASE_URL || "").replace(/\/$/, ""),
    key:process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""
  };
}
async function sb(path, options = {}){
  const {url, key} = sbConf();
  const res = await fetch(`${url}/rest/v1${path}`, {
    ...options,
    headers:{apikey:key, authorization:`Bearer ${key}`, "content-type":"application/json", ...(options.headers || {})}
  });
  const text = await res.text();
  if(!res.ok) throw new Error(`Supabase ${res.status}: ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

function cleanPath(p){
  if(typeof p !== "string") return "";
  let s = p.split("?")[0].split("#")[0];
  if(s.length > 1) s = s.replace(/\/+$/, "");
  if(!/^\/[A-Za-z0-9/_\-.%~]*$/.test(s) || s.length > 200) return "";
  if(/^\/(admin|api)(\/|$)/.test(s)) return "";
  return s || "/";
}
function refHost(r){
  try{
    const h = new URL(String(r || "")).hostname.replace(/^www\./, "").toLowerCase();
    return !h || SELF_HOSTS.has(h) || SELF_HOSTS.has("www." + h) ? "" : h.slice(0, 60);
  }catch(_){ return ""; }
}

module.exports = async function handler(request, response){
  const query = getQuery(request);

  // ---- сводка для админки ----
  if(request.method === "GET"){
    if(!isAuthenticated(request)){ sendJson(response, 401, {ok:false, error:"Нет доступа"}); return; }
    const days = Math.max(1, Math.min(90, Number(query.get("days")) || 7));
    try{
      const stats = await sb("/rpc/site_stats", {method:"POST", body:JSON.stringify({days})});
      sendJson(response, 200, {ok:true, stats}, {"cache-control":"no-store"});
    }catch(e){
      const msg = String(e.message || e);
      sendJson(response, 200, {ok:false, error:/site_stats|site_hits|does not exist|schema cache/i.test(msg) ? "Аналитика не подключена: запустите SQL-миграцию analytics в Supabase." : msg.slice(0, 200)});
    }
    return;
  }
  if(request.method !== "POST"){ response.status(405).end(); return; }

  // ---- приём событий ----
  try{
    const ua = String(request.headers["user-agent"] || "");
    if(!ua || BOT_RE.test(ua) || request.headers["dnt"] === "1" || isAuthenticated(request)){ response.status(204).end(); return; }
    const body = await readBody(request).catch(() => ({}));
    const path = cleanPath(body.p);
    if(!path){ response.status(204).end(); return; }
    const ip = String(request.headers["x-forwarded-for"] || request.socket?.remoteAddress || "").split(",")[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const secret = process.env.ANALYTICS_SALT || process.env.ADMIN_SESSION_SECRET || "apex";
    const vh = crypto.createHash("sha256").update(`${secret}|${day}|${ip}|${ua}`).digest("hex").slice(0, 20);

    const now = Date.now();
    const bucket = rate.get(vh);
    if(!bucket || now - bucket.t > 60e3) rate.set(vh, {t:now, n:1});
    else if(++bucket.n > 40){ response.status(204).end(); return; }
    if(rate.size > 5000) rate.clear();

    const ev = typeof body.e === "string" && EVENTS.has(body.e) ? body.e : null;
    const hb = body.hb ? true : false;
    const dev = /iPad|Tablet/i.test(ua) ? "t" : /Mobi|Android|iPhone/i.test(ua) ? "m" : "d";
    const ctry = String(request.headers["x-vercel-ip-country"] || "").slice(0, 2).toUpperCase() || null;

    const jobs = [
      sb("/site_online?on_conflict=vh", {method:"POST", headers:{prefer:"resolution=merge-duplicates,return=minimal"}, body:JSON.stringify({vh, ts:new Date().toISOString(), path})})
    ];
    if(!hb) jobs.push(sb("/site_hits", {method:"POST", headers:{prefer:"return=minimal"}, body:JSON.stringify({vh, path, ref:ev ? null : (refHost(body.r) || null), dev, ctry, ev})}));
    await Promise.all(jobs);

    // Уборка: онлайн-строки старше суток и просмотры старше 120 дней (изредка, чтобы не нагружать каждый запрос)
    const roll = Math.random();
    if(roll < 0.004) sb(`/site_online?ts=lt.${encodeURIComponent(new Date(now - 864e5).toISOString())}`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
    else if(roll < 0.005) sb(`/site_hits?ts=lt.${encodeURIComponent(new Date(now - 120 * 864e5).toISOString())}`, {method:"DELETE", headers:{prefer:"return=minimal"}}).catch(() => {});
  }catch(_){ /* аналитика не должна ломать сайт */ }
  response.status(204).end();
};
