// AGE file-ledger body-section scanner, structural validators, basisHash, and
// completion-derivation predicates.
// Contract: docs/design/age-autonomy/01-file-ledger.md §2.5/§3.2/§3.3/§4.2/§4.4/§5.2/§5.3
// (decisions pinned in docs/plans/age-autonomy/2026-08-25-0635-2 Phase 1).
// Scanning is new-format only (`## Phase <n>` h2 etc.); legacy `### Phase N` h3
// migration and dual-read wiring belong to 0635-3. Structure verdicts only —
// write-time enforcement (append-only interception, writer identity) is M2 law.

import { createHash } from "node:crypto";
import { parseFrontmatter, TERMINAL_PLAN_STATUSES } from "./ledger-frontmatter.mjs";

export const PHASE_HEADING_RE = /^Phase (\d+)(?:\s*(?:—|-)\s*(\S.*))?$/;
export const MILESTONE_HEADING_RE = /^M(\d+)(?:\s*(?:—|-)\s*(\S.*))?$/;
export const LEDGER_ID_RE = /^#(review|audit)-(.+)-(\d+)-([0-9a-f]{8})$/;

const UNCHECKED_RE = /^- \[ \]/;
const CHECKED_RE = /^- \[x\]/;
const PLAN_ANCHORS = ["Closure Findings", "Draft Review Record", "Verification", "Closure"];
const ROADMAP_ANCHORS = ["Deep Audit Record"];
const WI_STATUS_RE = /: `(todo|ready|done)`\s*$/;
const WI_ID_RE = /\bWI(\d+)\b/;

const ID_TOKEN = "#(?:review|audit)-[0-9A-Za-z_-]+";
const DISPATCH_RE = new RegExp(`^- dispatch (review|audit) (${ID_TOKEN}) to (\\S+)`);
const ACCEPTED_RE = new RegExp(`^- accepted (${ID_TOKEN})\\s*(.*)$`);
const PASS_RE = /^- pass ([A-Za-z][A-Za-z0-9:_-]*) (\S+) basisHash=([0-9a-f]{64}) exit=(\d+)\s*(.*)$/;
const REVIEW_CONCLUSION_RE = new RegExp(
  `^- (\\d{4}-\\d{2}-\\d{2})[：:]iteration (\\d+)[，,]共识 (\\S+)\\s+(${ID_TOKEN})`,
);
const DATE_LINE_PREFIX_RE = /^- \d{4}-\d{2}-\d{2}[：:]/;
const FINDINGS_RE = /^findings=(none|items)(?=[\s：:]|$)/;

export function parseLedgerId(token) {
  const m = typeof token === "string" ? token.match(LEDGER_ID_RE) : null;
  if (!m) return null;
  // Tail-anchored: nonce8 = last segment, iter/round = previous segment, the
  // rest stays one combined runId-plan prefix (hyphen-rich stems are safe).
  return { kind: m[1], prefix: m[2], iter: Number(m[3]), nonce: m[4], id: token };
}

function toLines(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
}

function computeFenceMask(lines) {
  const fenced = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open === null) {
      if (m) {
        open = { ch: m[1][0], len: m[1].length };
        fenced[i] = true;
      }
    } else {
      fenced[i] = true;
      if (m && m[1][0] === open.ch && m[1].length >= open.len && m[2].trim() === "") open = null;
    }
  }
  return fenced;
}

