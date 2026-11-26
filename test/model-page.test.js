const {test} = require("node:test");
const assert = require("node:assert");
const {summarize, damageKey} = require("../server/model-stats");
const {MODELS, bySlug} = require("../server/model-index");

function sales(n, {price = 6000, spread = 2000, year = 2019, damage = "FRONT END"} = {}){
  return Array.from({length:n}, (_, i) => ({
    final_bid:price + ((i % 9) - 4) * (spread / 4), year, odometer_mi:60000 + i * 500, damage,
    auction:i % 3 ? "copart" : "iaai", sale_date:`2026-0${1 + (i % 9)}-10T17:00:00Z`
  }));
}

test("summarize: мало продаж → null", () => {
  assert.strictEqual(summarize(sales(10)), null);
});

test("summarize: медиана, диапазон, годы, повреждения", () => {
  const rows = [...sales(40, {year:2019}), ...sales(20, {year:2021, price:9000, damage:"REAR END"}), ...sales(3, {year:2015})];
  const s = summarize(rows);
  assert.strictEqual(s.n, 63);
  assert.ok(s.p25 <= s.median && s.median <= s.p75);
  assert.deepStrictEqual(s.years.map(y => y.year), [2021, 2019]);   // 2015 — меньше 5 продаж
  assert.ok(s.years.find(y => y.year === 2021).median > s.years.find(y => y.year === 2019).median);
  assert.strictEqual(s.damages[0].key, "front");
  assert.ok(s.medianMiles > 50000);
  assert.ok(s.from && s.to && s.from <= s.to);
});

test("damageKey", () => {
  assert.strictEqual(damageKey("FRONT END"), "front");
  assert.strictEqual(damageKey("REAR END"), "rear");
  assert.strictEqual(damageKey("Side"), "side");
  assert.strictEqual(damageKey("HAIL"), "hail");
  assert.strictEqual(damageKey("MECHANICAL"), "mechanical");
  assert.strictEqual(damageKey("NORMAL WEAR"), "minor");
  assert.strictEqual(damageKey("unknown"), "");
});

test("model-index: 50 моделей, уникальные slug, известные имена", () => {
  assert.strictEqual(MODELS.length, 50);
  assert.strictEqual(new Set(MODELS.map(m => m.slug)).size, 50);
  assert.strictEqual(bySlug("toyota-camry").modelId, 872);
  assert.strictEqual(bySlug("toyota-rav4").name, "Toyota RAV4");
  assert.strictEqual(bySlug("tesla-model-3").name, "Tesla Model 3");
  assert.strictEqual(bySlug("bmw-3-series").name, "BMW 3 Series");
  assert.strictEqual(bySlug("nope"), null);
});

function run(handler, query){
  return new Promise(resolve => {
    const res = {headers:{}, status(c){ this.code = c; return this; }, setHeader(k, v){ this.headers[k] = v; }, send(b){ this.body = b; resolve(this); }, end(){ resolve(this); }};
    handler({query, headers:{host:"apexauto.md"}}, res);
  });
}

function stubStats(stats, status = 200){
  global.fetch = async url => ({ok:status < 400, status, json:async () => ({ok:true, stats})});
}

test("страница модели: данные, JSON-LD, hreflang, не noindex", async () => {
  const handler = require("../api/model-page");
  const stats = summarize([...sales(50, {year:2019}), ...sales(20, {year:2021, price:9000, damage:"REAR END"})]);
  stubStats(stats);
  const r = await run(handler, {slug:"toyota-camry"});
  assert.strictEqual(r.code, 200);
  assert.match(r.body, /<title>Toyota Camry с аукционов США: цены продаж/);
  assert.match(r.body, /медианная цена продажи \$[\d ]+/);
  assert.match(r.body, /hreflang="ro" href="https:\/\/apexauto\.md\/models\/toyota-camry\?lang=ro"/);
  assert.match(r.body, /FAQPage/);
  assert.match(r.body, /BreadcrumbList/);
  assert.doesNotMatch(r.body, /noindex/);
  assert.match(r.body, /href="\/auctions\?make=140&model=872"/);
});

