#!/usr/bin/env node
/**
 * build-bundle.mjs — copy-style engine bundling for the DSH plugin
 * (dsh-plugin M2-WI6 Phase 2).
 *
 * What it does:
 *   1. Import-closure assertion (the machine gate for packaging doc
 *      §Packaging Layout): from the entry modules (orchestrator.js /
 *      config.js / engine.js / runner.js / step-executor.js) it computes the
 *      transitive static-import closure inside the engine source tree and
 *      requires it to be a subset of ALLOWED_MODULES. Any import of the
 *      NOT-bundled modules (monitor.js | draft-job.mjs | spawner.mjs |
 *      main.js), any npm package name, or any file escaping the engine src
 *      root (e.g. ../vendor) fails the build. Node builtins are whitelisted.
 *   2. Copies the allowed engine modules to `assets/src/` — relative imports
 *      are preserved verbatim, so `import.meta.url`-relative TOOL_ROOT
 *      resolution (config.js pi persona, flow-loader prompts/flows) keeps its
 *      exact engine semantics with TOOL_ROOT = assets/.
 *   3. Copies the `flows/`, `prompts/`, `agents/` asset dirs to `assets/`.
 *
 * Artifacts are COMMITTED (web/dist "clone-and-run + freshness check"
 * precedent). `--check` recomputes the copy plan and diffs it against the
 * committed tree (content-equality, not mtimes) — exit 1 when stale.
 *
 * Copy-style over esbuild/rollup single-file: engine is zero-npm-dependency
 * and small; copying keeps source auditable and path resolution identical to
 * the engine's current semantics. Symlinks rejected: not portable in the DSH
 * profile install form.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(PLUGIN_ROOT, "..", "..");
const ENGINE_SRC = resolve(REPO_ROOT, "tools", "mission-driver", "src");
const ENGINE_ROOT = resolve(ENGINE_SRC, "..");
const ASSETS = resolve(PLUGIN_ROOT, "assets");

// The packaging doc §Packaging Layout allowed set (verified import graph).
// Machine-checked below: closure(entries) must land inside exactly this list.
const ALLOWED_MODULES = [
  // flow engine path
  "engine.js", "expression.mjs", "platform.mjs", "sys-snapshot.mjs",
  "reap-orphans.mjs", "run-reconcile.mjs", "active-run-registry.mjs", "roadmap-check.mjs",
  // config path
  "config.js", "mission-check.mjs",
  // process backend path
  "runner.js", "executor.js",
  // orchestration entry path
  "orchestrator.js", "flow-loader.js", "plan-check.mjs", "env-loader.js",
  "postmortem.mjs", "exit-map.js", "step-executor.js",
  // shared ledger library (age-autonomy M1-WI1 frontmatter + M1-WI3 sections
  // + M1-WI7 dual-read resolver; importers landed with 0635-3/WI7 wiring —
  // plan-check.mjs / flow-loader.js / roadmap-check.mjs consume them, so all
  // three are import-closure reachable from here on)
  "ledger-frontmatter.mjs", "ledger-sections.mjs", "ledger-dualread.mjs",
  // shared law kernel (age-autonomy M2-WI12; 0815-1 ruling extends the 0635-1
  // engine-side placement to law): law-policy.mjs is reachable via config.js
  // (autonomyPolicy fail-fast load), law-core.mjs via law-policy (rule-name
  // cross-validation). law-rules.mjs (M2-WI14..16 hard gates, 0815-2) is
  // reachable via law-policy's side-effect rule registration import.
  // gate-check.mjs is deliberately NOT here — it is an engine-side CLI
  // (main.js family), not a bundled library face.
  "law-core.mjs", "law-policy.mjs", "law-rules.mjs",
];

// NOT bundled (packaging doc): monitor server, draft-job detached-process
// management (+ its spawner seam), CLI commander wiring.
const FORBIDDEN_MODULES = ["monitor.js", "draft-job.mjs", "spawner.mjs", "main.js"];

const ENTRY_MODULES = ["orchestrator.js", "config.js", "engine.js", "runner.js", "step-executor.js"];

// Node builtins (engine style is the `node:` prefix; bare core names kept
// for tolerance). Anything else non-relative is an npm package → forbidden.
const BUILTIN_PREFIX = "node:";
const BARE_BUILTINS = new Set(["fs", "path", "url", "os", "http", "child_process", "module", "util", "crypto"]);

const ASSET_DIRS = ["flows", "prompts", "agents"];

function fail(msg) {
  console.error(`build-bundle: FAIL — ${msg}`);
  process.exit(1);
}

/**
 * Strip // and /* *\/ comments (string/template-literal aware) so prose like
 * `emitted no marker" from "Stage 1...` in a comment cannot fake an import.
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        out += source[i];
        if (source[i] === "\\") { out += source[i + 1] ?? ""; i += 2; continue; }
        if (source[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i += 2;
      out += " ";
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Extract every import/export specifier from a module's source text. */
function extractSpecifiers(source) {
  const specs = new Set();
  const code = stripComments(source);
  const fromRe = /\bfrom\s*['"]([^'"]+)['"]/g;
  const sideEffectRe = /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;
  const dynamicRe = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [fromRe, sideEffectRe, dynamicRe]) {
    let m;
    while ((m = re.exec(code))) specs.add(m[1]);
  }
  return specs;
}

