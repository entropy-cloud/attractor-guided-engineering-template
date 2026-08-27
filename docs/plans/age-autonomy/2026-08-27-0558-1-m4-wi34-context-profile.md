---
status: active
mission: age-autonomy-implementation
work-item: M4-WI34
group: "2026-08-27-0558"
verify: [test, verify-age]
---

# 2026-08-27-0558-1 M4 上下文画像 context-profile（age-autonomy M4-WI34）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI34；`docs/design/age-autonomy/04-efficiency.md` §4/§5
> Related: 2026-08-27-0433-3（M4-WI33 assembler——Deferred「画像 top-N 取材」由本 plan 收编）、2026-08-27-0558-3（M4-WI36 门：context-profile.test.mjs ≥8 例）

## Current Baseline

- 设计契约（04 §4）：工件 `docs/references/context-profile.json`（项目所有、进 git、schema 版本化；**不进 `missions/`**——该目录被 mission scanner 当 mission 配置扫描，非 mission JSON 污染 `--list-missions` 与 monitor 配置面）；数据源 = child session 事件（工具调用）、run-state 步骤产物、Reflexion 记忆；挖掘 = run 终态后统计读频表 → 更新画像；首启由 AGENTS.md「Read This First」清单种子化；消费 = 组装器 fixedPrefix 按画像取 top-N 稳定文件、按角色经 DSL 覆盖；防抖 = 画像更新带停滞/振荡检测（无进展不刷）。
- 工件落点：`docs/references/` 已在（5 文件含 README）——画像为该目录新 JSON，非新目录；`plugin/dsh/src/efficiency/` 现有 `agent-pool.ts` + `prompt-assembler.ts`（M4-WI32/33），画像模块为效率层第三件。
- 消费面在库：`prompt-assembler.ts` `resolveAssemblyBlocks`（text/file/dir 三 kind，经 `resolvePolicyPlaceholders` 解析 `{{projectRoot}}`/`{{plansDir}}`/`{{roadmapPath}}`）+ `charterHashesOf`/`charterHashesDiffer`；fixedPrefix 块 schema 在 `law-policy.mjs`（`{kind: text|file|dir, ref, maxFileBytes?}`，M2-WI13 落地、M4-WI33 live 消费）——今日无 `profile` kind、无画像数据。
- 挖掘触发点在库：`watchdog.ts` `emitTerminalEvent`（:330）/`setTerminal`（:368）run 终态事件链（M3-WI27/28 交付，A8 尽力投递）；活动信号面 `noteActivity`（:226/:714）。
- 数据源可达性分层：DSH 形态子代理句柄经 agents face（`PoolAgentsFace` 声明面 = create/get 返回 `{id, followup}`，agent-pool.ts :80——face 本身不暴露事件流）；会话事件流可达性先例 = native-executor 句柄 `agent.session?.events`（native-executor.ts :706/:713，现消费 assistant/message 事件）——工具调用事件 schema（event type + 文件参数提取）无在库消费者，实现期以 live 探针钉住；run-state 步骤产物 = `_tmp/<runDir>/run-state.json`（steps[] 含 logFile/promptFile/sessionId，两形态在盘）；Reflexion 记忆 = `tools/mission-driver/memory/`（`_index.md`/`lessons.md`/`runs.md`，`--analyze-run` 产物）。
- 种子源在库：AGENTS.md「Read This First」清单（project-context / ai-autonomy-policy / codebase-map / active requirement / active owner doc 五行，路径以 code span 或裸相对路径书写）。
- law 面：JSON 工件非 plan 形 .md（path-guardrail 域外）、非 P8 保护路径集、非完成证据面（效率缓存非状态权威，P2 同源）——画像写入不经 law 门禁；写盘纪律 = 防抖 + 原子写（git churn 控制）。
- WI36 门下限：`plugin/dsh/test/context-profile.test.mjs` ≥8 例（种子化 / run 终态挖掘 / 防抖 / schema 版本 / 不进 missions/）；插件测试链 = `node --test test/*.test.mjs`（`pnpm --prefix plugin/dsh test` 串 manifest/tsc/bundle/smoke）。
- 底线：零 `engine.js` diff、零新增 npm 依赖；`law-policy.mjs`（tools 副本）非保护路径（0433-3 先例），`missions/autonomy.policy.yml` 为保护路径（本 plan active = 合法例外先例沿袭）。

## Goals

