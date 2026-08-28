/**
 * host-harness-transport.test.mjs — pure-logic unit tests for the L3 harness
 * NDJSON transport (dsh-plugin M2-WI9, plan
 * docs/plans/dsh-plugin/2026-08-23-1621-1 Phase 2 Proof).
 *
 * Domain: fake child streams (PassThrough). Zero network, zero credentials,
 * zero spawn — the live spawn path is scripts/host-harness.mjs scenarios,
 * gated by scripts/verify-native.mjs (R3 §5 CI posture).
 *
 * Pins (plan Phase 2 Proof item):
 *   1. NDJSON frame splitting — one frame across chunk boundaries (half
 *      packets) and multiple frames inside one chunk
 *   2. request/response id pairing — concurrent requests, out-of-order
 *      responses resolve the right promise
 *   3. notifications never mispair — a method-only frame does not resolve a
 *      pending request; responses to unknown ids are ignored
 *   4. error responses reject with wire code + message preserved
 *   5. request timeout rejects while leaving the transport usable
 *   6. exit/EOF propagation — stream end rejects every pending request and
 *      notification waiter; outbound frame shape is exact compact JSON-RPC
 *   7. malformed JSON lines are ignored (counted), next frame survives
 *   8. waitForNotification resolves from history (already-arrived note) and
 *      from a late arrival
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { HarnessLineRpcTransport, RpcError } from "../scripts/host-harness.mjs";

function makeTransport({ defaultTimeoutMs = 5_000 } = {}) {
  const stdin = new PassThrough(); // client→server writes land here
  const stdout = new PassThrough(); // server→client frames are written here
  const h = new HarnessLineRpcTransport({ stdin, stdout, defaultTimeoutMs });
  h.start();
  const wroteFrames = [];
  stdin.on("data", (chunk) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.trim() !== "") wroteFrames.push(JSON.parse(line));
    }
  });
  return { h, stdin, stdout, wroteFrames };
}

const note = (method, params) => ({ jsonrpc: "2.0", method, params });

test("frame splitting: one frame across two chunks (half packet) is assembled", async () => {
  const { h, stdout } = makeTransport();
  const waiting = h.waitForNotification((n) => n.method === "session.status", { label: "idle" });
  stdout.write('{"jsonrpc":"2.0","met');
  stdout.write('hod":"session.status","params":{"sessionId":"s1","status":"idle"}}\n');
  const got = await waiting;
  assert.equal(got.params.status, "idle");
});

test("frame splitting: multiple frames inside one chunk all dispatch, in order", async () => {
  const { h, stdout } = makeTransport();
  const seq = [];
  const w1 = h.waitForNotification((n) => n.params?.seqTag === 1, { label: "1" });
  const w2 = h.waitForNotification((n) => n.params?.seqTag === 2, { label: "2" });
  stdout.write(
    JSON.stringify(note("session.event", { seqTag: 1 })) + "\n" +
    JSON.stringify(note("session.event", { seqTag: 2 })) + "\n",
  );
  await w1; await w2;
  h.notes.filter((n) => n.method === "session.event").forEach((n, i) => assert.equal(n.params.seqTag, i + 1));
});

test("id pairing: concurrent requests resolve on their own response ids, out of order", async () => {
  const { h, stdout } = makeTransport();
  const pInit = h.request("initialize", { a: 1 });
  const pPrompt = h.request("session/prompt", { b: 2 });
  const pShutdown = h.request("shutdown", {});
  // respond 3, then 1, then 2 — order must not matter
  stdout.write('{"jsonrpc":"2.0","id":3,"result":{}}\n');
  stdout.write('{"jsonrpc":"2.0","id":1,"result":{"serverInfo":{"name":"x"}}}\n');
  stdout.write('{"jsonrpc":"2.0","id":2,"result":{"messageId":"m-42"}}\n');
  assert.deepEqual((await pInit).serverInfo.name, "x");
  assert.equal((await pPrompt).messageId, "m-42");
  assert.deepEqual(await pShutdown, {});
});

test("notifications never mispair: method-only frame does not resolve a pending request; unknown-id response ignored", async () => {
  const { h, stdout } = makeTransport();
  let settled = false;
  const p = h.request("initialize", {}).finally(() => { settled = true; });
  stdout.write(JSON.stringify(note("session.status", { sessionId: "s", status: "idle" })) + "\n");
  stdout.write('{"jsonrpc":"2.0","id":99,"result":{}}\n'); // response to an id we never issued
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(settled, false, "notification / foreign response must not settle the pending request");
  stdout.write('{"jsonrpc":"2.0","id":1,"result":{}}\n');
  await p;
  assert.equal(h.notes.length, 1);
});

test("error response rejects with RpcError carrying wire code + message + data", async () => {
  const { h, stdout } = makeTransport();
  const p = h.request("session/prompt", { sessionId: "s" });
  stdout.write('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"method not found","data":{"m":"session/prompt"}}}\n');
  await assert.rejects(p, (err) => {
    assert.ok(err instanceof RpcError);
    assert.equal(err.code, -32601);
    assert.match(err.message, /-32601/);
    assert.match(err.message, /method not found/);
    assert.deepEqual(err.data, { m: "session/prompt" });
    return true;
  });
});

test("timeout: request rejects after timeoutMs and the transport stays usable", async () => {
  const { h, stdout } = makeTransport({ defaultTimeoutMs: 40 });
  await assert.rejects(h.request("initialize", {}), /timed out after 40ms/);
  const p2 = h.request("shutdown", {}, { timeoutMs: 1_000 });
  stdout.write('{"jsonrpc":"2.0","id":2,"result":{}}\n');
  await p2;
});

test("exit/EOF propagation: stream end rejects pending requests and note waiters with an end error", async () => {
  const { h, stdout } = makeTransport();
  const pReq = h.request("initialize", {}, { timeoutMs: 10_000 });
  const pNote = h.waitForNotification((n) => n.method === "session.status", { timeoutMs: 10_000, label: "idle" });
  stdout.end();
  await assert.rejects(pReq, /stream ended/);
  await assert.rejects(pNote, /stream ended/);
  assert.equal(h.ended, true);
  await assert.rejects(h.request("shutdown", {}), /transport ended/);
});

test("outbound frame shape: request() writes exactly one compact JSON-RPC line per request", async () => {
  const { h, wroteFrames } = makeTransport({ defaultTimeoutMs: 10_000 });
  const p = h.request("session/prompt", { sessionId: "s1", contentBlocks: [{ type: "text", text: "hi" }] });
  assert.equal(wroteFrames.length, 1);
  assert.deepEqual(wroteFrames[0], {
    jsonrpc: "2.0",
    id: 1,
    method: "session/prompt",
    params: { sessionId: "s1", contentBlocks: [{ type: "text", text: "hi" }] },
  });
  // second request gets id 2 — ids are sequential from 1
  const p2 = h.request("shutdown");
  assert.equal(wroteFrames[1].id, 2);
  void p; void p2; // left pending; close() below settles them
  h.close();
  await assert.rejects(p, /stream ended/);
  await assert.rejects(p2, /stream ended/);
});

test("malformed JSON lines are ignored and counted; the next frame survives", async () => {
  const { h, stdout } = makeTransport();
  const w = h.waitForNotification((n) => n.method === "session.status", { label: "idle" });
  stdout.write("this is not json\n\n");
  stdout.write('{"jsonrpc":"2.0","meth');
  stdout.write('od":"session.status","params":{"status":"idle"}}\n');
  await w;
  assert.equal(h.malformedLines, 1);
});

test("waitForNotification resolves from history for an already-arrived note", async () => {
  const { h, stdout } = makeTransport();
  stdout.write(JSON.stringify(note("session.status", { sessionId: "late", status: "idle" })) + "\n");
  await new Promise((r) => setTimeout(r, 20));
  const got = await h.waitForNotification(
    (n) => n.method === "session.status" && n.params?.sessionId === "late",
    { timeoutMs: 50, label: "late" },
  );
  assert.equal(got.params.status, "idle");
});

test("waitForNotification: a history-scanning waiter still catches a note that arrived after subscribe but before timeout", async () => {
  const { h, stdout } = makeTransport();
  const w = h.waitForNotification((n) => n.method === "subagent.finished", { timeoutMs: 500, label: "subagent.finished" });
  setTimeout(() => stdout.write(JSON.stringify(note("subagent.finished", { childSessionId: "c1" })) + "\n"), 30);
  const got = await w;
  assert.equal(got.params.childSessionId, "c1");
});

test("inbound server→client REQUEST frames (dead capability) are recorded, not dispatched as notifications", async () => {
  const { h, stdout } = makeTransport();
  stdout.write('{"jsonrpc":"2.0","id":7,"method":"approval/request","params":{}}\n');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(h.inboundRequests.length, 1);
  assert.equal(h.inboundRequests[0].method, "approval/request");
  assert.equal(h.notes.length, 0);
});
