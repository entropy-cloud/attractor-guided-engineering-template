---
status: active
mission: age-autonomy-implementation
work-item: M1-WI45+WI46
group: "2026-08-27-1503"
verify: [test]
---

# 2026-08-27-1503-1 M1-WI45(+WI46) 清偿 missions/prompts/ 三覆盖遮蔽双模式内置 prompt + mission prompts map 键级修正

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M1 findings 块 WI45（deep-audit R3 P1：三份 pre-ledger 共享覆盖压制 M1-WI7/WI8 双模式内置）、WI46（deep-audit R4 P1：「prompts map 零消费面」事实错误更正 + 误删面排除）、Follow-up Backlog「`missions/age-autonomy-implementation.json` 的 `prompts` map 零消费面」条目（R4 更正注记在案，随本 plan 一并清偿）
> Related: 2026-08-25-0635-1（M1-WI7/WI8 双模式内置 prompt + 双读过渡交付）、2026-08-27-1203-1（WI40 Follow-up 清偿 + roadmap 回写纪律先例）

## Current Baseline

- 共享覆盖三件在库且为 pre-ledger 版本（止于 commit 5e90283，早于 M1）：`missions/prompts/execute.md` 指示对账本 plan 写 per-Phase `Status:` 行与 `> Plan Status: completed`（:13/:15）并关闭 `> Source Audits:`（:17）——与 01 §2「completed 为派生态禁写」及 legacy-plan-freeze deny 面直接冲突；`missions/prompts/closure-audit.md` 的 Mandatory structure 仅 legacy 形（:19-21）且零 ledger 回执/`## Verification` 路径，marker 示例还带大小写漂移（:33/:63 `<Ai_STEP_RESULT>`）；`missions/prompts/build-verify.md` 无「Ledger Verification pass lines」过渡期写者段（内置版 :72-94 在库）。
- 解析优先级链（mdr-fix-2，零改动面）：`flow-loader.js` `loadPrompt`（:234-245）按 `mission.promptsDir` → `missions/prompts/` → 内置 `TOOL_ROOT/prompts/` 兜底；主流程（`orchestrator.js` :586-589）与子流程（`flow-loader.js` `loadSubFlow` :304-314）同链。后果（R3 P1）：五个无 `promptsDir` 的 mission（age-autonomy-implementation / demo / dsh-plugin / mission-driver-draft-robustness / mission-driver-step-audit）的 EXECUTE / CLOSURE_AUDIT / BUILD_VERIFY live 运行 legacy-only 指令——age-autonomy 全程即如此（R3 以 `_tmp/2026-08-26-130203-mission-driver/oc-{EXECUTE,CLOSURE_AUDIT,BUILD_VERIFY}-*.log.prompt` 逐字证实）；本轮未致账本损坏靠 closureScriptCheck SCRIPT_CHECK_DETAILS 兜底（成活事实非设计保证）。
- 内置三件为双模式且维护中：`tools/mission-driver/prompts/execute.md`（:4-11 双模式步骤 + :10「Do NOT write `completed` anywhere」）、`closure-audit.md`（:24-27 ledger 结构路径 + :64-71 dispatch/accepted 回执协议）、`build-verify.md`（:72-94 pass 行写者 + computeBasisHash 共享命令）。删除共享覆盖后解析自然落内置，零代码改动。
- mission `prompts` map 键级消费面（R4 更正，live 证实）：`orchestrator.js` :614-615 读 `g.prompts?.multiAudit` / `g.prompts?.openAudit` 注入 vars `multiAuditPrompt` / `openAuditPrompt`（`context-map.mjs` :64-65/:97-98 双登记），`flows/deep-audit-loop.json` MULTI_AUDIT（:24 `when: "multiAuditPrompt != ''"`）/ OPEN_AUDIT（:37）以非空 var 为门 + 内置 `prompts/{multi,open}-audit.md` 首行注入路径指针——两键 live 消费，其余 7 键（draftFromRoadmap/planReview/execute/healthCheck/buildVerify/closureAudit/postmortem）零读点。若按 R3 Follow-up 字面整删 map：两 when 门恒 false → DEEP_AUDIT 对全 roadmap 静默空转（WI46 立案的误删面）。
- 仓库先例：三个姊妹 mission 的 map 恰为两 live 键（`mission-driver-step-audit.json` :12-15、`mission-driver-actionable-fixes.json` :13-16、`mission-driver-draft-robustness.json` :12-15，值指向 `docs/skills/*.md`）；`age-autonomy-implementation.json` :17-27 独携 9 键（7 dead + 2 live，live 键值指向内置 wrapper 文件——指针形态与姊妹不同但为 live 行为面，R3/R4 DAR 回执证明该通道工作）。demo / dsh-plugin / base 无 map 无 promptsDir。
- `missions/actionable-fixes-prompts/execute.md` 为 mission 级 `promptsDir` 显式覆盖（mdr-fix-2 #2 自身交付面），服务 legacy plan 语料、指令与语料格式一致——非 R3 缺陷面，不在本 plan 范围。
- `tools/mission-driver/test/prompts-dir.test.js` 为 fixture 面优先级链测试（:4 注释），不依赖 live `missions/prompts/` 文件存在——删除共享覆盖不触碰链代码与该测试。
- 验证基线（R4 复核在案）：引擎 961/0、插件 420/0、真值表 116/0、verify-age L1+L2+L2.5 GREEN、mission-check/plan-check --strict/gate-check exit 0。
- roadmap 计数域现状：列 0 未勾恰 WI45/WI46 两行（`grep -c "^- \[ \]"` = 2）；Follow-up Backlog 5 条未勾均缩进 2 格（机器计数域与 WI40 grep 门之外）；两 WI 勾选后 grep 复归 0。roadmap 写回纪律：`roadmap-write-guard` 允许已注册 WI 行 `[ ]→[x]` 翻转 + 行内尾部证据注记；Follow-up Backlog 行不在 milestone/WI 比对域（清偿编辑合法，1203-1 :22 先例）。
- 自指闭环注记：本 plan 由 age-autonomy mission 执行——EXECUTE 删除共享覆盖后，同 run 的 CLOSURE_AUDIT/BUILD_VERIFY（含本 plan 自身收口）即解析内置双模式 prompt，修复对当轮生效（子流程每次执行重新解析）。

