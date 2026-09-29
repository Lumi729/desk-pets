const { app, BrowserWindow, Menu, Notification, Tray, clipboard, dialog, globalShortcut, ipcMain, nativeImage, powerMonitor, screen, shell } = require('electron');
const fs = require('node:fs');
const IS_MAC = process.platform === 'darwin';
let macDisplays = null;
const { spawn } = require('node:child_process');
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
const { createErrorLog } = require('./lib/errorlog');
const Diary = require('./lib/diary');
const http = require('node:http');
const ClaudeHooks = require('./lib/claude-hooks');
const { createClaudeActivity } = require('./lib/claude-activity');
const CodexHooks = require('./lib/codex-hooks');
const { createCodexLink } = require('./lib/codex-link');
const { pixelTrayImage } = require('./lib/pixel-icon');
const { autoUpdater } = require('electron-updater');
const { OnlineLink, cleanName, randomPairCode, DEFAULT_SERVER } = require('./lib/online');
const { checkRelay } = require('./lib/relay-check');

const ASSETS = path.join(__dirname, '桌宠素材');
// 五只宠物（名字就是「桌宠素材」里的文件夹名）
const PETS = ['千千猫猫', '梨梨兔兔', '哥哥狗狗', '梨梨哥哥', '煤球猫猫', '99狐狐', '灰鸮g老师'];
// 后来才加的宠物：已经在用的人更新后先不显示（自己去「选择宠物」里勾），新装的照常显示
const NEW_PETS = ['99狐狐'];
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
  { key: 'bugfix', label: '狗狗修 bug（出错时记进本机的错误日志）' },
  { key: 'diary', label: '今日小日记（只在本机数次数）' },
  { key: 'episodes', label: '小插曲写进日记（接眼镜、盖被子、串门……）' },
  { key: 'anniversary', label: '在一起的纪念日' },
  { key: 'swap', label: '两个眼镜交换（哥哥狗狗和g老师）' },
  { key: 'yawn', label: '打哈欠会传染' },
  { key: 'fullscreen', label: '有程序全屏时自动躲起来' },
  { key: 'season', label: '四季换装' },
  { key: 'copyface', label: '右键宠物「复制这个表情」' },
  { key: 'nest', label: '小窝（晚上 11 点后回窝睡觉）' },
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
  codexLink: false,               // 联动 Codex（灰鸮g老师）
  codexPet: '灰鸮g老师',           // 谁陪 Codex 干活
  claudeLink: false,              // 联动 Claude Code
  claudePet: '哥哥狗狗',           // 谁陪 Claude Code 干活
  nest: null,                     // 小窝放在哪：{ si: 第几块屏幕, offset: 离屏幕左边多远 }
  diaryTime: '22:00',             // 每天几点写日记
  diaryWriter: '哥哥狗狗',         // 谁来写日记
  nickname: '千千',                // 宠物们怎么称呼你（联网时也用这个名字）
  firstDay: '',                   // 第一次打开的日子（算在一起多少天）
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

// 改称呼 / 写日记的宠物（小设置和新手引导都用）
function setProfile({ nickname, diaryWriter } = {}) {
  const name = cleanName(nickname);
  if (name && name !== settings.nickname) {
    settings.nickname = name;
    settings.online.name = name; // 联网时对方看到的名字
    send('nickname', name);
  }
  if (PETS.includes(diaryWriter)) settings.diaryWriter = diaryWriter;
}
const validTime = text => /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(text || ''));

let settingsLoaded = false;
function loadSettings() {
  settingsLoaded = true;
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (Number.isInteger(saved.newErrors) && saved.newErrors > 0) settings.newErrors = saved.newErrors;
    renameOldPets(saved);
    if (saved.pets && typeof saved.pets === 'object') {
      for (const name of PETS) if (typeof saved.pets[name] === 'boolean') settings.pets[name] = saved.pets[name];
        else if (NEW_PETS.includes(name)) settings.pets[name] = false;
    } else if (saved.show === 'cat' || saved.show === 'bunny') {
      // 以前只能选一只的设置：只保留当时选的那只
      for (const name of PETS) settings.pets[name] = name === (saved.show === 'cat' ? '千千猫猫' : '梨梨兔兔');
    }
    if (TRAY_ICONS.includes(saved.trayIcon)) settings.trayIcon = saved.trayIcon;
    if (SIZES.includes(saved.size)) settings.size = saved.size;
    if (saved.visitPets && typeof saved.visitPets === 'object') for (const name of PETS) if (typeof saved.visitPets[name] === 'boolean') settings.visitPets[name] = saved.visitPets[name];
    settings.location = normalizeLocation(saved.location);
    settings.guideSeen = saved.guideSeen === true;
    settings.claudeLink = saved.claudeLink === true;
    if (PETS.includes(saved.claudePet)) settings.claudePet = saved.claudePet;
    settings.codexLink = saved.codexLink === true;
    if (PETS.includes(saved.codexPet)) settings.codexPet = saved.codexPet;
    if (Number.isFinite(saved.nest?.offset)) settings.nest = { si: Number.isInteger(saved.nest.si) ? saved.nest.si : 0, offset: saved.nest.offset };
    if (validTime(saved.diaryTime)) settings.diaryTime = saved.diaryTime;
    if (PETS.includes(saved.diaryWriter)) settings.diaryWriter = saved.diaryWriter;
    settings.nickname = cleanName(saved.nickname) || cleanName(saved.online?.name) || '千千'; // 以前只有联网名字，就用它
    if (/^\d{4}-\d\d-\d\d$/.test(saved.firstDay || '')) settings.firstDay = saved.firstDay;
    else {
      // 以前的版本没记：用设置文件是哪天建的
      try {
        const born = fs.statSync(settingsFile()).birthtime;
        if (born.getFullYear() >= 2025 && born <= new Date()) settings.firstDay = Diary.dayKey(born);
      } catch {}
    }
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

const comboFiles = {}; // 组合名 → 种类 → 文件（复制表情用）
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
    comboFiles[key] = { ...comboFiles[key], [kind]: path.join(comboDir, file) };
  }
  return { codexPet: settings.codexPet, claudePet: settings.claudePet, claudeWorking: claudeActivity.working, codexWorking: codexLink.activity.working, nest: settings.nest, nickname: settings.nickname, focusInfo: focusInfo(), visitPets: settings.visitPets, today: computeToday(), weather: weather.idle, focus: pomodoro.mode === 'focus', screens: screensForPage(), show: settings.pets, size: settings.size, features: settings.features, activity, peerOnline: online.peerOnline, updateReady, pets, combos };
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
  if (hiddenForFullscreen) { hiddenForFullscreen = false; send('fullscreen', false); } // 自己点了显示 / 隐藏，就不再管全屏的事
  if (win.isVisible()) win.hide();
  else { win.showInactive(); win.setAlwaysOnTop(true, 'screen-saver'); send('resync'); }
}

