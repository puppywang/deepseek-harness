// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { rememberedEffort, rememberEffort } from '../src/client/preferences.ts'

const KEY = 'dsh.modelSelection.efforts'

afterEach(() => {
  localStorage.clear()
})

describe('model effort preferences', () => {
  it('stores and reads a per-route effort', () => {
    rememberEffort('acme', 'thinker', 'max')
    expect(localStorage.getItem(KEY)).toContain('"acme/thinker":"max"')
    expect(rememberedEffort('acme', 'thinker')).toBe('max')
    expect(rememberedEffort('acme', 'other')).toBeUndefined()
  })

  it('clearing a route deletes only that entry', () => {
    rememberEffort('a', 'm1', 'high')
    rememberEffort('a', 'm2', 'max')
    rememberEffort('a', 'm1', undefined)
    expect(rememberedEffort('a', 'm1')).toBeUndefined()
    expect(rememberedEffort('a', 'm2')).toBe('max')
    expect(localStorage.getItem(KEY)).not.toContain('"a/m1"')
  })

  it('ignores malformed persisted payloads', () => {
    localStorage.setItem(KEY, '{not-json')
    expect(rememberedEffort('a', 'm')).toBeUndefined()
  })

  it('filters non-string and empty entries', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'a/m': 42, 'a/empty': '', 'badkey': 'high' }))
    expect(rememberedEffort('a', 'm')).toBeUndefined()
    expect(rememberedEffort('a', 'empty')).toBeUndefined()
    expect(rememberedEffort('badkey', '')).toBeUndefined()
  })
})
