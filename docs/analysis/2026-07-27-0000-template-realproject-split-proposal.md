# Template vs Real-Project Split — Proposal v4

> Status: **proposal — PASSED audit round 4; ready to bootstrap Phase 2 plan**
> Date: 2026-07-27
> Owner: human (via opencode session)
> Audit: independent subagent (cold-replay, fresh context), **4 rounds complete — converged**

## Changes from v3 (audit round 3 outcome)

Audit round 3 verdict: `needs revision`. B1/B2/C9 resolved; open-ended scan finds NO additional automation (scoping flaw from rounds 1-2 fully corrected). One new blocking issue and 5 non-blocking notes. All applied below:

- **B4 fixed (round 3 blocking)**: v3 falsely claimed the existing sed-replace block at `install-age.sh:121-127` would "keep matching AGENTS.md" after the manifest flip. Mental dry-run proved this false: `COPIED+=("$line")` at `:116` pushes `template/AGENTS.md`, but the comparison `[ "$f" = "AGENTS.md" ]` at `:123` then fails, silently disabling the personalization step. **Phase 3.a patch expanded from 3 lines → 5 lines** to also push `$dst_line` (target-relative) to `COPIED` and `SKIPPED` arrays instead of `$line` (source-relative). Added an empirical **closure-gate test** to Phase 3 (run install-age.sh into `/tmp`, `grep -c '<project-name>'` must return 0).
- **N1 (round 3) fixed**: count contradictions resolved. **16 fill-in files** in Phase 1 (rows 1, 4-18); **15 manifest entries** get the `template/` prefix (rows 2-3 README/README.zh and row 4 START-HERE are NOT in `install-age.manifest` today — see N5). All references throughout v4 standardized on these two numbers.
- **N2 (round 3) fixed**: Phase 2 AGENTS.md sketch previously conflated `template/README.md` (was README.md) with `template/START-HERE-after-copy.md` (was START-HERE-after-copy.md). Now correctly distinguishes: `template/README.md` for template-audience readme; `template/START-HERE-after-copy.md` for manual fallback.
- **N3 (round 3) fixed**: row 5 (`docs/index.md`) now notes that if rows 16-17 (`docs/design/{domain-design-guidelines,flow-overview}.md`) are deleted at root per D8, the real-project index must drop the corresponding routing entries at `docs/index.md:34-35` to avoid dangling refs.
- **N4 (round 3) acknowledged**: R11 severity stays **Medium** (do not downgrade). The script is the sole copy mechanism, has no CI coverage; the new closure-gate test (B4 fix) provides the missing empirical check.
- **N5 (round 3) engaged**: pre-existing issue — `install-age.manifest` does NOT list `README.md`, `README.zh.md`, or `START-HERE-after-copy.md`, so install-age.sh consumers never receive them. Currently `README.md:123/154/277` ("start with START-HERE-after-copy.md") is already broken for those consumers. v4 adds a Phase 3 follow-up item: either add these files to the manifest, or reword READMEs to point install-age.sh users at the printed NEXT STEPS block (`install-age.sh:364-369`) instead.

## Cumulative Changes from v2 (still in force)

(For round-2 audit outcome, see §11 audit history table. v2 → v3 introduced the install-age.sh discovery [C9], expanded Phase 1 from 13 → 16 files [B3], reframed rows 2-3 as dual-audience rewrites, added Phase 1 row 19 for `DEVELOPMENT.md`, and corrected R9 framing.)

- **C5**: 16 fill-in files (~12% of `docs/`).
- **START-HERE-after-copy.md status**: deprecated by `install-age.sh`; remains in `template/` as manual fallback for no-bash environments.

## 1. Problem Statement

This repository has a dual identity that the current structure does not expose clearly:

1. **As a template** — consumers run `./install-age.sh /path/to/target "Project Name"` which copies a curated file set into a new project root and fills `<project-name>` in AGENTS.md.
2. **As a real project** — the repo also develops `tools/mission-driver/` (a real Node.js tool, 22 source files + Vue 3 dashboard) using its own AGE workflow + mission-driver.

Today the repo is structured *only* for audience (1). Concrete symptoms:

