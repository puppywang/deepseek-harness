# @deepseek-ai/dsh-plugin-manager

English | [中文](README.zh.md)

Shared Host-plane library for profile plugin management. It owns the profile operations the `dsh plugin` CLI and the Host pluginManager service both need: profile initialization, pnpm install/update/uninstall orchestration through an injected runner, `dsh.profile.bundles` reconciliation, `cordis.patch.yml` row enable/disable, and installed-plugin listing. The bundled `@pnpm/exe` executable supplies a pnpm that works without a system install, which is what makes plugin installation possible from a packaged desktop app.

Every operation receives its pnpm execution as `ProfilePluginRunPnpm`, so the CLI can stream through `spawnSync` and the Host can drive the subprocess seam. A successful install/update/uninstall reconciles bundle layers from the pre-run manifest captured internally; `enable: true` adds exactly one idempotent Loader row for a package that does not auto-load as a bundle. All mutations write only the profile manifest and `cordis.patch.yml`.

## Model Experience

None, as this library performs no model-facing registration and sends no provider request.

#### KV Cache effect

None; this package neither assembles nor sends model input.

## Known Limitations and Deferred Work

- **Live reload is the caller's job** — the library writes only profile files and reports `restartRequired: true` as a conservative contract. The Host pluginManager service now re-applies the composed patch stack to the running Loader and reports `restartRequired: false` on success.
- **One profile at a time** — operations address a single `profileDir`; concurrent callers must serialize their own writes.
