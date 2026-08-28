#!/usr/bin/env node
/**
 * load-plugins.test.mjs — deterministic stub suite for plugin/load-plugins.sh
 * (M3-WI7, plan docs/plans/multi-plugin-dsh/2026-08-28-0149-3 Phase 2).
 *
 * Hermetic posture (zero real-host dependency): every scenario runs the REAL
 * script against a scratch manifest + fake plugin directories, with a PATH-
 * injected stub `dsh` that logs its argv and simulates list/add/remove
 * outcomes. The YAML-validation branch selection is pinned with stub
 * python3 / stub node interpreters on a pruned PATH (e2e-demo.mjs PATH-
 * injection precedent). The real-host legs (real dsh, real dump-config,
 * shellcheck) are M3-WI8 evidence, deliberately NOT part of this file.
 *
 * Coverage (flag semantics + pre-flight assertions + summary shape):
 *   manifest order / idempotent already-present / dry-run zero execution /
 *   strict first-failure abort / default continue + non-zero / --skip
 *   accumulation / --unmount-all remove order / unknown top-level key deny /
 *   missing path deny / missing cordis.patch.yml deny / ${VAR} substitution
 *   + undefined deny / python3 channel preferred / node channel fallback /
 *   validation failure propagation / malformed YAML deny / summary table
 *   shape / --no-start vs start command forms.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(here, '..', 'load-plugins.sh')
const REPO_ROOT = join(here, '..', '..')

const DSH_STUB = `#!/bin/sh
printf '%s\\n' "\$*" >> "\$DSH_LOG"
case \$1 in
  plugin)
    case \$4 in
      list)
        if [ -f "\$DSH_LIST_FILE" ]; then cat "\$DSH_LIST_FILE"; fi
        exit 0
        ;;
      add)
        if [ -n "\${DSH_ADD_FAIL_SUBSTR:-}" ]; then
          case "\$*" in
            *"\$DSH_ADD_FAIL_SUBSTR"*) exit 1 ;;
          esac
        fi
        exit 0
        ;;
      remove) exit 0 ;;
    esac
    ;;
esac
exit 0
`

const PYTHON3_STUB = `#!/bin/sh
printf '%s\\n' "\$*" >> "\$PY3_LOG"
exit 0
`

/** Simulates python3 present but PyYAML absent (probe fails → node channel). */
const PYTHON3_NOYAML_STUB = `#!/bin/sh
if [ "\$2" = 'import yaml' ]; then exit 1; fi
exit 0
`

const NODE_STUB = `#!/bin/sh
printf '%s\\n' "\$*" >> "\$NODE_LOG"
exit "\${STUB_NODE_EXIT:-0}"
`

function writeStub(dir, name, body) {
  const p = join(dir, name)
  writeFileSync(p, body)
  chmodSync(p, 0o755)
  return p
}

/**
 * Scratch scenario: tmp root with a canonical schema:1 manifest and fake
 * plugin directories (each carrying a cordis.patch.yml).
 */
