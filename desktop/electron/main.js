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
  return path.join(process.resourcesPath, 'dist')
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
      webSecurity: false,
      sandbox: false,
      // 生产环境也开启 DevTools，方便调试
      devTools: true,
    },
    icon: path.join(__dirname, '../assets/icon.png')
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // 生产环境打开 DevTools（定位 JS 错误）
    if (!isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
  })

  const logPath = path.join(app.getPath('userData'), 'debug.log')
  const log = (msg) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(logPath, line)
    console.log(msg)
  }

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const distDir   = getDistDir()
    const indexPath = path.join(distDir, 'index.html')
    const indexUrl  = url.pathToFileURL(indexPath).href

    log(`distDir: ${distDir}`)
    log(`indexPath: ${indexPath}`)
    log(`exists: ${fs.existsSync(indexPath)}`)
    log(`indexUrl: ${indexUrl}`)

    // 列出 dist/assets 内容
    try {
      const assets = fs.readdirSync(path.join(distDir, 'assets'))
      log(`assets: ${assets.join(', ')}`)
    } catch(e) {
      log(`assets read error: ${e.message}`)
    }

    mainWindow.loadURL(indexUrl)

    mainWindow.webContents.on('did-fail-load', (_, code, desc, failUrl) => {
      log(`FAIL code=${code} desc=${desc} url=${failUrl}`)
    })

    mainWindow.webContents.on('did-finish-load', () => {
      log(`LOADED OK: ${indexUrl}`)
      // 注入诊断脚本，捕获 JS 错误
      mainWindow.webContents.executeJavaScript(`
        window.onerror = function(msg, src, line, col, err) {
          window.electron.sendError( msg + ' @ ' + src + ':' + line)
        };
        window.addEventListener('unhandledrejection', function(e) {
          window.electron.sendError( 'Unhandled: ' + e.reason)
        });
        // 检查 root 元素
        setTimeout(() => {
          const root = document.getElementById('root');
          window.electron.sendError( 
            'root innerHTML length: ' + (root ? root.innerHTML.length : 'NO ROOT') +
            ' | children: ' + (root ? root.children.length : 0)
          );
        }, 3000);
        'injected'
      `).then(r => log(`inject result: ${r}`)).catch(e => log(`inject error: ${e.message}`))
    })

    // 捕获渲染进程的 console 输出
    mainWindow.webContents.on('console-message', (_, level, msg, line, src) => {
      log(`CONSOLE[${level}] ${msg} @ ${src}:${line}`)
    })
  }

  ipcMain.on('js-error', (_, msg) => {
    const logPath2 = path.join(app.getPath('userData'), 'debug.log')
    fs.appendFileSync(logPath2, `[JS] ${msg}\n`)
  })

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
    const logPath2 = path.join(app.getPath('userData'), 'debug.log')
    fs.appendFileSync(logPath2, `[CRASH] ${details.reason}\n`)
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
