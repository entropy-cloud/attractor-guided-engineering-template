/**
 * engine-bridge.ts — programmatic entry wrapping engine orchestration,
 * interface placeholder only (dsh-plugin M2-WI6 Phase 3; wiring lands with
 * M2-WI7 NativeExecutor + M2-WI10 mdcontrol routes).
 *
 * The engine already exposes the programmatic surface this bridge wraps —
 * `plugin/dsh/assets/src/orchestrator.js` (copied at build time from
 * tools/mission-driver/src/orchestrator.js, the same entry the CLI shell
 * uses):
 *
 *   bootstrap({ projectRoot, args })            → config (dotenv + resolveConfig)
 *   orchestrateRun({ config, executor })        → drive FlowEngine with an
 *                                                 injected StepExecutor and
 *                                                 map the terminal status
 *                                                 through EXIT_MAP
 *   orchestrateAnalyze({ config })              → Reflexion postmortem run
 *
 * In host form the bridge passes `allowNativeDriver: true` through to
 * config resolution (the `native` driver value is host-only; the standalone
 * CLI rejects it) and selects the NativeExecutor backend.
 */
import type { NativeExecutor } from './native-executor.ts'

/** Opaque resolved-config handle (engine resolveConfig product). */
export interface EngineConfigHandle {
  readonly projectRoot: string
  readonly missionName: string | null
  readonly driver: string
  [key: string]: unknown
}

/** Terminal mapping mirror of the engine's EXIT_MAP (src/exit-map.js). */
export interface EngineRunResult {
  exitCode: number
  status?: string
}

/**
 * EngineBridge — the surface WI7/WI10 consume. Implementation is deferred:
 * this file pins the seam shape only.
 */
export interface EngineBridge {
  bootstrap(projectRoot: string, args?: Record<string, unknown>): Promise<EngineConfigHandle>
  orchestrateRun(config: EngineConfigHandle, executor: NativeExecutor): Promise<EngineRunResult>
  orchestrateAnalyze(config: EngineConfigHandle): Promise<EngineRunResult>
}
