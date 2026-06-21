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

Closure audit must be a distinct independent pass performed by an independent subagent or reviewer. Self-review, self-audit, or self-recorded closure evidence cannot justify `Plan Status: completed`.

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

## Output Rule

Review results must be recorded durably for every created plan. Use a separate file when the audit is non-trivial, disputed, reusable, or likely to matter later.

Use `docs/skills/` for reusable prompt templates and `docs/logs/` for small audit notes attached to daily execution.

## Filename Guidance

Prefer dated filenames for audit records:

- `docs/audits/YYYY-MM-DD-HHmm-document-audit-topic.md`
- `docs/audits/YYYY-MM-DD-HHmm-draft-review-topic.md`
- `docs/audits/YYYY-MM-DD-HHmm-closure-audit-topic.md`
