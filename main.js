const { app, BrowserWindow, Menu, Notification, Tray, clipboard, globalShortcut, ipcMain, nativeImage, powerMonitor, screen, shell } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 改名前叫「千千梨梨桌宠」，设置一直存在那个文件夹里；改了名字也接着用它，设置不会丢
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), '千千梨梨桌宠'));
const { gifInfo } = require('./lib/gif');
const { watchForeground } = require('./lib/activity');
const { createTypingDetector } = require('./lib/typing');
const { parseComboFile } = require('./renderer/combos');
const Teases = require('./renderer/teases');
const { festivalOn, birthdaysOn, normalizeBirthday } = require('./lib/calendar');
const { weatherIdle, fetchWeather, WEATHER_IDLES } = require('./lib/weather');
const { REGIONS, DEFAULT_LOCATION, normalizeLocation, locationLabel } = require('./lib/regions');
const { pixelTrayImage } = require('./lib/pixel-icon');
const { autoUpdater } = require('electron-updater');
const { OnlineLink, cleanName, randomPairCode, DEFAULT_SERVER } = require('./lib/online');
const { checkRelay } = require('./lib/relay-check');

const ASSETS = path.join(__dirname, '桌宠素材');
// 五只宠物（名字就是「桌宠素材」里的文件夹名）
const PETS = ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '灰鸮g老师'];
const FEATURES = [
  { key: 'time', label: '时间提醒（该睡觉 / 该吃饭）' },
  { key: 'sit', label: '久坐提醒（60 分钟）' },
  { key: 'mouse', label: '鼠标互动（看鼠标 / 害羞）' },
  { key: 'activity', label: '看我在做什么（写代码 / 看视频 / 听歌）' },
  { key: 'typing', label: '打字反应（一直打字就陪你敲代码）' },
  { key: 'system', label: '电脑状态（CPU 很忙冒冷汗 / 电量低）' },
  { key: 'perch', label: '站在窗口顶上' },
  { key: 'makeup', label: '两个哥哥打完架过一阵会和好' },
  { key: 'chase', label: '追着玩（煤球猫猫突然冲过去）' },
  { key: 'snack', label: '送零食（千千猫猫和梨梨兔兔互相送）' },
  { key: 'weather', label: '天气（按天气换待机动画）' },
  { key: 'festival', label: '过节（国庆 / 万圣节 / 圣诞 / 春节）' },
  { key: 'birthday', label: '生日' },
  { key: 'visit', label: '串门（联网配对后，宠物会去对方家玩）' },
  { key: 'tease', label: '挑衅哥哥（千千猫猫→哥哥狗狗，梨梨兔兔→梨梨哥哥）' },
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
  location: null,                 // 选好的天气地点（区县或手动经纬度），只存在本机；null = 湖南省长沙市
  visitPets: Object.fromEntries(PETS.map(name => [name, true])), // 哪几只可以去串门
  birthdays: {},                  // 宠物名 → 「MM-DD」
  pomodoro: { focus: 25, rest: 5 }, // 番茄钟：专注几分钟、休息几分钟
  guideSeen: false,               // 新手引导看过 / 跳过了没有
};

