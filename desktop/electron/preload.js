const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // 窗口控制
  minimize:  () => ipcRenderer.send('window:minimize'),
  maximize:  () => ipcRenderer.send('window:maximize'),
  close:     () => ipcRenderer.send('window:close'),
  platform:  process.platform,
  versions:  process.versions,

  // 网络：获取本机网关候选地址（用于智能局域网扫描）
  getGateways: () => ipcRenderer.invoke('net:getGateways'),

  // App 信息
  getVersion:   () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate:  () => ipcRenderer.invoke('app:checkUpdate'),

  // 打开外部链接
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  // 监听主进程触发的更新检查
  onCheckUpdate: (cb) => ipcRenderer.on('trigger:checkUpdate', cb),
})
