const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, session } = require('electron')
const path = require('path')
const fs   = require('fs')
const url  = require('url')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow, tray

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 780,
    minWidth: 860, minHeight: 580,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    show: false,   // 先隐藏，ready-to-show 后再显示，避免白闪
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false,         // 允许 file:// 加载本地资源
      allowRunningInsecureContent: false,
    },
    icon: path.join(__dirname, '../assets/icon.png')
  })

  // ready-to-show：窗口内容渲染完毕再显示，彻底消除黑屏/白闪
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    // 用 loadURL(file://) 替代 loadFile()
    // loadFile 在某些 Electron 版本下会给 script 标签加 crossorigin 导致黑屏
    const indexPath = path.join(__dirname, '../dist/index.html')
    const fileUrl   = url.pathToFileURL(indexPath).href
    mainWindow.loadURL(fileUrl)
  }

  // 窗口控制
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () =>
    mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  )
  ipcMain.on('window:close', () => mainWindow?.hide())

  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl)
    return { action: 'deny' }
  })

  // 渲染进程崩溃时自动重载
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    console.error('Renderer crashed:', details)
    if (details.reason !== 'clean-exit') {
      mainWindow.reload()
    }
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); mainWindow.hide() }
  })
}

function createTray() {
  try {
    const trayPath = path.join(__dirname, '../assets/tray.png')
    const mainPath = path.join(__dirname, '../assets/icon.png')
    const iconPath = fs.existsSync(trayPath) ? trayPath : mainPath
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

    tray = new Tray(icon)
    tray.setToolTip('OpenWrt Manager')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示窗口', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: '退出', click: () => { app.isQuitting = true; app.quit() } }
    ]))
    tray.on('double-click', () => mainWindow?.show())
  } catch (e) {
    console.warn('托盘图标创建失败:', e.message)
  }
}

app.whenReady().then(() => {
  // 在 main process 设置 CSP（允许局域网 HTTP 请求）
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' file: data: blob:;" +
          "connect-src 'self' file: data: blob: http://192.168.0.0/16 http://10.0.0.0/8 http://172.16.0.0/12 ws: wss:;"
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