## Goals

- 五个无 `promptsDir` mission 的 plan-execution 子流程（EXECUTE/CLOSURE_AUDIT/BUILD_VERIFY）live 解析到 M1 双模式内置 prompt，共享目录不再以 pre-ledger 版本遮蔽（WI45 修法落地）。
- `missions/age-autonomy-implementation.json` 的 `prompts` map 修正为恰两 live 键（multiAudit/openAudit，值不动——与姊妹 mission 先例同构的键域），DEEP_AUDIT 审计通道行为零变化（WI46 键级修正落地）。
- 防再漂移守卫测试钉住两面：共享目录不得再遮蔽 plan-execution 三 prompt；mission prompts map 键域 ⊆ 两 live 键 + 两键引用路径存在 + when 门/var 耦合在库。
- R3 Follow-up「prompts map 零消费面」条目按 R4 更正语义清偿（保留更正注记 + 删除线 + 证据指针）；WI45/WI46 勾选 + 行内证据回写；计数域 grep 复归 0。

## Non-Goals

- 不新增 roadmap work item（roadmap guide 禁 AI 发明 WI；Follow-up 条目清偿收编进本 plan，1203-1 先例）。
- 零引擎代码 diff：`flow-loader.js`/`orchestrator.js`/`config.js`/`engine.js` 零触碰（`git diff --stat` 为空）；引擎行为变化仅限 prompt 文件解析结果；零新增 npm 依赖。
- 不动 `missions/actionable-fixes-prompts/`（mission 级显式覆盖、legacy 语料一致——R3 发现明示排除）。
- 不改两 live 键取值形态（age-autonomy 指向内置 wrapper 文件 vs 姊妹指向 docs/skills——改值即改 live 审计行为，超出键级修正范围；重开触发：deep-audit 轮审计方法面出现可归因于取值形态的质量问题）。
- 不给 demo/dsh-plugin 补 prompts map（无 map = when 门空串直通 done，为其现状设计；重开触发：该两 mission 再入 deep-audit 轮且需要 multi/open 审计）。
- 不处理 R4 其余四条 P2 Follow-up（checkRoadmapUniqueness extends 面 / ghost run 目录 / monitor readFileSync 竞态 / 文档行级漂移三连）——非本 plan 结果面，留待后续轮次。
- 不裁定 mission 完成态（engine 按 audit 轮数决定；本 plan 只交付 WI45/WI46）。

