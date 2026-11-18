#!/usr/bin/env node
// tools/plan-status.mjs — plan frontmatter status tool + roadmap completion counter.
//
// Zero-install deps: YAML parsing uses the vendored single-file library
// tools/vendor/js-yaml.mjs (js-yaml 4.1.1, MIT — reuse this file for any
// tool that needs YAML; do not add npm dependencies).
//
// Interfaces (receipt/payload delivery semantics: roadmap-goal-execution.md):
//
//   node tools/plan-status.mjs <plan.md> <status> [--hold "reason"] [--force]
//       Validate and rewrite a plan's frontmatter `status` field.
//       Legal transitions enforced; `completed` is derived and can NEVER be
//       written (docs/guides/plan-authoring-and-execution.md).
//         held        → requires --hold "reason" (writes hold:)
//         active      → from held removes the hold: line
//         cancelled | superseded | deferred → terminal states; leaving them
//                       requires --force (restart = a new plan)
//       Legacy human-facing writer. AI task edits use built-in Edit/Write tools.
//       Activation requires a paired accepted draft review.
//
//   node tools/plan-status.mjs --list [plansDir]
//       Inventory every plan under docs/plans/: status, mission, work-item, path.
//
//   node tools/plan-status.mjs --check <plan.md>
//       Receipt integrity + independence gate for a plan: an active plan must
//       carry a draft-review dispatch + iteration receipt pair; a Closure section
//       with a dispatch must carry an accepted line, and the closure-audit
//       session MUST differ from draft reviewer and recorded executor.
//       Shows deliveryReady separately; receipt success alone is not delivery.
//   --unfinished [plansDir]       read-only unfinished consumer-plan query
//   --roadmap <roadmap.md>        checkbox count + remaining lines

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "./vendor/js-yaml.mjs";
import { interpretPlan } from "./consumer-ledger.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = process.env.AGE_REPO_ROOT
  ? process.env.AGE_REPO_ROOT
  : join(__dirname, "..");

const WRITABLE = ["draft", "active", "held", "cancelled", "superseded", "deferred"];
const TERMINAL = ["cancelled", "superseded", "deferred"];

// Parse the `--- ... ---` frontmatter block. Returns the raw block text (for
// surgical line-level writes), the parsed object (library-parsed YAML), and
// the body offset.
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { fmText: null, data: null, bodyStart: 0 };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { fmText: null, data: null, bodyStart: 0 };
  const fmText = content.slice(4, end);
  let data = null;
  try {
    data = yamlLoad(fmText);
  } catch (err) {
    return { fmText, data: null, bodyStart: end, error: err.message };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { fmText, data: null, bodyStart: end, error: "frontmatter is not a flat key map" };
  }
  return { fmText, data, bodyStart: end };
}

function cmdSet(planPath, newStatus, hold, force) {
  if (!WRITABLE.includes(newStatus)) {
    console.error(`ERROR: '${newStatus}' is not a writable status.`);
    console.error(`Writable: ${WRITABLE.join(" | ")}. 'completed' is DERIVED — never written.`);
    process.exit(2);
  }
  let content;
  try {
    content = readFileSync(planPath, "utf8");
  } catch {
    console.error("ERROR: cannot read plan:", planPath);
    process.exit(2);
  }
  const { fmText, data, bodyStart, error } = parseFrontmatter(content);
  if (fmText === null) {
    console.error("ERROR: no YAML frontmatter block — not a ledger-format plan.");
    process.exit(2);
  }
  if (error) {
    console.error("ERROR: frontmatter YAML is invalid (parser: vendored js-yaml):", error);
    process.exit(2);
  }
  const current = typeof data.status === "string" ? data.status : null;
  if (!current) {
    console.error("ERROR: frontmatter has no string `status` field.");
    process.exit(2);
  }
  if ([...TERMINAL, "completed"].includes(current) && !force) {
    console.error(`DENY: '${current}' is terminal — a terminal plan never revives; restarting = a new plan.`);
    console.error("      (override with --force only with an explicit human decision)");
    process.exit(1);
  }
  if (newStatus === "held" && !hold) {
    console.error("DENY: held requires a reason — rerun with --hold \"<reason>\".");
    process.exit(1);
  }
  if (newStatus === "active" && !interpretPlan(content).review.accepted) {
    console.error("DENY: activation requires latest paired accepted draft review.");
    process.exit(1);
  }
  // Surgical line-level write-back (diff-minimal; the rest of the block is untouched).
  let nextFm = /^status:/m.test(fmText)
    ? fmText.replace(/^status:.*$/m, `status: ${newStatus}`)
    : `status: ${newStatus}\n${fmText}`;
  if (/^hold:/m.test(nextFm)) {
    nextFm = newStatus === "held"
      ? nextFm.replace(/^hold:.*$/m, `hold: ${JSON.stringify(hold)}`)
      : nextFm.replace(/^hold:.*\n?/m, "");
  } else if (newStatus === "held") {
    nextFm += `\nhold: ${JSON.stringify(hold)}`;
  }
  writeFileSync(planPath, `---\n${nextFm}${content.slice(bodyStart)}`);
  console.log(`ok: ${relative(REPO_ROOT, planPath).split("\\").join("/")} :: ${current} → ${newStatus}${newStatus === "held" ? ` (hold: ${hold})` : ""}`);
}

