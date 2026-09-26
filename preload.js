const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petApi', {
  load: () => ipcRenderer.invoke('load'),
  setIgnoreMouse: ignore => ipcRenderer.send('set-ignore', ignore),
  showMenu: () => ipcRenderer.send('menu'),
  onShow: fn => ipcRenderer.on('show', (_event, value) => fn(value)),
  onCursor: fn => ipcRenderer.on('cursor', (_event, point) => fn(point)),
  onFeatures: fn => ipcRenderer.on('features', (_event, features) => fn(features)),
  onActivity: fn => ipcRenderer.on('activity', (_event, activity) => fn(activity)),
  touched: () => ipcRenderer.send('pet-touched'),
  onSize: fn => ipcRenderer.on('size', (_event, size) => fn(size)),
  onPresence: fn => ipcRenderer.on('presence', (_event, online) => fn(online)),
  onRemote: fn => ipcRenderer.on('remote', (_event, message) => fn(message)),
  onPerch: fn => ipcRenderer.on('perch', (_event, ledge) => fn(ledge)),
  onCpuHot: fn => ipcRenderer.on('cpu-hot', (_event, hot) => fn(hot)),
  onSitReminder: fn => ipcRenderer.on('sit-reminder', () => fn()),
});
