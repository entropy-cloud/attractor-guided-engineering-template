#!/usr/bin/env node
/**
 * e2e-continuous.mjs — continuous-mode end-to-end three-leg run
 * (age-autonomy M3-WI28, plan
 * `docs/plans/age-autonomy/2026-08-26-1954-1` Phase 3; WI31 Verification
 * Gate prerequisite).
 *
 * ── Env posture (WI31 gate text: "如本地无 env 则 fail-fast exit ≠ 0，CI 视为
 *    opt-in 不阻塞"; form mirrors scripts/verify-native.mjs /
 *    scripts/e2e-demo.mjs — but WITHOUT the skip-with-0 exit: a missing host
 *    env must never read as a green pass) ───────────────────────────────────
 *   DSH_E2E_CONTINUOUS unset/≠1 → console.error fail-fast, exit 1
 *   DSH_E2E_CONTINUOUS=1        → live three-leg run (see below)
 *
 * The "host env" is the explicit invocation marker over a REAL in-process
 * cordis host (boot() over test/fixtures/e2e-continuous.cordis.yml — the
 * same standard e2e-demo uses for its "REAL cordis runtime" native legs):
 * the real nop-age service, the real DSH agents face (the `subagent`
 * registry — dispatch exits create real agent sessions), and a scripted
 * local SSE model endpoint (127.0.0.1, zero credentials, e2e-demo keyless
 * precedent). CI never sets the marker → the script is opt-in and never
 * blocks the aggregate gates (verify-age.sh / age-ci.yml do not invoke it).
 *
 * ── The three legs (03 §4 / plan Phase 1 decisions) ────────────────────────
 *   1. continuous OFF observation — the mounted watchdog's recovery/heartbeat
 *      cycles run against a triggers-carrying policy, but every dispatch
 *      decision lands as an OBSERVATION receipt (behavior tightening:
 *      existing hosts gain no unattended dispatch) and the ledger carries NO
 *      dispatch registration.
 *   2. continuous ON queue advancement — mdcontrol.continuous enables the
 *      per-root flag; the next cycle registers the queued draft's plan-review
 *      dispatch INTO THE LEDGER (## Draft Review Record dispatch line) —
 *      "roadmap 即队列": the queue is the ledger + trigger face, no second
 *      store. (The execution leg stays engine-run territory — plan Phase 1
 *      Decision 1; the leg proves the ledger dispatch chain, not a full
 *      execution.)
 *   3. fixture-driven terminal word + receipt + stop-dispatch — the draft is
 *      removed so the R3 facts hold (audit-rounds ≥1, draft==0, active==0,
 *      held>0) → the R1–R4 core derives `blocked` → run-terminal receipt +
 *      mdcontrol.status exposure + dispatch suppression (a late draft NEVER
 *      gets dispatched even with continuous on).
 *
 * Flags: --keep (preserve the scratch root + report).
 */
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boot } from "@deepseek-ai/dsh-app-boot";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E2E_FIXTURE = join(PLUGIN_ROOT, "test", "fixtures", "e2e-continuous.cordis.yml");
const WAIT_TIMEOUT_MS = 30_000;

// ── env gate: fail-fast exit ≠ 0 when the host env is absent ───────────────

if (process.env.DSH_E2E_CONTINUOUS !== "1") {
  console.error("verify:e2e:continuous: DSH_E2E_CONTINUOUS is not \"1\" — the continuous-mode e2e refuses to run without the host-env marker.");
  console.error("  real-host three-leg run: DSH_E2E_CONTINUOUS=1 pnpm --prefix plugin/nop-age run verify:e2e:continuous");
  console.error("  (opt-in gate posture, WI31: a missing env is a FAILURE here, never a silent skip — CI never sets the marker)");
  process.exit(1);
}

// ── scratch project: triggers policy + roadmap + draft/held plans ──────────

