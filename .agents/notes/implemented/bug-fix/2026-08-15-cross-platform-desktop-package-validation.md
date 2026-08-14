# Agent Note: Cross-platform desktop package validation

Status: implemented

English | [中文](2026-08-15-cross-platform-desktop-package-validation.zh.md)

## Problem

Electron Builder places `app.asar` directly under `resources` on Windows and Linux, but places it under `<Product>.app/Contents/Resources` on macOS. A single resource-root assumption allowed Windows packaging to pass while macOS failed after the runtime smoke test. Linux `.deb` packaging also requires project homepage and maintainer metadata that the desktop configuration did not declare.

## Decision

The desktop builder configuration declares the repository homepage and an explicit Linux maintainer. The package verifier resolves its resource root from the Electron platform: macOS uses `packager.appInfo.productFilename` to locate the application bundle, while Windows and Linux use the flat `appOutDir/resources` directory. All package checks continue to run against that resolved root, including `app.asar`, the bundled Node runtime, the CLI entry, and the boot package manifests.

## Alternatives considered

- **Hardcode `DeepSeek Harness.app` in the verifier** — rejected: the product filename is already owned by Electron Builder and must remain the source for the bundle path if branding changes.
- **Skip the package verifier on macOS** — rejected: the macOS artifact needs the same runtime and boot-package guarantees as the other platforms.
- **Rely on package.json metadata alone for Linux** — rejected: the Linux package requirements are part of the Electron Builder configuration, so the required homepage and maintainer are declared at that boundary.

## Consequences

- macOS packaging validates the actual `.app` bundle instead of a nonexistent flat directory.
- Linux AppImage and `.deb` targets can complete with the metadata required by `fpm`.
- The pure resource-root resolver is covered for all three desktop platforms and for a missing macOS product filename.
