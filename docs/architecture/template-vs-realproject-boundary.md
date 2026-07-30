# Template vs Real-Project Boundary

This document is the architecture truth for why this repository has a `template/` subdirectory and how the template/real-project audiences are separated. It exists to prevent re-litigating the same structural question.

## Context

This repo has a dual identity:

1. **As a real project** — it develops `tools/mission-driver/` using its own AGE workflow + mission-driver itself.
2. **As a template** — consumers run `./install-age.sh /path/to/target "Project Name"` from a clone of this repo to bootstrap a new AGE project.

Prior to 2026-07-27, the repo was structured only for audience (2): root files were template-flavored (`<project-name>` placeholders, unfilled `docs/context/project-context.md`, etc.), which obstructed using the repo itself as a real project. See `docs/analysis/2026-07-27-0000-template-realproject-split-proposal.md` for the full problem statement and the 4-round audit history that converged on this boundary.

## The Boundary

| Surface | Owner | Notes |
| --- | --- | --- |
| **Repo root** (`AGENTS.md`, `README.md`, `README.zh.md`, `DEVELOPMENT.md`, `install-age.sh`, `install-age.manifest`) | **Real project** | opencode auto-loads root `AGENTS.md` at every session start (opencode convention). These files describe this repo's own development of mission-driver. |
| **Root `docs/` (shared methodology)** | **Shared (template + real project)** | Methodology guides (`00-*-guide.md`, `docs/skills/*`, `docs/references/*`, `docs/process/README.md`, `docs/articles/*`, `docs/examples/*`, directory-level `README.md`s except those flagged below) are identical for both audiences. Consumers copy them as-is via `install-age.manifest`. |
| **Root `docs/` (real-project filled)** | **Real project** | `docs/context/{project-context,ai-autonomy-policy,codebase-map}.md`, `docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md`, `docs/process/application-development-workflow.md`, `docs/backlog/README.md`, `docs/index.md`, `docs/testing/known-good-baselines.md` — these were template stubs, now filled with mission-driver-specific content. |
| **`template/` subdirectory** | **Template** | Pristine copies of the 16 fill-in files + `README.md` + `README.zh.md` + `START-HERE-after-copy.md` (deprecated manual fallback). Consumers receive these via `install-age.sh`. |
| **`tools/mission-driver/`** | **Real project (NOT copied)** | The engine itself. Consumers reference it via `MISSION_DRIVER_HOME`, never copy it. See `tools/README.md`. |
| **`install-age.sh` + `install-age.manifest`** | **Shared** | The single copy-flow mechanism. Manifest entries with `template/` prefix source from `template/`; entries without prefix source from root (shared methodology). |

## What `install-age.sh` Does (Consumer Flow)

For each manifest entry:

1. Read the line.
2. Compute `dst_line = "${line#template/}"` (strip `template/` prefix if present → target-relative path).
3. Copy `$TEMPLATE_ROOT/$line` → `$TARGET/$dst_line`.
4. Skip if target already exists.

After all copies:

5. Sed-replace `<project-name>` → project name in every fill-in `.md` file that was sourced from `template/` (i.e., the `TEMPLATE_COPIED` array — manifest entries whose source path starts with `template/`). Shared methodology files (sourced from root paths) are NOT touched, so they can legitimately reference `<project-name>` as a literal placeholder in their prose.
6. Create `tools/mission-driver.sh` shim + `.env` + `missions/base.json` + `missions/demo.json` + `missions/onboarding.json` + `docs/logs/{year}/` + `.gitignore` entries.

The consumer receives a personalized AGE project scaffold, ready for them to fill in their own stack details. The mission-driver engine itself stays in this repo; consumers reference it via `MISSION_DRIVER_HOME`.

## Why This Design (Not Alternatives)

Rejected alternatives, summarized from the proposal audit history:

1. **Two-doc-trees (`docs/` + `docs-tpl/`)** — rejected: 80%+ of docs are shared methodology; two trees create massive drift surface and break every cross-reference.
2. **Twin files (`project-context.md` + `project-context-tpl.md`)** — rejected: cannot twin the opencode-auto-loaded `AGENTS.md`; consumers get both files and must manually delete; does not scale to 16 fill-in files.
3. **`.opencode/opencode.json` instruction injection** — rejected: capability unproven in this repo; even if supported, it only addresses `AGENTS.md` while the other 15 fill-in files remain template-flavored.

Selected design — **`template/` subdirectory overlay extending the existing `install-age.sh` mechanism** — honors the existing "reference not copy" pattern already used for `tools/mission-driver/` and `docs/articles/`, requires no new tooling, and bounds the drift surface to 16 fill-in files (vs. the entire `docs/` tree).

## Editing Rules

When editing any of the 16 fill-in files, decide which audience the edit serves:

- **Methodology change (affects both audiences)** → edit the root file AND the `template/<path>` pristine copy, in lockstep. Add a row to the release checklist: "diff `template/<path>` against last release tag."
- **Real-project-only change (mission-driver-specific content)** → edit the root file only. The `template/<path>` pristine version is unaffected.
- **Template-only change (placeholder wording, Day-0 checklist tweak)** → edit `template/<path>` only. The root real-project version is unaffected.

When adding a new fill-in file:

1. Decide if it goes in root only (real-project), `template/` only (template), or both (methodology).
2. If both, list it in `install-age.manifest` with the `template/` prefix.
3. Update Phase 0 grep in `docs/plans/2026-07-27-0000-template-realproject-split-plan.md` if the new file contains `<...>` placeholders.

## Verification

After any change to the template/real-project boundary, run the persisted closure-gate test:

```bash
pnpm --prefix tools check:install
# or directly: bash tools/check-install-age.sh
```

The test runs `./install-age.sh` into a throwaway target and asserts 10 properties — see `tools/check-install-age.sh` for the current assertion list (personalization happened, fill-in files reached consumer, shared methodology reached consumer, onboarding roadmap + mission config valid, `<project-name>` replaced in fill-in files, etc.).

For the manual Phase 0 fill-in enumeration grep, see `docs/plans/2026-07-27-0000-template-realproject-split-plan.md` Phase 0 (returns 16 fill-in files, all in `template/`, none at root).

## Cross-References

- Proposal: `docs/analysis/2026-07-27-0000-template-realproject-split-proposal.md` (v4, audit-passed)
- Plan: `docs/plans/2026-07-27-0000-template-realproject-split-plan.md`
- Copy flow code: `install-age.sh`, `install-age.manifest`
- Manual fallback: `template/START-HERE-after-copy.md` (deprecated; primary flow is `./install-age.sh`)
- Template-audience README: `template/README.md`
- Real-project README: `README.md` (dual-audience: real project first, template usage second)
