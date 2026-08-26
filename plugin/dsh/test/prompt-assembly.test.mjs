/**
 * prompt-assembly.test.mjs — efficiency-layer PromptAssembler truth table
 * (age-autonomy M4-WI33, plan `docs/plans/age-autonomy/2026-08-27-0433-3`
 * Phase 3 Proof; the WI36 gate lower bound ≥12 lives here).
 *
 * Coverage matrix:
 *   - FRESH byte order + determinism: fixed blocks in declared order, the
 *     dynamic task block LAST, byte-identical across repeated assemblies
 *     (04 §3.1/§3.2 — the prefix-cache face)
 *   - prefix discipline: volatile bytes (timestamp) render AFTER the
 *     dynamic block; the fixed region stays byte-stable while volatile
 *     churns (04 §3.2)
 *   - CONTINUE dedup: unchanged files skipped (hash three-use ①), output
 *     carries only the dynamic delta
 *   - file changed → full resend with the NEW hash (three-use ②)
 *   - directory full-text embed: every top-level file, sorted, no
 *     recursion into subdirectories (04 §3.3)
 *   - maxFileBytes over-cap: EXPLICIT exclusion note, never silent
 *     truncation (04 §3.3)
 *   - hash ledger: hash8 = first 8 hex of sha256 (algorithm source =
 *     computeBasisHash); commit protocol advances the dispatch counter
 *     without polluting the file keys
 *   - text-kind verbatim vs file-kind stamped; embedStamp template
 *     override (schema face)
 *   - compaction counter: the 8th CONTINUE dispatch re-sends the full
 *     charter (04 §3.3 — not fighting the compactor)
 *   - charter-hash rotation judgment (04 §2.2 leg 2): change / add /
 *     remove / sentinel-immunity
 *   - unreadable files: explicit missing-note, never a crash
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assemble,
  charterHashesOf,
  charterHashesDiffer,
  commitToLedger,
  hash8Of,
  newLedger,
  renderEmbedStamp,
  resolveAssemblyBlocks,
  COMPACTION_RESEND_EVERY,
} from "../src/efficiency/prompt-assembler.ts";
import { createAgentPool } from "../src/efficiency/agent-pool.ts";
import { createDispatchAgent, dispatchPromptFor, dispatchPromptOf } from "../src/supervisor/exec-arm.ts";
import { DshNativeExecutor } from "../src/native-executor.ts";
import { createFakeAgentsService } from "./helpers/fake-agents.mjs";
import { DEFAULT_EMBED_STAMP, parsePolicy } from "../assets/src/law-policy.mjs";

// ── in-memory io (the injectable file face) ─────────────────────────────────

/** Deterministic io: explicit files map + dirs map { dir: [names] } + isDirs set. */
function fakeIo({ files = {}, dirs = {}, isDirs = [] } = {}) {
  const dirSet = new Set(isDirs);
  return {
    readTextFile: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    listDirEntries: (p) => (Object.prototype.hasOwnProperty.call(dirs, p) ? [...dirs[p]] : null),
    isDirectory: (p) => dirSet.has(p),
  };
}

const sha8 = (s) => createHash("sha256").update(s, "utf8").digest("hex").slice(0, 8);

const SPEC = { blocks: [{ kind: "file", ref: "/r/charter.md" }] };
const DYNAMIC = { text: "[MISSION_DRIVER:r1] supervisor dispatch plan-review — review the plan at `/r/p.md`." };

// ── 1. FRESH byte order + determinism ────────────────────────────────────────