// 改过名字的宠物：旧设置里的名字换成新名字
const OLD_PET_NAMES = { 绿眼猫猫: '煤球猫猫' };
function renameOldPets(saved) {
  for (const [oldName, newName] of Object.entries(OLD_PET_NAMES)) {
    for (const key of ['pets', 'visitPets', 'birthdays']) {
      const map = saved[key];
      if (map && typeof map === 'object' && oldName in map) {
        if (!(newName in map)) map[newName] = map[oldName];
        delete map[oldName];
      }
    }
    if (saved.trayIcon === oldName) saved.trayIcon = newName;
  }
}

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    renameOldPets(saved);
    if (saved.pets && typeof saved.pets === 'object') {
      for (const name of PETS) if (typeof saved.pets[name] === 'boolean') settings.pets[name] = saved.pets[name];
    } else if (saved.show === 'cat' || saved.show === 'bunny') {
      // 以前只能选一只的设置：只保留当时选的那只
      for (const name of PETS) settings.pets[name] = name === (saved.show === 'cat' ? '千千猫猫' : '梨梨兔兔');
    }
    if (TRAY_ICONS.includes(saved.trayIcon)) settings.trayIcon = saved.trayIcon;
    if (SIZES.includes(saved.size)) settings.size = saved.size;
    if (saved.visitPets && typeof saved.visitPets === 'object') for (const name of PETS) if (typeof saved.visitPets[name] === 'boolean') settings.visitPets[name] = saved.visitPets[name];
    settings.location = normalizeLocation(saved.location);
    settings.guideSeen = saved.guideSeen === true;
    if (saved.birthdays && typeof saved.birthdays === 'object') {
      for (const name of PETS) { const md = normalizeBirthday(saved.birthdays[name]); if (md) settings.birthdays[name] = md; }
    }
    for (const key of ['focus', 'rest']) {
      const n = Number(saved.pomodoro?.[key]);
      if (n >= 1 && n <= 180) settings.pomodoro[key] = Math.round(n);
    }
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
  return { focusInfo: focusInfo(), visitPets: settings.visitPets, today: computeToday(), weather: weather.idle, focus: pomodoro.mode === 'focus', screens: screensForPage(), show: settings.pets, size: settings.size, features: settings.features, activity, peerOnline: online.peerOnline, updateReady, pets, combos };
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
// 改名以后程序文件名变了：以前开了开机自动启动的，登记的还是旧文件，换成现在的
function fixAutoStartPath() {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;
  const { launchItems = [] } = app.getLoginItemSettings(autoStartOptions());
  const now = process.execPath.toLowerCase();
  if (launchItems.some(item => item.enabled && item.path && item.path.toLowerCase() !== now)) setAutoStart(true);
}
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
  if (key === 'weather') { if (on) runWeather(); else { weather = { data: null, error: '', idle: null }; setWeatherIdle(null); } }
  if (key === 'festival' || key === 'birthday') sendToday(true);
}

// ---- 天气（Open-Meteo，每 30 分钟查一次） ----
// 地点的经纬度只存在本机设置里，只用来查天气，不发给联网服务器，也不发给朋友
let weather = { data: null, error: '', idle: null };
function setWeatherIdle(idle) {
  if (weather.idle === idle) return;
  weather.idle = idle;
  send('weather', idle);
}
// 晴天白天 / 晚上要看钟点，所以每分钟用查到的天气再算一次
function updateWeatherIdle() {
  if (settings.features.weather) setWeatherIdle(weatherIdle(weather.data, new Date().getHours()));
}
async function runWeather() {
  if (!settings.features.weather || showcaseOn) return; // 功能展示时不查天气
  try {
    weather.data = await fetchWeather(settings.location || DEFAULT_LOCATION);
    weather.error = '';
  } catch (error) {
    weather.data = null;
    weather.error = '查不到天气';
  }
  updateWeatherIdle(); // 查不到就用普通待机
  refreshTray();
}
function placeName() {
  return locationLabel(settings.location);
}
function weatherLabel() {
  return `天气地点：${placeName()}…`;
}
// 托盘悬停提示：比如「岳麓区 · 阴 · 18°C · 代码 3」，方便看天气查得对不对
function weatherTip() {
  if (!settings.features.weather) return '天气：没打开';
  if (weather.error) return `${placeName()} · ${weather.error}`;
  if (!weather.data) return `${placeName()} · 正在查天气…`;
  const { description, temperature, code } = weather.data;
  const temp = temperature == null ? '' : ` · ${Math.round(temperature)}°C`;
  return `${placeName()} · ${description}${temp} · 代码 ${code}`;
}

let placeWindow = null;
function openPlaceWindow() {
  if (placeWindow) { placeWindow.show(); placeWindow.focus(); return; }
  placeWindow = new BrowserWindow({
    width: 420, height: 560, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, autoHideMenuBar: true, title: '天气地点', icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'place-preload.js'), contextIsolation: true, sandbox: true },
  });
  placeWindow.removeMenu();
  placeWindow.loadFile(path.join(__dirname, 'renderer', 'place.html'));
  placeWindow.on('closed', () => { placeWindow = null; });
}
ipcMain.handle('place-get', () => ({ regions: REGIONS, current: settings.location || DEFAULT_LOCATION, label: placeName() }));
ipcMain.handle('place-choose', (_event, place) => {
  const location = normalizeLocation(place);
  if (!location) return false;
  settings.location = location;
  saveSettings();
  weather.data = null;
  weather.error = '';
  refreshTray();
  runWeather();
  placeWindow?.close();
  return true;
});
ipcMain.on('place-cancel', () => placeWindow?.close());

