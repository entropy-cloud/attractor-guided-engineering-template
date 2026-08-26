import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMissionDriverFlow, TOOL_ROOT } from "../src/flow-loader.js";

// M2-WI22 (plan docs/plans/age-autonomy/2026-08-25-0950-2, Phase 2): the
// legacy external-audit channel is RETIRED. This suite replaces the old
// `_scanOpenAuditsList` status-filtering tests (mdc-1 R1) and the WI4 Phase 5
// audit-type-filter tests — the tested functions are deleted, so the
// assertions pin the retirement itself: the channel is gone from engine src
// and flow configs, the orphaned prompt is gone, and the simplified
// deep-audit-loop keeps a fully-resolved topology (loadFlowFile does no
// step-reference validation — a dangling goto would load green and only blow
// up at runtime with `unknown_step`).

const REPO_SRC = dirname(fileURLToPath(import.meta.url)).replace(/[/\\]test$/, "");
const FLOW_PATH = join(TOOL_ROOT, "flows", "deep-audit-loop.json");

function deepAuditLoopJson() {
  return JSON.parse(readFileSync(FLOW_PATH, "utf8"));
}

// Walk every goto/done/otherwise/onError/onUnknown/onMaxRetries target of a
// flow (including nested subflow steps) and require it to hit an existing
// step node or a terminal status — the guard `loadFlowFile` does not provide.
function collectDanglingRefs(flow) {
  const stepNames = new Set(Object.keys(flow.steps || {}));
  const dangling = [];
  const TERMINAL = new Set(["completed", "failed", "cancelled"]);

  function checkRef(from, key, ref) {
    if (!ref || typeof ref !== "object") return;
    if ("done" in ref) {
      if (!TERMINAL.has(ref.done)) dangling.push(`${from}.${key} → done:${ref.done} (non-terminal)`);
      return;
    }
    if ("goto" in ref) {
      if (!stepNames.has(ref.goto)) dangling.push(`${from}.${key} → goto:${ref.goto} (no such step)`);
      return;
    }
    if ("retry" in ref) {
      if (!stepNames.has(ref.retry)) dangling.push(`${from}.${key} → retry:${ref.retry} (no such step)`);
    }
  }

  for (const [name, step] of Object.entries(flow.steps || {})) {
    for (const [marker, ref] of Object.entries(step.transitions || {})) {
      checkRef(name, `transitions[${marker}]`, ref);
    }
    checkRef(name, "otherwise", step.otherwise);
    checkRef(name, "onError", step.onError);
    checkRef(name, "onUnknown", step.onUnknown);
    checkRef(name, "onMaxRetries", step.onMaxRetries);
    if (step.steps) {
      for (const d of collectDanglingRefs({ ...flow, steps: step.steps })) dangling.push(d);
    }
  }
  return dangling;
}

