# @deepseek-ai/dsh-host-plugin-manager

English | [中文](README.zh.md)

Host Remote service for profile plugin management. `PluginManagerGateway` registers the `pluginManager` service and publishes Typert-generated Remotes for `list`, `catalog`, `install`, `update`, `uninstall`, and `restart`. It composes the shared `@deepseek-ai/dsh-plugin-manager` library with the subprocess seam, so pnpm executes through the bundled `@pnpm/exe` binary without requiring a system pnpm — the path that makes plugin installation available inside the packaged desktop app. `catalog` answers from a durable local index of every npm package carrying the `dsh-plugin` keyword whose latest manifest declares a DSH bundle or client role: the index rebuilds off the request path when the `$DSH_HOME/cache/plugin-catalog-index.json` copy is missing or older than a day, and searches rank deterministically by exact name, name prefix, name substring, keyword hit, then description hit. Before the first build lands — and whenever no usable index exists — the service falls back to npm's server-side text search within the keyword scope, and every non-empty first page also probes likely exact package names directly so packages published after a rebuild stay findable. Pages hold 30 entries, keeping first paint responsive while supporting on-demand paging.

Every mutation writes the `$DSH_HOME/profiles/web` manifest and `cordis.patch.yml` synchronously with the CLI's semantics: a `dsh.bundle` dependency joins the profile layer list, and `enable: true` on install adds one idempotent Loader row for non-bundle packages. After each mutation the service re-applies the full composed profile patch stack to the live root Include, so installed/updated/removed plugins take effect without restarting dsh. If that live reload cannot complete, the mutation result reports `restartRequired: true`; the browser tab then asks the user to confirm before calling `pluginManager.restart`, because restarting interrupts conversations that are currently running. `pluginManager.restart` invokes the launcher-provided `ctx.appExit`, and the desktop shell restarts the harness child.

## Model Experience

None, as this Host-only service performs no prompt, tool, message, or provider registration and sends no provider request.

#### KV Cache effect

None; this package neither assembles nor sends model input.

## Known Limitations and Deferred Work

- **One profile** — the service manages the `web` profile (`resolveProfileDir('web')`); multi-profile management is not exposed.
- **Live reload can fail for native modules** — the service re-applies the patch stack immediately; if an individual plugin fails to hot-load, its Loader error is reported and a process restart is the fallback.
- **Catalog freshness follows the daily background rebuild** — answers come from the persisted index; a failed rebuild backs off five minutes, and packages published between rebuilds surface only through exact-name probes until the next refresh. Keyword-only packages without a DSH bundle/client manifest are skipped, and npm availability and rate limits apply to rebuilds and fallback searches.