# Agent Note: Ship the community workspace file explorer

Status: implemented

English | [中文](2026-08-17-shipped-file-explorer-plugin.zh.md)

## Problem

The packaged desktop app and `dsh web` could read files only through model tool calls or by handing paths to the operating system. The community plugin [`dsh-plugin-file-explorer`](https://github.com/bearllfleed/Dsh-FileExplorer) adds a VS Code-style workspace file explorer to the Web UI, but a packaged user has no `pnpm`-based install path, and the product README advertised the plugin while no installer shipped it.

## Decision

Bundle `dsh-plugin-file-explorer` into `@deepseek-ai/dsh-web-app` at `^0.2.0`: the package is a dependency of the bundle, and `cordis.patch.yml` inserts the `file-explorer` row beside the browser plugin roster. Every `dsh web` and desktop build therefore composes the plugin without a profile edit or pnpm. The plugin's host half registers bounded file routes under `/plugin/file-explorer`; the client half contributes the explorer UI. The source was reviewed before shipping: no child-process or eval use, path access confined to the host cwd and registered workspace paths, and byte caps on reads and uploads.

Profile-installed copies remain supported: the earlier README command `dsh plugin --profile web add dsh-plugin-file-explorer` still works for older builds and for updating a profile copy independently of the bundled version.

## Alternatives considered

- **Keep the plugin community-only and document the pnpm path** — rejected: packaged desktop users have no installed `dsh` CLI or pnpm, so the documented install path cannot serve the audience the desktop release targets.
- **Vendor the plugin's source into the repository** — rejected: the package is published and installable as a normal dependency, and vendoring would duplicate its release cadence.
- **Make the explorer an official workspace package immediately** — rejected: the plugin is maintained by its community author; shipping it as a pinned dependency gives users the capability now without moving ownership.

## Consequences

- New `dsh web`/desktop installs get the workspace file explorer by default; the row can still be disabled or replaced by a later profile patch.
- The web-app bundle now carries one external runtime dependency (`dsh-plugin-file-explorer ^0.2.0`) in addition to its workspace packages.
- Existing profiles that already installed the plugin may compose two rows: their own patch row and the bundled row. The duplicate-id guard does not apply because the rows carry different ids; operators should remove the profile row when updating to a build that ships the bundled row.
- The plugin remains community-maintained; compatibility with future dsh releases is the plugin author's release responsibility, while this repository pins the version it ships.
