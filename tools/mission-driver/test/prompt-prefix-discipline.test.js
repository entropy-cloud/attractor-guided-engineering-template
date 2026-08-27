import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTemplateVars } from "../src/expression.mjs";

// M4-WI35 (plan 2026-08-27-0558-2): pin the engine prompt prefix discipline
// (04-efficiency §6 as-built). Rendering goes through the LIVE substitution
// path (expression.mjs resolveTemplateVars — the same function _buildPrompt
// uses), not a test-local regex, so a substitution change that breaks prefix
// stability fails here.
//
// Audit receipt 2026-08-27 (all 11 templates): every {{var}} is a small
// path/command/name reference EXCEPT {{runSkeleton}} in run-postmortem.md —
// the single large volatile payload. It sits at :28, AFTER the fixed 27-line
// ground-rules preamble, so no template front-loads a large volatile payload
// ahead of its fixed instruction header → zero reorders needed.

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "prompts");

// Three classes for every {{var}} usable in prompts/*.md:
//   PAYLOAD  — large volatile payloads (multi-KB embedded content). Must sit
//              after the template's fixed instruction preamble.
//   VOLATILE — small references whose value changes between renders (a plan
//              path, a PASS/FAIL word, a one-line joined diagnostic, a run
//              dir). Bounded size, allowed anywhere per the as-built audit.
//   STABLE   — paths / commands / names, constant across a mission's renders
//              (incl. setup-wizard values: each wizard template renders once
//              per mission creation).
const PAYLOAD_VARS = new Set(["runSkeleton"]);
const VOLATILE_VARS = new Set([
  "PLAN_FILE",
  "forEachItem",
  "SCRIPT_CHECK_RESULT",
  "SCRIPT_CHECK_DETAILS",
  "targetRunDir",
]);
const STABLE_VARS = new Set([
  "missionName", "buildCmd", "typecheckCmd", "testCmd", "lintCmd", "plansDir",
  "roadmapPath", "planGuide", "moduleDir", "contextDir", "moduleContextFile",
  "checkCmd", "flowHint", "targetFile", "backlogDir", "briefPath",
  "missionsDir", "multiAuditPrompt", "openAuditPrompt", "auditsDir",
  "postmortemDir", "selfMemoryDir", "moduleName", "moduleMemoryDir",
]);

const VAR_RE = /\{\{(\w+)\}\}/g;

function templateFiles() {
  return readdirSync(PROMPTS_DIR).filter((f) => f.endsWith(".md")).sort();
}

function occurrencesOf(tpl) {
  return [...tpl.matchAll(VAR_RE)].map((m) => ({ name: m[1], offset: m.index }));
}

function isVolatile(name) {
  return PAYLOAD_VARS.has(name) || VOLATILE_VARS.has(name);
}

function lcpLength(a, b) {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++;
  return i;
}

describe("prompt prefix discipline (M4-WI35, 04 §6 as-built)", () => {
  it("classifies every {{var}} in every template (registry drift gate)", () => {
    for (const file of templateFiles()) {
      const tpl = readFileSync(join(PROMPTS_DIR, file), "utf8");
      for (const occ of occurrencesOf(tpl)) {
        assert.ok(
          isVolatile(occ.name) || STABLE_VARS.has(occ.name),
          `${file}: {{${occ.name}}} is unclassified — re-audit the template (04 §6 prefix discipline) and add it to PAYLOAD/VOLATILE/STABLE in test/prompt-prefix-discipline.test.js`
        );
      }
    }
  });

  it("registry has no dead entries", () => {
    const used = new Set();
    for (const file of templateFiles()) {
      for (const occ of occurrencesOf(readFileSync(join(PROMPTS_DIR, file), "utf8"))) {
        used.add(occ.name);
      }
    }
    for (const name of [...PAYLOAD_VARS, ...VOLATILE_VARS, ...STABLE_VARS]) {
      assert.ok(used.has(name), `registry entry {{${name}}} matches no template variable`);
    }
  });

  it("payload vars: only run-postmortem.md carries one; the rest have zero volatile payload injection", () => {
    for (const file of templateFiles()) {
      const tpl = readFileSync(join(PROMPTS_DIR, file), "utf8");
      const payloads = occurrencesOf(tpl).filter((o) => PAYLOAD_VARS.has(o.name));
      if (file === "run-postmortem.md") {
        assert.ok(payloads.length > 0, "run-postmortem.md is the audited payload-bearing template");
      } else {
        assert.equal(payloads.length, 0, `${file}: audit 2026-08-27 found zero payload vars — re-audit before adding one`);
      }
    }
  });

  for (const file of templateFiles()) {
    it(`${file}: two renders with volatile vars taking different values share the fixed prefix bytes`, () => {
      const tpl = readFileSync(join(PROMPTS_DIR, file), "utf8");
      const occs = occurrencesOf(tpl);
      const varsA = {};
      const varsB = {};
      for (const occ of occs) {
        if (isVolatile(occ.name)) {
          varsA[occ.name] = `A-${occ.name}-value`;
          varsB[occ.name] = `B-${occ.name}-value`;
        } else {
          varsA[occ.name] = varsB[occ.name] = `«S-${occ.name}»`;
        }
      }
      const a = resolveTemplateVars(tpl, varsA);
      const b = resolveTemplateVars(tpl, varsB);
      const firstVolatile = occs.find((o) => isVolatile(o.name));
      const expected = firstVolatile ? firstVolatile.offset : tpl.length;
      assert.equal(
        lcpLength(a, b),
        expected,
        `${file}: shared fixed prefix must cover every byte before the first volatile var (got divergence earlier)`
      );
    });
  }

  it("run-postmortem.md: the payload sits after the fixed ground-rules preamble", () => {
    const tpl = readFileSync(join(PROMPTS_DIR, "run-postmortem.md"), "utf8");
    const payload = occurrencesOf(tpl).find((o) => PAYLOAD_VARS.has(o.name));
    assert.ok(payload, "{{runSkeleton}} present");
    const preambleEnd = tpl.indexOf("</ground_rules>") + "</ground_rules>".length;
    assert.ok(
      payload.offset > preambleEnd,
      "the fixed ground-rules instruction preamble must precede the runSkeleton payload injection"
    );
    const a = resolveTemplateVars(tpl, { runSkeleton: "SKELETON-A" });
    const b = resolveTemplateVars(tpl, { runSkeleton: "SKELETON-B" });
    assert.ok(
      lcpLength(a, b) >= preambleEnd,
      "two renders with different payloads share at least the full ground-rules preamble byte-for-byte"
    );
  });
});
