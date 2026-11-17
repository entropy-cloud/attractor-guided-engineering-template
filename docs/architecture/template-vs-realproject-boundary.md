# Template vs Real-Project Boundary

This document is the architecture truth for why this repository has a `template/` subdirectory and how the template/real-project audiences are separated. It exists to prevent re-litigating the same structural question.

## Context

This repo has a dual identity:

1. **As a real project** — it develops `$MISSION_DRIVER_HOME/` using its own AGE workflow + mission-driver itself.
2. **As a template** — consumers run `./install-age.sh /path/to/target "Project Name"` from a clone of this repo to bootstrap a new AGE project.

Root context describes the real project; pristine consumer fill-in files live under `template/`. The separation keeps project-specific content out of consumer installations.

## The Boundary

| Surface | Owner | Notes |
| --- | --- | --- |
| **Repo root** (`AGENTS.md`, `README.md`, `README.zh.md`, `DEVELOPMENT.md`, `install-age.sh`, `install-age.manifest`) | **Real project** | opencode auto-loads root `AGENTS.md` at every session start (opencode convention). These files describe this repo's own development of mission-driver. |
| **Root `docs/` (shared methodology)** | **Shared (template + real project)** | The manifest selects shared guides, prompts and directory indexes. The skills registry is rendered for the installed profile; optional prompt paths are not advertised as installed files. On-demand/reference/article directories are not copied wholesale. |
| **Root `docs/` (real-project filled)** | **Real project** | Context, architecture baseline, roadmaps index and docs router describe mission-driver; their consumer equivalents come from `template/`. |
| **`template/` subdirectory** | **Template** | Pristine fill-in files (`AGENTS.md`, `docs/index.md`, context×3, design×2, architecture×4, roadmaps×3) + the consumer install kit under `template/install/` (engine add-on artifacts + consumer pre-commit hook) + `START-HERE-after-copy.md` (manual fallback). Consumers receive these via `install-age.sh`. |
| **`$MISSION_DRIVER_HOME/`** | **Real project (add-on for consumers)** | `--with-mission-driver` vendors the engine and its operator docs into the consumer, plus launcher/env/mission defaults. No sibling checkout is required. See `docs/guides/mission-driver-add-on.md`. |
| **`tools/install-age.mjs` + `install-age.manifest`** | **Shared** | Node ≥18, zero npm dependencies. Shell and Windows launchers delegate to this installer. Manifest entries support explicit destination overrides and gating flags. |
| **Consumer workflow helpers** | **Shared** | `consumer-ledger.mjs`, `plan-status.mjs` and `commit-plan.mjs` ship without the engine; their usage/compatibility contract is `docs/guides/roadmap-goal-workflow.md`. Engine files are vendored only with the add-on, not silently borrowed as reference-only dependencies. |

## What `install-age.sh` Does (Consumer Flow)

1. Validate CLI choices and manifest grammar/flags/paths, then select entries. Profiles are `none` (default/common only), `frontend`, `java`, and `all`. Unknown options, missing profile values, extra positionals and unknown profiles fail visibly.
2. Read every selected required source and render its expected bytes before any target write. Missing sources, duplicate/reserved destinations, escaping paths and symlink traversal fail preflight. This is not a transactional filesystem or concurrent-writer guarantee: later I/O failures still require inspection.
3. Use the explicit destination, or strip the leading `template/`. Personalize template Markdown and explicit `fill` entries with literal project-name substitution; replacement metacharacters have no special meaning. Shared prose retains literal placeholders.
4. Render the skills registry from the canonical `docs/skills/README.md`: selected shelf entries are installed; other shelves are optional and have no unavailable prompt-path rows. Require exact registry/delivered-prompt parity.
5. On first adoption, copy missing scaffold files and preserve/report conflicting existing custom files and hooks. Do not record preserved conflicts as managed files. Registry or pi-mirror conflicts block the whole install because they would misrepresent delivered capabilities. Directories in place of required files also block.
6. With the engine add-on, preflight the complete engine inventory before any target writes; then vendor files, excluding `.git` and `node_modules`. Ensure `.env` has a separate `MISSION_DRIVER_HOME` assignment without rewriting an existing assignment, including `export` syntax. When existing content has no final newline, insert a separator before the appended line. Existing external engine paths remain the consumer's choice, not a standalone-install guarantee.
7. Create log/engine plan directories, ensure `.gitignore` entries, and write minimal origin metadata. No hooks are enabled automatically.

Manifest gates are `mdh-only`, `profile-frontend`, `profile-java`, and `pi-only`. Transformation flags are `exec`, `fill`, and `rel-mdh`.

## Pi File Bridge

