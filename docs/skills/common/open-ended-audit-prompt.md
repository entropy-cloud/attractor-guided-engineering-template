# Open-Ended Audit Prompt

Use this prompt when structured audit checklists may miss hidden problems and the reviewer should actively search for unknown unknowns.

This is a generic default prompt. After copying the template, tune it to the project's real failure history, protected areas, naming conventions, and false-positive tolerance.

```text
Read `AGENTS.md`, `docs/index.md`, the active requirement and owner docs, the active plan if one exists, recent logs, and the live changed code.

Run an open-ended audit. Do not limit yourself to the standard checklist categories if the work suggests deeper risk.

Look for hidden issues such as:
- assumptions that were never written down
- owner-doc gaps
- fake closure or weak proof
- mismatched routing or unnecessary skill use
- brittle code paths that passed narrow verification only by accident
- recurring failure patterns that should have been promoted into reusable checks

Act like an adversarial reviewer looking for what the default process may have missed.

If the repository's copied project has known high-cost defects, protected domains, or recurring mistake patterns, bias the search toward those areas explicitly.

Return findings first, ordered by severity.
If blocking issues are found, say `needs revision` and list the exact hidden risks or missing follow-up artifacts.
If no blocking issue remains, say `passes open-ended audit` and list residual unknowns that still deserve watchfulness.
```
