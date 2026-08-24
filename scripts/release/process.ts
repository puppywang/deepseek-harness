/**
 * Process helpers shared by the release scripts: the release steps drive `git`,
 * `pnpm`, `npm`, and `tar`, and each needs one of three failure behaviours.
 */

import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Where and with what environment a release step runs a command. */
export interface RunOptions {
  /** Working directory; defaults to the current one. */
  readonly cwd?: string
  /** Child environment; defaults to this process's. */
  readonly env?: NodeJS.ProcessEnv
}

/** What a command produced, for a caller that decides what a failure means. */
export interface CommandResult {
  /** Exit status, or null when a signal ended the process. */
  readonly status: number | null
  /** Captured standard output. */
  readonly stdout: string
  /** Captured standard error. */
  readonly stderr: string
}

/**
 * Resolve npm-family CLIs on Windows: a bare `spawnSync` without a shell can
 * only find `.exe` files, and since CVE-2024-27980 Node refuses `.cmd` shims
 * unless a shell wraps them. The release steps pass only fixed literal
 * arguments, so shell-joining those is safe.
 */
function resolveCommand(command: string): { file: string; shell: boolean } {
  const shimmed = process.platform === 'win32' && ['pnpm', 'npm', 'npx', 'corepack'].includes(command)
  return shimmed ? { file: `${command}.cmd`, shell: true } : { file: command, shell: false }
}

/**
 * Run a command and capture its output without judging the exit status.
 * @param command - executable name.
 * @param args - command arguments.
 * @param options - working directory and environment.
 * @returns The exit status and captured streams.
 */
export function attempt(command: string, args: readonly string[], options: RunOptions = {}): CommandResult {
  const resolved = resolveCommand(command)
  const result = spawnSync(resolved.file, [...args], { cwd: options.cwd, env: options.env, encoding: 'utf8', shell: resolved.shell })
  if (result.error !== undefined) throw result.error
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * Run a command, capture its output, and echo it once the command exits.
 *
 * A step that both shows what a command said and classifies its own failure
 * needs both halves: the output has to reach the workflow log, and the caller has
 * to read it to decide whether a failure is worth retrying.
 *
 * This is not live progress. `spawnSync` returns only after the child exits, so
 * nothing appears while the command runs, and the two streams are echoed one
 * after the other — all of stdout, then all of stderr — which loses their
 * interleaving. For an npm publish that matters in one visible way: `npm notice`
 * lines go to stderr while the `+ name@version` confirmation goes to stdout, so
 * the log shows the confirmation first. Live progress would need an
 * asynchronous spawn with data listeners.
 * @param command - executable name.
 * @param args - command arguments.
 * @param options - working directory and environment.
 * @returns The exit status and captured streams.
 */
export function attemptEchoed(command: string, args: readonly string[], options: RunOptions = {}): CommandResult {
  const resolved = resolveCommand(command)
  const result = spawnSync(resolved.file, [...args], {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf8',
    shell: resolved.shell,
    // 'inherit' would leave nothing to capture, so the streams are piped and
    // echoed instead.
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (result.error !== undefined) throw result.error
  if (result.stdout !== '') process.stdout.write(result.stdout)
  if (result.stderr !== '') process.stderr.write(result.stderr)
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

/**
 * Run a command, capture its standard output, and fail on a non-zero exit.
 * @param command - executable name.
 * @param args - command arguments.
 * @param options - working directory and environment.
 * @returns The trimmed standard output.
 */
export function capture(command: string, args: readonly string[], options: RunOptions = {}): string {
  const result = attempt(command, args, options)
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}:\n${result.stdout}\n${result.stderr}`)
  }
  return result.stdout.trim()
}

/**
 * Run a command with inherited streams, so its progress reaches the log, and
 * fail on a non-zero exit.
 * @param command - executable name.
 * @param args - command arguments.
 * @param options - working directory and environment.
 */
export function run(command: string, args: readonly string[], options: RunOptions = {}): void {
  const resolved = resolveCommand(command)
  const result = spawnSync(resolved.file, [...args], { cwd: options.cwd, env: options.env, stdio: 'inherit', shell: resolved.shell })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
}

/**
 * Whether this module is the process entry point.
 *
 * The release scripts are both commands and modules: a test imports their pure
 * logic, and importing a module runs its body, so an unguarded `main()` would
 * run the wrong command with the wrong arguments.
 * @param moduleUrl - the caller's `import.meta.url`.
 * @returns True when Node started this module.
 */
export function isEntry(moduleUrl: string): boolean {
  const invoked = process.argv[1]
  if (invoked === undefined) return false
  return realpathSync(invoked) === realpathSync(fileURLToPath(moduleUrl))
}
