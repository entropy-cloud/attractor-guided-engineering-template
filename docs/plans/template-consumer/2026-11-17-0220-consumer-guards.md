---
status: active
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

Baseline evidence: the coordinator ran `pnpm --prefix tools/mission-driver test` before product changes, exit 1, 923 tests/919 pass/4 fail (`_tmp/template-consumer/engine-package-baseline.log`). Three failures reference moved guide/backlog corpus paths. The fourth (`test/runner-routing.test.js`, Windows resolution) assumes that APPDATA existing implies an opencode.exe file exists, while the actual resolver explicitly requires `existsSync`. The supplemental independent draft review below approves only this narrow prerequisite repair: update corpus test inputs to current locations without weakening real-plan assertions, and replace the machine-dependent APPDATA assumption with controlled present/absent executable fixtures while retaining exact resolution/fallback assertions. No runner/engine/law production behavior change is authorized. This baseline predates the path repair; restored corpus discovery may add tests or expose further failures, so 923/919/4 is not the expected final count and the later full gate must be reported independently.

## Phase 1 — Test The Guards And Their Coverage

Targets: doc-reference/timeliness/garbled tools and tests, consumer hook, consumer-contract aggregate, tools/package.json, CI; test-only prerequisite files `tools/mission-driver/test/{field-wiring,ledger-corpus,ledger-sections,runner-routing}.test.js`.
Skill: common/index-routing-audit-prompt.md

- [x] Fix: repair only stale guide/backlog corpus inputs in the three named tests to the current guide/roadmaps locations; keep real corpus discovery, nonempty/count floors and structural assertions, with missing required inputs still failing. In runner-routing, pass fixture APPDATA through the existing env argument and create/remove a dummy candidate file under a unique temporary root; assert exact Windows candidate selection when present, exact `opencode` fallback when absent/unset, unchanged other-driver behavior, and the unchanged non-Windows branch. Do not edit runner.js/platform/engine/law, add skips, relax expectations to suffix-only checks, or depend on a globally installed executable.
- [x] Proof: run `node --test tools/mission-driver/test/field-wiring.test.js tools/mission-driver/test/ledger-corpus.test.js tools/mission-driver/test/ledger-sections.test.js tools/mission-driver/test/runner-routing.test.js`, then the full package gate already bound above, including its prompt-check step. Record discovered corpus/test counts and any newly exposed failures; never filter them away to reproduce the old count or call the focused pass a full pass. Tests do not spawn the dummy executable or mutate process-global APPDATA.
- [x] Fix: reference roots cover all current entrypoints and relative registered skills; distinguish optional/template/example/external paths from actual broken local links, using fixtures rather than global ignores.
- [x] Fix: timeliness only skips a missing optional top-level target; descendant failures fail visibly; exact reasoned exemption syntax and pattern-limited output are tested. Garbled output uses _tmp and remains clearly diagnostic unless an explicit blocking mode is selected.
- [x] Add: consumer hook/CI actual wiring agrees with guide claims; one aggregate runs installer/profile/plan/commit/guard/routing/parity tests and guide command smoke cases without model credentials.
- [x] Proof: corrupt each guarded surface in a fixture and observe red; include empty coverage and missing required inputs, not merely happy-path file counts.
- [x] Proof: aggregate/CI self-tests demonstrate that a failed child, missing required tool/test, swallowed traversal failure, missing root entrypoint, missing CI trigger path and omitted required suite all produce nonzero. Verify current trigger coverage mechanically against the managed installer/template/guide/skill/helper sets, not by a prose-only path list. Preserve platform-specific symlink/junction failures as visible tests or explicit supported-platform limits, never silent skips advertised as full coverage.

## Phase 2 — Whole-Delivery Audit And Commit

Targets: baseline docs/checklist, bug fix notes, log, this plan, roadmap.
Skill: common/closure-audit-prompt.md

