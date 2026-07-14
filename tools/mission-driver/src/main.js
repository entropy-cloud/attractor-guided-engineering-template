#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { resolveConfig, buildRunSkeleton, inferModuleName, listMissionsString } from "./config.js";
import { createRunner, resetMockState } from "./runner.js";
import { FlowEngine } from "./engine.js";
import { createMissionDriverFlow, loadSubFlow, createExpressionFunctions } from "./flow-loader.js";
import { resolveTemplateVars } from "./expression.mjs";
import { runPostmortem } from "./postmortem.mjs";
import { startMonitor } from "./monitor.js";
import { loadDotenv } from "./env-loader.js";
import { reconcileStaleRuns, markAborted } from "./run-reconcile.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Testability seam (mdo-4 P2): cmdDraftMission calls this factory to obtain its
// runner. Production uses createRunner; tests override it via
// __setRunnerFactoryForTest to inject a fake runner with a controllable runAgent,
// so draft-brief.test.js can assert the two-stage brief→draft orchestration
// without launching a real opencode subprocess. Mirrors the __setSpawnerForTest
// pattern in draft-job.mjs / monitor.js.
let __runnerFactory = createRunner;
export function __setRunnerFactoryForTest(fn) {
  const prev = __runnerFactory;
  __runnerFactory = fn || createRunner;
  return prev;
}

/**
 * Read a memory `_index.md` file, returning its full text. Returns `""` when
 * the file is missing or unreadable (e.g. a module with no memory dir yet),
 * so the consuming prompt's `<memory_context>` block is simply ignored.
 * (FSD §9.5 consumption-side injection.)
 */
