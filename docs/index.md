# mission-driver AGE Workspace Docs Index

## Purpose

This `docs/` tree is the durable memory and routing surface for `mission-driver` (the in-tree AGE loop engine this repo develops).

- start here before making workflow, requirement, design, or implementation changes
- prefer the smallest file that answers the current question
- keep durable conclusions in files, not only in chat

## Routing Authority

This file is the top-level docs router.

- `docs/index.md` owns navigation and directory responsibilities
- `AGENTS.md` owns agent workflow rules and execution expectations
- `docs/design/` and `docs/architecture/` own the stable project attractor

## Read This First

| If you need to...                                                    | Read this first                                     | Then read                                                                                                                                      |
| -------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand mandatory AI context and current project state            | `docs/context/README.md`                            | `docs/context/project-context.md`, `docs/context/ai-autonomy-policy.md`, `docs/context/codebase-map.md`                                        |
| Understand the lightweight default development workflow              | `docs/process/application-development-workflow.md`  | `AGENTS.md`                                                                                                                                    |
| Choose the next AI-ready work item                                   | `docs/backlog/README.md`                            | `docs/context/ai-autonomy-policy.md`, active requirement and owner doc                                                                         |
| Understand the in-tree tool (mission-driver engine + monitor)        | `tools/mission-driver/CONTEXT.md`                   | `docs/architecture/mission-driver-baseline.md`, `DEVELOPMENT.md`                                                                               |
| Read raw PM, prototype, article, or card-set inputs                  | `docs/input/README.md`                              | the active file in `docs/input/`                                                                                                               |
| Read explanatory methodology articles                                | `docs/articles/README.md`                           | the relevant article under `docs/articles/`                                                                                                    |
| Clarify ambiguous requirements                                       | `docs/discussions/README.md`                        | `docs/requirements/00-requirement-synthesis-guide.md`                                                                                          |
| Route a task before coding                                           | `AGENTS.md`                                         | `docs/skills/README.md`, the relevant owner doc, and `docs/plans/00-plan-authoring-and-execution-guide.md`                                     |
| Decide whether an existing skill applies                             | `docs/skills/README.md`                             | the relevant owner doc and active requirement                                                                                                  |
| Understand the project goal and product shape                        | `docs/architecture/project-vision.md`               | `docs/design/app-overview.md`                                                                                                                  |
| Understand the current app-layer baseline                            | `docs/design/app-overview.md`                       | `docs/design/feature-inventory.md`, `docs/design/roles-and-permissions.md`                                                                     |
| Understand the current technical baseline                            | `docs/architecture/system-baseline.md`              | `docs/architecture/module-boundaries.md`                                                                                                       |
| Understand why this repo has a `template/` subdirectory              | `docs/architecture/template-vs-realproject-boundary.md` | `README.md`, `install-age.manifest`                                                                                                            |
| Understand the DSH plugin form (Mission Control, planned)            | `docs/design/dsh-plugin-integration.md`             | `docs/architecture/dsh-plugin-packaging.md`, `docs/architecture/mission-driver-baseline.md`                                                    |
| Understand the AGE autonomous-run architecture (ledger/law/supervisor/efficiency, supported baseline 2026-08-24)| `docs/design/age-autonomy/00-overview.md`           | `docs/design/age-autonomy/01-file-ledger.md`, `02-rule-law.md`, `03-supervisor.md`, `04-efficiency.md`, `05-usage.md`                             |
| Understand how the DSH plugin packaging is implemented               | `docs/architecture/dsh-plugin-packaging.md`         | `docs/design/dsh-plugin-integration.md`, `tools/mission-driver/EXECUTION-PRINCIPLE.md`                                                         |
| Review the proposed next-generation DSH composition architecture     | `docs/references/dsh-extensibility-directions.md`   | `docs/references/dsh-internals-guide.md`, `docs/architecture/dsh-plugin-packaging.md`                                                          |
| Develop the DSH plugin online (Creator mode + flow customization)    | `docs/process/dsh-plugin-development-guide.md`      | `docs/architecture/dsh-plugin-packaging.md`, `tools/mission-driver/flows/plan-execution.json`                                                  |
| Understand owner-doc precedence and source-of-truth boundaries       | `docs/context/source-of-truth-and-precedence.md`    | the relevant owner doc                                                                                                                         |
| Start or review a non-trivial implementation                         | `AGENTS.md`                                         | `docs/skills/README.md`, `docs/plans/00-plan-authoring-and-execution-guide.md`, the active plan, and `docs/audits/00-audit-execution-guide.md` |
| Review audit workflows or required draft-review/closure-audit rules  | `docs/audits/00-audit-execution-guide.md`           | the relevant prompt in `docs/skills/`                                                                                                          |
| Audit a business state machine for correctness and reachability      | `docs/skills/state-machine-business-review-prompt.md` | the owner doc that defines the state machine                                                                                                 |
| Audit design docs as the app-layer behavior baseline                 | `docs/skills/design-doc-audit-prompt.md`            | `docs/design/README.md`                                                                                                                        |
| Understand which docs should use dated filenames versus stable names | `docs/references/document-naming-and-timeliness.md` | the relevant guide in the target directory                                                                                                     |
| Quickly copy a recommended filename pattern for a new dated document | `docs/references/document-naming-and-timeliness.md` | the `Quick Copy Set` section                                                                                                                   |
| Copy a ready-made dated document skeleton                            | `docs/examples/README.md`                           | rename the closest `.example.md` file                                                                                                          |
| See one realistic small feature walkthrough                          | `docs/examples/complete-small-app-walkthrough.md`   | then copy the closest skeleton from `docs/examples/`                                                                                           |
| Diagnose e2e test failures (Playwright)                              | `docs/references/playwright-e2e-guide.md`           | `playwright.config.ts`                                                                                                                         |
| Check what docs must be updated after a change                       | `docs/references/maintenance-checklist.md`          | the most relevant file in `docs/design/` or `docs/architecture/`                                                                               |
| Review recent implementation history                                 | `docs/logs/index.md`                                | the latest dated log file                                                                                                                      |
| Look up a past subtle regression                                     | `docs/bugs/00-bug-fix-note-writing-guide.md`        | the relevant file in `docs/bugs/`                                                                                                              |
| Record or review exploratory/manual testing                          | `docs/testing/index.md`                             | the relevant dated test note                                                                                                                   |
| Check the latest known-good verification state                       | `docs/testing/known-good-baselines.md`              | latest dated testing or log note                                                                                                               |
| Review tradeoffs or open design investigations                       | `docs/analysis/README.md`                           | the relevant analysis note                                                                                                                     |
| Review durable reusable engineering lessons                          | `docs/lessons/README.md`                            | the relevant numbered lesson                                                                                                                   |
| Read implementation-ready requirements                               | `docs/requirements/README.md`                       | the active requirement file                                                                                                                    |
| Review why a landed result still missed expectation                  | `docs/retrospectives/README.md`                     | the relevant retrospective note                                                                                                                |

