# Document Organization

This guide is the single authority for where documents live, how they are named, and how normative and timeliness content stay separated.

## The Two Categories

Every document is one of two categories. Decide with this rule of thumb:

- **Normative document** — answers *"what is the current supported baseline?"* → stable name, no date.
- **Timeliness document** — answers *"what happened in this round / on this day / in this investigation?"* → dated name.

| Category | Directories | Naming | Update style |
| --- | --- | --- | --- |
| Normative | `docs/architecture/`, `docs/design/`, `docs/context/`, `docs/requirements/` (baseline files), `docs/guides/`, `docs/skills/`, `docs/roadmaps/README.md`, `AGENTS.md` | stable name, no date | update in place; must match or lead the implementation |
| Timeliness | `docs/plans/`, `docs/roadmaps/` (roadmap files), `docs/audits/`, `docs/logs/`, `docs/bugs/`, `docs/analysis/`, `docs/lessons/`, `docs/testing/`, `docs/discussions/` | dated or numbered name (see Naming Conventions) | append-oriented; never rewritten to look like history did not happen |

## Hard Rules For Normative Docs

These rules exist because normative docs that accumulate history stop being readable as a baseline, and every adapted project historically drifted into violations.

1. **No changelogs.** A normative doc must not contain a changelog, revision history, "变更记录", or dated update section. History belongs in `docs/logs/` or the closing plan.
2. **No dated headings or dated bullets.** No `## 2026-xx-xx` sections; no `- 2026-xx-xx: ...` entries. If you need to record when something changed, write a log entry and (if durable) a lesson.
3. **No narrative of past states.** Write what IS, not what "used to be" or "was previously". Migration stories go to `docs/analysis/` or `docs/logs/`.
4. **Update in place, do not version.** Never create `xxx-v2.md` next to `xxx.md`. Supersede by editing, or archive the old file (human decision only).
5. **One fact, one surface.** A rule is stated in exactly one owner doc; other docs link to it. Restating "because it is also relevant here" is the top source of silent divergence.

Enforcement: `tools/check-doc-timeliness.mjs` checks configured syntax patterns, not semantic freshness. Descendant read/traversal errors fail; only absent optional top-level targets are skipped. A genuine exemption uses exactly `<!-- timeliness: allow reason="specific reason" -->` as the first nonblank line within the first 2KB.

`tools/check-doc-references.mjs` covers current normative roots, entrypoints, registered relative skills and the source template overlay. Markdown links are local unless they use an external scheme. Backtick paths use repo-relative roots or the document's directory; bare filenames in prose are not link assertions. Placeholders and `example:` are examples; `external:` identifies another corpus; `engine:` or `$MISSION_DRIVER_HOME/` resolves in the optional local engine. `source:` and `template/` identify source-checkout-only resources. Source/add-on paths are checked when that layer exists. Mark a concrete example path with `<!-- doc-ref: example reason="filename illustration" -->`, or label its code fence `md example`; this never exempts the whole document. The guard checks existence, not anchor contents or prose accuracy.

`tools/check-docs-garbled.mjs` writes heuristic reports under `_tmp/docs-garbled-check/`. Default mode is diagnostic; `--blocking` fails for likely-garbled candidates. Neither mode certifies clean encoding.

## Bookkeeping: One Fact, One Writer

Status/bookkeeping surfaces are the files that historically caused merge conflicts and constant re-maintenance. Rules:

1. **Work-item status lives only in the roadmap checkbox.** No status table, no per-item status suffix, no icons, no "current progress" fields in `AGENTS.md`, `docs/index.md`, or `project-context.md`.
2. **Plan status lives only in the plan's own frontmatter and checkboxes.** No external plan-status ledger.
3. **The roadmap is written by exactly one step**: the closure-audit pass of the delivering plan ticks the checkbox. Drafting/review do not touch the roadmap.
4. **Logs are append-only and per-day** (`docs/logs/{year}/{month}-{day}.md`). Never edit an old day's file to "update" it; append today.
5. **Plans of one roadmap live in their own directory** `docs/plans/<roadmap-slug>/` — this is the structural isolation that prevents cross-roadmap file collisions.
6. **Filename collisions are prevented by naming, not by merges**: dated/numbered names inside timeliness dirs are unique by construction.
7. **Do not create parallel ledgers** (tasks.yaml-style side files, status JSONs) that duplicate roadmap/plan state. If a machine face is needed, it must be derived, not maintained.

