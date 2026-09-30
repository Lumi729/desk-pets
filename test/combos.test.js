const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { comboKey, isForbidden, touchingRows, pickHug, canStack, parseComboFile, ORDER, SPECIAL_KINDS } = require('../renderer/combos');

const dir = path.join(__dirname, '..', '桌宠素材', '贴贴');
const files = new Set(fs.readdirSync(dir).filter(f => f.endsWith('.gif')).map(f => f.replace(/\.gif$/, '')));
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
    // 一般按固定顺序写；也可以另外放一份「站位反过来」的（比如 沙漠狐-99狐狐），但固定顺序的那份也要有
    const canon = comboKey(base.split('-'));
    assert.ok(canon === base || files.has(canon), base);
    for (const pet of base.split('-')) assert.ok(ORDER.includes(pet), pet);
  }
});

test('g老师 reads with every other pet one-on-one, never stacks', () => {
  for (const name of ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '99狐狐']) {
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

test('g老师 follow-ups are special kinds, never random hugs', () => {
  assert.deepStrictEqual(parseComboFile('哥哥狗狗-灰鸮g老师_批改作业_书签'), { key: '哥哥狗狗-灰鸮g老师', kind: 'bookmark' });
  assert.deepStrictEqual(parseComboFile('哥哥狗狗-灰鸮g老师_批改作业'), { key: '哥哥狗狗-灰鸮g老师', kind: 'grading' });
  assert.deepStrictEqual(parseComboFile('千千猫猫-灰鸮g老师_接眼镜'), { key: '千千猫猫-灰鸮g老师', kind: 'catch' });
  assert.deepStrictEqual(parseComboFile('煤球猫猫-灰鸮g老师_围观睡着'), { key: '煤球猫猫-灰鸮g老师', kind: 'watch' });
  assert.deepStrictEqual(parseComboFile('哥哥狗狗-灰鸮g老师_换眼镜'), { key: '哥哥狗狗-灰鸮g老师', kind: 'swap' });
  for (const kind of ['bookmark', 'catch', 'watch', 'swap']) assert.ok(SPECIAL_KINDS.includes(kind));
});

test('99狐狐 sits between 煤球猫猫 and 灰鸮g老师 and follows 煤球猫猫\'s rules', () => {
  assert.ok(ORDER.indexOf('煤球猫猫') < ORDER.indexOf('99狐狐') && ORDER.indexOf('99狐狐') < ORDER.indexOf('灰鸮g老师'));
  assert.strictEqual(comboKey(['灰鸮g老师', '99狐狐']), '99狐狐-灰鸮g老师');
  assert.strictEqual(comboKey(['99狐狐', '煤球猫猫', '千千猫猫']), '千千猫猫-煤球猫猫-99狐狐');
  assert.ok(isForbidden('99狐狐', '梨梨哥哥'));
  assert.ok(!isForbidden('99狐狐', '煤球猫猫'));
  assert.strictEqual(canStack(['梨梨哥哥'], '99狐狐', () => true), null);
  // 和煤球一样有扶起来、接眼镜、围观睡着
  for (const name of ['哥哥狗狗-99狐狐_扶起来', '99狐狐-灰鸮g老师_接眼镜', '99狐狐-灰鸮g老师_围观睡着', '99狐狐-灰鸮g老师']) assert.ok(files.has(name), name);
});

const CATS = ['芝麻', '面包', '核桃', '蛋黄酥', '西米'];
const assets = path.join(__dirname, '..', '桌宠素材');
const gifsIn = sub => fs.readdirSync(path.join(assets, sub)).filter(f => f.endsWith('.gif')).map(f => f.slice(0, -4));

test('百变猫猫 comes after 煤球猫猫, 沙漠狐 after 99狐狐, and neither hugs 梨梨哥哥', () => {
  assert.deepStrictEqual(ORDER, ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '百变猫猫', '99狐狐', '沙漠狐', '灰鸮g老师']);
  for (const name of ['百变猫猫', '沙漠狐']) {
    assert.ok(isForbidden(name, '梨梨哥哥'), name);
    assert.strictEqual(canStack(['梨梨哥哥'], name, () => true), null);
    assert.strictEqual(canStack([name], '梨梨哥哥', () => true), null);
  }
  assert.strictEqual(comboKey(['沙漠狐', '99狐狐']), '99狐狐-沙漠狐');
});

test('99狐狐 and 沙漠狐 have their own stories that are never random hugs', () => {
  assert.deepStrictEqual(parseComboFile('99狐狐-沙漠狐_比尾巴'), { key: '99狐狐-沙漠狐', kind: 'tails' });
  assert.deepStrictEqual(parseComboFile('99狐狐-沙漠狐_尾巴被子'), { key: '99狐狐-沙漠狐', kind: 'tailquilt' });
  for (const kind of ['tails', 'tailquilt']) assert.ok(SPECIAL_KINDS.includes(kind));
  for (const name of ['99狐狐-沙漠狐_比尾巴', '99狐狐-沙漠狐_尾巴被子', '哥哥狗狗-沙漠狐_扶起来', '沙漠狐-灰鸮g老师_接眼镜', '沙漠狐-灰鸮g老师_围观睡着']) assert.ok(files.has(name), name);
});

test('every 百变猫猫 cat has the same moves as 煤球猫猫 plus 变身_出 and 变身_进', () => {
  const coal = new Set(gifsIn('煤球猫猫'));
  for (const cat of CATS) {
    const moves = new Set(gifsIn(path.join('百变猫猫', cat)));
    for (const move of ['待机', '向左走', '向右走', '睡觉', '掉落', '摔趴趴', '敲代码', '打招呼', '开心蹦蹦', '变身_出', '变身_进']) assert.ok(moves.has(move), `${cat} 缺 ${move}`);
    for (const move of coal) if (!move.startsWith('叼') && !move.startsWith('吃')) assert.ok(moves.has(move) || !coal.has(move), `${cat} 缺 ${move}`);
  }
  const group = new Set(gifsIn(path.join('百变猫猫', '互动')));
  for (const name of ['叠猫猫塔_搭', '叠猫猫塔_晃', '叠猫猫塔_倒', '排排坐点名', '小猫火车_向右', '小猫火车_向左', '一起睡觉', '一起吃饭', '一起跳舞', '抢出场']) assert.ok(group.has(name), name);
  // 两只一起的：只用这五只的名字
  for (const name of group) {
    const m = /^猫猫贴贴_(.+)_(.+)$/.exec(name) || /^猫猫叠叠乐_(.+)在(.+)上面$/.exec(name);
    if (m) for (const cat of [m[1], m[2]]) assert.ok(CATS.includes(cat), name);
  }
});

test('each 百变猫猫 cat hugs with its own files, named like everyone else\'s', () => {
  for (const cat of CATS) {
    const own = new Set(gifsIn(path.join('贴贴', `百变猫猫_${cat}`)));
    assert.ok(own.size >= 20, cat);
    for (const name of own) {
      const { key, kind } = parseComboFile(name);
      assert.ok(key.split('-').includes('百变猫猫'), name);
      assert.strictEqual(comboKey(key.split('-')), key, name);
      for (const pet of key.split('-')) assert.ok(ORDER.includes(pet), name);
      if (!SPECIAL_KINDS.includes(kind) && !key.includes('灰鸮g老师')) assert.ok(own.has(key) && own.has(`${key}_2`), name);
    }
  }
});
