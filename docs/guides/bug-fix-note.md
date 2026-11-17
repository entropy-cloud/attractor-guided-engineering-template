# Bug Fix Note Writing Guide

## Purpose

Use `docs/bugs/` for non-obvious regressions, subtle root causes, and fixes that should influence future review.

The goal is not to repeat the full diff. The goal is to preserve what went wrong, how it was found, why it happened, and how it is protected from returning.

## When To Write A Bug Note

Write one when at least one of these is true:

- the bug had a non-obvious root cause
- the bug crossed module or package boundaries
- the bug looked like one thing but was actually caused by another layer
- the fix added or changed regression tests
- future refactors could easily reintroduce the same problem

Do not write one for every tiny typo or trivial one-line fix.

## Required Sections

Each bug note should include these sections. Keep each section short.

### 1. Problem

Describe the observed symptom in 2-5 lines. Include what broke, where, the smallest reproducible behavior, and the impact or severity (affected users, data integrity, blast radius).

### Reproduction

Describe the required environment state and triggering action so a future reader can reproduce. Include the exact steps, any preconditions (e.g., "must be logged in as admin", "requires 2000 concurrent requests"), and a minimal reproduction script if applicable.

### 2. Diagnostic Method

This section is mandatory. Describe how the issue was located, not only the final root cause.

Include:

- what made diagnosis difficult
- what was inspected first and why
- what hypotheses were tested and rejected (required if diagnosis was non-trivial)
- what direct evidence confirmed the true cause

If diagnosis was straightforward (single smoking-gun metric or log), state that explicitly and explain why no iteration was needed — e.g., "the crash stack trace pointed exactly at the return statement in our code (frame 2 was ours)". Otherwise, include at least one alternative path that was ruled out.

### 3. Root Cause

Explain the real cause in 1-3 bullets. Mention the actual module or subsystem involved. If the bug had multiple causes, separate them clearly.

**Boundary rule:** Diagnostic Method covers the investigation _process_ and evidence trail. Root Cause covers the mechanistic _explanation_ of why the bug occurred in terms of system internals. The two sections should not repeat the same information. For bugs where the investigation directly reveals the mechanism (the causal link IS the evidence trail), the two sections may be merged under `*Diagnosis & Root Cause` with a note explaining why.

### 4. Fix

Explain the solution in terms of design intent, not line-by-line code changes. Include what changed, where, and why it addresses the root cause.

### 5. Tests

List the regression coverage added or updated. Include the test file path, what the test protects, and the test level (unit / component / integration / e2e). For e2e-only coverage, explain why lower levels are not feasible.

If automated testing is impractical (race conditions, timing, third-party dependency), document the manual verification procedure and state explicitly why an automated test was not added.

### 6. Affected Artifacts

List the code files, config files, deployment manifests, or infrastructure definitions that were changed. Use `path/to/file.ts:line-numbers` format with a brief annotation. Do not paste large diffs.

### 7. Notes For Future Refactors

Add 1-3 bullets describing what future changes should be careful not to break. Name a concrete code pattern in the affected artifacts and a concrete mistake scenario (e.g., "if someone swaps the pool library, the new driver may rely on `finalize()` instead of explicit `close()`"). This section is important because the main value of these notes is long-term memory.

### 8. Prevention Gap (optional)

Add 1-2 bullets on what review, test, or process step was missing that let this bug ship. This is about systemic gaps, not individual blame. Example: "no load test exercised the 2000-concurrent-request path" or "no route-based navigation test existed for this page."

## Recommended Template

```md
# 0X Short Bug Fix Title

## Problem

- what broke
- where it broke
- minimal visible symptom
- impact or severity

## Reproduction

- environment and preconditions
- triggering steps
- minimal reproduction script if applicable

## Diagnostic Method

- diagnosis difficulty (why this was hard, or "straightforward")
- investigation path (what was checked first)
- rejected hypotheses (if diagnosis was non-trivial)
- decisive evidence that confirmed the issue

## Root Cause

- actual cause 1
- actual cause 2
- (may merge with Diagnostic Method as `*Diagnosis & Root Cause` if the evidence trail IS the mechanism)

## Fix

- main change 1
- main change 2

## Tests

- `path/to/test-file` - what it verifies (level: unit/component/integration/e2e)
- if no automated test: manual verification steps and reason

## Affected Artifacts

- `path/to/file:lines` - annotation

## Notes For Future Refactors

- risk or invariant 1 (concrete pattern + concrete mistake scenario)
- risk or invariant 2

## Prevention Gap (optional)

- what review/test/process step was missing
```

## Filename Guidance

For small and medium projects, either style is acceptable:

- numbered: `docs/bugs/01-short-bug-name.md`
- dated: `docs/bugs/YYYY-MM-DD-HHmm-short-bug-name.md`

If you expect bug notes to become a long-lived reference library, prefer numbered filenames.

## Validation Checklist

Before committing a bug note, verify:

- [ ] Problem includes impact or severity
- [ ] Reproduction includes environment, trigger, and minimal steps
- [ ] Diagnostic Method describes the investigation _process_, not just the cause
- [ ] Diagnostic Method includes rejected hypotheses (or explicitly states "straightforward" with reason)
- [ ] Root Cause names the specific module or subsystem; or merged section is annotated
- [ ] Fix explains _why_ the change works, not just _what_ changed
- [ ] Tests include test level (unit/component/integration/e2e), or documents manual verification with explicit reason
- [ ] Notes For Future Refactors names a concrete pattern and a concrete mistake scenario

## Other Rules

- Every non-trivial bug fix should add or update automated test coverage.
- If a bug note is created, include the test proof path or verification evidence.
- Use `docs/architecture/` for current design truth, `docs/bugs/` to remember important failures and why the fix exists.
