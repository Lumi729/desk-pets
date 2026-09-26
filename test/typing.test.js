const test = require('node:test');
const assert = require('node:assert');
const { createTypingDetector } = require('../lib/typing');

// 每 300ms 看一次；idle 是系统说的「几秒没输入」（只有整数秒）
function run(samples) {
  const detect = createTypingDetector();
  return samples.map(([idleSeconds, mouseMoved = false], i) => detect({ now: i * 300, idleSeconds, mouseMoved }));
}

test('a single click is not typing', () => {
  // 点一下：之后差不多 1 秒内 idle 都是 0，然后变成 1、2…
  assert.ok(!run([[0], [0], [0], [0], [1], [1], [2]]).some(Boolean));
});

test('keeping on typing is noticed after about 1.5 seconds', () => {
  const result = run([[0], [0], [0], [0], [0], [0], [0], [0]]);
  assert.strictEqual(result.indexOf(true), 5); // 5 × 300ms = 1.5s
});

test('stopping or moving the mouse ends typing straight away', () => {
  assert.deepStrictEqual(run([[0], [0], [0], [0], [0], [0], [1]]).slice(-2), [true, false]);
  assert.deepStrictEqual(run([[0], [0], [0], [0], [0], [0], [0, true]]).slice(-2), [true, false]);
});
