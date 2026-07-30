# Application Development Workflow

## Purpose

This document defines the default lightweight workflow for AI-assisted application development in `<project-name>`.

It exists because app-layer projects often fail before coding quality becomes the main issue:

- raw inputs are incomplete
- requirement boundaries are unstable
- prototype fidelity is mistaken for implementation readiness
- process records are missing
- teams jump from discussion straight to code

This workflow makes those failure modes explicit.

## Default Flow

For most small and medium app projects, use this path:

1. `context`
2. `backlog` when choosing work
3. `input`
4. `requirements`
5. `design`
6. `task routing and skill selection`
7. `plan` when planning triggers apply
8. `draft review` for created plans
9. `implementation`
10. `verification`
11. `closure audit` for created plans
12. `logs / bugs`

Use document audits, retrospectives, skill extraction, and extra testing notes only when the work is ambiguous, risky, or repeatedly failing.

## Optional Extended Layers

These are available but not mandatory for every task:

1. `discussion`
2. `document audit`
3. `retrospective`
4. `skill extraction`

Independent draft review and closure audit are not optional for created plans.

## Stage 0 - Read Context

Before non-trivial work, read:

- `docs/context/project-context.md`
- `docs/context/ai-autonomy-policy.md`
- `docs/context/codebase-map.md`
- `docs/context/source-of-truth-and-precedence.md`
- `docs/context/conventions.md`

If these files are empty or stale, update factual context before relying on the rest of the workflow. AI may make rules stricter, but must not loosen autonomy, remove blockers, mark stale docs fresh, or downgrade protected areas without human confirmation or human-approved owner-doc evidence.

For a direct user-requested local low-risk edit, backlog setup is not required if the change clearly fits the no-plan path and verification commands are real.

## Three-Step Control Loop

Use this as the main control loop for non-trivial work:

### A. Generate Design Docs

Split design output into two parts:

- pure requirement/app behavior design under `docs/requirements/` and `docs/design/`
- pure technical and architectural design under `docs/architecture/`

These files should reference each other when needed, but should not collapse into one mixed document.

After drafting substantial design documents, use an independent subagent or reviewer pass and revise until major objections are resolved.

### B. Generate The Plan From Design Docs

Write `docs/plans/` from the settled design baseline, not from raw source material alone.

After drafting a plan, use an independent subagent or reviewer pass and revise the plan directly until major objections are resolved.

### C. Audit Periodically

Use document audits at a frequency proportional to project risk. Plan audits and closure audits are mandatory for created plans.

## Stage 1 - Collect Raw Inputs

Store source material under `docs/input/`.

Typical sources:

- PM notes
- card-set documents
- prototypes
- existing system screenshots
- copied business rules
- external articles or references

Rule:

- keep source material close to its original meaning
- do not rewrite it into polished requirements too early

## Stage 2 - Clarify Ambiguity When Needed

If the source material is incomplete or contradictory, create a file under `docs/discussions/`.

Use this stage when:

- the PM is too busy to fully specify a complete round
- multiple interpretations seem plausible
- a prototype shows surface shape but not business rules
- developers would otherwise need to infer domain meaning directly from raw files

Output:

- open questions
- assumptions
- pending confirmations
- decisions that unblock synthesis

## Stage 3 - Synthesize Requirements

Convert clarified input into implementation-ready files under `docs/requirements/`.

This stage should answer:

- what is in scope now
- what is not in scope now
- what user-visible behavior is required
- what data, permissions, and business rules matter
- what remains unresolved

Rule:

- if the requirement is still not implementation-ready, do not pretend it is ready by writing a weak plan

## Stage 4 - Update Stable Design Baseline

Move durable decisions into owner docs.

- app-layer feature, role, page, and flow decisions go into `docs/design/`
- cross-cutting technical and module decisions go into `docs/architecture/`

Keep requirement/app design and technical architecture design separate, then cross-reference them.

These files should describe the current supported baseline, not a running negotiation transcript.

## Stage 5 - Audit The Documents When Needed

Before execution, audit the docs baseline only when the work is substantial, ambiguous, or risk-prone.

At minimum, challenge these risks:

- scope is too broad
- prototype details are mistaken for complete requirements
- key business rules are missing
- unresolved questions are hidden inside “nice looking” text
- stable owner docs and active requirements disagree

Use `docs/audits/` and the prompt templates under `docs/skills/`.

For high-risk or cross-boundary work, add a multi-dimensional audit pass.
When hidden problems are suspected outside the normal checklist, add an open-ended audit pass.
These audit-style prompts are generic defaults and MUST be customized after copy to match the real project's owner docs, protected areas, verification stack, and recurring failure patterns.