/**
 * Classify one specifier imported by `file` (a name relative to ENGINE_SRC).
 * Returns the engine-relative module name for relative imports, or the
 * marker "builtin" / "npm:<name>".
 */
function classify(spec, file) {
  if (spec.startsWith(BUILTIN_PREFIX) || BARE_BUILTINS.has(spec)) return "builtin";
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const base = resolve(dirname(join(ENGINE_SRC, file)), spec);
    const rel = relative(ENGINE_SRC, base);
    if (rel.startsWith("..")) return `escape:${base}`;
    return rel;
  }
  return `npm:${spec}`;
}

/** Compute the transitive closure from ENTRY_MODULES; throws on violations. */
function computeClosure() {
  const allowed = new Set(ALLOWED_MODULES);
  for (const name of ALLOWED_MODULES) {
    if (!existsSync(join(ENGINE_SRC, name))) fail(`allowed module missing from engine src: ${name}`);
  }
  for (const name of ENTRY_MODULES) {
    if (!allowed.has(name)) fail(`entry module not in allowed set: ${name}`);
  }

  const closure = new Set();
  const queue = [...ENTRY_MODULES];
  while (queue.length > 0) {
    const file = queue.shift();
    if (closure.has(file)) continue;
    closure.add(file);
    if (!allowed.has(file)) {
      fail(`import closure escapes the allowed set: ${file} (reachable from ${ENTRY_MODULES.join(", ")})`);
    }
    if (FORBIDDEN_MODULES.includes(file)) {
      fail(`import closure reaches NOT-bundled module: ${file}`);
    }
    const source = readFileSync(join(ENGINE_SRC, file), "utf8");
    for (const spec of extractSpecifiers(source)) {
      const kind = classify(spec, file);
      if (kind === "builtin") continue;
      if (kind.startsWith("npm:")) {
        fail(`${file} imports npm package "${kind.slice(4)}" — engine core must stay zero-npm-dependency`);
      }
      if (kind.startsWith("escape:")) {
        fail(`${file} imports outside the engine src root: ${spec} → ${kind.slice("escape:".length)}`);
      }
      if (FORBIDDEN_MODULES.includes(kind)) {
        fail(`${file} imports NOT-bundled module "${kind}" (packaging doc §Packaging Layout)`);
      }
      if (!allowed.has(kind)) {
        fail(`${file} imports "${spec}" → ${kind}, which is not in the allowed module list`);
      }
      queue.push(kind);
    }
  }
  return closure;
}

/** Recursively list files under dir as repo-relative dest paths. */
function listFiles(dir, prefix) {
  const out = [];
  if (!existsSync(dir)) fail(`asset directory missing: ${dir}`);
  for (const ent of readdirSync(dir)) {
    const full = join(dir, ent);
    const rel = `${prefix}${ent}`;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, `${rel}/`));
    else out.push({ rel, full });
  }
  return out;
}

/** Build the copy plan: dest path (relative to assets/) → Buffer. */
function buildPlan(closure) {
  const plan = new Map();
  for (const name of closure) {
    plan.set(`src/${name}`, readFileSync(join(ENGINE_SRC, name)));
  }
  for (const dir of ASSET_DIRS) {
    for (const { rel, full } of listFiles(join(ENGINE_ROOT, dir), "")) {
      plan.set(`${dir}/${rel}`, readFileSync(full));
    }
  }
  return plan;
}

function writePlan(plan) {
  rmSync(join(ASSETS, "src"), { recursive: true, force: true });
  for (const dir of ASSET_DIRS) rmSync(join(ASSETS, dir), { recursive: true, force: true });
  for (const [rel, content] of plan) {
    const dest = join(ASSETS, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, content);
  }
}

function checkPlan(plan) {
  const onDisk = new Map();
  for (const ent of listFiles(ASSETS, "")) onDisk.set(ent.rel, readFileSync(ent.full));
  const planned = new Set(plan.keys());
  const stale = [];
  for (const [rel, content] of plan) {
    if (!onDisk.has(rel)) { stale.push(`missing: ${rel}`); continue; }
    if (!onDisk.get(rel).equals(content)) stale.push(`outdated: ${rel}`);
  }
  for (const rel of onDisk.keys()) {
    if (!planned.has(rel)) stale.push(`extra: ${rel}`);
  }
  if (stale.length > 0) {
    fail(`committed assets/ is stale (run \`npm run build\` in plugin/dsh and commit):\n  ${stale.join("\n  ")}`);
  }
}

const checkMode = process.argv.includes("--check");
const closure = computeClosure();
const allowed = new Set(ALLOWED_MODULES);
const unreachable = [...allowed].filter((m) => !closure.has(m));
console.log(`closure ok: ${closure.size} modules reachable from entries ⊆ allowed set (${ALLOWED_MODULES.length})`);

const plan = buildPlan(closure);
if (checkMode) {
  checkPlan(plan);
  console.log(`freshness ok: assets/ matches the build plan (${plan.size} files, content-equal)`);
} else {
  writePlan(plan);
  console.log(`wrote ${plan.size} files to ${relative(REPO_ROOT, ASSETS)}/ (unreachable-allowed: ${unreachable.length ? unreachable.join(", ") : "none"})`);
}
