---
status: draft
mission: template-consumer
work-item: M1-WI3
verify: [consumer]
---

# Consumer Contract Guards And CI Audit

> Source: `docs/requirements/template-consumer-workflow.md`; effectiveness report F5/F6/F7/F9.

## Current Baseline

Doc references omit key normative surfaces and miss registry paths; timeliness swallows descendant traversal errors and overstates semantic certainty; garbled diagnostics write tmp/. Source CI does not bind installer/template/shared guide changes to consumer-contract tests. WI1/WI2 deliver installer and workflow helpers; re-read their accepted baseline.

## Goals

The consumer contract and its enforcement are tested by positive/negative controls and exercised in CI for all relevant packaging changes.

## Non-Goals

No natural-language semantic freshness detector, mass rewriting historical plans, engine/plugin suite substitution or external business-project fix. Existing source references to external corpora/examples must be classified rather than blindly reported as broken local links.

Engine/law/flow and autonomy-policy changes are not authorized by this audit. Preserve all independent acceptance requirements; hooks and helper checks are cooperative enforcement, not authentication. If a failure needs a protected change, retain the failure as a blocker and request separate scope/approval instead of skipping or modifying the protected gate.

## Task Route

- Type: verification/audit + targeted implementation-only change.
- Owner Docs: requirement, doc-organization, audit-prevention checklist, template boundary and actual CI files.
- Skill Selection Basis: `common/closure-audit-prompt.md` plus `common/index-routing-audit-prompt.md`; guard self-tests include empty/missing/malformed input and scope parity.

## Infrastructure And Config Prereqs

Verification key `consumer` binds the delivered aggregate `node tools/verify-consumer.mjs`, plus `pnpm --prefix tools/mission-driver test` for engine regression. Consumer aggregate must be zero-model and use approved temporary roots; source-wide preexisting diagnostic findings cannot be silently ignored or relabeled as full green.

Execution waits for independently accepted WI1/WI2 and their scoped delivery commits; inventory their real changed paths before proceeding. The aggregate must propagate every required child exit code, reject missing tests/tools and zero discovered mandatory coverage, and run tests against installed consumers rather than resolving dependencies from the source checkout. Add its exact command to project-context. Required suite failures block closure until fixed inside scope or separately authorized; an adjudicated limitation is recorded honestly and is never a successful gate result. Review this plan's scope before any unrelated source-doc repair prompted by expanded scans.

## Phase 1 — Test The Guards And Their Coverage

Targets: doc-reference/timeliness/garbled tools and tests, consumer hook, consumer-contract aggregate, tools/package.json, CI.
Skill: common/index-routing-audit-prompt.md

- [ ] Fix: reference roots cover all current entrypoints and relative registered skills; distinguish optional/template/example/external paths from actual broken local links, using fixtures rather than global ignores.
- [ ] Fix: timeliness only skips a missing optional top-level target; descendant failures fail visibly; exact reasoned exemption syntax and pattern-limited output are tested. Garbled output uses _tmp and remains clearly diagnostic unless an explicit blocking mode is selected.
- [ ] Add: consumer hook/CI actual wiring agrees with guide claims; one aggregate runs installer/profile/plan/commit/guard/routing/parity tests and guide command smoke cases without model credentials.
- [ ] Proof: corrupt each guarded surface in a fixture and observe red; include empty coverage and missing required inputs, not merely happy-path file counts.
- [ ] Proof: aggregate/CI self-tests demonstrate that a failed child, missing required tool/test, swallowed traversal failure, missing root entrypoint, missing CI trigger path and omitted required suite all produce nonzero. Verify current trigger coverage mechanically against the managed installer/template/guide/skill/helper sets, not by a prose-only path list. Preserve platform-specific symlink/junction failures as visible tests or explicit supported-platform limits, never silent skips advertised as full coverage.

## Phase 2 — Whole-Delivery Audit And Commit

Targets: baseline docs/checklist, bug fix notes, log, this plan, roadmap.
Skill: common/closure-audit-prompt.md

- [ ] Proof: run consumer aggregate and real engine regression gate plus `git diff --check`, inspect actual diff and independent closure. Record actual pass/failure scope and resolution of every report finding or explicit adjudicated boundary. Do not treat a deliberately failing negative fixture as an unexpected suite failure, or an unexpected source baseline failure as a passing negative control. Map findings to existing WI/plan carriers without updating the frozen effectiveness report as a second status surface.
- [ ] Proof: auditor ticks WI3 only when accepted, summary captures reasons/lessons, coordinator automatically commits this plan with one Git delivery receipt; verify all three accepted plans have distinct commits and no task edits remain uncommitted.

## Draft Review Record

- dispatch review #review-20261117-template-consumer-wi3-1-a1b2c303 to ses_e174d217effeeR7j0FL1ud2XyT
- Review correction: retain the original dispatch as history; the following filename-qualified receipt identifies this independent draft review. P1 aggregate fail-open and protected-failure handling gaps are resolved in prerequisites/Phase 1; newly identified consumer-gate design risks are carried by this plan, not duplicated into a new ledger.
- dispatch review #review-20261117-2026-11-17-0220-consumer-guards-1-17ad0220 to ses_e174d217effeeR7j0FL1ud2XyT
- 2026-11-17：iteration 1，共识 pass #review-20261117-2026-11-17-0220-consumer-guards-1-17ad0220
- Reviewer: ses_e174d217effeeR7j0FL1ud2XyT, independent draft reviewer only. Cold-start: yes after reading WI1/WI2 accepted commits and the listed command bindings. Approval covers consumer guards/CI only, never engine/law or weakened autonomy. Residual: expanded source scans may expose unrelated baseline failures; classify and obtain separate scope where necessary, do not manufacture full green. No execution/closure proof is claimed by this receipt.

## Verification

## Closure

## Deferred But Adjudicated
