/**
 * gate-check.mjs — law deployment face 3: pure-structure CLI (02 §6).
 *
 * Two modes (age-autonomy M2-WI12, plan
 * docs/plans/age-autonomy/2026-08-25-0815-1 Phase 3):
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
 * Bare invocation prints usage and exits 1.
 *
 * Deliberately NOT a build-bundle module (main.js CLI family, same as
 * plan-check.mjs's sibling): the DSH plugin consumes the law kernel from its
 * assets copy, not this CLI.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateGates, structuralRuleIds } from "./law-core.mjs";
import { loadPolicyFile, policyAgentNames } from "./law-policy.mjs";

function usage() {
  console.error("Usage:");
  console.error("  gate-check.mjs --policy <autonomy.policy.yml>    validate policy schema (exit 0/1)");
  console.error("  gate-check.mjs <plan.md>                         single-file structural-face evaluation");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
  } else if (argv[0].startsWith("--")) {
    usage();
    process.exit(1);
  } else {
    if (argv.length > 1) {
      usage();
      process.exit(1);
    }
    runSingleFileMode(argv[0]);
  }
}
