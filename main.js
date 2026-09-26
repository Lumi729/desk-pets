const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, powerMonitor, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
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
  { key: 'typing', label: '打字反应（一直打字就陪你敲代码）' },
  { key: 'system', label: '电脑状态（CPU 很忙冒冷汗 / 电量低）' },
  { key: 'perch', label: '站在窗口顶上' },
];
// 托盘图标：菜单里的名字 → 「托盘图标」文件夹里的文件名（按顺序找第一个有的）
const TRAY_ICONS = [
  { label: '千千猫猫', files: ['千千猫猫'] },
  { label: '梨梨兔兔', files: ['梨梨兔兔'] },
  { label: '哥哥狗狗', files: ['哥哥狗狗'] },
  { label: '梨梨哥哥', files: ['梨梨哥哥'] },
  { label: '绿眼猫猫', files: ['绿眼猫猫', '李炜'] },
];

const SIT_LIMIT = 60 * 60_000;   // 连续用电脑多久提醒
const BREAK_IDLE = 5 * 60;        // 离开电脑多少秒算休息过了

let win;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const settings = { show: 'both', trayIcon: '千千猫猫', features: Object.fromEntries(FEATURES.map(f => [f.key, true])) };

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (SHOW_CHOICES.some(c => c.value === saved.show)) settings.show = saved.show;
    if (TRAY_ICONS.some(i => i.label === saved.trayIcon)) settings.trayIcon = saved.trayIcon;
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
  refreshTray();
}

function setFeature(key, on) {
  settings.features[key] = on;
  saveSettings();
  send('features', settings.features);
  if (key === 'activity' || key === 'perch') updateWatcher();
  refreshTray();
  if (key === 'sit') sitStart = null;
  if (key === 'system') { hotCount = 0; coolCount = 0; setCpuHot(false); }
  if (key === 'typing' || key === 'activity') checkTyping();
}

// ---- 看前台窗口 ----
// 「看我在做什么」：只得出类别，不保存标题。「站在窗口顶上」：只要窗口的位置。两个都关就完全不看。
let stopWatcher = null;
let watcherMode = null;
let activity = { kind: null, typing: false };
let ledge = null;

function sendLedge(next) {
  if (JSON.stringify(next) === JSON.stringify(ledge)) return;
  ledge = next;
  send('perch', ledge);
}

function onForeground(info) {
  if (watcherMode === 'full' && info.kind !== activity.kind) { activity.kind = info.kind; send('activity', activity); }
  if (!settings.features.perch || !info.rect || !win) return sendLedge(null);
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, info.rect) : info.rect;
  const b = win.getBounds();
  sendLedge({ id: info.handle, x: Math.round(dip.x - b.x), y: Math.round(dip.y - b.y), w: Math.round(dip.width) });
}

function updateWatcher() {
  const mode = settings.features.activity ? 'full' : settings.features.perch ? 'rect' : null;
  if (mode === watcherMode) return;
  if (stopWatcher) stopWatcher();
  stopWatcher = mode ? watchForeground(onForeground, { full: mode === 'full' }) : null;
  watcherMode = mode;
  if (mode !== 'full' && activity.kind) { activity.kind = null; send('activity', activity); }
  if (!settings.features.perch) sendLedge(null);
}

// 打字：刚有输入，但鼠标没动 → 大概是在敲键盘。不读取任何按键。
let lastCursor = null;
let lastMouseMove = 0;
function checkTyping() {
  const p = screen.getCursorScreenPoint();
  const now = Date.now();
  if (!lastCursor || p.x !== lastCursor.x || p.y !== lastCursor.y) lastMouseMove = now;
  lastCursor = p;
  const watching = settings.features.activity || settings.features.typing;
  const typing = watching && powerMonitor.getSystemIdleTime() <= 1 && now - lastMouseMove > 2000;
  if (typing !== activity.typing) { activity.typing = typing; send('activity', activity); }
}

// ---- CPU 占用：连续 15 秒超过 85% 算很忙，连续 10 秒低于 70% 算缓过来了 ----
let prevCpu = cpuTimes();
let cpuHot = false;
let hotCount = 0;
let coolCount = 0;
function cpuTimes() {
  let idle = 0, total = 0;
  for (const cpu of os.cpus()) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return { idle, total };
}
function setCpuHot(hot) {
  if (hot === cpuHot) return;
  cpuHot = hot;
  send('cpu-hot', hot);
}
function checkCpu() {
  const now = cpuTimes();
  const total = now.total - prevCpu.total;
  const usage = total > 0 ? 1 - (now.idle - prevCpu.idle) / total : 0;
  prevCpu = now;
  if (!settings.features.system) return;
  hotCount = usage > 0.85 ? hotCount + 1 : 0;
  coolCount = usage < 0.7 ? coolCount + 1 : 0;
  if (hotCount >= 3) setCpuHot(true);
  if (coolCount >= 2) setCpuHot(false);
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
  const cpuTimer = setInterval(checkCpu, 5_000);
  win.on('closed', () => { clearInterval(cursorTimer); clearInterval(typingTimer); clearInterval(sitTimer); clearInterval(cpuTimer); win = null; });
}

ipcMain.handle('load', () => loadAssets());
ipcMain.on('set-ignore', (_event, ignore) => win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }));
function buildMenu() {
  return Menu.buildFromTemplate([
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
    {
      label: '托盘图标',
      submenu: TRAY_ICONS.map(icon => ({
        label: icon.label,
        type: 'radio',
        checked: settings.trayIcon === icon.label,
        click: () => setTrayIcon(icon.label),
      })),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

ipcMain.on('menu', () => buildMenu().popup({ window: win }));

// ---- 托盘 ----
let tray = null;

function trayImage(label) {
  const icon = TRAY_ICONS.find(i => i.label === label) || TRAY_ICONS[0];
  const ext = process.platform === 'win32' ? '.ico' : '-32.png';
  for (const name of icon.files) {
    const file = path.join(ASSETS, '托盘图标', name + ext);
    if (fs.existsSync(file)) return nativeImage.createFromPath(file);
  }
  return nativeImage.createEmpty();
}

function createTray() {
  try {
    tray = new Tray(trayImage(settings.trayIcon));
    tray.setToolTip('千千梨梨桌宠');
    tray.on('click', () => tray.popUpContextMenu());
    refreshTray();
  } catch (error) {
    console.error('托盘图标创建失败', error);
  }
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildMenu());
}

function setTrayIcon(label) {
  settings.trayIcon = label;
  saveSettings();
  if (tray) tray.setImage(trayImage(label));
  refreshTray();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    createWindow();
    updateWatcher();
    createTray();
    screen.on('display-metrics-changed', fitToScreen);
    screen.on('display-added', fitToScreen);
    screen.on('display-removed', fitToScreen);
    powerMonitor.on('lock-screen', () => { sitStart = null; });
    powerMonitor.on('suspend', () => { sitStart = null; });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { if (stopWatcher) stopWatcher(); });
}