// ---- 过节 / 生日（每分钟看一下日期变了没有） ----
let todayKey = '';
function computeToday() {
  const now = new Date();
  return {
    festival: settings.features.festival ? festivalOn(now) : null,
    birthdays: settings.features.birthday ? birthdaysOn(now, settings.birthdays) : [],
  };
}
function sendToday(force = false) {
  const today = computeToday();
  const key = JSON.stringify(today);
  if (!force && key === todayKey) return;
  todayKey = key;
  send('today', today);
}

// ---- 番茄钟 ----
let pomodoro = { mode: null, endsAt: 0 }; // mode: focus 专注 / rest 休息
const focusInfo = () => (pomodoro.mode === 'focus' ? { on: true, startedAt: pomodoro.startedAt, endsAt: pomodoro.endsAt } : { on: false });
function startFocus() {
  pomodoro = { mode: 'focus', startedAt: Date.now(), endsAt: Date.now() + settings.pomodoro.focus * 60_000 };
  send('focus', focusInfo());
  refreshTray();
}
function stopFocus() {
  pomodoro = { mode: null, endsAt: 0 };
  send('focus', false);
  refreshTray();
}
function checkPomodoro() {
  if (!pomodoro.mode) return;
  if (Date.now() < pomodoro.endsAt) return refreshTray(); // 更新菜单里的剩余时间
  if (pomodoro.mode === 'focus') {
    pomodoro = { mode: 'rest', endsAt: Date.now() + settings.pomodoro.rest * 60_000 };
    send('focus', false);
    send('focus-done');
  } else {
    pomodoro = { mode: null, endsAt: 0 };
    send('ask-continue');
    if (Notification.isSupported()) {
      showNote({ title: '休息好啦', body: '要继续专注吗？点这里再来一个番茄钟', icon: trayImage(settings.trayIcon) }, startFocus);
    }
  }
  refreshTray();
}
const minutesLeft = () => Math.max(1, Math.ceil((pomodoro.endsAt - Date.now()) / 60_000));
function pomodoroMenu() {
  if (pomodoro.mode === 'focus') return [{ label: `🍅 专注中，还剩 ${minutesLeft()} 分钟`, enabled: false }, { label: '结束专注', click: stopFocus }];
  if (pomodoro.mode === 'rest') return [{ label: `☕ 休息中，还剩 ${minutesLeft()} 分钟`, enabled: false }, { label: '现在就开始专注', click: startFocus }];
  return [{ label: `🍅 开始专注（${settings.pomodoro.focus} 分钟）`, click: startFocus }];
}
ipcMain.on('start-focus', () => startFocus());

// ---- 拍照：宠物们录成 3 秒的透明 GIF，存到「图片/桌宠照片」 ----
ipcMain.on('save-photo', async (_event, bytes) => {
  if (!bytes || !bytes.length) { send('say', '桌面上没有宠物可以拍哦'); return; }
  try {
    const dir = path.join(app.getPath('pictures'), '桌宠照片');
    fs.mkdirSync(dir, { recursive: true });
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const name = `桌宠-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.gif`;
    fs.writeFileSync(path.join(dir, name), Buffer.from(bytes));
    send('say', '拍好啦 📷');
    shell.openPath(dir);
  } catch (error) {
    send('say', '照片没存成功…');
  }
});

// ---- 小设置窗口：生日、番茄钟时间 ----
let moreWindow = null;
function openMoreSettings() {
  if (moreWindow) { moreWindow.show(); moreWindow.focus(); return; }
  moreWindow = new BrowserWindow({
    width: 380, height: 660, useContentSize: true, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, autoHideMenuBar: true, title: '小设置', icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'more-preload.js'), contextIsolation: true, sandbox: true },
  });
  moreWindow.removeMenu();
  moreWindow.loadFile(path.join(__dirname, 'renderer', 'more.html'));
  moreWindow.on('closed', () => { moreWindow = null; });
}
ipcMain.handle('more-get', () => ({ pets: PETS, birthdays: settings.birthdays, pomodoro: settings.pomodoro }));
ipcMain.handle('more-save', (_event, next) => {
  settings.birthdays = {};
  for (const name of PETS) { const md = normalizeBirthday(next?.birthdays?.[name]); if (md) settings.birthdays[name] = md; }
  for (const key of ['focus', 'rest']) {
    const n = Number(next?.pomodoro?.[key]);
    if (n >= 1 && n <= 180) settings.pomodoro[key] = Math.round(n);
  }
  saveSettings();
  sendToday(true);
  refreshTray();
  moreWindow?.close();
});
ipcMain.on('more-cancel', () => moreWindow?.close());

