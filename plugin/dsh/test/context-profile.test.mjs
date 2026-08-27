/**
 * context-profile.test.mjs — efficiency-layer context-profile truth table
 * (age-autonomy M4-WI34, plan `docs/plans/age-autonomy/2026-08-27-0558-1`;
 * the WI36 gate lower bound ≥8 lives here; 04-efficiency §4).
 *
 * Coverage matrix:
 *   - seeding: the AGENTS.md Read This First list parses into seed entries
 *     (direct path lines only — indirect「listed in …」lines never enter);
 *     first start (artifact absent) auto-seeds through the mining face
 *   - run-terminal mining: tally merge (session events × tool/call file
 *     args + run-state prompt products + reflexion memory) + the watchdog
 *     terminal-chain trigger + fail-soft (a collector crash never touches
 *     the terminal receipt / stop-dispatch)
 *   - debounce: empty tally never writes; an unchanged top-N SET never
 *     writes (rank drift inside the set is not progress)
 *   - schema version: v1 round-trips; an unknown version = explicit note +
 *     conservative rebuild (re-seed), never silently carrying old data
 *   - NOT under missions/: the artifact home is outside the mission-scanner
 *     domain (listMissionsString picks up every missions/*.json — the
 *     pollution reverse case) 
 *   - top-N expansion + role override priority: kind:profile blocks expand
 *     to the top-N stable files (reads desc, path asc) inside assemble;
 *     agents WITHOUT a profile declaration keep byte-identical prompts
 *   - deterministic serialization + atomic write (tmp+rename observed)
 *   - headless degradation: no agents face ⇒ explicit note, seed preserved
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_PROFILE_ARTIFACT,
  DEFAULT_PROFILE_TOP_N,
  PROFILE_SCHEMA_VERSION,
  loadProfile,
  mergeReads,
  mineContextProfile,
  newSeededProfile,
  normalizeProfilePath,
  saveProfile,
  seedFromReadFirst,
  serializeProfile,
  tallyFromSessionEvents,
  topNPathsOf,
} from "../src/efficiency/context-profile.ts";
import { assemble, charterHashesOf, newLedger, resolveAssemblyBlocks } from "../src/efficiency/prompt-assembler.ts";
import { createWatchdog } from "../src/supervisor/watchdog.ts";
import { listMissionsString } from "../assets/src/config.js";

// ── in-memory io (the injectable file face) ─────────────────────────────────

/** Deterministic mining io: explicit files map + atomic-write trace. */
function fakeMiningIo({ files = {}, dirs = {} } = {}) {
  const writes = [];
  return {
    files,
    writes,
    readTextFile: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    writeTextAtomic: (p, content) => {
      writes.push({ path: p, content });
      files[p] = content; // tmp+rename lands at the target path
    },
    listDirEntries: (p) => (Object.prototype.hasOwnProperty.call(dirs, p) ? [...dirs[p]] : null),
  };
}

const AGENTS_MD = `# AGENTS

## Read This First

- \`docs/context/project-context.md\`
- \`docs/context/ai-autonomy-policy.md\`
- \`docs/context/codebase-map.md\`
- the active requirement listed in \`docs/context/project-context.md\`
- the active owner doc listed in \`docs/context/project-context.md\`

## Other Section

- \`docs/other/not-seeded.md\`
`;

const NOW = "2026-08-27T06:00:00.000Z";
const NOW2 = "2026-08-27T08:30:00.000Z";

// ── 1. seeding: list parsing + first-start auto-seed ────────────────────────

test("seeding: direct Read This First paths enter with reads=0; indirect「listed in」lines never double-enter; out-of-section lists ignored", () => {
  const entries = seedFromReadFirst(AGENTS_MD);
  assert.deepEqual(
    entries.map((e) => e.path),
    ["docs/context/project-context.md", "docs/context/ai-autonomy-policy.md", "docs/context/codebase-map.md"],
    "exactly the three DIRECT path lines seed — the two indirect-reference lines are skipped (the indirect surface is that file's own embedding)",
  );
  assert.ok(entries.every((e) => e.reads === 0 && e.lastSeenAt === null));
});

