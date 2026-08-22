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
  PluginManagerCatalogRequest,
  PluginManagerInstallRequest,
  PluginManagerMutation,
  PluginManagerPackageRequest,
  PluginManagerRestartResult,
  PluginManagerSnapshot,
} from './types.ts'

export type * from './types.ts'

const PNPM_GRACE_MS = 15 * 60_000
const PNPM_COLLECT_BYTES = 64 * 1024
const CATALOG_TTL_MS = 30 * 60_000
/** Small enough that one page stays responsive; large enough to avoid chatty paging. */
const CATALOG_PAGE_SIZE = 30
/** Cap deep paging where npm relevance degrades and every page costs manifest checks. */
const CATALOG_MAX_PAGE = 19
const CATALOG_FETCH_CONCURRENCY = 8
const CATALOG_CACHE_LIMIT = 64

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
  searchScore?: unknown
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

/** One npm search response page with its registry-side match estimate. */
interface NpmSearchResponse {
  total?: unknown
  objects?: readonly NpmSearchResult[]
}

/** A cached catalog page, so repeated searches do not re-walk npm. */
interface CatalogCache {
  at: number
  result: Omit<PluginManagerCatalog, 'query'>
}

/** The exact catalog payload produced by one registry search and manifest pass. */
type CatalogPageResult = Omit<PluginManagerCatalog, 'query'>

/** One npm candidate retained before its latest manifest proves the DSH role. */
interface NpmPluginCandidate {
  packageName: string
  description: string | null
  repository: string | null
  homepage: string | null
  npmUrl: string | null
  downloads: number
  searchScore: number
}

/** Absolute `package.json` of the running dsh installation, or an explicit test override. */
function installAnchor(): string {
  const configured = process.env.DSH_INSTALL_ANCHOR?.trim()
  if (configured !== undefined && configured !== '') return resolve(configured)
  const entry = process.argv[1]
  if (entry !== undefined && entry !== '') return join(dirname(entry), 'package.json')
  throw new Error('pluginManager: cannot resolve the dsh installation anchor; set DSH_INSTALL_ANCHOR')
}

/** Wait for one retry backoff step without holding a subprocess slot. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => { setTimeout(resolvePromise, ms) })
}

/** Normalize a user search into a stable cache key and npm-safe text query. */
function normalizeCatalogQuery(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/gu, ' ').trim().slice(0, 128).toLocaleLowerCase()
}

/** Clamp the requested page into the supported browsing window. */
function normalizeCatalogPage(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return 0
  return Math.min(value, CATALOG_MAX_PAGE)
}

