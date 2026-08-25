// AGE rule-law hard-gate rules (age-autonomy M2-WI14/WI15/WI16, plan
// docs/plans/age-autonomy/2026-08-25-0815-2; supporting gates
// M2-WI17..WI20, plan docs/plans/age-autonomy/2026-08-25-0815-3).
//
// Placement ruling (0815-1 Phase 1 extended): rules live engine-side in the
// zero-npm law kernel family; this module is imported by law-policy.mjs (NOT
// by law-core.mjs — that would be an import cycle), so every consumer that
// loads the policy loader (config.js fail-fast, gate-check.mjs, the DSH host
// adapter) gets the rules registered into the shared kernel registry as an
// import side effect, mirroring how law-core itself is reached.
//
// Deployment faces (02 §2/§6):
//   - structural subset (no actor, or id-only actor without a role): pairing,
//     syntax, and lexical checks decide; identity assertions NEVER join the
//     verdict — the result notes the unverified-writer posture instead of
//     claiming writer verification (02 §4.1 CI discipline).
//   - DSH actor face (actor.id present): session-id equality against ledger
//     facts (dispatch sessionId / claim holder) IS decidable and enforced;
//     role-bearing actors (M3 supervisor face) additionally get the role
//     whitelist edges.
//   - dual-read domain guard (WI13 false-kill lesson): files without a
//     frontmatter block (legacy corpus, non-plan markdown) are OUT of every
//     rule's domain — allow with a format note.

import { registerRule } from "./law-core.mjs";
import {
  activePlans,
  computeBasisHash,
  deriveCompleted,
  draftPlans,
  scanPlanLedger,
  scanRoadmapLedger,
  splitLedgerSections,
} from "./ledger-sections.mjs";

// ── shared section helpers ──────────────────────────────────────────────────

function findSection(split, level, title) {
  for (const block of split.blocks) {
    if (block.level === level && block.text === title) return block;
  }
  return null;
}

function sectionText(split, block) {
  return [split.lines[block.headingLine - 1], ...block.lines].join("\n");
}

function currentTextOf(currentFileState) {
  return currentFileState && typeof currentFileState.text === "string" ? currentFileState.text : null;
}

function sectionRangeErrors(scan, block) {
  // scan error line numbers are 1-based; the block body ends at bodyEnd
  // (exclusive index) → the last body line number is bodyEnd.
  return scan.errors.filter((e) => e.line >= block.headingLine && e.line <= block.bodyEnd);
}

function idSet(entries) {
  return new Set(entries.filter((e) => e.id && e.valid !== false).map((e) => e.id));
}

// ── receipt-binding core (02 §4.1 hard gate 1, both faces) ──────────────────

const DISPATCHER_ROLES = ["engine", "supervisor"];

/**
 * Shared verdict for the audit-receipt binding gate over one append-only
 * receipt section (`## Closure` on plans / `## Deep Audit Record` on
 * roadmaps). Checks:
 *   1. structural face — section line grammar via the shared M1 scanner
 *      (deny on any in-section scan error), same-id dispatch/accepted
 *      pairing (an accepted line with no same-id dispatch line is a forged
 *      receipt → deny; a dispatch line with no accepted yet is the legal
 *      in-flight intermediate state → never a deny);
 *   2. writer face — NEW accepted lines must come from the session the
 *      dispatch line registered (actor.id === dispatch sessionId); NEW
 *      dispatch lines must come from a dispatcher role when a role is
 *      available at all (transition period: flow dispatch-step sessions are
 *      id-only → unverified-writer note, never a deny).
 */
function auditBindingVerdict(action, currentFileState, opts) {
  const { scan, block, sectionTitle, gateName, receiptHint, registry, scanCurrent } = opts;
  const actor = action.actor;
  const actorId = actor && typeof actor.id === "string" ? actor.id : null;
  const actorRole = actor && typeof actor.role === "string" ? actor.role : null;

  const syntax = sectionRangeErrors(scan, block);
  if (syntax.length > 0) {
    return {
      verdict: "deny",
      reason: `${gateName}: ${sectionTitle} is not a legal receipt ledger — ${syntax
        .map((e) => `line ${e.line}: ${e.code}: ${e.message}`)
        .join("; ")}`,
    };
  }

  const reg = registry(scan);
  const unpaired = reg.unpairedConclusions ?? [];
  if (unpaired.length > 0) {
    return {
      verdict: "deny",
      reason: `${gateName}: unbound conclusion line(s) ${unpaired.join(", ")} — every accepted line requires a same-id dispatch line in ${sectionTitle}; ${receiptHint}`,
    };
  }

  // writer face — only decidable with an actor.id (DSH face minimum).
  if (actorId === null) {
    return {
      verdict: "allow",
      reason: `${gateName}: structural face verified (grammar + same-id pairing); writer face not evaluated — no actor on this deployment face (unverified-writer posture, 02 §4.1)`,
    };
  }

  const currentText = currentTextOf(currentFileState);
  const currentReg = currentText !== null ? registry(scanCurrent(currentText)) : null;
  const knownAccepted = currentReg ? idSet(currentReg.accepted) : new Set();
  const knownDispatch = currentReg ? idSet(currentReg.dispatches) : new Set();

  const dispatchById = new Map(reg.dispatches.filter((d) => d.valid).map((d) => [d.id, d]));
  for (const acc of reg.accepted) {
    if (!acc.id || acc.valid === false || knownAccepted.has(acc.id)) continue;
    const dispatch = dispatchById.get(acc.id);
    if (dispatch && actorId !== dispatch.sessionId) {
      return {
        verdict: "deny",
        reason: `${gateName}: accepted ${acc.id} written by actor ${actorId} but dispatched to ${dispatch.sessionId} — the conclusion line must land from the dispatched auditor session (02 §4.1)`,
      };
    }
  }
  for (const d of reg.dispatches) {
    if (!d.id || d.valid === false || knownDispatch.has(d.id)) continue;
    if (actorRole !== null && !DISPATCHER_ROLES.includes(actorRole)) {
      return {
        verdict: "deny",
        reason: `${gateName}: dispatch ${d.id} written by role ${actorRole} — dispatch lines are written by the dispatcher (engine | supervisor); transition-period flow dispatch sessions are id-only (02 §4.1)`,
      };
    }
  }

  const writerNote =
    actorRole === null
      ? "; dispatch-line writer role not verifiable on this face (id-only actor — transition-period flow dispatch posture)"
      : "";
  return {
    verdict: "allow",
    reason: `${gateName}: receipts bound (grammar + same-id pairing + accepted-writer session match)${writerNote}`,
  };
}

