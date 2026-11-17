---
status: active
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

Capability evidence is persisted in `docs/analysis/2026-11-17-0230-goal-roadmap-capability-boundaries.md`. Supplemental independent design review (ses_e172d930effe5Bz8cngyVhe5xf) permits a shared, read-only consumer `deliveryReady` proof gate without changing engine/law: expose raw status and compatibility notes separately, never trust explicit completed alone, retain the external `--check` interface, and require current payload/independent acceptance before Git delivery. Treat strict consumer delivery checks versus engine completed/mission-default shortcuts as explicit compatibility differences, not silently unified lifecycle semantics. User confirmed this session may preserve/integrate the concurrent AGENTS/plan-status changes. Native engine step/session reuse, prefetched forEach lists and terminal/config caching are not repaired by documentation; unsupported backends are labelled and not advertised as satisfying strict autonomous guarantees.

User correction (controlling): the ordinary completion-time roadmap update is sufficient. Agents MUST read/write roadmap and plan content through built-in Read/Edit/Write-class tools, whose existing write protection handles concurrent edits. No extra AI reread, revision check, custom CAS/merge/synchronization helper or shell/script document writer is required or permitted as the AI editing path. Resolve conflicts reported by the built-in tools and select from the resulting updated worklist. Automated validators may parse files internally; Git delivery checks remain distinct from file-edit concurrency handling. This supersedes both the original unconditional reread and the coordinator's subsequent overengineered baseline-check proposal.

Execution steering: the user further asks for a small usable toolset and independent subagent verification, not defensive identity/authenticity machinery or repeated warnings. Keep one task-oriented usage owner, minimum acceptance/payload checks, normal hooks and one local delivery; no new scheduler or protected implementation changes.

## Phase 1 — One Coherent User Contract

Targets: root/template AGENTS, root/template index and Day-0 entry, README variants, plan/roadmap/audit/workflow/add-on guides, related skills, manifest and requirement-aligned stable owner docs.
Skill: common/plan-audit-prompt.md

- [x] Decision: read and link the investigator's evidence, record actual goal-mode/mission-driver support and boundary observations; make capabilities/limitations explicit instead of promising hot prompt replacement. Separate demonstrated host scheduling from cooperative prompt/coordinator discipline; no unsupported CLI examples.
- [x] Add: task-oriented usage with roadmap research/audit tasks, approved adaptive pending-work refinement, human asynchronous edits, active-plan scope preservation and safe holds. Completion-time updating uses the built-in agent tools and their conflict feedback; next selection and queue exhaustion use the resulting worklist without extra rereads/checks.
- [x] Fix: standalone/no-roadmap identity and exact command bindings, canonical fallback and derived completion; remove unsupported strict flag and obsolete completion/routing claims from current guidance only. The standalone identity belongs to the consumer helper contract, not an unapproved engine/schema/law change. If compatibility needs a protected change, hold that part for separate authorization.
- [x] Add: mandatory independent-acceptance → scoped automatic commit → next-task order, failure recovery and Git trailer as nonrecursive commit receipt; record why each contract changed.
- [x] Add: identify the reviewed task payload and permitted finalization metadata so post-audit product edits invalidate acceptance. Commit is a coordinator action, never a hook invoking itself; do not append its hash to the plan or require a second commit. One execution home/selector prevents duplicate dispatch; task-document reads/writes use built-in tools, not shell/script replacements. Mixed Git ownership can block final delivery without restarting the current implementation; it is not justification for a custom roadmap concurrency checker.
- [x] Fix: separate derived plan acceptance from the subsequent Git-delivery/next-selection gate. No counting-domain checkbox or helper eligibility rule may require its own delivery commit to pre-exist; audit/roadmap/log metadata lands before the commit. Add a fixture proving an accepted plan can deliver once without a post-commit plan rewrite.

## Phase 2 — Mechanical Helpers And Negative Controls

Targets: `tools/plan-status.mjs`, shared standalone plan interpretation if necessary, `tools/commit-plan.mjs`, workflow/plan-status/commit tests, manifest and install tests for shipped dependencies.
Skill: common/bug-diagnosis-prompt.md

