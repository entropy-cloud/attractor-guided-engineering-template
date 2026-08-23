/**
 * orchestrator.js — programmatic orchestration entry (dsh-plugin M1-WI2).
 *
 * Owns everything the CLI shell and a future in-host caller (M2
 * engine-bridge) must share to run / draft / analyze WITHOUT spawning the
 * CLI: config bootstrap (loadDotenv → resolveConfig), flow creation +
 * delegates.vars assembly + FlowEngine driving + EXIT_MAP mapping
 * (orchestrateRun), the whole two-stage draft pipeline (cmdDraftMission and
 * its pure helpers), and the Reflexion analyze wrapper (orchestrateAnalyze).
 *
 * Deliberately NOT here (stay in the CLI shell / keep their current owners):
 * commander wiring, monitor start/stop, SIGTERM/SIGINT handlers,
 * reconcileStaleRuns, unregisterActiveRun, human-readable banners. Those are
 * OS-process concerns that mostly do not apply to a plugin host.
 *
 * Import graph MUST stay within the packaging allowlist (dsh-plugin
 * packaging doc §Packaging Layout): node builtins + engine pure modules +
 * runner.js. Never import: vendor/commander, monitor.js, draft-job.mjs,
 * spawner.mjs — that is the M2 bundling boundary.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig, inferModuleName } from "./config.js";
import { createRunner, resetMockState } from "./runner.js";
import { FlowEngine, stripAnsiControl } from "./engine.js";
import { createMissionDriverFlow, loadSubFlow, createExpressionFunctions } from "./flow-loader.js";
import { resolveTemplateVars } from "./expression.mjs";
import { runPostmortem } from "./postmortem.mjs";
import { loadDotenv } from "./env-loader.js";
import { EXIT_MAP } from "./exit-map.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Testability seam (mdo-4 P2): cmdDraftMission calls this factory to obtain its
// runner. Production uses createRunner; tests override it via
// __setRunnerFactoryForTest to inject a fake runner with a controllable runAgent,
// so draft-brief.test.js can assert the two-stage brief→draft orchestration
// without launching a real opencode subprocess. Mirrors the __setSpawnerForTest
// pattern in draft-job.mjs / monitor.js.
let __runnerFactory = createRunner;
export function __setRunnerFactoryForTest(fn) {
  const prev = __runnerFactory;
  __runnerFactory = fn || createRunner;
  return prev;
}

// ── bootstrap ───────────────────────────────────────────────────────────────

/**
 * One-stop CLI-parity config bootstrap: loadDotenv BEFORE resolveConfig (the
 * CLI shell historically did exactly this; the "env-loader →
 * secret-resolver" chain named by the packaging doc is dormant today —
 * secret-resolver has zero imports in src/ — so the live chain is dotenv
 * only and secret-resolver stays outside both the allowlist and this
 * module).
 *
 * @param {{ projectRoot: string, args: object }} _
 * @returns {object} resolved config (resolveConfig product)
 */
export function bootstrap({ projectRoot, args }) {
  loadDotenv(projectRoot);
  return resolveConfig(args);
}

// ── Shared helpers (also consumed by the CLI shell) ─────────────────────────

function resolveProjectRoot(opts) {
  return opts.dir || process.env.PROJECT_ROOT || process.cwd();
}

function resolveMissionsDir(opts, projectRoot) {
  return opts.missionsDir
    ? resolve(projectRoot, opts.missionsDir)
    : resolve(projectRoot, "missions");
}

function getTopSteps() {
  const flowFile = resolve(__dirname, "..", "flows", "mission-driver.json");
  const flow = JSON.parse(readFileSync(flowFile, "utf8"));
  return Object.keys(flow.steps || {});
}

// Exported for the CLI shell (list-steps / run / analyze wrappers) so the
// helpers stay single-sourced; not part of the programmatic entry surface.
export { resolveProjectRoot, resolveMissionsDir, getTopSteps };

/**
 * Read a memory `_index.md` file, returning its full text. Returns `""` when
 * the file is missing or unreadable (e.g. a module with no memory dir yet),
 * so the consuming prompt's `<memory_context>` block is simply ignored.
 * (FSD §9.5 consumption-side injection.)
 */
