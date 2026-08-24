/**
 * Durable npm plugin catalog index behind the pluginManager directory.
 *
 * The index holds every npm package carrying the `dsh-plugin` keyword whose
 * latest manifest declares a DSH bundle or client role, together with the
 * search-time metadata (description, keywords, links, monthly downloads)
 * needed to render catalog entries. It is rebuilt in the background when its
 * on-disk copy under `$DSH_HOME/cache` ages past the refresh window, persisted
 * atomically, and searched locally with deterministic ranking so exact and
 * prefix matches surface ahead of npm's popularity-weighted relevance order.
 * @module @deepseek-ai/dsh-host-plugin-manager/catalog-index
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** On-disk format version; a file written by another version is ignored and rebuilt. */
export const CATALOG_INDEX_VERSION = 1

/** Registry page size used while listing the full `dsh-plugin` keyword scope. */
const INDEX_SEARCH_PAGE_SIZE = 250

/** Upper bound on listed registry pages, so a paging anomaly cannot loop forever. */
const INDEX_SEARCH_MAX_PAGES = 80

/** One verified plugin retained by the index, with everything catalog rendering needs. */
export interface PluginCatalogIndexEntry {
  packageName: string
  description: string | null
  repository: string | null
  homepage: string | null
  npmUrl: string | null
  keywords: readonly string[]
  downloads: number
}

/** The parsed content of one catalog index file. */
export interface PluginCatalogIndex {
  version: typeof CATALOG_INDEX_VERSION
  /** ISO timestamp of the completed build; drives the refresh decision. */
  builtAt: string
  entries: readonly PluginCatalogIndexEntry[]
}

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

/** The latest manifest slice used to verify a package's DSH role. */
export interface DshPackageManifest {
  name?: unknown
  description?: unknown
  keywords?: unknown
  homepage?: unknown
  repository?: unknown
  dsh?: {
    bundle?: unknown
    client?: unknown
  }
}

/** One npm search response page with its registry-side match estimate. */
export interface NpmSearchResponse {
  total?: unknown
  objects?: readonly NpmSearchResult[]
}

/** JSON fetcher shared with the gateway so tests can stub network access once. */
export type CatalogFetchJson = (url: string) => Promise<unknown>

/**
 * Build an unambiguous cache key for one normalized query/page pair.
 * @param query - normalized search text.
 * @param page - zero-based page.
 * @returns the cache key.
 */
export function catalogCacheKey(query: string, page: number): string {
  return `${query}\u0000${page}`
}

/**
 * Build an npm registry URL without turning a scope separator into a path segment.
 * @param packageName - npm package name.
 * @param suffix - path suffix such as `/latest`.
 * @returns the registry URL.
 */
export function npmUrl(packageName: string, suffix = ''): string {
  const encoded = packageName.split('/').map(part => encodeURIComponent(part).replace('%40', '@')).join('/')
  return `https://registry.npmjs.org/${encoded}${suffix}`
}

/**
 * Normalize an npm git repository link into an `owner/repo` slug when possible.
 * @param link - string or `{ url }` repository metadata.
 * @returns the GitHub slug, or null when the link is not a usable repository.
 */
