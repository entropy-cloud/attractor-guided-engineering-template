// Mechanical frontmatter auto-repair for plan ledgers — the lossless subset
// only. Contract split (2026-09-21, im-deep-analysis 36-ledger loop):
//   - mechanical (auto-repairable): bare multi-word / flow-char scalar values
//     that only need quoting — deterministic, byte-lossless, no fact asserted;
//   - semantic (NEVER auto-repaired): status vocabulary mapping (done →
//     completed asserts work finished), missing `## Closure` structure, unknown
//     keys — these need an agent/human judgment and stay on the fail-loud path.
// Zero imports, same discipline as ledger-frontmatter.mjs. Idempotent: a
// second run on repaired text returns changed=false.
//
// Deliberately unrepairable (left untouched, flagged by the caller):
//   - bare values containing a ` #` inline comment — quoting would fold the
//     comment into the value (cutComment only strips it on bare values), so
//     the rewrite is not lossless;
//   - structural rejects (block scalars, anchors, unterminated quotes,
//     indented entries, duplicate keys) — no single canonical rewrite.

const FM_KEY_RE = /^([A-Za-z0-9][A-Za-z0-9_-]*):[ \t]?(.*)$/;

/**
 * Quote bare multi-word / flow-char scalar values inside the frontmatter block.
 *
 * @param {string} text full plan file content
 * @returns {{ changed: boolean, text: string, repairs: Array<{ line: number, before: string, after: string }> }}
 */
export function autoRepairFrontmatter(text) {
  const src = text.replace(/^\uFEFF/, "");
  const hadBom = src !== text;
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const lines = src.split(/\r?\n/);
  if (lines[0].trim() !== "---") return { changed: false, text, repairs: [] };

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return { changed: false, text, repairs: [] };

  const repairs = [];
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const m = line.match(FM_KEY_RE);
    if (!m) continue;
    const value = m[2].trim();
    if (!needsQuoting(value)) continue;
    const quoted = `${m[1]}: "${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    repairs.push({ line: i + 1, before: line, after: quoted });
    lines[i] = quoted;
  }
  if (repairs.length === 0) return { changed: false, text, repairs: [] };
  const out = (hadBom ? "\uFEFF" : "") + lines.join(eol);
  return { changed: true, text: out, repairs };
}

function needsQuoting(value) {
  if (value === "") return false;
  if (value.startsWith('"') || value.startsWith("'") || value.startsWith("[")) return false;
  if (/\s#/.test(value)) return false; // inline comment — not lossless, skip
  return /\s/.test(value) || /[,[\]{}]/.test(value);
}
