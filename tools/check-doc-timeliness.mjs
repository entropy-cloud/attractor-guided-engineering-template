#!/usr/bin/env node
// tools/check-doc-timeliness.mjs — normative-doc hygiene guard (zero npm deps).
//
// Enforces the v2 normative/timeliness separation law: normative documents
// (architecture, design, context, requirements, guides, skills, AGENTS.md)
// must carry no historical-change information. History belongs in
// docs/logs/ (see docs/guides/doc-organization.md).
//
// Detects, outside code fences and blockquotes-of-quotes:
//   1. changelog/revision-history headings (en + zh)
//   2. dated headings (## 2026-08-24 ...)
//   3. dated bullets (- 2026-08-24: ...)
//   4. "Last updated: <date>" metadata lines
//
// Escape hatch in the first 2KB: <!-- timeliness: allow reason="specific reason" -->
//
// Usage: node tools/check-doc-timeliness.mjs [root]
//   root defaults to AGE_REPO_ROOT or the repo containing tools/.
// Exit: 0 clean, 1 findings (each printed as file:line: rule: excerpt).

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.env.AGE_REPO_ROOT
    ? path.resolve(process.env.AGE_REPO_ROOT)
    : path.join(__dirname, "..");

// Normative surfaces (files and directories, relative to root).
const NORMATIVE_TARGETS = [
  "AGENTS.md",
  "docs/index.md",
  "docs/architecture",
  "docs/design",
  "docs/context",
  "docs/requirements",
  "docs/guides",
  "docs/skills",
  "template/AGENTS.md",
  "template/docs",
];

// Intentional exclusions inside the targets above:
//   - docs/design/age-autonomy/** — engine law corpus; its dated plan/audit
//     references are contract citations, not doc-history narration.
//   - template/install/**         — consumer install narrative (describes the
//     installer's own behavior incl. the add-on decision flow).
const IGNORED_PREFIXES = [
  "docs/design/age-autonomy/",
  "template/install/",
  "node_modules/",
];

const RULES = [
  {
    id: "changelog-heading",
    pattern:
      /^#{1,6}\s.*(?:changelog|change\s*log|revision\s*history|version\s*history|变更记录|修改记录|修订记录|历史记录)\s*$/i,
    message: "changelog/history heading in a normative doc — move history to docs/logs/",
  },
  {
    id: "dated-heading",
    pattern: /^#{1,6}\s.*\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/,
    message: "dated heading in a normative doc — dated sections belong in timeliness dirs",
  },
  {
    id: "dated-bullet",
    pattern: /^[-*]\s+(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\s*[:：-]/,
    message: "dated bullet in a normative doc — execution history belongs in docs/logs/ or the closing plan",
  },
  {
    id: "last-updated-metadata",
    pattern: /^\s*(?:[-*>]+\s*)?(?:last\s+updated|updated|最后更新|更新(?:日期|于))\s*[:：]\s*(?:19|20)\d{2}/i,
    message: "'last updated' metadata in a normative doc — freshness lives in git history and logs",
  },
];

const isIgnored = (rel) =>
  IGNORED_PREFIXES.some((prefix) => rel.startsWith(prefix)) ||
  rel.split("/").includes("node_modules");

async function* walk(abs) {
  const st = await stat(abs);
  if (st.isDirectory()) {
    for (const entry of await readdir(abs)) {
      yield* walk(path.join(abs, entry));
    }
  } else if (st.isFile() && /\.md$/i.test(abs)) {
    yield abs;
  }
}

export function findingsIn(content, rel) {
  const findings = [];
  const lines = content.split(/\r?\n/);
  let inFence = false;
  let fenceMarker = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(/^\s{0,3}(```+|~~~+)/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fenceMatch[1][0];
      } else if (fenceMatch[1][0] === fenceMarker) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue; // fenced examples never count
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        findings.push(
          `${rel}:${i + 1}: [${rule.id}] ${rule.message}\n    ${line.slice(0, 100)}`,
        );
      }
    }
  }
  return findings;
}

export async function checkTimeliness(root = rootDir, targets = NORMATIVE_TARGETS) {
  const findings = [];
  let files = 0;
  for (const target of targets) {
    const abs = path.join(root, target);
    try { await stat(abs); }
    catch (e) { if (e.code === 'ENOENT') continue; throw e; }
    for await (const file of walk(abs)) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (isIgnored(rel)) continue;
      files++;
      const content = await readFile(file, "utf8");
      if (/^\uFEFF?\s*<!-- timeliness: allow reason="[^"\r\n]*\S[^"\r\n]*" -->[^\S\r\n]*(?:\r?\n|$)/.test(content.slice(0, 2048))) continue;
      findings.push(...findingsIn(content, rel));
    }
  }
  if (!files) throw Error('No normative docs: zero timeliness coverage');
  return { files, findings };
}

async function main() {
  const { files, findings } = await checkTimeliness();
  if (findings.length > 0) {
    console.error(
      `check-doc-timeliness: ${findings.length} violation(s) of the normative/timeliness separation:`,
    );
    for (const f of findings) console.error("  " + f);
    console.error(
      "\nNormative docs state the current baseline only (docs/guides/doc-organization.md).",
    );
    console.error(
      'Escape hatch: <!-- timeliness: allow reason="specific reason" --> in the header.',
    );
    process.exit(1);
  }
  console.log(`check-doc-timeliness: ${files} docs; no configured syntax-pattern findings (not semantic freshness proof)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('check-doc-timeliness:', e.message); process.exitCode = 1; });
}
