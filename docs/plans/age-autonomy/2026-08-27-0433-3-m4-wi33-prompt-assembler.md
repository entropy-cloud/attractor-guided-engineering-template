---
status: active
mission: age-autonomy-implementation
work-item: M4-WI33
group: "2026-08-27-0433"
verify: [test, verify-age]
---

# 2026-08-27-0433-3 M4 PromptAssembler 双模式组装（age-autonomy M4-WI33）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI33；`docs/design/age-autonomy/04-efficiency.md` §3/§5
> Related: 2026-08-27-0433-2（M4-WI32 agent 池——CONTINUE 模式的天然消费者）、2026-08-26-1954-1（Deferred：executor prompt 组装归本 WI）

## Current Baseline

- 派发 prompt 现状：`plugin/dsh/src/supervisor/exec-arm.ts` `dispatchPromptOf`（:104）= 薄指针 prompt（引用引擎 prompt 文件路径 `PROMPT_FILE_OF` + 少量上下文行），无文件嵌入、无 hash 台账、无 FRESH/CONTINUE 区分；`native-executor.ts` 接收引擎侧已解析的 prompt 文本（StepExecutor 契约）仅加盖 `[MISSION_DRIVER:runId]` marker——两处均为「指令读文件」模式（多轮读取成本，04 §3.3 要消除的对象）。
- schema 面：`fixedPrefix` 块 schema（`{kind: text|file|dir, ref, maxFileBytes?}`）已在 `law-policy.mjs` 在库（M2-WI13）但**零消费**；`assembly:` 段（embedStamp/continueDelta）schema 不存在。
- 消费者面：M4-WI32 交付池成员（create/followup 双路径）= FRESH-on-create / CONTINUE-on-followup 的天然载体；`promptsDir` 覆盖链（mission 级 prompt 替换）在库——policy 是叠加层不取代既有解析优先级（04 §7）。
- hash 工具面：`computeBasisHash`（sha256 同源）在 `ledger-sections.mjs`；文件 hash 面为 assembler 新增职责（dedup/陈旧检测/可审计三用，04 §3.3）。
- WI36 门指定 `plugin/dsh/test/prompt-assembly.test.mjs` ≥12 例（FRESH vs CONTINUE 字节序 / 缓存命中 / 目录全文 / hash 台账 / 文件变则重发）；终审 P2-4 观测项（FRESH vs CONTINUE token 差 >20%）为观测不阻断。
- 底线：零 engine.js diff、零新增 npm 依赖；law-policy.mjs（tools 副本）非 P8 保护路径，`missions/autonomy.policy.yml` 为保护路径（本 plan active = 合法例外，自指先例）。

## Goals

- 交付 `PromptAssembler` 纯函数模块（04 §3）：`assemble(mode, spec, dynamicCtx)`——FRESH = fixedPrefixBlocks ++ [dynamicBlock]；CONTINUE = deltaEmbedBlocks（未变文件跳过）++ [dynamicBlock]。
- 交付文件嵌入纪律：embedStamp `<file path hash>` 全文嵌入、目录全文嵌入（maxFileBytes 上限）、hash 三用（dedup / 陈旧检测重发 / 可审计）、前缀纪律（固定字节最前、易变字节后置、marker 指令属动态后缀）、compaction 对抗（charter 清单内已变/被裁剪文件周期性重发）。
- 交付 `assembly:` policy 段 schema 与真实配置块；接线池成员双模式与派发链；`prompt-assembly.test.mjs` ≥12 例全绿；roadmap WI33 勾选。

## Non-Goals

- 不做上下文画像（top-N 取材面归 M4-WI34）与独立形态 CLI 交付（`independentChannelOf` seam 已在，完整降级归 M4-WI35）。
- 不改账本/law/完成语义；不改引擎 prompt 解析优先级链（`promptsDir` → `missions/prompts/` → 内置，policy 叠加不取代，04 §7）。
- 不承诺 token 收益数值（终审 P2-4 = 观测项：机制落地即收口，收益待真实宿主观测，归 WI36 观测面）。
- 零 engine.js diff、零新增 npm 依赖。

