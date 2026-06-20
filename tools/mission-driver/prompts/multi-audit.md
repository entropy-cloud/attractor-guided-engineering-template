Read `{{multiAuditPrompt}}` **completely** and follow it precisely.

Perform a multi-dimensional audit on mission `{{missionName}}`. Focus on `{{moduleDir}}/` — code, config, tests, and public contracts (exports, API surface). Cross-reference against architecture docs for documented contract drift.

Write results to `{{auditsDir}}/{{TIMESTAMP}}-multi-audit-{{missionName}}.md`. The result file MUST start with:

```
> Audit Status: open
> Audit Type: multi-dimensional
> Mission: {{missionName}}
```

Return results in the following format:
- Issues found: `<AI_STEP_RESULT>issues</AI_STEP_RESULT>`
- Clean: `<AI_STEP_RESULT>clean</AI_STEP_RESULT>`
