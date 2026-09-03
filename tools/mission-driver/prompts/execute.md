Execute the plan at {{PLAN_FILE}}. Complete **the entire plan**.

Steps:
1. Read the plan file at {{PLAN_FILE}} **completely**. Detect its format: a plan with a YAML `---` frontmatter block carrying `status:` is the **ledger (new) format**; a plan with a `> Plan Status:` line is the **legacy format**. The instructions below give both modes where they differ.
2. Determine which Phases still need work. A Phase is unfinished if it contains ANY `- [ ]` item. Do not rely on status text alone (legacy-format plans: a Phase whose `Status:` says `completed` but still has `[ ]` items is INCONSISTENT — treat it as unfinished and execute it). Execute every unfinished Phase, in order.
3. After completing each Phase:
   a. Run `{{testCmd}}` to confirm tests pass. If the change is cross-module, also run `{{typecheckCmd}}` (whole workspace) to catch downstream breakage.
   b. Tick every `[ ]` item in that Phase (items AND its Exit Criteria) to `[x]`. Legacy-format plans ONLY: also set that Phase's `Status:` line to `completed` — both must happen together or the Phase re-triggers on the next run. Ledger-format plans have no per-Phase status line: ticking the boxes IS the phase-completion signal (derived, never written). If a Phase item depends on external evidence you cannot produce in this repo (live lint probes, transitive dependency records, third-party state), tick it `[x]` anyway and add a one-line `successor: <plan-id> trigger:<text>` annotation on the same line — that records the handoff honestly without blocking this plan's closure.
4. After all Phases are complete:
   a. Do NOT write `completed` anywhere. Legacy-format plans ONLY: set `> Plan Status:` to `completed` (with real closure evidence). Ledger-format plans: completion is DERIVED — leave `status: active` in the frontmatter untouched; the downstream BUILD_VERIFY step records `## Verification` pass lines and the CLOSURE_AUDIT step records `## Closure` dispatch/accepted receipts, and the engine derives completion from them. Writing `completed` into a ledger plan is forbidden.
   b. Read the work item from the plan (ledger format: frontmatter `work-item:`; legacy: its `> Work Item:` label) and update the relevant roadmap/backlog file (e.g. `{{roadmapPath}}`) — dual mode: on a checkbox roadmap tick the work item `- [ ]` → `- [x]`; on a legacy roadmap change the work item's status suffix / table cell to `done`.

If execution is interrupted or fails, that is fine — the plan records its own progress ([x]/[ ]), so the next run resumes from the breakpoint.
Do not skip steps — execute every unfinished Phase completely.

Notes:
- Honor `AGENTS.md`: read it **completely** and follow the project's component contract, code conventions, and build artifact rules.
- After code changes, run `{{typecheckCmd}} && {{buildCmd}} && {{lintCmd}} && {{testCmd}}` before declaring a Phase done. Skip any empty command. These four MUST run sequentially — never parallelize build/test commands across multiple shells (Maven `target/` races, lock contention on `node_modules`, etc.).

---

## Output marker (both modes)

Your output MUST end with exactly one `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` marker (`pass` = all phases executed and green; `fail` = execution blocked or tests red). 
