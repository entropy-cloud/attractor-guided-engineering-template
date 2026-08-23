#!/usr/bin/env node
/**
 * host-harness.mjs — L3 host-integration harness (dsh-plugin M2-WI9, plan
 * docs/plans/dsh-plugin/2026-08-23-1621-1-l3-host-harness-sdk-server.md).
 *
 * Boots a real DSH runtime serving `dsh-sdk-jsonrpc-server` over stdio
 * (composition: test/fixtures/harness.cordis.yml, Phase 1 Decision 1) and
 * drives it as an out-of-process SDK client through a hand-written thin
 * NDJSON JSON-RPC transport (`HarnessLineRpcTransport` — deliberately named
 * differently from the official `JsonRpcLineTransport` to avoid log/doc
 * ambiguity; Decision 2).
 *
 * Scenario set (R3 §4 assertions, post-erratum harvest surface):
 *   1. marker-roundtrip  — step-style prompt → root-session LAST committed
 *                          assistant text (session.event `assistant/message`
 *                          + `turn/end` reason) contains the marker.
 *                          `subagent.finished` is a conditional, non-gating
 *                          observation (it only fires for model-delegated
 *                          subagents, never for direct root prompts — R3 §4
 *                          erratum, plan Current Baseline).
 *   2. silent-idle       — `session.status` idle arrives for the session.
 *   3. session-continuity— same sessionId, two turns. Gating layers:
 *                          stream identity (both turns' session.event observed
 *                          on one sessionId) + content (nonce-echo in turn-2
 *                          root assistant text). Wording-level output is
 *                          recorded, not gated.
 *   4. shutdown-hygiene  — `shutdown` response precedes process exit 0; no
 *                          orphan processes from the harness spawn tree;
 *                          stdout stayed pure NDJSON (zero malformed lines).
 *
 * R3 §4 fourth sketch assertion ("run-state file written under the
 * workspace") is L4/WI10 scope: this composition runs no mission-control
 * engine in the host, so there is no run-state to write (plan Goals
 * adjudication; R3 §4 note).
 *
 * Modes:
 *   (default)           live model run — needs DEEPSEEK_API_KEY (+ optional
 *                       DEEPSEEK_BASE_URL); env-gated by scripts/verify-native.mjs
 *   --keyless           local stub OpenAI-compatible SSE endpoint (official
 *                       keyless-smoke.e2e.ts precedent) — full spawn/boot/
 *                       protocol path, zero credentials, zero external network
 *   --dry               print the composition (command, argv, env keys,
 *                       fixture, scenarios) and exit without spawning
 *
 * Pure-logic transport unit tests: test/host-harness-transport.test.mjs
 * (fake child streams; zero network, zero credentials).
 */
