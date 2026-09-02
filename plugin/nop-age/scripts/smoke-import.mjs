#!/usr/bin/env node
/**
 * smoke-import.mjs — no-host bundle import smoke (dsh-plugin M2-WI6 Phase 2
 * Proof (b)). Imports every bundle entry module from the plugin location with
 * zero npm resolution (the bundle is plain ESM over node builtins only) and
 * asserts the key programmatic exports exist. Real host mounting is WI9 (L3)
 * scope — this smoke proves the bundle stands alone as an importable
 * library-form engine.
 */
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ASSETS_SRC = resolve(fileURLToPath(new URL("../assets/src/", import.meta.url)));

const entries = [
  ["orchestrator.js", ["bootstrap", "orchestrateRun", "orchestrateAnalyze", "parseDraftArtifact", "extractBriefGate"]],
  ["config.js", ["resolveConfig", "SUPPORTED_DRIVERS"]],
  ["engine.js", ["FlowEngine", "stripAnsiControl"]],
  ["runner.js", ["createRunner"]],
  ["step-executor.js", ["ProcessExecutor"]],
];

let failed = false;
for (const [mod, keys] of entries) {
  try {
    const ns = await import(pathToFileURL(`${ASSETS_SRC}/${mod}`).href);
    const missing = keys.filter((k) => !(k in ns));
    if (missing.length > 0) {
      console.error(`smoke-import: FAIL ${mod} missing exports: ${missing.join(", ")}`);
      failed = true;
    } else {
      console.log(`smoke-import: ok ${mod} (${keys.length} key exports present)`);
    }
  } catch (err) {
    console.error(`smoke-import: FAIL importing ${mod}: ${err.message}`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log("smoke-import: bundle imports cleanly from plugin location (zero npm resolution)");
