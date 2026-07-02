#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveConfig,
  resolveDraftConfig,
  resolveProjectRoot,
  resolveMissionsDir,
  listMissionsString,
} from "./config.js";
import { createRunner, resetMockState } from "./runner.js";
import { FlowEngine } from "./engine.js";
import { createMissionDriverFlow, loadSubFlow, createExpressionFunctions } from "./flow-loader.js";
import { resolveTemplateVars } from "./expression.mjs";

// --- Option catalogs (single source for parsing + help rendering) ---

const RUN_OPTIONS = [
  { flag: "<mission>", desc: "Name in missions/<mission>.json" },
  { flag: "--step <STEP>", desc: "Start from a specific top-level step" },
  { flag: "--dry-run", desc: "Resolve config and print plan, do not spawn agents" },
  { flag: "--test", desc: "Test mode" },
  { flag: "--agent <name>", desc: "opencode agent (default: build, env: OPENCODE_AGENT)" },
  { flag: "--model <id>", desc: "opencode model (env: OPENCODE_MODEL)" },
  { flag: "--variant <level>", desc: "model variant / reasoning effort e.g. max, high, minimal (env: OPENCODE_VARIANT)" },
  { flag: "--max-cycles <N>", desc: "Cap outer cycles" },
  { flag: "--max-inner-cycles <N>", desc: "Cap inner cycles" },
  { flag: "--max-total-steps <N>", desc: "Cap total steps" },
];

const DRAFT_OPTIONS = [
  { flag: "<description>", desc: "Objective description for the mission" },
];

const LIST_OPTIONS = [
  { flag: "[missions|steps]", desc: "Resource to list (default: missions)" },
];

const GLOBAL_OPTIONS = [
  { flag: "--dir <path>", desc: "Project root (default: cwd, env: PROJECT_ROOT)" },
  { flag: "--missions-dir <path>", desc: "Missions dir (default: <projectRoot>/missions)" },
  { flag: "-h, --help", desc: "Show help for this command" },
];

// --- Argument parsing ---

function parseArgs(argv) {
  const args = {
    command: null,
    mission: "",
    draftDesc: "",
    listTarget: "missions",
    helpTarget: null,
    dryRun: false,
    testMode: false,
    entryStep: null,
    help: false,
  };
  const positional = [];
  let i = 2;
  while (i < argv.length) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--dir") args.dir = argv[++i];
    else if (a === "--missions-dir") args.missionsDir = argv[++i];
    else if (a === "--agent") args.agent = argv[++i];
    else if (a === "--model") args.model = argv[++i];
    else if (a === "--variant") args.variant = argv[++i];
    else if (a === "--max-cycles") args.maxCycles = Number(argv[++i]);
    else if (a === "--max-inner-cycles") args.maxInnerCycles = Number(argv[++i]);
    else if (a === "--max-total-steps") args.maxTotalSteps = Number(argv[++i]);
    else if (a === "--test") args.testMode = true;
    else if (a === "--step") args.entryStep = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
    else if (!a.startsWith("--")) positional.push(a);
    i++;
  }
  args.command = positional[0] || null;
  const rest = positional.slice(1);
  if (args.command === "run") {
    args.mission = rest[0] || "";
  } else if (args.command === "draft") {
    args.draftDesc = rest.join(" ").trim();
  } else if (args.command === "list") {
    if (rest[0]) args.listTarget = rest[0];
  } else if (args.command === "help") {
    if (rest[0]) args.helpTarget = rest[0];
  }
  return args;
}

// --- Flow introspection ---

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
  console.log("Usage: mission-driver run <mission> --step <STEP_NAME> to start from a specific step");
}

// --- Help rendering (registry-driven, k8s-style) ---

function renderOptions(opts, label) {
  if (!opts || !opts.length) return "";
  const width = Math.max(...opts.map((o) => o.flag.length));
  const lines = [label];
  for (const o of opts) lines.push(`  ${o.flag.padEnd(width)}  ${o.desc}`);
  return lines.join("\n") + "\n";
}

function printUsage() {
  const names = Object.keys(COMMANDS);
  const rows = names.map((n) => ({
    head: `${n}${COMMANDS[n].args ? " " + COMMANDS[n].args : ""}`,
    summary: COMMANDS[n].summary,
  }));
  const w = Math.max(...rows.map((r) => r.head.length));
  console.log("Usage: mission-driver <command> [options]");
  console.log("");
  console.log("Commands:");
  for (const r of rows) console.log(`  ${r.head.padEnd(w)}  ${r.summary}`);
  console.log("");
  process.stdout.write(renderOptions(GLOBAL_OPTIONS, "Global options:"));
  console.log("Run 'mission-driver help <command>' for command-specific help.");
}

