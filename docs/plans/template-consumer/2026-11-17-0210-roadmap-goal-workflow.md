---
status: draft
mission: template-consumer
work-item: M1-WI2
verify: [workflow]
---

# Roadmap Goal Workflow And Accepted-Plan Commits

> Source: `docs/requirements/template-consumer-workflow.md`; effectiveness report F2/F3/F4/F8.

## Current Baseline

Workflow is spread across guides; roadmap is optional but plans require mission/WI, verification defaults and receipt tokens without standalone bindings. Lifecycle and fallback rules conflict. plan-status only warns on unreviewed activation and lists raw active state. No consumer-safe automatic per-plan commit contract is documented. WI1 supplies safe installation; re-read its actual accepted diff before execution.

## Goals

An adapted AI can discover and follow a truthful roadmap-led goal loop, accept ordinary asynchronous pending-work edits, retain active-plan scope and automatically create a safe local delivery commit after independent acceptance.

## Non-Goals

No external DSH/OpenCode goal CLI invention, engine scheduler/law rewrite, reviewer-identity security claim, automatic push, protected-scope relaxation or silent weakening of independent execution/audit.

Keep one consumer workflow contract, one shared ledger interpretation where required, and small local helpers. Do not build a new scheduler, permanent watcher, generalized approval service or second status database. Preserve existing independent executor/reviewer/auditor requirements; resolving fallback wording is not authorization to introduce a weaker solo path.

## Task Route

- Type: app-layer workflow design + implementation change.
- Owner Docs: requirement, plan/roadmap/audit guides, live engine/host owner docs for actual goal entry points, `.agents/skills/nop-git/SKILL.md`.
- Skill Selection Basis: `common/plan-audit-prompt.md`, `common/closure-audit-prompt.md`, git operational discipline. `grillme` inspected but not run as an interview: user requested autonomous completion and remaining runner facts are answered from code, not guessed.

## Infrastructure And Config Prereqs

Verification key `workflow` binds `node --test tools/plan-status.test.mjs tools/commit-plan.test.mjs tools/workflow-contract.test.mjs` (files delivered by this slice), plus the accepted WI1 install gate after manifest/entrypoint changes. Git fixtures use local test identities/hooks; never commit/push the real checkout from tests.

Execution dependencies: first read WI1's accepted plan, actual delivery commit and current diff. Read the goal-capability investigator's durable evidence file, which the coordinator must link here before capability-dependent implementation; verify its named host/version/source. If it has not landed, perform only local inventory and defer capability claims until it exists. Unsupported refresh is documented as unsupported, with an explicit coordinator file-re-read procedure; it is not permission to patch external hosts or engine/law. Initial inventory may read `docs/design/dsh-plugin-integration.md`, `docs/architecture/mission-driver-baseline.md` and `tools/mission-driver/CONTEXT.md`; these do not substitute for inspecting the claimed runtime boundary. Update project-context's verification routing for the delivered consumer tests. Work remains dependency-gated even after draft approval.

## Phase 1 — One Coherent User Contract

Targets: root/template AGENTS, root/template index and Day-0 entry, README variants, plan/roadmap/audit/workflow/add-on guides, related skills, manifest and requirement-aligned stable owner docs.
Skill: common/plan-audit-prompt.md

- [ ] Decision: read and link the investigator's evidence, record actual goal-mode/mission-driver support and boundary observations; make capabilities/limitations explicit instead of promising hot prompt replacement. Separate demonstrated host scheduling from cooperative prompt/coordinator discipline; no unsupported CLI examples.
- [ ] Add: task-oriented usage with roadmap research/audit tasks, approved adaptive pending-work refinement, human asynchronous edits, active-plan freezing/reconciliation, safe holds and final queue re-read.
- [ ] Fix: standalone/no-roadmap identity and exact command bindings, canonical fallback and derived completion; remove unsupported strict flag and obsolete completion/routing claims from current guidance only. The standalone identity belongs to the consumer helper contract, not an unapproved engine/schema/law change. If compatibility needs a protected change, hold that part for separate authorization.
- [ ] Add: mandatory independent-acceptance → scoped automatic commit → next-task order, failure recovery and Git trailer as nonrecursive commit receipt; record why each contract changed.
- [ ] Add: identify the reviewed task payload and permitted finalization metadata so post-audit product edits invalidate acceptance. Commit is a coordinator action, never a hook invoking itself; do not append its hash to the plan or require a second commit. One execution home/selector prevents duplicate dispatch; pending edits use fresh-read patches, not whole-file stale rewrites. Mixed ownership can block final delivery without restarting the current implementation.

