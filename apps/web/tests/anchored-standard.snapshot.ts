import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const SHIPPED_PRESETS = fileURLToPath(new URL('../../cli/config/agent-presets', import.meta.url))
const FIXTURE = fileURLToPath(new URL('./snapshots/anchored-standard/session.jsonl', import.meta.url))

describe('anchored-standard preset', () => {
  let scaffold: WebScaffold
  let agentHandle: AgentHandle

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      replayFixture: FIXTURE,
      agentPresets: {
        roots: [{ path: SHIPPED_PRESETS, trust: 'system' }],
        default: 'standard',
      },
    })
    agentHandle = await scaffold.ctx.agents.create({
      sessionId: SessionId('anchored-standard-snapshot'),
      meta: { cwd: scaffold.workspaceCwd, agentPreset: 'anchored-standard' },
      agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup: agentCtx => scaffold.ctx.agentPresets.mount(agentCtx, 'anchored-standard').then(() => undefined),
    })
  })

  afterAll(async () => {
    await agentHandle?.dispose()
    await scaffold?.close()
  })

  it('records the anchored and promoted tool catalogs in the model request headers', async () => {
    agentHandle.agent.followup(createUserMessage({
      content: [{ type: 'text', text: 'Inspect the workspace and finish.' }],
      source: { kind: 'user' },
    }))
    await agentHandle.agent.whenIdle()

    const headers = agentHandle.agent.session.events
      .filter((event): event is SessionEvent<'request/header'> =>
        event.type === 'request/header' && event.data.header.tools !== undefined)
      .map(event => ({
        system: event.data.header.system,
        tools: event.data.header.tools?.map(tool => tool.name),
      }))

    expect(headers).toMatchInlineSnapshot(`
      [
        {
          "system": "You are a helpful software engineer assistant.",
          "tools": [
            "pwsh",
            "read",
          ],
        },
        {
          "system": "You are a helpful software engineer assistant.",
          "tools": [
            "ask_user_question",
            "create_goal",
            "edit",
            "exit_plan_mode",
            "get_goal",
            "glob",
            "grep",
            "interrupt_agent",
            "job_kill",
            "job_list",
            "job_output",
            "list_agents",
            "pwsh",
            "ralph",
            "read",
            "read_image",
            "send_message",
            "skill",
            "subagent",
            "subagent_fork",
            "todo_write",
            "update_goal",
            "web_search",
            "workflow",
            "write",
          ],
        },
      ]
    `)
  })
})
