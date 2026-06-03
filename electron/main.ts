import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import net from 'net'
import fs from 'fs'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

const MIN_WINDOW_WIDTH = 900
const MIN_WINDOW_HEIGHT = 680

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
  })
}

function waitForServer(port: number, timeout = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' })
      socket.on('connect', () => { socket.destroy(); resolve() })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() - start > timeout) reject(new Error('Server timeout'))
        else setTimeout(check, 200)
      })
    }
    check()
  })
}

async function createWindow() {
  const port = await findFreePort()

  // Set env vars before loading server module
  process.env.PORT = String(port)
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data')

  // Extract static files from asar to userData so serveStatic can read them
  const staticDir = path.join(app.getPath('userData'), 'static')
  const rendererSource = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'renderer')
    : path.join(app.getAppPath(), 'dist', 'renderer')
  const versionFile = path.join(staticDir, '.version')
  const currentVersion = app.getVersion()
  if (!fs.existsSync(staticDir) || !fs.existsSync(versionFile) || fs.readFileSync(versionFile, 'utf-8') !== currentVersion) {
    fs.rmSync(staticDir, { recursive: true, force: true })
    fs.cpSync(rendererSource, staticDir, { recursive: true })
    fs.writeFileSync(versionFile, currentVersion)
  }
  process.env.STATIC_DIR = staticDir

  // Load server in-process (no child process spawn — avoids system Node dependency)
  try {
    require(path.join(__dirname, '../dist-server/server/index.js'))
  } catch (err) {
    console.error('Failed to start server:', err)
    app.quit()
    return
  }

  try {
    await waitForServer(port)
  } catch (err) {
    console.error('Server did not start in time:', err)
    app.quit()
    return
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const winW = Math.max(MIN_WINDOW_WIDTH, Math.min(1200, width))
  const winH = Math.max(MIN_WINDOW_HEIGHT, Math.min(800, height))

  mainWindow = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    x: Math.max(0, Math.round((width - winW) / 2)),
    y: Math.max(0, Math.round((height - winH) / 2)),
    frame: false,
    backgroundColor: '#FAF8F3',
    icon: path.join(__dirname, '../public/icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${port}`)
  }
  mainWindow.on('closed', () => { mainWindow = null })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false)
  })
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.on('ready', createWindow)
app.on('window-all-closed', () => {
  app.quit()
})

// 窗口控制 IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
