/** Live recomposition of the root Include after profile plugin file changes. */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { boot, reloadRootInclude, type Profile, type ProfileLayer } from '../src/index.ts'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

const roots: string[] = []
const contexts: Array<{ ctx: Awaited<ReturnType<typeof boot>> }> = []

afterEach(async () => {
  for (const { ctx } of contexts.splice(0)) await ctx.fiber.dispose()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-reload-root-include-'))
  roots.push(root)
  return root
}

function noop(profileDir: string): void {
  writeFileSync(join(profileDir, 'noop.mjs'), 'export const apply = () => {}\n')
}

function profileFixture(): { profileDir: string; patchPath: string } {
  const root = tempRoot()
  const profileDir = join(root, 'profiles', 'web')
  mkdirSync(profileDir, { recursive: true })
  noop(profileDir)
  writeFileSync(join(profileDir, 'cordis.yml'), '[]\n')
  const patchPath = join(profileDir, 'cordis.patch.yml')
  writeFileSync(patchPath, '[]\n')
  return { profileDir, patchPath }
}

function layer(inserts: Array<{ id: string; name: string }>): ProfileLayer {
  return {
    packageName: 'fixture',
    packageDir: '',
    patchPath: '',
    patches: [{ insert: inserts }] satisfies PatchOptions[],
  }
}

function makeProfile(profileDir: string, patchPath: string, layers: Profile['layers']): Profile {
  return {
    name: 'web',
    dir: profileDir,
    layers,
    patchPath,
    patches: [],
    patchReload: 'startup',
  }
}

describe('reloadRootInclude', () => {
  it('adds a bundle layer row live and preserves overlay patches', async () => {
    const { profileDir, patchPath } = profileFixture()
    const base = layer([{ id: 'base-row', name: './noop.mjs' }])
    const overlay: PatchOptions = { insert: [{ id: 'overlay-row', name: './noop.mjs' }] }
    const profile = makeProfile(profileDir, patchPath, [base])
    const ctx = await boot('dsh', join(profileDir, 'cordis.yml'), [
      ...profile.layers.flatMap(l => l.patches),
      ...profile.patches,
      overlay,
    ])
    contexts.push({ ctx })
    expect([...ctx.loader.entries()].some(entry => entry.options.id === 'base-row')).toBe(true)
    expect([...ctx.loader.entries()].some(entry => entry.options.id === 'overlay-row')).toBe(true)

    const live = layer([{ id: 'live-row', name: './noop.mjs' }])
    const updated = makeProfile(profileDir, patchPath, [base, live])
    await reloadRootInclude(ctx, { profile: updated })
    expect([...ctx.loader.entries()].some(entry => entry.options.id === 'live-row')).toBe(true)
    expect([...ctx.loader.entries()].some(entry => entry.options.id === 'overlay-row')).toBe(true)
  }, 20_000)
})
