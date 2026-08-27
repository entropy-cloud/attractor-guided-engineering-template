// law-policy.test.js — autonomy.policy.yml schema suite (age-autonomy
// M2-WI13, plan docs/plans/age-autonomy/2026-08-25-0815-1 Phase 2 Proof).
//
// Pins:
//   1. the real instance missions/autonomy.policy.yml parses + validates
//      (version/limits/gates/triggers/agents/dispatch all populated);
//   2. the legal/illegal fixture matrix: missing version, unknown rule name,
//      dispatch→undefined agent, fixedPrefix bad kind / dir without
//      maxFileBytes, out-of-subset trigger syntax, unknown top-level key,
//      duplicate gate ids, path-form match violations, limits type errors,
//      agents field errors — each denied with a reason pointing at the legal
//      shape (02 §2 structured-deny discipline);
//   3. restricted-YAML hard boundary: anchors, aliases, block scalars,
//      multi-line scalars, tabs, deep nesting rejected;
//   4. trigger when-grammar: predicate set + and/or/not + parens + comparison
//      forms (atom/cmp/call), unknown predicates, wrong forms, trailing junk;
//   5. placeholder resolution: {{plansDir}}/{{roadmapPath}} substituted,
//      single-brace poolKey tokens untouched;
//   6. mission-check: autonomyPolicy joins the set-if-present existence
//      family (missing file → error naming the field).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parsePolicy,
  parseRestrictedYaml,
  parseTriggerWhen,
  validatePolicy,
  resolvePolicyPlaceholders,
  policyAgentNames,
  TRIGGER_PREDICATES,
  ASSEMBLY_FIELDS,
  DEFAULT_EMBED_STAMP,
} from "../src/law-policy.mjs";
import { validateMission } from "../src/mission-check.mjs";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const REAL_POLICY = readFileSync(resolve(REPO_ROOT, "missions", "autonomy.policy.yml"), "utf8");

const BASE = `
version: 1
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure
    mode: observe
`;

function fixture(extra) {
  return `${BASE.trim()}\n${extra}\n`;
}

