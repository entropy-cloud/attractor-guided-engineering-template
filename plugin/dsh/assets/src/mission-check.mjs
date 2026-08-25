/**
 * mission-check.mjs — mission.json validator (parallel to plan-check.mjs for plans).
 *
 * Validates that a mission config has the required fields and that its paths
 * exist on disk. This is a FIXED contract validator — it enforces the mission
 * schema for ANY project, does not read project-specific config.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const REQUIRED_FIELDS = ["name", "roadmapPath", "plansDir", "commands"];
const REQUIRED_COMMANDS = ["test"];

/**
 * Shallow-merge base config into mission. Merge priority (low → high):
 *   1. `{extends}.json` — shared base
 *   2. `{extends}.local.json` (if exists) — per-user overrides, NOT committed
 *   3. mission.json fields — per-mission overrides
 * `extends` may be a filename (resolved relative to the mission file's
 * directory) or an absolute path.
 */
function resolveExtends(mission, missionDir) {
  const baseName = mission.extends;
  if (!baseName) return { ...mission };
  const baseFile = resolve(missionDir, `${baseName}.json`);
  if (!existsSync(baseFile)) {
    throw new Error(`extends target not found: ${baseFile}`);
  }
  const base = JSON.parse(readFileSync(baseFile, "utf8"));
  // Recursively resolve nested extends (base may extend another base).
  const resolved = resolveExtends(base, missionDir);
  // Strip _-prefixed internal keys from both base and mission.
  const stripMeta = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([k]) => !k.startsWith("_"))
  );
  // User-local overrides: {extends}.local.json takes precedence over base
  // but can still be overridden by mission-specific fields.
  const localFile = resolve(missionDir, `${baseName}.local.json`);
  let localOverrides = {};
  if (existsSync(localFile)) {
    localOverrides = stripMeta(JSON.parse(readFileSync(localFile, "utf8")));
  }
  // Remove `extends` (load-time directive) from mission.
  const { extends: _, ...missionRest } = mission;
  // Merge: base → local → mission (later wins in shallow merge).
  const merged = { ...stripMeta(resolved), ...localOverrides, ...stripMeta(missionRest) };
  return merged;
}

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
      ["promptsDir", mission.promptsDir],
      // M2/WI13: optional autonomyPolicy joins the set-if-present existence
      // family (typo fail-fast, same as contextDir/moduleDir/promptsDir).
      ["autonomyPolicy", mission.autonomyPolicy],
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
  const missionDir = dirname(missionFile);
  const raw = JSON.parse(readFileSync(missionFile, "utf8"));
  const mission = resolveExtends(raw, missionDir);
  const { valid, errors } = validateMission(mission, projectRoot);
  if (!valid) {
    throw new Error(`Invalid mission '${missionFile}':\n  ${errors.join("\n  ")}`);
  }
  return mission;
}

/**
 * Ancestor walk from a plan file: the first missions/*.json whose resolved
 * plansDir CONTAINS the plan is the owning mission (plansDir is the
 * discriminator — several missions may share a project root). Full extends
 * resolution via loadMission; unvalidatable files (base configs / invalid
 * missions) skip. Shared by gate-check.mjs --verify and the plan-check.mjs
 * CLI default-verify-key injection (age-autonomy M2-WI41).
 * @param {string} planAbs absolute path to the plan file
 * @returns {{ mission: object, projectRoot: string, missionFile: string } | null}
 */
export function discoverOwningMission(planAbs) {
  let dir = dirname(planAbs);
  for (;;) {
    const missionsDir = join(dir, "missions");
    if (existsSync(missionsDir)) {
      for (const entry of readdirSync(missionsDir)) {
        if (!entry.endsWith(".json")) continue;
        const missionFile = join(missionsDir, entry);
        try {
          const mission = loadMission(missionFile, dir);
          if (typeof mission.plansDir === "string" && mission.plansDir !== "") {
            const plansAbs = resolve(dir, mission.plansDir);
            if (planAbs === plansAbs || planAbs.startsWith(plansAbs + "/") || planAbs.startsWith(plansAbs + "\\")) {
              return { mission, projectRoot: dir, missionFile };
            }
          }
        } catch {
          // base configs / invalid missions do not own plan dirs
        }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * One-mission-one-roadmap boundary check (01-file-ledger boundary clause,
 * M2-WI21): scan every missions/*.json in one directory and verify no
 * roadmapPath is declared by two missions (mission config → roadmap must be a
 * unique reverse mapping). Malformed configs contribute no claim (the
 * passive-scan zero-root precedent). fail-fast load face, not a write-time
 * interception.
 * @param {string} missionsDir absolute path to a missions/ directory
 * @returns {{ ok: boolean, conflicts: Array<{ roadmapPath: string, missions: string[] }>, errors: string[] }}
 */
export function checkRoadmapUniqueness(missionsDir) {
  const claims = new Map();
  let entries = [];
  try {
    entries = readdirSync(missionsDir);
  } catch {
    return { ok: true, conflicts: [], errors: [] };
  }
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = JSON.parse(readFileSync(join(missionsDir, entry), "utf8"));
      if (raw !== null && typeof raw === "object" && typeof raw.roadmapPath === "string" && raw.roadmapPath !== "") {
        const resolved = toPosix(resolve(missionsDir, "..", raw.roadmapPath));
        if (!claims.has(resolved)) claims.set(resolved, []);
        claims.get(resolved).push(String(raw.name ?? entry.replace(/\.json$/, "")));
      }
    } catch {
      // malformed mission config contributes no roadmap claim
    }
  }
  const conflicts = [...claims.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([roadmapPath, missions]) => ({ roadmapPath, missions }));
  const errors = conflicts.map(
    (c) =>
      `one-mission-one-roadmap violated: roadmap ${c.roadmapPath} is declared by multiple missions (${c.missions.join(", ")}) — a roadmap belongs to exactly one mission (01-file-ledger boundary)`,
  );
  return { ok: errors.length === 0, conflicts, errors };
}

function toPosix(p) {
  return String(p).split("\\").join("/");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, root] = process.argv.slice(2);
  if (!file) {
    console.error("Usage: mission-check.mjs <mission.json> [projectRoot]");
    process.exit(2);
  }
  try {
    const mission = loadMission(file, root);
    // Sibling boundary check (M2-WI21): one mission per roadmap across the
    // whole missions/ directory — a load-face error, exit 1.
    const uniqueness = checkRoadmapUniqueness(dirname(resolve(file)));
    if (!uniqueness.ok) {
      console.error(uniqueness.errors.join("\n"));
      process.exit(1);
    }
    console.log(JSON.stringify({ valid: true, name: mission.name, file }, null, 2));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
