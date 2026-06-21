# Template Design Decisions

Each entry has Context, Decision, Rationale, and Consequences. Omit a section only when its content is obvious from the others. New entries go above the line.

This file is the template evolution record for stable reusable changes.

- Record here only when the template's reusable guides, examples, or default rules changed.
- Do not record session-by-session execution detail here.
- Do not record temporary experiments that did not become stable template guidance.

---

## 2026-06-20: Add Mission-Driver Tool and Converge Goal-Driver Into It

### Context

The `goal-driver` prototype in `nop-chaos-flux` was a bash script with hard-coded CLI parsing and no expression engine, making it rigid for different project structures. Running it across multiple Nop entropy projects revealed three recurring needs: dynamic when-condition evaluation, universal forEach iteration across step types, and project-level flow/prompt overrides without editing the tool source.

### Decision

- Replaced `goal-driver` with `tools/mission-driver/`, a Node.js flow engine in 8 source modules with 4 design docs, 3 JSON flow definitions, 7 prompt stubs, and 4 test suites (76 tests).
- Added `src/expression.mjs` as a small expression engine for when-conditions, forEach sources, and string interpolation in flow definitions.
- Added universal forEach support so any step type (agent, tool, script, group, subflow) can iterate.
- Added project-level override mechanism: `missions/flows/` and `missions/prompts/` override tool defaults per project.
- Added `flowName` config field to select a custom main flow per mission.
- Simplified the plan lifecycle from 4 states to 3: `draft → active → completed` (removed the `reviewed` intermediate state since closure audit already gates completion).
- Restructured the deep-audit-loop to a linear flow with independent `MULTI_AUDIT` and `OPEN_AUDIT` steps instead of nested parallelism.
- Documented the full design in English under `tools/mission-driver/design/`.

### Rationale

Bash goal-driver could not scale to real project needs without growing into an unmaintainable script. A small Node.js engine with explicit flow definitions separates mechanism from policy: the engine stays generic, and per-project behavior is configured through overrides. Removing the `reviewed` plan state eliminated a no-op transition since closure audit was already the gate. Linear audit flows reduce cognitive overhead compared to nested parallelism.

### Consequences

Copied projects get a ready-to-use flow engine under `tools/mission-driver/` with design docs, test coverage, and an override mechanism that keeps the tool generic. The previous `goal-driver.sh` is removed. Projects that do not need the tool can delete the `tools/mission-driver/` directory.

---

## 2026-06-20: Minimize Dynamic Context Fields And Clarify Roadmap As The AI Work Queue

### Context

Wiring an automated development loop (the `goal-driver` in `nop-chaos-flux`) onto the roadmap and `project-context` exposed two problems. First, `project-context.md` carried an Active Work block (active plan / owner doc / requirement / backlog / AI autonomy / current blocker) that was high-churn, went stale quickly, and duplicated state already derivable from unfinished plans. Second, the roadmap guide only said "coarse-grained phase index" without stating the roadmap's role as an AI work queue, the granularity rule that makes the loop advance, or the human/AI division of labor.

### Decision