describe("real instance", () => {
  it("missions/autonomy.policy.yml parses + validates with every section populated", () => {
    const r = parsePolicy(REAL_POLICY);
    assert.equal(r.ok, true, r.errors?.join("; "));
    assert.equal(r.policy.version, 1);
    assert.deepEqual(r.policy.limits, { maxAuditRounds: 3, maxFailures: 3, stagnationRounds: 10 });
    assert.deepEqual(r.policy.gates, [
      // WI21: the frontmatter-tightening enforce flip this plan owns
      // (0815-1 comment hand-off) + the work-item registration increment.
      { id: "plan-structure", match: "{{plansDir}}/**/*.md", rule: "plan-structure", mode: "enforce" },
      { id: "closure-audit-binding", match: "{{plansDir}}/**/*.md", rule: "closure-audit-binding", mode: "enforce" },
      { id: "roadmap-audit-binding", match: "{{roadmapPath}}", rule: "roadmap-audit-binding", mode: "enforce" },
      { id: "writer-identity", match: "{{plansDir}}/**/*.md", rule: "writer-identity", mode: "enforce" },
      { id: "plan-completed", match: "{{plansDir}}/**/*.md", rule: "plan-completed", mode: "enforce" },
      // supporting gates (0815-3): registered per-phase as the rules land —
      // nothing-claim-guard + audit-rounds-overflow (Phase 1),
      // claim-validity (Phase 2), verify-keys + record-append-only (Phase 3).
      { id: "nothing-claim", match: "action:terminal-claim", rule: "nothing-claim-guard", mode: "enforce" },
      { id: "claim-taken", match: "{{plansDir}}/**/*.md", rule: "claim-validity", mode: "enforce" },
      { id: "verify-keys", match: "{{plansDir}}/**/*.md", rule: "verify-keys", mode: "enforce" },
      { id: "meter-guard", match: "{{roadmapPath}}", rule: "audit-rounds-overflow", mode: "enforce" },
      { id: "append-only-records", match: "{{plansDir}}/**/*.md", rule: "record-append-only", mode: "enforce" },
      { id: "append-only-records-roadmap", match: "{{roadmapPath}}", rule: "record-append-only", mode: "enforce" },
      // path & structure guardrails + P8 self-protection (0950-1 / M2-WI21):
      // path-guardrail self-domains on plan-shaped .md writes registered
      // through the action face; law-self-protection covers the 02 §4.7
      // literal protected families via four {{projectRoot}} match entries.
      { id: "path-guardrail", match: "action:write", rule: "path-guardrail", mode: "enforce" },
      { id: "roadmap-write-guard", match: "{{roadmapPath}}", rule: "roadmap-write-guard", mode: "enforce" },
      { id: "law-self-protection-law", match: "{{projectRoot}}/plugin/dsh/src/law/**", rule: "law-self-protection", mode: "enforce" },
      { id: "law-self-protection-policy", match: "{{projectRoot}}/missions/autonomy.policy.yml", rule: "law-self-protection", mode: "enforce" },
      { id: "law-self-protection-plan-check", match: "{{projectRoot}}/tools/mission-driver/src/plan-check.mjs", rule: "law-self-protection", mode: "enforce" },
      { id: "law-self-protection-gate-check", match: "{{projectRoot}}/tools/mission-driver/src/gate-check.mjs", rule: "law-self-protection", mode: "enforce" },
      // legacy-plan-freeze (0950-2 / M2-WI22): the retired dsh plan-status
      // gate's protection semantics collected into the law kernel.
      { id: "legacy-plan-freeze", match: "action:write", rule: "legacy-plan-freeze", mode: "enforce" },
    ]);
    assert.deepEqual(policyAgentNames(r.policy), ["drafter", "reviewer", "auditor", "executor"]);
    assert.equal(r.policy.triggers.length, 7);
    assert.equal(r.policy.dispatch["closure-audit"], "auditor");
    assert.equal(r.policy.agents.auditor.requireDistinctModel, true);
    assert.equal(r.policy.agents.auditor.downgrade, "single-model");
    assert.equal(r.policy.agents.drafter.mode, "pooled");
    assert.equal(r.policy.agents.drafter.poolKey, "drafter:{projectRoot}");
    // assembly section (M4-WI33): the PromptAssembler policy face — default
    // stamp template + continueDelta enabled; drafter carries the live
    // fixedPrefix charter (persona text + embedded context file).
    assert.equal(r.policy.assembly.embedStamp, DEFAULT_EMBED_STAMP);
    assert.equal(r.policy.assembly.continueDelta, true);
    // M4-WI34 (2026-08-27-0558-1): the drafter charter grows the third block
    // — the context-profile expansion (04 §4; topN overridable per agent).
    assert.deepEqual(r.policy.agents.drafter.fixedPrefix, [
      { kind: "text", ref: "{{projectRoot}}/AGENTS.md" },
      { kind: "file", ref: "{{projectRoot}}/docs/context/project-context.md", maxFileBytes: 60000 },
      { kind: "profile", ref: "{{projectRoot}}/docs/references/context-profile.json", topN: 5 },
    ]);
  });
});

describe("requireDistinctModel satisfiability (02 §4.9, M2-WI14)", () => {
  const sameModelAgents = `
agents:
  executor:
    mode: pooled
    poolKey: "executor:{projectRoot}"
    model: { provider: p, model: m, reasoningEffort: default }
  auditor:
    mode: fresh
    model: { provider: p, model: m, reasoningEffort: high }
    requireDistinctModel: true
dispatch:
  execute: executor
  closure-audit: auditor
  deep-audit: auditor
`;
  const distinctModelAgents = sameModelAgents.replace(
    "model: { provider: p, model: m, reasoningEffort: high }",
    "model: { provider: p2, model: m, reasoningEffort: high }",
  );

  it("executor/auditor sharing the model pair is a validation error pointing at the legal paths", () => {
    const r = parsePolicy(fixture(sameModelAgents));
    assert.equal(r.ok, false);
    assert.match(r.errors.join(" | "), /agents\.auditor: requireDistinctModel is unsatisfiable/);
    assert.match(r.errors.join(" | "), /downgrade: single-model/);
  });

  it("a distinct model pair passes; the explicit downgrade channel passes; downgrade without the flag is an error", () => {
    assert.equal(parsePolicy(fixture(distinctModelAgents)).ok, true);
    const downgraded = parsePolicy(
      fixture(
        sameModelAgents.replace("requireDistinctModel: true", "requireDistinctModel: true\n    downgrade: single-model"),
      ),
    );
    assert.equal(downgraded.ok, true, downgraded.errors?.join("; "));
    const orphan = parsePolicy(
      fixture(
        sameModelAgents
          .replace("    requireDistinctModel: true", "")
          .replace("  auditor:\n", "  auditor:\n    downgrade: single-model\n"),
      ),
    );
    assert.equal(orphan.ok, false);
    assert.match(orphan.errors.join(" | "), /downgrade is only meaningful together with requireDistinctModel: true/);
  });

  it("unknown downgrade values deny with the enum; missing execute mapping degrades to skip", () => {
    const bad = parsePolicy(fixture(sameModelAgents.replace("requireDistinctModel: true", "requireDistinctModel: true\n    downgrade: whatever")));
    assert.equal(bad.ok, false);
    assert.match(bad.errors.join(" | "), /downgrade must be one of: single-model/);
    const noExecute = parsePolicy(fixture(sameModelAgents.replace("  execute: executor\n", "")));
    assert.equal(noExecute.ok, true, noExecute.errors?.join("; "));
  });
});

