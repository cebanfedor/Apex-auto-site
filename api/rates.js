const { createClient } = require("@supabase/supabase-js");

const CACHE_KEY = "fxrates_usd_mdl";
const CACHE_TTL = 3600; // 1 час

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function getCache(db) {
  if (!db) return null;
  try {
    const { data } = await db.from("api_cache")
      .select("data")
      .eq("cache_key", CACHE_KEY)
      .gt("expires_at", new Date().toISOString())
      .single();
    return data?.data || null;
  } catch { return null; }
}

async function setCache(db, payload) {
  if (!db) return;
  try {
    const expires = new Date(Date.now() + CACHE_TTL * 1000).toISOString();
    await db.from("api_cache").upsert({ cache_key: CACHE_KEY, data: payload, expires_at: expires });
  } catch {}
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || "";
  const allowed = ["https://apexauto.md", "http://localhost:8081"];
  if (allowed.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  if (req.method === "OPTIONS") return res.status(204).end();

  const db = supabase();

  // Проверяем кэш
  const cached = await getCache(db);
  if (cached) {
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=300");
    return res.json({ ...cached, cached: true });
  }

  // Запрашиваем свежий курс
  const apiKey = process.env.FXRATES_API_KEY;
  const url = apiKey
    ? `https://api.fxratesapi.com/latest?currencies=MDL,EUR&base=USD&api_key=${apiKey}`
    : `https://api.fxratesapi.com/latest?currencies=MDL,EUR&base=USD`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fxrates ${r.status}`);
    const data = await r.json();
    if (!data.success) throw new Error("fxrates error");

    const usdMdl = data.rates?.MDL;
    const eurUsd = data.rates?.EUR;
    const eurMdl = usdMdl && eurUsd ? usdMdl / eurUsd : null;

    const payload = {
      usdMdl: usdMdl ? +usdMdl.toFixed(2) : null,
      eurMdl: eurMdl ? +eurMdl.toFixed(2) : null,
      date: data.date,
    };

    await setCache(db, payload);

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=300");
    return res.json(payload);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
};