// ---- 开机自动启动 ----
function autoStartOptions() {
  if (IS_MAC) return {};
  // 便携版 exe 运行时会先解压到临时文件夹，要登记的是原来那个 exe
  if (process.env.PORTABLE_EXECUTABLE_FILE) return { path: process.env.PORTABLE_EXECUTABLE_FILE, args: [] };
  if (!app.isPackaged) return { path: process.execPath, args: [app.getAppPath()] };
  return { path: process.execPath, args: [] };
}
const autoStartOn = () => app.getLoginItemSettings(autoStartOptions()).openAtLogin;
// 改名以后程序文件名变了：以前开了开机自动启动的，登记的还是旧文件，换成现在的
function fixAutoStartPath() {
  if (IS_MAC || !app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) return;
  const { launchItems = [] } = app.getLoginItemSettings(autoStartOptions());
  const now = process.execPath.toLowerCase();
  if (launchItems.some(item => item.enabled && item.path && item.path.toLowerCase() !== now)) setAutoStart(true);
}
function setAutoStart(on) {
  app.setLoginItemSettings({ openAtLogin: on, ...autoStartOptions() });
  refreshTray();
}

function setFeature(key, on) {
  if (IS_MAC && key === "update") return;
  settings.features[key] = on;
  saveSettings();
  send('features', settings.features);
  if (key === 'activity' || key === 'perch' || key === 'fullscreen') updateWatcher();
  if (key === 'fullscreen' && !on) setFullscreenHide(false);
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
    diaryRecord('weather', weather.data.description);
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
  const days = togetherDays();
  return {
    festival: settings.features.festival ? festivalOn(now) : null,
    birthdays: settings.features.birthday ? birthdaysOn(now, settings.birthdays) : [],
    together: settings.features.anniversary ? { days, anniversary: Diary.isAnniversary(days) } : null,
  };
}
const togetherDays = () => Diary.daysTogether(settings.firstDay || Diary.dayKey());
function sendToday(force = false) {
  const today = computeToday();
  const key = JSON.stringify(today);
  if (!force && key === todayKey) return;
  todayKey = key;
  send('today', today);
  if (today.festival) diaryRecord('festival', today.festival);
  refreshTray();
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
    diaryRecord('pomodoros');
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
    width: 380, height: Math.min(920, screen.getPrimaryDisplay().workAreaSize.height - 60), useContentSize: true, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, autoHideMenuBar: true, title: '小设置', icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'more-preload.js'), contextIsolation: true, sandbox: true },
  });
  moreWindow.removeMenu();
  moreWindow.loadFile(path.join(__dirname, 'renderer', 'more.html'));
  moreWindow.on('closed', () => { moreWindow = null; });
}
ipcMain.handle('more-get', () => ({ pets: PETS, birthdays: settings.birthdays, pomodoro: settings.pomodoro, diaryTime: settings.diaryTime, nickname: settings.nickname, diaryWriter: settings.diaryWriter }));
ipcMain.handle('more-save', (_event, next) => {
  settings.birthdays = {};
  for (const name of PETS) { const md = normalizeBirthday(next?.birthdays?.[name]); if (md) settings.birthdays[name] = md; }
  for (const key of ['focus', 'rest']) {
    const n = Number(next?.pomodoro?.[key]);
    if (n >= 1 && n <= 180) settings.pomodoro[key] = Math.round(n);
  }
  if (validTime(next?.diaryTime)) settings.diaryTime = next.diaryTime;
  setProfile(next);
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
  pets: PETS, shown: settings.pets, size: settings.size, sizes: SIZES, nickname: settings.nickname, diaryWriter: settings.diaryWriter,
  regions: REGIONS, location: settings.location || DEFAULT_LOCATION, place: placeName(),
  birthdays: settings.birthdays, pomodoro: settings.pomodoro,
  online: { enabled: settings.online.enabled, hasCode: settings.online.code.trim().length >= 4 },
}));
ipcMain.on('guide-show-pet', (_event, name, on) => { if (PETS.includes(name)) setPetShown(name, !!on); });
ipcMain.handle('guide-profile', (_event, next) => { setProfile(next); saveSettings(); return { nickname: settings.nickname, diaryWriter: settings.diaryWriter }; });
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

// ---- 狗狗修 bug：出错时记进本机的错误日志（只有错误信息、时间、版本号），哥哥狗狗在的话会去修 ----
let errorLog = null;
const errorLogFile = () => path.join(app.getPath('userData'), '错误日志.txt');
function reportError(where, error) {
  if (!settings.features.bugfix) return;
  try {
    if (!errorLog) errorLog = createErrorLog(errorLogFile(), app.getVersion());
    if (errorLog.write(where, error)) {
      settings.newErrors = (settings.newErrors || 0) + 1; // 还没看过的错误有几条
      if (settingsLoaded) saveSettings(); // 设置还没读进来时别存，免得把设置冲掉
      send('bugfix', settings.newErrors);
      refreshTray();
    }
  } catch {}
}
// 看过日志了 → 不再提醒
function errorsSeen() {
  if (!settings.newErrors) return;
  settings.newErrors = 0;
  saveSettings();
  refreshTray();
}
process.on('uncaughtException', error => reportError('主程序', error));
process.on('unhandledRejection', error => reportError('主程序', error));
const logError = console.error.bind(console);
console.error = (...args) => {
  logError(...args);
  reportError('主程序', args.find(a => a instanceof Error) || args.map(String).join(' '));
};
ipcMain.on('renderer-error', (_event, info) => reportError('桌宠页面', { message: String(info?.message || '未知错误'), stack: String(info?.stack || '') }));
function openErrorLog() {
  const file = errorLogFile();
  if (!fs.existsSync(file)) fs.writeFileSync(file, '还没有错误，一切正常 ♡\n');
  shell.openPath(file);
  errorsSeen();
}
function copyLatestError() {
  if (!errorLog) errorLog = createErrorLog(errorLogFile(), app.getVersion());
  const text = errorLog.latest();
  errorsSeen();
  if (text && !text.startsWith('还没有错误')) { clipboard.writeText(text); send('say', '最近的错误复制好啦，发给哥哥吧'); }
  else send('say', '还没有错误，一切正常 ♡');
}