import { spawn, execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = join(PLUGIN_ROOT, "test", "fixtures", "harness.cordis.yml");
const SERVER_INFO_NAME = "deepseek-harness-sdk-runtime";
const INITIALIZE_MAX_TOKENS = 2048; // Phase 1 Decision: bound per-turn cost/latency of echo-style scenarios
const DEFAULT_TURN_TIMEOUT_MS = 180_000;
const DEFAULT_INIT_TIMEOUT_MS = 90_000;

/* -------------------------------------------------------------------------
 * HarnessLineRpcTransport — thin NDJSON JSON-RPC 2.0 client transport over
 * caller-owned byte streams (the spawned child's stdin/stdout).
 *
 * Frame classification (dsh-sdk-protocol README): `id`+`method` = request
 * (server→client requests are a dead capability — recorded, never answered),
 * `id` alone = response, `method` alone = notification. Malformed JSON lines
 * are ignored (counted) per the protocol contract.
 * ------------------------------------------------------------------------- */
export class HarnessLineRpcTransport {
  constructor({ stdin, stdout, defaultTimeoutMs = DEFAULT_TURN_TIMEOUT_MS, onStderrLine } = {}) {
    if (!stdin || typeof stdin.write !== "function") throw new TypeError("HarnessLineRpcTransport: stdin (writable) required");
    if (!stdout || typeof stdout.on !== "function") throw new TypeError("HarnessLineRpcTransport: stdout (readable) required");
    this._stdin = stdin;
    this._stdout = stdout;
    this._defaultTimeoutMs = defaultTimeoutMs;
    this._onStderrLine = onStderrLine;
    this._buffer = "";
    this._nextId = 1;
    this._pending = new Map(); // id -> { resolve, reject, timer, method }
    this._noteWaiters = new Set(); // { predicate, resolve, reject, timer }
    this.notes = []; // every notification frame seen, in arrival order
    this.inboundRequests = []; // dead-capability frames (method+id from server)
    this.malformedLines = 0;
    this.ended = false;
    this._started = false;
  }

  start() {
    if (this._started) return;
    this._started = true;
    this._stdout.setEncoding("utf8");
    this._stdout.on("data", (chunk) => this._onChunk(chunk));
    this._stdout.on("end", () => this._onEnd());
    this._stdout.on("error", (err) => this._onEnd(err));
  }

  _onChunk(chunk) {
    this._buffer += chunk;
    let idx;
    while ((idx = this._buffer.indexOf("\n")) !== -1) {
      const line = this._buffer.slice(0, idx);
      this._buffer = this._buffer.slice(idx + 1);
      if (line.trim() === "") continue;
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        this.malformedLines += 1;
        continue;
      }
      this._dispatch(frame);
    }
  }

  _dispatch(frame) {
    if (frame === null || typeof frame !== "object") {
      this.malformedLines += 1;
      return;
    }
    const hasId = frame.id !== undefined && frame.id !== null;
    const hasMethod = typeof frame.method === "string";
    if (hasId && hasMethod) {
      this.inboundRequests.push(frame); // dead capability per protocol; record only
      return;
    }
    if (hasMethod) {
      this.notes.push(frame);
      for (const waiter of [...this._noteWaiters]) {
        if (waiter.predicate(frame)) this._resolveWaiter(waiter, frame);
      }
      return;
    }
    if (hasId) {
      const pending = this._pending.get(frame.id);
      if (pending === undefined) return; // response to an unknown/timed-out id
      this._pending.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.error !== undefined && frame.error !== null) {
        pending.reject(new RpcError(frame.error, pending.method));
      } else {
        pending.resolve(frame.result);
      }
    }
    // neither id nor method: malformed per JSON-RPC, ignore silently
  }

  _resolveWaiter(waiter, frame) {
    this._noteWaiters.delete(waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(frame);
  }

  _onEnd(err) {
    if (this.ended) return;
    this.ended = true;
    const reason = err ?? new Error("transport stream ended (child stdout closed / child exit)");
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
    this._pending.clear();
    for (const waiter of this._noteWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(reason instanceof Error ? reason : new Error(String(reason)));
    }
    this._noteWaiters.clear();
  }

  request(method, params, { timeoutMs } = {}) {
    if (this.ended) return Promise.reject(new Error(`transport ended before "${method}" could be sent`));
    const id = this._nextId++;
    const frame = { jsonrpc: "2.0", id, method };
    if (params !== undefined) frame.params = params;
    return new Promise((resolve, reject) => {
      const timeout = timeoutMs ?? this._defaultTimeoutMs;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`request "${method}" (id ${id}) timed out after ${timeout}ms`));
      }, timeout);
      this._pending.set(id, { resolve, reject, timer, method });
      this._stdin.write(JSON.stringify(frame) + "\n");
    });
  }

  /** Wait for a notification matching `predicate`; scans history first (a
   *  notification that already arrived — e.g. an idle status that beat us to
   *  the await point — still resolves). */
  waitForNotification(predicate, { timeoutMs = DEFAULT_TURN_TIMEOUT_MS, label = "notification" } = {}) {
    for (const note of this.notes) {
      if (predicate(note)) return Promise.resolve(note);
    }
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this._noteWaiters.delete(waiter);
          reject(new Error(`waitForNotification(${label}) timed out after ${timeoutMs}ms`));
        }, timeoutMs),
      };
      this._noteWaiters.add(waiter);
    });
  }

  close() {
    this._onEnd();
  }
}

