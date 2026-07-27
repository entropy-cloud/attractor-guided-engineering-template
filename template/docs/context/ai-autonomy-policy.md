# AI Autonomy Policy

## Purpose

This file defines when AI agents may proceed without asking and when they must stop for human input.

Keep it short and project-specific. Update it whenever the team wants AI to take more or less initiative.

AI may make this file stricter by marking work more constrained, but AI must not loosen protected areas, change `ask-first`/`blocked`/`research-only` work to `implement`, or remove blockers without explicit human confirmation or owner-doc evidence marked as human-approved.

AI-authored or AI-modified docs, including owner docs, cannot be used as evidence to loosen autonomy, clear blockers, mark docs fresh, or downgrade protected areas unless a human explicitly approves that evidence.

## Autonomy Levels

Use these labels on backlog/roadmap work items (they are per-item, not a global field in `project-context.md`):

- `implement` - AI may implement after reading the listed requirement, owner doc, and verification commands.
- `plan-first` - AI may draft or update the plan, but implementation waits for plan audit and any protected-area approval required by the table below.
- `ask-first` - AI must ask before changing code or user-visible behavior.
- `research-only` - AI may inspect, summarize, and propose options, but must not modify product behavior.
- `blocked` - AI must not proceed until the blocker is resolved in files or by human confirmation.

The default level is `implement` for work items with no explicit label. The default is gated by documentation freshness (`project-context.md`) and the Protected Areas below. A human may tighten the project default by editing this file; AI may tighten (never loosen) it based on evidence.

## Reviewer Availability

Set one value for the copied project:

- Reviewer availability: `<human | subagent | none>`

If this value is still a placeholder, treat reviewer availability as `none` and treat protected-area or high-risk plans as blocked until human/subagent review is configured.

Rules:

- `human` or `subagent` - use that reviewer for required plan and closure audits.
- `none` - cold replay may be used only for non-protected, non-high-risk plans. Cold replay is not a second reviewer; it is a documented self-check performed after implementation context is set aside.
- Protected areas, unresolved product risk, or source-of-truth conflicts still require human/subagent review or must remain blocked.

## AI May Proceed Without Asking When

- the work item is marked `implement` (or has no label and defaults to `implement`) or the user directly requests a local low-risk change
- a requirement or owner doc describes the work's intended behavior with concrete acceptance criteria
- for backlog-selected work, the backlog row is `ready`, has no stale links, and does not require a missing plan
- verification commands in `docs/context/project-context.md` are real commands, not placeholders
- protected-area placeholders in this file have been replaced with real entries or explicit `none`
- documentation freshness in `docs/context/project-context.md` is `fresh`, or the active slice has explicitly verified fresh requirement, owner doc, codebase-map route, and touched code area
- the task does not touch a protected area below
- open questions are explicitly non-blocking

## AI Must Ask Or Stop Before

- changing product scope when the requirement or owner doc is ambiguous
- changing database/model shape, data deletion, payment, auth, permission, deployment, or external integration behavior without an owner doc and test strategy
- inventing behavior for an external system that is not described in committed integration docs or tests
- skipping required verification because commands are missing, broken, or too slow
- closing a plan whose audit, verification, docs, or checklist evidence is missing
- proceeding when live code and owner docs conflict and resolving the conflict would change user-visible behavior or public contracts
- loosening autonomy labels, protected-area rules, or blockers without human confirmation or human-approved owner-doc evidence
- proceeding with implementation when documentation freshness is `stale`, `unknown`, or `partially stale` for the active slice; first perform baseline research or a plan-first alignment slice

## Protected Areas

Fill these for the copied project.

If this table still contains placeholders, AI must treat payment, auth/permissions, data deletion, database/model shape, deployment, and external integrations as `ask-first` or `blocked` until the table is replaced with real entries or explicit `none`.

| Area                 | Rule       | Required Evidence |
| -------------------- | ---------- | ----------------- |
| `<payment>`          | ask first  | owner doc + tests |
| `<data deletion>`    | ask first  | owner doc + tests |
| `<auth/permissions>` | plan-first | owner doc + tests |

Protected-area rule meanings:

- `ask first` - human approval is required before planning or implementation.
- `plan-first` - AI may draft the plan, but implementation requires plan audit plus the required evidence in the table. If reviewer availability is `none`, implementation stays blocked.
- `research-only` or `blocked` - AI may not change product behavior.

## Backlog Selection Rule

If the user asks AI to continue work without naming a task, choose the highest-priority item in `docs/backlog/README.md` whose autonomy is `implement` and whose blockers are `none`.

Before implementing the selected item, re-check planning triggers. `Plan: none` does not waive the plan guide.

Direct user requests for local low-risk edits do not require a backlog row, but they still must satisfy the no-plan path and verification rules.

If no safe `implement` item exists, summarize the top blocked, `plan-first`, or `ask-first` item and ask for a decision.
