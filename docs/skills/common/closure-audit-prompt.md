# Closure Audit Prompt

Use this prompt when independently checking whether a planned slice is actually complete.

All created plans require closure audit.

```text
Read `AGENTS.md`, `docs/index.md`, the active requirement/design docs, the active plan, the latest related log entry, and the live changed code.

Audit whether the claimed implementation is truly closed.

Check `docs/context/ai-autonomy-policy.md` reviewer availability. Cold replay is not a second reviewer and never approves protected areas, unresolved product risk, or source-of-truth conflicts.

This audit must be run by an independent subagent or reviewer, not the implementing agent continuing the same closure decision.

Focus on:
- whether live behavior matches the stated requirement
- whether the plan's closure gates are actually satisfied
- whether proof exists in files and verification results, not only in chat
- whether docs were updated where the supported baseline changed
- whether any remaining gap is still in scope
- whether task routing and recorded skill usage still match the delivered work
- whether any autonomy or backlog state was loosened without durable evidence
- whether verification failures or unrun commands are being hidden
- whether scoped/partial verification (e.g. affected-modules-only) was conflated with full integration verification; if scope was limited, the plan must explicitly note "verification scope limited" and the auditor must evaluate the residual risk

Return findings first, ordered by severity.
If closure is blocked, say `needs revision` and list the exact missing proof or changes.
If the slice is acceptable, say `passes closure audit` and note any residual risks. The closure result must leave durable evidence in the plan `## Closure` section, with optional links to the daily log or a stored audit file. Do not approve closure based on self-recorded evidence from the implementing agent alone.
```