function readMemoryIndex(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/**
 * Read and concatenate every `*.md` file in a directory (sorted by name) into a
 * single string, so a multi-file knowledge index (e.g. `docs/knowledge/api/`)
 * can be injected as one flat var. Returns `""` when the directory is missing
 * or empty, mirroring readMemoryIndex's honest-degradation contract.
 *
 * (D5 — deterministic-regression-executor knowledge internalization.)
 */
function readKnowledgeDir(dir) {
  try {
    const names = readdirSync(dir).filter((n) => n.endsWith(".md")).sort();
    if (names.length === 0) return "";
    const parts = [];
    for (const name of names) {
      const text = readFileSync(resolve(dir, name), "utf8");
      parts.push(text);
    }
    return parts.join("\n\n---\n\n");
  } catch {
    return "";
  }
}

function getTopSteps() {
  const flowFile = resolve(__dirname, "..", "flows", "mission-driver.json");
  const flow = JSON.parse(readFileSync(flowFile, "utf8"));
  return Object.keys(flow.steps || {});
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function resolveProjectRoot(opts) {
  return opts.dir || process.env.PROJECT_ROOT || process.cwd();
}

function resolveMissionsDir(opts, projectRoot) {
  return opts.missionsDir
    ? resolve(projectRoot, opts.missionsDir)
    : resolve(projectRoot, "missions");
}

// ── Subcommand: monitor ────────────────────────────────────────────────────

async function runMonitorOnly(opts) {
  const projectRoot = resolveProjectRoot(opts);
  const port = opts.monitorPort
    ? Number(opts.monitorPort)
    : process.env.MONITOR_PORT
      ? Number(process.env.MONITOR_PORT)
      : 9300;
  const devMode = opts.dev === true || process.env.MONITOR_DEV === "1";
  const webDir = devMode
    ? null
    : resolve(__dirname, "..", "web", "dist");

  let monitor;
  try {
    monitor = await startMonitor({ projectRoot, runDir: null, missionName: null, port, webDir });
  } catch (err) {
    console.error(`[ERROR] monitor failed to start: ${err.message}`);
    process.exit(1);
  }

  console.log(`Mission-Driver Monitor (standalone — browsing historical runs)`);
  console.log(`Project:     ${projectRoot}`);
  console.log(`Monitor:     http://localhost:${monitor.port}`);
  if (devMode) {
    console.log(`Mode:        dev (static hosting OFF — run vite at :5173)`);
  }
  console.log(`Ctrl-C to stop.`);

  const shutdown = async (sig) => {
    process.stderr.write(`\n[${sig}] closing monitor ...\n`);
    try { await monitor.close(); } catch {}
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ── Subcommand: list (list-missions) ────────────────────────────────────────

function cmdListMissions(opts) {
  const projectRoot = resolveProjectRoot(opts);
  const missionsDir = resolveMissionsDir(opts, projectRoot);
  console.log(`Missions in ${missionsDir}:`);
  console.log(listMissionsString(missionsDir));
}

// ── Subcommand: list-steps ──────────────────────────────────────────────────

function cmdListSteps(missionName, opts) {
  if (!missionName) {
    console.error("ERROR: <mission> is required for list-steps");
    process.exit(1);
  }
  const projectRoot = resolveProjectRoot(opts);
  const missionsDir = resolveMissionsDir(opts, projectRoot);
  loadDotenv(projectRoot);
  const config = resolveConfig({ dir: projectRoot, missionsDir, mission: missionName });
  console.log(`Mission: ${config.missionName}`);
  console.log(`Available top-level steps:`);
  for (const s of getTopSteps()) console.log(`  ${s}`);
  console.log("");
  console.log("Usage: mission-driver <mission> --step <STEP>");
}

// ── Subcommand: draft (draft-mission) ───────────────────────────────────────

/**
 * Extract the brief file path from the mission-brief agent's output (mdo-4 P2).
 * The agent emits `<BRIEF_FILE>docs/backlog/<slug>-brief.md</BRIEF_FILE>`.
 * Returns the trimmed path or null when the tag is absent (the brief failed to
 * produce a file — stage 2 then runs in backward-compatible desc-only mode).
 */
function extractBriefPath(resultText) {
  if (typeof resultText !== "string") return null;
  const m = resultText.match(/<BRIEF_FILE>\s*([^\s<]+)\s*<\/BRIEF_FILE>/i);
  return m && m[1] ? m[1].trim() : null;
}

/**
 * Parse the draft agent's product into a mission identity. mdo-2 Phase 1.
 *
 * Strategy (FSD §3.1.3 boundary):
 *   1. `<MISSION_FILE>path</MISSION_FILE>` tag in the agent text → resolve +
 *      read that mission.json for `name`/`roadmapPath`.
 *   2. Fallback: scan `missions/*.json` for files with a `roadmapPath`, newest
 *      by mtime → derive missionName/roadmapPath/missionFile.
 *   3. Still nothing → all fields null (status stays completed; the UI tells
 *      the user to check manually).
 *
 * Never throws; returns nulls on any failure so the caller's best-effort write
 * does not abort the agent's main flow.
 */
function parseDraftArtifact(resultText, missionsDir) {
  const out = { missionName: null, roadmapPath: null, missionFile: null };
  // 1. <MISSION_FILE> tag
  if (typeof resultText === "string") {
    const m = resultText.match(/<MISSION_FILE>\s*([^\s<]+)\s*<\/MISSION_FILE>/i);
    if (m && m[1]) {
      const file = m[1].trim();
      try {
        const mission = JSON.parse(readFileSync(file, "utf8"));
        if (mission && typeof mission === "object") {
          out.missionFile = file;
          out.missionName = mission.name || basenameNoExt(file);
          out.roadmapPath = mission.roadmapPath || null;
          return out;
        }
      } catch {
        // tag found but file unreadable → fall through to scan
      }
    }
  }
  // 2. Fallback: newest missions/*.json with roadmapPath
  try {
    if (existsSync(missionsDir)) {
      const cands = readdirSync(missionsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const full = resolve(missionsDir, f);
          let st;
          try { st = statSync(full); } catch { st = { mtimeMs: 0, isDirectory: () => false }; }
          return { f, full, mtimeMs: st.mtimeMs, isDir: st.isDirectory ? st.isDirectory() : false };
        })
        .filter((c) => !c.isDir);
      // read each for roadmapPath; keep those with one
      const withRoadmap = [];
      for (const c of cands) {
        try {
          const mission = JSON.parse(readFileSync(c.full, "utf8"));
          if (mission && typeof mission === "object" && mission.roadmapPath) {
            withRoadmap.push({ ...c, mission });
          }
        } catch { /* skip */ }
      }
      if (withRoadmap.length > 0) {
        withRoadmap.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const newest = withRoadmap[0];
        out.missionFile = newest.full;
        out.missionName = newest.mission.name || basenameNoExt(newest.f);
        out.roadmapPath = newest.mission.roadmapPath || null;
      }
    }
  } catch {
    // scan failure → nulls
  }
  return out;
}

/** Basename without extension (small helper, avoids a path import churn). */
function basenameNoExt(p) {
  const norm = String(p).replace(/\\/g, "/");
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

async function cmdDraftMission(desc, opts) {
  const projectRoot = resolveProjectRoot(opts);
  loadDotenv(projectRoot);
  const dryRun = opts.dryRun === true;
  const pure = opts.pure === true
    || process.env.OPENCODE_PURE === "1"
    || process.env.OPENCODE_PURE === "true";
  const config = {
    projectRoot,
    missionsDir: resolveMissionsDir(opts, projectRoot),
    dryRun,
    pure,
    draftMission: desc,
    draftJobDir: opts.draftJobDir,
    flowHint: opts.flowHint || null,
    targetFile: opts.targetFile || null,
    skipBrief: opts.skipBrief === true,
  };
  const resolved = resolveConfig({ ...opts, ...config });
  const runner = await __runnerFactory(resolved);

  // mdo-2 Phase 1: when --draft-job-dir is set, the monitor's startDraftJob
  // already created the jobDir + a running draft-state.json. We re-affirm the
  // running state here so a stale state from a prior attempt is overwritten
  // with this process's start time + desc. Best-effort: write failures never
  // abort the agent.
  const stateFile = resolved.runDir ? resolve(resolved.runDir, "draft-state.json") : null;
  const writeDraftState = (patch) => {
    if (!stateFile) return;
    try {
      let prev = {};
      try { prev = JSON.parse(readFileSync(stateFile, "utf8")) || {}; } catch { prev = {}; }
      writeFileSync(stateFile, JSON.stringify({ ...prev, ...patch }, null, 2));
    } catch {
      // best-effort: never interrupt the agent's main flow
    }
  };
  if (opts.draftJobDir) {
    writeDraftState({
      status: "running",
      startedAt: new Date().toISOString(),
      desc,
      phase: resolved.skipBrief ? "draft" : "brief",
      flowHint: resolved.flowHint,
      targetFile: resolved.targetFile,
    });
  }

  const skipBrief = resolved.skipBrief === true;
  let briefPath = null;

  // ── Stage 1: brief (mdo-4 P2) ────────────────────────────────────────────
  // Generate a scope-gate brief first; skip entirely when skipBrief collapses
  // to the legacy single-stage draft (backward compatible with mdo-2).
  if (!skipBrief) {
    const briefPromptFile = resolve(__dirname, "..", "prompts", "mission-brief.md");
    const rawBriefPrompt = readFileSync(briefPromptFile, "utf8");
    const briefPrompt = resolveTemplateVars(rawBriefPrompt, {
      missionsDir: resolved.missionsDir,
      projectRoot: resolved.projectRoot,
      flowHint: resolved.flowHint || "",
      targetFile: resolved.targetFile || "",
    });
    let briefResult;
    try {
      briefResult = await runner.runAgent(
        "mission-brief",
        `${briefPrompt}\n\n## User Goal\n\n${desc}\n\nProject root: ${resolved.projectRoot}`,
        "",
        null
      );
    } catch (err) {
      if (opts.draftJobDir) {
        writeDraftState({
          status: "failed",
          endedAt: new Date().toISOString(),
          phase: "brief",
          error: err && err.message ? err.message : String(err),
        });
      }
      await runner.close();
      throw err;
    }
    console.log("\n" + (briefResult.text || "(no brief output)"));
    briefPath = extractBriefPath(briefResult.text);
    if (opts.draftJobDir) {
      writeDraftState({ phase: "brief_done", briefPath });
    }
  }

  // ── Stage 2: draft (roadmap + mission.json) ──────────────────────────────
  if (opts.draftJobDir) {
    writeDraftState({ phase: "draft" });
  }
  const promptFile = resolve(__dirname, "..", "prompts", "mission-draft.md");
  const rawPrompt = readFileSync(promptFile, "utf8");
  const prompt = resolveTemplateVars(rawPrompt, {
    missionsDir: resolved.missionsDir,
    projectRoot: resolved.projectRoot,
    briefPath: briefPath || "",
    flowHint: resolved.flowHint || "",
  });

  let result;
  try {
    result = await runner.runAgent(
      "draft-mission",
      `${prompt}\n\n## User Request\n\nGenerate a mission.json for: ${desc}\n\nProject root: ${resolved.projectRoot}`,
      "",
      null
    );
  } catch (err) {
    if (opts.draftJobDir) {
      writeDraftState({
        status: "failed",
        endedAt: new Date().toISOString(),
        phase: "draft",
        error: err && err.message ? err.message : String(err),
      });
    }
    await runner.close();
    throw err;
  }

  console.log("\n" + (result.text || "(no output)"));

  if (opts.draftJobDir) {
    const artifact = parseDraftArtifact(result.text, resolved.missionsDir);
    writeDraftState({
      status: "completed",
      endedAt: new Date().toISOString(),
      phase: "completed",
      briefPath,
      missionName: artifact.missionName,
      roadmapPath: artifact.roadmapPath,
      missionFile: artifact.missionFile,
    });
  }

  await runner.close();
}

// ── Subcommand: analyze (analyze-run) ───────────────────────────────────────

async function cmdAnalyzeRun(runDir, opts) {
  const projectRoot = resolveProjectRoot(opts);
  loadDotenv(projectRoot);
  const dryRun = opts.dryRun === true;
  const pure = opts.pure === true
    || process.env.OPENCODE_PURE === "1"
    || process.env.OPENCODE_PURE === "true";
  const config = {
    projectRoot,
    missionsDir: resolveMissionsDir(opts, projectRoot),
    dryRun,
    pure,
    analyzeRun: runDir || true,
  };
  const resolved = resolveConfig({ ...opts, ...config });
  if (resolved.analyzeRunIsLatest) {
    console.log(`[analyze-run] 未指定运行目录，使用最近一次 run: ${resolved.targetRunId}`);
  } else {
    console.log(`[analyze-run] 分析 run: ${resolved.targetRunId}`);
  }

  // mdo-3 Phase 1: thin wrapper over the reusable runPostmortem (FSD §3.3.3A).
  // All postmortem logic (skeleton build, module detect, prompt resolve, agent
  // dispatch, return-tag parse) lives in postmortem.mjs so the engine terminal
  // hook can drive the exact same pipeline. moduleInfo is passed through since
  // config.js already resolved it for the analyze branch.
  const runner = await createRunner(resolved);
  const res = await runPostmortem({
    projectRoot: resolved.projectRoot,
    missionsDir: resolved.missionsDir,
    targetRunDir: resolved.targetRunDir,
    targetRunId: resolved.targetRunId,
    runner,
    opts: { moduleInfo: resolved.moduleInfo },
  });
  console.log("\n" + (res.text || "(no output)"));
  await runner.close();
}

// ── Main command: run mission ───────────────────────────────────────────────

async function cmdRunMission(mission, opts) {
  const projectRoot = resolveProjectRoot(opts);
  loadDotenv(projectRoot);

  const args = {
    ...opts,
    dir: opts.dir,
    mission,
    missionsDir: opts.missionsDir,
    dryRun: opts.dryRun === true,
    testMode: opts.test === true,
    dev: opts.dev === true,
    pure: opts.pure === true,
    noMonitor: opts.noMonitor === true,
    entryStep: opts.step,
    agent: opts.agent,
    model: opts.model,
    parseModel: opts.parseModel,
    maxCycles: opts.maxCycles ? Number(opts.maxCycles) : undefined,
    maxInnerCycles: opts.maxInnerCycles ? Number(opts.maxInnerCycles) : undefined,
    maxTotalSteps: opts.maxTotalSteps ? Number(opts.maxTotalSteps) : undefined,
    monitorPort: opts.monitorPort,
    fastRun: opts.fast === true,
    skipSteps: opts.skipSteps,
    runDir: opts.runDir,
  };

  const config = resolveConfig(args);
  const runner = await createRunner(config);

  // Reconcile stale runs left by a prior crash/hard-kill BEFORE starting this
  // mission (FSD §3.1.4 G1 — next run fixes last run's state). Best-effort:
  // log the result to stderr but never block startup on failure.
  try {
    const rec = reconcileStaleRuns(config.projectRoot);
    if (rec.reconciled.length > 0) {
      process.stderr.write(
        `[reconcile] marked ${rec.reconciled.length} stale run(s) aborted: ` +
        `${rec.reconciled.map((r) => r.runId).join(", ")}\n`
      );
    }
  } catch (err) {
    process.stderr.write(`[reconcile] startup reconciliation skipped: ${err.message}\n`);
  }

  process.on("SIGTERM", async () => {
    process.stderr.write("\n[SIGTERM] cleaning up ...\n");
    await runner.close();
    // Best-effort: mark THIS run aborted so the dashboard/state reflect the
    // interrupt (FSD §3.1.4 G2). Write failures MUST NOT block exit. runDir is
    // skipped when absent; markAborted is a no-op if run-state.json is missing.
    if (config.runDir) {
      try { markAborted(config.runDir, "signal: SIGTERM"); } catch {}
    }
    process.exit(130);
  });
  process.on("SIGINT", async () => {
    process.stderr.write("\n[SIGINT] cleaning up ...\n");
    await runner.close();
    if (config.runDir) {
      try { markAborted(config.runDir, "signal: SIGINT"); } catch {}
    }
    process.exit(130);
  });

  const g = config.mission;
  console.log(`Mission:       ${config.missionName} — ${g.description || "(no description)"}`);
  console.log(`Roadmap:    ${g.roadmapPath}`);
  console.log(`Plans:      ${g.plansDir}`);
  if (g.contextDir) console.log(`Context:    ${g.contextDir}`);
  if (g.moduleDir) console.log(`Module:     ${g.moduleDir}`);
  console.log(`Test cmd:   ${g.commands.test}`);
  console.log(`Agent:      ${config.agent}`);
  console.log(`Model:      ${config.model}`);
  console.log(`DryRun:     ${config.dryRun}`);
  console.log(`TestMode:   ${config.testMode}`);
  console.log(`Timeout:    60min (auto-extend on output)`);
  console.log(`Log:        ${config.logFile}`);
  console.log("");

  let monitor = null;
  if (!config.noMonitor) {
    try {
      const webDir = config.devMode
        ? null
        : resolve(__dirname, "..", "web", "dist");
      monitor = await startMonitor({
        projectRoot: config.projectRoot,
        runDir: config.runDir,
        missionName: config.missionName,
        port: config.monitorPort,
        webDir,
      });
      console.log(`Monitor:     http://localhost:${monitor.port}`);
      if (config.devMode) {
        console.log(`Mode:        dev (static hosting OFF — run vite at :5173)`);
      }
    } catch (err) {
      console.error(`[WARN] monitor failed to start: ${err.message}`);
    }
  }

  try {
    const flow = createMissionDriverFlow({
      flowName: g.flowName,
      projectFlowsDir: resolve(config.missionsDir, "flows"),
      projectPromptDirs: [resolve(config.missionsDir, "prompts")],
    });
    const delegates = {
      config,
      expressionFuncs: createExpressionFunctions(config),
      vars: {
        missionName: config.missionName,
        projectRoot: config.projectRoot,
        missionsDir: config.missionsDir,
        roadmapPath: g.roadmapPath,
        plansDir: g.plansDir,
        planGuide: g.planGuide || g.plansDir + "/00-plan-authoring-and-execution-guide.md",
        auditsDir: g.auditsDir || "audits",
        contextDir: g.contextDir || "",
        moduleContextFile: (() => {
          const p = resolve(config.projectRoot, g.moduleDir || "", "CONTEXT.md");
          return existsSync(p) ? p : `${p} (不存在)`;
        })(),
        moduleDir: g.moduleDir || "",
        testCmd: g.commands.test,
        buildCmd: g.commands.build || "",
        lintCmd: g.commands.lint || "",
        typecheckCmd: g.commands.typecheck || "",
        commitFormat: g.commitFormat || "",
        multiAuditPrompt: g.prompts?.multiAudit || "",
        openAuditPrompt: g.prompts?.openAudit || "",
        sourcePaths: g.sourcePaths
          ? (Array.isArray(g.sourcePaths) ? g.sourcePaths.join("\n") : String(g.sourcePaths))
          : "",
        TIMESTAMP: config.timestamp,
        runDir: config.runDir || "",
        selfMemoryIndex: readMemoryIndex(
          resolve(__dirname, "..", "memory", "_index.md")
        ),
        moduleMemoryIndex: (() => {
            const md = g.moduleDir || "";
            if (/^tools[\/\\]/.test(md)) return ""; // selfMemoryIndex already covers tool modules
            const mn = inferModuleName(md, config.missionName) || "";
            return readMemoryIndex(resolve(config.projectRoot, "docs", "memory", mn, "_index.md"));
          })(),
      },
      runAgent: runner.runAgent,
      runTool: runner.runTool,
      runParseAgent: runner.runParseAgent,
      logFile: config.logFile,
      loadSubFlow,
    };

    if (config.entryStep) {
      const step = flow.steps[config.entryStep];
      if (!step) {
        console.error(`ERROR: step "${config.entryStep}" not found in flow. Use list-steps to see available steps.`);
        process.exitCode = 1;
        return;
      }
      console.log(`Step:       ${config.entryStep} (single-step mode)`);
      for (const [, t] of Object.entries(step.transitions || {})) {
        if (t.goto && !t.retry) {
          t.done = "completed";
          delete t.goto;
        }
      }
    }

    resetMockState();
    const engine = new FlowEngine(flow, delegates);
    config.onStepUpdate = (payload) => engine._onAgentStepUpdate(payload);
    const result = await engine.run(config.entryStep);

    console.log(`\n════════════════════════════════════════`);
    console.log(`  Mission:      ${config.missionName}`);
    console.log(`  Status:    ${result.status}`);
    console.log(`  Steps:     ${result.stepCount}`);
    console.log(`  Elapsed:   ${result.elapsed}`);
    if (result.marker) console.log(`  Last marker: ${result.marker}`);
    const tail = result.history.slice(-5);
    if (tail.length > 0) {
      console.log(`  Last activity:`);
      for (const line of tail) console.log(`    ${line}`);
    }
    console.log(`════════════════════════════════════════`);

    const exitMap = { completed: 0, failed: 1, max_cycles: 2, max_total_steps: 2, max_retries: 2 };
    const exitCode = exitMap[result.status];
    if (exitCode !== undefined) process.exitCode = exitCode;
  } finally {
    if (monitor) { try { await monitor.close(); } catch {} }
    await runner.close();
  }
}

// ── Commander setup ─────────────────────────────────────────────────────────

const program = new Command();

program
  .name("mission-driver")
  .description("AI 开发循环引擎 — 读 missions/<name>.json，按 flow JSON 定义的状态机循环执行 opencode run 子进程")
  .version("1.0.0")
  .addHelpText("after", `
环境变量:
  OPENCODE_AGENT=<agent>              子 agent（默认 build）
  OPENCODE_MODEL=<id>                 覆盖模型 ID
  OPENCODE_PARSE_MODEL=<id>           覆盖解析/纠正用模型 ID
  MAX_CYCLES=<n>                      主循环最大次数
  MAX_INNER_CYCLES=<n>                子流程最大循环次数
  MAX_TOTAL_STEPS=<n>                 总步骤数上限
  MONITOR_PORT=<port>                 Monitor 端口（默认 9300）
  MONITOR_DEV=1                       启用开发模式
  OPENCODE_PURE=1                     以 --pure 模式运行 opencode
  MONITOR_DISABLE=1                   禁用 Monitor
  PROJECT_ROOT=<path>                 项目根目录

示例:
  $ mission-driver my-mission
  $ mission-driver run my-mission
  $ mission-driver run my-mission --dry-run
  $ mission-driver run my-mission --step CHECK
  $ mission-driver run my-mission --max-cycles 5 --max-total-steps 50
  $ mission-driver monitor
  $ mission-driver analyze
  $ mission-driver list-steps my-mission
`);

// ── Subcommands ─────────────────────────────────────────────────────────────

program.command("list")
  .alias("ls")
  .description("列出所有可用 mission")
  .option("--dir <path>", "项目根目录")
  .option("--missions-dir <path>", "missions 目录")
  .action((opts) => cmdListMissions(opts));

program.command("list-steps")
  .description("列出指定 mission 的所有可单步执行的 step")
  .argument("<mission>", "Mission 名称")
  .option("--dir <path>", "项目根目录")
  .option("--missions-dir <path>", "missions 目录")
  .action((mission, opts) => cmdListSteps(mission, opts));

program.command("draft")
  .description("从描述生成 mission.json")
  .argument("<description>", "Mission 描述")
  .option("--dry-run", "mock 模式")
  .option("--pure", "以 --pure 模式运行")
  .option("--draft-job-dir <path>", "固定 draft job 目录（异步 job 跟踪用，mdo-2）")
  .option("--flow-hint <name>", "用户/向导选择的 flow 名（mdo-4 P2 两阶段 draft）")
  .option("--target-file <path>", "目标文件项目相对路径（mdo-4 P2 brief 输入）")
  .option("--skip-brief", "跳过 brief 阶段，直接 draft（向后兼容单阶段）")
  .option("--dir <path>", "项目根目录")
  .option("--missions-dir <path>", "missions 目录")
  .action((desc, opts) => cmdDraftMission(desc, opts));

program.command("analyze")
  .description("复盘运行（不指定目录则使用最近一次 run）")
  .argument("[run-dir]", "运行目录 ID")
  .option("--dry-run", "mock 模式")
  .option("--pure", "以 --pure 模式运行")
  .option("--dir <path>", "项目根目录")
  .option("--missions-dir <path>", "missions 目录")
  .action((runDir, opts) => cmdAnalyzeRun(runDir, opts));

program.command("monitor")
  .description("独立 Monitor 模式（仅浏览历史 run）")
  .option("--dev", "开发模式（禁用静态托管）")
  .option("--monitor-port <port>", "Monitor 端口（默认 9300）")
  .option("--dir <path>", "项目根目录")
  .action((opts) => runMonitorOnly(opts));

// ── Subcommand: run ─────────────────────────────────────────────────────────

program.command("run")
  .description("运行指定 mission（等价于直接传 mission 名）")
  .argument("<mission>", "Mission 名称（missions/<name>.json）")
  .option("--dry-run", "使用 mock agent，不调用真实模型（验证流程编排用）")
  .option("--step <step>", "单步执行指定 step（调试用）")
  .option("--max-cycles <n>", "主循环最大次数", parseInt)
  .option("--max-inner-cycles <n>", "子流程最大循环次数", parseInt)
  .option("--max-total-steps <n>", "总步骤数上限", parseInt)
  .option("--agent <name>", "指定子 agent")
  .option("--model <id>", "覆盖模型 ID")
  .option("--parse-model <id>", "覆盖解析/纠正用模型 ID")
  .option("--test", "测试模式")
  .option("--no-monitor", "不启动 Monitor Dashboard")
  .option("--monitor-port <port>", "指定 Monitor 端口（默认 9300）")
  .option("--dev", "Monitor 开发模式（禁用静态托管，搭配 vite dev 使用）")
  .option("--pure", "以 --pure 模式运行 opencode（跳过外部插件）")
  .option("--fast", "快速模式（跳 fastSkipSteps，默认 DEEP_AUDIT）")
  .option("--skip-steps <list>", "显式跳过 step 名，逗号分隔（与 --fast 取并集）")
  .option("--dir <path>", "指定项目根目录")
  .option("--missions-dir <path>", "指定 missions 目录")
  .option("--run-dir <path>", "指定运行目录（相对 _tmp/ 的 basename，由 monitor 注入）")
  .action(async (mission, opts) => {
    await cmdRunMission(mission, opts);
  });

// ── Main command (run mission) ──────────────────────────────────────────────

program
  .argument("[mission]", "Mission 名称（missions/<name>.json）")
  .option("--dry-run", "使用 mock agent，不调用真实模型（验证流程编排用）")
  .option("--step <step>", "单步执行指定 step（调试用）")
  .option("--max-cycles <n>", "主循环最大次数", parseInt)
  .option("--max-inner-cycles <n>", "子流程最大循环次数", parseInt)
  .option("--max-total-steps <n>", "总步骤数上限", parseInt)
  .option("--agent <name>", "指定子 agent")
  .option("--model <id>", "覆盖模型 ID")
  .option("--parse-model <id>", "覆盖解析/纠正用模型 ID")
  .option("--test", "测试模式")
  .option("--no-monitor", "不启动 Monitor Dashboard")
  .option("--monitor-port <port>", "指定 Monitor 端口（默认 9300）")
  .option("--dev", "Monitor 开发模式（禁用静态托管，搭配 vite dev 使用）")
  .option("--pure", "以 --pure 模式运行 opencode（跳过外部插件）")
  .option("--fast", "快速模式（跳 fastSkipSteps，默认 DEEP_AUDIT）")
  .option("--skip-steps <list>", "显式跳过 step 名，逗号分隔（与 --fast 取并集）")
  .option("--dir <path>", "指定项目根目录")
  .option("--missions-dir <path>", "指定 missions 目录")
  .option("--run-dir <path>", "指定运行目录（相对 _tmp/ 的 basename，由 monitor 注入）")
  .action(async (mission, opts) => {
    if (!mission) {
      program.outputHelp();
      process.exit(1);
    }

    await cmdRunMission(mission, opts);
  });

// ── Entry ───────────────────────────────────────────────────────────────────

// Exported for draft-brief.test.js (mdo-4 P2): the two-stage orchestration is
// tested directly with an injected fake runner via __setRunnerFactoryForTest.
export { cmdDraftMission };

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  program.parse();
}
