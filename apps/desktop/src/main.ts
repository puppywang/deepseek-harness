import { execFile, spawn, type ChildProcessByStdio } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { TextDecoder, promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import type { BrowserWindow as BrowserWindowType, Event as ElectronEvent, MessageBoxOptions } from 'electron'
import type { AppUpdater } from 'electron-updater'
import {
  hasExpectedToken,
  isAllowedUrl,
  isExternalUrl,
  openPathRequest,
  parseHarnessReadyUrl,
  probeHttpReady,
  resolveHarnessHome,
  safeDownloadFilename,
  type OpenPathIntent,
} from './desktop-logic.js'
import { buildContextMenuTemplate } from './context-menu.js'
import { buildApplicationMenuTemplate } from './menu.js'
import { stopChildProcess } from './process-lifecycle.js'

const require = createRequire(import.meta.url)
const { app, BrowserWindow, clipboard, dialog, Menu, session, shell } = require('electron') as typeof import('electron')

const execFileAsync = promisify(execFile)
const developmentRoot = fileURLToPath(new URL('../../../', import.meta.url))
const startupTimeoutMs = 90_000
const shutdownTimeoutMs = 5_000
const startupAttemptLimit = 3
const runtimeRestartLimit = 3
const runtimeRestartBaseDelayMs = 500
const desktopPickerPath = '/__dsh_electron__/pick-directory'
const desktopPickerTokenHeader = 'x-dsh-electron-picker-token'
const desktopOpenPath = '/__dsh_electron__/open-path'
const desktopOpenPathTokenHeader = 'x-dsh-electron-open-path-token'
const bridgeBodyLimit = 64 * 1024
type HarnessProcess = ChildProcessByStdio<null, Readable, Readable>

interface DesktopBridge {
  server: Server
  pickerUrl: string
  pickerToken: string
  openPathUrl: string
  openPathToken: string
}

let mainWindow: BrowserWindowType | null = null
let harnessProcess: HarnessProcess | null = null
let harnessUrl: string | null = null
let desktopBridge: DesktopBridge | null = null
let stopping = false
let stopPromise: Promise<void> | null = null
let harnessRestartTimer: ReturnType<typeof setTimeout> | null = null
let harnessRestartAttempts = 0

function packagedRuntimeRoot(): string | undefined {
  if (!app.isPackaged) return undefined
  return join(process.resourcesPath, 'dsh-runtime')
}

function harnessRuntimeRoot(): string {
  const configuredRoot = process.env.DSH_RUNTIME_ROOT?.trim()
  if (configuredRoot) return resolve(configuredRoot)
  return packagedRuntimeRoot() ?? developmentRoot
}

function resolveCliEntry(): string {
  const configuredEntry = process.env.DSH_CLI_ENTRY?.trim()
  const runtimeRoot = harnessRuntimeRoot()
  const candidates = [
    configuredEntry ? resolve(configuredEntry) : undefined,
    join(runtimeRoot, 'lib', 'bin.js'),
    join(developmentRoot, 'apps', 'cli', 'lib', 'bin.js'),
    join(app.getAppPath(), 'apps', 'cli', 'lib', 'bin.js'),
    join(app.getAppPath(), '..', 'cli', 'lib', 'bin.js'),
  ].filter((candidate): candidate is string => candidate !== undefined)

  const entry = candidates.find(candidate => existsSync(candidate))
  if (entry) return entry

  throw new Error(
    `找不到 dsh CLI 构建产物。请先运行 pnpm run build && pnpm run desktop:runtime，或运行 pnpm desktop:package；也可以设置 DSH_CLI_ENTRY。\n\n查找路径：\n${candidates.join('\n')}`,
  )
}

function harnessHomePath(): string {
  const home = resolveHarnessHome(process.env.DSH_HOME, app.getPath('userData'))
  mkdirSync(home, { recursive: true })
  return home
}

function nodeExecutable(): string {
  const configuredNode = process.env.DSH_NODE_BIN?.trim()
  if (configuredNode) return resolve(configuredNode)
  const bundledNode = join(
    process.resourcesPath,
    'node-runtime',
    process.platform === 'win32' ? 'node.exe' : 'node',
  )
  if (app.isPackaged && existsSync(bundledNode)) return bundledNode
  if (process.env.npm_node_execpath?.trim()) return process.env.npm_node_execpath
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

function showExternalOpenError(error: unknown): void {
  void dialog.showMessageBox({
    type: 'error',
    title: '无法打开外部链接',
    message: '系统浏览器无法打开该链接。',
    detail: error instanceof Error ? error.message : String(error),
  })
}

function openExternalUrl(url: string): void {
  void shell.openExternal(url).catch(showExternalOpenError)
}

function installDownloadHandling(): void {
  session.defaultSession.on('will-download', (_event, item, webContents) => {
    if (mainWindow === null || webContents !== mainWindow.webContents) return
    const filename = safeDownloadFilename(item.getFilename())
    item.setSaveDialogOptions({
      title: '保存 DeepSeek Harness 下载',
      defaultPath: join(app.getPath('downloads'), filename),
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })
  })
}

function installContextMenu(window: BrowserWindowType): void {
  window.webContents.on('context-menu', (event, params) => {
    event.preventDefault()
    const menu = Menu.buildFromTemplate(buildContextMenuTemplate(params, {
      copyText: (text) => { clipboard.writeText(text) },
      openExternal: openExternalUrl,
      reload: () => {
        if (!window.isDestroyed()) window.webContents.reload()
      },
    }))
    menu.popup({ window })
  })
}

function installAutoUpdater(): void {
  if (
    !app.isPackaged
    || process.env.DSH_DISABLE_AUTO_UPDATE !== undefined
    || process.platform === 'linux'
  ) return
  try {
    const updaterModule = require('electron-updater') as { autoUpdater?: AppUpdater }
    const updater = updaterModule.autoUpdater
    if (updater === undefined) throw new Error('electron-updater did not expose autoUpdater')
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.on('checking-for-update', () => {
      console.log('[updater] checking for updates')
    })
    updater.on('update-available', (info) => {
      console.log(`[updater] update available: ${info.version}`)
    })
    updater.on('update-not-available', (info) => {
      console.log(`[updater] already current: ${info.version}`)
    })
    updater.on('download-progress', (progress) => {
      console.log(`[updater] download ${progress.percent.toFixed(1)}%`)
    })
    updater.on('update-downloaded', (info) => {
      console.log(`[updater] update downloaded: ${info.version}; it will install when the app quits`)
      const prompt: MessageBoxOptions = {
        type: 'info',
        title: 'DeepSeek Harness 更新已下载',
        message: `版本 ${info.version} 已准备完成。`,
        detail: '现在重启应用即可完成更新，也可以稍后退出时自动安装。',
        buttons: ['立即重启更新', '稍后'],
        defaultId: 0,
        cancelId: 1,
      }
      const showPrompt = mainWindow === null
        ? dialog.showMessageBox(prompt)
        : dialog.showMessageBox(mainWindow, prompt)
      void showPrompt.then((result) => {
        if (result.response === 0 && !stopping) updater.quitAndInstall(false, true)
      }).catch((error: unknown) => {
        console.error('[updater] update prompt failed', error)
      })
    })
    updater.on('error', (error: unknown) => {
      console.error('[updater] update failed', error)
    })
    void updater.checkForUpdates().catch((error: unknown) => {
      console.error('[updater] update check failed', error)
    })
  } catch (error) {
    console.error('[updater] initialization failed', error)
  }
}

function sendJson(response: import('node:http').ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function openElectronDirectory(): Promise<string | null> {
  if (mainWindow === null) throw new Error('Electron window is not ready')
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Workspace Directory',
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0] ?? null
}

async function readJsonBody(request: import('node:http').IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) {
    body += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    if (Buffer.byteLength(body, 'utf8') > bridgeBodyLimit) {
      throw new Error('bridge request body is too large')
    }
  }
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new Error('bridge request body is not valid JSON')
  }
}

