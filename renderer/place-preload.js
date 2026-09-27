const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('placeApi', {
  get: () => ipcRenderer.invoke('place-get'),
  search: text => ipcRenderer.invoke('place-search', text),
  choose: place => ipcRenderer.invoke('place-choose', place),
  cancel: () => ipcRenderer.send('place-cancel'),
});
