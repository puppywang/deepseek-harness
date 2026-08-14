import { describe, expect, it, vi } from 'vitest'
import { buildContextMenuTemplate, type ContextMenuParamsLike } from '../src/context-menu.ts'

function params(overrides: Partial<ContextMenuParamsLike> = {}): ContextMenuParamsLike {
  return {
    editFlags: {
      canCopy: false,
      canCut: false,
      canPaste: false,
      canRedo: false,
      canSelectAll: false,
      canUndo: false,
    },
    isEditable: false,
    linkURL: '',
    mediaType: '',
    selectionText: '',
    srcURL: '',
    ...overrides,
  }
}

function labels(items: ReturnType<typeof buildContextMenuTemplate>): string[] {
  return items.map(item => item.type === 'separator' ? '---' : item.label ?? '')
}

describe('desktop context menu', () => {
  it('shows link actions and a page refresh action', () => {
    const menu = buildContextMenuTemplate(params({ linkURL: 'https://example.com/docs' }), {
      copyText: vi.fn(),
      openExternal: vi.fn(),
      reload: vi.fn(),
    })

    expect(labels(menu)).toEqual([
      '在默认浏览器中打开链接',
      '复制链接地址',
      '---',
      '刷新',
    ])
  })

  it('shows editing actions only when Electron reports them as available', () => {
    const menu = buildContextMenuTemplate(params({
      editFlags: {
        canCopy: true,
        canCut: true,
        canPaste: true,
        canRedo: false,
        canSelectAll: true,
        canUndo: true,
      },
      isEditable: true,
    }), {
      copyText: vi.fn(),
      openExternal: vi.fn(),
      reload: vi.fn(),
    })

    expect(labels(menu)).toEqual(['撤销', '剪切', '复制', '粘贴', '全选', '---', '刷新'])
  })

  it('does not offer system-browser opening for internal or unsafe URLs', () => {
    const openExternal = vi.fn()
    const copyText = vi.fn()
    const menu = buildContextMenuTemplate(params({ linkURL: 'javascript:alert(1)' }), {
      copyText,
      openExternal,
      reload: vi.fn(),
    })

    expect(labels(menu)).toEqual(['复制链接地址', '---', '刷新'])
    const copyAction = menu[0]?.click
    expect(copyAction).toBeDefined()
    if (copyAction !== undefined) {
      copyAction(...([] as unknown as Parameters<typeof copyAction>))
    }
    expect(copyText).toHaveBeenCalledWith('javascript:alert(1)')
    expect(openExternal).not.toHaveBeenCalled()
  })
})
