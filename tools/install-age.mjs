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
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  chmodSync,
  statSync,
} from "node:fs";
import { resolve, relative, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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
      writeFileSync(filePath, content.replace(/<project-name>/g, ctx.projectName));
      break;
    }
    case "rel-mdh": {
      const content = readFileSync(filePath, "utf8");
      writeFileSync(filePath, content.replace(/__REL_MDH__/g, ctx.relMdh));
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

/**
 * Run the full AGE scaffold installation.
 * @param {{target: string, projectName: string}} opts
 */
export async function installAge(opts) {
  const { target, projectName } = opts;
  const templateRoot = resolve(__dirname, "..");
  const manifestPath = join(templateRoot, "install-age.manifest");
  const mdhAbs = join(templateRoot, "tools", "mission-driver");
  const year = new Date().getFullYear();

  // Compute relative MISSION_DRIVER_HOME (target → engine), forward slashes.
  let relMdh = relative(target, mdhAbs).split("\\").join("/");
  if (!relMdh) relMdh = mdhAbs;

  console.log("Target:             ", target);
  console.log("Project name:       ", projectName);
  console.log("Mission-driver home:", relMdh, "(relative from target)");
  console.log("");

  // Pre-flight
  if (!existsSync(manifestPath)) {
    console.error("ERROR: manifest not found:", manifestPath);
    process.exit(1);
  }
  if (!existsSync(join(mdhAbs, "src", "main.js"))) {
    console.error("ERROR: mission-driver engine not found at:", join(mdhAbs, "src", "main.js"));
    console.error("       Run this script from inside the attractor-guided-engineering-template repo.");
    process.exit(1);
  }

  const ctx = { projectName, relMdh };
  const entries = readManifest(manifestPath);
  const copied = [];
  const skipped = [];

  // --- 1. Copy from manifest ---
  console.log("[1/6] Copying scaffold files from manifest...");
  for (const entry of entries) {
    const src = join(templateRoot, entry.src);
    const dst = join(target, entry.dst);

    if (!existsSync(src)) {
      console.error(`  WARN: manifest lists '${entry.src}' but source missing — skipped.`);
      continue;
    }
    if (existsSync(dst)) {
      skipped.push(entry.dst);
      continue;
    }

    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(src, dst);

    // Apply explicit flags.
    for (const flag of entry.flags) {
      applyFlag(dst, flag, ctx);
    }
    // Implicit fill: template/*.md files get <project-name> replaced
    // (backward compat; matches the original bash behavior).
    if (entry.src.startsWith("template/") && entry.dst.endsWith(".md")) {
      if (!entry.flags.includes("fill")) {
        applyFlag(dst, "fill", ctx);
      }
    }

    const flagStr = entry.flags.length ? ` (${entry.flags.join(",")})` : "";
    console.log(`  + ${entry.dst}${flagStr}`);
    copied.push(entry.dst);
  }

  console.log(`      copied ${copied.length} files, skipped ${skipped.length} existing.`);

  // --- 2. Create .env ---
  console.log("[2/6] Ensuring .env...");
  const envPath = join(target, ".env");
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `MISSION_DRIVER_HOME=${relMdh}\n`, "utf8");
    console.log("      created.");
  } else {
    const envContent = readFileSync(envPath, "utf8");
    if (!/^MISSION_DRIVER_HOME=/m.test(envContent)) {
      appendFileSync(envPath, `MISSION_DRIVER_HOME=${relMdh}\n`, "utf8");
    }
    console.log("      .env exists (MISSION_DRIVER_HOME ensured).");
  }

  // --- 3. Create plan directories ---
  console.log("[3/6] Creating plan directories...");
  mkdirSync(join(target, "docs", "plans", "demo"), { recursive: true });
  mkdirSync(join(target, "docs", "plans", "onboarding"), { recursive: true });
  console.log("      done.");

  // --- 4. Create docs/logs/{year}/ ---
  console.log(`[4/6] Creating docs/logs/${year}/...`);
  mkdirSync(join(target, "docs", "logs", String(year)), { recursive: true });
  console.log("      done.");

  // --- 5. Update .gitignore ---
  console.log("[5/6] Updating .gitignore...");
  const giPath = join(target, ".gitignore");
  ensureGitignoreEntry(giPath, ".env");
  ensureGitignoreEntry(giPath, "_tmp/");
  ensureGitignoreEntry(giPath, "tmp/");
  console.log("      done.");

  // --- 6. Report ---
  console.log("[6/6] Report");
  console.log("");
  console.log(`Copied ${copied.length} files, skipped ${skipped.length} existing.`);
  if (skipped.length > 0) {
    console.log("");
    console.log("===== SKIPPED (already exists) =====");
    for (const f of skipped) console.log(`  = ${f}`);
  }
  console.log("");
  console.log("==============================================");
  console.log(`  AGE scaffold installed for: ${projectName}`);
  console.log("==============================================");
  console.log("");
  console.log("Also created (runtime):");
  console.log(`  - .env                               (MISSION_DRIVER_HOME=${relMdh})`);
  console.log("  - docs/plans/demo/                    (empty — engine scans at runtime)");
  console.log("  - docs/plans/onboarding/              (empty — engine scans at runtime)");
  console.log(`  - docs/logs/${year}/                    (daily log dir)`);
  console.log("");
  console.log(`Manifest-copied scaffold: ${copied.length} files (incl. tools/mission-driver.sh shim, .env.example,`);
  console.log("  missions/{base,demo,onboarding}.json, demo-roadmap.md + all docs/ methodology files).");
  console.log("");
  console.log("NEXT STEPS:");
  console.log("  1. (smoke) ./tools/mission-driver.sh run demo");
  console.log("  2. (personalize) ./tools/mission-driver.sh run onboarding");
  console.log("  3. (optional) Fill docs/context/project-context.md verification commands.");
  console.log("  4. (optional) Fill missions/base.json commands.* for YOUR stack.");
  console.log("  5. (manual fallback) Read template/START-HERE-after-copy.md");
  console.log("  6. Verify: ./tools/mission-driver.sh list");
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

async function main() {
  let targetRaw, projectName;

  if (process.argv[2]) {
    targetRaw = process.argv[2];
    projectName = process.argv[3] || basename(resolve(targetRaw));
  } else {
    // Interactive mode
    const rl = createInterface({ input, output });
    targetRaw = (await rl.question("Target project path (e.g. /c/Work/my-project): ")).trim();
    rl.close();
    projectName = basename(resolve(targetRaw));
    console.log(`(project name derived from directory: ${projectName})`);
  }

  // Resolve target to absolute.
  const target = resolve(targetRaw);
  if (!existsSync(target)) {
    console.error("ERROR: target path does not exist:", targetRaw);
    process.exit(1);
  }

  await installAge({ target, projectName });
}

// Run only when invoked directly (not when imported by tests).
const isMain = process.argv[1] && resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((err) => {
    console.error("ERROR:", err.message);
    process.exit(1);
  });
}
