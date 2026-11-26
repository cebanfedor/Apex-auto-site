const test = require("node:test");
const assert = require("node:assert");
const {cleanData, KINDS, okToken, create} = require("../server/cabinet");

test("cleanData: заметка — обрезает, пустая → null", () => {
  assert.strictEqual(cleanData("note", {text:"   "}), null);
  assert.strictEqual(cleanData("note", {text:"x".repeat(5000)}).text.length, 2000);
});
test("cleanData: лот — режет фото и историю, не принимает не-объект", () => {
  const lot = {id:"copart-1", title:"T", images:["a","b","c","d","e"], priceHistory:new Array(20).fill({a:1})};
  const o = cleanData("fav", lot);
  assert.strictEqual(o.images.length, 3);
  assert.strictEqual(o.priceHistory.length, 6);
  assert.strictEqual(cleanData("fav", "str"), null);
  assert.strictEqual(cleanData("fav", [1]), null);
});
test("cleanData: слишком большой лот отклоняется", () => {
  assert.strictEqual(cleanData("fav", {id:"copart-1", blob:"x".repeat(9000)}), null);
});
test("ключи: VIN и номер лота", () => {
  assert.ok(KINDS.car.keyRe.test("5YJ3E1EC2LF586908"));
  assert.ok(!KINDS.car.keyRe.test("5YJ3E1EC2LF58690I"));   // I запрещена в VIN
  assert.ok(KINDS.fav.keyRe.test("iaai-45987487"));
  assert.ok(!KINDS.fav.keyRe.test("../etc"));
});
test("okToken", () => { assert.ok(!okToken("short")); assert.ok(okToken("a".repeat(32))); });

function mock(){
  const calls = [];
  const sb = async (path, opts) => {
    calls.push({path, opts});
    if(path.startsWith("/alert_links?token=eq.bound")) return [{chat_id:777, lang:"ru"}];
    if(path.startsWith("/alert_links?token=eq.free")) return [{chat_id:null, lang:"ru"}];
    if(path.startsWith("/alert_links")) return [];
    if(path.includes("select=kind,key,data,updated_at")) return [{kind:"fav", key:"copart-1", data:{id:"copart-1"}, updated_at:"2026-11-24T10:00:00Z"}];
    return [];
  };
  let out = null;
  const sendJson = (res, code, body) => { out = {code, body}; };
  return {calls, get out(){ return out; }, api:create({sb, sendJson, readBody:async req => req.body})};
}
const T_BOUND = "bound" + "x".repeat(20), T_FREE = "free" + "x".repeat(20);
test("cabload: привязанный токен отдаёт данные, непривязанный — bound:false", async () => {
  const m = mock();
  await m.api.handle("cabload", {method:"GET"}, {}, new URLSearchParams({token:T_BOUND}));
  assert.strictEqual(m.out.body.bound, true);
  assert.strictEqual(m.out.body.items.fav.length, 1);
  await m.api.handle("cabload", {method:"GET"}, {}, new URLSearchParams({token:T_FREE}));
  assert.strictEqual(m.out.body.bound, false);
});
test("cabput: пишет только по chat_id токена, чужой ключ отбрасывается", async () => {
  const m = mock();
  await m.api.handle("cabput", {method:"POST", body:{token:T_BOUND, kind:"fav", key:"copart-55555555", data:{id:"copart-55555555"}}}, {}, new URLSearchParams());
  const post = m.calls.find(c => c.opts && c.opts.method === "POST");
  assert.ok(post);
  assert.strictEqual(JSON.parse(post.opts.body)[0].chat_id, 777);
  const m2 = mock();
  await m2.api.handle("cabput", {method:"POST", body:{token:T_BOUND, kind:"fav", key:"../x", data:{id:"x"}}}, {}, new URLSearchParams());
  assert.strictEqual(m2.out.body.saved, 0);
  const m3 = mock();
  await m3.api.handle("cabput", {method:"POST", body:{token:T_FREE, kind:"fav", key:"copart-55555555", data:{id:"x"}}}, {}, new URLSearchParams());
  assert.strictEqual(m3.out.body.error, "unbound");
});

test("избранное: ключи целых авто kr-/ca- принимаются, чужие префиксы — нет", () => {
  const {KINDS} = require("../server/cabinet");
  assert.ok(KINDS.fav.keyRe.test("kr-l_ea4ZUQFp0HheXIfD0j_ZNw"));
  assert.ok(KINDS.fav.keyRe.test("ca-AbC123-xyz"));
  assert.ok(KINDS.note.keyRe.test("kr-l_ea4ZUQFp0HheXIfD0j_ZNw"));
  assert.ok(KINDS.fav.keyRe.test("copart-61420506"));
  assert.ok(!KINDS.fav.keyRe.test("x-12345"));
  assert.ok(!KINDS.fav.keyRe.test("kr-ab"));
});
