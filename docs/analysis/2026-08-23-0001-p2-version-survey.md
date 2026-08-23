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

## Addendum: M2-WI9 L3 harness composition devDeps (2026-08-23)

> Owner: plan `docs/plans/dsh-plugin/2026-08-23-1621-1-l3-host-harness-sdk-server.md` Phase 1 (Decision 1a — plugin/dsh self-hosted pinned devDeps + own minimal `cordis.yml`). Method identical to the survey above: `npm view <pkg> versions --json` per package.

Sixteen composition packages added as **exact-pinned devDependencies** (`0.1.1-rc.2` each) to `plugin/dsh/package.json` — the shipped `dependencies` field is unchanged (bundle dependency surface zero-diff):

`dsh-sdk-jsonrpc-demo` (the boot bin), `dsh-sdk-jsonrpc-server`, `dsh-llm-deepseek`, `dsh-agent-spine-demo`, `dsh-subprocess-local`, `dsh-bash-local`, `dsh-session-persistence-jsonl`, `dsh-session-checkpoint-policy`, `dsh-subagent-spawn-in-process`, `dsh-tool-subagent`, `dsh-tool-todo`, `dsh-fs-local`, `dsh-fs-observation-policy`, `dsh-tool-fs`, `dsh-token-meter`, `dsh-compaction-basic` (`dsh-subagent` was already a shipped dependency).

Survey facts:

- Every package publishes `0.1.1-rc.2` — the same cohort as the existing pins. Single-cohort consistency holds; no mixed-cohort install.
- The `latest` dist-tag of these packages points at older `0.0.1-rc.x` releases (tag lag, not drift) — pinning must stay **exact-version**, never tag-based; recorded as the operative reason the pins use literal versions.
- Local verification: `npm install` resolves all sixteen at `0.1.1-rc.2` exactly (`node -e require.resolve` check, 2026-08-23), and the composition boots green keylessly against the fixture (see the R3 §6 resolved note).

Transport decision context: `dsh-sdk-protocol` / `dsh-sdk-client` were deliberately NOT added — the harness hand-writes a thin NDJSON transport (`HarnessLineRpcTransport`, protocol face = 3 methods + 4 notifications), keeping the new-dependency surface at the composition minimum.
