# Agent Note: Desktop release runtime, signing, and updates

Status: implemented

English | [中文](2026-08-14-desktop-release-runtime-and-updates.zh.md)

## Problem

The Electron shell needs to run on a user's machine without the repository, pnpm, or a separately installed Node.js runtime. Desktop updates also need a stable artifact layout, release tag, signing input, and update metadata that match the existing dsh release sequence.

## Decision

The desktop package uses electron-builder with NSIS on Windows, DMG plus ZIP on macOS, and AppImage plus deb on Linux. The application bundle contains the Electron main process and updater dependency. A separate `resources/dsh-runtime` directory contains the deployed `@deepseek-ai/dsh` production closure, including the built Web frontend; `resources/node-runtime` contains the Node executable used to launch that child process. The child is therefore independent of the user's Node and pnpm installations, while the runtime remains outside ASAR for child-process and native-module loading.

electron-builder skips a source directory whose relative name is `node_modules`, so the runtime dependency tree is copied as a separate FileSet into `resources/dsh-runtime/node_modules`. The workspace pins `@electron/get` to `3.1.0` because electron-builder `26.15.3` consumes its cache-mode enum at runtime.

The desktop version follows the shared dsh version and publishes from the existing `dsh-v<version>` tag. GitHub Releases is the updater provider. NSIS and macOS ZIP/DMG artifacts carry the metadata consumed by `electron-updater`; downloaded updates install after an immediate user-confirmed restart or on the next normal quit. Linux packages are published, but the desktop shell does not invoke automatic updates for them under the current release contract.

GitLab CI accepts the same `dsh-v<version>` tag and runs native Windows, macOS, and Linux packaging jobs in parallel. Each job validates the tag against `package.json` and uploads its installers as short-lived job artifacts; runner tags and optional signing are CI variables, so certificates remain protected project inputs.

The shell-free repository gate runner invokes a native Windows `pnpm.exe` directly when pnpm exposes that executable through `npm_execpath`; JavaScript pnpm entrypoints continue to run through Node.

The Windows NSIS installer keeps its native details pane visible and uses a marquee progress style while the large compressed payload is extracted. NSIS reports progress per archive phase, so treating that value as a single overall percentage would allow visible regressions; the installer instead exposes stage messages and keeps the activity indicator monotonic.

Signing credentials are environment inputs only. Windows uses `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`; macOS uses `CSC_LINK`, `CSC_KEY_PASSWORD`, and the Apple notarization credentials. CI injects these values from protected secrets, while local packaging can produce unsigned artifacts for testing.

The production closure must declare dependencies used by dynamically loaded profiles as direct CLI dependencies. In particular, the telemetry OTEL profile loads `@deepseek-ai/dsh-session-telemetry` through a peer edge that workspace hoisting can hide during development; the workflow and shell profile packages have the same peer-closure requirement. `DSH_BOOT_RUNTIME_PACKAGES` names the startup package boundary; deployment validation and the Electron `afterPack` hook verify every listed manifest in the runtime and final application. The packaged runtime is audited for static and configured import resolution, then HTTP-smoked before Electron Builder. Source maps, debug symbols, foreign-platform optional packages, and unused `node-pty` platform prebuilds are removed while the target platform's native files are retained.

The shell denies renderer permission checks and requests through the default Electron session. It treats the Web profile's loopback URL line as the first startup signal, confirms the endpoint with a bounded HTTP readiness probe, retries cold startup three times, and restarts an unexpectedly exited runtime at most three times. Bridge tokens use a length-safe timing comparison, and navigation, downloads, and path-opening requests are validated in the main process. The default `DSH_HOME` is below Electron's per-user data directory, so profile-managed community plugins and skin bundles are installed under user-owned profile directories rather than the application installation. Windows shutdown starts with `taskkill /T /F` for the full Harness process tree; macOS keeps the app and Harness alive after the last window closes so activation can recreate the window. Desktop unit tests cover these pure boundaries, and the root typecheck invokes the desktop test-aware TypeScript project.

## Alternatives considered

**Require system Node.js:** Rejected because a desktop installer must have a predictable runtime and cannot assume the user has a compatible Node version or PATH configuration.

**Bundle the Harness runtime inside ASAR:** Rejected because the child process needs normal filesystem paths and the runtime may load native modules that must remain unpacked.

**Use a separate update server:** Rejected because GitHub Releases already owns the dsh tag and artifact publication flow; adding another service would duplicate release metadata and credentials.

**Commit certificates or sign only on developer machines:** Rejected because secrets must stay outside source control and unsigned CI output must not be mistaken for a production release.

## Consequences

Desktop packaging performs a production dependency deployment and copies a Node executable, so artifacts are larger and the packaging job needs platform-specific native dependency resolution. Dynamic imports and native modules mean the dependency tree cannot be replaced by one archive without adding a custom extraction/loader layer; pruning build-only files is the lower-risk size reduction. The same release tag now drives npm publication and desktop update discovery. macOS production distribution still requires an Apple Developer ID certificate and notarization; Windows signing improves trust but standard OV certificates can still show an initial SmartScreen reputation warning.
