/**
 * e2e-policy.mjs — shared deterministic model policy for the L4 dual-leg e2e
 * (dsh-plugin M2-WI10, plan `2026-08-23-1621-2` Phase 2).
 *
 * ONE policy, consumed by both legs' stubs (scripted-model determinism is the
 * e2e's reproducibility contract — a live LLM cannot guarantee exact marker
 * sequencing, so the e2e gate is keyless/stub-only by design, R3 §5 posture):
 *
 *   - native leg: scripts/e2e-demo.mjs serves an OpenAI-compatible SSE stub
 *     endpoint (1621-1 keyless precedent); the policy reads the LAST user
 *     message of each chat request.
 *   - CLI leg: an executable named `opencode` (PATH-first stub) receives the
 *     prompt as the last argv element (opencode promptMode "arg"); the policy
 *     reads that string. `opencode session list` answers `[]`.
 *
 * The flow's inline prompts embed one distinctive STEP-TOKEN-<NAME> line per
 * agent step, so the policy is a PURE FUNCTION of prompt text — no shared
 * mutable state between the two stub forms.
 *
 * The P2-gate "correction-retry exercised once artificially" lives here: the
 * REVIEW step's response carries an INVALID marker value (`banana`), forcing
 * the engine's marker-correction path (`_runCorrectionAgent`); the correction
 * re-prompt is recognizable by its fixed phrase `is not valid`, and its
 * response supplies the valid `pass` marker — the recovery path.
 */

/** Distinctive per-step tokens embedded in the demo-e2e flow prompts. */
export const STEP_TOKENS = {
  CHECK: "STEP-TOKEN-CHECK",
  REVIEW: "STEP-TOKEN-REVIEW",
  DONE: "STEP-TOKEN-DONE",
};

/** Marker the artificial REVIEW break emits (not in any transition map). */
export const BROKEN_MARKER = "banana";

/** The fixed phrase every engine correction re-prompt contains. */
export const CORRECTION_PHRASE = "is not valid";

/**
 * Decide the scripted outcome for one prompt text.
 * @returns {null | { kind: string, marker: string, artificialBreak: boolean }}
 */
export function policyForPrompt(text) {
  if (typeof text !== "string" || text === "") return null;
  // Correction re-prompts are checked FIRST: in the native leg the request
  // body carries the whole session history, so later requests still contain
  // earlier step tokens — only the correction phrase is unique to them.
  if (text.includes(CORRECTION_PHRASE)) {
    return { kind: "correction", marker: "pass", artificialBreak: false };
  }
  if (text.includes(STEP_TOKENS.CHECK)) {
    return { kind: "CHECK", marker: "pass", artificialBreak: false };
  }
  if (text.includes(STEP_TOKENS.REVIEW)) {
    return { kind: "REVIEW", marker: BROKEN_MARKER, artificialBreak: true };
  }
  if (text.includes(STEP_TOKENS.DONE)) {
    return { kind: "DONE", marker: "pass", artificialBreak: false };
  }
  return null;
}

/** Stub driver output text (marker + a ses_-prefixed id for session harvest). */
export function stubResponseText(policy) {
  return `session: ses_e2e_stub_1\n<AI_STEP_RESULT>${policy.marker}</AI_STEP_RESULT>`;
}

/**
 * Extract the LAST user-message text from an OpenAI-compatible chat request
 * body (string content or content-block arrays; native leg form).
 */
export function lastUserTextOfChatBody(body) {
  let messages = [];
  try {
    const parsed = typeof body === "string" ? JSON.parse(body) : body;
    messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
  } catch {
    return null;
  }
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
    }
    return null;
  }
  return null;
}
