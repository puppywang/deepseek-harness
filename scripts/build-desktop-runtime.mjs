import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { DSH_BOOT_RUNTIME_PACKAGES, runtimePackageManifestPath } from './desktop-runtime-packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeOutput = join(root, 'dist', 'desktop-runtime')
const nodeOutput = join(root, 'dist', 'node-runtime')
const deployRoot = join(tmpdir(), `dsh-desktop-deploy-${randomUUID()}`)
const deployScript = join(root, 'scripts', 'deploy-desktop-runtime.ps1')

function materialize(source, destination, active = new Set()) {
  const stat = lstatSync(source)
  if (stat.isSymbolicLink()) {
    const target = resolve(dirname(source), readlinkSync(source))
    if (active.has(target)) throw new Error(`cyclic deployed link: ${source} -> ${target}`)
    const nextActive = new Set(active)
    nextActive.add(target)
    materialize(target, destination, nextActive)
    return
  }
  if (stat.isDirectory()) {
    mkdirSync(destination, { recursive: true })
    for (const entry of readdirSync(source)) materialize(join(source, entry), join(destination, entry), active)
    return
  }
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}

function supportsCurrentPlatform(values, current) {
  if (!Array.isArray(values) || values.length === 0) return true
  if (values.some(value => typeof value === 'string' && value === `!${current}`)) return false
  const allowed = values.filter(value => typeof value === 'string' && !value.startsWith('!'))
  return allowed.length === 0 || allowed.includes(current)
}

function collectPackageDirectories(nodeModulesRoot) {
  const packages = []
  const visitModules = directory => {
    if (!existsSync(directory)) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const entryPath = join(directory, entry.name)
      if (entry.name.startsWith('@')) {
        for (const scopedEntry of readdirSync(entryPath, { withFileTypes: true })) {
          if (scopedEntry.isDirectory()) visitPackage(join(entryPath, scopedEntry.name))
        }
      } else {
        visitPackage(entryPath)
      }
    }
  }
  const visitPackage = directory => {
    packages.push(directory)
    visitModules(join(directory, 'node_modules'))
  }
  visitModules(nodeModulesRoot)
  return packages
}

/**
 * Keep only optional packages whose manifest admits this build's platform.
 * The child Node runtime cannot read Electron's app.asar, so the DSH runtime
 * remains an external production closure; this is the selective native
 * reduction point, instead of an `asarUnpack: node_modules/**` catch-all.
 */
function pruneForeignPlatformPackages(runtimeRoot) {
  const nodeModulesRoot = join(runtimeRoot, 'node_modules')
  let removedPackages = 0
  let removedBytes = 0
  for (const packageDirectory of collectPackageDirectories(nodeModulesRoot)) {
    const manifestPath = join(packageDirectory, 'package.json')
    if (!existsSync(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      continue
    }
    if (supportsCurrentPlatform(manifest.os, process.platform)
      && supportsCurrentPlatform(manifest.cpu, process.arch)) continue
    const size = collectDirectorySize(packageDirectory)
    rmSync(packageDirectory, { recursive: true, force: true })
    removedPackages += 1
    removedBytes += size
  }
  return { removedPackages, removedBytes }
}

function collectDirectorySize(directory) {
  let size = 0
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) size += collectDirectorySize(path)
    else size += lstatSync(path).size
  }
  return size
}

function pruneRuntimeArtifacts(runtimeRoot) {
  let removedFiles = 0
  let removedBytes = 0
  const removableExtensions = new Set(['.map', '.pdb'])

  const visit = directory => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry)
      const stat = lstatSync(path)
      if (stat.isDirectory()) {
        visit(path)
        continue
      }
      if (!removableExtensions.has(entry.slice(entry.lastIndexOf('.')).toLowerCase())) continue
      removedFiles += 1
      removedBytes += stat.size
      rmSync(path, { force: true })
    }
  }
  visit(runtimeRoot)

  const nodePtyRoot = join(runtimeRoot, 'node_modules', 'node-pty')
  const prebuildRoot = join(nodePtyRoot, 'prebuilds')
  const currentPrebuild = join(prebuildRoot, `${process.platform}-${process.arch}`)
  if (existsSync(currentPrebuild)) {
    for (const entry of readdirSync(prebuildRoot)) {
      const path = join(prebuildRoot, entry)
      if (path !== currentPrebuild) rmSync(path, { recursive: true, force: true })
    }
    for (const entry of ['build', 'deps', 'scripts', 'src', 'third_party', 'typings']) {
      rmSync(join(nodePtyRoot, entry), { recursive: true, force: true })
    }
  }

  console.log(
    `desktop runtime: removed ${String(removedFiles)} debug/source-map files (${(removedBytes / 1024 / 1024).toFixed(1)} MiB) and kept ${process.platform}-${process.arch} native prebuilds`,
  )
}

