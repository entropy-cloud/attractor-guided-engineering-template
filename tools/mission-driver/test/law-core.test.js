// law-core.test.js — AGE rule-law kernel seam suite (age-autonomy M2-WI12,
// plan docs/plans/age-autonomy/2026-08-25-0815-1 Phase 1 Proof).
//
// Pins:
//   1. proposedAction contract: seven type enum, missing path/proposedContent,
//      bad actor shape → deny malformed (decidable fact, never a crash);
//      valid shapes round-trip normalized.
//   2. structural-subset posture: absent actor → `unverified-writer` note,
//      identity never flips the verdict; present actor adds no note.
//   3. observe vs enforce: observe-mode deny is recorded but not enforced;
//      enforce-mode deny blocks with a structured reason (02 §6 posture).
//   4. seed rule plan-structure: legal frontmatter plan allows; block-scalar
//      frontmatter, out-of-domain checkboxes, malformed append-only lines,
//      frontmatter field violations deny; legacy-format files are out of
//      domain (dual-read transition) → allow + note.
//   5. baseHash CAS best-effort: mismatch → stale-write observation (M2
//      observe-only), absent currentFileState → cas-unverified, match → clean.
//   6. gate matching: action: form, {{plansDir}}/{{roadmapPath}} globs,
//      unresolved placeholders never match.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProposedAction,
  evaluateGates,
  matchGate,
  listRuleIds,
  getRule,
  registerRule,
  sha256Text,
  PROPOSED_ACTION_TYPES,
  ACTOR_ROLES,
} from "../src/law-core.mjs";
import { validatePlanFrontmatter } from "../src/ledger-frontmatter.mjs";

// throwing-rule fixture for the fail-open per-rule path (unique id; harmless
// residue for other tests — rules are addressed by name)
registerRule("boom", () => {
  throw new Error("kaboom");
});

const LEGAL_PLAN = `---
status: draft
mission: demo
work-item: M1-WI1
verify: [test]
---
# Plan

## Phase 1 — Work

- [ ] item one
- [x] item two

## Draft Review Record

## Verification

## Closure
`;

const PLANS_DIR = "/repo/docs/plans/demo";

function legalAction(overrides = {}) {
  return { type: "write", path: `${PLANS_DIR}/2026-01-01-x.md`, proposedContent: LEGAL_PLAN, ...overrides };
}

function policyWith(mode) {
  return {
    gates: [{ id: "plan-structure", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode }],
  };
}

describe("proposedAction contract", () => {
  it("accepts the seven type enum and normalizes optional fields", () => {
    for (const type of PROPOSED_ACTION_TYPES) {
      const r = parseProposedAction({ type, path: "/x/y.md", proposedContent: "c" });
      assert.equal(r.ok, true, type);
    }
    const r = parseProposedAction({
      type: "edit",
      path: "/x/y.md",
      proposedContent: "c",
      baseHash: "a".repeat(64),
      actor: { id: "ses-1", role: "reviewer" },
    });
    assert.equal(r.ok, true);
    assert.deepEqual(r.action.actor, { id: "ses-1", role: "reviewer" });
    assert.equal(r.action.baseHash, "a".repeat(64));
  });

  it("denies malformed: unknown type / missing path / missing proposedContent / bad actor", () => {
    for (const bad of [
      { type: "rm", path: "/x", proposedContent: "c" },
      { type: "write", proposedContent: "c" },
      { type: "write", path: "/x" },
      { type: "write", path: "/x", proposedContent: "c", actor: { role: "wizard" } },
      { type: "write", path: "/x", proposedContent: "c", actor: { id: 7, role: "human" } },
      { type: "write", path: "/x", proposedContent: "c", baseHash: "nothex" },
      null,
      "write",
    ]) {
      const r = parseProposedAction(bad);
      assert.equal(r.ok, false, JSON.stringify(bad));
      assert.match(r.error, /must|unknown|not one of/i, JSON.stringify(bad));
    }
    for (const role of ACTOR_ROLES) {
      const r = parseProposedAction({ type: "write", path: "/x", proposedContent: "c", actor: { role } });
      assert.equal(r.ok, true, role);
    }
  });

  it("evaluateGates turns malformed input into deny(malformed-action) without throwing", () => {
    const out = evaluateGates({ type: "chmod", path: "/x", proposedContent: "c" }, { policy: policyWith("enforce") });
    assert.equal(out.decision, "deny");
    assert.equal(out.malformed, true);
    assert.match(out.reason, /^malformed-action:/);
  });
});

