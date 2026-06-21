Draft 1-3 plans from the remaining roadmap items, also considering deferred items recorded in previous plans. Do NOT try to cover all remaining roadmap items — pick the next 1-3 plans' worth of work.

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

When plans are created, return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

In PLAN_FILE, provide only the first (lowest N) plan path. The engine discovers the rest via scan. All plan files must exist on disk — placeholder paths are rejected.
