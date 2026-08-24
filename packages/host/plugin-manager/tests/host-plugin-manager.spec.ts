import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SubprocessRuntime, {
  type SubprocessHandle,
  type SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PluginManagerGateway from '../src/index.ts'
import type { PluginCatalogIndexEntry } from '../src/catalog-index.ts'

const contexts: Context[] = []
const roots: string[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

class FakeSubprocess extends SubprocessRuntime {
  override resolveExecutable(command: string): Promise<string> { return Promise.resolve(command) }
  override spawn(): never { throw new Error('not used in list test') }
  override spawnTerminal(): never { throw new Error('not used in list test') }
}

/** Subprocess whose pnpm invocations always succeed, for the mutation tests. */
class SucceedingSubprocess extends SubprocessRuntime {
  override resolveExecutable(command: string): Promise<string> { return Promise.resolve(command) }
  override spawn(_spec: SubprocessSpawnSpec): SubprocessHandle {
    return {
      pid: 1,
      stdin: undefined,
      stdout: undefined,
      stderr: undefined,
      collected: {
        stdout: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
        stderr: { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) },
      },
      done: Promise.resolve({ exitCode: 0, signal: null }),
      terminate() {},
      waitForExit: () => Promise.resolve(true),
    }
  }
  override spawnTerminal(): never { throw new Error('not used in the plugin manager') }
}

async function harness(subprocess: new (ctx: Context) => SubprocessRuntime = FakeSubprocess)
  : Promise<{ ctx: Context; manager: PluginManagerGateway }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(subprocess)
  await ctx.plugin(PluginManagerGateway)
  const manager = ctx.get('pluginManager') as PluginManagerGateway
  return { ctx, manager }
}

function profileFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-host-plugin-manager-'))
  roots.push(root)
  const profileDir = join(root, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web', private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
  }, undefined, 2) + '\n')
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '[]\n')
  return profileDir
}

/** Point `$DSH_HOME` and the install anchor at one fixture for the duration of `run`. */
async function withPluginEnv<T>(profileDir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = join(profileDir, '..', '..')
  const previousAnchor = process.env.DSH_INSTALL_ANCHOR
  process.env.DSH_INSTALL_ANCHOR = join(profileDir, 'package.json')
  try {
    return await run()
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    if (previousAnchor === undefined) delete process.env.DSH_INSTALL_ANCHOR
    else process.env.DSH_INSTALL_ANCHOR = previousAnchor
  }
}

/** The `$DSH_HOME` root implied by one profile fixture. */
function homeOf(profileDir: string): string {
  return join(profileDir, '..', '..')
}

/** Absolute path of the durable catalog index inside one fixture home. */
function catalogIndexPath(profileDir: string): string {
  return join(homeOf(profileDir), 'cache', 'plugin-catalog-index.json')
}

function indexEntry(packageName: string, overrides: Partial<PluginCatalogIndexEntry> = {})
  : PluginCatalogIndexEntry {
  return {
    packageName,
    description: null,
    repository: `example/${packageName}`,
    homepage: null,
    npmUrl: null,
    keywords: ['dsh-plugin'],
    downloads: 0,
    ...overrides,
  }
}

/** Seed the durable index so a catalog call can answer without any registry traffic. */
function seedCatalogIndex(
  profileDir: string,
  entries: readonly PluginCatalogIndexEntry[],
  builtAtIso: string,
): void {
  mkdirSync(join(homeOf(profileDir), 'cache'), { recursive: true })
  writeFileSync(catalogIndexPath(profileDir), `${JSON.stringify({
    version: 1,
    builtAt: builtAtIso,
    entries,
  }, undefined, 2)}\n`, 'utf8')
}

function urlOf(input: string | URL | Request): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response
}

