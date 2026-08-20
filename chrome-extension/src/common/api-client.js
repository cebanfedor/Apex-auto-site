/* api-client.js — обогащение лота через API аукционов.
   Два режима:
   «site»   — запрос к своему серверу apexauto.md/api/lot (ключ остаётся на Vercel);
   «direct» — прямой запрос к auctionsapi.com с ключом, сохранённым в настройках. */
(function (global) {
  "use strict";
  const ApexX = (global.ApexX = global.ApexX || {});
  const U = ApexX.util;
  const C = ApexX.core;

  const BASE = "https://auctionsapi.com/api";

  async function getJson(url, headers) {
    const res = await fetch(url, { headers: Object.assign({ accept: "application/json" }, headers || {}) });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (payload && (payload.error || payload.message)) || `HTTP ${res.status}`;
      throw new Error(String(message));
    }
    return payload;
  }

  /** auctionsapi.com — полная карточка лота */
  async function fromAuctionsApi(lotNumber, auction, apiKey) {
    if (!apiKey || !lotNumber) return null;
    const params = new URLSearchParams({ prices_history: "1" });
    if (auction === "iaai") params.set("search_by_id", "1");
    const payload = await getJson(
      `${BASE}/search-lot/${encodeURIComponent(lotNumber)}/${auction}?${params}`,
      { "x-api-key": apiKey }
    );
    if (!payload || payload.error) return null;
    const source = C.sourceFromJson("auctionsapi", payload, null);
    if (source) source.raw = payload;
    return source;
  }

  /** apexauto.md/api/lot?url=… — нормализованный ответ сайта плюс сырые данные аукциона */
  async function fromSite(endpoint, lotUrl) {
    if (!endpoint || !lotUrl) return null;
    // raw=1: сырой ответ аукциона разбираем своими правилами — так в карточку попадают
    // поля, которых нет в нормализованном наборе (ключи, цвет, вторичное повреждение)
    const url = `${endpoint}${endpoint.includes("?") ? "&" : "?"}url=${encodeURIComponent(lotUrl)}&raw=1`;
    const payload = await getJson(url);
    if (!payload || payload.ok === false) throw new Error((payload && payload.error) || "Сайт не вернул лот");
    const lot = payload.lot || payload;
    const normalized = C.sourceFromJson("apex-site", lot, null);
    const raw = lot.raw ? C.sourceFromJson("auction-raw", lot.raw, null) : null;
    if (!normalized && !raw) return null;
    // нормализованные поля точнее (уже приведены к нашему виду), сырые — дополняют пустое
    return {
      name: "apex-site",
      fields: Object.assign({}, raw && raw.fields, normalized && normalized.fields),
      extra: Object.assign({}, raw && raw.extra, normalized && normalized.extra),
      images: U.uniq([].concat((normalized && normalized.images) || [], (raw && raw.images) || [])),
      raw: lot
    };
  }

  /**
   * Возвращает источник данных (или null) по настройкам.
   * Ошибки не роняют сбор — возвращаются в поле error.
   */
  async function enrich(lot, settings) {
    const api = (settings && settings.api) || {};
    const mode = api.mode || "site";
    if (mode === "off") return { source: null, error: "" };
    try {
      const source =
        mode === "direct"
          ? await fromAuctionsApi(lot.lot, lot.auction, api.auctionsApiKey)
          : await fromSite(api.siteEndpoint, lot.url || lot.pageUrl);
      return { source, error: source ? "" : "API не вернул данные по этому лоту" };
    } catch (error) {
      return { source: null, error: String((error && error.message) || error) };
    }
  }

  ApexX.api = { enrich, fromAuctionsApi, fromSite };
})(typeof window !== "undefined" ? window : self);
