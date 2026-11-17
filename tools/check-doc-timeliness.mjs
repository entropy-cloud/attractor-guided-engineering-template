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
// Escape hatch: a file whose first 2KB contains `<!-- timeliness: allow -->`
// is skipped entirely (use only with a one-line reason next to the marker).
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

const toRel = (p) => path.relative(rootDir, p).split(path.sep).join("/");
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

function findingsIn(content, rel) {
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

async function main() {
  const findings = [];
  for (const target of NORMATIVE_TARGETS) {
    const abs = path.join(rootDir, target);
    try {
      for await (const file of walk(abs)) {
        const rel = toRel(file);
        if (isIgnored(rel)) continue;
        const content = await readFile(file, "utf8");
        if (content.slice(0, 2048).includes("<!-- timeliness: allow")) continue;
        findings.push(...findingsIn(content, rel));
      }
    } catch {
      // target does not exist in this repo shape — skip silently
    }
  }

  if (findings.length > 0) {
    console.error(
      `check-doc-timeliness: ${findings.length} violation(s) of the normative/timeliness separation:`,
    );
    for (const f of findings) console.error("  " + f);
    console.error(
      "\nNormative docs state the current baseline only (docs/guides/doc-organization.md).",
    );
    console.error(
      "Escape hatch: '<!-- timeliness: allow -->' with a reason in the file header.",
    );
    process.exit(1);
  }
  console.log("check-doc-timeliness: clean (normative docs carry no history)");
}

main();