// ---- 今日小日记：只在本机数次数（摸摸、点击、番茄钟、贴贴、叠叠乐、天气、节日），不记具体内容 ----
const diaryFile = () => path.join(app.getPath('userData'), '日记.json');
let diaryDays = null;
let diarySaveTimer = null;
function diaryData() {
  if (!diaryDays) {
    try { diaryDays = JSON.parse(fs.readFileSync(diaryFile(), 'utf8')).days || {}; } catch { diaryDays = {}; }
  }
  return diaryDays;
}
function saveDiary(now = false) {
  clearTimeout(diarySaveTimer);
  const write = () => { try { diaryDays = Diary.prune(diaryData(), Diary.dayKey()); fs.writeFileSync(diaryFile(), JSON.stringify({ days: diaryDays }, null, 1)); } catch {} };
  if (now) write(); else diarySaveTimer = setTimeout(write, 5000);
}
function diaryRecord(event, value) {
  if (!settings.features.diary || showcaseOn) return;
  Diary.record(diaryData(), Diary.dayKey(), event, value);
  saveDiary();
}
ipcMain.on('nest-save', (_event, pos) => {
  if (!Number.isFinite(pos?.offset)) return;
  settings.nest = { si: Number.isInteger(pos.si) ? pos.si : 0, offset: Math.round(pos.offset) };
  saveSettings();
});
ipcMain.on('diary-event', (_event, type) => {
  if (['pets', 'clicks', 'hugs', 'stacks'].includes(type)) diaryRecord(type);
  else if (typeof type === 'string' && type.startsWith('ep:') && settings.features.episodes) diaryRecord('episode', type.slice(3)); // 小插曲
});
const diaryName = () => settings.nickname;
function diaryText(key) {
  const day = diaryData()[key];
  if (key === Diary.dayKey() && !day?.written) return composeFor(day, settings.diaryWriter); // 还没写：按现在的次数先看看
  return day?.text || composeFor(day, day?.writer || settings.diaryWriter);
}
function composeFor(day, writer, absent = '') {
  return Diary.composeDiary(day, diaryName(), writer, absent, settings.features.episodes);
}
// 每天到点（默认晚上 10 点）哥哥狗狗写日记，写好弹出日记卡片
function checkDiary() {
  if (!settings.features.diary || showcaseOn) return;
  const now = new Date();
  const [h, m] = settings.diaryTime.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return;
  const key = Diary.dayKey(now);
  const day = diaryData()[key] || (diaryData()[key] = Diary.emptyDay());
  if (day.written) return;
  day.written = true;
  day.text = composeFor(day, settings.diaryWriter);
  day.writer = settings.diaryWriter;
  saveDiary(true);
  writeDiaryNow(key);
}
// 叫选好的宠物写日记；它没显示就让屏幕上的另一只代写（页面告诉我们是谁写的）
let diaryReply = null;
function writeDiaryNow(key, save = true) {
  send('diary-write', settings.diaryWriter);
  const done = writer => {
    diaryReply = null;
    if (save && writer && writer !== settings.diaryWriter) {
      const day = diaryData()[key];
      if (day) { day.text = composeFor(day, writer, settings.diaryWriter); day.writer = writer; saveDiary(true); }
    }
    setTimeout(() => openDiary(key), 3500);
  };
  const timer = setTimeout(() => done(null), 1500);
  diaryReply = writer => { clearTimeout(timer); done(writer); };
}
ipcMain.on('diary-writer', (_event, writer) => diaryReply?.(PETS.includes(writer) ? writer : null));
let diaryWindow = null;
let diaryShowKey = '';
let diaryFavOnly = false;
function openDiary(key = Diary.dayKey(), favOnly = false) {
  diaryShowKey = key;
  diaryFavOnly = favOnly;
  if (diaryWindow) { diaryWindow.webContents.send('diary-show', key); diaryWindow.show(); diaryWindow.focus(); return; }
  diaryWindow = new BrowserWindow({
    width: 420, height: 580, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, autoHideMenuBar: true, title: '今天的日记', icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'diary-preload.js'), contextIsolation: true, sandbox: true },
  });
  diaryWindow.removeMenu();
  diaryWindow.loadFile(path.join(__dirname, 'renderer', 'diary.html'));
  diaryWindow.on('closed', () => { diaryWindow = null; });
}
ipcMain.handle('diary-get', () => {
  const today = Diary.dayKey();
  const keys = Object.keys(Diary.prune(diaryData(), today));
  if (!keys.includes(today)) keys.push(today);
  keys.sort().reverse();
  const days = diaryData();
  const entries = keys.map(key => ({ key, text: diaryText(key), fav: !!days[key]?.fav, writer: days[key]?.writer || settings.diaryWriter }))
    .filter(e => !diaryFavOnly || e.fav);
  return { show: diaryShowKey || today, today, favOnly: diaryFavOnly, entries };
});
// 收藏：这一天一直留着，不受 30 天限制
ipcMain.handle('diary-fav', (_event, key, on) => {
  if (!/^\d{4}-\d\d-\d\d$/.test(String(key))) return false;
  const days = diaryData();
  const day = days[key] || (days[key] = Diary.emptyDay());
  day.fav = !!on;
  saveDiary(true);
  return day.fav;
});
// 存成图片：把日记卡片（连同写日记的宠物）截下来，存到「图片/桌宠照片」
ipcMain.handle('diary-image', async (_event, key, rect) => {
  if (!diaryWindow || !/^\d{4}-\d\d-\d\d$/.test(String(key))) return false;
  try {
    const r = { x: Math.max(0, Math.floor(rect.x)), y: Math.max(0, Math.floor(rect.y)), width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
    const image = await diaryWindow.webContents.capturePage(r);
    const dir = path.join(app.getPath('pictures'), '桌宠照片');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `日记-${key}.png`);
    fs.writeFileSync(file, image.toPNG());
    shell.showItemInFolder(file);
    return true;
  } catch { return false; }
});

