// AGE mechanical-verification commands runner (age-autonomy M2-WI19, plan
// docs/plans/age-autonomy/2026-08-25-0815-3 Phase 3).
//
// Zero-engine-diff util (a NEW module; engine.js untouched, zero npm deps):
// resolves a plan's `verify` keys against the mission `commands.*` map and
// EXECUTES the mapped commands, collecting per-key `{exitCode, passLine}`
// data. passLine follows 01 §4.2: `- pass <key> <runId> basisHash=<sha256>
// exit=<code>`, with basisHash = computeBasisHash over the plan content the
// runner was handed — the SAME conjunction source as deriveCompleted (so a
// pass line emitted against full-tick content binds; re-tick invalidates it
// naturally). Callers that verify BEFORE the final tick emit data for the
// current basis; the supervisor (M3/WI26) runs this at awaitingClosure where
// the content is full-tick.
//
// Command-source discipline (02 §5): ONLY commands.* values are spawned;
// plan Proof text is never a command source (structural guarantee — this
// module never reads Proof text as anything but opaque plan content).
//
// Consumers: gate-check.mjs `--verify <plan>` (M2 face — stdout data, no
// plan-file writes; writing the pass line stays with the caller/supervisor)
// and the M3 supervisor mechanical-verification trigger (bundled via
// build-bundle ALLOWED_MODULES).
//
// Timeout & output policy (pinned): per-command wall-clock timeout
// (default 10 min) → SIGTERM, then SIGKILL after a 5s grace; timed-out
// commands report exitCode null + timedOut true (recorded honestly in the
// pass line data as exit=null — callers treat non-zero/null as failure).
// Captured stdout+stderr is truncated to the LAST maxOutputChars (default
// 4000) — tails carry the failure diagnostics, heads rarely do.

import { spawn } from "node:child_process";
import { computeBasisHash } from "./ledger-sections.mjs";

export const DEFAULT_VERIFY_TIMEOUT_MS = 10 * 60 * 1000;
export const KILL_GRACE_MS = 5000;
export const MAX_OUTPUT_CHARS = 4000;

// 01 §4.1: verify missing → mission default set = the standard verify keys
// that exist as non-empty commands (02 §5 names test/build/lint/typecheck).
export const DEFAULT_VERIFY_KEY_ORDER = ["test", "build", "lint", "typecheck"];

export function defaultVerifyKeys(commands) {
  const map = commands && typeof commands === "object" && !Array.isArray(commands) ? commands : {};
  return DEFAULT_VERIFY_KEY_ORDER.filter((k) => typeof map[k] === "string" && map[k].trim() !== "");
}

/**
 * Enumerate the verify keys a plan declares (or the mission defaults) and
 * check each against the commands map.
 * @returns {{ ok: boolean, keys: string[], problems: string[], usedDefault: boolean }}
 */
export function resolveVerifyPlan({ verify, commands }) {
  const map = commands && typeof commands === "object" && !Array.isArray(commands) ? commands : {};
  const problems = [];
  let keys;
  let usedDefault = false;
  if (Array.isArray(verify)) {
    keys = verify.filter((k) => typeof k === "string");
    for (const k of verify) {
      if (typeof k !== "string") problems.push(`verify element ${JSON.stringify(k)} is not a command key string`);
    }
  } else if (verify === undefined || verify === null) {
    keys = defaultVerifyKeys(map);
    usedDefault = true;
  } else {
    return { ok: false, keys: [], problems: [`verify field must be an array of command keys (got ${JSON.stringify(verify)})`], usedDefault: false };
  }
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      problems.push(`"${key}" is not a mission commands.* key`);
    } else if (typeof map[key] !== "string" || map[key].trim() === "") {
      problems.push(`"${key}" maps to an empty command`);
    }
  }
  return { ok: problems.length === 0, keys, problems, usedDefault };
}

export function passLineFor({ key, runId, basisHash, exitCode }) {
  const exit = exitCode === null || exitCode === undefined ? "null" : String(exitCode);
  return `- pass ${key} ${runId} basisHash=${basisHash} exit=${exit}`;
}

function clipOutput(text, maxChars) {
  if (text.length <= maxChars) return text;
  return `…[${text.length - maxChars} chars clipped]…\n` + text.slice(-maxChars);
}

/**
 * Run one command (shell string) in projectRoot with a wall-clock timeout.
 * @returns {Promise<{key: string, command: string, exitCode: number|null, timedOut: boolean, durationMs: number, output: string}>}
 */
export function runVerifyCommand({ key, command, projectRoot, timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let output = "";
    let timedOut = false;
    let settled = false;
    const child = spawn(command, {
      shell: true,
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk) => {
      output += chunk.toString("utf8");
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // already gone
        }
      }, KILL_GRACE_MS);
    }, timeoutMs);
    const finish = (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        key,
        command,
        exitCode,
        timedOut,
        durationMs: Date.now() - startedAt,
        output: clipOutput(output, MAX_OUTPUT_CHARS),
      });
    };
    child.on("close", (code) => finish(timedOut ? null : code));
    child.on("error", (err) => {
      output += `\n[spawn error] ${err instanceof Error ? err.message : String(err)}`;
      finish(null);
    });
  });
}

/**
 * Run every resolved verify key and attach pass-line data bound to the
 * plan's current basisHash.
 * @returns {Promise<{basisHash: string, results: Array<{key, command, exitCode, timedOut, durationMs, output, passLine}>}>}
 */
export async function runVerifyCommands({ keys, commands, projectRoot, planText, runId, timeoutMs }) {
  const map = commands && typeof commands === "object" && !Array.isArray(commands) ? commands : {};
  const basisHash = computeBasisHash(planText);
  const results = [];
  for (const key of keys) {
    const command = typeof map[key] === "string" ? map[key] : "";
    const result = command.trim() === ""
      ? { key, command, exitCode: null, timedOut: false, durationMs: 0, output: `[verify-runner] no non-empty command mapped to "${key}"` }
      : await runVerifyCommand({ key, command, projectRoot, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
    results.push({ ...result, passLine: passLineFor({ key, runId, basisHash, exitCode: result.exitCode }) });
  }
  return { basisHash, results };
}
