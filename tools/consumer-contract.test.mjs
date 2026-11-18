import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(dir, cmd, args) {
  return spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', timeout: 120000, env: { ...process.env,
    MISSION_DRIVER_HOME: '', AGE_REPO_ROOT: '', NODE_OPTIONS: '', AGE_ALLOW_LINE_REFS: '0' } });
}
const ok = (r) => assert.equal(r.status, 0, `${r.error || ''}\n${r.stdout}\n${r.stderr}`);
function put(dir, file, text) { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); }
function install(t, addon = false, profile = 'none') {
  mkdirSync(join(root, '_tmp/consumer-contract'), { recursive: true });
  const dir = mkdtempSync(join(root, '_tmp/consumer-contract/case-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  ok(run(root, process.execPath, ['tools/install-age.mjs', dir, 'Consumer', '--profile', profile, ...(addon ? ['--with-mission-driver'] : [])]));
  ok(run(dir, 'git', ['init', '-q']));
  ok(run(dir, 'git', ['add', '--', 'docs/index.md']));
  return dir;
}
test('managed consumer docs pass refs/timeliness and documented standalone commands run', (t) => {
  for (const profile of ['none', 'frontend', 'java', 'all']) {
    const dir = install(t, false, profile);
    for (const script of ['check-doc-references.mjs', 'check-doc-timeliness.mjs']) ok(run(dir, process.execPath, [`tools/${script}`]));
    for (const mode of ['--list', '--unfinished']) ok(run(dir, process.execPath, ['tools/plan-status.mjs', mode]));
    ok(run(dir, 'bash', ['.githooks/pre-commit']));
    const usage = readFileSync(join(dir, 'docs/guides/roadmap-goal-workflow.md'), 'utf8');
    assert.ok(usage.includes('tools/commit-plan.mjs --snapshot'));
    assert.ok(readFileSync(join(dir, 'docs/requirements/README.md'), 'utf8').includes('docs/guides/requirements-synthesis.md'));
    assert.ok(!readFileSync(join(dir, 'docs/skills/common/age-practice-gap-audit-prompt.md'), 'utf8').includes('active plan referenced from'));
    assert.equal(run(dir, process.execPath, ['tools/commit-plan.mjs']).status, 1);
  }
});
test('installed hook invokes actual local engine sections; invalid inputs and missing checker are red', (t) => {
  const dir = install(t, true);
  ok(run(dir, process.execPath, ['tools/check-doc-references.mjs']));
  const filesGuide = readFileSync(join(dir, 'docs/references/age-files-guide.md'), 'utf8');
  assert.ok(!filesGuide.includes('.agents/skills/mission-driver/'));
  assert.match(filesGuide, /Reinstallation is not an updater/);
  for (const args of [['--help'], ['list']]) ok(run(dir, 'bash', ['tools/mission-driver.sh', ...args]));
  ok(run(dir, process.execPath, ['tools/mission-driver/src/mission-check.mjs', 'missions/onboarding.json', '.']));
  const plan = 'docs/plans/fixture/plan.md';
  put(dir, plan, '---\nstatus: draft\nmission: fixture\nwork-item: M1-WI1\nverify: [test]\n---\n# Fixture\n## Phase 1 — Work\n- [ ] Add: result\n## Phase 2 — Proof\n- [ ] Proof: test\n');
  ok(run(dir, 'git', ['add', '--', plan, 'docs/roadmaps/onboarding-roadmap.md', 'missions/onboarding.json', 'missions/base.json']));
  const valid = run(dir, 'bash', ['.githooks/pre-commit']); ok(valid);
  for (const checker of ['gate-check', 'roadmap-check', 'mission-check']) assert.match(valid.stdout, new RegExp(`\\[${checker}\\] ok:`));
  for (const [file, invalid, checker] of [
    [plan, '---\nstatus: impossible\n---\n', 'gate-check'],
    ['docs/roadmaps/onboarding-roadmap.md', '---\naudit-rounds: invalid\n---\n', 'roadmap-check'],
    ['missions/onboarding.json', '{"name":"broken","extends":"missing"}', 'mission-check'],
    ['missions/onboarding.json', '{}', 'mission-check'],
    ['missions/onboarding.json', '{', 'mission-check'],
  ]) {
    const before = readFileSync(join(dir, file)); put(dir, file, invalid);
    const r = run(dir, 'bash', ['.githooks/pre-commit']); assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, new RegExp(`\\[${checker}\\] DENY:`)); put(dir, file, before);
  }
  rmSync(join(dir, 'tools/mission-driver/src/gate-check.mjs'));
  const missing = run(dir, 'bash', ['.githooks/pre-commit']); assert.equal(missing.status, 1); assert.match(missing.stderr, /missing required checker/);
});