- [x] Proof: run consumer aggregate and real engine regression gate plus `git diff --check`, inspect actual diff and prepare independent closure. Record actual pass/failure scope and resolution of every report finding or explicit adjudicated boundary. Do not treat a deliberately failing negative fixture as an unexpected suite failure, or an unexpected source baseline failure as a passing negative control. Map findings to existing WI/plan carriers without updating the frozen effectiveness report as a second status surface.
- [x] Proof: prepare the roadmap-completion summary with reasons/lessons; verify WI1/WI2's existing distinct delivery receipts and that WI3 has the reviewed task/finalization payload ready for independent acceptance. The current plan's own commit check happens after acceptance, outside the counting domain.

## Delivery After Acceptance

The separate auditor appends closure and ticks WI3 only on independent acceptance. The coordinator then automatically commits this plan with its one Git delivery receipt. Inspect Git history to confirm all three accepted plans have distinct delivery commits and no task edits remain uncommitted; preserve unrelated user changes. This final read-only delivery check does not create another plan/log edit, another commit or a circular prerequisite for the helper.

## Draft Review Record

- dispatch review #review-20261117-template-consumer-wi3-1-a1b2c303 to ses_e174d217effeeR7j0FL1ud2XyT
- Review correction: retain the original dispatch as history; the following filename-qualified receipt identifies this independent draft review. P1 aggregate fail-open, self-referential commit checklist and protected-failure handling gaps are resolved in prerequisites/Phase 1/delivery; newly identified consumer-gate design risks are carried by this plan, not duplicated into a new ledger.
- dispatch review #review-20261117-2026-11-17-0220-consumer-guards-1-17ad0220 to ses_e174d217effeeR7j0FL1ud2XyT
- 2026-11-17：iteration 1，共识 pass #review-20261117-2026-11-17-0220-consumer-guards-1-17ad0220
- Reviewer: ses_e174d217effeeR7j0FL1ud2XyT, independent draft reviewer only. Cold-start: yes after reading WI1/WI2 accepted commits and the listed command bindings. Approval covers consumer guards/CI only, never engine/law or weakened autonomy. Residual: expanded source scans may expose unrelated baseline failures; classify and obtain separate scope where necessary, do not manufacture full green. No execution/closure proof is claimed by this receipt.
- dispatch review #review-20261117-2026-11-17-0220-consumer-guards-2-17ad0221 to ses_e174d217effeeR7j0FL1ud2XyT
- 2026-11-17：iteration 2，共识 pass #review-20261117-2026-11-17-0220-consumer-guards-2-17ad0221
- Supplemental draft review: inspected the coordinator baseline log (923/919/4, no skips), all four failing test sites and runner.js resolver. The three ENOENT failures are stale corpus/guide inputs; Windows routing asserts native selection from APPDATA alone while production also checks candidate existence. Updating those four test files with controlled present/absent fixtures fits WI3's real-gate prerequisite scope and does not waive a runtime defect or authorize production changes. Added targets, precise branch assertions and focused/full commands; retain corpus coverage floors and classify newly discovered failures. Cold-start: yes, named files and baseline evidence suffice. No suite was rerun by this supplemental reviewer, and no full-green or engine/law repair is claimed.

## Execution

