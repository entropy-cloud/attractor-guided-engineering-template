#!/usr/bin/env node
// Cooperative local delivery helper; reads task documents, never rewrites them.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { pathToFileURL } from "node:url";
import { interpretPlan, scanDocument } from "./consumer-ledger.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function git(root, args, input, allowFailure = false) {
  const r = spawnSync("git", args, { cwd: root, input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (r.error || (r.status !== 0 && !allowFailure)) throw Error(`git ${args[0]} failed: ${r.error?.message || r.stderr || r.stdout}`);
  return r;
}
const names = (s) => s.split("\0").filter(Boolean).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function safePath(root, path) {
  if (typeof path !== "string" || !path || path.startsWith("-") || /[\\:*?\[\]\x00-\x1f]/.test(path) || path.split("/").some((s) => !s || s === "." || s === "..")) throw Error(`unsafe explicit path: ${path}`);
  if (/^(?:[A-Za-z]:|\/)/.test(path) || /(^|\/)(?:\.git|_tmp|tmp|node_modules)(\/|$)/i.test(path) || /(^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12)|credentials(?:\..*)?|secrets?(?:\..*)?|hs_err_pid.*)$/i.test(path)) throw Error(`secret/scratch or unsafe path: ${path}`);
  const full = resolve(root, path);
  if (relative(root, full).startsWith("..")) throw Error(`out-of-repo path: ${path}`);
  let cursor = root;
  for (const part of path.split("/")) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw Error(`symlink path: ${path}`);
  }
  if (git(root, ["check-ignore", "--no-index", "--", path], undefined, true).status === 0) throw Error(`ignored path: ${path}`);
  if (existsSync(full) && !lstatSync(full).isFile()) throw Error(`explicit files only: ${path}`);
  return full;
}

// Only receipt lines in this plan and the selected roadmap checkbox are
// finalization metadata. Other plan prose and other pending items remain hashed.
export function payloadText(path, bytes, plan, ledger) {
  if (path === plan) {
    const doc = scanDocument(bytes.toString("utf8"));
    const omit = new Set(doc.rows.filter(({ line, section }) =>
      (section === "Verification" && /^\s*- (?:pass |payload )/.test(line)) ||
      (section === "Closure" && /^- (?:dispatch audit |accepted |rejected )/.test(line))).map((r) => r.index));
    return Buffer.from(doc.lines.filter((line, i) => !omit.has(i) && line.trim()).join("\n"));
  }
  if (path === `docs/roadmaps/${ledger.fm.mission}-roadmap.md`) {
    const wi = String(ledger.fm["work-item"]).match(/^M\d+-(WI\d+)$/)?.[1];
    if (wi) return Buffer.from(bytes.toString("utf8").replace(new RegExp(`^(- \\[)[x ](\\] ${wi}(?:\\s|$))`, "gm"), "$1 $2"));
  }
  return bytes;
}

export function snapshot(root, plan, paths, base) {
  root = resolve(root);
  safePath(root, plan);
  if (!paths.includes(plan) || !paths.length || new Set(paths.map((p) => p.toLowerCase())).size !== paths.length) throw Error("include plan exactly once; paths must be unique");
  base ||= git(root, ["rev-parse", "HEAD"]).stdout.trim();
  if (!/^[a-f0-9]{40,64}$/.test(base)) throw Error("invalid base commit");
  git(root, ["cat-file", "-e", `${base}^{commit}`]);
  const ledger = interpretPlan(readFileSync(join(root, plan), "utf8"));
  const fileMode = git(root, ["config", "--get", "core.filemode"], undefined, true).stdout.trim() === "true";
  const entries = [...paths].sort().map((path) => {
    const full = safePath(root, path);
    const tracked = git(root, ["ls-files", "--stage", "--", path]).stdout;
    if (/^(?:120000|160000) /.test(tracked)) throw Error(`symlink/submodule path: ${path}`);
    if (!existsSync(full)) {
      git(root, ["cat-file", "-e", `${base}:${path}`]);
      return [path, "deleted", null];
    }
    const diskMode = (lstatSync(full).mode & 0o111) ? "100755" : "100644";
    const mode = fileMode ? diskMode : (tracked.match(/^(100\d+) /)?.[1] || "100644");
    // Git's clean conversion (e.g. CRLF) is part of the accepted payload.
    const blob = git(root, ["hash-object", `--path=${path}`, "--stdin"], readFileSync(full)).stdout.trim();
    const bytes = readFileSync(full);
    const normalized = payloadText(path, bytes, plan, ledger);
    return [path, mode, normalized === bytes ? blob : hash(normalized)];
  });
  return { hash: hash(JSON.stringify({ plan, base, entries })), base, paths: entries.map((e) => e[0]), entries, ledger };
}

function proofFor(ledger) {
  const lines = ledger.doc.sections.get("Verification") || [];
  const records = lines.map(({ line }) => line.match(/^- payload ([a-f0-9]{64}) base=([a-f0-9]{40,64}) paths=(\[.*\])$/)).filter(Boolean);
  const m = records.at(-1);
  if (!m) throw Error("missing payload proof; use --snapshot and record through built-in tools");
  const paths = JSON.parse(m[3]);
  if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) throw Error("invalid payload paths");
  return { hash: m[1], base: m[2], paths };
}

