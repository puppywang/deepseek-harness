/** Locale bundles for the plugin management tab. */

/** Locale keys this surface renders. */
export type PluginManagerLocaleKey =
  | 'tab' | 'intro' | 'restartHint' | 'searchPlaceholder'
  | 'packageName' | 'version' | 'source' | 'bundle' | 'client' | 'enabled'
  | 'dependency' | 'template' | 'installTitle' | 'installSpec' | 'installPlaceholder'
  | 'enableRow' | 'install' | 'installing' | 'update' | 'updating' | 'uninstall' | 'uninstalling'
  | 'removeConfirm' | 'empty' | 'noMatch' | 'loadFailed' | 'retry' | 'mutateFailed'
  | 'discoverTitle' | 'discoverIntro' | 'discoverSearch' | 'discoverEmpty' | 'discoverFailed'
  | 'discoverLoading' | 'discoverInstall' | 'discoverInstalling' | 'discoverInstalled'
  | 'monthlyDownloads'
  | 'restartConfirmTitle' | 'restartConfirmDescription' | 'restartAcknowledge'
  | 'restartCancel' | 'restartConfirm' | 'restarting' | 'restartFailed'

/** English copy. */
export const en: Record<PluginManagerLocaleKey, string> = {
  tab: 'Plugins',
  intro: 'Install, update, or remove plugins in this deployment\u2019s web profile. Changes apply live without a restart.',
  restartHint: 'Changes are applied to the running dsh immediately. Restart only if a plugin\u2019s native module fails to load.',
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
  installPlaceholder: 'dsh-plugin-file-explorer@0.3.0',
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
  discoverTitle: 'Discover plugins',
  discoverIntro: 'Community npm packages that declare the dsh-plugin keyword and a DSH bundle or client manifest.',
  discoverSearch: 'Search plugins',
  discoverEmpty: 'No plugins match this search.',
  discoverFailed: 'Loading the plugin catalog failed.',
  discoverLoading: 'Loading plugins\u2026',
  discoverInstall: 'Install',
  discoverInstalling: 'Installing\u2026',
  discoverInstalled: 'Installed',
  monthlyDownloads: 'Monthly downloads',
  restartConfirmTitle: 'Restart dsh to apply changes?',
  restartConfirmDescription: 'A restart is required to finish this plugin change. Restarting will interrupt conversations that are currently running. Confirm that you want to continue.',
  restartAcknowledge: 'I understand running conversations will be interrupted.',
  restartCancel: 'Not now',
  restartConfirm: 'Restart dsh',
  restarting: 'Restarting dsh\u2026',
  restartFailed: 'The restart request failed.',
}

/** Simplified Chinese copy. */
export const zh: Record<PluginManagerLocaleKey, string> = {
  tab: '插件管理',
  intro: '安装、更新或卸载本部署 web profile 中的插件。变更无需重启即可实时生效。',
  restartHint: '变更会立即应用给正在运行的 dsh。仅当某个插件的原生模块加载失败时才需要重启。',
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
  installPlaceholder: 'dsh-plugin-file-explorer@0.3.0',
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
  discoverTitle: '发现插件',
  discoverIntro: '来自 npm 上声明 dsh-plugin 关键字，并且 manifest 声明 DSH Bundle 或 Client 能力的社区插件。',
  discoverSearch: '搜索插件',
  discoverEmpty: '没有匹配的插件。',
  discoverFailed: '读取插件目录失败。',
  discoverLoading: '正在加载插件\u2026',
  discoverInstall: '安装',
  discoverInstalling: '安装中\u2026',
  discoverInstalled: '已安装',
  monthlyDownloads: '月下载',
  restartConfirmTitle: '需要重启 dsh 才能完成变更？',
  restartConfirmDescription: '完成这项插件变更需要重启 dsh。重启会中断当前正在运行的对话。请确认后继续。',
  restartAcknowledge: '我已知晓正在进行的对话会被中断。',
  restartCancel: '暂不重启',
  restartConfirm: '重启 dsh',
  restarting: '正在重启 dsh\u2026',
  restartFailed: '重启请求失败。',
}
