import { createRequire } from 'node:module'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_BOOT_RUNTIME_PACKAGES, runtimePackageManifestPath } from './desktop-runtime-packages.mjs'

const root = resolve(import.meta.dirname, '..')
const runtimeRoot = resolve(
  process.env.DSH_DESKTOP_RUNTIME_ROOT ?? join(root, 'dist', 'desktop-runtime'),
)
const runtimeEntry = join(runtimeRoot, 'lib', 'bin.js')
if (!existsSync(runtimeEntry)) throw new Error(`missing desktop runtime entry: ${runtimeEntry}`)

const runtimeRequire = createRequire(pathToFileURL(runtimeEntry).href)
const sourceFiles = [
  ...collectFiles(join(runtimeRoot, 'lib')).filter(isJavaScriptFile),
  ...collectFiles(join(runtimeRoot, 'node_modules', '@deepseek-ai')).filter(isJavaScriptFile),
]
const failures = new Map()

for (const packageName of DSH_BOOT_RUNTIME_PACKAGES) {
  const manifestPath = runtimePackageManifestPath(runtimeRoot, packageName)
  if (!existsSync(manifestPath)) {
    failures.set(packageName, manifestPath)
    continue
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.name !== packageName) failures.set(packageName, manifestPath)
  } catch {
    failures.set(packageName, manifestPath)
  }
}

for (const sourceFile of sourceFiles) {
  const source = readFileSync(sourceFile, 'utf8')
  for (const specifier of collectPackageSpecifiers(source)) {
    try {
      createRequire(pathToFileURL(sourceFile).href).resolve(specifier)
    } catch (error) {
      if (hasPackageRoot(sourceFile, packageName(specifier)) && error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') continue
      if (!failures.has(specifier)) failures.set(specifier, sourceFile)
    }
  }
}

for (const configFile of collectFiles(join(runtimeRoot, 'config'))) {
  if (!configFile.endsWith('.yml') && !configFile.endsWith('.yaml')) continue
  const source = readFileSync(configFile, 'utf8')
  for (const specifier of source.matchAll(/\bname:\s*['"](@deepseek-ai\/[^'"]+)['"]/gu)) {
    const packageName = specifier[1]
    if (packageName === undefined) continue
    try {
      runtimeRequire.resolve(packageName)
    } catch (error) {
      if (hasPackageRoot(configFile, packageName) && error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') continue
      if (!failures.has(packageName)) failures.set(packageName, configFile)
    }
  }
}

if (failures.size > 0) {
  console.error('verify-desktop-runtime-closure: packaged runtime has missing or unresolved modules:')
  for (const [specifier, sourceFile] of [...failures.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    console.error(`  ${specifier} <- ${relative(runtimeRoot, sourceFile)}`)
  }
  process.exit(1)
}

console.log(`verify-desktop-runtime-closure: ${sourceFiles.length} runtime files resolved all static and configured imports.`)

function collectFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function collectPackageSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/gu,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
    /\brequire(?:\.resolve)?\s*\(\s*['"]([^'"]+)['"]\s*\)/gu,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier === undefined || isPackageSpecifierExcluded(specifier)) continue
      specifiers.add(specifier)
    }
  }
  return specifiers
}

function isPackageSpecifierExcluded(specifier) {
  return specifier.startsWith('node:')
    || specifier.startsWith('.')
    || specifier.startsWith('/')
    || specifier.includes(':')
    || specifier.includes('$')
    || /\s/u.test(specifier)
    || !/^(?:@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.*@-]+)*$/u.test(specifier)
}

function isJavaScriptFile(path) {
  return (path.endsWith('.js') || path.endsWith('.cjs') || path.endsWith('.mjs'))
    && !/[\\/]dist[\\/]assets[\\/]/u.test(path)
}

function packageName(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function hasPackageRoot(sourceFile, name) {
  let directory = dirname(sourceFile)
  while (true) {
    if (existsSync(join(directory, 'node_modules', name, 'package.json'))) return true
    const parent = dirname(directory)
    if (parent === directory) return false
    directory = parent
  }
}