## Stage 6 - Route The Task And Select Skills

Before implementation, explicitly decide how the work should be executed:

- classify the task type
- confirm the owner docs that control the work
- check `docs/skills/README.md` for reusable method skills
- record `Skill: <name>` or `Skill: none` in the plan where relevant

If no existing skill clearly fits, proceed with the normal docs-driven workflow instead of forcing a weak skill match.

## Stage 7 - Write The Plan When Planning Triggers Apply

Create a plan under `docs/plans/` when work is more than a very small low-risk edit or when any planning trigger in the plan guide applies.

The only no-plan path is a local low-risk change that affects very few files, has clear existing behavior or tests, and does not touch contracts, data/model shape, auth, permissions, integrations, deployment, cross-surface behavior, or stale-doc conflicts. Larger local edits should use the full-plan path in the plan guide.

The plan should capture:

- current baseline
- goals
- non-goals
- task route and skill selection
- phased execution
- proof requirements
- closure gates

The plan should not become a low-level implementation design dump.

## Stage 8 - Audit The Plan

Before implementation, independently challenge every created plan.

The audit should test:

- is the scope honest
- are closure gates real
- are hidden dependencies missing
- does the plan silently rely on unresolved requirement gaps

If the audit finds blocking issues, revise the plan and repeat the audit until no major objection remains.

If structured draft review or closure audit repeatedly misses important issues, escalate with `multi-dimensional-audit-prompt.md` or `open-ended-audit-prompt.md` instead of repeating the same narrow review forever.

## Stage 9 - Implement Small Complete Slices

Implement the smallest complete slice that produces a real supported result.

Rules:

- do not optimize for demo breadth
- do not create large placeholder surfaces just to look complete
- prefer one real feature slice over five weak page shells

## Stage 10 - Verify

Run the real verification commands for the repo.

Capture additional proof in:

- `docs/testing/` for manual or exploratory proof
- `docs/bugs/` for non-obvious regressions
- `docs/logs/` for dated landing records

Rule:

- every non-trivial bug fix should add or update automated test coverage

## Stage 11 - Independent Closure Audit

Work tracked by a plan is not automatically closed just because the implementing agent says so.

Closure requires an independent re-check against:

- live code
- current docs
- verification results
- stated closure gates

If the plan is not really closed, keep it open. Self-review or self-recorded closure notes do not replace this independent closure pass.

## Stage 12 - Retrospective When Needed

If prototype and implementation still diverged, or if the first requirement set missed key reality, write a retrospective under `docs/retrospectives/`.

Good retrospective questions:

- what source input was missing
- what requirement decision was postponed too long
- what assumption looked reasonable but failed in implementation
- what should move earlier in the workflow next time

## Stage 13 - Skill Extraction When Needed

If the same issue keeps happening, convert it into a reusable prompt or audit playbook under `docs/skills/`.

Examples:

- requirement gap analysis prompt
- plan audit prompt
- closure audit prompt
- multi-dimensional audit prompt
- open-ended audit prompt
- reusable review checklist for a repeated method or audit pattern

If the output is more of a reusable engineering lesson than a prompt, record it under `docs/lessons/`.

If the same error pattern keeps recurring, do not stop at prose-only memory. Evaluate whether it should be promoted further into a heuristic script, static check, lint rule, CI guard, or codemod. These checks are project-specific and should be tuned to the copied project's real false-positive tolerance, naming conventions, protected areas, and verification model.

## Relationship To Spec-Driven Development

Spec artifacts can still be useful.

But this workflow does not assume a single `proposal -> design -> task` shape can own all project knowledge.

Why:

- app-layer projects need both time-sensitive execution docs and always-current owner docs
- raw inputs, discussions, analyses, and retrospectives do not naturally fit one rigid spec artifact
- spec-only workflows often drift into task completion without clarifying the system’s longer-term shape

Use specs if helpful, but keep docs split by responsibility.

## Recommended Small/Medium Project Loop

For most non-trivial tasks, the default loop is:

1. read or update context
2. write or update input/requirement files
3. update design or architecture docs if the supported baseline changed
4. write or update a plan when planning triggers apply
5. audit the plan
6. implement
7. verify
8. run closure audit for created plans
9. record logs and bug notes when needed

Add document audits, retrospectives, and reusable skills only when the problem pattern justifies the extra process.

Even in the lightweight path, keep the file-in/file-out rule: important instructions, plans, and conclusions should land in files, not only in chat.
