# @deepseek-ai/dsh-host-plugin-manager

English | [中文](README.zh.md)

Host Remote service for profile plugin management. `PluginManagerGateway` registers the `pluginManager` service and publishes Typert-generated Remotes for `list`, `install`, `update`, and `uninstall`. It composes the shared `@deepseek-ai/dsh-plugin-manager` library with the subprocess seam, so pnpm executes through the bundled `@pnpm/exe` binary without requiring a system pnpm — the path that makes plugin installation available inside the packaged desktop app.

Every mutation writes the `$DSH_HOME/profiles/web` manifest and `cordis.patch.yml` synchronously with the CLI's semantics: a `dsh.bundle` dependency joins the profile layer list, and `enable: true` on install adds one idempotent Loader row for non-bundle packages. Mutations report `restartRequired: true`; the service never restarts or reloads the Loader.

## Model Experience

None, as this Host-only service performs no prompt, tool, message, or provider registration and sends no provider request.

#### KV Cache effect

None; this package neither assembles nor sends model input.

## Known Limitations and Deferred Work

- **One profile** — the service manages the `web` profile (`resolveProfileDir('web')`); multi-profile management is not exposed.
- **External restart** — changes require a process restart before Loader rows appear; there is no hot reload or relaunch RPC yet.