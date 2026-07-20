# Development Wisdom Gate Prompt

Before declaring completion of any non-trivial design, plan, or implementation, run this prompt as an **AI self-check gate** — a systematic challenge to your own output using general-purpose development intuition.

## Relationship With Other Audit Skills

This prompt does **not** replace `open-ended-audit-prompt.md`, `multi-dimensional-audit-prompt.md`, `plan-audit-prompt.md`, or other object-level audit skills.

| Prompt | Role | Timing | Scope |
|--------|------|--------|-------|
| This prompt | Developer's self-check awareness | During development, before claiming completion | Cross-dimensional assumptions/consistency/depth |
| open-ended-audit | Independent adversarial auditor | After work claims completion | Hidden unknown risks |
| multi-dimensional-audit | Multi-dimensional reviewer | Independent review of high-risk work | Systematic audit across 6+ explicit dimensions |
| plan-audit | Plan reviewer | Before Plan goes active | Single Plan's completeness and feasibility |

This prompt addresses a blind spot: **AI's natural lack of self-doubt during development** — it tends to accept its first answer, stop at surface completion, and not proactively check cross-layer contradictions. Embedding this gate into the development flow itself (rather than adding another post-hoc audit) is the goal.

## When To Trigger

Trigger when **any** of these apply:

- You just finished a design document, plan, or implementation and are about to declare it complete
- You are making a non-trivial technical decision (choose a framework mechanism, design a data model, define an interface contract)
- You are about to commit changes across multiple files
- You catch yourself thinking "it should work this way" without verification

## Gate Dimensions

### 0. Assumption Surfacing

List **every key assumption** your current output depends on. Label each with evidence strength:

- `proven` — supported by platform source code, official docs, or experimental data
- `inferred` — derived from similar patterns, not directly verified
- `guessed` — you think "it should be this way", no direct evidence
- `unstated` — you just realized you assumed a condition without stating it

**Typical checks:**

- Did you assume a platform mechanism exists without checking the platform's source code or docs?
- Did you assume the user's requirement is literal without considering deeper intent?
- Did you assume "this worked in another project, so it works here"?
- Did you assume a config/constraint/value exists without confirming?

**Anti-pattern**: Assuming a mechanism is unavailable because "none of the existing modules use it" — the mechanism may be documented and supported even if locally unused. Check the platform source, not just the project's usage surface.

### 1. Completeness Depth Charge

Do not accept the first-layer answer. For every "done" claim, ask:

- "Layer 1 is done. What about layer 2?" — after implementing the main flow, check: boundary conditions, error paths, guards for invalid input, concurrency/idempotency, cleanup/rollback
- "Does the test cover only the happy path?"
- "Is there a null/empty/zero edge case I am ignoring?"
- "Did I handle the case where the external dependency is down, slow, or returns garbage?"

**Anti-pattern**: Implementing only the documented success path and calling it done. Off-by-one errors, missing null checks, and unguarded external calls are the most common depth failures.

### 2. Cross-Layer Consistency

Verify that the same concept is consistent across all layers it touches:

- Does the field name match from model → API → UI → test?
- Does the state machine transition in the code match the one documented in the design doc?
- Does the error message in the code match what the test asserts?
- Does the permission check at the API layer match what the UI assumes?
- Does the sorting/filtering/pagination contract match between frontend and backend?

**Anti-pattern**: Changing a model field name at the ORM layer but forgetting to update the API DTO, UI column, and test assertions. Each layer must be verified, not just the one you edited.

### 3. Intent Fidelity

Does your implementation actually solve the user's stated problem, or did you solve a different (easier, tech-interesting) problem?

- Re-read the requirement or user request. Does your solution match?
- If the requirement is vague, did you clarify it in writing before implementing?
- Did you add scope without being asked?
- Did you silently narrow scope to avoid a hard problem?

**Anti-pattern**: Implementing a "filter" feature that only works on the client side when the user needed server-side filtering for large datasets. The implementation is technically correct for the literal request but fails for the real use case.

### 4. Ecosystem Constraints

Does your solution fight the framework/platform or flow with it?

- Is there a built-in mechanism that already handles this case? If you write custom code when a framework feature exists, you are creating a maintenance burden.
- Are you consistent with existing project patterns (error handling, logging, dependency injection, state management)?
- Will your change break the build? Run the real verification commands, not just compilation.
- Does your change require config or environment changes that are not documented?

**Anti-pattern**: Writing a custom loop when the framework provides a built-in query/build mechanism, or using a third-party library when the platform already includes equivalent functionality.

### 5. First-Principles Verification

Strip away assumptions and test the core claim:

- "If I delete my code changes and re-implement from scratch with only what I know to be true (not guessed), would the result look the same?"
- Trace the execution path from input to output. Does every step have a real source (not an assumed one)?
- Can you point to the platform documentation line that confirms your API usage is correct?
- Can you reproduce the user's problem scenario manually?

**Anti-pattern**: Building on top of a guessed mechanism and only discovering at integration time that the foundation does not exist. Timebox first-principles verification proportionally to the risk of the change.
