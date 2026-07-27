# Codebase Map

## Purpose

This file gives AI agents a compact map of the live repository so they do not rediscover the structure by repeatedly searching imports and directories.

Keep it current enough to route common work. Do not turn it into a full architecture document.

## Entry Points

Replace placeholders after copying the template.

| Area         | Path     | Notes     | Last Verified  | Confidence |
| ------------ | -------- | --------- | -------------- | ---------- | ------ | ----- |
| Frontend app | `<path>` | `<notes>` | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Backend app  | `<path>` | `<notes>` | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Shared code  | `<path>` | `<notes>` | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Tests        | `<path>` | `<notes>` | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Config       | `<path>` | `<notes>` | `<YYYY-MM-DD>` | `<high     | medium | low>` |

## Common Change Routes

| Task Type           | Start Here | Then Check | Verification | Last Verified  | Confidence |
| ------------------- | ---------- | ---------- | ------------ | -------------- | ---------- | ------ | ----- |
| Add page/screen     | `<path>`   | `<path>`   | `<command>`  | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Add API/handler     | `<path>`   | `<path>`   | `<command>`  | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Change model/schema | `<path>`   | `<path>`   | `<command>`  | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Change permissions  | `<path>`   | `<path>`   | `<command>`  | `<YYYY-MM-DD>` | `<high     | medium | low>` |
| Fix UI behavior     | `<path>`   | `<path>`   | `<command>`  | `<YYYY-MM-DD>` | `<high     | medium | low>` |

## Large Or Fragile Files

List files that agents should treat carefully because they are large, central, generated, or easy to edit incorrectly.

| Path     | Risk     | Preferred Approach |
| -------- | -------- | ------------------ |
| `<path>` | `<risk>` | `<approach>`       |

## Project-Specific Search Hints

- Use file patterns: `<example glob>`
- Use content anchors: `<important function/type/component names>`
- Avoid editing generated files: `<paths or none>`

## Update Rule

Update this file when a change creates a new major entry point, moves common code, adds a new test location, or repeatedly causes agents to rediscover the same path.

If a listed path is missing, placeholders remain, or live imports contradict this map, do not treat the map as authority. Verify with the live repo, then update the map or mark the row low confidence before implementation.

If `Last Verified` is old for the project's pace, predates major structural changes, or the task touches a listed route's boundary, verify the live repo before relying on the row. Low-confidence rows do not block low-risk work after live verification, but protected-area, migration, or cross-module work should update the row before implementation.
