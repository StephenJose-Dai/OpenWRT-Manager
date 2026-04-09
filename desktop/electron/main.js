const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, shell, session, autoUpdater, dialog
} = require('electron')
const path = require('path')
const fs   = require('fs')
const url  = require('url')
const os   = require('os')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
const APP_VERSION = app.getVersion()
let mainWindow, tray

function getDistDir() {
  if (isDev) return null
  return path.join(process.resourcesPath, 'dist')
}

const { execSync } = require('child_process')

// 智能获取路由器网关候选地址
// 优先级：系统路由表默认路由 > 活跃物理网卡推算
// 自动过滤：Docker/VPN/VMware/WSL 等虚拟网卡
function getSmartGateways() {
  const primary   = []   // 路由表直接读到的，最准确
  const secondary = []   // 网卡推算的，备用

  // ── 方法1：读系统路由表（最准确）──────────────────────
  try {
    let routeGWs = []
    if (process.platform === 'win32') {
      // 用 wmic 或 PowerShell 读默认路由网关
      // 注意：PowerShell 命令里的单引号必须用 `'` 形式传入，避免 JS 字符串冲突
      const psCmd = [
        'powershell -NoProfile -Command',
        '"Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue',
        '| Sort-Object -Property {[int]$_.RouteMetric}',
        '| ForEach-Object { $_.NextHop }',
        '| Where-Object { $_ -ne \\"0.0.0.0\\" -and $_ -ne \\"\\" }"'
      ].join(' ')
      const out = execSync(psCmd, { timeout: 5000, encoding: 'utf8' })
      routeGWs = out.trim().split('\n')
        .map(s => s.trim())
        .filter(s => /^\d+\.\d+\.\d+\.\d+$/.test(s))
    } else {
      // Linux / macOS
      const out = execSync(
        'ip route show default 2>/dev/null || netstat -rn 2>/dev/null | grep "^0\\.0\\.0\\.0"',
        { timeout: 2000, encoding: 'utf8', shell: true }
      )
      const ms = [...out.matchAll(/via\s+(\d+\.\d+\.\d+\.\d+)/g)]
      routeGWs = ms.map(m => m[1]).filter(Boolean)
    }
    primary.push(...new Set(routeGWs))
  } catch (e) {}

  // ── 方法2：从活跃物理网卡推算（过滤虚拟网卡）────────
  const virtualRE = /^(lo|loopback|docker|veth|virbr|vmnet|vbox|utun\d|tun\d|tap\d|wsl|hyper|npcap|vlan|bond|br-|dummy)/i
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (virtualRE.test(name)) continue
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue
      const subnet = a.address.split('.').slice(0, 3).join('.')
      // 如果路由表里已有这个子网，跳过（避免重复）
      if (primary.some(gw => gw.startsWith(subnet + '.'))) continue
      secondary.push(subnet + '.1')
      secondary.push(subnet + '.254')
    }
  }

  return {
    primary,                                         // 路由表直接读到
    secondary: [...new Set(secondary)],             // 网卡推算
    all: [...new Set([...primary, ...secondary])]   // 全部候选，primary 优先
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 780,
    minWidth: 860, minHeight: 580,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,  // 关闭 webSecurity，允许连接任意 HTTP 路由器
      sandbox: false,
    },
    icon: path.join(__dirname, '../assets/icon.png')
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
  }

  // 窗口控制
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.on('window:close', () => mainWindow?.hide())

  // 获取本机网关（用于智能扫描）
  ipcMain.handle('net:getGateways', () => getSmartGateways())

  // 获取 App 版本
  ipcMain.handle('app:getVersion', () => APP_VERSION)

  // 打开外部链接
  ipcMain.on('shell:openExternal', (_, u) => shell.openExternal(u))

  // 检查更新
  ipcMain.handle('app:checkUpdate', async () => {
    const { net } = require('electron')
    try {
      const request = net.request(
        'https://api.github.com/repos/YOUR_USERNAME/openwrt-manager/releases/latest'
      )
      return new Promise((resolve) => {
        let data = ''
        request.on('response', (res) => {
          res.on('data', c => { data += c })
          res.on('end', () => {
            try {
              const json = JSON.parse(data)
              resolve({ tag: json.tag_name, url: json.html_url, body: json.body })
            } catch { resolve(null) }
          })
        })
        request.on('error', () => resolve(null))
        request.end()
      })
    } catch { return null }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u)
    return { action: 'deny' }
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
    const trayPath = path.join(__dirname, '../assets/tray.png')
    const iconPath = path.join(__dirname, '../assets/icon.png')
    const usePath  = fs.existsSync(trayPath) ? trayPath : iconPath
    const icon     = nativeImage.createFromPath(usePath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('OpenWrt Manager')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示窗口',  click: () => mainWindow?.show() },
      { label: '检查更新',  click: () => mainWindow?.webContents.send('trigger:checkUpdate') },
      { type: 'separator' },
      { label: '退出',      click: () => { app.isQuitting = true; app.quit() } }
    ]))
    tray.on('double-click', () => mainWindow?.show())
  } catch (e) {
    console.warn('托盘初始化失败:', e.message)
  }
}

app.whenReady().then(() => {
  // 完全移除 CSP：Electron 应用不需要 CSP，安全由主进程控制
  // CSP 会阻止连接任意 IP 的路由器，对 OpenWrt Manager 没有意义
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders }
    delete headers['content-security-policy']
    delete headers['Content-Security-Policy']
    callback({ responseHeaders: headers })
  })

  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else mainWindow?.show()
})
app.on('before-quit', () => { app.isQuitting = true })
