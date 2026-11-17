# Document Audit Prompt

Use this prompt when auditing requirement and design documents before implementation.

```text
Read `AGENTS.md`, `docs/index.md`, `docs/guides/application-development-workflow.md`, the active files under `docs/input/`, `docs/requirements/`, `docs/design/`, and `docs/architecture/`.

Audit the current document baseline for an app-layer implementation task.

Focus on:
- missing scope boundaries
- unresolved questions disguised as settled requirements
- mismatch between raw input and synthesized requirement
- mismatch between requirements and owner docs
- places where a prototype is being mistaken for a complete requirement source

Return findings first, ordered by severity.
For each finding, include:
- title
- affected file(s)
- current gap
- risk to implementation
- recommendation

If no findings remain, say that explicitly and note residual risks.
```
