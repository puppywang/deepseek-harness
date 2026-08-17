# @deepseek-ai/dsh-client-ui-settings-plugin-manager

English | [中文](README.zh.md)

Browser **Plugins** tab that manages profile plugins from Web Settings. The client registers one `settings.plugins.tab` contribution with id `manage` (after the read-only `all` inventory tab). It lazily reads `ctx.remote.pluginManager.list()` and offers install (spec + enable row), update, and uninstall actions through the same Remote. All mutations report `restartRequired`; the tab tells the user to restart after a change.

The registration uses `ctx.slots.inject()`, so it follows late tab declaration, redeclaration, locale changes, and teardown without importing the section owner.

## Model Experience

None, as this package only visualizes and drives a Host-owned plugin mutation surface in browser Settings.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **No catalog discovery** — the tab installs from a package/git spec manually; a GitHub `dsh-plugin` directory is deferred.
- **Restart is user-driven** — the tab shows a restart hint but cannot restart the Host or desktop app.
- **No bundle layer editor** — uninstall/update is supported; toggling a running Loader row without a restart is not.