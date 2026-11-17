# Design Doc Audit Prompt

Use this prompt when auditing `docs/design/` as the stable app-layer behavior baseline for a formal product.

Use it after requirement-to-design updates, before implementation that depends on design truth, or when `docs/design/` needs revalidation after drift. Do not use it as a replacement for requirement synthesis, architecture review, plan audit, closure audit, or roadmap planning.

```text
Read these files first:
- `AGENTS.md`
- `docs/index.md`
- `docs/context/project-context.md`
- `docs/context/source-of-truth-and-precedence.md`
- `docs/design/README.md`
- `docs/design/domain-design-guidelines.md` when it exists
- the relevant requirement file named by the task, plan, backlog item, or user request
- all files under `docs/design/`

Read these only when the target docs depend on them:
- relevant files under `docs/discussions/` or `docs/input/` when requirement meaning or source intent is disputed
- relevant files under `docs/architecture/` when a design doc references implementation strategy or cross-cutting technical behavior
- the project's persisted contract / model source of truth only to verify ownership boundaries or detect schema/contract drift, not to duplicate that truth into design prose
- a roadmap/backlog file only when the question is implementation ordering rather than stable product behavior

Audit `docs/design/` as the app-layer owner documentation for supported product behavior.

Do not audit for wording polish first. Prioritize findings that would cause wrong implementation, unclear product behavior, demo-grade shortcuts, bad owner-doc boundaries, duplicated maintenance points, or false closure.

Check these dimensions:

1. Product baseline
   - Docs describe formal product behavior, not temporary prototype/demo behavior.
   - A feature may ship in a small complete slice, but the design must not imply throwaway, mock-only, partial-quality, or later-rewrite behavior unless explicitly limited to development/testing infrastructure outside the product baseline.
   - Payment, refund, permission, data-deletion, integration, and account-management behavior is either defined as formal product behavior or explicitly routed to requirement clarification.

2. Stable-vs-time-sensitive responsibility
   - Stable design docs answer what the product behavior is, not what the team happens to be implementing this week.
   - Implementation order, backlog status, plan status, current blockers, active work, and roadmap sequencing are not repeated across design docs.
   - If roadmap information is needed, it is concentrated in the backlog/roadmap owner rather than scattered through multiple design files.

3. Requirement alignment
   - Design statements align with the relevant implementation-ready requirement.
   - Raw input, prototype behavior, copied reference behavior, historical audit text, or chat memory does not override the synthesized requirement.
   - Any contradiction between requirement and design is classified as: design drift, requirement gap, intentional baseline change, or needs human decision.
   - The design does not silently add or remove supported behavior affecting user-visible behavior, data/model shape, API behavior, auth/permission behavior, or external integration behavior.

4. Owner-doc boundary
   - `docs/design/` explains business semantics, roles, workflows, page behavior, state meanings, and supported user/admin outcomes.
   - It does not duplicate table catalogs, field-by-field schema, dictionary/status-code catalogs, API contracts, generated code behavior, or platform-specific implementation details.
   - Implementation concerns (transactions, locking, caching, scheduling mechanics, integration protocol details, module wiring, file-level auth config) are either absent or routed to `docs/architecture/`.
   - Persisted truth and generated contract truth are cited by owner path when needed instead of restated as prose.

5. Cross-design consistency
   - `app-overview.md`, `feature-inventory.md`, domain design docs, and `roles-and-permissions.md` agree on what exists, who can use it, and which owner doc controls the detail.
   - The same concept is not described with conflicting names, lifecycle states, ownership, or eligibility rules across files.

6. Domain-language and bounded-context clarity
   - Each major business concept has a natural owning domain doc; adjacent docs cite or summarize without becoming competing owners.
   - Business-facing language is not replaced by table names, enum codes, class names, framework mechanics, or copied raw-input terminology.
   - Cross-domain processes are described as business workflows and routed to architecture for orchestration details when needed.

7. Workflow and state clarity
   - Core user/admin flows have enough business-level sequence detail for implementation planning without requiring invented behavior.
   - State transitions identify who/what triggers them, the business preconditions, and the resulting state or outcome.
   - Terminal, exceptional, refund/cancel/retry, timeout, fallback, and integration-failure paths are specified at the business level when they affect product behavior.
   - State names are business-facing; stored codes or enum catalogs remain owned by the contract/model artifacts.

8. Roles, permissions, and protected actions
   - Role docs describe business permissions consistently with feature/domain docs.
   - Admin-only, user-only, super-admin-only, system-initiated, and external-callback actions are not blurred.
   - Sensitive behavior (payment, refund, data deletion, account management, permission management) has an explicit owner-doc baseline or is escalated.

9. Page and interaction behavior
   - Design docs describe important page or interaction outcomes when those outcomes are part of supported app behavior.
   - Required validation, eligibility, empty/error states, and user-visible feedback are covered at business level when omission would force implementation guessing.
   - UI/prototype details are not treated as requirements unless the relevant requirement or design owner doc has accepted them.

10. Configuration and operations semantics
   - Business-facing configuration behavior is separated from technical scheduling, storage, deployment, or integration mechanics.
   - Operational defaults, fallbacks, and admin-visible controls are defined only when they affect supported app behavior.

11. Maintenance cost and duplication
   - A design fact has one natural owner doc; other docs link or summarize only when that helps navigation.
   - Repeated matrices, feature status lists, and copied rule blocks are treated as risks unless they are deliberately the single owner of that information.

Severity guidance:
- `blocker`: would likely cause wrong implementation, demo-grade behavior, unsafe permission/payment/refund behavior, or a source-of-truth violation.
- `major`: leaves material ambiguity, cross-doc conflict, boundary drift, or high-maintenance duplication.
- `minor`: improves clarity or navigation but does not block implementation.
- `note`: residual risk, watch item, or optional cleanup.

Return findings first, ordered by severity. For each finding include: severity, affected file and line when available, issue, why it matters, and recommended disposition (fix in design, update requirement, move to architecture, move to contract/model owner, move to roadmap/backlog, or ask human decision).

Then return:
- Verdict: pass/fail
- Scope reviewed
- Requirement/design conflict classification summary
- Owner-boundary summary
- Domain-boundary summary
- Maintenance-cost summary
- Residual risks or skipped areas

If no blocker or major finding remains, say `Verdict: pass` and still list residual risks.
```