- [x] Fix: retain/harden the existing legacy status CLI's admission checks and add read-only delivery/unfinished discovery, but all AI plan activation/content edits use built-in agent tools instead of CLI writers. Historical plans are not mass-rewritten; read-only validation must not become a replacement editing channel.
- [x] Fix: expose raw status separately from strict, read-only consumer `deliveryReady`; preserve the integrated `--check` receipt interface without treating its exit 0 as delivery eligibility. Require nonempty valid Phase coverage, explicit nonempty verify keys with passing proof, latest paired independent review/audit acceptance with no pending dispatch, and current accepted payload. Keep explicit-completed/mission-default engine shortcuts as documented compatibility differences, not consumer proof; historical records are not automatically reopened or queued for commit. Executor/reviewer/auditor identities must be tied to actual coordinator dispatch/execution evidence, with reused or unknown actors refused for automatic delivery; no claim that text IDs authenticate actors. Test these distinctions without importing or modifying protected engine/law behavior.
- [x] Add: accepted-plan commit helper with explicit paths, all required proof/closure checks, safe path and staged-index handling, one `AGE-Plan` delivery receipt per plan, no secrets/scratch, no force push or hook bypass. Reject unsafe/pathspec-escaping/out-of-repo/ignored paths, unrelated staged changes and unisolatable mixed-ownership edits; no automatic stash/reset/amend. Validate the latest payload/index against reviewed proof before committing, and fail visibly if hooks alter the accepted payload. Receipt parsing is not identity authentication, and a path denylist is not a claim to detect every possible secret in arbitrary source text.
- [x] Proof: Git/validation helpers do not write roadmap/plan content, including snapshot/finalization/status modes; they may emit hash/validation results for the agent to record through built-in tools. Tests distinguish legitimate validator parsing from script-based task-document editing.
- [x] Proof: temporary Git repositories cover accepted/rejected/unverified plans, idempotent retry with equal content versus changed post-delivery content, post-audit payload mutation, unrelated staged/unstaged/untracked work including a pending-roadmap edit in the same file, unsafe paths, commit/hook failure and hook mutation, and nonrecursive receipts. A refused attempt preserves unrelated bytes/index and cannot be reported delivered. Task boundary tests/examples match actual supported runner behavior.
- [x] Proof: validate routing/prompt contracts requiring built-in Read/Edit/Write for roadmap/plan, ordinary completion updating, pending research/audit additions, no redundant reread/concurrency subsystem, and no shell/script document writers. Document reported-conflict handling and dependency/scope preservation; do not pretend local fixtures implement or independently validate a host's built-in write tool or scheduler.

## Phase 3 — Independent Acceptance And Delivery

Targets: scoped tests, stable guide routing, fix notes, daily log, plan and roadmap.
Skill: common/closure-audit-prompt.md

- [x] Proof: run workflow and install gates plus `git diff --check`, confirm draft-review evidence, consumer discovery/guide examples and closure readiness; label any runtime/host limits. Record fixed defects and rationale in the daily log. Test the helper in fixture repositories before using its self-hosted delivery path; its Git trailer is the receipt, not a post-commit plan edit.

## Delivery After Acceptance

After the finished criteria are independently accepted, the separate auditor appends closure and ticks WI2. The coordinator uses the accepted helper to commit only this plan's reviewed payload and permitted finalization metadata before WI3. This post-acceptance delivery is not a counting-domain prerequisite for invoking the helper. Inspect the resulting Git receipt without appending a commit hash or otherwise dirtying the accepted plan again; failure blocks next selection.

## Draft Review Record

- dispatch review #review-20261117-template-consumer-wi2-1-a1b2c302 to ses_e174d217effeeR7j0FL1ud2XyT
- Review correction: retain the original dispatch as history; the following filename-qualified receipt identifies this independent draft review. P1 stale-acceptance/idempotence, self-referential commit checklist, capability-evidence and same-file concurrency gaps are resolved by the prerequisite, Phase 1/2 proof and delivery amendments; these are additional execution-contract gaps, not repeated report findings. Carrier: this plan.
- dispatch review #review-20261117-2026-11-17-0210-roadmap-goal-workflow-1-17ad0210 to ses_e174d217effeeR7j0FL1ud2XyT
- 2026-11-17：iteration 1，共识 pass #review-20261117-2026-11-17-0210-roadmap-goal-workflow-1-17ad0210
- Reviewer: ses_e174d217effeeR7j0FL1ud2XyT, independent draft reviewer only. Approval covers consumer tools/guidance; no engine/law edits, identity-security claim or independence downgrade. Cold-start: yes for inventory and local helper work; capability-dependent work first requires the investigator evidence link and WI1 delivery, otherwise it stays held. Residual: host support is not assumed; source-based boundary evidence cannot prove a complete model-driven run. This is draft acceptance, not verification or closure.
- dispatch review #review-20261117-2026-11-17-0210-roadmap-goal-workflow-2-17ad0211 to ses_e174d217effeeR7j0FL1ud2XyT
- 2026-11-17：iteration 2，共识 pass #review-20261117-2026-11-17-0210-roadmap-goal-workflow-2-17ad0211
- Supplemental draft review: verified the linked capability evidence against live explicit-completed shortcut/status vocabulary and native run-scoped handle reuse. The consumer-only `deliveryReady` refinement and authorized integration of external AGENTS/plan-status increments fit WI2; preserve `--check` and its independence intent, current-payload checks and real actor provenance. Added an explicit Phase 2 criterion so the evidence is an executable obligation rather than a preface only. No engine/law/core/assets regeneration or autonomy relaxation is approved; prefetch/config/terminal/native isolation limits remain limitations, not fixes. Cold-start: the evidence path is now present; WI1 delivery remains the execution dependency. Pass is draft scope approval, not a host/model run or product acceptance.

