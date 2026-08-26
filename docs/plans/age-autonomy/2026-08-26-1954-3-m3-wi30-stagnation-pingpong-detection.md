---
status: active
mission: age-autonomy-implementation
work-item: M3-WI30
group: "2026-08-26-1954"
verify: [test, verify-age]
---

# 2026-08-26-1954-3 M3 卡死检测 + 往返检测 + 停滞指纹（age-autonomy M3-WI30）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M3 WI30（卡死检测 + 往返检测 + 停滞指纹（账本 hash + 活动信号））
> Related: 前置 = `2026-08-26-1411-3`（WI27 R4 stagnation 注入接口钉住——`StagnationFact {rounds, threshold}`，检测本体显式移交本 plan；1411-3 Deferred「R4 停滞指纹供给」Successor = M3-WI30）、`2026-08-26-1411-2`（WI26 noteActivity 活动信号面）、`2026-08-26-1954-2`（WI29 supervisor-recovery.test.mjs 建档——本 plan 补停滞/往返用例至 WI31 门 ≥8）

## Current Baseline

**无产出守卫族（03 §7）四腿中三腿已有承载（claim TTL 回收 = 1411-2 reclaim / 失败熔断 = WI27 failures.ts / idle 超时 = agents face followup 面注记），停滞指纹与往返检测零代码：R4 求值只消费注入事实（`stagnation` 缺省 ⇒ R4 不评估——terminal-rules.ts:83 注记「no stagnation supplier until WI30」），N 阈值策略配置落点未定（1411-3 评审注记归属本 plan）。**（live 核实 2026-08-26）

- **03 §7 设计基线（卡死检测/无产出守卫）**：①**停滞指纹** = 账本（plans/roadmap）hash 与活动信号（events/session 工具活动）连续 N 轮无有效变化 → 判定停滞 → 升级（回执/熔断/进审计）——**活动信号必须参与**（只盯账本 hash 会把「长任务尚未落盘」误判为空转）；②claim 无产出：认领超 TTL 无进展 → 回收（1411-2 reclaim trigger 已执行化）；③idle 超时：子代理 followup 超时 → cancel（agents face 面注记，非本 plan 立项）；④失败熔断：`failures ≥ maxFailures` → held + 回执（WI27 `applyCircuitBreaker` 已落地）；⑤**往返检测** = 账本状态振荡（如 plan 在 active↔held 反复横跳）→ 停滞检测收口。
- **R4 注入接口（1411-3 交付面）**：`terminal-rules.ts` `evaluateTermination(snapshot, {maxAuditRounds, maxFailures, stagnation?})`——`StagnationFact {rounds, threshold}` 纯注入事实（:72「injected, never computed here」；:214 `rounds >= threshold` 命中 → blocked + 理由行）；R4 与 partial/blocked 区分（叠加取 blocked）已在区分矩阵钉住——**检测本体（谁数轮数、谁判指纹）= 本 plan**。
- **活动信号面（1411-2 交付面）**：watchdog `noteActivity(sessionId, at?)`（:542）——内存 map（sessionId → 末次活动时刻），renewClaim 消费（临近过期 + 活动信号 → claim TTL 续期）；本 plan 复用同一 map 作停滞判定的活动信号源（零第二实现）。
- **账本 hash 面**：`computeBasisHash`（ledger-sections，per plan frontmatter + Phase + Closure Findings——完成公式同源）；roadmap 无 per-file basis 面（scanRoadmapLedger 注册表 + 原文）。指纹聚合 = 每 plan basisHash 集 + roadmap 文本 hash——纯派生值，无新 store 字段。
- **scratch 纪律（03 §6）**：「scratch 临时量归零成文接受」——停滞轮数计数与振荡历史 = 内存 ring buffer（重启清零 → 停滞判定重新累积——保守安全向：重启后最多多等 N 轮才熔断，不误杀）。
- **N 阈值策略配置缺口**：03 §8「N 为策略配置，默认值由产品配置决定」；law-policy `LIMITS_FIELDS = ["maxAuditRounds", "maxFailures"]`（:34）——双源纪律先例 = resolveMaxAuditRounds / resolveMaxFailures（policy limits 权威 / mission flow 回退 / 双缺默认）。
- **往返检测的结构性注意点**：状态翻转本身改 basisHash（frontmatter status 变化）——**纯 hash 停滞检测看不到振荡**（hash 一直变但无净进展）→ 往返检测是独立腿（plan 状态向量历史的振荡模式判定），出口归并进停滞升级面（03 §7 字面「停滞检测收口」——一个出口 R4/熔断，非第二终态通道）。
- **测试基线**：`plugin/dsh/test/supervisor-recovery.test.mjs`（1954-2 建档 ≥5 例）——WI31 门点名 ≥8 例覆盖「停滞指纹 / 往返检测 / partial/blocked 显式区分」；`supervisor-trigger.test.mjs` 43 例（门 ≥20 已超额）。