function makeScenario({ profile = 'web', plugins = [], extraTopKeys = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'load-plugins-test-'))
  const stubDir = join(root, 'stubs')
  const logFile = join(root, 'dsh.log')
  const listFile = join(root, 'dsh-list.txt')
  mkdirSync(stubDir)
  writeStub(stubDir, 'dsh', DSH_STUB)

  const pluginLines = plugins
    .map((p) => `  - name: ${p.name}\n    path: ${p.path}\n    realm: ${p.realm ?? 'xRealm'}`)
    .join('\n')
  const manifestText = `schema: 1\n${extraTopKeys}profile: ${profile}\nplugins:\n${pluginLines}\n`
  const manifest = join(root, 'plugin-manifest.yml')
  writeFileSync(manifest, manifestText)

  for (const p of plugins) {
    if (p.create === false) continue
    const dir = join(root, (p.dir ?? p.path).replace(/^\.\//, ''))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'cordis.patch.yml'), '# fake bundle patch\n')
  }
  writeFileSync(listFile, '')
  return { root, stubDir, manifest, logFile, listFile }
}

function runScript(scenario, args, { env, cwd = REPO_ROOT } = {}) {
  return spawnSync(SCRIPT, ['--manifest', scenario.manifest, ...args], { env, cwd, encoding: 'utf8' })
}

/** Normal-channel run: stub dsh shadows the real one; YAML validation uses
 *  whatever real python3/node the environment provides (both channels end
 *  at exit 0 for valid YAML — deterministic either way). */
function normalEnv(scenario, extra = {}) {
  return {
    ...process.env,
    PATH: `${scenario.stubDir}:${process.env.PATH}`,
    DSH_LOG: scenario.logFile,
    DSH_LIST_FILE: scenario.listFile,
    ...extra,
  }
}

/** Branch-channel run: pruned PATH without the Homebrew prefix — no real
 *  node, no real PyYAML-bearing python3; the planted stubs decide the
 *  channel. /usr/bin:/bin stay for sed/grep (macOS keeps them in /usr/bin). */
function prunedEnv(scenario, extra = {}) {
  return {
    PATH: `${scenario.stubDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
    DSH_LOG: scenario.logFile,
    DSH_LIST_FILE: scenario.listFile,
    ...extra,
  }
}

function logLines(scenario) {
  if (!existsSync(scenario.logFile)) return []
  return readFileSync(scenario.logFile, 'utf8').split('\n').filter(Boolean)
}

function addLines(scenario) {
  return logLines(scenario).filter((l) => l.includes(' add '))
}

function removeLines(scenario) {
  return logLines(scenario).filter((l) => l.includes(' remove '))
}

function cleanup(scenario) {
  rmSync(scenario.root, { recursive: true, force: true })
}

const defaultPlugins = [
  { name: 'nop-a', path: './plug-a' },
  { name: 'nop-b', path: './plug-b' },
  { name: 'nop-c', path: './plug-c' },
]

test('mounts every entry in manifest order', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.equal(r.status, 0, r.stderr)
    const adds = addLines(s)
    assert.equal(adds.length, 3)
    const order = adds.map((l) => (l.match(/ add link:.*\/(plug-[abc])$/) || [])[1])
    assert.deepEqual(order, ['plug-a', 'plug-b', 'plug-c'])
    assert.match(r.stdout, /mounted:         3 nop-a nop-b nop-c/)
  } finally {
    cleanup(s)
  }
})

test('idempotent: already-mounted entries are skipped without add', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    writeFileSync(s.listFile, 'nop-a link:/old/loc\n')
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.equal(r.status, 0, r.stderr)
    const adds = addLines(s)
    assert.equal(adds.length, 2)
    assert.ok(!adds.some((l) => l.includes('plug-a')))
    assert.match(r.stdout, /already-present: 1 nop-a/)
  } finally {
    cleanup(s)
  }
})

test('dry-run executes nothing and prints the planned command sequence', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const r = runScript(s, ['--dry-run'], { env: normalEnv(s) })
    assert.equal(r.status, 0, r.stderr)
    assert.deepEqual(logLines(s), [], 'dry-run must not invoke dsh at all')
    for (const p of defaultPlugins) {
      assert.match(r.stdout, new RegExp(`plan: dsh plugin --profile web add "link:.*${p.path.replace('./', '')}"`))
    }
    assert.match(r.stdout, /dry-run: 3 plugin\(s\) planned, 0 executed/)
  } finally {
    cleanup(s)
  }
})

test('strict aborts at the first mount failure', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const r = runScript(s, ['--strict', '--no-start'], {
      env: normalEnv(s, { DSH_ADD_FAIL_SUBSTR: 'plug-a' }),
    })
    assert.notEqual(r.status, 0)
    const adds = addLines(s)
    assert.equal(adds.length, 1, 'only the failing plugin may be attempted')
    assert.ok(adds[0].includes('plug-a'))
    assert.match(r.stderr, /strict: mount of nop-a failed/)
  } finally {
    cleanup(s)
  }
})

test('default mode continues past failure and exits non-zero', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const r = runScript(s, ['--no-start'], { env: normalEnv(s, { DSH_ADD_FAIL_SUBSTR: 'plug-b' }) })
    assert.notEqual(r.status, 0)
    const adds = addLines(s)
    assert.equal(adds.length, 3, 'non-strict mode attempts every entry')
    assert.match(r.stdout, /failed:          1 nop-b/)
    assert.match(r.stdout, /mounted:         2 nop-a nop-c/)
  } finally {
    cleanup(s)
  }
})

test('--skip accumulates across repeated flags', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const r = runScript(s, ['--skip', 'nop-a', '--skip', 'nop-b', '--no-start'], { env: normalEnv(s) })
    assert.equal(r.status, 0, r.stderr)
    const adds = addLines(s)
    assert.equal(adds.length, 1)
    assert.ok(adds[0].includes('plug-c'))
    assert.match(r.stdout, /skipped:         2 nop-a nop-b/)
  } finally {
    cleanup(s)
  }
})

test('--unmount-all removes present entries in manifest order, absent ones untouched', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    writeFileSync(s.listFile, 'nop-a link:/old\nnop-c link:/old\n')
    const r = runScript(s, ['--unmount-all'], { env: normalEnv(s) })
    assert.equal(r.status, 0, r.stderr)
    const removes = removeLines(s)
    assert.equal(removes.length, 2, 'only present entries are removed')
    assert.ok(removes[0].includes(' remove nop-a'))
    assert.ok(removes[1].includes(' remove nop-c'))
    assert.match(r.stdout, /removed:         2 nop-a nop-c/)
    assert.match(r.stdout, /already-absent:  1 nop-b/)
  } finally {
    cleanup(s)
  }
})

test('unknown top-level manifest key is denied before any dsh call', () => {
  const s = makeScenario({ plugins: defaultPlugins, extraTopKeys: 'bogus: 1\n' })
  try {
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /unknown top-level manifest key: bogus/)
    assert.deepEqual(logLines(s), [])
  } finally {
    cleanup(s)
  }
})

test('entry path that does not exist is denied before any dsh call', () => {
  const s = makeScenario({ plugins: [{ name: 'nop-ghost', path: './nope', create: false }] })
  try {
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /plugin 'nop-ghost' path does not exist/)
    assert.deepEqual(logLines(s), [])
  } finally {
    cleanup(s)
  }
})

test('entry directory without cordis.patch.yml is denied', () => {
  const s = makeScenario({ plugins: [{ name: 'nop-bare', path: './plug-bare' }] })
  try {
    rmSync(join(s.root, 'plug-bare', 'cordis.patch.yml'))
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /has no cordis\.patch\.yml/)
    assert.deepEqual(logLines(s), [])
  } finally {
    cleanup(s)
  }
})

test('${VAR} placeholders substitute from the environment', () => {
  const s = makeScenario({ plugins: [{ name: 'nop-v', path: './${LP_TAIL}', dir: 'plug-a' }] })
  try {
    const r = runScript(s, ['--no-start'], { env: normalEnv(s, { LP_TAIL: 'plug-a' }) })
    assert.equal(r.status, 0, r.stderr)
    const adds = addLines(s)
    assert.equal(adds.length, 1)
    assert.ok(adds[0].includes(`add link:${join(s.root, 'plug-a')}`), adds[0])
  } finally {
    cleanup(s)
  }
})

test('undefined ${VAR} aborts pre-flight with no dsh call', () => {
  const s = makeScenario({ plugins: [{ name: 'nop-v', path: './${LP_UNDEF_TOKEN_X}' }] })
  try {
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /undefined variable \$\{LP_UNDEF_TOKEN_X\}/)
    assert.deepEqual(logLines(s), [])
  } finally {
    cleanup(s)
  }
})

test('python3 YAML channel is preferred when the probe passes', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const pyLog = join(s.root, 'py3.log')
    writeStub(s.stubDir, 'python3', PYTHON3_STUB)
    const r = runScript(s, ['--no-start'], { env: prunedEnv(s, { PY3_LOG: pyLog }) })
    assert.equal(r.status, 0, r.stderr)
    const pyCalls = readFileSync(pyLog, 'utf8').split('\n').filter(Boolean)
    assert.ok(pyCalls.some((c) => c.includes('import yaml')))
    assert.ok(pyCalls.some((c) => c.includes('safe_load') && c.endsWith(s.manifest)))
    assert.equal(addLines(s).length, 3, 'mount flow proceeds after validation')
  } finally {
    cleanup(s)
  }
})

test('node YAML channel is used when python3/PyYAML is unavailable', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const nodeLog = join(s.root, 'node.log')
    writeStub(s.stubDir, 'python3', PYTHON3_NOYAML_STUB)
    writeStub(s.stubDir, 'node', NODE_STUB)
    const r = runScript(s, ['--no-start'], { env: prunedEnv(s, { NODE_LOG: nodeLog }) })
    assert.equal(r.status, 0, r.stderr)
    const nodeCalls = readFileSync(nodeLog, 'utf8').split('\n').filter(Boolean)
    assert.ok(nodeCalls.some((c) => c.endsWith(s.manifest)), 'manifest reaches the node validator')
    assert.equal(addLines(s).length, 3)
  } finally {
    cleanup(s)
  }
})

test('node channel validation failure fails the run before mounting', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    const nodeLog = join(s.root, 'node.log')
    writeStub(s.stubDir, 'python3', PYTHON3_NOYAML_STUB)
    writeStub(s.stubDir, 'node', NODE_STUB)
    const r = runScript(s, ['--no-start'], { env: prunedEnv(s, { NODE_LOG: nodeLog, STUB_NODE_EXIT: '3' }) })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not valid YAML/)
    assert.deepEqual(logLines(s), [])
  } finally {
    cleanup(s)
  }
})

test('malformed YAML is denied', () => {
  const s = makeScenario({ plugins: [] })
  try {
    writeFileSync(s.manifest, 'schema: 1\nplugins:\n  - name: [unclosed\n')
    const r = runScript(s, ['--no-start'], { env: normalEnv(s) })
    assert.notEqual(r.status, 0)
    assert.match(r.stderr, /not valid YAML/)
    assert.deepEqual(logLines(s), [])
  } finally {
    cleanup(s)
  }
})

test('summary table shape: header + four class lines', () => {
  const s = makeScenario({ plugins: defaultPlugins })
  try {
    writeFileSync(s.listFile, 'nop-b link:/old\n')
    const r = runScript(s, ['--skip', 'nop-c', '--no-start'], { env: normalEnv(s) })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /== load-plugins summary \(profile: web, mode: mount\) ==/)
    for (const line of ['mounted:', 'already-present:', 'failed:', 'skipped:']) {
      assert.ok(r.stdout.split('\n').some((l) => l.startsWith(line)), `missing summary line: ${line}`)
    }
  } finally {
    cleanup(s)
  }
})

test('--no-start suppresses the host start; start uses the valid CLI forms', () => {
  const sWeb = makeScenario({ plugins: [{ name: 'nop-a', path: './plug-a' }] })
  const sCustom = makeScenario({ profile: 'scratch', plugins: [{ name: 'nop-a', path: './plug-a' }] })
  try {
    const noStart = runScript(sWeb, ['--no-start'], { env: normalEnv(sWeb) })
    assert.equal(noStart.status, 0, noStart.stderr)
    assert.ok(!logLines(sWeb).some((l) => l === 'web --no-open'), '--no-start must not start the host')

    const webStart = runScript(sWeb, [], { env: normalEnv(sWeb) })
    assert.equal(webStart.status, 0, webStart.stderr)
    assert.equal(logLines(sWeb).at(-1), 'web --no-open', 'profile web starts via `dsh web --no-open`')

    const customStart = runScript(sCustom, [], { env: normalEnv(sCustom) })
    assert.equal(customStart.status, 0, customStart.stderr)
    assert.equal(logLines(sCustom).at(-1), '--profile scratch', 'custom profiles start via `dsh --profile <p>`')
  } finally {
    cleanup(sWeb)
    cleanup(sCustom)
  }
})
