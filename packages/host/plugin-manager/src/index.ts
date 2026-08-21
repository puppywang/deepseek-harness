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
const CATALOG_TTL_MS = 10 * 60_000
const CATALOG_SIZE = 100
const CATALOG_FETCH_CONCURRENCY = 8

/** One abbreviated npm search result used before the package manifest is verified. */
interface NpmSearchPackage {
  name?: unknown
  description?: unknown
  version?: unknown
  keywords?: unknown
  links?: {
    homepage?: unknown
    repository?: unknown
    npm?: unknown
  }
}

/** One npm search result with its monthly download estimate. */
interface NpmSearchResult {
  downloads?: { monthly?: unknown }
  package?: NpmSearchPackage
}

/** The manifest slice that identifies a package as an installable DSH plugin. */
interface DshPackageManifest {
  name?: unknown
  dsh?: {
    bundle?: unknown
    client?: unknown
  }
}

/** A cached catalog response, so reopening Settings does not re-walk npm. */
interface CatalogCache {
  at: number
  entries: PluginManagerCatalogEntry[]
}

/** Absolute `package.json` of the running dsh installation, or an explicit test override. */
function installAnchor(): string {
  const configured = process.env.DSH_INSTALL_ANCHOR?.trim()
  if (configured !== undefined && configured !== '') return resolve(configured)
  const entry = process.argv[1]
  if (entry !== undefined && entry !== '') return join(dirname(entry), 'package.json')
  throw new Error('pluginManager: cannot resolve the dsh installation anchor; set DSH_INSTALL_ANCHOR')
}

/** Build an npm registry URL without turning a scope separator into a path segment. */
function npmUrl(packageName: string, suffix = ''): string {
  const encoded = packageName.split('/').map(part => encodeURIComponent(part).replace('%40', '@')).join('/')
  return `https://registry.npmjs.org/${encoded}${suffix}`
}

/** Normalize an npm git repository link into an `owner/repo` slug when possible. */
function repositorySlug(link: unknown): string | null {
  if (typeof link !== 'string' || link.trim() === '') return null
  const withoutProtocol = link.replace(/^git\+/, '').replace(/^git:\/\//, 'https://')
  const match = /github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#]|$)/.exec(withoutProtocol)
  return match === null ? null : `${match[1]}/${match[2]}`
}

/** Derive display owner/name from a repository slug, npm scope, or package name. */
function sourceIdentity(packageName: string, repo: string): { owner: string; name: string } {
  const [repoOwner, repoName] = repo.split('/')
  if (repoOwner !== undefined && repoName !== undefined && repoOwner !== '' && repoName !== '') {
    return { owner: repoOwner, name: repoName }
  }
  const [scope, scopedName] = packageName.split('/')
  if (scope !== undefined && scopedName !== undefined && scope.startsWith('@')) {
    return { owner: scope.replace(/^@/, ''), name: scopedName }
  }
  return { owner: 'npm', name: packageName }
}

/** Map over items with at most `limit` workers active at once. */
async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index] as T
      results[index] = await worker(item, index)
    }
  })
  await Promise.all(runners)
  return results
}

/** Remote-only service managing the `web` profile's installed plugins. */
export class PluginManagerGateway extends TypertRemoteService {
  static inject = ['subprocess']

  private catalogCache: CatalogCache | undefined

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
   * List npm packages carrying the `dsh-plugin` keyword and keep only manifests
   * that declare a DSH bundle or client role. Results are ranked by downloads.
   * @returns the discoverable plugin catalog.
   */
  @Remote('catalog')
  async catalog(): Promise<PluginManagerCatalog> {
    const now = Date.now()
    if (this.catalogCache !== undefined && now - this.catalogCache.at < CATALOG_TTL_MS) {
      return { entries: this.catalogCache.entries }
    }

    const search = await this.fetchJson(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent('keywords:dsh-plugin')}&size=${CATALOG_SIZE}`,
    ) as { objects?: readonly NpmSearchResult[] }
    const candidates = (search.objects ?? []).flatMap((result) => {
      const pkg = result.package
      const packageName = typeof pkg?.name === 'string' ? pkg.name : ''
      const keywords = Array.isArray(pkg?.keywords) ? pkg.keywords : []
      if (packageName === '' || !keywords.includes('dsh-plugin')) return []
      if (packageName.startsWith('@deepseek-ai/')) return []
      return [{
        packageName,
        description: typeof pkg?.description === 'string' ? pkg.description : null,
        repository: repositorySlug(pkg?.links?.repository),
        homepage: typeof pkg?.links?.homepage === 'string' ? pkg.links.homepage : null,
        npmUrl: typeof pkg?.links?.npm === 'string' ? pkg.links.npm : null,
        downloads: typeof result.downloads?.monthly === 'number' ? result.downloads.monthly : 0,
      }]
    })

    // The keyword is an author claim; the manifest is the installability contract.
    const verified = await mapWithLimit(candidates, CATALOG_FETCH_CONCURRENCY, async (candidate) => {
      try {
        const manifest = await this.fetchJson(npmUrl(candidate.packageName, '/latest')) as DshPackageManifest
        const hasBundle = manifest.dsh?.bundle != null
        const hasClient = manifest.dsh?.client != null
        if (!hasBundle && !hasClient) return null
        return candidate
      } catch {
        // A keyword-only package without a readable DSH manifest is not a plugin.
        return null
      }
    })

    const entries: PluginManagerCatalogEntry[] = verified.flatMap((candidate) => {
      if (candidate === null) return []
      const repo = candidate.repository ?? candidate.packageName
      const identity = sourceIdentity(candidate.packageName, repo)
      return [{
        packageName: candidate.packageName,
        repo,
        description: candidate.description,
        homepage: candidate.repository !== null
          ? `https://github.com/${candidate.repository}`
          : candidate.homepage ?? candidate.npmUrl,
        downloads: candidate.downloads,
        ...identity,
      }]
    })
    entries.sort((left, right) =>
      right.downloads - left.downloads
      || left.packageName.localeCompare(right.packageName))
    this.catalogCache = { at: now, entries }
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