## Task Route

- Type: `implementation-only change`（设计基线已批准，落地 04 §3/§5）
- Owner Docs: `docs/design/age-autonomy/04-efficiency.md` §3/§5/§7、`docs/design/age-autonomy/02-rule-law.md` §3（schema 扩展点）
- Skill Selection Basis: 无匹配 skills——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Phase 1 — assembler 纯函数 + assembly schema

Targets: `plugin/dsh/src/efficiency/prompt-assembler.ts`、`tools/mission-driver/src/law-policy.mjs`、`missions/autonomy.policy.yml`（build-bundle 仅为 assets 同步通道非编辑面——law-policy.mjs 已登记，`--check` 机器执法）
Skill: none

- Item Types: `Add | Decision`
- Prereqs: 无硬依赖（建议在 M4-WI32 之后执行——CONTINUE 消费者面已在）

- [ ] Add: `assemble(mode, spec, dynamicCtx)` 纯函数——FRESH = fixedPrefix 块（text/file/dir 三 kind）聚合 + 动态块；CONTINUE = 经 lastSentHashes 比对的 deltaEmbed（未变文件跳过、变更文件重发全量）+ 动态块；可注入 clock/文件读取面，确定性可测。
- [ ] Add: embedStamp 语法（默认形态 `<file path="{path}" hash="{hash8}">{content}</file>`，schema 可覆写模板串）；hash 口径成文：`{hash8}` = 文件 sha256 前 8 hex（算法源与 `computeBasisHash` 同源，ledger-sections.mjs；roadmap WI33 行 "sha256" 指算法、`{hash8}` 指渲染宽度——04 §3.3 示例 `hash="a1b2c3d4"` 同口径）；目录全文嵌入（kind dir + maxFileBytes 逐文件上限，超限显式注记不静默截断）；hash 三用成文（dedup / dispatch 时 hash 不符重发 / grep 可审计）。
- [ ] Add: 前缀纪律——固定字节排最前（persona/charter/嵌入文件）、时间戳/轮次计数等易变字节一律后置、marker 指令属动态后缀（04 §3.2）；compaction 对抗——per-agent hash 台账 + 对 charter 清单内且已变/被裁剪文件周期性重发（不对抗压缩，04 §3.3）。
- [ ] Add: `law-policy.mjs` 增 `assembly:` 段 schema（embedStamp 模板串 + continueDelta 布尔，受限 YAML 子集边界内）+ `missions/autonomy.policy.yml` 增 assembly 块（P8 例外 = 本 plan active）；tools+assets 双副本经 build-bundle 同步（law-policy.mjs 已在 ALLOWED_MODULES，无登记编辑——仅 assets 再同步，由 test 链 `--check` 机器执法）。
- [ ] Decision: per-member hash 台账承载 = 池成员内存态（随成员生灭）+ crash 后首发重发 FRESH（保守向：不猜会话内状态，P2 内存缓存非权威同源）。备选 = 台账落盘持久化——否决：引入新 store 面与恢复语义，收益仅省一次 FRESH 重发；残险 = 长成员 crash 后重发全量（成本可接受）。

Exit Criteria:

- [ ] FRESH/CONTINUE 输出字节序满足前缀纪律（固定前缀逐字节稳定，易变字节后置）——测试钉住
- [ ] `gate-check --policy missions/autonomy.policy.yml` exit 0（assembly 段过 schema）
- [ ] `pnpm --prefix plugin/dsh test` 全绿（manifest/tsc/bundle/smoke 链）

## Phase 2 — 消费接线

Targets: `plugin/dsh/src/supervisor/exec-arm.ts`、`plugin/dsh/src/efficiency/agent-pool.ts`、`plugin/dsh/src/native-executor.ts`
Skill: none

- Item Types: `Add`
- Prereqs: Phase 1；M4-WI32 池在库