export function deliver(root, plan, paths, message) {
  root = resolve(root);
  const repo = resolve(git(root, ["rev-parse", "--show-toplevel"]).stdout.trim());
  if (repo.toLowerCase() !== root.toLowerCase()) throw Error("run from repository root");
  safePath(root, plan);
  const ledger = interpretPlan(readFileSync(join(root, plan), "utf8"));
  if (!ledger.deliveryReady) throw Error(`not delivery-ready: ${ledger.reasons.join("; ")}`);
  const proof = proofFor(ledger);
  if (!same([...paths].sort(), [...proof.paths].sort())) throw Error("paths differ from reviewed proof");
  const current = snapshot(root, plan, paths, proof.base);
  if (current.hash !== proof.hash) throw Error("payload changed since verification/audit (including possible mixed ownership)");
  if ([...ledger.passes.values()].some((p) => p.exit !== 0) || ledger.fm.verify.some((k) => ledger.passes.get(k)?.payload !== proof.hash) ||
      !ledger.audit.conclusion.text.includes(`payload=${proof.hash}`) || !ledger.audit.conclusion.text.includes("ownership=whole-files")) throw Error("verification/audit must accept current payload and whole-file ownership");
  const staged = names(git(root, ["diff", "--cached", "--name-only", "-z"]).stdout);
  if (staged.some((p) => !paths.includes(p))) throw Error("unrelated staged changes; leave index untouched");
  for (const path of staged) if (git(root, ["diff", "--name-only", "--", path]).stdout.trim()) throw Error(`mixed/partially staged path: ${path}`);
  const receipts = git(root, ["log", "--all", "--format=%H", "--fixed-strings", `--grep=AGE-Plan: ${plan}`]).stdout.trim().split("\n").filter(Boolean)
    .filter((id) => git(root, ["show", "-s", "--format=%B", id]).stdout.split(/\r?\n/).filter((s) => s === `AGE-Plan: ${plan}`).length > 0);
  if (receipts.length > 1) throw Error("multiple AGE-Plan receipts; reconcile manually");
  const expectedBlobs = () => paths.slice().sort().map((p) => [p, existsSync(join(root, p)) ? git(root, ["hash-object", `--path=${p}`, "--stdin"], readFileSync(join(root, p))).stdout.trim() : null]);
  const expected = expectedBlobs();
  const checkCommit = (id) => {
    const actualPaths = names(git(root, ["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", id]).stdout);
    if (!same(actualPaths, paths.slice().sort())) throw Error("delivery receipt path set differs");
    for (const [path, blob] of expected) {
      const actual = git(root, ["rev-parse", `${id}:${path}`], undefined, true);
      if ((actual.status === 0 ? actual.stdout.trim() : null) !== blob) throw Error(`delivered content differs: ${path}`);
      const mode = git(root, ["ls-tree", id, "--", path]).stdout.match(/^(\d+) /)?.[1] || "deleted";
      if (mode !== current.entries.find((e) => e[0] === path)[1]) throw Error(`delivered mode differs: ${path}`);
    }
  };
  if (receipts.length) {
    checkCommit(receipts[0]);
    return { delivered: true, alreadyDelivered: true, commit: receipts[0] };
  }
  if (!message?.trim() || /(^|\n)AGE-Plan:/i.test(message)) throw Error("provide message without AGE-Plan trailer");
  const changed = names(git(root, ["diff", proof.base, "--name-only", "--no-renames", "-z", "--", ...paths]).stdout);
  const untracked = names(git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ...paths]).stdout);
  if (!same([...new Set([...changed, ...untracked])].sort(), paths.slice().sort())) throw Error("paths must name exactly changed delivery files");
  git(root, ["add", "--", ...paths]);
  const indexPaths = names(git(root, ["diff", "--cached", "--name-only", "--no-renames", "-z"]).stdout);
  if (!same(indexPaths, paths.slice().sort()) || snapshot(root, plan, paths, proof.base).hash !== proof.hash) throw Error("index/payload changed; stop delivery");
  for (const [path, blob] of expected) {
    const index = git(root, ["rev-parse", `:${path}`], undefined, true);
    if ((index.status === 0 ? index.stdout.trim() : null) !== blob) throw Error(`index differs: ${path}`);
  }
  git(root, ["diff", "--cached", "--check"]);
  git(root, ["commit", "-F", "-"], `${message.trim()}\n\nAGE-Plan: ${plan}\n`);
  const id = git(root, ["rev-parse", "HEAD"]).stdout.trim();
  checkCommit(id);
  if (!same(expectedBlobs(), expected) || git(root, ["diff", "--cached", "--name-only"]).stdout.trim()) throw Error("hook changed accepted payload/index; commit exists, stop and reconcile");
  if (!git(root, ["show", "-s", "--format=%B", id]).stdout.split(/\r?\n/).includes(`AGE-Plan: ${plan}`)) throw Error("hook changed receipt; stop and reconcile");
  return { delivered: true, alreadyDelivered: false, commit: id };
}

function main(args) {
  const mode = args[0];
  const cut = args.indexOf("--");
  if (!["--snapshot", "--commit"].includes(mode) || !args[1] || cut < 2) throw Error('usage: commit-plan.mjs --snapshot|--commit <plan> [--message "..."] -- <explicit paths...>');
  const paths = args.slice(cut + 1);
  const root = process.cwd();
  if (mode === "--snapshot") {
    const result = snapshot(root, args[1], paths);
    console.log(`- payload ${result.hash} base=${result.base} paths=${JSON.stringify(result.paths)}`);
  } else console.log(JSON.stringify(deliver(root, args[1], paths, args[2] === "--message" && cut === 4 ? args[3] : "")));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`Delivery blocked: ${e.message}`); process.exitCode = 1; }
}