## Goals

- 停滞指纹检测器：per-cycle 指纹（每 plan basisHash 集 + roadmap 文本 hash 聚合）× 活动信号（noteActivity map 时间窗）内存 ring buffer——连续 N 轮（指纹不变 ∧ 窗口内零活动）→ 产出 `StagnationFact` 注入 R4（既有终态机 → blocked + run-terminal 回执，零终态面改动）。
- 往返检测：plan 状态向量历史（scratch ring buffer）振荡模式（同一 plan 在两态间 ≥ K 次翻转无终态进展）→ 停滞升级面（`StagnationFact` 饱和注入 → 同一 R4 出口 + 回执）——账本 hash 看不到的振荡由状态历史腿补齐。
- N/K 阈值策略配置：policy limits 增 `stagnationRounds`（law-policy LIMITS_FIELDS + schema 校验 + resolve 函数镜像双源纪律：policy 权威 / mission flow 回退 / 双缺默认成文）；K 往返阈值随同键或派生成文（裁定进 Phase 1，避免双键漂移）。
- 活动信号参与纪律钉住：有活动（窗口内 noteActivity 命中）不算停滞——「长任务尚未落盘」不误判（03 §7 字面，测试正例钉住）。
- `supervisor-recovery.test.mjs` 补齐至 ≥8（停滞 N-1/N 边界 / 活动信号参与 / 往返检测 / 注入 R4 blocked + partial/blocked 区分恢复语境变体）——WI31 门达标。
- 文档同步（03 changelog / 02 policy schema 面 / CONTEXT.md / packaging doc）+ roadmap WI30 回写。

## Non-Goals

- idle 超时 cancel 的 agents face 治理（03 §7 ③——followup 超时语义在 agents face 面注记，非守夜人立项面；停滞指纹间接兜底挂起场景）。
- R4 求值核心 / partial/blocked 区分规则 / 终态落点（1411-3 已交付——本 plan 只供给注入事实，零终态面改动）。
- claim TTL / 续期 / 回收语义（1411-2 已交付——noteActivity 只读复用不改续期面）。
- 崩溃恢复 / resume-or-redispatch（1954-2；死会话 claim 提前回收 = 本 plan Deferred 评估面）。
- 停滞指纹/振荡历史的持久化（scratch 纪律：内存态重启清零成文接受，03 §6）。
- 引擎面改动（engine.js / flows 零 diff——mission flow 回退键若需增键沿 maxFailures 先例为数据键非引擎消费）。

## Task Route

