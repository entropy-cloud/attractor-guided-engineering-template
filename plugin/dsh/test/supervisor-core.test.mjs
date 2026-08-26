/**
 * supervisor-core.test.mjs — supervisor seam unit suite (age-autonomy
 * M3-WI25, plan `docs/plans/age-autonomy/2026-08-26-1411-1` Phase 2 Proof;
 * runs inside the L2 plugin suite `test/*.test.mjs` → `./verify-age.sh`).
 *
 * Sections:
 *   1. decision core — decide() judgment matrix (snapshot fixtures ×
 *      injected clock): no-op / expired-claim observation / awaitingClosure
 *      observation / dispatch-never-execute invariant + the snapshot scan
 *      (predicate family reused through the assets channel).
 *   2. machine-field writer — CAS + law self-check + atomic replace:
 *      claim issue/clear, failures, roadmap audit-rounds, law-deny leaves
 *      the file untouched (+ deny receipt), executor-role deny face through
 *      the EXISTING claim-validity rule (zero rule changes), moving-basis
 *      conflict, tmp-residue atomicity.
 *   3. receipt face — JSONL append/read roundtrip (pinned path), dead-session
 *      delivery tolerance (A8), mdcontrol.status passthrough (existing-route
 *      extension, zero new route).
 *   4. watchdog — heartbeat pacing, single-flight coalescing, event-edge
 *      debounce, recovery scan on start (restart seam), observe-only
 *      execution + onTerminal seam isolation.
 *   5. service — cordis publication + mount log + idle posture + idempotent
 *      dispose (real cordis Context, the law-gate test precedent).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { Context } from "@deepseek-ai/cordis";
import { discoverLawContext, fsLawGateIo } from "../src/law/host-adapter.ts";
import { validatePlanFrontmatter } from "../assets/src/ledger-frontmatter.mjs";
import { evaluateGates } from "../assets/src/law-core.mjs";
import { decide, scanSupervisorSnapshot } from "../src/supervisor/decision-core.ts";
import {
  clearPlanClaim,
  fsMeterWriterIo,
  writePlanClaim,
  writePlanFailures,
  writeRoadmapAuditRounds,
} from "../src/supervisor/writer.ts";
import {
  appendReceipt,
  deliverReceiptLine,
  fsReceiptIo,
  readReceipts,
  receiptFileFor,
} from "../src/supervisor/receipt.ts";
import { createWatchdog, DEFAULT_HEARTBEAT_MS } from "../src/supervisor/watchdog.ts";
import { mountSupervisor } from "../src/supervisor/service.ts";
import { createMdControlRoutes } from "../src/mdcontrol-routes.ts";

// ── fixtures ────────────────────────────────────────────────────────────────

const NOW_MS = Date.parse("2026-08-26T12:00:00.000Z");
const FUTURE_ISO = "2026-08-26T13:00:00.000Z";
const PAST_ISO = "2026-08-26T11:00:00.000Z";
const CLAIM_TOKEN = "attempt-run-1-ses-holder-1-ab12cd34";
const POLICY = { maxAuditRounds: 3 };

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "supervisor-core-"));
}

function writePolicy(root) {
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
  - id: writer-identity
    match: "{{plansDir}}/**/*.md"
    rule: writer-identity
    mode: enforce
  - id: plan-completed
    match: "{{plansDir}}/**/*.md"
    rule: plan-completed
    mode: enforce
  - id: claim-taken
    match: "{{plansDir}}/**/*.md"
    rule: claim-validity
    mode: enforce
  - id: roadmap-write-guard
    match: "{{roadmapPath}}"
    rule: roadmap-write-guard
    mode: enforce
  - id: meter-guard
    match: "{{roadmapPath}}"
    rule: audit-rounds-overflow
    mode: enforce
  - id: append-only-records
    match: "{{plansDir}}/**/*.md"
    rule: record-append-only
    mode: enforce
  - id: append-only-records-roadmap
    match: "{{roadmapPath}}"
    rule: record-append-only
    mode: enforce
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

## Work Item Status

### M1 — Demo milestone

