// EXIF-ориентация фото в превью (og-card.upright): снимок с Orientation=6 должен стать портретным, без тега — не трогаться.
const test = require("node:test"), assert = require("node:assert");
const og = require("../server/og-card.js");
// минимальный JPEG 2×1 (SOI + SOF0 + EOI достаточно для разбора размеров) + EXIF с нужной ориентацией
function jpeg(orient){
  const sof = Buffer.from([0xff,0xc0,0,11,8,0,1,0,2,1,1,0x11,0]);               // высота 1, ширина 2
  const t = Buffer.from([0x4d,0x4d,0,0x2a,0,0,0,8, 0,1, 0x01,0x12,0,3,0,0,0,1,0,orient,0,0, 0,0,0,0]);
  const hdr = Buffer.concat([Buffer.from("Exif\0\0","latin1"), t]);
  const app1 = Buffer.concat([Buffer.from([0xff,0xe1,(hdr.length+2)>>8,(hdr.length+2)&255]), hdr]);
  return Buffer.concat([Buffer.from([0xff,0xd8]), orient ? app1 : Buffer.alloc(0), sof, Buffer.from([0xff,0xd9])]);
}
test("upright: без EXIF и ориентация 1 — как есть (null)", () => {
  assert.strictEqual(og.upright(jpeg(0)), null);
  assert.strictEqual(og.upright(jpeg(1)), null);
});
test("upright: мусор не роняет", () => {
  assert.strictEqual(og.upright(Buffer.from([1,2,3,4])), null);
});
