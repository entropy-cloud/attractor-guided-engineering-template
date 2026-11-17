# Consumer Receipt Success Is Not Accepted Git Delivery

## Problem

The standalone receipt checker could report success for mismatched review/audit ids, and `## Closure Findings` could shadow `## Closure`. Draft activation only warned about missing review. Meanwhile consumers lacked a safe one-plan delivery tool: receipt text could be mistaken for acceptance of later edits, or a path-level add could sweep human pending changes into the commit. This is a major workflow correctness gap.

## Reproduction

In a disposable Git repository, construct an active ledger with a dispatch for one id and a conclusion for another; invoke `plan-status --check`. A second case puts Closure Findings before Closure. For delivery, accept a payload and then add another pending work item to its shared roadmap before committing. Regression fixtures in `tools/plan-status.test.mjs` and `tools/commit-plan.test.mjs` construct these inputs; they do not simulate a host's document-edit tool.

## Diagnostic Method

Read the integrated external checker rather than discarding it. Its independent regex searches counted review lines without pairing ids/verdicts, closure searched a heading prefix, and accepted lines were not tied to latest dispatch. This directly explained false success. Considered engine-parser reuse, but rejected it as the sole standalone solution: the engine is optional and its explicit-completed/default-command shortcuts differ from strict consumer delivery. Host/native source inspection also ruled out assuming separate step names prove separate auditor sessions.

## Root Cause

- Raw status, receipt integrity, plan acceptance and actual Git payload delivery were conflated.
- Whole-path ownership was implicit, and no content-bound verification/audit contract existed for automatic delivery.

## Fix

Share a small read-only consumer interpretation between inventory/checking and delivery. Keep `--check`, but pair latest receipts and report delivery eligibility separately. Bind required verification and independent audit to an explicit-path payload digest; exclude only documented finalization metadata. A normal coordinator commit records `AGE-Plan` once, with content/path checks on retry. Whole-file ownership is independently reviewed; mixed files block rather than being silently swept in. Task-document edits remain built-in-tool operations, not helper-generated rewrites.

## Tests

- `tools/plan-status.test.mjs`: unit/CLI receipt pairing, multiword verdicts, real counting domains, verify evidence, actor separation, activation denial and historical inventory.
- `tools/commit-plan.test.mjs`: disposable Git integration for first delivery/nonrecursive retry, later payload edits, same-file pending additions, unrelated index/worktree state, unsafe paths and hook failure/mutation.
- `tools/workflow-contract.test.mjs`: routing/prompt contract and default installed-consumer standalone imports. This is not a host scheduler/write-protection test.

## Affected Artifacts

- `tools/consumer-ledger.mjs:1` — shared read-only interpretation.
- `tools/plan-status.mjs:1` — retained receipt interface and inventory/admission corrections.
- `tools/commit-plan.mjs:1` — explicit-path delivery and idempotent Git receipt.
- `docs/guides/roadmap-goal-workflow.md:1` — consumer procedure, metadata boundary and actual backend limits.

## Notes For Future Refactors

- Preserve exact section matching; prefix lookup must not treat Closure Findings as Closure.
- Do not turn receipt success into Git eligibility or exclude entire shared roadmap/log files from payload checks.
- Keep delivery out of hooks and task-document writers: its own commit hash must not produce another plan edit/commit.
