import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const execFileAsync = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = resolve(process.env.DSH_DESKTOP_RUNTIME_ROOT ?? join(root, 'dist', 'desktop-runtime'))
const nodeRoot = resolve(process.env.DSH_DESKTOP_NODE_ROOT ?? join(root, 'dist', 'node-runtime'))
const nodeExecutable = join(nodeRoot, process.platform === 'win32' ? 'node.exe' : 'node')
const entry = join(runtimeRoot, 'lib', 'bin.js')
const startupTimeoutMs = 30_000
const requestTimeoutMs = 10_000

if (!existsSync(nodeExecutable)) throw new Error(`desktop runtime smoke: missing Node runtime: ${nodeExecutable}`)
if (!existsSync(entry)) throw new Error(`desktop runtime smoke: missing dsh entry: ${entry}`)

const smokeHome = mkdtempSync(join(tmpdir(), 'dsh-desktop-runtime-smoke-'))
const child = spawn(nodeExecutable, [entry, 'web', '--host', '127.0.0.1', '--port', '0'], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    DSH_HOME: smokeHome,
    DSH_TELEMETRY_DISABLED: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let output = ''
let readyUrl
let settled = false
let resolveReady
let rejectReady
const ready = new Promise((resolvePromise, rejectPromise) => {
  resolveReady = resolvePromise
  rejectReady = rejectPromise
})
const timer = setTimeout(() => {
  if (!settled) rejectReady(new Error(`dsh web startup timed out\n${output}`))
}, startupTimeoutMs)

const append = chunk => {
  output = `${output}${chunk.toString()}`.slice(-12_000)
  if (readyUrl === undefined) {
    readyUrl = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u.exec(output)?.[1]
    if (readyUrl !== undefined) resolveReady(readyUrl)
  }
}

child.stdout.on('data', append)
child.stderr.on('data', append)
child.once('error', error => rejectReady(error))
child.once('exit', (code, signal) => {
  if (readyUrl === undefined) {
    rejectReady(new Error(`dsh web exited before ready (code=${code ?? 'null'}, signal=${signal ?? 'null'})\n${output}`))
  }
})

async function stopChild() {
  clearTimeout(timer)
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32' && child.pid !== undefined) {
    try {
      await execFileAsync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
      return
    } catch {
      // Fall through to the portable signal path when taskkill cannot find the process.
    }
  }
  child.kill('SIGTERM')
  await new Promise(resolveExit => child.once('exit', resolveExit))
}

try {
  const url = await ready
  const controller = new AbortController()
  const requestTimer = setTimeout(() => controller.abort(), requestTimeoutMs)
  let response
  try {
    response = await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(requestTimer)
  }
  if (!response.ok) throw new Error(`dsh web returned HTTP ${response.status}`)
  const body = await response.arrayBuffer()
  console.log(`desktop runtime smoke: ${basename(entry)} served ${url} with HTTP ${response.status} (${body.byteLength} bytes)`)
} finally {
  settled = true
  await stopChild()
  rmSync(smokeHome, { recursive: true, force: true })
}
