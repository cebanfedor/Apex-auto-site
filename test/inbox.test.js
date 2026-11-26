const test = require("node:test");
const assert = require("node:assert");
const cl = require("../server/clients");

test("msgAdd: режет длину, пустое не пишет, out сразу «прочитано»", async () => {
  const calls = [];
  const sb = async (path, opt) => { calls.push({path, body: opt && opt.body ? JSON.parse(opt.body) : null}); return []; };
  assert.strictEqual(await cl.msgAdd(sb, "5", "in", "   "), false);
  assert.strictEqual(await cl.msgAdd(sb, "", "in", "привет"), false);
  assert.strictEqual(calls.length, 0);
  assert.strictEqual(await cl.msgAdd(sb, 5, "in", "x".repeat(5000)), true);
  assert.strictEqual(calls[0].body.chat_id, "5");
  assert.strictEqual(calls[0].body.text.length, cl.MSG_MAX);
  assert.strictEqual(calls[0].body.seen, false);
  await cl.msgAdd(sb, 5, "out", "ответ");
  assert.strictEqual(calls[1].body.seen, true);
});

test("msgThread: старые первыми; markSeen помечает входящие прочитанными только если есть новые", async () => {
  const calls = [];
  const rows = [{id: 3, dir: "out", text: "c", seen: true, at: "2026-11-27T10:03:00Z"}, {id: 2, dir: "in", text: "b", seen: false, at: "2026-11-27T10:02:00Z"}, {id: 1, dir: "in", text: "a", seen: true, at: "2026-11-27T10:01:00Z"}];
  const sb = async (path, opt) => { calls.push(path); return opt && opt.method === "PATCH" ? [] : rows; };
  const list = await cl.msgThread(sb, "5", true);
  assert.deepStrictEqual(list.map(m => m.id), [1, 2, 3]);
  assert.ok(calls.some(c => c.includes("seen=eq.false") && c.includes("dir=eq.in")));
  calls.length = 0;
  const sb2 = async (path) => { calls.push(path); return [{id: 1, dir: "in", text: "a", seen: true, at: "x"}]; };
  await cl.msgThread(sb2, "5", true);
  assert.strictEqual(calls.length, 1);   // новых нет — PATCH не нужен
});