// ---- 功能展示：页面里按顺序演一遍所有功能 ----
// 演示时不改设置、不联网、不查天气、不弹提醒；按 Esc 或点托盘「停止展示」随时结束
let showcaseOn = false;
function startShowcase() {
  if (!win || showcaseOn) return;
  if (!win.isVisible()) { win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); }
  send('showcase', 'start');
}
function stopShowcase() { send('showcase', 'stop'); }
ipcMain.on('showcase-state', (_event, on) => {
  showcaseOn = !!on;
  // Esc 只在展示时占用一下，结束就还回去
  if (showcaseOn) { try { globalShortcut.register('Escape', stopShowcase); } catch {} }
  else if (globalShortcut.isRegistered('Escape')) globalShortcut.unregister('Escape');
  refreshTray();
});

// ---- 新手引导：第一次打开时自动出现，托盘里「新手引导」随时再看 ----
let guideWindow = null;
function openGuide() {
  if (guideWindow) { guideWindow.show(); guideWindow.focus(); return; }
  guideWindow = new BrowserWindow({
    width: 520, height: 640, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, autoHideMenuBar: true, title: '新手引导', icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'guide-preload.js'), contextIsolation: true, sandbox: true },
  });
  guideWindow.removeMenu();
  guideWindow.loadFile(path.join(__dirname, 'renderer', 'guide.html'));
  guideWindow.webContents.once('did-finish-load', () => send('greet')); // 宠物们一起打招呼
  // 看完、跳过或者直接关掉，都算看过了，下次不再自动弹出
  guideWindow.on('closed', () => { guideWindow = null; if (!settings.guideSeen) { settings.guideSeen = true; saveSettings(); } });
}
ipcMain.handle('guide-get', () => ({
  pets: PETS, shown: settings.pets, size: settings.size, sizes: SIZES,
  regions: REGIONS, location: settings.location || DEFAULT_LOCATION, place: placeName(),
  birthdays: settings.birthdays, pomodoro: settings.pomodoro,
  online: { enabled: settings.online.enabled, hasCode: settings.online.code.trim().length >= 4 },
}));
ipcMain.on('guide-show-pet', (_event, name, on) => { if (PETS.includes(name)) setPetShown(name, !!on); });
ipcMain.on('guide-size', (_event, size) => { if (SIZES.includes(size)) setSize(size); });
ipcMain.handle('guide-place', (_event, place) => {
  const location = normalizeLocation(place);
  if (!location) return null;
  settings.location = location;
  saveSettings();
  weather.data = null;
  weather.error = '';
  refreshTray();
  runWeather();
  return placeName();
});
ipcMain.handle('guide-birthdays', (_event, next) => {
  for (const name of PETS) {
    const text = String(next?.[name] ?? '').trim();
    const md = normalizeBirthday(text);
    if (md) settings.birthdays[name] = md;
    else if (!text) delete settings.birthdays[name];
    else return name; // 这只写得不对
  }
  saveSettings();
  sendToday(true);
  return '';
});
ipcMain.on('guide-open', (_event, what) => {
  if (what === 'online') openOnlineSettings();
  if (what === 'more') openMoreSettings();
  if (what === 'showcase') { guideWindow?.close(); startShowcase(); }
});
ipcMain.on('guide-done', () => { settings.guideSeen = true; saveSettings(); guideWindow?.close(); });

// ---- 退出：先让宠物们道晚安、慢慢消失，再真正退出 ----
let leaving = false;
function goodnightQuit() {
  if (leaving) return;
  leaving = true;
  if (!win || win.isDestroyed() || !win.isVisible()) return app.quit(); // 藏起来的时候直接退出
  send('goodnight');
  setTimeout(() => app.quit(), 7000); // 页面没回话也照样退出
}
ipcMain.on('goodnight-done', () => app.quit());

// ---- 「测试一下」：马上看到各种效果 ----
const sendTest = (type, value) => send('test', { type, value });

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
    if (!showcaseOn) send('sit-reminder');
  }
}

// ---- 联网 ----
const online = new OnlineLink();
let onlineWindow = null;
let lastPetSent = 0;

online.on('change', () => { send('presence', online.peerOnline); refreshTray(); });
online.on('remote', message => { if (!showcaseOn) send('remote', message); }); // 功能展示时先不理朋友戳戳

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
  if (showcaseOn) return;
  const now = Date.now();
  if (now - lastPetSent < 2000) return;
  if (online.send('pet', settings.online.name)) lastPetSent = now;
});

