# Audit Prevention Checklist

Historical audits across template-derived projects keep finding the same defect classes. This checklist converts those findings into pre-flight checks: run through it **before handing off any non-trivial change**, and most audit findings become impossible.

Each item cites the historical failure class it prevents.

## Before Drafting

- [ ] **Route before code.** Task classified, owner docs read, guide selected via `AGENTS.md` Task Routing. *(Prevents: implementations that contradict owner docs because the doc was never read.)*
- [ ] **Read-list is complete.** You have opened every file you will touch or contradict — not only the ones the task names. *(Prevents: audit rounds that fail because the reviewer's read-list was narrower than the change surface; historically the #1 cause of multi-round audits.)*
- [ ] **Missing information is written down**, not silently assumed: a requirement/discussion/plan note carries every assumption. *(Prevents: "resolved by invention" findings.)*

## Plan Hygiene

- [ ] Phases are 2–6, one result surface, work-item mapping legal (no work item spread across plans). *(Prevents: unclosable plans, stalled loops.)*
- [ ] Every exit criterion has a proof strategy (command, test, or explicit justification). *(Prevents: dishonest closure gates.)*
- [ ] Every in-scope item avoids `optional / maybe / if time permits`. *(Prevents: anti-slacking violations found at closure.)*
- [ ] The draft was mechanically validated (engine mode: `gate-check.mjs <plan>` clean). *(Prevents: invisible plans — a parser-rejected frontmatter silently excludes the plan from review/execution.)*

## Verification Reality

- [ ] Verification commands come from `docs/context/project-context.md` and were **actually run**; output pasted or referenced, exit codes real. *(Prevents: "claimed proof does not exist" — the most common closure-audit rejection.)*
- [ ] No placeholder commands remain anywhere in active docs. *(Prevents: template placeholders reported as verification.)*
- [ ] Scoped passes are labeled "verification scope limited" with residual risk — never reported as full green. *(Prevents: false full-green baselines.)*
- [ ] Analytical claims ("this still works after my change") are backed by a trace, not asserted. *(Prevents: mental dry-run asserted as verified.)*

## Document Placement

- [ ] Normative docs carry no history: no changelog headings, no dated sections, no "previously was" narration — history went to `docs/logs/`. *(Prevents: the recurring normative-vs-timeliness violation; checkable via `tools/check-doc-timeliness.mjs`.)*
- [ ] Each fact has exactly one owner file; others link. Status lives only in roadmap checkboxes / plan frontmatter. *(Prevents: bookkeeping conflicts and constantly re-maintained parallel ledgers.)*
- [ ] New file went to the right directory per `docs/guides/doc-organization.md`; on-demand directories were created only with real content. *(Prevents: empty-shell directories and misplaced documents.)*
- [ ] Links updated after any rename/move; ran `node tools/check-doc-references.mjs`. *(Prevents: dead references after renames — found in every audited historical project.)*

## Independence

- [ ] Draft review and closure audit were performed by a subagent other than the executor; receipts recorded in the plan. *(Prevents: self-closure, which the format makes impossible when receipts are enforced.)*
- [ ] Actual executor/reviewer/auditor evidence is recorded, with independent acceptance available; cold replay is not a substitute. *(Prevents: silent quality downgrade.)*

## Workspace Hygiene

- [ ] No scratch files at the repo root; one-off scripts in the plan dir or `_tmp/`; no `tmp/`/`.tmp/` duplicates; no crash logs or generated data committed. *(Prevents: the root-litter finding class that every historical project accumulated.)*
- [ ] Nothing landed that depends on an untracked local state (env vars, sibling checkouts, absolute paths). *(Prevents: works-on-my-machine — e.g. engines resolved via sibling-repo relative paths.)*

## Findings Disposition

- [ ] Every P0–P2 finding names exactly one carrier (roadmap WI / defect-ledger row / fixing plan); closure gate: findings without a carrier = 0. The report stays frozen — no disposition annotations, no progress headers. (Prevents: dead-account audit reports, see `docs/guides/audit-execution.md`.)

## After Closure

- [ ] A recurring defect pattern was evaluated for promotion: lesson → reusable prompt under `docs/skills/` → check script (`tools/check-*.mjs`) when it keeps recurring. *(Prevents: the same audit finding reappearing every round because only prose lessons were written.)*
- [ ] Roadmap checkbox ticked exactly once, by the audit-pass step. *(Prevents: stale/double status surfaces.)*
