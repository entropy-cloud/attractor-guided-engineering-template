# Backend Regression Audit Prompt (Java Backend)

Use when a backend change claims completion and needs an independent regression-oriented audit before closure — complementing (not replacing) the plan closure audit.

## Project Customization Layer

<!-- Customize after copying: verification commands, test conventions, known regression classes of this codebase. -->

- Verification commands (from `docs/context/project-context.md`):
- Test conventions:
- Known regression classes:

## Inputs

- the actual diff (all files, not only Java sources — configs, migrations, scripts)
- the plan and its exit criteria
- the owner docs the change touches
- the verification evidence claimed

## Audit Checklist

For each item, verify against the diff and runtime evidence — assertions without traces are findings:

1. **Behavioral completeness**: every exit criterion maps to landed behavior (not signature existence); error paths are implemented and tested, not only the happy path.
2. **Concurrency & timing**: new shared state, cache entries, scheduled jobs, or async paths — are race windows, duplicate delivery, and ordering addressed?
3. **Resource discipline**: connections, streams, transactions closed on all paths; no N+1 query patterns introduced; bulk operations bounded.
4. **Cache & state invalidation**: every new write path invalidates what it invalidates; TTL assumptions written down.
5. **Config & environment**: new config keys have defaults or documented bootstrap; no environment-specific values hardcoded; profile matrix still boots.
6. **Data & schema**: migration tested both directions where feasible; existing data passes new validation; idempotent re-run.
7. **Backwards compatibility**: old clients/callers of changed interfaces still function, or the break is declared per policy and documented.
8. **Test honesty**: new tests assert behavior, not implementation shape; verification commands actually ran (traces present); scoped passes labeled as scoped.
9. **Doc alignment**: owner docs and architecture docs updated in the same change, or `No owner-doc update required` recorded with reason.

## Output

Closure-oriented findings: each with severity, evidence (diff hunk, test, trace), and required action. Verdict: `closed | gaps-remain` with the gap list. Findings that reveal a recurring pattern get a promotion recommendation (lesson → prompt → check script).
