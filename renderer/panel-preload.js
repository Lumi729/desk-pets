const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelApi', {
  get: () => ipcRenderer.invoke('panel-get'),
  click: id => ipcRenderer.send('panel-click', id),
  onTree: fn => ipcRenderer.on('panel-tree', (_event, tree) => fn(tree)),
});
