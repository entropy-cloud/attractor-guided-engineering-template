// AGE rule-law kernel: proposedAction contract, rule registry, evaluate entry,
// and the seed structural rule `plan-structure`.
// Contract: docs/design/age-autonomy/02-rule-law.md §2/§6 + 01-file-ledger §2/§5.2
// (placement + posture decisions pinned in
// docs/plans/age-autonomy/2026-08-25-0815-1 Phase 1):
//   - engine-side zero-npm module shared to the plugin via build-bundle
//     ALLOWED_MODULES (0635-1 shared-library ruling extended to law); the
//     plugin-side `plugin/dsh/src/law/` hosts only host glue (actor resolve,
//     policy IO, pre-execute registration, observation log).
//   - rules are pure functions (proposedAction, currentFileState, ctx) →
//     allow | deny(reason) | observe; determinism keeps the truth-table test
//     style and the CI structural-subset deployment face possible (02 §2).
//   - gate posture: every policy gate entry carries mode observe|enforce
//     (default observe — 02 §6 rolling discipline mechanized). observe-mode
//     deny is recorded, never enforced.
//   - actor optional: absent actor = structural-subset posture — the result
//     carries an `unverified-writer` note but identity never feeds the verdict.
//   - malformed input (unknown type, missing path/proposedContent, bad actor
//     shape) → deny malformed: decidable contract fact, not an internal fault.
//     Internal faults (bugs) may throw; the host adapter fail-opens.
//   - baseHash CAS: writer-supplied hint; compared best-effort against
//     currentFileState when both are present. M2 records a `stale-write`
//     observation on mismatch without denying — the deny routing rides the
//     Q4 single-writer adjudication (02 §4.5) deferred to M3.

import { createHash } from "node:crypto";
import { validatePlanFrontmatter } from "./ledger-frontmatter.mjs";
import { scanPlanLedger } from "./ledger-sections.mjs";
import { readPlanStatus } from "./ledger-dualread.mjs";

export const PROPOSED_ACTION_TYPES = [
  "write", "edit", "str_replace_editor", "claim", "dispatch", "terminal-claim",
];

export const ACTOR_ROLES = ["human", "drafter", "reviewer", "auditor", "supervisor", "engine", "executor"];

export function sha256Text(text) {
  return createHash("sha256").update(String(text), "utf8").digest("hex");
}

// ── proposedAction contract (02 §2) ─────────────────────────────────────────

/**
 * Parse + validate one proposedAction input.
 * @returns {{ ok: true, action: object } | { ok: false, error: string }}
 *   Never throws — invalid input is a decidable malformed fact (deny, not crash).
 */
export function parseProposedAction(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "proposedAction must be a plain object" };
  }
  const { type, path, proposedContent, baseHash, actor } = input;
  if (typeof type !== "string" || !PROPOSED_ACTION_TYPES.includes(type)) {
    return {
      ok: false,
      error: `unknown proposedAction.type ${JSON.stringify(type)} — must be one of: ${PROPOSED_ACTION_TYPES.join(" | ")}`,
    };
  }
  if (typeof path !== "string" || path.trim() === "") {
    return { ok: false, error: "proposedAction.path must be a non-empty string" };
  }
  if (typeof proposedContent !== "string") {
    return { ok: false, error: "proposedAction.proposedContent must be a string" };
  }
  if (baseHash !== undefined && (typeof baseHash !== "string" || !/^[0-9a-f]{64}$/.test(baseHash))) {
    return { ok: false, error: "proposedAction.baseHash must be a sha256 hex string when present" };
  }
  let actorOut;
  if (actor !== undefined) {
    if (actor === null || typeof actor !== "object" || Array.isArray(actor)) {
      return { ok: false, error: "proposedAction.actor must be { id?, role? } when present" };
    }
    if (actor.id !== undefined && (typeof actor.id !== "string" || actor.id === "")) {
      return { ok: false, error: "proposedAction.actor.id must be a non-empty string when present" };
    }
    if (actor.role !== undefined && !ACTOR_ROLES.includes(actor.role)) {
      return {
        ok: false,
        error: `proposedAction.actor.role ${JSON.stringify(actor.role)} is not one of: ${ACTOR_ROLES.join(" | ")}`,
      };
    }
    if (actor.id === undefined && actor.role === undefined) {
      return { ok: false, error: "proposedAction.actor must carry id and/or role" };
    }
    actorOut = {
      ...(actor.id !== undefined ? { id: actor.id } : {}),
      ...(actor.role !== undefined ? { role: actor.role } : {}),
    };
  }
  return {
    ok: true,
    action: {
      type,
      path,
      proposedContent,
      ...(baseHash !== undefined ? { baseHash } : {}),
      ...(actorOut !== undefined ? { actor: actorOut } : {}),
    },
  };
}

