// AGE file-ledger frontmatter subset parser + plan/roadmap field-set validators.
// Contract: docs/design/age-autonomy/01-file-ledger.md §2/§3.1/§4.1/§5.1 — zero imports,
// flat scalar keys + single-level flow arrays only; out-of-subset syntax is rejected, never tolerated.

export const WRITABLE_PLAN_STATUSES = ["draft", "active", "held", "cancelled", "superseded", "deferred"];
export const TERMINAL_PLAN_STATUSES = ["cancelled", "superseded", "deferred"];
export const DERIVED_PLAN_STATUS = "completed";
export const PLAN_FRONTMATTER_FIELDS = [
  "status", "mission", "work-item", "group", "failures", "verify", "agent", "hold", "claim", "claim-expires",
];
export const ROADMAP_FRONTMATTER_FIELDS = ["audit-rounds"];

const INT_RE = /^-?[0-9]+$/;
const COMMAND_KEY_RE = /^[A-Za-z][A-Za-z0-9:_-]*$/;
const AGENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const CLAIM_RE = /^attempt-.+-.+-[0-9a-f]{8}$/;
const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

class LedgerSyntaxError extends Error {
  constructor(line, col, msg) {
    super(`line ${line}, col ${col}: ${msg}`);
  }
}

function cutComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || s[i - 1] === " " || s[i - 1] === "\t")) return s.slice(0, i);
  }
  return s;
}

function parseQuoted(s, lineNo, col) {
  const q = s[0];
  let out = "";
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (q === '"' && c === "\\") {
      const n = s[i + 1];
      if (n !== '"' && n !== "\\") throw new LedgerSyntaxError(lineNo, col + i, "unsupported escape — only \\\" and \\\\ are allowed");
      out += n;
      i++;
    } else if (q === "'" && c === "'" && s[i + 1] === "'") {
      out += "'";
      i++;
    } else if (c === q) {
      const rest = s.slice(i + 1).trim();
      if (rest !== "") throw new LedgerSyntaxError(lineNo, col + i + 2, `unexpected content after closing quote: "${rest}"`);
      return out;
    } else {
      out += c;
    }
  }
  throw new LedgerSyntaxError(lineNo, col + s.length, "unterminated quoted string — single-line only");
}

function splitTopLevel(inner) {
  const parts = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === "\\") { cur += inner[i + 1] ?? ""; i++; }
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ",") {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts;
}

function parseScalar(s, lineNo, col) {
  const c = s[0];
  if (c === "|" || c === ">") throw new LedgerSyntaxError(lineNo, col, "block scalars are forbidden in the ledger subset");
  if (c === "&") throw new LedgerSyntaxError(lineNo, col, "anchors are forbidden in the ledger subset");
  if (c === "*") throw new LedgerSyntaxError(lineNo, col, "aliases are forbidden in the ledger subset");
  if (c === "{") throw new LedgerSyntaxError(lineNo, col, "nested objects are forbidden in the ledger subset");
  if (c === '"' || c === "'") return parseQuoted(s, lineNo, col);
  if (/\s/.test(s)) throw new LedgerSyntaxError(lineNo, col, `bare values must be single words — quote multi-word strings (got "${s}")`);
  if (/[,[\]{}]/.test(s)) throw new LedgerSyntaxError(lineNo, col, `bare value "${s}" contains flow syntax characters — quote it or use an array`);
  return INT_RE.test(s) ? Number(s) : s;
}

function parseValue(raw, lineNo, col) {
  const value = cutComment(raw).trim();
  if (value === "") throw new LedgerSyntaxError(lineNo, col, "empty value — block scalars (| or >) and nulls are forbidden");
  if (!value.startsWith("[")) return parseScalar(value, lineNo, col);
  if (!value.endsWith("]")) throw new LedgerSyntaxError(lineNo, col, "flow arrays must open and close on a single line");
  const inner = value.slice(1, -1).trim();
  if (inner === "") return [];
  return splitTopLevel(inner).map((part) => {
    const el = part.trim();
    if (el === "") throw new LedgerSyntaxError(lineNo, col, "empty flow array element");
    return parseScalar(el, lineNo, col);
  });
}

function parseBlock(text) {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  if (lines[0].trim() !== "---") return { fm: {}, range: null };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) throw new LedgerSyntaxError(lines.length, 1, "frontmatter opened with --- but never closed");
  const fm = {};
  for (let i = 1; i < end; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (line[0] === " " || line[0] === "\t") throw new LedgerSyntaxError(lineNo, 1, "indented entries are forbidden — flat keys only");
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9_-]*):/);
    if (!m) throw new LedgerSyntaxError(lineNo, 1, "invalid entry — expected `key: value` with a bare single-word key");
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(fm, key)) throw new LedgerSyntaxError(lineNo, key.length + 1, `duplicate key "${key}"`);
    fm[key] = parseValue(line.slice(key.length + 1), lineNo, key.length + 2);
  }
  return { fm, range: { start: 1, end: end + 1 } };
}

