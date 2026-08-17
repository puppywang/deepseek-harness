/**
 * Profile plugin management shared by the `dsh plugin` CLI and the Host
 * pluginManager service. All pnpm execution is injected by the caller, so the
 * CLI can keep its synchronous stream-through spawn and the Host can drive the
 * subprocess seam; this package owns profile manifests, bundle reconciliation,
 * and `cordis.patch.yml` row edits.
 */

import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  initProfile,
  readProfileManifest,
  writeProfileManifest,
  type ProfileManifest,
} from '@deepseek-ai/dsh-app-boot'
import { parseDocument, type Document } from 'yaml'

const NAME = 'dsh'

/** One pnpm invocation supplied by the caller. */
export interface ProfilePluginRunPnpm {
  (args: readonly string[], cwd: string): Promise<{
    exitCode: number
    stdout: string
    stderr: string
  }>
}

/** Shared profile addressing for every operation. */
export interface ProfilePluginOptions {
  /** Absolute profile directory (`$DSH_HOME/profiles/web`). */
  profileDir: string
  /** `package.json` path of the dsh app (bundle resolution anchor). */
  installAnchor: string
  /** Profile patch file; defaults to `<profileDir>/cordis.patch.yml`. */
  patchPath?: string
}

/** One installed plugin as seen from the profile manifest and its patch. */
export interface InstalledPlugin {
  packageName: string
  version: string | undefined
  source: 'dependency' | 'template'
  bundle: boolean
  client: boolean
  enabled: boolean
  patchRows: readonly string[]
}

/** Result of one completed profile mutation. */
export interface ProfilePluginChange {
  packageName: string
  action: 'install' | 'update' | 'uninstall'
  version: string | undefined
  bundle: boolean
  client: boolean
  enabled: boolean
  restartRequired: true
}

/**
 * Rewrite a relative filesystem spec against the invoking directory, matching
 * the CLI's existing `dsh plugin` semantics.
 * @param argument - one pnpm argument, verbatim.
 * @param cwd - the directory `dsh` was invoked from.
 * @returns the argument with a relative path spec anchored to `cwd`.
 */
export function anchorPathSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return argument
  const prefix = match.groups.prefix ?? ''
  return `${prefix}${resolve(cwd, match.groups.path)}`
}

/** The executable shipped by `@pnpm/exe`, assembled by its preinstall script.
 * @returns the absolute path of the platform pnpm executable.
 */
export function resolveBundledPnpmExecutable(): string {
  const packageJson = createRequire(import.meta.url).resolve('@pnpm/exe/package.json')
  const executable = join(dirname(packageJson), process.platform === 'win32' ? 'pnpm.exe' : 'pnpm')
  if (!existsSync(executable)) {
    throw new Error(`dsh: bundled pnpm executable is missing at ${executable}; reinstall @pnpm/exe`)
  }
  return executable
}

/**
 * Initialize a missing profile directory.
 * @param profileDir - absolute profile directory.
 * @param bundles - initial bundle list; defaults to the dsh-base template.
 */
export function ensureProfile(
  profileDir: string,
  bundles: readonly string[] = DEFAULT_PROFILE_BUNDLES,
): Promise<void> {
  initProfile(profileDir, bundles)
  return Promise.resolve()
}

/** Read the profile patch text, creating the empty template when absent. */
function readPatch(options: ProfilePluginOptions): { path: string; text: string } {
  const path = options.patchPath ?? join(options.profileDir, 'cordis.patch.yml')
  if (!existsSync(path)) {
    initProfile(options.profileDir, DEFAULT_PROFILE_BUNDLES)
  }
  return { path, text: readFileSync(path, 'utf8') }
}

/** Parse the profile patch into plain data for read-only row lookup. */
function patchRowsData(text: string): unknown[] {
  const parsed = parseDocument(text)
  if (parsed.errors.length > 0) return []
  const value = parsed.toJS() as unknown
  return Array.isArray(value) ? value : []
}