function readMemoryIndex(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// ── Draft pipeline (pure helpers + two-stage orchestration) ─────────────────

/**
 * Deterministic pre-validation of the draft description (draft-robustness-design
 * §4.1 / WI1). Rejects empty / placeholder / too-short descriptions BEFORE
 * Stage 1 so the agent cannot pollute `docs/backlog/` and `missions/` with junk
 * artifacts. `minLen` accepts a value from `base.json`'s `draft.minDescLength`
 * but falls back to 4 when the value is missing, non-finite, or non-positive
 * (defends against a mistyped config like `"garbage"` / `null` / `NaN`).
 *
 * Deviation from design §4.1: placeholder check fires BEFORE length check.
 * Design's empty→length→placeholder order leaves 3-char blacklist entries
 * (`xxx`, `foo`, `bar`, `n/a`) unreachable — they always trip length first.
 * Swapping to empty→placeholder→length makes the blacklist actually useful,
 * since "xxx" is a more actionable rejection reason than "too short".
 *
 * NOT a semantic check — "is the description meaningful" is WI2's brief gate.
 *
 * Definition moved here from draft-job.mjs (dsh-plugin M1-WI2): the draft
 * main pipeline below calls it, and defining it in draft-job.mjs would force
 * this module to import that CLI/monitor-only leaf (which pulls
 * spawner.mjs into the packaging exclusion set). draft-job.mjs re-imports
 * and re-exports it so the monitor.js → draft-job.mjs reference chain is
 * unchanged; no cycle — this module never imports draft-job.mjs.
 */
export function validateDraftDesc(desc, minLen) {
  const threshold = Number.isFinite(+minLen) && +minLen > 0 ? +minLen : 4;
  const trimmed = String(desc ?? "").trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: "description is empty" };
  }
  if (/^(test|asdf|foo|bar|todo|xxx|none|null|n\/a)$/i.test(trimmed)) {
    return { ok: false, reason: `description looks like a placeholder ("${trimmed}")` };
  }
  if (trimmed.length < threshold) {
    return { ok: false, reason: `description too short (${trimmed.length} chars); need at least a phrase describing the mission goal` };
  }
  return { ok: true };
}

/**
 * Extract the brief file path from the mission-brief agent's output (mdo-4 P2).
 * The agent emits `<BRIEF_FILE>docs/backlog/<slug>-brief.md</BRIEF_FILE>`.
 * Returns the trimmed path or null when the tag is absent (the brief failed to
 * produce a file — stage 2 then runs in backward-compatible desc-only mode).
 */
function extractBriefPath(resultText) {
  if (typeof resultText !== "string") return null;
  // mdr-remediate-3 N1: strip ANSI BEFORE the marker match so log-colored brief
  // output (e.g. `\x1b[32m<BRIEF_FILE>...\x1b[0m`) does not defeat the strict
  // `[^<]+` value matcher. Mirrors the engine-layer discipline (memory L009).
  const clean = stripAnsiControl(resultText);
  const m = clean.match(/<BRIEF_FILE>\s*([^\s<]+)\s*<\/BRIEF_FILE>/i);
  return m && m[1] ? m[1].trim() : null;
}

/**
 * Extract the brief gate decision from the mission-brief agent's output
 * (draft-robustness-design §4.2.2 / WI2). The agent emits:
 *   <BRIEF_GATE>pass|blocked</BRIEF_GATE>
 *   <BRIEF_GATE_REASON>short reason (required for blocked)</BRIEF_GATE_REASON>
 *
 * Returns `{ gate, reason }`:
 *   - `gate` is `"pass"` | `"blocked"` (lower-cased) when the marker is present
 *     and valid; `null` otherwise (no marker → backward-compatible old brief).
 *   - `reason` is the inner text of `<BRIEF_GATE_REASON>` when present, else
 *     `null` (a missing reason tag does NOT raise — blocked-without-reason is
 *     still a valid blocked signal).
 *
 * Non-string inputs return `{ gate: null, reason: null }` so callers can pipe
 * `briefResult.text` (which may be undefined on agent failure) without guards.
 * Marker matching is case-insensitive and tolerates surrounding whitespace
 * inside `<BRIEF_GATE>` (mirrors `extractBriefPath`'s contract).
 */
