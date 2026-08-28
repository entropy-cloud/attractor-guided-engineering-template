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

/**
 * Onboarding-mission routing (WI11): routes on the REAL mission-driver flow
 * prompt texts (not synthetic tokens) — the deterministic minimal script is
 * CHECK → pass, DRAFT_PLANS → nothing ×2 (empty plans/audits skeleton keeps
 * REVIEW_PLANS/EXEC_PLANS/DEEP_AUDIT at zero agent turns; the second
 * DRAFT_PLANS `nothing` hits the audit-quota completion gate).
 */
export const ONBOARDING_PHRASES = {
  CHECK: "deterministic-state gate check",
  DRAFT_PLANS: "Draft 1-3 plans from the remaining roadmap items",
};

/**
 * Draft/analyze routing (WI12): routes on the REAL engine prompt openers —
 * mission-brief.md / mission-draft.md / run-postmortem.md. The brief answer
 * passes the gate and names a brief file (existence not required — the
 * engine only parses the tag); the draft answer emits a MISSION_FILE tag
 * whose target the e2e pre-creates (mechanism-plane: tag parse → fallback
 * scan); the analyze answer carries both return tags runPostmortem parses.
 */
export const WI12_PHRASES = {
  BRIEF: "Generate a concise mission brief",
  DRAFT: "Generate a mission config file for the mission driver",
  ANALYZE: "Reliability Engineer",
};

export const WI12_RESPONSES = {
  "WI12-BRIEF":
    "<BRIEF_FILE>docs/backlog/e2e-generated-brief.md</BRIEF_FILE>\n<BRIEF_GATE>pass</BRIEF_GATE>",
  "WI12-DRAFT":
    "<AI_STEP_RESULT>created</AI_STEP_RESULT>\n<MISSION_FILE>missions/e2e-generated-mission.json</MISSION_FILE>",
  "WI12-ANALYZE":
    "<POSTMORTEM_FILE>docs/postmortems/e2e-postmortem.md</POSTMORTEM_FILE>\n<MEMORY_UPDATED>no</MEMORY_UPDATED>",
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
  if (text.includes(ONBOARDING_PHRASES.CHECK)) {
    return { kind: "ONBOARDING-CHECK", marker: "pass", artificialBreak: false };
  }
  if (text.includes(ONBOARDING_PHRASES.DRAFT_PLANS)) {
    return { kind: "ONBOARDING-DRAFT_PLANS", marker: "nothing", artificialBreak: false };
  }
  if (text.includes(WI12_PHRASES.BRIEF)) {
    return { kind: "WI12-BRIEF", marker: "pass", artificialBreak: false };
  }
  if (text.includes(WI12_PHRASES.DRAFT)) {
    return { kind: "WI12-DRAFT", marker: "created", artificialBreak: false };
  }
  if (text.includes(WI12_PHRASES.ANALYZE)) {
    return { kind: "WI12-ANALYZE", marker: "pass", artificialBreak: false };
  }
  return null;
}

/** Stub driver output text (marker + a ses_-prefixed id for session harvest). */
export function stubResponseText(policy) {
  if (policy.kind in WI12_RESPONSES) return WI12_RESPONSES[policy.kind];
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

/**
 * WI12: the skills-enabled composition appends a durable user-role
 * `<system-reminder>` skill-catalog message AFTER the step prompt, so the
 * plain last-user-text is the catalog block, not the material to act on.
 * Walk user messages backwards SKIPPING system-reminder bodies and return
 * the last real one (step prompts never start with the marker).
 */
export function lastNonReminderUserTextOfChatBody(body) {
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
    let text = null;
    if (typeof m.content === "string") text = m.content;
    else if (Array.isArray(m.content)) {
      text = m.content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
    }
    if (text === null) return null;
    if (text.trimStart().startsWith("<system-reminder>")) continue;
    return text;
  }
  return null;
}
