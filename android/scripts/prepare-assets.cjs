// Reuse the desktop's pairing rules; only ship mobile's animations and pair hugs.
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../../renderer/combos.js');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, '桌宠素材');
const actions = ['待机', '向左走', '向右走', '摸摸头', '开心蹦蹦', '掉落', '摔趴趴', '睡觉', '打招呼', '敲代码', '看视频', '跳舞'];
function prepare(out) {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const pets = [];
  for (const name of rules.ORDER) {
    const skins = name === '百变猫猫' ? ['芝麻', '面包', '核桃', '蛋黄酥', '西米'] : [null];
    for (const skin of skins) {
      const id = `pet${pets.length}`;
      const folder = skin ? `${name}/${skin}` : name;
      const clips = {};
      for (const action of actions) {
        const file = path.join(source, folder, `${action}.gif`);
        if (fs.existsSync(file)) {
          const dest = `${id}/${action}.gif`;
          fs.mkdirSync(path.join(out, id), { recursive: true });
          fs.copyFileSync(file, path.join(out, dest)); clips[action] = dest;
        }
      }
      if (!clips['待机']) throw new Error(`Missing idle: ${folder}`);
      pets.push({ id, name, label: skin ? `百变猫猫 · ${skin}` : name, skin, clips });
    }
  }
  const hugs = {};
  fs.mkdirSync(path.join(out, 'hugs'));
  for (let a = 0; a < pets.length; a++) for (let b = a + 1; b < pets.length; b++) {
    const p = pets[a], q = pets[b];
    if (p.name === q.name || rules.isForbidden(p.name, q.name)) continue;
    const key = rules.comboKey([p.name, q.name]);
    const skin = p.skin || q.skin;
    const file = path.join(source, '贴贴', skin ? `百变猫猫_${skin}` : '', `${key}.gif`);
    if (fs.existsSync(file)) {
      const dest = `hugs/${p.id}-${q.id}.gif`;
      fs.copyFileSync(file, path.join(out, dest)); hugs[`${p.id}:${q.id}`] = dest;
    }
  }
  const data = { pets, hugs };
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(data));
  return data;
}
if (require.main === module) prepare(path.resolve(process.argv[2] || 'android/app/build/generated/petAssets'));
module.exports = { prepare };
