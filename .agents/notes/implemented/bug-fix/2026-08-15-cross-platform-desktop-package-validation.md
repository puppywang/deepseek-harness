# Agent Note: Cross-platform desktop package validation

Status: implemented

English | [中文](2026-08-15-cross-platform-desktop-package-validation.zh.md)

## Problem

Electron Builder places `app.asar` directly under `resources` on Windows and Linux, but places it under `<Product>.app/Contents/Resources` on macOS. A single resource-root assumption allowed Windows packaging to pass while macOS failed after the runtime smoke test. Linux `.deb` packaging also requires project homepage and maintainer metadata that the desktop configuration did not declare.

## Decision

The desktop package manifest declares the repository homepage, and the builder configuration declares an explicit Linux maintainer. The homepage stays in the package manifest because electron-builder 26 rejects it as a root configuration property. Unsigned macOS builds set `identity: null` unless `DESKTOP_FORCE_CODE_SIGNING` is `true`, so an empty `CSC_LINK` cannot be interpreted as a certificate path; forced production builds leave identity resolution to the configured signing credentials. The package verifier resolves its resource root from the Electron platform: macOS uses `packager.appInfo.productFilename` to locate the application bundle, while Windows and Linux use the flat `appOutDir/resources` directory. All package checks continue to run against that resolved root, including `app.asar`, the bundled Node runtime, the CLI entry, and the boot package manifests.

## Alternatives considered

- **Hardcode `DeepSeek Harness.app` in the verifier** — rejected: the product filename is already owned by Electron Builder and must remain the source for the bundle path if branding changes.
- **Skip the package verifier on macOS** — rejected: the macOS artifact needs the same runtime and boot-package guarantees as the other platforms.
- **Put the homepage in the Electron Builder root configuration** — rejected: electron-builder 26 rejects `homepage` in that object; the package manifest is its metadata source, while the maintainer remains an explicit Linux option.
- **Only unset empty signing variables in the CI shell** — rejected: local and other CI invocations can also expose empty credential variables; the platform configuration must make unsigned macOS packaging explicit at the Builder boundary.

## Consequences

- macOS packaging validates the actual `.app` bundle instead of a nonexistent flat directory.
- Linux AppImage and `.deb` targets can complete with the metadata required by `fpm`.
- Unsigned macOS packaging ignores empty certificate variables, while forced production signing remains strict.
- The pure resource-root resolver is covered for all three desktop platforms and for a missing macOS product filename.
