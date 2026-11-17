# Template Consumer Workflow

## Goal And Authority

AGE consumers can safely adopt the template and follow a discoverable requirement → roadmap → goal-directed execution → independent acceptance → automatic plan commit loop. The user's instruction authorizes the installer/manifest corrections and the workflow changes described here; it does not authorize weakening protected-area review, rewriting history, automatic push, or editing external runner implementations.

## Scope

- Correct the confirmed consumer installation defects from the AGE v2 effectiveness analysis: preserve existing configuration, literal personalization, validate CLI choices, make skill discovery match selected shelves, deliver the advertised runner bridge, and test standalone vendoring.
- Record template provenance and expose drift without overwriting local customizations. Reinstallation is not a silent upgrade: conflicting existing scaffold or engine files must be reported, not combined into an unreported mixed version.
- Provide a task-oriented usage guide, discoverable through root and consumer entry points, explaining both interactive goal-directed agents and the optional mission-driver. Do not invent a universal `goal` CLI or imply a particular host mode is installed with the scaffold.
- Make roadmap-led goal execution the recommended workflow for substantial work. Small, low-risk direct tasks retain the existing no-plan path. Roadmaps may contain implementation, investigation, audit, experiment and decision work, each with a concrete deliverable and acceptance criterion.
- Permit evidence-driven AI refinement and human edits to pending roadmap work while an agent is running. Stable work-item identity, dependencies, approved objectives, autonomy and budget remain constraints; changes to business scope, protected areas or acceptance authority are not self-approved by the executor.
- Require one automatic local Git commit per independently accepted plan, before selecting the next work item. Use explicit task paths and a durable Git plan trailer; never stage unrelated work, secrets, ignored scratch artifacts, or push automatically. Commit failure is a delivery blocker, not permission to skip verification or disable hooks.
- Git/validation helpers may inspect evidence and emit results, but must not write or finalize roadmap/plan content. The agent records any required task-document evidence using its built-in tools; no helper-generated plan rewrite, status update or self-commit loop.
- Automatic commit is a coordinator step, never a pre-commit/post-commit hook that invokes itself. The accepted task payload, required verification and independent closure must still match the to-be-committed changes. A changed payload requires renewed verification/review; a receipt string alone is not approval of later edits. Finalization metadata is identified explicitly, not used to exempt product changes.
- Commit retries inspect the existing plan trailer and delivered content: no second delivery commit, no silent success when content has changed. Reject unrelated staged changes and mixed-ownership hunks that cannot be safely isolated; do not stash, reset, auto-amend or rewrite history to make the index convenient. Shared-file conflicts can block delivery without discarding asynchronous edits or restarting ordinary in-flight execution. Git history is the delivery receipt; do not append its own commit hash into the plan and trigger another commit.
- Keep acceptance and Git delivery ordered, not circular: finish the plan's counting-domain criteria and append independent closure/finalization metadata before committing. Its own commit is a subsequent coordinator obligation and next-selection gate, not a checkbox that the helper requires checked before it can create that same commit. Check the resulting Git receipt without creating another tracked edit.
- Repair current guide/tool mismatches, standalone plan discovery, documentation guard false-green cases, and consumer-contract CI coverage. Preserve historical plans/reports instead of rewriting their old format.

## Live Roadmap Semantics

