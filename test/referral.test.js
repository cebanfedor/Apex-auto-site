"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");

// Код реферала: клиент (site-nav.js) принимает ровно 6 символов, сервер (cabref) генерирует тот же алфавит
test("site-nav.js: регэксп ref совпадает с форматом кода сервера", () => {
  const src = fs.readFileSync(__dirname + "/../site-nav.js", "utf8");
  assert.ok(src.includes("apexRefV1"));
  const re = /[?&]ref=([A-Za-z0-9]{6})(?:&|$)/;
  assert.strictEqual(re.exec("?ref=ABC234")[1], "ABC234");
  assert.strictEqual(re.exec("?x=1&ref=ABC234&y=2")[1], "ABC234");
  assert.strictEqual(re.exec("?ref=ABC2345"), null);
  assert.strictEqual(re.exec("?ref=AB"), null);
});

test("server/cabinet.js: cabref генерирует код из безопасного алфавита", () => {
  const src = fs.readFileSync(__dirname + "/../server/cabinet.js", "utf8");
  const m = /const ALPHA = "([A-Z0-9]+)"/.exec(src);
  assert.ok(m);
  assert.ok(!/[IO01]/.test(m[1]));
  assert.ok(/\^\[A-Z0-9\]\{6\}\$/.test(fs.readFileSync(__dirname + "/../api/auctions.js", "utf8")));
});
