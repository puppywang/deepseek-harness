/**
 * Process helpers shared by the release scripts: the release steps drive `git`,
 * `pnpm`, `npm`, and `tar`, and each needs one of three failure behaviours.
 */

import { spawn, spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Where and with what environment a release step runs a command. */
export interface RunOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
}

/** What a command produced, for a caller that decides what a failure means. */
export interface CommandResult {
  /** Exit status, or null when a signal ended the process. */
  readonly status: number | null
  readonly stdout: string
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
 * Run a command, then echo and return its captured output. Output is buffered
 * until exit and stdout precedes stderr.
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
 * Run a command with inherited streams without blocking the event loop, so a
 * caller can hold several commands in flight, and fail on a non-zero exit.
 * Concurrent children interleave their output at line granularity.
 * @param command - executable name.
 * @param args - command arguments.
 * @param options - working directory and environment.
 * @returns Resolves when the command exits with status zero.
 */
export function runConcurrent(command: string, args: readonly string[], options: RunOptions = {}): Promise<void> {
  const resolved = resolveCommand(command)
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(resolved.file, [...args], { cwd: options.cwd, env: options.env, stdio: 'inherit', shell: resolved.shell })
    child.once('error', rejectRun)
    child.once('close', (status, signal) => {
      if (status === 0) resolveRun()
      else rejectRun(new Error(`${command} ${args.join(' ')} exited with ${String(status ?? signal)}`))
    })
  })
}

/**
 * Return whether Node started the given module as the process entry point.
 * @param moduleUrl - the caller's `import.meta.url`.
 * @returns True when Node started this module.
 */
export function isEntry(moduleUrl: string): boolean {
  const invoked = process.argv[1]
  if (invoked === undefined) return false
  return realpathSync(invoked) === realpathSync(fileURLToPath(moduleUrl))
}