export function parseFrontmatter(text) {
  try {
    const { fm, range } = parseBlock(text);
    return { ok: true, fm, error: null, range };
  } catch (e) {
    if (e instanceof LedgerSyntaxError) return { ok: false, fm: null, error: e.message, range: null };
    throw e;
  }
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function pushUnknownFieldErrors(fm, fields, errors) {
  for (const k of Object.keys(fm)) {
    if (!fields.includes(k)) errors.push(`unknown field "${k}"`);
  }
}

export function validatePlanFrontmatter(fm) {
  const errors = [];
  if (!isPlainObject(fm)) return { ok: false, errors: ["frontmatter must be a plain object"] };
  pushUnknownFieldErrors(fm, PLAN_FRONTMATTER_FIELDS, errors);
  const status = fm.status;
  if (status === undefined) {
    errors.push('missing required field "status"');
  } else if (status === DERIVED_PLAN_STATUS) {
    errors.push('"completed" is a derived status and must never be written in frontmatter');
  } else if (typeof status !== "string" || !WRITABLE_PLAN_STATUSES.includes(status)) {
    errors.push(`invalid status ${JSON.stringify(status)} — must be one of: ${WRITABLE_PLAN_STATUSES.join(" | ")}`);
  }
  for (const key of ["mission", "work-item"]) {
    const v = fm[key];
    if (v === undefined) errors.push(`missing required field "${key}"`);
    else if (typeof v !== "string" || v.trim() === "") errors.push(`"${key}" must be a non-empty string`);
  }
  if (fm.group !== undefined && (typeof fm.group !== "string" || fm.group.trim() === "")) {
    errors.push('"group" must be a non-empty string when present');
  }
  if (fm.failures !== undefined) {
    const v = fm.failures;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      errors.push(`"failures" must be a non-negative integer (got ${JSON.stringify(v)})`);
    }
  }
  if (fm.verify !== undefined) {
    const v = fm.verify;
    if (!Array.isArray(v)) {
      errors.push('"verify" must be a single-level array of command keys');
    } else {
      for (const el of v) {
        if (typeof el !== "string" || !COMMAND_KEY_RE.test(el)) {
          errors.push(`"verify" element ${JSON.stringify(el)} is not a valid command key`);
        }
      }
    }
  }
  if (fm.agent !== undefined) {
    const v = fm.agent;
    if (typeof v !== "string" || !AGENT_NAME_RE.test(v)) {
      errors.push(`"agent" must be an agent-name string (got ${JSON.stringify(v)}); policy-list membership is an M2 check`);
    }
  }
  const held = status === "held";
  if (fm.hold !== undefined) {
    if (!held) errors.push('"hold" is only allowed while status is "held"');
    if (typeof fm.hold !== "string" || fm.hold.trim() === "") errors.push('"hold" must be a non-empty string when present');
  } else if (held) {
    errors.push('"hold" is required while status is "held"');
  }
  const hasClaim = fm.claim !== undefined;
  const hasExpires = fm["claim-expires"] !== undefined;
  if (hasClaim !== hasExpires) errors.push('"claim" and "claim-expires" must appear as a pair');
  if (hasClaim && hasExpires) {
    if (status !== "active") errors.push('"claim"/"claim-expires" are only allowed while status is "active"');
    if (typeof fm.claim !== "string" || !CLAIM_RE.test(fm.claim)) {
      errors.push(`"claim" must match attempt-<runId>-<holderSessionId>-<nonce8> (got ${JSON.stringify(fm.claim)})`);
    }
    const exp = fm["claim-expires"];
    if (typeof exp !== "string" || !ISO8601_RE.test(exp) || Number.isNaN(Date.parse(exp))) {
      errors.push(`"claim-expires" must be an ISO-8601 timestamp (got ${JSON.stringify(exp)})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateRoadmapFrontmatter(fm) {
  const errors = [];
  if (!isPlainObject(fm)) return { ok: false, errors: ["frontmatter must be a plain object"] };
  pushUnknownFieldErrors(fm, ROADMAP_FRONTMATTER_FIELDS, errors);
  const v = fm["audit-rounds"];
  if (v === undefined) {
    errors.push('missing required field "audit-rounds"');
  } else if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    errors.push(`"audit-rounds" must be a non-negative integer (got ${JSON.stringify(v)})`);
  }
  return { ok: errors.length === 0, errors };
}
