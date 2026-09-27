const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('diaryApi', {
  get: () => ipcRenderer.invoke('diary-get'),
  onShow: fn => ipcRenderer.on('diary-show', (_event, key) => fn(key)),
});
