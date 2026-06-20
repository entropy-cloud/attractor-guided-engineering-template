#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./config.js";
import { createRunner, resetMockState } from "./runner.js";
import { FlowEngine } from "./engine.js";
import { createMissionDriverFlow, loadSubFlow, createExpressionFunctions } from "./flow-loader.js";
import { resolveTemplateVars } from "./expression.mjs";

function parseArgs(argv) {
  const args = { mission: "", dryRun: false, testMode: false, listSteps: false, listMissions: false };
  let i = 2;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--missions-dir") args.missionsDir = argv[++i];
    else if (a === "--agent") args.agent = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--max-cycles") args.maxCycles = Number(argv[++i]);
    else if (a === "--max-inner-cycles") args.maxInnerCycles = Number(argv[++i]);
    else if (a === "--max-total-steps") args.maxTotalSteps = Number(argv[++i]);
    else if (a === "--test") args.testMode = true;
    else if (a === "--step") args.entryStep = argv[++i];
    else if (a === "--list-steps") args.listSteps = true;
    else if (a === "--list-missions") args.listMissions = true;
    else if (a === "--draft-mission") args.draftMission = argv[++i];
    else if (!a.startsWith("--")) args.mission = a;
    i++;
  }
  return args;
}

function getTopSteps() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const flowFile = resolve(__dirname, "..", "flows", "mission-driver.json");
  const flow = JSON.parse(readFileSync(flowFile, "utf8"));
  return Object.keys(flow.steps || {});
}

function printStepList() {
  const steps = getTopSteps();
  console.log("Available top-level steps:");
  for (const s of steps) console.log(`  ${s}`);
  console.log("");
  console.log("Usage: --step <STEP_NAME> to start from a specific step");
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.listSteps) {
    printStepList();
    return;
  }

  const config = resolveConfig(args);
  const runner = await createRunner(config);

  // --draft-mission mode: one-shot generation, no flow engine needed
  if (config.draftMission) {
    const promptFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "mission-draft.md");
    const rawPrompt = readFileSync(promptFile, "utf8");
    const prompt = resolveTemplateVars(rawPrompt, {
      missionsDir: config.missionsDir,
      projectRoot: config.projectRoot,
    });
    const result = await runner.runAgent({
      prompt: `${prompt}\n\n## User Request\n\nGenerate a mission.json for: ${config.draftMission}\n\nProject root: ${config.projectRoot}`,
      model: config.model,
    });
    console.log("\n" + result.content);
    await runner.close();
    return;
  }

  process.on("SIGTERM", async () => {
    process.stderr.write("\n[SIGTERM] cleaning up ...\n");
    await runner.close();
    process.exit(130);
  });
  process.on("SIGINT", async () => {
    process.stderr.write("\n[SIGINT] cleaning up ...\n");
    await runner.close();
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
        moduleDir: g.moduleDir || "",
        testCmd: g.commands.test,
        buildCmd: g.commands.build || "",
        lintCmd: g.commands.lint || "",
        typecheckCmd: g.commands.typecheck || "",
        commitFormat: g.commitFormat || "",
        multiAuditPrompt: g.prompts?.multiAudit || "",
        openAuditPrompt: g.prompts?.openAudit || "",
        TIMESTAMP: config.timestamp,
      },
      runAgent: runner.runAgent,
      runTool: runner.runTool,
      runParseAgent: runner.runParseAgent,
      logFile: config.logFile,
      loadSubFlow,
    };

    if (args.entryStep) {
      const step = flow.steps[args.entryStep];
      if (!step) {
        console.error(`ERROR: step "${args.entryStep}" not found in flow. Use --list-steps to see available steps.`);
        process.exitCode = 1;
        return;
      }
      console.log(`Step:       ${args.entryStep} (single-step mode)`);
      for (const [, t] of Object.entries(step.transitions || {})) {
        if (t.goto && !t.retry) {
          t.done = "completed";
          delete t.goto;
        }
      }
    }

    resetMockState();
    const engine = new FlowEngine(flow, delegates);
    const result = await engine.run(args.entryStep);

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
    await runner.close();
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
