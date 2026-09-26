const test = require('node:test');
const assert = require('node:assert');
const { nearestResize } = require('../lib/pixel-icon');

test('nearest-neighbour keeps blocks crisp', () => {
  // 4×4 image made of four 2×2 coloured blocks → 2×2 must be exactly those four colours
  const px = (r, g, b) => [r, g, b, 255];
  const colours = [px(255, 0, 0), px(0, 255, 0), px(0, 0, 255), px(255, 255, 255)];
  const src = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) src.push(...colours[(y >> 1) * 2 + (x >> 1)]);
  const out = nearestResize(Buffer.from(src), 4, 4, 2);
  assert.deepStrictEqual([...out], colours.flat());
});

test('upscaling repeats pixels without blending', () => {
  const out = nearestResize(Buffer.from([10, 20, 30, 255]), 1, 1, 3);
  assert.deepStrictEqual([...out], Array(9).fill([10, 20, 30, 255]).flat());
});
