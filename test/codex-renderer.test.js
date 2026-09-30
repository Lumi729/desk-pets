const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 运行真实渲染器的联动处理和每帧状态机，用替身替代绘图与随机行为。
const source = fs.readFileSync(path.join(__dirname, '../renderer/pets.js'), 'utf8');
const handlers = source.slice(source.indexOf('  const companionWorkState ='), source.indexOf('  // ---- 退出前道晚安'));
const think = source.slice(source.indexOf('  const CAN_START_TYPING ='), source.indexOf('  function place(sprite)'));
const names = ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '百变猫猫', '灰鸮g老师', '99狐狐', '沙漠狐'];
function makePet(name, extra = {}) {
  // 百变猫猫的动作分五套放在各自的文件夹里，这里用蓝猫那一套
  const dir = name === '百变猫猫' ? path.join(name, '蓝猫') : name;
  const clips = Object.fromEntries(fs.readdirSync(path.join(__dirname, '../桌宠素材', dir))
    .filter(f => f.endsWith('.gif')).map(f => [f.slice(0, -4), true]));
  return { name, visible: true, state: 'idle', anim: '待机', lastAttention: 0, nextThink: Infinity, until: Infinity, y: 200, vy: 0, clips, ...extra };
}
function renderer(extra = {}) {
  const g = makePet('灰鸮g老师', extra);
  const pets = names.map(name => name === g.name ? g : makePet(name));
  const context = vm.createContext({
    g, pets, G: g.name, DOG: '哥哥狗狗', codexPetName: g.name, claudePetName: '哥哥狗狗', codexWorking: false, claudeWorking: false, showcase: false, leaving: false,
    nickname: '千千', performance: { now: () => 100 }, byName: name => pets.find(p => p.name === name),
    goIdle: p => { p.state = 'idle'; p.anim = '待机'; },
    setAnim: (p, a) => { p.anim = a; },
    playNamed: (p, a) => { assert.ok(p.clips[a], `${p.name} 缺少动画 ${a}`); p.state = 'action'; p.anim = a; },
    say: (p, text) => { p.bubble = text; },
    isTypingLong: () => false, maybeCelebrate: () => false, maybeSweat: () => false, maybeDoActivity: () => false,
    maybeHobby: () => false, catIsBusy: p => !!p.catBusy, runCatTrain: () => {},
    floorOf: () => 0, SLEEP_AFTER: 60000, GRAVITY: 2600,
  });
  vm.runInContext(handlers + think, context);
  return { g, pets, run: command => vm.runInContext(command, context) };
}
test('实际每帧状态机：开工切到持续敲键盘，收工停下并蹦一下', () => {
  const { g, run } = renderer();
  run('onCodexWork(true); think(g, 100, 0.016)');
  assert.equal(g.state, 'codex'); assert.equal(g.anim, '敲代码');
  run('think(g, 100000, 0.016)');
  assert.equal(g.state, 'codex');
  run('onCodexWork(false); onCodexDone()');
  assert.equal(g.anim, '开心蹦蹦');
});

test('九只宠物都能被选中开工、等待、收工，其他宠物保持原样', () => {
  for (const name of names) {
    const { pets, run } = renderer();
    const chosen = pets.find(p => p.name === name);
    run(`onCodexPet(${JSON.stringify(name)}); onCodexWork(true); pets.forEach(p => think(p, 100, 0.016))`);
    assert.equal(chosen.state, 'codex', name);
    assert.equal(chosen.anim, '敲代码');
    assert.ok(pets.filter(p => p !== chosen).every(p => p.state === 'idle'));
    run('onCodexWork(false); onCodexWaiting()');
    assert.equal(chosen.anim, chosen.clips['互动_扶眼镜1'] ? '互动_扶眼镜1' : '打招呼');
    chosen.state = 'idle';
    run('onCodexDone()');
    assert.equal(chosen.anim, '开心蹦蹦');
  }
});

