#!/usr/bin/env node
// tools/install-age.mjs — AGE scaffold installer (Node ESM, zero npm deps).
//
// Ports install-age.sh logic to Node for cross-platform support (no Git Bash
// required on Windows). Reads install-age.manifest, copies files (skip existing),
// applies flags (exec / fill / rel-mdh), then runs dynamic post-steps.
//
// Entry points: ./install-age.sh (Unix shim) | install-age.cmd (Windows) |
//               node tools/install-age.mjs (universal)

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  chmodSync,
  statSync,
} from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { hash, safePath, listFiles, readOrigin, ORIGIN_FILE } from "./age-drift.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Types (JSDoc — IDE hints without a compile step)
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} ManifestEntry
 * @property {string} src        - source path relative to template root
 * @property {string} dst        - destination path relative to target
 * @property {string[]} flags    - parsed flags: 'exec' | 'fill' | 'rel-mdh'
 */

// ---------------------------------------------------------------------------
// Manifest parsing
// ---------------------------------------------------------------------------

/**
 * Parse one manifest line into {src, dst, flags}.
 * Format: <src> ["> <dst>] [":: <flag>[,<flag>]]
 * Default dst = src with leading template/ stripped.
 * @param {string} raw - raw manifest line (may contain comments)
 * @returns {ManifestEntry | null} null for blank/comment lines
 */
export function parseManifestLine(raw) {
  // Strip comments and trim.
  let line = raw.split("#")[0];
  line = line.trim();
  if (!line) return null;

  // Extract flags (:: flag,flag)
  let flags = [];
  if (line.includes(" :: ")) {
    const idx = line.indexOf(" :: ");
    flags = line.slice(idx + 4).trim().split(",").map((f) => f.trim()).filter(Boolean);
    line = line.slice(0, idx);
  }

  // Extract dst override (> dst)
  let src, dst;
  if (line.includes(" > ")) {
    const idx = line.indexOf(" > ");
    src = line.slice(0, idx).trim();
    dst = line.slice(idx + 3).trim();
  } else {
    src = line;
    dst = src.startsWith("template/") ? src.slice("template/".length) : src;
  }

  const allowed = new Set(["exec", "fill", "rel-mdh", "mdh-only", "pi-only", "profile-frontend", "profile-java"]);
  if (flags.some((flag) => !allowed.has(flag)) || new Set(flags).size !== flags.length) {
    throw new Error(`Invalid manifest flags: ${raw}`);
  }
  for (const path of [src, dst]) safePath(__dirname, path);
  if ([src, dst].some((path) => path.includes(">") || path.includes("::"))) {
    throw new Error(`Invalid manifest entry: ${raw}`);
  }
  return { src, dst, flags };
}

/**
 * Read and parse the manifest file.
 * @param {string} manifestPath
 * @returns {ManifestEntry[]}
 */
export function readManifest(manifestPath) {
  const content = readFileSync(manifestPath, "utf8");
  return content
    .split(/\r?\n/)
    .map(parseManifestLine)
    .filter((e) => e !== null);
}

// ---------------------------------------------------------------------------
// Flag application
// ---------------------------------------------------------------------------

/**
 * Apply a single flag to a copied file (in-place edit).
 * @param {string} filePath - the copied destination file
 * @param {string} flag     - 'exec' | 'fill' | 'rel-mdh'
 * @param {{projectName: string, relMdh: string}} ctx
 */
