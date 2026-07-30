# Architecture

`docs/architecture/` defines the stable cross-cutting technical baseline for `mission-driver` (the in-tree tool this repo develops).

## Owner Doc Map

| Concern | Owner Doc |
| --- | --- |
| Engine CLI surface, exports, public contracts (run-state shape, exit map, etc.) | [`mission-driver-baseline.md`](mission-driver-baseline.md) — the single authoritative architecture reference for the engine. Read this first. |
| Why this repo has a `template/` subdirectory + the boundary between real-project and template content | [`template-vs-realproject-boundary.md`](template-vs-realproject-boundary.md) |
| Module boundaries (engine vs monitor vs web vs tooling) | [`module-boundaries.md`](module-boundaries.md) |
| Long-term product direction and non-goals | [`project-vision.md`](project-vision.md) |
| Current implementation baseline (stack, runtime, deployment) | [`system-baseline.md`](system-baseline.md) |
| HTTP/REST response conventions (when the project exposes APIs) | [`api-response-conventions.md`](api-response-conventions.md) — currently a starter skeleton, not actively used by the file-based monitor |
| External integration and transaction safety patterns | [`integration-and-transaction-patterns.md`](integration-and-transaction-patterns.md) — currently a starter skeleton, not actively used |

## When This Directory Changes

- Adding a new cross-cutting technical contract that spans multiple modules → add a doc here and reference it from `mission-driver-baseline.md` (do NOT duplicate content already in `mission-driver-baseline.md`).
- Design-level decisions belong in `docs/design/` (or under `tools/mission-driver/design/` for engine internals); cross-cutting technical structure belongs here.
- Per `AGENTS.md` Operating Rule 6, keep this directory focused on the current supported baseline, not migration history.
