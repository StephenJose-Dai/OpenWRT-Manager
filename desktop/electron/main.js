const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, shell, session, net, dialog
} = require('electron')
const path    = require('path')
const fs      = require('fs')
const url     = require('url')
const os      = require('os')
const { execSync } = require('child_process')

// ── 性能优化：GPU 加速 + 禁用无用功能 ─────────────────────
app.commandLine.appendSwitch('disable-http-cache', 'false')
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder')
app.commandLine.appendSwitch('disable-frame-rate-limit')

// ── SSL 证书：按连接配置决定，不全局忽略 ──────────────
// 用户在添加路由器时可开启"忽略SSL证书"，连接时通知主进程
let currentIgnoreSSL = false  // 当前是否忽略 SSL
ipcMain.on('ssl:setIgnore', (_, ignore) => {
  currentIgnoreSSL = !!ignore
})
// app 级别处理 certificate-error：仅在用户主动开启忽略时才放行
app.on('certificate-error', (event, webContents, certUrl, error, cert, callback) => {
  if (currentIgnoreSSL) {
    event.preventDefault()
    callback(true)   // 用户开启了忽略，放行
  } else {
    callback(false)  // 正常验证，拒绝
  }
})

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const APP_VERSION = app.getVersion()
let mainWindow, tray

function getDistDir() {
  if (isDev) return null
  return path.join(process.resourcesPath, 'dist')
}

// ── 智能网关检测 ───────────────────────────────────────────
function getSmartGateways() {
  const primary   = []
  const secondary = []

  try {
    let routeGWs = []
    if (process.platform === 'win32') {
      const psCmd = [
        'powershell -NoProfile -Command',
        '"Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue',
        '| Sort-Object -Property {[int]$_.RouteMetric}',
        '| ForEach-Object { $_.NextHop }',
        '| Where-Object { $_ -ne \\"0.0.0.0\\" -and $_ -ne \\"\\" }"'
      ].join(' ')
      const out = execSync(psCmd, { timeout: 5000, encoding: 'utf8' })
      routeGWs = out.trim().split('\n').map(s => s.trim())
        .filter(s => /^\d+\.\d+\.\d+\.\d+$/.test(s))
    } else {
      const out = execSync(
        'ip route show default 2>/dev/null || netstat -rn 2>/dev/null | grep "^0\\.0\\.0\\.0"',
        { timeout: 2000, encoding: 'utf8', shell: true }
      )
      const ms = [...out.matchAll(/via\s+(\d+\.\d+\.\d+\.\d+)/g)]
      routeGWs = ms.map(m => m[1]).filter(Boolean)
    }
    primary.push(...new Set(routeGWs))
  } catch {}

  // TAP(OpenVPN)/TUN(WireGuard) kept - users may scan VPN subnets
  // 只过滤绝对不是路由器的虚拟接口（保留 tun/tap 供 VPN 用户使用）
  const virtualRE = /^(lo$|lo0$|loopback|docker|veth[a-f0-9]+|virbr[0-9]|br-[a-f0-9]+|dummy[0-9]|npcap|npf)/i
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (virtualRE.test(name)) continue
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue
      const subnet = a.address.split('.').slice(0, 3).join('.')
      if (primary.some(gw => gw.startsWith(subnet + '.'))) continue
      secondary.push(subnet + '.1')
      secondary.push(subnet + '.254')
    }
  }

  return {
    primary,
    secondary: [...new Set(secondary)],
    all: [...new Set([...primary, ...secondary])]
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,
      sandbox: false,
      allowRunningInsecureContent: false,
    },
    icon: isDev
      ? path.join(__dirname, '../assets/icon.png')
      : path.join(process.resourcesPath, 'assets', 'icon.png')
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const indexUrl = url.pathToFileURL(
      path.join(getDistDir(), 'index.html')
    ).href
    mainWindow.loadURL(indexUrl)
    // F12 打开 DevTools
    mainWindow.webContents.on('before-input-event', (_, input) => {
      if (input.key === 'F12') mainWindow.webContents.openDevTools({ mode: 'detach' })
    })
  }

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.on('window:close', () => mainWindow?.hide())

  ipcMain.handle('net:getGateways', () => getSmartGateways())
  ipcMain.handle('app:getVersion',  () => APP_VERSION)
  ipcMain.handle('shell:openExternal', (_, u) => u && shell.openExternal(u))
  ipcMain.on('shell:openExternal',     (_, u) => u && shell.openExternal(u))

  // 开机自启
  ipcMain.handle('app:getAutoStart', () => {
    if (process.platform !== 'win32') return false
    try {
      const { execSync } = require('child_process')
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager',
        { encoding: 'utf8' }
      )
      return out.includes('OpenWrtManager')
    } catch { return false }
  })

  ipcMain.handle('app:setAutoStart', (_, enable) => {
    if (process.platform !== 'win32') return
    const { execSync } = require('child_process')
    const exePath = process.execPath
    if (enable) {
      execSync(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager /t REG_SZ /d "${exePath}" /f`)
    } else {
      try { execSync('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager /f') } catch {}
    }
  })

  // 检查更新
  ipcMain.handle('app:checkUpdate', async () => {
    try {
      const req = net.request('https://api.github.com/repos/YOUR_USERNAME/openwrt-manager/releases/latest')
      return new Promise((resolve) => {
        let data = ''
        req.on('response', res => {
          res.on('data', c => { data += c })
          res.on('end', () => {
            try {
              const j = JSON.parse(data)
              resolve({ tag: j.tag_name, url: j.html_url, body: j.body || '' })
            } catch { resolve(null) }
          })
        })
        req.on('error', () => resolve(null))
        req.end()
      })
    } catch { return null }
  })

  // 开机自启
  ipcMain.handle('app:getAutoStart', () => {
    if (process.platform !== 'win32') return false
    try {
      const { execSync: e } = require('child_process')
      const out = e('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager 2>nul', { encoding: 'utf8' })
      return out.includes('OpenWrtManager')
    } catch { return false }
  })
  ipcMain.handle('app:setAutoStart', (_, enabled) => {
    if (process.platform !== 'win32') return
    try {
      const { execSync: e } = require('child_process')
      const exePath = process.execPath
      if (enabled) {
        e(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager /t REG_SZ /d "${exePath}" /f`, { encoding: 'utf8' })
      } else {
        e('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager /f 2>nul', { encoding: 'utf8' })
      }
    } catch {}
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u); return { action: 'deny' }
  })
  mainWindow.webContents.on('render-process-gone', (_, details) => {
    if (details.reason !== 'clean-exit') mainWindow.reload()
  })
  mainWindow.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() }
  })
}