test("страница модели RO/EN: язык и тексты", async () => {
  const handler = require("../api/model-page");
  stubStats(summarize(sales(60)));
  const ro = await run(handler, {slug:"honda-civic", lang:"ro"});
  assert.match(ro.body, /<html lang="ro"/);
  assert.match(ro.body, /de la licitațiile din SUA/);
  const en = await run(handler, {slug:"honda-civic", lang:"en"});
  assert.match(en.body, /<html lang="en"/);
  assert.match(en.body, /from US auctions/);
});

test("мало данных → 200 + noindex; сбой базы → 503; неизвестная модель → 404", async () => {
  const handler = require("../api/model-page");
  stubStats(null);
  const thin = await run(handler, {slug:"toyota-camry"});
  assert.strictEqual(thin.code, 200);
  assert.match(thin.body, /noindex/);
  stubStats(null, 503);
  const down = await run(handler, {slug:"toyota-camry"});
  assert.strictEqual(down.code, 503);
  assert.strictEqual(down.headers["Cache-Control"], "no-store");
  const missing = await run(handler, {slug:"zzz-unknown"});
  assert.strictEqual(missing.code, 404);
});

test("хаб /models и карта сайта", async () => {
  const handler = require("../api/model-page");
  const hub = await run(handler, {});
  assert.strictEqual(hub.code, 200);
  assert.match(hub.body, /\/models\/toyota-camry/);
  const sm = await run(require("../api/models-sitemap"), {});
  assert.match(sm.body, /<loc>https:\/\/apexauto\.md\/models\/toyota-camry<\/loc>/);
  assert.strictEqual((sm.body.match(/<url>/g) || []).length, 51);
});

// --- action=modelstats в api/auctions.js (через настоящий handler, база подменена)
test("action=modelstats: фильтрует утиль и ещё не сыгравшие, считает сводку", async () => {
  process.env.SUPABASE_URL = "https://test.supabase.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  const paths = [];
  const old = Date.now() - 5 * 86400e3, fresh = new Date(Date.now() + 86400e3).toISOString();
  const rows = [
    ...Array.from({length:40}, (_, i) => ({final_bid:5000 + i * 50, year:2019, odometer_mi:70000, damage:"FRONT END", title:"CLEAN TITLE", document:"", auction:"copart", sale_date:new Date(old - i * 3600e3).toISOString()})),
    {final_bid:99999, year:2019, odometer_mi:1, damage:"FRONT END", title:"", document:"", auction:"copart", sale_date:fresh},                           // торги в будущем
    {final_bid:100, year:2019, odometer_mi:1, damage:"BURN", title:"", document:"", auction:"copart", sale_date:new Date(old).toISOString()},            // огонь
    {final_bid:100, year:2019, odometer_mi:1, damage:"FRONT END", title:"Certificate of Destruction", document:"", auction:"copart", sale_date:new Date(old).toISOString()}
  ];
  global.fetch = async url => { paths.push(String(url)); return {ok:true, status:200, text:async () => JSON.stringify(rows)}; };
  const handler = require("../api/auctions.js");
  const out = {};
  const res = {statusCode:0, headers:{}, setHeader(k, v){ this.headers[k.toLowerCase()] = v; }, status(c){ this.statusCode = c; return this; }, json(p){ out.payload = p; }, send(b){ out.payload = JSON.parse(b); }, end(b){ if(b) out.payload = JSON.parse(b); }, writeHead(c, h){ this.statusCode = c; Object.entries(h || {}).forEach(([k, v]) => this.setHeader(k, v)); }};
  await handler({method:"GET", url:"/api/auctions?action=modelstats&make_id=140&model_id=872", headers:{host:"apexauto.md"}, query:{}}, res);
  assert.strictEqual(res.statusCode || 200, 200);
  assert.ok(out.payload && out.payload.ok, JSON.stringify(out.payload));
  assert.strictEqual(out.payload.stats.n, 40);   // будущие торги, огонь и утиль отброшены
  assert.ok(out.payload.stats.median > 5000 && out.payload.stats.median < 7000);
  assert.match(paths.find(p => /api_lots/.test(p)), /make_id=eq\.140&model_id=eq\.872&archived=eq\.true&status_id=eq\.6&final_bid=gt\.0&country=eq\.us/);
});