function closureAuditBindingRule(action, currentFileState) {
  const text = action.proposedContent;
  const scan = scanPlanLedger(text);
  if (scan.fmError) {
    return { verdict: "allow", reason: "closure-audit-binding: frontmatter unreadable — plan-structure owns that deny face" };
  }
  if (!scan.hasFrontmatter) {
    return {
      verdict: "allow",
      reason: "closure-audit-binding: not a frontmatter ledger plan; outside domain (dual-read transition)",
    };
  }
  const split = splitLedgerSections(text);
  const block = findSection(split, 2, "Closure");
  if (block === null) {
    return { verdict: "allow", reason: "closure-audit-binding: no ## Closure section — outside domain" };
  }
  const currentText = currentTextOf(currentFileState);
  const hasRegistryLines = scan.closure && (scan.closure.dispatches.length > 0 || scan.closure.accepted.length > 0);
  if (currentText !== null) {
    const currentBlock = findSection(splitLedgerSections(currentText), 2, "Closure");
    const currentSection = currentBlock ? sectionText(splitLedgerSections(currentText), currentBlock) : null;
    const untouched = currentSection === sectionText(split, block);
    // Interception target (02 §4.1): writes touching ## Closure OR triggering
    // the full-tick decision with receipts on file.
    if (untouched && !(scan.counts.unchecked === 0 && hasRegistryLines)) {
      return { verdict: "allow", reason: "closure-audit-binding: ## Closure area untouched by this write" };
    }
  }
  return auditBindingVerdict(action, currentFileState, {
    scan,
    block,
    sectionTitle: "## Closure",
    gateName: "closure-audit-binding",
    receiptHint: "receipt binding needs the dispatcher's dispatch audit line first (02 §4.1)",
    registry: (s) => s.closure,
    scanCurrent: (t) => scanPlanLedger(t),
  });
}

// roadmap face is structurally isomorphic (01 §3.3): accepted lines must carry
// the `findings=none|items` lexeme (scanner `required` mode → in-section
// error) and the same pairing + writer disciplines apply.
function roadmapAuditBindingRule(action, currentFileState) {
  const text = action.proposedContent;
  const split = splitLedgerSections(text);
  if (split.fmError) {
    return { verdict: "allow", reason: "roadmap-audit-binding: frontmatter unreadable — structural validators own that deny face" };
  }
  if (!split.hasFrontmatter) {
    return { verdict: "allow", reason: "roadmap-audit-binding: not a frontmatter roadmap; outside domain (dual-read transition)" };
  }
  const block = findSection(split, 2, "Deep Audit Record");
  if (block === null) {
    return { verdict: "allow", reason: "roadmap-audit-binding: no ## Deep Audit Record section — outside domain" };
  }
  const currentText = currentTextOf(currentFileState);
  if (currentText !== null) {
    const currentSplit = splitLedgerSections(currentText);
    const currentBlock = findSection(currentSplit, 2, "Deep Audit Record");
    const currentSection = currentBlock ? sectionText(currentSplit, currentBlock) : null;
    if (currentSection === sectionText(split, block)) {
      return { verdict: "allow", reason: "roadmap-audit-binding: ## Deep Audit Record area untouched by this write" };
    }
  }
  const scan = scanRoadmapLedger(text);
  return auditBindingVerdict(action, currentFileState, {
    scan,
    block,
    sectionTitle: "## Deep Audit Record",
    gateName: "roadmap-audit-binding",
    receiptHint: "accepted lines must carry findings=none|items and bind to a same-id dispatch audit line (01 §3.3)",
    registry: (s) => s.deepAuditRecord,
    scanCurrent: (t) => scanRoadmapLedger(t),
  });
}

registerRule("closure-audit-binding", closureAuditBindingRule, { structural: true });
registerRule("roadmap-audit-binding", roadmapAuditBindingRule, { structural: true });

// ── hard gate 2: status-transition writer identity (02 §4.2, 01 §5.1) ───────

// 01 §5.1 edge table (the writable-state lattice). Everything not listed is
// an illegal transition — including terminal resurrection and completed
// (derived) which is never a writable source state.
const LEGAL_TRANSITIONS = new Set([
  "draft→active", "draft→held", "active→held", "held→active",
  "draft→cancelled", "draft→superseded", "draft→deferred",
  "active→cancelled", "active→superseded", "active→deferred",
  "held→cancelled", "held→superseded", "held→deferred",
]);
const TERMINAL_STATUSES = ["cancelled", "superseded", "deferred"];
const LEASE_EXEMPT_ROLES = ["supervisor", "engine"];

/**
 * claim = `attempt-<runId>-<holderSessionId>-<nonce8>`: the holder segment is
 * tail-anchored (before the nonce8) and hyphen-rich session ids are legal, so
 * holder extraction matches by suffix against the known actor id.
 */
function claimHolderMatches(claim, sessionId) {
  if (typeof claim !== "string" || typeof sessionId !== "string") return false;
  const stripped = claim.replace(/-[0-9a-f]{8}$/, "");
  return stripped.length < claim.length && stripped.endsWith(sessionId);
}

function pairedReviewDispatches(drr) {
  if (!drr) return [];
  const paired = new Set(drr.pairs ?? []);
  return (drr.dispatches ?? []).filter((d) => d.valid && paired.has(d.id));
}

function reviewerSessionIds(drr) {
  if (!drr) return [];
  return (drr.dispatches ?? []).filter((d) => d.valid).map((d) => d.sessionId);
}