test("FRESH byte order: fixed blocks first (declared order), dynamic block LAST, byte-identical across calls (04 §3.1/§3.2)", () => {
  const io = fakeIo({ files: { "/r/persona.md": "PERSONA TEXT", "/r/charter.md": "CHARTER TEXT" } });
  const spec = {
    blocks: [
      { kind: "text", ref: "/r/persona.md" },
      { kind: "file", ref: "/r/charter.md" },
    ],
  };
  const a = assemble("FRESH", spec, DYNAMIC, newLedger(), io);
  const b = assemble("FRESH", spec, DYNAMIC, newLedger(), io);
  assert.equal(a.text, b.text, "two FRESH assemblies over the same files are byte-identical (no clock in the fixed region)");
  const personaIdx = a.text.indexOf("PERSONA TEXT");
  const charterIdx = a.text.indexOf("CHARTER TEXT");
  const dynamicIdx = a.text.indexOf(DYNAMIC.text);
  assert.ok(personaIdx !== -1 && charterIdx !== -1 && dynamicIdx !== -1);
  assert.ok(personaIdx < charterIdx, "text block renders in declared order before the file block");
  assert.ok(charterIdx < dynamicIdx, "the dynamic task block is LAST (fixed bytes first)");
  assert.ok(a.text.includes(`<file path="/r/charter.md" hash="${sha8("CHARTER TEXT")}">CHARTER TEXT</file>`), "file-kind embeds through the default stamp");
  assert.deepEqual(
    [...a.sentHashes.entries()].sort(),
    [["/r/charter.md", sha8("CHARTER TEXT")], ["/r/persona.md", sha8("PERSONA TEXT")]].sort(),
    "ledger records every charter file (text blocks tracked too — rotation/dedup domain)",
  );
});

// ── 2. prefix discipline: volatile bytes last ────────────────────────────────

test("prefix discipline: volatile suffix renders AFTER the dynamic block; the fixed region stays byte-stable (04 §3.2)", () => {
  const io = fakeIo({ files: { "/r/charter.md": "CHARTER TEXT" } });
  const t1 = assemble("FRESH", SPEC, { ...DYNAMIC, volatile: "turn 1 @ 2026-08-27T04:33:00Z" }, newLedger(), io);
  const t2 = assemble("FRESH", SPEC, { ...DYNAMIC, volatile: "turn 2 @ 2026-08-27T05:00:00Z" }, newLedger(), io);
  assert.ok(t1.text.indexOf("turn 1 @") > t1.text.indexOf(DYNAMIC.text), "volatile bytes come after the dynamic block");
  const fixed1 = t1.text.slice(0, t1.text.indexOf(DYNAMIC.text));
  const fixed2 = t2.text.slice(0, t2.text.indexOf(DYNAMIC.text));
  assert.equal(fixed1, fixed2, "the fixed prefix is byte-stable while volatile bytes churn — prefix-cache safe");
});

// ── 3. CONTINUE dedup: unchanged files skipped ───────────────────────────────

test("CONTINUE dedup: unchanged files are skipped — the followup carries only the dynamic delta (hash three-use ①)", () => {
  const io = fakeIo({ files: { "/r/charter.md": "CHARTER TEXT" } });
  const ledger = newLedger();
  const fresh = assemble("FRESH", SPEC, DYNAMIC, ledger, io);
  commitToLedger(ledger, fresh);
  const cont = assemble("CONTINUE", SPEC, { text: "followup: the same task continues" }, ledger, io);
  assert.deepEqual(cont.skipped, ["/r/charter.md"], "the unchanged charter file is dedup-skipped");
  assert.equal(cont.text, "followup: the same task continues", "CONTINUE output = the dynamic block only");
  assert.deepEqual(cont.embedded, [], "nothing re-embedded");
  assert.equal(cont.fullResend, false);
});

// ── 4. file changed → full resend with the new hash ──────────────────────────

