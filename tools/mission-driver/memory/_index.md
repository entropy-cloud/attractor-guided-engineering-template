---
scope: mission-driver
kind: self-memory-index
lesson_count: 7
updated: 2026-08-04
---

# Mission-Driver Self-Memory Index

Top procedural rules the mission-driver engine injects into draft / execute /
closure-audit prompts via `{{selfMemoryIndex}}`. This file is **runtime-generated
and maintained by `mission-driver analyze`** (the `--analyze-run` postmortem
command). It consolidates durable lessons under a consolidate-don't-accumulate
protocol.

This template copy ships **empty** — rules accumulate as real runs are analyzed.

## Rules

_No rules promoted yet — 7 lessons exist in `lessons.md` (L001–L007). L004 is now
`count: 3` (recurring across 3 runs) but SEV3, so it still does not meet the
high-severity + recurring (`count >= 2`) promotion bar. L005 is SEV2 but `count: 1`.
L006 (template-var scope leak: `{{backlogDir}}` only injected for brief/draft, not
the audit loop) and L007 (host low-RAM preflight before DEEP_AUDIT) are new SEV3
entries. Top rules will be lifted here once a high-severity lesson recurs across runs._
