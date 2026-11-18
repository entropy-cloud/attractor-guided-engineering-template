# Roadmap-Led Goal Workflow

## Start With A Task

For substantial work, use **requirement → roadmap → plan → independent execution → independent acceptance → one local delivery commit → next item**. Small low-risk tasks keep the no-plan path in `plan-authoring-and-execution.md`.

1. Fill the project context's real verification commands and settle the requirement/owner baseline.
2. Put work items in a roadmap with stable WI ids, dependencies, deliverables and acceptance criteria. Implementation, research, audit, experiment and decision work all belong here: research can deliver an evidence-backed recommendation rather than code.
3. Give one coordinator one execution home for the roadmap. It selects one eligible item and drafts a 2–6-phase plan. An independent draft reviewer accepts it; an independent executor implements it; a different closure auditor accepts the result. Record the actual dispatched actors.
4. On acceptance, perform the ordinary roadmap completion update and local delivery below. Continue from the resulting updated worklist, respecting dependencies; when it is empty, produce the roadmap completion summary.

## Working With A Host Goal

Goal is a **host capability**, not a universal CLI installed by AGE. Use your host's documented goal/continuation entry point, or ask an interactive agent to coordinate the loop. Minimum host capability: dispatch a subagent that cannot see the coordinator's chat (cold start), and obtain its session id for the plan receipt grammar. If the host cannot provide independent actors, keep the plan open and report the blocker — do not self-accept (see `plan-authoring-and-execution.md`, Independent Execution). The optional mission-driver has its own mission/run entry points; see `mission-driver-add-on.md`.

Copyable coordinator instruction:

```text
Follow AGENTS/context and the requirement. Use the roadmap as the worklist;
choose one eligible item at a time. Include research/audit/decision work when
it has a concrete deliverable. Dispatch independent draft review, execution
and closure audit. Use built-in Read/Edit/Write tools for roadmap/plan content.
Keep the selected plan's identity, scope and acceptance fixed. On acceptance,
update the roadmap normally, then deliver that plan once using commit-plan.
Use the resulting updated worklist for the next selection or empty-queue
decision. Handle conflicts reported by the built-in tools; preserve other edits.
Stop on failed acceptance/delivery or safety holds, and report the blocker.
```

Humans can add/reorder pending items while implementation continues. AI can refine pending work within the approved objective/autonomy/budget, with evidence and rationale; preserve dependencies and business acceptance authority. An added investigation or reordered pending audit takes effect at the next selection, without restarting implementation or replacing an in-flight prompt. Current-item scope/acceptance changes need explicit reconciliation; cancellation, credentials or protected-scope issues can require a hold.

Task-document content access uses built-in Read/Edit/Write-class tools and their existing conflict feedback, not shell/script document writers or the legacy status setter. The normal completion update is sufficient: no extra full-roadmap reread, revision/CAS check or custom synchronizer. Validators may internally parse documents and emit results, but do not finalize task documents for the agent.

### Backend Boundary

The inspected DSH goal source is the template repository's historical goal-domain survey of master@141eb6fe, not an installed-host/model-run test. The supplied mission-driver drafts batches of 1–3 plans and evaluates a forEach list at step entry; run configuration is cached. Its execute prompt ticks early and its closure prompt permits multiple commits. The native plugin reuses a run-scoped session handle across steps, so different step names alone do not provide independent audit. These backends are **not equivalent** to this single-plan coordinator procedure without separately arranging independent actors and delivery. AGE adds no scheduler, hot reload or terminal-run watcher; new work after termination needs a new/resumed run.

## Standalone Plans And Checks

No engine is required. Put a roadmap plan under `docs/plans/<slug>/`; use its slug as `mission` and `M<n>-WI<n>` as `work-item`. A qualifying roadmap-free task uses `docs/plans/standalone/`, `mission: standalone`, `work-item: local:<stable-task-id>`. These local bindings do not extend the engine schema.

Every consumer delivery plan declares explicit, nonempty `verify: [keys]` and maps each key to an exact real command in its prerequisites/project context. For example, `verify: [test]` can bind `node --test test/*.test.mjs` in a consumer whose tests actually live there. Run those commands and record their results; no mission defaults are assumed.