/**
 * Remove the redundant pnpm launcher binaries from the deployed runtime.
 * `@pnpm/exe` ships one ~90 MiB native executable under several command names
 * (`pn`, `pnpm`, `pnpx`, `pnx`) plus a duplicate platform package such as
 * `@pnpm/win-x64`. The dsh plugin manager only invokes `pnpm(.exe)`, so the
 * other copies are pure installer bloat.
 * @param runtimeRoot - deployed `dist/desktop-runtime` root.
 * @returns the freed byte count.
 */
function pruneRedundantPnpmArtifacts(runtimeRoot) {
  const pnpmRoot = join(runtimeRoot, 'node_modules', '@pnpm')
  if (!existsSync(pnpmRoot)) return 0
  let removedBytes = 0
  const removePath = target => {
    if (!existsSync(target)) return
    const stat = lstatSync(target)
    if (stat.isDirectory()) {
      removedBytes += collectDirectorySize(target)
      rmSync(target, { recursive: true, force: true })
    } else {
      removedBytes += stat.size
      rmSync(target, { force: true })
    }
  }

  const exeRoot = join(pnpmRoot, 'exe')
  const redundantNames = ['pn', 'pn.exe', 'pnpx', 'pnpx.exe', 'pnx', 'pnx.exe']
  if (process.platform === 'win32') redundantNames.push('pnpm')
  else redundantNames.push('pnpm.exe')
  for (const name of redundantNames) {
    removePath(join(exeRoot, name))
  }
  for (const entry of readdirSync(pnpmRoot)) {
    if (entry === 'exe') continue
    removePath(join(pnpmRoot, entry))
  }
  return removedBytes
}

try {
  rmSync(runtimeOutput, { recursive: true, force: true })
  const childEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^npm_/iu.test(name) && !/^pnpm_/iu.test(name)),
  )
  const result = spawnSync(
    process.platform === 'win32' ? 'pwsh.exe' : 'pnpm',
    process.platform === 'win32'
      ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', deployScript, '-Target', deployRoot]
      : ['--config.node-linker=hoisted', '--filter', '@deepseek-ai/dsh', 'deploy', deployRoot, '--prod', '--legacy'],
    {
      cwd: root,
      env: {
        ...childEnvironment,
        CI: 'true',
      },
      stdio: 'inherit',
      shell: false,
    },
  )
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`pnpm deploy exited with status ${String(result.status)}`)

  mkdirSync(dirname(runtimeOutput), { recursive: true })
  materialize(deployRoot, runtimeOutput)
  const foreignPlatform = pruneForeignPlatformPackages(runtimeOutput)
  const redundantPnpm = pruneRedundantPnpmArtifacts(runtimeOutput)
  pruneRuntimeArtifacts(runtimeOutput)

  for (const packageName of DSH_BOOT_RUNTIME_PACKAGES) {
    const manifestPath = runtimePackageManifestPath(runtimeOutput, packageName)
    if (!existsSync(manifestPath)) {
      throw new Error(`desktop runtime is missing boot package ${packageName}: ${manifestPath}`)
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.name !== packageName) {
      throw new Error(`desktop runtime package manifest mismatch for ${packageName}: ${manifestPath}`)
    }
  }

  rmSync(nodeOutput, { recursive: true, force: true })
  mkdirSync(nodeOutput, { recursive: true })
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
  cpSync(process.execPath, join(nodeOutput, nodeName))
  cpSync(join(root, 'THIRD_PARTY_NOTICES.md'), join(nodeOutput, 'THIRD_PARTY_NOTICES.md'))
  for (const licenseName of ['LICENSE', 'LICENSE.txt']) {
    const source = join(dirname(process.execPath), licenseName)
    if (existsSync(source)) {
      cpSync(source, join(nodeOutput, licenseName))
      break
    }
  }

  const manifest = JSON.parse(readFileSync(join(runtimeOutput, 'package.json'), 'utf8'))
  const entry = join(runtimeOutput, manifest.bin?.dsh ?? '')
  if (!existsSync(entry)) throw new Error(`deployed dsh entry is missing: ${entry}`)
  console.log(
    `desktop runtime: removed ${String(foreignPlatform.removedPackages)} foreign-platform packages `
    + `(${(foreignPlatform.removedBytes / 1024 / 1024).toFixed(1)} MiB)`,
  )
  console.log(`desktop runtime: removed redundant pnpm launchers (${(redundantPnpm / 1024 / 1024).toFixed(1)} MiB)`)
  console.log(`desktop runtime: ${basename(entry)} and production dependencies copied to ${runtimeOutput}`)
  console.log(`desktop runtime: Node ${process.version} copied to ${nodeOutput}`)
} finally {
  rmSync(deployRoot, { recursive: true, force: true })
}
