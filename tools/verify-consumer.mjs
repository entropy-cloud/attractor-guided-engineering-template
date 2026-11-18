#!/usr/bin/env node
// Source-repository contract gate; deliberately not installed in consumers.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './vendor/js-yaml.mjs';
import { readManifest } from './install-age.mjs';

export const SUITES = [
  { id: 'installer', command: 'node', files: ['tools/install-age.test.mjs', 'tools/install-age.integration.test.mjs'] },
  { id: 'shell', command: 'bash', files: ['tools/check-install-age.sh'] },
  { id: 'workflow', command: 'node', files: ['tools/plan-status.test.mjs', 'tools/commit-plan.test.mjs', 'tools/workflow-contract.test.mjs'] },
  { id: 'guards', command: 'node', files: ['tools/doc-guards.test.mjs'] },
  { id: 'consumer', command: 'node', files: ['tools/consumer-contract.test.mjs'] },
  { id: 'aggregate', command: 'node', files: ['tools/verify-consumer.test.mjs'] },
];
export const REQUIRED_TOOLS = ['install-age.sh', 'install-age.cmd', 'install-age.manifest', 'tools/install-age.mjs', 'tools/age-drift.mjs',
  'tools/consumer-ledger.mjs', 'tools/plan-status.mjs', 'tools/commit-plan.mjs', 'tools/check-doc-references.mjs',
  'tools/check-doc-timeliness.mjs', 'tools/check-docs-garbled.mjs', 'tools/vendor/js-yaml.mjs', 'tools/verify-consumer.mjs'];

export function validateSuites(root, suites = SUITES) {
  if (suites.length !== SUITES.length || SUITES.some((expected) => {
    const matches = suites.filter((s) => s.id === expected.id);
    return matches.length !== 1 || JSON.stringify(matches[0]) !== JSON.stringify(expected);
  })) throw Error('Missing/changed mandatory consumer suite identity');
  for (const file of [...REQUIRED_TOOLS, ...suites.flatMap((s) => s.files)]) {
    if (!existsSync(join(root, file)) || !statSync(join(root, file)).isFile()) throw Error(`Missing required tool/test: ${file}`);
  }
}

export function verifyConsumer(root, { suites = SUITES, run = spawnSync } = {}) {
  validateSuites(root, suites);
  for (const suite of suites) {
    const args = suite.command === 'node' ? ['--test', '--test-reporter=tap', ...suite.files] : suite.files;
    const result = run(suite.command === 'node' ? process.execPath : suite.command, args, {
      cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, AGE_REPO_ROOT: '', AGE_ACTIVE_DOC_ROOTS: '', AGE_ACTIVE_DOC_FILES: '', AGE_ALLOW_LINE_REFS: '0' },
    });
    if (result.error || result.status !== 0) {
      if (result.stdout) process.stdout.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
      throw Error(`${suite.id} failed: ${result.error?.message || `exit ${result.status}`}`);
    }
    if (suite.command === 'node' && !/^# tests [1-9]\d*\s*$/m.test(result.stdout || '')) throw Error(`${suite.id}: zero/missing test coverage`);
    if (suite.id === 'shell' && !/PASS: all [1-9]\d* assertions passed/.test(result.stdout || '')) throw Error('shell: zero/missing assertion coverage');
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    console.log(`[verify-consumer] ${suite.id}: PASS`);
  }
}

function walk(root, dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const file = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(root, file) : [file];
  });
}
const matches = (file, glob) => new RegExp('^' + glob.split('**').map((part) => part.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*') + '$').test(file);

export function checkConsumerCi(root, text = readFileSync(join(root, '.github/workflows/consumer-contract.yml'), 'utf8')) {
  const workflow = load(text);
  const managed = new Set([
    ...REQUIRED_TOOLS, ...SUITES.flatMap((s) => s.files), ...readManifest(join(root, 'install-age.manifest')).map((e) => e.src),
    ...['template', 'docs/guides', 'docs/skills', '.agents/skills'].flatMap((dir) => walk(root, dir)),
    ...readdirSync(join(root, 'tools')).filter((p) => /\.(mjs|sh)$/.test(p)).map((p) => `tools/${p}`),
    'tools/package.json', '.github/workflows/consumer-contract.yml', 'tools/mission-driver/package.json',
  ]);
  for (const event of ['push', 'pull_request']) {
    const paths = workflow.on?.[event]?.paths;
    if (!Array.isArray(paths) || !paths.length || paths.some((p) => typeof p !== 'string' || p === '**' || p.startsWith('!'))) throw Error(`Invalid ${event} consumer CI paths`);
    const missing = [...managed].filter((file) => !paths.some((glob) => matches(file, glob)));
    if (missing.length) throw Error(`${event}: missing consumer CI trigger: ${missing.join(', ')}`);
  }
  const commands = Object.values(workflow.jobs || {}).flatMap((job) => (job.steps || []).map((s) => s.run || ''));
  for (const command of ['node tools/verify-consumer.mjs', 'pnpm --prefix tools/mission-driver test']) {
    if (!commands.some((s) => s.split('\n').includes(command))) throw Error(`Missing consumer CI command: ${command}`);
  }
  return managed.size;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { verifyConsumer(fileURLToPath(new URL('../', import.meta.url))); }
  catch (e) { console.error(`[verify-consumer] ${e.message}`); process.exitCode = 1; }
}
