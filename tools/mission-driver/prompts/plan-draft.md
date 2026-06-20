Draft 1-3 plans covering all remaining roadmap items or audit findings.

Read `{{planGuide}}` — it defines the plan format, status lifecycle, and review rules. Follow it precisely.

## Workflow

1. **Read & bundle**: Read `{{roadmapPath}}` (or use attached audit findings). Bundle ALL remaining items (or ALL findings) into 1-3 plans. Each plan must have sufficient workload; bundle small items, split large ones across plans.

2. **Create drafts**: For each plan, save at `{{plansDir}}/{YYYY-MM-DD-HHmm}-{slug}.md` with:
   ```
   > Plan Status: drafted
   > Package: {{missionName}}
   > Work Item: <label>
   ```

If nothing to draft (roadmap done, no deferred items, no findings), return results in the following format:
```
<AI_STEP_RESULT>nothing</AI_STEP_RESULT>
```

When plans are created, return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

In PLAN_FILE, provide only the first plan path. The engine discovers the rest via scan. All plan files must exist on disk — placeholder paths are rejected.
