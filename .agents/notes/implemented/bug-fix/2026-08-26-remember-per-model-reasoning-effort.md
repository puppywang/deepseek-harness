# Agent Note: Remember per-model reasoning effort

Status: implemented

English | [中文](2026-08-26-remember-per-model-reasoning-effort.zh.md)

## Problem

The composer and `/model` popup both composed a model switch as `{ provider, model }`, so the adapter's default effort was always reapplied. Users running third-party reasoning models had to re-select their desired thinking level after every model switch, and the choice was lost on reload.

## Decision

- Add a browser-local preference map keyed by `provider/model` storing the last explicitly chosen effort (`localStorage` key `dsh.modelSelection.efforts`), silently disabled outside browsers and on storage failure.
- The composer seat and `/model` selection entry both consult the map when building a model switch: a remembered effort is applied only if the target model still advertises that level; otherwise the model default applies.
- Choosing the provider-default row clears the route's remembered value. A rejected selection does not persist.

## Alternatives considered

- **Host-side persistence in user settings** — rejected for this iteration: the effort is a per-browser UI preference, not a durable conversation setting, and localStorage keeps the change entirely in the client package.
- **Always carry the current effort across different models** — rejected: third-party models advertise different level vocabularies; carrying an unsupported level would fail the request before network I/O.

## Consequences

- Switching away from a third-party model and back restores the last chosen thinking level without manual re-selection.
- The memory is per browser profile, not per device; the limitation is documented in the package README.