- Type: `architecture change`（守夜人检测器模块 + policy schema 面——supervisor/law-policy 两面结构新增）
- Owner Docs: `docs/design/age-autonomy/03-supervisor.md` §7（卡死检测）/§8（R4 + N 策略配置）/§6（scratch 纪律）、`docs/design/age-autonomy/02-rule-law.md` §3（policy schema 面——limits 键增量）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（1411 批次同裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-26-1411-2` + `2026-08-26-1411-3` 收口（noteActivity / R4 注入接口）；`2026-08-26-1954-2`（WI29）先置（supervisor-recovery.test.mjs 建档 + 恢复语境变体基线）。
- No infra prereqs beyond existing baseline（零新增 npm 依赖；ring buffer 纯内存）。

## Phase 1 — 裁定：指纹/活动/振荡判定 + 阈值配置

Targets: `plugin/dsh/src/supervisor/`（检测器新模块 stagnation.ts + watchdog 周期接线）、`tools/mission-driver/src/law-policy.mjs`（LIMITS_FIELDS + resolve 函数）、`missions/autonomy.policy.yml`（limits 行）、`flows/mission-driver.json`（回退键——数据键，engine.js 零 diff）

Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 1411-2、1411-3、1954-2

- [ ] `Decision` **双入口同注入（1411-3「两入口同一实现」契约保持）**：检测器产出为 watchdog 持有状态（`StagnationFact | null` 单点）；**两入口同读该状态**——看门循环周期末端求值（既有入口）与 policy terminal 声明面（exec-arm `forwardTerminalDecision` 重扫快照入口，exec-arm.ts:637-640）均注入同一检测器状态，非仅周期入口。备选：声明面入口不注入（依赖 R3 先于 R4 的顺序 + 下一周期收敛）——否决：制造双入口单周期分歧面（声明面 continue 而周期面 blocked），违背 1411-3 成文契约「两入口同一实现 + 交叉用例钉漂移」。残险：无（声明面重扫快照时检测器状态经回调透传，跨入口时序差 ≤ 一周期由幂等重评收敛——真值表交叉用例钉住）。
- [ ] `Decision` **指纹域与活动信号判定形状**：per-cycle 指纹 = 排序后 (planPath → basisHash) 序列 + roadmap 文本 hash 的聚合 hash；**指纹域 = basisHash 域（frontmatter + Phase + Closure Findings）——Draft Review Record / Verification / Closure 区追加在域外，dispatch/pass 行追加不重置指纹**（测试语义钉住：评审派发后指纹不变属预期；移动指纹的只有 status 翻转 / 勾选 / Closure Findings 追加 / roadmap 变更）。一轮「停滞」= 指纹与上轮相同 ∧ 活动窗口（默认 = 一个心跳周期）内 noteActivity 零命中；连续 N 轮停滞 → `StagnationFact {rounds, threshold}` 注入。**活动信号必须参与**（03 §7 字面）：指纹不变但有活动 = 不计停滞轮（长任务未落盘不误判）；轮数计数在有活动轮清零重积。承载 = 内存 ring buffer（scratch 纪律，03 §6「归零成文接受」；重启后重新累积——保守向）。备选 A：指纹落盘跨重启保续——否决：scratch 面扩持久 store 违 03 §6 纪律且重启后重积无害。备选 B：指纹只看 roadmap——否决：plans 是主推进面，roadmap 只在收口写。残险：AI 空转但周期性改文件（指纹变而无效进展）——往返检测腿 + failures 熔断兜底（成文）。
- [ ] `Decision` **往返检测形状与出口归并**：per-plan 状态向量历史（每周期采 plan frontmatter status 快照入 ring buffer）；振荡 = 同一 plan 在两态（如 active↔held）间 ≥ K 次翻转且无终态进展（终态 = completed 派生 / cancelled 等写终态）。命中 → `StagnationFact` **饱和注入**（`{rounds: threshold, threshold}`——等效满足 R4 条件）→ 同一 R4 出口（blocked + 回执）。备选：振荡独立出口/独立终态词——否决：03 §7 字面「停滞检测收口」+ 03 §8 终态词表封闭（R1–R4 单出口纪律）。K 取值：**K = 2 个完整往返**（4 次翻转）——K 与 N 同源配置裁定见下项。残险：合法多次 held→active 解锁（人工处置节奏）被误判——unlock 处置（1954-1 路由）有人工回执链且连续模式 off 时 plan 状态稳定，误判面窄 + 回执可人工再处置（成文接受）。
- [ ] `Decision` **N/K 阈值策略配置落点**：policy limits 单键 `stagnationRounds`（默认 10——30s 心跳下 ≈5 分钟无进展无活动才熔断，长 AI 步（含 10min verify 命令超时面）不误杀；成文理由 = 心跳周期 × N 的墙钟换算）；K（往返阈值）**不设独立配置键**——派生自同键（K 往返 ≈ stagnationRounds/5 下取整、下限 2），避免双键漂移与配置面膨胀。双源纪律镜像 resolveMaxFailures：policy limits 权威 / `flows/mission-driver.json` 顶层回退键 / 双缺默认 10。备选：独立 `pingPongTimes` 键——否决：02 §3 schema 面单键单义先例 + 派生关系成文即可审计。残险：默认值产品判断——plan 成文墙钟换算依据，执行期可调（policy 数据面）。
- [ ] `Add` 检测器 + policy 面：`plugin/dsh/src/supervisor/stagnation.ts` 纯函数核心（指纹聚合 / 停滞轮数状态机 / 振荡模式判定 → `StagnationFact | null`，可注入 clock 与 activity map——确定性可测）+ watchdog 接线（检测器状态为 watchdog 持有单点；周期末端求值与 exec-arm `forwardTerminalDecision` 声明面入口同读注入——双入口同注入裁定落地，R4 注入面沿 1411-3 既有参数）；law-policy `LIMITS_FIELDS` 增 `stagnationRounds` + schema 非负整数校验 + `resolveStagnationRounds(policy, missionConfig)` 双源；`missions/autonomy.policy.yml` limits 行（含头注墙钟换算句）+ `flows/mission-driver.json` 回退键（镜像 maxFailures 先例）。
- [ ] `Proof` 检测器单测（并入 supervisor-recovery.test.mjs 新 describe 或独立 describe 同文件）：指纹聚合确定性（同语料两次同 hash）/ **指纹域钉住**（Draft Review Record 追加不重置指纹；status 翻转重置）/ 停滞轮 N-1 不熔断、N 熔断 / 有活动轮清零重积（正例：长任务窗口）/ 振荡 ≥K 翻转饱和注入、<K 不注入 / R4 注入后 blocked 决策 + 回执沿既有终态机（1411-3 面 zero-change 断言）/ **双入口交叉用例**（声明面 forwardTerminalDecision 与周期末端同注入同结果——单周期零分歧）。

Exit Criteria:

- [ ] 检测器纯函数 + watchdog 接线落地；R4 注入端到端（检测 → StagnationFact → evaluateTermination blocked）；双入口同注入零单周期分歧有交叉用例
- [ ] policy limits 新键经 `gate-check --policy` schema 校验；双源 resolve 有矩阵测试
- [ ] `docs/logs/` 更新

## Phase 2 — 恢复语境补强 + 文档同步与回写

Targets: `plugin/dsh/test/supervisor-recovery.test.mjs`（补至 WI31 门 ≥8）、`docs/design/age-autonomy/03-supervisor.md`（changelog）、`tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、roadmap、`docs/logs/`

Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [ ] `Add` supervisor-recovery.test.mjs 补齐（对 WI31 门清单）：停滞指纹（N-1/N 边界）+ 往返检测 + 恢复语境变体（重启后 ring buffer 清零 → 停滞重积不误熔断）+ partial/blocked 显式区分恢复语境变体（R3∧停滞 → blocked 叠加取向沿 1411-3 区分矩阵）——文件总用例 ≥8（1954-2 份额 ≥5 + 本 plan 份额）。
- [ ] `Add` 文档同步与回写：03-supervisor.md changelog（§7 执行面落地注记——指纹/活动/振荡三判定 + N/K 配置裁定 + scratch 纪律引用，非契约变更）；CONTEXT.md 增停滞检测段；packaging doc（src 树 stagnation.ts 条目 + test 树增量）；roadmap WI30 tick + 证据指针 + Last Updated 同步；`docs/logs/` 收口条目。
- [ ] `Proof` 收口面：`node --test plugin/dsh/test/supervisor-recovery.test.mjs` ≥8 全绿；`pnpm --prefix tools/mission-driver test` + `./verify-age.sh` 全绿（引擎 ≥907 / 插件 ≥342 / 真值表 ≥113 只增不减；law-policy 新键 schema 回归）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff）+ 零新增 npm 依赖。

