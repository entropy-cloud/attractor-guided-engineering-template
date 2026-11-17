# Plan Audit Prompt

Use this prompt when independently reviewing an execution plan before implementation.

All created plans require this review.

```text
Read `AGENTS.md`, `docs/index.md`, `docs/guides/application-development-workflow.md`, the plan-format authority `docs/guides/plan-authoring-and-execution.md`, the active requirement/design docs, and the active plan under `docs/plans/<roadmap-slug>/`.

Audit the plan as an execution contract.

Check `docs/context/ai-autonomy-policy.md` reviewer availability. Cold replay is not a second reviewer and never approves protected areas, unresolved product risk, or source-of-truth conflicts.

Focus on:
- format compliance against the authority guide: 2–6 phases, one result surface, work-item mapping legal (never one work item spread across plans), receipt-region structure intact
- whether the current baseline is honest
- whether goals and non-goals are clear
- whether closure gates are real
- whether hidden dependencies or unresolved requirement gaps remain
- whether any in-scope defect or contract gap was silently downgraded
- whether task routing and recorded skill usage are honest, necessary, and matched to the owner docs
- whether the backlog or context was loosened by AI without human confirmation or human-approved owner-doc evidence
- whether stale-doc or legacy-mode conflicts were classified before implementation
- whether proof and verification cover every acceptance criterion

Severity levels: `blocker` (format violation, dishonest closure gate, hidden dependency, downgraded defect), `major` (weak proof strategy, unclear boundary), `minor` (clarity).

Return findings first, ordered by severity.
Severity uses the project scale (see `docs/guides/audit-execution.md` Finding Format And Disposition): `P0` blocker / `P1` major / `P2` minor / `P3` nit — keep the domain calibration above, mapped onto this scale. Every finding also carries why-new (dedup against existing findings, WIs, and bug notes) and a suggested carrier (roadmap WI / fixing plan / ledger row).
Do not praise the plan unless it changes the risk assessment.
Also answer the cold-start question explicitly: could a fresh session execute this plan with chat closed? (see the guide's Cold-Start Continuity rules).

If blocking issues are found, say `needs revision` and list the exact files/sections to change.
If no blocking issue remains, say `passes draft review` and list residual risks if any.
```
