import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  electronPathOpenBridgeFromEnv,
  electronPathOpenTokenHeader,
  openElectronPath,
} from '../src/electron-path-bridge.ts'

const signal = (): AbortSignal => new AbortController().signal

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Electron path-opener bridge', () => {
  it('is absent unless both shell environment values are present', () => {
    expect(electronPathOpenBridgeFromEnv()).toBeUndefined()
    vi.stubEnv('DSH_ELECTRON_OPEN_PATH_URL', 'http://127.0.0.1:1234/open')
    expect(electronPathOpenBridgeFromEnv()).toBeUndefined()
    vi.stubEnv('DSH_ELECTRON_OPEN_PATH_TOKEN', ' token ')
    expect(electronPathOpenBridgeFromEnv()).toEqual({
      url: 'http://127.0.0.1:1234/open', token: 'token',
    })
  })

  it('posts a path and intent and accepts Electron success', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ opened: true }))
    await expect(openElectronPath(
      { url: 'http://127.0.0.1:1234/open', token: 'secret' },
      'C:\\work\\notes.txt', 'text-editor', signal(), fetcher,
    )).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:1234/open',
      expect.objectContaining({
        method: 'POST',
        headers: {
          [electronPathOpenTokenHeader]: 'secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ path: 'C:\\work\\notes.txt', intent: 'text-editor' }),
      }),
    )
  })

  it('rejects transport, Electron, and response failures', async () => {
    const bridge = { url: 'http://127.0.0.1:1234/open', token: 'secret' }
    await expect(openElectronPath(bridge, '/tmp/a.txt', 'default', signal(),
      vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }))))
      .rejects.toThrow('HTTP 503')
    await expect(openElectronPath(bridge, '/tmp/a.txt', 'default', signal(),
      vi.fn<typeof fetch>(async () => Response.json({ error: 'not found' }))))
      .rejects.toThrow('not found')
    await expect(openElectronPath(bridge, '/tmp/a.txt', 'default', signal(),
      vi.fn<typeof fetch>(async () => Response.json({ opened: false }))))
      .rejects.toThrow('invalid response')
    await expect(openElectronPath(bridge, '/tmp/a.txt', 'default', signal(),
      vi.fn<typeof fetch>(async () => Response.json({}))))
      .rejects.toThrow('invalid response')
  })
})
