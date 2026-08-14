# Agent Note: Anchored-standard opt-in agent preset

Status: implemented

English | [中文](2026-08-15-anchored-standard-preset.zh.md)

## Problem

The `standard` preset sends a long templated system prompt — a coding-agent persona plus per-tool guidance — alongside the full tool catalog. Community measurements report that this combination scores below the `minimal` preset's single-sentence persona on a coding benchmark, while `minimal`'s tool surface (one persistent PTY shell plus an editor) cannot carry the standard workflow. The claim worth evaluating is that a `minimal`-shaped system prompt over the `standard` tool catalog avoids the score drop without losing tools.

## Decision

Ship an opt-in `anchored-standard` agent preset at `apps/cli/config/agent-presets/anchored-standard/` with `order: 5`. It is the `standard` composition with two deltas:

1. `persona` sets `complete: true`, `includeRuntimeContext: false`, and the text `You are a helpful software engineer assistant.` — byte-identical to the `minimal` preset's system prompt.
2. A `tool-bootstrap` row references `./tool-bootstrap.mjs` with `shellTools: [bash, pwsh]` and `commonTools: [read]`.

The shipped `agentPresets.default` is now `anchored-standard`; the [default-switch note](2026-08-15-anchored-standard-default.md) owns that reversal of the original opt-in default.

`tool-bootstrap.mjs` is a function plugin (`name: 'anchored-tool-bootstrap'`, `inject: ['systemPrompt', 'tools']`). On `system-prompt/assemble` it returns the assembly unchanged once the agent's session records a durable `tool/call`; before that it reduces the model-visible tool list to one platform shell (whichever of `bash`/`pwsh` the catalog contains) plus `read`. A scoped monotonic `tools.guard()` applies the same set to model-direct execution, so a hidden tool cannot be called through the registry before promotion; nested transport calls remain available to the tool that owns them. The full `standard` catalog stays registered, and promotion is read from the agent's own durable session events, so each session bootstraps independently. A catalog that holds zero or more than one configured shell, or that lacks a configured common tool, fails loud instead of proceeding on the wrong surface.

The plugin is plain ESM shipped inside the preset directory. The `config` directory already ships with the CLI package, and the Cordis loader resolves relative plugin names against the composition file, so the `.mjs` resolves beside the preset in both source and built layouts. A sibling `.d.mts` declaration lets the test and TypeScript readers type the module.

## Testing

`apps/cli/tests/anchored-tool-bootstrap.spec.ts` imports the shipped `.mjs` and covers first-request narrowing, per-session promotion, direct execution denial, nested dispatch, and fail-loud catalog validation. `apps/cli/tests/web-agent-presets.e2e.ts` boots the real Web Loader composition with a scripted adapter and verifies the first and promoted model requests plus a direct hidden-tool call. `apps/web/tests/anchored-standard.snapshot.ts` records the same request headers through the keyless Web replay lane.

## Alternatives considered

- **Make `anchored-standard` the default preset now** — rejected when this note shipped: the supporting evidence is two benchmark runs, and the promotion trigger leaves the agent on two tools when the first turn makes no tool call. Defaulting should wait for stronger evidence and the remaining limitations. Reversed by the [default-switch note](2026-08-15-anchored-standard-default.md).
- **Promote `tool-bootstrap` to a first-class `@deepseek-ai/dsh-tool-bootstrap` package** — deferred: it is the clean home (typecheck, coverage gate, invariant companion, and a bare package name in the composition), but it adds a package and a CLI dependency for an opt-in experiment; do it when the preset moves toward default.
- **Ship only the prompt delta without the bootstrap** — rejected: the prompt change alone leaves the full catalog visible from the first request, which is not what the experiment measures.

## Consequences

- The roster gains one experimental entry after the shipped four. Existing sessions are unaffected; the shipped default later moved to this preset in the [default-switch note](2026-08-15-anchored-standard-default.md).
- Before promotion, the bootstrap narrows the model-visible tool list and denies model-direct calls to other registered tools. The full registration remains available to nested transport calls and after promotion.
- The `anchored-standard` composition is a near-copy of `standard` and must be updated in lockstep with it.
- The `.mjs` plugin is covered by focused tests, the real CLI/Web composition test, and the Web keyless snapshot, but not by the package coverage gate because it is not a workspace package.

## Known limitations and deferred work

- A first turn that produces no `tool/call` leaves the agent on two tools until one does; there is no timeout or fallback promotion.
- The evidence is two runs against one benchmark, not a controlled comparison across models and tasks.
- The bootstrap requires exactly one effective configured shell; a deployment that removes both `bash` and `pwsh` fails assembly and execution validation.
- `agent.cordis.yml` duplicates `standard`'s rows, so future `standard` edits must be mirrored or the presets drift.
