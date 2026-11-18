import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkReferences, DOC_ROOTS, classifyReference } from './check-doc-references.mjs';
import { checkTimeliness } from './check-doc-timeliness.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const put = (dir, file, text = '# Current\n') => { mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), text); };
function fixture(t) {
  mkdirSync(join(root, '_tmp/guards'), { recursive: true });
  const dir = mkdtempSync(join(root, '_tmp/guards/case-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  put(dir, 'AGENTS.md'); put(dir, 'docs/index.md');
  return dir;
}
test('default refs catch broken paths across normative entrypoints and relative skill registration', async (t) => {
  const dir = fixture(t);
  for (const surface of DOC_ROOTS) put(dir, `${surface}/probe.md`, '`docs/missing.md`');
  put(dir, 'docs/skills/README.md', '`common/missing.md`');
  put(dir, 'template/AGENTS.md', '`docs/missing.md`'); put(dir, 'template/docs/index.md');
  const result = await checkReferences(dir);
  for (const surface of DOC_ROOTS) assert.ok(result.failures.some((f) => f.startsWith(`${surface}/`)), surface);
  assert.ok(result.failures.some((f) => f.includes('common/missing.md')));
  assert.ok(result.failures.some((f) => f.startsWith('template/AGENTS.md')));
  rmSync(join(dir, 'AGENTS.md'));
  await assert.rejects(checkReferences(dir), /ENOENT/);
  await assert.rejects(checkReferences(dir, { roots: [], files: [] }), /zero reference coverage/);
});
test('refs classify examples/external/optional engine but still check real local and installed-engine paths', async (t) => {
  const dir = fixture(t);
  put(dir, 'docs/index.md', '`example:docs/nonexistent.md` `external:other/src/test.ts` `$MISSION_DRIVER_HOME/src/main.js`\n`docs/real-missing.md`\n`docs/example.md` <!-- doc-ref: example reason="copyable example" -->');
  const result = await checkReferences(dir);
  assert.equal(result.failures.length, 1); assert.match(result.failures[0], /real-missing/);
  assert.equal(classifyReference('engine:src/main.js'), 'engine');
  put(dir, 'tools/mission-driver/README.md');
  assert.ok((await checkReferences(dir)).failures.some((f) => f.includes('$MISSION_DRIVER_HOME')));
  put(dir, 'docs/index.md', '`docs/example.md` <!-- doc-ref: example reason="" -->');
  assert.equal((await checkReferences(dir)).failures.length, 1);
  put(dir, 'docs/index.md', '`source:tools/source-only.mjs`');
  assert.equal((await checkReferences(dir)).failures.length, 0);
  put(dir, 'install-age.manifest', '# source checkout');
  assert.equal((await checkReferences(dir)).failures.length, 1, 'source paths must exist in the source checkout');
});
test('timeliness permits only exact reasoned header exemptions and reports syntax patterns only', async (t) => {
  const dir = fixture(t);
  for (const marker of ['<!-- timeliness: allow -->', '<!-- timeliness: allowance reason="x" -->', '<!-- timeliness: allow reason="" -->', '<!-- timeliness: allow reason="   " -->', '```md\n<!-- timeliness: allow reason="quoted example" -->\n```']) {
    put(dir, 'docs/guides/probe.md', `${marker}\n# Changelog`);
    assert.equal((await checkTimeliness(dir)).findings.length, 1);
  }
  put(dir, 'docs/guides/probe.md', '<!-- timeliness: allow reason="quoted historical teaching example" -->\n# Changelog');
  assert.equal((await checkTimeliness(dir)).findings.length, 0);
  put(dir, 'docs/guides/probe.md', '```md\n# Changelog\n```\nCurrent prose, formerly something else.');
  assert.equal((await checkTimeliness(dir)).findings.length, 0, 'not a semantic history detector');
  await assert.rejects(checkTimeliness(dir, []), /zero timeliness coverage/);
});
test('descendant dangling junction/symlink errors cannot be swallowed', async (t) => {
  const dir = fixture(t);
  mkdirSync(join(dir, 'docs/guides'), { recursive: true });
  // Directory junctions need no file-symlink privilege on Windows.
  symlinkSync(join(dir, 'absent'), join(dir, 'docs/guides/broken'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(checkTimeliness(dir), /ENOENT/);
  await assert.rejects(checkReferences(dir), /ENOENT/);
});
test('garbled CLI is diagnostic by default, explicit blocking is red, reports stay under _tmp', (t) => {
  const dir = fixture(t);
  const git = (...args) => { const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  git('init', '-q'); put(dir, 'docs/probe.md', 'bad \uFFFD'); git('add', '--', 'docs/probe.md');
  const run = (...args) => spawnSync(process.execPath, [join(root, 'tools/check-docs-garbled.mjs'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, AGE_REPO_ROOT: dir } });
  const diagnostic = run(); assert.equal(diagnostic.status, 0, diagnostic.stderr); assert.match(diagnostic.stdout, /Heuristic diagnostic/);
  assert.equal(run('--blocking').status, 1);
  assert.match(diagnostic.stdout, /_tmp\/docs-garbled-check/);
  assert.ok(existsSync(join(dir, '_tmp/docs-garbled-check/summary.md')));
  assert.ok(!existsSync(join(dir, 'tmp')));
});
