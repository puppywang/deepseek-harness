/** Application menu template: platform shapes, dev entries, locale labels, and Help targets. */
import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import { buildApplicationMenuTemplate } from '../src/menu.ts'

const openExternal = vi.fn()

function submenuOf(item: MenuItemConstructorOptions): MenuItemConstructorOptions[] {
  const submenu = item.submenu
  if (submenu === undefined || Array.isArray(submenu)) return submenu ?? []
  throw new Error('menu item has no array submenu')
}

function findItem(items: readonly MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions {
  const found = items.find(item => item.label === label)
  if (found === undefined) throw new Error(`no menu item named ${label}`)
  return found
}

describe('buildApplicationMenuTemplate', () => {
  it('builds the macOS system menu with edit roles and keeps DevTools available in production', () => {
    const template = buildApplicationMenuTemplate({
      platform: 'darwin', zh: false, developerTools: false, openExternal,
    })

    expect(template[0]).toMatchObject({ role: 'appMenu' })
    expect(template.map(item => item.label)).toEqual([undefined, 'Edit', 'View', undefined, 'Help'])
    const edit = findItem(template, 'Edit')
    expect(submenuOf(edit).map(item => item.role)).toEqual([
      'undo', 'redo', undefined, 'cut', 'copy', 'paste', 'selectAll',
    ])
    const view = findItem(template, 'View')
    expect(submenuOf(view).some(item => item.role === 'reload')).toBe(false)
    expect(submenuOf(view).some(item => item.role === 'toggleDevTools')).toBe(true)
    expect(template.find(item => item.role === 'windowMenu')).toBeTruthy()
  })

  it('builds the auto-hidden Windows/Linux menu with dev entries in development', () => {
    const template = buildApplicationMenuTemplate({
      platform: 'win32', zh: true, developerTools: true, openExternal,
    })

    expect(template.map(item => item.label)).toEqual(['文件', '编辑', '视图', '窗口', '帮助'])
    const file = findItem(template, '文件')
    expect(submenuOf(file)).toEqual([{ role: 'quit', label: '退出' }])
    const view = findItem(template, '视图')
    expect(submenuOf(view).map(item => item.role)).toEqual([
      'reload', undefined, 'toggleDevTools', undefined, 'resetZoom', 'zoomIn', 'zoomOut',
      undefined, 'togglefullscreen',
    ])
    const window = findItem(template, '窗口')
    expect(submenuOf(window).map(item => item.role)).toEqual(['minimize', 'close'])
  })

  it('opens every Help target through the supplied external-link opener', () => {
    const template = buildApplicationMenuTemplate({
      platform: 'linux', zh: false, developerTools: false, openExternal,
    })
    const help = findItem(template, 'Help')
    const targets = submenuOf(help)
      .filter(item => typeof item.click === 'function')
      .map(item => item.click as () => void)

    expect(targets).toHaveLength(4)
    for (const click of targets) click()
    expect(openExternal.mock.calls.map(call => String(call[0]))).toEqual([
      'https://github.com/deepseek-ai/deepseek-harness',
      'https://github.com/deepseek-ai/deepseek-harness/tree/master/docs',
      'https://github.com/deepseek-ai/deepseek-harness/releases',
      'https://linux.do/',
    ])
  })

  it('labels non-mac menus in English when the OS locale is not Chinese', () => {
    const template = buildApplicationMenuTemplate({
      platform: 'win32', zh: false, developerTools: false, openExternal,
    })
    expect(template.map(item => item.label)).toEqual(['File', 'Edit', 'View', 'Window', 'Help'])
  })
})
