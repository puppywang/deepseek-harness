# Agent Note: GitHub plugin catalog and built-in AnySearch

Status: implemented

English | [中文](2026-08-19-plugin-catalog-and-anysearch.zh.md)

## Problem

The Plugins settings tab only installed plugins by manually entering a package/git spec, so users could not discover community plugins. Separately, the AnySearch team published an `@anysearch/anysearch-dsh` bundle plugin that should ship with the desktop web surface instead of requiring a manual install.

## Decision

- Add `pluginManager.catalog` to the Host Remote so the Plugins settings tab can render an installable catalog and install any entry with the existing `pluginManager.install`. Discovery no longer uses GitHub topic search; the shipped npm-based mechanism is owned by [the local plugin catalog index](2026-08-20-plugin-catalog-local-index.md).
- Ship AnySearch with the web app by adding `@anysearch/anysearch-dsh` to `@deepseek-ai/dsh-web-app`'s dependencies and mounting its two patch rows (`web.searchProvider: anysearch` and the `web-search-anysearch` insert) in `cordis.patch.yml`. This makes AnySearch available to every web profile without changing the user's profile manifest.

## Alternatives considered

- **Curated static catalog file** — rejected for the first iteration because the ecosystem already uses the `dsh-plugin` GitHub topic for discoverability; a dynamic topic query keeps new plugins visible without a repo-side PR.
- **Client-side GitHub API call** — rejected: the browser would need a GitHub token/rate budget and would expose network behavior per user; the Host can cache later and owns the network policy.
- **Install AnySearch through profile templates only** — rejected: existing profiles would not receive it. Bundling it in `dsh-web-app` means the updated app ships it everywhere.

## Consequences

- The web profile now ships AnySearch as the default `web` search provider and its advanced tools are mounted.
- Users can discover and install community plugins from the Plugins tab without leaving the app.
- The catalog exposes only public npm metadata, not host configuration; `pluginManager.catalog` is an ordinary (non-loopback-pinned) read-only Remote.
