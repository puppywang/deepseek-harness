/** Host Remote for profile plugin management: list, install, update, uninstall. */

import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import { resolveProfileDir, loadProfile, reloadRootInclude } from '@deepseek-ai/dsh-app-boot'
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
  PluginManagerCatalog,
  PluginManagerCatalogEntry,
  PluginManagerInstallRequest,
  PluginManagerMutation,
  PluginManagerPackageRequest,
  PluginManagerRestartResult,
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

  /** Fetch one JSON URL with a short timeout and a browser-style User-Agent. */
  private async fetchJson(url: string): Promise<unknown> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'deepseek-harness', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      throw new Error(`pluginManager.catalog: ${response.status} ${response.statusText} for ${url}`)
    }
    return await response.json()
  }

  /** Reapply the web profile's full patch stack to the live root Include.
   * @returns false when the live reload could not complete and a restart is required.
   */
  private async applyLive(): Promise<boolean> {
    try {
      const { installAnchor } = this.options()
      await reloadRootInclude(this.ctx, {
        profile: loadProfile('dsh', 'web', installAnchor, undefined, { userLayer: true }),
      })
      return true
    } catch {
      return false
    }
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
   * List GitHub repositories tagged `dsh-plugin` and resolve each one's npm
   * package name from its `package.json`. Entries are sorted by star count.
   * @returns the discoverable plugin catalog.
   */
  @Remote('catalog')
  async catalog(): Promise<PluginManagerCatalog> {
    const search = await this.fetchJson(
      'https://api.github.com/search/repositories?q=topic%3Adsh-plugin&sort=stars&order=desc&per_page=30',
    ) as {
      items?: Array<{
        full_name?: unknown
        description?: unknown
        html_url?: unknown
        stargazers_count?: unknown
        owner?: { login?: unknown }
        name?: unknown
        default_branch?: unknown
      }>
    }
    const repos = search.items ?? []
    const entries: PluginManagerCatalogEntry[] = []
    await Promise.all(repos.slice(0, 20).map(async (repo) => {
      const fullName = typeof repo.full_name === 'string' ? repo.full_name : ''
      const branch = typeof repo.default_branch === 'string' ? repo.default_branch : 'main'
      if (fullName === '') return
      let packageName: string | undefined
      try {
        const manifest = await this.fetchJson(
          `https://raw.githubusercontent.com/${fullName}/${encodeURIComponent(branch)}/package.json`,
        ) as { name?: unknown }
        if (typeof manifest.name === 'string' && manifest.name.length > 0) packageName = manifest.name
      } catch {
        // A repository without a resolvable package.json is not installable from npm.
      }
      if (packageName === undefined) return
      entries.push({
        packageName,
        repo: fullName,
        description: typeof repo.description === 'string' ? repo.description : null,
        homepage: typeof repo.html_url === 'string' ? repo.html_url : null,
        stars: typeof repo.stargazers_count === 'number' ? repo.stargazers_count : 0,
        owner: typeof repo.owner?.login === 'string' ? repo.owner.login : '',
        name: typeof repo.name === 'string' ? repo.name : '',
      })
    }))
    entries.sort((left, right) => right.stars - left.stars)
    return { entries }
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
    const live = await this.applyLive()
    return { ...result, version: result.version ?? null, restartRequired: !live }
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
    const live = await this.applyLive()
    return { ...result, version: result.version ?? null, restartRequired: !live }
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
    const live = await this.applyLive()
    return { ...result, version: result.version ?? null, restartRequired: !live }
  }

  /**
   * Restart the running dsh process after the user confirmed. The desktop shell
   * restarts the harness child; in plain `dsh web` the process exits.
   * @returns the restart acceptance.
   */
  @Remote('restart')
  restart(): PluginManagerRestartResult {
    const appExit = this.ctx.get('appExit') as ((code: number) => void) | undefined
    if (appExit === undefined) {
      throw new Error('pluginManager.restart: the launcher did not provide ctx.appExit')
    }
    appExit(0)
    return { restarted: true }
  }
}

export default PluginManagerGateway
