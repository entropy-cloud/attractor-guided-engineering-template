// gate-check-law.test.js — `<plan.md> --law` full-policy enforcement face
// (age-autonomy M3-WI31, plan
// docs/plans/age-autonomy/2026-08-27-0433-1 Phase 1 Proof).
//
// Pins:
//   1. usage face: bare / --help invocation prints a usage line for --law;
//   2. a legal active-plan fixture under a real fixture policy → exit 0,
//      every matched enforce gate allow, workItem reconciled against the
//      fixture roadmap, derivedCompletion + queuePredicates shapes pinned;
//   3. the enforce deny face: a forged Closure receipt (accepted with no
//      same-id dispatch) → exit 1, closure-audit-binding deny;
//   4. fallback branches: no owning mission → structured deny; mission
//      without `autonomyPolicy` falls back to missions/autonomy.policy.yml;
//      neither channel resolvable → structured deny;
//   5. legacy-format plan (dual-read transition) runs with out-of-domain
//      allow notes → exit 0;
//   6. queue predicates over the mission plansDir corpus: draft / active /
//      awaitingClosure / closed membership pinned (default verify keys
//      injected via the plan-check.mjs missionDefaultVerifyKeys seam);
//   7. the P8 conditional corpus: a protected-path target (dummy file at
//      tools/mission-driver/src/gate-check.mjs relative to the fixture root,
//      mission plansDir ".") denies on the approved-project-evaluated branch
//      — corpus WAS injected, not the fail-closed branch.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { computeBasisHash } from "../src/ledger-sections.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE_CHECK = resolve(__dirname, "..", "src", "gate-check.mjs");

function runCli(...args) {
  const res = spawnSync(process.execPath, [GATE_CHECK, ...args], {
    encoding: "utf8",
    timeout: 30000,
  });
  return { code: res.status ?? 0, stdout: res.stdout || "", stderr: res.stderr || "" };
}

const FIXTURE_POLICY = `version: 1
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: enforce
  - id: closure-audit-binding
    match: "{{plansDir}}/**/*.md"
    rule: closure-audit-binding
    mode: enforce
  - id: writer-identity
    match: "{{plansDir}}/**/*.md"
    rule: writer-identity
    mode: enforce
  - id: plan-completed
    match: "{{plansDir}}/**/*.md"
    rule: plan-completed
    mode: enforce
  - id: verify-keys
    match: "{{plansDir}}/**/*.md"
    rule: verify-keys
    mode: enforce
  - id: path-guardrail
    match: "action:write"
    rule: path-guardrail
    mode: enforce
  - id: legacy-plan-freeze
    match: "action:write"
    rule: legacy-plan-freeze
    mode: enforce
  - id: law-self-protection-gate-check
    match: "{{projectRoot}}/tools/mission-driver/src/gate-check.mjs"
    rule: law-self-protection
    mode: enforce
`;

const FIXTURE_ROADMAP = `# fixture roadmap

### M1 — first

- [x] WI1 seed the ledger : \`done\`

### M3 — supervisor

- [ ] WI31 verification gate : \`todo\`
`;

function planFrontmatter(status, extra = "") {
  return `---\nstatus: ${status}\nmission: law-fixture\nwork-item: M3-WI31\ngroup: "2026-08-27-0000"\n${extra}---\n`;
}

function activePlan() {
  return `${planFrontmatter("active", "verify: [test]\n")}# fixture active plan

## Phase 1 — work

- [ ] item one
- [ ] item two

## Draft Review Record

## Verification

## Closure
`;
}

/**
 * Fixture project: missions/law-fixture.json (plansDir docs/plans/fix,
 * autonomyPolicy missions/autonomy.policy.yml) + roadmap + policy + a plan
 * corpus (draft / active / awaitingClosure / completed / forged / legacy).
 */
