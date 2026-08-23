# P2 Start Version Survey (R2 re-run)

> Status: **decision record — Phase 1 of plan `2026-08-23-1447-1` (M2-WI6)**
> Date: 2026-08-23
> Owner: human (via opencode session)
> Method: `npm view <pkg> dist-tags --json` for the five packages, compared row-by-row against R2 (`2026-08-22-0002-npm-version-surface.md`). R2's instruction "Re-run this survey at P2 start" executed here.

## Dist-tags: P2 survey vs R2 (2026-08-22)

| Package | latest (now / R2) | next (now / R2) | Drift |
| --- | --- | --- | --- |
| `@deepseek-ai/cordis` | 4.0.1 / 4.0.1 | 4.0.1-rc.4 / 4.0.1-rc.4 | none |
| `@deepseek-ai/dsh-agent` | 0.1.0-rc.6 / 0.1.0-rc.6 | 0.1.1-rc.2 / 0.1.1-rc.2 | none |
| `@deepseek-ai/dsh-goal` | 0.0.1-rc.1 / 0.0.1-rc.1 | 0.1.1-rc.2 / 0.1.1-rc.2 | none |
| `@deepseek-ai/dsh-tools` | 0.0.1-rc.1 / 0.0.1-rc.1 | 0.1.1-rc.2 / 0.1.1-rc.2 | none |
| `@deepseek-ai/dsh-subagent` | 0.0.1-rc.1 / 0.0.1-rc.1 | 0.1.1-rc.2 / 0.1.1-rc.2 | none |

Diff vs R2 table: **empty** — the host cohort has not moved in the 24h window. No typing re-verification of the five call points is required (the R2 typing check against `dsh-agent@0.1.1-rc.2` `.d.ts` remains the verified basis).

## Pinning decision (landed in `plugin/dsh/package.json`)

Exact pins, no ranges, per packaging doc §Dependency and Version Risk:

```json
"@deepseek-ai/cordis": "4.0.1",
"@deepseek-ai/dsh-agent": "0.1.1-rc.2",
"@deepseek-ai/dsh-goal": "0.1.1-rc.2",
"@deepseek-ai/dsh-tools": "0.1.1-rc.2",
"@deepseek-ai/dsh-subagent": "0.1.1-rc.2"
```

`dsh-goal` / `dsh-tools` are not consumed until P3+ (reinforcement gate), but are pinned now per the single-cohort-consistency rationale (R2 §Pinning Recommendation) — accepting an unused-dependency warning over a mixed-cohort install later. Bumping any pin remains an explicit changelog event.
