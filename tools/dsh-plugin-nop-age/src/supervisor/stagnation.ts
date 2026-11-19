/**
 * Activity-only stagnation detector. The scratch state is intentionally reset
 * only by noteActivity timestamps: plan, roadmap, and status mutations do not
 * represent liveness and cannot postpone the R4 circuit breaker.
 */
import type { StagnationFact } from './terminal-rules.ts'

export interface PlanStatusSample {
  path: string
  text: string
}

/** The watchdog-held scratch state; it is cleared on supervisor restart. */
export interface StagnationDetectorState {
  initialized: boolean
  stagnantRounds: number
}

export interface ObserveStagnationInput {
  /** Retained for call-site compatibility; deliberately ignored. */
  plans: PlanStatusSample[]
  /** Retained for call-site compatibility; deliberately ignored. */
  roadmapText: string | null
  /** Epoch-ms timestamps supplied exclusively through watchdog.noteActivity. */
  activityAt: Iterable<number>
  now: number
  activityWindowMs: number
  /** The N threshold; values below 1 disable R4 stagnation detection. */
  threshold: number
}

export interface ObserveStagnationOutput {
  fact: StagnationFact | null
  fingerprint: 'activity-only'
  stagnantRounds: number
}

export function initialStagnationState(): StagnationDetectorState {
  return { initialized: false, stagnantRounds: 0 }
}

export function observeStagnation(
  state: StagnationDetectorState,
  input: ObserveStagnationInput,
): ObserveStagnationOutput {
  let hasActivity = false
  for (const at of input.activityAt) {
    if (at >= input.now - input.activityWindowMs && at <= input.now + input.activityWindowMs) {
      hasActivity = true
      break
    }
  }

  if (!state.initialized) state.initialized = true
  else if (hasActivity) state.stagnantRounds = 0
  else state.stagnantRounds = Math.min(state.stagnantRounds + 1, Math.max(input.threshold, 1))

  return {
    fact: input.threshold >= 1 && state.stagnantRounds >= input.threshold
      ? { rounds: state.stagnantRounds, threshold: input.threshold }
      : null,
    fingerprint: 'activity-only',
    stagnantRounds: state.stagnantRounds,
  }
}
