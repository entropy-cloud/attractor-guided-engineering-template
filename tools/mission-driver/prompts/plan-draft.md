Draft 1-3 plans TOTAL covering all remaining roadmap items or audit findings. Do NOT draft 1-3 plans per item — ALL items across the entire roadmap (or ALL audit findings) together produce 1-3 plans.

Read `{{planGuide}}` — it defines the plan format, status lifecycle, and review rules. Follow it precisely.

## Workflow

1. **Read & bundle**: Read `{{roadmapPath}}` (or use attached audit findings). Bundle ALL remaining items (or ALL findings) into 1-3 plans TOTAL. Each plan must have sufficient workload; bundle small items together, split a single large item only when it alone justifies multiple plans.

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