1. Plan-completion roadmap updating is the synchronization point; do not add mandatory full-roadmap rereads, AI revision checks or custom merge/synchronization machinery. Agents MUST use their built-in Read/Edit/Write-class tools for roadmap/plan content access and mutation, relying on those tools' existing concurrent-write protection and conflict feedback. Do not use shell cat/sed/redirection, scripts, or a status CLI as an alternative task-document writer. Automated validation/CI may internally parse documents; that is not an alternative AI editing channel.
2. The selected plan freezes its work-item identity, goals, affected paths and acceptance baseline. Changes to other pending work take effect at the next selection boundary without interrupting the current plan. Running agent prompts are not retroactively replaced.
3. Perform the ordinary completion update with the built-in tools. If their feedback reveals a conflicting work-item identity/scope/acceptance or an intervening edit, resolve that reported conflict without overwriting human changes. Use the resulting updated worklist for next selection and the empty-queue decision; no additional unconditional reload or proactive AI concurrency inspection is required.
4. Human and AI edits remain narrowly scoped. AI may add/reorder/split pending work within the approved objective and autonomy, with evidence and rationale; it must not remove failed acceptance, invent approval, break dependencies, or split an in-flight work item silently. Never turn a roadmap into a second implementation specification.
5. Cancellation, credentials, safety and protected-scope changes may require an explicit hold/stop; “no restart for ordinary pending-list edits” is not a promise to ignore urgent intervention. Work added after a terminal run requires a new/resumed run, not an imaginary permanent watcher.
6. Preserve one execution home and one selector for a roadmap; asynchronous editing is not permission to dispatch the same work item twice. Preserve unrelated pending-item edits using the built-in tools and respond to their conflict feedback instead of restoring an old whole-file snapshot. Do not claim new host-level hot reload or a custom atomic multi-writer subsystem.

## Verification And Completion

- Independent draft review and closure audit remain required. A receipt is a portable evidence record, not an identity security boundary; machine-enforcement claims are limited to the actual controlled channel.
- The authorized workflow change allows evidence-backed refinement of pending work inside the approved objective; it does not delegate business acceptance, weaken executor/reviewer independence, approve a new solo fallback or authorize engine/law changes. If satisfying a gate needs those changes, stop that slice and obtain separate authorization.
- No-engine use has defined command bindings, review/verification/closure evidence and an unfinished-plan query. A roadmap-free qualifying plan has an explicit local task identity rather than undefined mission defaults.
- Verify production-shaped inputs, nonempty coverage, generated-artifact freshness, business results and negative controls as appropriate. Scope/expectation/baseline changes require their original authority; doc↔code consistency alone cannot waive a business requirement.
- Consumer CI tests default/frontend/java/all, add-on startup without sibling paths, existing-file safety, registry parity, plan/commit negative cases, guard self-tests and current guide routing. Heuristic diagnostics do not claim semantic proof.
- Every fixed non-obvious defect gets a regression test and a concise fix note; changes and their reasons are recorded in the daily log and stable owner docs. Unimplemented proposals remain explicitly adjudicated, not falsely marked delivered.
- Provenance is minimal source/profile/managed-content metadata, not a second progress ledger or an updater framework. Preflight engine conflicts before copying: an existing engine with unknown/incompatible provenance is not silently augmented with new-version files. Report the conflict while preserving existing bytes; missing required inputs fail visibly before target mutation. Diagnostics must not persist configuration secrets.

## Non-Goals

- No business-project migration, full autonomous model/API run, forced overwrite updater, external host patch, cryptographic reviewer identity scheme, new runtime npm dependency, or change to engine/law protected semantics.
- No general requirement that every tiny task needs a roadmap; no copying all downstream project-specific rules into the template.

## Acceptance

- A fresh consumer can discover and execute the documented default workflow without a sibling template checkout or undocumented runner commands.
- Ordinary pending-work edits are consumed at the plan-completion update using built-in agent tools; active-plan scope is not silently changed. There is no separate AI roadmap reread/revision-check/merge subsystem. Actual host/engine support and limitations are stated with code/test evidence.
- Accepted plans have exactly one plan-delivery Git receipt; rejected/unverified or payload-changed plans are refused by the supplied helper, and unrelated changes remain untouched. This is a cooperative local delivery guard, not a claim that arbitrary Git commands or forged receipts are impossible.
- Host capability claims name their inspected version/source and demonstrated boundary. Document the ordinary completion-update/built-in-tool workflow and actual backend limits rather than inventing a host flag, scheduler, reread protocol or protected-engine change. Examples cover pending research/audit work and reported-conflict handling without pretending to test the host's built-in write protection.
- The three delivery slices in `docs/roadmaps/template-consumer-roadmap.md` each close through independent review, real scoped verification and a local commit.
