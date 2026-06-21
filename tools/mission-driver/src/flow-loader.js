import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
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

function _scanPlansByStatus(plansDir, statuses) {
  const results = [];
  if (!existsSync(plansDir)) return results;
  const files = readdirSync(plansDir)
    .filter(f => f.endsWith(".md") && !f.startsWith("00-"))
    .sort();
  for (const f of files) {
    const content = readFileSync(resolve(plansDir, f), "utf8");
    const m = content.match(PLAN_STATUS_RE);
    const status = m ? _normalizeStatus(m[1]) : "";
    if (status && statuses.includes(status)) {
      results.push(resolve(plansDir, f));
    }
  }
  return results;
}

function _scanOpenAuditsList(auditsDir) {
  const results = [];
  if (!existsSync(auditsDir)) return results;
  const files = readdirSync(auditsDir)
    .filter(f => f.endsWith(".md"))
    .sort();
  for (const f of files) {
    const content = readFileSync(resolve(auditsDir, f), "utf8");
    const m = content.match(AUDIT_STATUS_RE);
    const status = m ? m[1].trim().toLowerCase() : "";
    if (status === "open") {
      results.push(resolve(auditsDir, f));
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
  };
}

// ── Script-step functions ──

async function closureScriptCheck(delegates, flowVars) {
  const planFile =
    flowVars?.get?.("PLAN_FILE") || delegates?.vars?.PLAN_FILE;
  if (!planFile) {
    console.error(
      "[closureScriptCheck] ERROR: no PLAN_FILE in flowVars — cannot verify specific plan"
    );
    return "fail";
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
      return "pass";
    }

    if (flowVars?.set) {
      flowVars.set("SCRIPT_CHECK_RESULT", "FAIL");
      flowVars.set("SCRIPT_CHECK_DETAILS", coreIssues.join("; "));
    }

    console.error(`[closureScriptCheck] FAIL: ${result.file}`);
    console.error(`  status: ${result.planStatus}`);
    for (const issue of coreIssues) {
      console.error(`  - ${issue}`);
    }
    return "fail";
  } catch (err) {
    console.error(`[closureScriptCheck] ERROR: ${err.message}`);
    return "fail";
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
