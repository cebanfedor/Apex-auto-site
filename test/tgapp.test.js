const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const {verifyInitData, inlineButton} = require("../server/tgapp");

const BOT = "123456:TEST-token";
function sign(fields, token){
  const pairs = Object.entries(fields).map(([k, v]) => `${k}=${v}`).sort();
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const hash = crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  return new URLSearchParams({...fields, hash}).toString();
}
const now = () => Math.floor(Date.now() / 1000);

test("verifyInitData: верная подпись → пользователь", () => {
  const init = sign({auth_date: now(), query_id: "AAH", user: JSON.stringify({id: 777, first_name: "Иван", language_code: "ro"})}, BOT);
  const u = verifyInitData(init, BOT);
  assert.deepStrictEqual({id: u.id, name: u.first_name, lang: u.lang}, {id: 777, name: "Иван", lang: "ro"});
});
test("verifyInitData: чужой токен, подмена данных, просрочка, мусор → null", () => {
  const init = sign({auth_date: now(), user: JSON.stringify({id: 777, first_name: "A"})}, BOT);
  assert.strictEqual(verifyInitData(init, "999:other"), null);
  assert.strictEqual(verifyInitData(init.replace("777", "888"), BOT), null);
  const old = sign({auth_date: now() - 3 * 86400, user: JSON.stringify({id: 777, first_name: "A"})}, BOT);
  assert.strictEqual(verifyInitData(old, BOT), null);
  assert.strictEqual(verifyInitData("hash=zz", BOT), null);
  assert.strictEqual(verifyInitData("", BOT), null);
  assert.strictEqual(verifyInitData(init, ""), null);
  const noUser = sign({auth_date: now()}, BOT);
  assert.strictEqual(verifyInitData(noUser, BOT), null);
});
test("inlineButton: кабинет открывается как Mini App, остальное — ссылкой", () => {
  assert.deepStrictEqual(inlineButton({text: "Мои сделки", url: "https://apexauto.md/cabinet#deals"}), {text: "Мои сделки", web_app: {url: "https://apexauto.md/cabinet#deals"}});
  assert.deepStrictEqual(inlineButton({text: "Лот", url: "https://apexauto.md/auctions/x"}), {text: "Лот", url: "https://apexauto.md/auctions/x"});
  assert.deepStrictEqual(inlineButton({text: "Админка", url: "https://apexauto.md/admin/#client=5"}), {text: "Админка", url: "https://apexauto.md/admin/#client=5"});
});
