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

/** One GitHub `dsh-plugin` repository discovered for installation. */
export interface PluginManagerCatalogEntry {
  /** npm package name read from the repository's package.json. */
  packageName: string
  /** GitHub `owner/repo` slug. */
  repo: string
  /** Repository description, when GitHub provides one. */
  description: string | null
  /** Repository homepage or HTML URL. */
  homepage: string | null
  /** Star count used to rank the directory. */
  stars: number
  /** GitHub owner login. */
  owner: string
  /** Repository name. */
  name: string
}

/** pluginManager.catalog response. */
export interface PluginManagerCatalog {
  entries: readonly PluginManagerCatalogEntry[]
}
