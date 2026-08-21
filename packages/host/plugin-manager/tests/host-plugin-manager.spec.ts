import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
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

  it('discovers npm packages that declare the dsh-plugin keyword and a DSH role', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
      if (url.includes('/-/v1/search')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
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
          }),
        } as Response
      }
      if (url.includes('@anysearch/anysearch-dsh/latest')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({ name: '@anysearch/anysearch-dsh', dsh: { client: { platform: 'web' } } }),
        } as Response
      }
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ name: 'not-a-dsh-plugin' }),
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      await withPluginEnv(profileFixture(), async () => {
        const { manager } = await harness()
        const catalog = await manager.catalog()
        expect(catalog.entries).toEqual([
          expect.objectContaining({
            packageName: '@anysearch/anysearch-dsh',
            repo: 'anysearch-team/anysearch-dsh',
            downloads: 42,
          }),
        ])
        // The verified directory is cached for the lifetime of this deployment.
        await manager.catalog()
        expect(fetchMock).toHaveBeenCalledTimes(3)
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