function prepareScratch(root) {
  mkdirSync(join(root, "missions"), { recursive: true });
  mkdirSync(join(root, "docs", "backlog"), { recursive: true });
  mkdirSync(join(root, "docs", "plans", "demo"), { recursive: true });
  mkdirSync(join(root, "dsh-sessions"), { recursive: true });
  mkdirSync(join(root, "dsh-home"), { recursive: true });
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
  - when: "plan.status=draft and review-dispatch-missing"
    dispatch: plan-review
agents:
  reviewer:
    mode: fresh
    model: { provider: deepseek-official, model: deepseek-v4-flash }
  executor:
    mode: pooled
    poolKey: "executor:{projectRoot}"
    model: { provider: deepseek-official, model: deepseek-v4-flash }
dispatch:
  plan-review: reviewer
  execute: executor
`,
    "utf8",
  );
  writeFileSync(
    join(root, "missions", "demo.json"),
    JSON.stringify(
      {
        name: "demo",
        roadmapPath: "docs/backlog/demo-roadmap.md",
        plansDir: "docs/plans/demo",
        commands: { test: "true" },
        autonomyPolicy: "missions/autonomy.policy.yml",
      },
      null,
      2,
    ),
    "utf8",
  );
  writeFileSync(
    join(root, "docs", "backlog", "demo-roadmap.md"),
    `---
audit-rounds: 1
---

# Demo Roadmap (continuous e2e scratch)

### M1 — Demo milestone

- [x] WI1 first item
- [ ] WI2 second item

## Deep Audit Record
`,
    "utf8",
  );
  writeFileSync(
    join(root, "docs", "plans", "demo", "queued-draft.md"),
    `---
status: draft
mission: demo
work-item: M1-WI2
---

# Queued Draft Plan

## Phase 1 — Work

- [ ] only item

## Draft Review Record

## Verification

## Closure
`,
    "utf8",
  );
  writeFileSync(
    join(root, "docs", "plans", "demo", "held.md"),
    `---
status: held
mission: demo
work-item: M1-WI2
hold: "waiting for a human"
failures: 1
---

# Held Plan

## Phase 1 — Work

- [ ] only item

## Draft Review Record

## Verification

## Closure
`,
    "utf8",
  );
}

// ── scripted stub model endpoint (any turn converges; ledger assertions
//    never depend on the agent turn's model outcome) ─────────────────────────

function createStubModelServer() {
  return createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const content = `[e2e-continuous stub] acknowledged (${body.length} bytes) — ledger assertions do not depend on this turn.`;
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"role":"assistant","content":null}}]}\n\n');
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n');
      response.end("data: [DONE]\n\n");
    });
  });
}

// ── polling helpers ─────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label, accept, intervalMs = 100) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  for (;;) {
    let value;
    try {
      value = await accept();
    } catch {
      value = undefined;
    }
    if (value !== undefined && value !== null && value !== false) return value;
    if (Date.now() > deadline) throw new Error(`waitFor(${label}) timed out after ${WAIT_TIMEOUT_MS}ms`);
    await sleep(intervalMs);
  }
}

function receiptsOf(root) {
  const file = join(root, "_tmp", "supervisor-receipts.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r !== null);
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  const keep = process.argv.includes("--keep");
  const root = mkdtempSync(join(tmpdir(), "mdcontrol-e2e-continuous-"));
  prepareScratch(root);
  console.log(`[e2e:continuous] scratch project root: ${root}`);
  const failures = [];
  const report = { scratchRoot: root, startedAt: new Date().toISOString(), legs: {} };

  const stub = createStubModelServer();
  await new Promise((resolveListen) => stub.listen(0, "127.0.0.1", resolveListen));
  const port = stub.address().port;

  process.env.DSH_CWD = root;
  process.env.DSH_SESSION_ROOT = join(root, "dsh-sessions");
  process.env.DSH_HOME = join(root, "dsh-home");
  process.env.DEEPSEEK_API_KEY = "e2e-stub-no-call";
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.DSH_E2E_CONTINUOUS_ROOT = root;

  console.log("[e2e:continuous] booting the real cordis host (fixture e2e-continuous.cordis.yml, supervisor row on)…");
  const ctx = await boot("mdcontrol-e2e-continuous", E2E_FIXTURE);
  try {
    const svc = ctx.get("mdcontrol");
    if (!svc || typeof svc.routes?.["mdcontrol.continuous"] !== "function") {
      throw new Error("mdcontrol service not published at the root realm (ctx.get('mdcontrol') undefined)");
    }
    const draftPath = join(root, "docs", "plans", "demo", "queued-draft.md");

    /* Leg 1 — continuous OFF: observation receipts, zero ledger dispatch */
    console.log("[e2e:continuous] leg 1: continuous OFF (default) — expecting observation receipts, no dispatch registration…");
    const idle = await svc.routes["mdcontrol.continuous"]({ projectRoot: root });
    if (idle.enabled !== false || idle.posture !== "observe" || idle.mounted !== true) {
      failures.push(`leg 1: continuous query returned ${JSON.stringify(idle)} — expected { enabled:false, posture:'observe', mounted:true }`);
    }
    const offReceipt = await waitFor("leg 1 dispatch-downgrade observation", () => {
      const hit = receiptsOf(root).find((r) => r.kind === "observation" && r.event === "dispatch:plan-review");
      return hit !== undefined ? hit : null;
    });
    if (!/continuous mode off/.test(offReceipt.detail ?? "")) {
      failures.push(`leg 1: downgraded observation receipt detail lacks the opt-in note: ${JSON.stringify(offReceipt.detail)}`);
    }
    if (/dispatch review/.test(readFileSync(draftPath, "utf8"))) {
      failures.push("leg 1: dispatch line landed in the ledger while continuous OFF — zero unattended behavior violated");
    }
    report.legs.off = { query: idle, observation: offReceipt };
    console.log(`[e2e:continuous] leg 1 ok — observation receipt at ${offReceipt.ts}, ledger clean`);

    /* Leg 2 — continuous ON: queue advancement lands the review dispatch */
    console.log("[e2e:continuous] leg 2: mdcontrol.continuous enable — expecting the queued draft's review dispatch registration…");
    const on = await svc.routes["mdcontrol.continuous"]({
      projectRoot: root,
      enabled: true,
      followup: { sessionId: "e2e-continuous-operator" },
    });
    if (on.enabled !== true || on.posture !== "execute") {
      failures.push(`leg 2: enable returned ${JSON.stringify(on)}`);
    }
    await waitFor("leg 2 dispatch line in the ledger", () => (/dispatch review #review-/.test(readFileSync(draftPath, "utf8")) ? true : null));
    // Receipt kinds have no "action" vocabulary (exec-arm dispatch receipts are
    // kind=observation too, receipt.ts:23) — a real registration receipt is
    // distinguished from the leg-1 gate-downgrade observation by its runId and
    // the "#review-… to <session>" detail (exec-arm.ts dispatch receipt).
    const dispatchReceipt = receiptsOf(root).find(
      (r) => r.event === "dispatch:plan-review" && r.runId !== null && /^#review-\S+ to \S+/.test(r.detail ?? ""),
    );
    if (dispatchReceipt === undefined) {
      failures.push("leg 2: no dispatch receipt recorded alongside the ledger registration");
    }
    report.legs.on = { enable: on, dispatchReceipt: dispatchReceipt ?? null };
    console.log(`[e2e:continuous] leg 2 ok — dispatch line on disk${dispatchReceipt ? `, receipt at ${dispatchReceipt.ts}` : ""}`);

    /* Leg 3 — fixture-driven terminal word: receipt + status + stop-dispatch */
    console.log("[e2e:continuous] leg 3: fixture surgery (draft removed → R3 facts) — expecting run-terminal receipt + stop-dispatch…");
    rmSync(draftPath);
    const terminalStatus = await waitFor("leg 3 terminal word in mdcontrol.status", async () => {
      const status = await svc.routes["mdcontrol.status"]({ projectRoot: root, runId: "none" });
      const terminal = status?.supervisor?.terminal ?? null;
      return terminal !== null && terminal !== undefined ? status.supervisor : null;
    });
    if (terminalStatus.terminal.word !== "blocked" || terminalStatus.terminal.rule !== "R3") {
      failures.push(`leg 3: terminal ${JSON.stringify(terminalStatus.terminal)} — expected blocked via R3`);
    }
    if (terminalStatus.continuous !== true) {
      failures.push("leg 3: mdcontrol.status supervisor face lost the continuous flag");
    }
    const terminalReceipt = receiptsOf(root).find((r) => r.kind === "terminal" && r.event === "run-terminal:blocked");
    if (terminalReceipt === undefined) {
      failures.push("leg 3: no durable run-terminal:blocked receipt");
    }
    // stop-dispatch outranks the chain: a late draft is NEVER dispatched
    writeFileSync(
      draftPath,
      `---
status: draft
mission: demo
work-item: M1-WI2
---

# Late Draft (after terminal)

## Phase 1 — Work

- [ ] only item

## Draft Review Record

## Verification

## Closure
`,
      "utf8",
    );
    await sleep(1500); // several heartbeat ticks + chain edges with continuous ON
    if (/dispatch review/.test(readFileSync(draftPath, "utf8"))) {
      failures.push("leg 3: a late draft was dispatched after the mission terminal word — stop-dispatch violated");
    }
    report.legs.terminal = { terminal: terminalStatus.terminal, receipt: terminalReceipt ?? null };
    console.log(`[e2e:continuous] leg 3 ok — terminal ${terminalStatus.terminal.word} via ${terminalStatus.terminal.rule}, late draft suppressed`);

    report.finishedAt = new Date().toISOString();
    report.failures = failures;
    if (keep) writeFileSync(join(root, "e2e-continuous-report.json"), JSON.stringify(report, null, 2), "utf8");

    if (failures.length === 0) {
      console.log(`[e2e:continuous] SUMMARY: PASS — three legs green (off observation / on queue advancement with ledger dispatch chain / fixture-driven R3 terminal receipt + stop-dispatch)`);
    } else {
      console.error(`[e2e:continuous] SUMMARY: FAIL — ${failures.length} failure(s):`);
      for (const f of failures) console.error(`  - ${f}`);
    }
    return failures.length === 0 ? 0 : 1;
  } finally {
    await ctx.fiber.dispose().catch(() => {});
    await new Promise((resolveClose) => stub.close(() => resolveClose()));
    if (!keep && failures.length === 0) rmSync(root, { recursive: true, force: true });
    else console.log(`[e2e:continuous] scratch kept at ${root}`);
  }
}

main().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    console.error(`[e2e:continuous] FATAL: ${err?.stack ?? err}`);
    process.exit(1);
  },
);