export class RpcError extends Error {
  constructor(wireError, method) {
    super(`JSON-RPC error on "${method}": code=${wireError?.code} message=${wireError?.message}` +
      (wireError?.data !== undefined ? ` data=${JSON.stringify(wireError.data)}` : ""));
    this.name = "RpcError";
    this.code = wireError?.code;
    this.data = wireError?.data;
  }
}

/* -------------------------------------------------------------------------
 * Session helpers (wire shapes per dsh-sdk-protocol types.ts)
 * ------------------------------------------------------------------------- */
function isSessionEvent(note, sessionId, eventType) {
  return note.method === "session.event" && note.params?.sessionId === sessionId &&
    note.params?.event?.type === eventType;
}

function assistantTextOf(eventNote) {
  const message = eventNote.params?.event?.data?.message;
  const blocks = Array.isArray(message?.content) ? message.content : [];
  return blocks.filter((b) => b && b.type === "text" && typeof b.text === "string").map((b) => b.text).join("");
}

/**
 * Drive one turn on `sessionId`: send the prompt, assert the durable enqueue
 * receipt, then wait for that session's NEXT `turn/end` and harvest every
 * root-session `assistant/message` committed between prompt and turn end.
 * (Direct root prompts never surface `subagent.finished` — R3 §4 erratum.)
 */
async function runTurn(h, sessionId, promptText, { turnTimeoutMs }) {
  const promptIndex = h.notes.length;
  const receipt = await h.request("session/prompt", {
    sessionId,
    contentBlocks: [{ type: "text", text: promptText }],
  }, { timeoutMs: 30_000 });
  if (typeof receipt?.messageId !== "string" || receipt.messageId.length === 0) {
    throw new Error(`session/prompt receipt is not a durable {messageId} enqueue ack: ${JSON.stringify(receipt)}`);
  }
  const turnEnd = await h.waitForNotification(
    (n) => isSessionEvent(n, sessionId, "turn/end") && h.notes.indexOf(n) >= promptIndex,
    { timeoutMs: turnTimeoutMs, label: `turn/end on ${sessionId}` },
  );
  const turnNumber = turnEnd.params.event.data?.turn;
  const slice = h.notes.slice(promptIndex, h.notes.indexOf(turnEnd) + 1);
  const assistantMessages = slice.filter((n) => isSessionEvent(n, sessionId, "assistant/message"));
  const lastAssistantText = assistantMessages.length > 0 ? assistantTextOf(assistantMessages[assistantMessages.length - 1]) : null;
  return {
    messageId: receipt.messageId,
    turn: turnNumber,
    turnEndReason: turnEnd.params.event.data?.reason ?? null,
    assistantTexts: assistantMessages.map(assistantTextOf),
    lastAssistantText,
  };
}

/* -------------------------------------------------------------------------
 * Scenarios — each returns { name, pass, summary, detail }; independent assert
 * functions with readable diffs on failure.
 * ------------------------------------------------------------------------- */
function truncate(text, n = 400) {
  if (text === null || text === undefined) return String(text);
  const s = String(text);
  return s.length > n ? `${s.slice(0, n)}…[${s.length} chars]` : s;
}

