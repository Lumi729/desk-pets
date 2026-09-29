// CI 使用独立设置目录启动真实主进程，验证透明窗口和素材加载；不替代人工交互检查。
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.commandLine.appendSwitch('user-data-dir');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-smoke-')));
const timeout = setTimeout(() => { console.error('Desktop window did not load'); app.exit(1); }, 45000);
app.on('browser-window-created', (_event, win) => {
  win.webContents.on('render-process-gone', () => app.exit(1));
  win.webContents.once('did-fail-load', () => app.exit(1));
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const count = await win.webContents.executeJavaScript('document.querySelectorAll("img").length');
      if (count < 7 || !BrowserWindow.getAllWindows().length) throw new Error('Pet images missing');
      console.log('Mac desktop window loaded:', count, 'images');
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../main');
