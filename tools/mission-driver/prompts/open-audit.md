Read `{{openAuditPrompt}}` **completely** and follow it precisely.

Perform an open-ended adversarial audit on mission `{{missionName}}`. Probe `{{moduleDir}}/` — read code, config, tests, and docs **completely** — for contract drift, dead code, missing error handling, framework-specific anti-patterns, and convention violations per `AGENTS.md` (read it **completely** too).

## Record conclusions to a dedicated audit directory (per-round subfolder with classified files)

Write the audit record to **`{{auditsDir}}/<TIMESTAMP>-open-audit-r<round>/`** (this matches the engine's default auditsDir convention; see `references/mission-config-schema.md §prompts field and audit steps`).

### Directory layout

```
{{auditsDir}}/<TIMESTAMP>-open-audit-r<round>/
├── 00-README.md          # index: ID, audit object, method, exec line, top-line verdict, pointer to roadmap receipt
├── 01-summary.md         # verification gate + findings top-line (P-rank ordered) + clean-surface summary
├── 02-finding-<WI-id>.md # one file per P0/P1 finding (02-, 03-, ... if multiple); skip if no findings
└── 03-pattern-classes.md # adversarial probe summary grouped by failure-pattern class (omitted if no findings)
```

`<TIMESTAMP>` = the `TIMESTAMP` shell var (e.g. `2026-09-08-152059`). `<round>` = next round number (read `audit-rounds` from `{{roadmapPath}}` frontmatter, add 1).

Classify files **only as needed** — don't over-split. A clean round needs only `00-README.md` + `01-summary.md`. A round with multiple P1 findings adds one `02-finding-<WI-id>.md` per finding.

### Required contents per file

**`00-README.md`** — short index. Frontmatter-style header block:
```
> Audit Status: open
> Audit Type: open-ended
> Mission: <missionName>
> Round: <round>
> ID: #audit-<runId>-<roadmap>-<round>-<nonce8hex>
> Models: exec:<exec-model>, aud:<aud-model>
```
Then: a `## 子文件索引` table, a `## 总体裁决` line, and a `## 路线图指针` block pointing back to the dispatch/accepted receipt pair appended in `{{roadmapPath}}`.

**`01-summary.md`** — verification gate + ordered P-rank findings list (one paragraph each: 现象 / 触发条件 / 修复方向) + clean-surface summary if any.

**`02-finding-<WI-id>.md`** — one per P0/P1 finding. Sections: 摘要 / 触发路径 / 影响面 / 修复方向 / 路由建议.

**`03-pattern-classes.md`** — adversarial probe summary grouped by failure-pattern class (e.g. 同族裸异常外逸 / 同族悬空引用 / 同族 EPL 漂移). Useful when the same root cause produces multiple findings; omit if no findings.

### Roadmap ledger entry (single-line pointers, not findings)

In `{{roadmapPath}}`, **only** increment the counter and append the dispatch/accepted receipt pair as single-line pointers to the audit directory:

1. Frontmatter: `audit-rounds: <n>` → `audit-rounds: <n+1>`.
2. Append two lines to `## Deep Audit Record` (create if absent):
```
- dispatch audit #audit-<runId>-<roadmap>-<round>-<nonce8hex> to <your-session-id> models={exec:<exec-model>,aud:<aud-model>}
- accepted #audit-<runId>-<roadmap>-<round>-<same-nonce8hex> findings=none|items → {{auditsDir}}/<TIMESTAMP>-open-audit-r<round>/00-README.md
```

3. Findings as work items in the roadmap (the closing mechanism is the checkbox, not the audit file): every `P0`/`P1` finding lands as a NEW unchecked work item (column-0 `- [ ]`) under the owning milestone block (or a trailing `### M<n> — Deep Audit Findings R<round>` block if none fits), tagged `[P0]`/`[P1]` with a one-line justification + a pointer `(详细论证 → <path-to-02-finding>)`. `P2` findings go to the roadmap's `## Follow-up Backlog` section (create if absent), each with `source: deep-audit round <n>`. Remediation plans are drafted from these roadmap items by the DRAFT pipeline — do not draft plans yourself here.

The full finding evidence lives in the per-round subfolder, not in the roadmap. Keep the roadmap entry short (≤2 lines per finding).

On the dispatch line, append the ` models={exec:…,aud:…}` lineage suffix (02-rule-law §4.1): `exec:` = the agent/model that executed the audited work, `aud:` = your own agent/model (identical pairs are the declared single-model downgrade — record them honestly, never omit the suffix's shape).

`findings=none` when clean; `findings=items` when you found anything.

## Priority every finding — `[P0]` / `[P1]` / `[P2]`

Prefix EVERY finding with a priority tag and one-line justification:

- **`[P0]`** — blocking: contract break, incorrect behavior, data loss, security, failing/absent test for changed behavior. MUST be fixed.
- **`[P1]`** — material: a real defect or contract drift that should be fixed but is not blocking. MUST be fixed.
- **`[P2]`** — trivial / non-blocking polish: doc line-number rot, wording, naming consistency, dead-comment nits. Record it, but it does NOT by itself warrant a remediation plan.

Downstream, only `P0`+`P1` findings drive remediation-plan drafting; `P2`-only rounds are triaged to the follow-up backlog without a plan. Do not inflate a cosmetic nit to `P1`.

Your output MUST end with exactly one `<AI_STEP_RESULT>` marker:
- Any finding at all (`P0`/`P1`/`P2`): `<AI_STEP_RESULT>issues</AI_STEP_RESULT>`
- Clean (no finding of any priority): `<AI_STEP_RESULT>clean</AI_STEP_RESULT>`
