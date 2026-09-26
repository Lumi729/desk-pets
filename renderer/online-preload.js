const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onlineApi', {
  get: () => ipcRenderer.invoke('online-get'),
  save: settings => ipcRenderer.invoke('online-save', settings),
  cancel: () => ipcRenderer.send('online-cancel'),
});
