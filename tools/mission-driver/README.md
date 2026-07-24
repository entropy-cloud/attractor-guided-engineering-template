# mission-driver

OpenCode-based mission driver workflow engine. Runs an automated
health-check → review → execute plans → draft plans → deep-audit loop driven by
`missions/<name>.json`, spawning `opencode run` for each agent step and a shell
command for each tool step. Ships a live monitor dashboard and structured event
streaming.

```
node src/main.js <mission-name>
```

Common flags: `--dry-run`, `--model <model>`, `--agent <agent>`,
`--max-cycles <n>`, `--step <STEP>` (single-step debug, maxSteps=1),
`--from-step <STEP>` (entry override + keep looping; mutually exclusive with
`--step`), `--no-monitor`, `--monitor` (standalone browsing), `--list-missions`.

## 配置项 (Configuration)

### Model selection

| Field | Source | Default | Notes |
|---|---|---|---|
| `model` | `--model` CLI · `OPENCODE_MODEL` env | `zhipuai-coding-plan/glm-5.2` | Used for every main agent step (CHECK / DRAFT / EXECUTE / REVIEW / AUDIT …). |
| `parseModel` | `--parse-model` CLI · `OPENCODE_PARSE_MODEL` env | _unset → falls back to `model` | Optional. Routes the parse-fallback + correction-retry paths to a cheaper/faster model. |

`parseModel` is **optional**. When unset, the parse-fallback and correction
retries use `model` exactly as before (no behavior change). Set it to a cheaper
model to lower the cost of the fallback path that infers a missing
`<AI_STEP_RESULT>` marker or corrects an invalid one.

Examples:

```bash
# env var
OPENCODE_PARSE_MODEL=zhipuai-coding-plan/glm-4.7-flash node src/main.js my-mission

# CLI flag
node src/main.js my-mission --parse-model zhipuai-coding-plan/glm-4.7-flash
```

The parse-fallback path is already short-circuited by a tolerant marker regex
(OPT-2) — it only runs when both the strict and tolerant extractions miss.
`parseModel` only affects the rare residual fallback and the correction retry,
both of which are lightweight classification tasks.

### Cycle limits (`--max-cycles`)

`maxCycleVisits` is a **per-step** visit cap: each step may be visited at most
`N` times before the flow emits a `limit_hit` (`max_cycles`) event and stops.
The three flows each carry their own default, tuned to observed convergence:

| Flow | File | Default `maxCycleVisits` | Scope |
|---|---|---|---|
| mission-driver (main) | `flows/mission-driver.json` | **8** | CHECK / REVIEW_PLANS / EXEC_PLANS / DRAFT_PLANS / DEEP_AUDIT cycle |
| plan-execution (subflow) | `flows/plan-execution.json` | **6** | EXECUTE ↔ CLOSURE_AUDIT ↔ BUILD_VERIFY per plan |
| deep-audit-loop (subflow) | `flows/deep-audit-loop.json` | **6** | CHECK_OPEN_AUDITS / MULTI_AUDIT / OPEN_AUDIT / SCAN_NEW_RESULTS |

`--max-cycles <n>` overrides the cap for **all three flows** at once (it
propagates from the parent engine into each child subflow's engine). Use it when
a mission legitimately needs more iterations than the default.

Tuning guidance by mission complexity:

- **Simple mission** (1–2 plans, clean convergence): leave the default, or lower
  to `2`–`3` to fail fast on a stuck loop.
- **Complex mission** (many plans, audit-driven rework): keep the default; the
  per-flow caps (8 / 6 / 6) leave retry headroom while staying below the
  previously observed inefficiency thresholds (main 30, plan-execution 10,
  deep-audit 15).
- **Extreme / exploratory**: raise explicitly, e.g.
  `node src/main.js my-mission --max-cycles 12`.

Related CLI flags: `--max-inner-cycles`, `--max-total-steps`.

## Run Postmortem (`--analyze-run`)

A **manual, one-shot** command that turns a finished (or crashed/stuck) mission
run into an evidence-backed optimization report, then distils the durable
lessons into long-term memory so the next run actually improves (a Reflexion
loop). It reuses the `--draft-mission` one-shot agent pattern — **no flow
engine, no state machine, no monitor**.

### Usage

```bash
./tools/mission-driver.sh --analyze-run                       # analyze the most recent run
./tools/mission-driver.sh --analyze-run 2026-07-01-174215     # analyze a specific run
./tools/mission-driver.sh --analyze-run 2026-07-01-174215 --model <strong-model-id>
```

`<runDir>` is the run's directory name under `_tmp/` (the `-mission-driver`
suffix may be omitted — matched by exact → prefix → contains). When omitted,
the newest `*-mission-driver/` run is selected and its name is printed to
stdout so you know which run was analyzed.

### What happens

1. **Skeleton pre-digestion (pure JS, no AI):** `buildRunSkeleton` reads the
   run's `run-state.json` + `events.jsonl`, compresses them into a ~2–4 KB
   Markdown skeleton (mission, status, retries, limit hits, red-flag steps with
   their logFile basenames), and injects it at the top of the prompt.
