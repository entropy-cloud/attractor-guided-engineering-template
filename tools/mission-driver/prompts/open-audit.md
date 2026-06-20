Read `{{openAuditPrompt}}` **completely** and follow it precisely.

Perform an open-ended adversarial audit on mission `{{missionName}}`. Probe `{{moduleDir}}/` — read code, config, tests, and docs **completely** — for contract drift, dead code, missing error handling, framework-specific anti-patterns, and convention violations per `AGENTS.md` (read it **completely** too).

Write results to `{{auditsDir}}/{{TIMESTAMP}}-open-audit-{{missionName}}.md`. The result file MUST start with:

```
> Audit Status: open
> Audit Type: open-ended
> Mission: {{missionName}}
```

Return results in the following format:
- Issues found: `<AI_STEP_RESULT>issues</AI_STEP_RESULT>`
- Clean: `<AI_STEP_RESULT>clean</AI_STEP_RESULT>`
