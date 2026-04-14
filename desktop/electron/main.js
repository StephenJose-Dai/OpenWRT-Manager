'use strict'
const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, shell, session, net
} = require('electron')
const path = require('path')
const fs   = require('fs')
const url  = require('url')
const os   = require('os')
const { execSync } = require('child_process')
const http  = require('http')
const https = require('https')

// ── 必须在 app ready 之前设置的选项 ────────────────────────
// 性能优化：这些 flag 必须在 ready 之前调用才有效
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
app.commandLine.appendSwitch('disable-http-cache', 'false')

// SSL 按连接配置忽略（用户选择忽略时才跳过验证）
let currentIgnoreSSL = false
ipcMain.on('ssl:setIgnore', (_, ignore) => { currentIgnoreSSL = !!ignore })
app.on('certificate-error', (event, _wc, _url, _err, _cert, callback) => {
  if (currentIgnoreSSL) { event.preventDefault(); callback(true) }
  else callback(false)
})

const isDev       = !app.isPackaged
const APP_VERSION = app.getVersion()
let mainWindow, tray

// ── 路径工具 ───────────────────────────────────────────────
function assetsDir() {
  return isDev
    ? path.join(__dirname, '../assets')
    : path.join(process.resourcesPath, 'assets')
}
function distDir() {
  return isDev ? null : path.join(process.resourcesPath, 'dist')
}

// ── 获取本机网关 ───────────────────────────────────────────
// Node.js 原生 http/https 请求（绕过 Chromium CORS 和 SSL 限制）
function nodeRequest(url, body, ignoreSSL = false, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    try {
      const isHttps = url.startsWith('https://')
      const lib     = isHttps ? https : http
      const urlObj  = new URL(url)

      const agent = isHttps
        ? new https.Agent({ rejectUnauthorized: !ignoreSSL, keepAlive: false })
        : new http.Agent({ keepAlive: false })

      const bodyBuf = Buffer.from(body, 'utf8')
      const options = {
        hostname: urlObj.hostname,
        port:     urlObj.port || (isHttps ? 443 : 80),
        path:     urlObj.pathname || '/ubus',
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': bodyBuf.length,
        },
        agent,
        timeout: timeoutMs,
      }

      const req = lib.request(options, (res) => {
        let data = ''
        res.on('data', c => { data += c })
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error('HTTP ' + res.statusCode)); return
          }
          try   { resolve(JSON.parse(data)) }
          catch { reject(new Error('JSON parse error: ' + data.slice(0, 80))) }
        })
      })
      req.on('error',   (err) => reject(err))
      req.on('timeout', ()    => { req.destroy(); reject(new Error('连接超时')) })
      req.write(bodyBuf)
      req.end()
    } catch (err) {
      reject(err)
    }
  })
}

function getSmartGateways() {
  const primary = [], secondary = []

  try {
    if (process.platform === 'win32') {
      // 方法1: route print（最可靠）
      try {
        const out = execSync('route print 0.0.0.0', { timeout: 3000, encoding: 'utf8' })
        for (const line of out.split('\n')) {
          const m = line.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/)
          if (m && m[1] !== '0.0.0.0') primary.push(m[1])
        }
      } catch {}
      // 方法2: ipconfig（备用）
      if (primary.length === 0) {
        try {
          const out = execSync('ipconfig', { timeout: 3000, encoding: 'utf8' })
          const ms = [...out.matchAll(/(?:默认网关|Default Gateway)[\s.:：]+([\d.]+)/gi)]
          ms.forEach(m => {
            const g = m[1]
            if (g && g !== '0.0.0.0' && /\d+\.\d+\.\d+\.\d+/.test(g)) primary.push(g)
          })
        } catch {}
      }
    } else {
      // Linux/macOS
      const out = execSync('ip route show default 2>/dev/null || route -n 2>/dev/null', {
        timeout: 2000, encoding: 'utf8', shell: true
      })
      const ms = [...out.matchAll(/via\s+(\d+\.\d+\.\d+\.\d+)/g)]
      primary.push(...ms.map(m => m[1]).filter(Boolean))
    }
  } catch {}

  const skipRE = /^(lo$|lo0$|loopback|docker|veth[a-f0-9]+|virbr|dummy)/i
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (skipRE.test(name)) continue
    for (const a of addrs) {
      if (a.family !== 'IPv4' || a.internal) continue
      const sub = a.address.split('.').slice(0, 3).join('.')
      secondary.push(sub + '.1', sub + '.254')
    }
  }

  const uniq = arr => [...new Set(arr)]
  return {
    primary:   uniq(primary),
    secondary: uniq(secondary),
    all:       uniq([...primary, ...secondary])
  }
}

// ── 主窗口 ─────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    frame: false,
    backgroundColor: '#0d1117',
    show: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,          // 允许跨域 fetch（访问路由器 API）
      sandbox: false,
      allowRunningInsecureContent: false,
    },
    icon: path.join(assetsDir(), 'icon.png')
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadURL(
      url.pathToFileURL(path.join(distDir(), 'index.html')).href
    )
    // F12 打开 DevTools 便于调试
    mainWindow.webContents.on('before-input-event', (_, inp) => {
      if (inp.key === 'F12') mainWindow.webContents.openDevTools({ mode: 'detach' })
    })
  }

  // 窗口控制
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
  ipcMain.on('window:close',   () => mainWindow?.hide())

  // 关闭时最小化到托盘
  mainWindow.on('close', e => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u); return { action: 'deny' }
  })
  mainWindow.webContents.on('render-process-gone', (_, d) => {
    if (d.reason !== 'clean-exit') mainWindow?.reload()
  })
}

