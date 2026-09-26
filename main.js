const { app, BrowserWindow, Menu, ipcMain, powerMonitor, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { gifInfo } = require('./lib/gif');
const { watchForeground } = require('./lib/activity');

const ASSETS = path.join(__dirname, '桌宠素材');
const PETS = [
  { id: 'cat', name: '千千猫猫' },
  { id: 'bunny', name: '梨梨兔兔' },
];
const SHOW_CHOICES = [
  { value: 'cat', label: '只显示千千猫猫' },
  { value: 'bunny', label: '只显示梨梨兔兔' },
  { value: 'both', label: '两只都显示' },
];
const FEATURES = [
  { key: 'time', label: '时间提醒（该睡觉 / 该吃饭）' },
  { key: 'sit', label: '久坐提醒（60 分钟）' },
  { key: 'mouse', label: '鼠标互动（看鼠标 / 害羞）' },
  { key: 'activity', label: '看我在做什么（写代码 / 看视频 / 听歌）' },
];

const SIT_LIMIT = 60 * 60_000;   // 连续用电脑多久提醒
const BREAK_IDLE = 5 * 60;        // 离开电脑多少秒算休息过了

let win;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const settings = { show: 'both', features: Object.fromEntries(FEATURES.map(f => [f.key, true])) };

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (SHOW_CHOICES.some(c => c.value === saved.show)) settings.show = saved.show;
    for (const { key } of FEATURES) if (typeof saved.features?.[key] === 'boolean') settings.features[key] = saved.features[key];
  } catch {}
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('保存设置失败', error);
  }
}

function readGif(file) {
  const bytes = fs.readFileSync(file);
  return { bytes, ...gifInfo(bytes) };
}

function loadAssets() {
  const pets = {};
  for (const pet of PETS) {
    const dir = path.join(ASSETS, pet.name);
    const anims = {};
    for (const file of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.gif')).sort()) {
      anims[path.basename(file, path.extname(file))] = readGif(path.join(dir, file));
    }
    pets[pet.id] = { name: pet.name, anims };
  }
  return { show: settings.show, features: settings.features, activity, pets, hug: readGif(path.join(ASSETS, '贴贴.gif')) };
}

const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };

function setShow(value) {
  settings.show = value;
  saveSettings();
  send('show', value);
}

function setFeature(key, on) {
  settings.features[key] = on;
  saveSettings();
  send('features', settings.features);
  if (key === 'activity') updateActivityWatcher();
  if (key === 'sit') sitStart = null;
}

// ---- 看前台窗口（只得出类别，不保存标题） + 是否在打字 ----
let stopWatcher = null;
let activity = { kind: null, typing: false };

function updateActivityWatcher() {
  if (settings.features.activity && !stopWatcher) {
    stopWatcher = watchForeground(kind => { activity.kind = kind; send('activity', activity); });
  } else if (!settings.features.activity && stopWatcher) {
    stopWatcher();
    stopWatcher = null;
    activity = { kind: null, typing: false };
    send('activity', activity);
  }
}

// 打字：刚有输入，但鼠标没动 → 大概是在敲键盘。不读取任何按键。
let lastCursor = null;
let lastMouseMove = 0;
function checkTyping() {
  const p = screen.getCursorScreenPoint();
  const now = Date.now();
  if (!lastCursor || p.x !== lastCursor.x || p.y !== lastCursor.y) lastMouseMove = now;
  lastCursor = p;
  if (!settings.features.activity) return;
  const typing = powerMonitor.getSystemIdleTime() <= 1 && now - lastMouseMove > 2000;
  if (typing !== activity.typing) { activity.typing = typing; send('activity', activity); }
}

// ---- 久坐 ----
let sitStart = null;
function checkSitting() {
  const now = Date.now();
  if (powerMonitor.getSystemIdleTime() >= BREAK_IDLE) { sitStart = null; return; }
  if (sitStart === null) sitStart = now;
  if (settings.features.sit && now - sitStart >= SIT_LIMIT) {
    sitStart = now;
    send('sit-reminder');
  }
}

function fitToScreen() {
  if (!win) return;
  win.setBounds(screen.getPrimaryDisplay().workArea);
}

function createWindow() {
  win = new BrowserWindow({
    ...screen.getPrimaryDisplay().workArea,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  // Clicks go through to the desktop, except while the mouse is on a pet (the page tells us).
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // The page can't see the mouse outside the window, so tell it where the cursor is.
  const cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 100);
  const typingTimer = setInterval(checkTyping, 1000);
  const sitTimer = setInterval(checkSitting, 10_000);
  win.on('closed', () => { clearInterval(cursorTimer); clearInterval(typingTimer); clearInterval(sitTimer); win = null; });
}

ipcMain.handle('load', () => loadAssets());
ipcMain.on('set-ignore', (_event, ignore) => win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }));
ipcMain.on('menu', () => {
  const menu = Menu.buildFromTemplate([
    ...SHOW_CHOICES.map(choice => ({
      label: choice.label,
      type: 'radio',
      checked: settings.show === choice.value,
      click: () => setShow(choice.value),
    })),
    { type: 'separator' },
    ...FEATURES.map(feature => ({
      label: feature.label,
      type: 'checkbox',
      checked: settings.features[feature.key],
      click: item => setFeature(feature.key, item.checked),
    })),
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  menu.popup({ window: win });
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    createWindow();
    updateActivityWatcher();
    screen.on('display-metrics-changed', fitToScreen);
    screen.on('display-added', fitToScreen);
    screen.on('display-removed', fitToScreen);
    powerMonitor.on('lock-screen', () => { sitStart = null; });
    powerMonitor.on('suspend', () => { sitStart = null; });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { if (stopWatcher) stopWatcher(); });
}
