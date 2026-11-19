/**
 * atomic-write.test.mjs — tmp + rename + JSON read helpers
 * (multi-plugin-dsh M5-WI3; design owner
 * docs/design/dsh-routing-with-failover.md §9.2 D13).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeTextAtomic, readJsonAtomic, defaultFsIo } from "../src/atomic-write.ts";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const withTempDir = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "noproute-atomic-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("writeTextAtomic creates parent directory if missing", () => {
  withTempDir((dir) => {
    const target = join(dir, "nested", "deep", "file.json");
    writeTextAtomic(target, '{"a":1}');
    assert.equal(existsSync(target), true);
    assert.equal(readFileSync(target, "utf8"), '{"a":1}');
  });
});

test("writeTextAtomic overwrites existing file", () => {
  withTempDir((dir) => {
    const target = join(dir, "file.json");
    writeTextAtomic(target, "v1");
    writeTextAtomic(target, "v2");
    assert.equal(readFileSync(target, "utf8"), "v2");
  });
});

test("readJsonAtomic returns parsed object on success", () => {
  withTempDir((dir) => {
    const target = join(dir, "file.json");
    writeTextAtomic(target, '{"x":42,"y":[1,2]}');
    const parsed = readJsonAtomic(target, null);
    assert.deepEqual(parsed, { x: 42, y: [1, 2] });
  });
});

test("readJsonAtomic returns fallback when file missing", () => {
  withTempDir((dir) => {
    const target = join(dir, "missing.json");
    const fallback = { empty: true };
    assert.deepEqual(readJsonAtomic(target, fallback), fallback);
  });
});

test("readJsonAtomic returns fallback on corrupt JSON", () => {
  withTempDir((dir) => {
    const target = join(dir, "corrupt.json");
    writeTextAtomic(target, "{garbage");
    const fallback = { empty: true };
    assert.deepEqual(readJsonAtomic(target, fallback), fallback);
  });
});

test("injected io: writeTextAtomic uses custom io.writeFile / io.rename / io.mkdirp", () => {
  const writes = [];
  const renames = [];
  const mkdirs = [];
  const io = {
    writeFile: (path, content) => writes.push({ path, content }),
    rename: (src, dst) => renames.push({ src, dst }),
    readFile: () => null,
    mkdirp: (path) => mkdirs.push(path),
    exists: () => true,
  };
  writeTextAtomic("/tmp/x/file.json", '{"a":1}', io);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path.endsWith(".atomic-tmp"), true);
  assert.equal(mkdirs.length, 1);
  assert.equal(mkdirs[0], "/tmp/x");
  assert.equal(renames.length, 1);
  assert.equal(renames[0].dst, "/tmp/x/file.json");
});