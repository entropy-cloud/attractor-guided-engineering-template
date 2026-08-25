Review the drafted plan at `{{forEachItem}}` — read it **completely**.

## Context

For review you need to know the project's conventions and the target module's architecture:

- `{{contextDir}}/project-context.md` — project-wide conventions and module map.
- `{{moduleContextFile}}` — the target module's own CONTEXT.md. If the path ends with "(不存在)", skip it.

Read `{{planGuide}}` **completely**. It defines the plan format, required sections, checklist, and closure evidence rules.

## Review Checklist

1. **Format compliance**: Required sections exist, field names are correct, Phase structure is valid. Ledger (frontmatter) plans follow the new-format body structure (`## Phase <n>` sections, counting-domain discipline); legacy plans follow the legacy template.
2. **Completeness**: Exit Criteria are clear and testable. Execution Plan covers all checklist items.
3. **Scope**: Work item boundaries are clear. No ambiguous "and also..." scope creep.
4. **Closure evidence**: Plan defines what evidence proves completion. Ledger plans: completion is derived (all-checked + `## Verification` pass lines + `## Closure` dispatch/accepted receipts) — the plan must NOT instruct writing `completed`.

## Action

- Fix any Blocker/Major issues directly in the plan file.
- After fixing (or if no issues found), promote the plan — dual mode:
  - Ledger format (frontmatter `status:`): set frontmatter `status: active`. Additionally append your review receipt to the `## Draft Review Record` section (create the section if absent, directly after the last Phase) — two lines, append-only:
    - `- dispatch review #review-<runId>-<plan-file-stem>-<iteration>-<nonce8hex> to <your-session-id>`
    - `- <YYYY-MM-DD>：iteration <n>，共识 <verdict> #review-<runId>-<plan-file-stem>-<iteration>-<same-nonce8hex>`
    (generate a fresh 8-hex nonce for this round; the two lines must share the same id)
  - Legacy format: change `> Plan Status: draft` to `> Plan Status: active`.
- Minor issues may remain — downstream closure audit and deep audit will catch them during/after execution.

### Holding a plan that is not ready (fix-forward, with an escape hatch)

Review is **fix-forward**: normally you resolve issues in place and promote the plan to `active`. But if a **Blocker genuinely cannot be resolved at review time** (e.g. missing upstream decision, ambiguous scope you must not guess), do NOT promote it — dual mode: ledger format → set frontmatter `status: held` and add `hold: "<reason>"`; legacy format → leave `> Plan Status: draft` and add a short `> Review Hold: <reason>` line near the front matter. A held/draft plan is not picked up by execution, so this safely holds it for the next review round or human input — while you still emit the `approved` marker below (the marker reports "review ran", not "every plan is active").

Your output MUST end with exactly one `<AI_STEP_RESULT>approved</AI_STEP_RESULT>` marker. 
