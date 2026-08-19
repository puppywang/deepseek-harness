import { describe, expect, it } from 'vitest'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'
import { dedupePatchInserts } from '../src/patch-dedup.ts'

describe('dedupePatchInserts', () => {
  it('keeps the first top-level insert and drops later inserts of the same id', () => {
    const patches: PatchOptions[] = [
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }] },
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }] },
    ]
    expect(dedupePatchInserts(patches)).toEqual([
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }] },
    ])
  })

  it('keeps different ids inside one insert and preserves non-insert patches', () => {
    const patches: PatchOptions[] = [
      { insert: [{ id: 'web-search-anysearch', name: '@anysearch/anysearch-dsh' }] },
      { id: 'web', config: { searchProvider: 'anysearch' } },
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }] },
    ]
    expect(dedupePatchInserts(patches)).toEqual(patches)
  })

  it('drops an empty insert patch entirely', () => {
    const patches: PatchOptions[] = [
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }] },
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }, { id: 'web-search-anysearch', name: '@anysearch/anysearch-dsh' }] },
    ]
    expect(dedupePatchInserts(patches)).toEqual([
      { insert: [{ id: 'file-explorer', name: 'dsh-plugin-file-explorer' }] },
      { insert: [{ id: 'web-search-anysearch', name: '@anysearch/anysearch-dsh' }] },
    ])
  })
})