- [ ] Add: 池成员双模式——create 路径发 FRESH、followup 路径发 CONTINUE（per-member hash 台账维护；未声明 fixedPrefix 的 agent 保持现 prompt 路径，零行为变化）。
- [ ] Add: exec-arm `dispatchPromptOf` 在 policy/agent 声明 fixedPrefix ∨ assembly 时经 assembler 组装；未声明部署回退现薄指针 prompt（部署面零变化，向后兼容钉住）。
- [ ] Add: hash 变化轮换触发（M4-WI32 Deferred 收编）——上游依赖文档 hash 变化时池强制换新成员（04 §2.2 第二触发腿，判据经 assembler hash 面）。
- [ ] Add: `native-executor.ts` prompt 面接线（fixedPrefix 声明时同源组装；`promptsDir` 覆盖链尊重——policy 叠加不取代既有解析优先级）。

Exit Criteria:

- [ ] 未声明 assembly/fixedPrefix 的部署行为与接线前逐字节一致（回归用例钉住）
- [ ] supervisor 既有测试（含 trigger e2e、dispatch、recovery）零回归
- [ ] `git diff --stat tools/mission-driver/src/engine.js` 为空 + 双 package.json 零依赖新增

## Phase 3 — Proof 与回写

Targets: `plugin/dsh/test/prompt-assembly.test.mjs`、`docs/backlog/age-autonomy-implementation-roadmap.md`、`tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 2

- [ ] Proof: `plugin/dsh/test/prompt-assembly.test.mjs` ≥12 例（WI36 门下限）：FRESH vs CONTINUE 字节序 / 缓存命中（未变文件 dedup 跳过）/ 目录全文嵌入 / hash 台账 / 文件变则重发 / maxFileBytes 超限注记 / 前缀纪律（易变字节后置）全绿。
- [ ] Proof: `./verify-age.sh` L1+L2+L2.5 GREEN（插件/引擎/真值表计数只增不减）。
- [ ] Add: roadmap WI33 勾选 + 行内证据指针；`> Last Updated` 头同步。
- [ ] Add: CONTEXT.md「效率层」增量段 + packaging doc（src 树条目、test 树 prompt-assembly、changelog）；`docs/logs/2026/08-27.md` 条目。

Exit Criteria:

- [ ] prompt-assembly ≥12 例 0 失败；verify-age 全绿
- [ ] roadmap WI33 `[x]` + 证据注记
- [ ] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-0433-3-m4-wi33-prompt-assembler-1-5c92e7ab to ses_fc035352dffeEboXsOTwBGO5vQ
- 2026-08-27：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-27-0433-3-m4-wi33-prompt-assembler-1-5c92e7ab（零阻塞；四项修订：hash8/sha256 口径、M3-WI26 里程碑 typo、native-executor 措辞、build-bundle target 降为同步通道）
- 2026-08-27：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-0433-3-m4-wi33-prompt-assembler-1-5c92e7ab（四项修订逐条确认落地无新议题；status 翻 active）

## Verification

## Closure

## Deferred But Adjudicated

### 上下文画像消费（fixedPrefix top-N 稳定文件取材）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 画像数据源与工件归 M4-WI34；assembler 当前以显式 fixedPrefix 声明取材，可独立收口
- Successor Required: yes（M4-WI34 落地后接消费面）

### 独立形态 CONTINUE 交付（CLI runner）

- Classification: `watch-only residual`
- Why Not Blocking Closure: `independentChannelOf` 纯解析 seam 已在（M3-WI26 交付，dispatch-resolve.ts）；独立形态完整降级面（`--session` 续用 + 前缀纪律）归 M4-WI35 统一裁定
- Successor Required: yes（M4-WI35）

### FRESH vs CONTINUE token 收益观测（终审 P2-4）

- Classification: `watch-only residual`
- Why Not Blocking Closure: roadmap WI36 明示为观测项不阻断——机制落地即收口，收益待真实宿主连续模式跑 3 个 plan 对比
- Successor Required: yes（M4-WI36 观测面）
