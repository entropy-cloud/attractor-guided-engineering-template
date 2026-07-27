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

- Reviewer availability: `subagent`

This repo historically uses independent opencode subagents for plan draft review and closure audit (see `docs/plans/mission-driver-*/` and `docs/audits/mission-driver-*/` for evidence). The `mission-driver` engine itself also drives `opencode run` subprocesses for plan-review / closure-audit steps.

Rules:

- `subagent` — use independent subagent for required plan draft review and closure audit. Solo cold-replay is acceptable ONLY for non-protected, non-high-risk plans per AGENTS.md Reviewer-Availability Fallback; the plan MUST record the limitation.
- Protected areas, unresolved product risk, or source-of-truth conflicts still require human review or stay open.

## AI May Proceed Without Asking When

- The work is a single-file low-risk edit (typo, doc fix, test-only cleanup, small styling) that touches no contract, data/model, auth, permission, integration, deployment, cross-surface behavior, or protected area.
- A requirement or owner doc clearly describes the intended behavior AND the relevant verification commands are real (`project-context.md` Verification Commands not placeholders).
- The change is a no-op refactor within a single module that preserves public contracts and is covered by existing tests.
- Updating daily logs, scratch notes, or analysis docs that do not assert project behavior.

## AI MUST Stop And Ask When

- The change touches any Protected Area below without an explicit human approval or plan covering the change.
- The change modifies public contract behavior (CLI surface, `mission.json` schema, `draft-state.json` schema, `run-state.json` shape, `<BRIEF_GATE>` marker, public-exports-vs-test-seams) and no owner doc describes the new contract.
- The change adds a new runtime npm dependency to the engine (breaks zero-dep invariant).
- The change modifies `install-age.sh` personalization behavior or `install-age.manifest` membership.
- Documentation freshness is `stale` or `unknown` and the task would change product behavior instead of auditing or aligning the baseline.
- A source-of-truth conflict exists between raw input, requirements, owner docs, and live code, and the conflict has not been resolved or explicitly blocked.

## Protected Areas

These are mission-driver-specific protected areas (in addition to AGENTS.md global rules).

| Area | Rule | Notes |
| --- | --- | --- |
| `tools/mission-driver/src/engine.js` state-machine core | `ask-first` | Central `_result` / `_wfClose` / `_executeSubflowStep` / `_reconcileTerminal` paths. Changes need a plan + subagent review. |
| Engine zero-npm-dependency invariant | `blocked` unless human approves | Adding any runtime dep in `tools/mission-driver/package.json` `dependencies` breaks the clone-and-run promise. `commander` is vendored; do not un-vendor. |
| `tools/mission-driver/web/dist/` committed-artifact | `ask-first` | Re-adding `dist/` to `.gitignore` or removing committed dist must go through `.github/workflows/web-dist-check.yml` freshness check. |
| `tools/mission-driver/memory/_index.md` always-load contract | `ask-first` | This file is injected into every mission prompt via `{{selfMemoryIndex}}`. Structural changes affect the Reflexion loop. |
| `install-age.sh` personalization (sed-replace `<project-name>` at `:121-127`) | `ask-first` | Any change here requires updating the Phase 3 closure-gate test (see `docs/plans/2026-07-27-0000-template-realproject-split-plan.md`). |
| `install-age.manifest` membership | `ask-first` | Adding/removing entries changes what consumers receive. Test with `./install-age.sh /tmp/test "Test"` after any change. |
| Exit-code map (`main.js` `exitMap`) | `ask-first` | Documented in `EXECUTION-PRINCIPLE.md §11`. Status↔code mapping is a public contract for mission-driver consumers. |
| Flow JSON contract (`flows/*.json` step types, transition schema) | `ask-first` | Documented in `tools/mission-driver/design/mission-design.md`. Changes affect all consumer missions. |

## Source-of-Truth Precedence

When facts conflict, follow `docs/context/source-of-truth-and-precedence.md`. In summary:

1. Human-confirmed statement (chat or doc marked human-approved)
2. Active requirement / owner doc (`docs/requirements/`, `docs/design/`, `docs/architecture/`)
3. Live code + tests
4. Plans / audits / logs (history)
5. AI-authored docs (cannot loosen autonomy or clear blockers without human approval)
