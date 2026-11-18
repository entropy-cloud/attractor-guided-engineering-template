# Attractor-Guided Engineering Template

[中文版本](README.zh.md)

This template is a lightweight application-layer project scaffold for AI-assisted product development.

It is meant for ordinary business applications such as admin systems, portals, workflow apps, dashboards, internal tools, and CRUD-heavy domain products.

It is designed for small and medium-sized projects that already have a technical stack.

It is not a starter app and does not include generated product code. Its purpose is to give a repository enough durable structure for humans and AI to share requirements, owner-doc baselines, plans, verification, and project memory without heavyweight process overhead.

> **Dual-audience repo.** This repository also develops `$MISSION_DRIVER_HOME/` — a Flow DSL engine + Vue 3 monitor dashboard that automates the AGE development loop — using its own AGE workflow (it dogfoods itself). Files at the repo root and under `docs/` are the real-project versions (filled in for mission-driver development). Pristine template copies of the fill-in files live under `template/`. Consumers do not interact with `template/` directly; they run `./install-age.sh` (see "How To Start A New Project" below).

## What AGE Means

AGE means **Attractor-Guided Engineering**.

AGE starts from one question:

What should this repository keep converging toward as humans and AI change it over time?

In this template, an attractor is the stable product, design, and architecture structure an application project should keep returning to during fast AI-assisted iteration.

For application projects, the attractor is carried by a small set of durable owner files:

- `docs/context/` - mandatory project context and source-of-truth rules
- `docs/roadmaps/` - prioritized candidate work and AI-ready next actions
- `docs/requirements/` - implementation-ready requirement interpretation
- `docs/design/` - stable app-layer behavior and feature owner docs
- `docs/architecture/` - stable technical structure and module boundaries

Plans, tests, audits, logs, bug notes, and verification are not the attractor. They are engineering harnesses: local controls that help prove a change moved the repo toward the attractor instead of merely completing a checklist.

A change can pass tests and still fail AGE if it contradicts the owner-doc baseline, hides changed behavior only in a plan, or leaves future sessions unable to recover the current truth from repository files.

## AGE Is Not Just Harness Engineering

Harness-first engineering asks:

- how do we constrain AI?
- how do we verify output?
- how do we audit and remember what happened?

AGE asks a prior question:

- what stable structure should the project keep returning to?

Harnesses such as plans, tests, audits, logs, bug notes, and CI only become meaningful after the attractor exists. They do not define correctness by themselves. They measure, correct, and preserve the repository trajectory against owner-doc baselines.

## AGE Is Not Spec-Driven Development

Spec-driven workflows are useful when behavior changes should be organized as structured spec deltas.

AGE does not force every fact through one spec/change/archive workflow and does not treat one spec tree as the universal source of truth.

In AGE:

- requirements answer what should be built now
- design docs answer current supported app behavior
- architecture docs answer current supported technical structure
- plans answer how a non-trivial slice will close
- tests and audits challenge completion claims
- logs, bugs, and testing notes preserve trajectory memory

Specs can still be useful. They are one possible harness, not the top-level organizing model.

## AGE Is Not A Skill Library

Reusable skills can help execute repeated work methods, but they are not the attractor and they cannot replace project-specific routing.

A large skill library without routing usually becomes structured vibe coding: AI may execute familiar patterns quickly, but it still needs human correction to decide which owner docs matter, which skill applies, and what proof is required.

In AGE, skills are method selectors. They must be routed through:

- `AGENTS.md`
- `docs/index.md`
- active requirements
- owner docs
- plan skill-selection records

If skill selection is ambiguous, an independent subagent or reviewer should choose before implementation. For non-trivial plans, each phase or item should record `Skill: <name>` or `Skill: none`.

## Scope Of This Template

This repository is an AGE template for application-layer projects.

AGE itself is broader than this template. Framework-level projects can also use AGE, but they need project-specific owner docs, guides, routing rules, audit prompts, verification strategy, and review prompts shaped around their own attractor.

