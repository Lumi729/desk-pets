const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('../android/scripts/prepare-assets.cjs');
const rules = require('../renderer/combos.js');
test('Android packages real idle/interaction clips and obeys desktop pairing restrictions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-pets-'));
  try {
    const { pets, hugs } = prepare(dir);
    assert.equal(pets.length, 13);
    assert.equal(pets.filter(p => p.skin).length, 5);
    for (const p of pets) {
      for (const action of ['待机', '敲代码', '看视频', '跳舞', '开心蹦蹦']) assert.ok(p.clips[action], `${p.label}: ${action}`);
      for (const file of Object.values(p.clips)) assert.match(fs.readFileSync(path.join(dir, file)).subarray(0, 6).toString(), /^GIF8[79]a$/);
    }
    for (const [pair, file] of Object.entries(hugs)) {
      const [a, b] = pair.split(':').map(id => pets.find(p => p.id === id));
      assert.equal(rules.isForbidden(a.name, b.name), false);
      assert.notEqual(a.name, b.name);
      assert.ok(fs.existsSync(path.join(dir, file)));
    }
    const cat = pets.find(p => p.name === '千千猫猫');
    const dog = pets.find(p => p.name === '哥哥狗狗');
    assert.ok(hugs[`${cat.id}:${dog.id}`], 'initial pets can hug');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android ships the shake, rainbow and island clips plus the three pixel island parts (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-island-'));
  try {
    const { pets, island } = prepare(dir);
    for (const p of pets) for (const action of ['摇晃', '吐彩虹', '灵动岛']) assert.ok(p.clips[action], `${p.label}: ${action}`);
    assert.deepEqual(Object.keys(island).sort(), ['left', 'middle', 'right']);
    for (const file of Object.values(island)) {
      const bytes = fs.readFileSync(path.join(dir, file));
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(bytes.readUInt32BE(20), 70, `${file} 应该是 70 像素高`); // 三段一样高，才能拼成一条
    }
    const catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'));
    assert.deepEqual(catalog.island, island);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android ships every weather and season idle that exists, plus the desktop regions (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-weather-'));
  try {
    const { pets } = prepare(dir);
    const idles = ['待机_晴天', '待机_晴夜', '待机_多云', '待机_阴天', '待机_雾', '待机_毛毛雨', '待机_雨天', '待机_大雨', '待机_雷雨', '待机_下雪', '待机_降温', '待机_炎热', '待机_春', '待机_夏', '待机_秋', '待机_冬'];
    for (const p of pets) {
      const folder = path.join(__dirname, '..', '桌宠素材', p.skin ? `百变猫猫/${p.skin}` : p.name);
      for (const idle of idles) assert.equal(!!p.clips[idle], fs.existsSync(path.join(folder, `${idle}.gif`)), `${p.label}: ${idle}`);
    }
    const regions = JSON.parse(fs.readFileSync(path.join(dir, 'regions.json'), 'utf8'));
    const hunan = regions.find(([name]) => name === '湖南省');
    assert.ok(hunan[1].find(([name]) => name === '长沙市'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android packages 扶起来 / 盖被子 stories apart from hugs, with 哥哥狗狗 side (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-stories-'));
  try {
    const { pets, hugs, stories } = prepare(dir);
    const byId = id => pets.find(p => p.id === id);
    const cat = pets.find(p => p.name === '千千猫猫');
    assert.ok(stories.helpup[cat.id] && stories.blanket[cat.id]);
    assert.equal(stories.helpup[cat.id].dogLeft, false); // 千千猫猫-哥哥狗狗：狗狗在右边
    assert.equal(stories.helpup[pets.find(p => p.name === '煤球猫猫').id].dogLeft, true);
    assert.ok(pets.filter(p => p.skin).every(p => stories.helpup[p.id]), '百变猫猫五只都能被扶');
    for (const kind of ['helpup', 'blanket']) for (const [id, { file }] of Object.entries(stories[kind])) {
      assert.notEqual(byId(id).name, '哥哥狗狗');
      assert.ok(fs.existsSync(path.join(dir, file)));
      assert.ok(!Object.values(hugs).includes(file), '特别剧情不混进普通贴贴');
    }
    assert.deepEqual(Object.keys(stories.blanket), [cat.id]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android tease rules come straight from teases.js, with every clip and the brothers\' fight / make-up (Claude)', () => {
  const Teases = require('../renderer/teases.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-teases-'));
  try {
    const { pets, hugs, stories, teases } = prepare(dir);
    assert.equal(teases.window, Teases.WINDOW); assert.equal(teases.limit, Teases.LIMIT);
    const pet = name => pets.find(p => p.name === name);
    for (const [teaser, { target, replies }] of Object.entries(Teases.PAIRS)) {
      assert.equal(teases.pairs[teaser].target, target);
      for (const [tease, steps] of Object.entries(replies)) {
        assert.deepEqual(teases.pairs[teaser].replies[tease], steps.map(s => typeof s === 'string' ? s : `@${Object.keys(s)[0]}`));
        assert.ok(pet(teaser).clips[`挑衅_${tease}`], `${teaser} 挑衅_${tease}`);
        for (const step of steps) if (typeof step === 'string') assert.ok(pet(target).clips[`回应_${step}`], `${target} 回应_${step}`);
      }
      assert.ok(pet(target).clips['回应_投降']);
    }
    const dog = pet('哥哥狗狗'), lili = pet('梨梨哥哥'), key = `${dog.id}:${lili.id}`;
    assert.ok(hugs[key] && stories.fight[key] && stories.makeup[key], '两个哥哥：贴贴、打架、和好');
    assert.equal(Object.keys(stories.fight).length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
