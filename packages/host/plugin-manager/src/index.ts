/** Host Remote for profile plugin management: list, install, update, uninstall. */

import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import {
  installProfilePlugin,
  listProfilePlugins,
  resolveBundledPnpmExecutable,
  uninstallProfilePlugin,
  updateProfilePlugin,
  type ProfilePluginRunPnpm,
} from '@deepseek-ai/dsh-plugin-manager'
import { TypertRemoteService, Remote } from '@deepseek-ai/dsh-typert-protocol'
import type {} from 'zod'
import type {
  InstalledPluginView,
  PluginManagerInstallRequest,
  PluginManagerMutation,
  PluginManagerPackageRequest,
  PluginManagerSnapshot,
} from './types.ts'

export type * from './types.ts'

const PNPM_GRACE_MS = 15 * 60_000
const PNPM_COLLECT_BYTES = 64 * 1024

/** Absolute `package.json` of the running dsh installation, or an explicit test override. */
function installAnchor(): string {
  const configured = process.env.DSH_INSTALL_ANCHOR?.trim()
  if (configured !== undefined && configured !== '') return resolve(configured)
  const entry = process.argv[1]
  if (entry !== undefined && entry !== '') return join(dirname(entry), 'package.json')
  throw new Error('pluginManager: cannot resolve the dsh installation anchor; set DSH_INSTALL_ANCHOR')
}

/** Remote-only service managing the `web` profile's installed plugins. */
export class PluginManagerGateway extends TypertRemoteService {
  static inject = ['subprocess']

  constructor(ctx: Context) {
    super(ctx, 'pluginManager')
  }

  private options(): { profileDir: string; installAnchor: string } {
    return { profileDir: resolveProfileDir('web'), installAnchor: installAnchor() }
  }

  /** Run pnpm through the subprocess seam using the bundled executable. */
  private runPnpm: ProfilePluginRunPnpm = async (args, cwd) => {
    const executable = await this.ctx.subprocess.resolveExecutable(resolveBundledPnpmExecutable())
    const handle = this.ctx.subprocess.spawn({
      argv: [executable, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: PNPM_COLLECT_BYTES },
        stderr: { maxBytes: PNPM_COLLECT_BYTES },
      },
      graceMs: PNPM_GRACE_MS,
    })
    const outcome = await handle.done
    return {
      exitCode: outcome.exitCode ?? 1,
      stdout: handle.collected.stdout?.readFrom(0).text ?? '',
      stderr: handle.collected.stderr?.readFrom(0).text ?? '',
    }
  }

  /**
   * List the plugins visible to the `web` profile: dependencies and template bundles.
   * @returns the installed plugin snapshot.
   */
  @Remote('list')
  async list(): Promise<PluginManagerSnapshot> {
    const plugins = await listProfilePlugins(this.options())
    const views: InstalledPluginView[] = plugins.map(plugin => ({ ...plugin, version: plugin.version ?? null }))
    return { plugins: views }
  }

  /**
   * Install one package into the `web` profile and optionally enable its Loader row.
   * @param request - pnpm spec plus the optional enable flag.
   * @returns the installed package's post-install facts; a restart is always required.
   */
  @Remote('install')
  async install(request: PluginManagerInstallRequest): Promise<PluginManagerMutation> {
    const result = await installProfilePlugin({
      ...this.options(),
      spec: request.spec,
      enable: request.enable === true,
      cwd: process.cwd(),
      runPnpm: this.runPnpm,
    })
    return { ...result, version: result.version ?? null }
  }

  /**
   * Update one installed package, reconciling a gained or lost bundle declaration.
   * @param request - the installed package name.
   * @returns the updated package's post-update facts.
   */
  @Remote('update')
  async update(request: PluginManagerPackageRequest): Promise<PluginManagerMutation> {
    const result = await updateProfilePlugin({
      ...this.options(),
      packageName: request.packageName,
      runPnpm: this.runPnpm,
    })
    return { ...result, version: result.version ?? null }
  }

  /**
   * Remove one package, its Loader rows, and its reconciled bundle layer.
   * @param request - the installed package name.
   * @returns the removed package's post-removal facts.
   */
  @Remote('uninstall')
  async uninstall(request: PluginManagerPackageRequest): Promise<PluginManagerMutation> {
    const result = await uninstallProfilePlugin({
      ...this.options(),
      packageName: request.packageName,
      runPnpm: this.runPnpm,
    })
    return { ...result, version: result.version ?? null }
  }
}

export default PluginManagerGateway
