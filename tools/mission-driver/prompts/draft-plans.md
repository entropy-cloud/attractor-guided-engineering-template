Read `{{planGuide}}` — it defines the plan format, status lifecycle, and how plans relate to audit findings.

Read all audit result files in `{{auditsDir}}/` that have `Audit Status: open`. Draft 1-3 remediation plans covering ALL findings across all open audit results. Bundle related findings; split only when closure surfaces differ.

## Rules

1. **Status**: Use `> Plan Status: drafted`.
2. **Mark audit as planned**: After drafting, update every source audit result file: change `> Audit Status: open` to `> Audit Status: planned`. This prevents re-processing the same findings.

When plans are created, return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<FLOW_VARS>
  <PLAN_FILE>{{plansDir}}/{YYYY-MM-DD-HHmm}-{slug}.md</PLAN_FILE>
</FLOW_VARS>
```

If nothing to draft (no open audit results with actionable findings), return results in the following format:
```
<AI_STEP_RESULT>nothing</AI_STEP_RESULT>
```
