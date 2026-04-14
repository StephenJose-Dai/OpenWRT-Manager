const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electron', {
  // 窗口控制
  minimize:     () => ipcRenderer.send('window:minimize'),
  maximize:     () => ipcRenderer.send('window:maximize'),
  close:        () => ipcRenderer.send('window:close'),
  platform:     process.platform,
  versions:     process.versions,

  // 网络与系统
  getGateways:  () => ipcRenderer.invoke('net:getGateways'),
  getVersion:   () => ipcRenderer.invoke('app:getVersion'),
  checkUpdate:  () => ipcRenderer.invoke('app:checkUpdate'),

  // 打开外部链接
  openExternal: (url) => { if (url) ipcRenderer.send('shell:openExternal', url) },

  // 开机自启
  getAutoStart: () => ipcRenderer.invoke('app:getAutoStart'),
  setAutoStart: (v)  => ipcRenderer.invoke('app:setAutoStart', v),

  // 更新检查事件
  onCheckUpdate: (cb) => ipcRenderer.on('trigger:checkUpdate', cb),

  // SSL 证书忽略（按连接配置）
  setSSLIgnore:  (ignore) => ipcRenderer.send('ssl:setIgnore', !!ignore),

  // ubus 代理请求（主进程转发，绕过 CORS）
  // 所有路由器 API 请求都通过此接口走主进程
  ubusRequest: (url, body) => ipcRenderer.invoke('ubus:request', { url, body }),
})
