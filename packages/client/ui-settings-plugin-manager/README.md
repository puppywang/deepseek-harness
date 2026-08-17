# @deepseek-ai/dsh-client-ui-settings-plugin-manager

English | [中文](README.zh.md)

Browser **Plugins** tab that manages profile plugins from Web Settings. The client registers one `settings.plugins.tab` contribution with id `manage` (after the read-only `all` inventory tab). It lazily reads `ctx.remote.pluginManager.list()` and offers install (spec + enable row), update, and uninstall actions through the same Remote. The Host re-applies the patch stack to the running Loader, so changes apply live without restart; when the Host reports `restartRequired: true`, the tab opens a confirmation dialog warning that running conversations will be interrupted before calling `pluginManager.restart`.

The registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

## Model Experience

None, as this package only visualizes and drives a Host-owned plugin mutation surface in browser Settings.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No catalog discovery** — the tab installs from a package/git spec manually; a GitHub `dsh-plugin` directory is deferred.
- **Live reload is Host-owned** — the tab shows a restart hint only when a hot-loaded plugin fails; it cannot restart the Host itself.
- **No bundle layer editor** — uninstall/update is supported; toggling a running Loader row is handled by the Host's patch-stack reload.