describe("structural-subset posture (02 §2)", () => {
  it("absent actor → unverified-writer note; verdict unchanged (allow face)", () => {
    const out = evaluateGates(legalAction(), { policy: policyWith("enforce"), ctx: { plansDir: PLANS_DIR } });
    assert.equal(out.decision, "allow");
    assert.ok(out.notes.includes("unverified-writer"));
  });

  it("absent actor → unverified-writer note; verdict unchanged (deny face)", () => {
    const out = evaluateGates(
      { type: "write", path: `${PLANS_DIR}/x.md`, proposedContent: "---\nstatus: completed\n---\n# p\n" },
      { policy: policyWith("enforce"), ctx: { plansDir: PLANS_DIR } },
    );
    assert.equal(out.decision, "deny");
    assert.ok(out.notes.includes("unverified-writer"));
    assert.match(out.reason, /plan-structure/);
  });

  it("present actor removes the note; identity never feeds the verdict", () => {
    for (const actor of [{ id: "ses-9", role: "executor" }, { role: "engine" }]) {
      const out = evaluateGates(legalAction({ actor }), { policy: policyWith("enforce"), ctx: { plansDir: PLANS_DIR } });
      assert.equal(out.decision, "allow");
      assert.ok(!out.notes.includes("unverified-writer"));
    }
  });

  it("id-only actor (DSH face shape) keeps the structural-subset note", () => {
    const out = evaluateGates(legalAction({ actor: { id: "ses-1" } }), { policy: policyWith("enforce"), ctx: { plansDir: PLANS_DIR } });
    assert.equal(out.decision, "allow");
    assert.ok(out.notes.includes("unverified-writer"));
    // empty actor object is malformed (must carry id and/or role)
    const bad = parseProposedAction({ type: "write", path: "/x", proposedContent: "c", actor: {} });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /must carry id and\/or role/);
  });
});

describe("gate posture: observe vs enforce (02 §6)", () => {
  it("observe-mode deny is recorded, not enforced", () => {
    const out = evaluateGates(
      { type: "write", path: `${PLANS_DIR}/x.md`, proposedContent: "---\nstatus: completed\n---\n# p\n" },
      { policy: policyWith("observe"), ctx: { plansDir: PLANS_DIR } },
    );
    assert.equal(out.decision, "allow");
    assert.equal(out.observations.length, 1);
    assert.equal(out.observations[0].verdict, "deny");
    assert.equal(out.observations[0].mode, "observe");
  });

  it("enforce-mode deny blocks with a structured reason", () => {
    const out = evaluateGates(
      { type: "write", path: `${PLANS_DIR}/x.md`, proposedContent: "---\nstatus: completed\n---\n# p\n" },
      { policy: policyWith("enforce"), ctx: { plansDir: PLANS_DIR } },
    );
    assert.equal(out.decision, "deny");
    assert.match(out.reason, /gate plan-structure \(plan-structure\) denied:/);
    assert.match(out.reason, /derived status/);
  });

  it("unknown rule at evaluate time degrades to an observation (policy should have failed schema)", () => {
    const out = evaluateGates(legalAction(), {
      policy: { gates: [{ id: "g", match: "{{plansDir}}/**/*.md", rule: "no-such-rule", mode: "enforce" }] },
      ctx: { plansDir: PLANS_DIR },
    });
    assert.equal(out.decision, "allow");
    assert.match(out.observations[0].reason, /unknown-rule/);
  });

  it("a throwing rule fail-opens to an observation without blocking other gates", () => {
    const out = evaluateGates(
      { type: "write", path: `${PLANS_DIR}/x.md`, proposedContent: "not a plan\n\n- [ ] stray\n" },
      {
        policy: {
          gates: [
            { id: "boom", match: "{{plansDir}}/**/*.md", rule: "boom", mode: "enforce" },
            { id: "plan-structure", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode: "observe" },
          ],
        },
        ctx: { plansDir: PLANS_DIR },
      },
    );
    const boom = out.observations.find((o) => o.gateId === "boom");
    assert.ok(boom);
    assert.equal(boom.verdict, "observe");
    assert.match(boom.reason, /rule-error/);
    const ps = out.observations.find((o) => o.gateId === "plan-structure");
    assert.ok(ps, "other gates still evaluated");
  });
});