function buildFixtureProject() {
  const tmp = mkdtempSync(join(tmpdir(), "gc-law-"));
  mkdirSync(join(tmp, "missions"), { recursive: true });
  mkdirSync(join(tmp, "docs", "plans", "fix"), { recursive: true });
  mkdirSync(join(tmp, "docs", "backlog"), { recursive: true });
  writeFileSync(join(tmp, "missions", "autonomy.policy.yml"), FIXTURE_POLICY);
  writeFileSync(join(tmp, "docs", "backlog", "roadmap.md"), FIXTURE_ROADMAP);
  const mission = {
    name: "law-fixture",
    roadmapPath: "docs/backlog/roadmap.md",
    plansDir: "docs/plans/fix",
    commands: { test: "true" },
    autonomyPolicy: "missions/autonomy.policy.yml",
  };
  writeFileSync(join(tmp, "missions", "law-fixture.json"), JSON.stringify(mission, null, 2));

  const plans = join(tmp, "docs", "plans", "fix");
  writeFileSync(join(plans, "active-plan.md"), activePlan());
  writeFileSync(
    join(plans, "draft-plan.md"),
    `${planFrontmatter("draft")}# fixture draft plan

## Phase 1 — work

- [ ] item one
`,
  );
  // awaitingClosure: all-checked, no receipts, NO verify field — default key
  // injection (missionDefaultVerifyKeys → ["test"]) must feed the derivation.
  writeFileSync(
    join(plans, "awaiting-plan.md"),
    `${planFrontmatter("active")}# fixture awaiting plan

## Phase 1 — work

- [x] item one

## Draft Review Record

## Verification

## Closure
`,
  );
  // completed derivation: pass line with the live basisHash + receipt pair.
  const doneBody = `${planFrontmatter("active", "verify: [test]\n")}# fixture done plan

## Phase 1 — work

- [x] item one

## Draft Review Record

## Verification

## Closure
- dispatch audit #audit-run1-law-fixture-done-plan-1-a1b2c3d4 to ses_aud_1
- accepted #audit-run1-law-fixture-done-plan-1-a1b2c3d4：ok
`;
  const withPass = doneBody.replace(
    "## Verification\n",
    `## Verification\n- pass test run1-law-fixture basisHash=${computeBasisHash(doneBody)} exit=0\n`,
  );
  writeFileSync(join(plans, "done-plan.md"), withPass);
  // forged receipt: accepted with no same-id dispatch → enforce deny face.
  writeFileSync(
    join(plans, "forge-plan.md"),
    `${planFrontmatter("active", "verify: [test]\n")}# fixture forged plan

## Phase 1 — work

- [ ] item one

## Draft Review Record

## Verification

## Closure
- accepted #audit-run1-law-fixture-forge-plan-1-a1b2c3d4：forged
`,
  );
  writeFileSync(
    join(plans, "legacy-plan.md"),
    `# fixture legacy plan

> Plan Status: active

### Phase 1 - old format

- [x] item one
`,
  );
  return { tmp, plans, missionFile: join(tmp, "missions", "law-fixture.json") };
}

describe("usage face", () => {
  it("bare and --help invocations print a --law usage line", () => {
    for (const args of [[], ["--help"]]) {
      const r = runCli(...args);
      assert.equal(r.code, 1, JSON.stringify(args));
      assert.match(r.stderr, /--law/, JSON.stringify(args));
      assert.match(r.stderr, /full policy gates/, JSON.stringify(args));
    }
  });
});

