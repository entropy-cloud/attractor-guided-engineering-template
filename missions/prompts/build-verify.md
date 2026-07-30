Verify that the build passes for mission '{{missionName}}'.

After CODE changes you MUST run typecheck, build, lint, and test (when relevant). Use the commands from the mission config.

## Steps

1. Run, from the project root:
   - `{{typecheckCmd}}` (skip if empty)
   - `{{buildCmd}}` (skip if empty)
   - `{{lintCmd}}` (skip if empty)
   - `{{testCmd}}`
2. If any command fails:
   a. Diagnose the root cause (TypeScript error, ESLint violation, failed test, etc.)
   b. Fix the issue
   c. Re-run to confirm green
3. If all commands pass, proceed to commit strategy below.

## Project-Specific Checks (mission-driver)

- If `src/main.js` delegate vars changed, verify `src/context-map.mjs` `EXPECTED_VARS` + `VAR_PROVENANCE` are in sync (the test suite covers this, but check proactively).
- If `flows/*.json` changed, verify `prompt-check.mjs` still passes (it validates prompt result-tag examples against transitions).
- If frontend code (`web/src/`) changed: run `pnpm --prefix tools/mission-driver/web run build` and commit the updated `web/dist/`. Never `.gitignore` `dist/`.
- If `missions/base.json` or `missions/*.json` changed: run `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` to validate.

## Commit Strategy

Before taking any action, check `git status` and `git log --oneline -5`:

- **If the working tree is clean** (no uncommitted changes): skip commit, proceed to result.
- **If there are uncommitted changes**:
  a. Derive `scope` from `{{missionName}}` and `YYYY-MM-DD-HHmm` from `{{PLAN_FILE}}` basename.
  b. Split into logical commits following `AGENTS.md` commit style:
     - **Code commit** (implementation + tests together):
       ```
       <type>(<scope>): <short title from plan header>

       - Deliverable 1
       - Deliverable 2

       Plan: {{PLAN_FILE}}
       ```
     - **Doc commit** (plan file + architecture docs + roadmap + daily log):
       ```
       docs(<scope>): plan-{YYYY-MM-DD-HHmm} docs/log/roadmap update

       - Update docs/architecture/...md
       - Update {{roadmapPath}}
       - Update docs/logs/{YYYY}/{MM-DD}.md

       Plan: {{PLAN_FILE}}
       ```
  c. If a `git commit` fails (hook rejection): auto-fix root cause and retry (up to 2). Never bypass hooks (`--no-verify`).
  d. After commits, run `git log --oneline -5` to confirm.

If this run achieved full-green (tests + build both passed), record it in `docs/logs/{year}/{month}-{day}.md` and mention `full-green verification` in the commit message.

Your output MUST end with exactly one `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` marker.
