/** Optional desktop-shell bridge for the native directory picker. */

const BRIDGE_URL_ENV = 'DSH_ELECTRON_PICKER_URL'
const BRIDGE_TOKEN_ENV = 'DSH_ELECTRON_PICKER_TOKEN'
const TOKEN_HEADER = 'x-dsh-electron-picker-token'

/** Electron shell endpoint and bearer token passed to the Host child. */
export interface ElectronDirectoryPickerBridge {
  url: string
  token: string
}

/** Testable fetch boundary for the shell bridge. */
export type ElectronDirectoryPickerFetch = typeof fetch

/**
 * Resolve the optional bridge configured by the Electron desktop shell.
 * @returns the bridge when both environment values are non-blank, otherwise undefined.
 */
export function electronDirectoryPickerBridgeFromEnv(): ElectronDirectoryPickerBridge | undefined {
  const url = process.env[BRIDGE_URL_ENV]?.trim()
  const token = process.env[BRIDGE_TOKEN_ENV]?.trim()
  if (url === undefined || url === '' || token === undefined || token === '') return undefined
  return { url, token }
}

/**
 * Ask the Electron main process to open its directory chooser.
 * @param bridge - loopback endpoint and token supplied by the desktop shell.
 * @param signal - caller/connection lifetime.
 * @param fetcher - injectable fetch implementation for tests.
 * @returns the selected path, or null when the operator cancels.
 */
export async function pickElectronDirectory(
  bridge: ElectronDirectoryPickerBridge,
  signal: AbortSignal,
  fetcher: ElectronDirectoryPickerFetch = fetch,
): Promise<string | null> {
  const response = await fetcher(bridge.url, {
    method: 'POST',
    headers: { [TOKEN_HEADER]: bridge.token },
    signal,
  })
  if (!response.ok) throw new Error(`Electron directory picker failed: HTTP ${response.status}`)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null || !('path' in body)) {
    throw new Error('Electron directory picker returned an invalid response')
  }
  const path = (body as { path?: unknown }).path
  if (path !== null && typeof path !== 'string') {
    throw new Error('Electron directory picker returned an invalid path')
  }
  return path
}

/** Header used by the Electron bridge server. */
export const electronDirectoryPickerTokenHeader = TOKEN_HEADER
