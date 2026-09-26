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
  for (const dir of ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '绿眼猫猫']) {
    const names = fs.readdirSync(path.join(assets, dir));
    for (const need of ['待机', '向左走', '向右走', '睡觉', '向左看', '向右看', '敲代码', '看视频', '跳舞', '吃饭', '开心蹦蹦', '害羞', '掉落', '摔趴趴', '冒冷汗']) assert.ok(names.includes(`${need}.gif`), `${dir} 缺少 ${need}.gif`);
    for (const f of names) assert.ok(gifInfo(fs.readFileSync(path.join(assets, dir, f))).duration > 0, f);
  }
});

test('rejects non-GIF data', () => {
  assert.throws(() => gifInfo(Buffer.from('hello world, not a gif')));
});

test('tray icons exist', () => {
  const dir = path.join(assets, '托盘图标');
  for (const name of ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '绿眼猫猫']) {
    assert.ok(fs.existsSync(path.join(dir, `${name}.ico`)), name);
    assert.ok(fs.existsSync(path.join(dir, `${name}-256.png`)), name);
  }
});