- 交付 `plugin/dsh/src/efficiency/context-profile.ts`：schema 版本化读写（v1）+ AGENTS.md「Read This First」种子化 + 读频归并（纯函数、可注入 io/clock、确定性可测）。
- 交付 run 终态挖掘接线（watchdog 终态沿 → 采集 → 归并 → 防抖 → 原子落盘，fail-soft）与消费接线（fixedPrefix `kind: profile` 块 → top-N 稳定文件展开；角色显式 DSL 声明优先）。
- `plugin/dsh/test/context-profile.test.mjs` ≥8 例全绿；roadmap WI34 勾选。

## Non-Goals

- 不做 token 收益观测（终审 P2-4 归 WI36 观测面，不阻断）；不做独立形态降级（归 0558-2/WI35）。
- 不改账本/law/完成语义；画像不接 law 门禁（非证据面）；不把画像工件放进 `missions/`（04 §4 scanner 污染）。
- 不做跨项目画像共享与画像历史版本管理（工件单份 in-place 更新 + git 历史即回溯面）。
- 零 `engine.js` diff、零新增 npm 依赖。

## Task Route

- Type: `implementation-only change`（设计基线已批准 2026-08-24，落地 04 §4）
- Owner Docs: `docs/design/age-autonomy/04-efficiency.md` §4/§5、`docs/design/age-autonomy/02-rule-law.md` §3（fixedPrefix 块 schema 扩展点）
- Skill Selection Basis: `docs/skills/` 现有条目均为审计 prompt 模板（引擎审计步消费），非本工作方法——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Phase 1 — 画像模块纯函数 + schema 版本化 + 种子化

Targets: `plugin/dsh/src/efficiency/context-profile.ts`、`tools/mission-driver/src/law-policy.mjs`（fixedPrefix 块 schema 扩展）、`missions/autonomy.policy.yml`
Skill: none

- Item Types: `Add | Decision`
- Prereqs: 无硬依赖（建议在 M4-WI33 之后执行——消费面 `resolveAssemblyBlocks` 在库）

- [x] Add: 工件 schema v1——`{ version: 1, seededFrom, updatedAt, entries: [{ path, reads, lastSeenAt }] }`；`loadProfile`（工件缺失 = 未初始化 → 种子化路径；未知 version = 显式不可用注记 + 保守重建（重新种子化），不静默沿用旧结构）；`saveProfile` = 确定性序列化（entries 按 path 排序、字段序固定、尾换行规整）+ tmp+rename 原子写（writer.ts 先例）。
- [x] Add: 种子化 `seedFromReadFirst(text)`——解析 AGENTS.md「Read This First」清单行提取文件路径（repo-root 相对）为初始 entries（reads=0、来源标记 seededFrom）；仅直接路径行入 entries（清单含「listed in project-context.md」类间接引用行——间接面经该文件自身嵌入覆盖，不重复入表）；首启（工件不存在）自动种子化。
- [x] Add: 读频归并 `mergeReads(profile, tally, now)`——tally = path → count 映射；reads 累加、lastSeenAt 刷新；路径归一（projectRoot 前缀剥离）。
- [x] Add: `law-policy.mjs` fixedPrefix 块 schema 增第四 kind `profile`（`{kind: profile, ref: <画像工件路径>, topN?}`——ref 沿用既有占位解析链；tools+assets 双副本经 build-bundle 同步，`--check` 机器执法）+ `missions/autonomy.policy.yml` 增量块（drafter fixedPrefix 追加 profile 块；P8 例外 = 本 plan active 先例沿袭）。
- [x] Decision: topN 缺省值 = 5（04 §4 未定数值；种子清单 5 行同量级；过深 top-N 稀释 charter 前缀稳定性且嵌入成本线性涨）。备选 3/8——3 过浅（种子清单即溢出）、8 过深（首启即嵌 8 文件）；残险 = 无（DSL `topN` 可逐 agent 覆盖，非硬约定）。

Exit Criteria:

- [x] 纯函数确定性：同输入两次 `saveProfile` 序列化字节恒等（测试钉住）；未知 version 保守重建分支在案
- [x] `node tools/mission-driver/src/gate-check.mjs --policy missions/autonomy.policy.yml` exit 0（profile kind 过 schema）
- [x] `pnpm --prefix plugin/dsh test` 全绿（manifest/tsc/bundle/smoke 链）

## Phase 2 — 挖掘接线 + 消费接线

Targets: `plugin/dsh/src/efficiency/context-profile.ts`、`plugin/dsh/src/supervisor/watchdog.ts`、`plugin/dsh/src/efficiency/prompt-assembler.ts`、`plugin/dsh/src/efficiency/agent-pool.ts`（池成员句柄事件面——采集器读成员会话事件如需句柄透出则在此扩展，零语义改动）
Skill: none

- Item Types: `Add | Decision`
- Prereqs: Phase 1