async function openElectronPath(path: string, intent: OpenPathIntent): Promise<void> {
  if (mainWindow === null) throw new Error('Electron window is not ready')
  if (intent === 'text-editor' && process.platform === 'darwin') {
    await execFileAsync('open', ['-t', path])
    return
  }
  const error = await shell.openPath(path)
  if (error !== '') throw new Error(error)
}

async function startDesktopBridge(): Promise<DesktopBridge> {
  const pickerToken = randomBytes(32).toString('hex')
  const openPathToken = randomBytes(32).toString('hex')
  const server = createServer((request, response) => {
    const isPicker = request.method === 'POST' && request.url === desktopPickerPath
      && hasExpectedToken(request.headers[desktopPickerTokenHeader], pickerToken)
    const isOpenPath = request.method === 'POST' && request.url === desktopOpenPath
      && hasExpectedToken(request.headers[desktopOpenPathTokenHeader], openPathToken)
    if (!isPicker && !isOpenPath) {
      request.resume()
      sendJson(response, 404, { error: 'not found' })
      return
    }
    if (isPicker) {
      request.resume()
      void openElectronDirectory().then(
        (path) => { sendJson(response, 200, { path }) },
        (error: unknown) => {
          sendJson(response, 500, {
            error: error instanceof Error ? error.message : String(error),
          })
        },
      )
      return
    }
    void readJsonBody(request).then((body) => {
      const { path, intent } = openPathRequest(body)
      return openElectronPath(path, intent)
    }).then(
      () => { sendJson(response, 200, { opened: true }) },
      (error: unknown) => {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : String(error),
        })
      },
    )
  })
  await new Promise<void>((resolveServer, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolveServer()
    })
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('Electron desktop bridge did not receive a TCP address')
  }
  const port = (address).port
  return {
    server,
    pickerToken,
    pickerUrl: `http://127.0.0.1:${port}${desktopPickerPath}`,
    openPathToken,
    openPathUrl: `http://127.0.0.1:${port}${desktopOpenPath}`,
  }
}

