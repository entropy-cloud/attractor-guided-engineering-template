/**
 * mission-check.mjs — mission.json validator (parallel to plan-check.mjs for plans).
 *
 * Validates that a mission config has the required fields and that its paths
 * exist on disk. This is a FIXED contract validator — it enforces the mission
 * schema for ANY project, does not read project-specific config.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_FIELDS = ["name", "roadmapPath", "plansDir", "commands"];
const REQUIRED_COMMANDS = ["test"];

/**
 * Validate a mission object (already parsed).
 * @param {object} mission
 * @param {string} [projectRoot] - if given, checks path existence
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateMission(mission, projectRoot) {
  const errors = [];

  for (const f of REQUIRED_FIELDS) {
    if (!mission[f]) errors.push(`missing required field: ${f}`);
  }

  if (mission.commands) {
    for (const c of REQUIRED_COMMANDS) {
      if (!mission.commands[c]) errors.push(`commands.${c} is required`);
    }
  } else if (mission.commands !== undefined) {
    errors.push("commands must be an object");
  }

  if (projectRoot) {
    for (const [field, val] of [
      ["roadmapPath", mission.roadmapPath],
      ["plansDir", mission.plansDir],
      ["contextDir", mission.contextDir],
      ["moduleDir", mission.moduleDir],
    ]) {
      if (val && !existsSync(resolve(projectRoot, val))) {
        errors.push(`${field} does not exist: ${val}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load and validate a mission json file.
 * @param {string} missionFile - absolute path to missions/<name>.json
 * @param {string} [projectRoot]
 * @returns {object} the parsed mission
 * @throws if invalid
 */
export function loadMission(missionFile, projectRoot) {
  const mission = JSON.parse(readFileSync(missionFile, "utf8"));
  const { valid, errors } = validateMission(mission, projectRoot);
  if (!valid) {
    throw new Error(`Invalid mission '${missionFile}':\n  ${errors.join("\n  ")}`);
  }
  return mission;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [file, root] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: mission-check.mjs <mission.json> [projectRoot]");
    process.exit(2);
  }
  try {
    const mission = loadMission(file, root);
    console.log(JSON.stringify({ valid: true, name: mission.name, file }, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
