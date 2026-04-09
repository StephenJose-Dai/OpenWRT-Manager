const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, shell, session, protocol, net
} = require('electron')
const path = require('path')
const fs   = require('fs')

// ── 自定义协议（必须在 app.ready 前注册）──────────────────────
// 用 app:// 替代 file://，彻底解决：
//   1. <script type="module"> 的 CORS 问题（自定义协议默认是安全源）
//   2. app.asar 内部路径被 pathToFileURL 误处理的问题
//   3. 各 Electron 版本间 file:// 行为不一致的问题
protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: {
    standard:       true,   // 标准 URL 解析（支持相对路径）
    secure:         true,   // 视为安全源（允许 ES module、fetch、等）
    supportFetchAPI: true,
    corsEnabled:    true,
    stream:         true,
  }
}])

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow, tray

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 780,
    minWidth: 860, minHeight: 580,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,  // ready-to-show 后再显示，防止白屏闪烁
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,  // 自定义协议下可以开启 webSecurity
      sandbox: false,     // 关闭沙箱，允许 preload 正常运行
    },
    icon: path.join(__dirname, '../assets/icon.png')
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 加载自定义协议地址，不依赖 file:// 的行为
    mainWindow.loadURL('app://./index.html')
  }

  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.on('window:close', () => mainWindow?.hide())

  mainWindow.webContents.setWindowOpenHandler(({ url: u }) => {
    shell.openExternal(u)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('Renderer crashed:', details.reason)
    if (details.reason !== 'clean-exit') mainWindow.reload()
  })

  // 调试：记录加载错误
  mainWindow.webContents.on('did-fail-load', (_, code, desc, url) => {
    console.error('Load failed:', code, desc, url)
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
    const icon = nativeImage.createFromPath(usePath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('OpenWrt Manager')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示窗口', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit() } }
    ]))
    tray.on('double-click', () => mainWindow?.show())
  } catch (e) {
    console.warn('托盘初始化失败:', e.message)
  }
}

app.whenReady().then(() => {
  // ── 注册 app:// 协议处理器 ─────────────────────────────────
  // 把 app://./xxx 映射到 dist/ 目录下的真实文件
  const distDir = path.join(__dirname, '../dist')

  protocol.handle('app', (request) => {
    // app://./index.html  ->  dist/index.html
    // app://./assets/xxx  ->  dist/assets/xxx
    const urlPath = new URL(request.url).pathname
      .replace(/^\/\.?\//, '')   // 去掉开头的 ./ 或 /
    const filePath = path.join(distDir, urlPath || 'index.html')

    // 安全检查：不允许路径穿越到 dist 之外
    if (!filePath.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 })
    }

    if (!fs.existsSync(filePath)) {
      // SPA fallback：找不到文件时返回 index.html
      return net.fetch('file://' + path.join(distDir, 'index.html'))
    }

    return net.fetch('file://' + filePath)
  })

  // ── CSP：允许连接局域网路由器 ────────────────────────────────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' app: 'unsafe-inline' 'unsafe-eval' data: blob:;" +
          "connect-src 'self' app: data: blob: " +
          "http://192.168.0.0/16 http://10.0.0.0/8 http://172.16.0.0/12 " +
          "ws: wss:;"
        ]
      }
    })
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
