/** Wire vocabulary for the pluginManager Remote service. */

/** One installed plugin as returned to trusted clients. */
export interface InstalledPluginView {
  packageName: string
  version: string | null
  source: 'dependency' | 'template'
  bundle: boolean
  client: boolean
  enabled: boolean
  patchRows: readonly string[]
}

/** pluginManager.list response. */
export interface PluginManagerSnapshot {
  plugins: readonly InstalledPluginView[]
}

/** pluginManager.install request; `enable` adds a Loader row for non-bundle plugins. */
export interface PluginManagerInstallRequest {
  spec: string
  enable?: boolean
}

/** pluginManager.update / pluginManager.uninstall request. */
export interface PluginManagerPackageRequest {
  packageName: string
}

/** One completed profile mutation. */
export interface PluginManagerMutation {
  packageName: string
  action: 'install' | 'update' | 'uninstall'
  version: string | null
  bundle: boolean
  client: boolean
  enabled: boolean
  /** Whether the user must restart dsh. Live reload is attempted, so this is normally false. */
  restartRequired: boolean
}

/** pluginManager.restart response. */
export interface PluginManagerRestartResult {
  /** True when the restart request was accepted and the running dsh is shutting down. */
  restarted: true
}

/** pluginManager.catalog request; an empty query returns the popular directory. */
export interface PluginManagerCatalogRequest {
  /** Free-text query matched against package names, keywords, and descriptions within the verified `dsh-plugin` directory. */
  query?: string
  /** Zero-based result page; the Host fixes the page size for predictable cost. */
  page?: number
}

/** One installable npm package discovered from the `dsh-plugin` keyword directory. */
export interface PluginManagerCatalogEntry {
  /** npm package name verified to declare a DSH bundle or client role. */
  packageName: string
  /** Source repository slug when npm metadata provides one; otherwise the package name. */
  repo: string
  /** Package description, when npm provides one. */
  description: string | null
  /** Package homepage, repository page, or npm page. */
  homepage: string | null
  /** Monthly downloads used to rank the directory. */
  downloads: number
  /** Repository owner or npm scope; a synthetic owner is used for unscoped names. */
  owner: string
  /** Repository name or final package-name segment. */
  name: string
}

/** pluginManager.catalog response. */
export interface PluginManagerCatalog {
  /** Normalized query actually answered, so clients can discard stale responses. */
  query: string
  /** Zero-based page actually answered. */
  page: number
  /** Fixed page size used for paging verified matches. */
  pageSize: number
  /** Total verified matches for this query: the local index match count, or npm's raw estimate before the first index build. */
  totalMatches: number | null
  /** Whether another page of verified matches exists. */
  hasMore: boolean
  entries: readonly PluginManagerCatalogEntry[]
}