## Source-Of-Truth Precedence

| Question | Primary source | Notes |
| --- | --- | --- |
| What should be built now? | `docs/requirements/` | raw material in `docs/input/` (on demand); ambiguity resolved in `docs/discussions/` (on demand) |
| Current app behavior? | `docs/design/` | requirement files drive change; stable behavior converges into design |
| Current technical structure? | `docs/architecture/` | boundaries, module responsibilities, cross-cutting rules |
| Database truth? | the project's model/schema files | docs only interpret |
| API contract? | schema/route definition files | docs only interpret |
| How is this slice executed and closed? | `docs/plans/<roadmap-slug>/` | WIP is read from active plans |
| External integration truth? | the integration's own contract artifacts | OpenAPI/protobuf/SDK files; docs only interpret |
| Environment and deployment truth? | deployment/config files (IaC, env templates, CI) | docs describe intent, files define reality |
| What happened, and when? | `docs/logs/` | then `docs/audits/`, `docs/bugs/` |
| What should future sessions learn? | `docs/skills/`, `docs/lessons/` | promotion ladder: repeated lesson → skill prompt → check script |

## Legacy Or Stale-Docs Mode

When part of the normative baseline is known-stale (a doc lags the implementation and the fix is queued):

1. AI defaults to `plan-first` (or tighter) for work in the stale area — never `implement` against a known-stale owner doc.
2. The stale state is made explicit: mark the affected section in the owner doc (e.g. `> stale: pending <work-item>`), or open a roadmap work item to fix it. Silent tolerance is not allowed.
3. If code and normative doc conflict, do not silently pick a side: either fix the doc in the same change, or record the conflict as a work item before proceeding.
4. Stale-doc conflicts on protected areas escalate to human review regardless of autonomy level.

On conflict: the owner doc for the question wins; code and normative docs must not silently diverge — either fix the doc or fix the code in the same change, and record the decision. When two docs both claim ownership, that is itself a defect: pick one owner and turn the other into a link.

## Default Skeleton And On-Demand Directories

Default (created by the template, keep even if sparse):

```
docs/
├── index.md            # router
├── context/            # project-context.md, codebase-map.md, ai-autonomy-policy.md
├── guides/             # all how-to guides (this file's siblings)
├── roadmaps/           # roadmap files (one per dimension) + README
├── plans/<roadmap>/    # execution plans, isolated per roadmap
├── requirements/       # baseline + dated synthesis files
├── design/             # app-layer owner docs
├── architecture/       # technical owner docs
├── audits/             # stored audit records (non-trivial ones)
├── lessons/            # numbered durable lessons
├── analysis/           # investigations, tradeoffs, rejected directions
├── bugs/               # regression notes
├── logs/{year}/        # daily dev log
└── skills/{common,frontend,java}/  # prompt/method shelves
```

On-demand (do NOT create until first real content exists — empty shells are the historical root of "template does not match my project"):

| Directory | Create when | Naming |
| --- | --- | --- |
| `docs/discussions/` | a requirement ambiguity needs a durable clarification record | `YYYY-MM-DD-HHmm-topic.md` |
| `docs/input/` | raw external material (PM notes, cards, prototypes) must be kept | keep original name, add date prefix if ambiguous |
| `docs/testing/` | manual/exploratory testing needs durable records | `YYYY/MM-DD.md` |
| `docs/references/` | stable lookup material that is not a rule (external doc transcriptions, stack guides) | stable name |
| `docs/retrospectives/` | a landed result materially missed expectation and the pipeline needs diagnosis | `YYYY-MM-DD-HHmm-topic.md` |
| `docs/examples/` | copyable skeletons prove their value | `.example.md` suffix |
| `docs/archive/` | a human decides a doc is inactive | keeps original relative path |

When you create one of these, add its role to `docs/index.md` Directory Roles in the same change.

## Volume Partitioning (Year Subdirectories)

