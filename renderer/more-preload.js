const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moreApi', {
  get: () => ipcRenderer.invoke('more-get'),
  save: settings => ipcRenderer.invoke('more-save', settings),
  cancel: () => ipcRenderer.send('more-cancel'),
});
