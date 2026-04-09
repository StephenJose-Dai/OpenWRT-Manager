const {
  app, BrowserWindow, ipcMain, Tray, Menu,
  nativeImage, shell, session
} = require('electron')
const path = require('path')
const fs   = require('fs')
const url  = require('url')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow, tray

function getDistDir() {
  if (isDev) return null
  // extraResources 会被解压到 resources/ 目录（真实文件系统，不在 asar 内）
  // process.resourcesPath = /path/to/resources
  // dist/  = /path/to/resources/dist/
  return path.join(process.resourcesPath, 'dist')
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:    1200, height:    780,
    minWidth:  860, minHeight: 580,
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
    },
    icon: path.join(__dirname, '../assets/icon.png')
  })

  // 渲染完成后才显示，防止白屏/黑屏闪烁
  mainWindow.once('ready-to-show', () => mainWindow.show())

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    const distDir   = getDistDir()
    const indexPath = path.join(distDir, 'index.html')

    // 用 pathToFileURL 把真实文件系统路径转成 file:// URL
    // 因为 dist/ 在 extraResources 里，是真实目录，pathToFileURL 完全有效
    const indexUrl = url.pathToFileURL(indexPath).href
    mainWindow.loadURL(indexUrl)

    // 调试日志（发布版）：记录加载结果
    mainWindow.webContents.on('did-fail-load', (_, code, desc, failUrl) => {
      const logPath = path.join(app.getPath('userData'), 'load-error.log')
      const msg = `[${new Date().toISOString()}] FAIL code=${code} desc=${desc} url=${failUrl}\n` +
                  `distDir=${distDir}\nindexPath=${indexPath}\nexists=${fs.existsSync(indexPath)}\n\n`
      fs.appendFileSync(logPath, msg)
    })

    mainWindow.webContents.on('did-finish-load', () => {
      const logPath = path.join(app.getPath('userData'), 'load-error.log')
      const msg = `[${new Date().toISOString()}] SUCCESS loaded: ${indexUrl}\n`
      fs.appendFileSync(logPath, msg)
    })
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
  // CSP：允许连接局域网 HTTP 路由器
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' file: data: blob:;" +
          "connect-src 'self' file: data: blob: " +
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
