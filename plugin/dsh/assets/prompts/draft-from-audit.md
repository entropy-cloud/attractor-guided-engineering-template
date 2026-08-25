Read `{{planGuide}}` **completely**. It defines the plan format, status lifecycle, and how plans relate to audit findings. Create every new plan in the **ledger format** (frontmatter + `## Phase <n>` body; `completed` is never written — see the drafting step below).

Audit findings reach you through TWO channels — handle both:

- **Legacy open audit files** (pre-migration archives): files in `{{auditsDir}}/` that have `Audit Status: open`. Read them **completely**. Each finding is priority-tagged `[P0]` / `[P1]` / `[P2]` (see the audit prompts). After processing, close each one: an audit that contributed a `P0`/`P1` finding to a drafted plan → change `> Audit Status: open` to `> Audit Status: planned`; an audit whose findings are all `P2` → move its `P2` items to the follow-up backlog and change its status to `> Audit Status: triaged`.
- **Inline deep-audit findings** (current channel): mission-level audit conclusions are recorded inline in the roadmap's `## Deep Audit Record`, and remediation findings land as unchecked work items on the roadmap. If the roadmap carries unchecked deep-audit work items that have no plan yet, draft remediation plans for their `P0`/`P1`-grade items exactly as below (tick the roadmap work item only at its plan's closure, per the roadmap discipline). This channel has no audit file to close — the roadmap checkbox IS the closing mechanism.

**Drafting gate — only `P0`+`P1` warrant plans:**

- Collect the `P0` and `P1` findings across ALL open sources. Draft 1-3 remediation plans TOTAL covering ALL those `P0`+`P1` findings (NOT 1-3 per source). Bundle related findings; split only when closure surfaces differ. `P0`/`P1` are non-degradable: each must land in a plan as a `Fix` item.
- `P2` findings do NOT get their own plan. Append them to a `## Follow-up Backlog` section (create if absent) in the mission roadmap or an audit-followups note under `{{backlogDir}}`, each with its source so it stays traceable.

## Rules

1. **Order**: When drafting multiple plans, assign them an explicit execution order with `{N}` (single-digit sequence number: 1, 2, 3...). Plans that unblock others come first.

2. **Status**: Every new plan starts as ledger format — YAML frontmatter `status: draft` plus `mission` / `work-item` / `group` / `verify: [test]` fields (see `{{planGuide}}`). Do NOT add `> Plan Status:` lines, per-Phase `Status:` lines, or `## Closure Gates`.

3. **Close every legacy source audit** after processing (prevents re-processing the same findings next round) — the legacy `> Audit Status:` transitions are listed in the channel description above. `triaged` is a terminal, non-open state: it is NOT counted by `openAudits()`.

4. **Review before active**: For each drafted plan, follow the `Plan Review Rule` in `{{planGuide}}` — use an independent sub-agent (fresh session) to review repeatedly until consensus. **Only change frontmatter `status: draft` to `status: active` after consensus is reached** (the reviewer also appends the `## Draft Review Record` receipt lines); otherwise leave it `draft`.

When plans are created (at least one `P0`/`P1` finding existed), return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

If nothing to draft (no open source has any `P0`/`P1` finding — i.e. all open audits are clean or `P2`-only, now marked `triaged`, and the roadmap has no unplanned deep-audit work items), return results in the following format:
```
<AI_STEP_RESULT>nothing</AI_STEP_RESULT>
```

Your output MUST end with exactly one `<AI_STEP_RESULT>` marker (`created` with the `<FLOW_VARS>` block, or `nothing`). This is the only marker that is parsed; a missing or malformed marker triggers an additional correction run, so emit it exactly as shown.