test('开工途中换宠物：旧的停下，新的接班，无效选择不改变结果', () => {
  const { g, pets, run } = renderer();
  run('onCodexWork(true); think(g, 100, 0.016); onCodexPet("千千猫猫"); onCodexPet("不存在"); pets.forEach(p => think(p, 100, 0.016))');
  assert.equal(g.state, 'idle');
  assert.equal(pets[0].state, 'codex');
  run('onCodexWork(false); onCodexDone()');
  assert.equal(pets[0].anim, '开心蹦蹦');
  assert.equal(g.anim, '待机');
});

test('两边选同一只：任一启动顺序和停止顺序，都等最后一边收工才停下', () => {
  for (const start of ['Codex', 'Claude']) for (const stop of ['Codex', 'Claude']) {
    const { g, run } = renderer();
    const otherStart = start === 'Codex' ? 'Claude' : 'Codex';
    const otherStop = stop === 'Codex' ? 'Claude' : 'Codex';
    run(`onClaudePet(G); on${start}Work(true); think(g, 100, 0.016); on${otherStart}Work(true); think(g, 100, 0.016)`);
    run(`on${stop}Work(false); on${stop}Done()`);
    if (stop === 'Codex') run('onCodexWaiting()');
    else run('onClaudeFail(); onClaudeNotify()');
    assert.equal(g.anim, '敲代码', `${start} 先开工，${stop} 先收工`);
    assert.equal(g.state, otherStop.toLowerCase());
    run(`on${otherStop}Work(false); on${otherStop}Done({short: true})`);
    assert.equal(g.anim, '开心蹦蹦');
  }
});

test('两边共用宠物时换人，旧宠物继续陪另一边，新宠物接过自己的工作', () => {
  for (const moving of ['Codex', 'Claude']) {
    const { g, pets, run } = renderer();
    const staying = moving === 'Codex' ? 'Claude' : 'Codex';
    run(`onClaudePet(G); on${moving}Work(true); think(g, 100, 0.016); on${staying}Work(true); on${moving}Pet("千千猫猫"); pets.forEach(p => think(p, 100, 0.016))`);
    assert.equal(g.state, staying.toLowerCase());
    assert.equal(pets[0].state, moving.toLowerCase());
    run(`on${staying}Work(false); on${staying}Done({short: true})`);
    assert.equal(g.anim, '开心蹦蹦');
    assert.equal(pets[0].anim, '敲代码');
  }
});

test('两边选不同宠物，Codex 收工不影响 Claude 的宠物', () => {
  const { g, pets, run } = renderer();
  run('onCodexWork(true); onClaudeWork(true); pets.forEach(p => think(p, 100, 0.016)); onCodexWork(false); onCodexDone()');
  assert.equal(g.anim, '开心蹦蹦');
  assert.equal(pets.find(p => p.name === '哥哥狗狗').state, 'claude');
});
test('摔倒、拖动、贴贴、窝里睡觉、剧情期间都不抢动作', () => {
  for (const extra of [{ state: 'fall' }, { state: 'drag' }, { state: 'hug', combo: {} }, { inNest: true, state: 'sleep' }, { inScene: true }, { routine: true, state: 'sleep' }, { tucked: true, state: 'sleep' }]) {
    const { g, run } = renderer(extra);
    const before = g.state;
    run('onCodexWork(true); think(g, 100, 0.016)');
    assert.equal(g.state, before, JSON.stringify(extra));
    assert.equal(g.anim, '待机');
  }
});
test('还有另一场工作时等待只冒泡；全部暂停后扶眼镜', () => {
  const { g, run } = renderer();
  run('onCodexWork(true); think(g, 100, 0.016); onCodexWaiting({ stillWorking: true }); onCodexDone()');
  assert.equal(g.state, 'codex');
  assert.equal(g.anim, '敲代码');
  assert.match(g.bubble, /等你回应/);
  run('onCodexWork(false); onCodexWaiting({ stillWorking: false })');
  assert.equal(g.anim, '互动_扶眼镜1');
});
test('灰鸮没显示、是客人、展示中、正在退出时不响应', () => {
  for (const [extra, setup] of [[{ visible: false }, ''], [{ visitor: true }, ''], [{}, 'showcase = true;'], [{}, 'leaving = true;']]) {
    const { g, run } = renderer(extra);
    run(setup + 'onCodexWaiting(); onCodexDone()');
    assert.equal(g.anim, '待机');
    assert.equal(g.bubble, undefined);
  }
});