async function stopDesktopBridge(): Promise<void> {
  const bridge = desktopBridge
  desktopBridge = null
  if (bridge === null || !bridge.server.listening) return
  bridge.server.closeAllConnections()
  await new Promise<void>((resolveServer) => {
    bridge.server.close(() => { resolveServer() })
  })
}

async function terminateHarnessProcess(child: HarnessProcess): Promise<void> {
  await stopChildProcess(child, {
    platform: process.platform,
    timeoutMs: shutdownTimeoutMs,
    terminateProcessTree: async (pid) => {
      await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
      })
    },
  })
}

function waitForMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => { setTimeout(resolveDelay, milliseconds) })
}

async function startHarnessAttempt(bridge: DesktopBridge): Promise<string> {
  const cliEntry = resolveCliEntry()
  const child = spawn(
    nodeExecutable(),
    [cliEntry, 'web', '--host', '127.0.0.1', '--port', '0'],
    {
      cwd: harnessRuntimeRoot(),
      env: {
        ...process.env,
        DSH_HOME: harnessHomePath(),
        DSH_ELECTRON_PICKER_URL: bridge.pickerUrl,
        DSH_ELECTRON_PICKER_TOKEN: bridge.pickerToken,
        DSH_ELECTRON_OPEN_PATH_URL: bridge.openPathUrl,
        DSH_ELECTRON_OPEN_PATH_TOKEN: bridge.openPathToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  harnessProcess = child

  return new Promise<string>((resolveUrl, reject) => {
    let ready = false
    let settled = false
    let probeInFlight = false
    let startupOutput = ''
    const timer = setTimeout(() => {
      failBeforeHarnessReady(
        new Error(
          `等待 dsh web 启动超时。\n\n最近输出：\n${startupOutput || '(无输出)'}`,
        ),
      )
    }, startupTimeoutMs)

    const settleFailure = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void terminateHarnessProcess(child)
        .catch(() => {})
        .finally(() => { reject(error) })
    }

    const failBeforeHarnessReady = (error: Error): void => {
      settleFailure(error)
    }

    const appendOutput = (chunk: unknown, isError: boolean): void => {
      const output = typeof chunk === 'string'
        ? chunk
        : chunk instanceof Uint8Array
          ? new TextDecoder().decode(chunk)
          : ''
      startupOutput = `${startupOutput}${output}`.slice(-8_000)
      const log = isError ? console.error : console.log
      log(`[dsh] ${output.trimEnd()}`)
    }

    const acceptReadyUrl = (url: string): void => {
      if (settled || ready) return
      ready = true
      settled = true
      clearTimeout(timer)
      resolveUrl(url)
    }

    const probeReadyUrl = (url: string): void => {
      if (probeInFlight || settled || ready) return
      probeInFlight = true
      void probeHttpReady(url).then(
        () => { acceptReadyUrl(url) },
        (error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error)
          failBeforeHarnessReady(new Error(`dsh web 已输出地址，但 HTTP 服务未就绪：${detail}`))
        },
      )
    }

    child.stdout.on('data', (chunk: unknown) => {
      appendOutput(chunk, false)
      if (settled || probeInFlight) return
      const readyUrl = parseHarnessReadyUrl(startupOutput)
      if (readyUrl !== undefined) probeReadyUrl(readyUrl)
    })
    child.stderr.on('data', (chunk: unknown) => { appendOutput(chunk, true) })
    child.on('error', (error) => {
      if (!ready) {
        failBeforeHarnessReady(error)
        return
      }
      console.error('[dsh] 子进程错误', error)
    })
    child.on('exit', (code, signal) => {
      if (harnessProcess === child) harnessProcess = null
      if (!ready) {
        failBeforeHarnessReady(new Error(
          `dsh web 在就绪前退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）。\n\n最近输出：\n${startupOutput || '(无输出)'}`,
        ))
        return
      }
      if (!stopping) {
        // A zero exit while the app is running is the harness exiting on its
        // own request (the plugin manager's confirmed restart), not a crash:
        // it resets the crash-restart budget so the user's restarts never
        // exhaust the bounded auto-recovery attempts. Only a crash (nonzero)
        // consumes an attempt.
        if (code === 0) harnessRestartAttempts = 0
        scheduleHarnessRestart(
          bridge,
          new Error(
            code === 0
              ? 'dsh web 已按请求退出，正在重启'
              : `dsh web 子进程意外退出（code=${code ?? 'null'}, signal=${signal ?? 'null'}）`,
          ),
        )
      }
    })
  })
}

async function startHarness(bridge: DesktopBridge): Promise<string> {
  harnessRestartAttempts = 0
  let lastError: unknown
  for (let attempt = 0; attempt < startupAttemptLimit; attempt += 1) {
    if (attempt > 0) await waitForMilliseconds(runtimeRestartBaseDelayMs * 2 ** (attempt - 1))
    try {
      return await startHarnessAttempt(bridge)
    } catch (error) {
      lastError = error
      console.error(`[dsh] 启动尝试 ${attempt + 1}/${startupAttemptLimit} 失败`, error)
    }
  }
  throw lastError instanceof Error
    ? new Error(`dsh web 连续 ${startupAttemptLimit} 次启动失败：${lastError.message}`)
    : new Error(`dsh web 连续 ${startupAttemptLimit} 次启动失败：${String(lastError)}`)
}

function scheduleHarnessRestart(bridge: DesktopBridge, cause: Error): void {
  if (stopping || harnessRestartTimer !== null) return
  if (harnessRestartAttempts >= runtimeRestartLimit) {
    void dialog
      .showMessageBox({
        type: 'error',
        title: 'DeepSeek Harness 运行时失败',
        message: 'dsh web 多次自动重启仍未恢复。',
        detail: cause.message,
      })
      .finally(() => { app.quit() })
    return
  }

  const attempt = harnessRestartAttempts
  harnessRestartAttempts += 1
  const delay = Math.min(15_000, runtimeRestartBaseDelayMs * 3 ** attempt)
  console.error(`[dsh] 将在 ${delay}ms 后进行第 ${harnessRestartAttempts}/${runtimeRestartLimit} 次自动重启`, cause)
  harnessRestartTimer = setTimeout(() => {
    harnessRestartTimer = null
    void startHarnessAttempt(bridge).then((url) => {
      harnessUrl = url
      if (!mainWindow || mainWindow.isDestroyed()) return
      void mainWindow.loadURL(url).catch((error: unknown) => {
        console.error('[dsh] 自动重启后加载页面失败', error)
        void dialog
          .showMessageBox({
            type: 'error',
            title: 'DeepSeek Harness 加载失败',
            message: 'dsh web 已重启，但桌面窗口无法加载新页面。',
            detail: error instanceof Error ? error.message : String(error),
          })
          .finally(() => { app.quit() })
      })
    }).catch((error: unknown) => {
      const reason = error instanceof Error ? error : new Error(String(error))
      scheduleHarnessRestart(bridge, reason)
    })
  }, delay)
}

async function stopHarness(): Promise<void> {
  if (stopPromise) return stopPromise

  if (harnessRestartTimer !== null) {
    clearTimeout(harnessRestartTimer)
    harnessRestartTimer = null
  }

  stopPromise = (async () => {
    const child = harnessProcess
    harnessProcess = null
    if (!child || child.exitCode !== null || child.signalCode !== null) return
    await terminateHarnessProcess(child)
  })()

  return stopPromise
}

function installPermissionHandling(): void {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  // The Web UI's copy controls use navigator.clipboard.writeText, which rejects
  // with no execCommand fallback when the clipboard-sanitized-write check is
  // denied; this handler grants only that check and denies everything else.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return permission === 'clipboard-sanitized-write'
  })
}

