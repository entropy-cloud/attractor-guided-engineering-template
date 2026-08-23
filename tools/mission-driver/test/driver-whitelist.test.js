// dsh-plugin M1-WI3: resolve-time driver whitelist.
// (a) unknown driver (e.g. "opencod") fails at EVERY resolveConfig return
//     point (main / draft / analyze) from every source that return point can
//     see (main: flag / env / mission.json; draft+analyze: programmatic args
//     ≙ flag / env / base.json) with the legal-values list in the message.
// (b) `native` is a whitelist member reserved for the DSH plugin host: all
//     three return points reject it with the host-specific message unless the
//     caller passes the internal option `allowNativeDriver: true`.
// (c) legal values (opencode default+explicit / pi / cline) resolve with the
//     same driver fields as before the whitelist (regression, pinned field by
//     field alongside pi-driver-config.test.js / cline-driver-config.test.js).
// (d) CLI level: `node src/main.js demo --driver native` exits 1 with the
//     host-specific message; `--driver opencod` exits 1 with the whitelist
//     message (resolveConfig throws propagate to stderr, exit code 1 — no
//     second validation layer in the CLI shell).
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve, isAbsolute, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveConfig, SUPPORTED_DRIVERS } from "../src/config.js";

const MAIN_JS = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src", "main.js");
const LEGAL_LIST = SUPPORTED_DRIVERS.join(" | ");
const NATIVE_MSG = 'driver "native" 仅在 DSH 插件宿主内可用';

function tmpRoot() {
  return mkdtempSync(join(tmpdir(), "driver-whitelist-"));
}

// Self-contained temp base + demo mission (mirrors pi-driver-config.test.js
// setup so loadMission path validation passes without depending on repo-root
// missions/). baseExtra / missionExtra inject driver sources under test.
function setupMission(root, { baseExtra = {}, missionExtra = {} } = {}) {
  const missionsDir = join(root, "missions");
  mkdirSync(missionsDir, { recursive: true });
  writeFileSync(join(missionsDir, "base.json"), JSON.stringify({
    model: "test/model",
    agent: "build",
    maxCycles: 8,
    contextDir: "docs/context",
    moduleDir: "demo-mod",
    commands: { test: "echo ok" },
    ...baseExtra,
  }), "utf8");
  for (const d of ["docs/roadmap", "docs/plans/demo", "docs/context", "demo-mod"]) {
    mkdirSync(join(root, d), { recursive: true });
  }
  writeFileSync(join(missionsDir, "demo.json"), JSON.stringify({
    extends: "base",
    name: "demo",
    roadmapPath: "docs/roadmap",
    plansDir: "docs/plans/demo",
    commands: { test: "echo ok" },
    ...missionExtra,
  }), "utf8");
  return missionsDir;
}

// The analyze branch resolves the newest _tmp/*-mission-driver/run-state.json.
function setupAnalyzeRun(root) {
  const runStateDir = join(root, "_tmp", "20260823-000000-mission-driver");
  mkdirSync(runStateDir, { recursive: true });
  writeFileSync(join(runStateDir, "run-state.json"), JSON.stringify({ missionName: "demo" }));
}

const ENV_KEY = "MISSION_DRIVER_EXEC";

