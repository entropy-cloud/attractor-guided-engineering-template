If the mission config specifies an open-ended audit prompt (`{{openAuditPrompt}}` is non-empty), read that file and follow it precisely. It defines project-specific anti-patterns, convention rules, and probe areas.

Perform an open-ended adversarial audit on mission `{{missionName}}`. Probe `{{moduleDir}}/` — code, config, tests, and docs — for contract drift, dead code, missing error handling, framework-specific anti-patterns, and convention violations per `AGENTS.md`.

Write results to `{{auditsDir}}/{{TIMESTAMP}}-open-audit-{{missionName}}.md`. The result file MUST start with:

```
> Audit Status: open
> Audit Type: open-ended
> Mission: {{missionName}}
```

Return results in the following format:
- Issues found: `<AI_STEP_RESULT>issues</AI_STEP_RESULT>`
- Clean: `<AI_STEP_RESULT>clean</AI_STEP_RESULT>`
