# Audit Execution Guide

## Purpose

This guide defines the default audit checkpoints for app-layer development.

Independent draft review and closure audit are mandatory for created plans.

Every created plan must record durable review evidence in at least one place. Default practice: keep draft-review evidence in the plan itself as a short `Draft Review Record` note, keep closure evidence in the plan `## Closure` section, and use the daily log or a file under `docs/audits/` only when extra traceability is useful. Do not leave review results only in chat.

Cold replay is not a second reviewer and cannot approve plan creation, plan closure, or protected-area scope changes by itself.

## Three Default Audits

1. document audit
2. draft review
3. closure audit

These are audit objects.

The project may also apply audit styles across those objects:

- multi-dimensional audit - challenge the work across several dimensions at once
- open-ended audit - search for hidden issues beyond the standard checklist

Examples:

- multi-dimensional draft review
- open-ended closure audit

The template provides generic default prompts for these styles under `docs/skills/`. Copied projects should tune those prompts to their own owner docs, protected areas, verification stack, and known failure modes.

## Document Audit

Run after requirement/design updates and before large implementation work.

For high-risk, cross-module, or cross-doc work, consider layering `multi-dimensional-audit-prompt.md` on top of the normal document audit.

Check for:

- missing scope boundaries
- unresolved questions disguised as settled requirements
- mismatch between raw input and synthesized requirement
- mismatch between requirement and owner docs

## Draft Review

Run after writing a plan and before implementation.

If the plan crosses multiple owner-doc boundaries, protected areas, or verification surfaces, add `multi-dimensional-audit-prompt.md`.

Check for:

- dishonest closure gates
- hidden dependencies
- unowned leftovers
- plan scope that still depends on unresolved requirements
- missing proof strategy for each acceptance criterion
- missing or weak task routing and skill-selection rationale in the plan

## Closure Audit

Run after implementation and verification for every created plan.

If normal closure checks keep passing while hidden regressions or weak proof still appear later, add `open-ended-audit-prompt.md`.

Closure audit is a distinct independent pass, not executor self-review or reuse of the draft reviewer. Current-payload acceptance and one-plan delivery follow `roadmap-goal-workflow.md`; this guide owns the audit method, not Git mechanics.

Check for:

- live behavior really landed
- docs are aligned
- claimed proof actually exists
- plan closure gates are truly satisfied
- no in-scope item was downgraded to a vague follow-up
- verification failures are not being treated as non-blocking without explicit adjudication

Draft-review findings should revise the plan directly. Do not require a formal `## Plan Audit` section in every plan.

Minimum durable draft-review evidence:

- reviewer / agent
- verdict
- concise revision summary or rationale for the final shape

Keep this evidence in a short `Draft Review Record` section inside the plan by default. Escalate to `docs/logs/` or `docs/audits/` only when the review is non-trivial, disputed, reusable, or likely to matter later. The canonical expectations for when a plan is `draft`, `active`, and `completed` belong in the plan guide.

## Finding Format And Disposition

Findings are the product of every audit. Their format and disposition path are fixed so findings can never become dead accounts — the historically proven failure mode: reports pile up, findings never get dispositioned, the same P1 rolls forward across audit rounds.

### Severity Scale

| Level | Meaning | Calibration |
| --- | --- | --- |
| `P0` | blocker — wrong/unsafe behavior likely, or a format-law violation | always blocks the verdict |
| `P1` | major — contract/scope gap that will resurface as rework or a live defect | blocks unless explicitly adjudicated with rationale |
| `P2` | minor — clarity, consistency, robustness | never blocks; must still get a carrier |
| `P3` | nit | may be recorded without a carrier when purely cosmetic |

Verdict calibration: `pass` = zero P0 and zero unadjudicated P1. Minors never block.

### Finding Entry Format

Every finding carries: **anchor** (file + section/symbol — not bare line numbers), **evidence** (quoted or reproduced), **severity + rating rationale** (why this level), **why-new** (checked against existing findings, bug notes, and work items — dedup), and a **suggested carrier**. A finding without these fields is incomplete.

### Disposition: Carrier, Not Report

**The audit report is evidence and is frozen after writing.** Disposition status lives only at the carrier — never annotated into the report later, never re-maintained in a report header, never duplicated into logs:

1. Every P0–P2 finding MUST name exactly one carrier: an unchecked roadmap work item, a defect-ledger row (high-volume projects that run one), or the fixing plan (when the audit is part of a plan loop). **Closure gate: findings without a carrier = 0.**
2. Disposition progress = the carrier's own state (roadmap checkbox / ledger status). The report's per-finding `Disposition:` line carries a single pointer written once at recording time (`Disposition: → WI9`); it is never updated afterwards.
3. Report-level "processed" status is **derived, never written**: a report is fully handled when every finding's carrier is closed. Do not add remediation-progress headers to reports — that is a second status surface and it drifts.
4. Inline receipts with `findings=items` (roadmap `## Deep Audit Record` or a plan receipt): the findings land as unchecked roadmap work items **in the same edit that records the receipt**. Recording findings without landing carriers is a format violation.
5. High-volume projects (audit rounds producing dozens of findings) may adopt a defect ledger as the carrier of choice: one row per finding; the status column carries closure evidence (date + WI + commit); closed rows rotate to an append-only history file. The ledger then replaces roadmap WIs as the sanctioned carrier — still exactly one disposition writer.

### Stored Audit Reports

When an audit outgrows the inline receipt (non-trivial, disputed, reusable): store it under `docs/audits/{year}/` as a dated file, or as a round directory `docs/audits/{year}/<YYYY-MM-DD-HHmm>-<style>-<label>/` with fixed numbering (`00-README.md` coverage account + verdict, `01-summary.md`, `02-findings-<domain>.md`) when it spans multiple files or domains. Finding IDs inside a round are namespaced by the round directory — bare counters never reset across rounds.

## Output Rule

Review results must be recorded durably for every created plan. Use a separate file when the audit is non-trivial, disputed, reusable, or likely to matter later.

Use `docs/skills/` for reusable prompt templates and `docs/logs/` for small audit notes attached to daily execution.

## Filename Guidance

Audit records are the highest-volume record class — store them under a year subdirectory with dated filenames:

- `docs/audits/2026/2026-05-21-1410-document-audit-user-management.md` <!-- doc-ref: example reason="filename illustration" -->
- `docs/audits/2026/2026-05-21-1420-draft-review-checkout-flow.md` <!-- doc-ref: example reason="filename illustration" -->
- `docs/audits/2026/2026-05-22-0900-closure-audit-order-list.md` <!-- doc-ref: example reason="filename illustration" -->

Create the `{year}/` directory with the first record of the year (see `docs/guides/doc-organization.md` Volume Partitioning).