function writerIdentityRule(action, currentFileState) {
  const scan = scanPlanLedger(action.proposedContent);
  if (scan.fmError) {
    return { verdict: "allow", reason: "writer-identity: frontmatter unreadable — plan-structure owns that deny face" };
  }
  if (!scan.hasFrontmatter) {
    return { verdict: "allow", reason: "writer-identity: not a frontmatter ledger plan; outside domain (dual-read transition)" };
  }

  const actor = action.actor;
  const actorId = actor && typeof actor.id === "string" ? actor.id : null;
  const actorRole = actor && typeof actor.role === "string" ? actor.role : null;
  const currentText = currentTextOf(currentFileState);
  if (currentText === null) {
    // Single-file / CI posture: no prior state → no transition and no lease
    // is observable. Identity-dependent edges degrade to the note (02 §2
    // structural-subset discipline: never deny on unobservable facts).
    return {
      verdict: "allow",
      reason: "writer-identity: no currentFileState — status transition and review lease not observable on this face (unverified-writer posture)",
    };
  }

  const currentScan = scanPlanLedger(currentText);
  if (!currentScan.hasFrontmatter || currentScan.fmError) {
    return {
      verdict: "allow",
      reason: "writer-identity: current state is not a frontmatter ledger (legacy/dual-read) — transition not observable",
    };
  }

  // ── review lease (02 §4.2): an open `dispatch review` in the CURRENT DRR
  // (dispatch without same-id conclusion) that this write does not close
  // blocks every writer except that reviewer, the supervisor, and the engine.
  const currentDrr = currentScan.draftReviewRecord;
  const proposedDrr = scan.draftReviewRecord;
  const proposedConclusions = new Set([
    ...((proposedDrr?.accepted ?? []).filter((a) => a.valid !== false).map((a) => a.id)),
    ...((proposedDrr?.conclusions ?? []).map((c) => c.id)),
  ]);
  const openDispatches = ((currentDrr?.dispatches ?? []).filter(
    (d) => d.valid && !((currentDrr.pairs ?? []).includes(d.id)),
  )).filter((d) => !proposedConclusions.has(d.id));
  if (openDispatches.length > 0) {
    const leaseReviewers = openDispatches.map((d) => d.sessionId);
    const exempt = actorRole !== null && LEASE_EXEMPT_ROLES.includes(actorRole);
    const isReviewer = actorId !== null && leaseReviewers.includes(actorId);
    if (!exempt && !isReviewer) {
      if (actorId !== null) {
        return {
          verdict: "deny",
          reason: `writer-identity: review lease active — dispatch review ${openDispatches[0].id} to ${leaseReviewers[0]} is not yet concluded; only that reviewer, the supervisor, or the engine may write this plan until the same-id conclusion line lands (02 §4.2)`,
        };
      }
      return {
        verdict: "allow",
        reason: `writer-identity: review lease observed (${openDispatches.map((d) => d.id).join(", ")}) but no actor on this face — third-party writer cannot be excluded, not claiming verification (unverified-writer posture)`,
      };
    }
  }

  // ── status transitions (01 §5.1 edge table)
  const newStatus = typeof scan.fm.status === "string" ? scan.fm.status : null;
  const oldStatus = typeof currentScan.fm.status === "string" ? currentScan.fm.status : null;
  if (oldStatus === null || newStatus === null || oldStatus === newStatus) {
    return { verdict: "allow", reason: "writer-identity: no status transition in this write" };
  }

  // ④ executors never write status — no exception edge (02 §4.2). The claim
  // holder is the registered executor session on this plan.
  if (actorRole === "executor") {
    return { verdict: "deny", reason: "writer-identity: executors never write status — the claim holder only ticks checkboxes (01 §5.1 T4, 02 §4.2)" };
  }
  if (actorId !== null) {
    for (const fm of [currentScan.fm, scan.fm]) {
      if (fm && typeof fm.claim === "string" && claimHolderMatches(fm.claim, actorId)) {
        return {
          verdict: "deny",
          reason: `writer-identity: actor ${actorId} is the registered claim holder (executor) on this plan — executors never write status (01 §5.1 T4, 02 §4.2)`,
        };
      }
    }
  }

  if (!LEGAL_TRANSITIONS.has(`${oldStatus}→${newStatus}`)) {
    return {
      verdict: "deny",
      reason: `writer-identity: illegal transition ${oldStatus}→${newStatus} — legal edges per 01 §5.1: draft→active (review receipt), draft/active→held (review hold / circuit breaker), held→active (unlock or new review, failures reset), draft/active/held→cancelled|superseded|deferred (disposition); terminal states never resurrect — restart work as a new plan`,
    };
  }

  const paired = pairedReviewDispatches(proposedDrr);
  const registeredReviewers = reviewerSessionIds(proposedDrr);

  if (newStatus === "active" && oldStatus === "draft") {
    // ① draft→active: writer must be the dispatched reviewer of a PAIRED
    // review receipt (dispatch + same-id conclusion in the DRR).
    if (paired.length === 0) {
      return {
        verdict: "deny",
        reason: "writer-identity: draft→active requires the Draft Review Record to carry a dispatch review line WITH its same-id conclusion line — self-activation without a paired review receipt is denied (01 §5.1 T3, 02 §4.2)",
      };
    }
    if (actorId !== null && !paired.some((d) => d.sessionId === actorId)) {
      return {
        verdict: "deny",
        reason: `writer-identity: draft→active written by actor ${actorId} but the paired review was dispatched to ${paired[0].sessionId} — only the dispatched reviewer session may activate the plan (01 §5.1 T3)`,
      };
    }
    return {
      verdict: "allow",
      reason: `writer-identity: draft→active with paired review receipt${actorId === null ? " — writer session not verifiable on this face (unverified-writer posture)" : ` by the dispatched reviewer ${actorId}`}`,
    };
  }

  if (newStatus === "active" && oldStatus === "held") {
    // ② held→active: same write must reset failures to 0 and remove hold.
    const failuresReset = scan.fm.failures === undefined || scan.fm.failures === 0;
    const holdRemoved = scan.fm.hold === undefined;
    if (!failuresReset || !holdRemoved) {
      return {
        verdict: "deny",
        reason: `writer-identity: malformed held→active transition — the same write must reset failures to 0 and remove hold (01 §5.1 T6; got failures=${JSON.stringify(scan.fm.failures ?? undefined)}, hold=${JSON.stringify(scan.fm.hold ?? undefined)})`,
      };
    }
    const unlockReviewer = actorId !== null && paired.some((d) => d.sessionId === actorId);
    return {
      verdict: "allow",
      reason: `writer-identity: held→active with failures reset${unlockReviewer ? ` by the new review's dispatched reviewer ${actorId}` : " — supervisor-unlock writer identity has no receipt syntax on this face (mdcontrol.unlock routing is M3), not claiming verification (unverified-writer posture)"}`,
    };
  }

  if (TERMINAL_STATUSES.includes(newStatus)) {
    // ③ terminal disposition: supervisor routing or a registered reviewer.
    const isReviewer = actorId !== null && registeredReviewers.includes(actorId);
    const isSupervisor = actorRole === "supervisor";
    return {
      verdict: "allow",
      reason: `writer-identity: ${oldStatus}→${newStatus} disposition${isReviewer ? ` by registered reviewer ${actorId}` : isSupervisor ? " by the supervisor" : " — disposition writer identity is role-dependent with no receipt syntax (supervisor routing is M3), not claiming verification (unverified-writer posture)"}`,
    };
  }

  // draft/active→held (T5): evidence/identity faces belong to the hold gate
  // family (M3); the field-shape discipline is plan-structure's.
  return { verdict: "allow", reason: `writer-identity: ${oldStatus}→${newStatus} is a legal T5 edge` };
}

