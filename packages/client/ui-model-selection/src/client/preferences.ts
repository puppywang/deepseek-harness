/**
 * Per-model reasoning-effort memory shared by the two model-selection
 * surfaces. The composer seat and the /model popup both consult this map so
 * a user's last explicit thinking level for a third-party model survives
 * model switches and page reloads. Persistence is whole-value localStorage,
 * silently disabled outside browsers and on storage failure, mirroring the
 * runtime snapshot-store policy.
 */

const STORAGE_KEY = 'dsh.modelSelection.efforts'

interface EffortPreferences {
  [route: string]: string
}

function routeOf(provider: string, model: string): string {
  return `${provider}/${model}`
}

function readPreferences(): EffortPreferences {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const prefs = parsed as EffortPreferences
    return Object.fromEntries(Object.entries(prefs).filter(([key, value]) =>
      typeof value === 'string' && value !== '' && key.includes('/')))
  } catch {
    return {}
  }
}

function writePreferences(prefs: EffortPreferences): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Storage failure (quota, private mode) only disables the memory.
  }
}

/**
 * Read the last explicitly selected effort for one provider/model route.
 * @param provider - provider id.
 * @param model - model id.
 * @returns the remembered effort, or undefined when none was stored.
 */
export function rememberedEffort(provider: string, model: string): string | undefined {
  return readPreferences()[routeOf(provider, model)]
}

/**
 * Remember or clear the effort for one provider/model route.
 * @param provider - provider id.
 * @param model - model id.
 * @param effort - the selected effort; undefined clears the route's memory.
 */
export function rememberEffort(provider: string, model: string, effort: string | undefined): void {
  const prefs = readPreferences()
  const key = routeOf(provider, model)
  if (effort === undefined) {
    const next: EffortPreferences = {}
    for (const [route, value] of Object.entries(prefs)) {
      if (route !== key) next[route] = value
    }
    writePreferences(next)
    return
  }
  writePreferences({ ...prefs, [key]: effort })
}
