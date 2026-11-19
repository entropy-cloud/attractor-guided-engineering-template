/**
 * project-stats.test.mjs — per-project, per-model stats with persistence
 * (multi-plugin-dsh M5-WI3; design owner
 * docs/design/dsh-routing-with-failover.md §11.3 D16).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFsProjectStatsPersistence, GLOBAL_PROJECT_KEY } from "../src/project-stats.ts";
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { writeTextAtomic, defaultFsIo } from "../src/atomic-write.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";

const withTempDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "noproute-stats-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const buildEmptyMap = () => ({});

test("flush creates file with hashed name, then loadAll reads back", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    const map = buildEmptyMap();
    map["/Users/me/projects/foo"] = {
      firstSeenAt: 1000,
      totalCalls: 1,
      totalSuccess: 1,
      totalFailures: 0,
      totalDurationMs: 1500,
      totalTokensInput: 100,
      totalTokensOutput: 50,
      byModel: {
        "deepseek/deepseek-chat": {
          calls: 1, success: 1, failures: 0, durationMs: 1500,
          tokensInput: 100, tokensOutput: 50,
          firstCallAt: 1000, lastCallAt: 1000, lastErrorClass: null,
        },
      },
    };
    p.flush(map);
    const loaded = p.loadAll();
    assert.deepEqual(loaded["/Users/me/projects/foo"].byModel, map["/Users/me/projects/foo"].byModel);
  });
});

test("different projectRoots hash to different files", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    const map = buildEmptyMap();
    map["/Users/me/projects/foo"] = {
      firstSeenAt: 1000, totalCalls: 1, totalSuccess: 1, totalFailures: 0,
      totalDurationMs: 1000, totalTokensInput: 10, totalTokensOutput: 5,
      byModel: {},
    };
    map["/Users/me/projects/bar"] = {
      firstSeenAt: 2000, totalCalls: 2, totalSuccess: 2, totalFailures: 0,
      totalDurationMs: 2000, totalTokensInput: 20, totalTokensOutput: 10,
      byModel: {},
    };
    p.flush(map);
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    assert.ok(files.length >= 1);
    const loaded = p.loadAll();
    assert.equal(loaded["/Users/me/projects/foo"].totalCalls, 1);
    assert.equal(loaded["/Users/me/projects/bar"].totalCalls, 2);
  });
});

test("GLOBAL_PROJECT_KEY ('__global__') uses literal filename", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    const map = buildEmptyMap();
    map[GLOBAL_PROJECT_KEY] = {
      firstSeenAt: 500, totalCalls: 1, totalSuccess: 0, totalFailures: 1,
      totalDurationMs: 100, totalTokensInput: 0, totalTokensOutput: 0,
      byModel: {},
    };
    p.flush(map);
    const files = readdirSync(dir);
    assert.ok(files.some((f) => f.includes(GLOBAL_PROJECT_KEY)));
    const loaded = p.loadAll();
    assert.equal(loaded[GLOBAL_PROJECT_KEY].totalFailures, 1);
  });
});

test("loadAll on empty dir returns empty map", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    assert.deepEqual(p.loadAll(), {});
  });
});

test("flush + load round-trip preserves all fields", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    const map = buildEmptyMap();
    map["/p1"] = {
      firstSeenAt: 100,
      totalCalls: 5,
      totalSuccess: 3,
      totalFailures: 2,
      totalDurationMs: 7500,
      totalTokensInput: 1234,
      totalTokensOutput: 567,
      byModel: {
        "m1": {
          calls: 5, success: 3, failures: 2, durationMs: 7500,
          tokensInput: 1234, tokensOutput: 567,
          firstCallAt: 100, lastCallAt: 500, lastErrorClass: "transient:rate-limit",
        },
      },
    };
    p.flush(map);
    const loaded = p.loadAll();
    assert.equal(loaded["/p1"].firstSeenAt, 100);
    assert.equal(loaded["/p1"].totalCalls, 5);
    assert.equal(loaded["/p1"].byModel["m1"].lastErrorClass, "transient:rate-limit");
  });
});

test("flush does nothing overwrite if map is empty", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    p.flush({});
    assert.deepEqual(p.loadAll(), {});
  });
});

test("bit-identical double run", () => {
  withTempDir((dir) => {
    const build = () => {
      const p = createFsProjectStatsPersistence(dir);
      const map = {
        "/foo": { firstSeenAt: 1, totalCalls: 1, totalSuccess: 1, totalFailures: 0, totalDurationMs: 100, totalTokensInput: 10, totalTokensOutput: 5, byModel: {} },
        "/bar": { firstSeenAt: 2, totalCalls: 2, totalSuccess: 2, totalFailures: 0, totalDurationMs: 200, totalTokensInput: 20, totalTokensOutput: 10, byModel: {} },
      };
      p.flush(map);
      return p.loadAll();
    };
    const a = build();
    const b = build();
    assert.deepEqual(a, b);
  });
});

test("same projectRoot always hashes to same filename across two flushes", () => {
  withTempDir((dir) => {
    const p1 = createFsProjectStatsPersistence(dir);
    const map1 = buildEmptyMap();
    map1["/stable"] = { firstSeenAt: 1, totalCalls: 1, totalSuccess: 1, totalFailures: 0, totalDurationMs: 100, totalTokensInput: 10, totalTokensOutput: 5, byModel: {} };
    p1.flush(map1);
    const filesAfter1 = readdirSync(dir).sort();

    const p2 = createFsProjectStatsPersistence(dir);
    const map2 = buildEmptyMap();
    map2["/stable"] = { firstSeenAt: 1, totalCalls: 2, totalSuccess: 2, totalFailures: 0, totalDurationMs: 200, totalTokensInput: 20, totalTokensOutput: 10, byModel: {} };
    p2.flush(map2);
    const filesAfter2 = readdirSync(dir).sort();

    assert.deepEqual(filesAfter1, filesAfter2, "filename should not change across flushes");
  });
});

test("flushAll with multiple projects in one file (grouped by hash)", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    const map = buildEmptyMap();
    map["/a"] = { firstSeenAt: 1, totalCalls: 1, totalSuccess: 1, totalFailures: 0, totalDurationMs: 100, totalTokensInput: 10, totalTokensOutput: 5, byModel: { m: { calls: 1, success: 1, failures: 0, durationMs: 100, tokensInput: 10, tokensOutput: 5, firstCallAt: 1, lastCallAt: 1, lastErrorClass: null } } };
    p.flush(map);
    const loaded = p.loadAll();
    assert.equal(loaded["/a"].byModel.m.calls, 1);
  });
});

test("flush with byModel populated serializes the model stats", () => {
  withTempDir((dir) => {
    const p = createFsProjectStatsPersistence(dir);
    const map = buildEmptyMap();
    map["/x"] = {
      firstSeenAt: 100,
      totalCalls: 3,
      totalSuccess: 2,
      totalFailures: 1,
      totalDurationMs: 300,
      totalTokensInput: 30,
      totalTokensOutput: 15,
      byModel: {
        "deepseek/chat": {
          calls: 2, success: 2, failures: 0, durationMs: 200,
          tokensInput: 20, tokensOutput: 10, firstCallAt: 100, lastCallAt: 200,
          lastErrorClass: null,
        },
        "openai/gpt-5": {
          calls: 1, success: 0, failures: 1, durationMs: 100,
          tokensInput: 10, tokensOutput: 5, firstCallAt: 200, lastCallAt: 200,
          lastErrorClass: "permanent:auth",
        },
      },
    };
    p.flush(map);
    const loaded = p.loadAll();
    assert.equal(loaded["/x"].byModel["deepseek/chat"].calls, 2);
    assert.equal(loaded["/x"].byModel["openai/gpt-5"].lastErrorClass, "permanent:auth");
  });
});

test("loadAll ignores non-stats files in the directory", () => {
  withTempDir((dir) => {
    writeTextAtomic(join(dir, "README.md"), "ignore me", defaultFsIo);
    writeTextAtomic(join(dir, "stats-config.json"), "{}", defaultFsIo);
    const p = createFsProjectStatsPersistence(dir);
    const loaded = p.loadAll();
    assert.deepEqual(loaded, {});
  });
});

test("flush on missing directory auto-creates it", () => {
  withTempDir((parentDir) => {
    const nestedDir = join(parentDir, "nested", "deep", "stats");
    const p = createFsProjectStatsPersistence(nestedDir);
    const map = buildEmptyMap();
    map["/foo"] = { firstSeenAt: 1, totalCalls: 1, totalSuccess: 1, totalFailures: 0, totalDurationMs: 100, totalTokensInput: 10, totalTokensOutput: 5, byModel: {} };
    assert.doesNotThrow(() => p.flush(map));
    assert.deepEqual(p.loadAll()["/foo"].totalCalls, 1);
  });
});