/** Whether the profile patch already names this package in an inserted row. */
function patchRowNames(text: string, packageName: string): string[] {
  const names: string[] = []
  for (const row of patchRowsData(text)) {
    if (row === null || typeof row !== 'object') continue
    const insert = (row as { insert?: unknown }).insert
    if (!Array.isArray(insert)) continue
    for (const item of insert) {
      if (item === null || typeof item !== 'object') continue
      const candidate = item as { id?: unknown; name?: unknown }
      if (candidate.name !== packageName) continue
      names.push(typeof candidate.id === 'string' ? candidate.id : packageName)
    }
  }
  return names
}

/**
 * Add one Loader row for a package. Existing rows keep their entry id and the
 * patch's existing comments; a package already named is left untouched.
 * @param text - current patch text.
 * @param entryId - Loader entry id to use for a new row.
 * @param packageName - package the row imports.
 * @returns the updated patch text.
 */
export function enablePatchRow(text: string, entryId: string, packageName: string): string {
  if (patchRowNames(text, packageName).length > 0) return text
  const row = `- insert:\n    - id: ${entryId}\n      name: ${packageName}\n`
  if (patchRowsData(text).length === 0) {
    const replaced = text.replace(/\[\]\s*$/, row.trimEnd() + '\n')
    if (replaced !== text) return replaced
  }
  const suffix = text.endsWith('\n') ? '' : '\n'
  return `${text}${suffix}${row}`
}

/**
 * Remove every inserted Loader row naming a package, preserving the patch's
 * other entries and comments.
 * @param text - current patch text.
 * @param packageName - package whose rows are removed.
 * @returns the updated patch text.
 */
export function disablePatchRow(text: string, packageName: string): string {
  const doc: Document = parseDocument(text)
  if (doc.errors.length > 0) return text
  const data = doc.toJS() as unknown
  if (!Array.isArray(data)) return text
  // Delete from the end so earlier sequence indices stay valid.
  for (let rowIndex = data.length - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = data[rowIndex] as { insert?: unknown } | null | undefined
    const insert = row?.insert
    if (!Array.isArray(insert)) continue
    for (let itemIndex = insert.length - 1; itemIndex >= 0; itemIndex -= 1) {
      const item = insert[itemIndex] as { name?: unknown } | null
      if (item?.name === packageName) doc.deleteIn([rowIndex, 'insert', itemIndex])
    }
  }
  return doc.toString()
}

/**
 * Derive a stable row id from a package name.
 * @param packageName - the package name, scoped or unscoped.
 * @returns the entry id used for the package's inserted Loader row.
 */
export function derivePatchEntryId(packageName: string): string {
  const base = basename(packageName)
  const stripped = base.startsWith('dsh-') ? base.slice('dsh-'.length) : base
  return stripped.startsWith('plugin-') ? stripped : `plugin-${stripped}`
}

/** Resolve an installed package directory from either anchor, like the Loader does. */
function packageDir(packageName: string, installAnchor: string, profileDir: string): string | undefined {
  for (const anchor of [installAnchor, join(profileDir, 'package.json')]) {
    const paths = createRequire(anchor).resolve.paths(packageName) ?? []
    for (const searchPath of paths) {
      const candidate = join(searchPath, packageName)
      if (existsSync(join(candidate, 'package.json'))) return candidate
    }
  }
  return undefined
}

/** An installed package manifest: the profile slice plus the plugin roles this package reads. */
interface InstalledPackageManifest extends ProfileManifest {
  version?: string
  dsh?: ProfileManifest['dsh'] & { client?: unknown }
}

/** Read an installed package manifest without requiring a `./package.json` export. */
function installedManifest(packageName: string, installAnchor: string, profileDir: string): InstalledPackageManifest | undefined {
  const dir = packageDir(packageName, installAnchor, profileDir)
  if (dir === undefined) return undefined
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as InstalledPackageManifest
  } catch {
    return undefined
  }
}

