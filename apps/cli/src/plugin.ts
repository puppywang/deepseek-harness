/**
 * `dsh plugin --profile <name> <args...>` — profile plugin management. The
 * profile manifest, bundle reconciliation, path anchoring, and patch-row
 * handling live in `@deepseek-ai/dsh-plugin-manager`; this module keeps the
 * CLI's synchronous pnpm forwarding, its bundled-pnpm fallback, and its
 * user-facing messages.
 * @module @deepseek-ai/dsh/plugin
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  PROFILE_TEMPLATES,
  readProfileManifest,
  resolveProfileDir,
} from '@deepseek-ai/dsh-app-boot'
import {
  anchorPathSpec,
  ensureProfile,
  listProfilePlugins,
  reconcileBundleLayers,
  resolveBundledPnpmExecutable,
} from '@deepseek-ai/dsh-plugin-manager'
import { INSTALL_ANCHOR } from './profile-boot.ts'

const NAME = 'dsh'

/**
 * Run one `dsh plugin` invocation: init if needed, forward to pnpm, reconcile.
 * A missing system pnpm falls back to the `@pnpm/exe` binary bundled with the
 * plugin-manager package, so packaged desktop installs need no global pnpm.
 * @param profile - the profile name.
 * @param args - pnpm arguments with relative path specs anchored to the invoking directory.
 * @returns the pnpm exit code.
 */
export async function runPlugin(profile: string, args: readonly string[]): Promise<number> {
  const dir = resolveProfileDir(profile)
  if (!existsSync(join(dir, 'package.json'))) {
    await ensureProfile(dir, PROFILE_TEMPLATES[profile] ?? DEFAULT_PROFILE_BUNDLES)
    process.stderr.write(`${NAME}: initialized profile ${profile} at ${dir}\n`)
  }
  const before = readProfileManifest(NAME, dir)
  const anchored = args.map(argument => anchorPathSpec(argument, process.cwd()))
  // Windows resolves pnpm through its .cmd shim, which spawn() refuses
  // without a shell since the CVE-2024-27980 hardening.
  const run = (command: string, shell: boolean): ReturnType<typeof spawnSync> =>
    spawnSync(command, anchored, { cwd: dir, stdio: 'inherit', shell })
  let result = run('pnpm', process.platform === 'win32')
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      try {
        result = run(resolveBundledPnpmExecutable(), false)
      } catch (error) {
        process.stderr.write(`${NAME}: pnpm not found on PATH — install pnpm to manage profile plugins\n`)
        process.stderr.write(`${NAME}: bundled pnpm fallback unavailable: ${error instanceof Error ? error.message : String(error)}\n`)
        return 127
      }
    } else {
      throw result.error
    }
  }
  const exitCode = result.status ?? 1
  if (exitCode === 0) {
    await reconcileBundleLayers({ profileDir: dir, installAnchor: INSTALL_ANCHOR }, before)
    const installed = await listProfilePlugins({ profileDir: dir, installAnchor: INSTALL_ANCHOR })
    for (const plugin of installed) {
      if (plugin.source === 'dependency' && !plugin.bundle) {
        process.stderr.write(
          `${NAME}: warning: ${plugin.packageName} declares no dsh.bundle — installed as a plain dependency, not a profile layer `
          + '(a later update that gains one activates it automatically)\n',
        )
      }
    }
  } else {
    // pnpm's own diagnostics name pnpm-workspace.yaml without saying WHICH
    // one; the profile owns it, and the commonest failure here is pnpm ≥10
    // blocking a git dependency's prepare (build) script until allowlisted.
    process.stderr.write(`${NAME}: pnpm failed in profile directory ${dir}\n`)
    if (args.some(argument => /^git\+|^github:|\.git(?:#|$)/.test(argument))) {
      process.stderr.write(
        `${NAME}: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed — `
        + `add the exact key pnpm printed above under allowBuilds in ${join(dir, 'pnpm-workspace.yaml')}, then re-run\n`,
      )
    }
  }
  return exitCode
}