`--pi` mirrors canonical operational skill files from `.agents/skills/` into `.pi/skills/`, independent of the engine flag. Both sets must have matching delivered paths/content; the mirror is derived, never independently maintained. Existing consumer canonical skill bytes are the input on first adoption. A conflicting existing mirror blocks without writes. No engine operator skill is delivered.

The inspected Pi discovery source is [skills.ts at 25cc5c7](https://github.com/badlogic/pi-mono/blob/25cc5c7bf4cbc76b2e134c729eb8d57d521ed749/packages/coding-agent/src/core/skills.ts): its default project scan uses the configured project directory's skills subdirectory, discovers `SKILL.md` recursively and requires a description; duplicate declared names keep the first skill and emit a collision diagnostic. See the [Pi skills documentation](https://github.com/badlogic/pi-mono/blob/25cc5c7bf4cbc76b2e134c729eb8d57d521ed749/packages/coding-agent/docs/skills.md). The installer promises file delivery/parity only, not host loading, trust approval or an external runner execution mode. Hosts which scan both canonical and mirrored directories may diagnose duplicate names; use one discovery location in that host's configuration.

## Origin And Read-Only Drift

The consumer's `.age-origin.json` holds schema version, source-content hash, selected options and managed relative-path SHA-256 digests. Source identity hashes installer/manifest and selected source bytes/mappings; it does not depend on checkout location or a clean Git tree. Managed digests describe installed, personalized bytes. `.env`, `.gitignore`, runtime state and pre-existing preserved conflicts are not managed; configuration values, absolute paths and project-name text are not persisted in metadata.

Run `node tools/age-drift.mjs` in the consumer, or give it an explicit target directory. It compares managed files with the recorded install, reporting missing/modified content and unrecorded engine files. Exit codes: `0` no drift, `1` drift, `2` missing/invalid origin or inspection error. It writes nothing and needs neither the source checkout nor npm dependencies. It does not compare with a remote latest release, assess semantic compatibility, validate file modes or prove provenance authenticity.

Reinstallation is **not an updater**. Use the same options/source/name; source or option changes and conflicting scaffold bytes block before writes. An unknown-version nonempty engine is refused even when some files match; a recorded engine must match source identity, content and inventory before any augmentation. This intentionally conservative boundary also refuses profile/add-on reconfiguration and engine-local customizations. For upgrades or existing untracked engines, review changes manually in a separate clean installation; do not delete origin metadata to bypass a conflict. The tool does not overwrite custom files or rebaseline edited canonical skills.

## Why This Design (Not Alternatives)

Design tradeoffs:

1. **Two complete doc trees** multiply shared methodology and cross-reference maintenance.
2. **Suffixed twin files** make consumers remove project-only content manually and cannot select the automatically loaded agent file reliably.
3. **Host-specific instruction injection** does not solve consumer context/architecture scaffolding and weakens portability.

The `template/` overlay isolates pristine fill-in content while sharing methodology. Engine vendoring is a separate opt-in boundary; provenance/drift inspection is deliberately smaller than an upgrade framework.

## Editing Rules

When editing a fill-in file, decide which audience the edit serves:

- **Methodology change (affects both audiences)** → edit the root file AND the `template/<path>` pristine copy, in lockstep. Add a row to the release checklist: "diff `template/<path>` against last release tag."
- **Real-project-only change (mission-driver-specific content)** → edit the root file only. The `template/<path>` pristine version is unaffected.
- **Template-only change (placeholder wording, Day-0 checklist tweak)** → edit `template/<path>` only. The root real-project version is unaffected.

When adding a new fill-in file:

1. Decide if it goes in root only (real-project), `template/` only (template), or both (methodology).
2. If both, list it in `install-age.manifest` with the `template/` prefix.
3. Extend installer regression coverage for new personalization and delivery behavior; preserve historical plan records.

## Verification

After any change to the template/real-project boundary, run the consumer commands in `docs/context/project-context.md`:

```bash
node --test tools/install-age.test.mjs tools/install-age.integration.test.mjs
bash tools/check-install-age.sh
```

These scoped checks cover profile/engine matrices, configuration preservation, literal names, bridge/registry parity and negative controls, read-only drift, conflict preflight and installed engine startup/validation. They do not execute models, test Pi host loading or establish global engine/plugin health. The shell gate uses a unique `_tmp/` workspace with cleanup; an explicitly supplied target is retained.

## Cross-References

- Proposal: `docs/analysis/2026-07-27-0000-template-realproject-split-proposal.md` (v4, audit-passed)
- Plan: `docs/plans/2026-07-27-0000-template-realproject-split-plan.md`
- Copy flow code: `install-age.sh`, `install-age.manifest`
- Manual fallback: `template/START-HERE-after-copy.md` (deprecated; primary flow is `./install-age.sh`)
- Template-audience README: `template/README.md`
- Real-project README: `README.md` (dual-audience: real project first, template usage second)
