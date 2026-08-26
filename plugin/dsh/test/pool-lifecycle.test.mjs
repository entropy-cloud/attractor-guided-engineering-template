/**
 * pool-lifecycle.test.mjs — efficiency-layer agent pool truth table
 * (age-autonomy M4-WI32, plan `docs/plans/age-autonomy/2026-08-27-0433-2`
 * Phase 3 Proof; the WI36 gate lower bound ≥10 lives here).
 *
 * Coverage matrix (13 cases):
 *   - drafter pool lifecycle: create-on-first-use + followup reuse, one
 *     attemptId generation token per dispatch (04 §2.1/§2.3)
 *   - reviewer group scope: same group reuses one reviewer, cross-group
 *     starts fresh (04 §2.2 — the group is the maximal reuse granularity);
 *     groupScopeOf three legs (frontmatter `group:` / filename timestamp
 *     prefix fallback / bare stem last resort)
 *   - idle TTL dispose: timer fire → member revoked → next acquire creates
 *     a fresh member (04 §2.1)
 *   - rotateEvery count rotation + generation judgment: threshold forces a
 *     new member; the old attempt is stale (cross-generation), the new one
 *     current (same-generation) (04 §2.2/§2.3)
 *   - P7 audit ban, pool layer: closure-audit / deep-audit acquire is
 *     structurally bypassed REGARDLESS of the agent mode config (04 §2.4)
 *   - P7 audit ban, dispatch chain: a pooled-DECLARED auditor still
 *     dispatches fresh sessions (pool stays empty, honest note carried)
 *   - executor dormant ruling: execute bypasses the pool with the explicit
 *     note; the executor role tag still registers (the red-line registry)
 *   - role mutex (final-review P2-5): one continuable subagent never both
 *     drafter and reviewer/auditor — registry refusal + the dispatch-chain
 *     refusal when the host hands out an already-tagged session
 *   - auditor ≠ executor (final-review P2-5): the audit candidate check +
 *     executorSessionsOf derivation (plan claim holders from frontmatter ∪
 *     pool executor tags)
 *   - recovery interop, same generation: live current member → resume
 *     (followup injection, NO new line, NO new session) (04 §2.3)
 *   - recovery interop, cross generation: TTL-disposed-but-live member →
 *     REDISPATCH + member removal (old line preserved append-only); the
 *     dead-member variant re-creates through the pool
 *   - same-cycle double dispatch through the pool + the review lease
 *     compatibility face: same sessionId dispatch lines on two same-group
 *     plans; writer-identity latest-line lease holds per plan (the pooled
 *     reviewer writes, third parties denied)
 *   - headless degradation preserved: no agents face ⇒ registration-only,
 *     the pool stays empty
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createWatchdog } from "../src/supervisor/watchdog.ts";
import { createDispatchAgent } from "../src/supervisor/exec-arm.ts";
import { evaluateGates } from "../assets/src/law-core.mjs";
import { readReceipts } from "../src/supervisor/receipt.ts";
import {
  createAgentPool,
  executorSessionsOf,
  groupScopeOf,
  resolvePoolConfig,
} from "../src/efficiency/agent-pool.ts";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";

const NOW_MS = Date.parse("2026-08-27T12:00:00.000Z");

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "pool-lifecycle-"));
}

// ── fixture writers ──────────────────────────────────────────────────────────

function writePolicy(
  root,
  {
    reviewerPooled = true,
    reviewerIdleTtl = 30,
    reviewerRotate = 8,
    auditorPooled = false,
    drafterRotate = null,
  } = {},
) {
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(
    join(root, "missions", "autonomy.policy.yml"),
    `version: 1
limits:
  maxAuditRounds: 3
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: enforce
  - id: closure-audit-binding
    match: "{{plansDir}}/**/*.md"
    rule: closure-audit-binding
    mode: enforce
  - id: roadmap-audit-binding
    match: "{{roadmapPath}}"
    rule: roadmap-audit-binding
    mode: enforce
  - id: claim-taken
    match: "{{plansDir}}/**/*.md"
    rule: claim-validity
    mode: enforce
  - id: meter-guard
    match: "{{roadmapPath}}"
    rule: audit-rounds-overflow
    mode: enforce
  - id: roadmap-write-guard
    match: "{{roadmapPath}}"
    rule: roadmap-write-guard
    mode: enforce
  - id: append-only-records
    match: "{{plansDir}}/**/*.md"
    rule: record-append-only
    mode: enforce
  - id: append-only-records-roadmap
    match: "{{roadmapPath}}"
    rule: record-append-only
    mode: enforce
