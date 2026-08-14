import type { MenuItemConstructorOptions } from 'electron'
import { isExternalUrl } from './desktop-logic.js'

export interface ContextMenuParamsLike {
  editFlags: {
    canCopy: boolean
    canCut: boolean
    canPaste: boolean
    canRedo: boolean
    canSelectAll: boolean
    canUndo: boolean
  }
  isEditable: boolean
  linkURL: string
  mediaType: string
  selectionText: string
  srcURL: string
}

export interface ContextMenuActions {
  copyText: (text: string) => void
  openExternal: (url: string) => void
  reload: () => void
}

function addSeparator(items: MenuItemConstructorOptions[]): void {
  if (items.length > 0 && items.at(-1)?.type !== 'separator') items.push({ type: 'separator' })
}

export function buildContextMenuTemplate(
  params: ContextMenuParamsLike,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []

  if (params.linkURL !== '') {
    if (isExternalUrl(params.linkURL)) {
      items.push({
        label: '在默认浏览器中打开链接',
        click: () => { actions.openExternal(params.linkURL) },
      })
    }
    items.push({
      label: '复制链接地址',
      click: () => { actions.copyText(params.linkURL) },
    })
  }

  if (params.mediaType === 'image' && params.srcURL !== '') {
    if (isExternalUrl(params.srcURL)) {
      items.push({
        label: '在默认浏览器中打开图片',
        click: () => { actions.openExternal(params.srcURL) },
      })
    }
    items.push({
      label: '复制图片地址',
      click: () => { actions.copyText(params.srcURL) },
    })
  }

  if (params.isEditable) {
    const { canCopy, canCut, canPaste, canRedo, canSelectAll, canUndo } = params.editFlags
    const editItems: MenuItemConstructorOptions[] = []
    if (canUndo) editItems.push({ label: '撤销', role: 'undo' })
    if (canRedo) editItems.push({ label: '重做', role: 'redo' })
    if (canCut) editItems.push({ label: '剪切', role: 'cut' })
    if (canCopy) editItems.push({ label: '复制', role: 'copy' })
    if (canPaste) editItems.push({ label: '粘贴', role: 'paste' })
    if (canSelectAll) editItems.push({ label: '全选', role: 'selectAll' })
    if (editItems.length > 0) {
      addSeparator(items)
      items.push(...editItems)
    }
  } else if (params.selectionText !== '') {
    addSeparator(items)
    items.push({ label: '复制', role: 'copy' })
  }

  addSeparator(items)
  items.push({ label: '刷新', click: () => { actions.reload() } })
  return items
}
