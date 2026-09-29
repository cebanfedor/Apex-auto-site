// Безопасный self-origin для внутренних fetch на собственный домен.
// Защита от SSRF/подделки заголовка: Host берём ТОЛЬКО если он в аллоулисте
// (apexauto.md и её поддомены, либо превью *.vercel.app). Иначе — фиксированный
// прод-домен. Протокол всегда https (Vercel терминирует TLS). Раньше host брался
// напрямую из x-forwarded-host — атакующий мог увести self-fetch на чужой хост.
const ALLOW = /^(?:[a-z0-9-]+\.)*apexauto\.md$|^[a-z0-9-]+\.vercel\.app$/i;
function selfHost(req){
  const raw = String((req && req.headers && (req.headers["x-forwarded-host"] || req.headers.host)) || "")
    .split(",")[0].trim().toLowerCase();
  return ALLOW.test(raw) ? raw : "apexauto.md";
}
function selfOrigin(req){ return "https://" + selfHost(req); }
module.exports = { selfHost, selfOrigin };
