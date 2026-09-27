const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('placeApi', {
  get: () => ipcRenderer.invoke('place-get'),
  choose: place => ipcRenderer.invoke('place-choose', place),
  cancel: () => ipcRenderer.send('place-cancel'),
});
