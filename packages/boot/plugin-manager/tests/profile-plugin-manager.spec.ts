/** Shared profile plugin management: reconciliation, patch rows, listing, and pnpm fallback. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readProfileManifest, writeProfileManifest, type ProfileManifest } from '@deepseek-ai/dsh-app-boot'
import {
  anchorPathSpec,
  derivePatchEntryId,
  disablePatchRow,
  enablePatchRow,
  ensureProfile,
  installProfilePlugin,
  listProfilePlugins,
  resolveBundledPnpmExecutable,
  uninstallProfilePlugin,
  updateProfilePlugin,
  type ProfilePluginRunPnpm,
} from '../src/index.ts'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-plugin-manager-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A profile manifest written into a temp profile dir, plus its install anchor. */
function fixture(): { profileDir: string; installAnchor: string; patchPath: string } {
  const root = tempRoot()
  const profileDir = join(root, 'profiles', 'web')
  const installDir = join(root, 'apps', 'cli')
  const installAnchor = join(installDir, 'package.json')
  mkdirSync(profileDir, { recursive: true })
  mkdirSync(installDir, { recursive: true })
  writeFileSync(installAnchor, JSON.stringify({ name: 'dsh-app', version: '0.0.0' }, undefined, 2) + '\n')
  writeFileSync(
    join(profileDir, 'package.json'),
    JSON.stringify({
      name: 'dsh-profile-web', private: true, dependencies: {},
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } },
    }, undefined, 2) + '\n',
  )
  writeFileSync(join(profileDir, 'cordis.patch.yml'), '# profile patch\n[]\n')
  return { profileDir, installAnchor, patchPath: join(profileDir, 'cordis.patch.yml') }
}

/** Install one fake package that both the app anchor and profile can resolve. */
function installFake(f: ReturnType<typeof fixture>, packageName: string, manifest: Record<string, unknown>): void {
  const dir = join(f.profileDir, 'node_modules', packageName)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: packageName, version: '1.0.0', ...manifest }, undefined, 2) + '\n')
}

/** A fake pnpm runner that writes dependencies and calls the recorded mutation. */
function fakePnpm(f: ReturnType<typeof fixture>, mutate: (manifest: ProfileManifest) => void): ProfilePluginRunPnpm {
  return async (_args, cwd): Promise<{ exitCode: number; stdout: string; stderr: string }> => {
    expect(cwd).toBe(f.profileDir)
    const manifest = readProfileManifest('dsh', f.profileDir)
    mutate(manifest)
    writeProfileManifest(f.profileDir, manifest)
    return { exitCode: 0, stdout: '', stderr: '' }
  }
}

