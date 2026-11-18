import { execFile } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = process.env.AGE_REPO_ROOT ? path.resolve(process.env.AGE_REPO_ROOT) : path.join(__dirname, '..');
const outputDir = path.join(rootDir, '_tmp', 'docs-garbled-check');

const textExtensions = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.html',
  '.svg',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
]);

const suspiciousSingles = new Map([
  ['\uFFFD', 'replacement-char'],
  ['\uFEFF', 'bom'],
  ['\u200B', 'zero-width-space'],
  ['\u200C', 'zero-width-non-joiner'],
  ['\u200D', 'zero-width-joiner'],
  ['\u2060', 'word-joiner'],
]);

const mojibakePattern = /(?:Ã.|Â.|â€¦|â€"|â€"|â€|ðŸ|Ð.|Ñ.|æ.|ç.|ä.|å.)/u;
const asciiLetterPattern = /^[A-Za-z]$/u;
const hanPattern = /^\p{Script=Han}$/u;
const numberPattern = /^\p{Number}$/u;
const punctuationPattern = /^\p{Punctuation}$/u;
const symbolPattern = /^\p{Symbol}$/u;
const separatorPattern = /^\p{Separator}$/u;
const markPattern = /^\p{Mark}$/u;
const letterPattern = /^\p{Letter}$/u;
const controlPattern = /^\p{Control}$/u;
const formatPattern = /^\p{Format}$/u;
const privateUsePattern = /^\p{Private_Use}$/u;
const noncharacterPattern = /^\p{Noncharacter_Code_Point}$/u;

function toRelativePath(absolutePath) {
  return path.relative(rootDir, absolutePath).replaceAll('\\', '/');
}