export function repositorySlug(link: unknown): string | null {
  const url = typeof link === 'object' && link !== null && !Array.isArray(link)
    ? (link as { url?: unknown }).url
    : link
  if (typeof url !== 'string' || url.trim() === '') return null
  const withoutProtocol = url.replace(/^git\+/, '').replace(/^git:\/\//, 'https://')
  const match = /github\.com\/([^/]+)\/([^/#?]+?)(?:\.git)?(?:[/?#]|$)/.exec(withoutProtocol)
  return match === null ? null : `${match[1]}/${match[2]}`
}

/**
 * Whether a latest manifest declares an installable DSH role.
 * @param manifest - the parsed latest manifest.
 * @returns true when `dsh.bundle` or `dsh.client` is declared.
 */
export function manifestDeclaresRole(manifest: DshPackageManifest): boolean {
  return manifest.dsh?.bundle != null || manifest.dsh?.client != null
}

/**
 * Map over items with at most `limit` workers active at once.
 * @param items - items to process.
 * @param limit - maximum concurrent workers.
 * @param worker - async processor applied to each item.
 * @returns the results in input order.
 */
export async function mapWithLimit<T, R>(
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/** Parse one raw index entry, or return null when it does not carry a usable package. */
function parseIndexEntry(value: unknown): PluginCatalogIndexEntry | null {
  if (!isRecord(value)) return null
  const packageName = value.packageName
  if (typeof packageName !== 'string' || packageName === '' || packageName.length > 214
    || /\s/.test(packageName) || packageName.startsWith('.')) {
    return null
  }
  const downloads = value.downloads
  const keywords = Array.isArray(value.keywords)
    ? value.keywords.filter((keyword): keyword is string => typeof keyword === 'string')
    : []
  if (typeof downloads !== 'number' || !Number.isFinite(downloads) || downloads < 0) return null
  return {
    packageName,
    description: optionalText(value.description),
    repository: optionalText(value.repository),
    homepage: optionalText(value.homepage),
    npmUrl: optionalText(value.npmUrl),
    keywords,
    downloads,
  }
}

/**
 * Validate one parsed index file against the current schema.
 * @param value - parsed JSON content of an index file.
 * @returns the normalized index, or null when any part is unusable — the file
 * is then treated as absent and rebuilt.
 */
export function parseCatalogIndex(value: unknown): PluginCatalogIndex | null {
  if (!isRecord(value)) return null
  if (value.version !== CATALOG_INDEX_VERSION) return null
  const builtAt = value.builtAt
  if (typeof builtAt !== 'string' || builtAt === '' || Number.isNaN(Date.parse(builtAt))) return null
  if (!Array.isArray(value.entries)) return null
  const entries: PluginCatalogIndexEntry[] = []
  for (const raw of value.entries) {
    const entry = parseIndexEntry(raw)
    if (entry === null) return null
    entries.push(entry)
  }
  return { version: CATALOG_INDEX_VERSION, builtAt, entries }
}

/**
 * Read and validate the persisted index.
 * @param path - absolute index file path.
 * @returns the index, or null when it is missing, unreadable, or from another
 * schema version — all conditions that the background rebuild heals.
 */
export function loadCatalogIndex(path: string): PluginCatalogIndex | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    // A missing cache is the normal first-run state, not an error surface.
    return null
  }
  try {
    return parseCatalogIndex(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Persist the index by writing a sibling temp file and renaming it into place,
 * so concurrent readers never observe a partially written cache.
 * Last writer wins when several hosts rebuild at once.
 * @param path - absolute index file path.
 * @param index - the completed build to persist.
 */
export function saveCatalogIndexAtomic(path: string, index: PluginCatalogIndex): void {
  mkdirSync(dirname(path), { recursive: true })
  const tempPath = `${path}.${process.pid}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(index, undefined, 2)}\n`, 'utf8')
  renameSync(tempPath, path)
}

interface RawSearchCandidate {
  packageName: string
  description: string | null
  keywords: readonly string[]
  repository: string | null
  homepage: string | null
  npmUrl: string | null
  downloads: number
}

async function listKeywordScope(fetchJson: CatalogFetchJson): Promise<RawSearchCandidate[]> {
  const collected = new Map<string, RawSearchCandidate>()
  for (let page = 0; page < INDEX_SEARCH_MAX_PAGES; page += 1) {
    const searchText = 'keywords:dsh-plugin'
    const response = await fetchJson(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(searchText)}` +
        `&size=${INDEX_SEARCH_PAGE_SIZE}&from=${page * INDEX_SEARCH_PAGE_SIZE}`,
    ) as NpmSearchResponse
    const objects = response.objects ?? []
    for (const result of objects) {
      const pkg = result.package
      const packageName = typeof pkg?.name === 'string' ? pkg.name : ''
      const keywords = Array.isArray(pkg?.keywords) ? pkg.keywords : []
      if (packageName === '' || !keywords.includes('dsh-plugin')) continue
      if (packageName.startsWith('@deepseek-ai/')) continue
      collected.set(packageName, {
        packageName,
        description: typeof pkg?.description === 'string' ? pkg.description : null,
        keywords: keywords.filter((keyword): keyword is string => typeof keyword === 'string'),
        repository: repositorySlug(pkg?.links?.repository),
        homepage: typeof pkg?.links?.homepage === 'string' ? pkg.links.homepage : null,
        npmUrl: typeof pkg?.links?.npm === 'string' ? pkg.links.npm : null,
        downloads: typeof result.downloads?.monthly === 'number' ? result.downloads.monthly : 0,
      })
    }
    if (objects.length < INDEX_SEARCH_PAGE_SIZE) break
  }
  return [...collected.values()]
}

/**
 * Build one complete index: list the full `dsh-plugin` keyword scope, keep the
 * packages whose latest manifest declares a DSH role, and order the survivors
 * by monthly downloads. The keyword is an author claim; the manifest check is
 * the installability contract, identical to the live catalog path.
 * @param fetchJson - registry JSON fetcher.
 * @returns the completed index.
 */
export async function buildCatalogIndex(fetchJson: CatalogFetchJson): Promise<PluginCatalogIndex> {
  const candidates = await listKeywordScope(fetchJson)
  const entries = (await mapWithLimit(candidates, 8, async (candidate) => {
    try {
      const manifest = await fetchJson(npmUrl(candidate.packageName, '/latest')) as DshPackageManifest
      if (!manifestDeclaresRole(manifest)) return null
      return {
        packageName: candidate.packageName,
        description: optionalText(manifest.description) ?? candidate.description,
        repository: repositorySlug(manifest.repository) ?? candidate.repository,
        homepage: optionalText(manifest.homepage) ?? candidate.homepage,
        npmUrl: candidate.npmUrl,
        keywords: candidate.keywords,
        downloads: candidate.downloads,
      }
    } catch {
      // A keyword-only package without a readable latest manifest is not a plugin.
      return null
    }
  })).flatMap(entry => entry === null ? [] : [entry])
  entries.sort((left, right) =>
    right.downloads - left.downloads || left.packageName.localeCompare(right.packageName))
  return { version: CATALOG_INDEX_VERSION, builtAt: new Date().toISOString(), entries }
}

/**
 * Rank indexed plugins for one normalized query with deterministic tiers:
 * equal name, then name prefix, then name substring, then keyword hit, then
 * description hit; multi-word queries require every word to hit somewhere and
 * take the worst tier of their words. Ties break by monthly downloads, then
 * name. An empty query returns the full download-ranked directory.
 * @param index - the persisted index to search.
 * @param query - normalized search text.
 * @returns the matching entries in deterministic rank order.
 */
export function rankCatalogIndex(
  index: PluginCatalogIndex,
  query: string,
): readonly PluginCatalogIndexEntry[] {
  const words = query.split(' ').filter(word => word !== '')
  const ordered = [...index.entries].sort((left, right) =>
    right.downloads - left.downloads || left.packageName.localeCompare(right.packageName))
  if (words.length === 0) return ordered
  const scored: Array<{ entry: PluginCatalogIndexEntry; tier: number }> = []
  for (const entry of ordered) {
    const name = entry.packageName.toLowerCase()
    const keywords = entry.keywords.map(keyword => keyword.toLowerCase())
    const description = (entry.description ?? '').toLowerCase()
    let tier = 0
    let matchedAll = true
    for (const word of words) {
      const wordTier
        = name === word ? 0
          : name.startsWith(word) ? 1
            : name.includes(word) ? 2
              : keywords.some(keyword => keyword.includes(word)) ? 3
                : description.includes(word) ? 4
                  : -1
      if (wordTier === -1) {
        matchedAll = false
        break
      }
      tier = Math.max(tier, wordTier)
    }
    if (matchedAll) scored.push({ entry, tier })
  }
  return scored.sort((left, right) =>
    left.tier - right.tier
    || right.entry.downloads - left.entry.downloads
    || left.entry.packageName.localeCompare(right.entry.packageName))
    .map(scoredEntry => scoredEntry.entry)
}
