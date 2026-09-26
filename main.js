const { app, BrowserWindow, Menu, Notification, Tray, clipboard, ipcMain, nativeImage, powerMonitor, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gifInfo } = require('./lib/gif');
const { watchForeground } = require('./lib/activity');
const { createTypingDetector } = require('./lib/typing');
const { parseComboFile } = require('./renderer/combos');
const { pixelTrayImage } = require('./lib/pixel-icon');
const { autoUpdater } = require('electron-updater');
const { OnlineLink, cleanName, randomPairCode, DEFAULT_SERVER } = require('./lib/online');

const ASSETS = path.join(__dirname, '桌宠素材');
// 五只宠物（名字就是「桌宠素材」里的文件夹名）
const PETS = ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '绿眼猫猫'];
const FEATURES = [
  { key: 'time', label: '时间提醒（该睡觉 / 该吃饭）' },
  { key: 'sit', label: '久坐提醒（60 分钟）' },
  { key: 'mouse', label: '鼠标互动（看鼠标 / 害羞）' },
  { key: 'activity', label: '看我在做什么（写代码 / 看视频 / 听歌）' },
  { key: 'typing', label: '打字反应（一直打字就陪你敲代码）' },
  { key: 'system', label: '电脑状态（CPU 很忙冒冷汗 / 电量低）' },
  { key: 'perch', label: '站在窗口顶上' },
  { key: 'update', label: '自动更新' },
  { key: 'compat', label: '兼容模式（屏幕卡住时试试，重启桌宠后生效）', off: true },
];
// 托盘图标：「托盘图标」文件夹里和宠物同名的图标
const TRAY_ICONS = PETS;

const SIZES = [0.5, 0.75, 1, 1.5, 2];

const SIT_LIMIT = 60 * 60_000;   // 连续用电脑多久提醒
const BREAK_IDLE = 5 * 60;        // 离开电脑多少秒算休息过了

let win;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
const settings = {
  pets: Object.fromEntries(PETS.map(name => [name, true])), // 每只宠物显示不显示
  size: 1,
  trayIcon: '千千猫猫',
  features: Object.fromEntries(FEATURES.map(f => [f.key, !f.off])),
  online: { enabled: false, name: '千千', code: '', server: '' },
};

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (saved.pets && typeof saved.pets === 'object') {
      for (const name of PETS) if (typeof saved.pets[name] === 'boolean') settings.pets[name] = saved.pets[name];
    } else if (saved.show === 'cat' || saved.show === 'bunny') {
      // 以前只能选一只的设置：只保留当时选的那只
      for (const name of PETS) settings.pets[name] = name === (saved.show === 'cat' ? '千千猫猫' : '梨梨兔兔');
    }
    if (TRAY_ICONS.includes(saved.trayIcon)) settings.trayIcon = saved.trayIcon;
    if (SIZES.includes(saved.size)) settings.size = saved.size;
    if (saved.online && typeof saved.online === 'object') {
      settings.online.enabled = saved.online.enabled === true;
      for (const key of ['name', 'code', 'server']) if (typeof saved.online[key] === 'string') settings.online[key] = saved.online[key];
    }
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
  for (const name of PETS) {
    const dir = path.join(ASSETS, name);
    const anims = {};
    for (const file of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.gif')).sort()) {
      anims[path.basename(file, path.extname(file))] = readGif(path.join(dir, file));
    }
    pets[name] = { name, anims };
  }
  // 贴贴/：「组合名.gif」贴贴，「组合名_2.gif」叠叠乐，「组合名_打架.gif」贴贴完接着打架
  const combos = {};
  const comboDir = path.join(ASSETS, '贴贴');
  for (const file of fs.existsSync(comboDir) ? fs.readdirSync(comboDir).filter(f => f.toLowerCase().endsWith('.gif')) : []) {
    const { key, kind } = parseComboFile(path.basename(file, path.extname(file)));
    combos[key] = combos[key] || {};
    combos[key][kind] = readGif(path.join(comboDir, file));
  }
  return { screens: screensForPage(), show: settings.pets, size: settings.size, features: settings.features, activity, peerOnline: online.peerOnline, updateReady, pets, combos };
}

const send = (channel, value) => { if (win && !win.isDestroyed()) win.webContents.send(channel, value); };

function setPetShown(name, on) {
  settings.pets[name] = on;
  saveSettings();
  send('show', settings.pets);
  refreshTray();
}

function setSize(size) {
  settings.size = size;
  saveSettings();
  send('size', size);
  refreshTray();
}

function togglePets() {
  if (!win) return;
  if (win.isVisible()) win.hide();
  else { win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); send('resync'); }
}

