Execute the plan at {{PLAN_FILE}}. Complete **the entire plan**.

## CRITICAL: Scope Discipline

You are executing **ONE plan only** — the file at `{{PLAN_FILE}}`. Do NOT make changes that belong to other plans, other work items, or other missions. If you discover work that seems related but is NOT described in this plan's phases, note it in your output but do NOT execute it. Scope violations waste model calls and cause incomplete changes that break tests.

## Steps

1. Read the plan file at {{PLAN_FILE}} **completely**.
2. Determine which Phases still need work. A Phase is unfinished if it contains ANY `- [ ]` item. Do NOT rely on the `Status:` line alone — a Phase marked `Status: completed` that still has `[ ]` items is INCONSISTENT. Treat it as unfinished and execute it. Execute every unfinished Phase, in order.
3. After completing each Phase:
   a. Run `{{testCmd}}` to confirm tests pass. If the change is cross-module, also run `{{typecheckCmd}}` to catch downstream breakage.
   b. Tick every `[ ]` item in that Phase to `[x]` AND set its `Status:` to `completed`. Both must happen together — a status-only or items-only update leaves the plan inconsistent and will re-trigger this Phase on the next run.
4. After all Phases are complete:
   a. Update the plan's `Plan Status` to `completed`
   b. Read the work item from the plan (its `> Work Item:` label) and update the relevant roadmap/backlog file: change the work item from `todo`/`planned` to `done`
   c. **Close source audits**: If the plan front matter has `> Source Audits:`, for each listed audit file change `> Audit Status: planned` to `> Audit Status: closed`. Skip if no `> Source Audits:` line.

If execution is interrupted or fails, that is fine — the plan records its own progress ([x]/[ ]), so the next run resumes from the breakpoint.
Do not skip steps — execute every unfinished Phase completely.

## Project Constraints (mission-driver)

This project IS the mission-driver engine. When modifying it, honor these invariants:

- **Zero npm dependencies in engine core**: never add a runtime dep to `tools/mission-driver/package.json` `dependencies`. `commander` is vendored; do not un-vendor.
- **`web/dist/` is committed**: never add `dist/` to `.gitignore`. If frontend changed, run `pnpm --prefix tools/mission-driver/web run build` and commit `web/dist/`.
- **Protected areas** (require plan + review before changing):
  - `src/engine.js` state-machine core (`_result` / `_wfClose` / `_executeSubflowStep`)
  - `flows/*.json` step types and transition schema (Flow JSON contract)
  - `memory/_index.md` always-load contract
  - Exit-code map in `main.js`
- **context-map.mjs drift gate**: if you add a new delegate var in `main.js`, you MUST register it in both `VAR_PROVENANCE` and `EXPECTED_VARS` in `src/context-map.mjs`, or `pnpm test` will fail.
- **prompt-check.mjs**: every `<AI_STEP_RESULT>value</AI_STEP_RESULT>` example in a prompt file must use a value that is a valid transition marker or markerAlias for the step that loads it.

After code changes, run `{{typecheckCmd}} && {{buildCmd}} && {{lintCmd}}` before declaring a Phase done.

---

## Output marker

Your output MUST end with exactly one `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` marker (`pass` = all phases executed and green; `fail` = execution blocked or tests red).
