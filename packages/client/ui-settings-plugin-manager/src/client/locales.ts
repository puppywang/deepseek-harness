/** Locale bundles for the plugin management tab. */

/** Locale keys this surface renders. */
export type PluginManagerLocaleKey =
  | 'tab' | 'intro' | 'restartHint' | 'searchPlaceholder'
  | 'packageName' | 'version' | 'source' | 'bundle' | 'client' | 'enabled'
  | 'dependency' | 'template' | 'installTitle' | 'installSpec' | 'installPlaceholder'
  | 'enableRow' | 'install' | 'installing' | 'update' | 'updating' | 'uninstall' | 'uninstalling'
  | 'removeConfirm' | 'empty' | 'noMatch' | 'loadFailed' | 'retry' | 'mutateFailed'

/** English copy. */
export const en: Record<PluginManagerLocaleKey, string> = {
  tab: 'Plugins',
  intro: 'Install, update, or remove plugins in this deployment\u2019s web profile. Changes apply after a restart.',
  restartHint: 'Restart dsh to apply plugin changes.',
  searchPlaceholder: 'Search installed plugins',
  packageName: 'Package',
  version: 'Version',
  source: 'Source',
  bundle: 'Bundle',
  client: 'Client',
  enabled: 'Enabled',
  dependency: 'Profile',
  template: 'Bundled',
  installTitle: 'Install plugin',
  installSpec: 'Package or git spec',
  installPlaceholder: 'dsh-plugin-file-explorer@0.2.0',
  enableRow: 'Enable after install',
  install: 'Install',
  installing: 'Installing\u2026',
  update: 'Update',
  updating: 'Updating\u2026',
  uninstall: 'Uninstall',
  uninstalling: 'Uninstalling\u2026',
  removeConfirm: 'Remove {package} from this profile? Its Loader rows are removed too.',
  empty: 'No plugins installed in this profile.',
  noMatch: 'No installed plugins match this search.',
  loadFailed: 'Loading installed plugins failed.',
  retry: 'Retry',
  mutateFailed: 'The plugin operation failed.',
}

/** Simplified Chinese copy. */
export const zh: Record<PluginManagerLocaleKey, string> = {
  tab: '插件管理',
  intro: '安装、更新或卸载本部署 web profile 中的插件。变更在重启后生效。',
  restartHint: '重启 dsh 后插件变更才会生效。',
  searchPlaceholder: '搜索已安装插件',
  packageName: '包名',
  version: '版本',
  source: '来源',
  bundle: 'Bundle',
  client: 'Client',
  enabled: '已启用',
  dependency: 'Profile',
  template: '内置',
  installTitle: '安装插件',
  installSpec: '包名或 git spec',
  installPlaceholder: 'dsh-plugin-file-explorer@0.2.0',
  enableRow: '安装后启用',
  install: '安装',
  installing: '安装中\u2026',
  update: '更新',
  updating: '更新中\u2026',
  uninstall: '卸载',
  uninstalling: '卸载中\u2026',
  removeConfirm: '从本 profile 移除 {package}？其 Loader 行也会一并移除。',
  empty: '此 profile 尚未安装插件。',
  noMatch: '没有匹配的已安装插件。',
  loadFailed: '读取已安装插件失败。',
  retry: '重试',
  mutateFailed: '插件操作失败。',
}
