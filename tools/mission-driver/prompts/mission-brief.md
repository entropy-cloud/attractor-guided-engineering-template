Generate a concise mission brief that gates the subsequent roadmap + mission.json generation.

Read `AGENTS.md` **completely** for project structure, tech stack, build commands, and conventions. Also read `docs/context/project-context.md` for the module map and validation commands.

## Inputs

- **User goal** (provided in the `## User Goal` section below).
- **flowName**: `{{flowHint}}` (may be empty — empty means the built-in `mission-driver` flow).
- **Target file** (optional): `{{targetFile}}` (project-relative path; may be empty). When non-empty, read this file to ground the brief in the actual code/design being changed.

## Task

Derive a `<slug>` (kebab-case) from the user goal. Produce a brief at `docs/backlog/<slug>-brief.md` with EXACTLY these sections (in order), each as a `##` heading:

1. **目标** — one-to-three sentence statement of what this mission accomplishes.
2. **范围** — bullet list of the in-scope work (files, modules, features).
3. **目标产物(文件)** — bullet list of concrete deliverables (file paths or artifact descriptions). Include the target file from the input when provided.
4. **验收标准** — bullet list of observable, testable acceptance criteria (e.g. "npm test passes", "page renders the new column", "batch job produces the CSV").
5. **模块** — the target module(s) from the project module map (e.g. `module-a`, `module-b`, or `mission-driver`).
6. **依赖** — bullet list of upstream/downstream dependencies (other modules, external services, existing contracts).
7. **非目标** — bullet list of explicitly out-of-scope items to prevent scope creep.

Keep the brief tight — it is a gate, not a design document. Avoid implementation detail; that belongs in the roadmap + plans.

## Output

Write the file to `docs/backlog/<slug>-brief.md` (create the directory if needed). Then return ONLY:

```
<BRIEF_FILE>docs/backlog/<slug>-brief.md</BRIEF_FILE>
```
