const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mirrorApi', {
  frame: fn => ipcRenderer.on('mirror-frame', (_event, value) => fn(value)),
  input: value => ipcRenderer.send('mirror-input', value),
});
