Draft 1-3 plans from the remaining roadmap items, also considering deferred items recorded in previous plans. Do NOT try to cover all remaining roadmap items — pick the next 1-3 plans' worth of work.

## Context

Before drafting, read these context files so you understand the project's conventions and the target module's architecture instead of exploring the codebase ad-hoc:

- `{{contextDir}}/project-context.md` — project-wide conventions, build commands, and module map.
- `{{moduleContextFile}}` — the target module's own CONTEXT.md (its architecture, key files, and recent changes). If the path ends with "(不存在)", the module has no dedicated context file — skip it.

Read `{{planGuide}}` **completely**. It defines the plan format, status lifecycle, and review rules. Create every new plan in the **ledger format** (frontmatter + `## Phase <n>` body; completion is derived, `completed` is never written).

## Workflow

1. **Read & bundle**: Read `{{roadmapPath}}` **completely**, then pick the next 1-3 plans' worth of work from remaining items, also considering deferred items from previous plans. Do not cover all remaining items. On a checkbox roadmap, remaining work = unchecked work items (in set order). Deferred-item sources to scan explicitly before drafting:
   - `## Deferred But Adjudicated` sections in any completed or held plan in `{{plansDir}}` — explicit holds with `Successor Required: yes` and a `Next plan: <plan-id>` pointer (or legacy form). Collect every such item; treat each unique `Next plan: <plan-id>` as a planning trigger that must produce one new plan.
   - `Follow-up:` sections under a completed plan's `## Closure` (legacy form, pre-M2 ledger plans) — collect any non-blocking follow-up items.
   Merge these sources with the roadmap's unchecked work items into one ordered work set, dedupe by successor id, and pick the next 1-3 plans' worth from the merged set. The `successor:` inline annotation form from earlier drafts is superseded by `## Deferred But Adjudicated`; do not grep for it.

2. **Order plans**: When drafting multiple plans, assign them an explicit execution order. Plans that unblock others come first.

3. **Create drafts**: For each plan, save at `{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md` where `{N}` is a single-digit sequence number (1, 2, 3...) reflecting the intended execution order. Same-timestamp plans sorted alphabetically by filename determine execution order — the `{N}` prefix ensures this.

   Start every plan with a YAML frontmatter block (before the `#` title):

   ```
   ---
   status: draft
   mission: {{missionName}}
   work-item: <label>
   group: "{YYYY-MM-DD-HHmm}"
   verify: [test]
   ---
   ```

   `work-item` is the roadmap work-item label this plan delivers (e.g. `M2-WI14`); `verify` lists the command keys whose pass lines gate completion (`test` = `{{testCmd}}`; add further keys only if the mission config defines them). Body sections per the guide: `## Current Baseline`, `## Goals`, `## Non-Goals`, `## Phase <n> — <name>` (checkboxes live ONLY inside Phase sections), `## Draft Review Record` (empty, filled by review), `## Verification` and `## Closure` (empty, filled by BUILD_VERIFY / CLOSURE_AUDIT). Do NOT add `> Plan Status:` lines, per-Phase `Status:` lines, or a `## Closure Gates` section — those are retired legacy constructs (consistency/verification/independence guarantees are derived by the completion formula).

4. **Keep drafts as drafts — review is dispatched, never self-assigned**: After drafting, leave every plan at frontmatter `status: draft`. The review is dispatched by the supervisor (policy `triggers:` — `plan.status=draft ∧ review-dispatch-missing` → an INDEPENDENT reviewer agent) or by the engine's REVIEW_PLANS step; the dispatch `review` line in `## Draft Review Record` is written by the dispatcher, not by you. You must NOT self-dispatch a sub-agent review, NOT write any dispatch/conclusion line into `## Draft Review Record`, and NOT set `status: active` yourself — doing so would be denied by the writer-identity gate and reviewed by no one (review independence is structural: the drafter never reviews or promotes their own plan).

## Mission Completion Decision

Do not decide whether the mission is complete. Whether the mission is complete is decided by the engine based on the audit round count, not by you. You only answer one question per run: "is there a plan worth drafting right now?"

In particular: mission-level audit conclusions live inline in the roadmap's `## Deep Audit Record` (and as unchecked remediation work items) — they are NOT separate files in `docs/audits/`. Legacy `docs/audits/` files with `> Audit Status: open` (pre-migration archives) are no longer consumed by any path. The engine decides based on the audit round count whether to enter another deep-audit round or to complete the mission; you cannot influence that decision from this step.

## Result Markers

If there is no plan to draft this round (the roadmap's current todo items are empty and no deferred item is re-triggerable), return:
```
<AI_STEP_RESULT>nothing</AI_STEP_RESULT>
```

When plans are created, return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

In PLAN_FILE, provide only the first (lowest N) plan path. The engine discovers the rest via scan. All plan files must exist on disk — placeholder paths are rejected.

Your output MUST end with exactly one `<AI_STEP_RESULT>` marker — either `nothing` or `created`, with the `<FLOW_VARS>` block only when `created`. This is the only marker that is parsed; a missing or malformed marker triggers an additional correction run, so emit it exactly as shown. Do not emit any other marker value.