## Recommended Default Path

For most small and medium projects, the default path is:

1. `docs/context/`
2. `docs/backlog/` when choosing work
3. `docs/input/`
4. `docs/requirements/`
5. `docs/design/` and `docs/architecture/`
6. route the task and select candidate reusable skills
7. `docs/plans/` when planning triggers apply
8. `docs/audits/` for audit workflow guidance or stored non-trivial audit records
9. `docs/logs/`
10. `docs/bugs/` when needed

Use `docs/discussions/`, extra `docs/testing/` notes, `docs/skills/`, `docs/analysis/`, and `docs/retrospectives/` only when the task complexity or ambiguity justifies them.

## Skill Routing

| If the task is...                       | Read this first                                       | Then decide                                                                                               |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| unclear requirement                     | `docs/requirements/00-requirement-synthesis-guide.md` | whether a requirement file or discussion file is needed first                                             |
| non-trivial implementation              | `AGENTS.md`                                           | which skills are needed per phase or item, then use `docs/plans/00-plan-authoring-and-execution-guide.md` |
| document, plan, or closure verification | `docs/skills/README.md`                               | which audit prompt or review skill applies                                                                |
| repeated known method or review pattern | the relevant owner doc                                | whether an existing skill applies or a new one should be created                                          |

Skills select the work method. They do not replace requirements, design, architecture, or owner-doc routing.

## Domain Quick-Reference (Optional)

This project is a single-domain tool (mission-driver engine + monitor). Multi-domain quick-reference is not maintained. See `docs/architecture/module-boundaries.md` for module-level ownership.

## Directory Roles

- `docs/process/` - workflow and operating process documents
- `docs/context/` - mandatory AI context, owner precedence, and project-wide conventions
- `docs/backlog/` - prioritized candidate work, AI-ready next actions, and an optional roadmap when milestone-level progress is needed
- `docs/input/` - raw external inputs and copied source material
- `docs/discussions/` - optional requirement clarification and unresolved question records
- `docs/requirements/` - synthesized implementation-ready requirement docs
- `docs/design/` - stable app-layer feature and business-flow owner docs
- `docs/architecture/` - stable technical baseline and module-boundary docs
- `docs/lessons/` - durable engineering lessons extracted from repeated issues and recoveries
- `docs/references/` - stable lookup guides and maintenance aids
- `docs/articles/` - outward-facing methodology and explanatory articles
- `docs/examples/` - small copyable skeletons for dated working documents
- `docs/plans/` - execution plans with closure criteria
- `docs/audits/` - audit methods and optional stored audit records
- `docs/skills/` - optional reusable AI prompts and audit/review playbooks
- `docs/logs/` - dated implementation memory
- `docs/testing/` - optional exploratory and manual testing notes
- `docs/bugs/` - complex regression history and root-cause notes
- `docs/analysis/` - optional investigations, comparisons, and design tradeoffs
- `docs/retrospectives/` - optional post-delivery gap analysis and process improvements
- `docs/archive/` - inactive documents moved here by human decision; kept for historical reference

## Core Principle

Use files for durable truth.

- input captures where requirements came from
- context captures mandatory project rules and source-of-truth precedence
- backlog captures prioritized next actions and autonomy labels
- discussions capture what was unclear
- requirements capture what should be built
- design and architecture capture what must stay true
- source-of-truth precedence tells which artifact wins for each question
- plans capture how a non-trivial slice will be closed
- audits capture how claims were challenged
- logs, tests, and bug notes preserve proof and memory
- retrospectives explain why the last iteration still missed the mark

## Naming Rule

- stable owner docs keep stable names
- time-sensitive records should usually include dates
- see `docs/references/document-naming-and-timeliness.md`
