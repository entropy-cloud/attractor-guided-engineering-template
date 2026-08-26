// AGE rule-law hard-gate rules (age-autonomy M2-WI14/WI15/WI16, plan
// docs/plans/age-autonomy/2026-08-25-0815-2; supporting gates
// M2-WI17..WI20, plan docs/plans/age-autonomy/2026-08-25-0815-3; guardrails
// + P8 M2-WI21 and legacy-plan-freeze M2-WI22, plans 0950-1/0950-2).
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
import { PLAN_STATUS_RE, normalizeLegacyStatus } from "./ledger-dualread.mjs";
import {
  activePlans,
  computeBasisHash,
  deriveCompleted,
  draftPlans,
  parseLedgerId,
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

  // ── review lease (02 §4.2): the LAST valid dispatch review line in the
  // CURRENT DRR owns the lease (M3-WI29 latest-line semantics — ONE face
  // with the dispatch idempotency answer, not a second rule): unpaired and
  // not concluded by THIS write → every writer except that reviewer, the
  // supervisor, and the engine is denied. Superseded earlier lines hold no
  // lease — after a crash redispatch the dead session's orphaned line must
  // not lock the plan's write face forever; a paired LAST line closes the
  // lease even when earlier lines stay unpaired forever (append-only: a
  // dead session's line never gains its conclusion).
  const currentDrr = currentScan.draftReviewRecord;
  const proposedDrr = scan.draftReviewRecord;
  const proposedConclusions = new Set([
    ...((proposedDrr?.accepted ?? []).filter((a) => a.valid !== false).map((a) => a.id)),
    ...((proposedDrr?.conclusions ?? []).map((c) => c.id)),
  ]);
  const validDispatches = (currentDrr?.dispatches ?? []).filter((d) => d.valid);
  const lastDispatch = validDispatches.length > 0 ? validDispatches[validDispatches.length - 1] : null;
  const leaseOpen =
    lastDispatch !== null &&
    !((currentDrr?.pairs ?? []).includes(lastDispatch.id)) &&
    !proposedConclusions.has(lastDispatch.id);
  if (leaseOpen) {
    const leaseReviewer = lastDispatch.sessionId;
    const exempt = actorRole !== null && LEASE_EXEMPT_ROLES.includes(actorRole);
    const isReviewer = actorId !== null && actorId === leaseReviewer;
    if (!exempt && !isReviewer) {
      if (actorId !== null) {
        return {
          verdict: "deny",
          reason: `writer-identity: review lease active — dispatch review ${lastDispatch.id} to ${leaseReviewer} is not yet concluded; only that reviewer, the supervisor, or the engine may write this plan until the same-id conclusion line lands (02 §4.2; lease holder = the LATEST dispatch line, superseded earlier lines hold no lease — M3-WI29)`,
        };
      }
      return {
        verdict: "allow",
        reason: `writer-identity: review lease observed (${lastDispatch.id} to ${leaseReviewer}) but no actor on this face — third-party writer cannot be excluded, not claiming verification (unverified-writer posture)`,
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
      reason: `writer-identity: held→active with failures reset${unlockReviewer ? ` by the new review's dispatched reviewer ${actorId}` : " — supervisor unlock arrives via mdcontrol.unlock (M3-WI28, role=supervisor writer); this face has no receipt syntax to verify the unlock writer, not claiming verification (unverified-writer posture)"}`,
    };
  }

  if (TERMINAL_STATUSES.includes(newStatus)) {
    // ③ terminal disposition: supervisor routing or a registered reviewer.
    const isReviewer = actorId !== null && registeredReviewers.includes(actorId);
    const isSupervisor = actorRole === "supervisor";
    return {
      verdict: "allow",
      reason: `writer-identity: ${oldStatus}→${newStatus} disposition${isReviewer ? ` by registered reviewer ${actorId}` : isSupervisor ? " by the supervisor" : " — disposition writer identity is role-dependent with no receipt syntax (supervisor dispositions arrive via mdcontrol.unlock, M3-WI28), not claiming verification (unverified-writer posture)"}`,
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
  const currentScanFace = scanRoadmapLedger(currentText);
  const currentIds = new Set(
    currentDar === null
      ? []
      : (currentScanFace.deepAuditRecord?.dispatches ?? []).filter((d) => d.valid).map((d) => d.id),
  );
  const proposedDispatches = (scanRoadmapLedger(text).deepAuditRecord?.dispatches ?? []).filter((d) => d.valid);
  const newDispatches = proposedDispatches.filter((d) => !currentIds.has(d.id));
  if (newDispatches.length === 0) {
    return {
      verdict: "allow",
      reason: "audit-rounds-overflow: no new dispatch audit lines — budget face inert (existing lines untouched)",
    };
  }
  // M3-WI29 same-occurrence redispatch exemption (01 §3.1 「同一审计
  // occurrence 崩溃重派不重复自增」): a new dispatch line whose ROUND number
  // (the id's iter segment) matches an existing UNPAIRED in-flight dispatch
  // is a crash redispatch — the round was already paid by the crashed
  // attempt, so it consumes no budget and is never denied here. Round
  // numbers are unique per audit occurrence (the monotone audit-rounds
  // counter, 01 §3.1), so the iter segment alone carries occurrence
  // identity. Without this exemption a budget exhausted by the crashed
  // attempt would deny the redispatch forever (deadlock: the dead session
  // never writes its conclusion).
  const unpairedRounds = new Set(
    (currentScanFace.deepAuditRecord?.unpairedDispatches ?? [])
      .map((id) => parseLedgerId(id))
      .filter((p) => p !== null)
      .map((p) => p.iter),
  );
  const redispatches = newDispatches.filter((d) => {
    const parsed = parseLedgerId(d.id);
    return parsed !== null && unpairedRounds.has(parsed.iter);
  });
  const freshRounds = newDispatches.filter((d) => !redispatches.includes(d));
  if (freshRounds.length === 0) {
    return {
      verdict: "allow",
      reason: `audit-rounds-overflow: ${redispatches.length} new dispatch audit line(s) are same-occurrence crash redispatch(s) of unpaired in-flight round(s) (${unpairedRounds.size} in flight) — the round was already paid, no budget consumed, no increment required (01 §3.1, M3-WI29)`,
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
      reason: `audit-rounds-overflow: deep-audit budget exhausted (audit-rounds=${rounds} ≥ maxAuditRounds=${max}) — deny new dispatch ${freshRounds[0].id}; raise the budget (policy limits.maxAuditRounds, mission flow fallback) or close the mission via R1 (03-supervisor, M3/WI27)`,
    };
  }
  return {
    verdict: "allow",
    reason: `audit-rounds-overflow: budget available (audit-rounds=${rounds} < maxAuditRounds=${max}) for ${freshRounds.length} new dispatch audit line(s)${redispatches.length > 0 ? ` (+${redispatches.length} same-occurrence redispatch(s), budget-inert — M3-WI29)` : ""}`,
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

// ── supporting gate: path-guardrail (02 §4.7, M2-WI21) ──────────────────────
//
// Interception target = writes of PLAN-SHAPED .md files: proposedContent
// parses as frontmatter carrying the three-key feature set
// status+mission+work-item (looser than the full field set — non-plan
// documents never coincidentally carry all three). Legal domain = the
// passive-scan plans roots injected as ctx.plansRoots (every ancestor's
// default docs/plans + missions/*.json plansDir values — the plan-status-gate
// knownPlansRootsAt precedent; malformed missions contribute zero roots; the
// caller computes them, rules stay pure). Out-of-domain plan-shaped writes
// deny listing the registered roots; create and rewrite are intercepted
// identically (the shape test reads proposedContent either way).
// Adjudicated weakening (watch-only residual, plan 0950-1 Deferred): the
// domain is the UNION across missions, not per-mission — a plan-shaped write
// into another mission's plansDir is not caught here; CI structural face and
// the M3 supervisor own the per-mission tightening.

const PLAN_SHAPED_KEYS = ["status", "mission", "work-item"];

function toPosixPath(p) {
  return String(p).split("\\").join("/");
}

function isUnderRoot(path, root) {
  const p = toPosixPath(path);
  const r = toPosixPath(root);
  return p === r || p.startsWith(r.endsWith("/") ? r : r + "/");
}

function planShapedScanOf(text) {
  const scan = scanPlanLedger(text);
  if (scan.fmError || !scan.hasFrontmatter) return null;
  for (const key of PLAN_SHAPED_KEYS) {
    if (scan.fm[key] === undefined) return null;
  }
  return scan;
}

function notPlanShapedReason(text) {
  const scan = scanPlanLedger(text);
  if (scan.fmError) {
    return "path-guardrail: proposed content has broken frontmatter — plan-structure owns that deny face";
  }
  if (!scan.hasFrontmatter) {
    return "path-guardrail: proposed content has no frontmatter block — not plan-shaped, outside domain (dual-read transition)";
  }
  return "path-guardrail: proposed content is not plan-shaped (frontmatter status+mission+work-item not all present) — outside domain";
}

function pathGuardrailRule(action, currentFileState, ctx = {}) {
  if (!toPosixPath(action.path).endsWith(".md")) {
    return { verdict: "allow", reason: "path-guardrail: not a .md write — outside domain" };
  }
  const shaped = planShapedScanOf(action.proposedContent);
  if (shaped === null) {
    // broken-frontmatter .md: plan-structure owns that deny face; anything
    // without the three-key feature set is not a plan-shaped file.
    return { verdict: "allow", reason: notPlanShapedReason(action.proposedContent) };
  }
  const roots = Array.isArray(ctx.plansRoots) ? ctx.plansRoots.filter((r) => typeof r === "string" && r !== "") : null;
  if (roots === null || roots.length === 0) {
    return {
      verdict: "allow",
      reason: "path-guardrail: plans roots not injected on this face — domain membership not verifiable, fail-open (02 §6; the DSH adapter and gate-check CLI inject ctx.plansRoots)",
    };
  }
  for (const root of roots) {
    if (isUnderRoot(action.path, root)) {
      return { verdict: "allow", reason: `path-guardrail: plan-shaped write inside registered plans root ${toPosixPath(root)}` };
    }
  }
  return {
    verdict: "deny",
    reason: `path-guardrail: plan-shaped .md write outside every registered plans root — plan files live inside the mission plansDir domain (registered roots here: ${roots.map(toPosixPath).join(", ")}); write plans there, not at ${toPosixPath(action.path)} (02 §4.7)`,
  };
}

registerRule("path-guardrail", pathGuardrailRule, { structural: true });

// ── approved-project exception probe (02 §4.7 third leg, M2-WI21) ───────────
//
// Structural approximation (the only zero-new-mechanism decidable face
// without the M3 supervisor): an `status: active` plan in the injected corpus
// (ctx.plans records) whose body explicitly contains the target path string
// (Phase Targets or body — first version is plain containment; a per-item
// Targets parse is a future tightening). The hit records file + line so the
// exception stays auditable from the allow reason.

export function activePlanReferencing(targetPath, ctx = {}) {
  const records = Array.isArray(ctx.plans) ? ctx.plans : null;
  if (records === null || typeof targetPath !== "string" || targetPath === "") return null;
  const target = toPosixPath(targetPath);
  const candidates = [target];
  const root = typeof ctx.projectRoot === "string" && ctx.projectRoot !== "" ? toPosixPath(ctx.projectRoot) : null;
  if (root !== null && target.startsWith(root + "/")) candidates.push(target.slice(root.length + 1));
  for (const rec of records) {
    const text = rec && typeof rec.text === "string" ? rec.text : null;
    if (text === null) continue;
    const scan = scanPlanLedger(text);
    if (scan.fmError || !scan.hasFrontmatter || scan.fm.status !== "active") continue;
    const lines = text.split("\n");
    for (const c of candidates) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(c)) return { plan: rec.path ?? "<record without path>", line: i + 1, matched: c };
      }
    }
  }
  return null;
}

// ── supporting gate: roadmap-write-guard (02 §4.7, M2-WI21) ─────────────────
//
// Semantics ruling (literal-vs-practice adjudication, plan 0950-1 Phase 2):
// ALLOW = checkbox flips of registered WI lines ([ ]→[x] only) + in-line tail
// appends on those lines (the M1-established evidence-pointer write-back
// practice — the settled reading of roadmap guide :66). DENY = WI-line
// add/delete/reorder, WI id rewrite, milestone heading add/delete/rewrite —
// UNLESS the actor role ∈ {engine, supervisor} (the deep-audit findings=items
// → DRAFT WI-landing path; on id-only actor faces the role exception
// degrades to an unverified-writer note inside the deny reason, 0815-1
// Phase 1 actor ruling) or the approved-project exception (active plan
// referencing the roadmap path). Adjudicated residual: in-line rewrites of
// non-note WI text (description edits) are not caught here — CI structural
// checks + git attribution own that face (02 §2 A1 documented miss).

const ROADMAP_STRUCTURAL_ROLES = ["engine", "supervisor"];
const WI_LINE_RE = /^- \[([ x])\] (.*)$/;

function roadmapWiStructure(text) {
  const scan = scanRoadmapLedger(text);
  if (scan.fmError || !scan.hasFrontmatter) return null;
  return scan.milestones.map((ms) => ({
    number: ms.number,
    title: ms.title,
    entries: ms.workItems.map((w) => {
      const m = w.text.match(WI_LINE_RE);
      return { id: w.id, checked: w.checked, rest: m ? m[2] : w.text, line: w.line };
    }),
  }));
}

function roadmapWriteGuardRule(action, currentFileState, ctx = {}) {
  // self-domain: this rule only judges writes to the mission roadmap
  if (typeof ctx.roadmapPath !== "string" || ctx.roadmapPath === "" || toPosixPath(action.path) !== toPosixPath(ctx.roadmapPath)) {
    return { verdict: "allow", reason: "roadmap-write-guard: target is not the mission roadmap — outside domain" };
  }
  const currentText = currentTextOf(currentFileState);
  if (currentText === null) {
    return {
      verdict: "allow",
      reason: "roadmap-write-guard: no currentFileState — WI-line set transition not observable on this face (unverified-writer posture)",
    };
  }
  const current = roadmapWiStructure(currentText);
  const proposed = roadmapWiStructure(action.proposedContent);
  if (current === null || proposed === null) {
    return {
      verdict: "allow",
      reason: "roadmap-write-guard: current or proposed state is not a frontmatter roadmap (legacy/dual-read) — WI structure not comparable",
    };
  }

  const violations = [];
  if (proposed.length !== current.length) {
    violations.push(`milestone structure changed (current ${current.length} ### M<n> blocks, proposed ${proposed.length}) — add/delete of milestone headings is a structural change`);
  }
  for (let i = 0; i < current.length && i < proposed.length; i++) {
    const c = current[i];
    const p = proposed[i];
    if (c.number !== p.number || (c.title ?? "") !== (p.title ?? "")) {
      violations.push(`milestone heading ${i + 1} rewritten (current "M${c.number}${c.title ? ` — ${c.title}` : ""}" → proposed "M${p.number}${p.title ? ` — ${p.title}` : ""}")`);
    }
  }
  const pairs = Math.min(current.length, proposed.length);
  for (let i = 0; i < pairs; i++) {
    const c = current[i];
    const p = proposed[i];
    if (c.number !== p.number) continue; // heading violation already recorded
    if (c.entries.length !== p.entries.length) {
      violations.push(`M${c.number}: work-item line count changed (${c.entries.length} → ${p.entries.length}) — add/delete of WI lines is a structural change`);
      continue;
    }
    for (let j = 0; j < c.entries.length; j++) {
      const ce = c.entries[j];
      const pe = p.entries[j];
      if ((ce.id ?? `#${j}`) !== (pe.id ?? `#${j}`)) {
        violations.push(`M${c.number} line ${pe.line}: work-item id rewritten or lines reordered (${ce.id ?? "<no id>"} → ${pe.id ?? "<no id>"})`);
        continue;
      }
      if (ce.checked && !pe.checked) {
        violations.push(`M${c.number} line ${pe.line}: checkbox flipped [x]→[ ] — only [ ]→[x] flips are legal write-backs`);
      }
      if (!rTrim(pe.rest).startsWith(rTrim(ce.rest))) {
        violations.push(`M${c.number} line ${pe.line}: work-item line rewritten — only tail appends of evidence notes are legal (02 §4.7 registered-line write-back)`);
      }
    }
  }

  if (violations.length === 0) {
    return {
      verdict: "allow",
      reason: "roadmap-write-guard: WI structure unchanged — registered-line checkbox flips and in-line tail appends only",
    };
  }

  const actor = action.actor;
  const actorRole = actor && typeof actor.role === "string" ? actor.role : null;
  if (actorRole !== null && ROADMAP_STRUCTURAL_ROLES.includes(actorRole)) {
    return {
      verdict: "allow",
      reason: `roadmap-write-guard: structural change by actor role ${actorRole} (the deep-audit findings → DRAFT WI-landing path, 02 §2 role enum) — ${violations[0]}`,
    };
  }
  const reference = activePlanReferencing(ctx.roadmapPath, ctx);
  if (reference !== null) {
    return {
      verdict: "allow",
      reason: `roadmap-write-guard: structural change covered by the approved-project exception — active plan ${reference.plan} line ${reference.line} declares this roadmap as a target — ${violations[0]}`,
    };
  }
  return {
    verdict: "deny",
    reason: `roadmap-write-guard: ${violations.slice(0, 3).join("; ")}${violations.length > 3 ? ` (+${violations.length - 3} more)` : ""} — legal write-backs are checkbox flips of registered WI lines and in-line evidence-note appends only; structural changes (new/deleted/reordered WI lines, id rewrites, milestone heading edits) need the engine/supervisor dispatch path or an approved project (an active plan declaring this roadmap as its target, 02 §4.7)${actorRole === null ? "; actor role not verifiable on this face (id-only/absent actor — unverified-writer posture, the engine/supervisor exception cannot be claimed here)" : ""}`,
  };
}

registerRule("roadmap-write-guard", roadmapWriteGuardRule, { structural: true });

// ── P8: law-self-protection (02 §4.7/§2, M2-WI21) ───────────────────────────
//
// The ONLY unconditional adversarial face (02 §2 trust model — no guardrail-
// strength downgrade, no observe ramp: during observe the enforced could
// rewrite the enforcer, so the ramp itself would be the vulnerability
// window). Protected path set = the 02 §4.7 literal list, resolved against
// ctx.projectRoot:
//   - plugin/dsh/src/law/**            (law host-adapter implementation)
//   - missions/autonomy.policy.yml     (law data)
//   - tools/mission-driver/src/plan-check.mjs / gate-check.mjs (enforcement CLI)
// Exception set = the 02 §4.7 literal three legs, `engine` deliberately NOT
// among them (no contract basis; every legal write face of this batch is
// covered by the approved-project leg):
//   ① human — actor role = human;
//   ② CI — no actor shape at all; its legality rides the deployment face
//      (CI runner writes never cross the pre-execute pipeline; the same
//      boundary symmetrically covers human git-commit writes — 02 §2 A1
//      documented miss, not unique to this rule);
//   ③ approved project — an `status: active` plan whose body names the
//      target path (structural approximation via activePlanReferencing; the
//      rule's own landing writes ride this leg — the first legal consumer of
//      the rule is its own host plan).
// Structural-subset decomposition: the identity-dependent leg (human)
// degrades to an unverified-writer note and never denies by itself; the
// actor-independent legs stay decidable — protected path ∧ no active-plan
// reference denies on the structural face too. Plan corpus NOT injected →
// fail-closed deny (the approved-project leg cannot be evaluated; callers
// that evaluate this rule must inject ctx.plans — the DSH adapter and
// gate-check CLI do).

export const LAW_PROTECTED_FAMILIES = [
  { prefix: "plugin/dsh/src/law/" },
  { path: "missions/autonomy.policy.yml" },
  { path: "tools/mission-driver/src/plan-check.mjs" },
  { path: "tools/mission-driver/src/gate-check.mjs" },
];

/** Is one absolute path inside a protected law family of this project root? */
export function isLawProtectedPath(absPath, projectRoot) {
  if (typeof absPath !== "string" || typeof projectRoot !== "string" || projectRoot === "") return false;
  const root = toPosixPath(projectRoot);
  const path = toPosixPath(absPath);
  if (!path.startsWith(root + "/")) return false;
  const rel = path.slice(root.length + 1);
  return LAW_PROTECTED_FAMILIES.some((f) => (f.prefix !== undefined ? rel.startsWith(f.prefix) : rel === f.path));
}

function lawSelfProtectionRule(action, currentFileState, ctx = {}) {
  if (typeof ctx.projectRoot !== "string" || ctx.projectRoot === "") {
    return {
      verdict: "allow",
      reason:
        "law-self-protection: projectRoot not injected on this face — protected-path membership not decidable, outside domain (the DSH adapter and gate-check CLI inject ctx.projectRoot)",
    };
  }
  if (!isLawProtectedPath(action.path, ctx.projectRoot)) {
    return { verdict: "allow", reason: "law-self-protection: target is not a protected law face — outside domain" };
  }
  const actor = action.actor;
  const actorRole = actor && typeof actor.role === "string" ? actor.role : null;
  const path = toPosixPath(action.path);
  if (actorRole === "human") {
    return {
      verdict: "allow",
      reason: `law-self-protection: protected-path write by a human actor on ${path} (02 §4.7 literal exception ① — human)`,
    };
  }
  const reference = activePlanReferencing(action.path, ctx);
  if (reference !== null) {
    return {
      verdict: "allow",
      reason: `law-self-protection: protected-path write covered by the approved-project exception — active plan ${reference.plan} line ${reference.line} names this target (02 §4.7 literal exception ③)`,
    };
  }
  if (!Array.isArray(ctx.plans)) {
    return {
      verdict: "deny",
      reason: `law-self-protection: ${path} is a protected law face (law implementation / policy data / enforcement CLI, 02 §4.7 P8) and the plan corpus is not injected on this face — the approved-project exception cannot be evaluated; P8 is the unconditional adversarial face and fails closed. Legal channels: human actor (role=human), CI (writes outside the pre-execute pipeline), or an approved project (an active plan declaring this path as a target — inject ctx.plans)`,
    };
  }
  return {
    verdict: "deny",
    reason: `law-self-protection: ${path} is a protected law face (law implementation / policy data / enforcement CLI) — AI writes deny (02 §4.7 P8: the enforced may not rewrite the enforcer). Legal channels: human actor (role=human), CI (writes outside the pre-execute pipeline), or an approved project (an active plan whose body declares this path as a target)${actorRole === null ? "; actor role not verifiable on this face (id-only/absent actor — unverified-writer posture, the human exception cannot be claimed)" : ` (actor role ${actorRole} is not in the exception set — the literal exceptions are human / CI / approved project)`}`,
  };
}

registerRule("law-self-protection", lawSelfProtectionRule, { structural: true });

// ── legacy-plan-freeze (M2-WI22, plan-status-gate 保护语义收编) ──────────────
//
// The run-state plan-status gate (dsh-plugin M3-WI13) retired with WI22: its
// three faces split — the "deny legacy `> Plan Status: completed` writes"
// protection semantics land HERE as a law structural rule; the run-state
// evidence faces (F1/F2/F3) are abolished (ledger receipts + claims are the
// only completion evidence, 01 §5.2); the pre-execute mount is the law
// adapter's (0815-1). Glyph tolerance is inherited verbatim from the shared
// PLAN_STATUS_RE (bold/case/optional-"Plan"/trailing-space forms), fenced
// code blocks never count (the dual-read read-seam discipline), and the
// value is normalized through normalizeLegacyStatus — one matcher, zero
// second regex implementations (01 §5.2 "不得各自带正则").
//
// Domain: .md writes under the injected plans roots (ctx.plansRoots — the
// path-guardrail passive-scan union). Deny face = the proposedContent
// carries a legacy TERMINAL status line (introduce or keep — the frozen
// corpus never re-enters an AI write) OR the current state has one and the
// write rewrites/deletes it (rewrite-to-non-terminal = un-freeze attempt).
// Exceptions = the P8 literal three legs (human actor role / CI deployment
// face / approved project via activePlanReferencing); corpus not injected
// → fail-closed deny (the protection face never opens on unobservable
// facts — same posture as P8). Recorded miss: the `write` tool face has no
// disk snapshot, so delete-the-line escapes via full-file write without a
// prior state are unobservable here (the edit/str_replace faces carry the
// disk text; CI + git attribution own the write-tool residual).

const LEGACY_TERMINAL_SET = new Set(["completed", "cancelled", "superseded", "deferred"]);

export const LEGACY_TERMINAL_PLAN_STATUSES = [...LEGACY_TERMINAL_SET];

/**
 * First legacy `> Plan Status:` value of a text, fence-skipped and
 * normalized — the shared PLAN_STATUS_RE glyph tolerance, env-free.
 * @returns {string | null}
 */
export function legacyPlanStatusOf(text) {
  if (typeof text !== "string") return null;
  const split = splitLedgerSections(text);
  for (let i = 0; i < split.lines.length; i++) {
    if (split.fenced[i]) continue;
    const m = split.lines[i].match(PLAN_STATUS_RE);
    if (m) return normalizeLegacyStatus(m[1].trim());
  }
  return null;
}

function isLegacyTerminal(status) {
  return status !== null && LEGACY_TERMINAL_SET.has(status);
}

function legacyPlanFreezeRule(action, currentFileState, ctx = {}) {
  if (!toPosixPath(action.path).endsWith(".md")) {
    return { verdict: "allow", reason: "legacy-plan-freeze: not a .md write — outside domain" };
  }
  const roots = Array.isArray(ctx.plansRoots) ? ctx.plansRoots.filter((r) => typeof r === "string" && r !== "") : null;
  if (roots === null || roots.length === 0) {
    return {
      verdict: "allow",
      reason: "legacy-plan-freeze: plans roots not injected on this face — domain membership not verifiable, fail-open (02 §6; the DSH adapter and gate-check CLI inject ctx.plansRoots)",
    };
  }
  const inDomain = roots.some((root) => isUnderRoot(action.path, root));
  if (!inDomain) {
    return { verdict: "allow", reason: "legacy-plan-freeze: .md write outside every registered plans root — outside domain (non-plan documents with status-looking lines are not gated)" };
  }

  const proposedStatus = legacyPlanStatusOf(action.proposedContent);
  const currentText = currentTextOf(currentFileState);
  const currentStatus = currentText !== null ? legacyPlanStatusOf(currentText) : null;

  const carriesTerminal = isLegacyTerminal(proposedStatus);
  const unFreeze = isLegacyTerminal(currentStatus) && proposedStatus !== currentStatus;
  if (!carriesTerminal && !unFreeze) {
    return {
      verdict: "allow",
      reason: `legacy-plan-freeze: no legacy terminal status line in play (proposed=${JSON.stringify(proposedStatus)}) — legacy corpus freeze inert for this write`,
    };
  }

  const actor = action.actor;
  const actorRole = actor && typeof actor.role === "string" ? actor.role : null;
  const path = toPosixPath(action.path);
  const face = carriesTerminal
    ? `the proposed content carries a legacy terminal status line (Plan Status: ${proposedStatus})`
    : `the current file holds Plan Status: ${currentStatus} (terminal) and this write rewrites or deletes that line (un-freeze attempt)`;
  if (actorRole === "human") {
    return {
      verdict: "allow",
      reason: `legacy-plan-freeze: legacy terminal-line write by a human actor on ${path} (02 §4.7 literal exception ① — human)`,
    };
  }
  const reference = activePlanReferencing(action.path, ctx);
  if (reference !== null) {
    return {
      verdict: "allow",
      reason: `legacy-plan-freeze: ${face}, covered by the approved-project exception — active plan ${reference.plan} line ${reference.line} names this target (02 §4.7 literal exception ③)`,
    };
  }
  if (!Array.isArray(ctx.plans)) {
    return {
      verdict: "deny",
      reason: `legacy-plan-freeze: ${face}, and the plan corpus is not injected on this face — the approved-project exception cannot be evaluated; the frozen legacy corpus fails closed. Legal channels: human actor (role=human), CI (writes outside the pre-execute pipeline), or an approved project (an active plan declaring this path as a target — inject ctx.plans)`,
    };
  }
  return {
    verdict: "deny",
    reason: `legacy-plan-freeze: ${face} — legacy terminal plans are frozen for AI writes; the dual-read corpus stays legacy forever and restart work needs a new plan (01 §5.1). Legal channels: human actor (role=human), CI (writes outside the pre-execute pipeline), or an approved project (an active plan whose body declares this path as a target)${actorRole === null ? "; actor role not verifiable on this face (id-only/absent actor — unverified-writer posture, the human exception cannot be claimed)" : ` (actor role ${actorRole} is not in the exception set)`}`,
  };
}

registerRule("legacy-plan-freeze", legacyPlanFreezeRule, { structural: true });
