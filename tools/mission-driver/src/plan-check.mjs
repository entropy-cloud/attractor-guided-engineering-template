/**
 * plan-check.mjs — plan checklist inspector for the mission driver.
 *
 * Dual-read (age-autonomy M1-WI7, plan 0635-3): status resolution and new-format
 * checkbox counting go through the shared ledger library
 * (`src/ledger-dualread.mjs` + `src/ledger-sections.mjs`) — frontmatter first,
 * legacy `> Plan Status:` fallback, env breaker MISSION_DRIVER_LEDGER.
 *
 *  - New-format plan (frontmatter with `status`): counts come from the counting
 *    domain (`## Phase <n>` sections + `## Closure Findings`) only; template
 *    examples outside the domain never pollute. `completed` is derived
 *    (01 §5.2), never read from the file. Closure evidence = paired
 *    dispatch/accepted lines in `## Closure`.
 *  - Legacy plan: previous whole-document behavior is preserved verbatim
 *    (legacy plans predate the counting-domain discipline).
 *  - Neither (guides/templates): zero counts, status unknown — `--strict`
 *    passes for the plan guide itself (M1-WI11 gate 1).
 */

import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { planLedgerState } from "./ledger-dualread.mjs";
import { scanPlanLedger } from "./ledger-sections.mjs";
import { discoverOwningMission } from "./mission-check.mjs";

const CHECKLIST_UNCHECKED_RE = /^(\s*)-\s+\[\s?\]\s+(.+)$/gm;
const CHECKLIST_CHECKED_RE = /^(\s*)-\s+\[x\]\s+(.+)$/gim;
// Match the real "## Closure" section, NOT "## Closure Gates". `\b` alone
// would also match "Closure Gates" (word boundary before the space), and since
// the plan template always places "## Closure Gates" before "## Closure",
// content.search() would pick the wrong section. Anchoring to end-of-line
// after "Closure" ensures only the bare Closure heading is matched.
const CLOSURE_HEADER_RE = /^#{2,4}\s+Closure\s*$/im;
// Writer-side pass-line linter (WI05 re-exec regression, fixed 2026-09-10):
// scan the body for lines that LOOK like pass lines (after trimming leading
// whitespace) but were not picked up by scanPlanLedger because of format
// drift. The regex below must mirror the relaxed gate in
// ledger-sections.mjs.scanRegistryLines so a line that scans as "looks like a
// pass line" but does not match the body's gate is reported as malformed
// rather than silently dropped. Mirrored intentionally — a divergence here
// would re-introduce the silent-channel the regex change just closed.
const PASS_LIKE_LINE_RE = /^[ \t]*- pass\b/;

function toPosix(p) {
  return p.split(/\\/).join("/");
}

