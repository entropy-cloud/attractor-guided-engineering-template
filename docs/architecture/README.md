# Architecture Docs Index

## Purpose

`docs/architecture/` defines the stable cross-cutting technical baseline for `<project-name>`.

Use `docs/design/` for app-layer feature and business design. Use `docs/architecture/` for technical structure that spans multiple features.

## Suggested Reading Order

1. `project-vision.md`
2. `system-baseline.md`
3. `module-boundaries.md`
4. `mission-driver-baseline.md` — public contracts for the `tools/mission-driver/` cross-cutting engine (CLI surface, `mission.json` / `draft-state.json` / `run-state.json` schemas, marker contracts, public exports vs test seams)
5. more specific owner docs as the project grows

## Owner-Doc Rules

- keep one document responsible for one stable topic
- explain current rationale and constraints, not step-by-step history
- when implementation changes supported architecture, update the owner doc in the same change
- move rejected options and exploration notes to `docs/analysis/`
- cite the relevant app-layer owner doc under `docs/design/` when the technical rule exists to support a concrete product behavior

## Precedence Boundary

- `docs/design/` owns app behavior and feature semantics
- `docs/architecture/` owns technical structure and cross-cutting implementation rules
- if a question is about persistence or schema truth, the model/schema files themselves are authoritative

## Initial Owner Docs

- `project-vision.md` - product and system intent
- `system-baseline.md` - current stack and runtime baseline
- `module-boundaries.md` - package/module/domain ownership boundaries
- `mission-driver-baseline.md` - public contracts for the mission-driver engine
