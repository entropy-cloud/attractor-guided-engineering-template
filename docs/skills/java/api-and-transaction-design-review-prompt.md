# API And Transaction Design Review Prompt (Java Backend)

Use when an API + transaction design needs independent review before implementation. The earlier this runs, the cheaper its findings.

## Project Customization Layer

<!-- Customize after copying: framework versions, transaction conventions, error taxonomy, compat policy, migration rules, known failure modes. -->

- Protected areas:
- Known failure modes:
- Verification commands:
- Error taxonomy doc:
- API compatibility policy:

## Inputs

- the design doc / interface definitions (controller, service, repository layers as designed)
- the module-boundary owner doc
- the data model / schema files involved
- the requirement the design serves

## Review Dimensions

Challenge across these dimensions; every finding cites evidence:

1. **Contract fitness**: request/response model matches the requirement (no invented fields, no missing error cases); validation rules explicit; pagination/filtering conventions followed; versioning per compat policy.
2. **Transaction boundaries**: where does each transaction start/commit? Are boundaries aligned with invariants (not too wide: locks held over remote calls; not too narrow: partial commits)? Retry/idempotency designed for at-least-once callers?
3. **Consistency & concurrency**: isolation level justified; optimistic vs pessimistic locking chosen deliberately; unique constraints back the invariants the code assumes; lost-update and double-submit paths addressed.
4. **Failure paths**: error taxonomy applied (business vs technical vs third-party); rollback/compensation for multi-step writes; timeout and circuit-breaker policy on every remote call; poison-message handling.
5. **Data impact**: schema/migration needed? Backwards compatibility of stored data; index impact of new query shapes; migration rollback stated.
6. **Module boundaries**: does the design reach across modules it does not own? Cross-module access goes through the sanctioned surface, or the boundary doc is updated in the same change.
7. **Observability**: what gets logged/metered at each failure class; can an on-call engineer reconstruct a failed business operation from logs alone?

## Output

Severity-ordered findings (P0 blocker … P3 nit), each with dimension, evidence (doc section / interface signature), and a concrete revision target. End with a verdict: `approve | approve-with-follow-ups | revise`.

A design without an explicit answer for dimension 2 and 3 for every write path is not approvable — that is the historical root of the hardest production defects.
