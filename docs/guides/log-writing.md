# Development Log Writing Guide

Development log entries are organized by date, with one file per day.

## Purpose

Each daily log captures short dated notes about:

- What document was added or updated
- What design decision was made
- What work is planned next
- Small context useful to remember later but not belonging in formal architecture docs

## Rules

- **One file per day** - all work on the same day goes into the same file
- **Append new entries** - add new `### YYYY-MM-DD` sections at the top of the file (reverse chronological)
- **Keep entries short** - prefer bullet points, link to main docs or code paths
- **Not source of truth** - this is lightweight context, not normative architecture
- **Link to real docs** - when referencing a design decision, link to the architecture doc or code path
- **Treat log files as append-only history** - file length alone is not a defect; do not flag daily logs just because they grow beyond the active-doc size guideline

## Path Convention

- `docs/logs/{year}/{month}-{day}.md`

## Entry Format

```markdown
# Development Log - YYYY-MM-DD

### YYYY-MM-DD

- Brief description of what happened.
- Link to doc or code path: `docs/architecture/xxx.md` or `src/foo/bar.ts:42`
- Key decision: ...
- Next step: ...
```

## Adding A New Entry

1. Open `docs/logs/{year}/{month}-{day}.md` (create it if it does not exist)
2. Add a `### YYYY-MM-DD` section at the top, before any existing entries
3. Write the new bullets
4. If the day already has earlier entries, append after a blank line separator
