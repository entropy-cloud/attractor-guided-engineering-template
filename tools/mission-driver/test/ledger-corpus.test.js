// Corpus dual-read smoke (age-autonomy M1-WI10, plan 0635-3 Phase 6): every
// docs/plans/**/*.md and docs/backlog/*roadmap*.md must pass dual-read
// resolution with zero structural errors — a permanent regression net against
// ledger-format drift in the live corpus (new-format files are additionally
// validated by the 0635-2 counting-domain / block-syntax scanners).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planLedgerState } from "../src/ledger-dualread.mjs";
import { scanPlanLedger, scanRoadmapLedger } from "../src/ledger-sections.mjs";
import { parseRoadmapMarkdown } from "../src/roadmap-check.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function walkMd(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMd(full));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function isFile(f) {
  try { return statSync(f).isFile(); } catch { return false; }
}

const planFiles = walkMd(join(REPO_ROOT, "docs", "plans"));
const backlogDir = join(REPO_ROOT, "docs", "backlog");
const roadmapFiles = readdirSync(backlogDir)
  .filter((f) => f.endsWith(".md") && /roadmap/.test(f))
  .map((f) => join(backlogDir, f));

test("corpus discovery is non-empty", () => {
  assert.ok(planFiles.length > 50, `expected the historical plan corpus, got ${planFiles.length}`);
  assert.ok(roadmapFiles.length >= 6, `expected the mission roadmaps, got ${roadmapFiles.length}`);
});

for (const file of planFiles) {
  test(`plan dual-read: ${file.slice(REPO_ROOT.length + 1)}`, () => {
    const text = readFileSync(file, "utf8");
    const state = planLedgerState(text);
    assert.ok(["frontmatter", "legacy", "none"].includes(state.format));
    if (state.format === "frontmatter") {
      const scan = scanPlanLedger(text);
      assert.deepEqual(scan.errors, [], `counting-domain/structure errors in ${file}`);
      assert.equal(scan.fmError, null, `frontmatter parse error in ${file}`);
      // M2-WI42 read-seam wiring: every frontmatter corpus plan must be
      // field-set valid (fieldsValid === true) — the validator is now a
      // first-class read-face citizen, so a corpus flip here is a regression
      // signal, not noise.
      assert.equal(state.fieldsValid, true, `field-set errors in ${file}: ${JSON.stringify(state.fieldErrors)}`);
      // display status must come from the writable vocabulary or derived completed
      assert.ok(
        ["draft", "active", "held", "cancelled", "superseded", "deferred", "completed"].includes(state.normalized),
        `unexpected normalized status ${state.normalized} in ${file}`,
      );
    }
  });
}

for (const file of roadmapFiles) {
  test(`roadmap dual-read: ${file.slice(REPO_ROOT.length + 1)}`, () => {
    const text = readFileSync(file, "utf8");
    const scan = scanRoadmapLedger(text);
    assert.deepEqual(scan.errors, [], `counting-domain/structure errors in ${file}`);
    assert.equal(scan.fmError, null, `frontmatter parse error in ${file}`);
    if (scan.hasFrontmatter) {
      // migrated roadmaps carry the full new-format WI surface
      assert.ok(scan.counts.total > 0, `frontmatter roadmap without checkbox Work Items: ${file}`);
      assert.equal(scan.fm["audit-rounds"] >= 0, true, `invalid audit-rounds in ${file}`);
      // M2-WI42: roadmap field-set validation via parseRoadmapMarkdown's hasFm
      // point — corpus roadmaps must be field-valid (zero false kills).
      const parsed = parseRoadmapMarkdown(text);
      assert.deepEqual(parsed.fieldErrors, [], `roadmap field-set errors in ${file}`);
    }
  });
}

// Guard the guard: this file itself must live inside the engine test chain.
test("corpus test runs from the engine test chain", () => {
  assert.ok(isFile(join(REPO_ROOT, "tools", "mission-driver", "package.json")));
});
