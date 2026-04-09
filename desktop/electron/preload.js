const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  minimize:  () => ipcRenderer.send('window:minimize'),
  maximize:  () => ipcRenderer.send('window:maximize'),
  close:     () => ipcRenderer.send('window:close'),
  platform:  process.platform,
  versions:  process.versions,
  // 诊断用：发送错误到主进程
  sendError: (msg) => ipcRenderer.send('js-error', msg),
})