// ---- 开机自动启动 ----
function autoStartOptions() {
  // 便携版 exe 运行时会先解压到临时文件夹，要登记的是原来那个 exe
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { path: process.env.PORTABLE_EXECUTABLE_FILE, args: [] };
  if (!app.isPackaged) return { path: process.execPath, args: [app.getAppPath()] };
  return { path: process.execPath, args: [] };
}
const autoStartOn = () => app.getLoginItemSettings(autoStartOptions()).openAtLogin;
function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...autoStartOptions() });
  refreshTray();
}

function setFeature(key, on) {
  settings.features[key] = on;
  saveSettings();
  send('features', settings.features);
  if (key === 'activity' || key === 'perch') updateWatcher();
  refreshTray();
  if (key === 'sit') sitStart = null;
  if (key === 'compat') send('say', on ? '兼容模式打开啦，退出再打开桌宠就生效' : '兼容模式关掉啦，退出再打开桌宠就生效');
  if (key === 'update' && on) runUpdateCheck();
  if (key === 'system') { hotCount = 0; coolCount = 0; setCpuHot(false); }
  if (key === 'typing' || key === 'activity') checkTyping();
}

// ---- 看前台窗口 ----
// 「看我在做什么」：只得出类别，不保存标题。「站在窗口顶上」：只要窗口的位置。两个都关就完全不看。
let stopWatcher = null;
let watcherMode = null;
let activity = { kind: null, typing: false };
let ledge = null;
// 「站在窗口顶上」现在的情况，显示在菜单里，方便看哪里不对
let perchStatus = 'waiting';
const PERCH_STATUS = {
  waiting: '窗口：正在找窗口…',
  ok: '窗口：找到了，宠物会跳上去',
  high: '窗口：太靠屏幕顶上了（最大化了？），站不上去',
  none: '窗口：现在没有能站的窗口',
  failed: '窗口：读不到窗口位置（可能被安全软件拦了）',
  unsupported: '窗口：只有 Windows 能用',
};
function setPerchStatus(status) {
  if (status === perchStatus) return;
  perchStatus = status;
  refreshTray();
}

function sendLedge(next) {
  if (JSON.stringify(next) === JSON.stringify(ledge)) return;
  ledge = next;
  send('perch', ledge);
}

function onForeground(info) {
  if (watcherMode === 'full' && info.kind !== activity.kind) { activity.kind = info.kind; send('activity', activity); }
  if (!settings.features.perch || !info.rect || !win) { setPerchStatus('none'); return sendLedge(null); }
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, info.rect) : info.rect;
  const b = win.getBounds();
  const petHeight = 250 * 0.7 * settings.size;
  setPerchStatus(dip.y - b.y >= petHeight ? 'ok' : 'high');
  sendLedge({ id: info.handle, x: Math.round(dip.x - b.x), y: Math.round(dip.y - b.y), w: Math.round(dip.width) });
}

function updateWatcher() {
  const mode = settings.features.activity ? 'full' : settings.features.perch ? 'rect' : null;
  if (mode === watcherMode) return;
  if (stopWatcher) stopWatcher();
  perchStatus = 'waiting';
  stopWatcher = mode ? watchForeground(onForeground, { full: mode === 'full', onFail: reason => setPerchStatus(reason === 'unsupported' ? 'unsupported' : 'failed') }) : null;
  watcherMode = mode;
  if (mode !== 'full' && activity.kind) { activity.kind = null; send('activity', activity); }
  if (!settings.features.perch) sendLedge(null);
}

// 打字：一直有输入、鼠标又没动 → 大概是在敲键盘（单独点一下鼠标不算）。不读取任何按键。
const detectTyping = createTypingDetector();
let lastCursor = null;
function checkTyping() {
  const p = screen.getCursorScreenPoint();
  const now = Date.now();
  const mouseMoved = !lastCursor || p.x !== lastCursor.x || p.y !== lastCursor.y;
  lastCursor = p;
  const watching = settings.features.activity || settings.features.typing;
  // 鼠标正放在宠物身上时（点它、准备拖它）不算打字
  const typing = detectTyping({ now, idleSeconds: powerMonitor.getSystemIdleTime(), mouseMoved: mouseMoved || mouseOnPet }) && watching;
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

// ---- 联网 ----
const online = new OnlineLink();
let onlineWindow = null;
let lastPetSent = 0;

online.on('change', () => { send('presence', online.peerOnline); refreshTray(); });
online.on('remote', message => send('remote', message));

const serverAddress = () => settings.online.server.trim() || DEFAULT_SERVER;

function startOnline() {
  const { code } = settings.online;
  const server = serverAddress();
  if (!settings.online.enabled || code.trim().length < 4 || !server) return online.stop();
  try { online.start(server, code); } catch (error) { console.error('联网失败', error.message); online.stop(); }
}

function setOnlineEnabled(on) {
  settings.online.enabled = on;
  saveSettings();
  startOnline();
  refreshTray();
}

function onlineStatusLabel() {
  if (online.status === 'off') return settings.online.code ? '联网：没有连接' : '联网：还没设置配对码';
  if (online.status === 'connecting') return '联网：正在连接…';
  return online.peerOnline ? '联网：对方也在线 ♡' : '联网：已连接，等对方上线';
}

function openOnlineSettings() {
  if (onlineWindow) { onlineWindow.show(); onlineWindow.focus(); return; }
  onlineWindow = new BrowserWindow({
    width: 380,
    height: 500,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    title: '联网设置',
    icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'online-preload.js'), contextIsolation: true, sandbox: true },
  });
  onlineWindow.removeMenu();
  onlineWindow.loadFile(path.join(__dirname, 'renderer', 'online.html'));
  onlineWindow.on('closed', () => { onlineWindow = null; });
}

