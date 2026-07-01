import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadMission } from "./mission-check.mjs";

/**
 * Mission-based config resolvers.
 *
 * A "mission" is a fixed project config (missions/<name>.json) that tells the
 * generic engine where the roadmap lives, where plans live, what test/build
 * commands to run, etc. The engine makes zero project-specific assumptions;
 * every project path comes from the mission.
 *
 * CLI:
 *   node main.js run <mission-name>
 *   node main.js run <mission-name> --missions-dir ./missions
 *   node main.js list missions
 *   node main.js draft <description>
 *
 * These resolvers are pure: they throw on bad input but never call
 * process.exit() or print to stdout. Command dispatch and output live in
 * main.js.
 */

export function resolveProjectRoot(args = {}) {
  return args.dir || process.env.PROJECT_ROOT || process.cwd();
}

export function resolveMissionsDir(projectRoot, args = {}) {
  return args.missionsDir ? resolve(projectRoot, args.missionsDir) : resolve(projectRoot, "missions");
}

export function listMissionsString(missionsDir) {
  if (!existsSync(missionsDir)) return `(missions dir not found: ${missionsDir})`;
  const missions = readdirSync(missionsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => "  " + f.replace(".json", ""));
  return missions.length ? missions.join("\n") : "(no missions found)";
}

function resolveCommon(args) {
  return {
    agent: args.agent || process.env.OPENCODE_AGENT || "build",
    model: args.model || process.env.OPENCODE_MODEL || "zhipuai-coding-plan/glm-5.2",
    maxCycles: args.maxCycles || Number(process.env.MAX_CYCLES) || undefined,
    maxInnerCycles: args.maxInnerCycles || Number(process.env.MAX_INNER_CYCLES) || undefined,
    maxTotalSteps: args.maxTotalSteps || Number(process.env.MAX_TOTAL_STEPS) || undefined,
  };
}

export function resolveConfig(args = {}) {
  const projectRoot = resolveProjectRoot(args);
  const missionsDir = resolveMissionsDir(projectRoot, args);

  const missionName = args.mission || "";
  if (!missionName) {
    throw new Error(
      `mission name is required: mission-driver run <mission-name>\n` +
      `Available missions:\n${listMissionsString(missionsDir)}`
    );
  }

  const missionFile = resolve(missionsDir, `${missionName}.json`);
  if (!existsSync(missionFile)) {
    throw new Error(
      `mission '${missionName}' not found: ${missionFile}\n` +
      `Available missions:\n${listMissionsString(missionsDir)}`
    );
  }
  const mission = loadMission(missionFile, projectRoot);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const ts =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const timestamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-` +
    `${pad(now.getHours())}${pad(now.getMinutes())}`;
  const runDir = resolve(projectRoot, "_tmp", `${ts}-mission-driver`);
  mkdirSync(runDir, { recursive: true });

  return {
    projectRoot,
    missionsDir,
    missionName,
    mission,
    runDir,
    timestamp,
    ...resolveCommon(args),
    dryRun: args.dryRun === true,
    testMode: args.testMode === true,
    logFile: resolve(runDir, `${missionName}.log`),
  };
}

export function resolveDraftConfig(args = {}) {
  const projectRoot = resolveProjectRoot(args);
  const missionsDir = resolveMissionsDir(projectRoot, args);
  const runDir = resolve(projectRoot, "_tmp", `draft-mission-${Date.now()}`);
  mkdirSync(runDir, { recursive: true });
  return {
    projectRoot,
    missionsDir,
    runDir,
    missionName: null,
    mission: null,
    draftDesc: args.draftDesc || "",
    ...resolveCommon(args),
    dryRun: false,
    testMode: false,
    logFile: resolve(runDir, "mission-draft.log"),
  };
}
