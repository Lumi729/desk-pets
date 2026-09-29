// CI 使用独立设置目录启动真实主进程，验证透明窗口和素材加载；不替代人工交互检查。
const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
app.commandLine.appendSwitch('user-data-dir');
const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-pets-smoke-'));
app.setPath('userData', settingsDir);
fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({ guideSeen: true }));
const timeout = setTimeout(() => { console.error('Desktop window did not load'); app.exit(1); }, 45000);
app.once('browser-window-created', (_event, win) => {
  win.webContents.on('render-process-gone', () => app.exit(1));
  win.webContents.once('did-fail-load', () => app.exit(1));
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      const count = await win.webContents.executeJavaScript('document.querySelectorAll("img").length');
      if (count < 7 || !BrowserWindow.getAllWindows().length) throw new Error('Pet images missing');
      console.log('Mac desktop window loaded:', count, 'images');
      const mirrors = BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().endsWith('/mirror.html'));
      if (mirrors.length !== screen.getAllDisplays().length) throw new Error('Missing display views');
      for (const view of mirrors) {
        const painted = await view.webContents.executeJavaScript('Array.from(document.querySelectorAll(".pet img")).filter(img => img.complete && img.naturalWidth > 0).length');
        if (painted < 7) throw new Error('Mirror did not paint the shared pet scene: ' + painted);
      }
      console.log('Mac display views painted the shared pet scene:', mirrors.length);
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
});
require('../main');