ipcMain.handle('online-get', () => ({ ...settings.online, defaultServer: DEFAULT_SERVER }));
ipcMain.handle('online-random-code', () => randomPairCode());
ipcMain.on('copy-text', (_event, text) => clipboard.writeText(String(text).slice(0, 200)));
ipcMain.handle('online-save', (_event, next) => {
  settings.online = {
    enabled: true,
    name: cleanName(next?.name) || '千千',
    code: String(next?.code ?? '').trim().slice(0, 64),
    server: String(next?.server ?? '').trim().slice(0, 300),
  };
  saveSettings();
  startOnline();
  refreshTray();
  onlineWindow?.close();
});
ipcMain.on('online-cancel', () => onlineWindow?.close());

// 摸了自己的宠物 → 告诉对方（最多 2 秒一次）
ipcMain.on('pet-touched', () => {
  const now = Date.now();
  if (now - lastPetSent < 2000) return;
  if (online.send('pet', settings.online.name)) lastPetSent = now;
});

function pokePeer() {
  online.send('poke', settings.online.name);
}

// ---- 自动更新（electron-updater，从 GitHub Releases 下载） ----
// 启动时查一次，之后每 3 小时查一次；有新版本就在后台下载，下好后提醒重启。
let updateReady = null;      // 已经下载好的新版本号
let manualCheck = false;

function setupAutoUpdate() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;   // 就算不点重启，下次退出时也会装好
  autoUpdater.on('update-available', info => { if (manualCheck) send('say', `发现新版本 ${info.version}，正在悄悄下载…`); manualCheck = false; });
  autoUpdater.on('update-not-available', () => { if (manualCheck) send('say', '已经是最新版啦 ♡'); manualCheck = false; });
  autoUpdater.on('update-downloaded', info => {
    updateReady = info.version;
    refreshTray();
    send('update-ready', updateReady);   // 宠物头上出现「点我重启更新」的按钮
    notifyUpdateReady();
  });
  autoUpdater.on('error', () => { if (manualCheck) send('say', '检查更新失败了，等会儿再试试'); manualCheck = false; });
}

function runUpdateCheck(manual = false) {
  if (!manual && !settings.features.update) return;
  if (!app.isPackaged) { if (manual) send('say', '现在是开发模式，装好的版本才会自动更新'); return; }
  if (updateReady) { if (manual) send('say', '新版本已经下载好啦，重启就能用'); return; }
  manualCheck = manual;
  autoUpdater.checkForUpdates().catch(() => {});
}

// Windows 右下角弹一条通知，点一下就重启更新
function notifyUpdateReady() {
  if (!Notification.isSupported()) return;
  const note = new Notification({
    title: '千千梨梨桌宠有新版本啦',
    body: `${updateReady} 已经下载好了，点这里重启就能用 ♡`,
    icon: trayImage(settings.trayIcon),
  });
  note.on('click', restartToUpdate);
  note.show();
}

ipcMain.on('restart-update', () => { if (updateReady) restartToUpdate(); });

function restartToUpdate() {
  autoUpdater.quitAndInstall(true, true); // 安静地装好，然后自动重新打开
}

// ---- 多个显示器：一个透明窗口盖住所有屏幕，每块屏幕的底部都是地面 ----
function allScreensBounds() {
  const areas = screen.getAllDisplays().map(d => d.workArea);
  const x = Math.min(...areas.map(a => a.x)), y = Math.min(...areas.map(a => a.y));
  const right = Math.max(...areas.map(a => a.x + a.width)), bottom = Math.max(...areas.map(a => a.y + a.height));
  return { x, y, width: right - x, height: bottom - y };
}

function screensForPage() {
  const b = win ? win.getBounds() : allScreensBounds();
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map(d => ({
    x: d.workArea.x - b.x, y: d.workArea.y - b.y, w: d.workArea.width, h: d.workArea.height, primary: d.id === primary,
  }));
}

function fitToScreen() {
  if (!win) return;
  win.setBounds(allScreensBounds());
  send('screens', screensForPage());
}

