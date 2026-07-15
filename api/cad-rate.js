export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=300");

  try {
    const r = await fetch("https://ix0.apps.td.com/en/fxcal", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ApexAutoBot/1.0)",
        "Accept": "text/html",
      },
    });
    if (!r.ok) throw new Error(`TD fetch: ${r.status}`);
    const html = await r.text();

    // Non-cash rate is SSR'd as: $1 CAD = <strong ...>0.6923</strong>
    const m = html.match(/\$1 CAD = <strong[^>]*>([\d.]+)<\/strong>/);
    if (!m) throw new Error("rate not found in HTML");

    res.json({ rate: parseFloat(m[1]), source: "td-bank", cached: false });
  } catch (e) {
    // fallback to a safe recent rate
    res.json({ rate: 0.6923, source: "fallback", error: e.message });
  }
}
