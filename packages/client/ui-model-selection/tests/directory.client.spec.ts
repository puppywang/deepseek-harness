// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { ModelDirectory } from '../src/client/directory.ts'
import { rememberedEffort } from '../src/client/preferences.ts'

const sid = (key: string): SessionId => key as SessionId

afterEach(() => {
  document.cookie = 'dsh.modelSelection.efforts=; path=/; max-age=0'
})

describe('ModelDirectory preference seeding', () => {
  it('seeds a remembered effort from the host current selection on load', async () => {
    const sessions = {
      models: async () => ({
        result: {
          ok: true,
          value: {
            current: { provider: 'acme', model: 'thinker', reasoningEffort: 'max' },
            routable: true,
            groups: [],
            failures: [],
          },
        },
      }),
      selectModel: async () => { throw new Error('not used') },
    } as unknown as ConstructorParameters<typeof ModelDirectory>[0]
    const directory = new ModelDirectory(sessions, sid('session'), () => true)
    await directory.load()
    expect(rememberedEffort('acme', 'thinker')).toBe('max')
  })

  it('seeds a remembered effort from a successful selection', async () => {
    const sessions = {
      models: async () => ({
        result: {
          ok: true,
          value: {
            current: null,
            routable: null,
            groups: [],
            failures: [],
          },
        },
      }),
      selectModel: async () => ({
        result: {
          ok: true,
          value: {
            selected: { provider: 'acme', model: 'thinker', reasoningEffort: 'high' },
          },
        },
      }),
    } as unknown as ConstructorParameters<typeof ModelDirectory>[0]
    const directory = new ModelDirectory(sessions, sid('session'), () => true)
    await directory.select({ provider: 'acme', model: 'thinker', reasoningEffort: 'high' })
    expect(rememberedEffort('acme', 'thinker')).toBe('high')
  })
})
