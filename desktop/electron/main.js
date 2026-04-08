const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
let mainWindow, tray

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 780,
    minWidth: 860, minHeight: 580,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // 允许加载局域网 HTTP（ubus 直连）
      webSecurity: false
    },
    icon: path.join(__dirname, '../assets/icon.png')
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 窗口控制
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
  ipcMain.on('window:close',    () => mainWindow?.hide())  // 最小化到托盘

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '../assets/icon.png')
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
    console.warn('托盘图标创建失败（可能缺少 icon.png）:', e.message)
  }
}

app.whenReady().then(() => {
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