- `AGENTS.md:5` opens with `<project-name>` template placeholder. opencode auto-loads this file at every session start, so every AI session on this repo reads a template contract, not a real-project contract.
- `docs/context/project-context.md:36-42` is entirely `<fill real command>` placeholders. Per AGENTS.md's own Verification Baseline rule (lines 171-177), an AI session opening this repo MUST stop and refuse to report verification success until placeholders are filled — yet the repo is actively developing `tools/mission-driver/` and running its test suite.
- `AGENTS.md` does not mention `tools/mission-driver/` anywhere (58 `docs/` references, zero `tools/` references). New AI sessions have no signal that the repo contains a real tool.
- `docs/index.md:1` title is `<project-name> Docs Index`.
- `docs/architecture/mission-driver-baseline.md` is already a real-project file (filled, 119 lines) sitting alongside four template-stub siblings — the repo is already half-migrated ad-hoc.

The user (repo owner) now wants to develop this repo *itself* using AGE + mission-driver. The template flavor of the root docs actively obstructs that.

## 2. Hard Constraints

| # | Constraint | Source / Evidence |
|---|---|---|
| C1 | opencode auto-loads **the file named exactly `AGENTS.md` at the repo root** into every session's system prompt, repo-wide. Subdirectory `CONTEXT.md` files additionally attach when AI reads files in that subtree (verified: `tools/mission-driver/CONTEXT.md` attaches in that subtree). `.opencode/` contains only `skills/` + plugin `package.json`; no project-local `opencode.json` overrides instruction loading. | Verified in-session: parent system prompt has `Instructions from: ...AGENTS.md` and no other root instruction file; subagent's system prompt additionally carried `tools/mission-driver/CONTEXT.md` when reading files in that subtree. |
| C2 | `tools/mission-driver/` is "do not copy, reference via `MISSION_DRIVER_HOME`" | `tools/README.md:53-82`; `START-HERE-after-copy.md:49`; `install-age.sh:130-187` creates the shim |
| C3 | A "Do Not Copy" classification exists: manifest `install-age.manifest:5-15` enumerates template-internal exclusions (`docs/articles/`, `docs/audits/mission-driver-*/`, `docs/logs/2026/`, `docs/plans/mission-driver-*/`, `docs/requirements/mission-driver-convergence-and-cost-optimization.md`, `docs/retrospectives/template-design-decisions.md`, etc.) | `install-age.manifest:5-15` |
| C4 | `docs/` is majority shared methodology guides (`00-*-guide.md`, directory-level `README.md`s, `docs/plans/00-plan-authoring-and-execution-guide.md`, `docs/skills/*`, `docs/references/*`) identical for template and real-project audiences | Cross-checked against `docs/index.md` routing table |
| C5 | **16 fill-in files** differ between template and real-project audiences | Live grep; 16 of ~130 `docs/*.md` files = ~12% of tree |
| C6 | Heavily-cross-referenced docs tree — `AGENTS.md` has **58 `docs/...` references**; `docs/index.md` has a 30-row routing table | `grep -c "docs/" AGENTS.md` |
| C7 | The repo ships pre-built releases via GitHub and consumers run `install-age.sh` from a clone of this repo | `README.md`, `tools/mission-driver/README.md:18-41`, `.github/workflows/release.yml`, `install-age.sh:1-17` |
| C8 | Package-manager reality: no lockfile at root or `tools/` or `tools/mission-driver/` (engine has zero npm deps); only `tools/mission-driver/web/pnpm-lock.yaml` exists. `tools/package.json:5` declares `"packageManager": "pnpm@10.0.0"`; `tools/mission-driver/web/package.json:6` declares `"packageManager": "pnpm@10.27.0"`. | `ls` of all candidate lockfile paths; `package.json` inspection |
| **C9 (new)** | **`install-age.sh` + `install-age.manifest` at repo root already implement the copy flow.** Script copies files listed in manifest, skips existing, sed-replaces `<project-name>` only in AGENTS.md, creates the shim/.env/missions base.json/demo.json/demo-roadmap/logs-{year}/.gitignore. Manifest is the authoritative "what is template vs real-project" list. **`START-HERE-after-copy.md` is the older manual flow, deprecated by install-age.sh.** | `install-age.sh` (369 lines), `install-age.manifest` (136 lines) |

## 3. Options Evaluated

### 3.1 Option 1 — `docs/` → `docs-tpl/` + new `docs/` (REJECTED)

Move entire template docs tree to `docs-tpl/`. Reject: wrong cut (~80% shared methodology per C4); breaks 58 AGENTS.md cross-refs + entire `docs/index.md` routing table (C6); duplicates every guide → drift.

### 3.2 Option 2 — Twin files (`project-context.md` + `project-context-tpl.md`) (REJECTED)

