#!/usr/bin/env node
/**
 * age-preset.test.mjs — structural gate for the AGE agent preset
 * (dsh-plugin M4-WI14, plan `docs/plans/dsh-plugin/2026-08-23-2202-1-*`
 * Phase 2: preset artifacts + structural gate).
 *
 * Pure-Node machine pinning of the plan Phase 1 Decision Record:
 *
 *   D2 — shape: `plugin/nop-age/preset/age/` holds agent.cordis.yml +
 *        preset.yml + the local row file(s); preset.yml is DISPLAY-ONLY
 *        (name/description/order — id is the directory name and trust is
 *        root-derived, neither writable there); the composition parses in
 *        the loader's YAML dialect (!!js scalar expressions preserved as
 *        inert marker strings); the tool catalog covers execute/closure
 *        sufficiency (shell pair + fs + fs-search + skills + todo +
 *        compaction).
 *   D3 — realm posture: ZERO service rows — no row names the plugin package
 *        (`nop-age`; the service stays mounted exactly once by
 *        cordis.patch.yml), the only isolate realms sit on `cordis:group`
 *        rows (the compaction group), every relative row file exists on
 *        disk, and bare package names stay inside the host-spine allowlist
 *        (anything else would fail the host mount at import time).
 *   Non-Goal posture — NO marker examples anywhere in the preset (mode
 *        prompt is the interactive session posture, not a step-executor
 *        prompt; this keeps the preset outside src/prompt-check.mjs's
 *        jurisdiction by construction, not by convention).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse } from 'yaml'

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PRESET_ROOT = join(PLUGIN_ROOT, 'preset')
const PRESET_DIR = join(PRESET_ROOT, 'age')
const pkg = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'package.json'), 'utf8'))

/** Host-loader dialect: `!!js` scalars are expression nodes — keep them inert. */
function parseComposition(text) {
  return parse(text, {
    customTags: [
      {
        tag: '!!js',
        resolve(value) {
          return `__JS_EXPR__ ${String(value)}`
        },
      },
    ],
  })
}

/** Flatten a composition (groups recurse) into [row, groupTrail] pairs. */
function flattenRows(rows, trail = []) {
  const out = []
  for (const row of rows ?? []) {
    out.push({ row, trail })
    if (row && row.group === true && Array.isArray(row.config)) {
      out.push(...flattenRows(row.config, [...trail, row]))
    }
  }
  return out
}

test('AGE preset directory shape (D2)', () => {
  assert.ok(existsSync(PRESET_DIR), `preset dir exists: ${PRESET_DIR}`)
  for (const file of ['agent.cordis.yml', 'preset.yml', 'age-mode.mjs']) {
    assert.ok(existsSync(join(PRESET_DIR, file)), `${file} exists`)
  }
})

test('preset.yml is display-only metadata (D2)', () => {
  const meta = parse(readFileSync(join(PRESET_DIR, 'preset.yml'), 'utf8'))
  assert.ok(typeof meta === 'object' && meta !== null && !Array.isArray(meta))
  const keys = Object.keys(meta)
  const allowed = ['name', 'description', 'order']
  for (const key of keys) assert.ok(allowed.includes(key), `preset.yml key "${key}" is display-only`)
  assert.equal(typeof meta.name, 'string', 'name is a string')
  assert.ok(meta.name.length > 0, 'name non-empty')
  assert.equal(typeof meta.description, 'string', 'description is a string')
  assert.ok(meta.description.length > 0, 'description non-empty')
  if ('order' in meta) assert.ok(Number.isFinite(meta.order), 'order is a finite number')
  // id/trust are NOT writable through preset.yml (host loader contract).
  assert.ok(!('id' in meta), 'preset.yml cannot carry id (id = directory name)')
  assert.ok(!('trust' in meta), 'preset.yml cannot carry trust (trust = root-derived)')
})

test('preset id legality: directory name is a valid PRESET_ID', () => {
  // Host loader: PRESET_ID = /^[a-z0-9][a-z0-9-]*$/ — a containment boundary.
  assert.match('age', /^[a-z0-9][a-z0-9-]*$/)
  assert.equal(dirname(PRESET_DIR), PRESET_ROOT)
})

