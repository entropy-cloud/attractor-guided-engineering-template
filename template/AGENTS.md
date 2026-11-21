# AGENTS.md

## Project Intent

`<project-name>` uses a lightweight Attractor-Guided Engineering workflow: the repo is the source of truth, chat is a temporary working surface, and every non-trivial change flows through owner docs → roadmap → plan → independent execution → independent audit.

## Documentation Map

| Path | Owns |
| --- | --- |
| `docs/index.md` | top-level docs router |
| `docs/context/` | `project-context.md` identity, stack, real verification commands · `codebase-map.md` entry points, change routing, fragile files · `ai-autonomy-policy.md` autonomy levels, protected areas |
| `docs/guides/` | all how-to guides (normative, current-tense) |
| `docs/roadmaps/` + `docs/plans/<roadmap-slug>/` | milestones + work-item checkboxes · execution plans isolated per roadmap |
| `docs/requirements/` · `docs/design/` · `docs/architecture/` | implementation-ready requirement synthesis · owner docs: app-layer behavior baseline · technical structure baseline |
| `docs/audits/` · `docs/analysis/` · `docs/lessons/` · `docs/bugs/` · `docs/logs/{year}/` | stored audit records (non-trivial only) · investigations, tradeoffs, rejected directions · numbered durable lessons · regression and root-cause notes · append-only daily dev log |
| `docs/skills/common/` (+ your shelf) · `.agents/skills/` | reusable method/audit prompts · operational skills (nop-git, nop-grillme) |
| on-demand: `discussions/ input/ testing/ references/ retrospectives/ examples/ archive/` | created only when first real content exists (`docs/guides/doc-organization.md`) |

## Task Routing

Classify the task before acting; then read the matching guide/owner doc first:

| You are about to... | Read first |
| --- | --- |
| place or name any document | `docs/guides/doc-organization.md` |
| plan or choose the next work | `docs/guides/roadmap-authoring.md` + the roadmap |
| coordinate roadmap/goal execution / accepted-plan delivery | `docs/guides/roadmap-goal-execution.md` |
| write/execute/review/close a plan | `docs/guides/plan-authoring-and-execution.md` |
| run any audit or review | `docs/guides/audit-execution.md` + `docs/skills/README.md` |
| hand off a non-trivial change | `docs/guides/change-handoff-checklist.md` |
| clarify a fuzzy requirement | `.agents/skills/nop-grillme/SKILL.md` |
| commit, rebase, search history | `.agents/skills/nop-git/SKILL.md` |
| process raw input into requirement candidates · synthesize requirements | `docs/guides/input-processing.md` · `docs/guides/requirements-synthesis.md` |
| fix a non-obvious bug | `docs/guides/bug-fix-note.md` |
| write a dated record: log · manual/exploratory testing · discussion | `docs/guides/log-writing.md` · `docs/guides/testing-note.md` · `docs/guides/discussion-writing.md` |
| check which docs to update after a change | `docs/guides/doc-maintenance-checklist.md` |
| look up coding conventions · follow the default workflow | `docs/guides/coding-conventions.md` · `docs/guides/application-development-workflow.md` |

## Hard Rules

1. **File-in, file-out.** Important inputs and outputs live in files, never only in chat.
2. **Route before code.** No jump from feature request to code while scope is unclear; ambiguity first becomes a requirement/discussion file.
3. **Plan when the triggers apply** (contract/data/auth/integration/deployment surfaces, multi-module, multi-session, >5 files, ~200+ lines, staged risk). Plans run 2–6 phases, one result surface; a work item is never spread across multiple plans — split the work item instead.
4. **Independence.** A plan is independently reviewed, executed by an independent subagent, and closure-audited by a different auditor (also distinct from the draft reviewer). Record actual actors in the plan; `node tools/plan-status.mjs --check <plan>` checks receipt pairing/declared independence, not identity authentication. Accepted-plan delivery follows the workflow guide.
5. **Normative docs stay current-tense.** No changelogs, dated sections, or history narration in architecture/design/context/requirements/guides/skills — history goes to `docs/logs/` (enforced by `tools/check-doc-timeliness.mjs` when present).
6. **One fact, one surface.** Work-item status lives only in roadmap checkboxes; plan status only in plan frontmatter; no parallel status ledgers.
7. **Log after significant changes** (`docs/logs/{year}/{month}-{day}.md`, reverse chronological), and update the owning doc in the same change — or record why no update was needed.
8. **Verification is real.** Commands come from `docs/context/project-context.md`; nothing is reported green that was not run; scoped passes are labeled as scoped; placeholders must be filled before any success claim.
9. **Lessons promote**: a repeated error pattern goes lesson → reusable prompt (`docs/skills/`) → check script when it keeps recurring.
10. **Archive is a human decision.** AI never moves files into `docs/archive/`; when a referenced file is missing, check the archive before concluding it does not exist.
11. **Task-document tools.** Read/edit roadmap and plan content through built-in Read/Edit/Write-class tools and their conflict feedback; the workflow guide owns the completion/next-selection procedure.

## Read This First

1. `docs/context/project-context.md`
2. `docs/context/ai-autonomy-policy.md`
3. the active requirement / owner doc and the guide for the task, routed via `docs/index.md` and the table above

## Verification Baseline

Do not assume example commands are valid. Use the real commands in `docs/context/project-context.md`; if blank or placeholder, stop and fill them before reporting any verification result.
