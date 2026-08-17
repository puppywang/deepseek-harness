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
