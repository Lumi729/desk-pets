const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { gifInfo } = require('../lib/gif');

const assets = path.join(__dirname, '..', '桌宠素材');

test('reads size, frames and loop duration', () => {
  assert.deepStrictEqual(gifInfo(fs.readFileSync(path.join(assets, '千千猫猫', '待机.gif'))), { width: 300, height: 250, frames: 8, duration: 2080 });
  assert.deepStrictEqual(gifInfo(fs.readFileSync(path.join(assets, '贴贴', '千千猫猫-梨梨兔兔.gif'))), { width: 360, height: 250, frames: 8, duration: 2080 });
});

test('every asset GIF parses', () => {
  for (const dir of ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '百变猫猫/芝麻', '百变猫猫/面包', '百变猫猫/核桃', '百变猫猫/蛋黄酥', '百变猫猫/西米', '百变猫猫/互动', '99狐狐', '沙漠狐', '灰鸮g老师']) {
    const names = fs.readdirSync(path.join(assets, dir));
    if (dir === '百变猫猫/互动') { for (const f of names) assert.ok(gifInfo(fs.readFileSync(path.join(assets, dir, f))).duration > 0, f); continue; }
    for (const need of ['待机', '向左走', '向右走', '睡觉', '向左看', '向右看', '敲代码', '看视频', '跳舞', '吃饭', '开心蹦蹦', '害羞', '掉落', '摔趴趴', '冒冷汗']) assert.ok(names.includes(`${need}.gif`), `${dir} 缺少 ${need}.gif`);
    for (const f of names) assert.ok(gifInfo(fs.readFileSync(path.join(assets, dir, f))).duration > 0, f);
  }
});

test('rejects non-GIF data', () => {
  assert.throws(() => gifInfo(Buffer.from('hello world, not a gif')));
});

test('tray icons exist', () => {
  const dir = path.join(assets, '托盘图标');
  for (const name of ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '百变猫猫_芝麻', '百变猫猫_面包', '百变猫猫_核桃', '百变猫猫_蛋黄酥', '百变猫猫_西米', '99狐狐', '沙漠狐', '灰鸮g老师']) {
    assert.ok(fs.existsSync(path.join(dir, `${name}.ico`)), name);
    assert.ok(fs.existsSync(path.join(dir, `${name}-256.png`)), name);
  }
});

test('g老师 has all its special animations', () => {
  for (const anim of ['互动_扶眼镜1', '互动_扶眼镜2', '互动_扶眼镜3', '互动_擦眼镜', '互动_假装没摔过', '互动_歪头看_向左', '互动_歪头看_向右',
    '互动_往后蹦_向左', '互动_往后蹦_向右', '互动_看书', '互动_看书打瞌睡']) {
    assert.ok(fs.existsSync(path.join(assets, '灰鸮g老师', `${anim}.gif`)), anim);
  }
});

test('哥哥狗狗 has its special animations', () => {
  for (const anim of ['互动_扶起来', '互动_举牌测试通过']) assert.ok(fs.existsSync(path.join(assets, '哥哥狗狗', `${anim}.gif`)), anim);
  for (const f of ['千千猫猫-哥哥狗狗_盖被子', '哥哥狗狗-灰鸮g老师_批改作业']) assert.ok(fs.existsSync(path.join(assets, '贴贴', `${f}.gif`)), f);
});

test('沙漠狐 has its little hobbies', () => {
  const names = fs.readdirSync(path.join(assets, '沙漠狐'));
  for (const anim of ['互动_刨坑', '互动_堆沙堡', '互动_偷听', '互动_追尾巴', '互动_晒太阳']) assert.ok(names.includes(`${anim}.gif`), anim);
});