function matchHeading(line) {
  let m = line.match(/^##(?!#)\s*(\S.*?)\s*$/);
  if (m) return { level: 2, text: m[1] };
  m = line.match(/^###(?!#)\s*(\S.*?)\s*$/);
  if (m) return { level: 3, text: m[1] };
  return null;
}

export function splitLedgerSections(text) {
  const lines = toLines(text);
  const fenced = computeFenceMask(lines);
  const fm = parseFrontmatter(text);
  const bodyStart = fm.range ? fm.range.end : 0;
  const headings = [];
  for (let i = bodyStart; i < lines.length; i++) {
    if (fenced[i]) continue;
    const h = matchHeading(lines[i]);
    if (h) headings.push({ level: h.level, text: h.text, idx: i });
  }
  const blocks = [];
  for (let j = 0; j < headings.length; j++) {
    const { level, idx } = headings[j];
    let end = lines.length;
    for (let k = j + 1; k < headings.length; k++) {
      if (headings[k].level <= level) {
        end = headings[k].idx;
        break;
      }
    }
    blocks.push({
      level,
      text: headings[j].text,
      headingLine: idx + 1,
      bodyStart: idx + 1,
      bodyEnd: end,
      lines: lines.slice(idx + 1, end),
    });
  }
  return {
    lines,
    fenced,
    fmParsed: fm,
    hasFrontmatter: fm.range !== null,
    fm: fm.ok ? fm.fm : null,
    fmError: fm.ok ? null : fm.error,
    fmRange: fm.range,
    blocks,
  };
}

function countBlockCheckboxes(split, block) {
  const unchecked = [];
  let total = 0;
  let checked = 0;
  for (let i = block.bodyStart; i < block.bodyEnd; i++) {
    if (split.fenced[i]) continue;
    const line = split.lines[i];
    if (UNCHECKED_RE.test(line) || CHECKED_RE.test(line)) {
      total++;
      if (CHECKED_RE.test(line)) checked++;
      else unchecked.push({ line: i + 1, text: line });
    }
  }
  return { headingLine: block.headingLine, total, checked, unchecked };
}

function pushError(errors, line, code, message) {
  errors.push({ line, code, message });
}

// Classify one body line of an append-only section against the pinned line
// grammars. Known prefixes (dispatch/accepted/pass/date-iteration) are strict;
// anything else is tolerated prose (legacy migration corpus keeps old notes).
function scanRegistryLines(split, block, acceptedFindingsMode, errors) {
  const dispatches = [];
  const accepted = [];
  const conclusions = [];
  const passes = [];
  for (let i = block.bodyStart; i < block.bodyEnd; i++) {
    if (split.fenced[i]) continue;
    const line = split.lines[i];
    const lineNo = i + 1;
    if (line.startsWith("- dispatch ")) {
      const m = line.match(DISPATCH_RE);
      if (!m) {
        pushError(errors, lineNo, "malformed-dispatch", "dispatch line must be `- dispatch (review|audit) #<id> to <sessionId>`");
        dispatches.push({ line: lineNo, raw: line, valid: false });
        continue;
      }
      const id = parseLedgerId(m[2]);
      const kindMismatch = id !== null && id.kind !== m[1];
      const valid = id !== null && !kindMismatch;
      if (!valid) {
        pushError(
          errors,
          lineNo,
          kindMismatch ? "id-kind-mismatch" : "malformed-dispatch",
          kindMismatch
            ? `dispatch kind "${m[1]}" does not match id kind "${id.kind}" in ${m[2]}`
            : `invalid ledger id ${m[2]} — expected #<review|audit>-<runId>-<plan|roadmap>-<iter|round>-<nonce8 hex>`,
        );
      }
      dispatches.push({ line: lineNo, kind: m[1], id: m[2], sessionId: m[3], valid });
      continue;
    }
    if (line.startsWith("- accepted ")) {
      const m = line.match(ACCEPTED_RE);
      if (!m) {
        pushError(errors, lineNo, "malformed-accepted", "accepted line must be `- accepted #<id>`");
        accepted.push({ line: lineNo, raw: line, valid: false });
        continue;
      }
      const id = parseLedgerId(m[1]);
      const rest = m[2].trim();
      let findings = null;
      let valid = id !== null;
      if (acceptedFindingsMode === "required") {
        const f = rest.match(FINDINGS_RE);
        if (!f) {
          valid = false;
          pushError(errors, lineNo, "accepted-findings-mismatch", "roadmap accepted line must carry `findings=none|items` after the id");
        } else {
          findings = f[1];
        }
      } else if (acceptedFindingsMode === "forbidden") {
        if (FINDINGS_RE.test(rest)) {
          valid = false;
          pushError(errors, lineNo, "accepted-findings-mismatch", "plan accepted line must NOT carry the roadmap `findings=` lexeme");
        }
      }
      if (id === null) {
        pushError(errors, lineNo, "malformed-accepted", `invalid ledger id ${m[2]} — expected #<review|audit>-<runId>-<plan|roadmap>-<iter|round>-<nonce8 hex>`);
      }
      accepted.push({ line: lineNo, id: m[1], findings, valid });
      continue;
    }
    if (line.startsWith("- pass ")) {
      const m = line.match(PASS_RE);
      if (!m) {
        pushError(errors, lineNo, "malformed-pass", "pass line must be `- pass <commandKey> <runId> basisHash=<sha256hex> exit=<code>`");
        continue;
      }
      passes.push({ line: lineNo, key: m[1], runId: m[2], basisHash: m[3], exit: Number(m[4]) });
      continue;
    }
    if (DATE_LINE_PREFIX_RE.test(line)) {
      const m = line.match(REVIEW_CONCLUSION_RE);
      if (!m) {
        pushError(errors, lineNo, "malformed-review-conclusion", "review conclusion must be `- <date>：iteration <n>，共识 <verdict> #<review-id>`");
        continue;
      }
      const id = parseLedgerId(m[4]);
      if (id === null || id.kind !== "review") {
        pushError(errors, lineNo, "malformed-review-conclusion", `review conclusion id must be a valid #review-… id (got ${m[4]})`);
        continue;
      }
      conclusions.push({ line: lineNo, date: m[1], iteration: Number(m[2]), verdict: m[3], id: m[4], valid: true });
      continue;
    }
  }
  return { dispatches, accepted, conclusions, passes };
}

function pairRegistry(section) {
  const dispatchIds = new Set(section.dispatches.filter((d) => d.id).map((d) => d.id));
  const conclusionIds = new Set(
    [...section.accepted.map((a) => a.id), ...section.conclusions.map((c) => c.id)].filter(Boolean),
  );
  section.pairs = [...dispatchIds].filter((id) => conclusionIds.has(id));
  section.unpairedDispatches = [...dispatchIds].filter((id) => !conclusionIds.has(id));
  section.unpairedConclusions = [...conclusionIds].filter((id) => !dispatchIds.has(id));
  return section;
}

function collectOutOfDomain(split, countingBlocks, errors, domainLabel) {
  const counted = new Set();
  for (const b of countingBlocks) {
    for (let i = b.bodyStart; i < b.bodyEnd; i++) counted.add(i);
  }
  for (let i = split.fmRange ? split.fmRange.end : 0; i < split.lines.length; i++) {
    if (split.fenced[i] || counted.has(i)) continue;
    const line = split.lines[i];
    if (UNCHECKED_RE.test(line) || CHECKED_RE.test(line)) {
      pushError(
        errors,
        i + 1,
        "out-of-domain-checkbox",
        `column-0 checkbox outside the counting domain (${domainLabel}) — counting-domain discipline per 01-file-ledger §2.5`,
      );
    }
  }
}

export function scanPlanLedger(text) {
  const split = splitLedgerSections(text);
  const errors = [];
  const phases = [];
  const closureFindingsBlocks = [];
  const anchors = new Map();
  const countingBlocks = [];
  for (const block of split.blocks) {
    if (block.level !== 2) continue;
    const pm = block.text.match(PHASE_HEADING_RE);
    if (pm) {
      const counted = countBlockCheckboxes(split, block);
      phases.push({ number: Number(pm[1]), title: pm[2] ?? null, ...counted });
      countingBlocks.push(block);
      continue;
    }
    if (block.text === "Closure Findings") {
      closureFindingsBlocks.push(countBlockCheckboxes(split, block));
      countingBlocks.push(block);
      continue;
    }
    if (PLAN_ANCHORS.includes(block.text) && !anchors.has(block.text)) {
      anchors.set(block.text, block);
    }
  }

  const draftReviewBlock = anchors.get("Draft Review Record");
  const draftReviewRecord = draftReviewBlock
    ? pairRegistry({
        headingLine: draftReviewBlock.headingLine,
        ...scanRegistryLines(split, draftReviewBlock, "forbidden", errors),
      })
    : null;
  const verificationBlock = anchors.get("Verification");
  const verification = verificationBlock
    ? { headingLine: verificationBlock.headingLine, ...scanRegistryLines(split, verificationBlock, "forbidden", errors) }
    : null;
  const closureBlock = anchors.get("Closure");
  const closure = closureBlock
    ? pairRegistry({ headingLine: closureBlock.headingLine, ...scanRegistryLines(split, closureBlock, "forbidden", errors) })
    : null;

  collectOutOfDomain(split, countingBlocks, errors, "plan: Phase sections + ## Closure Findings only");

  const total = phases.reduce((n, p) => n + p.total, 0) + closureFindingsBlocks.reduce((n, c) => n + c.total, 0);
  const checked = phases.reduce((n, p) => n + p.checked, 0) + closureFindingsBlocks.reduce((n, c) => n + c.checked, 0);
  const unchecked = [
    ...phases.flatMap((p) => p.unchecked.map((u) => ({ section: `Phase ${p.number}`, ...u }))),
    ...closureFindingsBlocks.flatMap((c) => c.unchecked.map((u) => ({ section: "Closure Findings", ...u }))),
  ];

  return {
    hasFrontmatter: split.hasFrontmatter,
    fm: split.fm,
    fmError: split.fmError,
    fmRange: split.fmRange,
    phases,
    closureFindings: closureFindingsBlocks.length > 0 ? closureFindingsBlocks[0] : null,
    draftReviewRecord,
    verification,
    closure,
    counts: { total, checked, unchecked: unchecked.length },
    unchecked,
    errors,
  };
}

export function scanRoadmapLedger(text) {
  const split = splitLedgerSections(text);
  const errors = [];
  const milestones = [];
  const countingBlocks = [];
  let deepAuditBlock = null;
  for (const block of split.blocks) {
    const mm = block.level === 3 ? block.text.match(MILESTONE_HEADING_RE) : null;
    if (mm) {
      const workItems = [];
      for (let i = block.bodyStart; i < block.bodyEnd; i++) {
        if (split.fenced[i]) continue;
        const line = split.lines[i];
        if (UNCHECKED_RE.test(line) || CHECKED_RE.test(line)) {
          const wi = line.match(WI_ID_RE);
          const st = line.match(WI_STATUS_RE);
          workItems.push({
            line: i + 1,
            id: wi ? `WI${wi[1]}` : null,
            checked: CHECKED_RE.test(line),
            status: st ? st[1] : null,
            text: line,
          });
        }
      }
      milestones.push({
        number: Number(mm[1]),
        title: mm[2] ?? null,
        headingLine: block.headingLine,
        workItems,
        total: workItems.length,
        checked: workItems.filter((w) => w.checked).length,
        unchecked: workItems.filter((w) => !w.checked),
      });
      countingBlocks.push(block);
      continue;
    }
    if (block.level === 2 && block.text === "Deep Audit Record" && deepAuditBlock === null) {
      deepAuditBlock = block;
    }
  }

  const deepAuditRecord = deepAuditBlock
    ? pairRegistry({ headingLine: deepAuditBlock.headingLine, ...scanRegistryLines(split, deepAuditBlock, "required", errors) })
    : null;

  collectOutOfDomain(split, countingBlocks, errors, "roadmap: Work Item blocks under ### M<n> only");

  const total = milestones.reduce((n, m) => n + m.total, 0);
  const checked = milestones.reduce((n, m) => n + m.checked, 0);
  const unchecked = milestones.flatMap((m) => m.unchecked.map((u) => ({ section: `M${m.number}`, ...u })));

  return {
    hasFrontmatter: split.hasFrontmatter,
    fm: split.fm,
    fmError: split.fmError,
    fmRange: split.fmRange,
    milestones,
    deepAuditRecord,
    counts: { total, checked, unchecked: unchecked.length },
    unchecked,
    errors,
  };
}

export function computeBasisHash(text) {
  const split = splitLedgerSections(text);
  const out = [];
  if (split.fmRange) {
    for (let i = split.fmRange.start - 1; i < split.fmRange.end; i++) {
      out.push(split.lines[i].replace(/[ \t]+$/, ""));
    }
  }
  for (const block of split.blocks) {
    if (block.level !== 2) continue;
    const inDomain = PHASE_HEADING_RE.test(block.text) || block.text === "Closure Findings";
    if (!inDomain) continue;
    out.push(split.lines[block.headingLine - 1].replace(/[ \t]+$/, ""));
    for (let i = block.bodyStart; i < block.bodyEnd; i++) {
      out.push(split.lines[i].replace(/[ \t]+$/, ""));
    }
  }
  return createHash("sha256").update(out.join("\n") + "\n", "utf8").digest("hex");
}

// 01 §5.2 completion formula, conjunct by conjunct:
// active ∧ all-checked ∧ mechanical-verification ∧ audit-receipt ∧ dispatch-register.
export function deriveCompleted(record, opts = {}) {
  const text = typeof record === "string" ? record : record.text;
  const path = record && typeof record === "object" ? record.path : null;
  const scan = scanPlanLedger(text);
  const status = scan.fm && typeof scan.fm.status === "string" ? scan.fm.status : null;
  const basisHash = computeBasisHash(text);
  const reasons = [];

  const conjuncts = {
    statusActive: status === "active",
    allChecked: scan.counts.unchecked === 0,
    mechanicalVerification: false,
    auditReceipt: false,
    dispatchRegister: false,
  };
  if (!conjuncts.statusActive) reasons.push("status-not-active");
  if (!conjuncts.allChecked) reasons.push(`unchecked-items:${scan.counts.unchecked}`);

  const verifyField = scan.fm ? scan.fm.verify : undefined;
  const keys = Array.isArray(verifyField)
    ? verifyField
    : verifyField === undefined && Array.isArray(opts.defaultVerifyKeys)
      ? opts.defaultVerifyKeys
      : undefined;
  const passes = scan.verification ? scan.verification.passes : [];
  const satisfying = new Set(passes.filter((p) => p.exit === 0 && p.basisHash === basisHash).map((p) => p.key));
  const recorded = new Set(passes.filter((p) => p.exit === 0).map((p) => p.key));
  const verification = { keys, basisHash, missingKeys: [], staleKeys: [], basisHashMatch: false };
  if (keys === undefined) {
    reasons.push("no-verify-keys");
  } else {
    verification.missingKeys = keys.filter((k) => !satisfying.has(k));
    verification.staleKeys = keys.filter((k) => !satisfying.has(k) && recorded.has(k));
    verification.basisHashMatch = verification.missingKeys.length === 0;
    conjuncts.mechanicalVerification = verification.missingKeys.length === 0;
    for (const k of verification.missingKeys) {
      reasons.push(verification.staleKeys.includes(k) ? `basis-hash-mismatch:${k}` : `missing-pass:${k}`);
    }
  }

  const closurePairs = scan.closure ? scan.closure.pairs : [];
  conjuncts.auditReceipt = closurePairs.length > 0;
  if (!conjuncts.auditReceipt) reasons.push("no-audit-receipt");

  const allDispatches = [
    ...(scan.draftReviewRecord ? scan.draftReviewRecord.dispatches : []),
    ...(scan.closure ? scan.closure.dispatches : []),
  ];
  conjuncts.dispatchRegister = allDispatches.every((d) => d.valid);
  if (!conjuncts.dispatchRegister) reasons.push("invalid-dispatch-register");

  const completed = Object.values(conjuncts).every(Boolean);
  return {
    path,
    status,
    completed,
    conjuncts,
    reasons,
    basisHash,
    verification,
    auditReceipt: { pairs: closurePairs, unpairedDispatches: scan.closure ? scan.closure.unpairedDispatches : [] },
    inDomain: scan.hasFrontmatter && scan.fmError === null,
  };
}

function planStates(records, opts) {
  return records.map((r) => deriveCompleted(r, opts));
}

export function draftPlans(records) {
  return planStates(records).filter((s) => s.inDomain && s.status === "draft").map((s) => s.path);
}

export function activePlans(records, opts = {}) {
  return planStates(records, opts).filter((s) => s.inDomain && s.status === "active" && !s.completed).map((s) => s.path);
}

export function heldPlans(records) {
  return planStates(records).filter((s) => s.inDomain && s.status === "held").map((s) => s.path);
}

export function closedPlans(records, opts = {}) {
  return planStates(records, opts)
    .filter((s) => s.inDomain && (s.completed || TERMINAL_PLAN_STATUSES.includes(s.status)))
    .map((s) => s.path);
}

export function openPlans(records, opts = {}) {
  return planStates(records, opts)
    .filter((s) => s.inDomain && !s.completed && ["draft", "active", "held"].includes(s.status))
    .map((s) => s.path);
}

// Derived middle state (01 §5.2): active ∧ all-checked ∧ no valid audit receipt.
// Triggers mechanical verification then audit dispatch; never completes by itself.
export function awaitingClosure(records, opts = {}) {
  return planStates(records, opts)
    .filter((s) => s.inDomain && s.conjuncts.statusActive && s.conjuncts.allChecked && !s.conjuncts.auditReceipt)
    .map((s) => s.path);
}