- [x] Add: 挖掘采集面——DSH 形态 = 子代理会话事件归集为 tally（工具调用事件 × 文件参数路径计数，read/grep/glob 类；事件 schema 以 live 探针钉住——native-executor `agent.session?.events` 先例形态，无在库工具调用消费者可抄）；agents face 缺席（headless）= 显式降级注记、保留种子表不挖掘（独立形态完整面归 0558-2/WI35 裁定）；run-state 步骤产物与 Reflexion `memory/runs.md` 为辅助信号源——**在场则并入 tally**（缺面 fail-soft 注记，非可选：04 §4 数据源三分层各有消费面）。
- [x] Add: run 终态接线——watchdog 终态沿（`setTerminal`/`emitTerminalEvent` 既有链）末端触发一次挖掘（单飞守卫复用；mission 终态停派优先级保持；fail-soft——采集/归并/写盘任一异常不影响终态回执与停派）。
- [x] Decision: 防抖语义裁定——「无进展不刷」= 空 tally 不写盘 ∨ top-N 集（按生效 topN 截断的 path 集）不变不写盘；「振荡检测」= 集等价判定天然抑制进出振荡（集内 rank 波动不触发写盘）。备选 = 权重阈值触发（reads delta ≥ X% 才写）——否决：引入调参面且 git churn 收益不明确；残险 = 集内 rank 漂移长期不落盘（可接受——消费面只按集取材，rank 漂移不改 top-N 集即不改取材）。
- [x] Add: 消费接线——`resolveAssemblyBlocks` 增 `kind: profile` 展开：读工件 → top-N 稳定文件（reads 降序、同 reads 按 path 字典序）逐文件展开为 file 块（复用 embedStamp/maxFileBytes/hash 台账语义——CONTINUE 模式未变文件照常 dedup 跳过）；工件缺失/未知 version/条目文件缺失 = 显式 note 不崩溃（fail-soft 同 assembler 纪律）。
- [x] Add: 角色覆盖优先钉住——agent 显式 fixedPrefix 声明（text/file/dir）逐字节优先；`kind: profile` 仅在显式声明处生效；未声明部署薄指针 prompt 逐字节不变（向后兼容钉住，0433-3 先例沿袭）。

Exit Criteria:

- [x] watchdog 终态沿挖掘 fail-soft：采集异常不影响终态回执与停派（测试钉住）
- [x] 未声明 `kind: profile` 的部署 prompt 与接线前逐字节一致（回归用例钉住）
- [x] supervisor 既有测试（trigger/recovery/terminal/continuous/pool/assembly）零回归
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空 + 双 package.json 零依赖新增

## Phase 3 — Proof 与回写

