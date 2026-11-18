# AGE Files Guide — Engine Add-On Workspace

> Read this after `./install-age.sh --with-mission-driver`. It explains what the engine add-on put on top of the default AGE scaffold, how each piece is maintained, and the order to personalize the workspace.
>
> Reference documentation — keep it in `docs/references/`; update locally only if your project diverges from the default AGE layout.

## What The Add-On Added

The default scaffold (docs skeleton, guides, skills, hygiene tools, pre-commit hook) is documented by `docs/guides/doc-organization.md` and `START-HERE-after-copy.md`. The engine add-on additionally delivered:

### A — Engine Infrastructure · install-once, rarely touch

| File | Maintenance |
|---|---|
| `tools/mission-driver.sh` | Do not edit. Thin shim that calls the engine via `MISSION_DRIVER_HOME`. |
| `missions/base.json` | **Fill `commands.*`** for your stack (test/build/lint/typecheck). Other fields inherit safely. |
| `missions/demo.json`, `missions/onboarding.json` | Do not edit unless you change which roadmap a mission points to. |
| `tools/mission-driver/CONTEXT.md` | Operator guidance lives in the vendored engine; no separate operator skill is installed. |

### B — One-time Install Config · verify then leave

| File | Maintenance |
|---|---|
| `.env` (from `.env.example`) | Confirm `MISSION_DRIVER_HOME` points at a real engine copy. **Vendor the engine into your repo** (`tools/mission-driver/`) rather than referencing a sibling checkout — sibling-relative paths are the proven breakage mode. See `docs/guides/mission-driver-add-on.md`. |
| `AGENTS.md` | Verify project name substituted. Replacing it with your own contract is fine — keep the `docs/context/project-context.md` read-gate. |

### C — Onboarding Fills · run the onboarding mission once

Context/architecture skeletons the **onboarding mission fills automatically** (see `docs/roadmaps/onboarding-roadmap.md`): `docs/context/{project-context,ai-autonomy-policy,codebase-map}.md`, `docs/index.md`, `docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md`, `docs/guides/application-development-workflow.md`, `docs/roadmaps/README.md`, `docs/roadmaps/onboarding-roadmap.md` (self-check), and the first verification baseline (record green runs in the dev log; create `docs/testing/` only when you keep durable test notes — see `docs/guides/doc-organization.md`).

### D — Requirement/Design Phase Fills · NOT covered by onboarding

`docs/requirements/{product-baseline,product-scope,mvp}.md`, `docs/design/{app-overview,roles-and-permissions,flow-overview,feature-inventory,domain-design-guidelines}.md`, `docs/roadmaps/implementation-roadmap.md` — filled when you do real requirement/design work. Small projects may delete the ones they do not use.

### E — As-shipped Methodology · use as-is, sync on template upgrade

Everything under `docs/guides/`, `docs/skills/`, plus the architecture conventions docs. They work the moment they land; customize the skills' Project Customization Layers as you learn your project's failure modes.

### F — Runtime Products · generated, not installed

| Path | Who writes |
|---|---|
| `docs/plans/{demo,onboarding}/*.md` | DRAFT_PLANS creates; independent execution/closure-audit steps update. |
| `docs/logs/{year}/{month}-{day}.md` | You / the closure-audit step (full-green records). Append-only. |
| `docs/audits/...` | Stored audit records when a review is non-trivial. |
| roadmap checkboxes | Ticked only by the closure-audit pass of the delivering plan. |

## Quick Start (in order)

1. **Inspect the vendored engine** — confirm `.env` points at the installed `tools/mission-driver/`, then run `./tools/mission-driver.sh --help` and `./tools/mission-driver.sh list`.
2. **Configure commands** — `missions/base.json` → fill `commands.{test,build,lint,typecheck}` for your stack.
3. **Run onboarding** — `./tools/mission-driver.sh run onboarding`. The AI reads your codebase and fills the Category C files.
4. **Start feature work** — Category D skeletons get filled as real requirement/design work happens.

## Maintenance At A Glance

| Category | Your action | When |
|---|---|---|
| A Engine infra | Configure `base.json` commands; smoke `list` | At install |
| B Install config | Verify `.env` + `AGENTS.md`; vendor engine | At install |
| C Onboarding fills | Run `onboarding` mission | Right after install |
| D Req/design fills | Fill during requirement/design work | When building features |
| E As-shipped | Use as-is; sync on template upgrade | Rarely |
| F Runtime products | Engine/auto-managed | Continuous |

## How the Engine Finds These Files

The flow routes through `docs/context/project-context.md` and the mission configs (`roadmapPath` → `docs/roadmaps/…`, `plansDir` → `docs/plans/<slug>/`, `contextDir` → `docs/context`). Keep those pointers valid if you rename anything. Audit prompts are read from `docs/skills/common/`.

## When To Sync From Template Upgrades

Reinstallation is not an updater: changed source/options or conflicting managed files are refused before writes. Inspect a separate clean installation, compare against your local files, and reconcile upgrades manually. Run `node tools/age-drift.mjs` for read-only local drift. Installation/provenance and hook behavior follow `docs/guides/mission-driver-add-on.md`.