## Verification

- Preliminary executor runs: workflow command exit 0 (31/31); installer command exit 0 (61/61); `bash tools/check-install-age.sh` exit 0 (33/33). Final reruns follow after the remaining mode/receipt fixture refinement; these preliminary results are scoped, not closure acceptance.
- Supplementary diagnostics: `node tools/check-doc-timeliness.mjs` exit 0. `node tools/check-doc-references.mjs` exit 1 on pre-existing engine/plugin-relative source references and line-number citations in untouched architecture/design/reference docs; no reported reference is in a WI2-edited document. Do not waive that global result or expand this slice into the WI3 guard work.
- pass workflow 20261117-wi2-executor exit=0
- pass install 20261117-wi2-executor exit=0
- pass install-shell 20261117-wi2-executor exit=0
- Executor final scoped evidence: `node --test tools/plan-status.test.mjs tools/commit-plan.test.mjs tools/workflow-contract.test.mjs` exit 0 (32 tests); `node --test tools/install-age.test.mjs tools/install-age.integration.test.mjs` exit 0 (61 tests); `bash tools/check-install-age.sh` exit 0 (33 assertions). Commands are bound in project-context before reporting; install/install-shell are supplementary keys, not additions to this plan's required `verify: [workflow]`.
- Verification scope limited: Windows/Node/Git Bash fixture/installed-consumer checks only. The symlink rejection branch is implemented but this Windows account cannot create a file symlink, so that assertion reports a diagnostic and is not claimed exercised. No Linux/macOS, Node 18 runtime, actual host model run, host built-in write-protection test or global engine/plugin full-green claim. The inherited formal engine baseline remains four failures; no protected engine/law change is made to address it.
- Delivery handoff: the coordinator/independent auditor must choose the final explicit file set (including any assigned pre-existing analysis evidence), take its read-only payload snapshot and bind the independently rerun verification/acceptance to that digest per the usage guide. This executor's ordinary pass lines are implementation evidence, not current-payload Closure acceptance or permission to commit. No Closure receipt or roadmap tick is written by this executor.
- Final read-only checks: `git diff --check` exit 0 (only the pre-existing analysis-index CRLF normalization warning); `node tools/plan-status.mjs --check docs/plans/template-consumer/2026-11-17-0210-roadmap-goal-workflow.md` exit 0, receipt integrity PASS and correctly `not delivery-ready` because independent closure acceptance is still absent. The final workflow rerun again passed 32/32. All real task-document reads/edits in this execution used built-in read/patch tools, not the legacy setter or a document-writing script.
- payload 1a553f8b73a3afc94c7a8e337fddfb74aabd3e28b13c2903a1b1cd3661762233 base=95b97e5f9d4250165683ffc128c97b35631c14b2 paths=[".agents/skills/nop-git/SKILL.md","AGENTS.md","README.md","README.zh.md","docs/analysis/2026-11-17-0230-goal-roadmap-capability-boundaries.md","docs/analysis/README.md","docs/architecture/template-vs-realproject-boundary.md","docs/bugs/2026-11-17-0210-consumer-plan-delivery.md","docs/context/codebase-map.md","docs/context/project-context.md","docs/guides/README.md","docs/guides/application-development-workflow.md","docs/guides/audit-execution.md","docs/guides/audit-prevention-checklist.md","docs/guides/mission-driver-add-on.md","docs/guides/plan-authoring-and-execution.md","docs/guides/roadmap-authoring.md","docs/guides/roadmap-goal-workflow.md","docs/index.md","docs/logs/2026/11-17.md","docs/plans/template-consumer/2026-11-17-0210-roadmap-goal-workflow.md","docs/roadmaps/template-consumer-roadmap.md","docs/skills/common/closure-audit-prompt.md","install-age.manifest","template/AGENTS.md","template/START-HERE-after-copy.md","template/docs/context/codebase-map.md","template/docs/index.md","tools/commit-plan.mjs","tools/commit-plan.test.mjs","tools/consumer-ledger.mjs","tools/plan-status.mjs","tools/plan-status.test.mjs","tools/workflow-contract.test.mjs"]
- pass workflow 20261117-wi2-independent-closure exit=0 payload=1a553f8b73a3afc94c7a8e337fddfb74aabd3e28b13c2903a1b1cd3661762233
- pass install 20261117-wi2-independent-closure exit=0 payload=1a553f8b73a3afc94c7a8e337fddfb74aabd3e28b13c2903a1b1cd3661762233
- pass install-shell 20261117-wi2-independent-closure exit=0 payload=1a553f8b73a3afc94c7a8e337fddfb74aabd3e28b13c2903a1b1cd3661762233

