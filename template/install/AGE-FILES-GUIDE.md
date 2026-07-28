# AGE Files Guide — Maintaining Your Workspace

> Read this after `./install-age.sh`. It explains the 88 files you received (one of which is this guide), how each is maintained, and the order to personalize the workspace.
>
> Source: this file ships with the AGE installer. It is reference documentation — keep it in `docs/references/` and update it locally only if your project diverges from the default AGE layout.

## What You Received

The installer copied **88 files** into your project — one of which is this guide (plus created empty runtime directories `docs/plans/{demo,onboarding}/` and `docs/logs/{year}/`). They are not all the same kind — some need your input, some run as-is, some are generated at runtime.

This guide sorts them into **6 maintenance categories (A–F)** so you know exactly what to do with each file.

## Quick Start (do these in order)

1. **Smoke the engine** — `./tools/mission-driver.sh list` confirms the shim + external engine path resolve.
2. **Configure commands** — edit `missions/base.json` → fill `commands.{test,build,lint,typecheck}` for your stack. These drive every `BUILD_VERIFY` step.
3. **Run onboarding** — `./tools/mission-driver.sh run onboarding`. The AI reads your codebase and fills 12 context/architecture files automatically (Category C).
4. **Start feature work** — the 9 requirement/design skeletons (Category D) get filled as you do real requirement/design work. They are intentionally NOT covered by onboarding.

---

## The 6 Maintenance Categories

### A — Engine Infrastructure (7 files) · install-once, rarely touch

These make the mission-driver engine work in your repo. Install drops them in place; you only touch `missions/base.json` to configure commands.

| File | Maintenance |
|---|---|
| `tools/mission-driver.sh` | Do not edit. Thin shim that calls the external engine via `MISSION_DRIVER_HOME`. |
| `missions/base.json` | **Fill `commands.*`** for your stack (test/build/lint/typecheck). Other fields inherit safely. |
| `missions/demo.json`, `missions/onboarding.json` | Do not edit unless you change which roadmap a mission points to. |
| `.opencode/skills/mission-driver/SKILL.md` | Do not edit. Operator skill for the engine. Sync on template upgrades. |
| `.opencode/skills/mission-driver/references/mission-config-schema.md` | Do not edit. mission.json schema reference. |
| `.opencode/skills/mission-driver/references/roadmap-template.md` | Do not edit. Roadmap structure reference. |

### B — One-time Install Config (2 files) · verify then leave

Install already replaced `<project-name>` placeholders. Verify the substitution, then leave alone (or replace `AGENTS.md` with your own contract — many projects do).

| File | Maintenance |
|---|---|
| `.env.example` → `.env` | Copy to `.env`, confirm `MISSION_DRIVER_HOME` points at your local template checkout's `tools/mission-driver/`. |
| `AGENTS.md` | Verify project name substituted. **Many projects replace this entirely** with their own AI contract (e.g. project-specific task leveling, skill gates, verification rules). That is fine — just keep the `docs/context/project-context.md` read-gate so the engine still has its entry point. |

### C — Onboarding Fills (12 files) · run `onboarding` mission once

These are the context/architecture skeletons the **onboarding mission fills automatically** (WI2–WI8 in `docs/backlog/onboarding-roadmap.md`). After onboarding, keep them current as your stack/codebase evolves.

| File | Filled by | What goes here |
|---|---|---|
| `docs/context/project-context.md` | WI2 | Project identity, tech baseline, verification commands, AI block conditions. **This file is the AI entry point** — every flow step reads it first. |
| `docs/context/ai-autonomy-policy.md` | WI3 | Reviewer availability, Protected Areas table (payment/auth/data-deletion…). |
| `docs/context/codebase-map.md` | WI4 | Entry points, common change routes, fragile files. |
| `docs/index.md` | WI5 | Verify no `<project-name>` residue; fill remaining route placeholders. |
| `docs/architecture/README.md` | WI6 | Architecture doc index + pointers to real architecture docs. |
| `docs/architecture/module-boundaries.md` | WI6 | Module/package/domain ownership boundaries. |
| `docs/architecture/project-vision.md` | WI6 | Product direction + non-goals. |
| `docs/architecture/system-baseline.md` | WI6 | Stack, runtime, deployment shape. |
| `docs/process/application-development-workflow.md` | WI7 | Review body for project-specific flow adjustments. |
| `docs/backlog/README.md` | WI7 | First work-item line (or explicit "no active work item"). |
| `docs/testing/known-good-baselines.md` | WI8 | First green baseline row (run real verification, record date/SHA/commands). |
| `docs/backlog/onboarding-roadmap.md` | WI5 | Self: verify project name in title. |

### D — Requirement/Design Phase Fills (9 files) · NOT covered by onboarding

These remain empty skeletons after onboarding. They get filled when you do **real requirement or design work**, not by the onboarding mission. This is intentional — onboarding makes the AI "know the project"; these define "what to build".

