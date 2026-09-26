const test = require('node:test');
const assert = require('node:assert');
const { encodeGif } = require('../renderer/gif-encoder');
const { gifInfo } = require('../lib/gif');

// 很小的 LZW 解码器，只用来检查编码对不对
function decodeFirstFrame(bytes, w, h) {
  let p = 13 + 256 * 3;
  while (bytes[p] === 0x21) { p += 2; while (bytes[p]) p += bytes[p] + 1; p++; }
  p += 10; // 图像描述
  const min = bytes[p++];
  const data = [];
  while (bytes[p]) { data.push(...bytes.slice(p + 1, p + 1 + bytes[p])); p += bytes[p] + 1; }
  let bitPos = 0;
  const clear = 1 << min, end = clear + 1;
  let size = min + 1, dict, prev = null;
  const reset = () => { dict = Array.from({ length: clear + 2 }, (_, i) => [i]); size = min + 1; prev = null; };
  reset();
  const out = [];
  const read = () => { let v = 0; for (let i = 0; i < size; i++, bitPos++) v |= ((data[bitPos >> 3] >> (bitPos & 7)) & 1) << i; return v; };
  for (;;) {
    const code = read();
    if (code === clear) { reset(); continue; }
    if (code === end) break;
    const entry = code < dict.length ? dict[code] : [...dict[prev], dict[prev][0]];
    out.push(...entry);
    if (prev !== null && dict.length < 4096) dict.push([...dict[prev], entry[0]]);
    if (dict.length === (1 << size) && size < 12) size++;
    prev = code;
  }
  return out.slice(0, w * h);
}

test('makes an animated GIF with a transparent background', () => {
  const w = 3, h = 2;
  const red = [255, 0, 0, 255], clear = [0, 0, 0, 0], blue = [0, 0, 255, 255];
  const frames = [
    { data: Uint8ClampedArray.from([...red, ...clear, ...blue, ...clear, ...red, ...red]), delay: 10 },
    { data: Uint8ClampedArray.from([...blue, ...blue, ...clear, ...clear, ...clear, ...red]), delay: 10 },
  ];
  const gif = encodeGif(frames, w, h);
  assert.deepStrictEqual(gifInfo(gif), { width: 3, height: 2, frames: 2, duration: 200 });
  const pixels = decodeFirstFrame(gif, w, h);
  assert.strictEqual(pixels[1], 0); // 透明
  assert.strictEqual(pixels[3], 0);
  assert.strictEqual(pixels[0], pixels[4]); // 同一种红
  assert.notStrictEqual(pixels[0], pixels[2]); // 红和蓝不一样
});

test('big noisy pictures still encode (LZW table resets)', () => {
  const w = 120, h = 90;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = (i * 7) % 256; data[i + 1] = (i * 13) % 256; data[i + 2] = (i * 3) % 256; data[i + 3] = 255; }
  const gif = encodeGif([{ data, delay: 5 }], w, h);
  assert.strictEqual(gifInfo(gif).frames, 1);
  assert.strictEqual(decodeFirstFrame(gif, w, h).length, w * h);
});
