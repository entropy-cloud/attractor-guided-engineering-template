# Multi-Dimensional Audit Prompt

Use this prompt when a normal object-specific audit is not enough and the work must be challenged across multiple dimensions at once.

This is a generic default prompt. After copying the template, tune it to the project's real owner docs, protected areas, verification stack, deployment model, and known risk areas.

```text
Read `AGENTS.md`, `docs/index.md`, the active requirement and owner docs, the relevant plan or changed area, and the latest verification or audit evidence.

Audit the work across multiple dimensions, not only one artifact at a time.

Check at least these dimensions:
- requirement correctness
- owner-doc alignment
- architecture or boundary impact
- verification adequacy
- regression risk
- routing and skill-selection correctness
- backlog or autonomy-policy drift

Do not assume the template's default dimensions are enough for every repository. Add project-specific dimensions when the copied project has protected domains, integration-heavy flows, security-sensitive paths, regulated workflows, or unusual deployment constraints.

Return findings first, ordered by severity.
Severity uses the project scale (see `docs/guides/audit-execution.md` Finding Format And Disposition): `P0` blocker / `P1` major / `P2` minor / `P3` nit — keep the domain calibration above, mapped onto this scale. Every finding also carries why-new (dedup against existing findings, WIs, and bug notes) and a suggested carrier (roadmap WI / fixing plan / ledger row).
If blocking issues are found, say `needs revision` and list the exact files, dimensions, and missing evidence.
If no blocking issue remains, say `passes multi-dimensional audit` and list residual risks by dimension.
```
