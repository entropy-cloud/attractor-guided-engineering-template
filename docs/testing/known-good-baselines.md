# Known Good Baselines

Record the most recent meaningful verification baseline. Append-only; do not edit historical rows.

| Date       | Source         | Commit / Tree           | Scope                  | Commands                                                                                                                                                              | Failures | Log/Test Link                       | Notes                                                        |
| ---------- | -------------- | ----------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- | ------------------------------------------------------------ |
| 2026-07-27 | local          | working tree (uncommitted) | full (engine + docs)   | `pnpm --prefix tools/mission-driver test` (engine + prompt-check.mjs); install-age.sh Phase 3 closure-gate test (5 assertions PASS)                                   | none     | `docs/plans/2026-07-27-0000-template-realproject-split-plan.md` Phase 3 | After template-realproject split; engine unchanged           |
| 2026-07-24 | local          | commit `0a40c5f`-derived | full (engine + web)    | `pnpm --prefix tools/mission-driver test`; `pnpm --prefix tools/mission-driver/web run build` + `git diff --exit-code -- dist` (web dist freshness)                  | none     | `docs/logs/2026/07-24.md`           | Per `2026-07-24-1030-mission-driver-web-onboarding-committed-dist-plan.md` closure |

## How To Refresh This File

After any green verification run that meaningfully covers more than one file:

1. Add a row at the top with today's date, source (local / CI), commit SHA or `working tree`, scope, commands, failures (`none` if clean), log link, and notes.
2. Do not edit historical rows.
3. Reference this row from `docs/logs/{year}/{month}-{day}.md` and from the relevant plan's `Closure` section.

## Scope Conventions

- `full` = engine test suite + frontend build + any active mission's validation
- `engine-only` = `pnpm --prefix tools/mission-driver test` only
- `web-only` = `pnpm --prefix tools/mission-driver/web run build` (+ `check:dist`)
- `docs-only` = no verification command (docs change without code); record explicitly so future debug does not assume code coverage
