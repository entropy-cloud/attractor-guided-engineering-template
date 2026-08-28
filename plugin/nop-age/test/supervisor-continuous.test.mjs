/**
 * supervisor-continuous.test.mjs — continuous-mode opt-in + queue semantics
 * (age-autonomy M3-WI28, plan
 * `docs/plans/age-autonomy/2026-08-26-1954-1` Phase 1/2 Proof; runs inside
 * the L2 plugin suite `test/*.test.mjs` → `./verify-age.sh`).
 *
 * Coverage matrix (03-supervisor §4, ≥8 Phase-1 cases + ≥4 Phase-2 cases):
 *   - opt-in three states: off → observation receipts (zero unattended
 *     behavior) / on → execute posture (ledger dispatch chain lands) /
 *     toggle takes effect immediately (next cycle)
 *   - default off (flag absent unless pre-enabled via bundle config)
 *   - mdcontrol.continuous route: unmounted toggle = bad-request; query
 *     answers the honest idle state; root mismatch = bad-request
 *   - queue chain edge (03 §3 edge 2): a terminal event under continuous ON
 *     chains ONE immediate re-evaluation cycle (single-flight reuse); OFF
 *     chains nothing (heartbeat stays the backstop)
 *   - Queue ≠ approval: draft/held plans never produce an execute dispatch
 *     (trigger predicate domain: plan.status=active / full-tick only)
 *   - mission terminal word keeps stop-dispatch priority over the chain
 *     (continuous ON + chained cycle after terminal → still no dispatch)
 *   - restart clears the in-memory flag + re-derives the same terminal word
 *     (idempotent re-evaluation, zero new store)
 *   - meter/receipt decisions are NOT gated (claim reclaim executes while
 *     continuous is off — bookkeeping, not unattended AI dispatch)
 *   - Phase 2: mdcontrol.unlock route — unlock/dispose positive shapes,
 *     parameter-domain denials, non-held denial, law-deny passthrough;
 *     terminal receipt delivery to the continuous-enabling session (A8)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";
import { scanSupervisorSnapshot, triggerDuty } from "../src/supervisor/decision-core.ts";
import { createWatchdog } from "../src/supervisor/watchdog.ts";
import { createMdControlRoutes, MdControlError } from "../src/mdcontrol-routes.ts";

const NOW_MS = Date.parse("2026-08-26T12:00:00.000Z");
const FUTURE_ISO = "2026-08-26T13:00:00.000Z";
const PAST_ISO = "2026-08-26T11:00:00.000Z";
const CLAIM_TOKEN = "attempt-run-1-ses-holder-1-ab12cd34";

// ── fixtures (policy WITH triggers — the 1411-2 execute posture baseline) ──

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "supervisor-continuous-"));
}

function writePolicy(root) {
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(
    join(root, "missions", "autonomy.policy.yml"),
    `version: 1
limits:
  maxAuditRounds: 3
  maxFailures: 3
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: enforce
  - id: writer-identity
    match: "{{plansDir}}/**/*.md"
    rule: writer-identity
    mode: enforce
  - id: plan-completed
    match: "{{plansDir}}/**/*.md"
    rule: plan-completed
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
  - when: "terminal-claim=nothing-to-draft and draftPlans()==0 and activePlans()==0"
    dispatch: deep-audit
  - when: "deep-audit.accepted-findings=items"
    dispatch: draft-plans
  - when: "deep-audit.accepted-findings=none and draftPlans()==0 and activePlans()==0 and roadmap.unchecked"
    terminal: partial/blocked
agents:
  drafter:
    mode: pooled
    poolKey: "drafter:{projectRoot}"
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  reviewer:
    mode: fresh
    model: { provider: zhipuai, model: glm-5.2, reasoningEffort: default }
  auditor:
    mode: fresh
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
      commands: { test: "true" },
      autonomyPolicy: "missions/autonomy.policy.yml",
    }),
    "utf8",
  );
}