2. **Module resolution:** `resolveRunModule` maps the run → mission → module
   to locate the right module memory store.
3. **One agent call** (`runner.runAgent`) runs `prompts/run-postmortem.md`. The
   agent is a Reliability Engineer + Reflexion self-reflector: it grep/offset-
   reads only the red-flag logs (never all of them), quotes evidence, classifies
   each finding by severity (SEV1/2/3) and origin (PROMPT/FLOW/ENV-TOOL), and
   writes a concrete fix pointing at a real target file for every finding.

### What it produces

| Artifact | Location |
|---|---|
| One-shot postmortem doc (evidence + fixes) | `tools/mission-driver/docs/postmortems/{date}-{mission}-postmortem.md` |
| Self-memory update (harness-level lessons) | `tools/mission-driver/memory/{_index.md, lessons.md, runs.md}` |
| Module-memory update (domain/codebase lessons) | `docs/memory/<MODULE>/{_index.md, lessons.md, runs.md}` (skipped if module unresolvable) |

The run's analysis artifacts are written to an isolated `_tmp/analyze-run-<ts>/`
so the analyzed run is never polluted. **Manual trigger only** — it does NOT run
automatically at mission end.

### Model recommendation

Postmortem is a heavy read-many-logs + reasoning task. The default model
(`zhipuai-coding-plan/glm-5.2`) works, but for best results pass a strong
long-context reasoning model via `--model`. Token cost is bounded by the
skeleton + targeted log reads (typically 1 skeleton + 3–6 red-flag log slices).

## Memory System

A **file-based, git-versioned** memory that lets each `--analyze-run` distil
durable lessons and feed them back into the next mission's prompts — closing the
self-improvement loop without a vector DB or extra service.

### Directory layout

Two strictly-separated stores by concern:

```
# ① mission-driver self-memory — about the harness/loop itself (随工具走)
tools/mission-driver/memory/
├── _index.md      # always-load core: description + Top rules (≤2KB, injected into every mission prompt)
├── lessons.md     # accumulating procedural lessons (id/count/severity/evidence/fix schema)
├── runs.md        # episodic index: one row per analyzed run (append, capped ~50)
└── archive/       # stale/low-sev lessons moved here during defrag

# ② per-module memory — about that module's domain/code (仓库级, module-isolated)
docs/memory/
├── <module-a>/     # a module's own memory (created on demand when its first mission runs --analyze-run)
│   ├── _index.md
│   ├── lessons.md
│   ├── runs.md
│   └── archive/
├── <module-b>/ ...  # created on-demand by the agent when a mission for it first runs --analyze-run
└── <module-c>/ ...
```

`_index.md` uses YAML frontmatter (`scope: mission-driver` or `module: <module>`,
`description`, `updated`, `lesson_count`) + a "Top rules" section. The `_`
prefix here is the FSD §9.3-mandated always-load core filename, **not** a
codegen-generated file — it is an exception to the repo's `_`-prefix rule.

### Consolidate-don't-accumulate protocol

Enforced by the `run-postmortem.md` prompt. The agent reads a store's
`_index.md` + `lessons.md` first, then for each durable finding:

- **Equivalent lesson already exists → update in place:** bump `count:`, refresh
  `last_seen:`, append the new evidence ref. Never add a duplicate.
- **Genuinely new → add a lesson** with a stable `id`, imperative rule, origin
  tag, severity, `count: 1`, evidence ref, concrete fix target.

Curation keeps memory lean:

- `_index.md` ≤ ~2KB; `lessons.md` ≤ ~400 lines; `runs.md` ≤ ~50 rows.
- Promote a lesson into `_index.md` "Top rules" only when high-severity AND
  recurring (`count ≥ 2`).
- Near-duplicates are merged; stale low-sev entries (older than the last ~10
  runs) are archived to `archive/`.

### How memory flows back (the closed loop)

Memory is useless if never read back. On every normal mission run,
`src/main.js` reads both `_index.md` cores into `delegates.vars`:

- `{{selfMemoryIndex}}` ← `tools/mission-driver/memory/_index.md`
- `{{moduleMemoryIndex}}` ← `docs/memory/<current-mission-module>/_index.md`
  (empty string when the module has no memory dir → block ignored)

These are injected via a `<memory_context>` block at the top of
`prompts/draft-from-roadmap.md`, `prompts/execute.md`, and
`prompts/closure-audit.md` — so the distilled rules reach every draft/execute/
audit decision. Only the compact `_index.md` is auto-injected (progressive
disclosure); `lessons.md` details are read just-in-time by the agent when a rule
needs expanding. This costs ~2×2KB of tokens per run.

## Further reading

- `TROUBLESHOOTING.md` — common failure modes.
- `EXECUTION-PRINCIPLE.md` — execution rules.
- `design/mission-driver-flow-design.md` — top-level flow orchestration.
- `design/flow-engine-design.md` — engine layer (Step / Transition / subflows).
