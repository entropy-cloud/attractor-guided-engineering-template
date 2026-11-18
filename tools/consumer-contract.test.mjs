import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(dir, cmd, args) {
  return spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env,
    AGE_REPO_ROOT: '', NODE_OPTIONS: '', AGE_ALLOW_LINE_REFS: '0' } });
}
const ok = (r) => assert.equal(r.status, 0, `${r.error || ''}\n${r.stdout}\n${r.stderr}`);
function put(dir, file, text) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); }
function install(t, profile = 'none') {
  mkdirSync(join(root, '_tmp/consumer-contract'), { recursive: true });
  const dir = mkdtempSync(join(root, '_tmp/consumer-contract/case-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  ok(run(root, process.execPath, ['tools/install-age.mjs', dir, 'Consumer', '--profile', profile]));
  ok(run(dir, 'git', ['init', '-q']));
  ok(run(dir, 'git', ['add', '--', 'docs/index.md']));
  return dir;
}
test('managed consumer docs pass refs/timeliness and documented standalone commands run', (t) => {
  for (const profile of ['none', 'frontend', 'java', 'all']) {
    const dir = install(t, profile);
    for (const script of ['check-doc-references.mjs', 'check-doc-timeliness.mjs']) ok(run(dir, process.execPath, [`tools/${script}`]));
    for (const mode of ['--list', '--unfinished']) ok(run(dir, process.execPath, ['tools/plan-status.mjs', mode]));
    ok(run(dir, 'bash', ['.githooks/pre-commit']));
    const usage = readFileSync(join(dir, 'docs/guides/roadmap-goal-execution.md'), 'utf8');
    assert.ok(usage.includes('tools/commit-plan.mjs --snapshot'));
    assert.ok(readFileSync(join(dir, 'docs/requirements/README.md'), 'utf8').includes('docs/guides/requirements-synthesis.md'));
    assert.ok(!readFileSync(join(dir, 'docs/skills/common/age-practice-gap-audit-prompt.md'), 'utf8').includes('active plan referenced from'));
    assert.equal(run(dir, process.execPath, ['tools/commit-plan.mjs']).status, 1);
  }
});
test('installed hook structurally checks staged plans via plan-status; invalid inputs are red', (t) => {
  const dir = install(t);
  ok(run(dir, process.execPath, ['tools/check-doc-references.mjs']));
  const plan = 'docs/plans/fixture/plan.md';
  put(dir, plan, '---\nstatus: draft\nmission: fixture\nwork-item: M1-WI1\nverify: [test]\n---\n# Fixture\n## Phase 1 — Work\n- [ ] Add: result\n## Phase 2 — Proof\n- [ ] Proof: test\n');
  ok(run(dir, 'git', ['add', '--', plan, 'docs/roadmaps/onboarding-roadmap.md']));
  const valid = run(dir, 'bash', ['.githooks/pre-commit']); ok(valid);
  assert.match(valid.stdout, /\[pre-commit\]\[plan-status\] ok:/);
  assert.match(valid.stdout, /work items: 0\/8 done/);
  // malformed plan frontmatter → hook red; invalid roadmap frontmatter stays
  // green because --roadmap is an informational counter, not a validator.
  for (const [file, invalid, red] of [
    [plan, '---\nstatus: impossible\n---\n', true],
    ['docs/roadmaps/onboarding-roadmap.md', '---\naudit-rounds: invalid\n---\n', false],
  ]) {
    const before = readFileSync(join(dir, file)); put(dir, file, invalid);
    const r = run(dir, 'bash', ['.githooks/pre-commit']);
    assert.equal(r.status, red ? 1 : 0, r.stdout + r.stderr);
    if (red) assert.match(r.stdout, /\[pre-commit\]\[plan-status\] DENY:/);
    put(dir, file, before);
  }
  // missing checker is fail-open for the standalone sections (documented discipline)
  rmSync(join(dir, 'tools/plan-status.mjs'));
  const missing = run(dir, 'bash', ['.githooks/pre-commit']); ok(missing);
});
