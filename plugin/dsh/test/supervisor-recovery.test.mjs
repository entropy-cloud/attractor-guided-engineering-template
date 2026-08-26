/**
 * supervisor-recovery.test.mjs — supervisor crash-recovery scan truth table
 * (age-autonomy M3-WI29, plan `docs/plans/age-autonomy/2026-08-26-1954-2`
 * Phase 1 Proof; grows to the WI31 gate ≥8 with the WI30 stagnation /
 * round-trip cases in this same file).
 *
 * Phase-1 coverage matrix (this plan's share, 7 cases):
 *   - expired claim reclaim THROUGH the recovery cycle (the existing reclaim
 *     trigger face, evaluated on every cycle — recovery included; alignment
 *     note, not a re-implementation)
 *   - dispatch without conclusion × session LIVE → resume (original session
 *     followup injection, NO new dispatch line)
 *   - × session DEAD → redispatch (NEW dispatch line, old line preserved
 *     append-only; the occurrence idempotency face answers by the LATEST
 *     line)
 *   - redispatch does NOT count failures (02 §4.6 non-count increment —
 *     03 §6 "不把单次崩溃计为计划失败")
 *   - recovery-scan idempotency: two consecutive recovery cycles → zero
 *     duplicate actions (per-mount handled set + the ledger line face)
 *   - write face after redispatch: stale lines hold no review lease
 *     (latest-line semantics through evaluateGates — the law truth-table
 *     equivalent assertion face; canonical cases in law-truth-table.test.mjs)
 *   - deep-audit same-occurrence redispatch: audit-rounds NOT re-incremented
 *     (01 §3.1) and an exhausted budget does NOT deadlock the redispatch
 *
 * Phase-2 edge cases (+2):
 *   - deep-audit budget-available variant: redispatch rides the paid round
 *     with no increment, the trigger face does not double-dispatch, and a
 *     CONCLUDED latest line re-opens the occurrence (stale 行不占位)
 *   - headless degradation: no agents face → stale judgment undecidable →
 *     observation receipt only, ledger byte-unchanged, second cycle quiet
 *
 * WI30 will append the stagnation-fingerprint / round-trip cases here to the
 * WI31 gate's ≥8 floor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createWatchdog } from "../src/supervisor/watchdog.ts";
import { evaluateGates } from "../assets/src/law-core.mjs";
import { readReceipts } from "../src/supervisor/receipt.ts";
import { dispatchAlreadyRegistered } from "../src/supervisor/dispatch-resolve.ts";

const NOW_MS = Date.parse("2026-08-26T12:00:00.000Z");
const PAST_ISO = "2026-08-26T11:00:00.000Z";

function tmpProject() {
  return mkdtempSync(join(tmpdir(), "supervisor-recovery-"));
}

function writePolicy(root, { maxAuditRounds = 3, testCommand = "echo ok" } = {}) {
  mkdirSync(join(root, "missions"), { recursive: true });
  writeFileSync(
    join(root, "missions", "autonomy.policy.yml"),
    `version: 1
limits:
  maxAuditRounds: ${maxAuditRounds}
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
  - when: "terminal-claim=nothing-to-draft and draftPlans()==0 and activePlans()==0"
    dispatch: deep-audit
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
      commands: { test: testCommand },
      autonomyPolicy: "missions/autonomy.policy.yml",
    }),
    "utf8",
  );
}

function writeRoadmap(root, { auditRounds = 1, darLines = [] } = {}) {
  const file = join(root, "docs", "backlog", "demo-roadmap.md");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    `---
audit-rounds: ${auditRounds}
---

# Demo Roadmap

### M1 — Demo milestone

- [x] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
${darLines.join("\n")}
`,
    "utf8",
  );
  return file;
}

function writePlan(root, rel, { status = "active", ticked = true, drr = "", closure = "", claim = null, expires = null } = {}) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  const fm = [
    "---",
    `status: ${status}`,
    "mission: demo",
    "work-item: M1-WI1",
    claim !== null ? `claim: ${claim}` : null,
    expires !== null ? `claim-expires: ${expires}` : null,
    "---",
  ].filter((l) => l !== null).join("\n");
  writeFileSync(
    p,
    `${fm}
# Plan

## Phase 1 — Work

- [${ticked ? "x" : " "}] only item

## Draft Review Record
${drr}
## Verification

## Closure
${closure}
`,
    "utf8",
  );
  return p;
}

/** Agents double with liveness control: `get` answers only for live sessions. */
function recoveryAgents({ live = [] } = {}) {
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
      const id = options?.sessionId || `mdsup-${state.creates.length}`;
      liveSet.add(id); // newly dispatched sessions are alive
      return { agent: { id, followup: (m) => state.followups.push({ sessionId: id, text: textOf(m) }) } };
    },
  };
  return { service, state };
}