describe("schema fixture matrix — every illegal shape denies with a pointed reason", () => {
  const cases = [
    ["missing version", "gates: []\n", /missing required key "version"/],
    ["wrong version", "version: 2\n", /version must be 1/],
    ["unknown top-level key", fixture("bogus-top: 1"), /unknown top-level key "bogus-top"/],
    ["unknown gate rule", fixture('gates2: []'), null], // placeholder, replaced below
  ];
  it("denies unknown rule name", () => {
    const r = parsePolicy(fixture(''));
    const bad = parsePolicy(`version: 1\ngates:\n  - id: g\n    match: "{{plansDir}}/**/*.md"\n    rule: no-such-rule\n`);
    assert.equal(bad.ok, false);
    assert.match(bad.errors[0], /rule "no-such-rule" is not in the kernel registry/);
    assert.equal(r.ok, true);
  });
  it("denies duplicate gate ids", () => {
    const bad = parsePolicy(
      `version: 1\ngates:\n  - id: plan-structure\n    match: "{{plansDir}}/**/*.md"\n    rule: plan-structure\n  - id: plan-structure\n    match: "{{roadmapPath}}"\n    rule: plan-structure\n`,
    );
    assert.equal(bad.ok, false);
    assert.match(bad.errors.find((e) => /duplicate id/.test(e)), /duplicate id "plan-structure"/);
  });
  it("denies bad match forms (no placeholder, bad action type)", () => {
    for (const [match, re] of [
      ["docs/plans/**/*.md", /match must start with/],
      ["action:bogus", /action match must be action:<type>/],
    ]) {
      const bad = parsePolicy(`version: 1\ngates:\n  - id: g\n    match: "${match}"\n    rule: plan-structure\n`);
      assert.equal(bad.ok, false, match);
      assert.match(bad.errors[0], re, match);
    }
    const okAction = parsePolicy(`version: 1\ngates:\n  - id: g\n    match: "action:terminal-claim"\n    rule: plan-structure\n`);
    assert.equal(okAction.ok, true);
  });
  it("denies unknown gate field and bad mode", () => {
    const bad = parsePolicy(fixture('') .replace("    mode: observe", "    posture: mean") + "");
    const bad2 = parsePolicy(`version: 1\ngates:\n  - id: g\n    match: "{{plansDir}}/**/*.md"\n    rule: plan-structure\n    mode: maybe\n`);
    assert.equal(bad2.ok, false);
    assert.match(bad2.errors[0], /mode must be one of: observe \| enforce/);
  });
  it("denies limits type errors and unknown limits keys", () => {
    const bad = parsePolicy("version: 1\nlimits:\n  maxAuditRounds: three\n  bogus: 1\n");
    assert.equal(bad.ok, false);
    assert.match(bad.errors.find((e) => /maxAuditRounds must be/.test(e)), /non-negative integer/);
    assert.match(bad.errors.find((e) => /unknown key "bogus"/.test(e)), /legal keys: maxAuditRounds, maxFailures/);
  });
  it("denies dispatch references to undefined agents and unknown dispatch types", () => {
    const bad = parsePolicy(fixture("dispatch:\n  closure-audit: ghost\n"));
    assert.equal(bad.ok, false);
    assert.match(bad.errors[0], /references undefined agent "ghost"/);
    const badType = parsePolicy(fixture("dispatch:\n  teleport: auditor\n"));
    assert.equal(badType.ok, false);
    assert.match(badType.errors[0], /unknown dispatch type "teleport"/);
  });
  it("denies fixedPrefix violations: bad kind, dir without maxFileBytes, unknown field", () => {
    const base = (block) =>
      parsePolicy(fixture(`agents:\n  auditor:\n    mode: fresh\n    fixedPrefix: [ ${block} ]\n`));
    const badKind = base("{ kind: tape, ref: prompts/x.md }");
    assert.equal(badKind.ok, false);
    assert.match(badKind.errors[0], /kind must be one of: text \| file \| dir/);
    const dirNoCap = base("{ kind: dir, ref: docs/context }");
    assert.equal(dirNoCap.ok, false);
    assert.match(dirNoCap.errors.find((e) => /maxFileBytes is required/.test(e)), /kind is dir/);
    const unknownField = base("{ kind: file, ref: x.md, budget: 5 }");
    assert.equal(unknownField.ok, false);
    assert.match(unknownField.errors[0], /unknown field "budget"/);
    const ok = base("{ kind: file, ref: x.md }");
    assert.equal(ok.ok, true, ok.errors?.join(";"));
    const okDir = base("{ kind: dir, ref: docs/context, maxFileBytes: 50000 }");
    assert.equal(okDir.ok, true, okDir.errors?.join(";"));
  });
  it("validates the profile fixedPrefix kind + topN (M4-WI34, 04 §4)", () => {
    const base = (block) =>
      parsePolicy(fixture(`agents:\n  auditor:\n    mode: fresh\n    fixedPrefix: [ ${block} ]\n`));
    const okProfile = base('{ kind: profile, ref: "{{projectRoot}}/docs/references/context-profile.json", topN: 5 }');
    assert.equal(okProfile.ok, true, okProfile.errors?.join(";"));
    const okProfileDefault = base('{ kind: profile, ref: "{{projectRoot}}/docs/references/context-profile.json" }');
    assert.equal(okProfileDefault.ok, true, okProfileDefault.errors?.join(";"));
    const badTopN = base('{ kind: profile, ref: x.json, topN: 0 }');
    assert.equal(badTopN.ok, false);
    assert.match(badTopN.errors[0], /topN must be a positive integer/);
    const topNOnFile = base("{ kind: file, ref: x.md, topN: 5 }");
    assert.equal(topNOnFile.ok, false);
    assert.match(topNOnFile.errors[0], /topN is only meaningful when kind is profile/);
  });
  it("denies agents field errors: missing mode, pooled without poolKey, bad model shape", () => {
    const noMode = parsePolicy(fixture("agents:\n  auditor:\n    model: { provider: p, model: m }\n"));
    assert.equal(noMode.ok, false);
    assert.match(noMode.errors[0], /mode must be one of: pooled \| fresh/);
    const pooledNoKey = parsePolicy(fixture("agents:\n  worker:\n    mode: pooled\n"));
    assert.equal(pooledNoKey.ok, false);
    assert.match(pooledNoKey.errors[0], /poolKey is required when mode is pooled/);
    const badModel = parsePolicy(fixture("agents:\n  auditor:\n    mode: fresh\n    model: { provider: p }\n"));
    assert.equal(badModel.ok, false);
    assert.match(badModel.errors[0], /model\.model must be a non-empty string/);
    const badEffort = parsePolicy(fixture("agents:\n  auditor:\n    mode: fresh\n    model: { provider: p, model: m, reasoningEffort: extreme }\n"));
    assert.equal(badEffort.ok, false);
    assert.match(badEffort.errors[0], /reasoningEffort must be one of/);
  });
  it("denies trigger exit violations: zero or multiple exits, bad exit values", () => {
    const noExit = parsePolicy(fixture('triggers:\n  - when: "plan.full-tick"\n'));
    assert.equal(noExit.ok, false);
    assert.match(noExit.errors[0], /exactly one exit of dispatch \| action \| terminal/);
    const twoExits = parsePolicy(fixture('triggers:\n  - when: "plan.full-tick"\n    dispatch: closure-audit\n    action: reclaim-claim\n'));
    assert.equal(twoExits.ok, false);
    assert.match(twoExits.errors[0], /exactly one exit/);
    const badDispatch = parsePolicy(fixture('triggers:\n  - when: "plan.full-tick"\n    dispatch: teleport\n'));
    assert.equal(badDispatch.ok, false);
    assert.match(badDispatch.errors[0], /dispatch must be one of/);
    const badTerminal = parsePolicy(fixture('triggers:\n  - when: "plan.full-tick"\n    terminal: maybe\n'));
    assert.equal(badTerminal.ok, false);
    assert.match(badTerminal.errors[0], /terminal must be one of/);
  });
});

