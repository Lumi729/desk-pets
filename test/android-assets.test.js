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