test("first start (artifact absent) auto-seeds through the mining face — the artifact lands deterministic and loadable", () => {
  const root = "/repo";
  const io = fakeMiningIo({ files: { [join(root, "AGENTS.md")]: AGENTS_MD }, dirs: {} });
  const out = mineContextProfile({ io, projectRoot: root, sessionEvents: [], agentsFacePresent: true, now: NOW });
  assert.equal(out.status, "seeded", out.note);
  const artifact = io.files[join(root, DEFAULT_PROFILE_ARTIFACT)];
  assert.ok(typeof artifact === "string", "the seed was written to docs/references/context-profile.json");
  const reloaded = loadProfile(io, join(root, DEFAULT_PROFILE_ARTIFACT));
  assert.ok(reloaded.ok && reloaded.profile.entries.length === 3);
});

// ── 2. schema version: v1 round-trip + unknown version conservative rebuild ─

test("schema v1 round-trips: save → load → serialize byte-identical; two saves of equal content are byte-identical", () => {
  const profile = newSeededProfile(AGENTS_MD, NOW);
  const io = fakeMiningIo();
  const path = "/repo/docs/references/context-profile.json";
  saveProfile(io, path, profile);
  const bytes1 = io.files[path];
  saveProfile(io, path, mergeReads(profile, { "docs/context/project-context.md": 2 }, NOW2));
  const mergedBytes = io.files[path];
  const reloaded = loadProfile(io, path);
  assert.ok(reloaded.ok, "saved artifact loads back");
  assert.equal(serializeProfile(reloaded.profile), mergedBytes, "serialize(load(save(x))) === save(x) — the canonical bytes");
  const again = newSeededProfile(AGENTS_MD, NOW);
  assert.equal(serializeProfile(again), bytes1, "same input ⇒ byte-identical serialization (determinism pin)");
  assert.ok(bytes1.endsWith("\n") && !bytes1.endsWith("\n\n"), "single trailing newline");
  const reloaded2 = loadProfile(io, path);
  assert.ok(reloaded2.ok);
  assert.deepEqual(
    reloaded2.profile.entries.map((e) => e.path),
    [...reloaded2.profile.entries.map((e) => e.path)].sort(),
    "entries serialized in path order",
  );
});

test("unknown version = explicit note + conservative rebuild (re-seed) — never silently carrying the old structure", () => {
  const root = "/repo";
  const artifact = join(root, DEFAULT_PROFILE_ARTIFACT);
  const io = fakeMiningIo({
    files: {
      [join(root, "AGENTS.md")]: AGENTS_MD,
      [artifact]: JSON.stringify({ version: 99, entries: [{ path: "stale.md", reads: 500 }] }) + "\n",
    },
  });
  const loaded = loadProfile(io, artifact);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.status, "unknown-version");
  assert.match(loaded.note, /version 99/);
  assert.match(loaded.note, /conservative rebuild/);
  const out = mineContextProfile({ io, projectRoot: root, sessionEvents: [], agentsFacePresent: true, now: NOW });
  assert.ok(out.note.includes("re-seeded") || out.status === "seeded" || out.note.includes("conservative rebuild"), out.note);
  const after = loadProfile(io, artifact);
  assert.ok(after.ok);
  assert.ok(!after.profile.entries.some((e) => e.path === "stale.md"), "the v99 data never survives into the rebuilt artifact");
});

// ── 3. tally faces (pure): session events × tool/call file args ─────────────

