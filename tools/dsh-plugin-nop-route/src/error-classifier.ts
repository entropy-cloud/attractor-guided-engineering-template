/**
 * error-classifier.ts — pure upstream-error classification (multi-plugin-dsh
 * M4-WI10; design owner docs/design/multi-plugin-dsh-architecture.md
 * §nop-route Plugin routing table; budget+retry-after promotion per
 * docs/design/dsh-routing-with-failover.md §6.3 D12).
 *
 * Discrimination rules (pinned by test/error-classifier.test.mjs):
 *   - Input face = structural fields of the incoming error object:
 *     `status`/`statusCode`, `code`, `name`, `partial`, text-bearing fields
 *     (`message`/`text`/`raw`/`rawResponse`), and the `retry-after` face
 *     (`retryAfter` field or a `headers` row).
 *   - `partial:marker` is checked first: `partial === true`, or a text field
 *     carrying an unclosed `<AI_STEP_RESULT>` opening tag (stream cut mid-
 *     marker; a closed tag pair is complete output, not a partial error).
 *   - Remaining classes are walked in fixed precedence order — rate-limit →
 *     timeout → network → auth → budget → invalid-input. Within one class:
 *     status, then code, then name, then message shape. First match wins;
 *     cross-class conflicts resolve by class precedence (e.g. status 429 +
 *     code ECONNRESET → rate-limit).
 *   - `permanent:budget` rule match is promoted to `transient:rate-limit`
 *     when a retry-after hint is present (D12: provider returning a retry-
 *     after time means the quota will recover; honour it).
 *   - A bare retry-after hint (no other signal) classifies as rate-limit.
 *   - Everything else — non-objects, empty objects, unknown codes, novel
 *     messages — falls through to `unknown`.
 *
 * Determinism contract: zero wall clock, zero random, zero I/O; same input
 * yields bit-identical output.
 */

export type ErrorClass =
  | "transient:network"
  | "transient:rate-limit"
  | "transient:timeout"
  | "permanent:auth"
  | "permanent:invalid-input"
  | "permanent:budget"
  | "partial:marker"
  | "unknown";

const PARTIAL_OPEN = "<AI_STEP_RESULT>";
const PARTIAL_CLOSE = "</AI_STEP_RESULT>";

interface ClassRule {
  readonly errorClass: ErrorClass;
  readonly statuses: readonly number[];
  readonly codes: readonly string[];
  readonly names: readonly string[];
  readonly messagePattern: RegExp;
}

const CLASS_RULES: readonly ClassRule[] = [
  {
    errorClass: "transient:rate-limit",
    statuses: [429],
    codes: ["rate_limit", "rate_limited", "ratelimit", "too_many_requests"],
    names: [],
    messagePattern: /rate[ _-]?limit|too many requests/i,
  },
  {
    errorClass: "transient:timeout",
    statuses: [408],
    codes: ["etimedout", "timeout", "timed_out", "deadline_exceeded"],
    names: ["timeouterror"],
    messagePattern: /\btime[ _-]?out\b|timed out/i,
  },
  {
    errorClass: "transient:network",
    statuses: [502, 503],
    codes: [
      "econnreset", "econnrefused", "enotfound", "epipe",
      "ehostunreach", "enetunreach", "eai_again", "econnaborted",
    ],
    names: [],
    messagePattern:
      /network error|connection (?:reset|refused|closed|aborted)|econn|enotfound|getaddrinfo|dns failure|socket hang up/i,
  },
  {
    errorClass: "permanent:auth",
    statuses: [401, 403],
    codes: ["invalid_api_key", "api_key_invalid", "authentication_error", "unauthorized", "forbidden", "permission_denied"],
    names: [],
    messagePattern: /\bunauthorized\b|\bforbidden\b|invalid api[ _-]?key|authentication (?:failed|error)|permission denied/i,
  },
  {
    errorClass: "permanent:budget",
    statuses: [402],
    codes: ["insufficient_quota", "quota_exceeded", "billing_not_active", "budget_exceeded", "usage_limit_reached", "payment_required", "insufficient_balance"],
    names: [],
    messagePattern: /\bquota\b|\bbilling\b|insufficient (?:balance|credits?|funds)|usage limit|payment required/i,
  },
  {
    errorClass: "permanent:invalid-input",
    statuses: [400, 422],
    codes: ["invalid_request_error", "invalid_input", "invalid_argument", "validation_error", "context_length_exceeded", "malformed_request"],
    names: [],
    messagePattern: /invalid (?:request|input|argument|parameter)|validation (?:failed|error)|context length/i,
  },
];

const normalizeCode = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim().toLowerCase().replace(/[-\s]+/g, "_")
    : "";

const textFields = (record: Record<string, unknown>): string[] => {
  const fields: string[] = [];
  for (const key of ["message", "text", "raw", "rawResponse"]) {
    const value = record[key];
    if (typeof value === "string") fields.push(value);
  }
  return fields;
};

const statusOf = (record: Record<string, unknown>): number | null => {
  const value = record.status ?? record.statusCode;
  return typeof value === "number" ? value : null;
};

const hasRetryAfter = (record: Record<string, unknown>): boolean => {
  const direct = record.retryAfter;
  if (direct !== undefined && direct !== null && direct !== "") return true;
  const headers = record.headers;
  if (headers === null || headers === undefined) return false;
  if (typeof (headers as { get?: unknown }).get === "function") {
    const value = (headers as { get: (key: string) => unknown }).get("retry-after");
    return value !== undefined && value !== null && value !== "";
  }
  if (headers instanceof Object && !Array.isArray(headers)) {
    return Object.keys(headers).some((key) => key.toLowerCase() === "retry-after");
  }
  return false;
};

export function classify(error: unknown): ErrorClass {
  if (!(error instanceof Object)) return "unknown";
  const record = error as Record<string, unknown>;

  if (record.partial === true) return "partial:marker";
  const texts = textFields(record);
  if (texts.some((text) => text.includes(PARTIAL_OPEN) && !text.includes(PARTIAL_CLOSE))) {
    return "partial:marker";
  }

  const status = statusOf(record);
  const code = normalizeCode(record.code);
  const name = normalizeCode(record.name);
  for (const rule of CLASS_RULES) {
    if (status !== null && rule.statuses.includes(status)) {
      if (rule.errorClass === "permanent:budget" && hasRetryAfter(record)) {
        return "transient:rate-limit";
      }
      return rule.errorClass;
    }
    if (code !== "" && rule.codes.includes(code)) {
      if (rule.errorClass === "permanent:budget" && hasRetryAfter(record)) {
        return "transient:rate-limit";
      }
      return rule.errorClass;
    }
    if (name !== "" && rule.names.includes(name)) {
      if (rule.errorClass === "permanent:budget" && hasRetryAfter(record)) {
        return "transient:rate-limit";
      }
      return rule.errorClass;
    }
    if (texts.some((text) => rule.messagePattern.test(text))) {
      if (rule.errorClass === "permanent:budget" && hasRetryAfter(record)) {
        return "transient:rate-limit";
      }
      return rule.errorClass;
    }
  }

  if (hasRetryAfter(record)) return "transient:rate-limit";
  return "unknown";
}
