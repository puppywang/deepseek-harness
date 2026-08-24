# Agent Note: Local plugin catalog index

Status: implemented

English | [中文](2026-08-20-plugin-catalog-local-index.zh.md)

Partially supersedes: [GitHub plugin catalog and built-in AnySearch](2026-08-19-plugin-catalog-and-anysearch.md) (catalog discovery mechanism).

## Problem

npm's relevance-ranked server-side search buries exact-name matches from new zero-download packages: for `keywords:dsh-plugin notification`, `dsh-notification` ranked near position 1582 of about 2526 results with a literal search score of 0, so the paged live search could not reach it inside the browsing window, and the empty-query directory showed only the top ranked slice of the verified ecosystem instead of all of it.

## Decision

- `pluginManager.catalog` answers from a durable full index at `$DSH_HOME/cache/plugin-catalog-index.json`: every npm package carrying the `dsh-plugin` keyword whose latest manifest declares a DSH bundle or client role. The gateway loads the file once per process, rebuilds it off the request path when it is missing or older than 24 hours (full keyword-scope listing plus one latest-manifest check per candidate at bounded concurrency), writes it through a sibling temp-file rename, versions the schema, and treats any malformed file as absent.
- Ranking over the index is local and deterministic: equal name, then name prefix, then name substring, then keyword hit, then description hit; multi-word queries require every word to hit somewhere and take the worst tier of their words; ties break by monthly downloads, then name. An empty query returns the download-ranked directory across the whole verified set.
- Registry access stays as fallback and freshness path. Before the first build lands, or while no usable file exists, `catalog` serves the previous live npm server-side search; a failed rebuild backs off five minutes before the next call retries; non-empty first-page queries still probe likely exact package names against the registry directly, so packages published after the last rebuild remain findable.

## Alternatives considered

- **Deeper live pagination** — rejected: surfacing rank ~1580 requires walking dozens of registry pages and their manifest checks on every search, with popularity-weighted ordering still deciding visibility.
- **Blocking index build at startup** — rejected: it would add tens of seconds of registry traffic to every launch, including sessions that never open the plugin manager, and concentrate requests right after fresh installs.
- **Third-party search API (npms.io)** — rejected: the same popularity-weighted ranking problem applies, and it adds an external dependency for data npm already serves.

## Consequences

- Exact and prefix matches surface deterministically regardless of download counts, and the empty-query directory spans the complete verified set rather than the first pages of npm's ordering.
- One rebuild costs roughly 2.5k registry requests per host per day; stale answers keep serving while a rebuild runs, and concurrent hosts converge by last-writer-wins on the atomic rename.
- Packages published between rebuilds surface only through the exact-name probe until the next refresh; there is no manual force-refresh surface yet.
