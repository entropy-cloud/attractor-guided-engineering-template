# Code Quality Audit Prompt

Use this skill when reviewing a changed area for real implementation quality rather than style-only feedback.

## Focus Areas

1. Architecture and boundary integrity
2. Core implementation correctness
3. Type and contract quality
4. Error handling and operational safety
5. Test effectiveness
6. Maintainability and future change risk
7. Automation and guardrail coverage

## Review Rules

- findings first, ordered by severity
- prefer concrete behavioral risk over abstract taste
- cite file paths and line references when possible
- distinguish confirmed defects from suggestions
- if no findings are present, state that explicitly and name residual gaps

## Severity Guide

- P0: data loss, security break, production-down class issue
- P1: user-visible correctness bug or strong regression risk
- P2: maintainability or test gap likely to cause future regressions
- P3: minor quality issue with low immediate risk

## Expected Output

- findings list
- open questions or assumptions
- short change summary only after findings
