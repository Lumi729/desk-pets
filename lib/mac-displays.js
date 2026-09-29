const path = require('node:path');

// Only the host runs the pet simulation. Display windows render inert scene nodes
// and forward input; they never run timers, diary logic, online code or pet AI.
function createMacDisplays({ BrowserWindow, ipcMain, screen, host, bounds, root }) {
  const views = new Map();
  let frame = null, images = new Map(), captured = null;
  const sourceView = sender => [...views.values()].find(w => w.webContents === sender);
  function layout(w) {
    const b = w.getBounds(), world = bounds();
    return { x: b.x - world.x, y: b.y - world.y, width: world.width, height: world.height };
  }
  function sendFrame(w, all = false, additions = []) {
    if (!frame || w.isDestroyed() || w.webContents.isLoading()) return;
    w.webContents.send('mirror-frame', { nodes: frame, layout: layout(w), images: all ? [...images] : additions });
  }
  function reconcile() {
    const displays = screen.getAllDisplays();
    for (const [id, w] of views) if (!displays.some(d => d.id === id)) {
      if (captured?.window === w) cancelDrag();
      views.delete(id); w.destroy();
    }
    for (const display of displays) {
      let w = views.get(display.id);
      if (!w) {
        w = new BrowserWindow({ ...display.workArea, show: false, transparent: true, backgroundColor: '#00000000', frame: false,
          resizable: false, movable: false, focusable: false, skipTaskbar: true, hasShadow: false, fullscreenable: false,
          webPreferences: { preload: path.join(root, 'mirror-preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false } });
        views.set(display.id, w);
        w.setAlwaysOnTop(true, 'screen-saver');
        w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
        w.setIgnoreMouseEvents(true, { forward: true });
        w.webContents.once('did-finish-load', () => { sendFrame(w, true); if (host.isVisible()) w.showInactive(); });
        w.loadFile(path.join(root, 'renderer/mirror.html'));
      } else { w.setBounds(display.workArea); sendFrame(w, true); }
    }
  }
  function cancelDrag() {
    if (captured && !host.isDestroyed()) host.webContents.send('mirror-input', { ...captured.last, type: 'pointercancel', buttons: 0 });
    captured = null;
  }
  function input(event, data) {
    const w = sourceView(event.sender);
    if (!w || !data || !['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'contextmenu', 'click'].includes(data.type)) return;
    if (!Number.isFinite(data.x) || !Number.isFinite(data.y) || !Number.isInteger(data.key)) return;
    const b = w.getBounds(), world = bounds();
    const message = { type: data.type, key: captured?.last.key ?? data.key, x: b.x + data.x - world.x, y: b.y + data.y - world.y,
      button: data.button === 2 ? 2 : 0, buttons: Number(data.buttons) & 3, pointerId: 1 };
    if (data.type === 'pointerdown' && message.button === 0) captured = { window: w, last: message };
    if (captured) captured.last = message;
    host.webContents.send('mirror-input', message);
    if (data.type === 'pointerup' || data.type === 'pointercancel') captured = null;
  }
  function onFrame(event, data) {
    if (event.sender !== host.webContents || !data || !Array.isArray(data.nodes) || data.nodes.length > 512 || !Array.isArray(data.images)) return;
    const additions = data.images.filter(pair => Array.isArray(pair) && typeof pair[0] === 'string' && pair[1]?.byteLength <= 8 * 1024 * 1024);
    for (const [key, bytes] of additions) images.set(key, bytes);
    frame = data.nodes;
    const used = new Set(frame.map(n => n.image).filter(Boolean));
    for (const key of images.keys()) if (!used.has(key)) images.delete(key);
    for (const w of views.values()) sendFrame(w, false, additions);
  }
  function setIgnore(ignore) {
    const p = screen.getCursorScreenPoint();
    for (const w of views.values()) {
      const b = w.getBounds();
      const active = captured ? captured.window === w : !ignore && p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
      w.setIgnoreMouseEvents(!active, { forward: true });
    }
  }
  const show = () => { for (const w of views.values()) w.showInactive(); };
  const hide = () => { cancelDrag(); for (const w of views.values()) w.hide(); };
  ipcMain.on('mirror-frame', onFrame);
  ipcMain.on('mirror-input', input);
  host.on('show', show); host.on('hide', hide);
  host.webContents.on('did-start-loading', () => { cancelDrag(); frame = null; images.clear(); });
  reconcile();
  return { reconcile, setIgnore, cursorWindow: () => captured?.window || [...views.values()].find(w => {
    const p = screen.getCursorScreenPoint(), b = w.getBounds(); return p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
  }), destroy() {
    ipcMain.removeListener('mirror-frame', onFrame); ipcMain.removeListener('mirror-input', input);
    for (const w of views.values()) w.destroy(); views.clear();
  } };
}
module.exports = { createMacDisplays };
