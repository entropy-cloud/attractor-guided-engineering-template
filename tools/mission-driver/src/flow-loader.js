import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPlan, missionDefaultVerifyKeys } from "./plan-check.mjs";
import { planLedgerState, normalizeLegacyStatus } from "./ledger-dualread.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = resolve(__dirname, "..");

// Plan status resolution is dual-read via the shared ledger library
// (ledger-dualread.mjs — frontmatter first, legacy `> Plan Status:` fallback,
// env breaker MISSION_DRIVER_LEDGER). No local status regex lives here anymore
// (age-autonomy M1-WI7, plan 0635-3 Phase 3).
// Canonical plan statuses: draft (initial) → active (post-review, ready to exec).
// Legacy synonyms tolerated for backward compatibility with older plans.
const ACTIVE_STATUSES = [
  "active",
  "planned",
  "in progress",
  "in-progress",
  "inprogress",
  "partially completed",
  "partially-completed",
  "started",
  "executing",
  "in flight",
].map(normalizeLegacyStatus);
const DRAFT_STATUSES = [
  "draft",
  "drafted",
  "proposed",
  "not started",
  "backlog",
  "in draft",
  "in-draft",
].map(normalizeLegacyStatus);
// RETIRED (age-autonomy M2-WI22, plan docs/plans/age-autonomy/2026-08-25-0950-2):
// the legacy external-audit channel — the `> Audit Status:` header scan, its
// mission-level classifier, and the audit-listing expression-registry key —
// is deleted from this module. Open audit state lives in roadmap `## Deep
// Audit Record` dispatch/accepted pairing (M1-WI8 inline lifecycle);
// `docs/audits/` files are prose-only history. The engine's optional-chained
// consumers of the removed key degrade to [] (no open audits) by design.

// ── Pure scanning helpers (return arrays, no side effects) ──

/**
 * Recursively collect all .md files under `dir` (depth-first).
 * Needed because plans/audits are organized into per-author subdirectories
 * (e.g. docs/plans/huang-jiang/*.md) and the old readdirSync-only scan
 * silently missed every nested file.
 */
function _walkMarkdown(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      out.push(..._walkMarkdown(resolve(dir, e.name)));
    } else if (e.isFile() && e.name.endsWith(".md")) {
      out.push(resolve(dir, e.name));
    }
  }
  return out;
}

function _scanPlansByStatus(plansDir, statuses, defaultVerifyKeys) {
  const results = [];
  if (!existsSync(plansDir)) return results;
  const files = _walkMarkdown(plansDir)
    .filter(f => !basename(f).startsWith("00-"))
    .sort();
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    // M2-WI41: defaultVerifyKeys injection (01 §4.1 "verify missing → mission
    // default") — without it a plan omitting `verify` can never derive
    // completed even with full receipts, deadlocking it in activePlans.
    const state = planLedgerState(content, defaultVerifyKeys ? { defaultVerifyKeys } : {});
    if (state.format === "none") continue;
    // M2-WI42: field-set violations must not stay silent on the engine scan
    // face (deep-audit R1 "silent channel"). Kill silence, not the queue:
    // membership stays status-based (a field typo must not starve a plan out
    // of the execution queue — the mirror image of the silent-exit disease
    // WI42 exists to cure), but every scan warns once per offending file.
    // console.warn is the scan face's only log channel today (no engine logger
    // reaches these expression functions) and is console-injectable for tests.
    if (state.format === "frontmatter" && Array.isArray(state.fieldErrors) && state.fieldErrors.length > 0) {
      console.warn(
        `[flow-loader] plan field validation failed: ${relative(process.cwd(), f)} — ${state.fieldErrors.join("; ")}`,
      );
    }
    // normalized: frontmatter `status` (or derived "completed") / legacy line
    // value — derived-completed and writable-terminal plans match neither the
    // active nor the draft list, i.e. they are closed (never re-fed to EXECUTE).
    if (statuses.includes(state.normalized)) {
      results.push(f);
    }
  }
  return results;
}

// ── Expression functions (pre-registered, callable from flow expressions) ──

