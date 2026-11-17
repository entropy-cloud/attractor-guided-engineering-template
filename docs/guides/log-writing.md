# Development Log Writing Guide

Development log entries are organized by date, with one file per day on the mainline.

## Purpose

The daily log is the **decision and adjustment record** — the durable memory of why the project moved the way it did. It captures exactly three kinds of content:

1. **User decisions and adjustments** — any important steering from the user that is not already captured in a requirement/design/plan file: priority changes, direction corrections, tooling rulings, "do it this way instead" moments.
2. **Major AI autonomous decisions** — non-obvious choices AI made without a user ruling (an approach selected over alternatives, a tradeoff taken), with one-line rationale.
3. **Repeats and oscillations** — rework, failed approaches, the same error appearing again, ping-pong between designs. These are the raw material for lessons and skill promotion.

## What NOT To Log

The log is not a mirror of plan progress. **Execution detail already recorded in a plan must not be repeated here** — no per-phase completion bullets, no restating plan items or verification results beyond a verification-status line. If the only content of an entry would duplicate the plan, skip the entry (the plan is the record). Small routine doc updates that need no decision also do not need a log line.

Rule of thumb: a log entry answers *"what was decided, adjusted, or repeatedly failed, and why"* — plans answer *"what was done and how it was proven"*.

## Rules

- **One file per day on the mainline** — append new `### YYYY-MM-DD` sections at the top (reverse chronological)
- **Append-only** — never rewrite an old day's file to change what happened
- **Keep entries short** — bullets; link to the owning doc (`docs/architecture/...`, `docs/plans/<slug>/...`) instead of restating it
- **Not source of truth** — lightweight decision memory, not normative architecture
- **Treat log files as append-only history** — file length alone is not a defect

## Path Convention

```text
docs/logs/{year}/{month}-{day}.md                        # mainline
docs/logs/{year}/{month}-{day}-{roadmap-slug}.md         # roadmap-scoped (parallel worktree) work
```

**Parallel-worktree rule**: the same-day file is the main merge-conflict point when multiple worktrees run in parallel. Work delivered under a roadmap in an isolated worktree (or a dedicated branch) writes `docs/logs/{year}/{month}-{day}-{roadmap-slug}.md` instead of the mainline file. Since one roadmap never executes in two worktrees at once, slug-suffixed files are conflict-free by construction; the mainline `{month}-{day}.md` stays reserved for mainline work. All files of a day merge side-by-side with no coordination.

## Entry Format

```markdown
# Development Log - YYYY-MM-DD

### YYYY-MM-DD

- User decision: <what was ruled, and the anchor it changes> (overrides/updates: `docs/design/xxx.md`)
- AI decision: <approach chosen> over <alternative> — <one-line why>
- Repeat: <error/oscillation observed> — <action taken: lesson/skill/check-script promotion per AGENTS.md Hard Rule 9>
- Verification: <suite> full-green (recorded in plan `docs/plans/<slug>/...` — details there)
```

## Adding A New Entry

1. Open `docs/logs/{year}/{month}-{day}.md` (or the roadmap-suffixed file when working roadmap-scoped in a worktree; create it if missing)
2. Add a `### YYYY-MM-DD` section at the top, before any existing entries
3. Write the new bullets — decisions, adjustments, oscillations; skip plan-progress restatement
