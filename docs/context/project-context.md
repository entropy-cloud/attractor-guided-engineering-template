# Project Context

## Purpose

The shortest static baseline an AI agent needs before doing useful work: identity, documentation freshness, technical stack, and verification commands.

Update it in place. Do not create dated copies.

This file intentionally does **not** track "what is being worked on right now". That is found by scanning unfinished plans in `docs/plans/`. Keeping high-churn active-work state here makes the file hard to maintain and prone to staleness.

## Project Identity

- Project name: `mission-driver`
- Product type: AGE development loop engine + monitor dashboard (in-tree tool under `tools/mission-driver/`)
- Primary users: developers using AGE (Attractor-Guided Engineering) methodology with the `opencode` CLI; secondary: consumers of this repo as an AGE template
- Documentation freshness: `fresh`

**Freshness gating:**

- If freshness is `stale` or `unknown`, agents may research, audit, and draft alignment docs, but must not implement product behavior until the baseline is re-established or a human confirms intended behavior.
- If freshness is `partially stale`, agents may implement only slices whose requirement, owner doc, codebase-map route, and touched code area have been verified fresh; otherwise treat the slice as `plan-first` or `research-only`.
- AI may not mark stale docs fresh without human confirmation or human-approved owner-doc evidence.

## Current Technical Baseline

- Frontend stack: Vue 3 + Naive UI 2 + TypeScript + Vite + xterm.js + Pinia (monitor dashboard; built `web/dist/` committed to git)
- Backend stack: Node.js ≥ 18 ESM, **zero npm dependencies** in engine core (`commander` vendored under `tools/mission-driver/vendor/commander/`)
- Database/model source: N/A — runtime state is file-based JSON (`_tmp/<runDir>/run-state.json`, `draft-state.json`)

## Verification Commands

| Purpose                   | Command                                                       |
| ------------------------- | ------------------------------------------------------------- |
| Install dependencies      | `pnpm --prefix tools/mission-driver install` (web only) / engine is zero-install |
| Run app locally           | `./tools/mission-driver.sh monitor` (dashboard on :9300)      |
| Typecheck / compile check | `pnpm --prefix tools/mission-driver/web run build` (web only; engine is plain JS) |
| Build                     | `pnpm --prefix tools/mission-driver/web run build`            |
| Lint / static check       | `pnpm --prefix tools/mission-driver test` (chains `prompt-check.mjs`) |
| Unit tests                | `pnpm --prefix tools/mission-driver test`                    |
| E2E / integration tests   | `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` (per-mission validation) |

Notes:
- Engine has zero npm deps → both `npm --prefix` and `pnpm --prefix` work; `pnpm` preferred (matches `tools/package.json:5` `"packageManager": "pnpm@10.0.0"` and `tools/mission-driver/web/pnpm-lock.yaml`).
- Frontend `web/pnpm-lock.yaml` is the only committed lockfile; CI `.github/workflows/web-dist-check.yml` enforces pnpm + dist freshness.

## Optional Layers Currently In Use

- [x] `docs/discussions/` (mission goal clarification records)
- [x] `docs/audits/` (independent draft-review / closure-audit / multi-audit / open-audit records under `docs/audits/mission-driver-*/`)
- [x] `docs/testing/` (manual exploratory test notes)
- [ ] `docs/skills/` (uses default skills shipped with the template; no project-specific skills yet)
- [x] `docs/analysis/` (e.g., `2026-07-27-0000-template-realproject-split-proposal.md`)
- [ ] `docs/retrospectives/`
- [x] `docs/lessons/`

## AI Block Conditions

AI MUST stop and wait for human input before proceeding when:

- any change touches the engine state-machine core (`tools/mission-driver/src/engine.js` central `_result` / `_wfClose` / `_executeSubflowStep` paths) without a plan covering the change
- any change breaks the engine zero-npm-dependency invariant (introducing a new runtime dep in `tools/mission-driver/package.json` `dependencies`) without explicit human approval — the invariant is normative, see `tools/mission-driver/CONTEXT.md` "关键约束"
- any change breaks the `web/dist/` committed-artifact invariant (e.g., re-adding `dist/` to `.gitignore`) without going through the CI freshness check
- any change touches `memory/_index.md` (always-load contract) without understanding the Reflexion loop consequences
- any change modifies `install-age.sh` personalization behavior (the `<project-name>` sed-replace at `:121-127`) without updating the Phase 3 closure-gate test
- no requirement or owner doc describes the intended behavior of the change — do not implement into a vacuum (this replaces the old "active requirement is none" gate; whether a requirement/owner doc exists is checked against `docs/requirements/` and `docs/design/`, not a field here)

These are project-specific hard stops in addition to `AGENTS.md`, `docs/context/ai-autonomy-policy.md`, source-of-truth conflict rules, and required plan/closure audit rules.

For ambiguity that does not affect user-visible behavior, contracts, protected areas, or closure evidence, resolve by writing assumptions into the relevant doc and proceed according to the autonomy policy. Mark uncertain assumptions explicitly so humans can review later.

## Notes For AI Agents

- If this file is empty or stale, ask for or create a context update before large implementation work.
- **Current work in progress**: inspect unfinished plans in `docs/plans/`, not this file.
- AI autonomy defaults to `implement`; it is gated by freshness (above) and Protected Areas (`ai-autonomy-policy.md`). No per-slice autonomy value is maintained here — autonomy labels live on backlog/roadmap work items, not in this file.
- AI may correct factual context from live repo evidence, but must not mark stale docs fresh or downgrade protected areas without human confirmation.
- Do not report verification success while commands still contain `<fill real command>` placeholders. (Currently: all commands above are real.)
