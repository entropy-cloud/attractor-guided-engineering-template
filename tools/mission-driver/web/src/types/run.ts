// FSD §6 — Run / Step / Event types.
// Monitor Server endpoints:
//   GET /api/runs         → { runs: Run[] }       (summarized runs, fields subset of Run)
//   GET /api/runs/:runId  → { run, events, stepLogs, config }
//   SSE /api/runs/:runId/events → emits StepEvent payloads (one per `type`)

import type { MissionConfig } from './config'

export type RunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'max_cycles'
  | 'max_total_steps'
  | 'max_retries'
  | 'unknown'
  | string

export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | string

export interface Run {
  runId: string
  missionName: string | null
  status: RunStatus
  pid?: number
  startedAt: string | null
  updatedAt?: string | null
  endedAt?: string | null
  currentStep?: string | null
  // Identifies which execution flow produced this run. The RunDetail renderer
  // registry dispatches on this value: null/unknown → DefaultRunDetail;
  // registered flowNames → their lazy renderer.
  flowName?: string | null
  runDir?: string
  steps: Step[]
  config?: MissionConfig | null
}

// Lightweight run summary returned by GET /api/runs (no steps/config detail).
export interface RunSummary {
  runId: string
  missionName: string | null
  status: RunStatus
  startedAt: string | null
  updatedAt?: string | null
  endedAt?: string | null
  currentStep?: string | null
  // Backed by itp2-1 (backend summary emits flowName). The RunList Flow column
  // reads this; null until the backend is upgraded (itp2-1 prerequisite).
  flowName?: string | null
  stepCount?: number
  runDir?: string
}

export interface Step {
  name: string
  status: StepStatus
  visits?: number
  marker?: string
  durationMs?: number
  startedAt?: string
  endedAt?: string
  error?: string
  sessionId?: string
  suspended?: boolean
  suspendGapMs?: number
  logFile?: string
  promptFile?: string
  type?: 'subflow'
  forEachItem?: string
  forEachIndex?: number
  children?: SubflowGroup[]
}

export interface SubflowGroup {
  forEachItem: string
  forEachIndex: number
  status: string
  steps: Step[]
}

export type StepEventType =
  | 'snapshot'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_skipped'
  | 'transition'
  | 'heartbeat'
  | 'run_started'
  | 'run_completed'
  | 'limit_hit'
  | 'suspended'
  | 'step_suspended'
  | 'state_update'
  | 'error'
  | string

// SSE event envelope. The Monitor Server emits a JSON payload whose `type`
// identifies the event; the remaining fields vary by type. Known envelope
// fields are typed explicitly; heterogeneous payload fields fall through the
// index signature. `unknown` (not `any`) keeps the project's no-`any` rule
// (AGENTS.md §3 / NFR-8) while remaining extensible.
export interface StepEvent {
  type: StepEventType
  ts: string
  step?: string
  visit?: number
  marker?: string
  durationMs?: number
  startedAt?: string
  endedAt?: string
  status?: RunStatus
  sessionId?: string
  error?: string
  [key: string]: unknown
}