## Execution

- Executor: ses_e171b33eeffed38PSpZiVMTtaG
- Dependency: WI1 accepted delivery is `95b97e5f9d4250165683ffc128c97b35631c14b2`; inspected its plan/closure and actual installer/manifest/owner/test diff. Preserved external `99fe883` receipt checker and campaign preparation; the current integration replaces its loose receipt matching with shared read-only interpretation while retaining `--check`.
- Phase methods: Phase 1 uses the plan-audit contract to align current shared guides and root/template discovery; Phase 2 uses reduced receipt/Git fixtures and the bug-diagnosis method, with root cause/rejected engine-reuse assumption in `docs/bugs/2026-11-17-0210-consumer-plan-delivery.md`. Phase 3 prepares independent closure evidence only; this executor does not issue its own Closure acceptance, tick the roadmap, stage or commit the real checkout.
- Capability evidence read with real `draft-from-roadmap.md`, `execute.md`, `closure-audit.md`, CLI registration and native `_ensureHandle` source. The usage guide names the inspected DSH survey revision and backend batch/config/session limits in one section. No host model run, scheduler, engine/law/assets/plugin-core/autonomy-policy change is claimed.
- Ownership: source/test/helper, shared workflow/plan/roadmap/audit guides and closure prompt, root/template routers/Day-0, README variants, git skill, manifest, project-context/codebase-map, boundary owner, fix note/log and this WI2 plan are this execution's changes. Pre-existing capability analysis/index and WI3 plan remain untouched by the executor and require the coordinator's delivery ownership decision; do not sweep the WI3 plan into WI2.

## Closure

- dispatch audit #audit-20261117-2026-11-17-0210-roadmap-goal-workflow-1-17ad0212 to ses_e171b33e3ffeVIjwLseFBbBMzS
- accepted #audit-20261117-2026-11-17-0210-roadmap-goal-workflow-1-17ad0212: passes closure audit, payload=1a553f8b73a3afc94c7a8e337fddfb74aabd3e28b13c2903a1b1cd3661762233 ownership=whole-files. Auditor ses_e171b33e3ffeVIjwLseFBbBMzS is distinct from executor ses_e171b33eeffed38PSpZiVMTtaG and draft reviewer ses_e174d217effeeR7j0FL1ud2XyT. Cold-read AGENTS/context/index, final requirement/plan, usage/lifecycle/audit guides, shared ledger/status/commit helpers and tests, capability analysis, actual scoped diff/new files and fix/log evidence. No blocking findings. Independently ran the exact workflow binding (exit 0, 32/32), install binding (exit 0, 61/61), shell closure gate (exit 0, 33/33), and git diff --check (exit 0; unrelated analysis-index CRLF warning only). Actual Git fixtures reject unrelated staged changes, changed product/plan/shared-roadmap payloads and unsafe paths, preserve unrelated bytes/index, retain ordinary hooks and verify one delivery/idempotent retry without helper-written task documents. Before acceptance, the actual WI2 --check returned receipt integrity PASS and not delivery-ready, as required. The task-oriented guide is discoverable in root/consumer entrypoints and concentrates the procedure without a new concurrency or identity-authentication subsystem. The read-only snapshot binds all 31 WI2 changed files, the coordinator-assigned capability analysis/index, and the normal WI2 roadmap completion file (34 explicit paths); WI3 plan is excluded. Reviewed whole-file ownership includes the assigned analysis evidence and only the selected WI2 roadmap tick; other pending work is not approved for inclusion. Tracked diff/status confirm engine/law/assets/plugin core, autonomy policy, exit map, flows, memory and dist are unchanged. Verification scope limited: Windows/Node/Git Bash fixtures and installed-consumer behavior, not host/model execution, Linux/macOS or Node 18 runtime. The file-symlink assertion could not execute on this Windows account and reported a visible diagnostic; this is not full symlink coverage. Existing global doc-reference findings and the inherited four-failure engine baseline remain unresolved outside WI2; no full-green claim. All task-document mutations use built-in patch tools. No real-checkout staging, commit or push by this auditor; the coordinator's one scoped delivery commit remains subsequent to this acceptance.

## Deferred But Adjudicated
