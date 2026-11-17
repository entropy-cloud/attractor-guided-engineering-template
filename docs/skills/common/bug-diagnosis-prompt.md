# Bug Diagnosis Prompt

Use this skill when the task is bug investigation and the failure is not yet explained by an obvious local defect.

This skill is for finding the real cause with a reproducible feedback loop before fixing code.

## Use When

- the bug report is real but the failing layer is unclear
- the symptom may be downstream of another subsystem
- the issue is intermittent, stateful, or timing-sensitive
- the first likely fix would otherwise be guesswork

## Do Not Use When

- the bug is already reduced to a clear one-line defect
- the task is mainly feature work, not diagnosis

## Required Inputs

- bug report or observed symptom
- relevant owner docs
- reproduction environment or closest available harness
- current verification commands

## Execution Pattern

1. Establish a tight feedback loop.
2. Reproduce the failure and reduce it to the smallest reliable case.
3. List 3-5 falsifiable hypotheses.
4. Run targeted experiments that eliminate hypotheses quickly.
5. Add or update regression proof before the fix when feasible.
6. Land the smallest correct fix.
7. Re-run verification and remove temporary instrumentation.

## Output

- confirmed root cause
- rejected hypotheses and why they were rejected
- regression proof path
- residual risks or follow-up items
