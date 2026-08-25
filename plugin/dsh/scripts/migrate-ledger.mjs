#!/usr/bin/env node
/**
 * migrate-ledger.mjs — one-shot AGE ledger corpus codemod (age-autonomy M1
 * WI4+WI7+WI8, plan docs/plans/age-autonomy/2026-08-25-0635-3 Phase 1/2).
 *
 * What it migrates (decisions pinned in the plan's Phase 1):
 *   plans   — NON-TERMINAL legacy plans only (`> Plan Status:` not in
 *             completed/cancelled/superseded/deferred/replaced — the 52
 *             historical completed plans stay legacy forever, read as closed
 *             by the dual-read legacy channel):
 *               · `> Plan Status:` → frontmatter `status`
 *               · `> Mission:` / `> Work Item:` → `mission` / `work-item`
 *               · `> Review Hold:` → `status: held` + `hold:`
 *               · `group` from the filename timestamp prefix; `verify: [test]`
 *                 (transition-period completion binding, Decision 2 refinement)
 *               · `> Last Reviewed:` / `> Audit:` deleted (review facts live in
 *                 Draft Review Record); `> Source:` / `> Related:` kept as prose
 *               · `## Execution Plan` wrapper removed; `### Phase N - <name>`
 *                 → `## Phase N — <name>`; per-phase `Status:` lines deleted
 *               · `## Closure Gates` dissolved: executable items merged into the
 *                 last Phase tail, derivation-formula items deleted (01 §4.3)
 *               · `## Draft Review Record` / `## Closure` kept verbatim
 *   roadmaps — every `missions/*.json` `roadmapPath` (discovery = mission
 *             configs; the authoring guide is not a roadmap):
 *               · frontmatter `audit-rounds: <n>` inserted (0 unless the file
 *                 already declares rounds)
 *               · Work Item lines normalized to pure checkboxes (01 §3.2):
 *                 checkbox+suffix → suffix stripped; bullet+`: todo|ready|
 *                 planned|done` → checkbox (done⇒[x]); `## Work Item Status`
 *                 table rows → checkbox lines grouped under `### M<n> —` blocks
 *                 (titles reused from the Milestones section); flat bullet
 *                 lists without milestone blocks get a synthetic `### M1` wrap
 *
 * Safety: `--dry-run` prints unified diffs and writes nothing; the transform
 * is idempotent (second run = zero diff). Rollback = git revert + env breaker
 * MISSION_DRIVER_LEDGER=legacy. Scripts are not part of the packaged bundle,
 * so cross-directory imports of the engine shared library are allowed here
 * (build-bundle.mjs REPO_ROOT precedent).
 *
 * Usage:
 *   node plugin/dsh/scripts/migrate-ledger.mjs [--dry-run] [--scope plans|roadmaps]
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "../../../tools/mission-driver/src/ledger-frontmatter.mjs";
import { scanPlanLedger, scanRoadmapLedger } from "../../../tools/mission-driver/src/ledger-sections.mjs";

const REPO_ROOT = resolve(process.env.MIGRATE_LEDGER_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", ".."));
const DRY = process.argv.includes("--dry-run");
const SCOPE = (() => {
  const i = process.argv.indexOf("--scope");
  const v = i !== -1 ? process.argv[i + 1] : "all";
  if (!["all", "plans", "roadmaps"].includes(v)) {
    console.error(`--scope: invalid value "${v}" (plans | roadmaps | all)`);
    process.exit(2);
  }
  return v;
})();

// ── shared helpers ─────────────────────────────────────────────────────────

function fenceMask(lines) {
  const fenced = new Array(lines.length).fill(false);
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open === null) {
      if (m) { open = { ch: m[1][0], len: m[1].length }; fenced[i] = true; }
    } else {
      fenced[i] = true;
      if (m && m[1][0] === open.ch && m[1].length >= open.len && m[2].trim() === "") open = null;
    }
  }
  return fenced;
}

function unifiedDiff(path, before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  // Simple Myers-ish LCS via dynamic programming is overkill for these files;
  // use a line-prefix/suffix trim + naive middle diff (files are small).
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  const head = a.slice(0, p);
  const del = a.slice(p, a.length - s);
  const add = b.slice(p, b.length - s);
  const tail = a.slice(a.length - s);
  const out = [`diff --ledger a/${path} b/${path}`];
  const shownHead = head.length > 3 ? head.slice(-3) : head;
  out.push(...shownHead.map((l) => "  " + l));
  out.push(...del.map((l) => "-" + l));
  out.push(...add.map((l) => "+" + l));
  out.push(...tail.slice(0, 3).map((l) => "  " + l));
  return out.join("\n");
}

// ── plan migration ──────────────────────────────────────────────────────────

const TERMINAL_LEGACY = new Set(["completed", "cancelled", "superseded", "deferred", "replaced"]);

const ACTIVE_SYNONYMS = new Set([
  "active", "planned", "in progress", "in-progress", "inprogress",
  "partially completed", "partially-completed", "started", "executing", "in flight",
]);

function normalizeLegacyStatus(s) {
  const cut = s.search(/[（(]/);
  return (cut !== -1 ? s.slice(0, cut) : s).toLowerCase().replace(/\s+/g, " ").trim();
}

// Gates that the 01 §5.2 derivation formula now guarantees (or that reference
// retired guide rules) are deleted on dissolution; anything unrecognized is
// conservatively kept as executable work in the last Phase.
const DERIVED_GATE_PREFIXES = [
  "in-scope behavior is complete",
  "verification has run",
  "scoped verification is not conflated with full verification",
  "no in-scope item downgraded to deferred/follow-up",
  "independent draft review completed and recorded",
  "text consistency verified",
  "closure audit was independent",
  "closure evidence exists in files",
];

function gateIsDerived(itemText) {
  const bare = itemText.replace(/^`?/, "").split(/[(（:：]/)[0].trim().toLowerCase();
  return DERIVED_GATE_PREFIXES.some((p) => bare.startsWith(p));
}

function h2(text) {
  return /^##(?!#)\s/.test(text);
}
function h3(text) {
  return /^###(?!#)\s/.test(text);
}

function migratePlan(path) {
  const before = readFileSync(path, "utf8");
  const lines = before.replace(/\r\n?/g, "\n").split("\n");
  const fenced = fenceMask(lines);

  // header lines (unfenced only)
  let statusLine = null;
  let mission = null;
  let workItem = null;
  let holdReason = null;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const l = lines[i];
    if (h2(l)) break; // header block ends at the first section heading
    let m;
    if ((m = l.match(/^>\s*\*{0,2}(?:[Pp]lan\s+)?[Ss]tatus\*{0,2}\s*:\s*\*{0,2}(.+?)\*{0,2}\s*$/))) statusLine = { i, v: m[1].trim() };
    else if ((m = l.match(/^>\s*(?:\*\*)?Mission(?:\*\*)?\s*:\s*(.+?)\s*$/))) mission = m[1];
    else if ((m = l.match(/^>\s*(?:\*\*)?Work\s+Item(?:\*\*)?\s*:\s*(.+?)\s*$/))) workItem = m[1];
    else if ((m = l.match(/^>\s*(?:\*\*)?Review\s+Hold(?:\*\*)?\s*:\s*(.+?)\s*$/))) holdReason = { i, v: m[1] };
  }
  if (statusLine === null) return { path, before, after: before, skipped: "no-legacy-status" };
  const norm = normalizeLegacyStatus(statusLine.v);
  if (TERMINAL_LEGACY.has(norm)) return { path, before, after: before, skipped: `terminal-${norm}` };

  let status;
  if (holdReason !== null) status = "held";
  else if (norm === "draft" || norm === "drafted" || norm === "proposed" || norm === "not started" || norm === "backlog" || norm === "in draft" || norm === "in-draft") status = "draft";
  else if (ACTIVE_SYNONYMS.has(norm)) status = "active";
  else status = "active"; // unknown non-terminal → active is the safe execution-facing default

  const stem = basename(path).replace(/\.md$/, "");
  const groupMatch = stem.match(/^(\d{4}-\d{2}-\d{2}-\d{4})/);
  const group = groupMatch ? groupMatch[1] : stem;

  const fmLines = ["---", `status: ${status}`];
  if (mission) fmLines.push(`mission: ${/\s/.test(mission) ? JSON.stringify(mission) : mission}`);
  if (workItem) fmLines.push(`work-item: ${/[^A-Za-z0-9_:.+-]/.test(workItem) ? JSON.stringify(workItem) : workItem}`);
  fmLines.push(`group: ${JSON.stringify(group)}`);
  fmLines.push("verify: [test]");
  if (status === "held" && holdReason) fmLines.push(`hold: ${JSON.stringify(holdReason.v)}`);
  fmLines.push("---");

  // Walk the body: drop consumed/deleted header lines, drop ## Execution Plan
  // wrapper, rewrite phase headings, drop per-phase Status: lines.
  const dropIdx = new Set();
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) { out.push(lines[i]); continue; }
    const l = lines[i];
    if (/^>\s*\*{0,2}(?:[Pp]lan\s+)?[Ss]tatus\*{0,2}\s*:/.test(l)) { continue; }
    if (/^>\s*(?:\*\*)?Mission(?:\*\*)?\s*:/.test(l)) continue;
    if (/^>\s*(?:\*\*)?Work\s+Item(?:\*\*)?\s*:/.test(l)) continue;
    if (/^>\s*(?:\*\*)?Review\s+Hold(?:\*\*)?\s*:/.test(l)) continue;
    if (/^>\s*(?:\*\*)?Last\s+Reviewed(?:\*\*)?\s*:/.test(l)) continue;
    if (/^>\s*(?:\*\*)?Audit(?:\*\*)?\s*:\s*(required|none|not-required)\s*$/i.test(l)) continue;
    if (/^##\s*Execution\s+Plan\s*$/.test(l)) continue;
    if (/^Status:\s*(planned|draft|active|in progress|in-progress|completed|done|pending)\s*$/i.test(l)) continue;
    const pm = l.match(/^#{2,4}\s+(?:Phase|Workstream)\s+(\d+)\s*(?:(?:—|-\s*)\s*(\S.*?))?\s*$/);
    if (pm) {
      out.push(pm[2] ? `## Phase ${pm[1]} — ${pm[2]}` : `## Phase ${pm[1]}`);
      continue;
    }
    out.push(l);
  }

  // Dissolve ## Closure Gates: split block, classify, merge executable tail.
  const outFenced = fenceMask(out);
  let closureGatesStart = -1;
  let closureGatesEnd = -1;
  for (let i = 0; i < out.length; i++) {
    if (outFenced[i]) continue;
    if (/^##\s*Closure\s+Gates\s*$/.test(out[i])) { closureGatesStart = i; break; }
  }
  let afterLines = out;
  if (closureGatesStart !== -1) {
    closureGatesEnd = out.length;
    for (let i = closureGatesStart + 1; i < out.length; i++) {
      if (!outFenced[i] && h2(out[i])) { closureGatesEnd = i; break; }
    }
    const gateItems = [];
    for (let i = closureGatesStart + 1; i < closureGatesEnd; i++) {
      const m = out[i].match(/^- \[([ x])\]\s+(.*)$/);
      if (m && !outFenced[i]) gateItems.push(m[2].trim());
    }
    const executable = gateItems.filter((t) => !gateIsDerived(t));
    if (executable.length > 0) {
      // append merged items to the tail of the LAST phase block
      let lastPhaseEnd = -1;
      const keep = [...out.slice(0, closureGatesStart), ...out.slice(closureGatesEnd)];
      const kf = fenceMask(keep);
      for (let i = 0; i < keep.length; i++) {
        if (kf[i]) continue;
        if (/^##\s+Phase\s+\d+/.test(keep[i])) {
          lastPhaseEnd = keep.length;
          for (let j = i + 1; j < keep.length; j++) {
            if (!kf[j] && h2(keep[j])) { lastPhaseEnd = j; break; }
          }
        }
      }
      if (lastPhaseEnd === -1) throw new Error(`${path}: Closure Gates to merge but no Phase block found`);
      const merged = [
        "",
        "Merged from `## Closure Gates` (ledger migration, 01 §4.3 dissolution):",
        "",
        ...executable.map((t) => `- [ ] ${t}`),
        "",
      ];
      keep.splice(lastPhaseEnd, 0, ...merged);
      afterLines = keep;
    } else {
      afterLines = [...out.slice(0, closureGatesStart), ...out.slice(closureGatesEnd)];
    }
  }

  // Prepend frontmatter (before the H1 title).
  const titleIdx = afterLines.findIndex((l) => /^#\s+/.test(l));
  const insertAt = titleIdx === -1 ? 0 : titleIdx;
  afterLines.splice(insertAt, 0, ...fmLines, "");

  const after = afterLines.join("\n").replace(/\n{3,}/g, "\n\n");
  return { path, before, after, skipped: null };
}

// ── roadmap migration ───────────────────────────────────────────────────────

const WI_STATUS_SUFFIX_LAST = /:\s*`?(todo|ready|planned|done)`?(?=[\s（(→]|$)/g;

function findLastStatusSuffix(line) {
  WI_STATUS_SUFFIX_LAST.lastIndex = 0;
  let last = null;
  let m;
  while ((m = WI_STATUS_SUFFIX_LAST.exec(line)) !== null) last = { ...m, index: m.index, end: m.index + m[0].length, status: m[1] };
  return last;
}

function stripTrailingDoublespace(s) {
  return s.replace(/[ \t]+$/, "");
}

function convertBulletLine(line) {
  // `- <text>: `status`[ trailing]` → `- [x| ] <text>[trailing]`
  const last = findLastStatusSuffix(line);
  if (!last) return null;
  const text = line.slice(0, last.index).replace(/^-\s+/, "").replace(/[ \t]+$/, "");
  const trailing = line.slice(last.end).trim();
  const mark = last.status === "done" ? "x" : " ";
  return `- [${mark}] ${text}${trailing ? " " + trailing : ""}`;
}

function stripCheckboxSuffix(line) {
  // `- [ ] <text>: `ready`` → `- [ ] <text>` (checkbox state kept as-is)
  const last = findLastStatusSuffix(line);
  if (!last) return null;
  const text = line.slice(0, last.index).replace(/[ \t]+$/, "");
  const trailing = line.slice(last.end).trim();
  return `${text}${trailing ? " " + trailing : ""}`;
}

function parseMilestoneTitles(lines, fenced) {
  const titles = new Map();
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i] || !h3(lines[i])) continue;
    const m = lines[i].match(/^###\s+M(\d+)\s*(?:—|-)\s*(\S.*?)\s*$/);
    if (m) titles.set(`M${m[1]}`, m[2]);
  }
  return titles;
}

function migrateRoadmap(path) {
  const before = readFileSync(path, "utf8");
  if (parseFrontmatter(before).range !== null) {
    return { path, before, after: before, skipped: "already-frontmatter" };
  }
  const lines = before.replace(/\r\n?/g, "\n").split("\n");
  const fenced = fenceMask(lines);

  let auditRounds = 0; // no mission roadmap today declares consumed rounds (plan Phase 1 Decision 4)

  const out = [];
  let inTable = false; // inside ## Work Item Status table form
  let tableRows = [];
  const titles = parseMilestoneTitles(lines, fenced);

  const flushTableRows = (insertAtOut) => {
    if (tableRows.length === 0) return insertAtOut;
    const groups = new Map();
    for (const r of tableRows) {
      const key = r.milestone || "M1";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    const block = [];
    for (const [key, rows] of groups) {
      const title = titles.get(key) || "";
      block.push(`### ${key}${title ? " — " + title : ""}`, "");
      for (const r of rows) {
        const extras = [
          r.owner ? `Owner: ${r.owner}` : null,
          r.deps ? `Dependencies: ${r.deps}` : null,
          r.reuse ? `Reuse: ${r.reuse}` : null,
        ].filter(Boolean);
        const mark = r.status === "done" ? "x" : " ";
        block.push(`- [${mark}] ${r.name}${extras.length ? "（" + extras.join("；") + "）" : ""}`);
      }
      block.push("");
    }
    out.push(...block);
    tableRows = [];
    return insertAtOut;
  };

  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) { out.push(lines[i]); continue; }
    const l = lines[i];

    // table form inside ## Work Item Status
    if (inTable) {
      if (l.startsWith("|")) {
        const cells = l.split("|").map((c) => c.trim());
        if (/^work\s*item$/i.test(cells[1] || "")) continue; // header row → dropped, table mode continues
        if (/^[-: ]+$/.test(l.replace(/\|/g, ""))) continue; // separator row → dropped
        if (cells.length >= 4 && /^(todo|ready|planned|done)$/i.test(cells[2].replace(/`/g, "")) && cells[1]) {
          const mm = cells[1].match(/^(M\d+)\/(WI\d+)\s+(.*)$/);
          tableRows.push({
            milestone: mm ? mm[1] : null,
            name: mm ? `${mm[2]} ${mm[3]}` : cells[1],
            status: cells[2].replace(/`/g, "").toLowerCase(),
            owner: cells[3] || null,
            deps: cells[4] || null,
            reuse: cells[5] || null,
          });
          continue;
        }
        // unknown row → stop table mode
        flushTableRows(out.length);
        inTable = false;
        out.push(l);
        continue;
      }
      if (l.trim() === "") { out.push(l); continue; }
      flushTableRows(out.length);
      inTable = false;
      out.push(l);
      continue;
    }
    if (/^##\s*Work\s+Item\s+Status\s*$/i.test(l)) {
      out.push(l);
      inTable = true;
      continue;
    }

    // checkbox + suffix → strip suffix
    let m;
    if ((m = l.match(/^- \[([ x])\]\s+/))) {
      const stripped = stripCheckboxSuffix(l);
      out.push(stripped !== null ? stripTrailingDoublespace(stripped) : l);
      continue;
    }
    // milestone subhead
    if (h3(l) && /^###\s+M\d+/.test(l)) {
      out.push(l);
      continue;
    }
    // bullet + status suffix → checkbox
    if (/^-\s+\S/.test(l) && !/^-\s+★/.test(l) && !/^-\s+\*\*/.test(l)) {
      const converted = convertBulletLine(l);
      out.push(converted !== null ? converted : l);
      continue;
    }
    out.push(l);
  }
  flushTableRows(out.length);

  // Flat converted checkboxes without any ### M block → wrap in a synthetic
  // milestone so the checkboxes land inside the counting domain.
  const outFenced2 = fenceMask(out);
  const hasMBlock = out.some((l, i) => !outFenced2[i] && h3(l) && /^###\s+M\d+/.test(l));
  if (!hasMBlock) {
    const firstCheckbox = out.findIndex((l, i) => !outFenced2[i] && /^- \[[ x]\]/.test(l));
    if (firstCheckbox !== -1) {
      out.splice(firstCheckbox, 0, "### M1 — Work Items", "");
    }
  }

  const fm = ["---", `audit-rounds: ${auditRounds}`, "---", ""];
  const after = [...fm, ...out].join("\n").replace(/\n{3,}/g, "\n\n");
  return { path, before, after, skipped: null };
}

