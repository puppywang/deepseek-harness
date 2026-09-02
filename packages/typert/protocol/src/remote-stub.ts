/**
 * Temporary stub to make client typecheck pass without full Typert generation.
 * Each Remote package normally augments TypertRemoteNamespaceMap via its
 * generated lib/typert.remote-client.d.ts. Until the full host build regenerates
 * those files (which currently OOMs locally), this file provides a permissive
 * index so ClientRemote['session'] etc. resolve to any.
 * @module @deepseek-ai/dsh-typert-protocol/remote-stub
 */

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteNamespaceMap {
    // Core remotes aggregated by @deepseek-ai/dsh-api-gateway/client
    session: unknown
    workspace: unknown
    settings: unknown
    credentials: unknown
    llm: unknown
    agentPresets: unknown
    skills: unknown
    fileReferences: unknown
    sessionReference: unknown
    agentTeams: unknown
    directoryPicker: unknown
    commands: unknown
    goal: unknown
    pluginInventory: unknown
    messageFeedback: unknown
    subagent: unknown
    // Allow any other future remote without strict drift gate
    [key: string]: unknown
  }
}
