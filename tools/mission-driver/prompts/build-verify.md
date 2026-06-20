Verify that the build passes for mission '{{missionName}}', then commit the work.

After CODE changes you MUST run typecheck, build, lint, and test (when relevant). Use the commands from the mission config.

Steps:
1. Run, from the project root:
   - `{{typecheckCmd}}`
   - `{{buildCmd}}`
   - `{{lintCmd}}`
   - `{{testCmd}}`
   If a command is empty, skip it.
2. If any command fails:
   a. Diagnose the root cause (TypeScript error, ESLint violation, failed test, etc.)
   b. Fix the issue
   c. Re-run to confirm green
3. If all commands pass, **commit the work** (mandatory, not optional):
   a. Run `git status` to inspect all uncommitted changes
   b. If the working tree is clean (no changes since the last commit), skip to step 4
   c. Derive commit metadata from the run context:
       - `YYYY-MM-DD-HHmm` = date+minute parsed from `{{PLAN_FILE}}` basename (the first 15 characters: `YYYY-MM-DD-HHmm`, before the `-N-` sequence segment)
       - `scope` = mission name (e.g. `{{missionName}}`)
   d. Split changes into logical commits following the project's `AGENTS.md` commit style (read the **Commit Message Style** section **completely**; imperative mood: "Add feature" not "Added feature"; reference doc paths when relevant):
      - **Code commit** (implementation + tests, never separated):
        ```
        feat(<scope>): plan-{YYYY-MM-DD-HHmm} {short title from plan header}

        - Deliverable 1
        - Deliverable 2
        - Deliverable 3 (typical 3-5 items, extract from plan deliverables)

        Plan: {{plansDir}}/{YYYY-MM-DD-HHmm}-...md
        ```
        (Match the surrounding `git log` tone — keep consistent with the repo's commit style.)
      - **Doc commit** (plan file + architecture docs + roadmap + daily log):
        ```
        docs(<scope>): plan-{YYYY-MM-DD-HHmm} docs/log/roadmap update

        - Update docs/architecture/...md (§X ✅)
        - Update {{roadmapPath}} (§Y ✅)
        - Update docs/logs/{YYYY}/{MM-DD}.md (plan-{YYYY-MM-DD-HHmm} entry)

        Plan: {{plansDir}}/{YYYY-MM-DD-HHmm}-...md
        ```
      - If code changes span multiple packages, emit multiple feat commits (split by package).
   e. **Failure handling** — if any `git commit` fails (pre-commit/Husky hook rejection, message format issue, staging problem):
      - Try to auto-fix the root cause and retry (e.g. fix lint/import-order/format issues, re-stage missing files). Up to 2 retries.
      - Never bypass hooks (`--no-verify`) or force anything (`--force`, reset shared refs).
      - If auto-fix fails after retries, leave the working tree as-is (preserve work) and emit `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` with the failure reason so the next run can pick up the uncommitted work.
   f. After all commits succeed, run `git log --oneline -5` to confirm the history
4. Proceed to the result format below.

If this run achieved a full-green state (unit tests + e2e both passed completely), follow AGENTS.md: record it in `docs/logs/{year}/{month}-{day}.md`, mention `full-green verification` in the commit message, then commit.

Return results in the following format: `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>`.