function collectPlans(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectPlans(p, out);
    else if (name.endsWith(".md") && name !== "README.md" && name !== "index.md") out.push(p);
  }
  return out;
}

function cmdList(rootArg, unfinished = false) {
  const plansDir = rootArg ? rootArg : join(REPO_ROOT, "docs", "plans");
  let plans;
  try {
    plans = collectPlans(plansDir, []);
  } catch {
    console.error("ERROR: no plans directory at", plansDir);
    process.exit(2);
  }
  const byStatus = new Map();
  const rows = [];
  for (const p of plans) {
    let content;
    try { content = readFileSync(p, "utf8"); } catch { continue; }
    const { data, error } = parseFrontmatter(content);
    if (error) {
      rows.push({ status: "(invalid-yaml)", mission: "—", workItem: "—", path: relative(REPO_ROOT, p).split("\\").join("/") });
      continue;
    }
    if (!data) continue;
    const status = typeof data.status === "string" ? data.status : "(legacy/none)";
    const mission = typeof data.mission === "string" ? data.mission : "—";
    const workItem = typeof data["work-item"] === "string" ? data["work-item"] : "—";
    const ledger = interpretPlan(content);
    if (unfinished && (ledger.deliveryReady || ["completed", ...TERMINAL].includes(status))) continue;
    rows.push({ status, mission, workItem, ready: ledger.deliveryReady, path: relative(REPO_ROOT, p).split("\\").join("/") });
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
  }
  rows.sort((x, y) => x.path.localeCompare(y.path));
  for (const r of rows) console.log(`raw=${r.status.padEnd(14)} deliveryReady=${!!r.ready} ${r.mission.padEnd(26)} ${r.workItem.padEnd(12)} ${r.path}`);
  console.log(`\n${rows.length} plan(s): ${[...byStatus.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log("Consumer delivery eligibility is derived; historical records are not automatically queued. Git payload acceptance is a separate delivery check.");
}

function cmdRoadmap(roadmapPath) {
  let content;
  try {
    content = readFileSync(roadmapPath, "utf8");
  } catch {
    console.error("ERROR: cannot read roadmap:", roadmapPath);
    process.exit(2);
  }
  const lines = content.split(/\r?\n/);
  let inFence = false;
  const open = [];
  let done = 0;
  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    if (/^- \[x\]/.test(line)) done++;
    else if (/^- \[ \]/.test(line)) open.push(line.replace(/^- \[ \]\s*/, "").trim());
  }
  const total = open.length + done;
  const pct = total ? Math.round((done / total) * 100) : 0;
  console.log(`roadmap: ${relative(REPO_ROOT, roadmapPath).split("\\").join("/")}`);
  console.log(`work items: ${done}/${total} done (${pct}%)${open.length === 0 && total > 0 ? " — ALL COMPLETE (run the completion summary per docs/guides/roadmap-authoring.md)" : ""}`);
  if (open.length) {
    console.log("remaining:");
    for (const o of open) console.log(`  - [ ] ${o}`);
  }
}

function cmdCheck(planPath) {
  let content;
  try {
    content = readFileSync(planPath, "utf8");
  } catch {
    console.error("ERROR: cannot read plan:", planPath);
    process.exit(2);
  }
  const ledger = interpretPlan(content);
  console.log(`receipt check: ${relative(REPO_ROOT, planPath)} rawStatus=${ledger.rawStatus}`);
  console.log(`receipt integrity: ${ledger.receiptIntegrity ? "PASS" : "FAIL"}`);
  for (const reason of ledger.receiptReasons) console.log(`  FAIL: ${reason}`);
  console.log(ledger.deliveryReady ? "delivery-ready (Git payload check still required)" : "not delivery-ready");
  for (const reason of ledger.reasons) console.log(`  ${reason}`);
  for (const note of ledger.compatibility) console.log(`  note: ${note}`);
  if (!ledger.receiptIntegrity || ledger.structural.length) process.exitCode = 1;
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--check") {
    if (!args[1]) { console.error("usage: plan-status.mjs --check <plan.md>"); process.exit(2); }
    return cmdCheck(args[1]);
  }
  if (args[0] === "--list") return cmdList(args[1]);
  if (args[0] === "--unfinished") return cmdList(args[1], true);
  if (args[0] === "--roadmap") {
    if (!args[1]) { console.error("usage: plan-status.mjs --roadmap <roadmap.md>"); process.exit(2); }
    return cmdRoadmap(args[1]);
  }
  const [planPath, newStatus] = args;
  if (!planPath || !newStatus) {
    console.error("usage:");
    console.error("  plan-status.mjs <plan.md> <status> [--hold \"reason\"] [--force]");
    console.error("  plan-status.mjs --list [plansDir]");
    console.error("  plan-status.mjs --unfinished [plansDir]");
    console.error("  plan-status.mjs --check <plan.md>");
    console.error("  plan-status.mjs --roadmap <roadmap.md>");
    console.error(`statuses: ${WRITABLE.join(" | ")} (completed is derived — never written)`);
    process.exit(2);
  }
  const holdIdx = args.indexOf("--hold");
  const hold = holdIdx !== -1 ? args[holdIdx + 1] : null;
  const force = args.includes("--force");
  return cmdSet(planPath, newStatus, hold, force);
}

main();
