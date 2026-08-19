import type { EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

/**
 * Remove duplicate top-level `insert` rows from an already-flattened patch
 * stack. Bundle layers, user layers, and overlays are applied as one list; if
 * both a bundle (e.g. `dsh-web-app`) and an older user profile insert the same
 * plugin id, the Loader rejects the duplicate id at boot. The first occurrence
 * wins, which preserves the row the user already had while newer bundles can
 * still add rows that are not present.
 * @param patches - flattened patch stack in application order.
 * @returns a new patch list with later top-level inserts of an already-seen id removed.
 */
export function dedupePatchInserts(patches: readonly PatchOptions[]): PatchOptions[] {
  const seenIds = new Set<string>()
  const result: PatchOptions[] = []
  for (const patch of patches) {
    // Only top-level inserts create new rows in the empty profile root. A named
    // insert (`patch.id` set) targets a group row and does not create a
    // top-level id, so it cannot collide in the root entry map.
    if (patch.insert !== undefined && patch.id === undefined) {
      const kept: EntryOptions[] = []
      for (const entry of patch.insert) {
        if (seenIds.has(entry.id)) continue
        seenIds.add(entry.id)
        kept.push(entry)
      }
      if (kept.length > 0) result.push({ ...patch, insert: kept })
      continue
    }
    result.push(patch)
  }
  return result
}