function writeRoadmap(root, { auditRounds = 1, wi1Checked = true } = {}) {
  const file = join(root, "docs", "backlog", "demo-roadmap.md");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `---
audit-rounds: ${auditRounds}
---

# Demo Roadmap

### M1 — Demo milestone

- [${wi1Checked ? "x" : " "}] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
`,
    "utf8",
  );
  return file;
}

function planText({ status = "active", checked = false, claim = null, expires = null, failures = null, extra = "" } = {}) {
  const fm = [
    "---",
    `status: ${status}`,
    "mission: demo",
    "work-item: M1-WI1",
    failures !== null ? `failures: ${failures}` : null,
    status === "held" ? 'hold: "waiting"' : null,
    claim !== null ? `claim: ${claim}` : null,
    expires !== null ? `claim-expires: ${expires}` : null,
    "---",
  ]
    .filter((l) => l !== null)
    .join("\n");
  return `${fm}
# Plan

## Phase 1 — Work

- [${checked ? "x" : " "}] only item${extra}

## Draft Review Record

## Verification

## Closure
`;
}

function writePlan(root, rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content, "utf8");
  return p;
}

const idleTimers = { setInterval: () => () => {}, setTimeout: () => () => {} };

function makeWatchdog(root, extra = {}) {
  return createWatchdog({ projectRoot: root, timers: idleTimers, clock: () => NOW_MS, logger: {}, ...extra });
}

const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

const receiptsOf = (wd, kind, event) => wd.statusFace().receipts.filter((r) => r.kind === kind && (event === undefined || r.event === event));

// ── Phase 1: opt-in three states ────────────────────────────────────────────

