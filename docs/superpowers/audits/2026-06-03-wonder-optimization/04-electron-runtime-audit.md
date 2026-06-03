# Electron Runtime Optimization Audit

**Date:** 2026-06-03
**Scope:** Electron startup, preload, packaging, process lifecycle, desktop smoke paths, packaged resource assumptions
**Files reviewed:** `electron/main.ts`, `electron/preload.ts`, `electron-builder.yml`, `installer.nsi`, `scripts/after-pack.js`, `package.json`, `vite.config.ts`, `tsconfig.electron.json`, `server/index.ts`, `server/services/storage.ts`, `server/services/python-backend.ts`, `server/db/schema.sql`

---

## 1. Startup & Shutdown Lifecycle

### 1.1 Single Instance Lock

**File:** `electron/main.ts:6-10`

```ts
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) { app.quit() }
```

**Status:** Correct. Prevents duplicate instances. The `second-instance` handler restores and focuses the existing window.

### 1.2 Server Startup Architecture

**File:** `electron/main.ts:64-71`

The Node gateway server is loaded **in-process** via `require()` — no child process spawn. This is a deliberate design to avoid requiring a system-level Node installation.

```ts
require(path.join(__dirname, '../dist-server/server/index.js'))
```

**Findings:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-01 | `require()` failure calls `app.quit()` but shows no user-visible error dialog. Silent failure leaves user confused. | Medium | `electron/main.ts:67-70` — add `dialog.showErrorBox()` before `app.quit()` |
| F-02 | Server startup timeout (15s) rejection also silently quits. | Medium | `electron/main.ts:73-79` — same fix, add error dialog |
| F-03 | No maximum retry or fallback if port discovery fails. `findFreePort()` could theoretically hang if `net.createServer()` fails. | Low | `electron/main.ts:17-25` — wrap in try/catch, add timeout |

### 1.3 Shutdown & Cleanup

**File:** `electron/main.ts:125-127`

```ts
app.on('window-all-closed', () => { app.quit() })
```

**Findings:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-04 | `StorageService.close()` is never called on shutdown. SQLite WAL journal may not checkpoint cleanly. | Medium | `server/services/storage.ts:680-682` — `close()` exists but is never invoked from main process |
| F-05 | No `before-quit` handler. The in-process server has no graceful shutdown path — Hono `serve()` is never stopped. | Low | On Windows `app.quit()` terminates the process; WAL mode mitigates data loss risk, but clean shutdown is preferable |
| F-06 | `mainWindow` is nulled on `closed` event but not on quit. If quit fires before `closed`, the reference is stale. | Low | `electron/main.ts:107` — not a functional bug, just untidy |

### 1.4 Port & Host Binding

**File:** `electron/main.ts:17-25`, `server/index.ts:127`

- Port discovery uses `net.createServer()` on `127.0.0.1:0` — correct, avoids conflicts.
- Server binds to `127.0.0.1` — correct, not exposed to network.
- `process.env.PORT` is set before `require()` — correct sequencing.

**No issues found.**

---

## 2. Preload & IPC Security

### 2.1 BrowserWindow Configuration

**File:** `electron/main.ts:85-100`

```ts
webPreferences: {
  preload: path.join(__dirname, 'preload.js'),
  contextIsolation: true,
  nodeIntegration: false,
}
```

**Status:** Correct. `contextIsolation: true` and `nodeIntegration: false` follow Electron security best practices.

### 2.2 Preload API Surface

**File:** `electron/preload.ts:3-13`

Exposed API:
- `minimizeWindow()` — `ipcRenderer.send`
- `maximizeWindow()` — `ipcRenderer.send`
- `closeWindow()` — `ipcRenderer.send`
- `onMaximizeChange(callback)` — returns cleanup function
- `isElectron` — boolean flag

**Findings:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-07 | No IPC validation. Preload trusts renderer input blindly. If renderer is compromised (XSS), attacker can minimize/maximize/close the window. Impact is low (window control only). | Low | Current API surface is narrow; risk is acceptable. If `invoke` handlers are added later, validate all inputs. |
| F-08 | `onMaximizeChange` cleanup function is good — prevents listener leaks. | Info | No action needed |

### 2.3 Frameless Window

**File:** `electron/main.ts:92`

`frame: false` — the window has no native title bar. Window controls are handled via IPC. This is a design choice, not a bug.

**No issues found.**

---

## 3. Packaging Configuration

