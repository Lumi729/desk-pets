const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { PAIRS, replyFor, isTeaseAnim } = require('../renderer/teases');

const assets = path.join(__dirname, '..', '桌宠素材');
const has = (pet, anim) => fs.existsSync(path.join(assets, pet, `${anim}.gif`));

test('every tease and reply animation exists', () => {
  for (const [teaser, { target, replies }] of Object.entries(PAIRS)) {
    for (const [tease, steps] of Object.entries(replies)) {
      assert.ok(has(teaser, `挑衅_${tease}`), `${teaser} 挑衅_${tease}`);
      for (const step of steps) if (typeof step === 'string') assert.ok(has(target, `回应_${step}`), `${target} 回应_${step}`);
      if (steps.some(s => s.comfort)) { assert.ok(has(target, '回应_摸摸头')); assert.ok(has(target, '回应_无语')); }
    }
    assert.ok(has(target, '回应_投降'), `${target} 回应_投降`);
  }
});

test('each pair only teases its own brother', () => {
  assert.strictEqual(PAIRS.千千猫猫.target, '哥哥狗狗');
  assert.strictEqual(PAIRS.梨梨兔兔.target, '梨梨哥哥');
  assert.strictEqual(replyFor('千千猫猫', '晃小鱼', [], 0), null);
  assert.strictEqual(replyFor('哥哥狗狗', '做鬼脸', [], 0), null);
});

test('replies follow the rules', () => {
  assert.deepStrictEqual(replyFor('千千猫猫', '做鬼脸', [], 0), ['冒冷汗']);
  assert.deepStrictEqual(replyFor('千千猫猫', '来打我呀', [], 0), ['跺脚', { chase: true }]);
  assert.deepStrictEqual(replyFor('千千猫猫', '勾勾手指', [], 0), [{ hug: true }]);
  assert.deepStrictEqual(replyFor('梨梨兔兔', '装哭', [], 0), ['冒冷汗', { comfort: true }]);
  assert.deepStrictEqual(replyFor('梨梨兔兔', '吓你一跳', [], 0), ['吓一跳']);
});

test('more than 3 teases in 10 minutes → surrender', () => {
  const min = 60_000;
  assert.deepStrictEqual(replyFor('千千猫猫', '就这', [1 * min, 2 * min], 3 * min), ['委屈']);            // 第 3 次
  assert.deepStrictEqual(replyFor('千千猫猫', '就这', [1 * min, 2 * min, 3 * min], 4 * min), ['投降']);  // 第 4 次
  assert.deepStrictEqual(replyFor('千千猫猫', '就这', [1 * min, 2 * min, 3 * min], 12 * min), ['委屈']); // 前面的过了 10 分钟
});

test('tease animations are not click actions', () => {
  assert.ok(isTeaseAnim('挑衅_做鬼脸'));
  assert.ok(isTeaseAnim('回应_投降'));
  assert.ok(!isTeaseAnim('打招呼'));
});
