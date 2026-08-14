import { join } from 'node:path'

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u

// These packages are loaded by the official DSH boot/profile path. Keep this
// list explicit so a deploy cannot silently omit a peer-like runtime module.
// The static closure scan below still validates the rest of the dependency
// graph; this list protects the startup boundary itself.
export const DSH_BOOT_RUNTIME_PACKAGES = Object.freeze([
  '@deepseek-ai/cordis',
  '@deepseek-ai/cordis-plugin-group',
  '@deepseek-ai/cosmokit',
  '@deepseek-ai/dsh',
  '@deepseek-ai/dsh-anonymous-user-id',
  '@deepseek-ai/dsh-atomic-write',
  '@deepseek-ai/dsh-base',
  '@deepseek-ai/dsh-bash-local',
  '@deepseek-ai/dsh-code-runtime',
  '@deepseek-ai/dsh-compaction',
  '@deepseek-ai/dsh-fs',
  '@deepseek-ai/dsh-fs-sandbox',
  '@deepseek-ai/dsh-output-retention',
  '@deepseek-ai/dsh-sandbox',
  '@deepseek-ai/dsh-scope',
  '@deepseek-ai/dsh-session-telemetry',
  '@deepseek-ai/dsh-session-title-llm',
  '@deepseek-ai/dsh-shell',
  '@deepseek-ai/dsh-spill',
  '@deepseek-ai/dsh-subagent-in-process-driver',
  '@deepseek-ai/dsh-subprocess',
  '@deepseek-ai/dsh-timeout',
  '@deepseek-ai/dsh-web-app',
  '@deepseek-ai/dsh-workflow',
  '@deepseek-ai/dsh-workflow-worker-thread',
].toSorted())

export function packagePathSegments(packageName) {
  if (typeof packageName !== 'string' || !PACKAGE_NAME_PATTERN.test(packageName)) {
    throw new TypeError(`invalid package name: ${JSON.stringify(packageName)}`)
  }
  return packageName.split('/')
}

export function runtimePackageRoot(runtimeRoot, packageName) {
  if (packageName === '@deepseek-ai/dsh') return runtimeRoot
  return join(runtimeRoot, 'node_modules', ...packagePathSegments(packageName))
}

export function runtimePackageManifestPath(runtimeRoot, packageName) {
  return join(runtimePackageRoot(runtimeRoot, packageName), 'package.json')
}
