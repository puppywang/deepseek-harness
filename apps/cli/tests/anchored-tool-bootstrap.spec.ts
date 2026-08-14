import { describe, expect, it } from 'vitest'
import { apply } from '../config/agent-presets/anchored-standard/tool-bootstrap.mjs'

interface BootstrapConfig {
  commonTools: string[]
  shellTools: string[]
}

interface ToolRow {
  name: string
}

interface Assembly {
  tools: ToolRow[]
}

interface AssembleContext {
  agent?: Agent
}

interface Agent {
  session: { events: unknown[] }
}

interface Execution {
  agent?: Agent
  parent?: symbol
  callId: string
  name: string
}

type Listener = (assembly: unknown, context: AssembleContext, next: () => Promise<Assembly>) => Promise<Assembly>
type Guard = (execution: Execution) => string | undefined

const config: BootstrapConfig = { commonTools: ['read'], shellTools: ['bash', 'pwsh'] }

function register(): Listener {
  let listener: Listener | undefined
  let guard: Guard | undefined
  const ctx = {
    on(event: string, callback: unknown): void {
      expect(event).toBe('system-prompt/assemble')
      listener = callback as Listener
    },
    tools: {
      guard(callback: Guard): void {
        guard = callback
      },
      schemas(): ToolRow[] {
        return [{ name: 'pwsh' }, { name: 'read' }, { name: 'edit' }]
      },
    },
  }
  apply(ctx as unknown as Parameters<typeof apply>[0], config)
  if (listener === undefined) throw new Error('bootstrap plugin did not register an assemble listener')
  if (guard === undefined) throw new Error('bootstrap plugin did not register an execution guard')
  ;(listener as Listener & { guard?: Guard }).guard = guard
  return listener
}

function assemble(listener: Listener, events: unknown[], tools: ToolRow[]): Promise<Assembly> {
  return listener(undefined, { agent: { session: { events } } }, async () => ({ tools }))
}

function guardOf(listener: Listener): Guard {
  const guard = (listener as Listener & { guard?: Guard }).guard
  if (guard === undefined) throw new Error('missing bootstrap guard')
  return guard
}

describe('anchored-standard tool bootstrap', () => {
  it('narrows the first request to one platform shell plus read', async () => {
    const result = await assemble(register(), [], [{ name: 'pwsh' }, { name: 'read' }, { name: 'edit' }])
    expect(result.tools.map(tool => tool.name)).toEqual(['pwsh', 'read'])
  })

  it('exposes the complete catalog after a durable tool call', async () => {
    const tools = [{ name: 'pwsh' }, { name: 'read' }, { name: 'edit' }, { name: 'grep' }]
    const result = await assemble(register(), [{ type: 'tool/call', data: { name: 'read' } }], tools)
    expect(result.tools).toEqual(tools)
  })

  it('derives promotion per session from that session\'s own events', async () => {
    const listener = register()
    const tools = [{ name: 'bash' }, { name: 'read' }, { name: 'write' }]
    const promoted = await assemble(listener, [{ type: 'tool/call' }], tools)
    const fresh = await assemble(listener, [], tools)
    expect(promoted.tools).toEqual(tools)
    expect(fresh.tools.map(tool => tool.name)).toEqual(['bash', 'read'])
  })

  it('fails loudly when no single shell is available', async () => {
    await expect(assemble(register(), [], [{ name: 'read' }, { name: 'edit' }])).rejects.toThrow(/expected exactly one bootstrap shell/)
  })

  it('denies hidden direct calls before the current durable call', () => {
    const listener = register()
    const agent = { session: { events: [{ type: 'tool/call', data: { callId: 'current', name: 'edit' } }] } }
    expect(guardOf(listener)({ agent, callId: 'current', name: 'edit' })).toMatch(/unavailable during bootstrap/)
  })

  it('allows direct calls after an earlier durable call and keeps nested dispatch available', () => {
    const listener = register()
    const agent = {
      session: {
        events: [
          { type: 'tool/call', data: { callId: 'previous', name: 'read' } },
          { type: 'tool/call', data: { callId: 'current', name: 'edit' } },
        ],
      },
    }
    const guard = guardOf(listener)
    expect(guard({ agent, callId: 'current', name: 'edit' })).toBeUndefined()
    expect(guard({ agent, callId: 'fresh', name: 'edit', parent: Symbol('nested') })).toBeUndefined()
  })

  it('validates the catalog even after promotion', async () => {
    const listener = register()
    const agent = { session: { events: [{ type: 'tool/call', data: { callId: 'previous' } }] } }
    await expect(listener(undefined, { agent }, async () => ({ tools: [{ name: 'bash' }] })))
      .rejects.toThrow(/missing=\["read"\]/)
  })
})
