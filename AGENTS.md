# AGENTS.md

## Project Intent

`mission-driver (self-hosting AGE workspace)` uses a lightweight Attractor-Guided Engineering workflow: the repo is the source of truth, chat is a temporary working surface, and every non-trivial change flows through owner docs → roadmap → plan → independent execution → independent audit.

This repo is dual-audience: a real project (the mission-driver engine's home, developed with its own workflow) and the source of the AGE template. For consumers the engine is an optional add-on — see `docs/guides/mission-driver-add-on.md`.

## Documentation Map

| Path | Owns |
| --- | --- |
| `docs/index.md` | top-level docs router |
| `docs/context/project-context.md` | identity, stack, real verification commands |
| `docs/context/codebase-map.md` | entry points, change routing, fragile files |
| `docs/context/ai-autonomy-policy.md` | autonomy levels and protected areas |
| `docs/guides/` | all how-to guides (normative, current-tense) |
| `docs/roadmaps/` | roadmaps: milestones + work-item checkboxes |
| `docs/plans/<roadmap-slug>/` | execution plans, isolated per roadmap |
| `docs/requirements/` | implementation-ready requirement synthesis |
| `docs/design/` | app-layer owner docs (behavior baseline) |
| `docs/architecture/` | technical owner docs (structure baseline) |
| `docs/audits/` | stored audit records (non-trivial ones) |
| `docs/analysis/` | investigations, tradeoffs, rejected directions |
| `docs/lessons/` | numbered durable lessons |
| `docs/bugs/` | regression and root-cause notes |
| `docs/logs/{year}/` | daily dev log (append-only) |
| `docs/skills/{common,frontend,java}/` | reusable method/audit prompts |
| `.agents/skills/` | operational skills (nop-git, nop-grillme) |
| on-demand: `discussions/ input/ testing/ references/ retrospectives/ examples/ archive/` | created only when first real content exists (`docs/guides/doc-organization.md`) |

## Task Routing

Classify the task before acting; then read the matching guide/owner doc first:

| You are about to... | Read first |
| --- | --- |
| place or name any document | `docs/guides/doc-organization.md` |
| plan or choose the next work | `docs/guides/roadmap-authoring.md` + the roadmap |
| coordinate roadmap/goal execution and accepted-plan delivery | `docs/guides/roadmap-goal-workflow.md` |
| write/execute/review/close a plan | `docs/guides/plan-authoring-and-execution.md` |
| run any audit or review | `docs/guides/audit-execution.md` + `docs/skills/README.md` |
| hand off a non-trivial change | `docs/guides/audit-prevention-checklist.md` |
| clarify a fuzzy requirement | `.agents/skills/nop-grillme/SKILL.md` |
| commit, rebase, search history | `.agents/skills/nop-git/SKILL.md` |
| synthesize requirements | `docs/guides/requirements-synthesis.md` |
| fix a non-obvious bug | `docs/guides/bug-fix-note.md` |
| write the daily log | `docs/guides/log-writing.md` |
| record a requirement clarification discussion | `docs/guides/discussion-writing.md` |
| process raw external input into requirement candidates | `docs/guides/input-processing.md` |
| record manual/exploratory testing | `docs/guides/testing-note.md` |
| check which docs to update after a change lands | `docs/guides/maintenance-checklist.md` |
| look up coding conventions | `docs/guides/coding-conventions.md` |
| follow the default development workflow | `docs/guides/application-development-workflow.md` |
| run the engine (if enabled) | `docs/guides/mission-driver-add-on.md` — operator guidance lives in the vendored engine itself (`tools/mission-driver/CONTEXT.md`, `docs/user-manual.*.md`) |

## Hard Rules

1. **File-in, file-out.** Important inputs and outputs live in files, never only in chat.
2. **Route before code.** No jump from feature request to code while scope is unclear; ambiguity first becomes a requirement/discussion file.
3. **Plan when the triggers apply** (contract/data/auth/integration/deployment surfaces, multi-module, multi-session, >5 files, ~200+ lines, staged risk). Plans run 2–6 phases, one result surface; a work item is never spread across multiple plans — split the work item instead.
4. **Independence.** A created plan is independently reviewed, executed by an independent subagent and accepted by a different closure auditor (also distinct from the draft reviewer). Record actual actors in the plan; `node tools/plan-status.mjs --check <plan>` checks receipt pairing/declared independence, not identity authentication. Follow the workflow guide for accepted-plan delivery.
5. **Normative docs stay current-tense.** No changelogs, dated sections, or history narration in architecture/design/context/requirements/guides/skills — history goes to `docs/logs/` (enforced by `tools/check-doc-timeliness.mjs`).
6. **One fact, one surface.** Work-item status lives only in roadmap checkboxes; plan status only in plan frontmatter; no parallel status ledgers.
7. **Log after significant changes** (`docs/logs/{year}/{month}-{day}.md`, reverse chronological), and update the owning doc in the same change — or record why no update was needed.
8. **Verification is real.** Commands come from `docs/context/project-context.md`; nothing is reported green that was not run; scoped passes are labeled as scoped; placeholders must be filled before any success claim.
9. **Lessons promote**: a repeated error pattern goes lesson → reusable prompt (`docs/skills/`) → check script when it keeps recurring.
10. **Archive is a human decision.** AI never moves files into `docs/archive/`; when a referenced file is missing, check the archive before concluding it does not exist.
11. **Task-document tools.** Read/edit roadmap and plan content through built-in Read/Edit/Write-class tools and their conflict feedback; the workflow guide owns the completion/next-selection procedure.

## Read This First

1. `docs/context/project-context.md`
2. `docs/context/ai-autonomy-policy.md`
3. the active requirement / owner doc for the task (routed via `docs/index.md`)
4. the guide matching your task (table above)

## Verification Baseline

Do not assume example commands are valid. Use the real commands in `docs/context/project-context.md`; if blank or placeholder, stop and fill them before reporting any verification result.