describe("seed rule plan-structure (01 §2/§5.2 structural face)", () => {
  const rule = (content, ctx) => getRule("plan-structure").fn(
    { type: "write", path: `${PLANS_DIR}/x.md`, proposedContent: content },
    null,
    ctx,
  );

  it("is registered with the structural face and a legal plan allows", () => {
    assert.ok(listRuleIds().includes("plan-structure"));
    const v = rule(LEGAL_PLAN, {});
    assert.equal(v.verdict, "allow");
  });

  it("denies block-scalar frontmatter", () => {
    const v = rule("---\nstatus: draft\nmission: m\nwork-item: M1-WI1\nhold: |\n  multi\n---\n# p\n");
    assert.equal(v.verdict, "deny");
    assert.match(v.reason, /block scalar|frontmatter/);
  });

  it("denies an unclosed frontmatter block", () => {
    const v = rule("---\nstatus: draft\nmission: m\nwork-item: M1-WI1\n# never closed");
    assert.equal(v.verdict, "deny");
    assert.match(v.reason, /never closed/);
  });

  it("denies out-of-domain column-0 checkboxes", () => {
    const v = rule(`${LEGAL_PLAN}\nfree prose section\n\n- [ ] stray checkbox outside the counting domain\n`);
    assert.equal(v.verdict, "deny");
    assert.match(v.reason, /out-of-domain-checkbox/);
  });

  it("denies malformed append-only section lines", () => {
    const v = rule(`${LEGAL_PLAN.replace("## Closure\n", "## Closure\n\n- dispatch bogus not-an-id to ses-1\n")}`);
    assert.equal(v.verdict, "deny");
    assert.match(v.reason, /dispatch line must be/);
  });

  it("denies frontmatter field violations (derived status, unknown key, bad hold pair)", () => {
    for (const fm of [
      "---\nstatus: completed\nmission: m\nwork-item: M1-WI1\n---\n# p\n",
      "---\nstatus: draft\nmission: m\nwork-item: M1-WI1\nbogus: 1\n---\n# p\n",
      "---\nstatus: draft\nmission: m\nwork-item: M1-WI1\nclaim: attempt-r-s-abc12345\n---\n# p\n",
    ]) {
      const v = rule(fm);
      assert.equal(v.verdict, "deny", fm);
      assert.match(v.reason, /plan-structure: proposed content is not a legal plan ledger/);
    }
  });

  it("legacy-format files are out of the rule's domain during the dual-read transition", () => {
    const v = rule("# Plan\n\n> Plan Status: active\n\n## Phase 1 — W\n\n- [x] done item\n");
    assert.equal(v.verdict, "allow");
    assert.match(v.reason, /outside plan-structure domain/);
  });

  it("agentNames injection: agent field must hit the policy list when provided", () => {
    const base = "---\nstatus: draft\nmission: m\nwork-item: M1-WI1\nagent: \"%s\"\n---\n# p\n";
    assert.equal(rule(base.replace("%s", "auditor"), { agentNames: ["drafter", "auditor"] }).verdict, "allow");
    const denied = rule(base.replace("%s", "phantom"), { agentNames: ["drafter", "auditor"] });
    assert.equal(denied.verdict, "deny");
    assert.match(denied.reason, /not defined in the autonomy policy agents section/);
    // no list injected → skip face (M1 behavior)
    assert.equal(rule(base.replace("%s", "anything"), {}).verdict, "allow");
  });
});