test('agent.cordis.yml parses in the loader dialect to a row list', () => {
  const rows = parseComposition(readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8'))
  assert.ok(Array.isArray(rows), 'top-level list of plugin rows')
  for (const { row } of flattenRows(rows)) {
    assert.ok(row && typeof row === 'object' && !Array.isArray(row), 'row is a map')
    assert.equal(typeof row.name, 'string', 'row carries a string name')
    assert.ok(row.name.length > 0, 'row name non-empty')
  }
})

test('D3: zero service rows — no nop-age mount face in the preset', () => {
  const rows = parseComposition(readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8'))
  for (const { row } of flattenRows(rows)) {
    assert.notEqual(row.name, pkg.name, `preset row must not re-mount the plugin service ("${pkg.name}" is bundle-patch-only)`)
    assert.ok(!String(row.name).includes('nop-age'), 'no nop-age service row')
  }
  // Cross-check: the bundle patch DOES mount it exactly once (check-manifest
  // owns the patch side; here we only pin the absence of a second face).
  const patch = parse(readFileSync(join(PLUGIN_ROOT, 'cordis.patch.yml'), 'utf8'))
  const patchServiceRows = patch
    .flatMap((op) => op?.insert ?? [])
    .flatMap((entry) => (entry?.group === true ? entry.config ?? [] : [entry]))
    .filter((entry) => entry?.name === pkg.name)
  assert.equal(patchServiceRows.length, 1, 'bundle patch mounts the service exactly once')
})

test('D3: isolate realms only on the known group shape (entry-local, truthy keys)', () => {
  const rows = parseComposition(readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8'))
  const flattened = flattenRows(rows)
  for (const { row, trail } of flattened) {
    if ('isolate' in (row ?? {})) {
      assert.equal(row.name, 'cordis:group', 'isolate lives on a cordis:group row')
      assert.equal(row.group, true, 'group row carries group: true')
      const isolate = row.isolate
      assert.ok(isolate && typeof isolate === 'object', 'isolate is a map')
      for (const [label, value] of Object.entries(isolate)) {
        assert.equal(value, true, `isolate label "${label}" is truthy-boolean (entry-local realm)`)
      }
    }
    // Rows that sit inside isolate groups are the only service-providing
    // surface this preset is allowed; pin the known set.
    if (trail.length > 0) {
      assert.equal(trail[trail.length - 1].id, 'compaction', 'nested rows live only inside the compaction group')
    }
  }
})

test('D3: every relative row file exists in the preset directory', () => {
  const rows = parseComposition(readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8'))
  for (const { row } of flattenRows(rows)) {
    if (String(row.name).startsWith('.')) {
      const target = join(PRESET_DIR, String(row.name))
      assert.ok(existsSync(target), `relative row resolves on disk: ${row.name}`)
    }
  }
})

test('D3: bare package names stay inside the host-spine allowlist', () => {
  const ALLOWED = new Set([
    '@deepseek-ai/dsh-persona',
    '@deepseek-ai/dsh-agent-instructions',
    '@deepseek-ai/dsh-tool-bash',
    '@deepseek-ai/dsh-tool-pwsh',
    '@deepseek-ai/dsh-tool-fs',
    '@deepseek-ai/dsh-tool-fs-search',
    '@deepseek-ai/dsh-skill-filesystem',
    '@deepseek-ai/dsh-tool-skill',
    '@deepseek-ai/dsh-tool-todo',
    '@deepseek-ai/dsh-compaction-basic',
    '@deepseek-ai/dsh-compaction-tool-result-pruner',
  ])
  const rows = parseComposition(readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8'))
  for (const { row } of flattenRows(rows)) {
    const name = String(row.name)
    if (name.startsWith('.') || name === 'cordis:group' || name.startsWith('cordis:')) continue
    assert.ok(ALLOWED.has(name), `bare row name "${name}" is in the pinned host-spine allowlist`)
  }
})

test('D2: tool catalog sufficiency for execute/closure steps', () => {
  const rows = parseComposition(readFileSync(join(PRESET_DIR, 'agent.cordis.yml'), 'utf8'))
  const names = flattenRows(rows).map(({ row }) => String(row.name))
  for (const required of [
    '@deepseek-ai/dsh-tool-bash',        // run verification commands
    '@deepseek-ai/dsh-tool-fs',          // read/write/edit files
    '@deepseek-ai/dsh-tool-fs-search',   // glob/grep
    '@deepseek-ai/dsh-tool-skill',       // mission-control skills reach the catalog
    '@deepseek-ai/dsh-skill-filesystem',
    '@deepseek-ai/dsh-compaction-basic', // long missions compact
  ]) {
    assert.ok(names.includes(required), `catalog row present: ${required}`)
  }
})

test('Non-Goal posture: no marker examples anywhere in the preset', () => {
  for (const file of ['agent.cordis.yml', 'preset.yml', 'age-mode.mjs']) {
    const text = readFileSync(join(PRESET_DIR, file), 'utf8')
    for (const marker of ['<AI_STEP_RESULT>', '<BRIEF_GATE>']) {
      assert.ok(!text.includes(marker), `${file} carries no ${marker} example (mode prompt ≠ step prompt)`)
    }
  }
})

test('age-mode.mjs registers the single AGE posture section with route pointers', async () => {
  const mod = await import(pathToFileURL(join(PRESET_DIR, 'age-mode.mjs')).href)
  assert.equal(mod.name, 'age-mode')
  assert.deepEqual(mod.inject, ['systemPrompt'])
  assert.equal(typeof mod.apply, 'function')
  assert.equal(mod.AGE_MODE_SECTION, 'age:mode')

  // The section registers through the prompt registry into the calling scope.
  const registered = []
  const fakeCtx = {
    systemPrompt: {
      section: (entry) => {
        registered.push(entry)
        return () => {}
      },
    },
  }
  mod.apply(fakeCtx)
  assert.equal(registered.length, 1, 'exactly one section')
  const [entry] = registered
  assert.equal(entry.name, 'age:mode')
  assert.equal(entry.order, 10)
  assert.ok(!entry.complete, 'section is additive, not complete')
  assert.ok(typeof entry.text === 'string' && entry.text.length > 0)

  // Route-injection pointers (D2): Mission Control entry points documented.
  for (const pointer of [
    'mission-control-run',
    'mission-control-draft',
    'mission-control-analyze',
    '/mdcontrol/api/',
    'mdcontrol.status',
  ]) {
    assert.ok(entry.text.includes(pointer), `section documents "${pointer}"`)
  }
  // Async-contract essentials (D2).
  assert.ok(entry.text.includes('started'), 'async job handle contract present')
  assert.ok(entry.text.toLowerCase().includes('poll'), 'polling guidance present')
})
