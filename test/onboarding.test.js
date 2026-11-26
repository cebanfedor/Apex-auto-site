// Знакомство в боте: имя → телефон → готово; ответы не уходят в переписку с менеджером (26.11.2026)
const test = require("node:test");
const assert = require("node:assert");

function setup(updates, {links, meta0} = {}){
  process.env.ALERTS_BOT_TOKEN = "TEST";
  const meta = new Map(Object.entries(meta0 || {}));
  const sent = [];
  const msgs = [];
  const linkRows = links || [{token:"t".repeat(24), lang:"ru", chat_id:77}];
  const sb = async (path, opt = {}) => {
    const m = String(opt.method || "GET").toUpperCase();
    if(path.startsWith("/alert_meta")){
      if(m === "GET"){
        const k = decodeURIComponent((path.match(/k=eq\.([^&]+)/) || [])[1] || "");
        return meta.has(k) ? [{v:meta.get(k), updated_at:new Date().toISOString()}] : [];
      }
      if(m === "POST"){
        const b = JSON.parse(opt.body);
        if(/ignore-duplicates/.test((opt.headers || {}).prefer || "") && meta.has(b.k)) return [];
        meta.set(b.k, b.v); return [];
      }
      if(m === "PATCH") return [{}];     // takeLock
      return [];
    }
    if(path.startsWith("/alert_links")) return linkRows;
    if(path.startsWith("/cab_msgs")){ msgs.push(JSON.parse(opt.body || "{}")); return []; }
    return [];
  };
  global.fetch = async (url, init) => {
    const method = String(url).split("/").pop();
    const body = JSON.parse(init.body || "{}");
    if(method === "getUpdates") return {json: async () => ({ok:true, result:updates})};
    sent.push({method, body});
    return {json: async () => ({ok:true})};
  };
  const create = require("../server/alerts").create;
  const api = create({sb, sendJson(){}, readBody(){}, isAdmin(){ return false; }});
  return {api, meta, sent, msgs};
}
const from = {id:77, first_name:"Игорь"};
const msg = (id, text, extra) => ({update_id:id, message:Object.assign({chat:{id:77, type:"private"}, from, text}, extra || {})});

test("после привязки бот спрашивает имя кнопкой с именем из Telegram", async () => {
  const tok = "t".repeat(24);
  const s = setup([msg(1, "/start " + tok)], {links:[{token:tok, lang:"ru", chat_id:null}]});
  await s.api.pollUpdates();
  const ask = s.sent.find(x => x.method === "sendMessage" && /Как к вам обращаться/.test(x.body.text));
  assert.ok(ask, "вопрос про имя отправлен");
  assert.strictEqual(ask.body.reply_markup.keyboard[0][0].text, "Игорь");
  assert.strictEqual(s.meta.get("onb:77").step, "name");
});

test("ответ-имя сохраняется в профиль, дальше просим телефон, в переписку не уходит", async () => {
  const s = setup([msg(2, "Игорь Петров")], {meta0:{"onb:77":{step:"name"}}});
  await s.api.pollUpdates();
  assert.strictEqual(s.meta.get("profile:77").name, "Игорь Петров");
  assert.strictEqual(s.meta.get("onb:77").step, "phone");
  assert.strictEqual(s.msgs.length, 0, "не попало в cab_msgs");
  const ask = s.sent.find(x => x.body.reply_markup && x.body.reply_markup.keyboard);
  assert.ok(ask.body.reply_markup.keyboard[0][0].request_contact);
});

test("«Пропустить» завершает знакомство без телефона", async () => {
  const s = setup([msg(3, "Пропустить")], {meta0:{"onb:77":{step:"phone"}, "profile:77":{name:"Игорь"}}});
  await s.api.pollUpdates();
  assert.deepStrictEqual(s.meta.get("onb:77"), {});
  assert.ok(s.sent.some(x => /Готово/.test(x.body.text)));
});

test("номер, набранный текстом, попадает в профиль", async () => {
  const s = setup([msg(4, "+373 69 123 456")], {meta0:{"onb:77":{step:"phone"}, "profile:77":{name:"Игорь"}}});
  await s.api.pollUpdates();
  assert.strictEqual(s.meta.get("profile:77").phone, "+373 69 123 456");
  assert.strictEqual(s.meta.get("profile:77").name, "Игорь");
});

test("длинное сообщение на шаге имени — это не имя: знакомство сбрасывается, сообщение идёт менеджеру", async () => {
  const s = setup([msg(5, "Здравствуйте, хочу узнать про BMW X5 2021 года, сколько будет под ключ в Кишинёв? " + "x".repeat(10))], {meta0:{"onb:77":{step:"name"}}});
  await s.api.pollUpdates();
  assert.deepStrictEqual(s.meta.get("onb:77"), {});
  assert.ok(!s.meta.get("profile:77"));
});

test("имя уже есть — повторно не спрашиваем", async () => {
  const tok = "t".repeat(24);
  const s = setup([msg(6, "/start " + tok)], {links:[{token:tok, lang:"ru", chat_id:null}], meta0:{"profile:77":{name:"Игорь"}}});
  await s.api.pollUpdates();
  assert.ok(!s.sent.some(x => /Как к вам обращаться/.test(x.body.text || "")));
});
