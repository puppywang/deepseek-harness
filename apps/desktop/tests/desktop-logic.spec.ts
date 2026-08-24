import { describe, expect, it } from 'vitest'
import {
  hasExpectedToken,
  harnessWebArgv,
  isAllowedUrl,
  isExternalUrl,
  openPathRequest,
  parseHarnessReadyUrl,
  probeHttpReady,
  resolveHarnessHome,
  safeDownloadFilename,
} from '../src/desktop-logic.ts'

describe('desktop shell logic', () => {
  it('keeps navigation inside the assigned loopback origin', () => {
    expect(isAllowedUrl('http://127.0.0.1:3080/workspace', 'http://127.0.0.1:3080')).toBe(true)
    expect(isAllowedUrl('https://127.0.0.1:3080/workspace', 'http://127.0.0.1:3080')).toBe(false)
    expect(isAllowedUrl('http://localhost:3080/workspace', 'http://127.0.0.1:3080')).toBe(false)
    expect(isAllowedUrl('http://127.0.0.1:3081/workspace', 'http://127.0.0.1:3080')).toBe(false)
  })

  it('only hands supported external protocols to the operating system', () => {
    expect(isExternalUrl('https://example.com')).toBe(true)
    expect(isExternalUrl('mailto:user@example.com')).toBe(true)
    expect(isExternalUrl('file:///C:/Windows/system32')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('sanitizes suggested download names and rejects invalid path requests', () => {
    expect(safeDownloadFilename('../report<>.txt')).toBe('report__.txt')
    expect(safeDownloadFilename('   ')).toBe('download')
    expect(openPathRequest({ path: 'C:\\work\\README.md', intent: 'text-editor' })).toEqual({
      path: 'C:\\work\\README.md',
      intent: 'text-editor',
    })
    expect(() => openPathRequest({ path: 'C:\\work\\README.md', intent: 'shell' })).toThrow('invalid path opener intent')
    expect(() => openPathRequest({ path: 'C:\\work\u0000README.md', intent: 'default' })).toThrow('invalid path opener path')
  })

  it('anchors desktop startup to the Web profile URL line', () => {
    expect(parseHarnessReadyUrl('[dsh] boot\ndsh web: http://127.0.0.1:4567\n')).toBe('http://127.0.0.1:4567')
    expect(parseHarnessReadyUrl('dsh web: http://192.168.1.5:4567')).toBeUndefined()
  })

  it('launches the web child on loopback with the browser handoff suppressed', () => {
    const argv = harnessWebArgv('C:\\runtime\\lib\\bin.js')
    expect(argv).toEqual([
      'C:\\runtime\\lib\\bin.js',
      'web',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--no-open',
    ])
  })

  it('keeps the default Harness home in Electron user data for profile plugins', () => {
    expect(resolveHarnessHome(undefined, 'C:\\Users\\puppy\\AppData\\Roaming\\DeepSeek Harness'))
      .toBe('C:\\Users\\puppy\\AppData\\Roaming\\DeepSeek Harness\\dsh-home')
    expect(resolveHarnessHome('D:\\portable\\dsh-home', 'C:\\ignored'))
      .toBe('D:\\portable\\dsh-home')
  })

  it('compares bridge tokens without exposing a timing-dependent equality check', () => {
    expect(hasExpectedToken('token', 'token')).toBe(true)
    expect(hasExpectedToken('wrong', 'token')).toBe(false)
    expect(hasExpectedToken(['token'], 'token')).toBe(false)
  })

  it('waits for the runtime HTTP endpoint instead of trusting its log line', async () => {
    let attempts = 0
    await probeHttpReady('http://127.0.0.1:4567', {
      attempts: 3,
      delayMs: 0,
      fetchImpl: async () => {
        attempts += 1
        if (attempts < 2) throw new Error('connection refused')
        return { ok: true, status: 200 } as Response
      },
    })
    expect(attempts).toBe(2)
  })

  it('reports a useful error when the runtime never becomes healthy', async () => {
    await expect(probeHttpReady('http://127.0.0.1:4567', {
      attempts: 2,
      delayMs: 0,
      fetchImpl: async () => ({ ok: false, status: 503 } as Response),
    })).rejects.toThrow('HTTP 503')
  })
})
