const {test} = require("node:test");
const assert = require("node:assert");

// 04.11.2026 — новый каталог Encar (api.auctionsapi.com, AUCTIONSAPI_CATALOG_KEY), отдельный от
// Copart/IAAI. Сериализация параметров (PHP bracket-формат) и маппинг ошибок — самое хрупкое место
// клиента (контракт провайдера жёстко требует конкретный синтаксис, см. бриф §2.1/§5.3.1).
process.env.AUCTIONSAPI_CATALOG_KEY = "test-key";
const {qsPush, qsArray, qsBrands, qsCountries, catalogFetch, CatalogApiError} = require("../server/catalog-api.js");

test("qsArray: PHP bracket-формат, не через запятую, пустые значения пропускаются", () => {
  const parts = [];
  qsArray(parts, "fuels", [2, 3, null, "", 4]);
  assert.deepStrictEqual(parts, ["fuels%5B%5D=2", "fuels%5B%5D=3", "fuels%5B%5D=4"]);
});

test("qsPush: булево в 1/0, пустое/undefined/null не добавляется", () => {
  const parts = [];
  qsPush(parts, "is_auction", true);
  qsPush(parts, "is_leasing", false);
  qsPush(parts, "price_from", undefined);
  qsPush(parts, "price_to", "");
  assert.deepStrictEqual(parts, ["is_auction=1", "is_leasing=0"]);
});

test("qsBrands: марка без моделей — только brands[i][id]", () => {
  const parts = [];
  qsBrands(parts, [{id: 88}]);
  assert.deepStrictEqual(parts, ["brands%5B0%5D%5Bid%5D=88"]);
});

test("qsBrands: модели без поколений — плоский список brands[i][models][]", () => {
  const parts = [];
  qsBrands(parts, [{id: 88, models: [{id: 120}, {id: 130}]}]);
  assert.deepStrictEqual(parts, [
    "brands%5B0%5D%5Bid%5D=88",
    "brands%5B0%5D%5Bmodels%5D%5B%5D=120",
    "brands%5B0%5D%5Bmodels%5D%5B%5D=130",
  ]);
});

test("qsBrands: поколение выбрано — структурированный models[j][id] + generations[k][id] + variants/trims", () => {
  const parts = [];
  qsBrands(parts, [{id: 58, models: [{id: 3232, generations: [{id: 6917, variants: [1, 2], trims: [9]}]}]}]);
  assert.deepStrictEqual(parts, [
    "brands%5B0%5D%5Bid%5D=58",
    "brands%5B0%5D%5Bmodels%5D%5B0%5D%5Bid%5D=3232",
    "brands%5B0%5D%5Bmodels%5D%5B0%5D%5Bgenerations%5D%5B0%5D%5Bid%5D=6917",
    "brands%5B0%5D%5Bmodels%5D%5B0%5D%5Bgenerations%5D%5B0%5D%5Bvariants%5D%5B%5D=1",
    "brands%5B0%5D%5Bmodels%5D%5B0%5D%5Bgenerations%5D%5B0%5D%5Bvariants%5D%5B%5D=2",
    "brands%5B0%5D%5Bmodels%5D%5B0%5D%5Bgenerations%5D%5B0%5D%5Btrims%5D%5B%5D=9",
  ]);
});

test("qsBrands: несколько марок — независимая индексация i/j/k", () => {
  const parts = [];
  qsBrands(parts, [{id: 1}, {id: 2, models: [{id: 10}]}]);
  assert.deepStrictEqual(parts, [
    "brands%5B0%5D%5Bid%5D=1",
    "brands%5B1%5D%5Bid%5D=2",
    "brands%5B1%5D%5Bmodels%5D%5B%5D=10",
  ]);
});

test("qsCountries: страна + регионы", () => {
  const parts = [];
  qsCountries(parts, [{id: 208, regions: [1, 2]}]);
  assert.deepStrictEqual(parts, [
    "countries%5B0%5D%5Bid%5D=208",
    "countries%5B0%5D%5Bregions%5D%5B%5D=1",
    "countries%5B0%5D%5Bregions%5D%5B%5D=2",
  ]);
});

function mockFetchSequence(responses){
  let i = 0;
  global.fetch = async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    return r;
  };
}
function jsonRes(status, body, headers = {}){
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {get: k => headers[k.toLowerCase()] || null},
    text: async () => JSON.stringify(body),
  };
}

test("catalogFetch: 403 -> CatalogApiError kind=auth, без повтора (ключ/подписка)", async () => {
  mockFetchSequence([jsonRes(403, {error: "wrong api key"})]);
  await assert.rejects(
    () => catalogFetch("/search", "", {retries: 3, timeoutMs: 1000}),
    (e) => e instanceof CatalogApiError && e.kind === "auth" && e.status === 403
  );
});

test("catalogFetch: 422 -> kind=validation, fieldErrors сохранены", async () => {
  mockFetchSequence([jsonRes(422, {message: "Invalid filter", errors: {year_from: ["must be >= 1800"]}})]);
  await assert.rejects(
    () => catalogFetch("/search", "", {retries: 2, timeoutMs: 1000}),
    (e) => e instanceof CatalogApiError && e.kind === "validation" && e.fieldErrors && Array.isArray(e.fieldErrors.year_from)
  );
});

test("catalogFetch: 404 -> kind=not_found", async () => {
  mockFetchSequence([jsonRes(404, {error: "Service lookup failed"})]);
  await assert.rejects(
    () => catalogFetch("/cars/does-not-exist", "", {retries: 0, timeoutMs: 1000}),
    (e) => e instanceof CatalogApiError && e.kind === "not_found"
  );
});

test("catalogFetch: 503 один раз, затем 200 — повтор срабатывает и возвращает успешный ответ", async () => {
  mockFetchSequence([jsonRes(503, {error: "unavailable"}), jsonRes(200, {data: [], meta: {total: 0}})]);
  const res = await catalogFetch("/search", "", {retries: 1, timeoutMs: 1000});
  assert.deepStrictEqual(res, {data: [], meta: {total: 0}});
});

test("catalogFetch: без ключа — kind=no_key, upstream не дёргаем", async () => {
  const origKey = process.env.AUCTIONSAPI_CATALOG_KEY;
  delete process.env.AUCTIONSAPI_CATALOG_KEY;
  let called = false;
  global.fetch = async () => { called = true; return jsonRes(200, {}); };
  try{
    await assert.rejects(
      () => catalogFetch("/search", "", {retries: 0}),
      (e) => e instanceof CatalogApiError && e.kind === "no_key"
    );
    assert.strictEqual(called, false, "без ключа upstream вызывать не должны");
  }finally{
    process.env.AUCTIONSAPI_CATALOG_KEY = origKey;
  }
});
