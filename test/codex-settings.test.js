const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const settingsCode = source.slice(source.indexOf('const settingsFile ='), source.indexOf('function loadAssets()'));
const setter = source.slice(source.indexOf('function setCodexPet('), source.indexOf('async function codexHelp('));
function appSettings(saved = {}) {
  let disk = JSON.stringify(saved);
  const events = [];
  const names = ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '99狐狐', '灰鸮g老师'];
  const context = vm.createContext({
    path, app: { getPath: () => '/settings' }, PETS: names, FEATURES: [], TRAY_ICONS: names, NEW_PETS: [], SIZES: [1],
    fs: { readFileSync: () => disk, mkdirSync() {}, writeFileSync: (_p, value) => { disk = value; }, statSync: () => ({ birthtime: new Date(0) }) },
    normalizeLocation: () => null, cleanName: value => typeof value === 'string' ? value : '', normalizeBirthday: () => null,
    send: (...args) => events.push(args), refreshTray() {},
  });
  vm.runInContext(settingsCode + setter + '\nloadSettings();', context);
  return { run: code => vm.runInContext(code, context), saved: () => JSON.parse(disk), events };
}

test('Codex 选择保存后重启恢复，不改变 Claude 选择和宠物显示设置', () => {
  const app = appSettings({ claudePet: '梨梨兔兔', pets: { '99狐狐': false } });
  assert.equal(app.run('settings.codexPet'), '灰鸮g老师');
  app.run('setCodexPet("99狐狐")');
  assert.deepEqual(app.events, [['codex-pet', '99狐狐']]);
  const restarted = appSettings(app.saved());
  assert.equal(restarted.run('settings.codexPet'), '99狐狐');
  assert.equal(restarted.run('settings.claudePet'), '梨梨兔兔');
  assert.equal(restarted.run('settings.pets["99狐狐"]'), false);
});

test('旧设置和无效宠物名保留灰鸮默认值，无效选择不写盘或通知', () => {
  for (const codexPet of [undefined, null, '不存在']) {
    const app = appSettings({ codexPet });
    assert.equal(app.run('settings.codexPet'), '灰鸮g老师');
    const before = app.saved();
    app.run('setCodexPet("不存在")');
    assert.deepEqual(app.saved(), before);
    assert.equal(app.events.length, 0);
  }
});
