const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  minimize:       () => ipcRenderer.send('window:minimize'),
  maximize:       () => ipcRenderer.send('window:maximize'),
  close:          () => ipcRenderer.send('window:close'),
  platform:       process.platform,
  versions:       process.versions,
  getGateways:    () => ipcRenderer.invoke('net:getGateways'),
  getVersion:     () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate:    () => ipcRenderer.invoke('app:checkUpdate'),
  openExternal:   (url) => ipcRenderer.invoke('shell:openExternal', url),
  getAutoStart:   () => ipcRenderer.invoke('app:getAutoStart'),
  setAutoStart:   (v) => ipcRenderer.invoke('app:setAutoStart', v),
  onCheckUpdate:  (cb) => ipcRenderer.on('trigger:checkUpdate', cb),
})
