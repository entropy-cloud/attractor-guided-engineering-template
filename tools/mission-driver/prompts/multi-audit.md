Read `{{multiAuditPrompt}}` **completely** and follow it precisely.

Perform a multi-dimensional audit on mission `{{missionName}}`. Focus on `{{moduleDir}}/` — code, config, tests, and public contracts (exports, API surface). Cross-reference against architecture docs for documented contract drift.

## Record conclusions to a dedicated audit directory (per-round subfolder with classified files)

Write the audit record to **`{{auditsDir}}/<TIMESTAMP>-multi-audit-r<round>/`** (this matches the engine's default auditsDir convention; see `references/mission-config-schema.md §prompts field and audit steps`).

### Directory layout

```
{{auditsDir}}/<TIMESTAMP>-multi-audit-r<round>/
├── 00-README.md          # index: ID, audit object, method, exec line, top-line verdict, pointer to roadmap receipt
├── 01-summary.md         # verification gate + clean-surface summary + per-finding top-line
├── 02-finding-<WI-id>.md # one file per P0/P1 finding (02-, 03-, ... if multiple); skip if no findings
└── 03-dimensions.md      # per-dimension verdict table (default 7 + project-specific N), one row per dimension
```

`<TIMESTAMP>` = the `TIMESTAMP` shell var (e.g. `2026-09-08-152059`). `<round>` = next round number (read `audit-rounds` from `{{roadmapPath}}` frontmatter, add 1).

Classify files **only as needed** — don't over-split. A clean round needs only `00-README.md` + `01-summary.md` (still required) + a short `03-dimensions.md`. A round with multiple P1 findings adds one `02-finding-<WI-id>.md` per finding.

### Required contents per file

**`00-README.md`** — short index. Frontmatter-style header block:
```
> Audit Status: open
> Audit Type: multi-dimensional
> Mission: <missionName>
> Round: <round>
> ID: #audit-<runId>-<roadmap>-<round>-<nonce8hex>
> Models: exec:<exec-model>, aud:<aud-model>
```
Then: a `## 子文件索引` table (file → topic → status), a `## 总体裁决` line (`passes multi-dimensional audit` / `needs revision` with P×N summary), and a `## 路线图指针` block that points back to the dispatch/accepted receipt pair appended in `{{roadmapPath}}`.

**`01-summary.md`** — verification gate (which command(s), exit status, test count) + clean-surface bullet list (one block per audited clean surface; cite file:line evidence).

**`02-finding-<WI-id>.md`** — one per P0/P1 finding. Sections: 摘要 / 触发路径 / 影响面 / 修复方向 / 路由建议. P2 findings can be listed in `01-summary.md` if they don't warrant a remediation plan.

**`03-dimensions.md`** — per-dimension verdict table (default 7 + project-specific N). One row per dimension, last column = verdict line (`无发现` / `<P-rank>: <WI-id>`). Add a `## 维度完整性自检` section that asserts each dimension was ruled on (no single-dimension narrowing).

### Roadmap ledger entry (single-line pointers, not findings)

In `{{roadmapPath}}`, **only** increment the counter and append the dispatch/accepted receipt pair as single-line pointers to the audit directory:

1. Frontmatter: `audit-rounds: <n>` → `audit-rounds: <n+1>`.
2. Append two lines to `## Deep Audit Record` (create if absent):
```
- dispatch audit #audit-<runId>-<roadmap>-<round>-<nonce8hex> to <your-session-id> models={exec:<exec-model>,aud:<aud-model>}
- accepted #audit-<runId>-<roadmap>-<round>-<same-nonce8hex> findings=none|items → {{auditsDir}}/<TIMESTAMP>-multi-audit-r<round>/00-README.md
```

3. Findings as work items in the roadmap (the closing mechanism is the checkbox, not the audit file): every `P0`/`P1` finding lands as a NEW unchecked work item (column-0 `- [ ]`) under the owning milestone block (or a trailing `### M<n> — Deep Audit Findings R<round>` block if none fits), tagged `[P0]`/`[P1]` with a one-line justification + a pointer `(详细论证 → <path-to-02-finding>)`. `P2` findings go to the roadmap's `## Follow-up Backlog` section (create if absent), each with `source: deep-audit round <n>`. Remediation plans are drafted from these roadmap items by the DRAFT pipeline — do not draft plans yourself here.

The full finding evidence lives in the per-round subfolder, not in the roadmap. Keep the roadmap entry short (≤2 lines per finding).

On the dispatch line, append the ` models={exec:…,aud:…}` lineage suffix (02-rule-law §4.1): `exec:` = the agent/model that executed the audited work, `aud:` = your own agent/model (identical pairs are the declared single-model downgrade — record them honestly, never omit the suffix's shape).

`findings=none` when clean; `findings=items` when you found anything.

## Priority every finding — `[P0]` / `[P1]` / `[P2]`

Prefix EVERY finding with a priority tag and one-line justification:

- **`[P0]`** — blocking: contract break, incorrect behavior, data loss, security, failing/absent test for changed behavior. MUST be fixed.
- **`[P1]`** — material: a real defect or contract drift that should be fixed but is not blocking. MUST be fixed.
- **`[P2]`** — trivial / non-blocking polish: doc line-number rot, wording, naming consistency, cosmetic nits. Record it, but it does NOT by itself warrant a remediation plan.

Downstream, only `P0`+`P1` findings drive remediation-plan drafting; `P2`-only rounds are triaged to the follow-up backlog without a plan. Do not inflate a cosmetic nit to `P1` — that is the exact behavior this grading prevents.

Your output MUST end with exactly one `<AI_STEP_RESULT>` marker:
- Any finding at all (`P0`/`P1`/`P2`): `<AI_STEP_RESULT>issues</AI_STEP_RESULT>`
- Clean (no finding of any priority): `<AI_STEP_RESULT>clean</AI_STEP_RESULT>`