function makeWatchdog(root, agentsService) {
  return createWatchdog({
    projectRoot: root,
    timers: { setInterval: () => () => {}, setTimeout: () => () => {} },
    clock: () => NOW_MS,
    logger: {},
    continuous: true,
    ...(agentsService !== null ? { dispatchAgents: agentsService } : {}),
  });
}

const receiptsOf = (root) => readReceipts({ appendLine: () => {}, readTextFile: (p) => readFileSync(p, "utf8") }, root);

// ── 1. expired claim reclaim through the recovery cycle ─────────────────────

test("recovery cycle: expired claim reclaimed + re-issued + executor dispatched (existing reclaim trigger face, recovery included)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/stale.md", {
      status: "active",
      ticked: false,
      claim: "attempt-run-1-ses-holder-1-ab12cd34",
      expires: PAST_ISO,
    });
    const fake = recoveryAgents({});
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    const text = readFileSync(plan, "utf8");
    assert.doesNotMatch(text, /ab12cd34/, "expired claim token cleared");
    assert.match(text, /claim: attempt-mdsupervisor-mdsup-[^\s]+/, "claim re-issued to a fresh executor session");
    assert.match(text, /claim-expires: 20/, "fresh TTL written (claim-validity ④⑤ dispatcher face)");
    assert.ok(fake.state.followups.some((f) => /supervisor dispatch execute/.test(f.text)), "executor got the execute prompt");
    assert.ok(receiptsOf(root).some((r) => r.event === "reclaim-claim"), "reclaim receipt recorded");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 2. dispatch without conclusion × session LIVE → resume ──────────────────

