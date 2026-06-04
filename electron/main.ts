import { app, BrowserWindow, ipcMain, screen } from 'electron'
import path from 'path'
import net from 'net'
import fs from 'fs'
import { spawn, ChildProcess } from 'child_process'

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let splashWindow: BrowserWindow | null = null
let serverModule: { closeStorage?: () => void } | null = null
let pythonProcess: ChildProcess | null = null

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

async function waitForHttpHealth(url: string, timeout = 30000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start <= timeout) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1000) })
      if (res.ok) return
    } catch {
      // Python may still be importing heavy modules.
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function getPythonCandidates(): Array<{ command: string; args: string[] }> {
  const configured = process.env.PYTHON_EXECUTABLE
  const candidates: Array<{ command: string; args: string[] }> = []
  if (configured) candidates.push({ command: configured, args: [] })
  if (process.platform === 'win32') candidates.push({ command: 'py', args: ['-3.13'] })
  candidates.push({ command: 'python', args: [] }, { command: 'python3', args: [] })
  return candidates
}

async function startPythonBackend(port: number): Promise<void> {
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(app.getAppPath(), 'backend')

  if (!fs.existsSync(path.join(backendDir, 'main.py'))) {
    throw new Error(`Python backend not found at ${backendDir}`)
  }

  const backendParent = path.dirname(backendDir)
  const userData = app.getPath('userData')
  const logDir = path.join(userData, 'logs')
  const dataDir = path.join(userData, 'data')
  fs.mkdirSync(logDir, { recursive: true })
  fs.mkdirSync(dataDir, { recursive: true })

  const logPath = path.join(logDir, 'python-core.log')
  const log = fs.createWriteStream(logPath, { flags: 'a' })
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH ? `${backendParent}${path.delimiter}${process.env.PYTHONPATH}` : backendParent,
    NOTE_FORGE_CONFIG_PATH: path.join(dataDir, 'config.json'),
    NOTE_FORGE_CORS_ORIGINS: '*',
  }

  let lastError: unknown = null
  for (const candidate of getPythonCandidates()) {
    const args = [
      ...candidate.args,
      '-m',
      'uvicorn',
      'backend.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
    ]

    const child = spawn(candidate.command, args, {
      cwd: userData,
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    pythonProcess = child
    log.write(`\n[${new Date().toISOString()}] Starting Python AI Core: ${candidate.command} ${args.join(' ')}\n`)
    child.stdout?.pipe(log, { end: false })
    child.stderr?.pipe(log, { end: false })

    try {
      await Promise.race([
        waitForHttpHealth(`http://127.0.0.1:${port}/health`),
        new Promise<void>((_, reject) => {
          child.once('error', reject)
          child.once('exit', (code, signal) => reject(new Error(`Python AI Core exited early: code=${code} signal=${signal}`)))
        }),
      ])
      return
    } catch (err) {
      lastError = err
      log.write(`[${new Date().toISOString()}] Python candidate failed: ${err instanceof Error ? err.message : String(err)}\n`)
      if (!child.killed) child.kill()
      pythonProcess = null
    }
  }

  throw new Error(
    `Failed to start Python AI Core. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}. Log: ${logPath}`
  )
}

function createSplash(): BrowserWindow {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const splashW = 400
  const splashH = 260
  const splash = new BrowserWindow({
    width: splashW,
    height: splashH,
    x: Math.round((width - splashW) / 2),
    y: Math.round((height - splashH) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'splash-preload.js'),
    },
  })
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
*{margin:0;padding:0;box-sizing:border-box}
body{display:flex;align-items:center;justify-content:center;height:100vh;
  background:rgba(250,248,243,0.95);border-radius:12px;overflow:hidden;
  font-family:"Noto Serif SC","Source Han Serif SC","Georgia",serif}
.wrap{display:flex;flex-direction:column;align-items:center;gap:14px}
.icon{font-size:48px;color:#5B7F6E;font-weight:700;
  text-shadow:0 2px 8px rgba(91,127,110,0.2)}
.title{font-size:18px;font-weight:600;color:#2C2C2C;letter-spacing:0.02em}
.spinner{width:32px;height:32px;border:3px solid rgba(91,127,110,0.2);
  border-top-color:#5B7F6E;border-radius:50%;animation:spin 0.8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.stage{font-size:13px;color:#5B7F6E;min-height:18px;text-align:center}
.hint{font-size:12px;color:#999;margin-top:2px}
.error-section{display:none;flex-direction:column;align-items:center;gap:12px}
.error-icon{font-size:28px;color:#D4574E}
.error-msg{font-size:13px;color:#666;text-align:center;max-width:300px;line-height:1.5}
.retry-btn{background:#5B7F6E;color:#fff;border:none;border-radius:6px;
  padding:8px 24px;font-size:13px;cursor:pointer;font-family:inherit}
.retry-btn:hover{background:#4A6B5A}
</style>
<script>
window.splashAPI.onStage(function(msg) {
  var el = document.getElementById('stage');
  if (el) el.textContent = msg;
});
window.splashAPI.onError(function(msg) {
  document.getElementById('normal-section').style.display = 'none';
  document.getElementById('error-section').style.display = 'flex';
  document.getElementById('error-msg').textContent = msg;
});
</script>
</head><body><div class="wrap">
<div class="icon">W</div>
<div class="title">Wonder</div>
<div id="normal-section">
  <div class="spinner"></div>
  <div class="stage" id="stage">启动中...</div>
  <div class="hint">正在启动，请稍候</div>
</div>
<div class="error-section" id="error-section">
  <div class="error-icon">✕</div>
  <div class="error-msg" id="error-msg"></div>
  <button class="retry-btn" onclick="window.splashAPI.retry()">重试启动</button>
</div>
</div></body></html>`))
  return splash
}

function sendSplashStage(msg: string) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:stage', msg)
  }
}

function sendSplashError(msg: string) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.send('splash:error', msg)
  }
}

async function startApp() {
  const port = await findFreePort()
  const pythonPort = await findFreePort()

  // Set env vars before loading server module
  process.env.PORT = String(port)
  process.env.DATA_DIR = path.join(app.getPath('userData'), 'data')
  process.env.PYTHON_BACKEND_URL = `http://127.0.0.1:${pythonPort}`

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

  // Stage 1: Python backend
  sendSplashStage('启动 AI 后端...')
  try {
    await startPythonBackend(pythonPort)
  } catch (err) {
    console.error('Failed to start Python AI Core:', err)
    sendSplashError(`AI 后端启动失败\n${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // Stage 2: Node server
  sendSplashStage('启动服务...')
  try {
    serverModule = require(path.join(__dirname, '../dist-server/server/index.js'))
  } catch (err) {
    console.error('Failed to start server:', err)
    sendSplashError(`服务启动失败\n${err instanceof Error ? err.message : String(err)}`)
    return
  }

  try {
    await waitForServer(port)
  } catch (err) {
    console.error('Server did not start in time:', err)
    sendSplashError(`服务启动超时（15s）\n${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // Stage 3: Load main window
  sendSplashStage('加载界面...')
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
    show: false,
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

  // Close splash when main window is ready to show
  mainWindow.on('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close()
      splashWindow = null
    }
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximize-change', true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximize-change', false)
  })
}

async function createWindow() {
  splashWindow = createSplash()
  await startApp()
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

app.on('before-quit', () => {
  try {
    serverModule?.closeStorage?.()
  } catch {
    // Best-effort cleanup — don't block quit on storage close failure
  }
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill()
    pythonProcess = null
  }
  app.exit(0)
})

// 窗口控制 IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

ipcMain.on('splash:retry', async () => {
  // Cleanup previous attempt
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
    mainWindow = null
  }
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill()
    pythonProcess = null
  }
  serverModule = null

  // Reset splash to normal state
  sendSplashStage('启动中...')

  // Re-run startup
  try {
    await startApp()
  } catch (err) {
    console.error('Retry failed:', err)
    sendSplashError(`重试失败: ${err instanceof Error ? err.message : String(err)}`)
  }
})
