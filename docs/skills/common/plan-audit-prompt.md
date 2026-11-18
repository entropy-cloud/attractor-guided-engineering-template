# Plan Audit Prompt

Use this prompt when independently reviewing an execution plan before implementation.

All created plans require this review.

```text
You are the independent draft reviewer for this plan — a cold-start session with
no prior conversation context. State this role explicitly in your reply.

Run the mechanical gate FIRST: `node tools/plan-status.mjs --check <plan>` must
be clean before substantive review (the script owns format checks; your review
focuses on substance, not format re-derivation). A dirty check is a blocker.

Then read, in order: `AGENTS.md`, `docs/index.md`,
`docs/guides/application-development-workflow.md`, the plan-format authority
`docs/guides/plan-authoring-and-execution.md`, the roadmap work item this plan
delivers (in `docs/roadmaps/`), the owner docs the plan claims, and the active
plan under `docs/plans/<roadmap-slug>/`. Verify the claimed owner docs actually
exist and actually own what the plan cites.

Audit the plan as an execution contract.

Check `docs/context/ai-autonomy-policy.md` reviewer availability. Cold replay is not a second reviewer and never approves protected areas, unresolved product risk, or source-of-truth conflicts.

Review dimensions (answer each explicitly):
- cold-start executability: could a fresh session execute this plan with chat closed? (guide's Cold-Start Continuity rules — all paths, commands and criteria self-contained)
- scope correctness: exactly covers the mapped work item; no boundary creep into other work items; Non-Goals sufficient
- format compliance against the authority guide: 2–6 phases, one result surface, work-item mapping legal (never one work item spread across plans), receipt-region structure intact, frontmatter flat scalars with explicit nonempty `verify` keys each bound to a real runnable command (run them or confirm they are real)
- whether the current baseline is honest
- whether goals and non-goals are clear
- whether closure gates are real
- whether hidden dependencies or unresolved requirement gaps remain
- whether any in-scope defect or contract gap was silently downgraded
- anti-slacking: no `optional / if time permits / consider / maybe / nice to have / as needed` wording on in-scope items; every Follow-up names its promotion trigger; every Exit Criterion is verifiable
- whether task routing and recorded skill usage are honest, necessary, and matched to the owner docs
- whether the backlog or context was loosened by AI without human confirmation or human-approved owner-doc evidence
- whether stale-doc or legacy-mode conflicts were classified before implementation
- whether proof and verification cover every acceptance criterion
- protected areas: the plan must not touch blocked/research-only areas or invent untraceable knowledge

Severity levels: `blocker` (format violation, dishonest closure gate, hidden dependency, downgraded defect), `major` (weak proof strategy, unclear boundary), `minor` (clarity).

Output format (strict):
- first line: `VERDICT: pass` or `VERDICT: issues`
- for each issue: numbered, classified `blocking` or `non-blocking`, quoting the exact plan location it concerns
- findings first, ordered by severity.
- Severity uses the project scale (see `docs/guides/audit-execution.md` Finding Format And Disposition): `P0` blocker / `P1` major / `P2` minor / `P3` nit — keep the domain calibration above, mapped onto this scale. Every finding also carries why-new (dedup against existing findings, WIs, and bug notes) and a suggested carrier (roadmap WI / fixing plan / ledger row).
Do not praise the plan unless it changes the risk assessment.
Review is read-only: do not modify the plan; the coordinator (or you, only where
the workflow assigns it) records the outcome.

If blocking issues are found, say `needs revision` and list the exact files/sections to change.
If no blocking issue remains, say `passes draft review` and list residual risks if any.
The acceptance must leave the paired receipt in the plan `## Draft Review Record`
(`- dispatch review #review-... to <your session>` written before your review,
then `- <date>：iteration <n>，共识 passes draft review #review-<same id>`); the
reviewer (not the drafter) flips the plan frontmatter to `active` on accept.
```