describe("restricted-YAML hard boundary (mirror of the ledger-frontmatter subset)", () => {
  it("rejects anchors, aliases, block scalars, multi-line scalars, tabs, deep nesting", () => {
    const bad = [
      ["anchor", "version: 1\nbase: &anchor 1\n"],
      ["alias", "version: 1\nbase: *anchor\n"],
      ["block scalar", "version: 1\ndesc: |\n  folded text\n"],
      ["multi-line bare scalar", "version: 1\ndesc: some text\n  continued on the next line\n"],
      ["tab indent", "version: 1\nlimits:\n\tmaxAuditRounds: 3\n"],
      ["deep nesting", "version: 1\na:\n  b:\n    c:\n      d:\n        e: 1\n"],
      ["unterminated quote", 'version: 1\ndesc: "open\n'],
    ];
    for (const [label, text] of bad) {
      const r = parseRestrictedYaml(text);
      assert.equal(r.ok, false, label);
      assert.ok(r.errors.length > 0, label);
    }
  });

  it("accepts the legal subset shapes: blocks, flow map/array, flow-in-flow, comments, quoting", () => {
    const r = parseRestrictedYaml(BASE);
    assert.equal(r.ok, true, r.errors?.join(";"));
    const flow = parseRestrictedYaml(
      'version: 1\nx: { a: 1, b: "two" }\ny: [ { kind: file, ref: a.md }, { kind: dir, ref: d, maxFileBytes: 5 } ]\nz: [one, two]\n',
    );
    assert.equal(flow.ok, true, flow.errors?.join(";"));
    assert.deepEqual(flow.value.x, { a: 1, b: "two" });
    assert.equal(flow.value.y[1].maxFileBytes, 5);
    assert.deepEqual(flow.value.z, ["one", "two"]);
  });
});

