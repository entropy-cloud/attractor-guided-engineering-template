# Design Docs Index

## Purpose

`docs/design/` holds stable app-layer owner docs.

Use this directory for:

- product feature baselines
- page and flow behavior
- roles and permissions
- app-shell behavior

Use `docs/architecture/` for cross-cutting technical structure.

## Scope Boundary

- `docs/requirements/` owns what should be built for the current slice
- `docs/design/` owns the stable app-layer baseline after that slice is accepted
- `docs/architecture/` owns technical design and cross-feature structure

When a feature depends on both business design and technical design, keep the two concerns in separate files and cross-reference them.

## Starter Files

- `app-overview.md`
- `feature-inventory.md`
- `roles-and-permissions.md`

## Domain Design Sets

- Template source workspace only: `source:docs/design/age-autonomy/00-overview.md` — AGE Ledger · Law · Supervisor · Efficiency owner docs; not part of the installed consumer baseline.
