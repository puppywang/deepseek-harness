/** Optional Electron desktop-shell bridge for native path opening. */

const BRIDGE_URL_ENV = 'DSH_ELECTRON_OPEN_PATH_URL'
const BRIDGE_TOKEN_ENV = 'DSH_ELECTRON_OPEN_PATH_TOKEN'
const TOKEN_HEADER = 'x-dsh-electron-open-path-token'

/** Native path-open intent understood by the Host opener. */
export type ElectronPathOpenIntent = 'default' | 'text-editor'

/** Electron shell endpoint and bearer token passed to the Host child. */
export interface ElectronPathOpenBridge {
  url: string
  token: string
}

/** Testable fetch boundary for the shell bridge. */
export type ElectronPathOpenFetch = typeof fetch

/**
 * Resolve the optional bridge configured by the Electron desktop shell.
 * @returns the bridge when both environment values are non-blank, otherwise undefined.
 */
export function electronPathOpenBridgeFromEnv(): ElectronPathOpenBridge | undefined {
  const url = process.env[BRIDGE_URL_ENV]?.trim()
  const token = process.env[BRIDGE_TOKEN_ENV]?.trim()
  if (url === undefined || url === '' || token === undefined || token === '') return undefined
  return { url, token }
}

/**
 * Ask the Electron main process to open a Host-resolved path.
 * @param bridge - loopback endpoint and token supplied by the desktop shell.
 * @param path - absolute or Host-resolvable path selected by the Host.
 * @param intent - default association or text-editor handoff.
 * @param signal - caller/connection lifetime.
 * @param fetcher - injectable fetch implementation for tests.
 * @returns after Electron accepts the open request.
 */
export async function openElectronPath(
  bridge: ElectronPathOpenBridge,
  path: string,
  intent: ElectronPathOpenIntent,
  signal: AbortSignal,
  fetcher: ElectronPathOpenFetch = fetch,
): Promise<void> {
  const response = await fetcher(bridge.url, {
    method: 'POST',
    headers: {
      [TOKEN_HEADER]: bridge.token,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ path, intent }),
    signal,
  })
  if (!response.ok) throw new Error(`Electron path opener failed: HTTP ${response.status}`)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) {
    throw new Error('Electron path opener returned an invalid response')
  }
  const result = body as { error?: unknown; opened?: unknown }
  if (typeof result.error === 'string' && result.error !== '') {
    throw new Error(`Electron path opener failed: ${result.error}`)
  }
  if (result.opened !== true) throw new Error('Electron path opener returned an invalid response')
}

/** Header used by the Electron bridge server. */
export const electronPathOpenTokenHeader = TOKEN_HEADER