// ---- 串门：只转发「串门开始 / 串门结束」和宠物名、自己的名字 ----
let visitState = { away: [], visitors: [] };
ipcMain.on('visit-send', (_event, { type, pet } = {}) => {
  if (showcaseOn) return;
  if ((type === 'visit-start' || type === 'visit-end') && PETS.includes(pet)) online.send(type, settings.online.name, pet);
});
ipcMain.on('visit-state', (_event, next) => {
  visitState = { away: (next?.away || []).filter(n => PETS.includes(n)), visitors: (next?.visitors || []).filter(n => PETS.includes(n)) };
  refreshTray();
});

// 自己连两次服务器，互相发一条「串门开始」，看服务器转不转发（不用朋友也能检查）
async function runRelayCheck() {
  send('say', '正在检查服务器…');
  const result = await checkRelay(serverAddress(), () => new OnlineLink());
  send('say', {
    ok: '服务器是新版，可以串门啦 ✓',
    old: '服务器还是旧版，要在 server 文件夹里再运行一次 npm run deploy',
    offline: '连不上服务器，看看网络或者服务器地址',
  }[result]);
}

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
// 通知要一直留着引用，不然 Windows 上点通知时它可能已经被回收，点了没反应
const liveNotes = new Set();
function showNote(options, onClick) {
  if (showcaseOn) return; // 功能展示时不弹真正的提醒
  if (!Notification.isSupported()) return;
  const note = new Notification(options);
  liveNotes.add(note);
  note.on('click', () => { liveNotes.delete(note); onClick(); });
  note.on('close', () => liveNotes.delete(note));
  note.show();
}

function notifyUpdateReady() {
  showNote({
    title: '梨间雪桌宠有新版本啦',
    body: `${updateReady} 已经下载好了，点这里重启就能用 ♡`,
    icon: trayImage(settings.trayIcon),
  }, restartToUpdate);
}

ipcMain.on('restart-update', () => restartToUpdate());