function installApplicationMenu(): void {
  const template = buildApplicationMenuTemplate({
    platform: process.platform,
    zh: app.getLocale().toLowerCase().startsWith('zh'),
    developerTools: process.argv.includes('--dev') || !app.isPackaged,
    openExternal: openExternalUrl,
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createMainWindow(url: string): void {
  const allowedOrigin = new URL(url).origin
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#111318',
    // Windows and Linux hide the menu bar until Alt is pressed, keeping the
    // product surface in the Web UI; macOS ignores this and keeps its menu.
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window

  const handleNavigation = (event: ElectronEvent, navigationUrl: string): void => {
    if (isAllowedUrl(navigationUrl, allowedOrigin)) return
    event.preventDefault()
    if (isExternalUrl(navigationUrl)) openExternalUrl(navigationUrl)
  }
  window.webContents.on('will-navigate', handleNavigation)
  window.webContents.on('will-redirect', handleNavigation)
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) openExternalUrl(url)
    return { action: 'deny' }
  })
  installContextMenu(window)
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null
  })

  void window.loadURL(url).catch((error: unknown) => {
    console.error('加载 dsh web 失败', error)
    void dialog
      .showMessageBox({
        type: 'error',
        title: 'DeepSeek Harness 加载失败',
        message: '桌面窗口无法加载 dsh web。',
        detail: error instanceof Error ? error.message : String(error),
      })
      .finally(() => { app.quit() })
  })

  if (process.argv.includes('--dev')) window.webContents.openDevTools({ mode: 'detach' })
}

async function showStartupError(error: unknown): Promise<void> {
  await dialog.showMessageBox({
    type: 'error',
    title: 'DeepSeek Harness 启动失败',
    message: '桌面版无法启动 dsh web。',
    detail: error instanceof Error ? error.message : String(error),
  })
}

async function boot(): Promise<void> {
  try {
    installPermissionHandling()
    installApplicationMenu()
    desktopBridge = await startDesktopBridge()
    installDownloadHandling()
    harnessUrl = await startHarness(desktopBridge)
    createMainWindow(harnessUrl)
    installAutoUpdater()
  } catch (error) {
    await stopDesktopBridge()
    await showStartupError(error)
    app.quit()
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('before-quit', (event) => {
    if (stopping) return
    event.preventDefault()
    stopping = true
    void Promise.all([stopHarness(), stopDesktopBridge()]).finally(() => { app.exit(0) })
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('activate', () => {
    if (!mainWindow && harnessUrl) createMainWindow(harnessUrl)
  })
  void app.whenReady().then(boot)
}