// ---- 复制表情：把宠物正在播的 GIF 当成文件放进剪贴板，粘贴到 QQ、微信里是会动的 ----
function expressionFile(expression) {
  if (expression?.combo) return comboFiles[expression.combo]?.[expression.kind] || null;
  const { pet, anim } = expression || {};
  if (!PETS.includes(pet) || typeof anim !== 'string' || !anim || /[\\/:]|\.\./.test(anim)) return null;
  const file = path.join(ASSETS, pet, `${anim}.gif`);
  return fs.existsSync(file) ? file : null;
}
function copyExpression(expression) {
  const source = expressionFile(expression);
  const who = expression?.pet || expression?.members?.[0] || null;
  if (!source) return send('say-pet', { name: who, text: '这个表情复制不了…' });
  try {
    // 程序里的素材打包在一起，先复制一份真的文件出来
    const dir = path.join(app.getPath('temp'), '桌宠表情');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${expression.pet || expression.combo}-${expression.anim || expression.kind}.gif`);
    fs.writeFileSync(dest, fs.readFileSync(source));
    if (process.platform === 'win32') {
      clipboard.writeBuffer('FileNameW', Buffer.from(`${dest}\0`, 'ucs2'));
      // 再用 PowerShell 放成「复制了一个文件」，QQ、微信都认
      const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -LiteralPath '${dest.replace(/'/g, "''")}'`], { windowsHide: true, stdio: 'ignore' });
      ps.on('error', () => {});
    } else if (IS_MAC) {
      // Mac：用系统自带的 osascript 把 GIF 当成「复制了一个文件」，微信、QQ 里直接粘贴；不行就在 Finder 里显示让你拖
      const script = `set the clipboard to (POSIX file "${dest.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`;
      const osa = spawn('/usr/bin/osascript', ['-e', script], { stdio: 'ignore' });
      let done = false;
      const finish = ok => {
        if (done) return;
        done = true;
        if (!ok) shell.showItemInFolder(dest);
        send('say-pet', { name: who, text: ok ? '已复制，去斗图吧～' : '已在 Finder 打开表情，拖进聊天就可以啦～' });
      };
      osa.on('error', () => finish(false));
      osa.on('exit', code => finish(code === 0));
      return;
    } else {
      shell.showItemInFolder(dest);
    }
    send('say-pet', { name: who, text: '已复制，去斗图吧～' });
  } catch {
    send('say-pet', { name: who, text: '这个表情复制不了…' });
  }
}