// 不管从哪里点（托盘菜单、宠物头上的按钮、右下角通知），都走这一个：
// 先等点击这件事做完，再关掉所有窗口、去掉「窗口都关了就退出」，然后安静地装好并自动重新打开
let restarting = false;
function restartToUpdate() {
  if (!updateReady || restarting) return;
  restarting = true;
  send('say', '正在重启更新…');
  setTimeout(() => {
    try {
      app.removeAllListeners('window-all-closed');
      for (const w of BrowserWindow.getAllWindows()) w.destroy();
      tray?.destroy();
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      restarting = false;
      console.error('重启更新失败', error);
    }
  }, 300);
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
    // Windows 上当成「工具窗口」：Chrome、VS Code 这类程序会算自己有没有被别的窗口挡住，挡住了就先不画；
    // 桌宠窗口铺满整个屏幕，鼠标放在宠物上（窗口接住鼠标）时会被当成把它们全挡住了，
    // 它们就停住不动，要点一下才恢复。工具窗口不算在里面，就不会这样
    ...(process.platform === 'win32' ? { type: 'toolbar' } : {}),
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
// petName：右键的是哪只宠物（托盘菜单没有）。千千猫猫和梨梨兔兔会多一个「挑衅哥哥」
function buildMenu(petName = null) {
  const visitor = petName?.startsWith('visitor:') ? petName.slice(8) : null;
  return Menu.buildFromTemplate([
    ...(visitor ? [{ label: `🏠 送${visitor}回家`, click: () => send('send-home', visitor) }, { type: 'separator' }] : []),
    ...visitState.away.map(name => ({ label: `🏠 叫${name}回家（在对方家串门）`, click: () => send('call-home', name) })),
    ...(visitState.away.length ? [{ type: 'separator' }] : []),
    ...(Teases.PAIRS[petName] ? [{ label: `😈 挑衅哥哥（${Teases.PAIRS[petName].target}）`, click: () => send('tease', petName) }, { type: 'separator' }] : []),
    ...(updateReady ? [{ label: `🎉 立即重启更新（${updateReady}）`, click: restartToUpdate }, { type: 'separator' }] : []),
    showcaseOn ? { label: '⏹ 停止展示', click: stopShowcase } : { label: '✨ 功能展示', click: startShowcase },
    { label: '📖 新手引导', click: openGuide },
    { type: 'separator' },
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
    {
      label: '功能开关',
      submenu: FEATURES.flatMap(feature => [{
        label: feature.label,
        type: 'checkbox',
        checked: settings.features[feature.key],
        click: item => setFeature(feature.key, item.checked),
      }, ...(feature.key === 'perch' && settings.features.perch ? [{ label: `　　${PERCH_STATUS[perchStatus]}`, enabled: false }] : [])]),
    },
    { label: weatherLabel(), click: openPlaceWindow },
    { label: '宠物生日 / 番茄钟时间…', click: openMoreSettings },
    {
      label: '允许去串门的宠物',
      submenu: PETS.map(name => ({
        label: name,
        type: 'checkbox',
        checked: settings.visitPets[name],
        click: item => { settings.visitPets[name] = item.checked; saveSettings(); send('visit-pets', settings.visitPets); },
      })),
    },
    { type: 'separator' },
    ...pomodoroMenu(),
    { label: '📷 拍照（录 3 秒 GIF）', click: () => send('photo') },
    {
      label: '测试一下',
      submenu: [
        { label: '过节', submenu: ['国庆', '万圣节', '圣诞', '春节'].map(name => ({ label: name, click: () => sendTest('festival', name) })) },
        { label: '生日', submenu: PETS.map(name => ({ label: name, click: () => sendTest('birthday', name) })) },
        { label: '天气', submenu: [...WEATHER_IDLES.map(name => [name, name.replace('待机_', '')]), [null, '普通']].map(([idle, label]) => ({ label, click: () => send('weather', idle) })) },
        { label: '追着玩', click: () => sendTest('chase') },
        { label: '送零食', click: () => sendTest('snack') },
        { label: '两个哥哥贴贴（接着打架）', click: () => sendTest('brothers') },
        { label: '两个哥哥和好', click: () => sendTest('makeup') },
        { label: '哥哥狗狗：扶起摔倒的宠物', click: () => sendTest('dog-help') },
        { label: '哥哥狗狗：举牌测试通过', click: () => sendTest('dog-sign') },
        { label: '哥哥狗狗：给千千猫猫盖被子', click: () => sendTest('dog-blanket') },
        { label: '灰鸮g老师：看书（拖别的宠物过去一起看）', click: () => sendTest('g-read') },
        { label: '灰鸮g老师：看书打瞌睡', click: () => sendTest('g-doze') },
        { label: '灰鸮g老师：摔一跤', click: () => sendTest('g-fall') },
        { label: '灰鸮g老师：旁边的宠物接住眼镜', click: () => sendTest('g-catch') },
        { label: '灰鸮g老师：看书睡着被围观', click: () => sendTest('g-watch') },
        { label: '灰鸮g老师：批改作业（书里有书签就是书签版）', click: () => sendTest('g-grading') },
        { label: '串门：马上派一只去对方家', click: () => sendTest('visit') },
        { label: '串门：假装有客人来玩（不用朋友）', click: () => sendTest('fake-guest') },
        { label: '检查服务器能不能串门（不用朋友）', click: runRelayCheck },
        ...Object.keys(Teases.PAIRS).map(name => ({ label: `${name}挑衅${Teases.PAIRS[name].target}`, click: () => send('tease', name) })),
      ],
    },
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
    { label: '退出', click: goodnightQuit },
  ]);
}

ipcMain.on('menu', (_event, petName) => buildMenu(typeof petName === 'string' ? petName : null).popup({ window: win }));

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
    tray.setToolTip('梨间雪桌宠');
    tray.on('click', togglePets);   // 左键：显示 / 隐藏桌宠；右键：设置菜单
    refreshTray();
  } catch (error) {
    console.error('托盘图标创建失败', error);
  }
}

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(buildMenu());
  tray.setToolTip(`梨间雪桌宠\n${weatherTip()}`);
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
    runWeather();
    setInterval(runWeather, 30 * 60_000);
    setInterval(() => { sendToday(); checkPomodoro(); updateWeatherIdle(); }, 30_000);
    fixAutoStartPath();
    setupAutoUpdate();
    setTimeout(runUpdateCheck, 10_000);
    setInterval(runUpdateCheck, 3 * 60 * 60_000);
    // 第一次打开：等宠物出来以后弹出新手引导
    if (!settings.guideSeen) win.webContents.once('did-finish-load', () => setTimeout(openGuide, 1500));
    screen.on('display-metrics-changed', fitToScreen);
    screen.on('display-added', fitToScreen);
    screen.on('display-removed', fitToScreen);
    powerMonitor.on('lock-screen', () => { sitStart = null; });
    powerMonitor.on('suspend', () => { sitStart = null; });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (stopWatcher) stopWatcher(); online.stop(); });
}
