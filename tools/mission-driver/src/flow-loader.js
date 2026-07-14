import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPlan } from "./plan-check.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOOL_ROOT = resolve(__dirname, "..");

const PLAN_STATUS_RE = /^>\s*\*{0,2}(?:[Pp]lan\s+)?[Ss]tatus\*{0,2}\s*:\s*\*{0,2}(.+?)\*{0,2}\s*$/m;
// Canonical plan statuses: draft (initial) → active (post-review, ready to exec).
// Legacy synonyms tolerated for backward compatibility with older plans.
function _normalizeStatus(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
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
].map(_normalizeStatus);
const DRAFT_STATUSES = [
  "draft",
  "drafted",
  "proposed",
  "not started",
  "backlog",
  "in draft",
  "in-draft",
].map(_normalizeStatus);
const AUDIT_STATUS_RE = /^>\s*\*{0,2}Audit\s+Status\*{0,2}:\s*\*{0,2}(.+?)\*{0,2}\s*$/m;

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

function _scanPlansByStatus(plansDir, statuses) {
  const results = [];
  if (!existsSync(plansDir)) return results;
  const files = _walkMarkdown(plansDir)
    .filter(f => !basename(f).startsWith("00-"))
    .sort();
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    const m = content.match(PLAN_STATUS_RE);
    const status = m ? _normalizeStatus(m[1]) : "";
    if (status && statuses.includes(status)) {
      results.push(f);
    }
  }
  return results;
}

function _scanOpenAuditsList(auditsDir) {
  const results = [];
  if (!existsSync(auditsDir)) return results;
  const files = _walkMarkdown(auditsDir).sort();
  for (const f of files) {
    const content = readFileSync(f, "utf8");
    const m = content.match(AUDIT_STATUS_RE);
    const status = m ? m[1].trim().toLowerCase() : "";
    if (status === "open") {
      results.push(f);
    }
  }
  return results;
}

// ── Expression functions (pre-registered, callable from flow expressions) ──

export function createExpressionFunctions(config) {
  const projectRoot = config.projectRoot;
  const mission = config.mission || {};

  return {
    activePlans: () => _scanPlansByStatus(
      resolve(projectRoot, mission.plansDir), ACTIVE_STATUSES
    ),
    draftPlans: () => _scanPlansByStatus(
      resolve(projectRoot, mission.plansDir), DRAFT_STATUSES
    ),
    openAudits: () => _scanOpenAuditsList(
      resolve(projectRoot, mission.auditsDir || "audits")
    ),
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

    const result = inspectPlan(absPath, { strict: false, projectRoot });

    const coreIssues = [];
    if (result.totalUnchecked > 0) {
      coreIssues.push(
        `${result.totalUnchecked} unchecked items remain after EXECUTE (every [ ] must become [x] before closure)`
      );
    }
    if (result.planStatus === "completed" && result.details.includes("missing closure evidence")) {
      coreIssues.push("completed plan missing Closure evidence");
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
  for (const dir of projectDirs) {
    const projectPath = resolve(dir, promptPath);
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
  const projectPromptDirs = missionsDir ? [resolve(missionsDir, "prompts")] : [];

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
