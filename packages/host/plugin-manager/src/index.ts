/** Host Remote for profile plugin management: list, install, update, uninstall. */

import { dirname, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-subprocess'
import { resolveProfileDir, loadProfile, reloadRootInclude } from '@deepseek-ai/dsh-app-boot'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
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
import {
  buildCatalogIndex,
  catalogCacheKey,
  loadCatalogIndex,
  manifestDeclaresRole,
  mapWithLimit,
  npmUrl,
  rankCatalogIndex,
  repositorySlug,
  saveCatalogIndexAtomic,
  type CatalogFetchJson,
  type DshPackageManifest,
  type NpmSearchResponse,
  type PluginCatalogIndex,
  type PluginCatalogIndexEntry,
} from './catalog-index.ts'
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
/** Cap deep paging of the live npm fallback, where relevance degrades and every page costs manifest checks. */
const CATALOG_MAX_PAGE = 19
const CATALOG_FETCH_CONCURRENCY = 8
const CATALOG_CACHE_LIMIT = 64
/** Rebuild the persisted index once its build timestamp ages past this window. */
const CATALOG_INDEX_REFRESH_MS = 24 * 60 * 60_000
/** After one failed rebuild, wait this long before the next catalog call retries it. */
const CATALOG_INDEX_RETRY_MS = 5 * 60_000
/** Local index pages cost no registry traffic, so paging is bounded only for sanity. */
const CATALOG_INDEX_MAX_PAGE = 200

/**
 * Absolute path of the durable plugin catalog index under the Harness home.
 * The directory is created by the atomic save on first rebuild.
 */
function catalogIndexPath(): string {
  return dshHomePath('cache', 'plugin-catalog-index.json')
}

/** One npm candidate retained before its latest manifest proves the DSH role. */
interface NpmPluginCandidate extends PluginCatalogIndexEntry {
  searchScore: number
}

/** The exact catalog payload produced by one registry pass or one local index query. */
type CatalogPageResult = Omit<PluginManagerCatalog, 'query'>

/** A cached catalog page, so repeated searches do not re-walk npm or the index. */
interface CatalogCache {
  at: number
  result: Omit<PluginManagerCatalog, 'query'>
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
  return Math.min(value, CATALOG_INDEX_MAX_PAGE)
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

/** Project one verified candidate into its wire catalog entry. */
function catalogEntryOf(candidate: PluginCatalogIndexEntry): PluginManagerCatalogEntry {
  const repo = candidate.repository ?? candidate.packageName
  const identity = sourceIdentity(candidate.packageName, repo)
  return {
    packageName: candidate.packageName,
    repo,
    description: candidate.description,
    homepage: candidate.repository !== null
      ? `https://github.com/${candidate.repository}`
      : candidate.homepage ?? candidate.npmUrl,
    downloads: candidate.downloads,
    ...identity,
  }
}

/**
 * Names one likely exact npm package. This is a discovery aid, not validation:
 * the registry manifest check remains the authority for installability.
 */
function exactPackageNames(query: string): readonly string[] {
  if (query === '') return []
  const candidates = new Set<string>([query])
  const words = query.split(' ').filter(part => part !== '')
  if (words.length > 1) candidates.add(words.join('-'))
  return [...candidates].filter(candidate =>
    candidate.length <= 214
    && !candidate.startsWith('.')
    && !candidate.startsWith('_')
    && /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(candidate),
  )
}

/** Remote-only service managing the `web` profile's installed plugins. */
export class PluginManagerGateway extends TypertRemoteService {
  static inject = ['subprocess']

  private catalogCaches = new Map<string, CatalogCache>()
  private catalogInflight = new Map<string, Promise<PluginManagerCatalog>>()
  private catalogIndex: PluginCatalogIndex | null = null
  private catalogIndexLoaded = false
  private catalogIndexBuild: Promise<void> | null = null
  private catalogIndexFailedAt = 0

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
   * Answer one catalog page from the persisted full index when it exists —
   * deterministic local ranking over every verified `dsh-plugin` package — and
   * otherwise fall back to live npm server-side search while the first index
   * builds in the background. Small pages keep first paint responsive; clients
   * page on demand.
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

    const index = this.ensureCatalogIndex()
    const searched = (index !== null
      ? this.catalogFromIndex(index, query, page)
      : this.searchCatalog(query, page)
    ).then(result => ({ query, ...result }))
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

  /**
   * Load the persisted index once per process and kick off exactly one
   * background rebuild when it is missing or older than the refresh window.
   * The stale copy keeps answering while the rebuild runs; a failed rebuild is
   * retried by the next catalog call after the retry backoff.
   * @returns the index to answer from, or null before the first successful build.
   */
  private ensureCatalogIndex(): PluginCatalogIndex | null {
    if (!this.catalogIndexLoaded) {
      this.catalogIndexLoaded = true
      this.catalogIndex = loadCatalogIndex(catalogIndexPath())
    }
    const index = this.catalogIndex
    const builtAt = index === null ? Number.NaN : Date.parse(index.builtAt)
    const stale = Number.isNaN(builtAt) || Date.now() - builtAt > CATALOG_INDEX_REFRESH_MS
    if (stale && this.catalogIndexBuild === null
      && Date.now() - this.catalogIndexFailedAt > CATALOG_INDEX_RETRY_MS) {
      this.catalogIndexBuild = this.rebuildCatalogIndex().finally(() => {
        this.catalogIndexBuild = null
      })
    }
    return index
  }

  /** Rebuild the full verified directory off the request path and persist it atomically. */
  private async rebuildCatalogIndex(): Promise<void> {
    try {
      const fetchJson: CatalogFetchJson = url => this.fetchJson(url)
      const index = await buildCatalogIndex(fetchJson)
      this.catalogIndex = index
      try {
        saveCatalogIndexAtomic(catalogIndexPath(), index)
      } catch {
        // Persistence is best-effort: this process keeps answering from memory,
        // and the next host rebuilds from the registry as usual.
      }
    } catch {
      // The stale index keeps answering; the next catalog call retries after
      // the backoff, so one registry outage never empties the directory.
      this.catalogIndexFailedAt = Date.now()
    }
  }

  /**
   * Verify likely exact npm package names and turn their latest manifests into
   * high-priority candidates. Lookup failures are normal: the query usually
   * remains free text.
   * @param query - normalized search text.
   * @returns verified candidates for names the user may have typed literally.
   */
  private async exactSearchCandidates(query: string): Promise<NpmPluginCandidate[]> {
    return (await Promise.all(exactPackageNames(query).map(async (packageName) => {
      try {
        const manifest = await this.fetchJson(npmUrl(packageName, '/latest')) as DshPackageManifest
        if (!manifestDeclaresRole(manifest)) return null
        const keywords = Array.isArray(manifest.keywords) ? manifest.keywords : []
        if (!keywords.includes('dsh-plugin')) return null
        return {
          packageName,
          description: typeof manifest.description === 'string' ? manifest.description : null,
          repository: repositorySlug(manifest.repository),
          homepage: typeof manifest.homepage === 'string' ? manifest.homepage : null,
          npmUrl: `https://www.npmjs.com/package/${packageName}`,
          keywords: keywords.filter((keyword): keyword is string => typeof keyword === 'string'),
          downloads: 0,
          searchScore: Number.MAX_SAFE_INTEGER,
        }
      } catch {
        // A nonexistent or private exact name just leaves the ranked results alone.
        return null
      }
    }))).flatMap(candidate => candidate === null ? [] : [candidate])
  }

  /**
   * Page the persisted index with deterministic local ranking. Live exact-name
   * probes stay authoritative on the first page, so packages published after
   * the last rebuild are found even though the index predates them.
   */
  private async catalogFromIndex(
    index: PluginCatalogIndex,
    query: string,
    page: number,
  ): Promise<CatalogPageResult> {
    const ranked = rankCatalogIndex(index, query).map(candidate => catalogEntryOf(candidate))
    const probes = page === 0 && query !== '' ? await this.exactSearchCandidates(query) : []
    const known = new Set(ranked.map(entry => entry.packageName))
    const probed = probes
      .filter(candidate => !known.has(candidate.packageName))
      .map(candidate => catalogEntryOf(candidate))
    const entries = [...probed, ...ranked]
    const start = page * CATALOG_PAGE_SIZE
    return {
      page,
      pageSize: CATALOG_PAGE_SIZE,
      totalMatches: entries.length,
      hasMore: start + CATALOG_PAGE_SIZE < entries.length,
      entries: entries.slice(start, start + CATALOG_PAGE_SIZE),
    }
  }

  /**
   * Query one npm page, verify each candidate manifest, and rank the verified result.
   * This is the pre-index fallback: it answers before the first background
   * build finishes and whenever the persisted index is unusable. A query that
   * names an npm package is also looked up directly because npm's relevance
   * search may bury a new or zero-download exact match behind older
   * high-download keyword matches.
   */
  private async searchCatalog(query: string, page: number): Promise<CatalogPageResult> {
    const searchText = ['keywords:dsh-plugin', query].filter(part => part !== '').join(' ')
    const [search, exactCandidates] = await Promise.all([
      this.fetchJson(
        `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchText)}` +
          `&size=${CATALOG_PAGE_SIZE}&from=${page * CATALOG_PAGE_SIZE}`,
      ) as Promise<NpmSearchResponse>,
      page === 0 ? this.exactSearchCandidates(query) : Promise.resolve([]),
    ])
    const objects = search.objects ?? []
    const totalMatches = typeof search.total === 'number' && Number.isFinite(search.total)
      && search.total >= 0
      ? search.total
      : null
    const hasMore = objects.length === CATALOG_PAGE_SIZE
      && totalMatches !== null
      && page < CATALOG_MAX_PAGE
      && page * CATALOG_PAGE_SIZE + CATALOG_PAGE_SIZE < totalMatches
    const candidates = [
      ...exactCandidates,
      ...objects.flatMap((result): NpmPluginCandidate[] => {
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
          keywords: keywords.filter((keyword): keyword is string => typeof keyword === 'string'),
          downloads: typeof result.downloads?.monthly === 'number' ? result.downloads.monthly : 0,
          searchScore,
        }]
      }),
    ].filter((candidate, index, all) =>
      all.findIndex(match => match.packageName === candidate.packageName) === index,
    )

    // The keyword is an author claim; the manifest is the installability contract.
    const verified = await mapWithLimit(candidates, CATALOG_FETCH_CONCURRENCY, async (candidate) => {
      try {
        const manifest = await this.fetchJson(npmUrl(candidate.packageName, '/latest')) as DshPackageManifest
        if (!manifestDeclaresRole(manifest)) return null
        return candidate
      } catch {
        // A keyword-only package without a readable DSH manifest is not a plugin.
        return null
      }
    })

    const entries = verified.flatMap((candidate) => {
      if (candidate === null) return []
      return [catalogEntryOf(candidate)]
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