describe('profile plugin manager', () => {
  it('initializes a missing profile with the default bundle and patch template', async () => {
    const root = tempRoot()
    const profileDir = join(root, 'profiles', 'web')
    await ensureProfile(profileDir)
    const manifest = readProfileManifest('dsh', profileDir)
    expect(manifest.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(existsSync(join(profileDir, 'cordis.patch.yml'))).toBe(true)
    expect(existsSync(join(profileDir, 'pnpm-workspace.yaml'))).toBe(true)
  })

  it('anchors only relative filesystem specs against the invoking cwd', () => {
    expect(anchorPathSpec('dsh-plugin-file-explorer', 'C:\\work')).toBe('dsh-plugin-file-explorer')
    expect(anchorPathSpec('../plugin', 'C:\\work')).toBe('C:\\plugin')
    expect(anchorPathSpec('file:../plugin', 'C:\\work')).toBe('file:C:\\plugin')
    expect(anchorPathSpec('link:.', 'C:\\work')).toBe('link:C:\\work')
    expect(anchorPathSpec('github:owner/repo', 'C:\\work')).toBe('github:owner/repo')
    expect(anchorPathSpec('@scope/pkg', 'C:\\work')).toBe('@scope/pkg')
  })

  it('derives stable patch row ids without doubling the plugin prefix', () => {
    expect(derivePatchEntryId('dsh-plugin-file-explorer')).toBe('plugin-file-explorer')
    expect(derivePatchEntryId('@acme/dsh-plugin-ticket')).toBe('plugin-ticket')
    expect(derivePatchEntryId('turtle-ui')).toBe('plugin-turtle-ui')
  })

  it('reconciles a newly installed bundle dependency into the layer list', async () => {
    const f = fixture()
    installFake(f, 'fake-bundle', { dsh: { bundle: { patch: './cordis.patch.yml' } } })
    const runPnpm = fakePnpm(f, (manifest) => { manifest.dependencies = { 'fake-bundle': '^1.0.0' } })
    const change = await installProfilePlugin({ ...f, spec: 'fake-bundle', runPnpm })
    expect(change).toMatchObject({ packageName: 'fake-bundle', bundle: true, client: false, enabled: true })
    expect(readProfileManifest('dsh', f.profileDir).dsh?.profile?.bundles)
      .toEqual(['@deepseek-ai/dsh-base', 'fake-bundle'])
  })

  it('adds one idempotent patch row for a client-only plugin when enable is requested', async () => {
    const f = fixture()
    installFake(f, 'fake-client', { dsh: { client: { platform: 'web' } } })
    const runPnpm = fakePnpm(f, (manifest) => { manifest.dependencies = { 'fake-client': '^1.0.0' } })
    await installProfilePlugin({ ...f, spec: 'fake-client', enable: true, runPnpm })
    const patched = readProfileManifest('dsh', f.profileDir)
    expect(patched.dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(readProfileManifest('dsh', f.profileDir).dependencies).toEqual({ 'fake-client': '^1.0.0' })
    expect(enablePatchRow('# profile patch\n[]\n', 'plugin-fake-client', 'fake-client'))
      .toBe('# profile patch\n- insert:\n    - id: plugin-fake-client\n      name: fake-client\n')
    expect(enablePatchRow('# profile patch\n- insert:\n    - id: plugin-fake-client\n      name: fake-client\n', 'other-id', 'fake-client'))
      .toBe('# profile patch\n- insert:\n    - id: plugin-fake-client\n      name: fake-client\n')
  })

  it('does not add a row for a bundle-only package even when enable is requested', async () => {
    const f = fixture()
    installFake(f, 'fake-bundle', { dsh: { bundle: { patch: './cordis.patch.yml' } } })
    const runPnpm = fakePnpm(f, (manifest) => { manifest.dependencies = { 'fake-bundle': '^1.0.0' } })
    await installProfilePlugin({ ...f, spec: 'fake-bundle', enable: true, runPnpm })
    expect(readProfileManifest('dsh', f.profileDir).dsh?.profile?.bundles).toContain('fake-bundle')
  })

  it('removes patch rows and drops a removed dependency bundle layer', async () => {
    const f = fixture()
    installFake(f, 'fake-bundle', { dsh: { bundle: { patch: './cordis.patch.yml' } } })
    writeProfileManifest(f.profileDir, {
      name: 'dsh-profile-web', private: true, dependencies: { 'fake-bundle': '^1.0.0' },
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', 'fake-bundle'] } },
    } as unknown as ProfileManifest)
    writeFileSync(f.patchPath, '# profile patch\n- insert:\n    - id: plugin-fake-bundle\n      name: fake-bundle\n')
    const runPnpm = fakePnpm(f, (manifest) => {
      manifest.dependencies = {}
      manifest.dsh = { profile: { bundles: ['@deepseek-ai/dsh-base', 'fake-bundle'] } }
      rmSync(join(f.profileDir, 'node_modules', 'fake-bundle'), { recursive: true, force: true })
    })
    const change = await uninstallProfilePlugin({ ...f, packageName: 'fake-bundle', runPnpm })
    expect(change).toMatchObject({ packageName: 'fake-bundle', action: 'uninstall', enabled: false })
    expect(readProfileManifest('dsh', f.profileDir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base'])
    expect(disablePatchRow('# keep\n- insert:\n    - id: plugin-fake-bundle\n      name: fake-bundle\n    - id: other\n      name: other\n', 'fake-bundle'))
      .toContain('other')
    expect(disablePatchRow('# keep\n- insert:\n    - id: plugin-fake-bundle\n      name: fake-bundle\n    - id: other\n      name: other\n', 'fake-bundle'))
      .not.toContain('fake-bundle')
  })

  it('reconciles a dependency that gains a bundle declaration on update', async () => {
    const f = fixture()
    installFake(f, 'fake', {})
    const runPnpm = fakePnpm(f, (manifest) => {
      manifest.dependencies = { fake: '^2.0.0' }
      manifest.dsh = { profile: { bundles: ['@deepseek-ai/dsh-base'] } }
    })
    installFake(f, 'fake', { dsh: { bundle: { patch: './cordis.patch.yml' } } })
    await updateProfilePlugin({ ...f, packageName: 'fake', runPnpm })
    expect(readProfileManifest('dsh', f.profileDir).dsh?.profile?.bundles).toEqual(['@deepseek-ai/dsh-base', 'fake'])
  })

  it('lists dependency and template plugins with their flags', async () => {
    const f = fixture()
    installFake(f, 'fake-client', { dsh: { client: { platform: 'web' } } })
    const runPnpm = fakePnpm(f, (manifest) => { manifest.dependencies = { 'fake-client': '^1.0.0' } })
    await installProfilePlugin({ ...f, spec: 'fake-client', enable: true, runPnpm })
    const plugins = await listProfilePlugins(f)
    expect(plugins).toContainEqual(expect.objectContaining({
      packageName: 'fake-client', source: 'dependency', client: true, enabled: true, patchRows: ['plugin-fake-client'],
    }))
    expect(plugins).toContainEqual(expect.objectContaining({ packageName: '@deepseek-ai/dsh-base', source: 'template' }))
  })

  it('exposes the bundled pnpm executable built by @pnpm/exe', () => {
    expect(resolveBundledPnpmExecutable()).toMatch(/@pnpm[\\/]exe/)
  })
})
