# Skills Index

Reusable prompts and workflow playbooks — repository-versioned repo memory, portable across tools. These are not one-off chat messages.

Skills capture reusable **work methods** (review methods, audit methods, operation procedures). A skill never substitutes for requirement/design/architecture truth. A skill library is not the attractor: without routing through `AGENTS.md`, `docs/index.md`, and owner docs, a large skill library degenerates into structured vibe coding.

These prompts are generic defaults. After adapting the template, customize them to the project's real owner docs, protected areas, verification stack, naming conventions, and known failure modes.

## Shelves

Skills are organized by audience; when adapting the template, copy `common/` plus the shelf that matches the project type (installer `--profile`), and prune what you will not use.

| Shelf | Audience |
| --- | --- |
| `common/` | every project — document/plan/closure audits, diagnosis, refactor methods |
| `frontend/` | frontend / low-code / component-heavy projects |
| `java/` | Java backend business systems |

## Skill Routing Rule

1. Read the relevant requirement and owner docs first.
2. Classify the task type using `AGENTS.md`.
3. Choose the skill by matching the work method, not the business label.
4. If multiple skills could fit, ask an independent subagent or reviewer to choose before implementation.
5. If no skill fits, record `Skill: none` and proceed with the normal docs-driven workflow.
6. For non-trivial plans, record the skill selection basis and review result in the plan.

Do not add broad business-scenario skills as replacements for owner docs. Promote a skill only when the reusable work method is stable.

## Registry

### common/

| Skill | Use when | Required inputs | Expected output |
| --- | --- | --- | --- |
| `common/age-practice-gap-audit-prompt.md` | a repo needs comparison between live practice and intended AGE workflow | AGE baseline docs, repo structure, sampled evidence | analysis note with prioritized gaps |
| `common/document-audit-prompt.md` | requirement/design/architecture docs may be incomplete or inconsistent | target docs, related input/owner docs | findings and revision targets |
| `common/design-doc-audit-prompt.md` | `docs/design/` needs revalidation as the behavior baseline | all design files, requirements | severity-ordered findings |
| `common/state-machine-business-review-prompt.md` | a workflow state machine needs correctness review | the owner doc defining it, requirements | P0–P3 findings, verdict, summaries |
| `common/plan-audit-prompt.md` | a non-trivial plan is ready for challenge | plan file, related docs | pass/fail audit with issues |
| `common/closure-audit-prompt.md` | implementation claims completion | plan, verification evidence, changed docs | closure verdict and gaps |
| `common/requirement-gap-retrospective-prompt.md` | landed work missed expectations; requirement pipeline needs diagnosis | input, requirement docs, delivered result | retrospective findings, process corrections |
| `common/multi-dimensional-audit-prompt.md` | high-risk work needs challenge across dimensions at once | relevant docs, plan/changed area, evidence | findings grouped across dimensions |
| `common/open-ended-audit-prompt.md` | hidden problems may exist beyond the checklist | relevant docs, plan, logs, changed code | adversarial findings, unknown-risk notes |
| `common/index-routing-audit-prompt.md` | a docs index or structure needs routing-effectiveness review | index files, target files | coverage table, structural findings |
| `common/bug-diagnosis-prompt.md` | a bug is real but the root cause is unproven | bug report, owner docs, repro path | confirmed cause and proof path |
| `common/code-quality-audit-prompt.md` | reviewing code for behavioral risk | changed files, owner docs, tests | severity-ordered findings |
| `common/code-refactor-discovery-prompt.md` | structural cleanup candidates need discovery | target area, owner docs, code | ranked refactor candidates |
| `common/code-refactor-prompt.md` | behavior-preserving structural refactor is the task | target area, invariants, verification commands | safe refactor execution and proof |
| `common/development-wisdom-gate-prompt.md` | AI self-check before declaring non-trivial output complete | current output, assumption inventory | challenged output, surfaced assumptions |

### frontend/

| Skill | Use when | Required inputs | Expected output |
| --- | --- | --- | --- |
| `frontend/component-design-review-prompt.md` | a component's design or implementation needs review before landing | component code, design-system docs, usage sites | severity-ordered findings |
| `frontend/exploratory-e2e-testing-prompt.md` | a feature needs an exploratory end-to-end pass beyond scripted tests | feature docs, running app, test baseline | journey/defect report under `docs/testing/` |

### java/

| Skill | Use when | Required inputs | Expected output |
| --- | --- | --- | --- |
| `java/api-and-transaction-design-review-prompt.md` | an API + transaction design needs review before implementation | design docs, module boundaries, data model | findings on contract/transactions/compat |
| `java/backend-regression-audit-prompt.md` | a backend change claims completion and needs regression audit | change diff, owner docs, verification evidence | closure-oriented regression findings |

## Relationship With `.agents/skills/`

Two layers, one repo:

- **`docs/skills/`** (this directory): method/audit prompts. Portable, referenced by plans (`Skill: <name>`), executed by any reviewer — human or AI — that can read a file.
- **`.agents/skills/`**: operational skills the AI tool auto-loads (daily git operations, grilling sessions, the mission-driver operator skill). See `.agents/skills/README.md`.

Review/audit prompts stay here because any independent reviewer must be able to discover them; tool auto-loading is not guaranteed across tools.
