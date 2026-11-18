import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUITES, REQUIRED_TOOLS, verifyConsumer, validateSuites, checkConsumerCi } from './verify-consumer.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('mandatory suite identities bind the actual delivered test files', () => {
  assert.deepEqual(SUITES.map((s) => [s.id, ...s.files]), [
    ['installer', 'tools/install-age.test.mjs', 'tools/install-age.integration.test.mjs'],
    ['shell', 'tools/check-install-age.sh'],
    ['workflow', 'tools/plan-status.test.mjs', 'tools/commit-plan.test.mjs', 'tools/workflow-contract.test.mjs'],
    ['guards', 'tools/doc-guards.test.mjs'],
    ['consumer', 'tools/consumer-contract.test.mjs'],
    ['aggregate', 'tools/verify-consumer.test.mjs'],
  ]);
});
test('aggregate refuses failed/missing child, missing tool/test, omitted suite and zero coverage', (t) => {
  mkdirSync(join(root, '_tmp/aggregate'), { recursive: true });
  const dir = mkdtempSync(join(root, '_tmp/aggregate/case-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const file of [...REQUIRED_TOOLS, ...SUITES.flatMap((s) => s.files)]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), 'fixture');
  }
  validateSuites(dir);
  assert.throws(() => verifyConsumer(dir, { suites: SUITES.slice(1) }), /suite identity/);
  assert.throws(() => verifyConsumer(dir, { run: () => ({ status: 1 }) }), /installer failed/);
  assert.throws(() => verifyConsumer(dir, { run: () => ({ status: null, error: Error('ENOENT') }) }), /ENOENT/);
  assert.throws(() => verifyConsumer(dir, { run: () => ({ status: 0, stdout: '# tests 0\n' }) }), /zero/);
  for (const file of ['tools/consumer-ledger.mjs', 'tools/doc-guards.test.mjs']) {
    rmSync(join(dir, file)); assert.throws(() => validateSuites(dir), /Missing required tool\/test/); writeFileSync(join(dir, file), 'fixture');
  }
});
test('CI covers actual managed files and executes aggregate/engine; missing trigger/command is red', () => {
  const text = readFileSync(join(root, '.github/workflows/consumer-contract.yml'), 'utf8');
  assert.ok(checkConsumerCi(root, text) > 80);
  assert.throws(() => checkConsumerCi(root, text.replaceAll("      - 'install-age.sh'\n", '')), /missing consumer CI trigger/);
  assert.throws(() => checkConsumerCi(root, text.replaceAll("      - 'tools/*.mjs'\n", '')), /missing consumer CI trigger/);
  assert.throws(() => checkConsumerCi(root, text.replace('run: node tools/verify-consumer.mjs', 'run: echo omitted')), /Missing consumer CI command/);
});
