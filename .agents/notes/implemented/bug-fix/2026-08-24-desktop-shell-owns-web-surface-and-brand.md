# Agent Note: Desktop shell owns the web surface and brand

Status: implemented

English | [中文](2026-08-24-desktop-shell-owns-web-surface-and-brand.zh.md)

## Problem

The packaged desktop app handed the served URL to the default browser on every launch, because `dsh web`'s terminal-oriented browser handoff defaults to on and the desktop child argv never suppressed it. Separately, installer builds ran the root `build` script without a client profile, so the packaged frontend silently baked the `DSH Local Build` fallback title instead of the official brand.

## Decision

- The desktop shell builds its `dsh web` child argv through one helper that always passes `--no-open`: the Electron window is the only intended surface.
- Every installer entry (`build:installer*`, `release`) runs the root `build:official` profile, binding `DSH_CLIENT_TITLE=DeepSeek Harness` into the shipped frontend artifacts.
- The runtime smoke check fails packaging when the deployed frontend's `<title>` is not the official brand, so a lost profile cannot reach a published installer again.

## Alternatives considered

- **Config-only suppression** (`openBrowser: false` through the profile patch) — rejected: the desktop shell owns its child process contract at spawn time, and patch files remain user-editable surfaces.
- **Title assertion only in CI** — rejected: the smoke check runs inside every per-OS packaging job, which is the last point before artifact publication.

## Consequences

- Desktop launches no longer open a system browser tab alongside the app window.
- Published installers carry the official title; a future branding regression fails the packaging job with a rebuild instruction instead of shipping.