## Task Route

- Type: `implementation-only change`（文件删除 + 配置键级修正 + 守卫测试）+ roadmap 回写
- Owner Docs: roadmap M1 findings 块 WI45/WI46、`tools/mission-driver/CONTEXT.md`（Mission 配置系统段 + 验证命令）、`docs/plans/00-plan-authoring-and-execution-guide.md`、`docs/backlog/00-roadmap-authoring-guide.md`（write-back 纪律）、`docs/design/age-autonomy/01-file-ledger.md` §2（completed 派生禁写——冲突指令的裁定依据）
- Skill Selection Basis: 默认审计 prompt 是引擎派发面的工作方法，非本 plan 起草/执行方法；修法与守卫测试无匹配 skill——Skill: none（逐 Phase 标注）

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（无端口/env/外部服务依赖；验证命令全部在库）。

## Phase 1 — 修法落地：删除共享三覆盖 + prompts map 键级修正 + 防再漂移守卫

Targets: `missions/prompts/{execute,closure-audit,build-verify}.md`（删除）、`missions/age-autonomy-implementation.json`、`tools/mission-driver/test/prompt-shadow-guard.test.js`（新增）、`tools/mission-driver/CONTEXT.md`
Skill: none

- Item Types: `Decision | Fix | Add | Proof`
- Prereqs: 无（M1 findings WI 无阶段依赖）

