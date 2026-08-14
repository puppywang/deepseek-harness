/**
 * Type declarations for the shipped bootstrap plugin (see tool-bootstrap.mjs).
 * The runtime module is plain ESM in the preset directory; these declarations
 * let a TypeScript reader type it without a build step.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolExecution, ToolRuntime } from '@deepseek-ai/dsh-tools'
import type { PromptAssembly, AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type z from '@deepseek-ai/schemastery'

/** Cordis plugin name used by loader diagnostics. */
export const name: string

/** Prompt assembly must exist before this request filter can register. */
export const inject: ['systemPrompt', 'tools']

/** Loader-validated tool names used during the bootstrap request. */
export interface Config {
  commonTools: string[]
  shellTools: string[]
}

/** Runtime schema for {@link Config}. */
export const Config: z<Config>

/** Register the per-session bootstrap filter. */
export function apply(ctx: Context & { agent?: Agent; systemPrompt: unknown; tools: ToolRuntime }, config: Config): void

/** The typed waterfall callback installed by {@link apply}. */
export type BootstrapAssemblyListener = (
  assembly: PromptAssembly,
  context: AssembleContext & { agent?: Agent },
  next: () => Promise<PromptAssembly>,
) => Promise<PromptAssembly>

/** The typed monotonic execution guard installed by {@link apply}. */
export type BootstrapToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