function getLineColumn(content, index) {
  let line = 1;
  let column = 1;

  for (let i = 0; i < index; i += 1) {
    if (content[i] === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return { line, column };
}

function getLineText(content, lineNumber) {
  const lines = content.split(/\r?\n/u);
  return lines[lineNumber - 1] ?? '';
}

function getContextSnippet(lineText, column) {
  const start = Math.max(0, column - 21);
  const end = Math.min(lineText.length, column + 20);
  return lineText.slice(start, end);
}

function getCodePointLabel(character) {
  return `U+${character.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
}

function isAllowedCharacter(character, index) {
  if (character === '\n' || character === '\r' || character === '\t') {
    return true;
  }

  if (character >= ' ' && character <= '~') {
    return true;
  }

  if (hanPattern.test(character)) {
    return true;
  }

  if (index === 0 && character === '\uFEFF') {
    return true;
  }

  if (
    numberPattern.test(character) ||
    punctuationPattern.test(character) ||
    symbolPattern.test(character) ||
    separatorPattern.test(character) ||
    markPattern.test(character)
  ) {
    return true;
  }

  return false;
}

function classifyCharacter(character, index) {
  if (suspiciousSingles.has(character) && !(index === 0 && character === '\uFEFF')) {
    return suspiciousSingles.get(character);
  }
  if (isAllowedCharacter(character, index)) {
    return null;
  }

  if (suspiciousSingles.has(character)) {
    return suspiciousSingles.get(character);
  }

  if (controlPattern.test(character)) {
    return 'control-char';
  }

  if (formatPattern.test(character)) {
    return 'format-char';
  }

  if (privateUsePattern.test(character)) {
    return 'private-use-char';
  }

  if (noncharacterPattern.test(character)) {
    return 'noncharacter';
  }

  if (letterPattern.test(character)) {
    if (asciiLetterPattern.test(character)) {
      return null;
    }

    if (hanPattern.test(character)) {
      return null;
    }

    return 'unexpected-letter';
  }

  return 'unexpected-char';
}

function scoreOccurrence(type, context) {
  if (
    type === 'replacement-char' ||
    type === 'control-char' ||
    type === 'private-use-char' ||
    type === 'noncharacter'
  ) {
    return 5;
  }

  if (type === 'zero-width-space' || type === 'zero-width-non-joiner' || type === 'zero-width-joiner') {
    return 4;
  }

  if (type === 'format-char' || type === 'word-joiner' || type === 'bom') {
    return 3;
  }

  if (type === 'unexpected-letter') {
    return mojibakePattern.test(context) ? 4 : 2;
  }

  return 2;
}

function buildVerdict(occurrences) {
  let score = 0;
  let hasHighConfidenceMarker = false;

  for (const occurrence of occurrences) {
    score += scoreOccurrence(occurrence.type, occurrence.context);
    if (
      occurrence.type === 'replacement-char' ||
      occurrence.type === 'control-char' ||
      occurrence.type === 'private-use-char' ||
      occurrence.type === 'noncharacter' ||
      mojibakePattern.test(occurrence.context)
    ) {
      hasHighConfidenceMarker = true;
    }
  }

  if (hasHighConfidenceMarker || score >= 6) {
    return { status: 'likely-garbled', score };
  }

  return { status: 'needs-review', score };
}

async function getTrackedDocFiles() {
  const { stdout } = await execFileAsync('git', ['ls-files', 'docs'], {
    cwd: rootDir,
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((filePath) => textExtensions.has(path.extname(filePath).toLowerCase()));
}

async function scanFile(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const content = await readFile(absolutePath, 'utf8');
  const occurrences = [];

  for (let index = 0; index < content.length; ) {
    const codePoint = content.codePointAt(index);
    const character = String.fromCodePoint(codePoint);
    const width = codePoint > 0xffff ? 2 : 1;
    const type = classifyCharacter(character, index);

    if (type) {
      const { line, column } = getLineColumn(content, index);
      const lineText = getLineText(content, line);
      occurrences.push({
        type,
        character,
        codePoint: getCodePointLabel(character),
        line,
        column,
        context: getContextSnippet(lineText, column),
      });
    }

    index += width;
  }

  return { relativePath, occurrences };
}

function buildSummary(scannedFileCount, candidates, verdicts) {
  const likely = verdicts.filter((item) => item.status === 'likely-garbled');
  const review = verdicts.filter((item) => item.status === 'needs-review');
  const lines = [
    '# Docs Garbled Character Check',
    '',
    `- scanned files: ${scannedFileCount}`,
    `- candidate files: ${candidates.length}`,
    `- likely garbled: ${likely.length}`,
    `- needs review: ${review.length}`,
    '',
    '## Likely Garbled',
    '',
  ];

  if (likely.length === 0) {
    lines.push('- None');
  } else {
    for (const item of likely) {
      const types = item.occurrenceTypes.join(', ');
      lines.push(`- ${item.file}: score=${item.score}; types=${types}`);
    }
  }

  lines.push('', '## Needs Review', '');

  if (review.length === 0) {
    lines.push('- None');
  } else {
    for (const item of review) {
      const types = item.occurrenceTypes.join(', ');
      lines.push(`- ${item.file}: score=${item.score}; types=${types}`);
    }
  }

  lines.push('', '## Output Files', '', '- `_tmp/docs-garbled-check/candidates.json`', '- `_tmp/docs-garbled-check/verdicts.json`');

  return `${lines.join('\n')}\n`;
}

async function main() {
  if (process.argv.slice(2).some((arg) => arg !== '--blocking')) throw Error('Usage: check-docs-garbled.mjs [--blocking]');
  await mkdir(outputDir, { recursive: true });

  const trackedFiles = await getTrackedDocFiles();
  if (trackedFiles.length === 0) {
    throw Error('No tracked docs files: zero diagnostic coverage');
  }
  const scans = await Promise.all(trackedFiles.map((relativePath) => scanFile(relativePath)));
  const candidates = scans
    .filter((item) => item.occurrences.length > 0)
    .map((item) => ({
      file: item.relativePath,
      occurrenceCount: item.occurrences.length,
      occurrenceTypes: [...new Set(item.occurrences.map((occurrence) => occurrence.type))],
      occurrences: item.occurrences,
    }))
    .sort((left, right) => left.file.localeCompare(right.file));

  const verdicts = candidates.map((candidate) => {
    const verdict = buildVerdict(candidate.occurrences);
    return {
      file: candidate.file,
      scannedFileCount: trackedFiles.length,
      status: verdict.status,
      score: verdict.score,
      occurrenceCount: candidate.occurrenceCount,
      occurrenceTypes: candidate.occurrenceTypes,
      examples: candidate.occurrences.slice(0, 20),
    };
  });

  await writeFile(path.join(outputDir, 'candidates.json'), `${JSON.stringify(candidates, null, 2)}\n`);
  await writeFile(path.join(outputDir, 'verdicts.json'), `${JSON.stringify(verdicts, null, 2)}\n`);
  await writeFile(
    path.join(outputDir, 'summary.md'),
    buildSummary(trackedFiles.length, candidates, verdicts),
  );

  const likelyCount = verdicts.filter((item) => item.status === 'likely-garbled').length;
  console.log(`[check-docs-garbled] Scanned ${trackedFiles.length} docs files`);
  console.log(`[check-docs-garbled] Candidate files: ${candidates.length}`);
  console.log(`[check-docs-garbled] Likely garbled: ${likelyCount}`);
  console.log(`[check-docs-garbled] Reports written to ${toRelativePath(outputDir)}`);
  console.log('[check-docs-garbled] Heuristic diagnostic, not proof of clean encoding. Blocking only with --blocking.');
  if (process.argv.includes('--blocking') && likelyCount) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[check-docs-garbled] Error:', error);
  process.exit(1);
});
