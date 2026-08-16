# @deepseek-ai/dsh-desktop

English | [中文](README.zh.md)

This package is the Electron desktop shell for DeepSeek Harness. It starts the bundled `dsh web` application as a loopback child process, waits for its OS-assigned port, and loads that URL in a hardened `BrowserWindow`. The existing Web client, API routes, WebSocket streams, and plugin composition remain the source of desktop behavior. The shell also starts a token-authenticated loopback bridge that lets the Host ask Electron's main process to open native directories and Host-resolved paths.

## Run

From the repository root, install dependencies and build the Harness artifacts before launching the desktop shell:

```sh
pnpm install
pnpm run build
pnpm desktop
```

`pnpm desktop` builds the Electron main process and opens a development window with DevTools. `pnpm desktop:build` only builds the desktop main process; `pnpm --filter @deepseek-ai/dsh-desktop run start` launches it without DevTools.

Development startup requires `pnpm run build` so the CLI and Web artifacts exist. `pnpm desktop:package` performs the full production build and runtime deployment for an installed application.

Community extensions should use Harness's own plugin entry point, for example `dsh plugin --profile web add <package>`. The desktop default puts `DSH_HOME` below Electron's per-user data directory, so Web-profile plugins land in the user's `profiles/web/node_modules` and survive application upgrades or uninstall/reinstall cycles. Skins should also be published and installed as normal DSH packages declaring `dsh.bundle` / `dsh.client`, rather than copied into the installation directory or `resources`.

## Packaging

Build the production runtime and a Windows NSIS installer from the repository root:

```sh
pnpm desktop:package
```

The packager places the installer and update metadata under `dist/desktop`. The installer includes the built CLI, Web frontend, production dependencies, and a Node runtime, so an installed copy does not require Node.js, pnpm, or the source checkout. The runtime is kept outside the Electron ASAR because it contains child-process code and native modules.

Platform-specific commands are available through `pnpm --filter @deepseek-ai/dsh-desktop run build:installer:win`, `build:installer:mac`, and `build:installer:linux`. Windows uses NSIS, macOS uses DMG plus ZIP, and Linux uses AppImage plus deb.

After a Windows directory build, run `pnpm desktop:launch:smoke:win` to start the actual packaged EXE with an isolated user-data directory, wait for the `dsh web` HTTP response, and safely terminate the smoke-test process tree.

The Windows NSIS installer opens its native details pane by default and uses a non-regressing marquee while the compressed application payload is being extracted. This avoids presenting NSIS's phase-local percentage as a misleading overall percentage; the pane also reports the preparation and final configuration stages.

Every packaging command audits static and configured runtime imports, then smoke-tests the bundled `dsh web` runtime before Electron Builder; Electron Builder's `afterPack` hook also checks the boot package manifest inside the final application, resolving the platform-specific macOS app-bundle resources path. The desktop package manifest supplies the project homepage and the Linux target declares its maintainer metadata for `.deb` output. The production runtime removes source maps, debug symbols, foreign-platform optional native packages, and unused native prebuilds while retaining the native modules required by the target platform. The shell does not use a blanket Electron `asarUnpack` rule for `node_modules/**`; the external runtime is required because an independent Node child process cannot read files from `app.asar` directly.

## Runtime contract

The child server binds to `127.0.0.1` and uses port `0`, so the shell never exposes the Harness HTTP server on a chosen network port. After receiving the URL, the shell runs a bounded HTTP readiness probe before creating the window, retries startup failures, and automatically restarts an unexpectedly exited runtime at most three times. The desktop process reuses the existing Web transport over that loopback URL and rejects navigation outside the assigned origin. Navigation and window-open attempts for `http`, `https`, and `mailto` URLs are handed to the operating system through Electron's main process. The native application menu is platform chrome only: Windows and Linux hide the bar until Alt is pressed, macOS keeps its system menu with the edit roles clipboard shortcuts need, and the Help menu links GitHub, the documentation, Releases, and LINUX DO; Reload and DevTools entries exist only in development. Product actions stay in the Web UI rather than being duplicated in the menu. The desktop bridge binds to `127.0.0.1`, uses an OS-assigned port, and requires separate per-launch random tokens for directory picking and path opening; its endpoints are passed only to the Host child and are not exposed to the renderer. Host path-opening requests use Electron's `shell.openPath`; macOS text-editor requests use `open -t`. Downloads opened by the Harness page use Electron's save dialog with a sanitized suggested filename. Packaged builds use the Node runtime under `resources/node-runtime`; development builds use `DSH_NODE_BIN`, `npm_node_execpath`, or the system `node` lookup. `DSH_HOME` selects an existing Harness data directory; without it, data is stored under Electron's user-data directory in `dsh-home`. `DSH_CLI_ENTRY` overrides the bundled CLI entry, and `DSH_RUNTIME_ROOT` overrides the bundled Harness runtime root. The default Electron session denies permission requests from the renderer and grants only the `clipboard-sanitized-write` check that the Web UI's copy controls need. Windows shutdown terminates the Harness process tree before using a direct-process fallback; macOS keeps the app and Harness running after the last window closes so activation can recreate the window.

## Automatic updates

Packaged Windows and macOS builds check the GitHub Release for `deepseek-ai/deepseek-harness` after startup. Windows NSIS and macOS DMG/ZIP releases generate the metadata consumed by `electron-updater`; a downloaded update is installed after the user confirms an immediate restart or when the app quits. Linux packages do not invoke the updater under the current release contract. Set `DSH_DISABLE_AUTO_UPDATE` for offline or local testing. Updates require a published Release with the matching `dsh-v<version>` tag and signed macOS artifacts.

## Signing and CI

The GitHub Actions desktop release workflow builds Windows, macOS, and Linux artifacts from a `dsh-v<version>` tag and attaches them to the GitHub Release. Windows signing reads `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`; macOS signing and notarization read `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`. These values are repository or environment secrets and are never committed. When `DESKTOP_FORCE_CODE_SIGNING` is not `true`, macOS explicitly disables signing so an empty CI secret cannot be mistaken for a certificate path; the protected production signing job leaves that identity unset and fails when its required signing secrets are absent.

GitLab CI uses the same `dsh-v<version>` tag to run native Windows, macOS, and Linux packaging jobs in parallel and exposes each platform's installers as Job Artifacts. Set `DESKTOP_WINDOWS_RUNNER_TAG`, `DESKTOP_MACOS_RUNNER_TAG`, and `DESKTOP_LINUX_RUNNER_TAG` when the GitLab runner tags differ from the defaults; keep signing inputs in protected CI variables.

## Scope

This desktop package includes startup, single-instance focus, startup diagnostics, DevTools mode, the auto-hidden native application menu, Electron-owned directory and path opening, external-link handoff, Electron download saving, installer packaging, signed CI artifacts, GitHub Release updates, and child-process teardown. Tray integration and a general IPC fetch carrier remain separate extensions; they must use narrow main-process bridges instead of exposing Node.js to the renderer.
