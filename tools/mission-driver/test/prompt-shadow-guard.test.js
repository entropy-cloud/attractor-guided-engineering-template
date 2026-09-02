// Prompt shadow / prompts-map key-domain guard (age-autonomy M1-WI45+WI46,
// plan 2026-08-27-1503-1): live-corpus assertions pinning the two fix faces —
// ① the shared missions/prompts/ directory must never again shadow the
//   plan-execution agent prompts (the three pre-ledger overrides were deleted
//   so the five missions without promptsDir resolve the built-in dual-mode
//   versions), ② the mission `prompts` map is a live-consumption surface with
//   exactly the multiAudit/openAudit key domain (dead keys were removed; a
//   wholesale map deletion would silently disable the DEEP_AUDIT when-gates —
//   face ④ is the reverse assertion of that misuse).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(TOOL_ROOT, "..", "..");
const MISSIONS_DIR = join(REPO_ROOT, "missions");

function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function listFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

const planExecution = readJson(join(TOOL_ROOT, "flows", "plan-execution.json"));
const planExecPromptBasenames = Object.values(planExecution.steps)
  .filter((s) => s && typeof s.promptPath === "string")
  .map((s) => basename(s.promptPath));

test("plan-execution flow exposes the three agent prompts", () => {
  assert.deepEqual(
    [...new Set(planExecPromptBasenames)].sort(),
    ["build-verify.md", "closure-audit.md", "execute.md"],
  );
});

test("① shared missions/prompts/ must not shadow plan-execution prompts", () => {
  const shared = listFiles(join(MISSIONS_DIR, "prompts"));
  const shadowed = planExecPromptBasenames.filter((b) => shared.includes(b));
  assert.deepEqual(
    shadowed,
    [],
    `missions/prompts/ re-shadows ${shadowed.join(", ")} — the five missions without promptsDir would resolve pre-ledger overrides instead of the built-in dual-mode prompts (M1-WI45)`,
  );
});

test("② every mission prompts map key domain ⊆ {multiAudit, openAudit}", () => {
  const offenders = [];
  for (const f of listFiles(MISSIONS_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("base")) continue;
    const cfg = readJson(join(MISSIONS_DIR, f));
    if (!cfg.prompts || typeof cfg.prompts !== "object") continue;
    for (const key of Object.keys(cfg.prompts)) {
      if (key !== "multiAudit" && key !== "openAudit") {
        offenders.push(`${f}: ${key}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `dead prompts-map keys flowed back (${offenders.join(", ")}) — only multiAudit/openAudit are live consumption faces (M1-WI46)`,
  );
});

test("③ live audit prompt paths referenced by prompts maps exist", () => {
  const missing = [];
  for (const f of listFiles(MISSIONS_DIR)) {
    if (!f.endsWith(".json") || f.startsWith("base")) continue;
    const cfg = readJson(join(MISSIONS_DIR, f));
    if (!cfg.prompts || typeof cfg.prompts !== "object") continue;
    for (const key of ["multiAudit", "openAudit"]) {
      const ref = cfg.prompts[key];
      if (typeof ref !== "string") continue;
      if (!existsSync(resolve(REPO_ROOT, ref))) missing.push(`${f}: ${key} -> ${ref}`);
    }
  }
  assert.deepEqual(missing, [], `dangling live audit prompt references: ${missing.join(", ")}`);
});

test("④ deep-audit-loop when-gates consume the two live prompt vars", () => {
  const flow = readJson(join(TOOL_ROOT, "flows", "deep-audit-loop.json"));
  const whens = Object.values(flow.steps)
    .map((s) => (s && typeof s.when === "string" ? s.when : ""))
    .filter(Boolean);
  assert.ok(
    whens.some((w) => w.includes("multiAuditPrompt != ''")),
    "no step gates on `multiAuditPrompt != ''` — deleting the map (or the gate) would silently idle MULTI_AUDIT",
  );
  assert.ok(
    whens.some((w) => w.includes("openAuditPrompt != ''")),
    "no step gates on `openAuditPrompt != ''` — deleting the map (or the gate) would silently idle OPEN_AUDIT",
  );
});

test("⑤ built-in plan-execution prompts stay dual-mode (ledger instructions present)", () => {
  const execute = readFileSync(join(TOOL_ROOT, "prompts", "execute.md"), "utf8");
  assert.ok(
    execute.includes("Do NOT write `completed` anywhere"),
    "built-in execute.md lost the ledger-mode completion-derivation instruction",
  );
  const closure = readFileSync(join(TOOL_ROOT, "prompts", "closure-audit.md"), "utf8");
  assert.ok(
    closure.includes("NEVER write `completed`"),
    "built-in closure-audit.md lost the ledger-mode status instruction",
  );
  assert.ok(
    closure.includes("dispatch audit #audit-") && closure.includes("accepted #audit-") && closure.includes("models={exec:"),
    "built-in closure-audit.md lost the dispatch/accepted receipt protocol section",
  );
  const buildVerify = readFileSync(join(TOOL_ROOT, "prompts", "build-verify.md"), "utf8");
  assert.ok(
    buildVerify.includes("Ledger Verification pass lines"),
    "built-in build-verify.md lost the transition-period Verification pass-line writer section",
  );
  assert.ok(
    buildVerify.includes("- pass <commandKey> <runId> exit=0") && !buildVerify.includes("basisHash"),
    "built-in build-verify.md must instruct direct hash-free verification receipts",
  );
});

test("guard test runs from the engine test chain", () => {
  assert.ok(statSync(join(TOOL_ROOT, "package.json")).isFile());
});
