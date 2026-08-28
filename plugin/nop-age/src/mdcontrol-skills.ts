/**
 * mdcontrol-skills.ts — Mission Control skills registration (dsh-plugin
 * M3-WI12, plan `2026-08-23-1852-2` Phase 3).
 *
 * Three natural-language entry points (design doc §Feature Name) registered
 * as RUNTIME rows on the host `ctx.skills` registry:
 *
 *   mission-control-run <mission>        → mdcontrol.run   (async handle)
 *   mission-control-draft <description>  → mdcontrol.draft (async handle)
 *   mission-control-analyze [run]        → mdcontrol.analyze (sync result)
 *
 * Registration shape (1852-2 Phase 1 Decision 1, host-source verified in
 * `~/ai/dsh-src/deepseek-harness` read-only): skills are PURE markdown
 * instruction bodies (`SkillRegistration` has NO executable handler). The
 * model reaches a skill through `tool-skill`'s pre-step catalog + `skill`
 * tool, then the loaded instructions direct it to call the `mdcontrol.*`
 * routes over the plugin's own HTTP dispatcher (`POST /mdcontrol/api/<wire
 * method>`, `{ok:true,value}` / `{ok:false,error:{code,message}}` envelope)
 * using an HTTP-capable session tool (web_fetch / bash+curl) — the
 * conditional tool-face cooperation item pinned by the decision.
 *
 * Mount wiring lives in service.ts: registration runs inside a reactive
 * `ctx.inject(['skills'], …)` fiber — order-independent (the callback fires
 * whenever the skills service is available), automatically unloaded and
 * re-run when the service changes, and a never-activating fiber (headless
 * compositions without skills) is the same degrade-to-log posture as the
 * absent webServer. `registerMissionControlSkills` itself is pure and
 * unit-testable against a fake registry.
 */
import type { MdControlLogger } from './mdcontrol-routes.ts'

/** Invocation policy surface (host SkillInvocationPolicy mirror). */
export interface SkillInvocationPolicy {
  readonly modelInvocable: boolean
  readonly userInvocable: boolean
}

/** One runtime skill contribution (host SkillRegistration subset). */
export interface MissionControlSkill {
  readonly name: string
  readonly description: string
  readonly whenToUse: string
  readonly content: string
  readonly invocation: SkillInvocationPolicy
}

/** Registry face this module consumes (ctx.skills structural subset). */
export interface SkillsRegistryFace {
  register(skill: {
    name: string
    description: string
    whenToUse?: string
    content: string
    invocation?: SkillInvocationPolicy
    provider?: string
  }): (() => void) | void
}

const HTTP_NOTE = [
  'Call the route with an HTTP-capable tool (`web_fetch` or bash `curl`) — POST JSON to the Mission Control HTTP API of the DSH host running this plugin:',
  '```',
  'curl -s -X POST http://<host>:<port>/mdcontrol/api/<WIRE-METHOD> -H \'content-type: application/json\' -d \'<JSON BELOW\'',
  '```',
  'Responses use the envelope `{ "ok": true, "value": … }` / `{ "ok": false, "error": { "code", "message" } }`.',
].join('\n')

const RUN_SKILL: MissionControlSkill = {
  name: 'mission-control-run',
  description:
    'Start an AGE mission-driver mission run (demo, onboarding, or any mission under missions/) through Mission Control; returns a run handle immediately — the run keeps advancing and progress is pollable.',
  whenToUse: 'The user asks to run / start / execute a mission ("run the onboarding mission", "start a demo run").',
  invocation: { modelInvocable: true, userInvocable: true },
  content: [
    '# Mission Control — run a mission',
    '',
    'Start a mission-driver mission run. Runs are ASYNCHRONOUS: the call returns immediately with a run handle; the engine loop keeps advancing afterwards.',
    '',
    '## Payload (POST to `/mdcontrol/api/mdcontrol.run`)',
    '',
    '```json',
    '{"projectRoot": "/absolute/path/of/the/project", "args": {"mission": "onboarding"}, "followup": {"sessionId": "OPTIONAL_session_id_for_receipt"}}',
    '```',
    '',
    '- `projectRoot` — absolute path of the project the mission runs against (its `missions/` and `_tmp/` dirs); ask the user when unclear.',
    '- `args.mission` — mission name, a `missions/<name>.json` file (e.g. `demo`, `onboarding`, or a custom mission).',
    '- `followup.sessionId` — optional; when set, a one-line terminal receipt is posted back to that session.',
    '',
    HTTP_NOTE,
    '',
    '## Response & follow-up',
    '',
    '`value` = `{ "runId", "runDir", "status": "started", "startedAt" }`. Poll `mdcontrol.status` (`{"projectRoot", "runId"}`) for the engine run-state passthrough, or `mdcontrol.list` (`{"projectRoot"}`) for all runs. A `run-in-progress` error means one engine activity (a run OR a draft) is already active for that project root — wait for its terminal state.',
  ].join('\n'),
}

