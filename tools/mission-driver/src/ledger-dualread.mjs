// AGE file-ledger dual-read resolver — the ONE shared implementation behind
// plan-check.mjs / flow-loader.js / roadmap-check.mjs / monitor.js
// (01-file-ledger §5.2 "不得各自带正则"; wiring per plan 0635-3 Phase 1
// Decision 5). Env circuit breaker: MISSION_DRIVER_LEDGER = auto|legacy|frontmatter.
//   auto       — frontmatter first, legacy status line / suffix fallback (default)
//   legacy     — rollback channel: legacy lines only; frontmatter files are
//                invisible (treated as non-plans), never misparsed
//   frontmatter— tightening mode (M2 enforce breakpoint): legacy-only files are
//                rejected, not silently legacy-parsed
import { parseFrontmatter, TERMINAL_PLAN_STATUSES, validatePlanFrontmatter } from "./ledger-frontmatter.mjs";
import { splitLedgerSections, deriveCompleted } from "./ledger-sections.mjs";

// The single legacy `> Plan Status:` line matcher — union of the two formerly
// divergent copies (plan-check.mjs's restricted status charset + flow-loader's
// bold/case tolerance). The charset-restricted capture is load-bearing: prose
// lines like the plan guide's `> Status: additive (…annotation…)` must NOT be
// read as a plan status (guide files are not plans). law-rules.mjs's
// legacy-plan-freeze (M2-WI22, the retired dsh plan-status-gate's successor
// face) imports it from the bundled copy of THIS module.
export const PLAN_STATUS_RE = /^>\s*\*{0,2}(?:[Pp]lan\s+)?[Ss]tatus\*{0,2}\s*:\s*\*{0,2}([A-Za-z][A-Za-z /-]*)\*{0,2}\s*$/m;

export function ledgerReadMode() {
  const raw = (process.env.MISSION_DRIVER_LEDGER ?? "").trim().toLowerCase();
  const v = raw === "" ? "auto" : raw;
  if (v !== "auto" && v !== "legacy" && v !== "frontmatter") {
    throw new Error(`MISSION_DRIVER_LEDGER: invalid value "${raw}" — expected auto | legacy | frontmatter`);
  }
  return v;
}

// Parenthetical annotations ("active（draft → active：…）") are noise: truncate
// at the first ( or （ so only the status token is compared (ex-flow-loader
// semantics, now shared).
export function normalizeLegacyStatus(s) {
  const cut = s.search(/[（(]/);
  const base = cut !== -1 ? s.slice(0, cut) : s;
  return base.toLowerCase().replace(/\s+/g, " ").trim();
}

function fmHasStatus(fm) {
  return fm !== null && typeof fm === "object" && fm.status !== undefined;
}

// M2-WI42: field-set validation rides the ONE read seam — every
// frontmatter-format read carries `fieldErrors` (validator messages) and
// `fieldsValid`, so plan-check / flow-loader / monitor see them through
// planLedgerState without each re-implementing the check (01 §5.2 single
// implementation discipline). Non-frontmatter formats simply don't attach the
// keys — there is no plan field set to validate on a legacy line or a guide.
function fmReadResult(mode, split) {
  const { ok, errors } = validatePlanFrontmatter(split.fm, { split });
  return { mode, format: "frontmatter", status: split.fm.status, rejected: null, fieldErrors: errors, fieldsValid: ok };
}

/**
 * Resolve a plan file's ledger format + status under the active env mode.
 * Returns { mode, format: "frontmatter"|"legacy"|"none", status, rejected }.
 *  - format "frontmatter": status = fm.status (writable vocabulary only —
 *    `completed` is derived and never written; use planDerivedCompleted for it);
 *    additionally carries fieldErrors[] + fieldsValid from
 *    validatePlanFrontmatter (M2-WI42 read-seam wiring)
 *  - format "legacy": status = raw legacy line value (normalizeLegacyStatus it)
 *  - format "none": not a plan (guide/template) — or rejected in frontmatter mode
 * Fenced template examples never match the legacy line (fence mask applies).
 */
export function readPlanStatus(text) {
  const mode = ledgerReadMode();
  const split = splitLedgerSections(text);
  // `split.hasFrontmatter` is false when parsing fails before a closed block can
  // be recorded. The opening delimiter still selects the ledger format so a
  // malformed new-format file cannot be interpreted as a legacy plan.
  const hasFrontmatter = /^\uFEFF?[ \t]*---[ \t]*(?:\r?\n|$)/.test(text);
  const hasFm = hasFrontmatter && split.fmError === null && fmHasStatus(split.fm);

  if (mode === "frontmatter") {
    if (hasFm) return fmReadResult(mode, split);
    if (hasFrontmatter) return { mode, format: "frontmatter", status: null, rejected: split.fmError ?? "frontmatter missing required status field", fieldErrors: [] };
    return { mode, format: "none", status: null, rejected: "legacy-or-non-plan-format-rejected-in-frontmatter-mode" };
  }

  // An opened frontmatter block is an explicit format choice. Never let a malformed
  // ledger file fall through into the legacy parser because it happens to contain a
  // legacy-looking status line in prose.
  if (hasFrontmatter && !hasFm) {
    return { mode, format: "frontmatter", status: null, rejected: split.fmError ?? "frontmatter missing required status field", fieldErrors: [] };
  }

  let legacy = null;
  for (let i = 0; i < split.lines.length; i++) {
    if (split.fenced[i]) continue;
    const m = split.lines[i].match(PLAN_STATUS_RE);
    if (m) { legacy = m[1].trim(); break; }
  }

  if (mode === "legacy") {
    return legacy !== null
      ? { mode, format: "legacy", status: legacy, rejected: null }
      : { mode, format: "none", status: null, rejected: null };
  }

  if (hasFm) return fmReadResult(mode, split);
  if (legacy !== null) return { mode, format: "legacy", status: legacy, rejected: null };
  return { mode, format: "none", status: null, rejected: null };
}

/**
 * Derivation view for frontmatter plans: completed (01 §5.2 formula; verify
 * keys come from fm.verify — callers with mission defaults inject via
 * opts.defaultVerifyKeys) and terminal classification for closedPlans.
 * Legacy files return { completed: status === "completed", ... } per the
 * migration ruling: legacy `> Plan Status: completed` ⇒ closed forever.
 */
export function planLedgerState(text, opts = {}) {
  const read = readPlanStatus(text);
  if (read.format === "legacy") {
    const status = normalizeLegacyStatus(read.status);
    return {
      ...read,
      normalized: status,
      completed: status === "completed",
      terminal: ["completed", "cancelled", "superseded", "deferred", "replaced"].includes(status),
      derived: null,
    };
  }
  if (read.format === "frontmatter") {
    const derived = deriveCompleted(text, opts);
    return {
      ...read,
      normalized: derived.completed ? "completed" : read.status,
      completed: derived.completed,
      terminal: TERMINAL_PLAN_STATUSES.includes(read.status),
      derived,
    };
  }
  return { ...read, normalized: null, completed: false, terminal: false, derived: null };
}