function analyzeLegacy(content, planStatus) {
  const isCompleted = planStatus === "completed";

  // Closure section presence + evidence (legacy shape)
  const closureHeaderIdx = content.search(CLOSURE_HEADER_RE);
  let hasClosureSection = closureHeaderIdx !== -1;
  let closureBody = "";
  if (hasClosureSection) {
    // Slice from the Closure header to the next ## heading (or EOF)
    const after = content.slice(closureHeaderIdx);
    const nextH2 = after.slice(1).search(/\n#{2}\s/);
    closureBody = nextH2 === -1 ? after : after.slice(0, nextH2 + 1);
  }

  // Closure "evidence" = any non-placeholder list item under Closure. A bare
  // "*(pending)*" or "(pending)" placeholder does not count as evidence.
  const evidenceItemRe = /^-\s+(.+)$/gm;
  const placeholderRe = /^\*\(pending\)\*$|^\(pending\)$|\bTODO\b/i;
  let closureEvidenceCount = 0;
  if (closureBody) {
    let m;
    while ((m = evidenceItemRe.exec(closureBody)) !== null) {
      if (!placeholderRe.test(m[1].trim())) closureEvidenceCount++;
    }
  }

  // Checklist counts (whole-document, legacy behavior preserved)
  const totalUnchecked = (content.match(CHECKLIST_UNCHECKED_RE) || []).length;
  const totalChecked = (content.match(CHECKLIST_CHECKED_RE) || []).length;

  return {
    planStatus,
    isCompleted,
    totalChecked,
    totalUnchecked,
    hasClosureSection,
    hasClosureEvidence: closureEvidenceCount > 0,
    closureEvidenceCount,
    structuralErrors: [],
  };
}

function analyzeFrontmatter(content, state) {
  const scan = scanPlanLedger(content);
  const isCompleted = state.completed;
  const hasClosureSection = scan.closure !== null;
  const closureEvidenceCount = scan.closure ? scan.closure.pairs.length : 0;
  const structuralErrors = scan.errors.map((e) => `line ${e.line}: ${e.message}`);
  if (scan.fmError) structuralErrors.push(`frontmatter: ${scan.fmError}`);
  // M2-WI42: field-set violations from the read seam (planLedgerState →
  // readPlanStatus frontmatter branch) — surfaced as `field:` details, same
  // no-strict-gate treatment as structuralErrors (field semantics are not a
  // strictness option).
  const fieldErrors = state.fieldErrors ?? [];
  const derived = state.derived;
  // Derived completion view (M2-WI41): expose why deriveCompleted holds or
  // fails (01 §5.2 reasons, verbatim) plus the effective verify key set and
  // where it came from — explicit frontmatter `verify` vs mission-default
  // injection (opts.defaultVerifyKeys).
  const verifyKeys = derived ? derived.verification.keys : undefined;
  const verifyKeysSource = derived
    ? (scan.fm && scan.fm.verify !== undefined
        ? "frontmatter"
        : Array.isArray(verifyKeys)
          ? "mission-default"
          : "none")
    : "none";
  return {
    planStatus: state.normalized,
    isCompleted,
    totalChecked: scan.counts.checked,
    totalUnchecked: scan.counts.unchecked,
    hasClosureSection,
    hasClosureEvidence: closureEvidenceCount > 0,
    closureEvidenceCount,
    structuralErrors,
    fieldErrors,
    fieldsValid: state.fieldsValid ?? true,
    derivedCompleted: isCompleted,
    completionReasons: derived ? derived.reasons : [],
    verifyKeys,
    verifyKeysSource,
  };
}

/**
 * Mission default verify keys for the engine read path (M2-WI41 Phase 2
 * adjudication): `["test"]` — `commands.test` is the only REQUIRED command
 * key (mission-check REQUIRED_COMMANDS), universally present and semantically
 * "mechanical verification". A mission without a non-empty `commands.test`
 * degenerates to no injection (pre-WI41 behavior). The gate-check --verify
 * face keeps its own broader default set (verify-runner DEFAULT_VERIFY_KEY_
 * ORDER) — different consumer, adjudicated separately.
 * @param {object} mission resolved mission config (post extends-merge)
 * @returns {string[] | null}
 */
export function missionDefaultVerifyKeys(mission) {
  const test = mission?.commands?.test;
  return typeof test === "string" && test.trim() !== "" ? ["test"] : null;
}

/**
 * Analyze a plan file and return raw metrics (dual-read).
 * @param {string} filePath absolute or project-relative path to the plan
 * @param {string} [projectRoot] for computing relative paths in output
 * @param {{ defaultVerifyKeys?: string[] }} [opts] verify-key defaults for
 *   plans that omit frontmatter `verify` (01 §4.1 "missing → mission default")
 */
function analyzePlan(filePath, projectRoot, opts = {}) {
  const content = readFileSync(filePath, "utf-8");
  const relPath = projectRoot ? toPosix(relative(projectRoot, filePath)) : toPosix(filePath);

  const state = planLedgerState(content, { defaultVerifyKeys: opts.defaultVerifyKeys });
  const analyzed = state.format === "frontmatter"
    ? analyzeFrontmatter(content, state)
    : state.format === "legacy"
      ? analyzeLegacy(content, state.normalized)
      : {
          planStatus: "unknown",
          isCompleted: false,
          totalChecked: 0,
          totalUnchecked: 0,
          hasClosureSection: false,
          hasClosureEvidence: false,
          closureEvidenceCount: 0,
          structuralErrors: state.rejected ? [state.rejected] : [],
        };

  return {
    file: relPath,
    format: state.format,
    ...analyzed,
    allUnchecked: analyzed.totalChecked === 0 && analyzed.totalUnchecked > 0,
  };
}

/**
 * Writer-side pass-line-format linter (WI05 re-exec regression, 2026-09-10).
 *
 * Scans the plan body for every line that LOOKS like a pass line (any
 * whitespace + `- pass`) and partitions them into well-formed vs malformed.
 * Returns `{ total, wellFormed, malformed }` where each malformed entry
 * carries the 1-based line number and the offending text — enough for the
 * writer to jump in with the Edit tool. Lines inside fenced code blocks
 * are skipped (the same mask scanPlanLedger uses) so prose documentation
 * about pass lines (e.g. "every plan must have `- pass test …` lines")
 * never trips the linter.
 *
 * This is the writer-side companion to the engine-side regex relaxation
 * (ledger-sections.mjs PASS_RE accepts leading whitespace). The two
 * together close the silent channel: the regex now matches indented pass
 * lines so deriveCompleted recognizes them, and this linter catches any
 * future drift at write time before it lands on disk.
 *
 * Scope mirrors the engine exactly: scanPlanLedger only scans pass lines
 * inside a real `## Verification` block (anchors are fence-masked, so a
 * fenced template demo never counts). A file with no such block has no
 * engine-visible pass surface — scanning the whole body here would false-kill
 * prose format documentation like the authoring guide's `- pass <commandKey>
 * <runId> exit=<code>` bullet (live corpus regression, fixed 2026-09-21).
 *
 * @param {string} filePath absolute path to the plan file
 * @returns {{ total: number, wellFormed: number, malformed: Array<{ line: number, text: string }> }}
 */
export function inspectPassLineFormat(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const split = scanPlanLedger(content);
  const verification = split.verification;
  if (!verification) {
    // No real `## Verification` block → the engine derives nothing from this
    // file, so there is no pass-line surface to lint.
    return { total: 0, wellFormed: 0, malformed: [] };
  }
  const verificationStart = verification.headingLine;

  let total = 0;
  const malformed = [];
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const fenceOpen = { open: false, ch: null, len: 0 };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fenceOpen.open && m) {
      fenceOpen.open = true;
      fenceOpen.ch = m[1][0];
      fenceOpen.len = m[1].length;
      continue;
    }
    if (fenceOpen.open) {
      if (m && m[1][0] === fenceOpen.ch && m[1].length >= fenceOpen.len && m[2].trim() === "") {
        fenceOpen.open = false;
      }
      continue;
    }
    if (!PASS_LIKE_LINE_RE.test(line)) continue;
    // verification is non-null here (early return above), so scope strictly
    // to the block: headingLine is the `## Verification` line itself, and
    // only registry lines after it are engine-visible.
    if (i + 1 <= verificationStart) continue;
    total++;
    if (!PASS_RE_COMPILED.test(line)) {
      malformed.push({ line: i + 1, text: line });
    }
  }
  // Well-formed = total - malformed. Done as separate subtraction (not a
  // second scan) because PASS_RE matches lines that PASS_LIKE_LINE_RE also
  // matched — the input set is identical.
  return { total, wellFormed: total - malformed.length, malformed };
}

