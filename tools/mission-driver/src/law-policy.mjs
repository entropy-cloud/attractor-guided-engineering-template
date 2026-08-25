// AGE autonomy policy loader: restricted-YAML subset parser + schema validator
// for missions/autonomy.policy.yml (02-rule-law §3/§4.9).
// Decisions pinned in docs/plans/age-autonomy/2026-08-25-0815-1 Phase 2:
//   - Parsing strategy: hand-written restricted subset (mirrors the
//     ledger-frontmatter hard boundary — the engine stays zero-npm and the
//     plugin-side `yaml` package is unreachable from engine code). Accepted:
//     block mappings, block sequences, single-line flow mappings/arrays
//     (02 §3 example shapes: gate blocks, `model: { provider, model }`,
//     `fixedPrefix: [ { kind, ref } ]`). Rejected: anchors/aliases, block
//     scalars (|/>), multi-line scalars, tabs, nesting deeper than 4 — every
//     rejection carries a deny reason pointing at the legal shape.
//   - limits precedence: policy is authoritative, mission config (engine
//     flow.maxAuditRounds) is the fallback — one authority + one fallback per
//     constraint (single-truth discipline; consumers switch in M2/M3 plans).
//     maxFailures key is schema-reserved; default semantics land with M3/WI27.
//   - trigger `when` grammar: restricted predicate set + and/or/not (+ parens,
//     comparison ops). Execution semantics belong to M3/WI26 — this module
//     only pins syntax and predicate vocabulary. Trigger exits are exactly
//     one of dispatch | action | terminal over the known dispatch types /
//     action names (R1–R4 mapping lands with M3/WI27).
//   - unknown top-level keys and unknown gate fields are validation errors
//     (same discipline as ledger frontmatter unknown keys).

import { readFileSync } from "node:fs";
import { listRuleIds, PROPOSED_ACTION_TYPES } from "./law-core.mjs";

export const POLICY_VERSION = 1;
export const POLICY_TOP_LEVEL_FIELDS = ["version", "limits", "gates", "triggers", "agents", "dispatch"];
export const LIMITS_FIELDS = ["maxAuditRounds", "maxFailures"];
export const GATE_FIELDS = ["id", "match", "rule", "mode"];
export const GATE_MODES = ["observe", "enforce"];
export const TRIGGER_FIELDS = ["when", "dispatch", "action", "terminal"];
export const AGENT_DEF_FIELDS = ["mode", "poolKey", "idleTtlMinutes", "rotateEvery", "fixedPrefix", "model", "requireDistinctModel"];
export const AGENT_MODES = ["pooled", "fresh"];
export const FIXED_PREFIX_FIELDS = ["kind", "ref", "maxFileBytes"];
export const FIXED_PREFIX_KINDS = ["text", "file", "dir"];
export const MODEL_FIELDS = ["provider", "model", "reasoningEffort"];
export const REASONING_EFFORTS = ["default", "minimal", "low", "medium", "high"];
export const DISPATCH_TYPES = ["plan-review", "closure-audit", "deep-audit", "mechanical-verification", "draft-plans", "execute"];
export const TRIGGER_ACTION_NAMES = ["reclaim-claim"];
export const TRIGGER_TERMINAL_VALUES = ["partial", "blocked", "partial/blocked"];
export const MAX_BLOCK_DEPTH = 4;
export const MAX_FLOW_DEPTH = 3;

// Restricted trigger predicate vocabulary (02 §3 examples; `roadmap.unchecked`
// is the machine name for the prose「roadmap 有未勾」). form:
//   atom — bare predicate
//   cmp  — predicate <op> value required
//   call — predicate() <op> number required
export const TRIGGER_PREDICATES = [
  { name: "plan.full-tick", form: "atom" },
  { name: "plan.status", form: "cmp" },
  { name: "mechanical-verification-missing", form: "atom" },
  { name: "mechanical-verification-pass", form: "atom" },
  { name: "closure-receipt-missing", form: "atom" },
  { name: "review-dispatch-missing", form: "atom" },
  { name: "claim-expired", form: "atom" },
  { name: "terminal-claim", form: "cmp" },
  { name: "roadmap.unchecked", form: "atom" },
  { name: "roadmap.all-done", form: "atom" },
  { name: "deep-audit.accepted-findings", form: "cmp" },
  { name: "draftPlans", form: "call" },
  { name: "activePlans", form: "call" },
  { name: "heldPlans", form: "call" },
];

const AGENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_-]*$/;
const KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const INT_RE = /^-?[0-9]+$/;

// ── restricted YAML subset parser ───────────────────────────────────────────

class PolicySyntaxError extends Error {
  constructor(lineNo, msg) {
    super(`line ${lineNo}: ${msg}`);
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

function parseQuoted(s, lineNo) {
  const q = s[0];
  let out = "";
  for (let i = 1; i < s.length; i++) {
    const c = s[i];
    if (q === '"' && c === "\\") {
      const n = s[i + 1];
      if (n !== '"' && n !== "\\") throw new PolicySyntaxError(lineNo, `unsupported escape — only \\" and \\\\ are allowed`);
      out += n;
      i++;
    } else if (q === "'" && c === "'" && s[i + 1] === "'") {
      out += "'";
      i++;
    } else if (c === q) {
      const rest = s.slice(i + 1).trim();
      if (rest !== "") throw new PolicySyntaxError(lineNo, `unexpected content after closing quote: "${rest}"`);
      return out;
    } else {
      out += c;
    }
  }
  throw new PolicySyntaxError(lineNo, "unterminated quoted string — single-line only");
}

function coerceScalar(s, lineNo) {
  const c = s[0];
  if (c === "|" || c === ">") throw new PolicySyntaxError(lineNo, "block scalars (| or >) are forbidden in the policy subset — inline the value or quote it");
  if (c === "&") throw new PolicySyntaxError(lineNo, "anchors are forbidden in the policy subset");
  if (c === "*") throw new PolicySyntaxError(lineNo, "aliases are forbidden in the policy subset");
  if (c === '"' || c === "'") return parseQuoted(s, lineNo);
  if (/\s/.test(s)) throw new PolicySyntaxError(lineNo, `bare values must be single words — quote multi-word strings (got "${s}")`);
  if (s === "true") return true;
  if (s === "false") return false;
  if (INT_RE.test(s)) return Number(s);
  if (/[,[\]{}]/.test(s)) throw new PolicySyntaxError(lineNo, `bare value "${s}" contains flow syntax characters — quote it`);
  return s;
}

function splitTopLevel(inner) {
  const parts = [];
  let cur = "";
  let quote = null;
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      cur += c;
      if (c === "\\") { cur += inner[i + 1] ?? ""; i++; }
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === "{" || c === "[") {
      depth++;
      cur += c;
    } else if (c === "}" || c === "]") {
      depth--;
      cur += c;
    } else if (c === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts;
}

function parseFlow(raw, lineNo, depth) {
  const s = raw.trim();
  if (depth > MAX_FLOW_DEPTH) throw new PolicySyntaxError(lineNo, `flow nesting deeper than ${MAX_FLOW_DEPTH} levels is forbidden in the policy subset`);
  if (s.startsWith("{")) {
    if (!s.endsWith("}")) throw new PolicySyntaxError(lineNo, "flow mappings must open and close on a single line");
    const out = {};
    const inner = s.slice(1, -1).trim();
    if (inner === "") return out;
    for (const part of splitTopLevel(inner)) {
      const el = part.trim();
      if (el === "") throw new PolicySyntaxError(lineNo, "empty flow mapping entry");
      const m = el.match(/^([A-Za-z0-9_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
      if (!m) throw new PolicySyntaxError(lineNo, `flow mapping entry must be \`key: value\` (got "${el}")`);
      out[m[1]] = parseFlow(m[2], lineNo, depth + 1);
    }
    return out;
  }
  if (s.startsWith("[")) {
    if (!s.endsWith("]")) throw new PolicySyntaxError(lineNo, "flow arrays must open and close on a single line");
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return splitTopLevel(inner).map((part) => {
      const el = part.trim();
      if (el === "") throw new PolicySyntaxError(lineNo, "empty flow array element");
      return parseFlow(el, lineNo, depth + 1);
    });
  }
  return coerceScalar(s, lineNo);
}

function tokenizeLines(text) {
  const out = [];
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lead = raw.match(/^[\t ]*/)[0];
    if (lead.includes("\t")) {
      throw new PolicySyntaxError(i + 1, "tabs are forbidden for indentation — spaces only");
    }
    const indent = lead.length;
    const content = cutComment(raw).trim();
    if (content === "") continue;
    out.push({ lineNo: i + 1, indent, content });
  }
  return out;
}

/**
 * Parse the restricted YAML subset into a JS value.
 * @returns {{ ok: true, value: object } | { ok: false, errors: string[] }}
 */
export function parseRestrictedYaml(text) {
  try {
    const lines = tokenizeLines(text);
    if (lines.length === 0) return { ok: true, value: {} };
    const { value, next } = parseNode(lines, 0, lines[0].indent, 1);
    if (next < lines.length) {
      throw new PolicySyntaxError(lines[next].lineNo, `unexpected content (indent ${lines[next].indent} does not continue any open block)`);
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof PolicySyntaxError) return { ok: false, errors: [e.message] };
    return { ok: false, errors: [e instanceof Error ? e.message : String(e)] };
  }
}

function parseNode(lines, i, indent, depth) {
  if (depth > MAX_BLOCK_DEPTH) {
    throw new PolicySyntaxError(lines[i].lineNo, `block nesting deeper than ${MAX_BLOCK_DEPTH} levels is forbidden in the policy subset`);
  }
  if (lines[i].content === "-" || lines[i].content.startsWith("- ")) {
    return parseSequence(lines, i, indent, depth);
  }
  return parseMapping(lines, i, indent, depth);
}

function parseSequence(lines, i, indent, depth) {
  const items = [];
  let pos = i;
  while (pos < lines.length && lines[pos].indent === indent && (lines[pos].content === "-" || lines[pos].content.startsWith("- "))) {
    const line = lines[pos];
    const rest = line.content === "-" ? "" : line.content.slice(2).trim();
    if (rest === "") {
      const nextLine = lines[pos + 1];
      if (!nextLine || nextLine.indent <= indent) {
        throw new PolicySyntaxError(line.lineNo, "empty sequence item — give the item value inline or as an indented block");
      }
      const { value, next } = parseNode(lines, pos + 1, nextLine.indent, depth + 1);
      items.push(value);
      pos = next;
      continue;
    }
    const entryMatch = rest.match(/^([A-Za-z0-9_][A-Za-z0-9_-]*):(.*)$/);
    if (entryMatch) {
      // inline mapping start: continuation keys align at indent + 2
      const virtualIndent = indent + 2;
      const virtual = [{ lineNo: line.lineNo, indent: virtualIndent, content: rest }];
      let j = pos + 1;
      while (j < lines.length && lines[j].indent > indent) {
        if (lines[j].indent !== virtualIndent) {
          throw new PolicySyntaxError(lines[j].lineNo, `sequence-item mapping keys must align at indent ${virtualIndent} (got ${lines[j].indent})`);
        }
        virtual.push(lines[j]);
        j++;
      }
      const { value } = parseMapping(virtual, 0, virtualIndent, depth + 1);
      items.push(value);
      pos = j;
      continue;
    }
    items.push(parseFlow(rest, line.lineNo, 1));
    pos++;
  }
  return { value: items, next: pos };
}

function parseMapping(lines, i, indent, depth) {
  const out = {};
  let pos = i;
  while (pos < lines.length && lines[pos].indent === indent) {
    const line = lines[pos];
    const m = line.content.match(/^([A-Za-z0-9_][A-Za-z0-9_-]*):(.*)$/);
    if (!m) {
      throw new PolicySyntaxError(line.lineNo, `expected \`key: value\` or \`- item\` (got "${line.content}") — multi-line scalars are forbidden`);
    }
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new PolicySyntaxError(line.lineNo, `duplicate key "${key}"`);
    }
    const rest = m[2].trim();
    if (rest === "") {
      const nextLine = lines[pos + 1];
      if (nextLine && nextLine.indent > indent) {
        const { value, next } = parseNode(lines, pos + 1, nextLine.indent, depth + 1);
        out[key] = value;
        pos = next;
        continue;
      }
      throw new PolicySyntaxError(line.lineNo, `empty value for "${key}" — block scalars (| or >) and nulls are forbidden`);
    }
    out[key] = parseFlow(rest, line.lineNo, 1);
    pos++;
  }
  return { value: out, next: pos };
}

// ── trigger `when` restricted grammar ───────────────────────────────────────

const WHEN_NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const AND_TOKENS = new Set(["and", "∧"]);
const OR_TOKENS = new Set(["or", "∨"]);
const NOT_TOKENS = new Set(["not", "!", "¬"]);

function tokenizeWhen(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    const rest = expr.slice(i);
    let m = rest.match(/^(\s+)/);
    if (m) { i += m[1].length; continue; }
    m = rest.match(/^(==|!=|>=|<=|>|<|=)/);
    if (m) { tokens.push({ t: "op", v: m[1] }); i += m[1].length; continue; }
    m = rest.match(/^([A-Za-z_][A-Za-z0-9_.-]*)/);
    if (m) { tokens.push({ t: "word", v: m[1] }); i += m[1].length; continue; }
    m = rest.match(/^(\d+)/);
    if (m) { tokens.push({ t: "num", v: m[1] }); i += m[1].length; continue; }
    m = rest.match(/^(∧|∨|¬)/);
    if (m) { tokens.push({ t: "word", v: m[1] }); i += m[1].length; continue; }
    if (expr[i] === "(" || expr[i] === ")") { tokens.push({ t: expr[i] === "(" ? "lparen" : "rparen" }); i++; continue; }
    if (expr[i] === ",") { tokens.push({ t: "comma" }); i++; continue; }
    if (expr[i] === "!") { tokens.push({ t: "word", v: "!" }); i++; continue; }
    return { ok: false, error: `unexpected character "${expr[i]}" at position ${i}` };
  }
  return { ok: true, tokens };
}

/**
 * Parse + vocabulary-check one trigger `when` expression.
 * @returns {{ ok: true, ast: object } | { ok: false, error: string }}
 */
export function parseTriggerWhen(expr) {
  if (typeof expr !== "string" || expr.trim() === "") {
    return { ok: false, error: "when must be a non-empty string" };
  }
  const lexed = tokenizeWhen(expr);
  if (!lexed.ok) return lexed;
  const tokens = lexed.tokens;
  let pos = 0;

  const peek = () => tokens[pos] ?? null;
  const isKw = (tok, set) => tok !== null && tok.t === "word" && set.has(tok.v);
  const isParseError = (node) => node !== null && typeof node === "object" && "__error" in node;

  function parseOr() {
    let left = parseAnd();
    while (isKw(peek(), OR_TOKENS)) {
      pos++;
      const right = parseAnd();
      if (isParseError(right)) return right;
      left = { kind: "or", left, right };
    }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    while (isKw(peek(), AND_TOKENS)) {
      pos++;
      const right = parseNot();
      if (isParseError(right)) return right;
      left = { kind: "and", left, right };
    }
    return left;
  }
  function parseNot() {
    if (isKw(peek(), NOT_TOKENS)) {
      pos++;
      const inner = parseNot();
      if (isParseError(inner)) return inner;
      return { kind: "not", inner };
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const tok = peek();
    if (tok === null) return { __error: "unexpected end of expression" };
    if (tok.t === "lparen") {
      pos++;
      const inner = parseOr();
      if (peek()?.t !== "rparen") return { __error: `expected ")" (position ${pos})` };
      pos++;
      return inner;
    }
    if (tok.t !== "word") {
      return { __error: `expected a predicate name (position ${pos}, got ${tok.v ?? tok.t})` };
    }
    pos++;
    const node = { kind: "predicate", name: tok.v, call: false, op: null, value: null };
    if (peek()?.t === "lparen") {
      pos++;
      node.call = true;
      if (peek()?.t !== "rparen") {
        return { __error: `predicate calls take no arguments in the trigger subset (position ${pos})` };
      }
      pos++;
    }
    const opTok = peek();
    if (opTok !== null && opTok.t === "op") {
      pos++;
      node.op = opTok.v;
      const valTok = peek();
      if (valTok === null || (valTok.t !== "word" && valTok.t !== "num")) {
        return { __error: `comparison needs a value after "${opTok.v}" (position ${pos})` };
      }
      pos++;
      node.value = valTok.t === "num" ? Number(valTok.v) : valTok.v;
    }
    return node;
  }

  let ast;
  try {
    ast = parseOr();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  if (ast && typeof ast === "object" && "__error" in ast) return { ok: false, error: ast.__error };
  if (pos !== tokens.length) {
    return { ok: false, error: `unexpected trailing tokens (position ${pos}: ${tokens[pos].v ?? tokens[pos].t})` };
  }
  const vocabError = checkPredicateVocabulary(ast);
  if (vocabError) return { ok: false, error: vocabError };
  return { ok: true, ast };
}

function checkPredicateVocabulary(node) {
  if (node === null || typeof node !== "object") return null;
  if (node.kind === "predicate") {
    const spec = TRIGGER_PREDICATES.find((p) => p.name === node.name);
    if (!spec) {
      return `unknown predicate "${node.name}" — known predicates: ${TRIGGER_PREDICATES.map((p) => p.name).join(", ")}`;
    }
    if (spec.form === "atom") {
      if (node.call || node.op !== null) {
        return `predicate "${node.name}" takes no call or comparison — use it bare`;
      }
    } else if (spec.form === "cmp") {
      if (node.call) return `predicate "${node.name}" is not callable`;
      if (node.op === null) return `predicate "${node.name}" requires a comparison (e.g. ${node.name}=<value>)`;
    } else if (spec.form === "call") {
      if (!node.call) return `predicate "${node.name}" must be called as ${node.name}()`;
      if (node.op === null) return `predicate "${node.name}()" requires a numeric comparison (e.g. ${node.name}()==0)`;
      if (typeof node.value !== "number") return `predicate "${node.name}()" compares against a number`;
    }
    return null;
  }
  for (const child of [node.left, node.right, node.inner]) {
    const err = child !== undefined ? checkPredicateVocabulary(child) : null;
    if (err) return err;
  }
  return null;
}

// ── schema validation ───────────────────────────────────────────────────────

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function isNonNegativeInt(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v) {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function matchPatternError(pattern) {
  if (typeof pattern !== "string" || pattern.trim() === "") {
    return "match must be a non-empty string";
  }
  if (pattern.startsWith("action:")) {
    const t = pattern.slice("action:".length);
    if (!PROPOSED_ACTION_TYPES.includes(t)) {
      return `action match must be action:<type> over: ${PROPOSED_ACTION_TYPES.join(" | ")} (got "${pattern}")`;
    }
    return null;
  }
  if (!pattern.startsWith("{{plansDir}}") && !pattern.startsWith("{{roadmapPath}}")) {
    return `path match must start with {{plansDir}} or {{roadmapPath}} (got "${pattern}")`;
  }
  return null;
}

/**
 * Validate a parsed policy object against the 02 §3/§4.9 schema.
 * @param {object} policy parsed policy value
 * @param {object} [opts] { rules?: string[] } — rule-id vocabulary (defaults
 *   to the kernel registry; injectable for tests)
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validatePolicy(policy, opts = {}) {
  const errors = [];
  const rules = opts.rules ?? listRuleIds();

  if (!isPlainObject(policy)) {
    return { ok: false, errors: ["policy must be a mapping (block YAML object)"] };
  }
  for (const k of Object.keys(policy)) {
    if (!POLICY_TOP_LEVEL_FIELDS.includes(k)) {
      errors.push(`unknown top-level key "${k}" — legal keys: ${POLICY_TOP_LEVEL_FIELDS.join(", ")}`);
    }
  }
  if (policy.version === undefined) {
    errors.push("missing required key \"version\"");
  } else if (policy.version !== POLICY_VERSION) {
    errors.push(`version must be ${POLICY_VERSION} (got ${JSON.stringify(policy.version)})`);
  }

  if (policy.limits !== undefined) {
    if (!isPlainObject(policy.limits)) {
      errors.push("limits must be a mapping");
    } else {
      for (const k of Object.keys(policy.limits)) {
        if (!LIMITS_FIELDS.includes(k)) errors.push(`limits: unknown key "${k}" — legal keys: ${LIMITS_FIELDS.join(", ")}`);
      }
      for (const k of LIMITS_FIELDS) {
        if (policy.limits[k] !== undefined && !isNonNegativeInt(policy.limits[k])) {
          errors.push(`limits.${k} must be a non-negative integer (got ${JSON.stringify(policy.limits[k])})`);
        }
      }
    }
  }

  if (policy.gates !== undefined) {
    if (!Array.isArray(policy.gates)) {
      errors.push("gates must be a sequence of gate entries");
    } else {
      const seenIds = new Set();
      policy.gates.forEach((gate, idx) => {
        if (!isPlainObject(gate)) {
          errors.push(`gates[${idx}] must be a mapping`);
          return;
        }
        for (const k of Object.keys(gate)) {
          if (!GATE_FIELDS.includes(k)) errors.push(`gates[${idx}]: unknown field "${k}" — legal fields: ${GATE_FIELDS.join(", ")}`);
        }
        if (!isNonEmptyString(gate.id)) {
          errors.push(`gates[${idx}].id must be a non-empty string`);
        } else if (seenIds.has(gate.id)) {
          errors.push(`gates: duplicate id "${gate.id}"`);
        } else {
          seenIds.add(gate.id);
        }
        const matchErr = matchPatternError(gate.match);
        if (matchErr) errors.push(`gates[${idx}].match: ${matchErr}`);
        if (!isNonEmptyString(gate.rule)) {
          errors.push(`gates[${idx}].rule must be a non-empty string`);
        } else if (!rules.includes(gate.rule)) {
          errors.push(`gates[${idx}].rule "${gate.rule}" is not in the kernel registry — known rules: ${rules.join(", ")}`);
        }
        if (gate.mode !== undefined && !GATE_MODES.includes(gate.mode)) {
          errors.push(`gates[${idx}].mode must be one of: ${GATE_MODES.join(" | ")} (got ${JSON.stringify(gate.mode)})`);
        }
      });
    }
  }

  if (policy.triggers !== undefined) {
    if (!Array.isArray(policy.triggers)) {
      errors.push("triggers must be a sequence of trigger entries");
    } else {
      policy.triggers.forEach((trig, idx) => {
        if (!isPlainObject(trig)) {
          errors.push(`triggers[${idx}] must be a mapping`);
          return;
        }
        for (const k of Object.keys(trig)) {
          if (!TRIGGER_FIELDS.includes(k)) errors.push(`triggers[${idx}]: unknown field "${k}" — legal fields: ${TRIGGER_FIELDS.join(", ")}`);
        }
        if (typeof trig.when !== "string") {
          errors.push(`triggers[${idx}].when is required (restricted predicate grammar: predicates + and/or/not)`);
        } else {
          const parsed = parseTriggerWhen(trig.when);
          if (!parsed.ok) errors.push(`triggers[${idx}].when: ${parsed.error}`);
        }
        const exits = ["dispatch", "action", "terminal"].filter((k) => trig[k] !== undefined);
        if (exits.length !== 1) {
          errors.push(`triggers[${idx}]: exactly one exit of dispatch | action | terminal is required (got: ${exits.join(", ") || "none"})`);
        }
        if (trig.dispatch !== undefined && !DISPATCH_TYPES.includes(trig.dispatch)) {
          errors.push(`triggers[${idx}].dispatch must be one of: ${DISPATCH_TYPES.join(" | ")} (got ${JSON.stringify(trig.dispatch)})`);
        }
        if (trig.action !== undefined && !TRIGGER_ACTION_NAMES.includes(trig.action)) {
          errors.push(`triggers[${idx}].action must be one of: ${TRIGGER_ACTION_NAMES.join(" | ")} (got ${JSON.stringify(trig.action)})`);
        }
        if (trig.terminal !== undefined && !TRIGGER_TERMINAL_VALUES.includes(trig.terminal)) {
          errors.push(`triggers[${idx}].terminal must be one of: ${TRIGGER_TERMINAL_VALUES.join(" | ")} (got ${JSON.stringify(trig.terminal)})`);
        }
      });
    }
  }

  if (policy.agents !== undefined) {
    if (!isPlainObject(policy.agents)) {
      errors.push("agents must be a mapping of agent name → definition");
    } else {
      for (const [name, def] of Object.entries(policy.agents)) {
        if (!AGENT_NAME_RE.test(name)) {
          errors.push(`agents: invalid agent name "${name}" — must match ${AGENT_NAME_RE}`);
        }
        if (!isPlainObject(def)) {
          errors.push(`agents.${name} must be a mapping`);
          continue;
        }
        for (const k of Object.keys(def)) {
          if (!AGENT_DEF_FIELDS.includes(k)) errors.push(`agents.${name}: unknown field "${k}" — legal fields: ${AGENT_DEF_FIELDS.join(", ")}`);
        }
        if (!AGENT_MODES.includes(def.mode)) {
          errors.push(`agents.${name}.mode must be one of: ${AGENT_MODES.join(" | ")} (got ${JSON.stringify(def.mode)})`);
        } else if (def.mode === "pooled" && !isNonEmptyString(def.poolKey)) {
          errors.push(`agents.${name}.poolKey is required when mode is pooled`);
        }
        if (def.poolKey !== undefined && !isNonEmptyString(def.poolKey)) {
          errors.push(`agents.${name}.poolKey must be a non-empty string`);
        }
        if (def.idleTtlMinutes !== undefined && !isPositiveInt(def.idleTtlMinutes)) {
          errors.push(`agents.${name}.idleTtlMinutes must be a positive integer`);
        }
        if (def.rotateEvery !== undefined && !isPositiveInt(def.rotateEvery)) {
          errors.push(`agents.${name}.rotateEvery must be a positive integer`);
        }
        if (def.requireDistinctModel !== undefined && typeof def.requireDistinctModel !== "boolean") {
          errors.push(`agents.${name}.requireDistinctModel must be a boolean`);
        }
        if (def.fixedPrefix !== undefined) {
          if (!Array.isArray(def.fixedPrefix)) {
            errors.push(`agents.${name}.fixedPrefix must be an array of { kind, ref, maxFileBytes? } blocks`);
          } else {
            def.fixedPrefix.forEach((block, bi) => {
              if (!isPlainObject(block)) {
                errors.push(`agents.${name}.fixedPrefix[${bi}] must be a mapping`);
                return;
              }
              for (const k of Object.keys(block)) {
                if (!FIXED_PREFIX_FIELDS.includes(k)) errors.push(`agents.${name}.fixedPrefix[${bi}]: unknown field "${k}"`);
              }
              if (!FIXED_PREFIX_KINDS.includes(block.kind)) {
                errors.push(`agents.${name}.fixedPrefix[${bi}].kind must be one of: ${FIXED_PREFIX_KINDS.join(" | ")} (got ${JSON.stringify(block.kind)})`);
              }
              if (!isNonEmptyString(block.ref)) {
                errors.push(`agents.${name}.fixedPrefix[${bi}].ref must be a non-empty string path`);
              }
              if (block.maxFileBytes !== undefined && !isPositiveInt(block.maxFileBytes)) {
                errors.push(`agents.${name}.fixedPrefix[${bi}].maxFileBytes must be a positive integer`);
              }
              if (block.kind === "dir" && block.maxFileBytes === undefined) {
                errors.push(`agents.${name}.fixedPrefix[${bi}]: maxFileBytes is required when kind is dir (token-blast guard, 02 §4.9)`);
              }
            });
          }
        }
        if (def.model !== undefined) {
          if (!isPlainObject(def.model)) {
            errors.push(`agents.${name}.model must be a mapping { provider, model, reasoningEffort? }`);
          } else {
            for (const k of Object.keys(def.model)) {
              if (!MODEL_FIELDS.includes(k)) errors.push(`agents.${name}.model: unknown field "${k}"`);
            }
            if (!isNonEmptyString(def.model.provider)) errors.push(`agents.${name}.model.provider must be a non-empty string`);
            if (!isNonEmptyString(def.model.model)) errors.push(`agents.${name}.model.model must be a non-empty string`);
            if (def.model.reasoningEffort !== undefined && !REASONING_EFFORTS.includes(def.model.reasoningEffort)) {
              errors.push(`agents.${name}.model.reasoningEffort must be one of: ${REASONING_EFFORTS.join(" | ")}`);
            }
          }
        }
      }
    }
  }

  if (policy.dispatch !== undefined) {
    if (!isPlainObject(policy.dispatch)) {
      errors.push("dispatch must be a mapping of dispatch type → agent name");
    } else {
      for (const [dtype, target] of Object.entries(policy.dispatch)) {
        if (!DISPATCH_TYPES.includes(dtype)) {
          errors.push(`dispatch: unknown dispatch type "${dtype}" — legal types: ${DISPATCH_TYPES.join(", ")}`);
        }
        if (!isNonEmptyString(target)) {
          errors.push(`dispatch.${dtype} must be a non-empty agent name`);
        } else if (!Object.prototype.hasOwnProperty.call(isPlainObject(policy.agents) ? policy.agents : {}, target)) {
          errors.push(`dispatch.${dtype} references undefined agent "${target}" — agents must define every dispatch target`);
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Parse + validate policy text (the one-entry loader).
 * @returns {{ ok: true, policy: object } | { ok: false, errors: string[] }}
 */
export function parsePolicy(text) {
  const parsed = parseRestrictedYaml(text);
  if (!parsed.ok) return parsed;
  const verdict = validatePolicy(parsed.value);
  if (!verdict.ok) return { ok: false, errors: verdict.errors };
  return { ok: true, policy: parsed.value };
}

/**
 * Load + parse + validate a policy file. Throws on unreadable files (IO is a
 * caller concern); parse/schema problems come back as { ok: false, errors }.
 */
export function loadPolicyFile(file) {
  const text = readFileSync(file, "utf8");
  const result = parsePolicy(text);
  return result.ok ? { ok: true, policy: result.policy, file } : { ok: false, errors: result.errors, file };
}

/**
 * Resolve {{plansDir}} / {{roadmapPath}} in any policy string against the
 * mission context (02 §3: one project policy, paths follow the mission).
 * Single-brace tokens (poolKey's {projectRoot}) are deliberately untouched.
 */
export function resolvePolicyPlaceholders(text, ctx = {}) {
  let out = String(text);
  if (typeof ctx.plansDir === "string" && ctx.plansDir !== "") out = out.split("{{plansDir}}").join(ctx.plansDir);
  if (typeof ctx.roadmapPath === "string" && ctx.roadmapPath !== "") out = out.split("{{roadmapPath}}").join(ctx.roadmapPath);
  return out;
}

/** Agent names from a parsed policy ([] when no agents section — skip face). */
export function policyAgentNames(policy) {
  return policy && isPlainObject(policy.agents) ? Object.keys(policy.agents) : [];
}
