Read `{{openAuditPrompt}}` **completely** and follow it precisely.

Perform an open-ended adversarial audit on mission `{{missionName}}`. Probe `{{moduleDir}}/` — read code, config, tests, and docs **completely** — for contract drift, dead code, missing error handling, framework-specific anti-patterns, and convention violations per `AGENTS.md` (read it **completely** too).

## Record conclusions INLINE in the roadmap (single-file ledger — no external audit files)

Write your audit receipt into `{{roadmapPath}}` (create the section at the end of the file if absent; append-only once created):

1. Increment the roadmap frontmatter counter: `audit-rounds: <n>` → `audit-rounds: <n+1>` (this count is the mission's global Deep Audit round budget consumption).
2. Append two lines to `## Deep Audit Record` sharing one id (`<roadmap>` = roadmap filename stem without `.md`; generate a fresh 8-hex nonce):

```
- dispatch audit #audit-<runId>-<roadmap>-<round>-<nonce8hex> to <your-session-id> models={exec:<executing-agent-or-model>,aud:<auditing-agent-or-model>}
- accepted #audit-<runId>-<roadmap>-<round>-<same-nonce8hex> findings=none|items：结论
```

On the dispatch line, append the ` models={exec:…,aud:…}` lineage suffix (02-rule-law §4.1): `exec:` = the agent/model that executed the audited work, `aud:` = your own agent/model (identical pairs are the declared single-model downgrade — record them honestly, never omit the suffix's shape).

`findings=none` when clean; `findings=items` when you found anything.

3. Findings as work items (the closing mechanism is the checkbox, not an audit file): every `P0`/`P1` finding lands as a NEW unchecked work item (column-0 `- [ ]`) under the owning milestone block in the roadmap (or a trailing `### M<n> — Deep Audit Findings R<round>` block if none fits), tagged `[P0]`/`[P1]` with a one-line justification. `P2` findings go to the roadmap's `## Follow-up Backlog` section (create if absent), each with `source: deep-audit round <n>`. Remediation plans are drafted from these roadmap items by the DRAFT pipeline — do not draft plans yourself here.

Do NOT create files under `{{auditsDir}}/` — that location is reserved for pre-migration legacy archives (prose-only history since the legacy audit channel was retired in M2-WI22; no engine consumer) and rare human-authored records.

## Priority every finding — `[P0]` / `[P1]` / `[P2]`

Prefix EVERY finding with a priority tag and one-line justification:

- **`[P0]`** — blocking: contract break, incorrect behavior, data loss, security, failing/absent test for changed behavior. MUST be fixed.
- **`[P1]`** — material: a real defect or contract drift that should be fixed but is not blocking. MUST be fixed.
- **`[P2]`** — trivial / non-blocking polish: doc line-number rot, wording, naming consistency, dead-comment nits. Record it, but it does NOT by itself warrant a remediation plan.

Downstream, only `P0`+`P1` findings drive remediation-plan drafting; `P2`-only rounds are triaged to the follow-up backlog without a plan. Do not inflate a cosmetic nit to `P1`.

Your output MUST end with exactly one `<AI_STEP_RESULT>` marker:
- Any finding at all (`P0`/`P1`/`P2`): `<AI_STEP_RESULT>issues</AI_STEP_RESULT>`
- Clean (no finding of any priority): `<AI_STEP_RESULT>clean</AI_STEP_RESULT>`