describe("baseHash CAS (02 §4.5 field semantics, M2 best-effort)", () => {
  const current = "current disk text";

  it("mismatch → stale-write observation, decision stays allow (Q4 routing deferred)", () => {
    const out = evaluateGates(
      legalAction({ baseHash: "b".repeat(64) }),
      { policy: policyWith("enforce"), currentFileState: { text: current }, ctx: { plansDir: PLANS_DIR } },
    );
    assert.equal(out.decision, "allow");
    assert.ok(out.notes.includes("stale-write"));
    const cas = out.observations.find((o) => o.gateId === "(cas)");
    assert.ok(cas);
    assert.equal(cas.verdict, "deny");
    assert.match(cas.reason, /stale-write/);
  });

  it("match → no stale note; absent currentFileState → cas-unverified", () => {
    const ok = evaluateGates(
      legalAction({ baseHash: sha256Text(current) }),
      { policy: policyWith("enforce"), currentFileState: { text: current }, ctx: { plansDir: PLANS_DIR } },
    );
    assert.equal(ok.decision, "allow");
    assert.ok(!ok.notes.includes("stale-write"));
    const unverified = evaluateGates(
      legalAction({ baseHash: sha256Text(current) }),
      { policy: policyWith("enforce"), ctx: { plansDir: PLANS_DIR } },
    );
    assert.ok(unverified.notes.includes("cas-unverified"));
    assert.equal(unverified.observations.find((o) => o.gateId === "(cas)"), undefined);
  });
});

describe("gate matching domains", () => {
  const action = legalAction();

  it("action: patterns match the action type only", () => {
    assert.equal(matchGate("action:terminal-claim", { ...action, type: "terminal-claim" }, {}), true);
    assert.equal(matchGate("action:terminal-claim", action, {}), false);
    assert.equal(matchGate("action:bogus", { ...action, type: "bogus" }, {}), false);
  });

  it("{{plansDir}}/{{roadmapPath}} globs resolve from ctx; unresolved never match", () => {
    assert.equal(matchGate("{{plansDir}}/**/*.md", action, { plansDir: PLANS_DIR }), true);
    assert.equal(matchGate("{{plansDir}}/*.md", action, { plansDir: PLANS_DIR }), true);
    // `*` never crosses a path separator — only `**` does
    assert.equal(matchGate("{{plansDir}}/*.md", { ...action, path: `${PLANS_DIR}/sub/x.md` }, { plansDir: PLANS_DIR }), false);
    assert.equal(matchGate("{{plansDir}}/**/*.md", { ...action, path: `${PLANS_DIR}/sub/x.md` }, { plansDir: PLANS_DIR }), true);
    assert.equal(matchGate("{{roadmapPath}}", { ...action, path: "/repo/docs/backlog/r.md" }, { roadmapPath: "/repo/docs/backlog/r.md" }), true);
    assert.equal(matchGate("{{plansDir}}/**/*.md", action, {}), false);
  });
});

describe("validatePlanFrontmatter agentNames channel (M1 module, additive face)", () => {
  it("injecting a list cross-checks agent; omitting keeps M1 behavior", () => {
    assert.equal(validatePlanFrontmatter({ status: "draft", mission: "m", "work-item": "W", agent: "auditor" }, { agentNames: ["auditor"] }).ok, true);
    const bad = validatePlanFrontmatter({ status: "draft", mission: "m", "work-item": "W", agent: "ghost" }, { agentNames: ["auditor"] });
    assert.equal(bad.ok, false);
    assert.match(bad.errors[0], /not defined in the autonomy policy agents section/);
    assert.equal(validatePlanFrontmatter({ status: "draft", mission: "m", "work-item": "W", agent: "ghost" }).ok, true);
  });
});
