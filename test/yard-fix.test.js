const test = require("node:test");
const assert = require("node:assert");
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://x";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "x";
const { normalizeLot } = require("../api/auctions.js");

const mk = (lot) => normalizeLot({ year: 2008, title: "2008 Ford F-150", vin: "1FTPX14V68FA66681", manufacturer: { id: 48, name: "Ford" }, model: { id: 1387, name: "F-150" }, lots: [Object.assign({ lot: "1", domain: { name: "iaai_com" }, external_id: "2~US" }, lot)] });

test("IAAI «dallas» с титулом Kansas → штат по координатам (TX)", () => {
  const l = mk({ location: { country: { iso: "us" }, state: { code: "ks", name: "kansas" }, city: { name: "grand prairie" }, latitude: 32.75, longitude: -96.94 }, selling_branch: { name: "dallas", number: 443 } });
  assert.equal(l.stateCode, "tx");
  assert.match(l.location, /texas/i);
});
test("верный штат в рамке не трогаем (Канзас-Сити KS)", () => {
  const l = mk({ location: { country: { iso: "us" }, state: { code: "ks", name: "kansas" }, city: { name: "kansas city" }, latitude: 39.1, longitude: -94.65 }, selling_branch: { name: "kansas city" } });
  assert.equal(l.stateCode, "ks");
});
test("Эль-Пасо TX (большой штат) не переписывается", () => {
  const l = mk({ location: { country: { iso: "us" }, state: { code: "tx", name: "texas" }, city: { name: "el paso" }, latitude: 31.8, longitude: -106.4 }, selling_branch: { name: "el paso" } });
  assert.equal(l.stateCode, "tx");
});
test("штата нет и нет (xx) → заполняем по координатам", () => {
  const l = mk({ location: { country: { iso: "us" }, state: null, city: { name: "grand prairie" }, latitude: 32.75, longitude: -96.94 }, selling_branch: { name: "dallas" } });
  assert.equal(l.stateCode, "tx");
});
test("«(xx)» в филиале по-прежнему главнее (Metro DC (MD) при state=Virginia)", () => {
  const l = mk({ location: { country: { iso: "us" }, state: { code: "va", name: "virginia" }, city: { name: "brandywine" }, latitude: 38.7, longitude: -76.85 }, selling_branch: { name: "metro dc (md)", number: 721 } });
  assert.equal(l.stateCode, "md");
});
test("note продавца попадает в лот; -1 в ценах = нет данных", () => {
  const l = mk({ note: "REPOSSESSION", pre_accident_price: -1, clean_wholesale_price: 9000, location: { country: { iso: "us" }, state: { code: "tx" }, latitude: 32.7, longitude: -96.9 }, selling_branch: { name: "x" } });
  assert.equal(l.sellerNote, "REPOSSESSION");
  assert.equal(l.preAccidentPrice, 0);
});
