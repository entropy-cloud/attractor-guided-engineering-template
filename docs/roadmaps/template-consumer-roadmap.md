---
audit-rounds: 0
---

# Template Consumer Roadmap

Source: `docs/requirements/template-consumer-workflow.md`; evidence: `docs/analysis/2026-11-17-0100-age-v2-refactor-effectiveness-review.md`.

## Work Item Status

### M1 — Safe Adoption And Repeatable Delivery

- [x] WI1 Safe installer and explicit provenance/drift (Owner: `docs/requirements/template-consumer-workflow.md`; Deliverable: installation safety, profile/bridge parity, standalone engine and non-destructive drift tests)
- [ ] WI2 Roadmap-led goal workflow and automatic accepted-plan commits (Owner: `docs/requirements/template-consumer-workflow.md`; deps: WI1; Deliverable: usage guide, coherent standalone lifecycle, scoped/idempotent commit helper and tests)
- [ ] WI3 Consumer-contract guard audit and CI closure (Owner: `docs/requirements/template-consumer-workflow.md`; deps: WI2; Deliverable: guard negative controls, installed-scaffold contract checks, CI wiring and final evidence)

## Framework / Platform Reuse

Reuse the agent's built-in Read/Edit/Write tools for roadmap/plan content access and concurrent-write protection; do not add redundant AI rereads, revision checks or merge machinery. Reuse the existing installer manifest, vendored js-yaml, plan ledger semantics, Node test runner and actual host/mission-driver entry points. Do not introduce a new autonomous runtime. Historical execution records remain unchanged.

## Current Baseline

The effectiveness report identifies configuration concatenation, registry/profile drift, inconsistent lifecycle guidance, incomplete consumer hooks/CI and guard false greens. Goal-mode support is investigated before making runtime claims.

## Dependency Graph

WI1 → WI2 → WI3. Each work item has one delivery plan and one automatic local commit after independent acceptance. Reasons and evidence live in the delivering plan/log, not a second status table.

## Deep Audit Record