// ── rule registry ───────────────────────────────────────────────────────────

/**
 * rule fn: (action, currentFileState, ctx) →
 *   { verdict: "allow" | "deny" | "observe", reason?: string }
 * currentFileState: { text?: string, hash?: string } | null
 * ctx: { plansDir?: string, roadmapPath?: string, agentNames?: string[],
 *         commands?: Record<string,string>, maxAuditRounds?: number,
 *         plans?: Array<{text: string, path?: string}>, now?: number | string,
 *         defaultVerifyKeys?: string[] }
 */
const RULES = new Map();

export function registerRule(id, fn, meta = {}) {
  if (typeof id !== "string" || id === "") throw new Error("rule id must be a non-empty string");
  if (typeof fn !== "function") throw new Error(`rule ${id} must be a function`);
  if (RULES.has(id)) throw new Error(`rule ${id} is already registered`);
  RULES.set(id, { id, fn, structural: meta.structural === true });
}

export function listRuleIds() {
  return [...RULES.keys()];
}

export function structuralRuleIds() {
  return [...RULES.values()].filter((r) => r.structural).map((r) => r.id);
}

export function getRule(id) {
  return RULES.get(id) ?? null;
}

// ── gate matching ───────────────────────────────────────────────────────────

export const POLICY_PLACEHOLDERS = ["{{plansDir}}", "{{roadmapPath}}"];

