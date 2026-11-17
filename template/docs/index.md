# <project-name> Docs Index

## Purpose

This `docs/` tree is the durable memory and routing surface for `<project-name>`.

- start here before making workflow, requirement, design, or implementation changes
- prefer the smallest file that answers the current question
- keep durable conclusions in files, not only in chat

## Routing Authority

- `docs/index.md` (this file) owns navigation and directory responsibilities
- `AGENTS.md` owns agent workflow rules and task routing
- `docs/design/` and `docs/architecture/` own the stable project attractor

## Read This First

| If you need to... | Read |
| --- | --- |
| Understand mandatory AI context | `docs/context/README.md` → `project-context.md`, `ai-autonomy-policy.md`, `codebase-map.md` |
| Follow the default development workflow | `docs/guides/application-development-workflow.md` |
| Know where a document belongs / how to name it | `docs/guides/doc-organization.md` |
| Choose the next work item | the roadmap in `docs/roadmaps/` + `docs/guides/roadmap-authoring.md` |
| Understand the project goal and product shape | `docs/architecture/project-vision.md` → `docs/design/app-overview.md` |
| Understand the current app-layer baseline | `docs/design/app-overview.md` |
| Understand the current technical baseline | `docs/architecture/system-baseline.md`, `module-boundaries.md` |
| Route a task before coding | `AGENTS.md` Task Routing → `docs/skills/README.md` + the owner doc |
| Start or review a non-trivial implementation | `docs/guides/plan-authoring-and-execution.md` + the active plan |
| Review audit workflows | `docs/guides/audit-execution.md` + the relevant prompt in `docs/skills/common/` |
| Pre-flight a non-trivial change hand-off | `docs/guides/audit-prevention-checklist.md` |
| Clarify a fuzzy requirement | `.agents/skills/nop-grillme/SKILL.md` |
| Read raw external inputs (on demand) | create `docs/input/` per `docs/guides/doc-organization.md` |
| Review tradeoffs or open investigations | `docs/analysis/README.md` |
| Review recent implementation history | `docs/logs/index.md` |
| Look up a past subtle regression | `docs/bugs/` (guide: `docs/guides/bug-fix-note.md`) |
| Review durable lessons | `docs/lessons/README.md` |
| Read implementation-ready requirements | `docs/requirements/README.md` |
| Enable the autonomous engine | `docs/guides/mission-driver-add-on.md` |

## Recommended Default Path

1. `docs/context/`
2. `docs/roadmaps/` when choosing work
3. `docs/requirements/` → `docs/design/` / `docs/architecture/`
4. route the task and select candidate skills
5. `docs/plans/<roadmap-slug>/` when planning triggers apply
6. independent execution → independent closure audit
7. `docs/logs/`, and `docs/bugs/` when needed

## Directory Roles

Default skeleton:

- `docs/context/` - mandatory AI context and autonomy rules
- `docs/guides/` - how-to guides (normative)
- `docs/roadmaps/` - roadmaps: milestone/work-item status surfaces
- `docs/plans/<roadmap>/` - execution plans with closure criteria
- `docs/requirements/` - synthesized implementation-ready requirements
- `docs/design/` - stable app-layer owner docs
- `docs/architecture/` - stable technical owner docs
- `docs/audits/` - stored audit records
- `docs/analysis/` - investigations and tradeoffs
- `docs/lessons/` - durable engineering lessons
- `docs/bugs/` - regression history and root-cause notes
- `docs/logs/` - dated implementation memory
- `docs/skills/common/` (+ your shelf) - reusable prompts and playbooks

On-demand (see `docs/guides/doc-organization.md`): `docs/discussions/`, `docs/input/`, `docs/testing/`, `docs/references/`, `docs/retrospectives/`, `docs/examples/`, `docs/archive/`.

## Core Principle

Use files for durable truth: requirements capture what to build; design and architecture capture what must stay true; roadmaps capture what remains; plans capture how a slice closes; audits capture how claims were challenged; logs, tests, and bug notes preserve proof and memory.

## Naming Rule

Stable owner docs keep stable names; time-sensitive records use dated names — see `docs/guides/doc-organization.md`.
