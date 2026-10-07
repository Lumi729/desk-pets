// Reuse the desktop's pairing rules; only ship mobile's animations and pair hugs.
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../../renderer/combos.js');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, '桌宠素材');
const actions = ['待机', '向左走', '向右走', '摸摸头', '开心蹦蹦', '掉落', '摔趴趴', '睡觉', '打招呼', '敲代码', '看视频', '跳舞', '吓一跳', '摇晃', '吐彩虹', '灵动岛',
  // 天气和四季换装的待机（和电脑版同名，没有的跳过）
  '待机_晴天', '待机_晴夜', '待机_多云', '待机_阴天', '待机_雾', '待机_毛毛雨', '待机_雨天', '待机_大雨', '待机_雷雨', '待机_下雪', '待机_降温', '待机_炎热',
  '待机_春', '待机_夏', '待机_秋', '待机_冬'];
// 像素风灵动岛的三段：左右两段不拉伸，中间那段横向平铺
// 有的宠物没画「摸摸头」：点它时用「害羞」代替，不会停在待机（Claude）
const FALLBACKS = { 摸摸头: ['害羞'] };
const ISLAND = { left: '左.png', middle: '中.png', right: '右.png' };
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
        const names = [action, ...(FALLBACKS[action] || [])];
        const found = names.map(n => path.join(source, folder, `${n}.gif`)).find(f => fs.existsSync(f));
        const file = found || path.join(source, folder, `${action}.gif`);
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
  // 特别剧情（和普通贴贴分开存）：哥哥狗狗扶起摔趴趴的宠物、给睡着的千千猫猫盖被子（Claude）
  // stories.helpup[宠物 id] / stories.blanket[千千猫猫 id] = { file, dogLeft }，dogLeft：动画里哥哥狗狗在左边
  const stories = { helpup: {}, blanket: {} };
  fs.mkdirSync(path.join(out, 'stories'));
  const DOG = '哥哥狗狗';
  for (const p of pets) {
    if (p.name === DOG) continue;
    const key = rules.comboKey([p.name, DOG]);
    for (const [kind, suffix] of [['helpup', '_扶起来'], ['blanket', '_盖被子']]) {
      const file = path.join(source, '贴贴', p.skin ? `百变猫猫_${p.skin}` : '', `${key}${suffix}.gif`);
      if (!fs.existsSync(file)) continue;
      const dest = `stories/${kind}-${p.id}.gif`;
      fs.copyFileSync(file, path.join(out, dest));
      stories[kind][p.id] = { file: dest, dogLeft: key.startsWith(`${DOG}-`) };
    }
  }
  const island = {};
  fs.mkdirSync(path.join(out, 'island'));
  for (const [part, file] of Object.entries(ISLAND)) {
    const from = path.join(source, '灵动岛', file);
    if (!fs.existsSync(from)) throw new Error(`Missing island part: ${file}`);
    fs.copyFileSync(from, path.join(out, 'island', `${part}.png`));
    island[part] = `island/${part}.png`;
  }
  // 天气地点：直接复用电脑版的「省 → 市 → 区县」（带中心点经纬度）
  fs.copyFileSync(path.join(root, 'lib', 'regions.json'), path.join(out, 'regions.json'));
  const data = { pets, hugs, island, stories };
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(data));
  return data;
}
if (require.main === module) prepare(path.resolve(process.argv[2] || 'android/app/build/generated/petAssets'));
module.exports = { prepare };
