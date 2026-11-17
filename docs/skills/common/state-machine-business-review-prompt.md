# State Machine Business Review Prompt

Use this prompt when auditing a state machine design as the supported business behavior baseline for a workflow-heavy feature: order lifecycle, approval flow, dispute/case flow, after-sales flow, subscription lifecycle, or any multi-state business object.

Use it after a state machine is first defined, after a non-trivial transition change, or when implementation depends on transition truth. Do not use it as a replacement for requirement synthesis, design-doc audit, plan audit, or closure audit.

```text
You are a senior business analyst and technical architect. Below is a state machine design document (state list, transition matrix, triggers, role permissions, business notes). Review it along the dimensions below and call out business-logic errors, omissions, contradictions, and unreasonable choices. Do not stop at the surface — walk every transition through a real business scenario.

Read these files first:
- `AGENTS.md`
- `docs/index.md`
- `docs/context/project-context.md`
- `docs/context/source-of-truth-and-precedence.md`
- the owner doc that defines this state machine
- the relevant requirement file

Review dimensions:

1. State definition
   - Does each state name clearly express a business waiting point (a state is "waiting for X", not "do X")?
   - Is every state from business start to every terminal covered, including cancel / reject / return / timeout exits?
   - Are any two states semantically the same, or expressible by a business field instead of a dedicated state?
   - Are any states actually actions rather than waiting points?

2. Transition completeness
   - For each state, are all incoming and all outgoing transitions listed?
   - Walk every transition and ask: is this path legitimate in real business?
   - Are illegal forward jumps, illegal backward jumps, or missing conditional branches present?
   - For transitions needing external triggers (polling, callback), is the trigger mechanism defined?

3. Terminal states and recovery
   - List all terminal states (no outgoing edge); confirm each is a legitimate business end.
   - Can a terminal state be reactivated (reopen, re-appeal)? If so, is the path explicit?
   - Are archived and active cases distinguishable and correctly stored?

4. Exception paths
   - Timeout, reject/return, cancel/revoke, external-system failure, duplicate operation, concurrent operation — are all covered?
   - Are idempotency rules defined for repeated triggers (polling restart, duplicate callback)?

5. Reachability
   - From the start state, is every state reachable? Are there unreachable states (empty incoming edges)?
   - Are there paths that can never reach a terminal (deadlock or infinite loop)? Are legitimate cycles given exit conditions?

6. Roles and permissions
   - Is every transition bound to an executing role?
   - Are there dangerous operations open to any role (e.g., final close)? Are multi-role conflicts handled?
   - Are role names and state names drawn from the same business vocabulary?

7. External dependencies
   - Are external-system statuses mapped/wrapped before becoming internal states, or used raw?
   - Is the inbound channel (polling / callback / manual) defined for each external transition?
   - Is there a fallback when the external system times out or is unavailable?

8. TODO / task strategy
   - Does every non-terminal state produce a clear todo task of the right type (assigned / pool / monitor / confirm)?
   - Are "needs human decision" states producing assigned or pool tasks, "just waiting" states producing monitor tasks, "ready, needs confirm" states producing confirm tasks?
   - Are there states where someone is expected to act but no todo is produced (cases silently sinking)?

9. Scenario walkthrough (most important)
   - Walk 2-3 representative scenarios end to end: happy path, reject/return path, abnormal termination, external trigger, timeout.

10. Consistency with design docs
   - Does every state have a matching page, API, permission, and business note in the owner doc?
   - Are there "designed but not in the state machine" or "in the state machine but undescribed" inconsistencies?

Known anti-patterns to check against:

| Anti-pattern | Symptom | Correct practice |
| --- | --- | --- |
| Action-as-state | "Create refund" as a state | Creating refund is an action; waiting for refund result is the state |
| Missing state | After rejection the case hangs with no state | Return needs an explicit state (e.g., needs-supplement) |
| Illegal jump | From "pending review" straight to "closed" | Must pass intermediate states |
| Unbounded cycle | A->B->C->A with no exit | Cycles need a termination condition |
| Role drift | Reviewer performing final-close action | Bind every operation to the correct role |
| Silent state | State exists but produces no todo | Non-terminal states must produce a clear todo |
| Condition-as-state | A dedicated state per condition branch | Use a business field to branch; states express "waiting for what" |
| Raw external mapping | Third-party API return value used directly as state | Wrap into an internal business state first |
| Terminal is not terminal | CLOSED still has outgoing edges | Terminal definition must match the business end |

Severity guidance:
- P0 blocker: breaks the business path or causes data errors
- P1 major: causes wrong state changes or case anomalies
- P2 minor: not best-practice but the path still works
- P3 suggestion: optimization suggestion

Return findings first, ordered by severity. For each finding include: severity, location (state/transition), issue, why it matters, recommended fix, and reference (business rule or doc).

Then return:
- Verdict: pass/fail
- Scope reviewed
- Reachability summary
- Role/permission summary
- External-dependency summary
- Residual risks or skipped areas

If no P0 or P1 finding remains, say `Verdict: pass` and still list residual risks.
```
