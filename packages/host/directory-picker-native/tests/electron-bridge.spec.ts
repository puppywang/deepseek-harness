import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  electronDirectoryPickerBridgeFromEnv,
  electronDirectoryPickerTokenHeader,
  pickElectronDirectory,
} from '../src/electron-bridge.ts'

const signal = (): AbortSignal => new AbortController().signal

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Electron directory-picker bridge', () => {
  it('is absent unless both shell environment values are present', () => {
    expect(electronDirectoryPickerBridgeFromEnv()).toBeUndefined()
    vi.stubEnv('DSH_ELECTRON_PICKER_URL', 'http://127.0.0.1:1234/pick')
    expect(electronDirectoryPickerBridgeFromEnv()).toBeUndefined()
    vi.stubEnv('DSH_ELECTRON_PICKER_TOKEN', ' token ')
    expect(electronDirectoryPickerBridgeFromEnv()).toEqual({
      url: 'http://127.0.0.1:1234/pick', token: 'token',
    })
  })

  it('posts the token and returns the selected path', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ path: 'C:\\work\\selected' }))
    await expect(pickElectronDirectory(
      { url: 'http://127.0.0.1:1234/pick', token: 'secret' }, signal(), fetcher,
    )).resolves.toBe('C:\\work\\selected')
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/pick',
      expect.objectContaining({
        method: 'POST',
        headers: { [electronDirectoryPickerTokenHeader]: 'secret' },
      }),
    )
  })

  it('maps cancellation and rejects transport or response failures', async () => {
    const cancelled = vi.fn<typeof fetch>(async () => Response.json({ path: null }))
    await expect(pickElectronDirectory(
      { url: 'http://127.0.0.1:1234/pick', token: 'secret' }, signal(), cancelled,
    )).resolves.toBeNull()

    const failed = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }))
    await expect(pickElectronDirectory(
      { url: 'http://127.0.0.1:1234/pick', token: 'secret' }, signal(), failed,
    )).rejects.toThrow('HTTP 503')

    const invalid = vi.fn<typeof fetch>(async () => Response.json({ path: 42 }))
    await expect(pickElectronDirectory(
      { url: 'http://127.0.0.1:1234/pick', token: 'secret' }, signal(), invalid,
    )).rejects.toThrow('invalid path')

    const malformed = vi.fn<typeof fetch>(async () => Response.json({}))
    await expect(pickElectronDirectory(
      { url: 'http://127.0.0.1:1234/pick', token: 'secret' }, signal(), malformed,
    )).rejects.toThrow('invalid response')
  })
})