function createWindow() {
  win = new BrowserWindow({
    ...allScreensBounds(),
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
  const typingTimer = setInterval(checkTyping, 300);
  const sitTimer = setInterval(checkSitting, 10_000);
  const cpuTimer = setInterval(checkCpu, 5_000);
  win.on('closed', () => { clearInterval(cursorTimer); clearInterval(typingTimer); clearInterval(sitTimer); clearInterval(cpuTimer); win = null; });
}

ipcMain.handle('load', () => loadAssets());
let mouseOnPet = false;
ipcMain.on('set-ignore', (_event, ignore) => { mouseOnPet = !ignore; win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }); });
function buildMenu() {
  return Menu.buildFromTemplate([
    ...(updateReady ? [{ label: `🎉 立即重启更新（${updateReady}）`, click: restartToUpdate }, { type: 'separator' }] : []),
    {
      label: '选择宠物',
      submenu: PETS.map(name => ({
        label: name,
        type: 'checkbox',
        checked: settings.pets[name],
        click: item => setPetShown(name, item.checked),
      })),
    },
    {
      label: '大小',
      submenu: SIZES.map(size => ({
        label: `${size * 100}%`,
        type: 'radio',
        checked: settings.size === size,
        click: () => setSize(size),
      })),
    },
    { type: 'separator' },
    ...FEATURES.flatMap(feature => [{
      label: feature.label,
      type: 'checkbox',
      checked: settings.features[feature.key],
      click: item => setFeature(feature.key, item.checked),
    }, ...(feature.key === 'perch' && settings.features.perch ? [{ label: `　　${PERCH_STATUS[perchStatus]}`, enabled: false }] : [])]),
    { type: 'separator' },
    { label: '戳一下对方', enabled: online.peerOnline, click: pokePeer },
    {
      label: '联网',
      submenu: [
        { label: onlineStatusLabel(), enabled: false },
        { type: 'separator' },
        { label: '联网设置（名字 / 配对码）…', click: openOnlineSettings },
        settings.online.enabled
          ? { label: '断开联网', click: () => setOnlineEnabled(false) }
          : { label: '连接', enabled: settings.online.code.trim().length >= 4 && !!serverAddress(), click: () => setOnlineEnabled(true) },
      ],
    },
    { type: 'separator' },
    {
      label: '托盘图标',
      submenu: TRAY_ICONS.map(name => ({
        label: name,
        type: 'radio',
        checked: settings.trayIcon === name,
        click: () => setTrayIcon(name),
      })),
    },
    { label: '桌宠卡住了？刷新一下', click: () => { win?.webContents.reload(); } },
    { label: '开机自动启动', type: 'checkbox', checked: autoStartOn(), click: item => setAutoStart(item.checked) },
    { label: `检查更新（现在是 ${app.getVersion()}）`, click: () => runUpdateCheck(true) },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
}

ipcMain.on('menu', () => buildMenu().popup({ window: win }));

// ---- 托盘 ----
let tray = null;

function trayImage(label) {
  const name = TRAY_ICONS.includes(label) ? label : TRAY_ICONS[0];
  // 用 256 像素的原图按「最近邻」缩小，托盘里的小图标才不会糊
  const png = path.join(ASSETS, '托盘图标', `${name}-256.png`);
  if (fs.existsSync(png)) return pixelTrayImage(nativeImage, png);
  const ico = path.join(ASSETS, '托盘图标', `${name}.ico`);
  if (fs.existsSync(ico)) return nativeImage.createFromPath(ico);
  return nativeImage.createEmpty();
}

function createTray() {
  try {
    tray = new Tray(trayImage(settings.trayIcon));
    tray.setToolTip('千千梨梨桌宠');
    tray.on('click', togglePets);   // 左键：显示 / 隐藏桌宠；右键：设置菜单
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
  app.setAppUserModelId('com.lumi729.deskpets'); // Windows 通知要用
  // 兼容模式：不用显卡画透明窗口。有的电脑上透明窗口会让屏幕卡住，关掉显卡加速通常就好了（会多用一点 CPU）
  try { if (JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).features?.compat === true) app.disableHardwareAcceleration(); } catch {}
  app.whenReady().then(() => {
    loadSettings();
    createWindow();
    updateWatcher();
    createTray();
    startOnline();
    setupAutoUpdate();
    setTimeout(runUpdateCheck, 10_000);
    setInterval(runUpdateCheck, 3 * 60 * 60_000);
    screen.on('display-metrics-changed', fitToScreen);
    screen.on('display-added', fitToScreen);
    screen.on('display-removed', fitToScreen);
    powerMonitor.on('lock-screen', () => { sitStart = null; });
    powerMonitor.on('suspend', () => { sitStart = null; });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { if (stopWatcher) stopWatcher(); online.stop(); });
}