triggers:
  - when: "plan.full-tick and mechanical-verification-missing"
    dispatch: mechanical-verification
  - when: "plan.full-tick and mechanical-verification-pass and closure-receipt-missing"
    dispatch: closure-audit
  - when: "plan.status=draft and review-dispatch-missing"
    dispatch: plan-review
  - when: "plan.status=active and claim-expired"
    action: reclaim-claim
agents:
  drafter:
    mode: pooled
    poolKey: "drafter:{projectRoot}"
    ${drafterRotate !== null ? `rotateEvery: ${drafterRotate}` : ""}
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  reviewer:
    mode: ${reviewerPooled ? "pooled" : "fresh"}
    ${reviewerPooled ? `poolKey: "reviewer:{groupId}"
    idleTtlMinutes: ${reviewerIdleTtl}
    rotateEvery: ${reviewerRotate}` : ""}
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  auditor:
    mode: ${auditorPooled ? "pooled" : "fresh"}
    ${auditorPooled ? 'poolKey: "auditor:{projectRoot}"' : ""}
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: high }
    requireDistinctModel: true
    downgrade: single-model
  executor:
    mode: pooled
    poolKey: "executor:{projectRoot}"
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
dispatch:
  plan-review: reviewer
  closure-audit: auditor
  deep-audit: auditor
  mechanical-verification: executor
  execute: executor
  draft-plans: drafter
`,
    "utf8",
  );
  writeFileSync(
    join(root, "missions", "demo.json"),
    JSON.stringify({
      name: "demo",
      roadmapPath: "docs/backlog/demo-roadmap.md",
      plansDir: "docs/plans/demo",
      commands: { test: "echo ok" },
      autonomyPolicy: "missions/autonomy.policy.yml",
    }),
    "utf8",
  );
}

function writeRoadmap(root) {
  const file = join(root, "docs", "backlog", "demo-roadmap.md");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `---
audit-rounds: 1
---

# Demo Roadmap

### M1 — Demo milestone

- [x] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
`,
    "utf8",
  );
  return file;
}

function writePlan(root, rel, { status = "draft", group = null, drr = "" } = {}) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  const fm = [
    "---",
    `status: ${status}`,
    "mission: demo",
    "work-item: M1-WI1",
    group !== null ? `group: ${group}` : null,
    "---",
  ].filter((l) => l !== null).join("\n");
  writeFileSync(
    p,
    `${fm}
# Plan

## Phase 1 — Work

- [ ] only item

## Draft Review Record
${drr}
## Verification

