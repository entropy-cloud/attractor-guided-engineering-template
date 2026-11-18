# Start Here After Copy

> Manual fallback for environments without Node. The primary flow is `./install-age.sh /path/to/target "Project Name"` from a clone of the template repo (add `--profile frontend|java|all` for the skills shelf, `--with-mission-driver` for the engine add-on).

Do this before asking AI to implement features.

## Required Before First AI Coding

1. **Fill `docs/context/project-context.md`** — project identity, stack, and the REAL verification commands. As long as these are placeholders, no verification claim may be made (AGENTS.md Verification Baseline).
2. **Fill `docs/context/codebase-map.md`** — entry points and change routing.
3. **Adjust `docs/context/ai-autonomy-policy.md`** — autonomy levels and protected areas for your project.
4. **Read `docs/guides/doc-organization.md`** — the directory map, naming rules, and the normative/timeliness separation. Everything else assumes it.
5. **Wire the pre-commit hook**: `git config core.hooksPath .githooks` (fail-open: no Node → skipped).
6. **Prune the skills shelves** (`docs/skills/`) to what you will actually use, and customize the remaining prompts' Project Customization Layer sections.

## Recommended Next

- Follow `docs/guides/roadmap-goal-execution.md` for requirement → roadmap → host/agent execution → independent acceptance → one local delivery commit per plan. It also covers research/audit work and pending edits while an agent runs.
- Write the first roadmap under `docs/roadmaps/` (guide: `docs/guides/roadmap-authoring.md`) and create its `docs/plans/<slug>/` directory.
- Skim `docs/guides/change-handoff-checklist.md` — it encodes the historical audit findings this template is designed to prevent.
- If you want unattended autonomous loops, enable the engine add-on per `docs/guides/mission-driver-add-on.md` (not installed by default).

## On-Demand Directories

`docs/discussions/`, `docs/input/`, `docs/testing/`, `docs/references/`, `docs/retrospectives/`, `docs/examples/`, `docs/archive/` are NOT created by the copy. Create them when the first real content exists (rules in `doc-organization.md`). Empty shells are the historical root of "template does not match my project".
