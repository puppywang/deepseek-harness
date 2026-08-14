export interface StoppableChildProcess {
  pid?: number | undefined
  exitCode: number | null
  signalCode: NodeJS.Signals | null
  kill: (signal?: NodeJS.Signals | number) => boolean
  once: (event: 'exit', listener: () => void) => unknown
  off: (event: 'exit', listener: () => void) => unknown
}

export interface StopChildOptions {
  platform: NodeJS.Platform
  timeoutMs: number
  terminateProcessTree: (pid: number) => Promise<void>
}

function waitForExit(child: StoppableChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)

  return new Promise<boolean>((resolveResult) => {
    const onExit = (): void => {
      clearTimeout(timer)
      resolveResult(true)
    }
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolveResult(false)
    }, timeoutMs)
    child.once('exit', onExit)
  })
}

export async function stopChildProcess(
  child: StoppableChildProcess,
  options: StopChildOptions,
): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return

  if (options.platform === 'win32' && child.pid !== undefined) {
    let treeKillSucceeded = false
    try {
      await options.terminateProcessTree(child.pid)
      treeKillSucceeded = true
    } catch {
      // Fall through to the direct-process fallback when taskkill cannot reach the tree.
    }
    if (treeKillSucceeded && await waitForExit(child, options.timeoutMs)) return
  }

  try {
    child.kill('SIGTERM')
  } catch {
    return
  }
  if (await waitForExit(child, options.timeoutMs)) return

  if (options.platform === 'win32' && child.pid !== undefined) {
    try {
      await options.terminateProcessTree(child.pid)
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        return
      }
    }
  } else {
    try {
      child.kill('SIGKILL')
    } catch {
      return
    }
  }
  await waitForExit(child, options.timeoutMs)
}
