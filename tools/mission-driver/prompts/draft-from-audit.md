Read `{{planGuide}}` **completely**. It defines the plan format, status lifecycle, and how plans relate to audit findings.

Read all audit result files in `{{auditsDir}}/` that have `Audit Status: open` **completely**. Draft 1-3 remediation plans TOTAL covering ALL findings across all open audit results. Do NOT draft 1-3 plans per audit — ALL open audits combined produce 1-3 plans. Bundle related findings; split only when closure surfaces differ.

## Rules

1. **Order**: When drafting multiple plans, assign them an explicit execution order with `{N}` (single-digit sequence number: 1, 2, 3...). Plans that unblock others come first.

2. **Status**: Use `> Plan Status: draft`.

3. **Mark audit as planned**: After drafting, update every source audit result file: change `> Audit Status: open` to `> Audit Status: planned`. This prevents re-processing the same findings.

4. **Review before active**: For each drafted plan, follow the `Plan Review Rule` in `{{planGuide}}` — use an independent sub-agent (fresh session) to review repeatedly until consensus. **Only change `> Plan Status: draft` to `> Plan Status: active` after consensus is reached**; otherwise leave it `draft`.

When plans are created, return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{N}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

If nothing to draft (no open audit results with actionable findings), return results in the following format:
```
<AI_STEP_RESULT>nothing</AI_STEP_RESULT>
```
