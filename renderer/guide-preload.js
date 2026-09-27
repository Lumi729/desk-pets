const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('guideApi', {
  get: () => ipcRenderer.invoke('guide-get'),
  showPet: (name, on) => ipcRenderer.send('guide-show-pet', name, on),
  size: size => ipcRenderer.send('guide-size', size),
  profile: next => ipcRenderer.invoke('guide-profile', next),
  place: place => ipcRenderer.invoke('guide-place', place),
  birthdays: map => ipcRenderer.invoke('guide-birthdays', map),
  open: what => ipcRenderer.send('guide-open', what),
  done: () => ipcRenderer.send('guide-done'),
});