export function createExpressionFunctions(config) {
  const projectRoot = config.projectRoot;
  const mission = config.mission || {};
  // M2-WI41: single shared mission-default verify key set for the whole
  // predicate family (plan-check.mjs missionDefaultVerifyKeys — the closure
  // script check injects the same set; one implementation, no divergence).
  const defaultVerifyKeys = missionDefaultVerifyKeys(mission);

  return {
    activePlans: () => _scanPlansByStatus(
      resolve(projectRoot, mission.plansDir), ACTIVE_STATUSES, defaultVerifyKeys
    ),
    draftPlans: () => _scanPlansByStatus(
      resolve(projectRoot, mission.plansDir), DRAFT_STATUSES, defaultVerifyKeys
    ),
    // (M2-WI22) The legacy audit-listing key is removed here — roadmap Deep
    // Audit Record pairing owns audit-round state; guard suite in
    // test/audit-convergence.test.js.
    // testTargets() reads target-specs.json (written by load-targets step)
    // so a flow can `forEach: "testTargets()"`. Tolerant: missing/unparseable → [].
    testTargets: () => _readTargetSpecs(config.runDir),
  };
}

/**
 * Read `_tmp/<runDir>/target-specs.json` (written by load-targets) into an array
 * of unified-target spec objects. Returns [] when runDir is unset, the file is
 * absent, or parsing fails — never throws.
 * @param {string} runDir absolute engine run directory
 * @returns {object[]}
 */
function _readTargetSpecs(runDir) {
  if (!runDir) return [];
  const specsPath = resolve(runDir, "target-specs.json");
  if (!existsSync(specsPath)) return [];
  try {
    const data = JSON.parse(readFileSync(specsPath, "utf8"));
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.targets)) return data.targets;
    return [];
  } catch {
    return [];
  }
}

// ── Script-step functions ──

async function closureScriptCheck(delegates, flowVars) {
  const planFile =
    flowVars?.get?.("PLAN_FILE") || delegates?.vars?.PLAN_FILE;
  if (!planFile) {
    return { marker: "fail", text: "ERROR: no PLAN_FILE in flowVars — cannot verify specific plan" };
  }

  try {
    const projectRoot = delegates?.config?.projectRoot;
    const absPath = existsSync(planFile)
      ? planFile
      : (projectRoot ? resolve(projectRoot, planFile) : planFile);

    // M2-WI41: inject the mission default verify keys (01 §4.1) so the
    // routing judgment below sees the same key set the scan predicates use.
    const defaultVerifyKeys = missionDefaultVerifyKeys(delegates?.config?.mission);
    const result = inspectPlan(absPath, {
      strict: false,
      projectRoot,
      ...(defaultVerifyKeys ? { defaultVerifyKeys } : {}),
    });

    const coreIssues = [];
    if (result.totalUnchecked > 0) {
      coreIssues.push(
        `${result.totalUnchecked} unchecked items remain after EXECUTE (every [ ] must become [x] before closure)`
      );
    }
    if (result.planStatus === "completed" && result.details.includes("missing closure evidence")) {
      coreIssues.push("completed plan missing Closure evidence");
    }
    // M2-WI41 receipt-aware routing (bug 2026-08-25-ledger-plan-closure-deadlock
    // D2): a frontmatter-format plan whose counting domain is fully ticked
    // must satisfy the 01 §5.2 completion formula before it may pass to
    // BUILD_VERIFY. Anything missing (## Closure dispatch/accepted receipt,
    // ## Verification pass line) fails here so
    // the flow routes to CLOSURE_AUDIT — the only writer of the Closure
    // receipt — instead of silently deadlocking the plan in activePlans.
    // Legacy / format:none plans are untouched (behavior byte-identical).
    if (
      result.format === "frontmatter" &&
      result.totalUnchecked === 0 &&
      result.derivedCompleted === false
    ) {
      const reasons = result.completionReasons?.length
        ? result.completionReasons
        : ["derive-completed-false"];
      for (const reason of reasons) {
        coreIssues.push(
          `ledger completion formula unmet (all ${result.totalChecked} items checked, 01 §5.2): ${reason}`
        );
      }
    }

    if (coreIssues.length === 0) {
      if (flowVars?.set) {
        flowVars.set("SCRIPT_CHECK_RESULT", "PASS");
        flowVars.set("SCRIPT_CHECK_DETAILS", "");
      }
      return { marker: "pass", text: `Plan closure check PASSED.\n  file: ${result.file}\n  status: ${result.planStatus}\n  unchecked: ${result.totalUnchecked}` };
    }

    const detailsText = coreIssues.map((i) => `  - ${i}`).join("\n");
    if (flowVars?.set) {
      flowVars.set("SCRIPT_CHECK_RESULT", "FAIL");
      flowVars.set("SCRIPT_CHECK_DETAILS", coreIssues.join("; "));
    }
    return { marker: "fail", text: `Plan closure check FAILED.\n  file: ${result.file}\n  status: ${result.planStatus}\n${detailsText}` };
  } catch (err) {
    return { marker: "fail", text: `ERROR: ${err.message}` };
  }
}

