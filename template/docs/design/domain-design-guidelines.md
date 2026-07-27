# Domain Design Guidelines

## Purpose

This file defines project-level domain-design ownership rules: which domain area is owned by which design doc, and how cross-domain concerns are attributed. Generic product-design rules belong in the relevant requirement and design docs; this file records only the project-specific ownership map and local interpretation.

## When To Use This File

Use it when the project has more than a few business domains and a reader needs a single map from "a concept changed" to "which design doc owns it". Small projects can omit this file.

## Domain Ownership Map

| Domain area | Owner Doc | Owns |
| --- | --- | --- |
| <domain> | `docs/design/<path>.md` | <what it owns> |

## Cross-Domain Attribution

- <one domain> may reference another domain's rules but must not copy them in full.
- Shared concepts (for example, a settlement flow that touches catalog, identity, and pricing) are owned by exactly one doc; adjacent docs cite it.
- State/result meanings owned by one doc are not redefined by another.

## Writing Rules

- Keep the distinction between end-user actions, admin actions, and system-automatic actions clear.
- Even when implementation advances in small slices, keep behavior definitions formal, not throwaway demo semantics.
- Persisted field sets, status codes, and dictionary values are owned by the project's contract/model source of truth, not restated as prose here.
- Implementation order belongs in `docs/backlog/` or `docs/plans/`, not in domain design docs.

## Update Rule

Update this file only when domain ownership mapping or local interpretation changes. If only a single feature's supported behavior changes, update the owning design doc instead.