// ── validation of migration products (0635-2 structure scanners) ───────────

function validatePlanProduct(path, text) {
  const scan = scanPlanLedger(text);
  const errs = [...scan.errors.map((e) => `line ${e.line}: ${e.message}`)];
  if (scan.fmError) errs.push(`frontmatter: ${scan.fmError}`);
  if (scan.phases.length === 0) errs.push("no `## Phase <n>` sections found");
  return errs;
}

function validateRoadmapProduct(path, text) {
  const scan = scanRoadmapLedger(text);
  const errs = [...scan.errors.map((e) => `line ${e.line}: ${e.message}`)];
  if (scan.fmError) errs.push(`frontmatter: ${scan.fmError}`);
  if (scan.counts.total === 0) errs.push("no checkbox Work Items found");
  return errs;
}

// ── discovery + main ────────────────────────────────────────────────────────

function walkMd(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(full));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function discoverRoadmaps() {
  const missionsDir = join(REPO_ROOT, "missions");
  const paths = new Set();
  for (const f of readdirSync(missionsDir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const cfg = JSON.parse(readFileSync(join(missionsDir, f), "utf8"));
      if (typeof cfg.roadmapPath === "string" && cfg.roadmapPath) {
        const abs = resolve(REPO_ROOT, cfg.roadmapPath);
        if (existsSync(abs)) paths.add(abs);
      }
    } catch { /* malformed mission config is not this codemod's problem */ }
  }
  return [...paths].sort();
}

