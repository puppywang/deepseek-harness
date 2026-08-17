# Agent Note: Profile plugin management integration

Status: implemented

English | [中文](2026-08-17-plugin-manager-integration.zh.md)

## Problem

Plugin installation required a system pnpm plus the `dsh plugin` CLI, and the packaged desktop app has neither on PATH. The Plugins settings page only showed a read-only Loader inventory, so a desktop user had no supported way to install, update, or remove a profile plugin.

## Decision

Add a shared Host-plane profile manager (`@deepseek-ai/dsh-plugin-manager`) that owns pnpm orchestration, bundle reconciliation, and `cordis.patch.yml` row editing. It accepts an injected pnpm runner and ships `@pnpm/exe` as a dependency, so both the CLI and the Host can run pnpm without a system install.

Add a Host Remote service (`@deepseek-ai/dsh-host-plugin-manager`, namespace `pluginManager`) exposing `list`, `install`, `update`, and `uninstall`. The web-app bundle mounts it, `dsh-api-remotes` publishes the client face, and `dsh-client-connection` pins all four methods to loopback like settings/credentials.

Add a browser Settings tab (`@deepseek-ai/dsh-client-ui-settings-plugin-manager`) that lists installed plugins and provides install (spec + enable-row), update, and uninstall. The existing read-only inventory tab remains separate.

## Alternatives considered

- **Bundle pnpm only in the desktop installer, not the shared manager** — rejected: the CLI would still need a system pnpm in source/development installs, and the Host service would not have one pnpm resolution path.
- **Put mutations inside the existing plugin-inventory service** — rejected: that service is deliberately read-only with no mutation path; a separate manager keeps the inventory snapshot pure.
- **Expose install only through the CLI at first** — rejected: the user request was explicitly to make plugin installation convenient inside the packaged UI.

## Consequences

- `dsh plugin` CLI behavior is preserved (same messages/exit codes) while now falling back to the bundled pnpm executable when `pnpm` is absent.
- The web profile gains a loopback-privileged plugin management API; mutations are still restart-required because the Loader does not hot-reload rows.
- The new client tab is a first UI: it accepts package/git specs but has no GitHub catalog discovery yet.
- `@pnpm/exe` is added to the approved build-scripts allowlist; its preinstall assembles the platform executable at install time.