### 3.1 electron-builder.yml

**File:** `electron-builder.yml`

```yaml
files:
  - dist/
  - dist-electron/
  - dist-server/
  - node_modules/
  - package.json
  - public/
asarUnpack:
  - node_modules/better-sqlite3/**
  - dist/renderer/**
```

**Findings:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-09 | `public/` is included in packaged files. Contains `icon.ico` — used for window icon at `electron/main.ts:94`. This is correct but the icon path uses `__dirname/../public/icon.ico` which resolves inside asar. Verify it works in packaged mode. | Low | Manual smoke test: packaged app should show correct icon |
| F-10 | `dist/renderer` is in `asarUnpack`. The main process extracts it to `userData/static` at startup (`main.ts:51-61`). This means the renderer is stored twice: once in asar.unpacked, once in userData. | Low | Functional but doubles disk usage for renderer assets |
| F-11 | `npmRebuild: false` — `electron-rebuild` is run manually in build scripts. This is fine but means `build:electron` and `build:installer` scripts must be run in exact order. | Info | `package.json:11-12` |
| F-12 | `afterPack` script depends on `electron-winstaller/vendor/rcedit.exe`. If `electron-winstaller` is not installed (it's not in dependencies), this will fail silently. | Medium | `scripts/after-pack.js:6` — `rcedit` path assumes `electron-winstaller` exists in node_modules |

### 3.2 NSIS Installer (Legacy/Dead Code)

**File:** `installer.nsi`

**Critical Finding:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-13 | `installer.nsi` references **Tauri** paths (`src-tauri/target/release/note-forge.exe`, `src-tauri/icons/icon.ico`). This file is from a previous project incarnation and is **not used** by the current Electron build. The `electron-builder.yml` nsis section handles installer generation. | Info | This file is dead code. Consider removing to avoid confusion. |

### 3.3 after-pack.js

**File:** `scripts/after-pack.js`

Uses `rcedit.exe` to set version info and icon on the packaged exe.

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-14 | `rcedit` path: `node_modules/electron-winstaller/vendor/rcedit.exe`. `electron-winstaller` is not in `package.json` dependencies. If it happens to be installed as a transitive dependency, this works; otherwise it fails. | Medium | Check if `electron-winstaller` exists in node_modules after `npm install` |
| F-15 | Error is caught and logged but does not fail the build. Version info will be missing from exe if rcedit is unavailable. | Low | `scripts/after-pack.js:22-23` — `console.error` only, no `process.exit(1)` |

---

## 4. Packaged Resource Assumptions

### 4.1 Static File Extraction

**File:** `electron/main.ts:50-62`

```ts
const rendererSource = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'renderer')
  : path.join(app.getAppPath(), 'dist', 'renderer')
```

Version-checked extraction: static files are copied to `userData/static` only when the app version changes.

**Findings:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-16 | `fs.cpSync` with `{ recursive: true }` copies entire renderer directory. If renderer is large, first launch after update will be slow. | Low | Monitor first-launch time after version bump |
| F-17 | `fs.rmSync(staticDir, { recursive: true, force: true })` deletes old static files before copying new ones. If copy fails midway, static dir is corrupted. | Low | Edge case: power loss during copy. Consider atomic swap (copy to temp, rename). |

### 4.2 SQLite Schema

**File:** `server/services/storage.ts:177-186`

```ts
const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8')
```

Schema is read from `dist-server/server/db/schema.sql` (relative to compiled output). The build script copies `server/db` to `dist-server/server/db` (`package.json:10`).

**Status:** Correct. Schema uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` — safe for repeated execution. Runtime migrations in `migrateDocumentLifecycle()` handle column additions.

### 4.3 Python AI Core Availability

**File:** `server/services/python-backend.ts`

The Python AI Core is an **external process** (default `http://127.0.0.1:8000`). It is NOT managed by Electron — no spawn, no lifecycle control.

**Findings:**

| # | Finding | Severity | Verification |
|---|---------|----------|-------------|
| F-18 | If Python AI Core is not running, all analysis/QA/discovery features fail with `PythonBackendUnavailableError`. The frontend should surface this gracefully. | Info | Health check endpoint exists at `/api/health/ai-core` |
| F-19 | `PYTHON_BACKEND_URL` env var defaults to `http://127.0.0.1:8000`. In packaged mode, this env var is not set by main.ts. The default works if Python runs on same machine. | Info | Verify Python AI Core is expected to run locally in production |

### 4.4 Data Directory

**File:** `electron/main.ts:48`

```ts
process.env.DATA_DIR = path.join(app.getPath('userData'), 'data')
```

- **Installer mode:** `%APPDATA%/Wonder/data/` — correct, persists across updates.
- **Portable mode:** Same path. If the app is run from a USB drive, data still goes to `%APPDATA%`. This is standard Electron behavior but may surprise portable-mode users.

**No blocking issues.**

---

## 5. TypeScript Compilation

```powershell
npx tsc -p tsconfig.electron.json --noEmit
```

**Result:** Passes cleanly. No type errors.

---

## 6. Manual Smoke Test Steps

These cannot be safely automated and should be verified manually.

### Smoke 1: First Launch (Clean State)

1. Delete `%APPDATA%/Wonder/` (or rename as backup)
2. Launch the packaged app (`electron-builder --win dir` output)
3. **Expected:** App starts, shows main window, no error dialogs
4. **Verify:** `%APPDATA%/Wonder/data/wonder.db` exists, `%APPDATA%/Wonder/static/` contains renderer files with `.version` marker

### Smoke 2: Server Failure

1. Rename `dist-server/server/index.js` to `index.js.bak`
2. Launch the app
3. **Expected:** App should show error dialog and quit (currently it quits silently — F-01)
4. Restore the file after test

### Smoke 3: Port Conflict

1. Start a listener on a random port before launching the app
2. **Expected:** App finds a different free port — `findFreePort()` uses port 0, so conflicts are unlikely. Verify app starts normally.

### Smoke 4: Python AI Core Unavailable

1. Ensure no Python process is running on port 8000
2. Launch the app, navigate to an analysis feature
3. **Expected:** Feature fails gracefully, health check at `/api/health/ai-core` returns `{"status":"unavailable"}`

### Smoke 5: Version Upgrade

1. Launch app with version 0.2.0
2. Change `package.json` version to 0.2.1
3. Rebuild and launch
4. **Expected:** `%APPDATA%/Wonder/static/.version` updates to 0.2.1, static files re-extracted

### Smoke 6: Window Controls

1. Launch app, click minimize/maximize/close buttons
2. **Expected:** Custom frameless window controls work correctly
3. **Verify:** Maximize state change is reflected in UI (restore button toggles)

### Smoke 7: Single Instance

1. Launch app
2. Try to launch again
3. **Expected:** Second instance quits, first instance window is focused/restored

---

## 7. Summary of Findings

| ID | Finding | Severity | Suggested Fix |
|----|---------|----------|---------------|
| F-01 | Server startup failure silently quits | Medium | Add `dialog.showErrorBox()` before `app.quit()` |
| F-02 | Server timeout silently quits | Medium | Same as F-01 |
| F-03 | `findFreePort()` has no error handling | Low | Wrap in try/catch with timeout |
| F-04 | `StorageService.close()` never called on shutdown | Medium | Add `before-quit` handler to close DB |
| F-05 | No graceful server shutdown | Low | Store server reference, call close on quit |
| F-06 | `mainWindow` ref not cleaned on quit | Low | Cosmetic, no functional impact |
| F-07 | No IPC input validation | Low | Acceptable for current narrow API surface |
| F-10 | Renderer stored twice (asar + userData) | Low | Functional trade-off for serving static files |
| F-12 | `after-pack.js` depends on missing `electron-winstaller` | Medium | Add `electron-winstaller` to devDependencies or vendor rcedit directly |
| F-13 | `installer.nsi` is dead Tauri-era code | Info | Remove file |
| F-14 | rcedit path assumes `electron-winstaller` installed | Medium | Same as F-12 |
| F-15 | after-pack error does not fail build | Low | Consider `process.exit(1)` on critical failure |
| F-16 | Large renderer slows first launch after update | Low | Acceptable; monitor with real data |
| F-17 | Non-atomic static file replacement | Low | Use temp dir + rename for atomicity |
| F-18 | Python AI Core failure not surfaced in UI | Info | Frontend responsibility; health endpoint exists |
| F-19 | PYTHON_BACKEND_URL not set in packaged mode | Info | Default `127.0.0.1:8000` works for local deployment |

**Medium severity:** F-01, F-02, F-04, F-12, F-14
**Low severity:** F-03, F-05, F-06, F-07, F-10, F-15, F-16, F-17
**Info:** F-13, F-18, F-19
