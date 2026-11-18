# Mission-Driver Add-On (Optional)

The mission-driver engine is **not installed by default**. Adapted projects get the document system, guides, and skills — the autonomous dev-loop engine is an opt-in add-on for projects that want long-running, multi-session autonomous execution.

## When To Enable

Enable the add-on only when you actually run long autonomous loops:

- work is organized as roadmaps consumed by an engine (draft plan → execute → verify → audit → tick), not only by humans
- you want unattended/overnight runs with crash recovery, supervision, and audit budgets
- multiple missions run concurrently against one repo

If your workflow is interactive (human + agent pairs working plan by plan), you do not need the engine. The standalone workflow/helpers and independent acceptance are described in `roadmap-goal-workflow.md`.

## What The Add-On Consists Of

| Piece | Location (template repo) | Consumer home |
| --- | --- | --- |
| Engine (Node, zero npm deps) | `tools/mission-driver/` | copy into the project (`tools/mission-driver/`) — vendoring is recommended |
| Launcher shim | `template/install/tools/mission-driver.sh` | `tools/mission-driver.sh` |
| Env example | `template/install/.env.example` | `.env` (`MISSION_DRIVER_HOME=<path>`) |
| Mission configs | `template/install/missions/{base,onboarding}.json` | `missions/` |
| Operator guidance | in the engine itself: `tools/mission-driver/CONTEXT.md` + `docs/user-manual.{en,zh}.md` + `./tools/mission-driver.sh --help` | no separate operator skill |
| Structural gates | `tools/mission-driver/src/{gate-check,roadmap-check,mission-check}.mjs` | invoked by the installed hook's add-on sections after the consumer enables hooks |

## Installation

With the installer flag (from a clone of the template repo):

```bash
./install-age.sh /path/to/target "Project Name" --with-mission-driver
```

This **vendors the engine** into `tools/mission-driver/`, copies the shim, env example, mission defaults and the onboarding roadmap, and creates plan directories. The default engine path is target-local, so no sibling checkout is required. Existing `.env` values and custom hooks are preserved; an absent engine-path assignment is appended on a separate line. An existing `MISSION_DRIVER_HOME` assignment remains authoritative and may intentionally point elsewhere. Operator guidance ships with the engine, not a separate operator skill.

Installation records `.age-origin.json` and delivers the standalone read-only `tools/age-drift.mjs`. A nonempty engine with unknown/incompatible origin, or modified/missing/extra engine files, blocks preflight before any target writes. Reinstallation is not an upgrade or profile/add-on reconfiguration command. Full installer safety, source identity, bridge and drift contracts live in the template repository's architecture document titled Template vs Real-Project Boundary; it is not delivered as consumer project architecture.

Inspect from the consumer root without model credentials:

```bash
./tools/mission-driver.sh --help
./tools/mission-driver.sh list
node tools/mission-driver/src/mission-check.mjs missions/onboarding.json .
node tools/age-drift.mjs
```

Drift exits `0` unchanged, `1` changed/missing managed files or extra engine files, and `2` unknown/invalid origin or inspection error. It does not overwrite, synchronize or fetch anything. `.env` and other runtime secrets are not recorded or checked. Fill the project context and mission verification commands before any actual mission run; help/list/validation are not business verification.

For a project with an existing plain installation, first inspect a separate clean add-on installation and manually reconcile the desired files. The installer intentionally refuses in-place option changes. A manual integration consists of:

1. Copy `tools/mission-driver/` from the template repo into the target repo (vendored copy).
2. Copy the launcher, env example and mission defaults from the separate installation without overwriting local configuration. Ensure `.env` points at the local engine.
3. Point mission configs at your docs: `roadmapPath` → `docs/roadmaps/<slug>-roadmap.md`, `plansDir` → `docs/plans/<slug>/`, `contextDir` → `docs/context`.
4. Fill `missions/base.json` `commands.*` with your real verification commands.
5. Enable the supplied hook with `git config core.hooksPath .githooks`, or integrate its calls into your existing custom hook. With a local vendored engine, it checks staged-path working-tree plans, roadmaps and missions using the engine's own checkers; legacy/non-ledger documents, `missions/base.json` and its optional `base.local.json` override are outside those sections. Without the add-on it reports a structural-check skip; missing Node also remains fail-open. Missing checkers in an installed engine or checker failures deny the commit. Garbled text remains a diagnostic. A manually integrated engine has no installer-attested origin until a separately reviewed adoption procedure records one; do not fabricate or copy another project's metadata.

## What Changes When Enabled

- Engine operations and enabled add-on hook sections machine-check ledger grammar. Consumer CI remains a project choice; the source repository's consumer-contract workflow is not installed downstream.
- Roadmap `audit-rounds` frontmatter and `## Deep Audit Record` become live (audit budgets).
- `verify: [keys]` in plan frontmatter maps to `missions/base.json` command keys.
- Run state lives in `_tmp/<ts>-mission-driver/` (gitignored); Reflexion memory in `tools/mission-driver/memory/`.

## Discipline

The engine does not replace independent acceptance. The recommended single-plan coordinator procedure, current-payload delivery and actual engine/native compatibility limits are described in `roadmap-goal-workflow.md`; do not equate step names or engine terminal state with that contract.
