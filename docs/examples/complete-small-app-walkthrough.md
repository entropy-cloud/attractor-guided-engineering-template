# Complete Small-App Walkthrough

This example shows the intended shape of a small feature slice.

It is intentionally compact. The point is to show concrete content, not a large process.

## 1. Raw Input

Target file:

- `docs/input/source-pm-user-management.md`

```md
# PM Notes - User Management

Need a user management page for admins.

Admins should see users, search by name or email, and disable a user.
Disabled users cannot log in.
We do not need create/edit user profile in the first version.
```

## 2. Requirement

Target file:

- `docs/requirements/2026-05-21-0900-user-management.md`

```md
# User Management Requirement

## Goal

Admins can view users, search users, and disable active users.

## In Scope

- user list page
- search by name or email
- disable action for active users
- disabled users cannot log in

## Out Of Scope

- creating users
- editing user profiles
- bulk actions

## Business Rules

- only admins can access the page
- disabled users are blocked at login
- disabling an already disabled user is not shown as an available action

## Roles / Permissions

- Admin: can access the page and disable active users.
- Non-admin: cannot access the page.

## Data / Model Impact

- Existing user model must expose `id`, `name`, `email`, and `status`.
- Disabling a user changes status from `active` to `disabled`.
- No new database table is required for this slice.

## API / Integration Impact

- Requires a user list query endpoint.
- Requires a disable-user command endpoint.
- No external system integration is required for this slice.

## States

- Empty: show an empty state when no users match search.
- Loading: show loading state while fetching users.
- Error: show retryable error if user list query fails.
- Permission denied: non-admin users see access denied instead of the user list.

## Open Questions

- None blocking for the first slice.

## Acceptance Criteria

- [ ] admin can open the user list page
- [ ] search filters by name or email
- [ ] admin can disable an active user
- [ ] disabled user cannot log in
- [ ] non-admin cannot access the page
```

## 3. Owner Doc Update

Target file:

- `docs/design/app-overview.md`

Example update:

```md
## Main Surfaces

- User Management: admin-only surface for listing, searching, and disabling users.

## Roles

- Admin: can access User Management and disable active users.
- Non-admin: cannot access User Management.
```

## 4. Backlog Entry

Target file:

- `docs/backlog/README.md`

Example row:

```md
| P0 | User Management first slice | `docs/requirements/2026-05-21-0900-user-management.md` | `docs/design/app-overview.md` | `docs/plans/2026-05-21-1030-user-management-plan.md` | `ready` | `plan-first` | `none` |
```

Because this slice changes auth-visible admin behavior and spans page, API, permissions, and tests, it is `plan-first` and requires independent draft review plus independent closure audit.

## 5. Plan

Target file:

- `docs/plans/2026-05-21-1030-user-management-plan.md`

```md
# User Management Plan

> Plan Status: draft
> Last Reviewed: 2026-05-21
> Source: `docs/requirements/2026-05-21-0900-user-management.md`
> Audit: required

## Current Baseline

- app has authentication
- app has admin role checks
- no user management page exists yet

## Goals

- land the first supported user list/search/disable slice

## Non-Goals

- user creation
- profile editing
- bulk actions

## Task Route

- Type: `implementation-only change`
- Owner Docs: `docs/design/app-overview.md`
- Skill Selection Basis: `plan-audit-prompt.md` and `closure-audit-prompt.md` apply as review methods; delivery phase uses `Skill: none`

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline

## Execution Plan

### Phase 1 - Land The Core Slice

Status: active
Targets: `apps/...`, `packages/...`, `docs/...`
Skill: `none`

- Item Types: `Add | Proof`
- Prereqs: none

- [ ] add user list route/page
  - Skill: `none`
- [ ] wire search behavior
  - Skill: `none`
- [ ] add disable action
  - Skill: `none`
- [ ] enforce admin access
  - Skill: `none`
- [ ] add tests for search, disable, and non-admin access
  - Skill: `none`

Exit Criteria:

- [ ] user list/search/disable behavior lands for admins
- [ ] affected owner docs updated or `No owner-doc update required`
- [ ] `docs/logs/` updated

## Draft Review Record

- Independent draft review iteration 1: `needs revision` (`<task/session id>`) because `<why the first draft is not yet honest>`
- Independent draft review iteration 2: `accept` (`<task/session id>`) after `<what changed in the plan>`

## Closure Gates

- [ ] in-scope behavior is complete
- [ ] relevant docs are aligned
- [ ] verification has run (specify which commands; customize for visual/UX domains if needed)
- [ ] no in-scope item downgraded to deferred/follow-up
- [ ] independent draft review completed and recorded
- [ ] text consistency verified: status, phases, gates, and log all agree
- [ ] closure audit was independent
- [ ] closure evidence exists in files

## Deferred But Adjudicated

None.

## Closure

Status Note: complete only after independent draft review and closure audit both pass.

Closure Audit Evidence:

- Auditor / Agent: `<independent auditor or subagent>`
- Evidence: `<task id / log link / concise findings note>`

Follow-up:

- none
```

## 6. Log Entry

Target file:

- `docs/logs/2026/05-21.md`

```md
# Development Log - 2026-05-21

### 2026-05-21

- Implemented first User Management slice from `docs/requirements/2026-05-21-0900-user-management.md`.
- Added admin-only user list, name/email search, and disable action.
- Updated `docs/design/app-overview.md` with the supported User Management surface.
- Verification: `<real test command>` passed for user list/search/disable and non-admin access.
```

## 7. Closure Audit Note

This slice has a plan and therefore needs closure audit before the plan is marked complete.

Draft review should revise the plan directly and leave a short durable `Draft Review Record` in the plan. New plans normally start as `draft` and move to `active` only after independent draft review converges. Use a separate audit file only when the review is non-trivial, disputed, or useful for future sessions. Closure should always leave explicit `Closure Audit Evidence` in the plan and may also cite the daily log.

The implementing agent's own closure note is not sufficient. The closure pass must come from an independent subagent or reviewer.