- [x] Decision: WI45 修法三选一裁定 = **① 删除三共享覆盖，回落内置双模式**。理由：三覆盖无存量正当性（pre-ledger 遗留、指令与执法门禁矛盾、修正自身的执行也会继续吃到矛盾指令）；链代码兜底分支在库（文件缺席即落内置），零代码改动。备选否决：② 刷新三覆盖至与内置逐字节对齐——永久双维护负债，R3 漂移正是「副本存在且腐化」形态的产物，守卫下安全性等同①但纯开销；③ ledger-era mission 显式 `promptsDir`——promptsDir 语义是覆盖目录、无法「指向内置」而不复制，逐 mission 配置面扩大且共享陷阱对后续 mission 留存。残险 = 共享目录对其他 prompt 名（health-check 等）的遮蔽能力仍在（mdr-fix-2 合法能力面）——守卫测试钉住 plan-execution 三名不再被遮蔽即止损边界。WI46 键级裁定 = 删 7 dead 键、保留 multiAudit/openAudit 且值不动（live 消费面唯一正确处置；整删即 DEEP_AUDIT 静默空转——R4 立案面）。
- [x] Fix: 删除 `missions/prompts/execute.md`、`missions/prompts/closure-audit.md`、`missions/prompts/build-verify.md`（目录随空自然消失；五个无 promptsDir mission 的 plan-execution 子流程即时回落内置双模式）。
- [x] Fix: `missions/age-autonomy-implementation.json` `prompts` map 9 键 → 恰 `{multiAudit, openAudit}`（两键值逐字不动；7 dead 键删除——键域与三姊妹 mission 先例同构）。
- [x] Add: 守卫测试 `tools/mission-driver/test/prompt-shadow-guard.test.js`（live 语料断言，ledger-corpus.test.js 先例）——① 共享遮蔽缺席钉住：`flows/plan-execution.json` 全步 `promptPath` 派生 basename 集 ∩ `missions/prompts/` 现存文件 = ∅（三名被共享目录再遮蔽即红）② prompts map 键域钉住：`missions/*.json`（排除 base*.json）凡携 `prompts` map → keys ⊆ {multiAudit, openAudit}（dead 键回流即红）③ 两 live 键引用路径在 projectRoot 下存在（dangling 即红）④ live 消费耦合钉住：`flows/deep-audit-loop.json` 存在 when 含 `multiAuditPrompt != ''` 与 `openAuditPrompt != ''` 的步（删 map / 删 when 门两面回溯均可见——WI46 误删面反向断言）⑤ 内置双模式标记钉住：内置三件含 ledger 关键指令片段（execute「Do NOT write `completed` anywhere」/ closure-audit「NEVER write `completed`」+ 回执协议段 / build-verify「Ledger Verification pass lines」段）——内置侧退化 legacy-only 即红。
- [x] Add: `tools/mission-driver/CONTEXT.md` Mission 配置系统段增量句：共享 `missions/prompts/` 覆盖已删除（plan-execution prompt 解析内置双模式，守卫测试钉住三名不可再遮蔽）；`prompts` map 仅 multiAudit/openAudit 两键为 live 消费面。
- [x] Proof: `pnpm --prefix tools/mission-driver test` → 0 失败（含新守卫测试；相对 961 基线只增不减）+ `node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0（键级修正后 mission 合法）+ `pnpm --prefix tools/mission-driver run lint:prompts` 绿 + `node tools/mission-driver/src/gate-check.mjs <本 plan 文件>` exit 0（自指一致 + work-item M1-WI45+WI46 对账 ok）。

Exit Criteria:

- [x] `missions/prompts/` 三文件不存在且五个无 promptsDir mission 的 plan-execution 解析落内置（守卫断言①在案）；prompts map 键域 = {multiAudit, openAudit}（断言②③在案）
- [x] `git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/src/flow-loader.js tools/mission-driver/src/orchestrator.js tools/mission-driver/src/config.js` 为空 + 零新增 npm 依赖
- [x] 守卫测试五断言面全绿纳入套件；CONTEXT.md 增量在册
- [x] `docs/logs/2026/08-27.md` updated

## Phase 2 — roadmap / Follow-up 回写与证明

Targets: `docs/backlog/age-autonomy-implementation-roadmap.md`（WI45/WI46 行 + Follow-up 条目 + `> Last Updated` 头）、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] Add: Follow-up Backlog「`missions/age-autonomy-implementation.json` 的 `prompts` map 字段零消费面」条目清偿——`[ ]`→`[x]` + 删除线包裹原「零消费面」断言文本 + 已清偿注记（指针本 plan；R4 更正注记原样保留为历史；:169-175 先例形态）。更正语义落实 = 条目闭包以「键级修正（7 dead 删 / 2 live 留）」为结论，非「整删 map」。
- [x] Add: roadmap WI45 行 `[ ]`→`[x]` + 行内尾部证据注记（修法裁定 + 删除三覆盖 + 守卫测试指针本 plan）；WI46 行同构回写（Follow-up 更正清偿 + 误删面守卫断言④指针）；`> Last Updated` 头同步本批事实。
- [x] Add: `docs/logs/2026/08-27.md` 条目（修法摘要 + 验证结果）。
- [x] Proof: 勾选后 `grep -c "^- \[ \]" docs/backlog/age-autonomy-implementation-roadmap.md` → 0 实测（Follow-up 缩进行不在计数域——grep 0 ≠ Follow-up 全清，R4 余四条 P2 仍在册）；`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/age-autonomy-implementation-roadmap.md` exit 0。

Exit Criteria:

- [x] WI45/WI46 `[x]` + 行内证据 + Follow-up 条目清偿 + Last Updated 同步在册；勾选后 grep → 0 实测
- [x] `docs/logs/2026/08-27.md` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-1503-1-m1-wi45-wi46-shared-prompt-override-fix-1-8c3f61a9 to ses_reviewer_2026-08-27-1503
- 2026-08-27：iteration 1，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-1503-1-m1-wi45-wi46-shared-prompt-override-fix-1-8c3f61a9（独立冷验证：共享三覆盖在库且逐行相符——execute.md :13 per-Phase `Status:` 写入指令/:15 `Plan Status`→completed/:17 `> Source Audits:`、closure-audit.md :19-21 legacy-only Mandatory structure + `<Ai_STEP_RESULT>` 大小写漂移实测 :33/:63、build-verify.md 全文无 ledger pass 行写者段；优先级链 flow-loader.js loadPrompt :234-245 / loadSubFlow :304-314、orchestrator.js :586-589 projectPromptDirs + :614-615 multiAudit/openAudit vars 行号实测相符；deep-audit-loop.json when 门 :24/:37 + context-map.mjs 双登记 :64-65/:97-98 相符；内置三件双模式标记（execute :4-11 + :10「Do NOT write completed anywhere」/ closure-audit :24-27 + :64-71 回执协议 / build-verify :72-94 pass 行写者）在库；三姊妹 mission map 恰 {multiAudit,openAudit}（step-audit :12-15 / actionable-fixes :13-16 / draft-robustness :12-15）、age-autonomy :17-27 独携 9 键、demo/dsh-plugin/base 无 map、promptsDir 仅 actionable-fixes 携带——「五个无 promptsDir mission」清点相符；`missions/actionable-fixes-prompts/execute.md` 在库（Non-Goal 排除面成立）；prompts-dir.test.js 头注+实现均为 mkdtemp fixture 零 live 依赖；roadmap `grep -c "^- \[ \]"` = 2 实测、Follow-up 5 条未勾均缩进 2 格在计数域外、:176 待清偿条目在册；plan-execution.json promptPath 恰三名（守卫断言①可行）；multi/open-audit.md 首行 `{{…Prompt}}` 注入指针 + docs/skills 两 skill 文件存在（断言③可行）；删三覆盖后 existsSync 逐文件兜底落内置（loadPrompt :244）零代码改动成立、两 live 键保留则 when 门行为零变化；gate-check 本 plan exit 0 decision=allow 且 workItem M1-WI45+WI46 展开-注册对账 ok；格式合规（checkbox 仅两 Phase 区列 0、无 `> Plan Status:`/per-Phase `Status:`/`## Closure Gates`、verify ⊆ mission commands、无禁用词、Non-Goal 延后项均带重开触发条件）；WI45 三选一裁定含理由+否决备选+残险、WI46 更正语义+误删面排除+键级钉住齐备，无范围走私或缺口）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=19e320d62f60893508ba3b1c2a79a79a7a9f12278b3d99faf3280dbf7a5c3e8d exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-27-1503-1-m1-wi45-wi46-shared-prompt-override-fix-1-a27b8433 to ses_auditor_2026-08-27-1503
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-27-1503-1-m1-wi45-wi46-shared-prompt-override-fix-1-a27b8433：独立收口审计通过（16/16 项逐项对 live repo 冷验证）。WI45：`missions/prompts/` 目录不存在（三覆盖 git rm，目录随空消失）——plan-execution 解析回落内置双模式（守卫断言①钉住）；WI46：`missions/age-autonomy-implementation.json` prompts map 恰 `{multiAudit, openAudit}` 两键、值逐字未动（mission-check valid exit 0），deep-audit-loop when 门耦合由守卫断言④反向钉住。防再漂移守卫 `test/prompt-shadow-guard.test.js` 真实在跑（单文件 7/0，套件 961→969/0 只增不减）。零引擎 diff（四源码文件 `git diff --stat` 空）+ 零新增 npm 依赖（两 package.json 零触碰）。回写在案：CONTEXT.md Mission 配置系统段增量句、roadmap WI45/WI46 `[x]` + 行内证据 + Follow-up 条目删除线清偿（R4 更正注记保留）+ Last Updated 头同步、`docs/logs/2026/08-27.md` 两 Phase 条目。机械验证复跑全绿：test 969/0 exit 0 + mission-check exit 0 + lint:prompts OK + roadmap-check exit 0 + gate-check 自指 exit 0 + 勾选后 roadmap `grep -c "^- \[ \]"` → 0 实测。无Deferred 遮蔽：Non-Goals 四项 R4 P2 均带归属与重开触发，非活缺陷藏匿。