/** Build an unambiguous cache key for one normalized query/page pair. */
function catalogCacheKey(query: string, page: number): string {
  return `${query}\u0000${page}`
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

  private catalogCaches = new Map<string, CatalogCache>()
  private catalogInflight = new Map<string, Promise<PluginManagerCatalog>>()

  constructor(ctx: Context) {
    super(ctx, 'pluginManager')
  }

  private options(): { profileDir: string; installAnchor: string } {
    return { profileDir: resolveProfileDir('web'), installAnchor: installAnchor() }
  }

  /** Fetch one JSON URL with a short timeout, browser-style headers, and bounded retries. */
  private async fetchJson(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'deepseek-harness', Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (response.ok) return await response.json()
      // The public registry occasionally answers a burst with a transient
      // content-negotiation or capacity status; retry those before dropping a
      // plugin from the directory.
      if (![406, 429, 500, 502, 503, 504].includes(response.status) || attempt >= 2) {
        throw new Error(`pluginManager.catalog: ${response.status} ${response.statusText} for ${url}`)
      }
      await sleep((attempt + 1) * 250)
    }
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
   * Search one page of npm packages carrying the `dsh-plugin` keyword and keep
   * only manifests that declare a DSH bundle or client role. An empty query
   * returns the popular directory; a non-empty query uses npm's server-side
   * text ranking. Small pages keep first paint responsive; clients page on demand.
   * @param request - optional free-text search and zero-based page.
   * @returns one verified catalog page for the normalized query.
   */
  @Remote('catalog')
  async catalog(request?: PluginManagerCatalogRequest): Promise<PluginManagerCatalog> {
    const query = normalizeCatalogQuery(request?.query)
    const page = normalizeCatalogPage(request?.page)
    const key = catalogCacheKey(query, page)
    const now = Date.now()
    const cache = this.catalogCaches.get(key)
    if (cache !== undefined && now - cache.at < CATALOG_TTL_MS) {
      // Refresh insertion order so the bounded cache keeps hot pages first.
      this.catalogCaches.delete(key)
      this.catalogCaches.set(key, cache)
      return { query, ...cache.result }
    }

    const pending = this.catalogInflight.get(key)
    if (pending !== undefined) return pending

    const searched = this.searchCatalog(query, page).then(result => ({ query, ...result }))
    this.catalogInflight.set(key, searched)
    try {
      const result = await searched
      const { query: _query, ...cached } = result
      this.catalogCaches.set(key, { at: now, result: cached })
      while (this.catalogCaches.size > CATALOG_CACHE_LIMIT) {
        const oldest = this.catalogCaches.keys().next()
        if (oldest.done === true) break
        this.catalogCaches.delete(oldest.value)
      }
      return result
    } finally {
      this.catalogInflight.delete(key)
    }
  }

  /** Query one npm page, verify each candidate manifest, and rank the verified result. */
  private async searchCatalog(query: string, page: number): Promise<CatalogPageResult> {
    const searchText = ['keywords:dsh-plugin', query].filter(part => part !== '').join(' ')
    const from = page * CATALOG_PAGE_SIZE
    const search = await this.fetchJson(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchText)}` +
        `&size=${CATALOG_PAGE_SIZE}&from=${from}`,
    ) as NpmSearchResponse
    const objects = search.objects ?? []
    const totalMatches = typeof search.total === 'number' && Number.isFinite(search.total)
      && search.total >= 0
      ? search.total
      : null
    const hasMore = objects.length === CATALOG_PAGE_SIZE
      && totalMatches !== null
      && page < CATALOG_MAX_PAGE
      && from + CATALOG_PAGE_SIZE < totalMatches
    const candidates = objects.flatMap((result): NpmPluginCandidate[] => {
      const pkg = result.package
      const packageName = typeof pkg?.name === 'string' ? pkg.name : ''
      const keywords = Array.isArray(pkg?.keywords) ? pkg.keywords : []
      const searchScore = typeof result.searchScore === 'number' && Number.isFinite(result.searchScore)
        ? result.searchScore
        : 0
      if (packageName === '' || !keywords.includes('dsh-plugin')) return []
      if (packageName.startsWith('@deepseek-ai/')) return []
      return [{
        packageName,
        description: typeof pkg?.description === 'string' ? pkg.description : null,
        repository: repositorySlug(pkg?.links?.repository),
        homepage: typeof pkg?.links?.homepage === 'string' ? pkg.links.homepage : null,
        npmUrl: typeof pkg?.links?.npm === 'string' ? pkg.links.npm : null,
        downloads: typeof result.downloads?.monthly === 'number' ? result.downloads.monthly : 0,
        searchScore,
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
    const searchScores = new Map(candidates.map(candidate => [candidate.packageName, candidate.searchScore]))
    entries.sort((left, right) => {
      if (query === '') return right.downloads - left.downloads
        || left.packageName.localeCompare(right.packageName)
      return (searchScores.get(right.packageName) ?? 0) - (searchScores.get(left.packageName) ?? 0)
        || right.downloads - left.downloads
        || left.packageName.localeCompare(right.packageName)
    })
    return {
      page,
      pageSize: CATALOG_PAGE_SIZE,
      totalMatches,
      hasMore,
      entries,
    }
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
