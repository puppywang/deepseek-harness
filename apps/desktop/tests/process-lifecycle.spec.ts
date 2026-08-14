import { describe, expect, it } from 'vitest'
import { stopChildProcess, type StoppableChildProcess } from '../src/process-lifecycle.ts'

type KillSignal = Parameters<StoppableChildProcess['kill']>[0]

class FakeChild implements StoppableChildProcess {
  pid = 4321
  exitCode: number | null = null
  signalCode: StoppableChildProcess['signalCode'] = null
  readonly killSignals: KillSignal[] = []
  exitOnKill = true
  private readonly exitListeners = new Set<() => void>()

  kill(signal?: KillSignal): boolean {
    this.killSignals.push(signal)
    if (this.exitOnKill) {
      this.exitCode = 0
      this.emitExit()
    }
    return true
  }

  once(_event: 'exit', listener: () => void): this {
    this.exitListeners.add(listener)
    return this
  }

  off(_event: 'exit', listener: () => void): this {
    this.exitListeners.delete(listener)
    return this
  }

  emitExit(): void {
    for (const listener of this.exitListeners) listener()
  }
}

describe('desktop child-process teardown', () => {
  it('uses Windows tree termination before touching the direct child', async () => {
    const child = new FakeChild()
    const actions: string[] = []

    await stopChildProcess(child, {
      platform: 'win32',
      timeoutMs: 20,
      terminateProcessTree: async (pid) => {
        actions.push(`taskkill:${pid}`)
        child.exitCode = 0
        child.emitExit()
      },
    })

    expect(actions).toEqual(['taskkill:4321'])
    expect(child.killSignals).toEqual([])
  })

  it('uses SIGTERM first on platforms without a tree-kill command', async () => {
    const child = new FakeChild()
    const terminateProcessTree = async (): Promise<void> => {
      throw new Error('not used')
    }

    await stopChildProcess(child, {
      platform: 'darwin',
      timeoutMs: 20,
      terminateProcessTree,
    })

    expect(child.killSignals).toEqual(['SIGTERM'])
  })

  it('falls back to the direct process when Windows tree termination fails', async () => {
    const child = new FakeChild()
    const terminateProcessTree = async (): Promise<void> => {
      throw new Error('taskkill failed')
    }

    await stopChildProcess(child, {
      platform: 'win32',
      timeoutMs: 20,
      terminateProcessTree,
    })

    expect(child.killSignals).toEqual(['SIGTERM'])
  })

  it('falls back to the direct process when the tree kill leaves the child alive', async () => {
    const child = new FakeChild()
    const terminateProcessTree = async (): Promise<void> => {
      // taskkill reports success but does not terminate the child.
    }

    await stopChildProcess(child, {
      platform: 'win32',
      timeoutMs: 5,
      terminateProcessTree,
    })

    expect(child.killSignals).toEqual(['SIGTERM'])
  })

  it('escalates to SIGKILL when SIGTERM does not exit in time', async () => {
    const child = new FakeChild()
    child.exitOnKill = false
    const terminateProcessTree = async (): Promise<void> => {
      throw new Error('not used')
    }

    await stopChildProcess(child, {
      platform: 'darwin',
      timeoutMs: 5,
      terminateProcessTree,
    })

    expect(child.killSignals).toEqual(['SIGTERM', 'SIGKILL'])
  })
})
