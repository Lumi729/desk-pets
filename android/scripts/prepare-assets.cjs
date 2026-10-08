// Reuse the desktop's pairing rules; only ship mobile's animations and pair hugs.
const fs = require('node:fs');
const path = require('node:path');
const rules = require('../../renderer/combos.js');
const Teases = require('../../renderer/teases.js');
const root = path.resolve(__dirname, '../..');
const source = path.join(root, '桌宠素材');
const actions = ['待机', '向左走', '向右走', '摸摸头', '开心蹦蹦', '掉落', '摔趴趴', '睡觉', '打招呼', '敲代码', '看视频', '跳舞', '吓一跳', '向左看', '向右看', '打哈欠', '变身_出', '变身_进', '吃饭',
  // 送零食：叼着走过去、对方吃
  '叼胡萝卜向左走', '叼胡萝卜向右走', '叼小鱼向左走', '叼小鱼向右走', '吃胡萝卜', '吃小鱼', '摇晃', '吐彩虹', '灵动岛',
  // 天气和四季换装的待机（和电脑版同名，没有的跳过）
  '待机_晴天', '待机_晴夜', '待机_多云', '待机_阴天', '待机_雾', '待机_毛毛雨', '待机_雨天', '待机_大雨', '待机_雷雨', '待机_下雪', '待机_降温', '待机_炎热',
  '待机_春', '待机_夏', '待机_秋', '待机_冬',
  // 过节、生日、纪念日、番茄钟专注、困了回小窝（Claude）
  '国庆', '万圣节', '圣诞', '春节', '生日', '纪念日', '专注', '犯困向左走', '犯困向右走',
  // 歪手机爬墙：沿屏幕边往上爬、在边上探头（Claude）
  '沿左边向上爬', '沿右边向上爬', '左边探头', '右边探头'];
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
      // 挑衅 / 回应 / 互动：整套照搬电脑版（文件名「挑衅_」「回应_」「互动_」开头），只在专属剧情里用（Claude）
      for (const file of fs.readdirSync(path.join(source, folder)).filter(f => /^(挑衅|回应|互动)_.+\.gif$/.test(f) && f !== '互动_写日记.gif').sort()) {
        const action = file.slice(0, -4), dest = `${id}/${action}.gif`;
        fs.mkdirSync(path.join(out, id), { recursive: true });
        fs.copyFileSync(path.join(source, folder, file), path.join(out, dest)); clips[action] = dest;
      }
      if (!clips['待机']) throw new Error(`Missing idle: ${folder}`);
      pets.push({ id, name, label: skin ? `百变猫猫 · ${skin}` : name, skin, clips });
    }
  }
  const hugs = {};
  // 两只一起的特别剧情：两个哥哥打架 / 和好，g老师的批改作业 / 书签 / 围观睡着 / 接眼镜 / 换眼镜，两只狐狸比尾巴 / 尾巴被子
  const PAIR_KINDS = [['fight', '_打架'], ['makeup', '_和好'], ['bookmark', '_批改作业_书签'], ['grading', '_批改作业'], ['watch', '_围观睡着'],
    ['catch', '_接眼镜'], ['swap', '_换眼镜'], ['tails', '_比尾巴'], ['tailquilt', '_尾巴被子']];
  const pairStories = Object.fromEntries(PAIR_KINDS.map(([kind]) => [kind, {}]));
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
      for (const [kind, suffix] of PAIR_KINDS) {
        const extra = file.replace(/\.gif$/, `${suffix}.gif`);
        if (!fs.existsSync(extra)) continue;
        const to = `hugs/${p.id}-${q.id}${suffix}.gif`;
        fs.copyFileSync(extra, path.join(out, to)); pairStories[kind][`${p.id}:${q.id}`] = to;
      }
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
  // 叠叠乐（Claude）：从下到上 2～3 只，规则照 combos.js 的 canStack（g老师不叠、禁配的两只不能直接叠）。
  // 键是「下>中>上」的宠物 id；有这个站位顺序的文件（比如 沙漠狐-99狐狐_2）就用它，不然用固定顺序的文件
  const stacks = {}, copied = new Map();
  fs.mkdirSync(path.join(out, 'stacks'));
  const stackFile = (names, skin) => {
    for (const key of [names.join('-'), rules.comboKey(names)]) {
      const file = path.join(source, '贴贴', skin ? `百变猫猫_${skin}` : '', `${key}_2.gif`);
      if (fs.existsSync(file)) return file;
    }
    return null;
  };
  const tryStack = list => {
    const names = list.map(p => p.name);
    if (new Set(names).size !== names.length) return;
    const skin = list.find(p => p.skin)?.skin;
    if (!rules.canStack(names.slice(0, -1), names[names.length - 1], key => !!stackFile(key.split('-'), skin))) return;
    const file = stackFile(names, skin);
    if (!copied.has(file)) { // 同一个文件只打包一次（不同站位可能用同一段动画）
      const dest = `stacks/${copied.size}.gif`;
      fs.copyFileSync(file, path.join(out, dest));
      copied.set(file, dest);
    }
    stacks[list.map(p => p.id).join('>')] = copied.get(file);
  };
  for (const a of pets) for (const b of pets) {
    if (a === b) continue;
    tryStack([a, b]);
    if (!stacks[`${a.id}>${b.id}`]) continue;
    for (const c of pets) if (c !== a && c !== b) tryStack([a, b, c]);
  }
  // 挑衅规则直接从电脑版 renderer/teases.js 生成；回应里的 { chase / hug / comfort } 写成 @chase / @hug / @comfort
  const teases = { window: Teases.WINDOW, limit: Teases.LIMIT, pairs: {} };
  for (const [teaser, { target, replies }] of Object.entries(Teases.PAIRS)) {
    teases.pairs[teaser] = { target, replies: Object.fromEntries(Object.entries(replies).map(([tease, steps]) =>
      [tease, steps.map(step => typeof step === 'string' ? step : `@${Object.keys(step)[0]}`)])) };
  }
  Object.assign(stories, pairStories);
  // 小窝两层：后层在宠物下面，前层盖在宠物上面（Claude）
  const nest = {};
  fs.mkdirSync(path.join(out, 'nest'));
  for (const [part, file] of Object.entries({ back: '小窝_后.png', front: '小窝_前.png' })) {
    const from = path.join(source, '小窝', file);
    if (!fs.existsSync(from)) throw new Error(`Missing nest part: ${file}`);
    fs.copyFileSync(from, path.join(out, 'nest', `${part}.png`));
    nest[part] = `nest/${part}.png`;
  }
  const data = { pets, hugs, island, stories, teases, stacks, nest };
  fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify(data));
  return data;
}
if (require.main === module) prepare(path.resolve(process.argv[2] || 'android/app/build/generated/petAssets'));
module.exports = { prepare };
