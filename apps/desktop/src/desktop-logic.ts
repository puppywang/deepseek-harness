import { timingSafeEqual } from 'node:crypto'
import { basename, join, resolve } from 'node:path'

export type OpenPathIntent = 'default' | 'text-editor'

const harnessReadyPattern = /dsh web:\s+(http:\/\/127\.0\.0\.1:\d+)/u

/**
 * Resolve the desktop Harness home. The default is deliberately below
 * Electron's per-user data directory, so profile-managed community plugins
 * never become files in the installed application or its resources folder.
 * @param configuredHome - optional explicit `DSH_HOME` override.
 * @param userDataPath - Electron's per-user application data directory.
 * @returns the absolute directory used as `DSH_HOME`.
 */
export function resolveHarnessHome(configuredHome: string | undefined, userDataPath: string): string {
  const configured = configuredHome?.trim()
  return configured === undefined || configured === ''
    ? join(resolve(userDataPath), 'dsh-home')
    : resolve(configured)
}

export function isAllowedUrl(candidate: string, allowedOrigin: string): boolean {
  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.origin === allowedOrigin
  } catch {
    return false
  }
}

export function isExternalUrl(candidate: string): boolean {
  try {
    const protocol = new URL(candidate).protocol
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

export function safeDownloadFilename(filename: string): string {
  const safe = basename(filename).replace(/[<>:"/\\|?*\u0000-\u001F]/gu, '_').trim()
  return safe === '' || safe === '.' || safe === '..' ? 'download' : safe
}

export function openPathRequest(value: unknown): { path: string; intent: OpenPathIntent } {
  if (typeof value !== 'object' || value === null) throw new Error('invalid path opener request')
  const request = value as { path?: unknown; intent?: unknown }
  if (typeof request.path !== 'string' || request.path === '' || request.path.includes('\u0000')) {
    throw new Error('invalid path opener path')
  }
  if (request.intent !== 'default' && request.intent !== 'text-editor') {
    throw new Error('invalid path opener intent')
  }
  return { path: request.path, intent: request.intent }
}

/** The Web profile prints this line after its Loader tree is ready; the desktop shell uses it as its readiness signal. */
export function parseHarnessReadyUrl(output: string): string | undefined {
  return harnessReadyPattern.exec(output)?.[1]
}

/**
 * Build the `dsh web` child argv. The desktop window is the only intended
 * surface, so the browser handoff the web bundle performs for terminal
 * launches stays suppressed.
 * @param cliEntry - absolute path of the deployed dsh CLI entry.
 * @returns the child process argv after the Node executable.
 */
export function harnessWebArgv(cliEntry: string): readonly string[] {
  return [cliEntry, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open']
}

export function hasExpectedToken(candidate: string | string[] | undefined, expected: string): boolean {
  if (typeof candidate !== 'string') return false
  const candidateBytes = Buffer.from(candidate, 'utf8')
  const expectedBytes = Buffer.from(expected, 'utf8')
  return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes)
}

export interface ProbeHttpReadyOptions {
  attempts?: number
  delayMs?: number
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export async function probeHttpReady(
  url: string,
  {
    attempts = 30,
    delayMs = 100,
    fetchImpl = fetch,
    timeoutMs = 1_000,
  }: ProbeHttpReadyOptions = {},
): Promise<void> {
  if (!Number.isInteger(attempts) || attempts < 1) throw new TypeError('probe attempts must be positive')
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('probe delay must be non-negative')
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new TypeError('probe timeout must be positive')

  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (response.ok) return
      lastError = new Error(`runtime health probe returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (attempt + 1 < attempts) {
      await new Promise<void>((resolveDelay) => { setTimeout(resolveDelay, delayMs) })
    }
  }

  throw new Error(
    `runtime URL did not accept HTTP requests: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
}
