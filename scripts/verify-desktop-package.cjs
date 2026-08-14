const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')
const { pathToFileURL } = require('node:url')

function assertFile(path, description) {
  if (!existsSync(path)) throw new Error(`desktop package is missing ${description}: ${path}`)
}

/**
 * @param {{ appOutDir: string, electronPlatformName: string, packager?: { appInfo?: { productFilename?: string } } }} context
 * @returns {string}
 */
function resolveResourcesRoot(context) {
  if (context.electronPlatformName !== 'darwin') return join(context.appOutDir, 'resources')

  const productFilename = context.packager?.appInfo?.productFilename
  if (typeof productFilename !== 'string' || productFilename.length === 0) {
    throw new Error('desktop package verification requires the macOS product filename')
  }
  return join(context.appOutDir, `${productFilename}.app`, 'Contents', 'Resources')
}

async function verifyDesktopPackage(context) {
  const { DSH_BOOT_RUNTIME_PACKAGES: bootPackages, runtimePackageRoot } = await import(
    pathToFileURL(join(__dirname, 'desktop-runtime-packages.mjs')).href,
  )
  const resourcesRoot = resolveResourcesRoot(context)
  const runtimeRoot = join(resourcesRoot, 'dsh-runtime')
  const nodeName = context.electronPlatformName === 'win32' ? 'node.exe' : 'node'

  assertFile(join(resourcesRoot, 'app.asar'), 'app.asar')
  assertFile(join(runtimeRoot, 'lib', 'bin.js'), 'the DSH CLI entry')
  assertFile(join(resourcesRoot, 'node-runtime', nodeName), 'the bundled Node runtime')

  for (const packageName of bootPackages) {
    const manifestPath = join(runtimePackageRoot(runtimeRoot, packageName), 'package.json')
    assertFile(manifestPath, `boot package ${packageName}`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (manifest.name !== packageName) {
      throw new Error(`desktop package manifest mismatch for ${packageName}: ${manifestPath}`)
    }
  }

  process.stdout.write(`desktop package verified: ${bootPackages.length} boot packages in ${resourcesRoot}\n`)
}

module.exports = verifyDesktopPackage
module.exports.resolveResourcesRoot = resolveResourcesRoot