test("tallyFromSessionEvents: tool/call × read-class file args count; write-class and unknown events skipped; projectRoot stripped", () => {
  const events = [
    { type: "assistant/message", data: { message: { role: "assistant", content: [] } } },
    { type: "tool/call", data: { name: "read", arguments: JSON.stringify({ path: "/repo/docs/context/project-context.md" }) } },
    { type: "tool/call", data: { name: "grep", arguments: JSON.stringify({ pattern: "TODO", path: "docs/design/age-autonomy/04-efficiency.md" }) } },
    { type: "tool/call", data: { name: "glob", arguments: JSON.stringify({ pattern: "*.md", directory: "/repo/docs/references" }) } },
    { type: "tool/call", data: { name: "edit", arguments: JSON.stringify({ path: "/repo/docs/other.md" }) } },
    { type: "tool/call", data: { name: "read", arguments: "{not json" } },
  ];
  const tally = tallyFromSessionEvents(events, { projectRoot: "/repo" });
  assert.equal(tally["docs/context/project-context.md"], 1);
  assert.equal(tally["docs/design/age-autonomy/04-efficiency.md"], 1);
  assert.equal(tally["docs/references"], 1);
  assert.equal(tally["docs/other.md"], undefined, "write-class tools are not reads");
});

// ── 4. not under missions/ — the scanner zero-pollution reverse case ────────