Examples of deeper framework-specific AGE practice include:

- [`nop-chaos-flux`](https://gitee.com/canonical-entropy/nop-chaos-flux) - frontend framework and low-code runtime practice with owner-doc precedence, plan closure, audit, bug, log, and AGE methodology
- [`nop-entropy`](https://gitee.com/canonical-entropy/nop-entropy) - backend framework practice with its own normative docs and development-process memory

Do not copy this application template unchanged into a framework-core repository and assume it is enough. Use it as a conceptual starting point, then define the framework's own attractor and guides.

## How This Template Was Made

This template was built by extracting the lightweight parts of the AI development workflow used in existing Nop projects and adapting them for small and medium application teams.

The main references were:

- [`nop-chaos-flux`](https://gitee.com/canonical-entropy/nop-chaos-flux) - owner-doc precedence, plan closure, audit, bug, log, and AGE methodology
- [`nop-chaos-next`](https://gitee.com/canonical-entropy/nop-chaos-next) - application-layer `design/`, `input/`, `logs/`, `bugs`, `skills`, and lightweight project docs practice
- [`nop-entropy`](https://gitee.com/canonical-entropy/nop-entropy) - distinction between normative AI-facing docs and development-process memory

The template was simplified through several review passes:

1. Start with the core AGE file-in/file-out idea.
2. Split raw inputs, requirements, app design, architecture, plans, logs, bugs, and lessons by responsibility.
3. Add dated naming rules for time-sensitive records.
4. Add copyable examples for common dated documents.
5. Move mandatory AI context out of `docs/references/` into `docs/context/`, because agents do not reliably read reference material unless it is part of the entry path.
6. Add explicit AI autonomy, backlog, codebase map, and known-good baseline hooks so AI can choose safe next actions without rediscovering the repo every session.
7. Keep advanced layers such as retrospectives, skills, testing notes, and analysis optional so the template remains usable for small and medium projects.
8. Require independent draft review and closure audit for created plans.
9. Make skill selection explicit in plans so reusable skills do not replace project-specific routing.

Independent review found the template direction useful but warned about two risks: documentation theater and excessive process. The current version addresses those risks by keeping a lean default path and making optional layers explicit.

## First Use

After setup, follow the task-oriented [roadmap/goal workflow](docs/guides/roadmap-goal-execution.md): requirement → roadmap → independent execution/acceptance → one local commit per plan → next item. Goal is a host capability, not a scaffold CLI; the guide covers interactive and optional-engine use.

```bash
# From a clone of this repo, into your new project root:
./install-age.sh /path/to/target-project "Project Name"

# Optional: add the skills shelf matching your project type
./install-age.sh /path/to/target-project "Project Name" --profile frontend   # or: java | all

```

The default install copies the docs skeleton, all guides, the `common` skills shelf, the operational skills (`.agents/skills/git`, `grillme`), the document-hygiene tools, and a fail-open pre-commit hook with standalone plan/roadmap structural checks. The mission-driver engine is NOT part of the consumer distribution.

For a manual fallback flow (no Node) or the full Day-0 checklist, see `START-HERE-after-copy.md` (installed into the target project root).

Do not ask AI to implement features until the Day 0 checklist is complete enough for the first slice.

The most important setup step is filling `docs/context/project-context.md` with real active work and real verification commands — no verification claim may be made while they are placeholders.

## What Problem This Template Solves

Many teams currently do one of these two things:

- paste a large requirement dump into chat and ask AI to generate a whole system
- do loose vibe coding with only partial notes and weak historical records

Both approaches usually drift toward demo-grade output.

This template turns the repo into a durable execution surface with a lean default path:

1. raw input collection
2. requirement synthesis
3. design baseline
4. route the task and select reusable skills when relevant
5. execution plan when planning triggers apply
6. implementation
7. verification
8. closure

For created plans, independent draft review and closure audit are part of the default control loop. See `docs/guides/plan-authoring-and-execution.md` for the detailed status flow, draft-review record format, and closure rules. For more ambiguous or risky work, the template also provides optional document audit, multi-dimensional audit, open-ended audit, retrospective, skill-extraction, and lesson layers.

## What This Template Includes

Default skeleton (created by the copy):

- `AGENTS.md` - operating contract for AI agents: documentation map, task routing, hard rules
- `docs/index.md` - docs router
- `docs/context/` - mandatory AI context (project-context, autonomy policy, codebase map)
- `docs/guides/` - all how-to guides in one place (doc organization, roadmap/plan authoring, audits, logs, requirements, bug notes, audit-prevention checklist, ...)
- `docs/roadmaps/` + `docs/plans/<roadmap-slug>/` - roadmaps and their per-roadmap plan directories
- `docs/requirements/` `docs/design/` `docs/architecture/` - owner docs (what to build / behavior baseline / structure baseline)
- `docs/audits/` `docs/analysis/` `docs/lessons/` `docs/bugs/` `docs/logs/` - timeliness records
- `docs/skills/common/` (+ `frontend/` / `java/` via `--profile`) - reusable method/audit prompts
- `.agents/skills/` - operational skills: `git` (daily git discipline incl. worktree policy), `grillme` (relentless requirement/plan stress-interview)
- `tools/` - standalone document-hygiene checkers (timeliness, references, garbled text)
- `.githooks/pre-commit` - fail-open document hygiene gate

On-demand directories (`docs/discussions/`, `docs/input/`, `docs/testing/`, `docs/references/`, `docs/retrospectives/`, `docs/examples/`, `docs/archive/`) are intentionally NOT pre-created — see `docs/guides/doc-organization.md` for when to create each.

## Mission Driver — Automated Development Loop Engine

`$MISSION_DRIVER_HOME/` is a Flow DSL engine that automates the AGE development loop. It reads `missions/<name>.json`, drives a state machine through health-check → review → execute → draft → deep-audit, and spawns `opencode run` for each AI step.

**This repository is the engine's source of truth.** Consumers do NOT get the engine: it is retired from the consumer distribution (`install-age.manifest` carries no mission-driver entries). Consumers coordinate roadmaps and plans with the standalone helpers; the engine remains an in-repo project here (see `docs/design/age-autonomy/`).

**Core capabilities:**

- **Flow DSL**: Declarative JSON state machine with 5 step types (script/tool/agent/group/subflow), result-driven transitions, and subflow composition
- **Plan system**: Plan lifecycle and review/audit steps; coordinator acceptance and backend compatibility are explained in the workflow guide
- **Roadmap guidance**: `roadmap.md` drives task selection — DRAFT_PLANS reads remaining items and creates 1-3 plans per cycle
- **Reflexion memory**: `analyze` produces postmortems; durable lessons feed back into future runs via `_index.md`
- **Monitor Dashboard**: Vue 3 frontend with run history, log viewer, resource charts, and SSE event streaming
- **Onboarding mission** (shipped to consumers via `install-age.sh`): AI reads the consumer's codebase and fills the copied template docs (`docs/context/*`, `docs/architecture/*`, etc.) with real content

**Quick start (from this repository):**

```bash
# Inspect installation without invoking a model
./tools/mission-driver.sh --help
./tools/mission-driver.sh list

# Personalize (30-60 min): AI reads your codebase, fills the copied docs
./tools/mission-driver.sh run onboarding

# Or, generate a custom mission from a description
./tools/mission-driver.sh draft "Build the component library"

# Run a mission loop
./tools/mission-driver.sh run <mission-name>

# Analyze a completed run
./tools/mission-driver.sh analyze
```

See `$MISSION_DRIVER_HOME/README.md` for full documentation.

## Optional Starter Skeletons

These are on-demand owner-doc shapes for larger or integration-heavy projects. They ship as placeholder skeletons and should be adopted only when the project justifies them; small projects can ignore or delete them.

- `docs/roadmaps/implementation-roadmap.md` (+ `docs/guides/roadmap-authoring.md`) - coarse-grained phase index and global status surface
- `docs/requirements/product-baseline.md` - product baseline and first complete loop
- `docs/design/domain-design-guidelines.md` - domain-to-owner-doc ownership map
- `docs/design/flow-overview.md` - global flow overview (macro flow, state machines, cross-domain rules)
- `docs/architecture/api-response-conventions.md` - shared API response conventions
- `docs/architecture/integration-and-transaction-patterns.md` - external-integration and transaction safety patterns

The skills set also includes two audit methods for recurring high-risk review: `docs/skills/common/design-doc-audit-prompt.md` (design docs as app-layer baseline) and `docs/skills/common/state-machine-business-review-prompt.md` (business state machine correctness and reachability).

## Default Minimal Setup

For most small and medium projects, you only need these to start coding the first small slice:

- `AGENTS.md`
- `docs/index.md`
- `docs/context/`
- `docs/roadmaps/`
- `docs/guides/application-development-workflow.md`
- `docs/input/`
- `docs/requirements/`
- `docs/design/`
- `docs/architecture/`

Trigger-based folders:

- `docs/plans/` when the planning triggers apply
- `docs/audits/` when a non-trivial or reusable audit record should be stored
- `docs/logs/` when a real change lands
- `docs/testing/` when manual or exploratory proof matters
- `docs/bugs/` when a non-obvious bug is fixed or needs memory
- `docs/skills/` when a repeatable method is stable enough to reuse

Created plans require independent draft review before implementation and independent closure audit before completion. The detailed workflow lives in `docs/guides/plan-authoring-and-execution.md`.

Everything else is optional and should be used only when the project complexity justifies it.

The audit prompts and skills shipped in this template are generic defaults. After copying the template, you MUST adjust them to the real project's protected areas, owner-doc structure, deployment model, verification stack, naming conventions, known failure modes, and false-positive tolerance.

## Stable vs Dated Files

The template follows the same basic split used by the existing systems:

- stable owner docs keep stable filenames
- time-sensitive process records usually carry dates

Examples:

- stable: `docs/design/app-overview.md`, `docs/architecture/system-baseline.md`
- dated: `docs/analysis/2026-05-21-0000-topic.md`, `docs/discussions/2026-05-21-0000-topic.md`, `docs/plans/2026-05-21-0000-topic-plan.md`
- year-organized daily records: `docs/logs/YYYY/MM-DD.md`, `docs/testing/YYYY/MM-DD.md`

See `docs/guides/doc-organization.md`.

## Core Principle

Do not push important work through chat alone.

- raw information goes into `docs/input/`
- mandatory context and owner precedence go into `docs/context/`
- prioritized next actions go into `docs/roadmaps/`
- unclear points go into `docs/discussions/`
- settled requirements go into `docs/requirements/`
- stable design decisions go into `docs/design/` and `docs/architecture/`
- execution control goes into `docs/plans/`
- proof and history go into `docs/logs/`, `docs/testing/`, and `docs/bugs/`
- process improvements become `docs/skills/`, `docs/lessons/`, or `docs/retrospectives/`

## How To Start A New Project

1. Clone this repository.
2. Run `./install-age.sh /path/to/your-new-project-root "Project Name"` — copies the curated file set listed in `install-age.manifest` (fill-in files from `template/`, shared methodology guides from root), sed-replaces `<project-name>` in fill-in docs, creates `docs/logs/{year}/`, and updates `.gitignore`. Optional: `--profile frontend|java|all` adds the matching skills shelf. The mission-driver engine is not installable into consumers.
3. Fill `docs/context/project-context.md` with the project's real verification commands (no verification claim may be made while they are placeholders), then let AI personalize the remaining skeleton docs by reading your codebase (see `template/docs/roadmaps/onboarding-roadmap.md`).
4. Put PM notes, prototype links, card-set docs, article extracts, and external references into `docs/input/` (create it when the first material arrives).
5. If the input is still ambiguous, capture clarification in `docs/discussions/` before implementation.
6. Convert settled scope into `docs/requirements/` before asking AI to code.

For a manual fallback (no Node), follow the Day-0 checklist in `START-HERE-after-copy.md` (installed into the target project root by `install-age.sh`).

## What NOT To Copy

Not everything in this template belongs in your project:

- `docs/articles/` — outward-facing articles about AGE methodology. These are the template's own explanatory writing, not project content. Do not copy them into your project.
- `docs/retrospectives/template-design-decisions.md` — the template's own evolution record. Your project should have its own retrospectives but should not carry over the template's history.
- `$MISSION_DRIVER_HOME/` (the engine code) — do not copy this directory. Instead, `install-age.sh` creates a thin `tools/mission-driver.sh` that references the template's `$MISSION_DRIVER_HOME/` via `MISSION_DRIVER_HOME` (see `tools/README.md`). This keeps the engine single-sourced and your project lean.
- The generic skills in `docs/skills/` — these are default templates and MUST be customized after install (see customization note below). Do not keep them unchanged.
- `template/` subdirectory at the repo root — this holds pristine copies of fill-in files for `install-age.sh` to source from. Consumers do not interact with it directly; it stays in this template repo. (If you cloned instead of running `install-age.sh`, simply delete `template/` after copying; the consumer-audience files are already in your target's docs tree.)

Generic guide files (`docs/retrospectives/00-retrospective-writing-guide.md`, `docs/skills/README.md` etc.) can be kept as format references if you plan to use those layers.

## Recommended Execution Pattern

1. Collect raw materials in `docs/input/`.
2. If needed, clarify ambiguity in `docs/discussions/`.
3. Synthesize implementation-ready requirements in `docs/requirements/`.
4. Update stable app design in `docs/design/` and technical baseline in `docs/architecture/`, and make them reference each other where needed instead of mixing both concerns into one file.
5. Route the task and select candidate reusable skills.
6. For work that changes contracts, data/model behavior, auth, integrations, cross-module behavior, spans more than one session, or is more than a very small low-risk edit, create a plan under `docs/plans/`.
7. If skill selection is ambiguous, use an independent subagent or reviewer to choose before implementation.
8. Record `Skill: <name>` or `Skill: none` per relevant phase or item.
9. Audit the plan before implementation.
10. Implement the smallest complete slice.
11. Run verification.
12. Run closure audit for created plans.
13. Update logs and any affected docs.

Use these only when needed:

- `docs/audits/` for document audits and non-trivial stored audit records
- `docs/testing/` for manual or exploratory proof
- `docs/retrospectives/` when prototype and implementation diverged materially
- `docs/skills/` when the same method repeats often enough to justify a reusable prompt
- `docs/lessons/` when a repeatable lesson should outlive a single bug or retrospective

If repeated error patterns keep reappearing, do not stop at prose-only notes. Consider promoting them progressively into reusable audit prompts, checklists, heuristic scripts, static checks, lint rules, CI guards, or codemods, tuned to the copied project's real conventions and false-positive tolerance.

The full workflow is documented in `docs/guides/application-development-workflow.md`.

## Non-Goals

- This template does not prescribe a fixed frontend/backend framework.
- This template does not include generated application code.
- This template does not replace your package manager, lint, test, or CI setup.
- This template does not assume spec-driven development is the only valid artifact workflow.
- This template is not a universal AGE template for framework-core repositories; framework projects need their own domain-specific owner docs and guides.
- This template is not a generic skill library. Skills must be selected through project routing and owner docs.

## Read More

- `docs/articles/from-spec-driven-development-to-attractor-guided-engineering.md`
- `docs/articles/attractor-before-harness-ai-large-scale-development-methodology.md`
- `docs/articles/README.md`

## License

MIT

## 作者微信和微信讨论群

![](https://gitee.com/canonical-entropy/nop-entropy/raw/master/wechat-group.png)

添加微信时请注明：加入Nop平台群

## 微信公众号

![](https://gitee.com/canonical-entropy/nop-entropy/raw/master/wechat-public-account.jpg)
