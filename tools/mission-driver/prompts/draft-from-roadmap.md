Draft 1-3 plans from the remaining roadmap items, also considering deferred items recorded in previous plans. Do NOT try to cover all remaining roadmap items — pick the next 1-3 plans' worth of work.

## Context

Before drafting, read these context files so you understand the project's conventions and the target module's architecture instead of exploring the codebase ad-hoc:

- `{{contextDir}}/project-context.md` — project-wide conventions, build commands, and module map.
- `{{moduleContextFile}}` — the target module's own CONTEXT.md (its architecture, key files, and recent changes). If the path ends with "(不存在)", the module has no dedicated context file — skip it.

Read `{{planGuide}}` **completely**. It defines the plan format, status lifecycle, and review rules.

## Workflow

1. **Read & bundle**: Read `{{roadmapPath}}` **completely**, then pick the next 1-3 plans' worth of work from remaining items, also considering deferred items from previous plans. Do not cover all remaining items.

2. **Order plans**: When drafting multiple plans, assign them an explicit execution order. Plans that unblock others come first.

3. **Create drafts**: For each plan, save at `{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md` where `{N}` is a single-digit sequence number (1, 2, 3...) reflecting the intended execution order. Same-timestamp plans sorted alphabetically by filename determine execution order — the `{N}` prefix ensures this.
   ```
   > Plan Status: draft
   > Mission: {{missionName}}
   > Work Item: <label>
   ```

4. **Review before active**: For each drafted plan, follow the `Plan Review Rule` in `{{planGuide}}` — use an independent sub-agent (fresh session) to review repeatedly until consensus. **Only change `> Plan Status: draft` to `> Plan Status: active` after consensus is reached**; otherwise leave it `draft`.

If nothing to draft (roadmap done, no deferred items), return results in the following format:
```
<AI_STEP_RESULT>nothing</AI_STEP_RESULT>
```

The engine will decide when the mission is fully complete based on DEEP_AUDIT visit rounds — do NOT return `done` here.

When plans are created, return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

In PLAN_FILE, provide only the first (lowest N) plan path. The engine discovers the rest via scan. All plan files must exist on disk — placeholder paths are rejected.

Your output MUST end with exactly one `<AI_STEP_RESULT>` marker (`nothing` or `created`, with the `<FLOW_VARS>` block only when `created`). This is the only marker that is parsed; a missing or malformed marker triggers an additional correction run, so emit it exactly as shown.