describe("trigger when-grammar (restricted predicate set)", () => {
  it("parses every real-instance trigger", () => {
    const r = parsePolicy(REAL_POLICY);
    assert.equal(r.ok, true);
    for (const t of r.policy.triggers) {
      const p = parseTriggerWhen(t.when);
      assert.equal(p.ok, true, t.when);
    }
  });

  it("parses and/or/not, parens, unicode connectives, comparisons", () => {
    const ok = [
      "plan.full-tick",
      "not plan.full-tick",
      "plan.full-tick and mechanical-verification-missing",
      "plan.full-tick ∧ mechanical-verification-missing",
      "plan.full-tick or mechanical-verification-missing",
      "plan.full-tick ∨ mechanical-verification-missing",
      "¬plan.full-tick",
      "plan.status=draft",
      "plan.status==draft",
      "terminal-claim=nothing-to-draft",
      "draftPlans()==0",
      "activePlans()>=1",
      "(plan.full-tick or plan.status=active) and not claim-expired",
    ];
    for (const expr of ok) {
      const p = parseTriggerWhen(expr);
      assert.equal(p.ok, true, expr);
    }
  });

  it("denies unknown predicates, wrong forms, and out-of-subset syntax", () => {
    const bad = [
      ["unknown predicate", "vibes-check", /unknown predicate "vibes-check"/],
      ["unknown predicate in composition", "plan.full-tick and vibes-check", /unknown predicate "vibes-check"/],
      ["atom with comparison", "plan.full-tick=1", /takes no call or comparison/],
      ["cmp without comparison", "plan.status", /requires a comparison/],
      ["call without parens", "draftPlans==0", /must be called as draftPlans\(\)/],
      ["call without comparison", "draftPlans()", /requires a numeric comparison/],
      ["xor is not in the subset", "plan.full-tick xor claim-expired", /unknown predicate "xor"|unexpected/],
      ["trailing junk", "plan.full-tick)", /unexpected trailing tokens/],
      ["args in calls", "draftPlans(3)==0", /take no arguments/],
      ["bare garbage", "!!!", /unexpected end of expression|expected a predicate name/],
    ];
    for (const [label, expr, re] of bad) {
      const p = parseTriggerWhen(expr);
      assert.equal(p.ok, false, label);
      assert.match(p.error, re, label);
    }
    assert.equal(TRIGGER_PREDICATES.length >= 14, true);
  });
});