test("file changed → full resend: a hash mismatch re-embeds the whole file under its NEW hash (three-use ②)", () => {
  const files = { "/r/charter.md": "CHARTER v1" };
  const io = fakeIo({ files });
  const ledger = newLedger();
  commitToLedger(ledger, assemble("FRESH", SPEC, DYNAMIC, ledger, io));
  files["/r/charter.md"] = "CHARTER v2 — edited upstream";
  const cont = assemble("CONTINUE", SPEC, { text: "followup" }, ledger, io);
  assert.deepEqual(cont.changed, ["/r/charter.md"], "the changed file is named");
  assert.ok(cont.text.includes(`hash="${sha8("CHARTER v2 — edited upstream")}"`), "the resend carries the NEW hash");
  assert.ok(cont.text.includes("CHARTER v2 — edited upstream"), "changed files resend FULL content, not a diff");
});

// ── 5. directory full-text embed ─────────────────────────────────────────────

test("directory full-text embed: every top-level file, sorted, subdirectories skipped (04 §3.3)", () => {
  const io = fakeIo({
    files: { "/r/docs/b.md": "B", "/r/docs/a.md": "A", "/r/docs/c.md": "C" },
    dirs: { "/r/docs": ["b.md", "sub", "a.md", "c.md"] },
    isDirs: ["/r/docs/sub"],
  });
  const spec = { blocks: [{ kind: "dir", ref: "/r/docs", maxFileBytes: 5000 }] };
  const out = assemble("FRESH", spec, DYNAMIC, newLedger(), io);
  const aIdx = out.text.indexOf(">A<");
  const bIdx = out.text.indexOf(">B<");
  const cIdx = out.text.indexOf(">C<");
  assert.ok(aIdx !== -1 && bIdx !== -1 && cIdx !== -1, "all files embedded");
  assert.ok(aIdx < bIdx && bIdx < cIdx, "deterministic sorted order");
  assert.ok(!out.text.includes("/r/docs/sub"), "no recursion into subdirectories");
});

// ── 6. maxFileBytes over-cap → explicit note ─────────────────────────────────