test("recovery resume: un-concluded dispatch × LIVE session → original-session followup, NO new dispatch line", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const oldLine = "- dispatch review #review-run-9-rev-1-aaaa1111 to ses_live_rev\n";
    const plan = writePlan(root, "docs/plans/demo/rev.md", { status: "draft", ticked: false, drr: oldLine });
    const fake = recoveryAgents({ live: ["ses_live_rev"] });
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    assert.equal(fake.state.creates.length, 0, "resume creates NO new session");
    assert.deepEqual(
      fake.state.followups.filter((f) => f.sessionId === "ses_live_rev").map((f) => f.text),
      [fake.state.followups.find((f) => /recovery resume plan-review/.test(f.text))?.text].filter(Boolean),
      "exactly ONE recovery-resume followup injected into the original session",
    );
    assert.match(fake.state.followups[0].text, /supervisor recovery resume plan-review/);
    assert.match(fake.state.followups[0].text, /#review-run-9-rev-1-aaaa1111/);
    assert.match(fake.state.followups[0].text, /No new dispatch was issued/);
    const text = readFileSync(plan, "utf8");
    assert.equal(text.split("\n").filter((l) => l.startsWith("- dispatch ")).length, 1, "no new dispatch line (byte-stable DRR)");
    assert.ok(receiptsOf(root).some((r) => r.event === "recovery-resume" && /ses_live_rev/.test(r.detail ?? "")), "resume receipt recorded");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 3. × session DEAD → redispatch ──────────────────────────────────────────

test("recovery redispatch: un-concluded dispatch × DEAD session → NEW dispatch line (old line preserved append-only) + idempotency face answers by the latest line", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const oldLine = "- dispatch review #review-run-9-rev-1-aaaa1111 to ses_dead_rev\n";
    const plan = writePlan(root, "docs/plans/demo/rev.md", { status: "draft", ticked: false, drr: oldLine });
    const fake = recoveryAgents({ live: [] }); // ses_dead_rev not live
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    assert.equal(fake.state.creates.length, 1, "one fresh reviewer session dispatched");
    const text = readFileSync(plan, "utf8");
    assert.match(text, /- dispatch review #review-run-9-rev-1-aaaa1111 to ses_dead_rev\n/, "OLD line preserved verbatim (append-only, 01 §4.2)");
    assert.match(text, /- dispatch review #review-mdsupervisor-rev-1-[0-9a-f]{8} to mdsup-/, "NEW line carries a fresh nonce8 id (redispatch)");
    assert.ok(fake.state.followups.some((f) => /supervisor dispatch plan-review/.test(f.text) && /#review-mdsupervisor-rev-1-/.test(f.text)), "the new reviewer got the standard dispatch prompt bound to the NEW id");
    assert.ok(!fake.state.followups.some((f) => f.sessionId === "ses_dead_rev"), "the dead session is never injected");
    // occurrence idempotency face (03 §5): the LATEST line answers
    const dedup = dispatchAlreadyRegistered({ occurrenceType: "review", planText: text, roadmapText: null, receiptLines: [], occurrenceKey: "k" });
    assert.equal(dedup.already, true);
    assert.match(dedup.detail, /latest #review-mdsupervisor-rev-1-/, "latest line answers — the stale line does not shadow it");
    assert.ok(receiptsOf(root).some((r) => r.event === "recovery-redispatch" && /preserved append-only/.test(r.detail ?? "")), "redispatch receipt names the preserved old line");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 4. redispatch does NOT count failures ───────────────────────────────────

test("recovery redispatch is NOT a plan failure: the failures field stays absent (02 §4.6 non-count, 03 §6)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/rev.md", {
      status: "draft",
      ticked: false,
      drr: "- dispatch review #review-run-9-rev-1-aaaa1111 to ses_dead_rev\n",
    });
    const fake = recoveryAgents({ live: [] });
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    const text = readFileSync(plan, "utf8");
    assert.match(text, /- dispatch review #review-mdsupervisor-rev-1-/, "redispatch landed");
    assert.doesNotMatch(text, /^failures:/m, "no failures count — a single crash is never a plan failure (03 §6)");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 5. recovery-scan idempotency (two consecutive recovery cycles) ──────────

test("recovery idempotency: a second consecutive recovery cycle performs ZERO duplicate actions (per-mount handled set + ledger face)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/rev.md", {
      status: "draft",
      ticked: false,
      drr: "- dispatch review #review-run-9-rev-1-aaaa1111 to ses_dead_rev\n",
    });
    const fake = recoveryAgents({ live: [] });
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    await wd.runCycle("recovery");
    assert.equal(fake.state.creates.length, 1, "exactly one redispatch across both cycles");
    const text = readFileSync(plan, "utf8");
    assert.equal(text.split("\n").filter((l) => l.startsWith("- dispatch review ")).length, 2, "exactly two dispatch lines (old + one redispatch)");
    assert.equal(receiptsOf(root).filter((r) => r.event === "recovery-redispatch").length, 1, "one redispatch receipt");
    // resume variant: the nudge happens exactly once per mount
    const plan2 = writePlan(root, "docs/plans/demo/live.md", {
      status: "draft",
      ticked: false,
      drr: "- dispatch review #review-run-9-live-1-bbbb2222 to ses_live_rev\n",
    });
    void plan2;
    const fake2 = recoveryAgents({ live: ["ses_live_rev"] });
    const wd2 = makeWatchdog(root, fake2.service);
    await wd2.runCycle("recovery");
    await wd2.runCycle("recovery");
    assert.equal(fake2.state.followups.filter((f) => /recovery resume/.test(f.text)).length, 1, "one resume nudge per mount");
    wd.stop();
    wd2.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 6. write face after redispatch (review lease latest-line, equivalent face) ──

test("write face after redispatch: stale lines hold NO lease — drafter denied while in flight, unblocked once the latest line concludes; the dead session is a third party", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const plan = writePlan(root, "docs/plans/demo/rev.md", {
      status: "draft",
      ticked: false,
      drr: "- dispatch review #review-run-9-rev-1-aaaa1111 to ses_dead_rev\n",
    });
    const fake = recoveryAgents({ live: [] });
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    const redispatched = readFileSync(plan, "utf8");
    const newId = redispatched.match(/- dispatch review (#review-mdsupervisor-rev-1-[0-9a-f]{8}) to (mdsup-[^\s]+)\n/);
    assert.ok(newId !== null, "redispatch line present");
    const [, newReviewId, newSession] = newId;

    const gate = (current, proposed, actor) =>
      evaluateGates(
        { type: "write", path: plan, proposedContent: proposed, ...(actor ? { actor } : {}) },
        {
          policy: { gates: [{ id: "wi", match: "{{plansDir}}/**/*.md", rule: "writer-identity", mode: "enforce" }] },
          currentFileState: { text: current },
          ctx: { plansDir: dirname(plan) },
        },
      );
    const edit = (base) => base.replace("- [ ] only item", "- [ ] only item\n- [ ] second item");

    // in flight: lease = the LATEST line's session only
    assert.equal(gate(redispatched, edit(redispatched), { id: "ses-drafter-self" }).decision, "deny", "third party denied while the redispatched review is in flight");
    assert.equal(gate(redispatched, edit(redispatched), { id: "ses_dead_rev" }).decision, "deny", "the crash-orphaned line holds no lease — its dead session is a third party (M3-WI29)");
    assert.equal(gate(redispatched, edit(redispatched), { id: newSession }).decision, "allow", "the latest line's reviewer writes freely");

    // concluded: the paired LATEST line closes the lease even though the old line stays unpaired
    const concluded = redispatched.replace(
      `${`- dispatch review ${newReviewId} to ${newSession}`}\n`,
      `${`- dispatch review ${newReviewId} to ${newSession}`}\n- 2026-08-26：iteration 1，共识 acceptable-as-is ${newReviewId}\n`,
    );
    const after = gate(concluded, edit(concluded), { id: "ses-drafter-self" });
    assert.equal(after.decision, "allow", "lease closed by the paired latest line — the drafter write face is unblocked (the deadlock fix)");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 7. deep-audit same-occurrence redispatch: zero increment + no deadlock ──

test("recovery deep-audit redispatch: audit-rounds NOT re-incremented (01 §3.1) and an EXHAUSTED budget does not deadlock the redispatch", async () => {
  const root = tmpProject();
  try {
    writePolicy(root, { maxAuditRounds: 2 }); // exhausted: rounds=2 ≥ max=2
    const roadmap = writeRoadmap(root, {
      auditRounds: 2,
      darLines: ["- dispatch audit #audit-run-9-demo-roadmap-2-aaaaaaaa to ses_dead_aud"],
    });
    const fake = recoveryAgents({ live: [] });
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    const text = readFileSync(roadmap, "utf8");
    assert.match(text, /^audit-rounds: 2$/m, "audit-rounds unchanged — the crashed attempt already paid the round (no double increment)");
    assert.match(text, /- dispatch audit #audit-run-9-demo-roadmap-2-aaaaaaaa to ses_dead_aud\n/, "dead in-flight line preserved");
    assert.match(text, /- dispatch audit #audit-mdsupervisor-demo-roadmap-2-[0-9a-f]{8} to mdsup-\S+ models=/, "redispatch line written at the SAME paid round with honest models= lineage");
    assert.equal(fake.state.creates.length, 1, "budget exhaustion did not deny the redispatch (audit-rounds-overflow gate exemption, M3-WI29)");
    assert.ok(fake.state.followups.some((f) => /supervisor dispatch deep-audit/.test(f.text)), "the new deep auditor got the dispatch prompt");
    assert.ok(receiptsOf(root).some((r) => r.event === "recovery-redispatch" && /audit-rounds NOT re-incremented/.test(r.detail ?? "")), "zero-increment note in the receipt");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 8. Phase 2 edge: deep-audit budget-available variant + dedup latest-line ──

test("recovery deep-audit (budget available): redispatch rides the paid round, no increment, and the trigger face does not double-dispatch; a concluded latest line re-opens the occurrence (stale lines do not occupy)", async () => {
  const root = tmpProject();
  try {
    writePolicy(root, { maxAuditRounds: 3 });
    const roadmap = writeRoadmap(root, {
      auditRounds: 1,
      darLines: ["- dispatch audit #audit-run-9-demo-roadmap-1-aaaaaaaa to ses_dead_aud"],
    });
    const fake = recoveryAgents({ live: [] });
    const wd = makeWatchdog(root, fake.service);
    await wd.runCycle("recovery");
    const text = readFileSync(roadmap, "utf8");
    assert.match(text, /^audit-rounds: 1$/m, "budget was available but the redispatch still consumes none — the round is already paid (01 §3.1)");
    assert.equal(text.split("\n").filter((l) => l.startsWith("- dispatch audit ")).length, 2, "exactly one redispatch line (old dead line + new); the deep-audit trigger face did not double-dispatch (dedup face: latest line unpaired → in flight)");
    assert.equal(fake.state.creates.length, 1, "one deep-audit session (recovery redispatch) — the nothing→deep-audit trigger contributes none");

    // the substantive dedup increment: latest line CONCLUDED (paired) → the
    // occurrence is open for the next round even while the crash-orphaned
    // earlier line stays unpaired forever (stale 行不占位)
    const newId = text.match(/- dispatch audit (#audit-mdsupervisor-demo-roadmap-1-[0-9a-f]{8}) to /)?.[1];
    assert.ok(newId !== undefined);
    const concluded = text.replace(
      `- dispatch audit ${newId} to mdsup-`,
      `- dispatch audit ${newId} to mdsup-`,
    );
    const withAccepted = `${concluded}- accepted ${newId} findings=none：审计通过\n`;
    const dedupInFlight = dispatchAlreadyRegistered({ occurrenceType: "deep-audit", planText: null, roadmapText: text, receiptLines: [], occurrenceKey: "k" });
    assert.equal(dedupInFlight.already, true, "latest unpaired → in flight");
    const dedupConcluded = dispatchAlreadyRegistered({ occurrenceType: "deep-audit", planText: null, roadmapText: withAccepted, receiptLines: [], occurrenceKey: "k" });
    assert.equal(dedupConcluded.already, false, "latest paired → next round dispatchable — the superseded unpaired line does not occupy (M3-WI29)");
    assert.match(dedupConcluded.detail, /superseded unpaired line\(s\) do not occupy/);
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── 9. Phase 2 edge: headless (no agents face) — explicit degradation ───────

test("recovery headless degradation: no agents face → stale judgment UNDECIDABLE → observation receipt only, ledger byte-unchanged, second cycle quiet", async () => {
  const root = tmpProject();
  try {
    writePolicy(root);
    writeRoadmap(root);
    const before = writePlan(root, "docs/plans/demo/rev.md", {
      status: "draft",
      ticked: false,
      drr: "- dispatch review #review-run-9-rev-1-aaaa1111 to ses_dead_rev\n",
    });
    const wd = makeWatchdog(root, null); // no dispatchAgents — headless posture
    await wd.runCycle("recovery");
    const text = readFileSync(before, "utf8");
    assert.equal(text.split("\n").filter((l) => l.startsWith("- dispatch review ")).length, 1, "no redispatch line — liveness undecidable, no action");
    const receipts = receiptsOf(root);
    assert.ok(receipts.some((r) => r.event === "recovery-observe" && /liveness undecidable, no action \(headless degradation/.test(r.detail ?? "")), "one explicit degraded observation receipt");
    await wd.runCycle("recovery");
    assert.equal(receiptsOf(root).filter((r) => r.event === "recovery-observe").length, 1, "second recovery cycle stays quiet (per-mount handled set)");
    assert.equal(readFileSync(before, "utf8"), text, "ledger byte-unchanged across both cycles");
    wd.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