- Executor: ses_e171b33e3ffeVIjwLseFBbBMzS
- Dependency evidence: inspected the actual installer/manifest/integration diff and `AGE-Plan` trailer of WI1 delivery `95b97e5f9d4250165683ffc128c97b35631c14b2`, and the standalone ledger/commit/status/manifest diff and trailer of WI2 delivery `b9cd0d293c024a8439abc3359c39f352cbd37c9d`. Distinct accepted deliveries precede this execution. Initial working tree contained only this WI3 plan amendment; no other WIP was overwritten.
- Scope decision: use installed managed-consumer docs for the consumer aggregate; keep the expanded source-wide reference diagnostic separate and red where legacy source/plugin/engine conventions are unresolved. This follows the coordinator's explicit scope ruling, not a bypass or a negative fixture. No whole-file reference ignore list is retained.
- Methods: Phase 1 uses the index-routing audit method with actual installed default/frontend/java/all and add-on consumers, path/registry fixtures and mechanical CI input coverage. Phase 2 prepares the closure-audit evidence and roadmap-summary rationale in the daily log; this executor does not issue closure acceptance.
- Improvements and reasons: precise traversal/error/exemption handling prevents false greens; explicit source/add-on/example classification prevents false broken-link claims; the fixed six-suite aggregate and source CI bind packaging changes to real tests. The already-shipped consumer hook invokes local engine checkers rather than copying parsers. Four approved engine tests repair input assumptions only, retaining the real corpus and resolver behavior. Details/regression links: `docs/bugs/2026-11-17-0220-consumer-guard-false-greens.md`.
- Probe adjustments: the default consumer exposed concrete filename examples and optional source/add-on paths; classify those narrowly. Expanding the installed scan to profiles/add-on exposed the old operator-skill/updater statement in `template/install/AGE-FILES-GUIDE.md`; align it with WI1's actual installer instead of ignoring that file. A missing required tool/suite and deliberately failing child/guard fixture are expected test assertions, not allowed failures of the required aggregate.
- Finding carriers: report F1/F7 installer/provenance/parity belong to accepted WI1; F2/F3/F4 workflow/current-payload acceptance and F8 backend/independence boundaries belong to accepted WI2. WI3 owns F5 guard coverage/error/diagnostic contracts, F6 consumer hook/CI, F7 routing/packaging consistency and F9 scratch/diagnostic correction. Its small routing fixes remove the stale requirement-guide link, project-context active-plan lookup and consumer-only engine-baseline index claim. The frozen effectiveness report is unchanged; unsupported host/runtime proposals remain adjudicated boundaries, not delivered runtime fixes.

## Verification

- payload 9bd29b6a2919469761680fa395333d809cd80a63386ff2e995e59ad3aa55fc9a base=b9cd0d293c024a8439abc3359c39f352cbd37c9d paths=[".github/workflows/consumer-contract.yml","docs/architecture/template-vs-realproject-boundary.md","docs/bugs/2026-11-17-0220-consumer-guard-false-greens.md","docs/context/project-context.md","docs/design/README.md","docs/guides/audit-execution.md","docs/guides/audit-prevention-checklist.md","docs/guides/bug-fix-note.md","docs/guides/doc-organization.md","docs/guides/log-writing.md","docs/guides/mission-driver-add-on.md","docs/guides/roadmap-authoring.md","docs/logs/2026/11-17.md","docs/plans/template-consumer/2026-11-17-0220-consumer-guards.md","docs/requirements/README.md","docs/roadmaps/template-consumer-roadmap.md","docs/skills/common/age-practice-gap-audit-prompt.md","template/docs/architecture/README.md","template/install/AGE-FILES-GUIDE.md","template/install/githooks/pre-commit","tools/README.md","tools/check-doc-references.mjs","tools/check-doc-timeliness.mjs","tools/check-docs-garbled.mjs","tools/consumer-contract.test.mjs","tools/doc-guards.test.mjs","tools/mission-driver/test/field-wiring.test.js","tools/mission-driver/test/ledger-corpus.test.js","tools/mission-driver/test/ledger-sections.test.js","tools/mission-driver/test/runner-routing.test.js","tools/package.json","tools/verify-consumer.mjs","tools/verify-consumer.test.mjs"]
- pass consumer 20261117-wi3-executor exit=0 payload=9bd29b6a2919469761680fa395333d809cd80a63386ff2e995e59ad3aa55fc9a
- pass engine 20261117-wi3-executor exit=0 payload=9bd29b6a2919469761680fa395333d809cd80a63386ff2e995e59ad3aa55fc9a
- pass engine-focused 20261117-wi3-executor exit=0 payload=9bd29b6a2919469761680fa395333d809cd80a63386ff2e995e59ad3aa55fc9a
- Focused engine command: `node --test tools/mission-driver/test/field-wiring.test.js tools/mission-driver/test/ledger-corpus.test.js tools/mission-driver/test/ledger-sections.test.js tools/mission-driver/test/runner-routing.test.js` exited 0, 156/156 tests passed. Real discovery includes 97 plan documents and 8 roadmaps; existing >50/≥6 floors and structural assertions are retained. Output: `_tmp/template-consumer/wi3-engine-focused.log`.
- Engine package gate: `pnpm --prefix tools/mission-driver test` exited 0, 1029/1029 tests passed, zero failed/skipped; its chained prompt-check passed. The baseline was 923/919/4 before restored corpus discovery; the higher count is not filtered away. Output: `_tmp/template-consumer/wi3-engine-full.log`. Only the four approved engine test files change, never runner/engine/law production behavior; the dummy candidate is not executed and process-global APPDATA is untouched.
- Consumer aggregate: `node tools/verify-consumer.mjs` exited 0 with all six mandatory suites: installer 61/61, shell 33/33 assertions, workflow 32/32, guard controls 5/5, installed consumer/routing/hook smoke 2/2 (all four profiles plus add-on), aggregate/CI controls 3/3. Output: `_tmp/template-consumer/wi3-consumer-aggregate.log`. The CI coverage check computes 113 real managed source/helper/test/template paths and covers both push and pull_request; trigger/command omissions are tested red. Source aggregate/CI/test files are not added to the install manifest.
- Supplementary checks: `git diff --check` exited 0; `node tools/check-doc-timeliness.mjs` exited 0 on 82 normative docs with pattern-limited wording. Expanded `node tools/check-doc-references.mjs` exited 1 on 93 source docs with 248 mixed unresolved-path/line-citation diagnostics, retained at `_tmp/template-consumer/wi3-source-refs.log`; this is not 248 confirmed local dead links and is not reported green. Installed managed-consumer reference scans pass without global exemptions.
- `node tools/check-docs-garbled.mjs` exited 0 in explicitly diagnostic mode: 300 tracked docs, five candidate files, two likely candidates. Reports live at `_tmp/docs-garbled-check/`; candidates in source surveys/reference material are not adjudicated corruption or a clean-encoding certificate. Fixtures independently require blocking-mode refusal for a replacement character.
- Verification scope limited: actual platform is Windows/Node v26.12.1/Git Bash. Dangling directory-junction traversal tests run and pass without skipping; the inherited WI2 file-symlink-path assertion still emits its explicit Windows privilege limitation. No Linux/macOS, Node 18 runtime, GitHub-hosted CI execution, host built-in write-protection test or model/API run is claimed. The CI definition and its local wiring/trigger controls are tested, not a remotely observed workflow run.
- Finalization handoff: Phase/Proof boxes describe execution evidence only. Independent closure, the WI3 roadmap tick and one local delivery remain coordinator/auditor obligations. The auditor must bind its actual reviewed payload using the supplied read-only snapshot; no plan/roadmap content is written by shell/scripts or a CLI setter in this execution.