const DRAFT_SKILL: MissionControlSkill = {
  name: 'mission-control-draft',
  description:
    'Generate a new mission (brief → roadmap + missions/<name>.json) from a natural-language goal via the two-stage mission-driver draft pipeline.',
  whenToUse: 'The user wants a NEW mission created from a goal ("create a mission to add X", "draft a mission for Y").',
  invocation: { modelInvocable: true, userInvocable: true },
  content: [
    '# Mission Control — draft a new mission',
    '',
    'Generate a mission (Stage 1 brief gate → Stage 2 roadmap + `missions/<name>.json`) from a goal description. Drafting is ASYNCHRONOUS: the call returns a job handle immediately.',
    '',
    '## Payload (POST to `/mdcontrol/api/mdcontrol.draft`)',
    '',
    '```json',
    '{"projectRoot": "/absolute/path/of/the/project", "desc": "one clear sentence describing the mission goal", "flowHint": "OPTIONAL_flow_name", "targetFile": "OPTIONAL_project/relative/target", "skipBrief": false, "followup": {"sessionId": "OPTIONAL_session_id_for_receipt"}}',
    '```',
    '',
    '- `desc` — the mission goal; at least a descriptive phrase (the engine rejects placeholders like "xxx" and too-short descriptions).',
    '- `flowHint` — pin the mission\'s `flowName`; `targetFile` — ground the brief in a file/dir; `skipBrief` — skip Stage 1 (legacy single-stage).',
    '- `followup.sessionId` — optional terminal receipt.',
    '',
    HTTP_NOTE,
    '',
    '## Response & follow-up',
    '',
    '`value` = `{ "jobId": "draft-…-mission-draft", "jobDir", "status": "started", "startedAt" }`. Progress = the engine `draft-state.json` vocabulary at `<projectRoot>/_tmp/<jobId>/draft-state.json`: `phase` `brief → draft → completed`, terminal `status` `completed | failed | blocked`. `blocked` = the brief gate found the description too thin: read the brief file named by `briefPath`, resolve its open questions, re-run with a refined `desc`.',
  ].join('\n'),
}

const ANALYZE_SKILL: MissionControlSkill = {
  name: 'mission-control-analyze',
  description:
    'Run the Reflexion postmortem of the most recent (or a named) mission-driver run and return the evidence-backed debrief.',
  whenToUse: 'The user asks to analyze / review / postmortem a run ("analyze the last run", "what went wrong in run X").',
  invocation: { modelInvocable: true, userInvocable: true },
  content: [
    '# Mission Control — postmortem a run',
    '',
    'Run the Reflexion postmortem of one mission-driver run: an evidence-backed report of what failed and concrete fixes. SYNCHRONOUS — one agent dispatch; the response carries the full result.',
    '',
    '## Payload (POST to `/mdcontrol/api/mdcontrol.analyze`)',
    '',
    '```json',
    '{"projectRoot": "/absolute/path/of/the/project", "runId": "OPTIONAL_run_id"}',
    '```',
    '',
    '- `runId` — omit to analyze the MOST RECENT run found under the project\'s `_tmp/`.',
    '',
    HTTP_NOTE,
    '',
    '## Response',
    '',
    '`value` = `{ "targetRunId", "targetRunDir", "jobDir", "postmortemFile": "docs/postmortems/… | null", "memoryUpdated": "yes/no | null", "text": "<full postmortem report>" }`. Summarize `text` for the user and cite `postmortemFile` when present.',
  ].join('\n'),
}

/** The three design-doc §Feature Name skills, registered name-for-name. */
export const MISSION_CONTROL_SKILLS: readonly MissionControlSkill[] = [RUN_SKILL, DRAFT_SKILL, ANALYZE_SKILL]

/**
 * Register all three Mission Control skills on one skills registry.
 * Returns a composite disposer (dispose = unregister all three), or null
 * when the registry is absent — the caller degrades to a log line, never a
 * mount failure (webServer-absent posture).
 */
export function registerMissionControlSkills(
  skills: SkillsRegistryFace | undefined | null,
  logger?: MdControlLogger,
): (() => void) | null {
  if (!skills || typeof skills.register !== 'function') {
    logger?.warn?.('mission-control skills not registered (ctx.skills service absent)', {
      scope: 'mdcontrol',
    })
    return null
  }
  const disposers: Array<() => void> = []
  for (const skill of MISSION_CONTROL_SKILLS) {
    const dispose = skills.register({
      name: skill.name,
      description: skill.description,
      whenToUse: skill.whenToUse,
      content: skill.content,
      invocation: skill.invocation,
    })
    if (typeof dispose === 'function') disposers.push(dispose)
  }
  logger?.info?.('mission-control skills registered', {
    scope: 'mdcontrol',
    skills: MISSION_CONTROL_SKILLS.map((s) => s.name).join(', '),
  })
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    for (const dispose of disposers.splice(0)) dispose()
  }
}

/**
 * Extract the FIRST fenced ```json block from a skill body (test seam for
 * the skill → route payload wiring: the documented call example must match
 * the route's payload contract).
 */
export function firstJsonExampleOf(content: string): Record<string, unknown> | null {
  const m = content.match(/```json\n([^\n]+)\n```/)
  if (!m) return null
  try {
    const parsed = JSON.parse(m[1]) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}