## Closure
`,
    "utf8",
  );
  return p;
}

/** Agents double with liveness control + fixed-id host-reuse mode. */
function poolAgents({ live = [], fixedId = null } = {}) {
  const liveSet = new Set(live);
  const state = { creates: [], followups: [], gets: [] };
  const textOf = (m) => (m?.content || []).filter((b) => b && b.type === "text").map((b) => b.text).join("\n");
  const service = {
    get(id) {
      state.gets.push(id);
      if (!liveSet.has(id)) return undefined;
      return { followup: (m) => state.followups.push({ sessionId: id, text: textOf(m) }) };
    },
    async create(options) {
      state.creates.push(options);
      const id = fixedId !== null ? fixedId : options?.sessionId || `mdsup-${state.creates.length}`;
      liveSet.add(id);
      return { agent: { id, followup: (m) => state.followups.push({ sessionId: id, text: textOf(m) }) } };
    },
  };
  return { service, state, liveSet };
}

/** Injectable timers capturing pool idle-TTL timeouts for manual firing. */
function fakeTimers() {
  const timeouts = [];
  return {
    timers: {
      setInterval: () => () => {},
      setTimeout(fn, ms) {
        const t = { fn, ms, canceled: false };
        timeouts.push(t);
        return () => {
          t.canceled = true;
        };
      },
    },
    timeouts,
    fireLatest() {
      const liveOnes = timeouts.filter((t) => !t.canceled);
      const last = liveOnes[liveOnes.length - 1];
      assert.ok(last !== undefined, "an armed idle-TTL timer must exist");
      last.fn();
    },
  };
}

function makeWatchdog(root, agentsService, timers) {
  return createWatchdog({
    projectRoot: root,
    timers: timers.timers,
    clock: () => NOW_MS,
    logger: {},
    continuous: true,
    ...(agentsService !== null ? { dispatchAgents: agentsService } : {}),
  });
}

const receiptsOf = (root) => readReceipts({ appendLine: () => {}, readTextFile: (p) => readFileSync(p, "utf8") }, root);

const REVIEWER_DEF = { mode: "pooled", poolKey: "reviewer:{groupId}", idleTtlMinutes: 30, rotateEvery: 8 };
const DRAFTER_DEF = { mode: "pooled", poolKey: "drafter:{projectRoot}" };
const REVIEWER_BINDING = { agentName: "reviewer", mode: "pooled", provider: "zhipuai", model: "glm-5.2" };
const DRAFTER_BINDING = { agentName: "drafter", mode: "pooled", provider: "zhipuai", model: "glm-5.2" };
const AUDITOR_BINDING = { agentName: "auditor", mode: "pooled", provider: "zhipuai", model: "glm-5.2" };
const POOLED_AUDITOR_DEF = { mode: "pooled", poolKey: "auditor:{projectRoot}" };

// ── 1. drafter pool lifecycle ────────────────────────────────────────────────

test("drafter pool lifecycle: create-on-first-use, followup reuse, one attemptId per dispatch (04 §2.1/§2.3)", async () => {
  const fake = poolAgents();
  const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
  const first = await pool.acquire({
    agents: fake.service,
    dispatchType: "draft-plans",
    binding: DRAFTER_BINDING,
    def: DRAFTER_DEF,
    projectRoot: "/proj",
    label: "test drafter",
  });
  assert.equal(first.status, "acquired");
  assert.equal(first.reused, false, "first acquisition creates the member");
  const second = await pool.acquire({
    agents: fake.service,
    dispatchType: "draft-plans",
    binding: DRAFTER_BINDING,
    def: DRAFTER_DEF,
    projectRoot: "/proj",
    label: "test drafter",
  });
  assert.equal(second.status, "acquired");
  assert.equal(second.reused, true, "second acquisition reuses the SAME continuable session");
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(fake.state.creates.length, 1, "exactly one agents.create — the pool is the reuse face");
  assert.notEqual(second.attemptId, first.attemptId, "every dispatch carries its own attemptId generation token");
  assert.equal(pool.attemptStale(first.sessionId), false, "current member = same generation (resume legal)");
  assert.deepEqual(pool.stats(), { pools: 1, members: 1, revoked: 0, taggedSessions: 1 }, "one pool, one live member");
  // the reused member's followup is the SAME session's followup channel
  second.followup("ping");
  assert.deepEqual(fake.state.followups.map((f) => f.sessionId), [first.sessionId], "followup rides the member session");
});

// ── 2. reviewer group scope ──────────────────────────────────────────────────

test("reviewer group scope: same group reuses one reviewer, cross-group starts fresh (04 §2.2); groupScopeOf three legs", async () => {
  const fake = poolAgents();
  const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
  const acquireReview = (groupId) =>
    pool.acquire({
      agents: fake.service,
      dispatchType: "plan-review",
      binding: REVIEWER_BINDING,
      def: REVIEWER_DEF,
      projectRoot: "/proj",
      groupId,
      label: "test reviewer",
    });
  const g1a = await acquireReview("batch-1");
  const g1b = await acquireReview("batch-1");
  const g2 = await acquireReview("batch-2");
  assert.equal(g1b.sessionId, g1a.sessionId, "same group → the same reviewer session (sequential review reuse)");
  assert.notEqual(g2.sessionId, g1a.sessionId, "cross-group → a NEW session (maximal reuse granularity, no cross-batch pollution)");
  assert.equal(fake.state.creates.length, 2);
  assert.equal(pool.stats().pools, 2, "two distinct resolved poolKeys");
  // groupScopeOf: frontmatter group → timestamp prefix fallback → bare stem
  assert.equal(groupScopeOf("/x/2026-08-27-0433-2-m4-wi32-agent-pool.md", "---\ngroup: batch-7\n---\n# p\n"), "batch-7");
  assert.equal(groupScopeOf("/x/2026-08-27-0433-2-m4-wi32-agent-pool.md", null), "2026-08-27-0433", "filename timestamp prefix fallback (01 §2)");
  assert.equal(groupScopeOf("/x/odd-plan.md", "---\nstatus: draft\n---\n"), "odd-plan", "bare stem last resort — still pools, alone");
  // poolKey placeholder resolution face
  const resolved = resolvePoolConfig({ def: REVIEWER_DEF, projectRoot: "/proj", groupId: "batch-1" });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.config.poolKey, "reviewer:batch-1");
  const noGroup = resolvePoolConfig({ def: REVIEWER_DEF, projectRoot: "/proj", groupId: null });
  assert.equal(noGroup.ok, false, "{groupId} template without a group scope refuses config resolution");
});

// ── 3. idle TTL dispose ──────────────────────────────────────────────────────

test("idle TTL dispose: timer fire revokes the member; the next acquire creates a fresh one (04 §2.1)", async () => {
  const fake = poolAgents();
  const tm = fakeTimers();
  const pool = createAgentPool({ timers: tm.timers, clock: () => NOW_MS });
  const first = await pool.acquire({
    agents: fake.service,
    dispatchType: "plan-review",
    binding: REVIEWER_BINDING,
    def: { ...REVIEWER_DEF, idleTtlMinutes: 1 },
    projectRoot: "/proj",
    groupId: "g",
    label: "t",
  });
  assert.equal(tm.timeouts[0].ms, 60_000, "idle TTL timer armed at idleTtlMinutes → ms");
  tm.fireLatest();
  assert.equal(pool.stats().members, 0, "member disposed on idle TTL expiry");
  assert.equal(pool.attemptStale(first.sessionId), true, "TTL-disposed member = stale attempt (cross-generation)");
  const second = await pool.acquire({
    agents: fake.service,
    dispatchType: "plan-review",
    binding: REVIEWER_BINDING,
    def: { ...REVIEWER_DEF, idleTtlMinutes: 1 },
    projectRoot: "/proj",
    groupId: "g",
    label: "t",
  });
  assert.equal(second.reused, false, "post-TTL acquisition creates a fresh member");
  assert.notEqual(second.sessionId, first.sessionId);
  pool.dispose();
  pool.dispose();
  assert.equal(pool.stats().members, 0, "dispose idempotent — double teardown stays clean");
});

// ── 4. rotateEvery + generation tokens ───────────────────────────────────────

test("rotateEvery rotation + generation judgment: threshold forces a new member; old attempt stale, new current (04 §2.2/§2.3)", async () => {
  const fake = poolAgents();
  const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
  const def = { ...REVIEWER_DEF, rotateEvery: 2 };
  const acquire = () =>
    pool.acquire({ agents: fake.service, dispatchType: "plan-review", binding: REVIEWER_BINDING, def, projectRoot: "/proj", groupId: "g", label: "t" });
  const a = await acquire();
  const b = await acquire();
  assert.equal(b.sessionId, a.sessionId, "below the rotation threshold the member is reused");
  const c = await acquire();
  assert.notEqual(c.sessionId, a.sessionId, "reaching rotateEvery forces a NEW member (anti-anchoring)");
  assert.equal(pool.attemptStale(a.sessionId), true, "the rotated-out member's attempts are stale — cross-generation redispatch territory");
  assert.equal(pool.attemptStale(c.sessionId), false, "the current member holds the live generation");
  assert.match(a.attemptId, new RegExp(`^poolatt-${a.sessionId}-1\\.1-`), "attemptId carries session + generation + per-dispatch counter");
  assert.match(c.attemptId, new RegExp(`^poolatt-${c.sessionId}-2\\.1-`), "the replacement member opens generation 2");
  // crash face: a dead member (agents get reports nothing) is NOT reused
  fake.liveSet.delete(c.sessionId);
  const d = await acquire();
  assert.notEqual(d.sessionId, c.sessionId, "crash-detected member replaced via the persistent-session liveness face");
});

// ── 5. P7 audit ban — pool layer ─────────────────────────────────────────────

test("P7 audit ban (pool layer): closure-audit / deep-audit acquire structurally bypassed REGARDLESS of agent mode config (04 §2.4)", async () => {
  const fake = poolAgents();
  const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
  for (const dispatchType of ["closure-audit", "deep-audit"]) {
    const out = await pool.acquire({
      agents: fake.service,
      dispatchType,
      binding: AUDITOR_BINDING, // mode: pooled declared — the ban must win anyway
      def: POOLED_AUDITOR_DEF,
      projectRoot: "/proj",
      groupId: "g",
      label: "t",
    });
    assert.equal(out.status, "bypassed", dispatchType);
    assert.match(out.reason, /P7 audit ban/, `${dispatchType}: the pool layer hard-refuses with the honest note`);
    assert.match(out.reason, /multi-audit/, "multi-audit covered as the deep-audit prompt-file face");
  }
  assert.equal(fake.state.creates.length, 0, "no session ever created through the pool for audit dispatches");
});

// ── 6. P7 audit ban — dispatch chain ─────────────────────────────────────────

test("P7 audit ban (dispatch chain): a pooled-DECLARED auditor still dispatches fresh sessions; the pool stays empty (reverse pin)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root, { auditorPooled: true });
    const fake = poolAgents();
    const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
    const policy = {
      agents: {
        auditor: { mode: "pooled", poolKey: "auditor:{projectRoot}", model: { provider: "zhipuai", model: "glm-5.2" } },
      },
    };
    const first = await createDispatchAgent(fake.service, { ...AUDITOR_BINDING, modelDef: {} }, {
      projectRoot: root,
      label: "audit",
      pool,
      dispatchType: "closure-audit",
      policy,
    });
    const second = await createDispatchAgent(fake.service, { ...AUDITOR_BINDING, modelDef: {} }, {
      projectRoot: root,
      label: "audit",
      pool,
      dispatchType: "deep-audit",
      policy,
    });
    assert.equal(first.status, "created");
    assert.equal(second.status, "created");
    assert.notEqual(first.sessionId, second.sessionId, "independent audits = fresh dispatch every time");
    assert.match(first.poolNote, /P7 audit ban/, "the honest bypass note rides the dispatch outcome");
    assert.deepEqual(pool.stats(), { pools: 0, members: 0, revoked: 0, taggedSessions: 2 }, "no pool ever materialized for audits (any policy config)");
    assert.deepEqual(pool.rolesOf(first.sessionId), ["auditor"], "the fresh audit session still gets its auditor role tag");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 7. executor dormant ruling ───────────────────────────────────────────────

test("executor dormant ruling: execute bypasses the pool with the explicit note; the executor role tag still registers", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    const fake = poolAgents();
    const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
    const policy = {
      agents: {
        executor: { mode: "pooled", poolKey: "executor:{projectRoot}", model: { provider: "zhipuai", model: "glm-5.2" } },
      },
    };
    const out = await createDispatchAgent(fake.service, { agentName: "executor", mode: "pooled", provider: "zhipuai", model: "glm-5.2", modelDef: {} }, {
      projectRoot: root,
      label: "execute",
      pool,
      dispatchType: "execute",
      policy,
    });
    assert.equal(out.status, "created");
    assert.match(out.poolNote, /declared but dormant/, "the dormant-ruling note is explicit, never silent");
    assert.match(out.poolNote, /M4-WI33\/M5-WI37/, "the successor consumption path is named");
    assert.equal(pool.stats().members, 0, "execute never pools (engine-run territory ruling)");
    assert.deepEqual(pool.executorSessions(), [out.sessionId], "the executor tag registers — the red-line registry leg");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 8. role mutex: drafter ∩ reviewer/auditor = ∅ ────────────────────────────

test("role mutex (final-review P2-5): one continuable subagent is never both drafter and reviewer/auditor — registry + dispatch-chain refusals", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
    assert.equal(pool.registerRole("ses-dual", "drafter").ok, true);
    const conflict = pool.registerRole("ses-dual", "reviewer");
    assert.equal(conflict.ok, false, "reviewer registration on a drafter session is refused");
    assert.match(conflict.reason, /never both drafter and reviewer\/auditor/);
    assert.equal(pool.registerRole("ses-dual", "auditor").ok, false, "auditor registration equally refused");
    assert.deepEqual(pool.rolesOf("ses-dual"), ["drafter"], "the original tag stands — conflicts never merge");
    // dispatch-chain face: the host hands out an already-tagged session id
    const policy = {
      agents: {
        drafter: { mode: "pooled", poolKey: "drafter:{projectRoot}", model: { provider: "zhipuai", model: "glm-5.2" } },
        reviewer: { mode: "fresh", model: { provider: "zhipuai", model: "glm-5.2" } },
      },
    };
    const reusedHost = poolAgents({ fixedId: "ses-dual" });
    const out = await createDispatchAgent(reusedHost.service, { agentName: "reviewer", mode: "fresh", provider: "zhipuai", model: "glm-5.2", modelDef: {} }, {
      projectRoot: root,
      label: "review",
      pool,
      dispatchType: "plan-review",
      groupId: "g",
      policy,
    });
    assert.equal(out.status, "refused", "the conflicting dispatch is refused, never silently adopted");
    assert.match(out.reason, /role mutex violation/);
    assert.deepEqual(pool.rolesOf("ses-dual"), ["drafter"], "the refused dispatch left the registry untouched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 9. auditor ≠ executor ────────────────────────────────────────────────────

test("auditor ≠ executor (final-review P2-5): candidate check at audit dispatch + executorSessionsOf derivation (frontmatter ∪ pool tags)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    const pool = createAgentPool({ timers: fakeTimers().timers, clock: () => NOW_MS });
    pool.registerRole("ses-exec-1", "executor");
    const executorHost = poolAgents({ fixedId: "ses-exec-1" });
    const policy = { agents: { auditor: { mode: "fresh", model: { provider: "zhipuai", model: "glm-5.2" } } } };
    const refused = await createDispatchAgent(executorHost.service, { agentName: "auditor", mode: "fresh", provider: "zhipuai", model: "glm-5.2", modelDef: {} }, {
      projectRoot: root,
      label: "audit",
      pool,
      dispatchType: "closure-audit",
      executorSessions: [],
      policy,
    });
    assert.equal(refused.status, "refused", "an audit candidate that IS a run executor is refused");
    assert.match(refused.reason, /same-run auditor ≠ any executor/);
    // derivation: plan claim holders (runId-anchored strip) ∪ pool executor tags
    const derived = executorSessionsOf(
      [
        { path: "/p/a.md", text: "---\nstatus: active\nclaim: attempt-mdsupervisor-ses-claim-9-ab12cd34\n---\n# a\n" },
        { path: "/p/b.md", text: "---\nstatus: active\nclaim: attempt-other-run-ses-foreign-1-ffff1111\n---\n# b\n" },
      ],
      { runId: "mdsupervisor", pool },
    );
    assert.deepEqual(derived.sort(), ["ses-claim-9", "ses-exec-1"], "frontmatter-derived holder + pool executor tag; foreign-format claim skipped");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 10. recovery interop — same generation → resume ──────────────────────────

test("recovery interop, same generation: live current pooled member → RESUME (followup injection, no new line, no new session) (04 §2.3)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/rev.md", {});
    const tm = fakeTimers();
    const fake = poolAgents();
    const wd = makeWatchdog(root, fake.service, tm);
    await wd.runCycle("manual");
    assert.equal(fake.state.creates.length, 1, "plan-review dispatched through the reviewer pool (member created)");
    const member = fake.state.creates[0].sessionId ?? `mdsup-1`;
    const afterDispatch = readFileSync(join(root, "docs/plans/demo/rev.md"), "utf8");
    await wd.runCycle("recovery");
    assert.equal(fake.state.creates.length, 1, "same-generation resume creates NO new session");
    const text = readFileSync(join(root, "docs/plans/demo/rev.md"), "utf8");
    assert.equal(text, afterDispatch, "ledger byte-unchanged — resume injects followup only");
    assert.ok(fake.state.followups.some((f) => f.sessionId === member && /recovery resume plan-review/.test(f.text)), "the original member got the resume nudge");
    assert.ok(receiptsOf(root).some((r) => r.event === "recovery-resume"), "resume receipt recorded");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 11. recovery interop — cross generation → redispatch ─────────────────────

test("recovery interop, cross generation: TTL-disposed-but-live member → REDISPATCH + member removal; dead member re-created through the pool (04 §2.3)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root, { reviewerIdleTtl: 1 });
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/rev.md", {});
    const tm = fakeTimers();
    const fake = poolAgents();
    const wd = makeWatchdog(root, fake.service, tm);
    await wd.runCycle("manual");
    const firstLine = readFileSync(join(root, "docs/plans/demo/rev.md"), "utf8").match(/- dispatch review (\S+) to (\S+)\n/);
    assert.ok(firstLine !== null, "pooled dispatch line landed");
    const [, oldId, oldSession] = firstLine;
    tm.fireLatest(); // idle TTL (1min) elapsed → member revoked, session STILL live in the host
    await wd.runCycle("recovery");
    const text = readFileSync(join(root, "docs/plans/demo/rev.md"), "utf8");
    assert.match(text, new RegExp(`- dispatch review ${oldId} to ${oldSession}\\n`), "old line preserved append-only");
    assert.match(text, /- dispatch review #review-mdsupervisor-rev-1-[0-9a-f]{8} to mdsup-/, "cross-generation → NEW dispatch line (never resumed the stale attempt)");
    assert.equal(fake.state.creates.length, 2, "the redispatch created a fresh pooled member");
    assert.ok(!fake.state.followups.some((f) => f.sessionId === oldSession && /recovery resume/.test(f.text)), "the stale live session is never nudged");
    assert.ok(receiptsOf(root).some((r) => r.event === "recovery-redispatch"), "redispatch receipt recorded");
    wd.stop();

    // dead-member variant: host reports the member unrecoverable → replaced
    const root2 = tmpProject();
    try {
      writePolicy(root2);
      writeRoadmap(root2);
      writePlan(root2, "docs/plans/demo/rev.md", {});
      const tm2 = fakeTimers();
      const fake2 = poolAgents();
      const wd2 = makeWatchdog(root2, fake2.service, tm2);
      await wd2.runCycle("manual");
      const member2 = fake2.state.creates[0].sessionId ?? `mdsup-1`;
      fake2.liveSet.delete(member2); // the persistent session died
      await wd2.runCycle("recovery");
      assert.equal(fake2.state.creates.length, 2, "crash-detected member replaced through the pool (persistent-session recovery face)");
      assert.ok(fake2.state.followups.some((f) => /supervisor dispatch plan-review/.test(f.text) && f.sessionId !== member2), "the replacement got the dispatch prompt");
      wd2.stop();
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 12. same-cycle double dispatch + review lease compatibility ─────────────

test("pool reuse × review lease: one cycle dispatches two same-group reviews to the SAME session; writer-identity latest-line lease holds per plan", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/2026-08-27-0433-1-alpha.md", { group: "G1" });
    writePlan(root, "docs/plans/demo/2026-08-27-0433-2-beta.md", { group: "G1" });
    const tm = fakeTimers();
    const fake = poolAgents();
    const wd = makeWatchdog(root, fake.service, tm);
    await wd.runCycle("manual");
    assert.equal(fake.state.creates.length, 1, "BOTH same-group reviews rode ONE pooled reviewer session");
    const reviewer = fake.state.creates[0].sessionId ?? `mdsup-1`;
    const alpha = readFileSync(join(root, "docs/plans/demo/2026-08-27-0433-1-alpha.md"), "utf8");
    const beta = readFileSync(join(root, "docs/plans/demo/2026-08-27-0433-2-beta.md"), "utf8");
    assert.match(alpha, new RegExp(`- dispatch review #review-mdsupervisor-2026-08-27-0433-1-alpha-1-[0-9a-f]{8} to ${reviewer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "alpha's DRR line carries the pooled session");
    assert.match(beta, new RegExp(`- dispatch review #review-mdsupervisor-2026-08-27-0433-2-beta-1-[0-9a-f]{8} to ${reviewer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), "beta's DRR line carries the SAME pooled session");
    // the lease face: per-plan latest line holds the lease — same sessionId
    // dispatch lines are fully compatible with writer-identity (02 §4.2)
    const gate = (planPath, current, proposed, actor) =>
      evaluateGates(
        { type: "write", path: planPath, proposedContent: proposed, ...(actor ? { actor } : {}) },
        {
          policy: { gates: [{ id: "wi", match: "{{plansDir}}/**/*.md", rule: "writer-identity", mode: "enforce" }] },
          currentFileState: { text: current },
          ctx: { plansDir: dirname(planPath) },
        },
      );
    const edit = (base) => base.replace("- [ ] only item", "- [ ] only item\n- [ ] second item");
    assert.equal(gate(join(root, "docs/plans/demo/2026-08-27-0433-2-beta.md"), beta, edit(beta), { id: "ses-drafter" }).decision, "deny", "third party denied on beta while its pooled review is in flight");
    assert.equal(gate(join(root, "docs/plans/demo/2026-08-27-0433-2-beta.md"), beta, edit(beta), { id: reviewer }).decision, "allow", "the pooled reviewer — latest-line holder on beta — writes freely");
    assert.equal(gate(join(root, "docs/plans/demo/2026-08-27-0433-1-alpha.md"), alpha, edit(alpha), { id: reviewer }).decision, "allow", "the same session simultaneously holds alpha's lease — per-plan leases coexist");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 13. headless degradation preserved ───────────────────────────────────────

test("headless degradation preserved: no agents face ⇒ registration-only dispatch, the pool stays empty (03 §6 posture)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/rev.md", {});
    const tm = fakeTimers();
    const wd = makeWatchdog(root, null, tm); // headless — no dispatchAgents
    const out = await wd.runCycle("manual");
    assert.ok(out !== null, "cycle ran");
    const text = readFileSync(join(root, "docs/plans/demo/rev.md"), "utf8");
    assert.match(text, /- dispatch review #review-mdsupervisor-rev-1-[0-9a-f]{8} to ses-pending/, "registration-only dispatch line (1411-1 posture)");
    assert.ok(receiptsOf(root).some((r) => /agents face absent/.test(r.detail ?? "")), "explicit degraded receipt");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