- [${wi1Checked ? "x" : " "}] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
`,
    "utf8",
  );
  return file;
}

function planText({ status = "active", checked = false, claim = null, expires = null, failures = null } = {}) {
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

- [${checked ? "x" : " "}] only item

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

function lawCtxOf(root) {
  const ctx = discoverLawContext(join(root, "missions"), fsLawGateIo);
  assert.notEqual(ctx, null, "fixture law context must resolve");
  return ctx;
}

const flush = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

function handSnapshot(derived) {
  return {
    scannedAt: "2026-08-26T12:00:00.000Z",
    projectRoot: "/p",
    plansDir: "/p/docs/plans",
    roadmapPath: null,
    plans: [],
    roadmap: null,
    derived: {
      draft: [], active: [], held: [], open: [], awaitingClosure: [],
      expiredClaims: [], roadmapCounts: { total: 0, checked: 0, unchecked: 0 }, auditRounds: 0,
      ...derived,
    },
  };
}

// ── 1. decision core ────────────────────────────────────────────────────────

test("decide: idle snapshot → a single no-op decision", () => {
  const decisions = decide(handSnapshot({ roadmapCounts: { total: 2, checked: 1, unchecked: 1 }, auditRounds: 1 }), POLICY, () => NOW_MS);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, "no-op");
  assert.equal(decisions[0].posture, "observe");
});

test("decide: expired claim → meter-write/claim-reclaim observation with the 1411-2/WI29 note", () => {
  const decisions = decide(
    handSnapshot({ expiredClaims: [{ path: "/p/docs/plans/demo/x.md", claim: CLAIM_TOKEN, claimExpires: PAST_ISO }] }),
    POLICY,
    () => NOW_MS,
  );
  assert.equal(decisions.length, 1);
  const d = decisions[0];
  assert.equal(d.type, "meter-write");
  assert.equal(d.action, "claim-reclaim");
  assert.equal(d.posture, "observe");
  assert.match(d.note ?? "", /1411-2/);
  assert.match(d.note ?? "", /WI29/);
});

test("decide: unexpired claim (clock before expiry) → no reclaim decision", () => {
  const decisions = decide(handSnapshot({}), POLICY, () => NOW_MS);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, "no-op");
});

test("decide: awaitingClosure plan → dispatch observation (posture observe + 1411-2 wiring note)", () => {
  const decisions = decide(
    handSnapshot({ active: ["x.md"], open: ["x.md"], awaitingClosure: ["x.md"] }),
    POLICY,
    () => NOW_MS,
  );
  const dispatches = decisions.filter((d) => d.type === "dispatch");
  assert.equal(dispatches.length, 1);
  assert.equal(dispatches[0].action, "mechanical-verification+closure-audit");
  assert.equal(dispatches[0].posture, "observe", "WI25 default posture: dispatch decisions are never executed");
  assert.match(dispatches[0].note ?? "", /1411-2/);
});

test("decide: rich snapshot — no decision ever carries posture 'execute' (WI25 seam invariant)", () => {
  const decisions = decide(
    handSnapshot({
      draft: ["d.md"], active: ["a.md"], held: ["h.md"], open: ["d.md", "a.md", "h.md"],
      awaitingClosure: ["f.md"],
      expiredClaims: [{ path: "e.md", claim: CLAIM_TOKEN, claimExpires: PAST_ISO }],
      roadmapCounts: { total: 5, checked: 2, unchecked: 3 }, auditRounds: 1,
    }),
    POLICY,
    () => NOW_MS,
  );
  assert.ok(decisions.length >= 2);
  for (const d of decisions) {
    assert.equal(d.posture, "observe", `decision ${d.type}/${d.action} must be observation-posture in WI25`);
  }
});

test("scan: predicate buckets + roadmap counts + audit-rounds + expired claims through the assets channel", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root, { auditRounds: 2 });
    writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    writePlan(root, "docs/plans/demo/held.md", planText({ status: "held" }));
    writePlan(root, "docs/plans/demo/fulltick.md", planText({ status: "active", checked: true }));
    writePlan(root, "docs/plans/demo/claimed.md", planText({ status: "active", claim: CLAIM_TOKEN, expires: PAST_ISO }));

    const snapshot = scanSupervisorSnapshot({ projectRoot: root, clock: () => NOW_MS });
    assert.notEqual(snapshot, null);
    const d = snapshot.derived;
    assert.equal(d.draft.length, 1);
    assert.ok(d.draft[0].endsWith("docs/plans/demo/draft.md"));
    // awaitingClosure (fulltick) is a derived middle state INSIDE activePlans
    assert.equal(d.active.length, 3, "active.md + claimed.md + fulltick.md (not completed yet)");
    assert.equal(d.held.length, 1);
    assert.equal(d.awaitingClosure.length, 1, "fulltick.md: active ∧ all-checked ∧ no receipt");
    assert.equal(d.open.length, 5, "draft + 3 active + held");
    assert.deepEqual(d.roadmapCounts, { total: 2, checked: 1, unchecked: 1 });
    assert.equal(d.auditRounds, 2);
    assert.equal(d.expiredClaims.length, 1);
    assert.equal(d.expiredClaims[0].claim, CLAIM_TOKEN);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 2. machine-field writer ────────────────────────────────────────────────

test("writer: claim write on an active plan lands — role=supervisor passes claim-validity unchanged", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const out = writePlanClaim({
      planPath: plan,
      claim: CLAIM_TOKEN,
      expires: FUTURE_ISO,
      lawCtx: lawCtxOf(root),
      now: () => NOW_MS,
    });
    assert.equal(out.status, "written", out.reason ?? "");
    const text = readFileSync(plan, "utf8");
    assert.match(text, new RegExp(`claim: ${CLAIM_TOKEN}`));
    assert.match(text, new RegExp(`claim-expires: ${FUTURE_ISO}`));
    const v = validatePlanFrontmatter({
      status: "active", mission: "demo", "work-item": "M1-WI1", claim: CLAIM_TOKEN, "claim-expires": FUTURE_ISO,
    });
    assert.equal(v.ok, true, "written frontmatter passes the ledger validator");
    assert.match(text, /- \[ \] only item/, "body untouched outside the frontmatter block");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: claim write on a draft plan is law-denied — nothing lands + a deny receipt", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/draft.md", planText({ status: "draft" }));
    const before = readFileSync(plan, "utf8");
    const out = writePlanClaim({
      planPath: plan,
      claim: CLAIM_TOKEN,
      expires: FUTURE_ISO,
      lawCtx: lawCtxOf(root),
      now: () => NOW_MS,
    });
    assert.equal(out.status, "denied");
    assert.match(out.reason ?? "", /claim/, "denial comes from the claim faces (validator/claim-validity)");
    assert.equal(readFileSync(plan, "utf8"), before, "denied write leaves the file untouched");
    const receipts = readReceipts(fsReceiptIo, root);
    assert.ok(receipts.some((r) => r.kind === "exception" && r.event === "machine-field-write-denied"), "deny receipt recorded");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: executor role is denied by the EXISTING claim-validity face (role-bearing deny activates with the supervisor writer)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const lawCtx = lawCtxOf(root);
    const active = planText({ status: "active" });
    const proposed = planText({ status: "active", claim: CLAIM_TOKEN, expires: FUTURE_ISO });
    const path = join(root, "docs/plans/demo/active.md");
    const out = evaluateGates(
      { type: "write", path, proposedContent: proposed, actor: { id: "ses-exec-1", role: "executor" } },
      { policy: lawCtx.policy, currentFileState: { text: active }, ctx: { plansDir: lawCtx.plansDir, now: NOW_MS } },
    );
    assert.equal(out.decision, "deny");
    assert.match(out.reason ?? "", /claim-validity/);
    const ok = evaluateGates(
      { type: "write", path, proposedContent: proposed, actor: { id: "mdsupervisor", role: "supervisor" } },
      { policy: lawCtx.policy, currentFileState: { text: active }, ctx: { plansDir: lawCtx.plansDir, now: NOW_MS } },
    );
    assert.equal(ok.decision, "allow");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: claim clear removes the pair (dispatcher clear face)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/active.md", planText({ status: "active", claim: CLAIM_TOKEN, expires: FUTURE_ISO }));
    const out = clearPlanClaim({ planPath: plan, lawCtx: lawCtxOf(root), now: () => NOW_MS });
    assert.equal(out.status, "written", out.reason ?? "");
    const text = readFileSync(plan, "utf8");
    assert.doesNotMatch(text, /claim:/);
    assert.doesNotMatch(text, /claim-expires:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: failures write lands (supervisor failure-attribution meter)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const out = writePlanFailures({ planPath: plan, failures: 2, lawCtx: lawCtxOf(root) });
    assert.equal(out.status, "written", out.reason ?? "");
    assert.match(readFileSync(plan, "utf8"), /failures: 2/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: roadmap audit-rounds write lands with WI structure untouched", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    const roadmap = writeRoadmap(root, { auditRounds: 1 });
    const before = readFileSync(roadmap, "utf8");
    const out = writeRoadmapAuditRounds({ roadmapPath: roadmap, auditRounds: 2, lawCtx: lawCtxOf(root) });
    assert.equal(out.status, "written", out.reason ?? "");
    const after = readFileSync(roadmap, "utf8");
    assert.match(after, /audit-rounds: 2/);
    assert.equal(after.replace("audit-rounds: 2", "audit-rounds: 1"), before, "only the meter line changed");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: moving basis → conflict after bounded retries, zero writes", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const before = readFileSync(plan, "utf8");
    let reads = 0;
    const writes = [];
    const io = {
      ...fsMeterWriterIo,
      readTextFile: (p) => {
        if (p !== plan) return fsMeterWriterIo.readTextFile(p);
        reads += 1;
        // a constantly moving BASIS: the edit lands inside the Phase section
        // (computeBasisHash domain — frontmatter + phases + closure findings)
        return before.replace("- [ ] only item", `- [ ] only item (rev ${reads})`);
      },
      writeTextAtomic: (_p, content) => {
        writes.push(content);
      },
    };
    const out = writePlanClaim({
      planPath: plan, claim: CLAIM_TOKEN, expires: FUTURE_ISO,
      lawCtx: lawCtxOf(root), io, now: () => NOW_MS, casRetries: 2,
    });
    assert.equal(out.status, "conflict");
    assert.equal(writes.length, 0, "no write ever landed on a moving basis");
    assert.equal(readFileSync(plan, "utf8"), before);
    assert.ok(reads >= 6, `bounded retries consumed the read budget (reads=${reads})`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writer: atomic replace leaves no tmp residue (real fs)", () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const out = writePlanFailures({ planPath: plan, failures: 1, lawCtx: lawCtxOf(root) });
    assert.equal(out.status, "written", out.reason ?? "");
    const residue = readdirSync(dirname(plan)).filter((f) => f.includes("mdsupervisor-tmp"));
    assert.deepEqual(residue, [], "tmp+rename leaves no sibling residue");
    assert.match(readFileSync(plan, "utf8"), /failures: 1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 3. receipt face ────────────────────────────────────────────────────────

test("receipt: JSONL append + read roundtrip at the pinned path", () => {
  const root = tmpProject();
  try {
    appendReceipt(fsReceiptIo, root, { kind: "observation", runId: null, plan: "x.md", event: "meter-write:claim-reclaim" });
    appendReceipt(fsReceiptIo, root, { kind: "terminal", runId: "run-1", plan: null, event: "run-terminal:completed" });
    assert.equal(existsSync(receiptFileFor(root)), true, "pinned path _tmp/supervisor-receipts.jsonl");
    const records = readReceipts(fsReceiptIo, root);
    assert.equal(records.length, 2);
    assert.equal(records[0].kind, "observation");
    assert.equal(records[1].runId, "run-1");
    assert.ok(typeof records[0].ts === "string" && records[0].ts !== "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("receipt: dead-session delivery fails soft (A8) — never throws", () => {
  const dead = { get: () => undefined };
  const out = deliverReceiptLine(dead, "ses-gone", "[mdsupervisor] terminal");
  assert.equal(out.delivered, false);
  assert.match(out.error ?? "", /A8/);
  const throwing = { get: () => ({ followup: () => { throw new Error("boom"); } }) };
  const out2 = deliverReceiptLine(throwing, "ses-1", "[mdsupervisor] terminal");
  assert.equal(out2.delivered, false);
  assert.match(out2.error ?? "", /boom/);
  const none = deliverReceiptLine(undefined, "ses-1", "line");
  assert.equal(none.delivered, false);
});

test("receipt: mdcontrol.status passthrough carries the supervisor face (existing-route extension, zero new route)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const withHook = createMdControlRoutes({
      ctx: {},
      supervisorStatus: () => ({ mounted: true, scans: 3, heartbeatMs: DEFAULT_HEARTBEAT_MS }),
    });
    const status = await withHook["mdcontrol.status"]({ projectRoot: root, runId: "none" });
    assert.equal(status.found, false);
    assert.equal(status.supervisor.mounted, true);
    assert.equal(status.supervisor.scans, 3);

    const withoutHook = createMdControlRoutes({ ctx: {} });
    const status2 = await withoutHook["mdcontrol.status"]({ projectRoot: root, runId: "none" });
    assert.equal(status2.supervisor, null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 4. watchdog ────────────────────────────────────────────────────────────

function fakeTimers() {
  const intervals = [];
  const timeouts = [];
  return {
    timers: {
      setInterval(fn) {
        const e = { fn, stopped: false };
        intervals.push(e);
        return () => { e.stopped = true; };
      },
      setTimeout(fn) {
        const e = { fn, stopped: false };
        timeouts.push(e);
        return () => { e.stopped = true; };
      },
    },
    fireHeartbeats(n) {
      for (let i = 0; i < n; i++) for (const e of intervals) if (!e.stopped) e.fn();
    },
    fireDebounce() {
      for (const e of timeouts.filter((t) => !t.stopped)) {
        e.stopped = true;
        e.fn();
      }
    },
  };
}

test("watchdog: heartbeat pacing — K timer fires drive K cycles", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const fake = fakeTimers();
    const wd = createWatchdog({ projectRoot: root, timers: fake.timers, logger: {} });
    wd.start();
    await flush();
    const base = wd.statusFace().scans;
    assert.ok(base >= 1, "start() ran the recovery scan (restart seam)");
    fake.fireHeartbeats(3);
    await flush();
    assert.equal(wd.statusFace().scans, base + 3, "three heartbeat fires → three more cycles");
    assert.equal(wd.statusFace().heartbeatMs, DEFAULT_HEARTBEAT_MS);
    wd.stop();
    fake.fireHeartbeats(2);
    await flush();
    assert.equal(wd.statusFace().scans, base + 3, "a stopped watchdog ignores heartbeat fires");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watchdog: single-flight — re-entry during a scan coalesces into exactly one follow-up", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    let entered = 0;
    let release = () => {};
    const gate = new Promise((r) => { release = r; });
    const wd = createWatchdog({
      projectRoot: root,
      timers: fakeTimers().timers,
      logger: {},
      beforeDecide: async () => { entered += 1; await gate; },
    });
    const first = wd.runCycle("heartbeat");
    await flush();
    assert.equal(entered, 1, "first cycle is inside the scan gate");
    assert.equal(await wd.runCycle("event"), null, "re-entry during an in-flight scan returns immediately");
    assert.equal(await wd.runCycle("heartbeat"), null, "second re-entry coalesces into the same pending slot");
    release();
    await first;
    await flush();
    assert.equal(entered, 2, "exactly one pending follow-up ran after the in-flight scan");
    assert.equal(wd.statusFace().scans, 2);
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watchdog: event-edge debounce — N watcher events → one cycle; start() runs the recovery scan", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const fake = fakeTimers();
    const watcherCbs = [];
    const wd = createWatchdog({
      projectRoot: root,
      timers: fake.timers,
      logger: {},
      watchIo: { watchDir: (_dir, onEvent) => { watcherCbs.push(onEvent); return () => {}; } },
    });
    wd.start(); // recovery scan (restart seam) runs first
    await flush();
    const recoveryScans = wd.statusFace().scans;
    assert.ok(recoveryScans >= 1, "start() ran the recovery scan");

    for (let i = 0; i < 5; i++) for (const cb of watcherCbs) cb();
    await flush();
    assert.equal(wd.statusFace().scans, recoveryScans, "events inside the debounce window trigger nothing yet");
    fake.fireDebounce();
    await flush();
    assert.equal(wd.statusFace().scans, recoveryScans + 1, "N debounced events → exactly one cycle");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("watchdog: observe-only execution — observations land as receipts, machine fields untouched, onTerminal seam isolated", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/fulltick.md", planText({ status: "active", checked: true }));
    writePlan(root, "docs/plans/demo/stale.md", planText({ status: "active", claim: CLAIM_TOKEN, expires: PAST_ISO }));
    const wd = createWatchdog({ projectRoot: root, timers: fakeTimers().timers, logger: {}, clock: () => NOW_MS });
    await wd.runCycle("manual");
    const observed = wd.statusFace().receipts.filter((r) => r.kind === "observation");
    assert.ok(observed.some((r) => r.event === "meter-write:claim-reclaim"), "expired-claim observation recorded");
    assert.ok(observed.some((r) => r.event === "dispatch:mechanical-verification+closure-audit"), "awaitingClosure dispatch observation recorded");
    const stale = readFileSync(join(root, "docs/plans/demo/stale.md"), "utf8");
    assert.match(stale, new RegExp(`claim: ${CLAIM_TOKEN}`), "observe posture leaves machine fields untouched");

    const seen = [];
    wd.registerOnTerminal((e) => seen.push(e));
    wd.registerOnTerminal(() => { throw new Error("hook crash"); });
    const event = wd.emitTerminal({ runId: "run-9", kind: "run-terminal", status: "completed", plan: null });
    assert.equal(seen.length, 1, "a throwing hook is isolated and never blocks the chain");
    assert.equal(event.runId, "run-9");
    assert.ok(wd.statusFace().receipts.some((r) => r.kind === "terminal" && r.event === "run-terminal:completed"));
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 5. service ─────────────────────────────────────────────────────────────

test("service: mountSupervisor publishes mdsupervisor + mount log; dispose idempotent", async () => {
  const root = tmpProject();
  const ctx = new Context();
  try {
    writePolicy(root);
    writeRoadmap(root);
    writePlan(root, "docs/plans/demo/active.md", planText({ status: "active" }));
    const logs = [];
    const logger = {
      info: (m) => logs.push({ level: "info", m }),
      warn: (m) => logs.push({ level: "warn", m }),
    };
    const mounted = mountSupervisor(ctx, { projectRoot: root, heartbeatMs: 60_000, logger });
    assert.notEqual(mounted.service, null);
    assert.notEqual(mounted.watchdog, null);
    assert.ok(logs.some((l) => l.level === "info" && /supervisor mounted/.test(l.m)), "mount log line");
    const published = typeof ctx.get === "function" ? ctx.get("mdsupervisor") : null;
    assert.notEqual(published, null, "second cordis service publication in the same bundle");
    await flush();
    const face = mounted.statusFace();
    assert.notEqual(face, null);
    assert.ok(face.scans >= 1, "start() ran the recovery scan");
    assert.equal(face.mounted, true);
    mounted.dispose();
    mounted.dispose(); // idempotent
    assert.equal(mounted.statusFace().mounted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("service: mountSupervisor without projectRoot → idle posture (no watchdog, statusFace null)", () => {
  const ctx = new Context();
  const logs = [];
  const logger = { info: (m) => logs.push({ level: "info", m }), warn: (m) => logs.push({ level: "warn", m }) };
  const mounted = mountSupervisor(ctx, { logger });
  assert.equal(mounted.service, null);
  assert.equal(mounted.watchdog, null);
  assert.equal(mounted.statusFace(), null);
  assert.ok(logs.some((l) => /idle/.test(l.m)), "idle posture is a mount-log note, never a failure");
  mounted.dispose();
});