function printCommandHelp(name) {
  const c = COMMANDS[name];
  console.log(`Usage: mission-driver ${name}${c.args ? " " + c.args : ""} [options]`);
  if (c.description) console.log(`\n${c.description}`);
  const opts = [...(c.options || []), ...GLOBAL_OPTIONS];
  if (opts.length) {
    console.log("");
    process.stdout.write(renderOptions(opts, "Options:"));
  }
}

// --- Command handlers ---

function cmdList(args) {
  const target = args.listTarget;
  if (target === "missions" || target === "mission") {
    const projectRoot = resolveProjectRoot(args);
    const missionsDir = resolveMissionsDir(projectRoot, args);
    console.log(`Missions in ${missionsDir}:`);
    console.log(listMissionsString(missionsDir));
    return;
  }
  if (target === "steps" || target === "step") {
    printStepList();
    return;
  }
  console.error(`Unknown list target "${target}". Valid targets: missions, steps.`);
  process.exitCode = 2;
}

async function cmdDraft(args) {
  if (!args.draftDesc) {
    console.error("draft requires a description: mission-driver draft <description>");
    process.exitCode = 2;
    return;
  }
  const config = resolveDraftConfig(args);
  const runner = await createRunner(config);
  try {
    const promptFile = resolve(dirname(fileURLToPath(import.meta.url)), "..", "prompts", "mission-draft.md");
    const rawPrompt = readFileSync(promptFile, "utf8");
    const prompt = resolveTemplateVars(rawPrompt, {
      missionsDir: config.missionsDir,
      projectRoot: config.projectRoot,
    });
    const result = await runner.runAgent({
      prompt: `${prompt}\n\n## User Request\n\nGenerate a mission.json for: ${config.draftDesc}\n\nProject root: ${config.projectRoot}`,
      model: config.model,
    });
    console.log("\n" + result.content);
  } finally {
    await runner.close();
  }
}

async function cmdRun(args) {
  const config = resolveConfig(args);
  const runner = await createRunner(config);

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
  console.log(`Model:      ${config.model}${config.variant ? " (variant=" + config.variant + ")" : ""}`);
  const stepModelEntries = Object.entries(config.stepModels || {});
  if (stepModelEntries.length > 0) {
    console.log(`Step models:`);
    for (const [step, m] of stepModelEntries) {
      console.log(`  ${step}: ${m.model || "(default)"}${m.variant ? " variant=" + m.variant : ""}`);
    }
  }
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
        console.error(`ERROR: step "${args.entryStep}" not found in flow. Use 'mission-driver list steps' to see available steps.`);
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

function cmdHelp(args) {
  if (args.helpTarget) {
    if (COMMANDS[args.helpTarget]) {
      printCommandHelp(args.helpTarget);
    } else {
      console.error(`Unknown command "${args.helpTarget}". Valid commands: ${Object.keys(COMMANDS).join(", ")}.`);
      process.exitCode = 2;
    }
    return;
  }
  printUsage();
}

// --- Command registry (single source of truth for dispatch + help) ---

const COMMANDS = {
  run: {
    args: "<mission>",
    summary: "Run the full mission-driver flow",
    description: "Execute the mission-driver development loop for <mission>: health-check → execute plans → draft plans → review plans → deep audit.",
    options: RUN_OPTIONS,
    handler: cmdRun,
  },
  draft: {
    args: "<description>",
    summary: "Generate a new missions/<name>.json via AI",
    description: "Read project structure + the given objective and have the AI produce a mission config at missions/<name>.json.",
    options: DRAFT_OPTIONS,
    handler: cmdDraft,
  },
  list: {
    args: "[missions|steps]",
    summary: "List missions (default) or flow steps",
    description: "With no target or 'missions', list mission configs in the missions dir. With 'steps', list the flow's top-level step names (for use with 'run --step').",
    options: LIST_OPTIONS,
    handler: cmdList,
  },
  help: {
    args: "[command]",
    summary: "Show help for a command",
    description: "With no argument, list all commands. With a command name, show that command's options.",
    options: [],
    handler: cmdHelp,
  },
};

// --- Dispatch ---

async function main() {
  const args = parseArgs(process.argv);

  // -h / --help: route by command context (per-command help, k8s-style)
  if (args.help) {
    if (args.command && COMMANDS[args.command] && args.command !== "help") {
      printCommandHelp(args.command);
    } else {
      printUsage();
    }
    return;
  }

  if (!args.command) {
    printUsage();
    console.error("\nError: no command given.");
    process.exitCode = 2;
    return;
  }

  const cmd = COMMANDS[args.command];
  if (!cmd) {
    console.error(`Unknown command "${args.command}". Valid commands: ${Object.keys(COMMANDS).join(", ")}.`);
    console.error("Run 'mission-driver help' to see all commands.");
    process.exitCode = 2;
    return;
  }

  await cmd.handler(args);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
