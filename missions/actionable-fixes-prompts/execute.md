Execute the plan at {{PLAN_FILE}}. Complete **the entire plan**.

## CRITICAL: Strict Single-Plan Scope

You are executing **ONE plan only** — the file at `{{PLAN_FILE}}`. 

This mission has 4 work items, each with its own plan. Each plan runs in its own subflow. **You must NOT make changes described in other plans.** If the plan you are executing says "add alias X to file Y", do ONLY that — do not also make changes from sibling plans that happen to touch the same files.

Previous runs failed because the EXECUTE agent made changes from ALL plans simultaneously, producing incomplete code that broke tests. This wastes hours of model calls. **Stay in your lane.**

If you discover related work that is NOT in this plan's phases, output a note but do NOT execute it.

## Steps

1. Read the plan file at {{PLAN_FILE}} **completely**.
2. Determine which Phases still need work (any `- [ ]` item = unfinished). Execute every unfinished Phase, in order.
3. After completing each Phase:
   a. Run `{{testCmd}}` to confirm tests pass.
   b. Tick every `[ ]` item in that Phase to `[x]` AND set its `Status:` to `completed`.
4. After all Phases are complete:
   a. Update the plan's `Plan Status` to `completed`.
   b. Update `{{roadmapPath}}`: change the corresponding work item to `done`.

If execution is interrupted, the plan records its own progress ([x]/[ ]), so the next run resumes from the breakpoint.

## Mission-Specific Constraints

This mission modifies the mission-driver engine itself. Key constraints:

- **Flow JSON (`flows/mission-driver.json`) is a protected area** (`ask-first`). Changes to transitions, markerAliases, or step definitions must be covered by the plan's Decision section. Do NOT improvise additional flow changes beyond what the plan specifies.
- **`src/context-map.mjs` drift gate**: if the plan adds a delegate var in `main.js`, the plan MUST also include a step to register it in `EXPECTED_VARS` + `VAR_PROVENANCE`. If the plan doesn't mention this but you added a var, add the registration — otherwise `pnpm test` fails.
- **`prompt-check.mjs`**: if the plan adds a new marker to a prompt's `<AI_STEP_RESULT>` example, the marker must exist as a transition key or markerAlias in the step's flow. Verify with `pnpm --prefix tools/mission-driver run lint:prompts`.
- **Zero npm dependencies**: never add to `tools/mission-driver/package.json` `dependencies`.

After code changes, run `{{typecheckCmd}} && {{buildCmd}} && {{lintCmd}}` before declaring a Phase done.

---

## Output marker

Your output MUST end with exactly one `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` marker (`pass` = all phases executed and green; `fail` = execution blocked or tests red).