| File | When to fill |
|---|---|
| `docs/requirements/product-baseline.md` | Requirement phase — product capabilities + first complete loop. |
| `docs/requirements/product-scope.md` | Requirement phase — users, MVP scope, deferred scope, success metrics. |
| `docs/requirements/mvp.md` | Requirement phase — smallest credible product boundary. |
| `docs/design/app-overview.md` | Design phase — surfaces, navigation, roles, workflows (once features stabilize). |
| `docs/design/roles-and-permissions.md` | Design phase — role model, permissions, visibility rules. |
| `docs/design/flow-overview.md` | Multi-domain projects only — L1 macro flow, L2 state machines, L3 cross-domain rules. Small/single-domain projects may omit. |
| `docs/design/feature-inventory.md` | Once features stabilize — feature map with status and owner doc. |
| `docs/design/domain-design-guidelines.md` | When domain-specific design conventions emerge. |
| `docs/backlog/implementation-roadmap.md` | When a multi-stage implementation is planned. **Small projects may delete this file** (it self-documents as optional). |

### E — As-shipped Methodology (57 files) · use as-is, sync on template upgrade

Generic methodology, guides, prompt templates, and examples. They work the moment they land. You do not need to edit them; sync them manually when you upgrade the AGE template.

| Sub-kind | Examples | Count |
|---|---|---|
| **Directory README / index** | `docs/{context,process,input,requirements,design,architecture,plans,audits,bugs,retrospectives,discussions,analysis,references,skills}/README.md`, `docs/{logs,testing}/index.md` | 12 |
| **Authoring guides** (`00-*-guide.md`) | plan authoring, log writing, bug-fix note, audit execution, testing note, requirement synthesis, input processing, discussion writing, retrospective writing | 9 |
| **Methodology guides** | `docs/references/{implementation-guide, playwright-e2e-guide, document-naming-and-timeliness, maintenance-checklist, age-files-guide}.md`, `docs/architecture/{api-response-conventions, integration-and-transaction-patterns}.md`, `docs/context/{README, conventions, source-of-truth-and-precedence}.md` | 11 |
| **Audit / diagnostic prompts** (`docs/skills/*.md`) | 16 reusable audit/diagnosis prompt templates. Usable as-is; customize when a specific audit context repeats (see `AGENTS.md` Skill Usage Rule). | 16 |
| **Format examples** (`docs/examples/*.md`) | Dated examples of a requirement, discussion, plan, document-audit, retrospective, plus a complete small-app walkthrough. Reference only. | 7 |
| **Empty-layer placeholders** | `docs/{analysis,archive,lessons}/README.md` | 3 |

### F — Runtime Products (not in the 88) · generated by the engine

These are NOT installed — they are created at runtime by the mission-driver flow or by you during development:

| Path | Who writes |
|---|---|
| `docs/plans/{demo,onboarding}/*.md` | `DRAFT_PLANS` step creates plans; `EXECUTE`/`CLOSURE_AUDIT` update them. |
| `docs/plans/{USER}/...` | Your manual plans (if you keep a user-scoped plan dir). |
| `docs/logs/{year}/{month}-{day}.md` | You / `BUILD_VERIFY` (full-green records). Append-only daily dev log. |
| `docs/audits/*.md` | `MULTI_AUDIT` / `OPEN_AUDIT` steps (if enabled); or manual document audits. |
| `docs/backlog/implementation-roadmap.md` (status) | `DRAFT_PLANS`/`EXECUTE` flip work items `todo`→`done`. |

---

## Maintenance At A Glance

| Category | Files | Your action | When |
|---|---|---|---|
| **A** Engine infra | 7 | Configure `base.json` commands; smoke `list` | At install |
| **B** Install config | 2 | Verify `.env` + `AGENTS.md` | At install |
| **C** Onboarding fills | 12 | Run `onboarding` mission | Right after install |
| **D** Req/design fills | 9 | Fill during requirement/design work | When building features |
| **E** As-shipped | 58 | Use as-is; sync on template upgrade | Never (unless upgrading) |
| **F** Runtime products | — | Engine/auto-managed | Continuous |

## How the Engine Finds These Files

The mission-driver flow does not read all 88 files — it reads a small set and routes through `docs/context/project-context.md`:

- **CHECK** reads `git status` only.
- **DRAFT_PLANS / REVIEW_PLANS** read `project-context.md` + the plan guide + roadmap.
- **EXECUTE** reads the plan file + `AGENTS.md` + roadmap.
- **MULTI_AUDIT / OPEN_AUDIT** (if enabled) read the audit-prompt files (`docs/skills/multi-dimensional-audit-prompt.md`, `open-ended-audit-prompt.md`) + architecture docs.

The other context files (`ai-autonomy-policy.md`, `codebase-map.md`, `source-of-truth-and-precedence.md`) are reached via the **Companion Context Files** table in `project-context.md`. Keep that table current so the engine routes correctly.

## When To Sync From Template Upgrades

When you pull a newer AGE template version, re-run `./install-age.sh` — it **skips existing files** (never overwrites your edits). To adopt a template improvement for a file you already customized, diff your version against the template source and merge manually. The categories most likely to receive template improvements:

- **A** (engine skill/schema — follow engine version upgrades)
- **C** (onboarding roadmap coverage — new WI may appear)
- **E** (methodology guides + audit prompts — wording refinements)

Categories B, D, and F are yours; template upgrades rarely touch them.