Reject: does not solve AGENTS.md (C1, cannot twin); consumers get both files; 16 fill-in files would all need twins (C5).

### 3.3 Option 3 — `template/` subdirectory overlay, extending `install-age.sh` (RECOMMENDED)

Root = real project. `template/` = pristine mirror of fill-in files only. Shared methodology stays at root. **`install-age.manifest` is updated so its 16 fill-in entries point at `template/<path>` instead of root `<path>`; shared methodology entries stay at root.** `install-age.sh` itself is essentially unchanged (it already reads whatever paths the manifest lists). This reuses the proven copy-flow mechanism rather than reinventing it.

### 3.4 Option 4 — `.opencode/opencode.json` instruction injection (REJECTED, with residual unknown)

Keep AGENTS.md template-flavored; add project-local `.opencode/opencode.json` to load an additional REALPROJECT.md.

Reject: capability unproven in-repo (no `.opencode/opencode.json` exists); even if supported, it only addresses AGENTS.md while the other 15 fill-in files remain template-flavored; asymmetric config less discoverable. Residual unknown: confirm `.opencode/opencode.json` capability before Phase 2 plan freeze (D6).

## 4. Recommendation Rationale

1. **Honors C1**: AGENTS.md stays at root, real-project-flavored.
2. **Honors C2/C3/C9**: Extends the EXISTING `install-age.{sh,manifest}` overlay pattern. Consistent with the proven copy-flow mechanism rather than parallel to it.
3. **Honors C4/C5**: Mirrors 16 fill-in files in `template/` (~12% of `docs/`). Methodology guides not duplicated.
4. **Honors C6**: No path rewriting in shared docs.
5. **Matches industry precedent** (see §5).
6. **Minimal change to existing tooling**: `install-age.sh` source-path logic unchanged; `install-age.manifest` gets 16 path prefixes (`<path>` → `template/<path>`).

## 5. Industry Precedent

| Project | Template location | Source location | Notes |
|---|---|---|---|
| `vitejs/vite` (`create-vite`) | `packages/create-vite/template-{vue,react,...}/` | `packages/vite/` | Pristine template subtree. |
| `init/init` (create-t3-app) | `cli/template-*/` | `cli/src/` | Same pattern. |
| `withastro/astro` | `packages/create-astro/src/templates/` | `packages/astro/` | Same pattern. |
| `vercel/next.js` | `examples/` | `packages/next/` | Examples subtree. |
| **This repo (existing)** | `install-age.manifest` lists template-internal exclusions; `tools/mission-driver/` is reference-not-copy | root + `docs/` | Already an overlay pattern, just sourced from root paths. |

