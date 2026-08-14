# Agent Note: Anchored-standard becomes the shipped default preset

Status: implemented

English | [中文](2026-08-15-anchored-standard-default.zh.md)

## Problem

The `anchored-standard` preset shipped as an opt-in roster entry while the README, desktop release, and LINUX DO promotion present it as the flagship experience. A new session that names no preset still composes `standard`, so first-run users get the long templated prompt that the anchored preset exists to avoid, and the promoted default differs from the shipped default.

## Decision

Set `agentPresets.default` to `anchored-standard` in `packages/bundle/web-app/cordis.patch.yml`. New unnamed sessions compose the anchored preset: the minimal single-sentence system prompt with the one-platform-shell plus `read` bootstrap, promoting to the full standard tool catalog after the first durable `tool/call`. The user-setting layer still overrides the composed default, and sessions created under `standard`, `minimal`, `code`, or `cordis` keep their creation preset. The [original preset note](2026-08-15-anchored-standard-preset.md) owns the composition and bootstrap mechanism; this note owns the default switch.

The web e2e scaffold keeps its harness default at `standard` for replay-fixture stability. The shipped default is pinned through the real bundle layers in `apps/cli/tests/web-agent-presets.e2e.ts`.

## Alternatives considered

- **Keep `standard` as the shipped default and describe the anchored mode as opt-in** — rejected: the product promotion (the desktop release and the LINUX DO community README) presents the anchored mode as the default experience, and a first run that silently composes `standard` contradicts that promise.
- **Wait for stronger benchmark evidence before defaulting** — rejected: the original evidence remains limited, but the product decision is to ship the promoted mode now; the evidence ceiling is recorded in the [original preset note](2026-08-15-anchored-standard-preset.md).
- **Remove `standard` or fold the anchored prompt into it** — rejected: `standard` remains the full-prompt reference composition, and keeping it selectable preserves a comparison baseline and an escape hatch for sessions that want the full prompt from the first request.

## Consequences

- New unnamed sessions get the bootstrap surface; the full catalog stays registered throughout and becomes model-visible after the first durable tool call.
- A first turn that makes no tool call leaves the agent on two tools until one does, which is now the default-path limitation rather than an opt-in one.
- `apps/cli/tests/web-agent-presets.e2e.ts` pins the shipped default through the real base and web bundle patches; the web e2e scaffold keeps `standard` as its harness default so unrelated replay goldens stay stable.
- `anchored-standard` and `standard` remain independent near-copies that must be updated in lockstep.