describe("M2-WI22 — legacy open-audit channel retired (guard suite)", () => {
  it("flow-loader no longer exports or implements the channel", async () => {
    const mod = await import("../src/flow-loader.js");
    for (const name of ["_scanOpenAuditsList", "_isMissionLevelAudit"]) {
      assert.equal(mod[name], undefined, `${name} must be deleted from flow-loader exports`);
    }
    const src = readFileSync(join(REPO_SRC, "src", "flow-loader.js"), "utf8");
    assert.ok(!src.includes("AUDIT_STATUS_RE"), "AUDIT_STATUS_RE must be deleted from flow-loader.js");
    assert.ok(!src.includes("_scanOpenAuditsList"), "_scanOpenAuditsList must be deleted from flow-loader.js");
    assert.ok(!src.includes("_isMissionLevelAudit"), "_isMissionLevelAudit must be deleted from flow-loader.js");
    assert.ok(!src.includes("openAudits"), "the openAudits expression key must be deleted from flow-loader.js");
    // The expression registry no longer carries the key (engine.js keeps its
    // optional-chained consumers by design — protected area, zero engine
    // diff; they degrade to [] with the key gone).
    const funcs = await import("../src/flow-loader.js").then((m) =>
      m.createExpressionFunctions({ projectRoot: REPO_SRC, mission: {} }),
    );
    assert.equal(funcs.openAudits, undefined, "createExpressionFunctions must not register openAudits");
  });

  it("deep-audit-loop.json: nodes deleted, no openAudits references, prompt set intact", () => {
    const flow = deepAuditLoopJson();
    for (const name of ["CHECK_OPEN_AUDITS", "SCAN_NEW_RESULTS"]) {
      assert.ok(!(flow.steps || {}).hasOwnProperty(name), `${name} step must be deleted`);
    }
    assert.equal(flow.entry, "MULTI_AUDIT", "entry rewires directly to MULTI_AUDIT");
    const raw = readFileSync(FLOW_PATH, "utf8");
    assert.ok(!raw.includes("openAudits"), "flow JSON must not reference the retired openAudits() expression");
    // prompt files referenced by the surviving steps all exist
    for (const step of Object.values(flow.steps)) {
      if (step.promptPath) {
        assert.ok(existsSync(join(TOOL_ROOT, step.promptPath)), `${step.promptPath} must exist`);
      }
    }
  });

  it("prompts/draft-from-audit.md deleted (no flow references it; prompt-check only lints unreferenced files)", () => {
    assert.ok(!existsSync(join(TOOL_ROOT, "prompts", "draft-from-audit.md")),
      "the orphaned draft-from-audit.md must be deleted with the two step nodes that loaded it");
  });

  it("deep-audit-loop topology guard: every goto/retry/done/otherwise/onError target resolves (no dangling refs — loadFlowFile does not validate)", () => {
    const flow = deepAuditLoopJson();
    // entry key included in the walk (review iteration-3 non-blocker, adopted)
    assert.ok(flow.steps.hasOwnProperty(flow.entry), `entry ${flow.entry} must be an existing step`);
    const dangling = collectDanglingRefs(flow);
    assert.deepEqual(dangling, [], "deep-audit-loop must have zero dangling step references");
    // The retirement's specific rewiring: OPEN_AUDIT terminates directly
    // (three faces — otherwise / transitions / onError — not just two; a
    // missed `otherwise` would leave a dangling goto to the deleted node).
    const open = flow.steps.OPEN_AUDIT;
    assert.deepEqual(open.otherwise, { done: "completed" }, "OPEN_AUDIT.otherwise → done:completed");
    assert.deepEqual(open.transitions.clean, { done: "completed" }, "OPEN_AUDIT.transitions.clean → done:completed");
    assert.deepEqual(open.transitions.issues, { done: "completed" }, "OPEN_AUDIT.transitions.issues → done:completed");
    assert.deepEqual(open.onError, { done: "completed" }, "OPEN_AUDIT.onError → done:completed");
  });

  it("the real mission-driver flow still loads and routes DEEP_AUDIT to the simplified subflow", () => {
    const flow = createMissionDriverFlow({ flowName: "mission-driver" });
    assert.equal(flow.steps.DEEP_AUDIT.flow, "deep-audit-loop",
      "mission-driver.json still references the deep-audit-loop subflow");
    const dangling = collectDanglingRefs(flow);
    assert.deepEqual(dangling, [], "mission-driver.json topology must stay fully resolved");
  });

  it("docs/audits corpus: no open `> Audit Status:` records remain (the retirement precondition stays provable)", () => {
    // Live recount guard — the 2026-08-25 baseline counted 6 header lines:
    // 1 open (mechanically closed by this plan) + 5 planned. `planned` lines
    // are watch-only residuals (plan §Deferred But Adjudicated) and stay.
    const auditsRoot = join(REPO_SRC, "..", "..", "docs", "audits");
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? walk(p) : (e.name.endsWith(".md") ? [p] : []);
    });
    let files;
    try {
      files = walk(auditsRoot);
    } catch {
      files = [];
    }
    const open = [];
    for (const f of files) {
      const m = readFileSync(f, "utf8").match(/^>\s*\*{0,2}Audit\s+Status\*{0,2}:\s*\*{0,2}(.+?)\*{0,2}\s*$/m);
      if (m && m[1].trim().toLowerCase() === "open") open.push(f);
    }
    assert.deepEqual(open, [], "no docs/audits record may sit at `> Audit Status: open` after the channel retirement");
  });
});
