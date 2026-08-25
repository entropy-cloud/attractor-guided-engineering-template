/**
 * gate-check.mjs — law deployment face 3: pure-structure CLI (02 §6).
 *
 * Three modes (age-autonomy M2-WI12 plan
 * docs/plans/age-autonomy/2026-08-25-0815-1 Phase 3; `--verify` =
 * M2-WI19 mechanical-verification execution face, plan
 * docs/plans/age-autonomy/2026-08-25-0815-3 Phase 3):
 *
 *   --policy <autonomy.policy.yml>   Validate one policy file against the
 *                                    schema (structured JSON output, exit 0/1).
 *                                    This satisfies `commands.gates` as the
 *                                    mission-facing verification command.
 *
 *   <plan.md>                        Single-file structural-face evaluation:
 *                                    run every registered structural rule
 *                                    over the file content through the law
 *                                    kernel as a write-shaped proposedAction
 *                                    with no actor (structural subset — CI /
 *                                    git-hook posture; identity assertions
 *                                    never join the verdict). Legacy-format
 *                                    files are out of the structural domain
 *                                    (dual-read transition, allow + note).
 *
 *   <plan.md> --verify               Mechanical-verification execution face
 *                                    (02 §5): resolve the plan's `verify`
 *                                    keys (mission defaults when absent) —
 *                                    never Proof text — against the owning
 *                                    mission's `commands.*`, run the
 *                                    verify-keys gate, then EXECUTE the
 *                                    commands via verify-runner.mjs and emit
 *                                    per-key `{exitCode, passLine}` data
 *                                    (basisHash = computeBasisHash of the
 *                                    plan content; 01 §4.2 grammar). stdout
 *                                    JSON only — the pass line is NOT
 *                                    written into the plan file (the writer
 *                                    stays the supervisor / engine
 *                                    BUILD_VERIFY face; M3/WI26 takes over
 *                                    dispatch). exit 0 iff every key maps to
 *                                    a non-empty command with exit code 0.
 *
 * Bare invocation prints usage and exits 1.
 *
 * Deliberately NOT a build-bundle module (main.js CLI family, same as
 * plan-check.mjs's sibling): the DSH plugin consumes the law kernel from its
 * assets copy, not this CLI.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateGates, expandWorkItemLabel, structuralRuleIds, workItemRegistered } from "./law-core.mjs";
import { loadPolicyFile, policyAgentNames } from "./law-policy.mjs";
import { discoverOwningMission } from "./mission-check.mjs";
import { isLawProtectedPath } from "./law-rules.mjs";
import { resolveVerifyPlan, runVerifyCommands } from "./verify-runner.mjs";
import { scanPlanLedger, scanRoadmapLedger } from "./ledger-sections.mjs";

function usage() {
  console.error("Usage:");
  console.error("  gate-check.mjs --policy <autonomy.policy.yml>    validate policy schema (exit 0/1)");
  console.error("  gate-check.mjs <plan.md>                         single-file structural-face evaluation");
  console.error("  gate-check.mjs <plan.md> --verify                run the plan's verify keys via the mission commands runner");
}

function runPolicyMode(file) {
  let result;
  try {
    result = loadPolicyFile(resolve(file));
  } catch (e) {
    console.log(JSON.stringify({ valid: false, file, errors: [e instanceof Error ? e.message : String(e)] }, null, 2));
    process.exit(1);
  }
  if (!result.ok) {
    console.log(JSON.stringify({ valid: false, file, errors: result.errors }, null, 2));
    process.exit(1);
  }
  const policy = result.policy;
  console.log(
    JSON.stringify(
      {
        valid: true,
        file,
        summary: {
          version: policy.version,
          gates: (policy.gates ?? []).map((g) => ({ id: g.id, rule: g.rule, mode: g.mode ?? "observe" })),
          triggers: (policy.triggers ?? []).length,
          agents: policyAgentNames(policy),
          dispatch: Object.keys(policy.dispatch ?? {}),
          limits: policy.limits ?? {},
        },
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// ── mission-context helpers (M2-WI21: roadmap injection + plans roots) ──────

function toPosix(p) {
  return String(p).split("\\").join("/");
}

/** First ancestor of the file carrying a missions/ directory (null at fs root). */
function discoverProjectRoot(abs) {
  let dir = dirname(abs);
  for (;;) {
    if (existsSync(join(dir, "missions"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Known plans roots for one file, ancestor-walk style (passive-scan precedent
 * = plugin plan-status-gate knownPlansRootsAt): every ancestor contributes its
 * default docs/plans root plus the plansDir of every parseable missions/*.json
 * (extends UNRESOLVED — light parse, malformed missions contribute zero roots).
 */
function knownPlansRoots(absStart) {
  const roots = [];
  let dir = dirname(absStart);
  for (;;) {
    roots.push(toPosix(join(dir, "docs", "plans")));
    const missionsDir = join(dir, "missions");
    if (existsSync(missionsDir)) {
      for (const entry of readdirSync(missionsDir)) {
        if (!entry.endsWith(".json")) continue;
        try {
          const mission = JSON.parse(readFileSync(join(missionsDir, entry), "utf8"));
          if (typeof mission.plansDir === "string" && mission.plansDir !== "") {
            roots.push(toPosix(resolve(dir, mission.plansDir)));
          }
        } catch {
          // malformed mission config contributes no plans root
        }
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return roots;
    dir = parent;
  }
}

/** Work-item reconciliation summary for the single-file face (M2-WI21 Phase 1). */
function workItemSummary(text, roadmapScan, roadmapFile) {
  const scan = scanPlanLedger(text);
  if (scan.fmError) {
    return { applicable: false, note: `frontmatter unreadable — plan-structure owns that deny face (${scan.fmError})` };
  }
  if (!scan.hasFrontmatter) {
    return { applicable: false, note: "no plan frontmatter — work-item reconciliation not applicable (legacy/dual-read or non-plan file)" };
  }
  const label = scan.fm["work-item"];
  if (typeof label !== "string") {
    return { applicable: false, note: "work-item field absent or not a string — plan-structure owns that deny face" };
  }
  const expanded = expandWorkItemLabel(label);
  if (!expanded.ok) return { applicable: true, label, ok: false, error: expanded.error };
  const pairs = expanded.items.map((i) => `M${i.milestone}-${i.wi}`);
  if (roadmapScan === null) {
    return {
      applicable: true,
      label,
      expanded: pairs,
      registered: [],
      missing: pairs,
      roadmap: null,
      note: "owning mission roadmap not found/readable — registry reconciliation not run (grammar verified only)",
    };
  }
  const reg = workItemRegistered(label, roadmapScan);
  return {
    applicable: true,
    label,
    ok: reg.ok,
    expanded: pairs,
    registered: reg.ok ? reg.hits : pairs.filter((p) => !reg.misses.some((m) => m.startsWith(`${p}:`))),
    missing: reg.ok ? [] : reg.misses,
    roadmap: roadmapFile,
  };
}

/** Plan records under the plans roots (recursive, capped) — P8 approved-project corpus. */
function readPlanRecords(plansRoots, cap = 200) {
  const records = [];
  const walk = (dir, depth) => {
    if (records.length >= cap || depth > 4) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        walk(p, depth + 1);
      } else if (e.isFile() && e.name.endsWith(".md")) {
        try {
          records.push({ text: readFileSync(p, "utf8"), path: toPosix(p) });
        } catch {
          // unreadable plan file skipped
        }
        if (records.length >= cap) return;
      }
    }
  };
  for (const root of new Set(plansRoots)) walk(root, 0);
  return records;
}

function runSingleFileMode(file) {
  const abs = resolve(file);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (e) {
    console.log(JSON.stringify({ file: abs, decision: "deny", error: e instanceof Error ? e.message : String(e) }, null, 2));
    process.exit(1);
  }
  // Mission context (M2-WI21): owning mission for the roadmap registry +
  // passive-scan plans roots for the path domain + projectRoot for the
  // {{projectRoot}} placeholder face.
  const owned = discoverOwningMission(abs);
  const projectRoot = owned !== null ? owned.projectRoot : discoverProjectRoot(abs);
  const plansRoots = knownPlansRoots(abs);
  let roadmapText = null;
  let roadmapFile = null;
  if (owned !== null && typeof owned.mission.roadmapPath === "string" && owned.mission.roadmapPath !== "") {
    roadmapFile = resolve(owned.projectRoot, owned.mission.roadmapPath);
    try {
      roadmapText = readFileSync(roadmapFile, "utf8");
    } catch {
      roadmapText = null;
    }
  }
  const roadmapScan = roadmapText !== null ? scanRoadmapLedger(roadmapText) : null;
  // P8 face (M2-WI21): protected-path evaluations need the approved-project
  // corpus to evaluate the active-plan exception (absent corpus = fail-closed
  // deny inside the rule — the adversarial posture).
  const protectedPlans = projectRoot !== null && isLawProtectedPath(abs, projectRoot)
    ? readPlanRecords(plansRoots)
    : null;
  // Structural subset: a synthetic write-shaped action with no actor; the
  // policy match domain is bypassed by addressing structural rules directly
  // (their domain logic — frontmatter vs legacy — lives inside the rules).
  const out = evaluateGates(
    { type: "write", path: abs, proposedContent: text },
    {
      policy: { gates: structuralRuleIds().map((rule, i) => ({ id: `structural-${i + 1}`, match: "{{plansDir}}/**/*.md", rule, mode: "enforce" })) },
      ctx: {
        plansDir: resolve(abs, ".."),
        plansRoots,
        ...(projectRoot !== null ? { projectRoot: toPosix(projectRoot) } : {}),
        ...(roadmapFile !== null ? { roadmapPath: toPosix(roadmapFile) } : {}),
        ...(roadmapText !== null ? { roadmapText } : {}),
        ...(protectedPlans !== null ? { plans: protectedPlans } : {}),
      },
    },
  );
  console.log(
    JSON.stringify(
      {
        file: abs,
        face: "structural-subset",
        actor: "absent (unverified-writer posture)",
        mission: owned !== null ? owned.mission.name : null,
        projectRoot,
        workItem: workItemSummary(text, roadmapScan, roadmapFile),
        decision: out.decision,
        reason: out.reason,
        observations: out.observations,
        notes: out.notes,
      },
      null,
      2,
    ),
  );
  process.exit(out.decision === "allow" ? 0 : 1);
}

// ── <plan.md> --verify: mechanical-verification execution face (02 §5) ──────
// discoverOwningMission (ancestor walk, plansDir 判属) moved to mission-check.mjs
// at M2-WI41 — shared with the plan-check.mjs CLI default-verify-key injection.

async function runVerifyMode(file) {
  const abs = resolve(file);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (e) {
    console.log(JSON.stringify({ file: abs, decision: "deny", error: e instanceof Error ? e.message : String(e) }, null, 2));
    process.exit(1);
  }
  const owned = discoverOwningMission(abs);
  if (owned === null) {
    console.log(
      JSON.stringify(
        {
          file: abs,
          decision: "deny",
          reason: "no owning mission found — walk ancestors for missions/*.json whose plansDir contains this plan (verify keys resolve against that mission's commands.*)",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  const { mission, projectRoot, missionFile } = owned;
  const commands = mission.commands && typeof mission.commands === "object" ? mission.commands : {};
  const verifyField = (() => {
    // local frontmatter read (scanPlanLedger import would pull the whole
    // scanner for one field; the runner already owns the key resolution)
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return undefined;
    const line = m[1].split(/\r?\n/).find((l) => /^verify:/.test(l));
    if (!line) return undefined;
    const raw = line.slice("verify:".length).trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      return raw.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter((s) => s !== "");
    }
    return [raw.replace(/^["']|["']$/g, "")];
  })();

  const resolved = resolveVerifyPlan({ verify: verifyField, commands });
  const gateOut = evaluateGates(
    { type: "write", path: abs, proposedContent: text },
    {
      policy: { gates: [{ id: "verify-keys", match: "{{plansDir}}/**/*.md", rule: "verify-keys", mode: "enforce" }] },
      ctx: { plansDir: dirname(abs), commands },
    },
  );
  const runId = process.env.MISSION_DRIVER_RUN_ID ?? `gate-check-${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}`;
  const { basisHash, results } = await runVerifyCommands({
    keys: resolved.keys,
    commands,
    projectRoot,
    planText: text,
    runId,
  });
  const allGreen = resolved.ok && gateOut.decision === "allow" && results.length > 0 && results.every((r) => r.exitCode === 0);
  console.log(
    JSON.stringify(
      {
        file: abs,
        face: "verify-runner",
        mission: mission.name,
        missionFile,
        projectRoot,
        runId,
        verifyKeys: resolved.keys,
        usedDefaultKeys: resolved.usedDefault,
        keyResolution: resolved.ok ? "ok" : { problems: resolved.problems },
        gateCheck: { decision: gateOut.decision, reason: gateOut.reason, observations: gateOut.observations },
        basisHash,
        results: results.map(({ key, command, exitCode, timedOut, durationMs, passLine, output }) => ({
          key,
          command,
          exitCode,
          timedOut,
          durationMs,
          passLine,
          output,
        })),
        decision: allGreen ? "allow" : "deny",
        note: "pass-line data only — the plan file is not written by this CLI (writer = supervisor / engine BUILD_VERIFY face, M3/WI26 takes over dispatch)",
      },
      null,
      2,
    ),
  );
  process.exit(allGreen ? 0 : 1);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    usage();
    process.exit(1);
  }
  if (argv[0] === "--policy") {
    const file = argv[1];
    if (!file || argv.length > 2) {
      usage();
      process.exit(1);
    }
    runPolicyMode(file);
    return;
  }
  if (argv[0].startsWith("--")) {
    usage();
    process.exit(1);
  }
  if (argv.length === 2 && argv[1] === "--verify") {
    await runVerifyMode(argv[0]);
    return;
  }
  if (argv.length > 1) {
    usage();
    process.exit(1);
  }
  runSingleFileMode(argv[0]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
