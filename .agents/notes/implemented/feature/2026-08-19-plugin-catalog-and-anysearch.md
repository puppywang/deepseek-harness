# Agent Note: GitHub plugin catalog and built-in AnySearch

Status: implemented

English | [中文](2026-08-19-plugin-catalog-and-anysearch.zh.md)

## Problem

The Plugins settings tab only installed plugins by manually entering a package/git spec, so users could not discover community plugins. Separately, the AnySearch team published an `@anysearch/anysearch-dsh` bundle plugin that should ship with the desktop web surface instead of requiring a manual install.

## Decision

- Add `pluginManager.catalog` to the Host Remote. It queries GitHub's public repository search for the `dsh-plugin` topic, reads each repository's `package.json` from `raw.githubusercontent.com`, and returns installable npm package names sorted by stars. The client Plugins tab renders this catalog and can install any entry with the existing `pluginManager.install`.
- Ship AnySearch with the web app by adding `@anysearch/anysearch-dsh` to `@deepseek-ai/dsh-web-app`'s dependencies and mounting its two patch rows (`web.searchProvider: anysearch` and the `web-search-anysearch` insert) in `cordis.patch.yml`. This makes AnySearch available to every web profile without changing the user's profile manifest.

## Alternatives considered

- **Curated static catalog file** — rejected for the first iteration because the ecosystem already uses the `dsh-plugin` GitHub topic for discoverability; a dynamic topic query keeps new plugins visible without a repo-side PR.
- **Client-side GitHub API call** — rejected: the browser would need a GitHub token/rate budget and would expose network behavior per user; the Host can cache later and owns the network policy.
- **Install AnySearch through profile templates only** — rejected: existing profiles would not receive it. Bundling it in `dsh-web-app` means the updated app ships it everywhere.

## Consequences

- The web profile now ships AnySearch as the default `web` search provider and its advanced tools are mounted.
- Users can discover and install `dsh-plugin`-topic repositories from the Plugins tab without leaving the app.
- The catalog depends on GitHub's unauthenticated search/raw limits; repositories without a resolvable `package.json` are skipped.
- `pluginManager.catalog` is an ordinary (non-loopback-pinned) read-only Remote; it exposes only public GitHub metadata, not host configuration.
