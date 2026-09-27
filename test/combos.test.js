const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { comboKey, isForbidden, touchingRows, pickHug, canStack, parseComboFile, ORDER, SPECIAL_KINDS } = require('../renderer/combos');

const dir = path.join(__dirname, '..', '桌宠素材', '贴贴');
const files = new Set(fs.readdirSync(dir).map(f => f.replace(/\.gif$/, '')));
const hasRow = key => files.has(key);
const hasStack = key => files.has(`${key}_2`);

test('combo names follow the fixed order', () => {
  assert.strictEqual(comboKey(['煤球猫猫', '千千猫猫']), '千千猫猫-煤球猫猫');
  assert.strictEqual(comboKey(['梨梨哥哥', '梨梨兔兔', '千千猫猫']), '千千猫猫-梨梨兔兔-梨梨哥哥');
});

test('the three pairs never hug', () => {
  assert.ok(isForbidden('千千猫猫', '梨梨哥哥'));
  assert.ok(isForbidden('哥哥狗狗', '梨梨兔兔'));
  assert.ok(isForbidden('煤球猫猫', '梨梨哥哥'));
  assert.ok(!isForbidden('千千猫猫', '梨梨兔兔'));
  const row = [{ name: '千千猫猫', x: 0, surface: 'f' }, { name: '梨梨哥哥', x: 50, surface: 'f' }];
  assert.deepStrictEqual(touchingRows(row, 120), []);
});

test('pets in a row that touch form one group', () => {
  const pets = [
    { name: '梨梨兔兔', x: 100, surface: 'f' }, { name: '千千猫猫', x: 0, surface: 'f' },
    { name: '煤球猫猫', x: 190, surface: 'f' }, { name: '哥哥狗狗', x: 900, surface: 'f' },
  ];
  const rows = touchingRows(pets, 120);
  assert.deepStrictEqual(rows.map(r => r.map(p => p.name)), [['千千猫猫', '梨梨兔兔', '煤球猫猫']]);
  assert.deepStrictEqual(pickHug(rows[0], hasRow).map(p => p.name), ['千千猫猫', '梨梨兔兔', '煤球猫猫']);
});

test('falls back to a shorter group when the whole row has no animation', () => {
  const row = [{ name: '千千猫猫' }, { name: '梨梨兔兔' }, { name: '煤球猫猫' }];
  const onlyPair = key => key === '千千猫猫-梨梨兔兔';
  assert.deepStrictEqual(pickHug(row, onlyPair).map(p => p.name), ['千千猫猫', '梨梨兔兔']);
  assert.strictEqual(pickHug(row, () => false), null);
});

test('stacking checks the pet directly underneath and the animation file', () => {
  assert.strictEqual(canStack(['千千猫猫'], '梨梨兔兔', hasStack), '千千猫猫-梨梨兔兔');
  assert.strictEqual(canStack(['千千猫猫', '梨梨兔兔'], '哥哥狗狗', hasStack), null); // 兔兔和狗狗不叠
  assert.strictEqual(canStack(['千千猫猫', '哥哥狗狗'], '梨梨兔兔', hasStack), null); // 狗狗和兔兔不叠
  assert.strictEqual(canStack(['梨梨兔兔', '煤球猫猫'], '哥哥狗狗', hasStack), '梨梨兔兔-哥哥狗狗-煤球猫猫');
  assert.strictEqual(canStack(['千千猫猫'], '千千猫猫', hasStack), null);
});

test('file names map to combo and kind', () => {
  assert.deepStrictEqual(parseComboFile('千千猫猫-梨梨兔兔'), { key: '千千猫猫-梨梨兔兔', kind: 'row' });
  assert.deepStrictEqual(parseComboFile('千千猫猫-梨梨兔兔_2'), { key: '千千猫猫-梨梨兔兔', kind: 'stack' });
  assert.deepStrictEqual(parseComboFile('哥哥狗狗-梨梨哥哥_打架'), { key: '哥哥狗狗-梨梨哥哥', kind: 'fight' });
  assert.deepStrictEqual(parseComboFile('哥哥狗狗-梨梨哥哥_和好'), { key: '哥哥狗狗-梨梨哥哥', kind: 'makeup' });
  assert.deepStrictEqual(parseComboFile('千千猫猫-哥哥狗狗_盖被子'), { key: '千千猫猫-哥哥狗狗', kind: 'blanket' });
  assert.deepStrictEqual(parseComboFile('哥哥狗狗-灰鸮g老师_批改作业'), { key: '哥哥狗狗-灰鸮g老师', kind: 'grading' });
});

test('fight and make-up are follow-ups to an existing hug, not other hug versions', () => {
  assert.ok(files.has('哥哥狗狗-梨梨哥哥_打架'));
  assert.ok(files.has('哥哥狗狗-梨梨哥哥_和好'));
  for (const name of files) {
    const { key, kind } = parseComboFile(name);
    if (SPECIAL_KINDS.includes(kind) && kind !== 'helpup') assert.ok(files.has(key), `${name} 没有对应的贴贴`);
  }
});

test('every hug file has both versions and uses known pet names', () => {
  for (const name of files) {
    const { key: base, kind } = parseComboFile(name);
    if (SPECIAL_KINDS.includes(kind)) continue;
    if (base.includes('灰鸮g老师')) { assert.strictEqual(kind, 'row', name); continue; } // g老师只有一起看书的贴贴
    assert.ok(files.has(base) && files.has(`${base}_2`), base);
    assert.strictEqual(comboKey(base.split('-')), base);
    for (const pet of base.split('-')) assert.ok(ORDER.includes(pet), pet);
  }
});

test('g老师 reads with every other pet one-on-one, never stacks', () => {
  for (const name of ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫']) {
    assert.ok(files.has(comboKey([name, '灰鸮g老师'])), name);
  }
  assert.strictEqual(canStack(['千千猫猫'], '灰鸮g老师', () => true), null);
  assert.strictEqual(canStack(['灰鸮g老师'], '千千猫猫', () => true), null);
});

test('扶起来 files are dog + one pet in the fixed order, and never a hug', () => {
  assert.deepStrictEqual(parseComboFile('千千猫猫-哥哥狗狗_扶起来'), { key: '千千猫猫-哥哥狗狗', kind: 'helpup' });
  const helps = [...files].map(parseComboFile).filter(c => c.kind === 'helpup');
  assert.ok(helps.length >= 5);
  for (const { key } of helps) {
    const names = key.split('-');
    assert.strictEqual(names.length, 2, key);
    assert.ok(names.includes('哥哥狗狗'), key);
    assert.strictEqual(comboKey(names), key);
  }
});
