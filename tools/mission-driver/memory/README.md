# `memory/` — Mission-Driver Reflexion Memory

Runtime-generated, git-versioned memory for the mission-driver self-improvement
loop. **Do not hand-edit the rule content** except to correct a stale rule; the
`mission-driver analyze <run-dir>` command owns this directory.

## Files

- `_index.md` — the always-injected core of top procedural rules. Injected into
  prompts as `{{selfMemoryIndex}}`. Consolidated, not accumulated.
- `lessons.md` — accumulating procedural lessons (created on first analysis).
- `runs.md` — episodic index of analyzed runs (created on first analysis).

## Notes

- `readMemoryIndex()` degrades to `""` when a file is absent, so a fresh
  template with only `_index.md` present is fully functional.
- Per-module domain memory lives in the host project at
  `docs/memory/<module>/_index.md` (injected as `{{moduleMemoryIndex}}`), not
  here.
