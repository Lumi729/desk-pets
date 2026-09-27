const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diaryApi', {
  get: () => ipcRenderer.invoke('diary-get'),
  fav: (key, on) => ipcRenderer.invoke('diary-fav', key, on),
  image: (key, rect) => ipcRenderer.invoke('diary-image', key, rect),
  onShow: fn => ipcRenderer.on('diary-show', (_event, key) => fn(key)),
});
