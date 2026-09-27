const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// 运行真实渲染器的联动处理和每帧状态机，用替身替代绘图与随机行为。
const source = fs.readFileSync(path.join(__dirname, '../renderer/pets.js'), 'utf8');
const handlers = source.slice(source.indexOf('  const codexOwl ='), source.indexOf('  // ---- 联动 Claude Code ----'));
const think = source.slice(source.indexOf('  const CAN_START_TYPING ='), source.indexOf('  function place(sprite)'));
function renderer(extra = {}) {
  const g = { name: '灰鸮g老师', visible: true, state: 'idle', anim: '待机', lastAttention: 0, nextThink: Infinity, until: Infinity, y: 200, vy: 0, clips: { 敲代码: true }, ...extra };
  const context = vm.createContext({
    g, G: g.name, DOG: '哥哥狗狗', codexWorking: false, claudeWorking: false, showcase: false, leaving: false,
    nickname: '千千', performance: { now: () => 100 }, byName: () => g,
    goIdle: p => { p.state = 'idle'; p.anim = '待机'; },
    setAnim: (p, a) => { p.anim = a; },
    playNamed: (p, a) => { p.state = 'action'; p.anim = a; },
    say: (p, text) => { p.bubble = text; },
    isTypingLong: () => false, maybeCelebrate: () => false, maybeSweat: () => false, maybeDoActivity: () => false,
    floorOf: () => 0, SLEEP_AFTER: 60000, GRAVITY: 2600,
  });
  vm.runInContext(handlers + think, context);
  return { g, run: command => vm.runInContext(command, context) };
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