async function scenarioMarkerRoundtrip(h, { turnTimeoutMs }) {
  const sessionId = "harness-marker";
  const marker = "<AI_STEP_RESULT>pass</AI_STEP_RESULT>";
  const prompt =
    "You are executing one mission-driver step inside a verification harness. " +
    "The step is: confirm the harness is listening by replying with the word `ready`. " +
    "End your reply with the step result marker, exactly this line, nothing after it:\n" +
    marker;
  const turn = await runTurn(h, sessionId, prompt, { turnTimeoutMs });
  const pass = typeof turn.lastAssistantText === "string" && turn.lastAssistantText.includes(marker);
  return {
    name: "marker-roundtrip",
    pass,
    summary: `turn ${turn.turn} reason=${JSON.stringify(turn.turnEndReason)}; root last assistant text ${pass ? "contains" : "MISSING"} marker`,
    detail: pass
      ? `lastAssistantText=${JSON.stringify(truncate(turn.lastAssistantText))}`
      : `expected marker ${JSON.stringify(marker)} in root-session last committed assistant text;\n` +
        `turn/end reason=${JSON.stringify(turn.turnEndReason)};\n` +
        `assistantTexts (n=${turn.assistantTexts.length})=${JSON.stringify(turn.assistantTexts.map((t) => truncate(t, 120)))}`,
  };
}

async function scenarioSilentIdle(h, { turnTimeoutMs }) {
  const sessionId = "harness-idle";
  const promptIndexBefore = h.notes.length;
  const turn = await runTurn(h, sessionId, "Reply with the single word: ok", { turnTimeoutMs });
  const idle = await h.waitForNotification(
    (n) => n.method === "session.status" && n.params?.sessionId === sessionId && n.params?.status === "idle" &&
      h.notes.indexOf(n) >= promptIndexBefore,
    { timeoutMs: 30_000, label: `session.status idle on ${sessionId}` },
  );
  const running = h.notes.some(
    (n, i) => n.method === "session.status" && n.params?.sessionId === sessionId && n.params?.status === "running" && i >= promptIndexBefore,
  );
  return {
    name: "silent-idle-arrival",
    pass: true,
    summary: `idle arrived (turn ${turn.turn} reason=${JSON.stringify(turn.turnEndReason)}; running transition seen: ${running})`,
    detail: `idle frame=${JSON.stringify(idle.params)}`,
  };
}

async function scenarioSessionContinuity(h, { turnTimeoutMs }) {
  const sessionId = "harness-continuity";
  const nonce = `NONCE-${randomBytes(6).toString("hex")}`;
  const turn1 = await runTurn(
    h,
    sessionId,
    `You are being verified for session continuity. Store this verification nonce: ${nonce} . Reply with the single word: stored`,
    { turnTimeoutMs },
  );
  const turn2 = await runTurn(
    h,
    sessionId,
    "This is the second message in the SAME session. Return the verification nonce you were given in the first message. " +
    "Output the nonce token verbatim, then stop.",
    { turnTimeoutMs },
  );
  const bothTurnsOnOneSession = Number.isInteger(turn1.turn) && Number.isInteger(turn2.turn) && turn2.turn > turn1.turn &&
    turn1.assistantTexts.length > 0 && turn2.assistantTexts.length > 0;
  const nonceEchoed = typeof turn2.lastAssistantText === "string" && turn2.lastAssistantText.includes(nonce);
  const pass = bothTurnsOnOneSession && nonceEchoed;
  return {
    name: "session-continuity",
    pass,
    summary: `stream-identity ${bothTurnsOnOneSession ? "ok" : "FAIL"} (turns ${turn1.turn}→${turn2.turn} on sessionId=${sessionId}, assistant messages ${turn1.assistantTexts.length}+${turn2.assistantTexts.length}); ` +
      `nonce-echo ${nonceEchoed ? "ok" : "FAIL"} (turn-2 reason=${JSON.stringify(turn2.turnEndReason)})`,
    detail: pass
      ? `nonce=${nonce}; turn2 lastAssistantText=${JSON.stringify(truncate(turn2.lastAssistantText, 200))}`
      : `expected nonce ${nonce} in turn-2 root assistant text;\n` +
        `turn1 (turn=${turn1.turn}, reason=${JSON.stringify(turn1.turnEndReason)}, texts=${JSON.stringify(turn1.assistantTexts.map((t) => truncate(t, 120)))});\n` +
        `turn2 (turn=${turn2.turn}, reason=${JSON.stringify(turn2.turnEndReason)}, texts=${JSON.stringify(turn2.assistantTexts.map((t) => truncate(t, 120)))})`,
  };
}

