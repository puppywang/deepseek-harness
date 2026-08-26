/**
 * Per-model reasoning-effort memory shared by the two model-selection
 * surfaces. The composer seat and the /model popup both consult this map so
 * a user's last explicit thinking level for a third-party model survives
 * model switches and page reloads.
 *
 * Persistence uses a cookie instead of localStorage because the desktop shell
 * serves the UI from a random loopback port on each launch; localStorage is
 * origin-scoped including the port, so a new port would lose every stored
 * effort. Cookies are scoped by host, not port, so the same map remains
 * readable across restarts. Storage is silently disabled outside browsers and
 * on write failure.
 */

const STORAGE_COOKIE = 'dsh.modelSelection.efforts'
const STORAGE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

interface EffortPreferences {
  [route: string]: string
}

function routeOf(provider: string, model: string): string {
  return `${provider}/${model}`
}

function readPreferences(): EffortPreferences {
  if (typeof document === 'undefined') return {}
  try {
    const cookie = document.cookie
    const prefix = `${STORAGE_COOKIE}=`
    const match = cookie.split('; ').find(part => part.startsWith(prefix))
    if (match === undefined) return {}
    const parsed: unknown = JSON.parse(decodeURIComponent(match.slice(prefix.length)))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const prefs = parsed as EffortPreferences
    return Object.fromEntries(Object.entries(prefs).filter(([key, value]) =>
      typeof value === 'string' && value !== '' && key.includes('/')))
  } catch {
    return {}
  }
}

function writePreferences(prefs: EffortPreferences): void {
  if (typeof document === 'undefined') return
  try {
    const value = encodeURIComponent(JSON.stringify(prefs))
    document.cookie = `${STORAGE_COOKIE}=${value}; path=/; max-age=${STORAGE_MAX_AGE_SECONDS}; SameSite=Lax`
  } catch {
    // Storage failure (private mode, quota) only disables the memory.
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
