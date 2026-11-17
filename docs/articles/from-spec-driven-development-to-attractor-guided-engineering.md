# From Spec-Driven Development to Attractor-Guided Engineering

`nop-chaos-flux` is a low-code runtime framework built with React 19, Zustand 5, and Vite 8. It is inspired by Baidu AMIS, but it was independently reimplemented from scratch around innovative design principles. It includes a JSON Schema compiler and runtime, as well as design tools such as Report Designer and Flow Designer.

The initial version of this project was completed by a single programmer in two months, entirely through automated AI-assisted development. Unlike ordinary AI-assisted development, the project did not suffer quality degradation as more features were added. Instead, module boundaries became clearer, document categories became more stable, tests and audits became better at catching real problems, and code quality kept improving.

I recently gave several internal talks and named this practice **Attractor-Guided Engineering** (AGE). Later, during code review, I found that many people still had not really understood it. Some people's workflow was close to casual vibe coding. Others used something like OpenSpec-style spec-driven development, with an overall tendency toward task-driven, feature-by-feature execution. As work accumulated, inconsistencies in the code steadily accumulated too, and deviation from the architectural design became normal.

This article analyzes the difference between AGE and spec-driven development, and what ordinary business projects can learn from the large-scale AI engineering practice in `nop-chaos-flux`.

## Core Hierarchy

The core of AGE is the following conceptual hierarchy:

**state space -> attractor -> trajectory -> control**

- **State space**: all implementation states the system may evolve into under the current constraints
- **Attractor**: the stable structure the system is repeatedly pulled back toward over long-term evolution
- **Trajectory**: the actual evolution path left behind after each round of generation, verification, and correction
- **Control**: the mechanisms that continuously influence the trajectory through local signals

All possible combinations of code, documentation, and tests that the repository may evolve into under existing constraints form the state space. Humans, AI, review, CI, document updates, and other ongoing actions form the evolution rules. Together, they produce the live repository history, which is the trajectory. The attractor is the stable structure the system is repeatedly pulled back toward during long-term iteration.

Large-scale AI development is essentially a controlled-convergence problem in a dynamical system. AI expands the state space extremely quickly. The key is not to add guardrails everywhere, but to first understand what structure the system should be pulled back toward over the long term.

An attractor is not a fully written endpoint, not a roadmap, and not the boundary of allowed activity. It is a structure implicitly defined by a small number of high-level constraints: local implementations may vary, but the whole keeps being pulled back by these relationships toward the same class of shape.

In `nop-chaos-flux`, the first thing that defined the attractor was not a plan, lint rule, test, audit, or spec file. It was the architecture docs under `docs/architecture/` with explicit precedence. In the rest of this article, these architecture docs with owner and precedence are called owner docs.

`docs/architecture/README.md` states clearly that `docs/architecture/` is the current final-state architecture baseline, `flux-design-principles.md` is the governing-principles anchor, `frontend-programming-model.md` owns top-level primitive and core-boundary precedence, and other normative docs own local precedence within their topics.

These documents do not enumerate every correct implementation. Like equations, they define a stable structure: what primitives exist, which dependency directions are legal, which owner boundaries cannot be broken, and which old patterns no longer belong to the correct state space. They first define the sustainable cluster of states; only after that do implementation, testing, planning, and audits have a reference point.

Plans, verification, audits, logs, bugs, and testing all come afterward. They are not the attractor itself. They are harnesses that keep the system trajectory close to the attractor.

Flux/AGE is not centered on spec evolution. It is centered on attractor definition and trajectory convergence.

## Real Development History

> The file paths below reference the source project's actual naming convention at the time (`YYYY-MM-DD`). For new projects using this template, use the naming convention in `docs/guides/doc-organization.md` (`YYYY-MM-DD-HHmm`).

"Architecture docs define the attractor" may sound like ordinary documentation governance at first. But if you look closely at the actual development records under `docs/logs/`, the difference becomes visible.

For example, `docs/plans/371-deep-audit-2026-05-19-owner-routing-plan.md` is a typical entry point. It did not edit code directly. Instead, it converged the 64 retained findings from the `2026-05-19` deep audit into an owner-routing baseline. Every finding had a unique owner bucket, priority, successor plan, and owner-doc obligation. There was no ownerless issue, no multiply-owned issue, and no silent downgrade into a vague follow-up.