export function applyFlag(filePath, flag, ctx) {
  switch (flag) {
    case "exec":
      // chmod +x (Unix); no-op on Windows (exec bit is meaningless).
      if (process.platform !== "win32") {
        try {
          const st = statSync(filePath);
          chmodSync(filePath, st.mode | 0o111);
        } catch {
          /* best-effort */
        }
      }
      break;
    case "fill": {
      const content = readFileSync(filePath, "utf8");
      writeFileSync(filePath, content.replace(/<project-name>/g, () => ctx.projectName));
      break;
    }
    case "rel-mdh": {
      const content = readFileSync(filePath, "utf8");
      writeFileSync(filePath, content.replace(/__REL_MDH__/g, () => ctx.relMdh));
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Gitignore helper
// ---------------------------------------------------------------------------

/**
 * Ensure a line exists in the target .gitignore (append if missing).
 * @param {string} gitignorePath
 * @param {string} entry
 */
export function ensureGitignoreEntry(gitignorePath, entry) {
  let content = "";
  try {
    content = readFileSync(gitignorePath, "utf8");
  } catch {
    /* file may not exist yet */
  }
  const lines = content.split(/\r?\n/);
  if (!lines.includes(entry)) {
    appendFileSync(gitignorePath, (content && !content.endsWith("\n") ? "\n" : "") + entry + "\n", "utf8");
  }
}

// ---------------------------------------------------------------------------
// Main install logic
// ---------------------------------------------------------------------------

const PROFILES = ["none", "frontend", "java", "all"];

export function selectEntries(entries, { withPi = false, withMissionDriver = false, profile = "none" }) {
  if (!PROFILES.includes(profile)) throw new Error(`Invalid profile: ${profile}`);
  return entries.filter(({ flags }) =>
    (!flags.includes("pi-only") || withPi) &&
    (!flags.includes("mdh-only") || withMissionDriver) &&
    (!flags.some((f) => f.startsWith("profile-")) || profile === "all" || flags.includes(`profile-${profile}`)));
}

// Render the catalog from the canonical registry; do not maintain a second list.
export function renderRegistry(content, profile) {
  return content.replace(/### (common|frontend|java)\/[^]*?(?=\n### |\n## |$)/g, (section, shelf) => {
    const installed = shelf === "common" || profile === "all" || profile === shelf;
    return installed ? section.replace(`### ${shelf}/`, `### ${shelf}/ (installed)`)
      : `### ${shelf} (optional — not installed)\n\nAvailable from the template with --profile ${shelf} or --profile all.\n`;
  });
}

function renderEntry(entry, bytes, ctx, profile) {
  if (entry.flags.includes("fill") || (entry.src.startsWith("template/") && entry.dst.endsWith(".md"))) {
    bytes = Buffer.from(bytes.toString("utf8").replace(/<project-name>/g, () => ctx.projectName));
  }
  if (entry.flags.includes("rel-mdh")) {
    bytes = Buffer.from(bytes.toString("utf8").replace(/__REL_MDH__/g, () => ctx.relMdh));
  }
  if (entry.dst === "docs/skills/README.md") bytes = Buffer.from(renderRegistry(bytes.toString("utf8"), profile));
  return bytes;
}

// Catalog and pi parity are preflight invariants, not just happy-path tests.
export function validateParity(files, withPi) {
  const registry = files.get("docs/skills/README.md")?.bytes.toString("utf8");
  if (!registry) throw new Error("Missing skill registry");
  const declared = [...registry.matchAll(/`((?:common|frontend|java)\/[^`]+\.md)`/g)].map((m) => `docs/skills/${m[1]}`);
  const delivered = [...files.keys()].filter((p) => /^docs\/skills\/(common|frontend|java)\/.*\.md$/.test(p) && !p.endsWith("/README.md"));
  if (!declared.length || !delivered.length || new Set(declared).size !== declared.length || declared.some((p) => !files.has(p)) || delivered.some((p) => !declared.includes(p))) {
    throw new Error("Skill registry/profile parity mismatch");
  }
  if (withPi) {
    const canonical = [...files.keys()].filter((p) => p.startsWith(".agents/skills/") && !p.endsWith("/README.md"));
    const mirrors = [...files.keys()].filter((p) => p.startsWith(".pi/skills/"));
    if (!canonical.length || canonical.length !== mirrors.length || canonical.some((p) => {
      const mirror = files.get(p.replace(".agents/", ".pi/"));
      return !mirror || !files.get(p).bytes.equals(mirror.bytes);
    })) throw new Error("Pi bridge/canonical skill parity mismatch");
  }
}

/**
 * Preflight and install the scaffold without overwriting existing files.
 * @param {{target: string, projectName: string, withPi?: boolean,
 *          withMissionDriver?: boolean, profile?: string}} opts
 */
export async function installAge(opts) {
  const { target, projectName, withPi = false, withMissionDriver = false, profile = "none" } = opts;
  const templateRoot = resolve(__dirname, "..");
  if (!existsSync(target) || !statSync(target).isDirectory()) throw new Error("Target must be an existing directory");
  if (typeof projectName !== "string" || !projectName.trim()) throw new Error("Project name must not be empty");
  const options = { withPi, withMissionDriver, profile };
  const previous = readOrigin(target);
  const entries = selectEntries(readManifest(join(templateRoot, "install-age.manifest")), options);
  const ctx = { projectName, relMdh: "tools/mission-driver" };
  const files = new Map();
  const destinations = new Set();
  const sourceHashes = [];
  const add = (entry) => {
    const key = entry.dst.toLowerCase(); // Keep manifests portable to case-insensitive filesystems.
    if (destinations.has(key) || [ORIGIN_FILE, ".env", ".gitignore"].includes(key)) {
      throw new Error(`Duplicate/reserved manifest destination: ${entry.dst}`);
    }
    destinations.add(key);
    const src = safePath(templateRoot, entry.src);
    if (!existsSync(src) || !statSync(src).isFile()) throw new Error(`Required source missing: ${entry.src}`);
    const bytes = readFileSync(src);
    sourceHashes.push([entry.src, entry.dst, hash(bytes), entry.flags]);
    files.set(entry.dst, { ...entry, mode: statSync(src).mode & 0o777, bytes: renderEntry(entry, bytes, ctx, profile) });
  };
  for (const entry of entries) add(entry);
  validateParity(files, withPi);
  // A consumer's canonical operational skill wins over the template. The opt-in
  // mirror is derived from those effective bytes, never the other way around.
  if (withPi) {
    for (const [path, file] of files) {
      if (!path.startsWith(".agents/skills/") || path.endsWith("/README.md")) continue;
      const canonical = safePath(target, path);
      if (existsSync(canonical) && statSync(canonical).isFile()) {
        const effective = readFileSync(canonical);
        if (previous && hash(effective) !== previous.files[path]) {
          throw new Error(`Canonical skill drift (no files written): ${path}`);
        }
        file.bytes = effective;
      }
      const mirror = files.get(path.replace(".agents/", ".pi/"));
      if (mirror) mirror.bytes = file.bytes;
    }
  }
  validateParity(files, withPi);
  if (withMissionDriver) {
    const engine = safePath(templateRoot, "tools/mission-driver");
    if (!existsSync(join(engine, "src", "main.js"))) throw new Error("Required engine source missing: src/main.js");
    for (const path of listFiles(engine)) {
      add({ src: `tools/mission-driver/${path}`, dst: `tools/mission-driver/${path}`, flags: [] });
    }
  }
  // Hash source bytes and mappings, not repository path, git remote, configuration or secrets.
  const sourceHash = hash(JSON.stringify([
    hash(readFileSync(__filename)), hash(readFileSync(join(templateRoot, "install-age.manifest"))), sourceHashes,
  ]));
  if (previous && JSON.stringify(previous.options) !== JSON.stringify(options)) {
    throw new Error("Installation options differ from origin; no automatic reconfiguration (no files written)");
  }
  const engineTarget = safePath(target, "tools/mission-driver");
  if (withMissionDriver && existsSync(engineTarget) && readdirSync(engineTarget).length) {
    if (!previous?.options?.withMissionDriver || previous.sourceHash !== sourceHash) {
      throw new Error("Engine conflict: unknown/incompatible origin; no files written");
    }
    const actual = listFiles(engineTarget).map((p) => `tools/mission-driver/${p}`);
    const expected = [...files.keys()].filter((p) => p.startsWith("tools/mission-driver/"));
    if (actual.length !== expected.length || actual.some((p) => !files.has(p)) || expected.some((p) =>
      !existsSync(safePath(target, p)) || hash(readFileSync(safePath(target, p))) !== hash(files.get(p).bytes))) {
      throw new Error("Engine conflict: content/inventory differs; no files written");
    }
  }
  if (previous && previous.sourceHash !== sourceHash) {
    throw new Error("Origin source conflict; no automatic upgrade (no files written)");
  }
  const conflicts = [];
  for (const [path, file] of files) {
    const dst = safePath(target, path);
    if (existsSync(dst)) {
      if (!statSync(dst).isFile()) throw new Error(`Destination is not a file: ${path}`);
      if (!readFileSync(dst).equals(file.bytes)) conflicts.push(path);
    }
    // Detect a file where a parent directory is needed before writing anything.
    let parent = dirname(dst);
    while (parent !== resolve(target)) {
      if (existsSync(parent) && !statSync(parent).isDirectory()) throw new Error(`Destination parent is not a directory: ${path}`);
      parent = dirname(parent);
    }
  }
  // Report all existing scaffold conflicts before copying any missing files.
  if (previous && conflicts.length) throw new Error(`Scaffold conflict (no files written): ${conflicts.join(", ")}`);
  if (conflicts.some((path) => path.startsWith(".pi/skills/") || path === "docs/skills/README.md")) {
    throw new Error(`Capability parity conflict (no files written): ${conflicts.join(", ")}`);
  }
  const year = new Date().getFullYear();
  const dirs = [`docs/logs/${year}`, ...(withMissionDriver ? ["docs/plans/onboarding"] : [])];
  for (const path of [".gitignore", ...(withMissionDriver ? [".env"] : []), ...dirs]) {
    const full = safePath(target, path);
    if (existsSync(full) && (dirs.includes(path) ? !statSync(full).isDirectory() : !statSync(full).isFile())) {
      throw new Error(`Invalid dynamic destination: ${path}`);
    }
  }
  console.log(`Target: ${target}\nProject name: ${projectName}\nSkills profile: ${profile}`);
  const recorded = { ...(previous?.files || {}) };
  let copied = 0;
  for (const [path, file] of files) {
    const dst = safePath(target, path);
    if (conflicts.includes(path)) {
      console.log(`CONFLICT preserved existing customization (not managed): ${path}`);
      continue;
    }
    if (!existsSync(dst)) {
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, file.bytes, { mode: file.mode });
      if (file.flags.includes("exec")) applyFlag(dst, "exec", ctx);
      copied++;
    }
    recorded[path] = hash(file.bytes);
  }
  if (withMissionDriver) {
    const envPath = safePath(target, ".env");
    const content = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
    if (!/^\s*(?:export\s+)?MISSION_DRIVER_HOME\s*=/m.test(content)) {
      appendFileSync(envPath, `${content && !content.endsWith("\n") ? "\n" : ""}MISSION_DRIVER_HOME=tools/mission-driver\n`, "utf8");
    }
  }
  for (const path of dirs) mkdirSync(safePath(target, path), { recursive: true });
  for (const entry of [".env", "_tmp/", "tmp/"]) ensureGitignoreEntry(safePath(target, ".gitignore"), entry);
  const origin = { schema: 1, sourceHash, options, files: recorded };
  const metadata = JSON.stringify(origin, null, 2) + "\n";
  const originPath = safePath(target, ORIGIN_FILE);
  if (!existsSync(originPath) || readFileSync(originPath, "utf8") !== metadata) writeFileSync(originPath, metadata);
  console.log(`Copied ${copied} files; preserved ${conflicts.length} existing customizations.`);
  console.log("Fill docs/context/project-context.md verification commands before executing work.");
  console.log("Read docs/guides/doc-organization.md; enable hooks with git config core.hooksPath .githooks.");
  console.log("Read-only drift: node tools/age-drift.mjs (exit 0 unchanged, 1 drift, 2 invalid/unknown origin).");
  if (withPi) console.log("Pi skill mirror delivered; host loading/trust has not been tested by this installer.");
  if (withMissionDriver) console.log("Engine vendored locally. Fill missions/base.json commands before running missions.");
  return { copied, conflicts, sourceHash };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  // Parse argv: positional (target, projectName) + flags (--pi,
  // --with-mission-driver, --profile <shelf|all>). Flags may appear anywhere
  // after the script name, so scan rather than index fixed positions.
  const flags = new Set();
  const positional = [];
  let profile = "none";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") {
      profile = argv[i + 1];
      if (!profile || profile.startsWith("-")) throw new Error("--profile requires a value");
      i++;
    } else if (a.startsWith("--profile=")) {
      profile = a.slice("--profile=".length);
    } else if (["--pi", "--with-mission-driver"].includes(a)) {
      flags.add(a.slice(2));
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else {
      positional.push(a);
    }
  }
  if (!PROFILES.includes(profile)) throw new Error(`Invalid profile: ${profile}`);
  if (positional.length > 2) throw new Error("Expected target and optional project name only");
  const withPi = flags.has("pi");
  const withMissionDriver = flags.has("with-mission-driver");
  return { positional, withPi, withMissionDriver, profile };
}

async function main() {
  const { positional, withPi, withMissionDriver, profile } = parseArgs(process.argv.slice(2));

  let targetRaw, projectName;

  if (positional[0]) {
    targetRaw = positional[0];
    projectName = positional[1] || basename(resolve(targetRaw));
  } else {
    // Interactive mode
    const rl = createInterface({ input, output });
    targetRaw = (await rl.question("Target project path (e.g. /c/Work/my-project): ")).trim();
    rl.close();
    if (!targetRaw) throw new Error("Target path must not be empty");
    projectName = basename(resolve(targetRaw));
    console.log(`(project name derived from directory: ${projectName})`);
  }

  // Resolve target to absolute.
  const target = resolve(targetRaw);
  if (!existsSync(target)) {
    console.error("ERROR: target path does not exist:", targetRaw);
    process.exit(1);
  }

  await installAge({ target, projectName, withPi, withMissionDriver, profile });
}

// Run only when invoked directly (not when imported by tests).
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((err) => {
    console.error("ERROR:", err.message);
    process.exit(1);
  });
}
