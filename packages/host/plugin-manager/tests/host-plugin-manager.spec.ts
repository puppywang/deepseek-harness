import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SubprocessRuntime from '@deepseek-ai/dsh-subprocess'
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

async function harness(): Promise<{ ctx: Context; manager: PluginManagerGateway }> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(FakeSubprocess)
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

describe('PluginManagerGateway', () => {
  it('publishes list, install, update, and uninstall under the pluginManager namespace', async () => {
    const profileDir = profileFixture()
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = join(profileDir, '..', '..')
    const previousAnchor = process.env.DSH_INSTALL_ANCHOR
    process.env.DSH_INSTALL_ANCHOR = join(profileDir, 'package.json')
    try {
      const { manager } = await harness()
      expect(manager.typertRemote).toMatchObject({ serviceKey: 'pluginManager', namespace: 'pluginManager' })
      expect(remoteMethods(manager)).toEqual([
        { method: 'list', invocation: { kind: 'direct' } },
        { method: 'install', invocation: { kind: 'direct' } },
        { method: 'update', invocation: { kind: 'direct' } },
        { method: 'uninstall', invocation: { kind: 'direct' } },
      ])
      const snapshot = await manager.list()
      expect(snapshot.plugins).toContainEqual(expect.objectContaining({
        packageName: '@deepseek-ai/dsh-base',
        source: 'template',
      }))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
      if (previousAnchor === undefined) delete process.env.DSH_INSTALL_ANCHOR
      else process.env.DSH_INSTALL_ANCHOR = previousAnchor
    }
  })
})