**Web-verification disclaimer**: External precedents not web-verified against current HEAD; internal evidence (this repo's `install-age.sh` overlay pattern) is sufficient to ground the recommendation.

## 6. Concrete Migration Plan

### Naming convention
`template/` (aligned with `create-vite`).

### Phase 0 — Prerequisites (execute before any file moves)

```bash
# Re-confirm the fill-in set (R8 from v1, executed in v2 and re-verified in v3)
grep -rlE "<project-name>|<fill|<area>|<path>|<human \| subagent \| none>|<YYYY-MM-DD>|<first slice>|<work item>|<domain>|<state>" \
  docs/ AGENTS.md README.md README.zh.md START-HERE-after-copy.md \
  | grep -v "docs/analysis/" | grep -v "docs/discussions/" | grep -v "docs/logs/" \
  | grep -v "docs/audits/" | grep -v "docs/plans/mission-driver" | grep -v "docs/plans/2026-" \
  | grep -v "docs/backlog/mission-driver" | grep -v "docs/backlog/demo-roadmap" \
  | grep -v "docs/requirements/mission-driver" \
  | sort

# Must return the 16 files listed in Phase 1 below. If more, expand Phase 1.

# Confirm install-age.sh CI references
grep -rn "install-age" .github/ tools/ docs/ README.md README.zh.md 2>/dev/null
```

### Phase 1 — Move fill-in files to `template/` + create root real-project versions

For each row: `git mv` root file → `template/<same-relative-path>` (preserves history), then write new real-project version at root path.

| # | Current root path | Move to | New root content (real project) |
|---|---|---|---|
| 1 | `AGENTS.md` | `template/AGENTS.md` | Real-project contract (see Phase 2) |
| 2 | `README.md` | `template/README.md` | **Dual-audience rewrite** (not fill-in mirror — README contains no grep placeholders, but its content is dual-audience): top = "This Repo (Real Project)", bottom = "Using as a Template" pointing at `install-age.sh` and `template/` |
| 3 | `README.zh.md` | `template/README.zh.md` | **Dual-audience rewrite**, Chinese (mirror row 2) |
| 4 | `START-HERE-after-copy.md` | `template/START-HERE-after-copy.md` | Root version deleted; `template/` version becomes the manual fallback for no-bash environments. Add deprecation header pointing at `install-age.sh` as primary. |
| 5 | `docs/index.md` | `template/docs/index.md` | Real-project title; routing table adds `tools/mission-driver/CONTEXT.md` row; remove `<area>` placeholder row; **if rows 15-17 deleted at root per D8, also drop the corresponding routing entries at `docs/index.md:26, 34-35`** (audit N3 + round-4 N1 — avoid dangling refs to `implementation-roadmap.md`, `domain-design-guidelines.md`, `flow-overview.md`) |
| 6 | `docs/context/project-context.md` | `template/docs/context/project-context.md` | Filled: stack = Node 18+/ESM, TypeScript (web only); verification = see Phase 4 |
| 7 | `docs/context/ai-autonomy-policy.md` | `template/docs/context/ai-autonomy-policy.md` | Filled: reviewer availability = `subagent`; protected areas = engine state machine, zero-npm-dep invariant, `web/dist/` committed-artifact invariant, `memory/_index.md` always-load contract |
| 8 | `docs/context/codebase-map.md` | `template/docs/context/codebase-map.md` | Filled: entry points = `tools/mission-driver/src/main.js`, `flows/`, `prompts/`; fragile files = `engine.js`, `executor.js` |
| 9 | `docs/architecture/README.md` | `template/docs/architecture/README.md` | Filled; **cross-reference** `docs/architecture/mission-driver-baseline.md` (already a real-project file) instead of duplicating |
| 10 | `docs/architecture/module-boundaries.md` | `template/docs/architecture/module-boundaries.md` | Filled: boundaries for engine vs monitor vs web |
| 11 | `docs/architecture/project-vision.md` | `template/docs/architecture/project-vision.md` | Filled: long-term direction for mission-driver as a tool |
| 12 | `docs/architecture/system-baseline.md` | `template/docs/architecture/system-baseline.md` | Filled: stack baseline (Node 18+/ESM, Vue 3/Naive UI/Vite for web). Note: prior audit `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md:101-108` already flagged these four `docs/architecture/*` files as 27-line template stubs. |
| 13 | `docs/process/application-development-workflow.md` | `template/docs/process/application-development-workflow.md` | Filled: heading depersonalized; body preserved (generic). Full mirror per D5. |
| 14 | `docs/backlog/README.md` | `template/docs/backlog/README.md` | Filled: real-project first slice / work items |
| 15 | `docs/backlog/implementation-roadmap.md` | `template/docs/backlog/implementation-roadmap.md` | Filled: real-project milestones (or deleted at root if not yet needed; the file is optional per `START-HERE-after-copy.md:57`) |
| 16 | `docs/design/domain-design-guidelines.md` | `template/docs/design/domain-design-guidelines.md` | Filled (or deleted at root — file is an optional starter skeleton per `START-HERE-after-copy.md:59`) |
| 17 | `docs/design/flow-overview.md` | `template/docs/design/flow-overview.md` | Filled (or deleted at root — optional starter skeleton per `START-HERE-after-copy.md:60`) |
| 18 | `docs/testing/known-good-baselines.md` | `template/docs/testing/known-good-baselines.md` | Filled: real-project verification baselines |
| 19 | (new — N2 fix) | — | **Create** `DEVELOPMENT.md` at root: short doc describing this repo's own dev process (mission-driver development, AGE workflow, link to `tools/mission-driver/CONTEXT.md`) |

**Notes**:
- Rows 15-17 are optional starter skeletons. Recommendation: at root, fill if the project justifies; otherwise delete. In `template/`, the pristine versions always remain for consumers.
- Row 9 cross-references `docs/architecture/mission-driver-baseline.md` (the already-filled real-project file), avoiding the duplication flagged in audit R-U2.

**NOT moved** (shared methodology, consumers copy from root via manifest as-is):
- All `00-*-guide.md` files
- All directory-level `README.md`s except those above
- `docs/references/*`, `docs/articles/*`, `docs/examples/*`
- `docs/skills/*`

### Phase 2 — Rewrite root `AGENTS.md` (high impact, plan required)

Two new sections, plus depersonalize the opening `<project-name>` reference:

```markdown
## Dual-Audience Repo

This repository serves two audiences:
1. **As a real project** — it develops `tools/mission-driver/` using its own AGE workflow.
2. **As a template** — consumers run `./install-age.sh /path/to/target "Project Name"`, which copies the curated file set listed in `install-age.manifest` (sourced from `template/` for fill-in files and from repo root for shared methodology guides) into a new project root.

Files at the repo root and under `docs/` are the REAL PROJECT versions (filled in for mission-driver development). Pristine template versions of fill-in files live under `template/`. For the manual fallback flow (no bash), see `template/START-HERE-after-copy.md`; for the primary automated flow, run `./install-age.sh /path/to/target "Project Name"`.

## In-Tree Tool

`tools/mission-driver/` is a real, in-tree Node.js tool — NOT a scaffold example. It is the engine that automates this repo's own AGE loop. Read `tools/mission-driver/CONTEXT.md` for the 30-second overview. It is attached as subdirectory context when you read files under `tools/mission-driver/`.
```

Per AGENTS.md Planning Rule, Phase 2 triggers a formal plan.

### Phase 3 — Update `install-age.manifest` + `install-age.sh` (extend existing mechanism, low-medium risk)

The existing `install-age.sh` reads `install-age.manifest` line-by-line and copies each listed path from `$TEMPLATE_ROOT/<path>` to `$TARGET/<path>`. The manifest's **15 fill-in entries** (those 15 of the 16 Phase-1 fill-in files that are currently in the manifest; the 16th — `START-HERE-after-copy.md` — is not listed today per audit N5) get a `template/` path prefix. Shared-methodology manifest entries stay at root paths.

Concrete manifest diff (15 entries flipped):

```diff
# --- root ---
-AGENTS.md
+template/AGENTS.md     # NOTE: install-age.sh copies to AGENTS.md at target
+                       # (target strips the template/ prefix). The sed-replace
+                       # at install-age.sh:121-127 operates on $TARGET/AGENTS.md,
+                       # so its target-side path is unchanged. The matching
+                       # COPIED-array entry MUST also be the target-relative
+                       # name (see install-age.sh patch below).

 # --- docs root ---
-docs/index.md
+template/docs/index.md

 # --- docs/context (mandatory AI context — fill-in entries only) ...
-docs/context/project-context.md
-docs/context/ai-autonomy-policy.md
-docs/context/codebase-map.md
+template/docs/context/project-context.md
+template/docs/context/ai-autonomy-policy.md
+template/docs/context/codebase-map.md
 # (README.md, conventions.md, source-of-truth-and-precedence.md unchanged — shared methodology)

 # --- docs/backlog (fill-in entries only) ...
-docs/backlog/README.md
-docs/backlog/implementation-roadmap.md
+template/docs/backlog/README.md
+template/docs/backlog/implementation-roadmap.md
 # (00-roadmap-authoring-guide.md unchanged)

 # --- docs/process ...
-docs/process/application-development-workflow.md
+template/docs/process/application-development-workflow.md
 # (README.md unchanged)

 # --- docs/architecture ...
-docs/architecture/README.md
-docs/architecture/module-boundaries.md
-docs/architecture/project-vision.md
-docs/architecture/system-baseline.md
+template/docs/architecture/README.md
+template/docs/architecture/module-boundaries.md
+template/docs/architecture/project-vision.md
+template/docs/architecture/system-baseline.md
 # (api-response-conventions.md, integration-and-transaction-patterns.md unchanged)

 # --- docs/design ...
-docs/design/domain-design-guidelines.md
-docs/design/flow-overview.md
+template/docs/design/domain-design-guidelines.md
+template/docs/design/flow-overview.md
 # (README.md, app-overview.md, feature-inventory.md, roles-and-permissions.md unchanged)

 # --- docs/testing ...
-docs/testing/known-good-baselines.md
+template/docs/testing/known-good-baselines.md
 # (00-testing-note-guide.md, index.md unchanged)
```

**`install-age.sh` patch — 5 lines (fixes B4)**. The strip-prefix logic at copy time + the COPIED/SKIPPED arrays must track target-relative names so the existing `<project-name>` sed-replace block at `:121-127` continues to match `AGENTS.md`:

```diff
# At install-age.sh copy loop, around lines 98-117:
-  src="$TEMPLATE_ROOT/$line"
-  dst="$TARGET/$line"
+  src="$TEMPLATE_ROOT/$line"
+  dst_line="${line#template/}"   # strip leading template/ for target path
+  dst="$TARGET/$dst_line"

   if [ ! -f "$src" ]; then
     echo "  WARN: manifest lists '$line' but source missing — skipped." >&2
     continue
   fi

   if [ -f "$dst" ]; then
-    SKIPPED+=("$line")
+    SKIPPED+=("$dst_line")       # B4 fix: track target-relative name
     continue
   fi

   # dirname via builtin (no fork); only mkdir if parent doesn't exist yet.
   dir="${dst%/*}"
   [ -d "$dir" ] || mkdir -p "$dir"
   cp "$src" "$dst"
   echo "  + $line"
-  COPIED+=("$line")
+  COPIED+=("$dst_line")          # B4 fix: track target-relative name
 done < "$MANIFEST"
```

After this patch, the existing sed-replace block at `:121-127` requires **no change**:

```bash
# Unchanged — works because COPIED now contains target-relative names.
for f in "${COPIED[@]}"; do
  if [ "$f" = "AGENTS.md" ]; then
    tmp="$(mktemp)"
    sed "s/<project-name>/$PROJECT_NAME/g" "$TARGET/AGENTS.md" > "$tmp" && mv "$tmp" "$TARGET/AGENTS.md"
  fi
done
```

v3 incorrectly claimed the sed block would work without the COPIED-array patch — round-3 audit's mental dry-run proved the comparison `[ "$f" = "AGENTS.md" ]` returns false when `$f` is `template/AGENTS.md`. The 5-line patch above resolves this.

**Phase 3 closure-gate test (new, mandated by B4 fix)**:

```bash
# Run install-age.sh into a throwaway target and verify personalization happened.
TMP=$(mktemp -d)
./install-age.sh "$TMP" "TestProject" >/dev/null

# Closure gate 1: AGENTS.md was personalized
test "$(grep -c '<project-name>' "$TMP/AGENTS.md")" -eq 0 \
  || { echo "FAIL: AGENTS.md still has <project-name>"; exit 1; }

# Closure gate 2: AGENTS.md was personalized to the right value
grep -q "TestProject" "$TMP/AGENTS.md" \
  || { echo "FAIL: AGENTS.md missing TestProject"; exit 1; }

# Closure gate 3: shared methodology files were copied from root (not template/)
test -f "$TMP/docs/plans/00-plan-authoring-and-execution-guide.md" \
  || { echo "FAIL: shared methodology file missing"; exit 1; }

# Closure gate 4: fill-in files were copied from template/
test -f "$TMP/docs/context/project-context.md" \
  || { echo "FAIL: fill-in file missing"; exit 1; }

rm -rf "$TMP"
echo "PASS: install-age.sh manifest flip + sed-replace both work"
```

This converts R11's mitigation from "suggested test" into a hard closure gate. The test must pass before Phase 3 can close.

**Phase 3 follow-up item (audit N5, pre-existing issue)**: `install-age.manifest` does NOT list `README.md`, `README.zh.md`, or `START-HERE-after-copy.md`, so install-age.sh consumers never receive them. `README.md:123/154/277` ("start with START-HERE-after-copy.md") is therefore already broken for those consumers. Two resolutions:
- (3.N5.a) Add the three files to the manifest so they reach consumers.
- (3.N5.b) Reword README.md to point install-age.sh users at the NEXT STEPS block printed by `install-age.sh:364-369` instead.

Recommendation: **(3.N5.b)** — the NEXT STEPS block is already correct and version-controlled in the script; maintaining parallel instructions in README is the drift risk. Decision deferred to Phase 2 plan.

### Phase 4 — Fill real-project versions of fill-in docs

Fill the 13 docs (rows 5-18 minus row 19) with mission-driver-specific content. Source of truth:

- Technical stack: `tools/mission-driver/CONTEXT.md` "是什么" + "Monitor Dashboard 前端"
- **Verification commands** (corrected per C8):

| Purpose | Command |
|---|---|
| Engine tests | `pnpm --prefix tools/mission-driver test` (engine has zero deps; npm works too; pnpm preferred — matches `tools/package.json:5` `"packageManager": "pnpm@10.0.0"`) |
| Frontend build | `pnpm --prefix tools/mission-driver/web run build` (web is pnpm-locked; CI `web-dist-check.yml` enforces pnpm) |
| Mission config validation | `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` |
| Lint (prompts) | `node tools/mission-driver/src/prompt-check.mjs` (chained into `test` per `package.json:11`) |

- Protected areas: `tools/mission-driver/CONTEXT.md` "关键约束"
- Codebase map: `tools/mission-driver/CONTEXT.md` "目录结构"
- Architecture: cross-reference `docs/architecture/mission-driver-baseline.md` (already filled); do NOT duplicate

## 7. AGENTS.md rewrite sketch

(See Phase 2 above — the two new sections are the entire scope of new content; rest of AGENTS.md preserved verbatim from template version, with `<project-name>` replaced by `mission-driver (self-hosting AGE workspace)` in the opening line.)

## 8. Open Decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | `template/` vs `_template/` vs `scaffold/` | `template/` |
| D2 | `START-HERE-after-copy.md`: delete from root, or move to `template/` as manual fallback? | Move to `template/`, add deprecation header pointing at `install-age.sh` |
| D3 | Bootstrap formal plan for Phase 2-3? | Yes — Phase 2 changes AI operating contract (Planning Rule) |
| D4 | Persist decision in `docs/architecture/template-vs-realproject-boundary.md`? | Yes — prevents re-litigation |
| D5 | Row 13 hybrid: full mirror (a) or sed-replace (b)? | (a) full mirror |
| D6 | Confirm `.opencode/opencode.json` capability (Option 4) before Phase 2 freeze? | Yes; default to Option 3 alone if unproven |
| D7 (new) | Phase 3 manifest update: strip-prefix (3.a) or two-column (3.b)? | **(3.a) strip-prefix** — minimal change |
| D8 (new) | Rows 15-17 (optional starter skeletons at root): fill or delete? | Delete at root if not yet needed; pristine always in `template/` |
| D9 (new) | Should `docs/architecture/mission-driver-baseline.md` move to `template/`? | **No** — it is a real-project file already; consumers don't get it (excluded per `install-age.manifest:7`). Keep at root. |

## 9. Risk Register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | Existing consumers not affected (they have local copies already) | Low | None — forward-looking. CHANGELOG note. |
| R2 | CI workflows: `release.yml` (tag-triggered) and `web-dist-check.yml` (scoped to `tools/mission-driver/web/**`). Neither references any fill-in path. | Low | None — Phase 0 grep confirms. |
| R3 | git history of moved files harder to follow | Low | Use `git mv`. |
| R4 | `tools/check-doc-references.mjs` may flag new root↔template cross-refs | Low | Run `pnpm --prefix tools check` after Phase 1; adjust `AGE_DOC_REFS_IGNORE_FILES`. |
| R5 | Drift between `template/AGENTS.md` and root `AGENTS.md` | Medium | Interim guard: one-line release checklist item "diff `template/AGENTS.md` against last release tag". R5.1 follow-up: extend `tools/check-doc-references.mjs` (env-configurable per `tools/README.md:28`) to alert on structural staleness. |
| R6 | Active plans under `docs/plans/mission-driver-*` reference current paths | Low | Verified: those plans reference `docs/plans/`, `docs/architecture/`, `tools/mission-driver/`, `docs/logs/` — none move except 4 `docs/architecture/*` stubs which the plans already flagged as stubs. |
| R7 | Naming collision with `tools/mission-driver/web/dist/` | Low | None — `template/` at root unambiguous. |
| R8 | Implicit template-only sections in "shared methodology" files | **Resolved** | Grep executed; result = 16 fill-in files (rows 1-18 minus 19). |
| R9 | EN/ZH README drift | Medium | Risk reframed (audit N4): "EN and ZH real-project versions drift from each other" (not "EN real vs ZH template"). Mitigation unchanged: Phase 4 updates both in lockstep; add to release checklist. |
| R10 | Phase 3 step 4-8 already-validated copy steps dropped | **Resolved** | Phase 3 v3 reuses `install-age.sh` which already implements all 7 steps validated at `docs/logs/2026/07-24.md:43`. |
| R11 (new) | `install-age.sh` patch (Phase 3, 5 lines) breaks existing flow | **Medium** (round-3 audit: do not downgrade — the script is the sole copy mechanism, has zero CI coverage today) | 5-line patch at known locations (`install-age.sh:107, 116`); empirical closure-gate test added to Phase 3 mandates `grep -c '<project-name>' == 0` on the personalized target AGENTS.md before Phase 3 can close. |
| R12 (new) | `install-age.manifest` incomplete — fails to add new template files added in future | Medium | Existing risk, predates this proposal. Mitigation: same R5.1 mechanism could include a manifest↔root diff check. Document in `install-age.manifest:15` "When adding new scaffold files to the template, add them HERE too." (already there). |
| R13 (new) | `START-HERE-after-copy.md` deprecation confuses users who find both docs | Low | Deprecation header in `template/START-HERE-after-copy.md` clearly points at `install-age.sh` as primary. README.md "Using as a Template" section names `install-age.sh` first. |
| R14 (new, audit N5) | `install-age.manifest` pre-existing gap: never lists `README.md` / `README.zh.md` / `START-HERE-after-copy.md`, so install-age.sh consumers never receive them. `README.md:123/154/277` already says "start with START-HERE-after-copy.md" — broken for those consumers today. | Low (pre-existing, predates this proposal) | Phase 3 follow-up item (3.N5.b recommended): reword READMEs to point install-age.sh users at the NEXT STEPS block printed by `install-age.sh:364-369`. Deferred to Phase 2 plan. |

## 10. Out of Scope

- Rewriting shared methodology guide content (`00-*-guide.md`, `docs/skills/*`, etc.)
- Touching `tools/mission-driver/` internals
- Backwards-compat shims for already-copied consumer repos
- `init-from-template.mjs` (Phase 3.5) — superseded by extending existing `install-age.sh`
- Package-manager unification

## 11. Audit Outcome Summary

| Round | Verdict | Blocking | Non-blocking applied | Author self-discovery |
|---|---|---|---|---|
| 1 | needs revision | 2 (B1 fill-in enumeration, B2 pnpm justification) | 6 (N1-N4, N6, N7) | — |
| 2 | needs revision | 1 (B3 = B1 carry-forward; count 13 vs 16) | 4 (N1 zh README reframe, N2 DEVELOPMENT.md, N3 mission-driver-baseline.md, N4 R9 framing) | **install-age.sh + install-age.manifest missed by both audits** (scoping flaw in audit prompts) |
| 3 | needs revision | 1 (B4 sed-replace breakage after manifest flip; v3 falsely claimed unchanged) | 5 (N1 count contradictions, N2 file-ref conflation, N3 index.md dangling refs, N4 R11 stays Medium, N5 pre-existing README/START-HERE-not-in-manifest) | Open-ended scan with corrected scope found NO additional automation — scoping flaw resolved |

**Lesson for future audits** (process improvement candidate for promotion per AGENTS.md Operating Rule 15): audit prompts scoped the read-list too narrowly in rounds 1-2, missing `install-age.sh`. Round 3's explicit "scan repo root + `tools/` + `.github/` + `package.json` scripts for existing copy-flow automation" instruction fixed this. Future audit prompts for proposals touching copy/scaffolding flows should include this instruction by default. Also: round 3 demonstrated the value of **mental dry-run** as a closure technique — analytical claims about "this code still works after my change" must be backed by a trace, not asserted. v3's false claim about the sed-replace block would have been caught in 30 seconds by running the trace.

## 12. Re-Audit Questions for Round 4

1. **B4 resolution**: Did v4 correctly patch install-age.sh? Specifically — does pushing `$dst_line` (target-relative) to COPIED/SKIPPED at `:107, :116` make the sed-replace block at `:121-127` work again? Trace through mentally with `template/AGENTS.md` as the manifest line.
2. **Closure-gate adequacy**: Is the Phase 3 closure-gate test (4 grep/test assertions) sufficient to catch any regression of B4 or any other manifest-flip break? If not, what additional assertion is needed?
3. **Count consistency (N1)**: Are all references throughout v4 now consistent on "16 fill-in files" / "15 manifest entries"? Search the doc for stray "13" or "18" that should be a different number.
4. **N2 fix**: Does Phase 2's AGENTS.md sketch now correctly distinguish `template/README.md` (was README.md) from `template/START-HERE-after-copy.md` (was START-HERE-after-copy.md)?
5. **N3 fix**: Is row 5's caveat about dropping routing entries for deleted rows 16-17 enough, or should D8 itself be re-examined (e.g., fill the optional skeletons instead of deleting)?
6. **N5 disposition**: Is deferring the README/START-HERE-not-in-manifest issue to Phase 2 plan (decision 3.N5.b) acceptable, or should it be a Phase 1 prerequisite?
7. **Final executability**: After v4's fixes, run the full mental dry-run of `./install-age.sh /tmp/test "Test"` end-to-end. Does every step succeed? Does the resulting scaffold match what a consumer expects?
