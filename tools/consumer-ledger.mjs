// Standalone, read-only consumer interpretation. Never imports the optional engine.
import { load } from "./vendor/js-yaml.mjs";

export const TERMINAL = ["cancelled", "superseded", "deferred"];
const STATUSES = ["draft", "active", "held", "completed", ...TERMINAL];
const ID = "#(?:review|audit)-[A-Za-z0-9_-]+-\\d+-[a-f0-9]{8}";
const actor = (s) => typeof s === "string" && /^[A-Za-z0-9_-]+$/.test(s) && !/^(unknown|pending|none|null|executor|reviewer|auditor)$/i.test(s);

export function scanDocument(text) {
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const errors = [];
  let fm = {}, bodyStart = 0;
  if (lines[0] !== "---" || lines.indexOf("---", 1) < 0) errors.push("missing frontmatter");
  else {
    bodyStart = lines.indexOf("---", 1) + 1;
    const yaml = lines.slice(1, bodyStart - 1);
    try {
      fm = load(yaml.join("\n"));
      if (!fm || typeof fm !== "object" || Array.isArray(fm) || yaml.some((line) => line.trim() && !line.startsWith("#") && !/^[\w-]+:\s*[^|>&*!{]/.test(line)) ||
          Object.values(fm).some((v) => v && typeof v === "object" && (!Array.isArray(v) || v.some((x) => typeof x !== "string")))) throw Error("use flat scalars and flow string arrays");
    } catch (e) { errors.push(`invalid frontmatter: ${e.message}`); fm = {}; }
  }
  const rows = [];
  const sections = new Map();
  let fence = null, section = "";
  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i];
    const mark = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (mark && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2].trim()) fence = null;
      continue;
    }
    if (mark) { fence = mark[1]; continue; }
    const h = line.match(/^## (.+?)\s*$/);
    if (h) {
      section = h[1];
      if (sections.has(section)) errors.push(`duplicate section: ${section}`);
      sections.set(section, []);
    } else {
      const row = { line, index: i, section };
      rows.push(row);
      sections.get(section)?.push(row);
    }
  }
  if (fence) errors.push("unclosed code fence");
  return { lines, fm, rows, sections, errors };
}

function receipts(rows, kind) {
  const errors = [];
  const dispatches = [], conclusions = [];
  for (const { line, index } of rows) {
    if (line.startsWith("- dispatch ")) {
      const m = line.match(new RegExp(`^- dispatch ${kind} (${ID}) to ([A-Za-z0-9_-]+)(?: models=\\{[^}]+\\})?$`));
      if (!m || !m[1].startsWith(`#${kind}-`) || !actor(m[2])) errors.push(`malformed ${kind} dispatch`);
      else dispatches.push({ id: m[1], session: m[2], index });
    } else if (kind === "review" && /^- .*iteration/.test(line)) {
      const m = line.match(new RegExp(`^- \\d{4}-\\d{2}-\\d{2}[：:]\\s*iteration \\d+[，,]\\s*共识 (.+?) (${ID})\\s*$`));
      if (!m || !m[2].startsWith("#review-")) errors.push("malformed review conclusion");
      else conclusions.push({ id: m[2], verdict: m[1].trim().toLowerCase(), index });
    } else if (kind === "audit" && /^- (accepted|rejected) /.test(line)) {
      const m = line.match(new RegExp(`^- (accepted|rejected) (${ID})(?:[：:]|\\s|$)(.*)$`));
      if (!m || !m[2].startsWith("#audit-") || /\bfindings=/.test(line)) errors.push("malformed plan audit conclusion");
      else conclusions.push({ id: m[2], verdict: m[1], text: line, index });
    }
  }
  for (const c of conclusions) if (!dispatches.some((d) => d.id === c.id && d.index < c.index)) errors.push(`unpaired ${kind} conclusion: ${c.id}`);
  const latest = dispatches.at(-1);
  const conclusion = latest && conclusions.filter((c) => c.id === latest.id && c.index > latest.index).at(-1);
  if (new Set(dispatches.map((d) => d.id)).size !== dispatches.length) errors.push(`duplicate ${kind} dispatch id`);
  const accepted = !!conclusion && (kind === "review" ? ["pass", "passes draft review", "approved", "accepted"].includes(conclusion.verdict) : conclusion.verdict === "accepted");
  if (latest && !accepted) errors.push(`latest ${kind} dispatch is pending or rejected`);
  return { latest, conclusion, accepted: accepted && !errors.length, errors };
}

