const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('onlineApi', {
  get: () => ipcRenderer.invoke('online-get'),
  save: settings => ipcRenderer.invoke('online-save', settings),
  cancel: () => ipcRenderer.send('online-cancel'),
  randomCode: () => ipcRenderer.invoke('online-random-code'),
  copy: text => ipcRenderer.send('copy-text', text),
});