export function extractBriefGate(resultText) {
  if (typeof resultText !== "string") return { gate: null, reason: null };
  // mdr-remediate-3 N1: strip ANSI BEFORE the marker match (see extractBriefPath).
  const clean = stripAnsiControl(resultText);
  const m = clean.match(/<BRIEF_GATE>\s*(pass|blocked)\s*<\/BRIEF_GATE>/i);
  const r = clean.match(/<BRIEF_GATE_REASON>\s*(.+?)\s*<\/BRIEF_GATE_REASON>/is);
  return { gate: m ? m[1].toLowerCase() : null, reason: r ? (r[1].trim() || null) : null };
}

/**
 * Parse the draft agent's product into a mission identity. mdo-2 Phase 1.
 *
 * Strategy (FSD §3.1.3 boundary):
 *   1. `<MISSION_FILE>path</MISSION_FILE>` tag in the agent text → resolve +
 *      read that mission.json for `name`/`roadmapPath`.
 *   2. Fallback: scan `missions/*.json` for files with a `roadmapPath`, newest
 *      by mtime → derive missionName/roadmapPath/missionFile.
 *   3. Still nothing → all fields null (status stays completed; the UI tells
 *      the user to check manually).
 *
 * Never throws; returns nulls on any failure so the caller's best-effort write
 * does not abort the agent's main flow.
 */
export function parseDraftArtifact(resultText, missionsDir) {
  const out = { missionName: null, roadmapPath: null, missionFile: null };
  // 1. <MISSION_FILE> tag
  if (typeof resultText === "string") {
    // mdr-remediate-3 N1: strip ANSI BEFORE the marker match (see extractBriefPath).
    const clean = stripAnsiControl(resultText);
    const m = clean.match(/<MISSION_FILE>\s*([^\s<]+)\s*<\/MISSION_FILE>/i);
    if (m && m[1]) {
      const file = m[1].trim();
      try {
        const mission = JSON.parse(readFileSync(file, "utf8"));
        if (mission && typeof mission === "object") {
          out.missionFile = file;
          out.missionName = mission.name || basenameNoExt(file);
          out.roadmapPath = mission.roadmapPath || null;
          // WI3 (draft-robustness-design §4.3.3): warn when the resolved
          // mission.json lands outside the expected missionsDir — usually a
          // projectRoot / cwd mismatch that splits artifacts across two roots.
          // Uses path.relative + startsWith("..") rather than string
          // startsWith to avoid /foo/bar vs /foo/barbaz prefix false positives
          // and Windows drive-letter casing ambiguity. Warn-only: drafting
          // from a sub-module is a legitimate use case (design §4.3.4).
          if (missionsDir) {
            const rel = relative(resolve(missionsDir), resolve(dirname(file)));
            if (rel.startsWith("..") || isAbsolute(rel)) {
              process.stderr.write(
                `[WARN] mission.json landed outside expected missionsDir: ` +
                `got ${file}, expected under ${resolve(missionsDir)}. ` +
                `This usually means projectRoot / cwd mismatch.\n`,
              );
            }
          }
          return out;
        }
      } catch {
        // tag found but file unreadable → fall through to scan
      }
    }
  }
  // 2. Fallback: newest missions/*.json with roadmapPath
  try {
    if (existsSync(missionsDir)) {
      const cands = readdirSync(missionsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const full = resolve(missionsDir, f);
          let st;
          try { st = statSync(full); } catch { st = { mtimeMs: 0, isDirectory: () => false }; }
          return { f, full, mtimeMs: st.mtimeMs, isDir: st.isDirectory ? st.isDirectory() : false };
        })
        .filter((c) => !c.isDir);
      // read each for roadmapPath; keep those with one
      const withRoadmap = [];
      for (const c of cands) {
        try {
          const mission = JSON.parse(readFileSync(c.full, "utf8"));
          if (mission && typeof mission === "object" && mission.roadmapPath) {
            withRoadmap.push({ ...c, mission });
          }
        } catch { /* skip */ }
      }
      if (withRoadmap.length > 0) {
        withRoadmap.sort((a, b) => b.mtimeMs - a.mtimeMs);
        const newest = withRoadmap[0];
        out.missionFile = newest.full;
        out.missionName = newest.mission.name || basenameNoExt(newest.f);
        out.roadmapPath = newest.mission.roadmapPath || null;
      }
    }
  } catch {
    // scan failure → nulls
  }
  return out;
}