Exit Criteria:

- [ ] supervisor-recovery.test.mjs ≥8 用例全绿（WI31 门清单逐项覆盖：过期 claim 回收（1954-2）/ resume-or-redispatch（1954-2）/ 停滞指纹 / 往返检测 / partial/blocked 区分变体）
- [ ] roadmap WI30 `[x]` + 证据指针；Last Updated 同步
- [ ] CONTEXT.md / 03 changelog / packaging doc 增量在位；`docs/logs/` 收口条目
- [ ] `./verify-age.sh` + mission-check 全绿（L2.5 corpus 覆盖本 plan）

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1954-3-m3-wi30-stagnation-pingpong-detection-1-aa4a2c2f to ses_reviewer_2026-08-26-1954
- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1954-3-m3-wi30-stagnation-pingpong-detection-2-8fc1ad00 to ses_reviewer_2026-08-26-1954
- 2026-08-26：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-26-1954-3-m3-wi30-stagnation-pingpong-detection-1-aa4a2c2f（独立评审 ses_reviewer_2026-08-26-1954：baseline 全实证——terminal-rules StagnationFact :72/:83-84「injected, never computed here / no stagnation supplier until WI30」、noteActivity map 无 TTL 清理 :226/:542-544、LIMITS_FIELDS :34、computeBasisHash 域、WI31 门文件名对账、`node <file>` 裸跑形态可用均对账；阻塞 1 项 = 双入口停滞注入不对称被静默引入——1411-3 成文契约「两入口同一实现 + 交叉用例钉漂移」，plan 只在周期入口注入、声明面入口（exec-arm forwardTerminalDecision :637-640）不注入 → 两入口可单周期分歧（声明面 continue 而周期面 blocked），须双入口同注入或成文安全理由 + 交叉用例；非阻塞 4 项 = 指纹域说明（DRR/Verification/Closure 追加在 basisHash 域外，dispatch/pass 行追加不重置指纹——写入 Decision 防测试误设预期）/ K 派生小 N 时振荡先于停滞出口属固有已成文 / noteActivity 无 TTL 对窗口读无碍 / LIMITS 追加键免费获得非负整数校验 :650-654 与 P8 合法性沿 WI27 先例）
- 2026-08-26：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-26-1954-3-m3-wi30-stagnation-pingpong-detection-2-8fc1ad00（独立复核 ses_reviewer_2026-08-26-1954：阻塞修复落地且 sound——新 Decision 1 双入口同注入：检测器状态为 watchdog 持有单点、周期末端与声明面入口同读注入，备选「声明面不注入靠 R3 先序 + 下周期收敛」以违背 1411-3 双入口契约否决，交叉用例入 Proof/Exit，可经既有 ExecArmOptions 透传模式落地；指纹域钉住进 Decision 2 + 测试「DRR 追加不重置指纹 / status 翻转重置」；四项非阻塞处置齐备；格式干净、无新引入问题；跨 plan 注记：WI31 门 `--law` 模式缺失归 WI31 立项裁定（与 1954-1 iteration 2 注记同源）；cosmetic 1 条不阻塞 = :25/:87「1954-2 份额 ≥5」可随执行期顺手对齐 ≥7（只增不减方向））

## Verification

## Closure

## Deferred But Adjudicated

### TTL 未到期死会话 claim 提前回收（承 1954-2 Deferred）

- Classification: `watch-only residual`
- Why Not Blocking Closure: 停滞指纹落地后死会话经「指纹不变 ∧ 无活动」N 轮即熔断 blocked + 回执——人工/守夜人可处置；提前杀 claim 仍需会话级活性语义，收益 = 省 N 轮等待，成本 = 误杀活执行。
- Successor Required: yes（M5/WI37 评估 or 实战中误杀/滞留案例出现时立项）