/** Whether an installed package declares a profile bundle. */
function exportsPatch(packageName: string, installAnchor: string, profileDir: string): boolean {
  const manifest = installedManifest(packageName, installAnchor, profileDir)
  return manifest?.dsh?.bundle?.patch !== undefined
}

/** Whether an installed package declares a client bundle. */
function declaresClient(packageName: string, installAnchor: string, profileDir: string): boolean {
  const manifest = installedManifest(packageName, installAnchor, profileDir)
  return manifest?.dsh?.client !== undefined
}

/**
 * Reconcile `dsh.profile.bundles` against the installed dependency state. The
 * optional `before` argument is the manifest as it existed before pnpm ran;
 * operations capture it internally, and the CLI passes its pre-run snapshot.
 * Without it, removal of a just-uninstalled dependency cannot be distinguished
 * from an installation-owned template bundle and is therefore left untouched.
 * @param options - profile directories and the install anchor.
 * @param before - optional pre-pnpm manifest snapshot; operations pass it internally.
 * @returns a promise that resolves after the profile manifest is reconciled.
 */
export function reconcileBundleLayers(
  options: ProfilePluginOptions,
  before?: ProfileManifest,
): Promise<void> {
  const previous = before ?? readProfileManifest(NAME, options.profileDir)
  const after = readProfileManifest(NAME, options.profileDir)
  const beforeDeps = new Set(Object.keys(previous.dependencies ?? {}))
  const dependencies = Object.keys(after.dependencies ?? {})
  const plugins = [...(after.dsh?.profile?.bundles ?? [])]
  let changed = false
  for (const packageName of dependencies) {
    if (exportsPatch(packageName, options.installAnchor, options.profileDir) && !plugins.includes(packageName)) {
      plugins.push(packageName)
      changed = true
    }
  }
  const dependencySet = new Set(dependencies)
  for (const packageName of [...plugins]) {
    const wasDependency = beforeDeps.has(packageName) || dependencySet.has(packageName)
    const stillBundle = dependencySet.has(packageName) && exportsPatch(packageName, options.installAnchor, options.profileDir)
    if (wasDependency && !stillBundle) {
      plugins.splice(plugins.indexOf(packageName), 1)
      changed = true
    }
  }
  if (!changed) return Promise.resolve()
  after.dsh = { ...after.dsh, profile: { ...after.dsh?.profile, bundles: plugins } }
  writeProfileManifest(options.profileDir, after)
  return Promise.resolve()
}

/**
 * Read the profile plugins visible to the Host or CLI.
 * @param options - profile directories and the install anchor.
 * @returns the resolved installed plugin list.
 */
export function listProfilePlugins(options: ProfilePluginOptions): Promise<InstalledPlugin[]> {
  const manifest = readProfileManifest(NAME, options.profileDir)
  const patch = readPatch(options).text
  const dependencies = Object.keys(manifest.dependencies ?? {})
  const templates = manifest.dsh?.profile?.bundles ?? []
  const rows = new Map<string, string[]>()
  for (const packageName of new Set([...dependencies, ...templates])) {
    rows.set(packageName, patchRowNames(patch, packageName))
  }
  return Promise.resolve([...new Set([...dependencies, ...templates])].map((packageName) => {
    const installed = installedManifest(packageName, options.installAnchor, options.profileDir)
    const patchRows = rows.get(packageName) ?? []
    const source: InstalledPlugin['source'] = dependencies.includes(packageName) ? 'dependency' : 'template'
    return {
      packageName,
      version: installed?.version,
      source,
      bundle: exportsPatch(packageName, options.installAnchor, options.profileDir),
      client: declaresClient(packageName, options.installAnchor, options.profileDir),
      enabled: patchRows.length > 0 || exportsPatch(packageName, options.installAnchor, options.profileDir),
      patchRows,
    }
  }))
}

/** Throw a structured pnpm failure carrying the captured output. */
function pnpmFailure(args: readonly string[], result: Awaited<ReturnType<ProfilePluginRunPnpm>>): never {
  const detail = (result.stderr || result.stdout).trim()
  throw new Error(`dsh: pnpm ${args.join(' ')} exited ${result.exitCode}${detail.length === 0 ? '' : `\n${detail}`}`)
}