## Phase 2 — Mechanical Helpers And Negative Controls

Targets: `tools/plan-status.mjs`, shared standalone plan interpretation if necessary, `tools/commit-plan.mjs`, workflow/plan-status/commit tests, manifest and install tests for shipped dependencies.
Skill: common/bug-diagnosis-prompt.md

- [ ] Fix: activation rejects missing independent-review evidence and unfinished-plan discovery uses derived completion without mutating stored status; historical plans are not mass-rewritten.
- [ ] Add: accepted-plan commit helper with explicit paths, all required proof/closure checks, safe path and staged-index handling, one `AGE-Plan` delivery receipt per plan, no secrets/scratch, no force push or hook bypass. Reject unsafe/pathspec-escaping/out-of-repo/ignored paths, unrelated staged changes and unisolatable mixed-ownership edits; no automatic stash/reset/amend. Validate the latest payload/index against reviewed proof before committing, and fail visibly if hooks alter the accepted payload. Receipt parsing is not identity authentication, and a path denylist is not a claim to detect every possible secret in arbitrary source text.
- [ ] Proof: temporary Git repositories cover accepted/rejected/unverified plans, idempotent retry with equal content versus changed post-delivery content, post-audit payload mutation, unrelated staged/unstaged/untracked work including a pending-roadmap edit in the same file, unsafe paths, commit/hook failure and hook mutation, and nonrecursive receipts. A refused attempt preserves unrelated bytes/index and cannot be reported delivered. Task boundary tests/examples match actual supported runner behavior.
- [ ] Proof: exercise pending addition/reorder during the current plan, stable selected scope, concurrent active-item change/reconciliation, dependency preservation and final queue re-read. Local fixture tests prove coordinator semantics only; claims about a host/engine require that host's actual source/test evidence. Do not label prompt examples as an implemented scheduler.

## Phase 3 — Independent Acceptance And Delivery

Targets: scoped tests, stable guide routing, fix notes, daily log, plan and roadmap.
Skill: common/closure-audit-prompt.md

- [ ] Proof: run workflow and install gates plus `git diff --check`, independent draft/closure records, consumer discovery/guide examples; label any runtime/host limits. Record fixed defects and rationale in the daily log. Auditor ticks WI2 after acceptance; coordinator uses the accepted helper to commit only this plan's task payload/finalization metadata before WI3. Test the helper in fixture repositories before using its self-hosted delivery path; its Git trailer is the receipt, not a post-commit plan edit.

## Draft Review Record

- dispatch review #review-20261117-template-consumer-wi2-1-a1b2c302 to ses_e174d217effeeR7j0FL1ud2XyT
- Review correction: retain the original dispatch as history; the following filename-qualified receipt identifies this independent draft review. P1 stale-acceptance/idempotence, capability-evidence and same-file concurrency gaps are resolved by the prerequisite and Phase 1/2 proof amendments; these are additional execution-contract gaps, not repeated report findings. Carrier: this plan.
- dispatch review #review-20261117-2026-11-17-0210-roadmap-goal-workflow-1-17ad0210 to ses_e174d217effeeR7j0FL1ud2XyT
- 2026-11-17：iteration 1，共识 pass #review-20261117-2026-11-17-0210-roadmap-goal-workflow-1-17ad0210
- Reviewer: ses_e174d217effeeR7j0FL1ud2XyT, independent draft reviewer only. Approval covers consumer tools/guidance; no engine/law edits, identity-security claim or independence downgrade. Cold-start: yes for inventory and local helper work; capability-dependent work first requires the investigator evidence link and WI1 delivery, otherwise it stays held. Residual: host support is not assumed; source-based boundary evidence cannot prove a complete model-driven run. This is draft acceptance, not verification or closure.

## Verification

## Closure

## Deferred But Adjudicated