Its role was to freeze how a round of deviations should be closed. Later execution plans then closed local trajectories into concrete result surfaces. `docs/plans/382-deep-audit-2026-05-19-table-and-crud-owner-state-and-event-contract-plan.md` closed table/CRUD owner state and event payload: `Current Baseline` declared the live state of explicit empty-array owner state and event payload, execution items fixed the empty-array fallback, focused tests proved the result, `docs/components/table/design.md` and `docs/components/crud/design.md` synchronized the owner contract, and finally repo-wide `pnpm typecheck`, `pnpm build`, `pnpm lint`, and `pnpm test` all passed. The independent closure audit `ses_1bd9ed593ffeVpkho4lb4wPR6p` recorded `Verdict: acceptable`.

`docs/plans/388-deep-audit-2026-05-19-form-tree-widget-accessibility-plan.md` shows another kind of closure. Input-tree and tree-select visible-node roving focus, `ArrowUp` / `ArrowDown` / `Home` / `End` navigation, and loading `aria-busy` / `aria-describedby` all had focused proof, but the plan explicitly adjudicated `No owner-doc update required`. This shows that a plan is not just a task list. It is also responsible for deciding whether the change modifies the owner-doc baseline.

`docs/plans/400-deep-audit-2026-05-19-test-harness-reliability-plan.md` and `docs/bugs/62-e2e-shared-websocket-error-suppression-fix.md` show the role of the memory harness. The problem was not that a business feature failed. The E2E shared fixture was filtering too broadly, suppressing real transport/runtime failures as well. The fix did not only change code. It added `tests/e2e/fixtures-hard-gate.spec.ts` to prove that the fixture now fails, and recorded a bug note rule: if a future test truly expects WebSocket failure, it must use a per-test allowance and must not restore fixture-wide suppression.

`docs/logs/2026/05-19.md` and `docs/logs/2026/05-20.md` are not diaries. They record focused proof, owner-doc adjudication, repo-wide gates, independent audits, and full-green baselines for every closure slice.

These materials form a real chain: owner docs define the long-term structure; audits find deviations; plans route them and freeze ownership; focused proof demonstrates local results; owner-doc adjudication decides whether the baseline changed; logs, bugs, and testing preserve cross-session memory; closure audit rejudges completion from the live repository.

This is the harness in AGE. The goal is not to make each task look more complete. The goal is to keep the system trajectory returning toward the attractor.

## Where OpenSpec Is Structurally Strong

OpenSpec is a representative spec-driven development framework. It structures one class of work well:

- `openspec/specs/` stores the current behavior specifications for capabilities.
- `openspec/changes/` stores proposed changes, including `proposal.md` (why change, what changes, what is affected), `design.md` (technical design when necessary), and `tasks.md` (implementation checklist).
- `changes/<name>/specs/` records specification deltas with `ADDED`, `MODIFIED`, `REMOVED`, and `RENAMED`.
- `archive` applies fixed rules to write deltas back into the main specs.

This mechanism reduces the cost of updating specifications. OpenSpec does not require AI to freely understand a whole requirement and then edit documents arbitrarily each time. Instead, it uses fixed sections, requirement header matching, and delta application to merge structured changes back into the main specs. This works well when behavioral specifications are clear and need to be parseable, archivable, and written back consistently.

## Where OpenSpec Is Limited

OpenSpec's spec format, with Requirement, Scenario, SHALL/MUST, and delta sections, is tool-friendly. But as a general way to organize project knowledge, it is not flexible enough.

Much repository knowledge does not naturally look like requirement/scenario:

- architecture hierarchy and precedence
- history of terminology misreadings
- external research material such as PPTs and discussion records
- conclusions from one source-code audit
- observations from manual testing
- diagnosis paths for complex bugs
- why one plan could not close

If all of these must first be translated into spec/change form to obtain a formal location, the conversion cost is high and the original context is lost. External documents, discussion records, analysis reports, and bug retrospectives can directly become repository memory. Forcing them into requirements/scenarios can flatten the information instead.