```bash
node tools/plan-status.mjs --list
node tools/plan-status.mjs --unfinished
node tools/plan-status.mjs --check docs/plans/<slug>/<plan>.md
```

`--check` checks receipt pairing and declared independence, not Git delivery. An in-flight plan can pass it while reporting **not delivery-ready**. Shared `consumer-ledger.mjs` derives `deliveryReady` from legal nonempty Phase checkboxes, explicit successful verification and latest paired review/audit acceptance, with reviewer ≠ auditor and executor ≠ auditor. Actor provenance comes from coordinator dispatch/execution records; text/session ids are evidence, not authentication. Missing actors block automatic delivery. There is no solo self-acceptance fallback.

`rawStatus` remains visible. Historical explicit `completed` alone is not proof; engine completed shortcuts and mission-default verification differ from this consumer check. Inventory does not reopen or enqueue historical records. New plans keep `status: active` and derive acceptance; held/cancelled/superseded/deferred are not deliverable.

## One Accepted Plan, One Commit

The coordinator calls the helper after independent acceptance, never from a Git hook. Work-item acceptance and its roadmap tick precede delivery; the plan's own commit is a subsequent next-selection gate, not a Phase prerequisite.

Before final verification, finish the payload, Phase ticks, log and other owner updates. Record execution in `## Execution` as `- Executor: <actual-session-id>` from the coordinator's dispatch. Review the diff for ownership, then request a read-only snapshot of **explicit files** (include the plan, roadmap/log if changed, source and tests):

```bash
node tools/commit-plan.mjs --snapshot docs/plans/<slug>/<plan>.md -- docs/plans/<slug>/<plan>.md src/example.mjs test/example.test.mjs
```

The command emits `- payload <sha256> base=<commit> paths=["..."]`. Record it in `## Verification` with the built-in edit tool. After running verification, append `- pass <key> <runId> exit=0 payload=<sha256>`. The independent auditor inspects the actual payload/diff and whole-file ownership, records the latest same-id dispatch/acceptance in `## Closure`, and includes `payload=<sha256> ownership=whole-files` in its accepted conclusion. Review receipt grammar is in `plan-authoring-and-execution.md`.

Only this plan's Verification pass/payload lines, Closure receipt lines, blank plan lines and the selected roadmap checkbox tick are excluded from the payload digest. Other plan prose and other pending roadmap edits remain covered. This permits final acceptance metadata without a self-referential hash/second commit. Finalize other text before verification; product/scope changes require renewed verification and acceptance. Helpers emit results but do not write plan/roadmap content.

```bash
node tools/commit-plan.mjs --commit docs/plans/<slug>/<plan>.md --message "feat(example): deliver accepted result" -- docs/plans/<slug>/<plan>.md src/example.mjs test/example.test.mjs
```

Use exactly the reviewed paths. The commit message follows the `nop-git` skill's message format: conventional-commit subject naming the delivered outcome with the work-item id when one exists, a body carrying the why/scope/boundary information a later reader needs, and the `Verification:` line for the plan's gate results. The helper checks acceptance/current payload, stages those files, runs a normal local commit with hooks, and adds `AGE-Plan: <repo-relative-plan-path>`. It rejects unrelated staged content, partial/mixed ownership, unsafe/ignored/scratch/secret-like paths and symlinks. It cannot infer arbitrary secrets or ownership from source text: the auditor's whole-file review matters. If a shared file also contains unrelated human pending work, do not approve its whole-file ownership; isolate it explicitly or hold delivery, preserving that work.

On retry, a matching unique trailer/path set/content reports already delivered rather than creating another commit. Changed content is a blocker. A hook/commit failure stops the coordinator; own task files may remain staged, and a hook mutation can leave a commit requiring manual reconciliation. No automatic reset/stash/amend, hook bypass or push occurs. Fix the cause and renew evidence when the payload changes. Inspect the returned Git receipt without writing its hash back into the plan.