/** Basename without extension (small helper, avoids a path import churn). */
function basenameNoExt(p) {
  const norm = String(p).replace(/\\/g, "/");
  const base = norm.slice(norm.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

async function cmdDraftMission(desc, opts) {
  const projectRoot = resolveProjectRoot(opts);
  loadDotenv(projectRoot);
  const dryRun = opts.dryRun === true;
  const pure = opts.pure === true
    || process.env.OPENCODE_PURE === "1"
    || process.env.OPENCODE_PURE === "true";
  const config = {
    projectRoot,
    missionsDir: resolveMissionsDir(opts, projectRoot),
    dryRun,
    pure,
    draftMission: desc,
    draftJobDir: opts.draftJobDir,
    flowHint: opts.flowHint || null,
    targetFile: opts.targetFile || null,
    skipBrief: opts.skipBrief === true,
  };
  const resolved = resolveConfig({ ...opts, ...config });
  const runner = await __runnerFactory(resolved);

  // WI1 (draft-robustness-design §4.1): deterministic desc validation BEFORE
  // the running re-affirm below — rejected descriptions must never be persisted
  // as a running draft-state, otherwise the monitor draft-job UI would see a
  // job that never progresses. `minDescLength` is read directly from
  // base.json (NOT via loadMission — that would reject base.json for missing
  // REQUIRED_FIELDS), mirroring monitor.js handleGetBaseConfig's pattern.
  let baseConfig = {};
  try {
    baseConfig = JSON.parse(readFileSync(resolve(resolved.missionsDir, "base.json"), "utf8"));
  } catch { baseConfig = {}; }

  // mdr-remediate-3 A1: stateFile + writeDraftState must be declared BEFORE
  // validateDraftDesc so the WI1 reject branch below can record a terminal
  // `failed` / `phase: "rejected"` state for the monitor's draft-job UI.
  // Earlier the closure lived after the reject branch, so referencing it
  // there would have thrown a TDZ ReferenceError. Definition order is the
  // only change; semantics at all existing call sites are unchanged.
  const stateFile = resolved.runDir ? resolve(resolved.runDir, "draft-state.json") : null;
  const writeDraftState = (patch) => {
    if (!stateFile) return;
    try {
      let prev = {};
      try { prev = JSON.parse(readFileSync(stateFile, "utf8")) || {}; } catch { prev = {}; }
      writeFileSync(stateFile, JSON.stringify({ ...prev, ...patch }, null, 2));
    } catch {
      // best-effort: never interrupt the agent's main flow
    }
  };

  const v = validateDraftDesc(desc, baseConfig?.draft?.minDescLength);
  if (!v.ok) {
    console.error(`[DRAFT VALIDATION] ${v.reason}`);
    console.error(`Hint: draft 需要一句描述目标的话；示例：draft '为 mission-driver 增加 audit 计数'`);
    // mdr-remediate-3 A1: terminal state write for the draft-job UI. Without
    // this, startDraftJob's initial `status: "running"` would persist forever
    // (child stderr is `stdio: "ignore"`-discarded by the parent, and
    // run-reconcile does not cover draft-state.json). `phase: "rejected"` is
    // a new terminal phase, distinct from existing runtime-failure phases
    // (`"brief"` / `"draft"`) — WI1 input rejection happens before Stage 1.
    // The merge semantics preserve `desc` written by startDraftJob.
    if (opts.draftJobDir) {
      writeDraftState({
        status: "failed",
        phase: "rejected",
        endedAt: new Date().toISOString(),
        error: v.reason,
      });
    }
    process.exitCode = 1;
    await runner.close();
    return;
  }

  // mdo-2 Phase 1: when --draft-job-dir is set, the monitor's startDraftJob
  // already created the jobDir + a running draft-state.json. We re-affirm the
  // running state here so a stale state from a prior attempt is overwritten
  // with this process's start time + desc. Best-effort: write failures never
  // abort the agent.
  if (opts.draftJobDir) {
    writeDraftState({
      status: "running",
      startedAt: new Date().toISOString(),
      desc,
      phase: resolved.skipBrief ? "draft" : "brief",
      flowHint: resolved.flowHint,
      targetFile: resolved.targetFile,
    });
  }

  const skipBrief = resolved.skipBrief === true;
  let briefPath = null;
  // WI2 (draft-robustness-design §4.2.2): outer-scope `gate` / `reason` so the
  // post-Stage-1 gate branch (which lives OUTSIDE the `if (!skipBrief)` block)
  // can read them. Initialized to null — when `skipBrief === true`, Stage 1 is
  // skipped entirely, gate stays null, and the gate branch falls through to
  // Stage 2 (backward-compatible single-stage path, design §5.3).
  let gate = null;
  let reason = null;

  // ── Stage 1: brief (mdo-4 P2) ────────────────────────────────────────────
  // Generate a scope-gate brief first; skip entirely when skipBrief collapses
  // to the legacy single-stage draft (backward compatible with mdo-2).
  if (!skipBrief) {
    const briefPromptFile = resolve(__dirname, "..", "prompts", "mission-brief.md");
    const rawBriefPrompt = readFileSync(briefPromptFile, "utf8");
    const briefPrompt = resolveTemplateVars(rawBriefPrompt, {
      missionsDir: resolved.missionsDir,
      projectRoot: resolved.projectRoot,
      backlogDir: resolve(resolved.projectRoot, "docs/backlog"),
      flowHint: resolved.flowHint || "",
      targetFile: resolved.targetFile || "",
    });
    let briefResult;
    try {
      briefResult = await runner.runAgent(
        "mission-brief",
        `${briefPrompt}\n\n## User Goal\n\n${desc}\n\nProject root: ${resolved.projectRoot}`,
        "",
        null
      );
    } catch (err) {
      if (opts.draftJobDir) {
        writeDraftState({
          status: "failed",
          endedAt: new Date().toISOString(),
          phase: "brief",
          error: err && err.message ? err.message : String(err),
        });
      }
      await runner.close();
      throw err;
    }
    console.log("\n" + (briefResult.text || "(no brief output)"));
    briefPath = extractBriefPath(briefResult.text);
    // WI2: parenthesised destructuring (NOT `const`) — assigns to the outer
    // `gate` / `reason` so the gate branch below can read them.
    ({ gate, reason } = extractBriefGate(briefResult.text));
    if (opts.draftJobDir) {
      // briefGate / briefGateReason are written for ALL gate values (pass /
      // blocked / null). null is explicit — distinguishes "Stage 1 ran but AI
      // emitted no marker" from "Stage 1 was skipped / never reached".
      writeDraftState({ phase: "brief_done", briefPath, briefGate: gate, briefGateReason: reason });
    }
  }

  // WI2 (draft-robustness-design §4.2.2): brief gate enforcement. Lives OUTSIDE
  // `if (!skipBrief)` — that is why `gate` / `reason` are declared in the outer
  // scope above. `gate === "blocked"` → print reason + brief location, mark the
  // draft-state blocked, and STOP (no Stage 2, no roadmap, no mission.json).
  // `gate === "pass"` or `gate === null` (no marker / skipBrief path) falls
  // through to Stage 2 (backward-compatible, design §5.3). `process.exitCode`
  // is deliberately NOT set — gate-blocked is a normal workflow outcome, not an
  // error (WI1's validateDraftDesc failure path uses exitCode 1 for contrast).
  if (gate === "blocked") {
    console.log(`\n[BRIEF GATE] blocked: ${reason || "(no reason)"}`);
    console.log(`Brief written to ${briefPath || "(unknown)"}. Resolve the open questions there, then re-run draft.`);
    if (opts.draftJobDir) {
      writeDraftState({ status: "blocked", endedAt: new Date().toISOString() });
    }
    await runner.close();
    return;
  }

  // ── Stage 2: draft (roadmap + mission.json) ──────────────────────────────
  if (opts.draftJobDir) {
    writeDraftState({ phase: "draft" });
  }
  const promptFile = resolve(__dirname, "..", "prompts", "mission-draft.md");
  const rawPrompt = readFileSync(promptFile, "utf8");
  const prompt = resolveTemplateVars(rawPrompt, {
    missionsDir: resolved.missionsDir,
    projectRoot: resolved.projectRoot,
    backlogDir: resolve(resolved.projectRoot, "docs/backlog"),
    briefPath: briefPath || "",
    flowHint: resolved.flowHint || "",
  });

  let result;
  try {
    result = await runner.runAgent(
      "draft-mission",
      `${prompt}\n\n## User Request\n\nGenerate a mission.json for: ${desc}\n\nProject root: ${resolved.projectRoot}`,
      "",
      null
    );
  } catch (err) {
    if (opts.draftJobDir) {
      writeDraftState({
        status: "failed",
        endedAt: new Date().toISOString(),
        phase: "draft",
        error: err && err.message ? err.message : String(err),
      });
    }
    await runner.close();
    throw err;
  }

  console.log("\n" + (result.text || "(no output)"));

  if (opts.draftJobDir) {
    const artifact = parseDraftArtifact(result.text, resolved.missionsDir);
    writeDraftState({
      status: "completed",
      endedAt: new Date().toISOString(),
      phase: "completed",
      briefPath,
      missionName: artifact.missionName,
      roadmapPath: artifact.roadmapPath,
      missionFile: artifact.missionFile,
    });
  }

  await runner.close();
}

// Original name + signature preserved (dsh-plugin M1-WI2, draft review
// iteration 3 B1): CLI and programmatic callers share this ONE entry; the
// four draft test files call it as cmdDraftMission("goal", { dir, ... }) and
// it self-bootstraps its config internally (no orchestrateDraft variant —
// that would create a dual-entry drift).
export { cmdDraftMission };

// ── Analyze (Reflexion postmortem) ──────────────────────────────────────────

/**
 * mdo-3 Phase 1: thin wrapper over the reusable runPostmortem (FSD §3.3.3A).
 * All postmortem logic (skeleton build, module detect, prompt resolve, agent
 * dispatch, return-tag parse) lives in postmortem.mjs so the engine terminal
 * hook can drive the exact same pipeline. moduleInfo is passed through since
 * config.js already resolved it for the analyze branch. The runner is built
 * AND closed here (equivalent migration of the former main.js analyze body)
 * so programmatic callers get the same self-contained lifecycle as the CLI.
 *
 * @param {{ config: object }} _ — resolved config (analyzeRun branch)
 * @returns {Promise<{text: string}>} postmortem result
 */
export async function orchestrateAnalyze({ config }) {
  const runner = await createRunner(config);
  const res = await runPostmortem({
    projectRoot: config.projectRoot,
    missionsDir: config.missionsDir,
    targetRunDir: config.targetRunDir,
    targetRunId: config.targetRunId,
    runner,
    opts: { moduleInfo: config.moduleInfo },
  });
  await runner.close();
  return res;
}

// ── Run (flow orchestration) ────────────────────────────────────────────────

/**
 * Drive one mission run to a terminal state: flow creation, delegates.vars
 * assembly (incl. memory-index reads), singleStep / entryOverride handling,
 * FlowEngine execution, and EXIT_MAP exit-code mapping. Process-level
 * concerns (signals, monitor, reconcile, unregister) stay with the caller.
 *
 * Early-return shape: when the requested entry/step is unknown, the error
 * messages are printed here (singleStep/entryOverride handling owns them)
 * and `{ exitCode: 1 }` is returned WITHOUT `status` — the caller then skips
 * the result banner but still sets process.exitCode = 1, matching the
 * pre-extraction CLI behavior.
 *
 * @param {{ config: object, executor: object }} _ — resolved config + a
 *   StepExecutor instance (WI1 seam; the CLI passes ProcessExecutor(runner))
 * @returns {Promise<{status?: string, stepCount?: number, elapsed?: string,
 *   marker?: string|null, history?: string[], exitCode?: number|undefined}>}
 */
export async function orchestrateRun({ config, executor }) {
  const g = config.mission;
  const flow = createMissionDriverFlow({
    flowName: g.flowName,
    projectFlowsDir: resolve(config.missionsDir, "flows"),
    // mdr-fix-2: mission-level promptsDir wins, then shared missions/prompts/,
    // then built-in TOOL_ROOT/prompts/ (loadPrompt fallback). filter(Boolean)
    // drops the empty string when missionPromptsDir is unset.
    projectPromptDirs: [
      config.missionPromptsDir,
      resolve(config.missionsDir, "prompts"),
    ].filter(Boolean),
  });
  const delegates = {
    config,
    expressionFuncs: createExpressionFunctions(config),
    vars: {
      missionName: config.missionName,
      projectRoot: config.projectRoot,
      missionsDir: config.missionsDir,
      roadmapPath: g.roadmapPath,
      plansDir: g.plansDir,
      planGuide: g.planGuide || g.plansDir + "/00-plan-authoring-and-execution-guide.md",
      auditsDir: g.auditsDir || "audits",
      contextDir: g.contextDir || "",
      moduleContextFile: (() => {
        const p = resolve(config.projectRoot, g.moduleDir || "", "CONTEXT.md");
        return existsSync(p) ? p : `${p} (不存在)`;
      })(),
      moduleDir: g.moduleDir || "",
      testCmd: g.commands.test,
      buildCmd: g.commands.build || "",
      lintCmd: g.commands.lint || "",
      typecheckCmd: g.commands.typecheck || "",
      checkCmd: g.commands.check || "",
      commitFormat: g.commitFormat || "",
      multiAuditPrompt: g.prompts?.multiAudit || "",
      openAuditPrompt: g.prompts?.openAudit || "",
      sourcePaths: g.sourcePaths
        ? (Array.isArray(g.sourcePaths) ? g.sourcePaths.join("\n") : String(g.sourcePaths))
        : "",
      TIMESTAMP: config.timestamp,
      runDir: config.runDir || "",
      selfMemoryIndex: readMemoryIndex(
        resolve(__dirname, "..", "memory", "_index.md")
      ),
      moduleMemoryIndex: (() => {
          const md = g.moduleDir || "";
          if (/^tools[\/\\]/.test(md)) return ""; // selfMemoryIndex already covers tool modules
          const mn = inferModuleName(md, config.missionName) || "";
          return readMemoryIndex(resolve(config.projectRoot, "docs", "memory", mn, "_index.md"));
        })(),
    },
    executor,
    logFile: config.logFile,
    loadSubFlow,
  };

  if (config.entryStep) {
    const step = flow.steps[config.entryStep];
    if (!step) {
      console.error(`ERROR: step "${config.entryStep}" not found in flow. Use list-steps to see available steps.`);
      console.error("Available top-level steps:");
      for (const s of getTopSteps()) console.error(`  ${s}`);
      return { exitCode: 1 };
    }
    console.log(`Step:       ${config.entryStep} (single-step mode)`);
    // WI2: engine-level hard cap (maxSteps=1) replaces the old in-place
    // transition mutation, which only covered `transitions[*]` and let
    // onError/onUnknown/onMaxRetries escape the single-step boundary.
    config.singleStep = true;
  } else if (config.fromStep) {
    const step = flow.steps[config.fromStep];
    if (!step) {
      console.error(`ERROR: step "${config.fromStep}" not found in flow. Use list-steps to see available steps.`);
      console.error("Available top-level steps:");
      for (const s of getTopSteps()) console.error(`  ${s}`);
      return { exitCode: 1 };
    }
    console.log(`From step:  ${config.fromStep} (entry override, transitions untouched)`);
    // WI3: --from-step sets the entry override but loops normally. Set
    // singleStep=false explicitly (not undefined) so it forms a clear pair
    // with --step's singleStep=true path. engine.run(entryOverride) already
    // supports arbitrary entry (engine.js let currentStep = entryOverride).
    config.entryStep = config.fromStep;
    config.singleStep = false;
  }

  resetMockState();
  const engine = new FlowEngine(flow, delegates);
  config.onStepUpdate = (payload) => engine._onAgentStepUpdate(payload);
  const result = await engine.run(config.entryStep);

  const exitCode = EXIT_MAP[result.status];
  return {
    status: result.status,
    stepCount: result.stepCount,
    elapsed: result.elapsed,
    marker: result.marker,
    history: result.history,
    exitCode,
  };
}
