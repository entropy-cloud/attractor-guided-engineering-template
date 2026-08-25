// AGE rule-law hard-gate rules (age-autonomy M2-WI14/WI15/WI16, plan
// docs/plans/age-autonomy/2026-08-25-0815-2).
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
  computeBasisHash,
  deriveCompleted,
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
