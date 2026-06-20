Ensure the project is healthy before starting work: typecheck, build, and tests must pass for mission '{{missionName}}'.

Steps:
1. Run `{{typecheckCmd}}`
2. Run `{{buildCmd}}`
3. Run `{{testCmd}}`
4. If any of the above fail:
   a. Diagnose the root cause (TypeScript error, failed assertion, missing dependency, etc.)
   b. Fix the issue
   c. Re-run the failing command(s) to confirm green
5. Repeat until all three pass or you cannot fix the issue

Notes:
- If a command is empty or errors with "No script named ...", treat it as a pass for that command and continue.
- If the failure is clearly cross-package, also run the whole-workspace typecheck/build to catch downstream breakage.

Return results in the following format: `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>`.
