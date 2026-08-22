# @deepseek-ai/* npm Version Surface (R2)

> Status: **preparatory research — registry + published-typing verification**
> Date: 2026-08-22
> Owner: human (via opencode session)
> Method: `npm view` dist-tags for the five packages Mission Control consumes; `npm pack @deepseek-ai/dsh-agent@0.1.1-rc.2` and direct `.d.ts` inspection against R1's source findings.

## Dist-tags (as of 2026-08-22)

| Package | latest | next | Used by |
| --- | --- | --- | --- |
| `@deepseek-ai/cordis` | **4.0.1** (stable) | 4.0.1-rc.4 | plugin DI kernel |
| `@deepseek-ai/dsh-agent` | 0.1.0-rc.6 | **0.1.1-rc.2** | agents service |
| `@deepseek-ai/dsh-goal` | 0.0.1-rc.1 | **0.1.1-rc.2** | goals gate (P3+) |
| `@deepseek-ai/dsh-tools` | 0.0.1-rc.1 | **0.1.1-rc.2** | defineTool registration |
| `@deepseek-ai/dsh-subagent` | 0.0.1-rc.1 | **0.1.1-rc.2** | descriptor + run-end info |

## Typing Verification (`dsh-agent@0.1.1-rc.2`, unpacked)

Published `.d.ts` matches the R1 host-source reading exactly:

- `lib/types/runtime-types.d.ts:45` — `export type AgentStatus = 'idle' | 'running'`
- `runtime-types.d.ts:87` — `whenIdle(): Promise<void>` with quiescence semantics doc
- `runtime-types.d.ts:115` — `followup(message: UserMessage): void`
- `lib/types/index.d.ts:65` — `CreateAgentOptions`

Conclusion: the `next` cohort `0.1.1-rc.2` is the line our R1 source reading describes; the `latest` tags trail it (agent 0.1.0-rc.6, goal/tools/subagent still 0.0.1-rc.1).

## Pinning Recommendation

- Target the **`next` 0.1.1-rc.2 cohort** for all four `@deepseek-ai/*` runtime deps, plus `cordis@4.0.x`. Rationale: single coherent version line across agent/goal/tools/subagent; matches master source we verified; `latest` mixing would pair a newer agent with older goal/tools whose APIs may diverge from what the current host composes.
- Exact-version pins (no ranges), one bump per changelog event, per packaging doc §Dependency and Version Risk.
- Re-run this survey at P2 start: preview-phase drift is expected; if the host has moved to a new cohort, re-diff the five call points before installing.
