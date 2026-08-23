#!/usr/bin/env node
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "../vendor/commander/index.js";
import { resolveConfig, listMissionsString } from "./config.js";
import { createRunner } from "./runner.js";
import { ProcessExecutor } from "./step-executor.js";
import { startMonitor } from "./monitor.js";
import { loadDotenv } from "./env-loader.js";
import { reconcileStaleRuns, markAborted } from "./run-reconcile.mjs";
import { unregisterActiveRun } from "./active-run-registry.mjs";
import {
  bootstrap,
  orchestrateRun,
  orchestrateAnalyze,
  cmdDraftMission,
  getTopSteps,
  resolveProjectRoot,
  resolveMissionsDir,
} from "./orchestrator.js";

// Backward-compat re-exports (dsh-plugin M1-WI2): the five draft-pipeline
// symbols below are now DEFINED in orchestrator.js; `export … from` re-exports
// reference the SAME module instance — critical for __setRunnerFactoryForTest,
// which is module-level mutable state (a wrapper function would capture a
// stale copy and break the test seam). The four draft test files importing
// from "./main.js" keep working unchanged. EXIT_MAP is re-exported from its
// own zero-dependency module (NOT from orchestrator) — single source, no
// dual provenance; pinned row-by-row by test/exit-map.test.js against
// exit-map.js directly.
export {
  cmdDraftMission,
  parseDraftArtifact,
  extractBriefGate,
  validateDraftDesc,
  __setRunnerFactoryForTest,
} from "./orchestrator.js";
export { EXIT_MAP } from "./exit-map.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// ── Subcommand: analyze (analyze-run) ───────────────────────────────────────

// Thin CLI shell (dsh-plugin M1-WI2): bootstrap → human-readable banner →
// orchestrateAnalyze (which builds and closes its own runner). The draft
// command below calls cmdDraftMission directly — it self-bootstraps its
// config internally, so the shell must NOT wrap it in bootstrap (double
// resolution).
async function cmdAnalyzeRun(runDir, opts) {
  const projectRoot = resolveProjectRoot(opts);
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
  const resolved = bootstrap({ projectRoot, args: { ...opts, ...config } });
  if (resolved.analyzeRunIsLatest) {
    console.log(`[analyze-run] 未指定运行目录，使用最近一次 run: ${resolved.targetRunId}`);
  } else {
    console.log(`[analyze-run] 分析 run: ${resolved.targetRunId}`);
  }
  const res = await orchestrateAnalyze({ config: resolved });
  console.log("\n" + (res.text || "(no output)"));
}

// ── Main command: run mission ───────────────────────────────────────────────

// Thin CLI shell (dsh-plugin M1-WI2): CLI param normalization + bootstrap +
// process lifecycle (reconcile / signals / monitor / unregister) + banners;
// the orchestration itself (flow, delegates.vars, singleStep/entryOverride,
// engine driving, EXIT_MAP mapping) lives in orchestrator.js orchestrateRun.
async function cmdRunMission(mission, opts) {
  // WI3: --step (single-step stop) and --from-step (entry override + keep
  // looping) are mutually exclusive — both at once is an explicit user error.
  // Checked before any side effect (no run dir, no monitor, no engine).
  if (opts.step && opts.fromStep) {
    console.error("ERROR: --step 与 --from-step 互斥，请二选一。");
    process.exitCode = 1;
    return;
  }

  const projectRoot = resolveProjectRoot(opts);

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
    fromStep: opts.fromStep,
    agent: opts.agent,
    model: opts.model,
    parseModel: opts.parseModel,
    driver: opts.driver,
    maxCycles: opts.maxCycles ? Number(opts.maxCycles) : undefined,
    maxInnerCycles: opts.maxInnerCycles ? Number(opts.maxInnerCycles) : undefined,
    maxTotalSteps: opts.maxTotalSteps ? Number(opts.maxTotalSteps) : undefined,
    monitorPort: opts.monitorPort,
    fastRun: opts.fast === true,
    skipSteps: opts.skipSteps,
    runDir: opts.runDir,
  };

  const config = bootstrap({ projectRoot, args });
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
  if (config.variant) console.log(`Variant:    ${config.variant}`);
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
    const result = await orchestrateRun({ config, executor: new ProcessExecutor(runner) });

    // result.status is absent only on orchestrateRun's early return (unknown
    // entry step — its error lines were already printed there).
    if (result.status !== undefined) {
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
    }

    if (result.exitCode !== undefined) process.exitCode = result.exitCode;
  } finally {
    // Unregister this run from the global active-run registry. Single site:
    // we deliberately do NOT scatter unregister across engine.run()'s ~25
    // _result() return points. Best-effort + idempotent (ENOENT silently
    // ignored) so it's a safe no-op for runs that were never registered
    // (missionName=null draft/analyze path). Crash residue is reclaimed by the
    // next run's reaper via isAliveAndOurs detecting the dead driverPid.
    if (config && config.runDir) {
      try { unregisterActiveRun(basename(config.runDir), process.pid); } catch {}
    }
    if (monitor) { try { await monitor.close(); } catch {} }
    await runner.close();
  }
}