const SCRIPT_REGISTRY = {
  "closure-script-check": (delegates, flowVars) => closureScriptCheck(delegates, flowVars),
};

const TOOL_PROMPTS_DIR = resolve(TOOL_ROOT, "prompts");

function loadPrompt(promptPath, projectDirs = []) {
  // promptPath is relative to TOOL_ROOT (e.g. "prompts/health-check.md"), but
  // projectDirs are already prompt directories — strip the leading "prompts/"
  // so resolve produces "missions/prompts/health-check.md" instead of the
  // double-nested "missions/prompts/prompts/health-check.md".
  const relativePath = promptPath.replace(/^prompts[\\/]/, "");
  for (const dir of projectDirs) {
    const projectPath = resolve(dir, relativePath);
    if (existsSync(projectPath)) return readFileSync(projectPath, "utf8");
  }
  return readFileSync(resolve(TOOL_ROOT, promptPath), "utf8");
}

function resolveStepPrompts(steps, projectDirs = []) {
  for (const step of Object.values(steps)) {
    if (step.promptPath) {
      step.prompt = loadPrompt(step.promptPath, projectDirs);
    }
    if (step.steps) {
      resolveStepPrompts(step.steps, projectDirs);
    }
  }
}

function resolveStepScripts(steps) {
  for (const [name, step] of Object.entries(steps)) {
    if (step.type === "script" && step.scriptId) {
      const impl = SCRIPT_REGISTRY[step.scriptId];
      if (!impl) throw new Error(`Unknown scriptId: ${step.scriptId} in step ${name}`);
      step.run = impl;
    }
    if (step.steps) {
      resolveStepScripts(step.steps);
    }
  }
}

const TOOL_FLOWS_DIR = resolve(TOOL_ROOT, "flows");

function loadFlowFile(filePath, projectPromptDirs = []) {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  resolveStepPrompts(raw.steps, projectPromptDirs);
  resolveStepScripts(raw.steps);
  return raw;
}

function findFlowFile(name, searchDirs) {
  for (const dir of searchDirs) {
    const filePath = resolve(dir, `${name}.json`);
    if (existsSync(filePath)) return filePath;
  }
  return null;
}

export function createMissionDriverFlow(options = {}) {
  const flowName = options.flowName || "mission-driver";
  const projectFlowsDir = options.projectFlowsDir;
  const projectPromptDirs = options.projectPromptDirs || [];

  const searchDirs = [];
  if (projectFlowsDir) searchDirs.push(projectFlowsDir);
  searchDirs.push(TOOL_FLOWS_DIR);

  const filePath = findFlowFile(flowName, searchDirs);
  if (!filePath) {
    throw new Error(`Flow not found: ${flowName} (searched: ${searchDirs.join(", ")})`);
  }
  return loadFlowFile(filePath, projectPromptDirs);
}

export function loadSubFlow(name) {
  const missionsDir = this?.config?.missionsDir;
  const missionPromptsDir = this?.config?.missionPromptsDir;
  // mdr-fix-2: mission-level promptsDir wins, then shared missions/prompts/,
  // then built-in TOOL_ROOT/prompts/ (loadPrompt fallback). Preserve the
  // falsy-missionsDir guard so unconfigured missions (missionsDir unset) keep
  // yielding only the mission-level dir (or [] when both are unset).
  const projectPromptDirs = [
    missionPromptsDir,
    missionsDir ? resolve(missionsDir, "prompts") : "",
  ].filter(Boolean);

  const searchDirs = [];
  if (missionsDir) searchDirs.push(resolve(missionsDir, "flows"));
  const subflowDir = this?.config?.subflowDir;
  if (subflowDir) searchDirs.push(subflowDir);
  searchDirs.push(TOOL_FLOWS_DIR);

  const filePath = findFlowFile(name, searchDirs);
  if (!filePath) {
    throw new Error(`Subflow not found: ${name} (searched: ${searchDirs.join(", ")})`);
  }
  return loadFlowFile(filePath, projectPromptDirs);
}

export { SCRIPT_REGISTRY, TOOL_ROOT };