describe("driver whitelist — unknown value fails at resolve time", () => {
  let root;
  beforeEach(() => { root = tmpRoot(); delete process.env[ENV_KEY]; });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); delete process.env[ENV_KEY]; });

  it("main return point: flag source (programmatic args.driver ≙ --driver)", () => {
    const missionsDir = setupMission(root);
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, mission: "demo", driver: "opencod" }),
      (err) => err.message.includes('unsupported driver "opencod"')
        && err.message.includes(LEGAL_LIST)
        && err.message.includes("--driver flag"),
    );
  });

  it("main return point: env MISSION_DRIVER_EXEC source", () => {
    const missionsDir = setupMission(root);
    process.env[ENV_KEY] = "cu";
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, mission: "demo" }),
      (err) => err.message.includes('unsupported driver "cu"')
        && err.message.includes(LEGAL_LIST)
        && err.message.includes(ENV_KEY),
    );
  });

  it("main return point: mission.json source", () => {
    const missionsDir = setupMission(root, { missionExtra: { driver: "opencod" } });
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, mission: "demo" }),
      (err) => err.message.includes('unsupported driver "opencod"')
        && err.message.includes(LEGAL_LIST)
        && err.message.includes("mission config"),
    );
  });

  it("draft return point: programmatic args (≙ flag) source", () => {
    const missionsDir = setupMission(root);
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, draftMission: "x", driver: "opencod" }),
      (err) => err.message.includes(LEGAL_LIST),
    );
  });

  it("draft return point: env source", () => {
    const missionsDir = setupMission(root);
    process.env[ENV_KEY] = "opencod";
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, draftMission: "x" }),
      (err) => err.message.includes(LEGAL_LIST) && err.message.includes(ENV_KEY),
    );
  });

  it("draft return point: base.json source (draft/analyze return points have mission: null)", () => {
    const missionsDir = setupMission(root, { baseExtra: { driver: "opencod" } });
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, draftMission: "x" }),
      (err) => err.message.includes(LEGAL_LIST) && err.message.includes("base config"),
    );
  });

  it("analyze return point: env source", () => {
    const missionsDir = setupMission(root);
    setupAnalyzeRun(root);
    process.env[ENV_KEY] = "opencod";
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, analyzeRun: true }),
      (err) => err.message.includes(LEGAL_LIST) && err.message.includes(ENV_KEY),
    );
  });

  it("analyze return point: base.json source", () => {
    const missionsDir = setupMission(root, { baseExtra: { driver: "opencod" } });
    setupAnalyzeRun(root);
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, analyzeRun: true }),
      (err) => err.message.includes(LEGAL_LIST) && err.message.includes("base config"),
    );
  });
});

describe("driver whitelist — native is plugin-host-only", () => {
  let root;
  beforeEach(() => { root = tmpRoot(); delete process.env[ENV_KEY]; });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); delete process.env[ENV_KEY]; });

  it("main return point rejects native with the host-specific message", () => {
    const missionsDir = setupMission(root);
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, mission: "demo", driver: "native" }),
      (err) => err.message.includes(NATIVE_MSG) && err.message.includes("standalone CLI 不支持"),
    );
  });

  it("draft return point rejects native with the host-specific message", () => {
    const missionsDir = setupMission(root);
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, draftMission: "x", driver: "native" }),
      (err) => err.message.includes(NATIVE_MSG),
    );
  });

  it("analyze return point rejects native with the host-specific message", () => {
    const missionsDir = setupMission(root);
    setupAnalyzeRun(root);
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, analyzeRun: true, driver: "native" }),
      (err) => err.message.includes(NATIVE_MSG),
    );
  });

  it("allowNativeDriver: true passes native on all three return points", () => {
    const missionsDir = setupMission(root);
    setupAnalyzeRun(root);
    const main = resolveConfig({ dir: root, missionsDir, mission: "demo", driver: "native", allowNativeDriver: true });
    const draft = resolveConfig({ dir: root, missionsDir, draftMission: "x", driver: "native", allowNativeDriver: true });
    const analyze = resolveConfig({ dir: root, missionsDir, analyzeRun: true, driver: "native", allowNativeDriver: true });
    assert.equal(main.driver, "native");
    assert.equal(draft.driver, "native");
    assert.equal(analyze.driver, "native");
  });

  it("native via env / mission field is rejected too (allowNativeDriver is args-only)", () => {
    const missionsDir = setupMission(root);
    process.env[ENV_KEY] = "native";
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir, mission: "demo" }),
      (err) => err.message.includes(NATIVE_MSG),
    );
    delete process.env[ENV_KEY];
    const badMission = setupMission(root, { missionExtra: { driver: "native" } });
    assert.throws(
      () => resolveConfig({ dir: root, missionsDir: badMission, mission: "demo" }),
      (err) => err.message.includes(NATIVE_MSG),
    );
  });
});

