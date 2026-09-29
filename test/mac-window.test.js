const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { execFileSync } = require('node:child_process');
const { parseLine, classify } = require('../lib/activity');
const { watchMac, helperPath } = require('../lib/mac-activity');
const { createMacDisplays } = require('../lib/mac-displays');

test('Mac 窗口保留负坐标和全屏状态，关闭活动分类时不输出标题或类别', () => {
  const line = JSON.stringify({ h: '21:99', r: '-1920,-1080,0,0', f: true, p: 'com.microsoft.VSCode', t: '秘密标题' });
  assert.deepEqual(parseLine(line, false), { handle: '21:99', rect: { x: -1920, y: -1080, width: 1920, height: 1080 }, kind: null, fullscreen: true });
  assert.equal(parseLine(line, true).kind, 'code');
  assert.equal(classify('com.apple.Music', ''), 'music');
  assert.ok(!JSON.stringify(parseLine(line, true)).includes('秘密'));
});

test('权限撤销清空旧窗口，恢复授权后继续；分块输出、停止和组件缺失可恢复', () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stdout.setEncoding = () => {}; child.kill = () => child.emit('exit');
  const info = [], errors = [], spawned = [];
  const stop = watchMac(x => info.push(x), { full: false, parseLine, onFail: x => errors.push(x), spawnProcess: (...args) => { spawned.push(args); return child; } });
  assert.ok(!spawned[0][1].includes('--full'));
  child.stdout.emit('data', '{"h":1,"r":"1,2,'); child.stdout.emit('data', '30,40","f":false}\n');
  assert.equal(info.at(-1).rect.width, 29);
  child.stdout.emit('data', '{"error":"permission"}\n');
  assert.equal(info.at(-1).rect, null); assert.equal(errors.at(-1), 'permission');
  child.stdout.emit('data', '{"h":2,"r":"2,3,40,50","f":false}\n');
  assert.equal(info.at(-1).handle, 2);
  child.emit('error', { code: 'ENOENT' }); assert.equal(errors.at(-1), 'missing');
  const count = info.length; stop(); child.stdout.emit('data', '{"h":3}\n'); assert.equal(info.length, count);
});

test('Mac 原生组件能启动，未获权限时只返回权限状态', { skip: process.platform !== 'darwin' }, () => {
  const result = JSON.parse(execFileSync(helperPath(), ['--once'], { encoding: 'utf8', timeout: 10000 }));
  if (result.error) assert.equal(result.error, 'permission');
  else { assert.ok('r' in result); assert.ok(!('p' in result)); assert.ok(!('t' in result)); }
});

function displays() {
  const all = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.bounds = options; this.dead = false; this.visible = true; this.messages = [];
      this.webContents = new EventEmitter(); this.webContents.isLoading = () => false;
      this.webContents.send = (...args) => this.messages.push(args); all.push(this);
    }
    getBounds() { return this.bounds; } setBounds(b) { this.bounds = b; }
    isDestroyed() { return this.dead; } destroy() { this.dead = true; }
    isVisible() { return this.visible; } showInactive() { this.visible = true; } hide() { this.visible = false; }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} loadFile() {}
    setIgnoreMouseEvents(value) { this.ignore = value; }
  }
  const primary = { id: 1, workArea: { x: 0, y: 25, width: 1440, height: 875 } };
  const other = { id: 2, workArea: { x: -1920, y: -1055, width: 1920, height: 1055 } };
  let list = [primary, other], pointer = { x: 100, y: 100 };
  const ipc = new EventEmitter(), host = new Window(primary.workArea);
  const manager = createMacDisplays({ BrowserWindow: Window, ipcMain: ipc, host, root: '/app',
    bounds: () => ({ x: -1920, y: -1055, width: 3360, height: 1955 }),
    screen: { getAllDisplays: () => list, getCursorScreenPoint: () => pointer } });
  return { manager, ipc, host, views: all.slice(1), unplug: () => { list = [primary]; manager.reconcile(); }, pointer: p => { pointer = p; } };
}
test('多个屏幕只显示同一套场景，拒绝显示窗口伪造主场景，正确换算负坐标', () => {
  const { ipc, host, views, manager } = displays();
  const frame = { nodes: [{ key: 1, tag: 'IMG', image: 'gif' }], images: [['gif', new Uint8Array([71, 73, 70])]] };
  ipc.emit('mirror-frame', { sender: views[0].webContents }, frame);
  assert.equal(views[1].messages.length, 0);
  ipc.emit('mirror-frame', { sender: host.webContents }, frame);
  assert.equal(views[0].messages[0][1].nodes, views[1].messages[0][1].nodes);
  assert.deepEqual(views[1].messages[0][1].layout, { x: 0, y: 0, width: 3360, height: 1955 });
  ipc.emit('mirror-input', { sender: views[0].webContents }, { type: 'pointerdown', key: 4, x: 100, y: 200, button: 0, buttons: 1 });
  assert.equal(host.messages.at(-1)[1].x, 2020);
  assert.equal(host.messages.at(-1)[1].y, 1280);
  // Capture keeps delivering events from the original view even outside its bounds.
  ipc.emit('mirror-input', { sender: views[0].webContents }, { type: 'pointermove', key: 999, x: -1700, y: -500, button: 0, buttons: 1 });
  assert.equal(host.messages.at(-1)[1].key, 4);
  assert.equal(host.messages.at(-1)[1].x, 220);
  ipc.emit('mirror-input', { sender: views[0].webContents }, { type: 'pointerup', key: 4, x: -1700, y: -500, button: 0, buttons: 0 });
  manager.destroy();
});
test('拔掉正在拖动的屏幕会取消拖动，鼠标穿透只在命中的显示窗口关闭', () => {
  const { ipc, host, views, manager, pointer, unplug } = displays();
  pointer({ x: -100, y: -100 }); manager.setIgnore(false);
  assert.equal(views[0].ignore, true); assert.equal(views[1].ignore, false);
  ipc.emit('mirror-input', { sender: views[1].webContents }, { type: 'pointerdown', key: 4, x: 100, y: 200, button: 0, buttons: 1 });
  unplug(); assert.equal(host.messages.at(-1)[1].type, 'pointercancel'); assert.equal(views[1].dead, true);
  host.emit('hide'); assert.equal(views[0].visible, false);
  host.emit('show'); assert.equal(views[0].visible, true);
  manager.destroy(); assert.equal(ipc.listenerCount('mirror-frame'), 0);
});