export function interpretPlan(text) {
  const doc = scanDocument(text);
  const { fm, rows, sections } = doc;
  const structural = [...doc.errors];
  const rawStatus = typeof fm.status === "string" ? fm.status : "(missing)";
  if (!STATUSES.includes(rawStatus)) structural.push("invalid status");
  for (const key of ["mission", "work-item"]) if (typeof fm[key] !== "string" || !fm[key].trim()) structural.push(`missing ${key} (standalone: mission=standalone, work-item=local:<task-id>)`);
  const phases = [...sections.keys()].filter((s) => /^Phase [1-9]\d*(?:\s*(?:—|-)\s*\S.*)?$/.test(s));
  if (phases.length < 2 || phases.length > 6) structural.push("require 2–6 valid Phase sections");
  let total = 0, checked = 0;
  const phaseCounts = new Map(phases.map((p) => [p, 0]));
  for (const { line, section } of rows) {
    if (!/^\s*- \[/.test(line)) continue;
    if (!/^- \[[ x]\]\s+\S/.test(line) || (!phases.includes(section) && section !== "Closure Findings")) {
      structural.push(`misplaced or malformed checkbox in ${section || "preamble"}`); continue;
    }
    total++;
    if (line.startsWith("- [x]")) checked++;
    if (phaseCounts.has(section)) phaseCounts.set(section, phaseCounts.get(section) + 1);
  }
  if ([...phaseCounts.values()].some((n) => n === 0) || total === 0) structural.push("empty Phase counting domain");
  const review = receipts(sections.get("Draft Review Record") || [], "review");
  const audit = receipts(sections.get("Closure") || [], "audit");
  const executors = (sections.get("Execution") || []).map(({ line }) => line.match(/^- Executor: ([A-Za-z0-9_-]+)$/)?.[1]).filter(Boolean);
  const executor = executors.length === 1 && actor(executors[0]) ? executors[0] : null;
  const receiptReasons = [...doc.errors, ...review.errors, ...audit.errors];
  if (["active", "completed"].includes(rawStatus) && !review.accepted) receiptReasons.push("active/completed requires accepted draft review");
  if (audit.latest) {
    if (!review.latest || !executor) receiptReasons.push("closure requires known reviewer and executor from Execution record");
    if (audit.latest.session === review.latest?.session) receiptReasons.push("auditor must differ from reviewer");
    if (audit.latest.session === executor) receiptReasons.push("auditor must differ from executor");
  }
  const verify = fm.verify;
  const verifyValid = Array.isArray(verify) && verify.length > 0 && verify.every((k) => typeof k === "string" && /^[A-Za-z][A-Za-z0-9:_-]*$/.test(k)) && new Set(verify).size === verify.length;
  const passes = new Map();
  for (const { line } of sections.get("Verification") || []) {
    const m = line.match(/^\s*- pass ([A-Za-z][A-Za-z0-9:_-]*) (\S+) exit=(\d+)(?: payload=([a-f0-9]{64}))?\s*$/);
    if (m) passes.set(m[1], { runId: m[2], exit: Number(m[3]), payload: m[4] });
    else if (/^\s*- pass /.test(line)) structural.push("malformed verification pass line");
  }
  const reasons = [...structural, ...receiptReasons];
  if (!["active", "completed"].includes(rawStatus)) reasons.push(`status ${rawStatus} is not deliverable`);
  if (total === 0 || total !== checked) reasons.push("unfinished counting domain");
  if (!verifyValid) reasons.push("explicit nonempty verify keys required (no mission defaults)");
  else for (const key of verify) if (passes.get(key)?.exit !== 0) reasons.push(`missing/latest failing verification: ${key}`);
  if (!audit.accepted) reasons.push("independent closure acceptance required");
  if (!executor) reasons.push("executor identity missing or ambiguous");
  const compatibility = ["Consumer deliveryReady is a read-only proof gate, not engine lifecycle parity; text actors are not authenticated."];
  if (rawStatus === "completed") compatibility.push("Historical explicit completed is not proof; do not reopen or enqueue historical records automatically.");
  if (!verifyValid) compatibility.push("Engine mission-default verification shortcuts are not consumer delivery proof.");
  return { rawStatus, fm, structural, receiptIntegrity: receiptReasons.length === 0, receiptReasons: [...new Set(receiptReasons)], deliveryReady: reasons.length === 0,
    reasons: [...new Set(reasons)], compatibility, review, audit, executor, passes, total, checked, doc };
}
