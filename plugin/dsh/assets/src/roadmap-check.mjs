/**
 * roadmap-check.mjs — shared roadmap "Work Item Status" / "阶段状态" parser.
 *
 * Extracted from monitor.js so BOTH the Monitor Server (roadmap progress API)
 * and the FlowEngine (terminal reconciliation, §1.4-4) parse the roadmap with
 * ONE implementation — no regex drift between the two consumers.
 *
 * Dual-read (age-autonomy M1-WI7, plan 0635-3): when the roadmap carries
 * frontmatter (`audit-rounds`) AND checkbox Work Items under `### M<n>` blocks,
 * the checkbox channel wins (01 §3.2 — checked = done, unchecked = todo;
 * counting/reconciliation/UI share this one channel). Otherwise it falls back
 * to the legacy block parser, unchanged:
 *  - Current guide (00-roadmap-authoring-guide.md): "## Work Item Status" with
 *    a markdown table (| Work Item | Status | … |) or bullet list.
 *  - Legacy: "## 阶段状态" with numbered bullets and ★ milestone markers.
 * Env breaker MISSION_DRIVER_LEDGER = auto | legacy | frontmatter applies with
 * the same semantics as the plan surfaces (ledger-dualread.mjs).
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ledgerReadMode } from "./ledger-dualread.mjs";
import { splitLedgerSections, MILESTONE_HEADING_RE, UNCHECKED_RE, CHECKED_RE } from "./ledger-sections.mjs";
import { validateRoadmapFrontmatter } from "./ledger-frontmatter.mjs";

const VALID_STATUSES = new Set(["todo", "ready", "planned", "done"]);

// Block header: legacy "## 阶段状态" or current "## Work Item Status".
const BLOCK_HEADER_RE = /^##\s*(?:阶段状态|Work\s+Item\s+Status)/i;

// Bullet work item:
//   Legacy:  - 1. 名称（描述）：`done`（trailing 括注）
//   Guide:   - 名称: `todo`   /   - 名称：`ready`
// Numeric prefix optional; ASCII/fullwidth colon; ready added.
const BULLET_RE = /^-\s+(?:(\d+)\.\s+)?(.+?)\s*[：:]\s*`?(todo|ready|planned|done)`?(?:\s*[（(][^)）]*[)）])?\s*$/;
// Milestone:  - ★ **里程碑：名称**（...）：未达成 | 已达成 | done
// Bilingual keyword: Chinese 里程碑 (legacy) or English Milestone (skill examples).
// Status accepts Chinese (未达成/已达成) or English (todo/planned/done); non-done
// English statuses normalize to "not-done" (milestones are derived: not-yet-reached
// or done — never todo/planned as independent states).
const MILE_RE = /^-\s+★\s+\*\*(?:里程碑|Milestone)[：:]\s*(.+?)\*\*.+?[：:]\s*`?(未达成|已达成|done|todo|planned)`?\s*$/;

// Markdown table row: | name | status | … |
// Header ("Work Item") and separator ("---") rows are filtered by the status check.
function tryParseTableRow(line) {
  if (!line.startsWith("|")) return null;
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length < 4) return null;
  const name = cells[1];
  const status = cells[2].replace(/^`|`$/g, "");
  if (!VALID_STATUSES.has(status)) return null;
  if (!name || /^[-:]+$/.test(name)) return null;
  if (/^work\s*item$/i.test(name)) return null;
  return { seq: null, name, status, isMilestone: false };
}

function legacyParse(content) {
  const phases = [];
  const lines = content.split("\n");
  let inBlock = false;
  let blockEnded = false;

  for (const line of lines) {
    if (/^##\s/.test(line)) {
      if (inBlock) blockEnded = true; // next ## ends the block
      if (BLOCK_HEADER_RE.test(line)) {
        inBlock = true;
        blockEnded = false;
      }
      continue;
    }
    if (!inBlock || blockEnded) continue;

    const tp = tryParseTableRow(line);
    if (tp) {
      phases.push(tp);
      continue;
    }
    // Milestone checked before bullet so ★ lines with a valid status token
    // (e.g. `done`) are classified as milestones, not work items.
    const mm = line.match(MILE_RE);
    if (mm) {
      let st = mm[2];
      if (st === "已达成" || st === "done") st = "done";
      else st = "not-done"; // 未达成 / todo / planned → milestone not yet reached
      phases.push({ seq: null, name: "★ " + mm[1].trim(), status: st, isMilestone: true });
      continue;
    }
    const im = line.match(BULLET_RE);
    if (im) {
      phases.push({
        seq: im[1] ? Number(im[1]) : null,
        name: im[2].trim(),
        status: im[3],
        isMilestone: false,
      });
    }
  }
  return phases;
}

// New-format channel (01 §3.2): checkbox Work Items under `### M<n> — <title>`
// milestone blocks, column 0, fences skipped. checked ⇒ done, unchecked ⇒ todo.
function checkboxParse(split) {
  const phases = [];
  for (const block of split.blocks) {
    if (block.level !== 3) continue;
    const mm = block.text.match(MILESTONE_HEADING_RE);
    if (!mm) continue;
    for (let i = block.bodyStart; i < block.bodyEnd; i++) {
      if (split.fenced[i]) continue;
      const line = split.lines[i];
      if (!UNCHECKED_RE.test(line) && !CHECKED_RE.test(line)) continue;
      const name = line.replace(/^- \[[ x]\]\s*/, "").trim();
      phases.push({
        seq: null,
        name,
        status: CHECKED_RE.test(line) ? "done" : "todo",
        isMilestone: false,
        milestone: `M${mm[1]}`,
      });
    }
  }
  return phases;
}

