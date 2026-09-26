const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { gifInfo } = require('./lib/gif');

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

let win;
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { show: 'both' };

function loadSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    if (SHOW_CHOICES.some(c => c.value === saved.show)) settings.show = saved.show;
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
  return { show: settings.show, pets, hug: readGif(path.join(ASSETS, '贴贴.gif')) };
}

function setShow(value) {
  settings.show = value;
  saveSettings();
  win?.webContents.send('show', value);
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
  const timer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const b = win.getBounds();
    win.webContents.send('cursor', { x: p.x - b.x, y: p.y - b.y });
  }, 100);
  win.on('closed', () => { clearInterval(timer); win = null; });
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
    screen.on('display-metrics-changed', fitToScreen);
    screen.on('display-added', fitToScreen);
    screen.on('display-removed', fitToScreen);
  });
  app.on('window-all-closed', () => app.quit());
}
