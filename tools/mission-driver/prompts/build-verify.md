Verify that the build passes for mission '{{missionName}}'.

After CODE changes you MUST run typecheck, build, lint, and test (when relevant). Use the commands from the mission config.

## Incremental build guidance (Maven / multi-module projects)

The mission's `{{buildCmd}}` / `{{typecheckCmd}}` / `{{testCmd}}` already scope to the affected module via `-pl <module> -am` and deliberately omit `clean` so Maven's native incremental compilation is reused across steps (target/ is preserved). To make this safe on multi-module projects:

0. Before building, run `git diff --name-only HEAD~1` (or compare against the last commit / the plan's working set) to confirm **which modules** actually changed. Only the listed modules need a rebuild — Maven's `-pl <module> -am` already targets them; do NOT re-add `clean` (it would wipe `target/` and force a full recompile, defeating the incremental goal). If a check unexpectedly passes without compiling anything because a prior step left a stale `target/`, only then consider an explicit `mvn clean` for that module as a one-off recovery — never as the default path.

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
3. If all commands pass, proceed to commit strategy below.

## Commit strategy: detect what EXECUTE already did

Before taking any action, check `git status` and `git log --oneline -5`:

- **If the working tree is clean** (no uncommitted changes):
  → Skip the commit step entirely. Proceed to result format.

- **If there are uncommitted changes AND recent commits contain Jira keys** (e.g. `<PROJ>-\d+`):
  → EXECUTE ran in Jira mode and already committed per-item. The remaining uncommitted changes are from non-Jira items (Decision/Proof items) or plan edits. Commit them now as a single batch:
     `feat({{missionName}}): plan-{timestamp} remaining items and plan updates`
  → This is a FALLBACK — normally EXECUTE commits per-item, so this should be minimal.

- **If there are uncommitted changes AND no Jira keys in recent commits**:
  → EXECUTE ran in batch mode (original behavior). Commit everything now with the original code+doc split:
    a. Derive commit metadata from the run context:
        - `YYYY-MM-DD-HHmm` = date+minute parsed from `{{PLAN_FILE}}` basename (the first 15 characters: `YYYY-MM-DD-HHmm`, before the `-N-` sequence segment)
        - `scope` = mission name (e.g. `{{missionName}}`)
    b. Split changes into logical commits following the project's `AGENTS.md` commit style (read the **Commit Message Style** section **completely**; imperative mood: "Add feature" not "Added feature"; reference doc paths when relevant):
       - **Code commit** (implementation + tests, never separated):
         ```
         feat(<scope>): plan-{YYYY-MM-DD-HHmm} {short title from plan header}

         - Deliverable 1
         - Deliverable 2
         - Deliverable 3 (typical 3-5 items, extract from plan deliverables)

         Plan: {{plansDir}}/{YYYY-MM-DD-HHmm}-...md
         ```
         (Match the surrounding `git log` tone — keep consistent with the repo's commit style.)
        - **Doc commit** (plan file + architecture docs + roadmap + daily log; roadmap updates are checkbox ticks on ledger roadmaps):
          ```
          docs(<scope>): plan-{YYYY-MM-DD-HHmm} docs/log/roadmap update

          - Update docs/architecture/...md (§X done)
          - Update {{roadmapPath}} (§Y done)
          - Update docs/logs/{YYYY}/{MM-DD}.md (plan-{YYYY-MM-DD-HHmm} entry)

          Plan: {{plansDir}}/{YYYY-MM-DD-HHmm}-...md
          ```
       - If code changes span multiple packages, emit multiple feat commits (split by package).
    c. **Failure handling** — if any `git commit` fails (pre-commit/Husky hook rejection, message format issue, staging problem):
       - Try to auto-fix the root cause and retry (e.g. fix lint/import-order/format issues, re-stage missing files). Up to 2 retries.
       - Never bypass hooks (`--no-verify`) or force anything (`--force`, reset shared refs).
       - If auto-fix fails after retries, leave the working tree as-is (preserve work) and emit `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` with the failure reason so the next run can pick up the uncommitted work.
    d. After all commits succeed, run `git log --oneline -5` to confirm the history

If this run achieved a full-green state (unit tests + e2e both passed completely), follow AGENTS.md: record it in `docs/logs/{year}/{month}-{day}.md`, mention `full-green verification` in the commit message, then commit.

## Ledger Verification pass lines (transition-period writer duty)

For a plan in the **ledger format** (YAML frontmatter with `status:`), after ALL commands pass and ALL commits are done, record the mechanical-verification evidence the engine derives completion from (01 §5.2; agent-written on engine flow authority until the M2 gate/writer law lands):

1. Compute the plan's current basis hash (from the project root; adjust the engine path if the engine is not at `tools/mission-driver`):

   ```
   node --input-type=module -e "const {readFileSync}=await import('node:fs');const {computeBasisHash}=await import('./tools/mission-driver/src/ledger-sections.mjs');console.log(computeBasisHash(readFileSync(process.argv[1],'utf8')))" {{PLAN_FILE}}
   ```

   The hash covers the frontmatter + all `## Phase` sections + `## Closure Findings` — write the pass lines LAST (after every checkbox tick and commit) so the hash cannot go stale; pass lines themselves live in `## Verification` and do NOT change the hash.

2. Append one pass line per command key listed in the plan's frontmatter `verify` array (e.g. `test`) to the plan's `## Verification` section (create the section after `## Closure Findings` / before `## Closure` if absent; append-only — never edit existing lines):

   ```
   - pass <commandKey> <runId> basisHash=<sha256-from-step-1> exit=0
   ```

   `<commandKey>` must be exactly a key from the plan's `verify` array (its command must have actually run green in this step); `<runId>` is any non-space run identifier (e.g. the run timestamp). Only write lines for keys that ran green — never fabricate a pass line.

3. Do NOT touch the frontmatter `status` (stays `active`; completion is derived) and do NOT write anything into `## Closure` (that is the independent closure auditor's receipt).

Legacy-format plans (`> Plan Status:` line): skip this section entirely — the legacy close path applies.

Your output MUST end with exactly one `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` marker. This is the only marker that is parsed; a missing or malformed marker triggers an additional correction run, so emit it exactly as shown.