test("maxFileBytes over-cap: EXPLICIT exclusion note inside the stamp — never a silent truncation (04 §3.3)", () => {
  const big = "x".repeat(300);
  const io = fakeIo({ files: { "/r/big.md": big } });
  const spec = { blocks: [{ kind: "file", ref: "/r/big.md", maxFileBytes: 100 }] };
  const out = assemble("FRESH", spec, DYNAMIC, newLedger(), io);
  assert.match(out.text, /\[NOT EMBEDDED: 300 bytes exceeds maxFileBytes 100/);
  assert.ok(out.text.includes(`hash="${sha8(big)}"`), "the stamp still carries path+hash — grep-auditable");
  assert.ok(!out.text.includes(big), "no partial content leaked");
});

// ── 7. hash ledger semantics + commit protocol ───────────────────────────────

test("hash ledger: hash8 = first 8 hex of sha256 (computeBasisHash algorithm source); commit advances the counter without polluting file keys", () => {
  assert.equal(hash8Of("abc"), sha8("abc"));
  assert.match(hash8Of("abc"), /^[0-9a-f]{8}$/);
  const io = fakeIo({ files: { "/r/charter.md": "C" } });
  const ledger = newLedger();
  const fresh = assemble("FRESH", SPEC, DYNAMIC, ledger, io);
  assert.ok(![...fresh.sentHashes.keys()].some((k) => k.startsWith("__")), "sentHashes carries no sentinel keys");
  commitToLedger(ledger, fresh);
  assert.equal(ledger.get("/r/charter.md"), sha8("C"), "committed file hash");
  const before = assemble("CONTINUE", SPEC, DYNAMIC, ledger, io);
  assert.equal(before.fullResend, false, "counter 1 — no compaction resend yet");
  assert.equal(renderEmbedStamp(DEFAULT_EMBED_STAMP, { path: "p", hash8: "h", content: "c" }), '<file path="p" hash="h">c</file>', "default stamp renders all three slots");
});

// ── 8. text-kind verbatim vs file-kind stamped + template override ──────────

test("text-kind renders verbatim (persona face); embedStamp template override re-shapes every stamp (schema face)", () => {
  const io = fakeIo({ files: { "/r/persona.md": "YOU ARE THE DRAFTER.", "/r/charter.md": "CHARTER" } });
  const spec = {
    blocks: [
      { kind: "text", ref: "/r/persona.md" },
      { kind: "file", ref: "/r/charter.md" },
    ],
    embedStamp: '<doc src="{path}" sum="{hash8}">{content}</doc>',
  };
  const out = assemble("FRESH", spec, DYNAMIC, newLedger(), io);
  assert.ok(out.text.includes("YOU ARE THE DRAFTER."), "text block content lands");
  assert.ok(!out.text.includes("<doc src=\"/r/persona.md\""), "text block: verbatim, NO stamp wrapper (persona face)");
  assert.ok(out.text.includes(`<doc src="/r/charter.md" sum="${sha8("CHARTER")}">CHARTER</doc>`), "file block: the overridden template shapes the stamp");
});

// ── 9. compaction counter: periodic full charter re-send ─────────────────────

test("compaction counter: the COMPACTION_RESEND_EVERY-th CONTINUE dispatch re-sends the full charter despite unchanged hashes (04 §3.3)", () => {
  const io = fakeIo({ files: { "/r/charter.md": "CHARTER TEXT" } });
  const ledger = newLedger();
  commitToLedger(ledger, assemble("FRESH", SPEC, DYNAMIC, ledger, io));
  let resend = null;
  for (let i = 0; i < COMPACTION_RESEND_EVERY; i++) {
    const out = assemble("CONTINUE", SPEC, { text: `followup ${i}` }, ledger, io);
    if (out.fullResend) resend = { i, out };
    commitToLedger(ledger, out);
  }
  assert.ok(resend !== null, `exactly the ${COMPACTION_RESEND_EVERY}-th CONTINUE triggers the full re-send`);
  assert.deepEqual(resend.out.embedded, ["/r/charter.md"], "the unchanged charter file is re-embedded anyway — trimmed-by-compaction blocks come back");
});

// ── 10. charter-hash rotation judgment (04 §2.2 leg 2) ──────────────────────

test("charter-hash rotation judgment: change / add / remove all differ; the __sends sentinel never counts as a file", () => {
  const files = { "/r/a.md": "A", "/r/b.md": "B" };
  const io = fakeIo({ files });
  const spec = { blocks: [{ kind: "file", ref: "/r/a.md" }, { kind: "file", ref: "/r/b.md" }] };
  const ledger = newLedger();
  commitToLedger(ledger, assemble("FRESH", spec, DYNAMIC, ledger, io));
  assert.equal(charterHashesDiffer(charterHashesOf(spec, io), ledger), false, "unchanged + sentinel present → same generation");
  files["/r/a.md"] = "A2";
  assert.equal(charterHashesDiffer(charterHashesOf(spec, io), ledger), true, "content change → rotate");
  files["/r/a.md"] = "A";
  files["/r/c.md"] = "C";
  const specPlus = { blocks: [...spec.blocks, { kind: "file", ref: "/r/c.md" }] };
  assert.equal(charterHashesDiffer(charterHashesOf(specPlus, io), ledger), true, "added charter file → rotate");
  delete files["/r/b.md"];
  assert.equal(charterHashesDiffer(charterHashesOf(spec, io), ledger), true, "removed charter file → rotate");
});

// ── 11. unreadable files: explicit note, never a crash ───────────────────────

test("unreadable charter file: explicit missing-note, the dispatch prompt still assembles (fail-soft)", () => {
  const io = fakeIo({ files: {} });
  const out = assemble("FRESH", SPEC, DYNAMIC, newLedger(), io);
  assert.match(out.text, /\[prompt-assembler\] file unreadable: \/r\/charter\.md \(not embedded\)/);
  assert.ok(out.text.includes(DYNAMIC.text), "the dynamic block still lands");
  const dirOut = assemble("FRESH", { blocks: [{ kind: "dir", ref: "/r/gone", maxFileBytes: 10 }] }, DYNAMIC, newLedger(), io);
  assert.match(dirOut.text, /directory unreadable: \/r\/gone/);
});

// ── 12. placeholder resolution + policy schema same-source face ─────────────

test("block placeholder resolution + the real policy's assembly face parse through the same law-policy source", () => {
  const resolved = resolveAssemblyBlocks(
    [{ kind: "file", ref: "{{projectRoot}}/docs/context/project-context.md" }],
    { projectRoot: "/repo" },
  );
  assert.equal(resolved[0].ref, "/repo/docs/context/project-context.md");
  assert.equal(resolveAssemblyBlocks([{ kind: "text", ref: "{projectRoot}/AGENTS.md" }], { projectRoot: "/r" })[0].ref, "{projectRoot}/AGENTS.md", "single-brace tokens untouched (poolKey discipline)");
  const policy = parsePolicy("version: 1\nassembly:\n  embedStamp: '<f p=\"{path}\" h=\"{hash8}\">{content}</f>'\n  continueDelta: false\n");
  assert.equal(policy.ok, true, policy.errors?.join(";"));
  assert.equal(policy.policy.assembly.continueDelta, false);
});

// ── 13. pool dual-mode wiring (exec-arm createDispatchAgent + dispatchPromptFor) ──

/** Minimal agents double: records creates, captures followups, live `get`. */
function fakeDispatchAgents() {
  const state = { creates: [], followups: [] };
  const live = new Set();
  const service = {
    get: (id) =>
      live.has(id)
        ? { followup: (m) => state.followups.push({ sessionId: id, text: (m.content || []).map((b) => b.text).join("\n") }) }
        : undefined,
    async create(options) {
      state.creates.push(options);
      const id = options?.sessionId || `mdsup-${state.creates.length}`;
      live.add(id);
      return { agent: { id, followup: (m) => state.followups.push({ sessionId: id, text: (m.content || []).map((b) => b.text).join("\n") }) } };
    },
  };
  return { service, state };
}

/** Injectable pool timers (idle-TTL never arms a REAL 30-min timeout — the run must drain). */
function poolTimers() {
  return { setTimeout: () => () => {} };
}

const CHARTER = "/proj/docs/context/project-context.md";
const FIXED_POLICY = {
  assembly: { continueDelta: true },
  agents: {
    drafter: {
      mode: "pooled",
      poolKey: "drafter:{projectRoot}",
      fixedPrefix: [{ kind: "file", ref: CHARTER }],
      model: { provider: "zhipuai", model: "glm-5.2" },
    },
  },
};
const DRAFTER_BINDING = { agentName: "drafter", mode: "pooled", provider: "zhipuai", model: "glm-5.2", modelDef: {} };
const BASE_ARGS = { dispatchType: "draft-plans", target: "/proj/docs/backlog/r.md", registeredId: null, runId: "r1" };

test("pool dual-mode: create ⇒ FRESH (charter embedded), followup ⇒ CONTINUE (delta only), charter change ⇒ rotation + FRESH resend (04 §2.2 leg 2)", async () => {
  const files = { [CHARTER]: "PROJECT CONTEXT v1" };
  const io = fakeIo({ files });
  const fake = fakeDispatchAgents();
  const pool = createAgentPool({ timers: poolTimers(), clock: () => 0 });
  const acquire = () =>
    createDispatchAgent(fake.service, DRAFTER_BINDING, {
      projectRoot: "/proj",
      label: "t",
      pool,
      dispatchType: "draft-plans",
      policy: FIXED_POLICY,
      assemblerIo: io,
    });

  const first = await acquire();
  assert.equal(first.status, "created");
  assert.equal(first.promptAssembly.mode, "FRESH", "pool create = one-shot full send");
  const p1 = dispatchPromptFor({ base: BASE_ARGS, policy: FIXED_POLICY, agentName: "drafter", assembly: first.promptAssembly, assemblerIo: io });
  assert.ok(p1.includes(`<file path="${CHARTER}" hash="${sha8("PROJECT CONTEXT v1")}">PROJECT CONTEXT v1</file>`), "FRESH embeds the charter before the dynamic block");
  assert.ok(p1.indexOf(CHARTER) < p1.indexOf(dispatchPromptOf(BASE_ARGS)), "fixed bytes precede the thin-pointer dynamic block");
  assert.ok(p1.includes(dispatchPromptOf(BASE_ARGS)), "the thin-pointer prompt IS the dynamic suffix (policy overlays, never replaces — 04 §7)");

  const second = await acquire();
  assert.equal(second.sessionId, first.sessionId, "same member reused");
  assert.equal(second.promptAssembly.mode, "CONTINUE", "same-member followup = delta continue");
  const p2 = dispatchPromptFor({ base: BASE_ARGS, policy: FIXED_POLICY, agentName: "drafter", assembly: second.promptAssembly, assemblerIo: io });
  assert.equal(p2, dispatchPromptOf(BASE_ARGS), "CONTINUE output = the dynamic block only (unchanged charter skipped)");
  assert.ok(second.promptAssembly.sentHashes.get(CHARTER) === sha8("PROJECT CONTEXT v1"), "member ledger carries the sent hash");

  files[CHARTER] = "PROJECT CONTEXT v2 — upstream edited";
  const third = await acquire();
  assert.notEqual(third.sessionId, first.sessionId, "charter hash change forces member rotation (04 §2.2 leg 2)");
  assert.equal(third.promptAssembly.mode, "FRESH", "the replacement member starts fresh — no in-session state guessed (P2 posture)");
  const p3 = dispatchPromptFor({ base: BASE_ARGS, policy: FIXED_POLICY, agentName: "drafter", assembly: third.promptAssembly, assemblerIo: io });
  assert.ok(p3.includes(">PROJECT CONTEXT v2 — upstream edited</file>"), "the changed charter re-sends in full under the new hash");
  assert.ok(pool.attemptStale(first.sessionId), "the rotated-out member's attempts are stale");
});

// ── 14. backward-compat pin: undeclared deployments byte-identical ──────────

test("undeclared assembly/fixedPrefix: the dispatch prompt path is BYTE-IDENTICAL pre/post wiring (deployment face zero-change pin)", async () => {
  const io = fakeIo({ files: { [CHARTER]: "X" } });
  const fake = fakeDispatchAgents();
  const pool = createAgentPool({ timers: poolTimers(), clock: () => 0 });
  const noPrefixPolicy = {
    agents: { drafter: { mode: "pooled", poolKey: "drafter:{projectRoot}", model: { provider: "zhipuai", model: "glm-5.2" } } },
  };
  const out = await createDispatchAgent(fake.service, DRAFTER_BINDING, {
    projectRoot: "/proj",
    label: "t",
    pool,
    dispatchType: "draft-plans",
    policy: noPrefixPolicy,
    assemblerIo: io,
  });
  assert.equal(out.status, "created");
  assert.equal(out.promptAssembly, undefined, "no fixedPrefix declared ⇒ no assembly material on the outcome");
  for (const assembly of [undefined, null, { mode: "CONTINUE", sentHashes: newLedger() }]) {
    assert.equal(
      dispatchPromptFor({ base: BASE_ARGS, policy: noPrefixPolicy, agentName: "drafter", assembly, assemblerIo: io }),
      dispatchPromptOf(BASE_ARGS),
      "the thin-pointer prompt passes through unchanged",
    );
  }
  assert.equal(
    dispatchPromptFor({ base: BASE_ARGS, policy: FIXED_POLICY, agentName: "ghost", assembly: { mode: "CONTINUE", sentHashes: newLedger() }, assemblerIo: io }),
    dispatchPromptOf(BASE_ARGS),
    "fixedPrefix policy but an agent without blocks ⇒ passthrough",
  );
});

// ── 15. continueDelta: false pins FRESH ──────────────────────────────────────

test("assembly.continueDelta: false pins every dispatch to FRESH (the explicit full-resend posture)", async () => {
  const io = fakeIo({ files: { [CHARTER]: "C" } });
  const fake = fakeDispatchAgents();
  const pool = createAgentPool({ timers: poolTimers(), clock: () => 0 });
  const noDeltaPolicy = { ...FIXED_POLICY, assembly: { continueDelta: false } };
  const acquire = () =>
    createDispatchAgent(fake.service, DRAFTER_BINDING, { projectRoot: "/proj", label: "t", pool, dispatchType: "draft-plans", policy: noDeltaPolicy, assemblerIo: io });
  const first = await acquire();
  dispatchPromptFor({ base: BASE_ARGS, policy: noDeltaPolicy, agentName: "drafter", assembly: first.promptAssembly, assemblerIo: io });
  const second = await acquire();
  assert.equal(second.sessionId, first.sessionId, "member reused (charter unchanged)");
  assert.equal(second.promptAssembly.mode, "CONTINUE", "the pool says CONTINUE (reused member)…");
  const prompt = dispatchPromptFor({ base: BASE_ARGS, policy: noDeltaPolicy, agentName: "drafter", assembly: second.promptAssembly, assemblerIo: io });
  assert.ok(prompt.includes(`<file path="${CHARTER}"`), "…but continueDelta: false overrides the mode to FRESH — the full charter re-sends");
});

// ── 16. native-executor assemblyPrefix (same-source composition) ────────────

test("native-executor: assemblyPrefix composes FRESH on the run child's first step, CONTINUE on later steps; absent ⇒ legacy prompt byte-identical", async () => {
  const dir = mkdtempSync(join(tmpdir(), "prompt-assembly-"));
  try {
    const charter = join(dir, "charter.md");
    writeFileSync(charter, "ENGINE CHARTER", "utf8");
    const fake = createFakeAgentsService({ script: ["ok", "ok"] });
    const ex = new DshNativeExecutor({
      agents: fake.service,
      config: {
        projectRoot: dir,
        assemblyPrefix: { blocks: [{ kind: "file", ref: charter }] },
      },
    });
    await ex.executeAgent("S1", "task one", "", null, undefined, undefined);
    await ex.executeAgent("S2", "task two", "", null, undefined, undefined);
    const [f1, f2] = fake.state.followups;
    assert.ok(f1.text.includes(`<file path="${charter}" hash="${sha8("ENGINE CHARTER")}">ENGINE CHARTER</file>`), "step 1 = FRESH: charter embedded first");
    assert.ok(f1.text.endsWith("[MISSION_DRIVER] task one"), "the engine prompt (marker included) is the dynamic suffix — promptsDir chain untouched (04 §7)");
    assert.ok(f1.text.indexOf(charter) < f1.text.indexOf("[MISSION_DRIVER]"), "prefix discipline: fixed bytes before the marker/dynamic block");
    assert.equal(f2.text, "[MISSION_DRIVER] task two", "step 2 = CONTINUE: the unchanged charter is dedup-skipped, dynamic block only");
    assert.equal(fake.state.creates.length, 1, "both steps rode the one run child (session continuity is the shared prefix)");
    await ex.dispose();

    const legacy = createFakeAgentsService({ script: ["ok"] });
    const ex2 = new DshNativeExecutor({ agents: legacy.service, config: { projectRoot: dir } });
    await ex2.executeAgent("S1", "task one", "", null, undefined, undefined);
    assert.equal(legacy.state.followups[0].text, "[MISSION_DRIVER] task one", "no assemblyPrefix ⇒ the legacy marked prompt, byte-identical");
    await ex2.dispose();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
