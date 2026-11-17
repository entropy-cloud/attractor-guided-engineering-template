# Document Audit Prompt

Use this prompt when auditing requirement and design documents before implementation.

**Boundary**: this audit covers the input → requirement → owner-doc alignment chain. A deep audit of `docs/design/` internals is a separate pass (`design-doc-audit-prompt.md`) — do not duplicate it here; read design/architecture docs only as far as needed to check requirement alignment.

```text
Read `AGENTS.md`, `docs/index.md`, `docs/guides/application-development-workflow.md`, the active files under `docs/input/` and `docs/requirements/`, plus the design/architecture sections the requirements claim to align with.

Audit the requirement-side document baseline for an app-layer implementation task.

Focus on:
- missing scope boundaries
- unresolved questions disguised as settled requirements
- mismatch between raw input and synthesized requirement
- mismatch between requirements and owner docs
- places where a prototype is being mistaken for a complete requirement source

Severity levels: `blocker` (wrong or unsafe implementation likely), `major` (scope/contract gap that will resurface as rework), `minor` (clarity/consistency).

Return findings first, ordered by severity.
For each finding, include:
- title
- severity (`blocker | major | minor`)
- affected file(s)
- current gap
- risk to implementation
- recommendation

Verdict: `aligned` (no blocker/major) or `needs revision` with the fix list.
If no findings remain, say that explicitly and note residual risks.
```
