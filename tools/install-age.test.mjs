// tools/install-age.test.mjs — Unit tests for install-age.mjs (node --test).
//
// Covers: manifest parsing, flag application, gitignore helper.
// Integration coverage is provided by tools/check-install-age.sh (end-to-end).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseManifestLine, applyFlag, ensureGitignoreEntry } from "./install-age.mjs";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("parseManifestLine", () => {
  test("plain path → default dst (strip template/ prefix)", () => {
    const e = parseManifestLine("template/AGENTS.md");
    assert.equal(e.src, "template/AGENTS.md");
    assert.equal(e.dst, "AGENTS.md");
    assert.deepEqual(e.flags, []);
  });

  test("non-template path → dst = src", () => {
    const e = parseManifestLine("docs/context/README.md");
    assert.equal(e.src, "docs/context/README.md");
    assert.equal(e.dst, "docs/context/README.md");
    assert.deepEqual(e.flags, []);
  });

  test("src > dst override", () => {
    const e = parseManifestLine("template/install/missions/base.json > missions/base.json");
    assert.equal(e.src, "template/install/missions/base.json");
    assert.equal(e.dst, "missions/base.json");
    assert.deepEqual(e.flags, []);
  });

  test("src > dst :: exec flag", () => {
    const e = parseManifestLine(
      "template/install/tools/mission-driver.sh > tools/mission-driver.sh :: exec"
    );
    assert.equal(e.src, "template/install/tools/mission-driver.sh");
    assert.equal(e.dst, "tools/mission-driver.sh");
    assert.deepEqual(e.flags, ["exec"]);
  });

  test("src > dst :: rel-mdh flag", () => {
    const e = parseManifestLine("template/install/.env.example > .env.example :: rel-mdh");
    assert.equal(e.dst, ".env.example");
    assert.deepEqual(e.flags, ["rel-mdh"]);
  });

  test("multiple comma-separated flags", () => {
    const e = parseManifestLine("a > b :: exec,fill,rel-mdh");
    assert.deepEqual(e.flags, ["exec", "fill", "rel-mdh"]);
  });

  test("comment line → null", () => {
    assert.equal(parseManifestLine("# this is a comment"), null);
  });

  test("inline comment stripped", () => {
    const e = parseManifestLine("template/AGENTS.md # the AI contract");
    assert.equal(e.src, "template/AGENTS.md");
    assert.equal(e.dst, "AGENTS.md");
  });

  test("blank line → null", () => {
    assert.equal(parseManifestLine(""), null);
    assert.equal(parseManifestLine("   "), null);
  });
});

describe("applyFlag", () => {
  test("fill replaces <project-name>", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-test-fill-"));
    try {
      const f = join(dir, "test.md");
      writeFileSync(f, "Hello <project-name>!", "utf8");
      applyFlag(f, "fill", { projectName: "MyProj", relMdh: "../engine" });
      assert.equal(readFileSync(f, "utf8"), "Hello MyProj!");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("rel-mdh replaces __REL_MDH__", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-test-mdh-"));
    try {
      const f = join(dir, ".env.example");
      writeFileSync(f, "MISSION_DRIVER_HOME=__REL_MDH__", "utf8");
      applyFlag(f, "rel-mdh", { projectName: "X", relMdh: "../../engine" });
      assert.equal(readFileSync(f, "utf8"), "MISSION_DRIVER_HOME=../../engine");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fill replaces ALL occurrences (global)", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-test-global-"));
    try {
      const f = join(dir, "test.md");
      writeFileSync(f, "<project-name> and <project-name> again", "utf8");
      applyFlag(f, "fill", { projectName: "Global", relMdh: "" });
      assert.equal(readFileSync(f, "utf8"), "Global and Global again");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("ensureGitignoreEntry", () => {
  test("appends missing entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-test-gi-"));
    try {
      const gi = join(dir, ".gitignore");
      writeFileSync(gi, "node_modules/\n", "utf8");
      ensureGitignoreEntry(gi, ".env");
      const content = readFileSync(gi, "utf8");
      assert.ok(content.includes("node_modules/"));
      assert.ok(content.includes(".env"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not duplicate existing entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-test-gi2-"));
    try {
      const gi = join(dir, ".gitignore");
      writeFileSync(gi, ".env\n_tmp/\n", "utf8");
      ensureGitignoreEntry(gi, ".env");
      const lines = readFileSync(gi, "utf8").split("\n").filter((l) => l === ".env");
      assert.equal(lines.length, 1, "entry should appear exactly once");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("creates file if missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "age-test-gi3-"));
    try {
      const gi = join(dir, ".gitignore");
      ensureGitignoreEntry(gi, ".env");
      assert.ok(readFileSync(gi, "utf8").includes(".env"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
