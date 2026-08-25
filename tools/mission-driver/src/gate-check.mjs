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

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateGates, structuralRuleIds } from "./law-core.mjs";
import { loadPolicyFile, policyAgentNames } from "./law-policy.mjs";
import { discoverOwningMission } from "./mission-check.mjs";
import { resolveVerifyPlan, runVerifyCommands } from "./verify-runner.mjs";

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

function runSingleFileMode(file) {
  const abs = resolve(file);
  let text;
  try {
    text = readFileSync(abs, "utf8");
  } catch (e) {
    console.log(JSON.stringify({ file: abs, decision: "deny", error: e instanceof Error ? e.message : String(e) }, null, 2));
    process.exit(1);
  }
  // Structural subset: a synthetic write-shaped action with no actor; the
  // policy match domain is bypassed by addressing structural rules directly
  // (their domain logic — frontmatter vs legacy — lives inside the rules).
  const out = evaluateGates(
    { type: "write", path: abs, proposedContent: text },
    {
      policy: { gates: structuralRuleIds().map((rule, i) => ({ id: `structural-${i + 1}`, match: "{{plansDir}}/**/*.md", rule, mode: "enforce" })) },
      ctx: { plansDir: resolve(abs, "..") },
    },
  );
  console.log(
    JSON.stringify(
      {
        file: abs,
        face: "structural-subset",
        actor: "absent (unverified-writer posture)",
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
