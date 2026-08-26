// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { rememberedEffort, rememberEffort } from '../src/client/preferences.ts'

const KEY = 'dsh.modelSelection.efforts'

function clearCookie(): void {
  document.cookie = `${KEY}=; path=/; max-age=0`
}

afterEach(() => {
  clearCookie()
})

describe('model effort preferences', () => {
  it('stores and reads a per-route effort in a cookie', () => {
    rememberEffort('acme', 'thinker', 'max')
    expect(document.cookie).toContain(encodeURIComponent('{"acme/thinker":"max"}'))
    expect(rememberedEffort('acme', 'thinker')).toBe('max')
    expect(rememberedEffort('acme', 'other')).toBeUndefined()
  })

  it('clearing a route deletes only that entry', () => {
    rememberEffort('a', 'm1', 'high')
    rememberEffort('a', 'm2', 'max')
    rememberEffort('a', 'm1', undefined)
    expect(rememberedEffort('a', 'm1')).toBeUndefined()
    expect(rememberedEffort('a', 'm2')).toBe('max')
    expect(document.cookie).not.toContain('"a/m1"')
  })

  it('ignores malformed persisted payloads', () => {
    document.cookie = `${KEY}=${encodeURIComponent('{not-json')}; path=/`
    expect(rememberedEffort('a', 'm')).toBeUndefined()
  })

  it('filters non-string and empty entries', () => {
    document.cookie = `${KEY}=${encodeURIComponent(JSON.stringify({ 'a/m': 42, 'a/empty': '', 'badkey': 'high' }))}; path=/`
    expect(rememberedEffort('a', 'm')).toBeUndefined()
    expect(rememberedEffort('a', 'empty')).toBeUndefined()
    expect(rememberedEffort('badkey', '')).toBeUndefined()
  })
})