describe("driver whitelist — legal values regression (fields unchanged)", () => {
  let root;
  beforeEach(() => { root = tmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  const expectDriverFields = (cfg, { driver, driverArgs, promptMode, agentFile }) => {
    assert.equal(cfg.driver, driver);
    assert.equal(cfg.driverArgs, driverArgs, `driverArgs for ${driver}`);
    assert.equal(cfg.promptMode, promptMode, `promptMode for ${driver}`);
    if (agentFile === undefined) {
      assert.equal(cfg.agentFile, undefined, `agentFile for ${driver}`);
    } else {
      assert.ok(isAbsolute(cfg.agentFile) && cfg.agentFile.endsWith(agentFile), `agentFile for ${driver}: ${cfg.agentFile}`);
    }
  };

  it("opencode: default and explicit, all three return points", () => {
    const missionsDir = setupMission(root);
    setupAnalyzeRun(root);
    expectDriverFields(resolveConfig({ dir: root, missionsDir, mission: "demo" }), {
      driver: "opencode", driverArgs: undefined, promptMode: "arg",
    });
    expectDriverFields(resolveConfig({ dir: root, missionsDir, mission: "demo", driver: "opencode" }), {
      driver: "opencode", driverArgs: undefined, promptMode: "arg",
    });
    expectDriverFields(resolveConfig({ dir: root, missionsDir, draftMission: "x" }), {
      driver: "opencode", driverArgs: undefined, promptMode: "arg",
    });
    expectDriverFields(resolveConfig({ dir: root, missionsDir, analyzeRun: true }), {
      driver: "opencode", driverArgs: undefined, promptMode: "arg",
    });
  });

  it("pi: all three return points apply pi defaults", () => {
    const missionsDir = setupMission(root);
    setupAnalyzeRun(root);
    const pi = {
      driver: "pi",
      driverArgs: "-p --model {model} --append-system-prompt @{agentFile} --tools read,write,edit,bash,grep,find,ls",
      promptMode: "stdin",
      agentFile: join("agents", "build.pi.md"),
    };
    expectDriverFields(resolveConfig({ dir: root, missionsDir, mission: "demo", driver: "pi" }), pi);
    expectDriverFields(resolveConfig({ dir: root, missionsDir, draftMission: "x", driver: "pi" }), pi);
    expectDriverFields(resolveConfig({ dir: root, missionsDir, analyzeRun: true, driver: "pi" }), pi);
  });

  it("cline: all three return points apply cline defaults", () => {
    const missionsDir = setupMission(root);
    setupAnalyzeRun(root);
    const cline = {
      driver: "cline",
      driverArgs: "-m {model} --json --yolo --auto-approve true",
      promptMode: "arg",
      agentFile: join("agents", "build.cline.md"),
    };
    expectDriverFields(resolveConfig({ dir: root, missionsDir, mission: "demo", driver: "cline" }), cline);
    expectDriverFields(resolveConfig({ dir: root, missionsDir, draftMission: "x", driver: "cline" }), cline);
    expectDriverFields(resolveConfig({ dir: root, missionsDir, analyzeRun: true, driver: "cline" }), cline);
  });
});

describe("driver whitelist — CLI level (error propagates, exit 1)", () => {
  let root;
  beforeEach(() => { root = tmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function runCli(...args) {
    const env = { ...process.env };
    delete env[ENV_KEY];
    return spawnSync(process.execPath, [MAIN_JS, ...args], {
      encoding: "utf8",
      timeout: 20000,
      env,
    });
  }

  it('--driver native → exit 1 + host-specific message', () => {
    const missionsDir = setupMission(root);
    const r = runCli("demo", "--driver", "native", "--dry-run", "--no-monitor",
      "--dir", root, "--missions-dir", missionsDir);
    assert.equal(r.status, 1, `stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes(NATIVE_MSG), `stderr must carry host message: ${r.stderr}`);
  });

  it('--driver opencod → exit 1 + whitelist message', () => {
    const missionsDir = setupMission(root);
    const r = runCli("demo", "--driver", "opencod", "--dry-run", "--no-monitor",
      "--dir", root, "--missions-dir", missionsDir);
    assert.equal(r.status, 1, `stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes(LEGAL_LIST), `stderr must carry legal values: ${r.stderr}`);
    assert.ok(r.stderr.includes('unsupported driver "opencod"'), `stderr: ${r.stderr}`);
  });
});