// Mirror of ledger-sections.mjs PASS_RE for the linter. Kept in lock-step
// via comments on both sides; if the engine regex is ever broadened again
// (e.g. to accept trailing tokens, multiple runIds, etc.) this mirror must
// follow. A divergence here would re-open the silent channel the engine
// fix just closed.
const PASS_RE_COMPILED = /^[ \t]*- pass ([A-Za-z][A-Za-z0-9:_-]*) (\S+)(?: basisHash=[0-9a-f]{64})? exit=(\d+)\s*(.*)$/;

/**
 * Inspect a plan file and return a pass/fail verdict with detail messages.
 *
 * Mirrors the contract the mission-driver engine expects:
 *   { passed, file, planStatus, totalChecked, totalUnchecked, details, allUnchecked }
 * plus the additive derived-completion view (M2-WI41): derivedCompleted,
 * completionReasons, verifyKeys, verifyKeysSource (frontmatter format only),
 * and the field-set view (M2-WI42): fieldErrors, fieldsValid.
 *
 * @param {string} filePath plan file path
 * @param {{ strict?: boolean, projectRoot?: string, defaultVerifyKeys?: string[] }} [options]
 */
export function inspectPlan(filePath, options = {}) {
  const strict = options.strict === true;
  const projectRoot = options.projectRoot;
  const result = analyzePlan(filePath, projectRoot, { defaultVerifyKeys: options.defaultVerifyKeys });

  const details = [];

  if (result.totalUnchecked > 0) {
    details.push(`${result.totalUnchecked} unchecked items`);
  }

  for (const err of result.structuralErrors) {
    details.push(`ledger structure error: ${err}`);
  }

  // M2-WI42: field-set violations (unknown keys, unwritable status values,
  // claim pairing, verify element shape, …) fail the check — not strict-gated,
  // mirroring structuralErrors. The `field:` prefix marks the source.
  for (const fe of result.fieldErrors ?? []) {
    details.push(`field: ${fe}`);
  }

  // A completed plan must carry real closure evidence.
  if (result.isCompleted && !result.hasClosureEvidence) {
    details.push("missing closure evidence");
  }

  // Strict mode: a completed plan must have an explicit Closure section.
  if (strict && result.isCompleted && !result.hasClosureSection) {
    details.push("completed plan missing ## Closure section");
  }

  const failed = details.length > 0;

  // Pass-line-format self-check (writer-side linter; WI05 re-exec regression).
  // Surfaced only when the writer has placed malformed pass lines — silent
  // pass lines no longer reach here because scanPlanLedger rejects them with
  // a malformed-pass error, but we re-check independently so a future drift
  // in the engine regex doesn't silently re-open the channel.
  const passLineFormat = inspectPassLineFormat(filePath);
  if (passLineFormat.malformed.length > 0) {
    for (const m of passLineFormat.malformed) {
      details.push(`pass-line-format: line ${m.line} malformed — ${m.text.trim()}`);
    }
  }

  const finalFailed = details.length > 0;

  return {
    passed: !finalFailed,
    file: result.file,
    format: result.format,
    planStatus: result.planStatus,
    totalChecked: result.totalChecked,
    totalUnchecked: result.totalUnchecked,
    details,
    allUnchecked: result.allUnchecked,
    passLineFormat,
    ...(result.format === "frontmatter"
      ? {
          derivedCompleted: result.derivedCompleted,
          completionReasons: result.completionReasons,
          verifyKeys: result.verifyKeys,
          verifyKeysSource: result.verifyKeysSource,
          fieldErrors: result.fieldErrors,
          fieldsValid: result.fieldsValid,
        }
      : {}),
  };
}

