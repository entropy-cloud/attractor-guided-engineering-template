# Mission-Driver Add-On (Optional)

The mission-driver engine is **not installed by default**. Adapted projects get the document system, guides, and skills — the autonomous dev-loop engine is an opt-in add-on for projects that want long-running, multi-session autonomous execution.

## When To Enable

Enable the add-on only when you actually run long autonomous loops:

- work is organized as roadmaps consumed by an engine (draft plan → execute → verify → audit → tick), not only by humans
- you want unattended/overnight runs with crash recovery, supervision, and audit budgets
- multiple missions run concurrently against one repo

If your workflow is interactive (human + agent pairs working plan by plan), you do not need the engine — the ledger format and receipt discipline in `docs/guides/plan-authoring-and-execution.md` already give you the structure, enforced by independent review instead of the parser.

## What The Add-On Consists Of

| Piece | Location (template repo) | Consumer home |
| --- | --- | --- |
| Engine (Node, zero npm deps) | `tools/mission-driver/` | copy into the project (`tools/mission-driver/`) — vendoring is recommended |
| Launcher shim | `template/install/tools/mission-driver.sh` | `tools/mission-driver.sh` |
| Env example | `template/install/.env.example` | `.env` (`MISSION_DRIVER_HOME=<path>`) |
| Mission configs | `template/install/missions/{base,demo,onboarding}.json` | `missions/` |
| Operator skill | `.agents/skills/nop-mission-driver/` | copied with the add-on |
| Structural gates | `tools/mission-driver/src/{gate-check,roadmap-check,mission-check}.mjs` | pre-commit sections (plans/roadmaps/missions) |

## Installation

With the installer flag (from a clone of the template repo):

```bash
./install-age.sh /path/to/target "Project Name" --with-mission-driver
```

This additionally copies the shim, `.env.example`, mission defaults, and the mission-driver skill, and enables the mission-related pre-commit sections.

Manually, after a plain install:

1. Copy `tools/mission-driver/` into the target repo (vendored copy — do **not** point `MISSION_DRIVER_HOME` at a sibling checkout; sibling-relative engine paths are the historically proven breakage mode).
2. Copy `template/install/tools/mission-driver.sh` → `tools/mission-driver.sh`, `template/install/.env.example` → `.env`, `template/install/missions/` → `missions/`.
3. Point mission configs at your docs: `roadmapPath` → `docs/roadmaps/<slug>-roadmap.md`, `plansDir` → `docs/plans/<slug>/`, `contextDir` → `docs/context`.
4. Fill `missions/base.json` `commands.*` with your real verification commands.
5. Enable the plans/roadmaps/missions sections of the pre-commit hook (see `.githooks/pre-commit` in the template repo).

## What Changes When Enabled

- Plan/roadmap ledger grammar becomes machine-checked (pre-commit + CI): frontmatter fields, receipt lines, checkbox counting domains, roadmap `## Work Item Status` milestone grammar.
- Roadmap `audit-rounds` frontmatter and `## Deep Audit Record` become live (audit budgets).
- `verify: [keys]` in plan frontmatter maps to `missions/base.json` command keys.
- Run state lives in `_tmp/<ts>-mission-driver/` (gitignored); Reflexion memory in `tools/mission-driver/memory/`.

## Discipline

The engine enforces the format; it does not replace the rules in the guides. Independent execution/audit subagents, the 2–6-phase sizing, work-item mapping, and the audit-prevention checklist all still apply — the engine only makes their receipts mechanically verifiable.
