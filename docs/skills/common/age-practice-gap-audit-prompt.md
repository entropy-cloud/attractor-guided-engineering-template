# AGE Practice Gap Audit Prompt

Use this prompt when a project has copied or partially adopted the Attractor-Guided Engineering template, but the team needs to see where live practice still differs from expected AGE workflow.

Typical triggers:

- a legacy project started using AGE in the middle of delivery
- multiple rounds of doc structure, routing, or guide prompt changes have happened and drift is suspected
- the repo appears to have some AGE files, but work still jumps from request to code
- humans want a concrete migration baseline before tightening autonomy or process rules

## Audit Prompt

```text
You are auditing the gap between the current project's actual working practices and the intended Attractor-Guided Engineering baseline.

Your job is not to demand template-perfect conformity. Distinguish between:
- intentional project-specific customization
- partial AGE rollout that is acceptable for the current stage
- obvious workflow drift that creates delivery risk
- placeholder or stale template content that makes AGE look adopted when it is not operational

## Step 1 - Read the AGE baseline

Read at minimum:
- `AGENTS.md`
- `docs/index.md`
- `docs/guides/application-development-workflow.md`
- `docs/context/project-context.md`
- `docs/context/ai-autonomy-policy.md`
- `docs/context/codebase-map.md`
- `docs/context/source-of-truth-and-precedence.md`
- `docs/skills/README.md`
- `docs/roadmaps/README.md` if it exists
- `docs/guides/plan-authoring-and-execution.md` if it exists
- `docs/guides/audit-execution.md` if it exists
- `docs/logs/index.md`
- `docs/analysis/README.md`
- the active requirement, owner doc, and active plan referenced from `docs/context/project-context.md` when they exist

Also inspect enough live repo structure to verify whether the documented workflow is actually being used.

## Step 2 - Compare claimed process vs live evidence

Check for evidence of real use, partial use, or missing use in these areas:

1. Context discipline
- are `project-context`, autonomy policy, and codebase map filled with real project values or still placeholders?
- do agents have enough live routing information to act safely?

2. Source-of-truth discipline
- are requirements, design, architecture, plans, logs, bugs, testing, analysis, and retrospectives used for their intended ownership boundaries?
- are major decisions living only in chat or scattered in the wrong directories?

3. Requirement and design flow
- does work move through `input -> requirements -> design/architecture` when needed?
- is the team skipping directly from raw requests or prototypes to implementation?

4. Task routing and skill selection
- do active tasks show explicit task classification and owner-doc routing?
- are skills used as reusable methods instead of replacing requirement or design truth?

5. Planning discipline
- for non-trivial work, are plans present when the planning triggers say they should be?
- are phases, proof requirements, closure gates, and skill selections real or placeholder-only?

6. Audit discipline
- do created plans show real plan-audit and closure-audit evidence?
- where audits are absent, is the omission low-risk and explainable, or a real process gap?

7. Verification discipline
- are verification commands real?
- do logs, testing notes, or changed code show that verification is actually being run?

8. Durable memory discipline
- after significant work, do logs exist?
- do bugs, analysis notes, or retrospectives exist where the workflow says they should?

9. Template adaptation quality
- has the copied template been customized to the real project, or is there still misleading generic content?
- are repeated adjustments to docs structure or prompts captured as stable guidance, or are they recurring ad hoc fixes?

## Step 3 - Classify each gap honestly

For each notable difference from AGE, classify it as one of:
- `intentional-customization`
- `acceptable-partial-adoption`
- `operational-gap`
- `stale-template-drift`
- `missing-evidence`

Do not report a difference as a defect unless there is a concrete risk, such as:
- AI may act on stale or placeholder docs
- owner-doc boundaries are unclear
- planning or audit obligations are silently skipped
- important delivery knowledge is not landing in durable files
- the repo signals AGE compliance but the evidence is missing

## Step 4 - Write the analysis note to docs/analysis

Create a dated analysis file at:
- `docs/analysis/YYYY-MM-DD-HHmm-age-practice-gap-audit.md`

If a same-day file with that exact name already exists, append a short differentiator slug such as:
- `docs/analysis/YYYY-MM-DD-HHmm-age-practice-gap-audit-round-2.md`

The file must contain these sections:

1. `# AGE Practice Gap Audit - YYYY-MM-DD`
2. `## Scope`
- repo or branch context if relevant
- what baseline docs were read
- what live areas were sampled

3. `## Executive Summary`
- 3-6 bullets
- include whether the repo is mostly aligned, partially adopted, or largely not operating under AGE yet

4. `## Alignment Matrix`
- a table with columns:
`| Area | Expected AGE Practice | Current Evidence | Status | Classification | Risk | Next Action |`
- cover at least: context, routing, requirements, design/architecture, planning, audits, verification, logs, optional layers, template customization

5. `## Findings`
- findings first, ordered by severity
- for each finding include:
  - title
  - affected file(s) or area(s)
  - current gap
  - why this matters operationally
  - whether it is drift, partial adoption, or intentional customization
  - recommended smallest corrective slice

6. `## Healthy Deviations`
- list differences that are acceptable project-specific adaptations and should not be "fixed" blindly

7. `## Suggested Migration Order`
- list the smallest practical next slices in order
- prefer workflow-enabling fixes before broad doc expansion

8. `## Evidence Reviewed`
- concise bullet list of the key files and repo areas checked

## Step 5 - Return a concise user-facing summary

After saving the file, return:
- the output path
- the top 3-5 gaps
- the most important acceptable customizations, if any

If no major gaps are found, say that explicitly and note residual risks or evidence limits.
```

## Customization Notes

After copying this template into a real project:

- replace generic AGE baseline file paths with the real project's strongest process anchors if they differ
- add project-specific protected areas and common failure modes to the gap checklist
- tune what counts as acceptable partial adoption based on project age, migration stage, and team maturity
- if the project repeatedly fails this audit in the same way, promote the recurring gap into a checklist, lintable rule, or stronger context guidance