function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**/` matches zero or more path segments (a/**/*.md hits a/x.md);
        // a bare trailing `**` matches anything (including /).
        if (glob[i + 2] === "/") {
          out += "(?:[\\s\\S]*/)?";
          i += 2;
        } else {
          out += "[\\s\\S]*";
          i++;
        }
      } else {
        out += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(`^${out}$`);
}

function toPosix(p) {
  return String(p).split("\\").join("/");
}

/**
 * Does one gate `match` pattern apply to this action under the mission ctx?
 *   - "action:<type>" matches the action type (terminal claims are actions,
 *     not file paths — 02 §3).
 *   - "{{plansDir}}/…"/"{{roadmapPath}}" path globs resolve placeholders from
 *     ctx, then glob-match the action path (posix-normalized). Unresolvable
 *     placeholders never match (gate flagged via notes at evaluate level).
 */
export function matchGate(pattern, action, ctx = {}) {
  if (typeof pattern !== "string" || pattern === "") return false;
  if (pattern.startsWith("action:")) {
    const t = pattern.slice("action:".length);
    return PROPOSED_ACTION_TYPES.includes(t) && action.type === t;
  }
  let resolved = pattern;
  let unresolved = false;
  for (const ph of POLICY_PLACEHOLDERS) {
    if (!resolved.includes(ph)) continue;
    const key = ph === "{{plansDir}}" ? "plansDir" : "roadmapPath";
    const val = ctx[key];
    if (typeof val !== "string" || val === "") {
      unresolved = true;
      continue;
    }
    resolved = resolved.split(ph).join(toPosix(val));
  }
  if (unresolved) return false;
  return globToRegExp(toPosix(resolved)).test(toPosix(action.path));
}

// ── seed rule: plan-structure (02 §4.7 structural face + 01 §2/§5.2) ────────

/**
 * "The file, as proposed, is still a legal plan ledger": counting-domain
 * discipline + frontmatter field-set legality + append-only section line
 * grammar, all through the shared M1 scanners (zero re-implementation).
 *
 * Dual-read domain guard (false-kill discipline, 02 §6 WI13 lesson): files
 * that are not frontmatter-format plans (legacy corpus during the dual-read
 * transition, non-plan markdown) are OUT of this rule's domain — allow with a
 * note. The frontmatter-tightening deny switch belongs to the M2 enforce
 * stage, not the seed.
 */
function planStructureRule(action, currentFileState, ctx = {}) {
  const scan = scanPlanLedger(action.proposedContent);
  // Broken frontmatter syntax is a decidable violation (deny), NOT an
  // out-of-domain skip — a file that opens a frontmatter block must parse
  // cleanly. Only files WITHOUT a frontmatter block take the dual-read
  // out-of-domain branch below.
  if (scan.fmError) {
    return {
      verdict: "deny",
      reason: `plan-structure: proposed content is not a legal plan ledger — frontmatter: ${scan.fmError}`,
    };
  }
  if (!scan.hasFrontmatter) {
    const read = readPlanStatus(action.proposedContent);
    return {
      verdict: "allow",
      reason: `format=${read.format} — not a frontmatter ledger plan; outside plan-structure domain (dual-read transition)`,
    };
  }
  const problems = [];
  const v = validatePlanFrontmatter(scan.fm, { agentNames: ctx.agentNames });
  problems.push(...v.errors);
  for (const e of scan.errors) problems.push(`line ${e.line}: ${e.code}: ${e.message}`);
  if (problems.length > 0) {
    return {
      verdict: "deny",
      reason: `plan-structure: proposed content is not a legal plan ledger — ${problems.join("; ")}`,
    };
  }
  return { verdict: "allow" };
}

registerRule("plan-structure", planStructureRule, { structural: true });

// ── evaluate entry ──────────────────────────────────────────────────────────

/**
 * Evaluate one proposedAction against a mission-resolved policy.
 *
 * @param {object} actionInput raw proposedAction (validated here; malformed → deny)
 * @param {object} [opts]
 * @param {object} [opts.policy] parsed policy ({ gates: [...] }); absent → no gates
 * @param {{ text?: string, hash?: string }} [opts.currentFileState]
 * @param {{ plansDir?: string, roadmapPath?: string, agentNames?: string[], commands?: Record<string,string>, maxAuditRounds?: number, plans?: Array<{text: string, path?: string}>, now?: number | string, defaultVerifyKeys?: string[] }} [opts.ctx]
 * @returns {{
 *   decision: "allow" | "deny",
 *   reason: string | null,
 *   malformed: boolean,
 *   observations: Array<{ gateId: string, rule: string, mode: string, verdict: string, reason: string | null, error?: string }>,
 *   notes: string[],
 * }}
 */
export function evaluateGates(actionInput, opts = {}) {
  const { policy = null, currentFileState = null, ctx = {} } = opts;
  const observations = [];
  const notes = [];

  const parsed = parseProposedAction(actionInput);
  if (!parsed.ok) {
    return { decision: "deny", reason: `malformed-action: ${parsed.error}`, malformed: true, observations, notes };
  }
  const action = parsed.action;

  // Structural-subset posture: no actor at all, or an id-only actor with no
  // role (the DSH pre-execute face — 0815-1 Phase 1 Explore conclusion),
  // runs with the unverified-writer note; identity never feeds the verdict.
  if (!action.actor || action.actor.role === undefined) notes.push("unverified-writer");

  if (action.baseHash !== undefined) {
    if (currentFileState && typeof currentFileState.text === "string") {
      const currentHash = currentFileState.hash ?? sha256Text(currentFileState.text);
      if (currentHash !== action.baseHash) {
        notes.push("stale-write");
        observations.push({
          gateId: "(cas)",
          rule: "baseHash",
          mode: "observe",
          verdict: "deny",
          reason: "stale-write: proposedAction.baseHash does not match currentFileState (M2 observe-only; deny routing deferred to the Q4 single-writer adjudication)",
        });
      }
    } else {
      notes.push("cas-unverified");
    }
  }

  const gates = policy && Array.isArray(policy.gates) ? policy.gates : [];
  let denyReason = null;
  for (const gate of gates) {
    if (!gate || typeof gate !== "object") continue;
    const matched = matchGate(gate.match, action, ctx);
    if (!matched) continue;
    const mode = gate.mode === "enforce" ? "enforce" : "observe";
    const entry = RULES.get(gate.rule);
    if (!entry) {
      observations.push({
        gateId: gate.id,
        rule: gate.rule,
        mode,
        verdict: "observe",
        reason: `unknown-rule: ${gate.rule} is not in the kernel registry (policy should have failed schema validation)`,
      });
      continue;
    }
    let verdict;
    try {
      verdict = entry.fn(action, currentFileState, ctx) ?? { verdict: "observe", reason: "rule returned nothing" };
    } catch (err) {
      // fail-open per rule: one broken rule never blocks other gates (02 §6)
      observations.push({
        gateId: gate.id,
        rule: gate.rule,
        mode,
        verdict: "observe",
        reason: `rule-error: ${err instanceof Error ? err.message : String(err)}`,
        error: String(err),
      });
      continue;
    }
    const v = verdict.verdict === "deny" || verdict.verdict === "allow" ? verdict.verdict : "observe";
    observations.push({
      gateId: gate.id,
      rule: gate.rule,
      mode,
      verdict: v,
      reason: verdict.reason ?? null,
    });
    if (v === "deny" && mode === "enforce" && denyReason === null) {
      denyReason = `gate ${gate.id} (${gate.rule}) denied: ${verdict.reason ?? "no reason given"}`;
    }
  }

  return {
    decision: denyReason === null ? "allow" : "deny",
    reason: denyReason,
    malformed: false,
    observations,
    notes,
  };
}
