const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  load: () => ipcRenderer.invoke('load'),
  setIgnoreMouse: ignore => ipcRenderer.send('set-ignore', ignore),
  showMenu: () => ipcRenderer.send('menu'),
  onShow: fn => ipcRenderer.on('show', (_event, value) => fn(value)),
  onCursor: fn => ipcRenderer.on('cursor', (_event, point) => fn(point)),
});
