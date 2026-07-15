Perform a lightweight health gate before starting work for mission '{{missionName}}'.

CHECK is a fast gate, NOT a full build. Its only job is to confirm the workspace is usable before the mission loop begins. Full build + test + commit is the responsibility of the BUILD_VERIFY step; CHECK does NOT duplicate that work and does NOT auto-repair anything.

> If you need to understand the repository structure, you may read `{{contextDir}}/project-context.md` — but CHECK must stay fast and must NOT turn into a codebase exploration.

Steps:
1. Run `git status --porcelain` in the project root.
2. If the command itself fails (not a git repo, git missing), that is a real environment problem → emit `fail`.
3. Interpret the output:
   - Clean working tree (no output) → `pass`.
   - Dirty working tree (modified/untracked files) → `pass`. A dirty tree is normal in iterative development — the mission works on top of whatever state the repo is in.
   - Merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in tracked files → `fail`. The mission cannot proceed safely with unresolved conflicts.
4. Do NOT run the mission's build or test commands here. Do NOT attempt to diagnose-and-fix-and-rerun in a loop. CHECK never modifies the repo.

Philosophy: CHECK asks "can the mission safely proceed?" not "is the tree perfectly clean?" When in doubt, prefer `pass` — a dirty tree is a warning, not a blocker.

Notes:
- CHECK runs once at mission entry (it is the flow `entry`, no transition returns to it).
- The authoritative build health gate is BUILD_VERIFY; CHECK must stay out of its lane.

Your output MUST end with exactly one `<AI_STEP_RESULT>pass</AI_STEP_RESULT>` or `<AI_STEP_RESULT>fail</AI_STEP_RESULT>` marker. 
