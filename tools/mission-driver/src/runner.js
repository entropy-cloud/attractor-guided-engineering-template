import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { execute } from "./executor.js";
import { IS_WIN32, killProcessTree, isAlive } from "./platform.mjs";

async function killTree(pid) {
  try {
    if (IS_WIN32) {
      killProcessTree(pid);
      return;
    }
    // Phase 1: SIGTERM - allow graceful shutdown (MCP cleanup, turbo teardown)
    process.kill(-pid, "SIGTERM");
    // Phase 2: Wait up to 6s for the process group to exit
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      if (!isAlive(pid)) return; // process exited gracefully
      await new Promise(r => setTimeout(r, 100));
    }
    // Phase 3: SIGKILL - force kill if still alive
    process.stderr.write(`  [WARN] process group ${pid} did not exit after SIGTERM, sending SIGKILL\n`);
    process.kill(-pid, "SIGKILL");
  } catch {}
}

let _mockRoadmapCount = 0;
let _mockClosureCount = 0;
let _mockMultiAuditCount = 0;

export function resetMockState() {
  _mockRoadmapCount = 0;
  _mockClosureCount = 0;
  _mockMultiAuditCount = 0;
}

const STEP_KEY_MAP = {
  "FIX_BUILD": "fix-build",
  "EXECUTE": "execute",
  "CLOSURE_AUDIT": "closure-audit",
  "MULTI_AUDIT": "multi-audit",
  "OPEN_AUDIT": "open-audit",
  "BUILD_VERIFY": "build-verify",
};

function _normalizeStepName(stepName) {
  if (STEP_KEY_MAP[stepName]) return STEP_KEY_MAP[stepName];
  return stepName.toLowerCase().replace(/_/g, "-");
}

function mockAgentResponse(stepName) {
  const n = _normalizeStepName(stepName);

  if (n === "fix-build") return "<AI_STEP_RESULT>fixed</AI_STEP_RESULT>";

  if (n === "execute") return "<AI_STEP_RESULT>success</AI_STEP_RESULT>";

  if (n === "closure-audit") {
    _mockClosureCount++;
    return _mockClosureCount === 1
      ? "<AI_STEP_RESULT>issues</AI_STEP_RESULT>\n<REMAINING><item>mock: insufficient test coverage</item></REMAINING>"
      : "<AI_STEP_RESULT>approved</AI_STEP_RESULT>";
  }

  if (n === "multi-audit") {
    _mockMultiAuditCount++;
    return _mockMultiAuditCount <= 1
      ? "<AI_STEP_RESULT>issues</AI_STEP_RESULT>"
      : "<AI_STEP_RESULT>clean</AI_STEP_RESULT>";
  }

  if (n === "open-audit") return "<AI_STEP_RESULT>clean</AI_STEP_RESULT>";

  if (n === "build-verify") return "<AI_STEP_RESULT>pass</AI_STEP_RESULT>";

  return "<AI_STEP_RESULT>ok</AI_STEP_RESULT>";
}

function extractSessionId(text) {
  if (!text) return null;
  const m = text.match(/"session_id"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  const m2 = text.match(/"id"\s*:\s*"(ses_[^"]+)"/);
  if (m2) return m2[1];
  const m3 = text.match(/ses_[a-zA-Z0-9]+/);
  if (m3) return m3[0];
  return null;
}

function findLatestSessionId(projectRoot) {
  try {
    const out = execSync("opencode session list -n 1 --format json", {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    const sessions = JSON.parse(out);
    if (Array.isArray(sessions) && sessions.length > 0 && sessions[0].id) {
      return sessions[0].id;
    }
  } catch {}
  return null;
}

export async function createRunner(config) {
  let currentPid = null;

  const realRun = async (stepName, prompt, system, sessionId) => {
    const model = `${config.model}`;

    process.stderr.write(`\n╔═══════════════════════════════════════════════\n`);
    process.stderr.write(`║ STEP: ${stepName}\n`);
    process.stderr.write(`║ Model: ${model}\n`);
    if (sessionId) process.stderr.write(`║ Session: ${sessionId.slice(0, 30)}...\n`);
    process.stderr.write(`╠═══════════════════════════════════════════════\n`);
    const preview = prompt.length > 500 ? prompt.slice(0, 500) + "..." : prompt;
    process.stderr.write(preview + "\n");
    process.stderr.write(`╚═══════════════════════════════════════════════\n`);

    const markedPrompt = `[MISSION_DRIVER] ${prompt}`;
    const args = ["run", "-m", model, "--agent", config.agent, "--dangerously-skip-permissions", markedPrompt];
    if (sessionId) {
      args.push("--session", sessionId);
    }
    const result = await execute(config, `oc-${stepName}`, "opencode", args, {
      cwd: config.projectRoot,
      onSpawn(pid) { currentPid = pid; },
    });
    currentPid = null;

    let text = "";
    if (result.logFile) {
      try { text = readFileSync(result.logFile, "utf8").trim(); } catch { text = ""; }
    }

    let extractedSessionId = extractSessionId(text);
    if (!extractedSessionId && result.ok) {
      extractedSessionId = findLatestSessionId(config.projectRoot);
    }

    return { text, logFile: result.logFile, ok: result.ok, sessionId: extractedSessionId };
  };

  const mockRun = async (stepName, prompt, system) => {
    process.stderr.write(`\n╔═══════════════════════════════════════════════\n`);
    process.stderr.write(`║ MOCK STEP: ${stepName}\n`);
    process.stderr.write(`╚═══════════════════════════════════════════════\n`);

    const text = mockAgentResponse(stepName);
    return { text, logFile: null, ok: true, sessionId: null };
  };

  const runAgent = config.dryRun ? mockRun : realRun;

  async function runTool(stepName, command, opts = {}) {
    if (config.dryRun) {
      console.log(`[MOCK tool] ${command}`);
      return { ok: true, logFile: null };
    }
    // Execute the command verbatim. Unlike the Maven variant, pnpm/turbo
    // commands are passed through as-is (the build/test commands live in the
    // flow JSON / prompts, which already include any --filter scoping).
    const parts = command.split(" ").filter(Boolean);
    const cmd = parts[0];
    const cmdArgs = parts.slice(1);
    const result = await execute(config, stepName, cmd, cmdArgs, {
      cwd: config.projectRoot,
      onSpawn(pid) { currentPid = pid; },
      shell: IS_WIN32,
    });
    currentPid = null;
    return result;
  }

  return {
    runAgent,
    runTool,
    runParseAgent: runAgent,
    async close() {
      if (currentPid) {
        await killTree(currentPid);
        currentPid = null;
      }
    },
  };
}
