import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadMission } from "./mission-check.mjs";

/**
 * Mission-based config resolver.
 *
 * A "mission" is a fixed project config (missions/<name>.json) that tells the
 * generic engine where the roadmap lives, where plans live, what test/build
 * commands to run, etc. The engine makes zero project-specific assumptions;
 * every project path comes from the mission.
 *
 * CLI: node main.js <mission-name>
 *      node main.js <mission-name> --missions-dir ./missions
 *      node main.js --list-missions
 */

function listMissionsString(missionsDir) {
  if (!existsSync(missionsDir)) return `(missions dir not found: ${missionsDir})`;
  const missions = readdirSync(missionsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => "  " + f.replace(".json", ""));
  return missions.length ? missions.join("\n") : "(no missions found)";
}

export function resolveConfig(args = {}) {
  const projectRoot = args.dir || process.env.PROJECT_ROOT || process.cwd();
  const missionsDir = args.missionsDir
    ? resolve(projectRoot, args.missionsDir)
    : resolve(projectRoot, "missions");
  const dryRun = args.dryRun === true;
  const testMode = args.testMode === true;

  const agent = args.agent || process.env.OPENCODE_AGENT || "build";
  const model = args.model || process.env.OPENCODE_MODEL || "zhipuai-coding-plan/glm-5.2";
  const maxCycles = args.maxCycles || Number(process.env.MAX_CYCLES) || undefined;
  const maxInnerCycles = args.maxInnerCycles || Number(process.env.MAX_INNER_CYCLES) || undefined;
  const maxTotalSteps = args.maxTotalSteps || Number(process.env.MAX_TOTAL_STEPS) || undefined;

  if (args.draftMission) {
    const runDir = resolve(projectRoot, "_tmp", `draft-mission-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });
    return {
      projectRoot, missionsDir, runDir,
      missionName: null, mission: null,
      draftMission: args.draftMission,
      agent: args.agent || "build",
      model: args.model || "zhipuai-coding-plan/glm-5.2",
      dryRun, testMode,
      logFile: resolve(runDir, "mission-draft.log"),
    };
  }

  if (args.listMissions) {
    console.log(`Missions in ${missionsDir}:`);
    console.log(listMissionsString(missionsDir));
    process.exit(0);
  }

  const missionName = args.mission || args.module || "";
  if (!missionName) {
    throw new Error(
      `mission name is required: mission-driver.sh <mission-name>\n` +
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
    agent,
    model,
    maxCycles,
    maxInnerCycles,
    maxTotalSteps,
    dryRun,
    testMode,
    logFile: resolve(runDir, `${missionName}.log`),
  };
}
