/**
 * fake-agents.mjs — in-process fake of the DSH host `agents` service
 * (dsh-plugin M2-WI7 Phase 1 test infrastructure; designed for reuse by the
 * WI8 L2 matrix and the WI9 harness per R3 §3).
 *
 * Implements the surface NativeExecutor consumes:
 *   create(options) → { agent, dispose() }
 *   resume({ resumeSessionId }) → { agent, dispose() }
 * plus the Agent double the executor drives:
 *   followup(message) · whenIdle() · cancel(cause) · session.events · status
 *
 * Scripted turns: each followup consumes the next entry of `script`.
 *   - string            → turn completes with that final assistant text
 *   - { never: true }   → turn never converges (watchdog timeout leg)
 *   - { error: Error }  → turn errors; quiescence reached with no assistant
 *                         message (empty-harvest failure leg)
 *
 * Behavioral knobs:
 *   - turnDelayMs  : delay before a scripted turn completes (default 1ms)
 *   - createError  : Error thrown by create() (create-failure leg)
 *   - resumeError  : Error thrown by resume() (resume-failure leg)
 *   - onCancel     : 'converge' (cancel ends the pending turn → idle) or
 *                    'hang' (cancel has no effect → last-resort dispose leg)
 *
 * `state` records every observable call for assertions: creates / resumes /
 * followups / canceled / disposed / agents (live Agent doubles; tests can
 * arm the cold-handle failure by setting `agent._cold = true`).
 */

export function createFakeAgentsService({
  script = [],
  turnDelayMs = 1,
  createError = null,
  resumeError = null,
  onCancel = 'converge',
} = {}) {
  const state = {
    creates: [],
    resumes: [],
    followups: [],
    canceled: [],
    disposed: [],
    agents: [],
  }

  let scriptIndex = 0
  const nextOutcome = () => {
    const item = script[scriptIndex]
    if (item === undefined) {
      throw new Error(`fake agents: script exhausted at index ${scriptIndex} (script len ${script.length})`)
    }
    scriptIndex += 1
    return item
  }

  const textOf = (message) =>
    (message?.content || [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('\n')

  const settle = (agent, withText) => {
    if (withText) {
      agent.session.events.push({
        type: 'assistant/message',
        seq: agent.session.events.length,
        time: Date.now(),
        data: {
          turn: agent._turn,
          step: 1,
          message: {
            id: `msg-${agent.id}-${agent.session.events.length}`,
            role: 'assistant',
            content: [{ type: 'text', text: withText }],
            source: { kind: 'model', provider: 'fake', model: 'fake-model' },
          },
        },
      })
    }
    agent.status = 'idle'
    const waiters = agent._idleWaiters
    agent._idleWaiters = []
    for (const w of waiters) w()
  }

  const makeAgent = (id) => {
    const agent = {
      id,
      options: {},
      session: { events: [] },
      inbox: {},
      status: 'idle',
      ctx: null,
      _idleWaiters: [],
      _pending: null,
      _turn: 0,
      _cold: false,
      followup(message) {
        state.followups.push({ agentId: id, text: textOf(message) })
        if (agent._cold) {
          const e = new Error(`agent ${id} handle went cold`)
          e.code = 'HANDLE_COLD'
          throw e
        }
        agent.session.events.push({
          type: 'user/message',
          seq: agent.session.events.length,
          time: Date.now(),
          data: message,
        })
        const outcome = nextOutcome()
        agent._turn += 1
        agent.status = 'running'
        if (outcome && outcome.never) return
        const text = typeof outcome === 'string' ? outcome : null
        agent._pending = setTimeout(() => {
          agent._pending = null
          settle(agent, text)
        }, turnDelayMs)
      },
      whenIdle() {
        if (agent.status === 'idle' && !agent._pending) return Promise.resolve()
        return new Promise((resolve) => { agent._idleWaiters.push(resolve) })
      },
      cancel(cause) {
        state.canceled.push({ agentId: id, cause })
        if (onCancel === 'converge') {
          if (agent._pending) { clearTimeout(agent._pending); agent._pending = null }
          settle(agent, null)
        }
      },
      send() {},
      steer() {},
      inject() {},
      runMaintenance() { return Promise.resolve(undefined) },
    }
    state.agents.push(agent)
    return agent
  }

  const service = {
    async create(options) {
      state.creates.push(options)
      if (createError) throw createError
      const id = options?.sessionId || `child-${state.agents.length + 1}`
      const agent = makeAgent(id)
      return { agent, async dispose() { state.disposed.push(id) } }
    },
    async resume(options) {
      state.resumes.push(options)
      if (resumeError) throw resumeError
      const id = options?.resumeSessionId
      const agent = makeAgent(id)
      return { agent, async dispose() { state.disposed.push(id) } }
    },
    get() { return undefined },
    list() { return [] },
    roots() { return [] },
  }

  return { service, state }
}
