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
