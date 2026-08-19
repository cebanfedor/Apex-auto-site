/* calc-handler — расчёт «под ключ» тем же модулем, что и калькулятор на сайте.
   Живёт вне api/, чтобы не занимать лимит serverless-функций: снаружи доступен
   как /api/calc (rewrite в vercel.json), внутри его вызывает api/content.js.
   Нужен, чтобы внешние клиенты (расширение Chrome, менеджеры, партнёры) получали
   ровно те же цифры, что видит клиент на apexauto.md, без второй копии формул.

   GET  /api/calc?lotPrice=4500&auction=iaai&vehicleType=sedan&fuel=hybrid&engineLiters=2&year=2020&landPrice=220&port=la
   POST /api/calc   {то же самое в JSON}

   Площадку можно передать двумя способами:
   - landPrice + port (расширение уже знает выбранную площадку из locations.js);
   - location: {landPrice, autoPort, displayName, portLabel}.
*/
const ApexCalc = require("../calc-core.js");
const { fetchRates } = require("../api/content.js");

const FALLBACK_RATES = { usdMdl: 17.45, eurMdl: 20.28, source: "fallback" };

/* Курс берём там же, где его берёт сайт: БНМ с резервом fxratesapi и общим кэшем.
   Так расширение и калькулятор не разъезжаются на пересчёте валют. */
async function currentRates() {
  try {
    const rates = await fetchRates();
    const usdMdl = Number(rates && rates.usdMdl);
    const eurMdl = Number(rates && rates.eurMdl);
    if (usdMdl > 0 && eurMdl > 0) {
      return { usdMdl, eurMdl, source: rates.source || "auto", date: rates.date || null };
    }
  } catch (e) {
    /* курс недоступен — считаем по значениям по умолчанию */
  }
  return FALLBACK_RATES;
}

const TRUE_VALUES = /^(1|true|yes|on)$/i;

function bool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return TRUE_VALUES.test(String(value));
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/* Тело могло быть уже прочитано за нас (Vercel, local-server) — тогда поток пуст
   и ждать событий бессмысленно. */
function readBody(request) {
  if (request.body && typeof request.body === "object") return Promise.resolve(request.body);
  if (typeof request.body === "string") return Promise.resolve(parseJson(request.body));
  if (request.readableEnded || request.complete) return Promise.resolve({});

  return new Promise((resolve) => {
    let raw = "";
    const done = (value) => resolve(value);
    const guard = setTimeout(() => done({}), 3000);
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 20000) request.destroy();
    });
    request.on("end", () => {
      clearTimeout(guard);
      done(parseJson(raw));
    });
    request.on("error", () => {
      clearTimeout(guard);
      done({});
    });
  });
}

function wantsAutoRates(params) {
  const usd = String(params.usdMdl ?? "").trim().toLowerCase();
  const eur = String(params.eurMdl ?? "").trim().toLowerCase();
  const auto = (v) => v === "" || v === "auto" || Number(v) <= 0 || !Number.isFinite(Number(v));
  return auto(usd) || auto(eur);
}

function buildInput(params, rates) {
  const location =
    params.location && typeof params.location === "object"
      ? params.location
      : params.landPrice !== undefined
      ? {
          landPrice: num(params.landPrice, 0),
          autoPort: params.port || "nj",
          displayName: params.locationName || "",
          portLabel: params.portLabel || ""
        }
      : null;

  return {
    lotPrice: num(params.lotPrice ?? params.bid, 0),
    auction: String(params.auction || "copart").toLowerCase(),
    vehicleType: params.vehicleType || "sedan",
    fuel: params.fuel || "gasoline",
    engineLiters: num(params.engineLiters, 2),
    year: num(params.year, new Date().getFullYear() - 5),
    insurance: bool(params.insurance, true),
    exportDocs: bool(params.exportDocs, false),
    offsite: bool(params.offsite, false),
    marginUsd: num(params.marginUsd, 0),
    usdMdl: num(params.usdMdl, rates.usdMdl),
    eurMdl: num(params.eurMdl, rates.eurMdl),
    port: params.port || "nj",
    location
  };
}

module.exports = async function handler(request, response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  try {
    const params =
      request.method === "POST"
        ? await readBody(request)
        : Object.fromEntries(new URL(request.url, "http://localhost").searchParams);

    const rates = wantsAutoRates(params)
      ? await currentRates()
      : Object.assign({}, FALLBACK_RATES, { source: "manual" });
    const input = buildInput(params, rates);
    const result = ApexCalc.compute(input);

    response.status(200).json({
      ok: true,
      version: ApexCalc.VERSION,
      input,
      breakdown: {
        lot: Math.round(result.lot),
        auctionFee: Math.round(result.auctionFee),
        land: Math.round(result.land),
        sea: Math.round(result.sea),
        exportDocs: Math.round(result.exportDocs),
        insurance: Math.round(result.insurance),
        company: Math.round(result.company),
        customsUsd: Math.round(result.customsUsd),
        customsMdl: Math.round(result.customsMdlValue)
      },
      customs: {
        cc: result.customs.cc || null,
        rate: result.customs.rate || null,
        discount: result.customs.discount || 1,
        luxuryPct: result.customs.luxuryPct || 0,
        luxuryMdl: Math.round(result.customs.luxury || 0),
        vat: !!result.customs.vat
      },
      total: {
        usd: Math.round(result.totalUsd),
        mdl: Math.round(result.totalMdl),
        eur: Math.round(result.totalEur)
      },
      route: result.route,
      portLabel: result.port,
      rates: { usdMdl: result.usdMdl, eurMdl: result.eurMdl, source: rates.source || "manual", date: rates.date || null }
    });
  } catch (error) {
    response.status(500).json({ ok: false, error: "Не удалось посчитать: " + String((error && error.message) || error) });
  }
};