function createTray() {
  try {
    // 优先用 extraResources 里的真实路径（不在 asar 虚拟文件系统内）
    // 这样 nativeImage.createFromPath 在所有平台都能正确加载
    const assetsDir = isDev
      ? path.join(__dirname, '../assets')
      : path.join(process.resourcesPath, 'assets')

    const trayPath = path.join(assetsDir, 'tray.png')
    const iconPath = path.join(assetsDir, 'icon.png')
    const usePath  = fs.existsSync(trayPath) ? trayPath : iconPath

    if (!fs.existsSync(usePath)) {
      console.warn('托盘图标文件不存在:', usePath)
      return
    }

    const icon = nativeImage.createFromPath(usePath)
    // Windows 托盘图标需要小尺寸，macOS retina 需要原始尺寸
    const trayIcon = process.platform === 'darwin'
      ? icon
      : icon.resize({ width: 16, height: 16 })

    tray = new Tray(trayIcon)
    tray.setToolTip('OpenWrt Manager')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示窗口',  click: () => mainWindow?.show() },
      { label: '检查更新',  click: () => mainWindow?.webContents.send('trigger:checkUpdate') },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit() } }
    ]))
    tray.on('double-click', () => mainWindow?.show())
    console.log('托盘图标创建成功:', usePath)
  } catch (e) {
    console.warn('托盘初始化失败:', e.message)
  }
}

app.whenReady().then(() => {
  // 移除 CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    callback({ responseHeaders: headers })
  })
  // ── 启动性能优化 ──────────────────────────────────────
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

  createWindow()
  createTray()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else mainWindow?.show()
})
app.on('before-quit', () => { app.isQuitting = true })