async function scenarioShutdownHygiene(h, child, { binCommandForOrphanScan, scratchRoot }) {
  const shutdownResult = await h.request("shutdown", {}, { timeoutMs: 60_000 });
  const shutdownOk = shutdownResult !== undefined && Object.keys(shutdownResult ?? {}).length === 0;
  const exitInfo = await child.exitPromise;
  const orphans = await scanOrphans(binCommandForOrphanScan, scratchRoot);
  const stdoutPure = h.malformedLines === 0;
  const pass = shutdownOk && exitInfo.code === 0 && orphans.length === 0 && stdoutPure;
  return {
    name: "shutdown-hygiene",
    pass,
    summary: `shutdown={} ${shutdownOk ? "ok" : "FAIL"}; exit code=${exitInfo.code} signal=${JSON.stringify(exitInfo.signal)}; ` +
      `orphans=${orphans.length}; malformed stdout lines=${h.malformedLines}`,
    detail: pass
      ? `no process in the harness spawn tree survived shutdown (scan: bin path + scratch root)`
      : `shutdownResult=${JSON.stringify(shutdownResult)}; orphans=${JSON.stringify(orphans)}; malformed=${h.malformedLines}`,
    exitInfo,
  };
}

async function scanOrphans(binPath, scratchRoot) {
  const { stdout } = await new Promise((resolvePromise, reject) => {
    execFile("ps", ["-axo", "pid=,command="], (err, out, stderr) => {
      if (err) reject(new Error(`ps failed: ${stderr}`));
      else resolvePromise({ stdout: out });
    });
  });
  const selfPid = String(process.pid);
  const needles = [binPath, scratchRoot].filter((s) => typeof s === "string" && s.length > 0);
  const hits = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const pid = trimmed.split(/\s+/, 1)[0];
    if (pid === selfPid) continue;
    if (trimmed.includes("ps -axo")) continue;
    if (needles.some((n) => trimmed.includes(n))) hits.push(trimmed);
  }
  return hits;
}

/* -------------------------------------------------------------------------
 * Keyless stub model endpoint (official keyless-smoke.e2e.ts precedent):
 * OpenAI-compatible SSE responder that echoes any step marker and/or nonce
 * found in the request body — deterministic, zero credentials, zero network.
 * ------------------------------------------------------------------------- */
export function createKeylessModelServer() {
  const requests = [];
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      requests.push({ url: request.url, body });
      const found = new Set();
      for (const m of body.matchAll(/<AI_STEP_RESULT>\s*(?:pass|fail)\s*<\/AI_STEP_RESULT>/g)) found.add(m[0]);
      for (const m of body.matchAll(/NONCE-[0-9a-f]+/g)) found.add(m[0]);
      const content = found.size > 0 ? [...found].join("\n") : "ok";
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('data: {"choices":[{"delta":{"role":"assistant","content":null}}]}\n\n');
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      response.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":1}}\n\n');
      response.end("data: [DONE]\n\n");
    });
  });
  return { server, requests };
}

/* -------------------------------------------------------------------------
 * Harness run
 * ------------------------------------------------------------------------- */
