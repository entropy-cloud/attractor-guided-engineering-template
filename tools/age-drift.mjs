#!/usr/bin/env node
// Read-only consumer provenance inspection; no template checkout or npm deps.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative, isAbsolute, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ORIGIN_FILE = ".age-origin.json";
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function safePath(root, path) {
  if (typeof path !== "string" || !path || path.includes("\\") || path.includes(":")) {
    throw new Error(`Invalid relative path: ${path}`);
  }
  if (path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid relative path: ${path}`);
  }
  const full = resolve(root, path);
  const rel = relative(resolve(root), full);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`Path escapes root: ${path}`);
  }
  // Do not traverse existing symlinks, including dangling links.
  let current = resolve(root);
  for (const part of rel.split(sep)) {
    current = join(current, part);
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink not supported: ${path}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return full;
}

export function readOrigin(target) {
  const path = safePath(target, ORIGIN_FILE);
  if (!existsSync(path)) return null;
  const origin = JSON.parse(readFileSync(path, "utf8"));
  if (origin.schema !== 1 || !/^[a-f0-9]{64}$/.test(origin.sourceHash) ||
      !origin.options || typeof origin.options.withPi !== "boolean" ||
      typeof origin.options.withMissionDriver !== "boolean" ||
      !["none", "frontend", "java", "all"].includes(origin.options.profile) ||
      !origin.files || typeof origin.files !== "object" || Array.isArray(origin.files) || !Object.keys(origin.files).length) {
    throw new Error("Invalid AGE origin metadata");
  }
  for (const [file, digest] of Object.entries(origin.files)) {
    safePath(target, file);
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error(`Invalid origin hash: ${file}`);
  }
  return origin;
}

// Used for engine inventories only. Excluded directories are not delivered.
export function listFiles(root, prefix = "") {
  if (!existsSync(root)) return [];
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink not supported: ${path}`);
    if (entry.isDirectory()) result.push(...listFiles(join(root, entry.name), path));
    else if (entry.isFile()) result.push(path);
    else throw new Error(`Unsupported file: ${path}`);
  }
  return result;
}

export function inspectDrift(target) {
  const origin = readOrigin(target);
  if (!origin) throw new Error(`No ${ORIGIN_FILE}; origin is unknown (no files changed)`);
  const changes = [];
  for (const [file, digest] of Object.entries(origin.files)) {
    const path = safePath(target, file);
    if (!existsSync(path)) changes.push({ path: file, kind: "missing" });
    else if (!lstatSync(path).isFile() || hash(readFileSync(path)) !== digest) {
      changes.push({ path: file, kind: "modified" });
    }
  }
  // Arbitrary consumer files are not drift. Unexpected engine files are.
  if (origin.options?.withMissionDriver) {
    for (const file of listFiles(safePath(target, "tools/mission-driver"))) {
      const path = `tools/mission-driver/${file}`;
      if (!Object.hasOwn(origin.files, path)) changes.push({ path, kind: "unrecorded-engine-file" });
    }
  }
  return { sourceHash: origin.sourceHash, changes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 3) throw new Error("Usage: node tools/age-drift.mjs [target]");
    const result = inspectDrift(resolve(process.argv[2] || "."));
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.changes.length ? 1 : 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
