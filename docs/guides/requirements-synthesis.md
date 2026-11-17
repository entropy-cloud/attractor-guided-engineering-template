# Requirement Synthesis Guide

## Purpose

Use this guide to convert raw inputs into implementation-ready requirements.

## Inputs

- `docs/input/` raw materials
- `docs/discussions/` clarification notes
- existing `docs/design/` and `docs/architecture/` owner docs

## Output Expectations

A requirement file should clearly state:

- goal
- scope
- non-goals
- core user flows
- business rules
- permissions or role impact
- edge cases already known
- unresolved questions
- acceptance criteria

## Rule

Do not hide unresolved ambiguity behind polished language. Write it down explicitly.

## Implementation-Ready Gate

A requirement is implementation-ready only when these are true:

- [ ] in-scope behavior is concrete enough to build without guessing user-visible behavior
- [ ] non-goals are explicit
- [ ] primary user flow is described
- [ ] roles/permissions are covered or explicitly not relevant
- [ ] data/model impact is covered or explicitly not relevant
- [ ] API/integration impact is covered or explicitly not relevant
- [ ] empty, loading, error, and permission-denied states are covered where user-visible
- [ ] acceptance criteria are testable
- [ ] open questions are either non-blocking or explicitly block implementation

Stop and ask for clarification if an open question changes user-visible behavior, data/model shape, API behavior, auth/permission behavior, or external integration behavior.

## Minimal Requirement Skeleton

```md
# Feature: <name>

## Goal

## In Scope

## Out Of Scope

## Main User Flows

## Business Rules

## Roles / Permissions

## Edge Cases

## Open Questions

## Acceptance Criteria
```
