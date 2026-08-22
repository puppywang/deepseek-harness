# @deepseek-ai/dsh-host-plugin-manager

English | [中文](README.zh.md)

Host Remote service for profile plugin management. `PluginManagerGateway` registers the `pluginManager` service and publishes Typert-generated Remotes for `list`, `catalog`, `install`, `update`, `uninstall`, and `restart`. It composes the shared `@deepseek-ai/dsh-plugin-manager` library with the subprocess seam, so pnpm executes through the bundled `@pnpm/exe` binary without requiring a system pnpm — the path that makes plugin installation available inside the packaged desktop app. `catalog` sends non-empty queries to npm's server-side text search within the `dsh-plugin` keyword scope; an empty query returns a download-ranked directory. Pages contain 30 raw npm candidates and are verified against their latest manifests before exposure, keeping first paint responsive while supporting on-demand paging.

Every mutation writes the `$DSH_HOME/profiles/web` manifest and `cordis.patch.yml` synchronously with the CLI's semantics: a `dsh.bundle` dependency joins the profile layer list, and `enable: true` on install adds one idempotent Loader row for non-bundle packages. After each mutation the service re-applies the full composed profile patch stack to the live root Include, so installed/updated/removed plugins take effect without restarting dsh. If that live reload cannot complete, the mutation result reports `restartRequired: true`; the browser tab then asks the user to confirm before calling `pluginManager.restart`, because restarting interrupts conversations that are currently running. `pluginManager.restart` invokes the launcher-provided `ctx.appExit`, and the desktop shell restarts the harness child.

## Model Experience

None, as this Host-only service performs no prompt, tool, message, or provider registration and sends no provider request.

#### KV Cache effect

None; this package neither assembles nor sends model input.

## Known Limitations and Deferred Work

- **One profile** — the service manages the `web` profile (`resolveProfileDir('web')`); multi-profile management is not exposed.
- **Live reload can fail for native modules** — the service re-applies the patch stack immediately; if an individual plugin fails to hot-load, its Loader error is reported and a process restart is the fallback.
- **Catalog pages are bounded and verified** — each page asks npm for 30 candidates, and browsing is capped at 20 pages because deep relevance degrades while every page costs manifest checks; keyword-only packages without a DSH bundle/client manifest are skipped. Verified pages are cached briefly, and npm availability and rate limits apply.