/** Run one pnpm command and reconcile the bundle layers after success. */
async function runPnpmAndReconcile(
  options: ProfilePluginOptions,
  args: readonly string[],
  runPnpm: ProfilePluginRunPnpm,
): Promise<void> {
  const before = readProfileManifest(NAME, options.profileDir)
  const result = await runPnpm(args, options.profileDir)
  if (result.exitCode !== 0) pnpmFailure(args, result)
  await reconcileBundleLayers(options, before)
}

/** One installed package's identity and flags, after a successful mutation. */
function changeFor(
  options: ProfilePluginOptions,
  packageName: string,
  action: ProfilePluginChange['action'],
): ProfilePluginChange {
  const installed = installedManifest(packageName, options.installAnchor, options.profileDir)
  return {
    packageName,
    action,
    version: installed?.version,
    bundle: exportsPatch(packageName, options.installAnchor, options.profileDir),
    client: declaresClient(packageName, options.installAnchor, options.profileDir),
    enabled: patchRowNames(readPatch(options).text, packageName).length > 0
      || exportsPatch(packageName, options.installAnchor, options.profileDir),
    restartRequired: true,
  }
}

/** Find the dependency pnpm just added, or undefined when pnpm changed none. */
function addedDependency(before: ProfileManifest, after: ProfileManifest): string | undefined {
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  return Object.keys(after.dependencies ?? {}).find(packageName => !beforeDeps.has(packageName))
}

/**
 * Install one package and optionally add its Loader row.
 * @param options - profile addressing plus the pnpm spec, enable flag, and runner.
 * @returns the installed package's post-install facts.
 */
export async function installProfilePlugin(
  options: ProfilePluginOptions & { spec: string; enable?: boolean; cwd?: string; runPnpm: ProfilePluginRunPnpm },
): Promise<ProfilePluginChange> {
  if (!existsSync(join(options.profileDir, 'package.json'))) await ensureProfile(options.profileDir)
  const before = readProfileManifest(NAME, options.profileDir)
  const spec = anchorPathSpec(options.spec, options.cwd ?? process.cwd())
  await runPnpmAndReconcile(options, ['add', spec], options.runPnpm)
  const packageName = addedDependency(before, readProfileManifest(NAME, options.profileDir))
    ?? basename(spec).replace(/\.git$/, '')
  if (options.enable === true && !exportsPatch(packageName, options.installAnchor, options.profileDir)) {
    const { path, text } = readPatch(options)
    writeFileSync(path, enablePatchRow(text, derivePatchEntryId(packageName), packageName))
  }
  return changeFor(options, packageName, 'install')
}

/**
 * Update one installed package, reconciling a gained or lost bundle declaration.
 * @param options - profile addressing plus the package name and runner.
 * @returns the updated package's post-update facts.
 */
export async function updateProfilePlugin(
  options: ProfilePluginOptions & { packageName: string; runPnpm: ProfilePluginRunPnpm },
): Promise<ProfilePluginChange> {
  await runPnpmAndReconcile(options, ['update', options.packageName], options.runPnpm)
  return changeFor(options, options.packageName, 'update')
}

/**
 * Remove one package, its patch rows, and its reconciled bundle layer.
 * @param options - profile addressing plus the package name and runner.
 * @returns the removed package's post-removal facts.
 */
export async function uninstallProfilePlugin(
  options: ProfilePluginOptions & { packageName: string; runPnpm: ProfilePluginRunPnpm },
): Promise<ProfilePluginChange> {
  await runPnpmAndReconcile(options, ['remove', options.packageName], options.runPnpm)
  const { path, text } = readPatch(options)
  const updated = disablePatchRow(text, options.packageName)
  if (updated !== text) writeFileSync(path, updated)
  return changeFor(options, options.packageName, 'uninstall')
}