function withProgress(phases) {
  // overallProgress counts only work items (milestones excluded from denominator).
  const items = phases.filter((p) => !p.isMilestone);
  const done = items.filter((p) => p.status === "done").length;
  const overallProgress = items.length > 0 ? Math.round((done / items.length) * 100) / 100 : 0;
  return { phases, overallProgress };
}

export function parseRoadmapMarkdown(content) {
  const mode = ledgerReadMode();
  let checkboxPhases = null;
  // M2-WI42: roadmap field-set validation rides the ONE roadmap parse point —
  // monitor handleGetRoadmap and engine reconciliation share this function, so
  // violations surface on every read face (never re-validated per consumer).
  let fieldErrors = [];

  if (mode !== "legacy") {
    const split = splitLedgerSections(content);
    const hasFm = split.hasFrontmatter && split.fmError === null;
    if (hasFm) {
      fieldErrors = validateRoadmapFrontmatter(split.fm).errors;
      checkboxPhases = checkboxParse(split);
      if (mode === "frontmatter") return { ...withProgress(checkboxPhases), fieldErrors };
    } else if (mode === "frontmatter") {
      return { ...withProgress([]), fieldErrors };
    }
  }
  if (checkboxPhases !== null && checkboxPhases.length > 0) {
    return { ...withProgress(checkboxPhases), fieldErrors };
  }
  return { ...withProgress(legacyParse(content)), fieldErrors };
}

/**
 * True iff the roadmap has at least one work item AND every work item is `done`.
 * Milestones are advisory and excluded from the completeness test (they mirror
 * the authoring guide's denominator rule). Used by terminal reconciliation.
 * Dual-read: checkbox Work Items win for frontmatter roadmaps (all checked ⇒
 * done); legacy suffix/table roadmaps keep the legacy derivation.
 */
export function roadmapAllDone(content) {
  const { phases } = parseRoadmapMarkdown(content);
  const items = phases.filter((p) => !p.isMilestone);
  return items.length > 0 && items.every((p) => p.status === "done");
}

// CLI entrypoint (M2-WI42): node roadmap-check.mjs <roadmap.md>
// Mirrors plan-check.mjs's CLI conventions (pathToFileURL guard — the naive
// `file://${process.argv[1]}` concatenation never compares equal on Windows,
// see plan-check O6 — JSON output, exit 0/1). Fails on field-set violations
// (fieldErrors from validateRoadmapFrontmatter via parseRoadmapMarkdown).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: roadmap-check.mjs <roadmap.md>");
    process.exit(2);
  }
  const content = readFileSync(file, "utf8");
  const res = parseRoadmapMarkdown(content);
  const passed = res.fieldErrors.length === 0;
  console.log(JSON.stringify({ file, passed, fieldErrors: res.fieldErrors, phases: res.phases, overallProgress: res.overallProgress }, null, 2));
  process.exit(passed ? 0 : 1);
}