- Removed the Active Work block from `docs/context/project-context.md`. Freshness gating rules moved under Project Identity. AI autonomy is no longer a global field here — it is a per-work-item label living on backlog/roadmap items, with `implement` as the default set in `ai-autonomy-policy.md`. "What is being worked on now" is read from unfinished plans in `docs/plans/`, not maintained as a field here.
- Updated `START-HERE-after-copy.md`, `docs/context/ai-autonomy-policy.md`, and `AGENTS.md` to drop references to the removed fields; the old "active requirement is none" gate became "no requirement or owner doc describes the intended behavior" (existence-checked against `docs/requirements/` / `docs/design/`, not a field value).
- Added three sections to `docs/backlog/00-roadmap-authoring-guide.md`: **Roadmap Role** (human–AI alignment + AI work queue; plans are AI-authored/executed and humans do not review individual plans), **Phase Granularity** (the markable unit must equal one plan's delivery scope; a phase larger than a plan stalls the loop), and **Closed Loop** (read Phase Status → take first `todo` → draft/execute plan → write back `done` → next). Added four anti-patterns (phasing coarser than a plan, a second per-item status column, AI re-arbitrating priority, Active Work fields in `project-context.md`).
- Annotated the `implementation-roadmap.md` skeleton's Phase Status block with the alignment/loop summary.

### Rationale

High-churn state fields in `project-context.md` go stale and add maintenance burden for no gain, since current work-in-progress is already derivable from unfinished plans. Treating the roadmap only as a static planning document lets phases drift coarser than a plan, so a finished plan updates nothing and the automated loop stalls with nowhere to write back. Stating the roadmap's role explicitly (humans steer item set and order; AI consumes in order, drafts/executes plans unseen by humans, writes back `done`) and tying markable-unit granularity to one plan is what makes the closed loop actually advance.

### Consequences

Copied projects get a minimal-dynamic context (only documentation freshness remains as a maintained value) and a roadmap that is machine-consumable as an AI work queue while still serving as the human observation/steering surface. The template no longer promotes the Active Work high-churn anti-pattern. The roadmap and plan roles are now cleanly separated: humans maintain roadmap item set and priority, AI plans and executes autonomously with closure audit as the quality gate, and finished work always has a roadmap item to mark done.

---

## 2026-06-18: Simplify Planning Into Two Tiers And Add Reviewer-Availability Fallback

### Context

The plan rule had a sharp gap. Every created plan required independent draft review and closure audit, which was disproportionate for small low-risk multi-file changes. At the same time there was no documented fallback for solo or small teams that have no second reviewer, so agents either over-applied ceremony or silently skipped review without a recorded method.

### Decision

- Expanded the no-plan path so it also covers small low-risk multi-file edits (roughly 1 to 3 non-generated files, about 200 changed lines or fewer) that touch no contract, data/model, auth, permission, integration, deployment, cross-surface behavior, documentation conflict, or unresolved product risk.
- Added a cold-replay verification requirement to the no-plan path: verify the change against the actual diff and the real verification commands and record a log entry; do not mark work complete from chat memory alone.
- Added a Reviewer-Availability Fallback for created plans: when no second reviewer or subagent is available, a solo cold-replay pass is acceptable only for non-protected and non-high-risk plans, with the limitation recorded.
- Updated the plan guide closure rule to require recording when a solo fallback was used.

### Rationale

This keeps two clean tiers (no-plan / full-plan) instead of an awkward middle layer, puts verification discipline where small changes actually happen rather than forcing ceremony on them, and gives small teams a pragmatic recorded path. Protected areas, unresolved product risk, and source-of-truth conflicts still require human or subagent review or stay open.

### Consequences

Copied projects get a proportionate default: trivial and small low-risk edits are fast but still verified against real commands, non-trivial work stays independently audited, and protected areas remain guarded.

---

## 2026-06-18: Add State Machine And Design Doc Audit Skills

### Context

The skill set covered document, plan, closure, code, and refactor audits, but lacked reusable methods for two recurring high-risk review types: verifying that a business state machine is internally correct and reachable, and verifying that design docs are a clean app-layer behavior baseline.

### Decision

- Added `docs/skills/state-machine-business-review-prompt.md`
- Added `docs/skills/design-doc-audit-prompt.md`
- Registered both in `docs/skills/README.md`

### Rationale

Workflow correctness and design-doc quality are the two places where subtle errors most often produce wrong implementation. Promoting them to reusable, routing-selected skills lets projects challenge these areas consistently instead of rediscovering the checklist each time.

### Consequences

Copied projects gain ready-made methods for the most common business-correctness and design-baseline audits, applicable to any workflow-heavy or multi-domain application without framework coupling.

---

## 2026-06-18: Add Optional Roadmap Layer To Backlog

### Context

The backlog was a flat work-item table. For larger projects this could not express phase-level progress, dependencies, or framework/platform reuse, so an AI had to re-walk the whole repo to know what was already done.

### Decision

- Added `docs/backlog/00-roadmap-authoring-guide.md`
- Added `docs/backlog/implementation-roadmap.md` as a placeholder skeleton
- Made the roadmap explicitly optional, with status transitions tied to the plan lifecycle (draft review -> `active`, closure audit -> `done`)

### Rationale

A coarse-grained status index lets an AI or maintainer recover global progress from one file. Tying status transitions strictly to the plan lifecycle prevents premature `done` signals, and annotating framework/platform reuse prevents rebuilding existing capabilities.

### Consequences

Copied projects can scale backlog from a flat list to an orchestration layer when complexity justifies it, without forcing heavy process on small projects.

---

## 2026-06-18: Add Optional Design, Requirement, And Architecture Starter Skeletons

### Context

The template had starter files for app-overview, feature-inventory, and roles-permissions, but lacked skeletons for several recurring owner-doc shapes that multi-domain or integration-heavy projects need: a domain ownership map, a global flow overview, a product/first-loop baseline, API response conventions, and integration/transaction patterns.

### Decision

- Added `docs/design/domain-design-guidelines.md` (skeleton)
- Added `docs/design/flow-overview.md` (skeleton)
- Added `docs/requirements/product-baseline.md` (skeleton)
- Added `docs/architecture/api-response-conventions.md` (optional skeleton)
- Added `docs/architecture/integration-and-transaction-patterns.md` (optional skeleton)
- Marked all of them optional / on-demand in `docs/index.md`, `START-HERE-after-copy.md`, and `README.md`

### Rationale

These skeletons capture proven owner-doc shapes for cross-domain ownership, global flow, formal product baselines, API hygiene, and external-integration safety. Providing them as optional placeholders lets projects adopt the right structure without inventing it, while the explicit on-demand labeling keeps small projects lean.

### Consequences

Copied projects get consistent, generic starting points for the most common advanced owner docs, and the template's minimal default path stays unchanged for projects that do not need them.

---

## 2026-06-18: Refine Archive Organization And Mature Playwright E2E Guide

### Context

The archive rule only said files keep their original relative name, with no predictable sub-structure, so archived material became hard to recover over time. The Playwright guide was strong on diagnostics but did not encode the operational pitfalls of running E2E alongside a development instance.

### Decision

- Added an Archive Organization section to `docs/references/document-naming-and-timeliness.md` (design/architecture by module or topic, plans under `YYYY-MM/`, other dated records by original relative path).
- Added an Isolating The E2E Runtime section to `docs/references/playwright-e2e-guide.md`: isolated data source/port/profile, a `SKIP_WEBSERVER` mode for running against an already-running server, and a no-output troubleshooting checklist.

### Rationale

Predictable archive sub-structure keeps historical material recoverable as a project ages. Encoding the E2E operational pitfalls as defaults prevents each copied project from rediscovering datasource/port lock conflicts and silent startup failures.

### Consequences

Copied projects get a stable archive layout by default and a Playwright setup that coexists cleanly with a running development instance, reducing avoidable friction during local verification.

---

## 2026-06-07: Converge Plan Workflow Toward Nop-Chaos-Flux Practice

### Context

The template had already introduced independent draft review and closure audit, but the plan workflow was still heavier and less consistent than `nop-chaos-flux` in two places. It still resembled a formal `Plan Audit`-style contract instead of a revise-the-plan loop, and the plan lifecycle details were spread across multiple files instead of being owned mainly by the plan guide.

### Decision

- Kept `Draft Review Record` in plans, but changed it to a lightweight iteration record instead of a formal `Plan Audit` block
- Updated the plan guide so created plans normally start as `Plan Status: draft`, move to `active` only after independent draft review converges, and close only after independent closure audit
- Slimmed `AGENTS.md` so it points plan work to `docs/plans/00-plan-authoring-and-execution-guide.md` instead of repeating most plan-state details
- Updated examples to show `draft` plus iteration-style `Draft Review Record`

### Rationale

This change makes the template closer to `nop-chaos-flux`'s real practice: the plan guide owns the detailed execution contract, draft review improves the plan directly, and closure remains independently audited. That is more compatible with AGE because it preserves durable reasoning where it matters without turning plan review into extra process theater.

### Consequences

Copied projects get a clearer default plan lifecycle: `draft -> active -> completed`, with visible independent draft-review iterations and independent closure evidence. The template also becomes easier to maintain because plan-specific detail is concentrated in one controlling guide instead of repeated across top-level docs.

---

## 2026-06-02: Strengthen Mandatory Log Recording Rules

### Context

The template had `docs/logs/` and `00-log-writing-guide.md`, but AGENTS.md only said "Keep logs short, dated, and append-only" without a mandatory trigger. In practice (nop-chaos-flux), the AI never wrote logs because no condition forced it. nop-chaos-flux had to add its own "Docs Maintenance" section with explicit mandatory triggers, a verification checklist, and a full-green baseline recording rule.

### Decision

- Updated AGENTS.md Operating Rule 7: added mandatory trigger "After completing any significant code change, you MUST update the daily dev log"
- Added `Docs Maintenance` section to AGENTS.md with two mandatory items (log update + owner doc update) and a full-green baseline recording rule
- Expanded `docs/logs/00-log-writing-guide.md` from a 19-line skeleton to a full guide with Purpose, Rules (6 items), Path Convention, Entry Format example, and step-by-step Adding A New Entry instructions
- Added log directory initialization step to `START-HERE-after-copy.md` Required checklist

### Rationale

Without a mandatory trigger and concrete format guide, the log rule was invisible to AI agents. The template had the directory structure and a placeholder guide, but neither AGENTS.md nor the guide told agents when or how to write entries. nop-chaos-flux proved that a "Docs Maintenance" section with MUST-level triggers and a full-green recording rule makes log recording actually happen.

### Consequences

Copied projects will have enforceable log rules from the start. The expanded `00-log-writing-guide.md` provides enough format detail that agents can write well-structured entries without guessing. The START-HERE checklist ensures the log directory structure is ready before the first coding session.

---

## 2026-05-29: Add Reusable Engineering Skills And Optional Tools Workspace

### Context

The template now includes a broader reusable engineering surface: bug diagnosis, code quality audit, refactor discovery, refactor execution, root-level text-file defaults, and a repo-local `tools/` workspace for generic checks.

### Decision

- Added `docs/skills/bug-diagnosis-prompt.md`
- Added `docs/skills/code-quality-audit-prompt.md`
- Added `docs/skills/code-refactor-discovery-prompt.md`
- Added `docs/skills/code-refactor-prompt.md`
- Updated `docs/skills/README.md`
- Added `.editorconfig`, `.gitattributes`, and `.gitignore`
- Added `tools/` as an optional pnpm subproject for reusable repository-local utilities

### Rationale

This change was made because the template already defined a docs-driven workflow, but it lacked reusable methods for three common execution patterns that recur after routing: proving root cause, auditing changed code for real risk, and restructuring code without quietly changing behavior.

The repository also needed a small default quality baseline for copied projects. Root-level text normalization reduces avoidable diffs, while keeping Node-based utilities inside `tools/` preserves the template's cross-stack posture instead of turning the repository root into a Node-only project.

### Consequences

Copied projects can adopt a wider set of reusable engineering methods immediately, and they have a ready place to grow lightweight repo-local checks without coupling the whole template to a single runtime stack.

## 2026-05-29: Add Index Routing Audit Skill

### Context

Existing audit skills cover document quality and plan/decision auditing, but none verify that the index tree (`docs/index.md` + per-directory READMEs) actually routes readers to the right place.

### Decision

- Added `docs/skills/index-routing-audit-prompt.md`

### Rationale

This change was made because routing quality is a recurring template risk: a copied project can have the right owner docs but still fail to guide agents and maintainers to the correct next artifact.

Routing failures are often contextual: an index entry can be technically correct yet still fail a specific persona. A simple checklist misses this. The prompt uses three layers — coverage table, persona-based routing test, structural checks — so that mechanical correctness and contextual reachability are both evaluated.
