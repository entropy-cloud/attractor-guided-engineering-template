// M5-WI49 Phase 3 — CLI validator pipe-truncation guard.
//
// The four CLI checkers (roadmap-check / plan-check / gate-check /
// mission-check) print their JSON report to stdout and historically called
// process.exit() immediately after console.log. When stdout is a PIPE (not a
// TTY), Node writes asynchronously; process.exit does not wait for the stream
// to flush, so payloads larger than the 64KB pipe buffer were truncated
// (observed live: roadmap-check on this repo's roadmap produced 93,987B but
// exactly 65,536B arrived through the pipe). The fix replaces process.exit
// with process.exitCode assignment so the event loop drains naturally.
//
// Five cases (all spawn the real CLI with stdout piped — spawnSync reads the
// pipe to EOF, reproducing the consumer face):
//   1. roadmap-check + >64KB legacy-table roadmap → complete JSON, exit 0.
//   2. plan-check + >64KB field-error payload → complete JSON, exit 1.
//   3. gate-check single-file mode → complete JSON; exit matches decision
//      (allow face via a plan inside a known plans root, deny face via a
//      missing file).
//   4. mission-check valid mission → complete JSON, exit 0.
//   5. exit-code correctness on the failing roadmap face (fieldErrors → 1)
//      plus the passing plan-check face (legacy plan → 0).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "..", "src");

function runCli(script, args, opts = {}) {
  const res = spawnSync(process.execPath, [resolve(SRC, script), ...args], {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 16 * 1024 * 1024,
    ...opts,
  });
  return { code: res.status ?? -1, stdout: res.stdout || "", stderr: res.stderr || "" };
}

/** Legacy-table roadmap with N rows — big enough to far exceed the 64KB pipe
 * buffer once serialized into the phases array. */
function bigLegacyRoadmap(rows) {
  const lines = [
    "# Big Roadmap",
    "",
    "## Work Item Status",
    "",
    "| Work Item | Status | Owner Doc / Source | Dependencies | Reuse |",
    "| --------- | ------ | ------------------ | ------------ | ----- |",
  ];
  for (let i = 0; i < rows; i++) {
    lines.push(`| M1/WI${i} work item with a reasonably descriptive name number ${i} | ${i % 4 === 3 ? "todo" : "done"} | brief §scope | WI${Math.max(0, i - 1)} | node --test |`);
  }
  lines.push("");
  return lines.join("\n");
}