registerRule("writer-identity", writerIdentityRule, { structural: true });

// ── hard gate 3: completion-derivation gate (02 §4.3, 01 §5.2) ───────────────

function nowMs(ctx) {
  if (ctx && ctx.now !== undefined) {
    const ms = typeof ctx.now === "number" ? ctx.now : Date.parse(ctx.now);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function planCompletedRule(action, currentFileState, ctx = {}) {
  const text = action.proposedContent;
  const scan = scanPlanLedger(text);
  if (scan.fmError) {
    return { verdict: "allow", reason: "plan-completed: frontmatter unreadable — plan-structure owns that deny face" };
  }
  if (!scan.hasFrontmatter) {
    return { verdict: "allow", reason: "plan-completed: not a frontmatter ledger plan; outside domain (dual-read transition)" };
  }

  const currentText = currentTextOf(currentFileState);
  let currentScan = null;
  if (currentText !== null) {
    const cs = scanPlanLedger(currentText);
    if (cs.hasFrontmatter && !cs.fmError) currentScan = cs;
  }

  // ── terminal freeze (02 §4.3): once completed is derived or the status is
  // a writable terminal, the basis domain (frontmatter + Phase blocks +
  // Closure Findings = every status/checkbox/machine field) is immutable —
  // append-only additions outside it stay legal; restart work = new plan.
  if (currentScan !== null) {
    const currentStatus = typeof currentScan.fm.status === "string" ? currentScan.fm.status : null;
    const currentDerived = deriveCompleted(currentText, { defaultVerifyKeys: ctx.defaultVerifyKeys });
    if (currentDerived.completed || TERMINAL_STATUSES.includes(currentStatus)) {
      if (computeBasisHash(currentText) !== computeBasisHash(text)) {
        return {
          verdict: "deny",
          reason: `plan-completed: terminal freeze — this plan is ${currentDerived.completed ? "derived completed" : currentStatus} (terminal), and the write changes the basis domain (frontmatter / Phase checkboxes / Closure Findings); Phase checkbox, status, and machine-field writes are denied after closure, restart the work as a new plan (02 §4.3 — this also blocks reusing an old accepted receipt against new unchecked items)`,
        };
      }
      return {
        verdict: "allow",
        reason: "plan-completed: terminal freeze active — basis domain unchanged; append-only additions outside the counting domain are legal",
      };
    }
  }

  // ── full-tick transition, whole-file proposed-content granularity. The
  // audit-rejection path (③) needs no state bit: appending unchecked Closure
  // Findings items naturally leaves the full-tick state.
  if (scan.counts.unchecked !== 0) {
    return { verdict: "allow", reason: "plan-completed: not full-tick — completion-derivation gate inert" };
  }

  const pairs = scan.closure ? scan.closure.pairs : [];
  if (pairs.length > 0) {
    // ① receipts on file: the completion formula itself is the gate.
    const derived = deriveCompleted(text, { defaultVerifyKeys: ctx.defaultVerifyKeys });
    if (derived.completed) {
      return { verdict: "allow", reason: "plan-completed: full-tick with bound receipts — completion formula satisfied (01 §5.2)" };
    }
    return {
      verdict: "deny",
      reason: `plan-completed: full-tick with receipts but the completion formula is unsatisfied — ${derived.reasons.join("; ")} (re-run mechanical verification for the current basisHash and keep receipts bound, 01 §5.2)`,
    };
  }

  const isTransition = currentScan === null || currentScan.counts.unchecked > 0;
  if (!isTransition) {
    // Already full-tick without receipts in the prior state: verification
    // pass lines and audit dispatches land INSIDE awaitingClosure — these
    // maintenance writes are the road to completion, never a deny.
    return {
      verdict: "allow",
      reason: "plan-completed: awaitingClosure maintenance write (already full-tick, audit receipt not yet bound)",
    };
  }

  if (currentScan === null) {
    // Single-file / CI posture: awaitingClosure is a legal derived middle
    // state (01 §5.2); the claim-holder path is unverifiable without the
    // prior state — noted, never impersonated.
    return {
      verdict: "allow",
      reason: "plan-completed: full-tick without receipts = awaitingClosure (legal derived middle state, 01 §5.2); claim-holder gate not verifiable without prior state (unverified-writer posture)",
    };
  }

  // ② full-tick transition without receipts: only a valid claim held by the
  // writer allows it, and the same write MUST clear the claim (01 §4.4 —
  // claims are cleared before/at awaitingClosure; no executor ticking while
  // verification/audit is in flight).
  const claim = currentScan.fm.claim;
  const claimExpires = currentScan.fm["claim-expires"];
  if (typeof claim !== "string") {
    return {
      verdict: "deny",
      reason: "plan-completed: full-tick transition without an audit receipt and without a valid claim in the prior state — the last tick is only allowed for the claim holder (01 §5.1 T4, 02 §4.3)",
    };
  }
  const expiresMs = Date.parse(String(claimExpires));
  if (Number.isNaN(expiresMs) || expiresMs <= nowMs(ctx)) {
    return {
      verdict: "deny",
      reason: `plan-completed: the prior claim expired (claim-expires=${JSON.stringify(claimExpires ?? undefined)}) — an expired claim cannot carry the full-tick transition; the supervisor reclaims and re-dispatches (01 §4.4, 02 §4.3)`,
    };
  }
  if (scan.fm.claim !== undefined || scan.fm["claim-expires"] !== undefined) {
    return {
      verdict: "deny",
      reason: "plan-completed: the write entering awaitingClosure must clear the claim fields in the same write (01 §4.4 — no executor ticking while mechanical verification / closure audit is in flight)",
    };
  }
  const actor = action.actor;
  const actorId = actor && typeof actor.id === "string" ? actor.id : null;
  if (actorId !== null && !claimHolderMatches(claim, actorId)) {
    return {
      verdict: "deny",
      reason: `plan-completed: full-tick written by actor ${actorId} but the claim is held by another session — only the claim holder may land the last tick (02 §4.3)`,
    };
  }
  return {
    verdict: "allow",
    reason: `plan-completed: entering awaitingClosure (claim cleared in the same write)${actorId === null ? " — writer session not verifiable on this face (unverified-writer posture)" : ` by the claim holder ${actorId}`}`,
  };
}

registerRule("plan-completed", planCompletedRule, { structural: true });

// ── supporting gate: nothing-claim-guard (02 §4.4, action face) ─────────────
//
// Interception target = the terminal-claim ACTION record
// (`_tmp/<runDir>/terminal-claim.json`, proposedAction type "terminal-claim" —
// an action, not a ledger file path; policy match `action:terminal-claim`).
// The marker channel (`<AI_STEP_RESULT>nothing</AI_STEP_RESULT>`) stays a
// diagnostic/log face (M5 evaluates physical removal) — this rule owns the
// action-record face only.
//
// Enforce-posture ruling (0815-3 Phase 1 Decision): registered enforce. The
// deny face is a narrow decidable fact (predicate counts over injected plan
// records), not a matcher judgment call.

const TERMINAL_CLAIM_KIND_NOTHING = "nothing-to-draft";

function clipList(paths) {
  const shown = paths.slice(0, 3).map((p) => (typeof p === "string" ? p.split("/").pop() : String(p)));
  return shown.join(", ") + (paths.length > 3 ? ", …" : "");
}

function nothingClaimGuardRule(action, currentFileState, ctx = {}) {
  let claim = null;
  try {
    claim = JSON.parse(action.proposedContent);
  } catch {
    return {
      verdict: "deny",
      reason:
        'nothing-claim-guard: terminal-claim content is not parseable JSON — the action record must be `{ "kind": "nothing-to-draft", ... }` (02 §4.4)',
    };
  }
  const kind = claim !== null && typeof claim === "object" && !Array.isArray(claim) ? claim.kind : undefined;
  if (kind !== TERMINAL_CLAIM_KIND_NOTHING) {
    return {
      verdict: "allow",
      reason: `nothing-claim-guard: kind=${JSON.stringify(kind)} is not "${TERMINAL_CLAIM_KIND_NOTHING}" — outside this gate's deny face (02 §4.4)`,
    };
  }
  const records = Array.isArray(ctx.plans) ? ctx.plans : null;
  if (records === null) {
    return {
      verdict: "allow",
      reason:
        "nothing-claim-guard: plan records not injected on this face — draftPlans()/activePlans() not observable, not claiming verification (02 §2 structural-subset discipline; the supervisor face injects ctx.plans, M3/WI26)",
    };
  }
  const draft = draftPlans(records);
  const active = activePlans(records, { defaultVerifyKeys: ctx.defaultVerifyKeys });
  if (draft.length > 0 || active.length > 0) {
    const parts = [];
    if (draft.length > 0) parts.push(`draftPlans=${draft.length} (${clipList(draft)})`);
    if (active.length > 0) parts.push(`activePlans=${active.length} (${clipList(active)})`);
    return {
      verdict: "deny",
      reason: `nothing-claim-guard: nothing-to-draft claim denied — visible unfinished work remains (${parts.join("; ")}); finish, hold, or dispatch those plans before claiming there is nothing to draft (02 §4.4)`,
    };
  }
  return {
    verdict: "allow",
    reason:
      "nothing-claim-guard: nothing-to-draft claim verified (draftPlans()==0 ∧ activePlans()==0) — Deep Audit trigger signal emitted (dispatch execution = M3/WI26)",
    // Deep Audit trigger signal face (02 §3 trigger
    // `terminal-claim=nothing-to-draft ∧ draftPlans()==0 ∧ activePlans()==0`
    // → dispatch: deep-audit). evaluateGates surfaces verdict/reason only;
    // the supervisor (M3/WI26) consumes the rule directly and reads this
    // shape — pinned by the truth-table tests.
    trigger: { dispatch: "deep-audit", when: "terminal-claim=nothing-to-draft ∧ draftPlans()==0 ∧ activePlans()==0" },
  };
}

registerRule("nothing-claim-guard", nothingClaimGuardRule);

// ── supporting gate: audit-rounds-overflow (02 §4.6 budget meter) ───────────
//
// Interception target = roadmap writes that introduce a NEW dispatch audit
// line into `## Deep Audit Record`. Budget check: roadmap frontmatter
// `audit-rounds < maxAuditRounds` where max resolves policy-limits-first /
// mission-config-fallback (0815-1 ruling; consumers resolve via
// resolveMaxAuditRounds in law-policy.mjs and inject ctx.maxAuditRounds —
// rules never import law-policy, that would be an import cycle).
// `audit-rounds ≥ max` → deny the new round (R1 terminal closure is the
// M3/WI27 executor; this gate only denies). max unconfigured on both
// sources (=0 semantics) mirrors the engine posture: no audit concept →
// every new deep-audit dispatch is out of budget (0 ≥ 0), pinned by tests.

function auditRoundsOf(fm) {
  const v = fm && fm["audit-rounds"];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
}

function auditRoundsOverflowRule(action, currentFileState, ctx = {}) {
  const text = action.proposedContent;
  const split = splitLedgerSections(text);
  if (split.fmError) {
    return { verdict: "allow", reason: "audit-rounds-overflow: frontmatter unreadable — structural validators own that deny face" };
  }
  if (!split.hasFrontmatter) {
    return { verdict: "allow", reason: "audit-rounds-overflow: not a frontmatter roadmap; outside domain (dual-read transition)" };
  }
  const dar = findSection(split, 2, "Deep Audit Record");
  if (dar === null) {
    return { verdict: "allow", reason: "audit-rounds-overflow: no ## Deep Audit Record section — outside domain" };
  }
  const currentText = currentTextOf(currentFileState);
  if (currentText === null) {
    // New-ness of dispatch lines is unobservable without the prior state —
    // never deny on unobservable facts (02 §2 structural-subset discipline).
    return {
      verdict: "allow",
      reason:
        "audit-rounds-overflow: no currentFileState — new dispatch audit lines not observable on this face, budget check not run (unverified-writer posture; the DSH edit face and the supervisor face carry the prior state)",
    };
  }
  const currentSplit = splitLedgerSections(currentText);
  if (!currentSplit.hasFrontmatter || currentSplit.fmError) {
    return {
      verdict: "allow",
      reason: "audit-rounds-overflow: current state is not a frontmatter roadmap (legacy/dual-read) — budget transition not observable",
    };
  }
  const currentDar = findSection(currentSplit, 2, "Deep Audit Record");
  const currentIds = new Set(
    currentDar === null
      ? []
      : (scanRoadmapLedger(currentText).deepAuditRecord?.dispatches ?? []).filter((d) => d.valid).map((d) => d.id),
  );
  const proposedDispatches = (scanRoadmapLedger(text).deepAuditRecord?.dispatches ?? []).filter((d) => d.valid);
  const newDispatches = proposedDispatches.filter((d) => !currentIds.has(d.id));
  if (newDispatches.length === 0) {
    return {
      verdict: "allow",
      reason: "audit-rounds-overflow: no new dispatch audit lines — budget face inert (existing lines untouched)",
    };
  }
  const max = typeof ctx.maxAuditRounds === "number" && Number.isInteger(ctx.maxAuditRounds) && ctx.maxAuditRounds >= 0
    ? ctx.maxAuditRounds
    : 0;
  // The budget reads the roadmap frontmatter as it stands BEFORE the new
  // round is consumed (current state; the dispatching write increments
  // audit-rounds in the same write per 01 §3.1).
  const rounds = auditRoundsOf(currentSplit.fm);
  if (!(rounds < max)) {
    return {
      verdict: "deny",
      reason: `audit-rounds-overflow: deep-audit budget exhausted (audit-rounds=${rounds} ≥ maxAuditRounds=${max}) — deny new dispatch ${newDispatches[0].id}; raise the budget (policy limits.maxAuditRounds, mission flow fallback) or close the mission via R1 (03-supervisor, M3/WI27)`,
    };
  }
  return {
    verdict: "allow",
    reason: `audit-rounds-overflow: budget available (audit-rounds=${rounds} < maxAuditRounds=${max}) for ${newDispatches.length} new dispatch audit line(s)`,
  };
}

registerRule("audit-rounds-overflow", auditRoundsOverflowRule);

// ── supporting gate: claim-validity (02 §4.5, claim primitive) ───────────────
//
// Faces (plan item 0815-3 Phase 2):
//   ① writer — claim/claim-expires writes (introduce/change) must come from
//      the dispatcher (engine | supervisor); executors/drafters/reviewers/
//      auditors deny. Clearing is legal for the holder or the dispatcher.
//      Transition-period posture (0815-1 Phase 1 Explore conclusion: the DSH
//      pre-execute face resolves actor = {id} only, role is NOT inferable):
//      id-only/absent actors get an unverified-writer note, never a deny —
//      the role-bearing writer-deny face rides the M3 supervisor. The rule
//      itself implements the terminal semantics (role whitelist), so M3 only
//      swaps the writer, not the rule.
//   ② holder — Phase checkbox ticks while a live claim is present in the
//      proposed state: actor.id must match the claim's holderSessionId AND
//      the claim must be unexpired (ctx.now injectable clock). Structural
//      face degrades to "claim exists ∧ unexpired" without actor verification.
//   ③ single-active — a claim-type action against a plan whose current state
//      holds a different unexpired claim denies (one write producing double
//      active claims = the transition face; the frontmatter parser's
//      duplicate-key rejection is the parse face — both boundaries noted in
//      the truth-table cases). Write-face replacement of a live claim by a
//      non-dispatcher is already denied by ① (supervisor reclaim is the
//      legal replacement path).
//   ④ clear-before-awaitingClosure — a full-tick-without-receipts proposed
//      content still carrying a claim denies (the same-write-clear contract
//      from the other side; plan-completed ② denies it too — the two rules
//      declare the constraint on both faces so neither plan can drop it).
//   ⑤ active-only — a proposed state with status !== active carrying a claim
//      denies (transition face; the static shape face is M1/WI2 field
//      validation via plan-structure, observe until WI21).

const CLAIM_WRITER_ROLES = ["engine", "supervisor"];

function claimTokenOf(action) {
  // claim-type actions carry the claim record (JSON `{claim, claim-expires}`
  // or the bare attempt token) — not the plan file. Tolerant parse.
  const raw = action.proposedContent;
  try {
    const parsed = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return typeof parsed.claim === "string" ? parsed.claim : null;
    }
  } catch {
    // fall through to the bare-token shape
  }
  return typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
}

function claimExpiryMs(expires) {
  if (typeof expires !== "string") return NaN;
  return Date.parse(expires);
}

function claimValidityRule(action, currentFileState, ctx = {}) {
  const actor = action.actor;
  const actorId = actor && typeof actor.id === "string" ? actor.id : null;
  const actorRole = actor && typeof actor.role === "string" ? actor.role : null;

  // ③ claim-action face: judged against the current plan state only.
  if (action.type === "claim") {
    const currentText = currentTextOf(currentFileState);
    if (currentText === null) {
      return {
        verdict: "allow",
        reason: "claim-validity: no currentFileState — existing claim not observable on this face, single-active check not run (unverified-writer posture)",
      };
    }
    const currentScan = scanPlanLedger(currentText);
    if (!currentScan.hasFrontmatter || currentScan.fmError) {
      return { verdict: "allow", reason: "claim-validity: current state is not a frontmatter ledger (legacy/dual-read) — claim transition not observable" };
    }
    const token = claimTokenOf(action);
    if (token === null) {
      return {
        verdict: "deny",
        reason: 'claim-validity: malformed claim action — proposedContent must be the attempt token or `{ "claim": "attempt-<runId>-<holderSessionId>-<nonce8>" }` (01 §4.4)',
      };
    }
    const live = currentScan.fm.claim;
    const liveExpires = claimExpiryMs(currentScan.fm["claim-expires"]);
    const liveActive = typeof live === "string" && !Number.isNaN(liveExpires) && liveExpires > nowMs(ctx);
    if (liveActive && live !== token) {
      return {
        verdict: "deny",
        reason: `claim-validity: single active claim per plan (02 §4.5) — this plan already holds the unexpired claim ${live}; the supervisor reclaims (expiry or no-output) before a new claim is taken (transition face; the duplicate-key parser rejection is the parse face)`,
      };
    }
    return {
      verdict: "allow",
      reason: `claim-validity: claim action over ${liveActive ? "the same (idempotent)" : "no live"} claim${actorId === null ? " — writer not verifiable on this face (unverified-writer posture)" : ` by ${actorId}`}`,
    };
  }

  // Write faces below run on the proposed plan content.
  const scan = scanPlanLedger(action.proposedContent);
  if (scan.fmError) {
    return { verdict: "allow", reason: "claim-validity: frontmatter unreadable — plan-structure owns that deny face" };
  }
  if (!scan.hasFrontmatter) {
    return { verdict: "allow", reason: "claim-validity: not a frontmatter ledger plan; outside domain (dual-read transition)" };
  }
  const currentText = currentTextOf(currentFileState);
  let currentScan = null;
  if (currentText !== null) {
    const cs = scanPlanLedger(currentText);
    if (cs.hasFrontmatter && !cs.fmError) currentScan = cs;
  }
  const currentClaim = currentScan !== null ? currentScan.fm.claim : undefined;
  const currentExpires = currentScan !== null ? currentScan.fm["claim-expires"] : undefined;
  const proposedClaim = scan.fm.claim;
  const proposedExpires = scan.fm["claim-expires"];
  const now = nowMs(ctx);
  const notes = [];

  // ① writer face — introduction/change/clear of claim fields.
  const introduced = proposedClaim !== undefined && (currentScan === null || currentClaim === undefined || proposedClaim !== currentClaim);
  const expiresChanged = proposedExpires !== undefined && (currentScan === null || proposedExpires !== currentExpires);
  if (introduced || expiresChanged) {
    if (actorRole !== null && !CLAIM_WRITER_ROLES.includes(actorRole)) {
      return {
        verdict: "deny",
        reason: `claim-validity: claim fields are written by the dispatcher (engine | supervisor), never by the executing agent (02 §4.5) — actor role ${actorRole} cannot write claim/claim-expires; the claim is taken through the supervisor/flow dispatch face`,
      };
    }
    if (actorRole === null) {
      notes.push("claim writer role not verifiable on this face (id-only/absent actor — transition-period posture, 0815-1 Explore); the M3 supervisor face carries the role-bearing deny");
    }
    // A written claim must carry a sane TTL: parseable ISO-8601 in the future.
    const expiry = claimExpiryMs(proposedExpires);
    if (Number.isNaN(expiry)) {
      return {
        verdict: "deny",
        reason: `claim-validity: claim write must carry a valid ISO-8601 claim-expires (got ${JSON.stringify(proposedExpires ?? undefined)}) — claims are TTL-scoped (01 §4.4, 02 §4.5)`,
      };
    }
    if (expiry <= now) {
      return {
        verdict: "deny",
        reason: `claim-validity: claim write with an already-expired claim-expires (${JSON.stringify(proposedExpires)}) — the TTL must be in the future at write time (02 §4.5)`,
      };
    }
    if (introduced && typeof proposedClaim === "string" && !/^[0-9A-Za-z][0-9A-Za-z_-]*$/.test(proposedClaim)) {
      return {
        verdict: "deny",
        reason: 'claim-validity: claim must be the attempt token `attempt-<runId>-<holderSessionId>-<nonce8>` (01 §4.4)',
      };
    }
  }
  const cleared = currentScan !== null && currentClaim !== undefined && proposedClaim === undefined;
  if (cleared) {
    const holderClears = actorId !== null && claimHolderMatches(currentClaim, actorId);
    const dispatcherClears = actorRole !== null && CLAIM_WRITER_ROLES.includes(actorRole);
    if (actorId !== null && !holderClears && !dispatcherClears) {
      return {
        verdict: "deny",
        reason: `claim-validity: only the claim holder or the dispatcher (engine | supervisor) may clear a claim — actor ${actorId} is neither (holder is encoded in ${currentClaim}, 02 §4.5)`,
      };
    }
    if (actorId === null) {
      notes.push("claim clear writer not verifiable on this face (unverified-writer posture)");
    }
  }

  // ③ write-face replacement of a live claim by a non-dispatcher is denied
  // above (①); a live claim replaced in the same write by a dispatcher is
  // the supervisor reclaim path — single-active holds (one claim in file).

  // ⑤ active-only transition face.
  if (proposedClaim !== undefined && scan.fm.status !== "active") {
    return {
      verdict: "deny",
      reason: `claim-validity: claims exist only while status is "active" (01 §4.4) — the proposed state is status=${JSON.stringify(scan.fm.status)} and still carries claim ${proposedClaim}; clear the claim in the same write that leaves active`,
    };
  }

  // ④ clear-before-awaitingClosure face (full-tick without receipts).
  const closurePairs = scan.closure ? scan.closure.pairs : [];
  if (proposedClaim !== undefined && scan.counts.unchecked === 0 && closurePairs.length === 0) {
    return {
      verdict: "deny",
      reason: "claim-validity: the plan is full-tick without an audit receipt (entering awaitingClosure) and still carries a claim — the write must clear the claim fields in the same write (01 §4.4, 02 §4.3; no executor ticking while mechanical verification / closure audit is in flight)",
    };
  }

  // ② holder face — checkbox ticks under a live claim.
  const ticked =
    currentScan !== null &&
    currentScan.counts.total - currentScan.counts.unchecked < scan.counts.total - scan.counts.unchecked;
  if (proposedClaim !== undefined && ticked) {
    const expiry = claimExpiryMs(proposedExpires);
    if (Number.isNaN(expiry) || expiry <= now) {
      return {
        verdict: "deny",
        reason: `claim-validity: tick under an expired claim (claim-expires=${JSON.stringify(proposedExpires ?? undefined)}) — the supervisor reclaims and re-dispatches; an expired claim cannot carry checkbox writes (02 §4.5)`,
      };
    }
    if (actorId !== null && !claimHolderMatches(proposedClaim, actorId)) {
      return {
        verdict: "deny",
        reason: `claim-validity: checkbox ticks under a claim are reserved for its holder — actor ${actorId} does not match the holderSessionId encoded in ${proposedClaim} (02 §4.5)`,
      };
    }
    if (actorId === null) {
      notes.push("tick writer identity not verifiable on this face — holder face degraded to claim-exists ∧ unexpired (unverified-writer posture)");
    }
  }

  if (proposedClaim === undefined && currentClaim === undefined && !cleared) {
    return { verdict: "allow", reason: "claim-validity: no claim fields in play — inert" };
  }
  return {
    verdict: "allow",
    reason: `claim-validity: claim fields legal on this write${notes.length > 0 ? `; ${notes.join("; ")}` : ""}`,
  };
}

registerRule("claim-validity", claimValidityRule);

// ── supporting gate: verify-keys (02 §5 command-source discipline) ──────────
//
// plan frontmatter `verify` may only enumerate mission `commands.*` keys with
// non-empty command strings — the Proof text of a plan is never an executable
// command source (that guarantee is structural: the runner resolves keys
// against commands.* only, see verify-runner.mjs). Violations deny at
// frontmatter-write time. ctx.commands absent (structural subset / CI face
// without mission context) → fail-open note (02 §6: never deny on
// unobservable facts). The `verify: []` vacuous-pass channel is WI44 scope,
// deliberately not adjudicated here.

function verifyKeysRule(action, currentFileState, ctx = {}) {
  const scan = scanPlanLedger(action.proposedContent);
  if (scan.fmError) {
    return { verdict: "allow", reason: "verify-keys: frontmatter unreadable — plan-structure owns that deny face" };
  }
  if (!scan.hasFrontmatter) {
    return { verdict: "allow", reason: "verify-keys: not a frontmatter ledger plan; outside domain (dual-read transition)" };
  }
  const verifyField = scan.fm.verify;
  if (verifyField === undefined) {
    return {
      verdict: "allow",
      reason: "verify-keys: no verify field — default-key resolution is the derivation face's concern (01 §4.1 missing → mission defaults)",
    };
  }
  if (!Array.isArray(verifyField)) {
    return { verdict: "allow", reason: "verify-keys: verify field shape is not an array — plan-structure owns the shape deny face" };
  }
  const commands = ctx.commands;
  if (commands === null || typeof commands !== "object" || Array.isArray(commands)) {
    return {
      verdict: "allow",
      reason: "verify-keys: mission commands not injected on this face — key enumeration not verifiable, fail-open (02 §6; the DSH adapter and gate-check --verify inject ctx.commands)",
    };
  }
  const known = Object.keys(commands).filter((k) => typeof commands[k] === "string" && commands[k].trim() !== "");
  const problems = [];
  for (const key of verifyField) {
    if (typeof key !== "string") continue; // shape face → plan-structure
    if (!Object.prototype.hasOwnProperty.call(commands, key)) {
      problems.push(`"${key}" is not a mission commands.* key`);
    } else if (typeof commands[key] !== "string" || commands[key].trim() === "") {
      problems.push(`"${key}" maps to an empty command`);
    }
  }
  if (problems.length > 0) {
    return {
      verdict: "deny",
      reason: `verify-keys: ${problems.join("; ")} — verify may only enumerate non-empty mission commands.* keys (known here: ${known.join(", ") || "none"}), and plan Proof text is never a command source (02 §5)`,
    };
  }
  return {
    verdict: "allow",
    reason: `verify-keys: all verify keys enumerate non-empty mission commands (${verifyField.join(", ")})`,
  };
}

registerRule("verify-keys", verifyKeysRule);

// ── supporting gate: record-append-only (02 §4.8, direct enforce) ────────────
//
// `## Draft Review Record` / `## Verification` / `## Closure` on plans and
// `## Deep Audit Record` on roadmaps: every existing line of the section
// (registry lines AND prose — the tolerance policy of the M1 scanner is
// "unknown lines do not participate in grammar matching", never "unknown
// lines may be deleted") must survive the write in order; only tail appends
// are legal. Deletion/rewrite → deny naming the first violating line.
// Direct-enforce authorization: 02 §6 exception clause (append-only gates
// are net-regression guards, not new conveniences) — same ruling reference
// as 0815-2 Phase 3 (P0 completed). Trailing-whitespace-only differences
// and a trailing blank-line run at the section end are tolerated (editor
// hygiene, not rewrites); mid-section content changes are not.

const APPEND_ONLY_PLAN_SECTIONS = ["Draft Review Record", "Verification", "Closure"];
const APPEND_ONLY_ROADMAP_SECTIONS = ["Deep Audit Record"];

function rTrim(line) {
  return line.replace(/[ \t]+$/, "");
}

function meaningfulLineCount(lines) {
  let end = lines.length;
  while (end > 0 && rTrim(lines[end - 1]) === "") end--;
  return end;
}

function recordAppendOnlyRule(action, currentFileState, ctx = {}) {
  const split = splitLedgerSections(action.proposedContent);
  if (split.fmError) {
    return { verdict: "allow", reason: "record-append-only: proposed frontmatter unreadable — plan-structure owns that deny face" };
  }
  if (!split.hasFrontmatter) {
    return { verdict: "allow", reason: "record-append-only: proposed state is not a frontmatter ledger; outside domain (dual-read transition)" };
  }
  const currentText = currentTextOf(currentFileState);
  if (currentText === null) {
    return {
      verdict: "allow",
      reason: "record-append-only: no currentFileState — existing lines not observable on this face, prefix preservation not verifiable (unverified-writer posture)",
    };
  }
  const currentSplit = splitLedgerSections(currentText);
  if (!currentSplit.hasFrontmatter || currentSplit.fmError) {
    return {
      verdict: "allow",
      reason: "record-append-only: current state is not a frontmatter ledger (legacy/dual-read) — append-only transition not observable",
    };
  }
  const anchors = [
    ...APPEND_ONLY_PLAN_SECTIONS.map((t) => ({ title: t, level: 2 })),
    ...APPEND_ONLY_ROADMAP_SECTIONS.map((t) => ({ title: t, level: 2 })),
  ];
  for (const { title, level } of anchors) {
    const cur = findSection(currentSplit, level, title);
    if (cur === null) continue; // section did not exist — nothing to preserve
    const curLines = cur.lines.slice(0, meaningfulLineCount(cur.lines));
    if (curLines.length === 0) continue;
    const prop = findSection(split, level, title);
    const firstLineNo = cur.bodyStart + 1; // 1-based line number of cur.lines[0]
    if (prop === null) {
      return {
        verdict: "deny",
        reason: `record-append-only: ## ${title} section removed — its ${curLines.length} existing line(s) must be preserved in place (append-only, 02 §4.8); first removed line ${firstLineNo}: "${rTrim(curLines[0])}"`,
      };
    }
    const propLines = prop.lines;
    for (let i = 0; i < curLines.length; i++) {
      if (rTrim(propLines[i] ?? "") !== rTrim(curLines[i])) {
        return {
          verdict: "deny",
          reason: `record-append-only: ## ${title} line ${firstLineNo + i} was deleted or rewritten ("${rTrim(curLines[i]).slice(0, 120)}") — receipt/verification sections only allow tail appends; the first violating line is shown (02 §4.8)`,
        };
      }
    }
  }
  return {
    verdict: "allow",
    reason: "record-append-only: all append-only sections (Draft Review Record / Verification / Closure / Deep Audit Record) prefix-preserved",
  };
}

registerRule("record-append-only", recordAppendOnlyRule);
