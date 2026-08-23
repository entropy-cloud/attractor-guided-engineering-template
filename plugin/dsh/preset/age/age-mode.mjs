/**
 * age-mode.mjs — the AGE session-posture system-prompt section (dsh-plugin
 * M4-WI14, plan `docs/plans/dsh-plugin/2026-08-23-2202-1-*` Phase 1 D2).
 *
 * One row, one registration: a single system-prompt section (`age:mode`,
 * order 10 — after the persona slot at 0, before tool guidance at 100+)
 * carrying the AGE working posture and the Mission Control entry points.
 *
 * Deliberate boundaries (plan Non-Goals + Phase 1 D2):
 *   - NO marker examples. This is the INTERACTIVE session posture, not a
 *     step-executor prompt; mission child agents receive their own step
 *     prompts with explicit output contracts from the engine. The absence of
 *     marker literals is machine-pinned by test/age-preset.test.mjs (and
 *     keeps this file outside src/prompt-check.mjs's jurisdiction).
 *   - Complements, never duplicates, the host AGENTS.md digest
 *     (`@deepseek-ai/dsh-agent-instructions` row in the same composition):
 *     this section points at owner docs, the digest carries their content.
 *   - Route face is documented, not re-registered: the three mission-control
 *     skills are registered globally by the plugin service mount
 *     (src/service.ts → mdcontrol-skills.ts) and reach AGE sessions through
 *     the merged skill catalog; the HTTP dispatcher is the same mount's.
 *     The preset itself carries ZERO service rows (plan Phase 1 D3 — the
 *     mdcontrol service stays mounted exactly once, by cordis.patch.yml).
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'age-mode'

/** The prompt registry must exist before the section can register. */
export const inject = ['systemPrompt']

/** Section identity (asserted by test/age-preset.test.mjs). */
export const AGE_MODE_SECTION = 'age:mode'

/** The AGE session posture text (static — no {{variable}} interpolation). */
export const AGE_MODE_TEXT = `AGE Mode (Attractor-Guided Engineering) — session posture.

You are working in an AGE-managed repository. The repository is the source of
truth; the chat is a temporary working surface.

Working conventions:
- Before non-trivial work, read AGENTS.md and the owner docs it routes to
  (docs/context/, docs/design/, docs/architecture/, docs/plans/). Prefer
  citing the owning doc over restating its rules from memory.
- Prefer file-in, file-out collaboration: requirements, plans, and logs live
  as files under docs/, never only in chat.
- Route each task before implementing (requirement clarification, design
  change, implementation, bug investigation, verification); do not jump from
  a feature request straight to code when scope is unclear.

Mission Control (the AGE mission-driver loop, exposed by the dsh-mission-
control plugin of this host):
- Skills: mission-control-run <mission>, mission-control-draft <description>,
  mission-control-analyze [run]. Load one through the skill tool when asked
  to start, draft, or postmortem a mission.
- Direct routes (same surface, for programmatic calls): POST to
  /mdcontrol/api/<method> with a JSON body, methods run | status | list |
  draft | analyze, using an HTTP-capable tool (web_fetch or bash curl).
- Async contract: run and draft return a job handle immediately
  ({ runId | jobId, status: "started" }) and keep working in the background.
  Poll status (mdcontrol.status / draft-state / the monitor) for progress;
  never block a turn waiting for mission completion.
- One engine activity per project root at a time (run and draft share the
  slot); a second concurrent start is rejected with a run-in-progress error.

Mission child agents dispatched by Mission Control execute engine step
prompts with explicit output contracts; when executing such a step, follow
the step prompt's contract exactly.`

/** Register the section in the calling context's scope (preset layer). */
export function apply(ctx) {
  ctx.systemPrompt.section({
    name: AGE_MODE_SECTION,
    order: 10,
    text: AGE_MODE_TEXT,
  })
}