// ── Commander setup ─────────────────────────────────────────────────────────

const program = new Command();

// commander 15.0.0 option-stripping quirk: when the same option name is
// declared on BOTH a subcommand (e.g. `program.command("run").option("--step")`)
// AND the main command (`program.option("--step")`), invoking the subcommand
// silently drops the option (`run X --step Y` → sub action sees step=undefined).
// `enablePositionalOptions()` changes parsing so options after the subcommand
// name are properly routed to the subcommand. Verified empirically: fixes
// `run <mission> --step <S>` / `--from-step <S>` / `--no-monitor` etc. without
// breaking the bare main-command path (`<mission> --step <S>` still works).
// Minimal repro in commit message / from-step.test.js history.
program.enablePositionalOptions();

program
  .name("mission-driver")
  .description("AI 开发循环引擎 — 读 missions/<name>.json，按 flow JSON 定义的状态机循环执行 opencode run 子进程")
  .version("1.0.0")
  .addHelpText("after", `
环境变量:
  MISSION_DRIVER_EXEC=<exe>           执行器驱动: opencode (默认) | pi | cline
  MISSION_DRIVER_ARGS=<args>          执行器参数模板（pi 时自动填充 -p/--model/--append-system-prompt/--tools；cline 时自动填充 -m/--json/--yolo/-s）
  MISSION_PROMPT_MODE=<mode>          prompt 传递方式: arg | stdin（pi 默认 stdin；cline 默认 arg）
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
  $ mission-driver run my-mission --from-step DEEP_AUDIT
  $ mission-driver run my-mission --max-cycles 5 --max-total-steps 50
  $ mission-driver monitor
  $ mission-driver analyze
  $ mission-driver list-steps my-mission

选项说明（run 子命令 / 主命令共享）:
  --step <STEP>       单步执行指定 step（maxSteps=1，调试用）
  --from-step <STEP>  从指定 step 开始执行、之后照常循环（不动 transitions）
                      满足"今天就跑一次 deep audit 然后接着循环"类诉求；
                      与 --step 互斥，同时传报错退出
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
  .option("--target-file <path>", "目标文件/目录路径（可选输入辅助，非必填约束；description 可引用任意路径）")
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
  .option("--from-step <step>", "从指定 step 开始执行，之后照常循环（不改变 transitions）")
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
  .option("--driver <exe>", "执行器驱动: opencode (默认) | pi | cline")
  .action(async (mission, opts) => {
    await cmdRunMission(mission, opts);
  });

// ── Main command (run mission) ──────────────────────────────────────────────

program
  .argument("[mission]", "Mission 名称（missions/<name>.json）")
  .option("--dry-run", "使用 mock agent，不调用真实模型（验证流程编排用）")
  .option("--step <step>", "单步执行指定 step（调试用）")
  .option("--from-step <step>", "从指定 step 开始执行，之后照常循环（不改变 transitions）")
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
  .option("--driver <exe>", "执行器驱动: opencode (默认) | pi | cline")
  .action(async (mission, opts) => {
    if (!mission) {
      program.outputHelp();
      process.exit(1);
    }

    await cmdRunMission(mission, opts);
  });

// ── Entry ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  program.parse();
}
