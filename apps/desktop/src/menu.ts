/**
 * The desktop shell's native application menu.
 *
 * The menu stays deliberately minimal: it carries only platform chrome —
 * quit, edit shortcuts, window and view controls, and external Help links —
 * while every product action lives in the Web UI. Windows and Linux hide the
 * bar until Alt is pressed (`autoHideMenuBar`); macOS keeps its system menu
 * bar because the Edit roles there are the only thing that makes ⌘C/⌘V/⌘X/⌘A
 * work inside the browser window. Reload and DevTools entries appear only in
 * development, matching the window's `--dev` behavior.
 */

import type { MenuItemConstructorOptions } from 'electron'

/** Canonical external targets for the Help menu. */
const REPOSITORY_URL = 'https://github.com/deepseek-ai/deepseek-harness'
const RELEASES_URL = `${REPOSITORY_URL}/releases`
const DOCS_URL = `${REPOSITORY_URL}/tree/master/docs`
const LINUX_DO_URL = 'https://linux.do/'

/** Menu copy; role-labeled entries use these labels instead of Electron's defaults. */
const COPY = {
  zh: {
    file: '文件',
    quit: '退出',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    view: '视图',
    reload: '重新加载',
    devTools: '开发者工具',
    resetZoom: '实际大小',
    zoomIn: '放大',
    zoomOut: '缩小',
    fullScreen: '切换全屏',
    window: '窗口',
    minimize: '最小化',
    close: '关闭',
    help: '帮助',
    documentation: '文档',
    releases: '版本下载',
  },
  en: {
    file: 'File',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    devTools: 'Developer Tools',
    resetZoom: 'Actual Size',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    fullScreen: 'Toggle Full Screen',
    window: 'Window',
    minimize: 'Minimize',
    close: 'Close',
    help: 'Help',
    documentation: 'Documentation',
    releases: 'Releases',
  },
} as const

/** Inputs the template builder needs. */
export interface ApplicationMenuOptions {
  /** `process.platform`, so the template is testable without Electron. */
  platform: NodeJS.Platform
  /** Whether to label the menu in Chinese (OS locale starts with `zh`). */
  zh: boolean
  /** Whether Reload and DevTools entries are offered (development only). */
  developerTools: boolean
  /** Hand external URLs to the OS browser through the main process. */
  openExternal: (url: string) => void
}

/** Menu copy type shared by both locales. */
type MenuCopy = { [Key in keyof typeof COPY.en]: string }

/** The one standard edit submenu; macOS depends on it for clipboard shortcuts. */
function editMenu(copy: MenuCopy): MenuItemConstructorOptions {
  return {
    label: copy.edit,
    submenu: [
      { role: 'undo', label: copy.undo },
      { role: 'redo', label: copy.redo },
      { type: 'separator' },
      { role: 'cut', label: copy.cut },
      { role: 'copy', label: copy.copy },
      { role: 'paste', label: copy.paste },
      { role: 'selectAll', label: copy.selectAll },
    ],
  }
}

/**
 * Build the application menu template for one platform.
 * @param options - platform, locale, dev-mode switch, and external-link opener.
 * @returns the menu template to hand to `Menu.buildFromTemplate`.
 */
export function buildApplicationMenuTemplate(options: ApplicationMenuOptions): MenuItemConstructorOptions[] {
  const copy: MenuCopy = options.zh ? COPY.zh : COPY.en
  const viewItems: MenuItemConstructorOptions[] = []
  if (options.developerTools) {
    viewItems.push(
      { role: 'reload', label: copy.reload },
      { role: 'toggleDevTools', label: copy.devTools },
      { type: 'separator' },
    )
  }
  viewItems.push(
    { role: 'resetZoom', label: copy.resetZoom },
    { role: 'zoomIn', label: copy.zoomIn },
    { role: 'zoomOut', label: copy.zoomOut },
    { type: 'separator' },
    { role: 'togglefullscreen', label: copy.fullScreen },
  )

  const helpMenu: MenuItemConstructorOptions = {
    label: copy.help,
    submenu: [
      { label: 'GitHub', click: () => { options.openExternal(REPOSITORY_URL) } },
      { label: copy.documentation, click: () => { options.openExternal(DOCS_URL) } },
      { label: copy.releases, click: () => { options.openExternal(RELEASES_URL) } },
      { label: 'LINUX DO', click: () => { options.openExternal(LINUX_DO_URL) } },
    ],
  }
  const viewMenu: MenuItemConstructorOptions = { label: copy.view, submenu: viewItems }

  if (options.platform === 'darwin') {
    return [
      { role: 'appMenu' },
      editMenu(copy),
      viewMenu,
      { role: 'windowMenu' },
      helpMenu,
    ]
  }
  return [
    { label: copy.file, submenu: [{ role: 'quit', label: copy.quit }] },
    editMenu(copy),
    viewMenu,
    {
      label: copy.window,
      submenu: [
        { role: 'minimize', label: copy.minimize },
        { role: 'close', label: copy.close },
      ],
    },
    helpMenu,
  ]
}
