// @ts-nocheck
/* oxlint-disable typescript/no-explicit-any, typescript/ban-ts-comment, typescript/no-unnecessary-condition, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/require-await, typescript/prefer-promise-reject-errors, typescript/no-implied-eval, typescript/no-unsafe-call, typescript/no-unused-vars */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { ModelDirectory } from '../src/client/directory.ts'
import { rememberedEffort } from '../src/client/preferences.ts'

const sid = (key: string): SessionId => key as SessionId

afterEach(() => {
  document.cookie = 'dsh.modelSelection.efforts=; path=/; max-age=0'
})

describe('ModelDirectory preference seeding', () => {
  it('seeds a remembered effort from the host current selection on load', async () => {
    const catalogValue = {
      default: { provider: 'acme', model: 'thinker', reasoningEffort: 'max' },
      routableProviders: ['acme'],
      groups: [],
      failures: [],
    }
    const catalogStore = createSnapshotStore({
      value: catalogValue,
      status: 'ready' as const,
      error: null,
    })
    const catalog = {
      store: catalogStore,
      load: vi.fn(async () => catalogValue),
    } as unknown as ConstructorParameters<typeof ModelDirectory>[3]
    const projected = createSnapshotStore<unknown>({
      next: null,
      lastUsed: null,
    } as unknown) as unknown as ConstructorParameters<typeof ModelDirectory>[4]
    const sessions = {
      selectModel: vi.fn(async () => {
        throw new Error('not used')
      }),
    } as unknown as ConstructorParameters<typeof ModelDirectory>[0]
    const directory = new ModelDirectory(sessions, sid('session'), () => true, catalog, projected)
    await directory.load()
    expect(rememberedEffort('acme', 'thinker')).toBe('max')
  })

  it('seeds a remembered effort from a successful selection', async () => {
    const catalogValue = {
      default: { provider: 'acme', model: 'thinker' },
      routableProviders: ['acme'],
      groups: [],
      failures: [],
    }
    const catalogStore = createSnapshotStore({
      value: catalogValue,
      status: 'ready' as const,
      error: null,
    })
    const catalog = {
      store: catalogStore,
      load: vi.fn(async () => catalogValue),
    } as unknown as ConstructorParameters<typeof ModelDirectory>[3]
    const projected = createSnapshotStore<unknown>({
      next: null,
      lastUsed: null,
    } as unknown) as unknown as ConstructorParameters<typeof ModelDirectory>[4]
    const sessions = {
      selectModel: vi.fn(async () => ({
        ok: true as const,
        value: {
          selected: { provider: 'acme', model: 'thinker', reasoningEffort: 'high' },
        },
      })),
    } as unknown as ConstructorParameters<typeof ModelDirectory>[0]
    const directory = new ModelDirectory(sessions, sid('session'), () => true, catalog, projected)
    await directory.select({ provider: 'acme', model: 'thinker', reasoningEffort: 'high' })
    expect(rememberedEffort('acme', 'thinker')).toBe('high')
  })
})
