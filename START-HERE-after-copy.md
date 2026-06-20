# Start Here After Copy

Use this checklist immediately after copying the template into a new project.

Do this before asking AI to implement features.

## Required Before First AI Coding

- [ ] Replace `<project-name>` and other placeholders.
- [ ] Fill `docs/context/project-context.md` with real project identity, documentation freshness, and verification commands.
- [ ] Fill `docs/context/ai-autonomy-policy.md` with real protected areas and reviewer availability.
- [ ] Fill `docs/context/codebase-map.md` with real entry points, common change routes, and fragile files.
- [ ] Fill `docs/backlog/README.md` with the first ready or blocked work items.
- [ ] Ensure a requirement or owner doc exists that describes the first task's intended behavior (under `docs/requirements/` or `docs/design/`). "What is being worked on" is read from unfinished plans in `docs/plans/`, not from a field in `project-context.md`.
- [ ] Ensure verification commands are real commands for this repository.
- [ ] Create `docs/logs/{year}/` directory for the current year (e.g. `docs/logs/2026/`). See `docs/logs/00-log-writing-guide.md` for log conventions.

For a direct local low-risk edit, do not block on a polished backlog or codebase map if a requirement/owner doc meaning is obvious and verification commands are real. Protected areas, stale docs, missing verification, or unclear user-visible behavior still block coding.

## Fill Progressively

Fill these as soon as they are needed. Do not block the first small feature just to write polished baseline docs.

- [ ] Fill `docs/architecture/project-vision.md` with long-term product direction and non-goals.
- [ ] Fill `docs/architecture/system-baseline.md` with the real stack and model/database source.
- [ ] Fill `docs/design/app-overview.md` with current app surfaces, roles, and core workflows.
- [ ] Fill `docs/requirements/product-scope.md` and `docs/requirements/mvp.md` with the current milestone scope.
- [ ] Add the first known-good verification row to `docs/testing/known-good-baselines.md` when real commands pass.
- [ ] Decide which optional layers are active by checking boxes in `docs/context/project-context.md`.
- [ ] Remove or ignore optional directories you will not maintain yet.

## Optional Starter Skeletons (Use Only When Justified)

These are on-demand. Do not fill them just to be complete; adopt the ones the project actually needs. Delete the ones that do not apply.

- [ ] `docs/backlog/implementation-roadmap.md` — when the project is large enough that a flat backlog table no longer shows phase-level progress. See `docs/backlog/00-roadmap-authoring-guide.md`.
- [ ] `docs/requirements/product-baseline.md` — when you need an explicit product baseline and first complete loop.
- [ ] `docs/design/domain-design-guidelines.md` — when the project has several business domains and needs a single domain-to-owner-doc map.
- [ ] `docs/design/flow-overview.md` — when the project has cross-domain flows that need one global view.
- [ ] `docs/architecture/api-response-conventions.md` — when the project exposes HTTP/REST or RPC APIs.
- [ ] `docs/architecture/integration-and-transaction-patterns.md` — when the project integrates with external systems or runs background/polling work.

## Minimum Before Coding

- [ ] A requirement or owner doc describes the intended behavior of the work, with concrete acceptance criteria.
- [ ] Documentation freshness is not `stale` or `unknown`, unless the first task is research or baseline alignment only.
- [ ] Protected-area placeholders are replaced with real entries or explicit `none`.
- [ ] Verification commands are real commands for this repository.
- [ ] Any conflict between raw input, requirements, owner docs, and live code is resolved or explicitly blocked.

## Do Not Start If

- `docs/context/project-context.md` is still blank.
- verification commands are placeholders.
- protected-area placeholders remain and the task touches auth, permissions, payment, data deletion, model/schema, deployment, or external integrations.
- no requirement or owner doc describes the intended behavior, so implementation would require guessing user-visible behavior.
- the task touches a protected area whose rule is `ask-first`/`research-only`/`blocked` and no human decision has changed it.
- documentation freshness is `stale` or `unknown` and the task would change product behavior instead of auditing or aligning the baseline.
- the task changes database/API/auth/integration behavior but no owner doc or model source is identified.