Targets: `plugin/dsh/test/context-profile.test.mjs`、`docs/backlog/age-autonomy-implementation-roadmap.md`、`tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 2

- [x] Proof: `plugin/dsh/test/context-profile.test.mjs` ≥8 例（WI36 门下限）：种子化（清单解析 + 首启）/ run 终态挖掘（tally 归并 + 终态沿触发 + fail-soft）/ 防抖（空 tally 不写 + top-N 集不变不写）/ schema 版本（v1 读写 + 未知 version 保守重建）/ 不进 `missions/`（工件路径域断言 + mission scanner 零污染反向用例）/ top-N 展开与角色覆盖优先 / 确定性序列化与原子写 / headless 降级注记——全绿。
- [x] Proof: `./verify-age.sh` L1+L2+L2.5 GREEN（插件/引擎/真值表计数只增不减）。
- [x] Add: roadmap WI34 勾选 + 行内证据指针；`> Last Updated` 头同步。
- [x] Add: CONTEXT.md「效率层」增量段 + packaging doc（src 树 context-profile 条目、test 树注记、changelog）；`docs/logs/2026/08-27.md` 条目。

Exit Criteria:

- [x] context-profile ≥8 例 0 失败；verify-age 全绿
- [x] roadmap WI34 `[x]` + 证据注记
- [x] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-0558-1-m4-wi34-context-profile-1-64abad30 to ses_reviewer_2026-08-27-0558-1
- 2026-08-27：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-27-0558-1-m4-wi34-context-profile-1-64abad30（两处修订：PoolAgentsFace 事件面表述收敛为 native-executor session.events 先例 + live 探针钉住、agent-pool.ts 入 Phase 2 Targets；辅助信号源「可选」改「在场则并入」fail-soft 定式）
- 2026-08-27：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-0558-1-m4-wi34-context-profile-1-64abad30（两处修订逐条确认落地，抽查基线 file:line 属实，无新议题；status 翻 active）

## Verification

- pass test 2026-08-26-130203-mission-driver basisHash=621e630e4ca8d7c2b4d306322c1afc2aad2a05054afaf9a315ab37fc30c8a777 exit=0
- pass verify-age 2026-08-26-130203-mission-driver basisHash=621e630e4ca8d7c2b4d306322c1afc2aad2a05054afaf9a315ab37fc30c8a777 exit=0

## Closure

- dispatch audit #audit-2026-08-26-130203-mission-driver-2026-08-27-0558-1-m4-wi34-context-profile-1-adda0db8 to ses_auditor_2026-08-27-0558-1
- accepted #audit-2026-08-26-130203-mission-driver-2026-08-27-0558-1-m4-wi34-context-profile-1-adda0db8：独立收口审计（ses_auditor_2026-08-27-0558-1）通过——24 项计数域全勾与 live 工作区逐项对账：① Phase 1 模块与 schema：`plugin/dsh/src/efficiency/context-profile.ts` 在库非空壳（schema v1 `loadProfile`/`saveProfile`——工件缺失→种子化路径、未知 version→显式注记+保守重建不静默沿用；`saveProfile` 确定性序列化 entries 按 path 排序 + tmp+rename 原子写；`seedFromReadFirst` 仅直接路径行入表；`mergeReads` 读频归并 projectRoot 前缀剥离）；`law-policy.mjs` fixedPrefix 第四 kind `profile`（`{kind, ref, topN?}` 正整数校验，tools+assets 双副本 build-bundle 同步）；live policy drafter profile 块在场，`gate-check --policy` exit 0。② Phase 2 接线实证（anti-hollow）：watchdog `emitTerminalEvent` 链尾 run-terminal 挖掘触发（单飞守卫 + fail-soft——`profileMining` 挂载选项注入 io/sources 供测试）；数据源三分层各有消费面（池成员 `sessionEvents` 透出 + `memberSessionEvents()` ∨ run-state steps[].promptFile ∨ memory/runs.md，缺面注记非静默）；防抖 = 空 tally 不写盘 ∨ top-N 排序集等价不写盘；`resolveAssemblyBlocks` profile kind top-N 展开（reads 降序/path 升序）复用 file 全部语义，未声明部署薄指针逐字节向后兼容由反向用例钉住。③ Phase 3 Proof 独立复跑：`plugin/dsh/test/context-profile.test.mjs` 13 例 0 失败（WI36 门 ≥8 下限）；`pnpm --prefix tools/mission-driver test` **929/929 pass + prompt-check OK** exit 0；`./verify-age.sh` **L1+L2+L2.5 GREEN** exit 0（引擎 929 / 插件 420 / 真值表 116 只增不减）。④ 不变量：`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）；双 package.json 零依赖新增；web/ 零改动 → 无需重建 dist。⑤ 文档同步实证：roadmap **WI34 `[x]`** + 行内证据指针 + Last Updated「M4 第三片」同步；CONTEXT.md 效率层上下文画像段；packaging doc 四面（状态头 + src 树条目 + test 树 13 例注记 + Service Surface Proof 串）；`docs/logs/2026/08-27.md` 条目。工件 `docs/references/context-profile.json` 入库且不进 `missions/`（scanner 零污染反向用例钉住）。Deferred 两项（独立形态挖掘采集面→0558-2/WI35、native-executor run 子代理默认启用画像取材→重开条件成文）均显式带后继/触发条件，无活缺陷藏匿。结论：24/24 计数域全勾 + 双 pass 行 basisHash=621e630e…c8a777 与当次 basis 绑定 + 本回执对满足 01 §5.2 完成派生公式。

## Deferred But Adjudicated

### 独立形态挖掘采集面（headless 无 agents face）

- Classification: `watch-only residual`
- Why Not Blocking Closure: 画像首启种子化 + DSH 形态采集已闭环；headless 缺 face = 显式降级注记保留种子表（正确性不受影响——效率层是优化非契约，04 §6）
- Successor Required: yes（0558-2/WI35 独立形态降级统一裁定；run-state 步骤产物辅助源已在 Phase 2 在场分支并入）

### native-executor run 子代理默认启用画像取材

- Classification: `optimization candidate`
- Why Not Blocking Closure: `native-executor.ts` `assemblyPrefix` 经显式 fixedPrefix 声明消费（0433-3 交付面）；`kind: profile` 在同一 resolve 链自动可用，是否默认为 run 子代理启用属调参非契约
- Successor Required: no（重开条件：真实宿主观测显示 run 子代理重复读取 top-N 文件成为成本主因时，经 policy DSL 显式声明启用）
