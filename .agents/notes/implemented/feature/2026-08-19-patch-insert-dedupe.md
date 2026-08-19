# Agent Note: Deduplicate top-level patch inserts across profile layers

Status: implemented

English | [中文](2026-08-19-patch-insert-dedupe.zh.md)

## Problem

Upgrading an existing user profile could fail at boot with `duplicate loader entry id: file-explorer`. The `dsh-web-app` bundle inserts `dsh-plugin-file-explorer`, and a profile that already inserted the same row (for example from an older manually installed plugin) then contains two top-level inserts with the same id in the flattened patch stack. The Loader rejects duplicate ids, so the desktop app reported "dsh web 连续 3 次启动失败".

## Decision

Add a shared `dedupePatchInserts` helper in `@deepseek-ai/dsh-app-boot`. The flattened patch stack is scanned in application order; the first top-level `insert` for an id wins and later insert rows with the same id are dropped. The helper is applied everywhere the stack reaches the Loader:

- `mountRootInclude` (initial boot)
- `reloadRootInclude` (live plugin reload)
- `composeEntries` (config dumps and row index)
- `profile-boot`'s `allPatches` and `composeLive` (boot and HMR user-layer reloads)

The existing user row remains authoritative; a newer bundle may still add rows whose ids are absent.

## Alternatives considered

- Removing `file-explorer` from the web-app bundle — rejected: fresh profiles would lose the bundled file explorer, and the same duplicate risk exists for any plugin a bundle and a profile both insert.
- Editing the vendored include to tolerate duplicates — rejected: the vendored Loader should stay faithful to upstream; deduplication is composition policy owned by the app boot layer.

## Consequences

- Existing upgraded profiles with a duplicate file-explorer row boot again.
- Bundle layers can safely insert plugins that an older profile already has.
- Id-targeted patches are unchanged; only top-level `insert` rows can create duplicate ids in the empty profile root.