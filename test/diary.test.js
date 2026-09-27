const test = require('node:test');
const assert = require('node:assert');
const { VOICES, dayKey, record, prune, composeDiary, daysTogether, isAnniversary } = require('../lib/diary');

test('counts things for the day without keeping details', () => {
  const days = {};
  for (let i = 0; i < 12; i++) record(days, '2026-09-27', 'pets');
  record(days, '2026-09-27', 'pomodoros');
  record(days, '2026-09-27', 'pomodoros');
  record(days, '2026-09-27', 'weather', '小雨');
  record(days, '2026-09-27', 'weather', '小雨');
  record(days, '2026-09-27', 'festival', '国庆');
  assert.deepStrictEqual(days['2026-09-27'].weathers, ['小雨']);
  const text = composeDiary(days['2026-09-27'], '千千');
  assert.match(text, /千千摸了我们 12 次/);
  assert.match(text, /陪千千专注了 2 个番茄钟/);
  assert.match(text, /撑了伞/);
  assert.match(text, /国庆/);
  assert.match(composeDiary(null, '千千'), /安静/);
});

test('keeps only the last 30 days', () => {
  const days = {};
  for (let d = 1; d <= 40; d++) days[dayKey(new Date(2026, 7, d))] = {};
  const kept = Object.keys(prune(days, '2026-09-09'));
  assert.strictEqual(kept.length, 30);
  assert.strictEqual(kept[0], '2026-08-11');
  assert.strictEqual(kept[29], '2026-09-09');
});

test('days together and anniversaries', () => {
  assert.strictEqual(daysTogether('2026-09-27', new Date(2026, 8, 27, 23)), 1);
  assert.strictEqual(daysTogether('2026-09-27', new Date(2026, 9, 3, 1)), 7);
  assert.strictEqual(daysTogether('2026-01-01', new Date(2026, 11, 31)), 365);
  for (const n of [7, 30, 100, 200, 365, 730, 1095]) assert.ok(isAnniversary(n), n);
  for (const n of [1, 8, 99, 366, 500]) assert.ok(!isAnniversary(n), n);
});

test('every pet writes in its own voice, with the chosen nickname', () => {
  const day = { pets: 12, clicks: 0, pomodoros: 3, hugs: 1, stacks: 0, weathers: ['小雨'], festivals: [] };
  const texts = Object.keys(VOICES).map(writer => composeDiary(day, '梨梨', writer));
  assert.strictEqual(new Set(texts).size, 6);
  for (const text of texts) { assert.match(text, /梨梨摸了我们 12 次/); assert.ok(!text.includes('千千')); }
  assert.match(composeDiary(day, '梨梨', '灰鸮g老师'), /^【今日观察记录】\n1\. /);
  for (const writer of Object.keys(VOICES)) assert.ok(composeDiary(null, '梨梨', writer).includes('梨梨'), writer);
});

test('a stand-in writer says so first', () => {
  assert.match(composeDiary({ pets: 1 }, '千千', '千千猫猫', '哥哥狗狗'), /^今天哥哥狗狗不在，由我代写～\n嘿嘿/);
  assert.ok(!composeDiary({ pets: 1 }, '千千', '哥哥狗狗', '哥哥狗狗').includes('代写'));
});