describe('PluginManagerGateway', () => {
  it('publishes list, install, update, uninstall, and restart under the pluginManager namespace', async () => {
    const profileDir = profileFixture()
    await withPluginEnv(profileDir, async () => {
      const { manager } = await harness()
      expect(manager.typertRemote).toMatchObject({ serviceKey: 'pluginManager', namespace: 'pluginManager' })
      expect(remoteMethods(manager)).toEqual([
        { method: 'list', invocation: { kind: 'direct' } },
        { method: 'catalog', invocation: { kind: 'direct' } },
        { method: 'install', invocation: { kind: 'direct' } },
        { method: 'update', invocation: { kind: 'direct' } },
        { method: 'uninstall', invocation: { kind: 'direct' } },
        { method: 'restart', invocation: { kind: 'direct' } },
      ])
      const snapshot = await manager.list()
      expect(snapshot.plugins).toContainEqual(expect.objectContaining({
        packageName: '@deepseek-ai/dsh-base',
        source: 'template',
      }))
    })
  })

  it('answers the directory from a fresh persisted index without registry traffic', async () => {
    const profileDir = profileFixture()
    seedCatalogIndex(profileDir, [
      indexEntry('beta-dsh', { downloads: 10 }),
      indexEntry('alpha-dsh', { downloads: 30 }),
      indexEntry('gamma-dsh', { downloads: 30 }),
    ], new Date().toISOString())
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      throw new Error(`the index must answer alone, but npm was called: ${urlOf(input)}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileDir, async () => {
        const { manager } = await harness()
        const catalog = await manager.catalog()
        expect(catalog.entries.map(entry => entry.packageName)).toEqual([
          'alpha-dsh',
          'gamma-dsh',
          'beta-dsh',
        ])
        expect(catalog.totalMatches).toBe(3)
        expect(catalog.hasMore).toBe(false)
        expect(catalog.entries[0]).toEqual(expect.objectContaining({
          repo: 'example/alpha-dsh',
          owner: 'example',
          name: 'alpha-dsh',
        }))
        expect(fetchMock).not.toHaveBeenCalled()
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ranks text matches deterministically: exact, prefix, substring, keyword, description', async () => {
    const profileDir = profileFixture()
    seedCatalogIndex(profileDir, [
      indexEntry('memory', { downloads: 0 }),
      indexEntry('memory-dsh', { downloads: 1 }),
      indexEntry('dsh-memory', { downloads: 5 }),
      indexEntry('b-memory-x', { downloads: 7 }),
      indexEntry('a-memory-x', { downloads: 1 }),
      indexEntry('zzz-plugin', { keywords: ['dsh-plugin', 'memory'], downloads: 500 }),
      indexEntry('qqq-plugin', { description: 'Great memory tool for agents', downloads: 900 }),
    ], new Date().toISOString())
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input)
      if (url.includes('/-/v1/search')) {
        throw new Error(`ranking must stay local, but npm search was called: ${url}`)
      }
      // Non-empty first pages always probe likely exact names; those probes
      // miss here and must not disturb the local ranking.
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileDir, async () => {
        const { manager } = await harness()
        const catalog = await manager.catalog({ query: 'Memory' })
        expect(catalog.entries.map(entry => entry.packageName)).toEqual([
          'memory',
          'memory-dsh',
          'b-memory-x',
          'dsh-memory',
          'a-memory-x',
          'zzz-plugin',
          'qqq-plugin',
        ])
        // Multi-word queries require every word to hit somewhere.
        const multiWord = await manager.catalog({ query: 'memory tool' })
        expect(multiWord.entries.map(entry => entry.packageName)).toEqual(['qqq-plugin'])
        // Registry traffic is limited to the missed exact-name probes.
        for (const call of fetchMock.mock.calls) {
          expect(urlOf(call[0] as string | URL | Request)).toContain('/latest')
        }
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('serves a stale index immediately and swaps in the rebuilt one in the background', async () => {
    const profileDir = profileFixture()
    seedCatalogIndex(profileDir, [indexEntry('old-dsh', { downloads: 1 })],
      new Date(Date.now() - 25 * 3_600_000).toISOString())
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input)
      if (url.includes('/-/v1/search')) {
        return jsonResponse({
          total: 1,
          objects: [{
            searchScore: 5,
            downloads: { monthly: 9 },
            package: {
              name: 'new-dsh',
              keywords: ['dsh-plugin'],
              links: { repository: 'git+https://github.com/example/new-dsh.git' },
            },
          }],
        })
      }
      if (url === 'https://registry.npmjs.org/new-dsh/latest') {
        return jsonResponse({ name: 'new-dsh', dsh: { bundle: { patch: './cordis.patch.yml' } } })
      }
      throw new Error(`unexpected catalog URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileDir, async () => {
        const { manager } = await harness()
        const stale = await manager.catalog()
        expect(stale.entries.map(entry => entry.packageName)).toEqual(['old-dsh'])

        // The background rebuild persists the refreshed directory.
        await vi.waitFor(() => {
          const persisted = JSON.parse(readFileSync(catalogIndexPath(profileDir), 'utf8')) as {
            entries: Array<{ packageName: string }>
          }
          expect(persisted.entries.map(entry => entry.packageName)).toEqual(['new-dsh'])
        }, { timeout: 5_000, interval: 20 })

        // A later caller loads the rebuilt copy instead of the stale one.
        const { manager: refreshed } = await harness()
        const updated = await refreshed.catalog()
        expect(updated.entries.map(entry => entry.packageName)).toEqual(['new-dsh'])
        expect(updated.totalMatches).toBe(1)
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('falls back to live npm search before the first index build lands', async () => {
    const profileDir = profileFixture()
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input)
      if (url.includes('/-/v1/search')) {
        return jsonResponse({
          objects: [
            {
              downloads: { monthly: 42 },
              package: {
                name: '@anysearch/anysearch-dsh',
                description: 'AnySearch web search provider',
                keywords: ['dsh-plugin', 'web-search'],
                links: {
                  repository: 'git+https://github.com/anysearch-team/anysearch-dsh.git',
                  npm: 'https://www.npmjs.com/package/@anysearch/anysearch-dsh',
                },
              },
            },
            {
              downloads: { monthly: 7 },
              package: {
                name: 'not-a-dsh-plugin',
                keywords: ['dsh-plugin'],
                links: { repository: 'git+https://github.com/example/not-a-dsh-plugin.git' },
              },
            },
            {
              downloads: { monthly: 99 },
              package: {
                name: 'keyword-only',
                keywords: ['unrelated'],
              },
            },
          ],
        })
      }
      if (url.includes('@anysearch/anysearch-dsh/latest')) {
        return jsonResponse({ name: '@anysearch/anysearch-dsh', dsh: { client: { platform: 'web' } } })
      }
      return jsonResponse({ name: 'not-a-dsh-plugin' })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileDir, async () => {
        const { manager } = await harness()
        const catalog = await manager.catalog()
        expect(catalog).toEqual({
          query: '',
          page: 0,
          pageSize: 30,
          totalMatches: null,
          hasMore: false,
          entries: [expect.objectContaining({
            packageName: '@anysearch/anysearch-dsh',
            repo: 'anysearch-team/anysearch-dsh',
            downloads: 42,
          })],
        })

        // The first build persists the verified directory for later callers.
        await vi.waitFor(() => {
          expect(existsSync(catalogIndexPath(profileDir))).toBe(true)
          const persisted = JSON.parse(readFileSync(catalogIndexPath(profileDir), 'utf8')) as {
            entries: Array<{ packageName: string }>
          }
          expect(persisted.entries.map(entry => entry.packageName))
            .toEqual(['@anysearch/anysearch-dsh'])
        }, { timeout: 5_000, interval: 20 })

        const callsAfterBuild = fetchMock.mock.calls.length
        const { manager: warmed } = await harness()
        const indexed = await warmed.catalog()
        expect(indexed.totalMatches).toBe(1)
        expect(indexed.entries.map(entry => entry.packageName)).toEqual(['@anysearch/anysearch-dsh'])
        expect(fetchMock.mock.calls.length).toBe(callsAfterBuild)
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('finds packages published after the rebuild through the live exact-name probe', async () => {
    const profileDir = profileFixture()
    seedCatalogIndex(profileDir, [
      indexEntry('popular-other-dsh', { description: 'Notification hub for dsh', downloads: 1000 }),
    ], new Date().toISOString())
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input)
      if (url === 'https://registry.npmjs.org/dsh-notification/latest') {
        return jsonResponse({
          name: 'dsh-notification',
          description: 'Desktop and webhook notifications',
          keywords: ['dsh-plugin'],
          repository: { type: 'git', url: 'git+https://github.com/nishit130/dsh-notification.git' },
          dsh: {
            bundle: { patch: './cordis.patch.yml' },
            client: {},
          },
        })
      }
      throw new Error(`unexpected catalog URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileDir, async () => {
        const { manager } = await harness()
        const byExactName = await manager.catalog({ query: 'dsh-notification' })
        expect(byExactName.entries.map(entry => entry.packageName)).toEqual(['dsh-notification'])
        expect(byExactName.entries[0]).toEqual(expect.objectContaining({
          repo: 'nishit130/dsh-notification',
          downloads: 0,
        }))

        // Free text keeps matching the persisted index without extra traffic;
        // each non-empty first page still probes its literal name once.
        const byTopic = await manager.catalog({ query: 'notification' })
        expect(byTopic.entries.map(entry => entry.packageName)).toEqual(['popular-other-dsh'])
        expect(fetchMock.mock.calls.map(call => urlOf(call[0] as string | URL | Request))).toEqual([
          'https://registry.npmjs.org/dsh-notification/latest',
          'https://registry.npmjs.org/notification/latest',
        ])
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('ignores an unusable persisted index and falls back to live npm search', async () => {
    const profileDir = profileFixture()
    mkdirSync(join(homeOf(profileDir), 'cache'), { recursive: true })
    writeFileSync(catalogIndexPath(profileDir), '{corrupt', 'utf8')
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input)
      if (url.includes('/-/v1/search')) {
        return jsonResponse({
          objects: [{
            searchScore: 1,
            downloads: { monthly: 3 },
            package: {
              name: 'live-dsh',
              keywords: ['dsh-plugin'],
              links: { repository: 'git+https://github.com/example/live-dsh.git' },
            },
          }],
        })
      }
      if (url.endsWith('live-dsh/latest')) {
        return jsonResponse({ name: 'live-dsh', dsh: { bundle: {} } })
      }
      throw new Error(`unexpected catalog URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileDir, async () => {
        const { manager } = await harness()
        const catalog = await manager.catalog()
        expect(catalog.entries.map(entry => entry.packageName)).toEqual(['live-dsh'])
        expect(catalog.totalMatches).toBeNull()
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('pages the live npm fallback on demand and caches each query/page pair', async () => {
    const searchUrls: string[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = urlOf(input)
      // Keep this test on the live fallback path: fail the background build's
      // own full listing without retries so it cannot swap the backend mid-test.
      if (url.includes('size=250')) {
        return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response
      }
      if (url.includes('/-/v1/search')) {
        searchUrls.push(url)
        const page = url.includes('from=30') ? 1 : 0
        // A full first page plus a positive total tells the client another
        // page exists; the second page is naturally shorter.
        const names = Array.from({ length: page === 0 ? 30 : 1 }, (_, index) => (
          `page-${page}-plugin-${String(index).padStart(2, '0')}-dsh`
        ))
        return jsonResponse({
          total: 31,
          objects: names.map((name, index) => ({
            searchScore: 100 - index,
            downloads: { monthly: 10 },
            package: {
              name,
              keywords: ['dsh-plugin'],
              links: { repository: `git+https://github.com/example/${name}.git` },
            },
          })),
        })
      }
      const packageName = /registry\.npmjs\.org\/([^/]+)\/latest$/.exec(url)?.[1]
      if (packageName !== undefined) {
        return jsonResponse({ name: packageName, dsh: { client: {} } })
      }
      throw new Error(`unexpected catalog URL ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileFixture(), async () => {
        const { manager } = await harness()
        const firstPage = await manager.catalog({ query: '', page: 0 })
        expect(firstPage).toEqual({
          query: '',
          page: 0,
          pageSize: 30,
          totalMatches: 31,
          hasMore: true,
          entries: expect.any(Array),
        })
        expect(firstPage.entries).toHaveLength(30)

        const secondPage = await manager.catalog({ query: '', page: 1 })
        expect(secondPage.page).toBe(1)
        expect(secondPage.hasMore).toBe(false)
        expect(secondPage.entries).toHaveLength(1)
        expect(decodeURIComponent(searchUrls[1] ?? '')).toContain('from=30')

        // Each query/page pair is cached independently; the failed build adds
        // exactly one non-retried listing attempt, so the count settles.
        await manager.catalog({ query: '', page: 0 })
        await manager.catalog({ query: '', page: 1 })
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(34), {
          timeout: 5_000,
          interval: 20,
        })
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('throws when restarting without a launcher-provided appExit', async () => {
    await withPluginEnv(profileFixture(), async () => {
      const { manager } = await harness()
      expect(() => manager.restart()).toThrow('the launcher did not provide ctx.appExit')
    })
  })

  it('requests exit through ctx.appExit when restarting', async () => {
    await withPluginEnv(profileFixture(), async () => {
      const { ctx, manager } = await harness()
      let requested: number | undefined
      ctx.provide('appExit', (code: number) => { requested = code })
      expect(manager.restart()).toEqual({ restarted: true })
      expect(requested).toBe(0)
    })
  })

  it('reports restartRequired when the live reload cannot complete', async () => {
    await withPluginEnv(profileFixture(), async () => {
      const { manager } = await harness(SucceedingSubprocess)
      // No root Include is mounted in this harness, so applyLive fails and the
      // mutation must fall back to a user-confirmed process restart.
      await expect(manager.install({ spec: 'dsh-plugin-fake@1.0.0', enable: true }))
        .resolves.toEqual(expect.objectContaining({ action: 'install', restartRequired: true }))
    })
  })
})