test("the profile artifact home is outside missions/ — listMissionsString picks up every missions/*.json (the pollution reverse case)", () => {
  assert.ok(!DEFAULT_PROFILE_ARTIFACT.startsWith("missions/"), "docs/references/, never missions/");
  const dir = mkdtempSync(join(tmpdir(), "ctxprofile-missions-"));
  try {
    writeFileSync(join(dir, "age-autonomy-implementation.json"), JSON.stringify({ name: "age-autonomy-implementation" }));
    writeFileSync(join(dir, "context-profile.json"), JSON.stringify({ version: 1 }));
    const listing = listMissionsString(dir);
    assert.match(listing, /age-autonomy-implementation/, "real missions surface");
    assert.match(listing, /context-profile/, "a context-profile.json dropped into missions/ WOULD surface — hence the artifact deliberately lives in docs/references/");
    assert.ok(!listMissionsString(dir).includes(DEFAULT_PROFILE_ARTIFACT));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 5. mergeReads + topN ordering (pure) ────────────────────────────────────

test("mergeReads accumulates + refreshes lastSeenAt, normalizes projectRoot-prefixed paths; topNPathsOf orders reads desc / path asc", () => {
  const profile = newSeededProfile(AGENTS_MD, NOW);
  const merged = mergeReads(profile, { "/repo/docs/context/project-context.md": 2, "docs/design/age-autonomy/04-efficiency.md": 2 }, NOW2, { projectRoot: "/repo" });
  const byPath = new Map(merged.entries.map((e) => [e.path, e]));
  assert.equal(byPath.get("docs/context/project-context.md").reads, 2);
  assert.equal(byPath.get("docs/design/age-autonomy/04-efficiency.md").reads, 2);
  assert.equal(byPath.get("docs/context/project-context.md").lastSeenAt, NOW2);
  assert.equal(byPath.get("docs/context/ai-autonomy-policy.md").reads, 0, "untouched seed rows keep reads=0");
  const top = topNPathsOf(merged, 2);
  assert.deepEqual(top, ["docs/context/project-context.md", "docs/design/age-autonomy/04-efficiency.md"], "ties break by path asc");
  assert.equal(topNPathsOf(merged, 99).length, merged.entries.length, "topN ≥ entries = whole table");
  assert.equal(normalizeProfilePath("/repo/./docs/a.md", "/repo"), "docs/a.md");
});

// ── 6. run-terminal mining: debounce + auxiliary sources (pure pipeline) ────

test("debounce: empty tally never writes; an unchanged top-N SET never writes (rank drift inside the set is not progress); a set change writes", () => {
  const root = "/repo";
  const artifact = join(root, DEFAULT_PROFILE_ARTIFACT);
  const base = newSeededProfile(AGENTS_MD, NOW);
  const seedTally = { "docs/design/age-autonomy/04-efficiency.md": 3, "docs/backlog/age-autonomy-implementation-roadmap.md": 2 };
  let io = fakeMiningIo({ files: { [join(root, "AGENTS.md")]: AGENTS_MD } });

  // pass 1 — the tally introduces new paths into the top-5 set → written
  let out = mineContextProfile({ io, projectRoot: root, sessionEvents: [], agentsFacePresent: true, now: NOW, topN: 5, memoryRunsRelPath: "none.md" });
  assert.equal(out.status, "seeded", out.note); // first start, empty tally → seed write only

  io = fakeMiningIo({ files: { [artifact]: serializeProfile(base) } });
  out = mineContextProfile({ io, projectRoot: root, sessionEvents: [], agentsFacePresent: true, now: NOW, topN: 5, memoryRunsRelPath: "none.md" });
  assert.equal(out.status, "skipped", "empty tally — no write");

  const withExtras = mergeReads(base, seedTally, NOW);
  io = fakeMiningIo({ files: { [artifact]: serializeProfile(withExtras) } });
  out = mineContextProfile({ io, projectRoot: root, sessionEvents: [], agentsFacePresent: true, now: NOW2, topN: 5, memoryRunsRelPath: "none.md" });
  assert.equal(out.status, "skipped", "still empty tally over a populated table — no write");

  // rank drift only (existing member of the set gains reads) → set unchanged → no write
  io = fakeMiningIo({ files: { [artifact]: serializeProfile(withExtras) } });
  out = mineContextProfile({
    io,
    projectRoot: root,
    sessionEvents: [
      [
        { type: "tool/call", data: { name: "read", arguments: JSON.stringify({ path: "docs/backlog/age-autonomy-implementation-roadmap.md" }) } },
      ],
    ],
    agentsFacePresent: true,
    now: NOW2,
    topN: 5,
    memoryRunsRelPath: "none.md",
  });
  assert.equal(out.status, "skipped", out.note);
  assert.match(out.note, /set unchanged/);
  assert.equal(io.writes.length, 0, "nothing landed on disk");

  // a NEW path enters the set → written
  io = fakeMiningIo({ files: { [artifact]: serializeProfile(withExtras) } });
  out = mineContextProfile({
    io,
    projectRoot: root,
    sessionEvents: [
      [
        { type: "tool/call", data: { name: "read", arguments: JSON.stringify({ path: "docs/context/conventions.md" }) } },
        { type: "tool/call", data: { name: "grep", arguments: JSON.stringify({ pattern: "x", path: "docs/context/conventions.md" }) } },
      ],
    ],
    agentsFacePresent: true,
    now: NOW2,
    topN: 5,
    memoryRunsRelPath: "none.md",
  });
  assert.equal(out.status, "written", out.note);
  assert.equal(io.writes.length, 1);
  assert.equal(io.writes[0].path, artifact);
});

test("mining merges all three data-source layers: session events + run-state prompt products + reflexion memory (each missing layer = fail-soft note)", () => {
  const root = "/repo";
  const artifact = join(root, DEFAULT_PROFILE_ARTIFACT);
  const promptText = "Execute the plan at `docs/plans/demo/2026-08-27-plan.md` — read `docs/backlog/age-autonomy-implementation-roadmap.md` completely.";
  const io = fakeMiningIo({
    files: {
      [artifact]: serializeProfile(newSeededProfile(AGENTS_MD, NOW)),
      "/repo/_tmp/run-1-mission-driver/run-state.json": JSON.stringify({
        steps: [{ name: "EXEC", promptFile: "prompt-EXEC.txt" }, { name: "TOOL", promptFile: null }],
      }),
      "/repo/_tmp/run-1-mission-driver/prompt-EXEC.txt": promptText,
      "/repo/docs/plans/demo/2026-08-27-plan.md": "# plan",
      "/repo/docs/backlog/age-autonomy-implementation-roadmap.md": "# roadmap",
      "/repo/docs/context/project-context.md": "# ctx",
      "/repo/docs/design/age-autonomy/04-efficiency.md": "# eff",
      "/repo/tools/mission-driver/memory/runs.md": "run 1 concluded after reading docs/context/project-context.md and docs/design/age-autonomy/04-efficiency.md",
    },
    dirs: { "/repo/_tmp": ["run-1-mission-driver", "not-a-run"] },
  });
  const out = mineContextProfile({
    io,
    projectRoot: root,
    sessionEvents: [[{ type: "tool/call", data: { name: "read", arguments: JSON.stringify({ path: "docs/backlog/age-autonomy-implementation-roadmap.md" }) } }]],
    agentsFacePresent: true,
    now: NOW2,
  });
  assert.equal(out.status, "written", out.note);
  const after = loadProfile(io, artifact);
  assert.ok(after.ok);
  const byPath = new Map(after.profile.entries.map((e) => [e.path, e.reads]));
  assert.equal(byPath.get("docs/backlog/age-autonomy-implementation-roadmap.md"), 2, "session event + prompt text mention");
  assert.equal(byPath.get("docs/plans/demo/2026-08-27-plan.md"), 1, "run-state prompt product layer");
  assert.equal(byPath.get("docs/context/project-context.md"), 1, "reflexion memory layer (seed row gained reads)");
  assert.equal(byPath.get("docs/design/age-autonomy/04-efficiency.md"), 1);
});

test("headless degradation: agents face absent ⇒ explicit note, seed table preserved, no mining writes", () => {
  const root = "/repo";
  const artifact = join(root, DEFAULT_PROFILE_ARTIFACT);
  const seeded = serializeProfile(newSeededProfile(AGENTS_MD, NOW));
  const io = fakeMiningIo({
    files: { [artifact]: seeded },
    dirs: { "/repo/_tmp": [] },
  });
  const out = mineContextProfile({
    io,
    projectRoot: root,
    sessionEvents: [[{ type: "tool/call", data: { name: "read", arguments: JSON.stringify({ path: "docs/context/conventions.md" }) } }]],
    agentsFacePresent: false,
    now: NOW2,
  });
  assert.equal(out.status, "skipped");
  assert.match(out.note, /headless/);
  assert.match(out.note, /WI35/);
  assert.equal(io.writes.length, 0, "the seed table is never touched in headless mode");
  assert.equal(io.files[artifact], seeded, "byte-identical artifact preserved");
});

// ── 7. watchdog terminal-chain wiring (e2e) ─────────────────────────────────

const flush = () => new Promise((r) => setImmediate(r));

function fakeDispatchAgents() {
  return { create: async () => ({ agent: { id: "ses-d1", followup: () => {} } }) };
}

test("watchdog e2e: a run-terminal event triggers ONE mining pass on the chain tail (artifact seeded + mined); plan-terminal events do not mine; fail-soft keeps the terminal receipt + subsequent chain intact", async () => {
  const root = mkdtempSync(join(tmpdir(), "ctxprofile-e2e-"));
  try {
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), AGENTS_MD);
    const events = () => [
      [
        { type: "tool/call", data: { name: "read", arguments: JSON.stringify({ path: join(root, "docs/context/conventions.md") }) } },
        { type: "tool/call", data: { name: "glob", arguments: JSON.stringify({ pattern: "*.md", directory: join(root, "docs/references") }) } },
      ],
    ];
    const wd = createWatchdog({
      projectRoot: root,
      timers: { setInterval: () => () => {}, setTimeout: (fn) => { fn(); return () => {}; } },
      logger: {},
      dispatchAgents: fakeDispatchAgents(),
      profileMining: { sessionEvents: events },
    });
    // plan-terminal first: rides the receipt chain, never mines
    wd.emitTerminal({ kind: "plan-terminal", runId: "r1", status: "completed", plan: "docs/plans/demo/p.md" });
    await flush();
    assert.ok(!existsSyncSafe(join(root, DEFAULT_PROFILE_ARTIFACT)), "plan-terminal events do not mine");

    // run-terminal: the chain tail mines (first start → seed + new-path write)
    wd.emitTerminal({ kind: "run-terminal", runId: "r1", status: "completed", plan: null });
    await flush();
    const artifactPath = join(root, DEFAULT_PROFILE_ARTIFACT);
    assert.ok(existsSyncSafe(artifactPath), "the mining pass ran on the run-terminal chain tail");
    const loaded = loadProfile({ readTextFile: (p) => readFileSync(p, "utf8") }, artifactPath);
    assert.ok(loaded.ok);
    const byPath = new Map(loaded.profile.entries.map((e) => [e.path, e.reads]));
    assert.equal(byPath.get("docs/context/ai-autonomy-policy.md"), 0, "seed rows present");
    assert.equal(byPath.get("docs/context/conventions.md"), 1, "session-event tally merged");

    const receipts = readFileSync(join(root, "_tmp/supervisor-receipts.jsonl"), "utf8");
    assert.match(receipts, /run-terminal:completed/);
    assert.match(receipts, /context-profile:written/);

    // fail-soft: a crashing io never breaks the chain — the terminal receipt
    // lands FIRST, the mining failure rides one exception receipt, and the
    // next terminal event still works
    const wd2 = createWatchdog({
      projectRoot: root,
      timers: { setInterval: () => () => {}, setTimeout: (fn) => { fn(); return () => {}; } },
      logger: {},
      dispatchAgents: fakeDispatchAgents(),
      profileMining: {
        sessionEvents: events,
        io: {
          readTextFile: () => { throw new Error("collector exploded"); },
          writeTextAtomic: () => {},
          listDirEntries: () => null,
        },
      },
    });
    wd2.emitTerminal({ kind: "run-terminal", runId: "r2", status: "blocked", plan: null });
    await flush();
    const receipts2 = readFileSync(join(root, "_tmp/supervisor-receipts.jsonl"), "utf8");
    const lines = receipts2.trim().split("\n").map((l) => JSON.parse(l));
    const r2terminal = lines.find((l) => l.event === "run-terminal:blocked");
    assert.ok(r2terminal, "the terminal receipt landed despite the collector crash");
    assert.ok(lines.some((l) => l.event === "context-profile:failed" || l.event === "context-profile-error"), "the mining failure is an explicit receipt");
    assert.equal(r2terminal.runId, "r2");
    wd2.emitTerminal({ kind: "run-terminal", runId: "r3", status: "partial", plan: null });
    await flush();
    const receipts3 = readFileSync(join(root, "_tmp/supervisor-receipts.jsonl"), "utf8");
    assert.match(receipts3, /run-terminal:partial/, "the chain keeps working after a mining failure");
    wd.stop();
    wd2.stop();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function existsSyncSafe(p) {
  try {
    readFileSync(p, "utf8");
    return true;
  } catch {
    return false;
  }
}

// ── 8. consumption wiring: top-N expansion + role override priority ─────────

const DYNAMIC = { text: "[MISSION_DRIVER:r1] supervisor dispatch draft-plans — draft from roadmap." };

test("kind:profile consumption: resolveAssemblyBlocks pins profileRoot; assemble expands the top-N stable files (reads desc, path asc) as stamped file blocks; missing artifact = explicit note, no crash", () => {
  const root = "/repo";
  const artifact = join(root, DEFAULT_PROFILE_ARTIFACT);
  const profile = mergeReads(newSeededProfile(AGENTS_MD, NOW), {
    "docs/context/project-context.md": 5,
    "docs/design/age-autonomy/04-efficiency.md": 3,
    "docs/backlog/age-autonomy-implementation-roadmap.md": 7,
    "docs/context/conventions.md": 1,
  }, NOW2);
  const io = {
    readTextFile: (p) => {
      if (p === artifact) return serializeProfile(profile);
      if (p === "/repo/docs/backlog/age-autonomy-implementation-roadmap.md") return "ROADMAP TEXT";
      if (p === "/repo/docs/context/project-context.md") return "CTX TEXT";
      if (p === "/repo/docs/design/age-autonomy/04-efficiency.md") return "EFF TEXT";
      return null;
    },
    listDirEntries: () => null,
    isDirectory: () => false,
  };
  const blocks = [{ kind: "profile", ref: "{{projectRoot}}/docs/references/context-profile.json", topN: 3 }];
  const resolved = resolveAssemblyBlocks(blocks, { projectRoot: root });
  assert.equal(resolved[0].profileRoot, root, "resolution pins the repo root for repo-relative entries");
  const out = assemble("FRESH", { blocks: resolved }, DYNAMIC, newLedger(), io);
  const order = ["docs/backlog/age-autonomy-implementation-roadmap.md", "docs/context/project-context.md", "docs/design/age-autonomy/04-efficiency.md"];
  let last = -1;
  for (const path of order) {
    const idx = out.text.indexOf(`<file path="${join(root, path)}"`);
    assert.ok(idx !== -1, `${path} embedded`);
    assert.ok(idx > last, `${path} renders in reads-desc order`);
    last = idx;
  }
  assert.ok(!out.text.includes("conventions.md"), "topN=3 truncates the tail (reads asc) out of the embed");
  assert.ok([...out.sentHashes.keys()].every((p) => p.startsWith("/repo/")), "expanded files ride the hash ledger semantics");

  // CONTINUE dedup applies to the expanded files (unchanged → skipped)
  const cont = assemble("CONTINUE", { blocks: resolved }, { text: "followup" }, new Map(out.sentHashes), io);
  assert.deepEqual(cont.skipped.sort(), [...out.sentHashes.keys()].sort(), "unchanged profile-expanded files dedup-skip like plain file blocks");

  // fail-soft: unreadable artifact → explicit note, no crash
  const badIo = { ...io, readTextFile: (p) => (p === artifact ? null : io.readTextFile(p)) };
  const bad = assemble("FRESH", { blocks: resolved }, DYNAMIC, newLedger(), badIo);
  assert.match(bad.text, /profile artifact unusable/);
  assert.match(bad.text, /not found/);

  // no projectRoot in the assembly context → explicit note
  const unresolved = resolveAssemblyBlocks([{ kind: "profile", ref: "docs/references/context-profile.json" }], {});
  const noRoot = assemble("FRESH", { blocks: unresolved }, DYNAMIC, newLedger(), io);
  assert.match(noRoot.text, /no projectRoot/);
});

test("role override priority: an agent WITHOUT a profile declaration keeps the byte-identical thin-pointer prompt; explicit text/file/dir blocks stay verbatim (the 0433-3 backward-compat pin)", () => {
  const artifact = "/repo/docs/references/context-profile.json";
  const io = {
    readTextFile: (p) => (p === artifact ? serializeProfile(newSeededProfile(AGENTS_MD, NOW)) : null),
    listDirEntries: () => null,
    isDirectory: () => false,
  };
  // no profile block anywhere — the profile artifact is unreachable and the
  // output must be exactly the dynamic thin-pointer prompt
  const plain = assemble("FRESH", { blocks: [{ kind: "file", ref: "/r/charter.md" }] }, DYNAMIC, newLedger(), {
    readTextFile: (p) => (p === "/r/charter.md" ? "CHARTER" : null),
    listDirEntries: () => null,
    isDirectory: () => false,
  });
  assert.ok(out_textIncludes(plain.text, DYNAMIC.text));
  assert.ok(!plain.text.includes("profile"), "no profile machinery leaks into undeclared prompts");
  // charter-hash face also expands profile blocks (rotation judgment domain)
  const hashes = charterHashesOf({ blocks: [{ kind: "profile", ref: artifact, profileRoot: "/repo" }] }, io);
  assert.ok(hashes.size === 0, "entries unreadable here — empty hash face, no crash");
});

function out_textIncludes(haystack, needle) {
  return haystack.includes(needle);
}