test("opt-in: OFF (default) — trigger hits land as observation receipts, zero dispatch writes on the ledger", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const draft = writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const wd = makeWatchdog(root);
    assert.equal(wd.isContinuous(), false, "default off");
    await wd.runCycle("manual");
    const text = readFileSync(draft, "utf8");
    assert.doesNotMatch(text, /dispatch review/, "no dispatch line while continuous off");
    const suppressed = wd.statusFace().receipts.filter((r) => r.kind === "observation" && r.event === "dispatch:plan-review");
    assert.ok(suppressed.length >= 1, "downgraded dispatch decision recorded as an observation receipt");
    assert.match(suppressed[0].detail ?? "", /continuous mode off/, "the receipt carries the opt-in gate note");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opt-in: ON — execute posture granted, the ledger dispatch chain lands (plan-review registration)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const draft = writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const wd = makeWatchdog(root, { continuous: true });
    assert.equal(wd.isContinuous(), true, "bundle-config pre-enable lands");
    await wd.runCycle("manual");
    const text = readFileSync(draft, "utf8");
    assert.match(text, /dispatch review #review-/, "dispatch line registered in Draft Review Record (registration-only without an agents face)");
    assert.ok(wd.statusFace().receipts.some((r) => r.event === "dispatch:plan-review"), "dispatch receipt recorded");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("opt-in: toggle takes effect immediately (next cycle) — off→on→off faces on one watchdog", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const d1 = writePlan(root, "docs/plans/demo/d1.md", planText({ status: "draft" }));
    const wd = makeWatchdog(root);
    await wd.runCycle("manual");
    assert.doesNotMatch(readFileSync(d1, "utf8"), /dispatch review/, "off: no dispatch");

    wd.setContinuous(true);
    await wd.runCycle("manual");
    assert.match(readFileSync(d1, "utf8"), /dispatch review #review-/, "on: dispatched on the very next cycle");

    const d2 = writePlan(root, "docs/plans/demo/d2.md", planText({ status: "draft" }));
    wd.setContinuous(false);
    await wd.runCycle("manual");
    assert.match(readFileSync(d1, "utf8"), /dispatch review/, "first plan keeps its registration (append-only)");
    assert.doesNotMatch(readFileSync(d2, "utf8"), /dispatch review/, "off again: the new draft is not dispatched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 1: mdcontrol.continuous route faces ───────────────────────────────

test("route: unmounted toggle = bad-request; unmounted query = honest idle state; mounted faces toggle + root mismatch deny", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    const unmounted = createMdControlRoutes({ ctx: {} });
    await assert.rejects(
      unmounted["mdcontrol.continuous"]({ projectRoot: root, enabled: true }),
      (err) => err instanceof MdControlError && err.code === "bad-request" && /no watchdog mounted/.test(err.message),
    );
    const idle = await unmounted["mdcontrol.continuous"]({ projectRoot: root });
    assert.deepEqual(idle, { projectRoot: root, enabled: false, posture: "observe", mounted: false });

    let flag = false;
    const mounted = createMdControlRoutes({
      ctx: {},
      supervisorContinuous: {
        projectRoot: root,
        enabled: () => flag,
        set: (v) => { flag = v; },
        setReceiptTarget: () => {},
      },
    });
    const on = await mounted["mdcontrol.continuous"]({ projectRoot: root, enabled: true });
    assert.deepEqual(on, { projectRoot: root, enabled: true, posture: "execute", mounted: true });
    assert.equal(flag, true, "hook set ran");
    const query = await mounted["mdcontrol.continuous"]({ projectRoot: root });
    assert.deepEqual(query, { projectRoot: root, enabled: true, posture: "execute", mounted: true });
    await assert.rejects(
      mounted["mdcontrol.continuous"]({ projectRoot: root, enabled: false, followup: { sessionId: "" } }),
      (err) => err instanceof MdControlError && err.code === "bad-request",
      "invalid followup shape = bad-request",
    );
    const other = join(dirname(root), "other-root");
    await assert.rejects(
      mounted["mdcontrol.continuous"]({ projectRoot: other, enabled: true }),
      (err) => err instanceof MdControlError && err.code === "bad-request" && /per supervised root/.test(err.message),
    );
    await assert.rejects(
      mounted["mdcontrol.continuous"]({ projectRoot: other }),
      (err) => err instanceof MdControlError && err.code === "bad-request" && /supervises exactly that root/.test(err.message),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 1: queue chain edge (03 §3 edge 2) ────────────────────────────────

test("chain: a terminal event under continuous ON re-evaluates immediately; OFF chains nothing", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const wd = makeWatchdog(root);
    await wd.runCycle("manual");
    assert.equal(wd.statusFace().scans, 1);

    wd.emitTerminal({ runId: "run-1", kind: "run-terminal", status: "completed", plan: null });
    await flush();
    assert.equal(wd.statusFace().scans, 1, "continuous off: terminal event chains no re-evaluation (heartbeat backstop only)");

    wd.setContinuous(true);
    wd.emitTerminal({ runId: "run-1", kind: "run-terminal", status: "completed", plan: null });
    await flush();
    assert.equal(wd.statusFace().scans, 2, "continuous on: ONE chained re-evaluation cycle ran");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("chain: the chained cycle advances the queue (terminal event → re-evaluation → review dispatch registered)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const draft = writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const wd = makeWatchdog(root, { continuous: true });
    // NO manual cycle: the queue advances ONLY through the chained
    // re-evaluation after a terminal event (03 §3 edge 2 — an engine run
    // terminal is the production producer of this event face).
    assert.equal(wd.statusFace().scans, 0);
    wd.emitTerminal({ runId: "run-7", kind: "run-terminal", status: "completed", plan: null });
    await flush();
    assert.equal(wd.statusFace().scans, 1, "the chained cycle ran");
    assert.match(readFileSync(draft, "utf8"), /dispatch review #review-/, "the chained cycle dispatched the queued draft's review");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 1: Queue ≠ approval (03 §4) ────────────────────────────────────────

test("queue ≠ approval: draft/held plans never produce an execute dispatch (predicate domain guarantee)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const draft = writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const held = writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 2 }));
    // evaluate the trigger face over the PRE-cycle snapshot (the cycle below
    // registers the review dispatch, which flips review-dispatch-missing)
    const lawCtx = discoverLawContext(join(root, "missions"), fsLawGateIo);
    const snapshot = scanSupervisorSnapshot({ projectRoot: root, lawCtx, io: fsLawGateIo, clock: () => NOW_MS });
    const hits = triggerDuty(snapshot, { maxAuditRounds: 3, triggers: lawCtx.policy.triggers }, () => NOW_MS);
    // guard assertions: no hit ever lands as an execution pickup on a
    // draft/held queue entry — the only execute-class exit (reclaim-claim)
    // is plan.status=active-scoped; full-tick is active-scoped by definition
    assert.ok(hits.length >= 1, "the draft plan's review dispatch hit (Queue faces are reviewable, not executable)");
    for (const h of hits) {
      assert.notEqual(h.occurrence.type, "execution", "no execution occurrence may target the queue (03 §4 Queue ≠ approval)");
      if (h.target !== null) {
        assert.notEqual(h.target, held, "the held plan is never a dispatch target");
      }
    }
    const wd = makeWatchdog(root, { continuous: true });
    await wd.runCycle("manual");
    const heldText = readFileSync(held, "utf8");
    assert.doesNotMatch(heldText, /claim:/, "held plan untouched (no execution pickup)");
    assert.match(heldText, /status: held/, "held status preserved");
    assert.match(readFileSync(draft, "utf8"), /dispatch review/, "the draft DID get its review dispatch — review ≠ approval-face pickup");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 1: mission terminal word keeps stop-dispatch priority ─────────────

test("terminal priority: after the mission terminal word, continuous ON chains cycles but never dispatches again", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root, { auditRounds: 2 });
    writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 2 }));
    const wd = makeWatchdog(root, { continuous: true });
    await wd.runCycle("manual");
    const terminal = wd.statusFace().terminal;
    assert.notEqual(terminal, null, "R3 blocked reached (audit-rounds ≥1, no draft/active, held>0)");
    assert.equal(terminal.word, "blocked");

    // a draft landing AFTER the terminal word: the chained cycle re-scans,
    // would hit plan-review — stop-dispatch suppresses it.
    writePlan(root, "docs/plans/demo/late-draft.md", planText({ status: "draft" }));
    const before = wd.statusFace().scans;
    wd.emitTerminal({ runId: null, kind: "run-terminal", status: "blocked", plan: null });
    await flush();
    assert.ok(wd.statusFace().scans > before, "the chained cycle ran");
    assert.doesNotMatch(
      readFileSync(join(root, "docs/plans/demo/late-draft.md"), "utf8"),
      /dispatch review/,
      "stop-dispatch outranks the chain (03 §8)",
    );
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 1: restart clears the flag; idempotent terminal re-derivation ─────

test("restart: the in-memory flag clears (fresh mount = off) and the terminal word re-derives identically", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root, { auditRounds: 2 });
    writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 2 }));
    writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));

    const first = makeWatchdog(root, { continuous: true });
    await first.runCycle("manual");
    assert.match(readFileSync(join(root, "docs/plans/demo/draft.md"), "utf8"), /dispatch review/, "first mount dispatched while on");
    first.stop();

    // restart: fresh watchdog, same ledger — flag cleared, terminal state
    // (R3 over the same ledger: draft present keeps R3 off in mount 1; here
    // the draft STILL has its open review → R3 not hit either — assert the
    // flag + posture instead, terminal idempotence is pinned by WI27 tests)
    const second = makeWatchdog(root);
    assert.equal(second.isContinuous(), false, "restart cleared the continuous flag");
    writePlan(root, "docs/plans/demo/late-draft.md", planText({ status: "draft" }));
    await second.runCycle("manual");
    assert.doesNotMatch(
      readFileSync(join(root, "docs/plans/demo/late-draft.md"), "utf8"),
      /dispatch review/,
      "no dispatch for new work after restart while off (flag cleared, observe posture)",
    );
    assert.equal(second.statusFace().terminal, null, "no terminal word while a draft review is in flight (R3 requires draftPlans()==0)");
    second.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 1: meter/receipt decisions are not gated ──────────────────────────

test("gate scope: claim reclaim (meter-write) executes even while continuous is off; the dispatch face stays gated", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const stale = writePlan(root, "docs/plans/demo/stale.md", planText({ status: "active", claim: CLAIM_TOKEN, expires: PAST_ISO }));
    const wd = makeWatchdog(root);
    await wd.runCycle("manual");
    const staleText = readFileSync(stale, "utf8");
    assert.doesNotMatch(staleText, new RegExp(`claim: ${CLAIM_TOKEN}`), "expired claim reclaimed (meter face ungated)");
    assert.match(staleText, /failures: 1/, "claim-expired-no-output bucket counted through the writer");
    assert.doesNotMatch(readFileSync(join(root, "docs/plans/demo/draft.md"), "utf8"), /dispatch review/, "dispatch face gated in the SAME cycle");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 2: mdcontrol.unlock — held-plan human disposition (01 §5.1) ───────

test("unlock: held→active same-write shape — failures reset to 0, hold removed, no claim carried (T6)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const held = writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 2 }));
    const routes = createMdControlRoutes({ ctx: {} });
    const out = await routes["mdcontrol.unlock"]({ projectRoot: root, planPath: held, action: "unlock" });
    assert.deepEqual(out, { planPath: held, action: "unlock", result: "written" });
    const text = readFileSync(held, "utf8");
    assert.match(text, /status: active/, "held→active landed");
    assert.match(text, /failures: 0/, "failures reset in the SAME write (T6 shape)");
    assert.doesNotMatch(text, /hold:/, "hold reason removed in the SAME write");
    assert.doesNotMatch(text, /claim:/, "no claim carried (01 §4.1 — claims only while claimed-by-dispatch)");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dispose: all three terminal dispositions land (cancelled/superseded/deferred); hold removed each time", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plans = {
      cancelled: writePlan(root, "docs/plans/demo/h1.md", planText({ status: "held", failures: 1 })),
      superseded: writePlan(root, "docs/plans/demo/h2.md", planText({ status: "held", failures: 1 })),
      deferred: writePlan(root, "docs/plans/demo/h3.md", planText({ status: "held", failures: 1 })),
    };
    const routes = createMdControlRoutes({ ctx: {} });
    for (const disposition of ["cancelled", "superseded", "deferred"]) {
      const out = await routes["mdcontrol.unlock"]({ projectRoot: root, planPath: plans[disposition], action: "dispose", disposition });
      assert.deepEqual(out, { planPath: plans[disposition], action: "dispose", result: "written" }, `${disposition} written`);
      const text = readFileSync(plans[disposition], "utf8");
      assert.match(text, new RegExp(`status: ${disposition}`), `${disposition} status landed (01 §5.1 supervisor legal edge)`);
      assert.doesNotMatch(text, /hold:/, "hold removed (hold only legal while held)");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unlock parameter domain: bad action / missing or invalid disposition / unlock-with-disposition / outside plansDir / missing plan / non-held = bad-request", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const held = writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 1 }));
    const active = writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const routes = createMdControlRoutes({ ctx: {} });
    const bad = async (payload, re) => {
      await assert.rejects(
        routes["mdcontrol.unlock"](payload),
        (err) => err instanceof MdControlError && err.code === "bad-request" && re.test(err.message),
      );
    };
    await bad({ projectRoot: root, planPath: held, action: "explode" }, /"action" must be "unlock" or "dispose"/);
    await bad({ projectRoot: root, planPath: held }, /"action" must be/);
    await bad({ projectRoot: root, planPath: held, action: "dispose" }, /requires "disposition"/);
    await bad({ projectRoot: root, planPath: held, action: "dispose", disposition: "deleted" }, /cancelled\|superseded\|deferred/);
    await bad({ projectRoot: root, planPath: held, action: "unlock", disposition: "cancelled" }, /only valid with action "dispose"/);
    await bad({ projectRoot: root, planPath: join(root, "docs", "elsewhere.md"), action: "unlock" }, /not under the governed plansDir/);
    await bad({ projectRoot: root, planPath: join(root, "docs", "plans", "demo", "nope.md"), action: "unlock" }, /not found/);
    await bad({ projectRoot: root, planPath: active, action: "unlock" }, /not "held"/);
    // nothing landed anywhere on the deny paths
    assert.match(readFileSync(held, "utf8"), /status: held/, "held plan untouched");
    assert.match(readFileSync(active, "utf8"), /status: active/, "active plan untouched");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("unlock law-deny passthrough: full-tick held plan with closure pair but unsatisfied completion formula → denied, structured reason, file unchanged", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    // full-tick (all checked) + closure dispatch/accepted pair, NO
    // verification pass lines → plan-completed denies the basis-changing
    // write (the completion formula's mechanical-verification conjunct fails)
    const held = writePlan(
      root,
      "docs/plans/demo/tricky.md",
      `---
status: held
mission: demo
work-item: M1-WI1
hold: "waiting"
failures: 1
---

# Plan

## Phase 1 — Work

- [x] only item

## Draft Review Record

## Verification

## Closure

- dispatch audit #audit-run-1-tricky-1-aaaaaaaa to ses_auditor_1
- accepted #audit-run-1-tricky-1-aaaaaaaa：done
`,
    );
    const before = readFileSync(held, "utf8");
    const routes = createMdControlRoutes({ ctx: {} });
    const out = await routes["mdcontrol.unlock"]({ projectRoot: root, planPath: held, action: "unlock" });
    assert.equal(out.result, "denied", "law denial passed through, never swallowed");
    assert.match(out.reason ?? "", /plan-completed/, "the denying rule is named in the structured reason");
    assert.equal(readFileSync(held, "utf8"), before, "denied write left the file byte-identical");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── Phase 2: terminal receipt wiring — the continuous-enabling session ──────

test("terminal receipt: continuous enable with followup registers the session; the mission terminal line is delivered (A8 best-effort)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root, { auditRounds: 2 });
    writePlan(root, "docs/plans/demo/held.md", planText({ status: "held", failures: 2 }));
    const lines = [];
    const agentsFace = {
      get: (id) => (id === "ses-operator" ? { followup: (msg) => lines.push(msg) } : undefined),
    };
    const wd = makeWatchdog(root, { agents: agentsFace });
    const routes = createMdControlRoutes({
      ctx: {},
      supervisorContinuous: {
        projectRoot: root,
        enabled: () => wd.isContinuous(),
        set: (v) => wd.setContinuous(v),
        setReceiptTarget: (sessionId) => wd.setReceiptTarget(sessionId),
      },
    });
    const on = await routes["mdcontrol.continuous"]({ projectRoot: root, enabled: true, followup: { sessionId: "ses-operator" } });
    assert.equal(on.enabled, true);
    await wd.runCycle("manual");
    const terminal = wd.statusFace().terminal;
    assert.notEqual(terminal, null, "R3 blocked reached");
    assert.equal(terminal.word, "blocked");
    const delivered = lines.filter((m) => typeof m?.content?.[0]?.text === "string" && m.content[0].text.includes("run-terminal"));
    assert.equal(delivered.length, 1, "exactly one run-terminal line delivered to the enabling session");
    assert.match(delivered[0].content[0].text, /blocked/, "the line carries the terminal word");
    assert.ok(
      wd.statusFace().receipts.some((r) => r.kind === "terminal" && r.event === "run-terminal:blocked"),
      "durable terminal receipt alongside the delivery",
    );
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