Timeliness directories grow at very different rates. Partition by year **only where the historical volume proves it matters** (adapted projects produced 300–1200+ files/year here):

| Directory | Partition | Trigger |
| --- | --- | --- |
| `docs/audits/` | `{year}/` from the start (`docs/audits/2026/...`) | highest-volume record class |
| `docs/logs/` | `{year}/` from the start (established) | daily files accumulate fast |
| `docs/testing/` | `{year}/` when created | follows the logs pattern |
| `docs/bugs/` | flat until ~100 notes, then migrate into `{year}/` (by note date) | identity-referenced library; partition late |
| `docs/plans/` | per-roadmap subdirectories (established) | partition by roadmap, not by year |
| `docs/analysis/` `docs/lessons/` `docs/requirements/` | flat, no partition | topic/identity-referenced; low volume |

Rules: partition at creation time where mandated; migrate an existing flat directory in one mechanical move (update inbound references, run the doc-reference checker), never file-by-file. Do not invent deeper nesting (no `{year}/{month}/` for records — grep-ability dies; the only exception is logs' per-day files, which are already single-day units).

## Naming Conventions (Quick Copy Set)

```text
docs/logs/2026/05-21.md
docs/logs/2026/05-21-frontend-ui.md               # roadmap-scoped worktree log
docs/testing/2026/05-21.md
docs/discussions/2026-05-21-0900-user-management-scope.md
docs/analysis/2026-05-21-1030-auth-strategy-comparison.md
docs/audits/2026/2026-05-21-1410-document-audit-user-management.md
docs/roadmaps/frontend-ui-roadmap.md              # stable name — no date prefix (roadmapPath references it)
docs/plans/frontend-ui/2026-05-21-1530-user-list-plan.md
docs/requirements/2026-05-21-1100-order-refund-flow.md
docs/retrospectives/2026-05-21-1630-checkout-prototype-gap.md
docs/bugs/01-order-status-double-submit.md        # numbered library style
docs/bugs/2026-05-21-0000-login-token-loop.md     # dated style — either is fine, pick one per repo
```

Bug notes are timeliness but referenced by identity: numbered names if the library will grow, dated names otherwise. Roadmap files carry **no date prefix**: a roadmap is a living status surface referenced by stable paths (mission `roadmapPath`, plan `mission` frontmatter, AGENTS routing); its currency is carried by checkbox state, not by the filename.

## Archive

Files move to `docs/archive/` only by human decision, keeping their original relative path. AI agents never archive automatically; when a referenced file is missing, check `docs/archive/` before concluding it does not exist.

## Upgrading From The v1 Layout

Projects copied from the pre-v2 template (with `docs/backlog/`, `docs/process/`, `00-*-guide.md` files, and a default-installed engine) migrate as follows:

| v1 | v2 |
| --- | --- |
| `docs/backlog/<slug>-roadmap.md` | `docs/roadmaps/<slug>-roadmap.md` |
| plan files flat in `docs/plans/` | per-roadmap dirs `docs/plans/<slug>/` |
| `docs/process/*` + `00-*-guide.md` in each dir | consolidated under `docs/guides/` |
| `docs/context/{conventions,source-of-truth-and-precedence}.md` | absorbed into this guide |
| `docs/references/document-naming-and-timeliness.md` | absorbed into this guide | <!-- doc-ref: example reason="old layout path, not a current link" -->
| `.opencode/skills/` (or other tool dirs) | canonical home is `.agents/skills/` |
| engine via sibling-checkout `MISSION_DRIVER_HOME` | vendor the engine copy (`docs/guides/mission-driver-add-on.md`) |

Move (don't copy) the files; keep git history. Old cross-references break silently — run the doc-reference checker after the move and fix what it reports. Status-table roadmaps convert to column-0 checkbox milestone blocks per `docs/guides/roadmap-authoring.md`.

## Workspace Hygiene

- The only sanctioned scratch directory is `_tmp/` (gitignored). Do not create `tmp/`, `.tmp/`, or root-level scratch files; do not leave crash logs or generated data files at the repo root.
- One-off scripts used by a change live in the plan directory or `_tmp/`, never at the root.
