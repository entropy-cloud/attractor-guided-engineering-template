# Code Refactor Discovery Prompt

Use this skill to discover refactoring candidates before changing structure.

## Scan Dimensions

1. oversized files
2. duplicate or unconverged logic
3. hidden cross-module coupling
4. mixed responsibilities in one module
5. fragile async or lifecycle patterns
6. boundary violations between layers
7. tests that mirror implementation instead of contract
8. stale compatibility residue
9. docs/code drift around the changed area

## Review Rules

- do not propose refactors just because code looks busy
- prioritize structural risks that will keep recurring
- separate behavior-preserving refactors from contract changes
- name the concrete payoff: split, merge, isolate, unify, or delete

## Expected Output

- candidate list with evidence
- why each candidate matters
- suggested ordering
- explicit note when no worthwhile refactor is justified