describe("WI49 Phase 3 — CLI validator pipe truncation (stdout JSON face)", () => {
  it("roadmap-check: >64KB payload through a pipe arrives complete (JSON parses, exit 0)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wi49-pipe-rm-"));
    try {
      const roadmap = join(tmp, "big-roadmap.md");
      writeFileSync(roadmap, bigLegacyRoadmap(900));
      const r = runCli("roadmap-check.mjs", [roadmap]);
      assert.equal(r.code, 0, `expected exit 0; stderr: ${r.stderr}`);
      const byteLen = Buffer.byteLength(r.stdout, "utf8");
      assert.ok(byteLen > 65536, `payload must exceed the 64KB pipe buffer (got ${byteLen}B)`);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.passed, true);
      assert.equal(parsed.phases.length, 900);
      assert.equal(parsed.overallProgress, 0.75); // rows divisible-by-3 are todo → 1/4 todo
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("plan-check: >64KB field-error payload through a pipe arrives complete (JSON parses, exit 1)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wi49-pipe-pc-"));
    try {
      const fmLines = [];
      for (let i = 0; i < 2000; i++) fmLines.push(`unknownKey${i}: value-number-${i}`);
      const plan = join(tmp, "noisy-plan.md");
      writeFileSync(
        plan,
        `---\nstatus: draft\nmission: wi49-pipe\nwork-item: M1-WI1\n${fmLines.join("\n")}\n---\n\n# noisy\n\n## Phase 1 — x\n\n- [ ] work\n`,
      );
      const r = runCli("plan-check.mjs", [plan]);
      const byteLen = Buffer.byteLength(r.stdout, "utf8");
      assert.ok(byteLen > 65536, `payload must exceed the 64KB pipe buffer (got ${byteLen}B)`);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.passed, false);
      assert.ok(parsed.fieldErrors.length >= 2000, `expected >=2000 fieldErrors, got ${parsed.fieldErrors?.length}`);
      assert.equal(r.code, 1, "failing face keeps exit 1 through the pipe");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("gate-check: single-file mode JSON arrives complete; exit code matches decision", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wi49-pipe-gc-"));
    try {
      // Allow face: a structurally-valid ledger plan inside a known plans root
      // (<tmp>/docs/plans — the first passive-scan root of the ancestor walk).
      const plansDir = join(tmp, "docs", "plans", "wi49");
      mkdirSync(plansDir, { recursive: true });
      const plan = join(plansDir, "2026-08-28-0900-1-plan.md");
      writeFileSync(
        plan,
        "---\nstatus: active\nmission: wi49-pipe\nwork-item: M1-WI1\nverify: [test]\n---\n\n# plan\n\n## Phase 1 — x\n\n- [ ] work\n",
      );
      const allow = runCli("gate-check.mjs", [plan]);
      const parsedAllow = JSON.parse(allow.stdout);
      assert.equal(parsedAllow.decision, "allow", `stderr: ${allow.stderr}`);
      assert.equal(allow.code, 0, "allow decision → exit 0");

      // Deny face: missing file → deny JSON + exit 1, stdout still parses.
      const deny = runCli("gate-check.mjs", [join(tmp, "no-such-plan.md")]);
      const parsedDeny = JSON.parse(deny.stdout);
      assert.equal(parsedDeny.decision, "deny");
      assert.equal(deny.code, 1, "deny decision → exit 1");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("mission-check: valid mission JSON arrives complete through the pipe (exit 0)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wi49-pipe-mc-"));
    try {
      mkdirSync(join(tmp, "docs", "backlog"), { recursive: true });
      writeFileSync(join(tmp, "docs", "backlog", "x.md"), "# roadmap\n");
      mkdirSync(join(tmp, "plans"));
      writeFileSync(join(tmp, "plans", ".keep"), "");
      const missionFile = join(tmp, "mission.json");
      writeFileSync(missionFile, JSON.stringify({
        name: "wi49-pipe",
        roadmapPath: "docs/backlog/x.md",
        plansDir: "plans",
        commands: { test: "echo ok" },
      }));
      const r = runCli("mission-check.mjs", [missionFile, tmp]);
      assert.equal(r.code, 0, `expected exit 0; stderr: ${r.stderr}`);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.valid, true);
      assert.equal(parsed.name, "wi49-pipe");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("exit-code correctness preserved: roadmap-check failing face → 1, plan-check passing legacy face → 0", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wi49-pipe-exit-"));
    try {
      const badRoadmap = join(tmp, "bad-roadmap.md");
      writeFileSync(
        badRoadmap,
        "---\nnotARoadmapField: oops\n---\n\n## Work Item Status\n\n| Work Item | Status |\n| --- | --- |\n| item | done |\n",
      );
      const bad = runCli("roadmap-check.mjs", [badRoadmap]);
      assert.equal(bad.code, 1, "fieldErrors face → exit 1");
      assert.equal(JSON.parse(bad.stdout).passed, false);

      const legacyPlan = join(tmp, "legacy-plan.md");
      writeFileSync(
        legacyPlan,
        "> Plan Status: completed\n\n## Phase 1 — x\n\n- [x] done\n\n## Closure\n\n- accepted #audit-20260828-0900-wi49-pipe-1-abcd1234：clean\n",
      );
      const good = runCli("plan-check.mjs", [legacyPlan]);
      assert.equal(good.code, 0, `legacy completed plan → exit 0; stderr: ${good.stderr}`);
      assert.equal(JSON.parse(good.stdout).passed, true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
