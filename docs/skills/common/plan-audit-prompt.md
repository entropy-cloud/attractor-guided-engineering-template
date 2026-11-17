# Plan Audit Prompt

Use this prompt when independently reviewing an execution plan before implementation.

All created plans require this review.

```text
Read `AGENTS.md`, `docs/index.md`, `docs/guides/application-development-workflow.md`, the active requirement/design docs, and the active file under `docs/plans/`.

Audit the plan as an execution contract.

Check `docs/context/ai-autonomy-policy.md` reviewer availability. Cold replay is not a second reviewer and never approves protected areas, unresolved product risk, or source-of-truth conflicts.

Focus on:
- whether the current baseline is honest
- whether goals and non-goals are clear
- whether closure gates are real
- whether hidden dependencies or unresolved requirement gaps remain
- whether any in-scope defect or contract gap was silently downgraded
- whether task routing and recorded skill usage are honest, necessary, and matched to the owner docs
- whether the backlog or context was loosened by AI without human confirmation or human-approved owner-doc evidence
- whether stale-doc or legacy-mode conflicts were classified before implementation
- whether proof and verification cover every acceptance criterion

Return findings first, ordered by severity.
Do not praise the plan unless it changes the risk assessment.

If blocking issues are found, say `needs revision` and list the exact files/sections to change.
If no blocking issue remains, say `passes draft review` and list residual risks if any.
```
