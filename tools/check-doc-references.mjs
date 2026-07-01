import { access, readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = process.env.AGE_REPO_ROOT
  ? path.resolve(process.env.AGE_REPO_ROOT)
  : path.join(__dirname, '..');

const activeDocRoots = (process.env.AGE_ACTIVE_DOC_ROOTS || 'docs/architecture,docs/design,docs/references')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const explicitActiveDocs = (process.env.AGE_ACTIVE_DOC_FILES || 'docs/index.md')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const ignoredDirectoryNames = new Set(['node_modules']);
const ignoredPathPrefixes = [
  'docs/analysis/',
  'docs/archive/',
  'docs/logs/',
  'docs/plans/',
];
const ignoredFiles = (process.env.AGE_DOC_REFS_IGNORE_FILES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const backtickPattern = /`((?:src|lib|docs|tools|tests|packages|apps)\/[^`\r\n]+)`/g;
const markdownLinkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;

function getLineNumber(content, matchIndex) {
  return content.slice(0, matchIndex).split(/\r?\n/).length;
}

function looksLikeFilePath(candidate) {
  if (!/\.[a-z0-9]+$/i.test(candidate)) {
    return false;
  }
  if (candidate.includes('{') || candidate.includes('}') || candidate.includes('*')) {
    return false;
  }
  if (candidate.includes('<') || candidate.includes('>')) {
    return false;
  }
  if (/\b(YYYY|MM|DD|HH|mm|NNN)\b/.test(candidate)) {
    return false;
  }
  if (/\d{4}-\d{2}-\d{2}-\d{4}-/.test(candidate)) {
    return false;
  }
  if (/\/\d{3}-\d{4}-\d{2}-\d{2}-/.test(candidate)) {
    return false;
  }
  return true;
}

function isExternalLink(target) {
  return (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('ftp://')
  );
}

function stripAnchor(target) {
  const hashIndex = target.indexOf('#');
  return hashIndex >= 0 ? target.slice(0, hashIndex) : target;
}

async function pathExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function toPosixPath(filePath) {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}

function shouldIgnoreDoc(relativePath) {
  if (ignoredPathPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return true;
  }
  if (ignoredFiles.includes(relativePath)) {
    return true;
  }
  return false;
}

async function collectMarkdownFiles(dir) {
  const files = [];
  let entries;

  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    if (ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name) !== '.md') {
      continue;
    }

    const relativePath = toPosixPath(fullPath);
    if (!shouldIgnoreDoc(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

async function getActiveDocPaths() {
  const discovered = new Set(explicitActiveDocs);

  for (const root of activeDocRoots) {
    for (const file of await collectMarkdownFiles(path.join(rootDir, root))) {
      discovered.add(file);
    }
  }

  return [...discovered].sort((a, b) => a.localeCompare(b));
}

async function main() {
  const failures = [];
  const activeDocPaths = await getActiveDocPaths();

  if (activeDocPaths.length === 0) {
    console.log('[check-doc-references] No active docs configured or found.');
    return;
  }

  for (const docPath of activeDocPaths) {
    const content = await readFile(path.join(rootDir, docPath), 'utf8');
    const seenPaths = new Set();
    const docDir = path.dirname(docPath);

    for (const match of content.matchAll(backtickPattern)) {
      const candidate = match[1];
      if (!looksLikeFilePath(candidate) || seenPaths.has(`bt:${candidate}`)) {
        continue;
      }

      seenPaths.add(`bt:${candidate}`);
      const absolutePath = path.join(rootDir, candidate);
      if (!(await pathExists(absolutePath))) {
        failures.push({
          docPath,
          line: getLineNumber(content, match.index ?? 0),
          missingPath: candidate,
          source: 'backtick',
        });
      }
    }

    for (const match of content.matchAll(markdownLinkPattern)) {
      const raw = match[2].trim();
      const target = stripAnchor(raw);

      if (!target || isExternalLink(target)) {
        continue;
      }

      if (seenPaths.has(`md:${target}`)) {
        continue;
      }

      seenPaths.add(`md:${target}`);

      if (target.startsWith('/')) {
        const absolutePath = path.join(rootDir, target.slice(1));
        if (!(await pathExists(absolutePath))) {
          failures.push({
            docPath,
            line: getLineNumber(content, match.index ?? 0),
            missingPath: target,
            source: 'markdown',
          });
        }
      } else {
        const resolved = path.join(docDir, target);
        const normalized = path.normalize(resolved);
        const absolutePath = path.join(rootDir, normalized);
        if (!(await pathExists(absolutePath))) {
          failures.push({
            docPath,
            line: getLineNumber(content, match.index ?? 0),
            missingPath: target,
            source: 'markdown',
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('[check-doc-references] ERROR: unresolved references found:');
    for (const failure of failures) {
      console.error(`  - ${failure.docPath}:${failure.line} [${failure.source}] -> ${failure.missingPath}`);
    }
    process.exit(1);
  }

  console.log(
    `[check-doc-references] Verified references in ${activeDocPaths.length} active docs`,
  );
}

main().catch((error) => {
  console.error('[check-doc-references] Error:', error);
  process.exit(1);
});