describe("--law allow face (legal fixture under the real policy posture)", () => {
  it("active plan → exit 0, all matched enforce gates allow, views pinned", () => {
    const { tmp, plans } = buildFixtureProject();
    try {
      const r = runCli(join(plans, "active-plan.md"), "--law");
      assert.equal(r.code, 0, r.stdout + r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.face, "law-policy");
      assert.equal(out.decision, "allow");
      assert.equal(out.mission, "law-fixture");
      assert.equal(out.policySource, "mission.autonomyPolicy");
      assert.ok(out.policyFile.endsWith(join("missions", "autonomy.policy.yml")));
      // enforce gates matched the {{plansDir}} / action:write domains
      const gateIds = out.gates.map((g) => g.gateId);
      for (const id of ["plan-structure", "closure-audit-binding", "writer-identity", "plan-completed", "verify-keys", "path-guardrail", "legacy-plan-freeze"]) {
        assert.ok(gateIds.includes(id), `${id} missing from ${gateIds.join(",")}`);
      }
      for (const g of out.gates) {
        assert.equal(g.mode, "enforce");
        assert.equal(g.verdict, "allow", `${g.gateId}: ${g.reason}`);
      }
      assert.deepEqual(out.workItem, {
        applicable: true,
        label: "M3-WI31",
        ok: true,
        expanded: ["WI31"],
        registered: ["WI31"],
        missing: [],
        roadmap: join(tmp, "docs", "backlog", "roadmap.md"),
      });
      assert.equal(out.derivedCompletion.status, "active");
      assert.equal(out.derivedCompletion.completed, false);
      assert.ok(out.derivedCompletion.reasons.includes("unchecked-items:2"));
      assert.ok(out.derivedCompletion.reasons.includes("no-audit-receipt"));
      assert.deepEqual(out.derivedCompletion.verification.keys, ["test"]);
      assert.deepEqual(out.defaultVerifyKeys, ["test"]);
      assert.equal(out.notes.includes("unverified-writer"), true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("queue predicates pin draft/active/awaitingClosure/closed membership over the plansDir corpus", () => {
    const { tmp, plans } = buildFixtureProject();
    try {
      const r = runCli(join(plans, "active-plan.md"), "--law");
      assert.equal(r.code, 0, r.stdout);
      const q = JSON.parse(r.stdout).queuePredicates;
      assert.equal(q.records, 6);
      assert.deepEqual(q.draftPlans, ["docs/plans/fix/draft-plan.md"]);
      // forge-plan stays in the active queue too — its forged receipt does not
      // derive completion (the deny face is the gate, not the queue view)
      assert.deepEqual(q.activePlans, ["docs/plans/fix/active-plan.md", "docs/plans/fix/awaiting-plan.md", "docs/plans/fix/forge-plan.md"]);
      assert.deepEqual(q.heldPlans, []);
      assert.deepEqual(q.awaitingClosure, ["docs/plans/fix/awaiting-plan.md"]);
      assert.deepEqual(q.closedPlans, ["docs/plans/fix/done-plan.md"]);
      assert.deepEqual(q.openPlans, ["docs/plans/fix/active-plan.md", "docs/plans/fix/awaiting-plan.md", "docs/plans/fix/draft-plan.md", "docs/plans/fix/forge-plan.md"]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("awaitingClosure derivation runs on injected default verify keys (no frontmatter verify)", () => {
    const { tmp, plans } = buildFixtureProject();
    try {
      const r = runCli(join(plans, "awaiting-plan.md"), "--law");
      assert.equal(r.code, 0, r.stdout + r.stderr);
      const out = JSON.parse(r.stdout);
      assert.deepEqual(out.derivedCompletion.verification.keys, ["test"]);
      assert.ok(out.derivedCompletion.reasons.includes("missing-pass:test"));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("--law enforce deny face", () => {
  it("forged Closure receipt (accepted, no dispatch) → exit 1 via closure-audit-binding", () => {
    const { tmp, plans } = buildFixtureProject();
    try {
      const r = runCli(join(plans, "forge-plan.md"), "--law");
      assert.equal(r.code, 1, r.stdout);
      const out = JSON.parse(r.stdout);
      assert.equal(out.decision, "deny");
      const gate = out.gates.find((g) => g.gateId === "closure-audit-binding");
      assert.equal(gate.verdict, "deny");
      assert.match(gate.reason, /unbound conclusion line\(s\)/);
      assert.match(out.reason, /closure-audit-binding/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("protected-path target denies on the approved-project-evaluated branch (P8 corpus injected)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gc-law-p8-"));
    try {
      mkdirSync(join(tmp, "missions"), { recursive: true });
      mkdirSync(join(tmp, "tools", "mission-driver", "src"), { recursive: true });
      writeFileSync(join(tmp, "missions", "autonomy.policy.yml"), FIXTURE_POLICY);
      writeFileSync(
        join(tmp, "missions", "wide.json"),
        JSON.stringify(
          {
            name: "wide-fixture",
            roadmapPath: "missions/autonomy.policy.yml",
            plansDir: ".",
            commands: { test: "true" },
            autonomyPolicy: "missions/autonomy.policy.yml",
          },
          null,
          2,
        ),
      );
      const target = join(tmp, "tools", "mission-driver", "src", "gate-check.mjs");
      writeFileSync(target, "// dummy protected-path target\n");
      const r = runCli(target, "--law");
      assert.equal(r.code, 1, r.stdout);
      const out = JSON.parse(r.stdout);
      const gate = out.gates.find((g) => g.gateId === "law-self-protection-gate-check");
      assert.equal(gate.verdict, "deny");
      // corpus WAS injected (conditional read mirrored) — this is the
      // approved-project-evaluated deny, not the fail-closed no-corpus branch
      assert.match(gate.reason, /protected law face/);
      assert.doesNotMatch(gate.reason, /corpus is not injected/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("--law fallback branches", () => {
  it("no owning mission → structured deny exit 1", () => {
    const tmp = mkdtempSync(join(tmpdir(), "gc-law-none-"));
    try {
      const f = join(tmp, "orphan-plan.md");
      writeFileSync(f, activePlan());
      const r = runCli(f, "--law");
      assert.equal(r.code, 1, r.stdout);
      const out = JSON.parse(r.stdout);
      assert.equal(out.decision, "deny");
      assert.match(out.reason, /no owning mission/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("mission without autonomyPolicy falls back to missions/autonomy.policy.yml discovery", () => {
    const { tmp, plans, missionFile } = buildFixtureProject();
    try {
      const mission = JSON.parse(readFileSync(missionFile, "utf8"));
      delete mission.autonomyPolicy;
      writeFileSync(missionFile, JSON.stringify(mission, null, 2));
      const r = runCli(join(plans, "active-plan.md"), "--law");
      assert.equal(r.code, 0, r.stdout + r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.policySource, "missions/autonomy.policy.yml (fallback discovery)");
      assert.equal(out.decision, "allow");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("no policy field and no fallback file → structured deny exit 1", () => {
    const { tmp, plans, missionFile } = buildFixtureProject();
    try {
      const mission = JSON.parse(readFileSync(missionFile, "utf8"));
      delete mission.autonomyPolicy;
      writeFileSync(missionFile, JSON.stringify(mission, null, 2));
      rmSync(join(tmp, "missions", "autonomy.policy.yml"));
      const r = runCli(join(plans, "active-plan.md"), "--law");
      assert.equal(r.code, 1, r.stdout);
      const out = JSON.parse(r.stdout);
      assert.equal(out.decision, "deny");
      assert.match(out.reason, /no autonomy policy resolvable/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("--law legacy plan (dual-read transition)", () => {
  it("legacy-format plan runs with out-of-domain allow notes → exit 0", () => {
    const { tmp, plans } = buildFixtureProject();
    try {
      const r = runCli(join(plans, "legacy-plan.md"), "--law");
      assert.equal(r.code, 0, r.stdout + r.stderr);
      const out = JSON.parse(r.stdout);
      assert.equal(out.decision, "allow");
      const ps = out.gates.find((g) => g.gateId === "plan-structure");
      assert.equal(ps.verdict, "allow");
      assert.match(ps.reason, /outside plan-structure domain/);
      // legacy `> Plan Status: active` is non-terminal — freeze inert
      const freeze = out.gates.find((g) => g.gateId === "legacy-plan-freeze");
      assert.equal(freeze.verdict, "allow");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