// ── 系统托盘 ───────────────────────────────────────────────
function createTray() {
  const dir = assetsDir()
  // Windows 用 16px，其他平台用 32px
  const preferred = process.platform === 'win32' ? 'tray_16.png' : 'tray_32.png'
  const tryPaths  = [
    path.join(dir, preferred),
    path.join(dir, 'tray.png'),
    path.join(dir, 'icon.png'),
  ]

  let iconPath = tryPaths.find(p => {
    try { return fs.existsSync(p) } catch { return false }
  })
  if (!iconPath) { console.warn('[Tray] No icon found in', dir); return }

  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) { console.warn('[Tray] Icon is empty:', iconPath); return }

  // Windows 托盘图标需要是 ICO 或者小 PNG，确保尺寸正确
  if (process.platform === 'win32') {
    icon = icon.resize({ width: 16, height: 16, quality: 'better' })
  }

  tray = new Tray(icon)
  tray.setToolTip('OpenWrt Manager')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { label: '检查更新',   click: () => mainWindow?.webContents.send('trigger:checkUpdate') },
    { type: 'separator' },
    { label: '退出程序',   click: () => { app.isQuitting = true; app.quit() } },
  ]))
  tray.on('click',       () => { mainWindow?.show(); mainWindow?.focus() })
  tray.on('double-click',() => { mainWindow?.show(); mainWindow?.focus() })
}

// ── IPC 处理器（统一注册，避免重复） ──────────────────────
function registerIPC() {
  // ubus 代理：主进程转发所有路由器请求，完全绕过 CORS 限制
  // ubus 代理：用 Node.js http/https 发请求，完全绕过 Chromium CORS 和 SSL 限制
  ipcMain.handle('ubus:request', (_, { url, body, ignoreSSL: reqIgnoreSSL }) => {
    const shouldIgnoreSSL = reqIgnoreSSL !== undefined ? !!reqIgnoreSSL : currentIgnoreSSL
    return nodeRequest(url, body, shouldIgnoreSSL)
  })


  ipcMain.handle('ubus:probe', async (_, { host }) => {
    const body = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'call',
      params: ['00000000000000000000000000000000', 'session', 'login',
               { username: '', password: '' }]
    })
    const attempts = [
      { url: `http://${host}/ubus`,      isHttps: false, port: 80   },
      { url: `http://${host}:8080/ubus`, isHttps: false, port: 8080 },
      { url: `https://${host}/ubus`,     isHttps: true,  port: 443  },
    ]
    const results = await Promise.all(attempts.map(async ({ url, isHttps, port }) => {
      try {
        const data = await nodeRequest(url, body, true, 3000)
        const code = data.result?.[0]
        if (code === 6 || code === 0 || (data.jsonrpc === '2.0' && data.id === 1)) {
          return { reachable: true, isOpenWrt: code === 6 || code === 0, https: isHttps, port }
        }
        return null
      } catch { return null }
    }))
    return results.find(r => r !== null) || null
  })

  ipcMain.handle('net:getGateways', () => {
    const gw = getSmartGateways()
    console.log('[getGateways] result:', JSON.stringify(gw))
    return gw
  })
  ipcMain.handle('app:getVersion',  () => APP_VERSION)
  ipcMain.handle('shell:openExternal', (_, u) => u && shell.openExternal(u))
  ipcMain.on(    'shell:openExternal', (_, u) => u && shell.openExternal(u))

  // 开机自启（注册表方式，仅 Windows）
  ipcMain.handle('app:getAutoStart', () => {
    if (process.platform !== 'win32') return false
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager 2>nul',
        { encoding: 'utf8' }
      )
      return out.includes('OpenWrtManager')
    } catch { return false }
  })
  ipcMain.handle('app:setAutoStart', (_, enable) => {
    if (process.platform !== 'win32') return
    try {
      if (enable) {
        execSync(
          `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager /t REG_SZ /d "${process.execPath}" /f`,
          { encoding: 'utf8' }
        )
      } else {
        execSync(
          'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v OpenWrtManager /f 2>nul',
          { encoding: 'utf8' }
        )
      }
    } catch {}
  })

  // 检查更新（GitHub releases API）
  ipcMain.handle('app:checkUpdate', async () => {
    try {
      const data = await nodeRequest(
        'https://api.github.com/repos/YOUR_USERNAME/openwrt-manager/releases/latest',
        JSON.stringify({}),
        false
      ).catch(() => null)
      if (!data) return null
      // GET 请求用技巧：nodeRequest 是 POST，直接用 https
      const { get } = require('https')
      return await new Promise(resolve => {
        const req = get({
          hostname: 'api.github.com',
          path: '/repos/YOUR_USERNAME/openwrt-manager/releases/latest',
          headers: { 'User-Agent': 'OpenWrt-Manager/' + APP_VERSION }
        }, res => {
          let d = ''
          res.on('data', c => d += c)
          res.on('end', () => {
            try {
              const j = JSON.parse(d)
              resolve(j.tag_name ? { tag: j.tag_name, url: j.html_url, body: j.body || '' } : null)
            } catch { resolve(null) }
          })
        })
        req.on('error', () => resolve(null))
        req.end()
      })
    } catch { return null }
  })
}

// ── 应用入口 ───────────────────────────────────────────────
app.whenReady().then(() => {
  // 移除路由器响应的 CSP 头，否则可能拦截资源
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const h = { ...details.responseHeaders }
    delete h['content-security-policy']
    delete h['Content-Security-Policy']
    callback({ responseHeaders: h })
  })

  registerIPC()
  createWindow()
  createTray()
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
  else { mainWindow?.show(); mainWindow?.focus() }
})
app.on('before-quit', () => { app.isQuitting = true })  // 扫描探测：用 Node.js http/https 探测单个 IP，绕过 CORS

