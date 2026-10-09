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

test('Android ships snacks, yawns, g老师 and 沙漠狐 interactions (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-batch3-'));
  try {
    const { pets, stories } = prepare(dir);
    const pet = name => pets.find(p => p.name === name);
    const pair = (kind, a, b) => stories[kind][`${pet(a).id}:${pet(b).id}`] || stories[kind][`${pet(b).id}:${pet(a).id}`];
    for (const clip of ['叼胡萝卜向左走', '叼胡萝卜向右走', '吃小鱼']) assert.ok(pet('千千猫猫').clips[clip], clip);
    for (const clip of ['叼小鱼向左走', '叼小鱼向右走', '吃胡萝卜']) assert.ok(pet('梨梨兔兔').clips[clip], clip);
    for (const p of pets) assert.ok(p.clips['打哈欠'], `${p.label} 打哈欠`);
    for (const clip of ['互动_看书', '互动_看书打瞌睡', '互动_假装没摔过', '互动_夹书签']) assert.ok(pet('灰鸮g老师').clips[clip], clip);
    for (const clip of ['互动_刨坑', '互动_堆沙堡', '互动_偷听', '互动_追尾巴', '互动_晒太阳']) assert.ok(pet('沙漠狐').clips[clip], clip);
    assert.ok(pair('grading', '哥哥狗狗', '灰鸮g老师') && pair('bookmark', '哥哥狗狗', '灰鸮g老师') && pair('swap', '哥哥狗狗', '灰鸮g老师'));
    for (const name of ['千千猫猫', '梨梨兔兔', '煤球猫猫', '99狐狐', '沙漠狐']) {
      assert.ok(pair('watch', name, '灰鸮g老师'), `${name} 围观睡着`);
      assert.ok(pair('catch', name, '灰鸮g老师'), `${name} 接眼镜`);
    }
    assert.ok(pair('tails', '99狐狐', '沙漠狐') && pair('tailquilt', '99狐狐', '沙漠狐'));
    // 批改作业 / 书签 是两段不同的动画（文件名后缀不能互相吞掉）
    assert.notEqual(pair('grading', '哥哥狗狗', '灰鸮g老师'), pair('bookmark', '哥哥狗狗', '灰鸮g老师'));
    assert.ok(!pets.some(p => p.clips['互动_写日记']), '写日记手机上用不到，不打包');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android 叠叠乐 only stacks allowed pets, at most three high, with shared files (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-stack-'));
  try {
    const { pets, stacks } = prepare(dir);
    const byId = Object.fromEntries(pets.map(p => [p.id, p]));
    const keys = Object.keys(stacks);
    assert.ok(keys.length > 0, '有可以叠的组合');
    for (const key of keys) {
      const names = key.split('>').map(id => byId[id].name);
      assert.ok(names.length >= 2 && names.length <= 3, `${key} 两到三层`);
      assert.ok(!names.some(n => rules.SOLO.includes(n)), `${key} 没有单独的伙伴`);
      for (let i = 1; i < names.length; i++) assert.ok(!rules.isForbidden(names[i - 1], names[i]), `${key} 直接叠着的没有禁配`);
      assert.ok(fs.existsSync(path.join(dir, stacks[key])), `${key} 文件在`);
    }
    assert.ok(new Set(Object.values(stacks)).size < keys.length, '同一个动画只打包一份');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android ships festival, birthday, anniversary, focus and sleepy clips plus the two nest layers (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-batch5-'));
  try {
    const { pets, nest } = prepare(dir);
    for (const p of pets) {
      const folder = path.join(__dirname, '..', '桌宠素材', p.skin ? `${p.name}/${p.skin}` : p.name);
      for (const clip of ['国庆', '万圣节', '圣诞', '春节', '生日', '纪念日', '专注', '犯困向左走', '犯困向右走', '睡觉', '吃饭']) {
        if (fs.existsSync(path.join(folder, `${clip}.gif`))) assert.ok(p.clips[clip], `${p.label} ${clip}`);
      }
    }
    for (const name of ['千千猫猫', '哥哥狗狗', '梨梨兔兔']) for (const clip of ['生日', '纪念日', '专注']) assert.ok(pets.find(p => p.name === name).clips[clip], `${name} ${clip}`);
    assert.ok(pets.find(p => p.name === '灰鸮g老师').clips['互动_看书'], 'g老师专注时看书');
    for (const part of ['back', 'front']) assert.ok(fs.existsSync(path.join(dir, nest[part])), `小窝 ${part}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android ships the edge climb up / down and peek clips for every pet and cat skin (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-climb-'));
  try {
    const { pets } = prepare(dir);
    assert.equal(pets.length, 13);
    for (const p of pets) for (const clip of ['沿左边向上爬', '沿右边向上爬', '左边探头', '右边探头', '沿左边向下爬', '沿右边向下爬']) {
      assert.ok(p.clips[clip], `${p.label} ${clip}`);
      const head = fs.readFileSync(path.join(dir, p.clips[clip])).subarray(0, 10);
      assert.equal(head.toString('latin1', 0, 3), 'GIF');
      assert.deepEqual([head.readUInt16LE(6), head.readUInt16LE(8)], [300, 250], `${p.label} ${clip} 300×250`);
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Android island panel ships its nine 11×11 pixel icons (Claude)', () => {
  const dir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res', 'drawable-nodpi');
  for (const name of ['prev', 'play', 'pause', 'next', 'timer', 'hide', 'move', 'close', 'heart']) {
    const file = path.join(dir, `ic_panel_${name}.png`);
    assert.ok(fs.existsSync(file), name);
    const png = fs.readFileSync(file);
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(w, h, `${name} 是正方形`);
    assert.equal(w % 11, 0, `${name} 是 11 格的整数倍`);
  }
});

// 读小 zip（只用中央目录，够测内置美化包）
function readZip(file) {
  const zlib = require('node:zlib');
  const buf = fs.readFileSync(file);
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10), size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28), extraLen = buf.readUInt16LE(at + 30), commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42), name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

test('Android built-in themes follow 美化包格式 v1 and ship with the APK assets (Claude)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mobile-themes-'));
  try {
    const { themes } = prepare(dir);
    assert.deepEqual(themes, ['themes/qianqian.zip', 'themes/lili-bunny.zip']);
    const keys = ['background', 'panel', 'rim', 'card', 'accent', 'accentText', 'text', 'subtext', 'pageText', 'pageSubtext', 'track', 'icon'];
    for (const rel of themes) {
      const files = readZip(path.join(dir, rel));
      const theme = JSON.parse(files['theme.json'].toString('utf8'));
      assert.match(theme.id, /^[a-z0-9-]{1,40}$/);
      assert.equal(`themes/${theme.id}.zip`, rel, '文件名就是 id');
      assert.equal(theme.version, 1);
      for (const key of keys) assert.match(theme.colors[key], /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, `${theme.id} ${key}`);
      const heights = ['island_left.png', 'island_middle.png', 'island_right.png'].map(name => {
        const png = files[name];
        assert.ok(png && png.subarray(1, 4).toString() === 'PNG', `${theme.id} ${name}`);
        assert.ok(png.length <= 512 * 1024);
        return png.readUInt32BE(20);
      });
      assert.equal(new Set(heights).size, 1, `${theme.id} 三段一样高`);
      for (const name of Object.keys(files)) assert.ok(!name.includes('..') && !name.startsWith('/'), name);
    }
    const qq = JSON.parse(readZip(path.join(dir, themes[0]))['theme.json']);
    assert.equal(qq.colors.background, '#241E26', '千千猫猫设置页深色底');
    assert.equal(qq.mascot, '千千猫猫');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
