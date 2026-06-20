Generate a mission config file for the mission driver, based on the user request below.

Read `AGENTS.md` **completely** for project structure, tech stack, build commands, and conventions.

The roadmap MUST already exist. Locate it in the project (referenced from AGENTS.md, docs index, or directory scan). If no roadmap is found, return results in the following format and stop: `<AI_STEP_RESULT>failed</AI_STEP_RESULT>` with the reason.

Scan the project to determine correct values. Generate the file at `{{missionsDir}}/{mission-name}.json` and return results in the following format:
```
<AI_STEP_RESULT>created</AI_STEP_RESULT>
<MISSION_FILE>{{missionsDir}}/{mission-name}.json</MISSION_FILE>
```

The mission.json MUST follow this format:
```json
{
  "name": "{mission-name}",
  "description": "{what this mission covers}",
  "flowName": "{flow-name, defaults to mission-driver if omitted}",
  "roadmapPath": "{path/to/roadmap.md}",
  "plansDir": "{path/to/plans-dir}",
  "planGuide": "{path/to/plan-guide.md}",
  "auditsDir": "{path/to/audits-dir}",
  "contextDir": "{path/to/context-dir}",
  "moduleDir": "{path/to/module-or-project-root}",
  "commands": {
    "test": "{test command}",
    "build": "{build command}",
    "lint": "{lint command}",
    "typecheck": "{typecheck command}"
  },
  "prompts": {
    "multiAudit": "{path/to/multi-audit-prompt.md}",
    "openAudit": "{path/to/open-audit-prompt.md}"
  },
  "commitFormat": "{commit message format}"
}
```

Notes:
- `flowName` — custom main flow name; omit to use the built-in `mission-driver` flow. Custom flows are loaded from `missions/flows/<flowName>.json` first, then the tool's built-in `flows/`
- `moduleDir` — the target module or project directory for this mission; audit steps focus on this scope (code, config, tests, docs). Use project root for simple single-module projects
- `prompts.multiAudit` / `prompts.openAudit` — project-specific audit skill prompt files; empty or omitted = skip that audit type
- `commitFormat` — git commit message format hint for BUILD_VERIFY, e.g. `feat(<scope>): <title>` or `imperative mood; reference plan path in footer`
