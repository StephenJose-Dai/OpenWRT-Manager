const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  minimize:      () => ipcRenderer.send('window:minimize'),
  maximize:      () => ipcRenderer.send('window:maximize'),
  close:         () => ipcRenderer.send('window:close'),
  platform:      process.platform,
  versions:      process.versions,
  getGateways:   () => ipcRenderer.invoke('net:getGateways'),
  getVersion:    () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate:   () => ipcRenderer.invoke('app:checkUpdate'),
  openExternal:  (url) => { if (url) ipcRenderer.send('shell:openExternal', url) },
  getAutoStart:  () => ipcRenderer.invoke('app:getAutoStart'),
  setAutoStart:  (v)  => ipcRenderer.invoke('app:setAutoStart', v),
  onCheckUpdate: (cb) => ipcRenderer.on('trigger:checkUpdate', cb),
  // SSL：每次连接前通知主进程，决定是否忽略证书错误
  setSSLIgnore:  (ignore) => ipcRenderer.send('ssl:setIgnore', !!ignore),
})
