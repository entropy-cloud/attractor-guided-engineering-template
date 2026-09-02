Review the drafted plan at `{{forEachItem}}` — read it **completely**.

## Context

For review you need to know the project's conventions and the target module's architecture:

- `{{contextDir}}/project-context.md` — project-wide conventions and module map.
- `{{moduleContextFile}}` — the target module's own CONTEXT.md. If the path ends with "(不存在)", skip it.

Read `{{planGuide}}` **completely**. It defines the plan format, required sections, checklist, and closure evidence rules.

## Issue Classification

- **Blocker**: content issues that make the plan unexecutable — unclear exit criteria, scope creep, missing closure evidence, ambiguous decisions, incomplete baseline inventory. These must be fixed before promotion.
- **Minor**: format/style issues — missing optional sections, inconsistent heading capitalization, wording. These may remain; downstream audit will catch them.

Format compliance means the rules enforced by `plan-check.mjs` and the plan guide's Minimum Rules — not every section in the template example. Template sections are examples, not requirements.

## Review Workflow

1. **Read all context** (project-context, plan guide, module context if exists).
2. **Scan the plan once** and list ALL issues (both format and content) — do NOT fix anything yet.
3. **Fix all issues in one pass** — Blockers first, then Minor if trivial.
4. **Verify** — run `node tools/mission-driver/src/plan-check.mjs <plan> --strict` if available, or manually confirm the fixes are correct.
5. **Promote** — dual mode:
   - Ledger format (frontmatter `status:`): set frontmatter `status: active`. Additionally append your review receipt to the `## Draft Review Record` section (create the section if absent, directly after the last Phase) — two lines, append-only:
     - `- dispatch review #review-<runId>-<plan-file-stem>-<iteration>-<nonce8hex> to <your-session-id>`
     - `- <YYYY-MM-DD>：iteration <n>，共识 <verdict> #review-<runId>-<plan-file-stem>-<iteration>-<same-nonce8hex>`
     (generate a fresh 8-hex nonce for this round; the two lines must share the same id)
   - Legacy format: change `> Plan Status: draft` to `> Plan Status: active`.

### Holding a plan that is not ready (fix-forward, with an escape hatch)

Review is **fix-forward**: normally you resolve issues in place and promote the plan to `active`. But if a **Blocker genuinely cannot be resolved at review time** (e.g. missing upstream decision, ambiguous scope you must not guess), do NOT promote it — dual mode: ledger format → set frontmatter `status: held` and add `hold: "<reason>"`; legacy format → leave `> Plan Status: draft` and add a short `> Review Hold: <reason>` line near the front matter. A held/draft plan is not picked up by execution, so this safely holds it for the next review round or human input — while you still emit the `approved` marker below (the marker reports "review ran", not "every plan is active").

Your output MUST end with exactly one `<AI_STEP_RESULT>approved</AI_STEP_RESULT>` marker. 