In execution verification, the two approaches also reflect different tool philosophies. OpenSpec's `tasks.md` is a checklist, and `/opsx:verify` is an optional agent verification skill that must be manually enabled through expanded workflows. `archive` checks task status and warns about risk, but the user can still continue after confirmation. Strict closure is left to the team.

Flux plans build independent closure audit into the required path. A plan must start from the current baseline, state `Goals` and `Non-Goals`, define execution items where each item is tagged as `Fix` / `Decision` / `Proof`, and specify `Closure Gates`. Before it can be marked `completed`, an independent subagent or reviewer must return to the live repository and perform a closure audit. `docs/plans/361-slot-contract-host-manifest-and-owner-doc-closure-plan.md` puts the current baseline, finding ownership matrix, execution phases, closure gates, adjudicated deferred items, and independent review evidence together. This is not a checklist. It strictly defines completion conditions and requires independent audit evidence. **It emphasizes not what was done, but to what extent something must be landed before it really counts.**

## Why Spec-Driven Development Easily Becomes Task-Oriented

Spec-driven development naturally pulls human and AI attention back to "how do we complete this change?"

A change usually has a proposal, design, tasks, and delta specs. This is much better than verbal requirements, but it is naturally organized around a single change: why it changes, what changes, how it is done, and which checklist items are complete. Over time, spec-driven development easily becomes a more formal task-dispatch system.

This task orientation has a hidden risk: specs have been updated, tasks have been checked, archive has run, and both AI and humans get a strong sense of completion. But whether the system is actually closer to its long-term structure is not proven by the change itself. That must be checked against architecture docs, the live repo, tests, logs, and independent audits.

If you try to maintain specs at Flux-level precision, the cost is usually higher. Flux does not maintain a single spec tree. It maintains a set of repository memories with different responsibilities: architecture docs define the attractor; plans define local trajectory closure; logs record evolution; bugs preserve complex diagnosis; testing preserves human discoveries; analysis preserves research judgment; audit rechecks the live repo. Forcing all of that into a spec/change structure creates ongoing conversion cost.

Spec-driven development can be a local harness inside AGE for managing behavior-spec evolution. But it should not replace architecture docs, nor should it replace plan closure, logs, bugs, testing, and audits as independent repository memories.

## What If You Only Need To Read One Owner Doc?

This shows the fundamental difference between the two methods.

In Flux, if you only need to check the current owner contract for renderer runtime, you can route directly from `docs/index.md` to `docs/architecture/renderer-runtime.md` and related references. You do not need to create a change, write a proposal, define tasks, or rewrite the question as a spec delta.

If it is just research, it may go to `docs/analysis/`. If it is a manual testing discovery, it goes to `docs/testing/`. If it is a complex bug, it goes to `docs/bugs/`. If it is execution closure, then it writes a plan. If the stable baseline changes, then it returns to the owner doc.

Flux's document organization is free, but not arbitrary. Free means it does not force every kind of knowledge through the same artifact workflow first. Constrained means every material type has clear responsibility and cannot randomly claim fact authority.

OpenSpec's organization is more structured. It is suitable for putting proposed behavior changes into a change package and writing specification deltas back to main specs. But routing general repository knowledge is not its default mainline problem.

## Tasks Are Not Plans

OpenSpec's `tasks.md` does not correspond to Flux `plans`.

At most, `tasks.md` corresponds to execution-list fragments inside a Flux plan, or the todo list of the current session. It helps AI avoid missing steps, but it does not answer these questions:

- What is the current live repository baseline?
- What is explicitly not being done in this change?
- What evidence proves that the work is really complete?
- Which defects cannot be downgraded into follow-ups?
- Who independently reviews completion?

The value of a Flux plan is not that it contains more tasks. It is a closure contract for a local trajectory.

So tasks are useful for AI, but tasks are not a source of truth. `- [x]` only means the implementer claims that an item is done. Real proof must return to the current code, tests, owner docs, and independent review.

## Change Sources Are Not Only Spec Changes

OpenSpec has a clear path: organize behavior-spec evolution around specs and changes.

Flux has broader sources of change:

- new requirements raised by users
- architecture drift found by reading source code
- owner-boundary issues found by audits
- interaction problems exposed by testing issues
- historical regression risks recorded in bug notes
- design judgments from external research or analysis
- plan closure audits overturning earlier "completed" judgments

These sources should not necessarily become spec deltas first. They may enter analysis, testing, bugs, logs, plans, or directly update architecture docs. Whether they need to become behavior contracts depends on whether they are part of the long-term baseline.

This is the point of Flux's document-organization freedom. Different sources of information first stay in different places instead of all being stuffed into one specification-evolution channel.

## Why File-In / File-Out Matters

I have emphasized many times in talks that one best practice for AI-driven development is file-in / file-out. This is not document cleanliness for its own sake. Attractors and harnesses need carriers.

File-in: inputs should not remain only in the chat window. Even if the content is messy, first write it into a requirement file, analysis file, or plan file, and then `@` that file in OpenCode.

File-out: outputs should not just be printed in the window and then disappear. Important conclusions, analyses, plans, testing records, bug diagnoses, and architecture constraints should all be written into `docs/` and classified by responsibility:

- architecture rules -> `docs/architecture/`
- change closure -> `docs/plans/`
- execution trajectory -> `docs/logs/`
- manual testing discoveries -> `docs/testing/`
- complex defect diagnosis -> `docs/bugs/`
- research judgment -> `docs/analysis/`

The point is not to write more documentation. Once output is classified and persisted, it enters repository memory. The chat window is temporary context. Files are repository memory.

## Code Is The Current Implementation Fact, Not The Only Fact

Code is the fact source for current implementation. Types and tests protect current behavior. Architecture owner docs with precedence define the attractor: the structure the system should converge toward over the long term. Logs, bugs, analysis, and testing record trajectory and externalized memory.

These do not conflict. Conflicts happen in two cases:

- documents begin to repeat fragile implementation details
- document completion is treated as proof that the code is already correct

OpenSpec's behavior-first boundary also tries to avoid the first problem: behavior specs should describe verifiable behavior, not internal implementation details. Flux further emphasizes the second problem: even when a document states correct behavior, it cannot replace current repository verification. Real closure must return to code, tests, owner docs, logs, and audit evidence.

## The Real Difference

OpenSpec solves this problem: how to organize behavior-spec updates through structured specs, changes, deltas, and archives. Its focus is the evolution flow of specifications.

AGE solves this problem: when AI expands the state space at high speed, how does the system first define the attractor and then use plans, verification, audits, logs, bugs, analysis, testing, and other harnesses to keep the trajectory converging?

The two tools solve problems at different levels. OpenSpec is strong at structured specification workflow. Flux/AGE is strong at defining the attractor through architecture owner docs with precedence, then using free but responsibility-bounded document routing and strict closure harnesses to keep the repository converging over time.

The move from spec-driven development to Attractor-Guided Engineering is not a move from "write specs" back to "do not write specs." It is a move from "organize changes as spec updates" toward "define where the system should converge over the long term, and keep pulling each round of AI generation back through that structure."

## What Ordinary Projects Can Use Directly

You do not need to copy Flux's full governance.

**First, file-in / file-out.** Put inputs into files before `@`-ing them to AI. Write outputs into `docs/` instead of leaving them only in the chat window. This takes only a few minutes, but it lets AI depend on traceable repository memory instead of context memory.

**Second, write an architecture document for core business and define the business attractor.** Do not write a code tour. Write fact sources, state transitions, ownership boundaries, and common misunderstandings.

**Third, write lightweight plans for complex changes.** Include current baseline, goals, what will not be done, execution items, proof items, and closure conditions. Before completion, use an independent session or independent reviewer to recheck.

**Fourth, turn repeated problems into repository memory.** Manual issues go to testing, complex bugs go to bugs, research conclusions go to analysis, and high-frequency errors go into audit scripts.

Spec updates are a necessary layer. System convergence still needs an attractor.

**nop-chaos-flux is open source:**

- GitHub: https://github.com/entropy-cloud/nop-chaos-flux
- Gitee: https://gitee.com/canonical-entropy/nop-chaos-flux