## Closure

- dispatch audit #audit-20261117-template-consumer-wi3-1-13c94585 to agent_50213ebc-13c9-4585-b4bb-0644956778f9
- accepted #audit-20261117-template-consumer-wi3-1-13c94585: independently re-ran node tools/verify-consumer.mjs (exit 0, all six suites green), pnpm --prefix tools/mission-driver test (exit 0, 1029/1029, prompt-check OK), git diff --check (exit 0); diff scope confirmed at base b9cd0d293c024a8439abc3359c39f352cbd37c9d as exactly the 32 payload paths minus docs/roadmaps/template-consumer-roadmap.md (untouched, WI3 unticked), no unrelated modifications, whole-file ownership confirmed, payload=9bd29b6a2919469761680fa395333d809cd80a63386ff2e995e59ad3aa55fc9a ownership=whole-files.

## Deferred But Adjudicated

### Legacy source-document reference diagnostic

- Classification: out-of-scope improvement.
- Evidence: the default expanded source scan remains exit 1. Its diagnostics combine old engine/plugin-relative conventions, external corpus citations/line numbers, source-specific paths and some stale links; the raw output is preserved, not reclassified wholesale as real missing local files.
- Why Not Blocking Closure: the approved consumer gate checks actual installed managed documents, all profiles, add-on paths, guards and CI, and is green. The coordinator explicitly permits this separation rather than mass-editing architecture/design/reference history or protected law documents. Source-wide reference cleanliness is not a successful gate result.
- Reopening Event: separately authorize source-doc normalization, using the explicit engine/source/external/example conventions and reviewing real local defects individually. The source-wide command continues to expose the residual meanwhile.
- Successor Required: no automatic successor in this consumer roadmap; human scope decision required for broader normalization.
