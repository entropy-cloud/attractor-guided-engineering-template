import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = fileURLToPath(new URL('../', import.meta.url));
export const DOC_ROOTS = ['docs/architecture', 'docs/design', 'docs/references', 'docs/context', 'docs/guides', 'docs/skills', 'docs/requirements', '.agents/skills'];
export const DOC_FILES = ['AGENTS.md', 'docs/index.md'];
const lineRefPattern = /\b([A-Za-z0-9_./-]+\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|vue|py|java|go|rs|sh|css|scss|html|yml|yaml)):(\d+)(?:-\d+)?\b/g;

// Kept as a pure export for the engine's existing regression tests.
export function findLineRefs(content) {
  const seen = new Set();
  return [...content.matchAll(lineRefPattern)].filter((m) => !seen.has(m[0]) && seen.add(m[0]))
    .map((m) => ({ line: content.slice(0, m.index).split('\n').length, ref: m[0] }));
}

async function exists(file) {
  try { await access(file); return true; }
  catch (e) { if (e.code === 'ENOENT') return false; throw e; }
}

async function collect(root, target, optional = false) {
  const abs = path.join(root, target);
  let info;
  try { info = await stat(abs); }
  catch (e) { if (optional && e.code === 'ENOENT') return []; throw e; }
  if (info.isFile()) return target.endsWith('.md') ? [target] : [];
  const out = [];
  for (const entry of await readdir(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    out.push(...await collect(root, `${target}/${entry.name}`));
  }
  return out;
}

export function classifyReference(target) {
  if (/^(?:https?:|mailto:|ftp:|external:)/i.test(target)) return 'external';
  if (/^example:/.test(target) || /[{}<>*]|\b(?:YYYY|HHmm|NNN)\b/.test(target)) return 'example';
  if (/^(?:source:|template\/)/.test(target)) return 'source';
  if (/^(?:\$MISSION_DRIVER_HOME\/|engine:)/.test(target)) return 'engine';
  return 'local';
}

export async function checkReferences(root, options = {}) {
  root = path.resolve(root);
  const files = new Set(options.files ?? DOC_FILES);
  const roots = options.roots ?? DOC_ROOTS;
  for (const target of roots) for (const file of await collect(root, target, true)) files.add(file);
  // Source checkouts also scan the consumer overlay, in its own virtual root.
  if (!options.files && !options.roots && await exists(path.join(root, 'template/AGENTS.md'))) {
    files.add('template/AGENTS.md');
    files.add('template/docs/index.md');
    for (const target of DOC_ROOTS) for (const file of await collect(root, `template/${target}`, true)) files.add(file);
  }
  if (!files.size) throw Error('No active docs: zero reference coverage');
  const failures = [], classified = { local: 0, external: 0, example: 0, source: 0, engine: 0, 'optional-engine': 0, 'optional-source': 0 };
  for (const file of [...files].sort()) {
    const text = await readFile(path.join(root, file), 'utf8');
    const lines = text.split(/\r?\n/);
    let fence = null, exampleFence = false;
    for (const [index, line] of lines.entries()) {
      const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (mark) {
        if (!fence) { fence = mark[1]; exampleFence = /\bexample\b/.test(mark[2]); }
        else if (mark[1][0] === fence[0] && mark[1].length >= fence.length) { fence = null; exampleFence = false; }
        continue;
      }
      const annotation = exampleFence ? 'example' : /<!-- doc-ref: (example|external) reason="[^"\r\n]+" -->/.exec(line)?.[1];
      if (!options.allowLineRefs && !annotation) for (const hit of findLineRefs(line)) failures.push(`${file}:${index + 1} [line-ref] ${hit.ref}`);
      const refs = [...line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((m) => ({ target: m[1].trim(), link: true }));
      for (const m of line.matchAll(/`([^`\r\n]+)`/g)) {
        const target = m[1];
        if (/^(?:[\w.-]+\/|\.agents\/|\.githooks\/|\.github\/|\$MISSION_DRIVER_HOME\/|engine:|external:|example:|source:)/.test(target) || target === 'AGENTS.md') {
          if (/\.(?:md|mjs|js|ts|json|ya?ml|sh|vue|html|txt|cmd)(?:#.*)?$/i.test(target) || /[{}<>*]/.test(target)) refs.push({ target, link: false });
        }
      }
      for (const ref of refs) {
        let target = ref.target.split('#')[0];
        if (!target) continue;
        const kind = (!ref.link && annotation) || classifyReference(target);
        classified[kind]++;
        if (kind === 'external' || kind === 'example') continue;
        if (kind === 'source') {
          if (!await exists(path.join(root, 'install-age.manifest'))) { classified['optional-source']++; continue; }
          target = target.replace(/^source:/, '');
        }
        if (kind === 'engine') target = target.replace(/^(?:\$MISSION_DRIVER_HOME\/|engine:)/, 'tools/mission-driver/');
        if (/^(?:tools\/mission-driver(?:\/|\.sh$)|missions\/(?:base|demo|onboarding)\.json$)/.test(target) && !await exists(path.join(root, 'tools/mission-driver'))) {
          classified['optional-engine']++; continue;
        }
        const rootRelative = kind === 'source' || target === 'AGENTS.md' || /^(?:docs|tools|template|src|lib|tests|packages|apps|plugin|missions|\.agents|\.github|\.githooks)\//.test(target);
        const relative = target.startsWith('/') ? target.slice(1) : rootRelative ? target : path.join(path.dirname(file), target);
        const candidates = [relative];
        if (file.startsWith('template/') && rootRelative) candidates.unshift(`template/${relative}`);
        if (!(await Promise.all(candidates.map((p) => exists(path.resolve(root, p))))).some(Boolean)) {
          failures.push(`${file}:${index + 1} [${ref.link ? 'link' : kind}] ${ref.target}`);
        }
      }
    }
  }
  return { files: files.size, failures, classified };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const split = (value) => value.split(',').map((s) => s.trim()).filter(Boolean);
  const options = { allowLineRefs: /^(1|true)$/.test(process.env.AGE_ALLOW_LINE_REFS || '') };
  if (process.env.AGE_ACTIVE_DOC_ROOTS) options.roots = split(process.env.AGE_ACTIVE_DOC_ROOTS);
  if (process.env.AGE_ACTIVE_DOC_FILES) options.files = split(process.env.AGE_ACTIVE_DOC_FILES);
  checkReferences(process.env.AGE_REPO_ROOT || home, options).then((result) => {
    console.log(`[check-doc-references] ${result.files} active docs; classifications ${JSON.stringify(result.classified)}`);
    for (const failure of result.failures) console.error(failure);
    if (result.failures.length) process.exitCode = 1;
  }).catch((e) => { console.error('[check-doc-references]', e.message); process.exitCode = 1; });
}
