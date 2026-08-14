import z from '@deepseek-ai/schemastery'

/**
 * Keep the first model request on a small tool surface, then expose the full
 * preset catalog after the model has produced its first durable tool call.
 *
 * The plugin filters the model-facing assembly and installs an execution guard
 * in the agent scope. Until the session records a durable `tool/call`, a
 * model-direct call may name only one platform shell plus the shared
 * `commonTools`; nested transport calls are not part of that model-facing
 * bootstrap surface. The full Standard catalog stays registered throughout
 * so promotion does not mutate the preset.
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'anchored-tool-bootstrap'

/** Prompt assembly must exist before this request filter can register. */
export const inject = ['systemPrompt', 'tools']

/** Loader-validated tool names used during the bootstrap request. */
export const Config = z.object({
  commonTools: z.array(z.string().min(1)).min(1),
  shellTools: z.array(z.string().min(1)).min(1),
})

function stringList(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new TypeError(`${name}: ${field} must be a non-empty array of non-empty strings`)
  }
  return [...new Set(value)]
}

/** Select the one configured shell and verify every common tool is available. */
function bootstrapTools(availableTools, commonTools, shellTools) {
  const available = new Set(availableTools)
  const selectedShells = shellTools.filter(toolName => available.has(toolName))
  const missingCommon = commonTools.filter(toolName => !available.has(toolName))
  if (selectedShells.length !== 1 || missingCommon.length > 0) {
    throw new Error(
      `${name}: expected exactly one bootstrap shell and every common tool; `
      + `shells=${JSON.stringify(selectedShells)}, missing=${JSON.stringify(missingCommon)}`,
    )
  }
  return new Set([...selectedShells, ...commonTools])
}

/** Return whether a session has a durable tool call before the current call. */
function hasDurableToolCall(agent, currentCallId) {
  const events = agent.session.events
  const currentIndex = currentCallId === undefined
    ? -1
    : events.findLastIndex(event => event.type === 'tool/call' && event.data.callId === currentCallId)
  const history = currentIndex >= 0 ? events.slice(0, currentIndex) : events
  return history.some(event => event.type === 'tool/call')
}

/** Register the per-session bootstrap filter. */
export function apply(ctx, config) {
  const commonTools = stringList(config.commonTools, 'commonTools')
  const shellTools = stringList(config.shellTools, 'shellTools')

  ctx.tools.guard((execution) => {
    const agent = execution.agent
    if (agent === undefined) return undefined

    const allowed = bootstrapTools(
      ctx.tools.schemas(agent).map(tool => tool.name),
      commonTools,
      shellTools,
    )
    if (execution.parent !== undefined || hasDurableToolCall(agent, execution.callId) || allowed.has(execution.name)) {
      return undefined
    }
    return `${name}: tool "${execution.name}" is unavailable during bootstrap; call one of ${JSON.stringify([...allowed])} first`
  })

  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembled = await next()
    const allowed = bootstrapTools(assembled.tools.map(tool => tool.name), commonTools, shellTools)
    const agent = context.agent
    if (agent === undefined || hasDurableToolCall(agent)) {
      return assembled
    }
    return {
      ...assembled,
      tools: assembled.tools.filter(tool => allowed.has(tool.name)),
    }
  })
}
