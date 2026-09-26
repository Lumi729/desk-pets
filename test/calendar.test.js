const test = require('node:test');
const assert = require('node:assert');
const { festivalOn, birthdaysOn, normalizeBirthday } = require('../lib/calendar');

const day = s => new Date(`${s}T12:00:00`);

test('fixed-date festivals', () => {
  assert.strictEqual(festivalOn(day('2026-10-01')), '国庆');
  assert.strictEqual(festivalOn(day('2026-10-07')), '国庆');
  assert.strictEqual(festivalOn(day('2026-10-08')), null);
  assert.strictEqual(festivalOn(day('2026-10-31')), '万圣节');
  assert.strictEqual(festivalOn(day('2026-12-24')), '圣诞');
  assert.strictEqual(festivalOn(day('2026-12-25')), '圣诞');
  assert.strictEqual(festivalOn(day('2026-12-26')), null);
});

test('spring festival runs from new year eve to the 7th day', () => {
  assert.strictEqual(festivalOn(day('2026-02-15')), null);   // 腊月廿八
  assert.strictEqual(festivalOn(day('2026-02-16')), '春节'); // 除夕（腊月廿九）
  assert.strictEqual(festivalOn(day('2026-02-17')), '春节'); // 正月初一
  assert.strictEqual(festivalOn(day('2026-02-23')), '春节'); // 初七
  assert.strictEqual(festivalOn(day('2026-02-24')), null);   // 初八
  assert.strictEqual(festivalOn(day('2027-02-05')), null);   // 腊月廿九，这年有三十
  assert.strictEqual(festivalOn(day('2027-02-06')), '春节'); // 除夕（腊月三十）
});

test('birthdays', () => {
  assert.strictEqual(normalizeBirthday('3-14'), '03-14');
  assert.strictEqual(normalizeBirthday('3月14日'), '03-14');
  assert.strictEqual(normalizeBirthday('12/1'), '12-01');
  assert.strictEqual(normalizeBirthday('13-01'), '');
  assert.strictEqual(normalizeBirthday(''), '');
  assert.deepStrictEqual(birthdaysOn(day('2026-03-14'), { 千千猫猫: '03-14', 梨梨兔兔: '05-20' }), ['千千猫猫']);
});
