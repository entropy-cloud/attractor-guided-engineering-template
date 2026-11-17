// tools/install-age.test.mjs — Unit tests for install-age.mjs (node --test).
//
// Covers: manifest parsing, flag application, gitignore helper.
// Integration coverage is provided by tools/check-install-age.sh (end-to-end).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseManifestLine, applyFlag, ensureGitignoreEntry, parseArgs, selectEntries, renderRegistry, validateParity } from "./install-age.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scratch = fileURLToPath(new URL("../_tmp/install-age-unit/", import.meta.url));
mkdirSync(scratch, { recursive: true });
const tmpdir = () => scratch;

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
  test("fill treats replacement metacharacters, Unicode and repeated placeholders literally", () => {
    const dir = mkdtempSync(join(tmpdir(), "literal-"));
    try {
      const f = join(dir, "test.md");
      const name = "Cash $& $$ $` $' Co / 中文 \\";
      writeFileSync(f, "<project-name>|<project-name>");
      applyFlag(f, "fill", { projectName: name, relMdh: "" });
      assert.equal(readFileSync(f, "utf8"), `${name}|${name}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
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
  test("preserves a missing-final-newline entry", () => {
    const dir = mkdtempSync(join(tmpdir(), "newline-"));
    try {
      const f = join(dir, ".gitignore");
      writeFileSync(f, "custom");
      ensureGitignoreEntry(f, ".env");
      assert.equal(readFileSync(f, "utf8"), "custom\n.env\n");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
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

describe("CLI and manifest negative controls", () => {
  for (const argv of [["--wat"], ["-x"], ["--profile"], ["--profile", "--pi"], ["--profile="], ["--profile", "frnotend"], ["a", "b", "c"]]) {
    test(`rejects ${JSON.stringify(argv)}`, () => assert.throws(() => parseArgs(argv)));
  }
  test("flags can surround positionals and support both profile forms", () => {
    assert.deepEqual(parseArgs(["--pi", "target", "Name", "--profile=java", "--with-mission-driver"]), {
      positional: ["target", "Name"], withPi: true, withMissionDriver: true, profile: "java",
    });
    assert.equal(parseArgs(["--profile", "all", "target"]).profile, "all");
  });
  for (const line of ["a :: typo", "a :: fill,fill", "../escape", "a > ../escape", "a > /absolute", "a > C:\\escape", "a > ", "a :: profile-typo", "a > b > c", "a > x/../AGENTS.md"]) {
    test(`rejects manifest ${line}`, () => assert.throws(() => parseManifestLine(line)));
  }
  test("validates programmatic profiles too", () => assert.throws(() => selectEntries([], { profile: "typo" })));
});

describe("capability parity negative controls", () => {
  const file = (text) => ({ bytes: Buffer.from(text) });
  test("registry cannot claim a missing prompt or omit a delivered prompt", () => {
    assert.throws(() => validateParity(new Map([["docs/skills/README.md", file("`common/missing.md`")]]), false), /parity/);
    assert.throws(() => validateParity(new Map([["docs/skills/README.md", file("no rows")], ["docs/skills/common/extra.md", file("x")]]), false), /parity/);
  });
  test("pi bridge must match canonical content and count", () => {
    const files = new Map([["docs/skills/README.md", file("`common/test.md`")], ["docs/skills/common/test.md", file("prompt")], [".agents/skills/nop-git/SKILL.md", file("canonical")]]);
    assert.throws(() => validateParity(files, true), /parity/);
    files.set(".pi/skills/nop-git/SKILL.md", file("different"));
    assert.throws(() => validateParity(files, true), /parity/);
  });
  test("optional registry sections contain no unavailable skill paths", () => {
    const registry = readFileSync(new URL("../docs/skills/README.md", import.meta.url), "utf8");
    const rendered = renderRegistry(registry, "none");
    assert.match(rendered, /frontend \(optional — not installed\)/);
    assert.doesNotMatch(rendered, /`frontend\/.*\.md`/);
    assert.match(rendered, /common\/ \(installed\)/);
  });
});