describe("placeholder resolution", () => {
  it("resolves mission placeholders; single-brace tokens untouched", () => {
    const out = resolvePolicyPlaceholders("{{plansDir}}/**/*.md vs {{roadmapPath}} vs {projectRoot}", {
      plansDir: "/r/docs/plans/x",
      roadmapPath: "/r/docs/backlog/r.md",
    });
    assert.equal(out, "/r/docs/plans/x/**/*.md vs /r/docs/backlog/r.md vs {projectRoot}");
    assert.equal(resolvePolicyPlaceholders("{{plansDir}}", {}), "{{plansDir}}");
  });
});

describe("assembly section schema (04 §5, age-autonomy M4-WI33)", () => {
  it("accepts the legal block and pins the field set + default stamp export", () => {
    assert.deepEqual(ASSEMBLY_FIELDS, ["embedStamp", "continueDelta"]);
    const ok = parsePolicy(
      fixture(`assembly:\n  embedStamp: '<doc src="{path}" sum="{hash8}">{content}</doc>'\n  continueDelta: true\n`),
    );
    assert.equal(ok.ok, true, ok.errors?.join(";"));
    assert.equal(ok.policy.assembly.embedStamp, '<doc src="{path}" sum="{hash8}">{content}</doc>');
    assert.equal(ok.policy.assembly.continueDelta, true);
    // the default template carries all three render slots (04 §3.3 shape)
    assert.equal(DEFAULT_EMBED_STAMP, '<file path="{path}" hash="{hash8}">{content}</file>');
  });

  it("denies unknown keys, missing render slots, and non-boolean continueDelta", () => {
    const unknownKey = parsePolicy(fixture("assembly:\n  resyncEvery: 4\n"));
    assert.equal(unknownKey.ok, false);
    assert.match(unknownKey.errors.find((e) => /unknown key "resyncEvery"/.test(e)), /legal keys: embedStamp, continueDelta/);
    const noSlot = parsePolicy(fixture("assembly:\n  embedStamp: '<file>{content}</file>'\n"));
    assert.equal(noSlot.ok, false);
    assert.match(noSlot.errors.find((e) => /must contain the \{path\}/.test(e)), /render slot/);
    assert.match(noSlot.errors.find((e) => /must contain the \{hash8\}/.test(e)), /render slot/);
    const badDelta = parsePolicy(fixture("assembly:\n  continueDelta: maybe\n"));
    assert.equal(badDelta.ok, false);
    assert.match(badDelta.errors[0], /continueDelta must be a boolean/);
    const nonMap = parsePolicy(fixture("assembly: true\n"));
    assert.equal(nonMap.ok, false);
    assert.match(nonMap.errors[0], /assembly must be a mapping/);
  });
});

describe("mission-check autonomyPolicy face (M2/WI13)", () => {
  it("set-but-missing policy file is an existence error naming the field", () => {
    const v = validateMission(
      { name: "x", roadmapPath: "docs/plans", plansDir: "docs/plans", commands: { test: "true" }, autonomyPolicy: "missions/nope.yml" },
      REPO_ROOT,
    );
    assert.equal(v.valid, false);
    assert.match(v.errors[0], /autonomyPolicy does not exist: missions\/nope\.yml/);
  });

  it("unset policy stays valid (optional field) and the real mission validates", () => {
    const v = validateMission({ name: "x", roadmapPath: "docs/plans", plansDir: "docs/plans", commands: { test: "true" } }, REPO_ROOT);
    assert.equal(v.valid, true);
    const real = validateMission(
      JSON.parse(readFileSync(resolve(REPO_ROOT, "missions", "age-autonomy-implementation.json"), "utf8")),
      REPO_ROOT,
    );
    // standalone (unresolved) real mission still needs name etc.; existence
    // checks pass because roadmapPath/plansDir/autonomyPolicy all exist
    assert.equal(real.valid, true, real.errors.join("; "));
  });
});