// CLI entrypoint: node plan-check.mjs <plan.md> [--strict] [--pass-line-format]
// Guard must use pathToFileURL(...).href (mirrors mission-check.mjs:107, WI4 /
// design §2.5 "缺陷 4"): the naive `file://${process.argv[1]}` concatenation is
// never equal to import.meta.url on Windows (file:///C:/... vs file://C:\...),
// silently no-op'ing the whole CLI body.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const strict = argv.includes("--strict");
  const passLineFormatOnly = argv.includes("--pass-line-format");
  const file = argv.find(a => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: plan-check.mjs <plan.md> [--strict] [--pass-line-format]");
    process.exit(2);
  }
  if (passLineFormatOnly) {
    // Writer-side linter mode (WI05 re-exec regression, 2026-09-10): a
    // focused scan of `## Verification` pass-line shape. Exits 0 when every
    // `- pass …` line is well-formed; exits 1 with a per-line report when
    // any are malformed. Independent of the mission verify keys — this is
    // about WRITER correctness, not about the plan's verify-key coverage.
    const fmt = inspectPassLineFormat(file);
    const ok = fmt.malformed.length === 0;
    console.log(JSON.stringify({ ...fmt, ok }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } else {
    // M2-WI41: inject the owning mission's default verify key (["test"] when
    // commands.test is set) so the CLI's derived view cannot diverge from the
    // closureScriptCheck routing judgment for the same mission context. No
    // owning mission / no commands.test → no injection (unchanged behavior).
    const owned = discoverOwningMission(resolve(file));
    const defaultVerifyKeys = owned ? missionDefaultVerifyKeys(owned.mission) : null;
    const res = inspectPlan(file, {
      strict,
      ...(defaultVerifyKeys ? { defaultVerifyKeys } : {}),
    });
    console.log(JSON.stringify(res, null, 2));
    // WI49 Phase 3: exitCode assignment (never process.exit) so a piped stdout
    // flushes before exit (64KB pipe-buffer truncation guard).
    process.exitCode = res.passed ? 0 : 1;
  }
}