// ---- 联动 Claude Code：这台电脑上的 Claude Code 干活时，哥哥狗狗跟着做动作 ----
// Claude Code 的 hooks 用 curl.exe 把事件发到 127.0.0.1（只有本机能连），这里收下，不联网、不往外发任何东西。
// 只对这台电脑上运行的 Claude Code 有效，云端会话不会触发。
const claudeActivity = createClaudeActivity(change => {
  if (change.type === 'working') send('claude-work', change.working);
  else if (change.type === 'done') send('claude-done', { short: change.short, stillWorking: change.stillWorking });
  else if (change.type === 'notify') send('claude-notify');
  else if (change.type === 'fail') send('claude-fail');
});
let claudeServer = null;
const claudeRecent = [];
let claudeSweep = null;
function startClaudeServer() {
  if (claudeServer) return;
  claudeServer = http.createServer((req, res) => {
    const match = /^\/desk-pets-claude\/(\w+)$/.exec(req.url || '');
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; if (body.length > 256 * 1024) req.destroy(); });
    req.on('end', () => {
      res.writeHead(204); // 什么都不回（UserPromptSubmit 的 hook 输出会进 Claude 的上下文）
      res.end();
      if (req.method !== 'POST' || !match || !settings.claudeLink) return;
      let sessionId = '';
      try { sessionId = JSON.parse(body).session_id || ''; } catch {}
      claudeActivity.event(match[1], sessionId);
      claudeRecent.unshift({ at: new Date(), event: match[1] }); // 菜单里看最近收到了什么（只有事件名和时间）
      claudeRecent.length = Math.min(claudeRecent.length, 5);
      refreshTray();
    });
    req.on('error', () => {});
  });
  claudeServer.on('error', error => { console.error('Claude Code 联动的端口打不开', error.message); claudeServer = null; });
  claudeServer.listen(ClaudeHooks.PORT, '127.0.0.1');
  claudeSweep = setInterval(() => claudeActivity.sweep(), 30_000);
}
function stopClaudeServer() {
  claudeServer?.close();
  claudeServer = null;
  clearInterval(claudeSweep);
  claudeActivity.clear();
}
const claudeSettingsFile = () => path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json');
// 改 Claude Code 的 settings.json：先备份，只加 / 只删我们自己的 hooks
function editClaudeSettings(change) {
  const file = claudeSettingsFile();
  let current = {};
  if (fs.existsSync(file)) {
    const text = fs.readFileSync(file, 'utf8');
    if (text.trim()) current = JSON.parse(text); // 读不懂就不动它（下面会报错）
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(file, `${file}.desk-pets-backup-${stamp}`);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(change(current), null, 2)}\n`);
}
// 换一只陪 Claude Code 干活（原来那只正在敲代码的会停下来）
function setClaudePet(name) {
  if (!PETS.includes(name)) return;
  settings.claudePet = name;
  saveSettings();
  send('claude-pet', name);
  refreshTray();
}

function setClaudeLink(on) {
  try {
    editClaudeSettings(on ? ClaudeHooks.addHooks : ClaudeHooks.removeHooks);
  } catch (error) {
    send('say', on ? 'Claude Code 的设置文件打不开，没联动上…' : 'Claude Code 的设置文件打不开，没取消成…');
    refreshTray();
    return;
  }
  settings.claudeLink = on;
  saveSettings();
  if (on) startClaudeServer(); else { stopClaudeServer(); send('claude-work', false); }
  send('say-pet', { name: '哥哥狗狗', text: on ? '联动好啦，Claude Code 干活时我陪着敲～（新开的会话才生效）' : '不联动 Claude Code 啦' });
  refreshTray();
}

// ---- 联动 Codex：灰鸮跟着本机的工作状态敲键盘 ----
const codexRecent = [];
const codexLink = createCodexLink({
  onChange(change) {
    if (change.type === 'working') send('codex-work', change.working);
    else if (change.type === 'done') send('codex-done', { short: change.short });
    else if (change.type === 'waiting') send('codex-waiting', { stillWorking: change.stillWorking });
    refreshTray();
  },
  onEvent(info) { codexRecent.unshift(info); codexRecent.length = Math.min(codexRecent.length, 5); refreshTray(); },
});
const codexSettingsFile = () => path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'hooks.json');
// 只修改我们的命令，先验证再备份，写到临时文件后替换；不写入任何信任或审批设置。
function editCodexSettings(change) {
  const file = codexSettingsFile();
  const original = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const current = original.trim() ? JSON.parse(original.replace(/^﻿/, '')) : {};
  const next = change(current);
  if (JSON.stringify(current) === JSON.stringify(next)) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.desk-pets-backup-' + new Date().toISOString().replace(/[:.]/g, '-'));
  const temp = file + '.desk-pets-' + process.pid + '.tmp';
  try { fs.writeFileSync(temp, JSON.stringify(next, null, 2) + '\n'); fs.renameSync(temp, file); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function setCodexPet(name) {
  if (!PETS.includes(name)) return;
  settings.codexPet = name;
  saveSettings();
  send('codex-pet', name);
  refreshTray();
}
async function codexHelp() {
  const result = await dialog.showMessageBox({
    type: 'info', title: '让宠物跟着 g老师开工',
    message: '打开联动后，还要在 Codex 里审核并信任「灰鸮桌宠联动」hooks。',
    detail: '命令只把开工、等待、收工等状态送给这台电脑上的桌宠，不发送聊天内容。\n\n可在 Codex 命令行输入 /hooks，找到「灰鸮桌宠联动」并审核启用；之后在 Codex 新开本地聊天。看到菜单「最近收到的」有记录，就接上了。\n\n若当前 Codex 版本没有 hooks 管理入口，请先更新到支持 hooks 的版本。普通 ChatGPT 网页和云端任务不会触发。',
    buttons: ['知道啦', '查看官方说明'], defaultId: 0,
  });
  if (result.response === 1) shell.openExternal('https://learn.chatgpt.com/docs/hooks');
}
let changingCodexLink = false;
async function setCodexLink(on, startup = false) {
  if (changingCodexLink) return;
  changingCodexLink = true;
  try {
    let hooksUpdated = false;
    if (on) await codexLink.start(); // 端口真的打开才算开启，失败时不改 hooks
    editCodexSettings(current => {
      if (!on) return CodexHooks.removeHooks(current);
      if (CodexHooks.hasHooks(current)) return current;
      hooksUpdated = true;
      return CodexHooks.addHooks(current);
    });
    if (!on) await codexLink.stop();
    settings.codexLink = on;
    saveSettings();
    if (!startup) {
      send('say-pet', { name: settings.codexPet, text: on ? '准备好啦，去 Codex 审核启用联动后，我就陪着敲～' : '不联动 Codex 啦' });
    }
    // 更新过命令后旧的信任不再适用，启动升级时也要告诉用户去审核。
    if (on && (!startup || hooksUpdated)) void codexHelp();
  } catch (error) {
    if (on) { await codexLink.stop(); settings.codexLink = false; saveSettings(); }
    const message = error.code === 'EADDRINUSE' ? '联动端口被占用了，关闭另一份桌宠后再试哦。' : 'Codex 的联动设置没有保存成功，请检查 hooks.json 后再试。';
    void dialog.showMessageBox({ type: 'warning', title: 'Codex 联动没接上', message });
  } finally { changingCodexLink = false; refreshTray(); }
}

// ---- 控制面板：双击托盘图标打开，里面就是右键菜单的内容，点了窗口不会关 ----
let panelWindow = null;
let panelHandlers = new Map();
// 把菜单变成页面能用的样子：每个能点的项目给一个编号，点的时候照菜单原来的办法做
function panelTree() {
  panelHandlers = new Map();
  let next = 0;
  const walk = items => items.filter(Boolean).map(item => {
    if (item.type === 'separator') return { type: 'separator' };
    const node = { label: String(item.label ?? ''), type: item.type || 'normal', checked: !!item.checked, enabled: item.enabled !== false };
    if (Array.isArray(item.submenu)) node.submenu = walk(item.submenu);
    else if (typeof item.click === 'function') {
      node.id = ++next;
      panelHandlers.set(node.id, item);
    }
    return node;
  });
  return walk(menuTemplate());
}
function sendPanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.webContents.send('panel-tree', panelTree());
}
function openPanel() {
  if (panelWindow) { panelWindow.show(); panelWindow.focus(); return; }
  panelWindow = new BrowserWindow({
    width: 480, height: Math.min(760, screen.getPrimaryDisplay().workAreaSize.height - 60), minWidth: 380, minHeight: 360,
    autoHideMenuBar: true, title: '梨间雪桌宠 · 控制面板', icon: trayImage(settings.trayIcon),
    webPreferences: { preload: path.join(__dirname, 'renderer', 'panel-preload.js'), contextIsolation: true, sandbox: true },
  });
  panelWindow.removeMenu();
  panelWindow.loadFile(path.join(__dirname, 'renderer', 'panel.html'));
  panelWindow.on('closed', () => { panelWindow = null; panelHandlers = new Map(); });
}
ipcMain.handle('panel-get', () => panelTree());
ipcMain.on('panel-click', (_event, id) => {
  const item = panelHandlers.get(Number(id));
  if (!item || item.enabled === false) return;
  // 勾选项：跟菜单一样，先变成相反的状态再交给原来的功能；单选项：选上
  const checked = item.type === 'checkbox' ? !item.checked : item.type === 'radio' ? true : item.checked;
  try { item.click({ checked }); } catch (error) { console.error('控制面板点了出错', error); }
  setTimeout(sendPanel, 150); // 状态变了，刷新一下
});

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
  unsupported: '窗口：当前系统暂不支持',
  permission: '窗口：请先允许辅助功能权限',
  missing: '窗口：缺少 Mac 窗口组件，请重新安装',
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

// ---- 有程序全屏（看视频、玩游戏、放 PPT）时躲起来 ----
let hiddenForFullscreen = false;
function isFullscreenRect(rect) {
  if (!rect) return false;
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, rect) : rect;
  const b = screen.getDisplayMatching(dip).bounds;
  return dip.x <= b.x + 1 && dip.y <= b.y + 1 && dip.x + dip.width >= b.x + b.width - 1 && dip.y + dip.height >= b.y + b.height - 1;
}
function setFullscreenHide(full, force = false) {
  if (!win || win.isDestroyed()) return;
  if (full && (settings.features.fullscreen || force) && !hiddenForFullscreen && win.isVisible()) {
    hiddenForFullscreen = true;
    send('fullscreen', true); // 页面里的动画和计时先停住
    win.hide();
  } else if (!full && hiddenForFullscreen) {
    hiddenForFullscreen = false;
    win.showInactive();
    win.setAlwaysOnTop(true, 'screen-saver');
    send('fullscreen', false);
    send('resync');
  }
}

function onForeground(info) {
  setFullscreenHide(info.fullscreen === true || isFullscreenRect(info.rect));
  if (watcherMode === 'full' && info.kind !== activity.kind) { activity.kind = info.kind; send('activity', activity); }
  if (!settings.features.perch || !info.rect || !win) { setPerchStatus('none'); return sendLedge(null); }
  const dip = process.platform === 'win32' ? screen.screenToDipRect(null, info.rect) : info.rect;
  const b = IS_MAC ? allScreensBounds() : win.getBounds();
  const petHeight = 250 * 0.7 * settings.size;
  setPerchStatus(dip.y - b.y >= petHeight ? 'ok' : 'high');
  sendLedge({ id: info.handle, x: Math.round(dip.x - b.x), y: Math.round(dip.y - b.y), w: Math.round(dip.width) });
}

function updateWatcher() {
  const mode = settings.features.activity ? 'full' : settings.features.perch || settings.features.fullscreen ? 'rect' : null;
  if (mode === watcherMode) return;
  if (stopWatcher) stopWatcher();
  perchStatus = 'waiting';
  stopWatcher = mode ? watchForeground(onForeground, { full: mode === 'full', onFail: reason => setPerchStatus(['unsupported', 'permission', 'missing'].includes(reason) ? reason : 'failed') }) : null;
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
    if (!showcaseOn && !hiddenForFullscreen) send('sit-reminder');
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

ipcMain.handle('online-get', () => ({ ...settings.online, name: settings.nickname, defaultServer: DEFAULT_SERVER }));
ipcMain.handle('online-random-code', () => randomPairCode());
ipcMain.on('copy-text', (_event, text) => clipboard.writeText(String(text).slice(0, 200)));
ipcMain.handle('online-save', (_event, next) => {
  settings.online = {
    enabled: true,
    name: settings.nickname,
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
  if (online.send('pet', settings.nickname)) lastPetSent = now;
});

// ---- 串门：只转发「串门开始 / 串门结束」和宠物名、自己的名字 ----
let visitState = { away: [], visitors: [] };
ipcMain.on('visit-send', (_event, { type, pet } = {}) => {
  if (showcaseOn) return;
  if ((type === 'visit-start' || type === 'visit-end') && PETS.includes(pet)) online.send(type, settings.nickname, pet);
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
  online.send('poke', settings.nickname);
}

// ---- 自动更新（electron-updater，从 GitHub Releases 下载） ----
// 启动时查一次，之后每 3 小时查一次；有新版本就在后台下载，下好后提醒重启。
let updateReady = null;      // 已经下载好的新版本号
let manualCheck = false;

// 网断了、换了网络、连接被重置这种下载失败不算桌宠的错：不记进错误日志，下次检查会自己再下
const isNetworkError = args => /net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|socket hang up|Cannot download differentially/i
  .test(args.map(a => (a instanceof Error ? `${a.message}\n${a.stack || ''}` : String(a))).join(' '));
const updaterLogger = {
  info() {}, warn() {}, debug() {},
  error: (...args) => { if (!isNetworkError(args)) console.error(...args); },
};

function setupAutoUpdate() {
  if (IS_MAC) return; // 未公证的 Mac 测试版使用手动下载安装。
  autoUpdater.logger = updaterLogger;
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
  if (IS_MAC) {
    if (manual) void shell.openExternal("https://github.com/Lumi729/desk-pets/releases/latest");
    return;
  }
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
      tray = null;
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      restarting = false;
      console.error('重启更新失败', error);
    }
  }, 300);
}

// ---- 多个显示器：一个透明窗口盖住所有屏幕，每块屏幕的底部都是地面 ----
function petDisplays() {
  return screen.getAllDisplays();
}
function allScreensBounds() {
  const areas = petDisplays().map(d => d.workArea);
  const x = Math.min(...areas.map(a => a.x)), y = Math.min(...areas.map(a => a.y));
  const right = Math.max(...areas.map(a => a.x + a.width)), bottom = Math.max(...areas.map(a => a.y + a.height));
  return { x, y, width: right - x, height: bottom - y };
}

function screensForPage() {
  const b = IS_MAC || !win ? allScreensBounds() : win.getBounds();
  const primary = screen.getPrimaryDisplay().id;
  return petDisplays().map(d => ({
    x: d.workArea.x - b.x, y: d.workArea.y - b.y, w: d.workArea.width, h: d.workArea.height, primary: d.id === primary,
  }));
}

function fitToScreen() {
  if (!win) return;
  win.setBounds(IS_MAC ? screen.getPrimaryDisplay().workArea : allScreensBounds());
  macDisplays?.reconcile();
  send('screens', screensForPage());
}

function createWindow() {
  win = new BrowserWindow({
    ...(IS_MAC ? screen.getPrimaryDisplay().workArea : allScreensBounds()),
    ...(IS_MAC ? { opacity: 0 } : {}),
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
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  // Clicks go through to the desktop, except while the mouse is on a pet (the page tells us).
  win.setIgnoreMouseEvents(true, { forward: true });
  if (IS_MAC) macDisplays = require('./lib/mac-displays').createMacDisplays({ BrowserWindow, ipcMain, screen, host: win, bounds: allScreensBounds, root: __dirname });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // The page can't see the mouse outside the window, so tell it where the cursor is.
  const cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = IS_MAC ? allScreensBounds() : win.getBounds();
    macDisplays?.setIgnore(!mouseOnPet);
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 100);
  const typingTimer = setInterval(checkTyping, 300);
  const sitTimer = setInterval(checkSitting, 10_000);
  const cpuTimer = setInterval(checkCpu, 5_000);
  // 页面每秒报一次「还在动」；超过 3 秒没报（窗口没藏起来）→ 让窗口整个重画一次，把它叫醒
  lastAlive = Date.now();
  const aliveTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible() || Date.now() - lastAlive < 3000) return;
    lastAlive = Date.now();
    win.webContents.invalidate();
    win.setAlwaysOnTop(true, 'screen-saver');
    send('resync');
  }, 1000);
  win.on('closed', () => { clearInterval(cursorTimer); clearInterval(typingTimer); clearInterval(sitTimer); clearInterval(cpuTimer); clearInterval(aliveTimer); macDisplays?.destroy(); macDisplays = null; win = null; });
}

ipcMain.handle('load', () => loadAssets());
let mouseOnPet = false;
let lastAlive = 0;
ipcMain.on('alive', () => { lastAlive = Date.now(); });
ipcMain.on('set-ignore', (_event, ignore) => { mouseOnPet = !ignore; if (macDisplays) macDisplays.setIgnore(Boolean(ignore)); else win?.setIgnoreMouseEvents(Boolean(ignore), { forward: true }); });
// petName：右键的是哪只宠物（托盘菜单没有）。千千猫猫和梨梨兔兔会多一个「挑衅哥哥」
function buildMenu(petName = null, expression = null) {
  return Menu.buildFromTemplate(menuTemplate(petName, expression));
}
// 右键菜单的内容（控制面板也用这一份，所以两边的功能永远一样）
function menuTemplate(petName = null, expression = null) {
  const visitor = petName?.startsWith('visitor:') ? petName.slice(8) : null;
  return [
    ...(expression && settings.features.copyface ? [{ label: '📋 复制这个表情', click: () => copyExpression(expression) }, { type: 'separator' }] : []),
    ...(visitor ? [{ label: `🏠 送${visitor}回家`, click: () => send('send-home', visitor) }, { type: 'separator' }] : []),
    ...visitState.away.map(name => ({ label: `🏠 叫${name}回家（在对方家串门）`, click: () => send('call-home', name) })),
    ...(visitState.away.length ? [{ type: 'separator' }] : []),
    ...(Teases.PAIRS[petName] ? [{ label: `😈 挑衅哥哥（${Teases.PAIRS[petName].target}）`, click: () => send('tease', petName) }, { type: 'separator' }] : []),
    ...(updateReady ? [{ label: `🎉 立即重启更新（${updateReady}）`, click: restartToUpdate }, { type: 'separator' }] : []),
    { label: '🎛 控制面板（双击托盘图标也能打开）', click: openPanel },
    showcaseOn ? { label: '⏹ 停止展示', click: stopShowcase } : { label: '✨ 功能展示', click: startShowcase },
    { label: '📖 新手引导', click: openGuide },
    { label: '📔 今天的日记', click: () => openDiary() },
    { label: '🔖 收藏的日记', click: () => openDiary(null, true) },
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
        label: IS_MAC && feature.key === "update" ? "自动更新（Mac 测试版请手动下载）" : feature.label,
        enabled: !(IS_MAC && feature.key === "update"),
        type: 'checkbox',
        checked: settings.features[feature.key],
        click: item => setFeature(feature.key, item.checked),
      }, ...(feature.key === 'perch' && settings.features.perch ? [{ label: `　　${PERCH_STATUS[perchStatus]}`, enabled: false }] : [])]),
    },
    { label: weatherLabel(), click: openPlaceWindow },
    { label: '宠物生日 / 番茄钟 / 日记时间…', click: openMoreSettings },
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
        { label: '把宠物分到不同屏幕', click: () => sendTest('screens') },
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
        { label: `${settings.codexPet}：联动 Codex`, submenu: [['working', '开工敲键盘'], ['waiting', '等你回应'], ['done', '收工啦']].map(([value, label]) => ({ label, click: () => sendTest('codex', value) })) },
        { label: '灰鸮g老师：看书（拖别的宠物过去一起看）', click: () => sendTest('g-read') },
        { label: '灰鸮g老师：看书打瞌睡', click: () => sendTest('g-doze') },
        { label: '灰鸮g老师：摔一跤', click: () => sendTest('g-fall') },
        { label: '灰鸮g老师：旁边的宠物接住眼镜', click: () => sendTest('g-catch') },
        { label: '两个眼镜交换', click: () => sendTest('swap') },
        { label: '打哈欠传染', click: () => sendTest('yawn') },
        { label: '晚上打哈欠，传完一起回小窝', click: () => sendTest('yawn', 'night') },
        { label: '大家回小窝睡觉', click: () => sendTest('nest-night') },
        { label: '早上从小窝起床（两副眼镜会拿错）', click: () => sendTest('nest-morning') },
        { label: '全屏时躲起来（3 秒后出来）', click: () => { setFullscreenHide(true, true); setTimeout(() => setFullscreenHide(false), 3000); } },
        { label: '四季换装', submenu: [['待机_春', '春'], ['待机_夏', '夏'], ['待机_秋', '秋'], ['待机_冬', '冬']].map(([anim, label]) => ({ label, click: () => sendTest('season', anim) })) },
        { label: '哥哥狗狗修 bug（不会真的记错误）', click: () => sendTest('bugfix') },
        { label: '写日记（选好的宠物来写）', click: () => writeDiaryNow(Diary.dayKey(), false) },
        { label: '纪念日', click: () => sendTest('anniversary', togetherDays()) },
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
      label: '联动 Codex（g老师）',
      submenu: [
        { label: `让${settings.codexPet}跟着 g老师开工`, type: 'checkbox', checked: settings.codexLink, enabled: !changingCodexLink, click: item => setCodexLink(item.checked) },
        {
          label: `谁陪着干活：${settings.codexPet}`,
          submenu: PETS.map(name => ({ label: name, type: 'radio', checked: settings.codexPet === name, click: () => setCodexPet(name) })),
        },
        { label: '选好的那只需要在「选择宠物」里放出来', enabled: false },
        { label: '第一次怎么接上？', click: codexHelp },
        { label: '仅本机 Codex；需要审核启用 hooks', enabled: false },
        ...(settings.codexLink ? [
          { type: 'separator' },
          { label: codexLink.activity.working ? '现在：g老师在干活' : codexRecent.length ? '现在：歇一歇，或等你回应' : '准备好了，等待 Codex 发来第一个状态', enabled: false },
          { label: `${settings.codexPet}卡住了？让它停下来`, click: () => { codexLink.activity.clear(); send('codex-work', false); refreshTray(); } },
          { label: '最近收到的：', enabled: false },
          ...(codexRecent.length ? codexRecent.map(r => ({ label: '　' + r.at.toTimeString().slice(0, 8) + '  ' + r.event, enabled: false })) : [{ label: '　（还没有，请先在 Codex 审核启用 hooks）', enabled: false }]),
        ] : []),
      ],
    },
    {
      label: '联动 Claude Code',
      submenu: [
        { label: '联动 Claude Code', type: 'checkbox', checked: settings.claudeLink, click: item => setClaudeLink(item.checked) },
        { label: '只对这台电脑上运行的 Claude Code 有效，云端会话不会触发', enabled: false },
        { label: '不联网，不往外发任何数据', enabled: false },
        { label: `Claude Code 干活时${settings.claudePet}陪着敲代码，干完${settings.claudePet === '哥哥狗狗' ? '举牌' : '蹦蹦'}，等你回复时打招呼`, enabled: false },
        {
          label: `谁陪着干活：${settings.claudePet}`,
          submenu: PETS.map(name => ({ label: name, type: 'radio', checked: settings.claudePet === name, click: () => setClaudePet(name) })),
        },
        ...(settings.claudeLink ? [
          { type: 'separator' },
          { label: claudeActivity.working ? '现在：Claude Code 在干活' : '现在：没在干活', enabled: false },
          { label: `${settings.claudePet}卡住了？让它停下来`, click: () => { claudeActivity.clear(); send('claude-work', false); refreshTray(); } },
          { label: '最近收到的：', enabled: false },
          ...(claudeRecent.length ? claudeRecent.map(r => ({ label: `　${r.at.toTimeString().slice(0, 8)}  ${r.event}`, enabled: false })) : [{ label: '　（还没有）', enabled: false }]),
        ] : []),
      ],
    },
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
    ...(IS_MAC ? [{ label: `Mac 窗口互动：${PERCH_STATUS[perchStatus]}`, submenu: [
      { label: '允许窗口互动（辅助功能权限）', click: () => { require('./lib/mac-activity').requestPermission(); void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'); } },
      { label: '重新检查窗口', click: () => { if (stopWatcher) stopWatcher(); watcherMode = null; updateWatcher(); } },
      { label: '权限由你决定；只读取窗口位置，活动分类开启时才读取标题', enabled: false },
    ] }] : []),
    { label: '打开控制面板', click: openPanel },
    { label: '显示 / 隐藏桌宠', click: togglePets },
    { label: '桌宠卡住了？刷新一下', click: () => { win?.webContents.reload(); } },
    { label: settings.newErrors ? `打开错误日志（有 ${settings.newErrors} 条新的）` : '打开错误日志', click: openErrorLog },
    { label: '复制最近的错误', click: copyLatestError },
    { label: '开机自动启动', type: 'checkbox', checked: autoStartOn(), click: item => setAutoStart(item.checked) },
    { label: `${IS_MAC ? "打开新版下载页" : "检查更新"}（现在是 ${app.getVersion()}）`, click: () => runUpdateCheck(true) },
    { type: 'separator' },
    { label: '退出', click: goodnightQuit },
  ];
}

ipcMain.on('menu', (_event, petName, expression) => buildMenu(typeof petName === 'string' ? petName : null, expression && typeof expression === 'object' ? expression : null).popup({ window: macDisplays?.cursorWindow() || win }));

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
    // 左键：显示 / 隐藏桌宠（等一小会儿，看是不是双击）；双击：打开控制面板；右键：设置菜单
    let clickTimer = null;
    if (!IS_MAC) tray.on('click', () => { clearTimeout(clickTimer); clickTimer = setTimeout(togglePets, 320); });
    tray.on('double-click', () => { clearTimeout(clickTimer); openPanel(); });
    refreshTray();
  } catch (error) {
    console.error('托盘图标创建失败', error);
  }
}

function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildMenu());
  sendPanel();
  tray.setToolTip(`梨间雪桌宠\n${weatherTip()}${settings.features.anniversary ? `\n在一起第 ${togetherDays()} 天` : ''}`);
}

function setTrayIcon(label) {
  settings.trayIcon = label;
  saveSettings();
  if (tray && !tray.isDestroyed()) tray.setImage(trayImage(label));
  refreshTray();
}

// 别让 Chrome 以为桌宠窗口被挡住了就停下来不画（全屏透明窗口常被误判，宠物会卡住、点一下才动）
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (process.platform === 'win32') app.setAppUserModelId('com.lumi729.deskpets'); // Windows 通知要用
  // 兼容模式：不用显卡画透明窗口。有的电脑上透明窗口会让屏幕卡住，关掉显卡加速通常就好了（会多用一点 CPU）
  try { if (JSON.parse(fs.readFileSync(settingsFile(), 'utf8')).features?.compat === true) app.disableHardwareAcceleration(); } catch {}
  app.whenReady().then(() => {
    loadSettings();
    if (IS_MAC) {
      settings.features.update = false;
      app.dock?.hide();
    }
    if (!settings.firstDay) { settings.firstDay = Diary.dayKey(); saveSettings(); } // 第一次打开的日子
    createWindow();
    updateWatcher();
    createTray();
    startOnline();
    if (settings.claudeLink) {
      startClaudeServer();
      // 老版本加的 hooks 少了新的事件：补上（只加我们的）
      try {
        const file = claudeSettingsFile();
        const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8') || '{}') : {};
        if (!ClaudeHooks.hasHooks(current)) editClaudeSettings(ClaudeHooks.addHooks);
      } catch {}
    }
    if (settings.codexLink) void setCodexLink(true, true);
    runWeather();
    setInterval(runWeather, 30 * 60_000);
    setInterval(() => { sendToday(); checkPomodoro(); updateWeatherIdle(); checkDiary(); }, 30_000);
    setTimeout(checkDiary, 8000);
    fixAutoStartPath();
    setupAutoUpdate();
    setTimeout(runUpdateCheck, 10_000);
    setInterval(runUpdateCheck, 3 * 60 * 60_000);
    // 第一次打开：等宠物出来以后弹出新手引导
    if (!settings.guideSeen) win.webContents.once('did-finish-load', () => setTimeout(openGuide, 1500));
    // 上次（比如退出时）记了错误还没看 → 打开后冒个气泡提醒
    win.webContents.once('did-finish-load', () => setTimeout(() => { if (settings.newErrors && settings.features.bugfix) send('bugfix-remind', settings.newErrors); }, 6000));
    screen.on('display-metrics-changed', fitToScreen);
    screen.on('display-added', fitToScreen);
    screen.on('display-removed', fitToScreen);
    powerMonitor.on('lock-screen', () => { sitStart = null; });
    powerMonitor.on('suspend', () => { sitStart = null; });
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => { void codexLink.stop(); stopClaudeServer(); if (diaryDays) saveDiary(true); globalShortcut.unregisterAll(); if (stopWatcher) stopWatcher(); online.stop(); });
}