function parseArgs(argv) {
  const args = { dry: false, keyless: false, scenario: null, keep: false, timeoutMs: DEFAULT_TURN_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry") args.dry = true;
    else if (a === "--keyless") args.keyless = true;
    else if (a === "--keep") args.keep = true;
    else if (a === "--scenario") args.scenario = argv[++i];
    else if (a === "--timeout-ms") args.timeoutMs = Number(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function resolveBinPath() {
  const override = process.env.DSH_HARNESS_BIN;
  if (override) return resolve(override);
  const binLink = join(PLUGIN_ROOT, "node_modules", ".bin", "dsh-jsonrpc-agent");
  if (!existsSync(binLink)) {
    throw new Error(`demo bin not found at ${binLink} — run \`npm install\` in plugin/dsh (Phase 1 devDeps)`);
  }
  return realpathSync(binLink); // resolve symlink → …/lib/bin.js: stable needle for the orphan scan
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const binPath = resolveBinPath();
  if (!existsSync(FIXTURE_PATH)) throw new Error(`fixture missing: ${FIXTURE_PATH}`);
  const model = process.env.DSH_MODEL ?? "deepseek-v4-flash";

  const keylessServer = args.keyless ? createKeylessModelServer() : null;
  let keylessPort = null;
  if (keylessServer !== null) {
    await new Promise((resolvePromise) => keylessServer.server.listen(0, "127.0.0.1", resolvePromise));
    keylessPort = keylessServer.server.address().port;
  }

  const scratchRoot = await mkdtemp(join(tmpdir(), "dsh-host-harness-"));
  const workspaceDir = join(scratchRoot, "workspace");
  const sessionsDir = join(scratchRoot, "sessions");
  await mkdir(workspaceDir, { recursive: true });
  await mkdir(sessionsDir, { recursive: true });

  const childEnv = {
    ...process.env,
    DSH_CWD: workspaceDir,
    DSH_SESSION_ROOT: sessionsDir,
    DSH_MODEL: model,
    ...(keylessPort !== null
      ? { DEEPSEEK_API_KEY: "keyless-harness-no-call", DEEPSEEK_BASE_URL: `http://127.0.0.1:${keylessPort}` }
      : {}),
  };

  const composition = {
    command: process.execPath,
    argv: [binPath, FIXTURE_PATH],
    envKeysShown: [
      "DSH_CWD=" + workspaceDir,
      "DSH_SESSION_ROOT=" + sessionsDir,
      "DSH_MODEL=" + model,
      keylessPort !== null ? `DEEPSEEK_BASE_URL=http://127.0.0.1:${keylessPort} (keyless stub)` : "DEEPSEEK_BASE_URL=(unset → public default)",
      "DEEPSEEK_API_KEY=" + (keylessPort !== null ? "(keyless stub value)" : process.env.DEEPSEEK_API_KEY ? "<set, redacted>" : "(unset — live runs require it)"),
    ],
    fixture: FIXTURE_PATH,
    mode: args.keyless ? "keyless (local stub endpoint)" : "live model",
    scenarios: ["marker-roundtrip", "silent-idle-arrival", "session-continuity", "shutdown-hygiene"],
  };

  if (args.dry) {
    console.log("host-harness DRY MODE — composition (nothing spawned):");
    console.log(JSON.stringify(composition, null, 2));
    console.log(`initialize params: ${JSON.stringify({ cwd: workspaceDir, provider: "deepseek-official", model, maxTokens: INITIALIZE_MAX_TOKENS })}`);
    return 0;
  }

  console.log(`[harness] mode=${composition.mode} scratch=${scratchRoot}`);
  console.log(`[harness] spawn: ${composition.command} ${binPath} ${FIXTURE_PATH}`);

  const child = spawn(composition.command, composition.argv, {
    cwd: PLUGIN_ROOT,
    env: childEnv,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const exitPromise = new Promise((resolvePromise) => {
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
  child.exitPromise = exitPromise;
  let stderrTail = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk).slice(-8000);
    for (const line of chunk.split("\n")) {
      if (line.trim() !== "") console.log(`[server-stderr] ${line}`);
    }
  });

  const h = new HarnessLineRpcTransport({
    stdin: child.stdin,
    stdout: child.stdout,
    defaultTimeoutMs: args.timeoutMs,
  });
  h.start();

  const results = [];
  let exitCode = 0;
  try {
    const init = await h.request("initialize", {
      cwd: workspaceDir,
      provider: "deepseek-official",
      model,
      maxTokens: INITIALIZE_MAX_TOKENS,
    }, { timeoutMs: DEFAULT_INIT_TIMEOUT_MS });
    if (init?.serverInfo?.name !== SERVER_INFO_NAME) {
      throw new Error(`initialize returned unexpected serverInfo: ${JSON.stringify(init)}`);
    }
    console.log(`[harness] initialized: ${JSON.stringify(init.serverInfo)} (maxTokens=${INITIALIZE_MAX_TOKENS})`);

    const scenarioTable = [
      ["marker-roundtrip", () => scenarioMarkerRoundtrip(h, { turnTimeoutMs: args.timeoutMs })],
      ["silent-idle-arrival", () => scenarioSilentIdle(h, { turnTimeoutMs: args.timeoutMs })],
      ["session-continuity", () => scenarioSessionContinuity(h, { turnTimeoutMs: args.timeoutMs })],
      ["shutdown-hygiene", () => scenarioShutdownHygiene(h, child, { binCommandForOrphanScan: binPath, scratchRoot })],
    ];
    for (const [name, fn] of scenarioTable) {
      if (args.scenario !== null && args.scenario !== name) continue;
      console.log(`[harness] scenario ${name}: running…`);
      const result = await fn();
      results.push(result);
      console.log(`[harness] scenario ${name}: ${result.pass ? "PASS" : "FAIL"} — ${result.summary}`);
      if (!result.pass) {
        console.log(`[harness]   detail: ${result.detail}`);
        exitCode = 1;
      }
      if (name === "shutdown-hygiene") break; // it terminated the runtime
    }

    // Conditional, non-gating observation: subagent.finished only fires when
    // the model actually delegated (R3 §4 erratum — never for direct root prompts).
    const subagentFinished = h.notes.filter((n) => n.method === "subagent.finished");
    console.log(`[harness] observation: subagent.finished count=${subagentFinished.length}` +
      (subagentFinished.length > 0
        ? ` lastAssistantMessage=${JSON.stringify(truncate(subagentFinished[subagentFinished.length - 1]?.params?.lastAssistantMessage, 160))}`
        : " (no model delegation occurred — expected for direct root prompts)"));
    console.log(`[harness] observation: stdout purity — ${h.malformedLines} malformed lines, ${h.inboundRequests.length} inbound (dead-capability) requests`);

    if (args.scenario === null || args.scenario === "shutdown-hygiene") {
      // runtime already exited inside scenario 4
    } else if (!h.ended) {
      await h.request("shutdown", {}, { timeoutMs: 60_000 }).catch(() => {});
      await exitPromise;
    }
  } catch (err) {
    console.error(`[harness] FATAL: ${err?.stack ?? err}`);
    if (stderrTail !== "") console.error(`[harness] server stderr tail:\n${stderrTail}`);
    exitCode = 1;
    child.kill("SIGKILL");
    await exitPromise;
  }

  console.log(`\n[harness] SUMMARY mode=${composition.mode} scenarios=${results.length} pass=${results.filter((r) => r.pass).length} fail=${results.filter((r) => !r.pass).length}`);
  for (const r of results) console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.name}: ${r.summary}`);
  if (keylessServer !== null) {
    console.log(`[harness] keyless stub served ${keylessServer.requests.length} model request(s)`);
    await new Promise((resolvePromise) => keylessServer.server.close(() => resolvePromise()));
  }
  if (!args.keep) await rm(scratchRoot, { recursive: true, force: true });
  else console.log(`[harness] scratch kept at ${scratchRoot}`);
  return exitCode;
}

const invokedPath = process.argv[1];
const isDirectRun = typeof invokedPath === "string" && existsSync(invokedPath) &&
  realpathSync(invokedPath) === fileURLToPath(new URL(import.meta.url));
if (isDirectRun) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(`[harness] FATAL: ${err?.stack ?? err}`);
      process.exit(1);
    },
  );
}