function report(results, kind, validator) {
  let changed = 0;
  for (const r of results) {
    const rel = relative(REPO_ROOT, r.path);
    if (r.skipped) {
      console.log(`  = ${rel} (${r.skipped})`);
      continue;
    }
    if (r.before === r.after) {
      console.log(`  = ${rel} (idempotent no-op)`);
      continue;
    }
    const errs = validator(r.path, r.after);
    if (errs.length > 0) {
      console.error(`  ✗ ${rel} FAILED structure validation:`);
      for (const e of errs) console.error(`      ${e}`);
      process.exitCode = 1;
      continue;
    }
    changed++;
    if (DRY) {
      console.log(unifiedDiff(rel, r.before, r.after));
      console.log("");
    } else {
      writeFileSync(r.path, r.after, "utf8");
      console.log(`  ✓ ${rel} migrated`);
    }
  }
  console.log(`${kind}: ${changed} file(s) ${DRY ? "would change" : "migrated"}`);
}

const doPlans = SCOPE === "all" || SCOPE === "plans";
const doRoadmaps = SCOPE === "all" || SCOPE === "roadmaps";

if (doPlans) {
  console.log(`== plans (non-terminal legacy only) ${DRY ? "[dry-run]" : ""} ==`);
  const planFiles = walkMd(join(REPO_ROOT, "docs", "plans")).sort();
  report(planFiles.map(migratePlan), "plans", validatePlanProduct);
}
if (doRoadmaps) {
  console.log(`== roadmaps (missions/*.json roadmapPath set) ${DRY ? "[dry-run]" : ""} ==`);
  report(discoverRoadmaps().map(migrateRoadmap), "roadmaps", validateRoadmapProduct);
}
