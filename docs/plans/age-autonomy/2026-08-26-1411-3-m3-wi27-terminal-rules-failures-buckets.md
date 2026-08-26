---
status: active
mission: age-autonomy-implementation
work-item: M3-WI27
group: "2026-08-26-1411"
verify: [test, verify-age]
---

# 2026-08-26-1411-3 M3 终态规则 R1–R4 + failures 归因桶 + maxFailures 语义（age-autonomy M3-WI27）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M3 WI27（终态规则 R1–R4：clean exit / silent-completed 修复 / hold 死锁 / 停滞熔断；partial/blocked 显式区分；+ failures 归因桶枚举成文（executor 错误 / 测试红 / claim 到期无产出，各桶计/不计规则）与 maxFailures 默认值进 mission config（终审 P2-3））；0815-3 WI17 残项「R1/R3 终态执行与 trigger 派发语义归 M3/WI26/WI27」的 WI27 侧由本 plan 收口
> Related: 前置 = `2026-08-26-1411-1`（WI25 meter writer/receipt 面/看门循环）、`2026-08-26-1411-2`（WI26 trigger 求值器 + terminal 决策对象产出 + 失败回执点——本 plan 消费其产出并补计量接线）

## Current Baseline

**终态语义有设计基线无执行面：R1–R4 只在 03 §8 成文（求值核心/执行方/回执面零代码）；failures 字段有执法面（held→active 同写重置）无生产写者与归因语义（policy limits `maxFailures: 3` schema-reserved，头注明示「default semantics land with M3/WI27」）；policy 末条 trigger 的 `terminal: partial/blocked` 出口经 1411-2 只产出决策对象无执行；预算耗尽终态化（R1）只有 deny 面（audit-rounds-overflow「R1 终态收口是 M3/WI27 执行方，本门禁只 deny」）。**（live 核实 2026-08-26；1411-1/1411-2 交付面以 plan 文字为准，Prereqs 保证执行序）

- **R1–R4 设计基线（03 §8，按 R1→R4 顺序求值）**：R1 预算硬门（`audit-rounds ≥ maxAuditRounds ∧ (activePlans()==0 ∨ 全部 awaitingClosure)` → roadmap 全 done ∧ openPlans()==0 ? `completed` : `partial/blocked` + 回执——不得因预算耗尽把未完成 roadmap 静默记 completed；仍有执行中 claim 的 active plan 先跑完/到 awaitingClosure 不提前杀）；R2 干净早退（`≥1 ∧ 全 done ∧ openPlans()==0` → completed）；R3 显式卡住（`≥1 ∧ draft==0 ∧ active==0 ∧ (未勾 ∨ held>0)` → partial/blocked + 回执；有 draft 继续评审不提前终态）；R4 停滞熔断（连续 N 轮账本 + 活动信号无有效变迁 → blocked；N 策略配置）。
- **谓词面就绪**：openPlans = draft ∪ active ∪ held（ledger-sections.mjs:546）；awaitingClosure（:554）；roadmap 全 done/未勾 = scanRoadmapLedger 注册表勾选态（WI21 workItemRegistered 同源数据）；audit-rounds 读面 resolveMaxAuditRounds（law-policy.mjs:483）。
- **terminal 出口**：policy 末条 trigger（`accepted findings=none ∧ draft==0 ∧ active==0 ∧ roadmap.unchecked → terminal: partial/blocked`）= R3 的声明面（1411-2 求值器产出决策对象，执行归本 plan）；TRIGGER_TERMINAL_VALUES = `partial|blocked|partial/blocked`（law-policy.mjs:47）。
- **failures 执法面已有 / 生产面缺失**：writer-identity（held→active 同写重置 failures=0 + 移除 hold——01 §5.1 逐边表执法，law-rules）；claim-validity（全勾无回执必清 claim）；plan frontmatter failures 字段（01 §4.1，非负整数，写者 = supervisor 失败归因）——生产写者与归因规则缺失。
- **maxFailures 双源缺口**：policy limits `maxFailures: 3` 在场但语义未落地（policy 头注 :12「maxFailures is schema-reserved; default semantics land with M3/WI27」）；终审 P2-3 要求「maxFailures 默认值进 mission config」——双源解析（policy 权威 / mission 回退）镜像 resolveMaxAuditRounds 模式，law-policy.mjs 尚无 resolveMaxFailures。
- **熔断语义（02 §4.6 + 03 §7）**：同 plan `failures ≥ maxFailures` → held + 回执；全部 held → 终态化 blocked/partial + 回执；held plan 不阻塞其他可执行 plan（03 §4 Queue ≠ approval——单 held 不暂停循环，仅无可执行/可评审 open plan 时收口）。
- **终态映射纪律（03 §8）**：`partial/blocked` 是新增终态值；DSH 形态走回执不依赖退出码；独立形态 EXIT_MAP 增补 = 冻结契约变更须独立立项 + exit-map.test.js（M5/WI38）——本 plan 零引擎面。
- **R4 输入依赖**：停滞指纹（账本 hash + 活动信号连续 N 轮）检测本体 = WI30；本 plan 只定义 R4 求值的输入接口（stagnation 事实注入），检测 machinery 不在本 plan。
- **1411-1/1411-2 交付面（Prereqs）**：meter writer（failures 写函数 + law 自检）/ receipt 面（A8 尽力投递）/ 看门循环；1411-2 的失败回执点（mechanical-verification 失败不写 pass 行 + 回执）——归因计量接线归本 plan。
- **回执绑定纪律**：终态判定不是账本写入面——roadmap 无终态行可写（roadmap-write-guard 域：WI 行勾选翻转 + 证据追加之外 deny）；plan status 终态（cancelled/superseded/deferred）是另一语义（01 §5.1 写者表），终态规则的 completed/partial/blocked 是 **mission run 收口语义**非 plan 状态——落点裁定进 Phase 1 Decision。
- **Follow-up P2 顺带清偿对象**：「mission config 前向引用缺失文件」（autonomyPolicy / commands.gates ENOENT）——WI12/WI13 落地后两文件均已在位（live 核实 `missions/autonomy.policy.yml` + `tools/mission-driver/src/gate-check.mjs`），自愈事实注记 absorbed-by 归本 plan 回写相位（批末 roadmap 单点维护，0950-3 absorbed-by 先例）。

## Goals

- R1–R4 求值核心：纯函数（snapshot + limits + stagnation 注入 → 终态决策 completed|partial|blocked|continue + 逐条理由）+ 真值表；R4 输入接口钉住（供给归 WI30）。
- failures 归因桶成文（owner doc 02 §4.6 增量——executor-error / verification-red / claim-expired-no-output 三桶各计/不计规则）+ meter 接线（1411-2 失败点 → writer 写 failures）+ 熔断（≥ maxFailures → held + 回执；全 held ∧ 无可执行 open plan → 终态 + 回执）。
- maxFailures 双源解析（resolveMaxFailures：policy 权威 / mission flow config `maxFailures` 回退（实落 `flows/mission-driver.json`，双缺默认 3 成文）/ policy 头注 schema-reserved 句兑现——终审 P2-3「maxFailures 默认值进 mission config」收口）。
- terminal 出口执行：1411-2 terminal 决策对象 → R1–R4 序贯求值 → 终态回执（receipt 面尽力投递 + mdcontrol.status 透出 + 循环停派）；R1 与 audit-rounds-overflow deny 面对齐注记。
- 文档同步 + roadmap WI27 回写 + Follow-up 自愈注记。

## Non-Goals

- 停滞指纹/卡死检测/往返检测 machinery（WI30——本 plan 只消费 stagnation 注入事实，接口钉住）。
- 连续模式 opt-in / `mdcontrol.continuous` / `mdcontrol.unlock` 路由（WI28）。
- 崩溃恢复 resume-or-redispatch（WI29）。
- EXIT_MAP / EXECUTION-PRINCIPLE §11 任何改动（M5/WI38 冻结契约独立立项；DSH 回执不依赖退出码——03 §8 终态映射纪律钉住）。
- 引擎 run 终态行为改动（engine.js 零 diff；守夜人终态面与引擎 run 终态并行共存，协同 = 回执内容注记，不改引擎面）。
- R1「有活 claim 先跑完」的强制等待实现（本 plan 判定面把「active plan 带未过期 claim」识别为 continue；claim 到期回收/重派归 1411-2 reclaim 面）。

## Task Route

- Type: `architecture change`（守夜人终态判定与计量接线——supervisor/law-policy/ledger 三面结构新增）
- Owner Docs: `docs/design/age-autonomy/03-supervisor.md` §8（R1–R4）/§7（熔断）/§4（Queue ≠ approval）、`docs/design/age-autonomy/02-rule-law.md` §4.6（预算闸/熔断语义——归因桶增量落此）、`docs/design/age-autonomy/01-file-ledger.md` §3.1（audit-rounds 计量）/§4.1（failures 字段）
- Skill Selection Basis: `docs/skills/` 无匹配本任务方法的项目 skill（同批次裁定）→ Skill: none

## Infrastructure And Config Prereqs

- Prereqs: `2026-08-26-1411-1` + `2026-08-26-1411-2` 收口（meter writer / receipt 面 / terminal 决策对象产出 / 失败回执点）。
- No infra prereqs beyond existing baseline（零新增 npm 依赖；纯函数 + supervisor 接线面）。

## Phase 1 — R1–R4 求值核心 + maxFailures 双源

Targets: `plugin/dsh/src/supervisor/`（终态求值模块）、`tools/mission-driver/src/law-policy.mjs`（resolveMaxFailures——engine 侧零 npm 模块先例沿袭）、`flows/mission-driver.json`（maxFailures 回退键——mission flow config 数据键，engine.js 零 diff）、`missions/autonomy.policy.yml`（头注 schema-reserved 句兑现——policy 头注「changes only through a plan's Add item」的合法写入面）、`plugin/dsh/test/supervisor-terminal.test.mjs`（新）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 1411-1、1411-2

- [ ] `Decision` **R1–R4 承载形态**：supervisor 内序贯求值核心（03 §8 字面顺序 R1→R4——顺序本身是成文契约非隐式顺序，03 §3「守夜人只执行声明式规则」的「规则」含 §8 序贯契约本体）+ policy 末条 trigger 的 terminal 出口作为 R3 的声明面入口——**两入口同一实现**（1411-2 求值器产出的 terminal 决策对象路由进同一求值核心，非第二实现）。备选：R1–R4 全部改写为 policy triggers——否决（R1 复合条件与顺序优先语义超出受限谓词语法表达面，且会把成文序契约伪装成可配置项）。残险：双入口漂移——同源实现 + 真值表交叉用例钉住。
- [ ] `Decision` **终态落点**：终态决策不是账本写入（roadmap 无终态行可写；plan status 终态是 01 §5.1 另一语义）——终态 = 回执记录（1411-1 receipt 面）+ `mdcontrol.status` 透出 + 守夜人循环停派（该 mission 的 dispatch 抑制）。备选：写 mission run-state——否决（run-state 是引擎面 + 零引擎 diff 底线）。残险：跨重启终态记忆——账本派生态（audit-rounds/openPlans）再扫描可幂等重现判定，无需新 store（重启后重评同结果，真值表钉住）。
- [ ] `Decision` **partial/blocked 显式区分规则**（WI27 字面「显式区分」的操作化）：`blocked` = 推进受阻的持久性障碍信号——R3 且 `heldPlans()>0`（可执行面被 held 占满）∨ R4 停滞命中；`partial` = 工作未完成但无受阻信号——R1 预算耗尽且 roadmap 未全 done ∨ R3 且 `heldPlans()==0`（无可起草/无活跃的纯完成度缺口）；R1 全 done 分支本走 `completed`。双因叠加（held>0 ∧ 停滞）取更强信号 `blocked`。policy trigger 声明面的复合值 `partial/blocked`（TRIGGER_TERMINAL_VALUES 合法值）经本规则归一为具体值——policy 声明面不动。备选：保持复合值不区分——否决，WI27 字面要求显式区分且回执/处理面需区分「等人解锁/停滞熔断」vs「活没干完」；备选 B：一律 blocked——否决，预算耗尽是资源边界非卡死，混淆回执语义。残险：无（复合值仍是合法声明面，归一规则单点实现于求值核心）。
- [ ] `Add` 求值核心 + resolveMaxFailures：`evaluateTermination(snapshot, {maxAuditRounds, maxFailures, stagnation}) → {decision: completed|partial|blocked|continue, reasons[]}`（R1→R4 顺序、逐条理由、R1 三岔含「有活 claim → continue」、partial/blocked 按上述 Decision 归一）；R4 输入 = stagnation {rounds, threshold} 注入事实（N 阈值的策略配置位置随 WI30 落定，本 plan 不定义配置键）。`law-policy.mjs` 增 `resolveMaxFailures(policy, missionConfig)`（policy limits 权威 / mission `flow.maxFailures` 回退 / 双缺默认 3——镜像 resolveMaxAuditRounds 单权威+单回退纪律）。**P2-3 交付形态钉死**：回退键实落 `flows/mission-driver.json` 顶层 `maxFailures: 3`（mission flow config 通道，镜像 :7 `maxAuditRounds` 先例；键对引擎惰性——flow-loader 无严格 schema 校验（WI22 live 核实先例），消费方 = resolveMaxFailures 经 `missionConfig.flow`；双源现值一致 3/3 无行为变化）；`missions/autonomy.policy.yml` 头注 :11-12 schema-reserved 句同步兑现（limits.maxFailures 语义生效注记）。
- [ ] `Proof` 终态真值表：`node --test plugin/dsh/test/supervisor-terminal.test.mjs` ≥16 用例——四规则正反例 + 顺序优先（R1 命中时 R2–R4 不评估）+ R1 三岔（全 done→completed / 未勾→partial / active 带未过期 claim→continue）+ partial/blocked 区分矩阵（R3 held>0→blocked / R3 held==0→partial / R4→blocked / 叠加取 blocked / 复合声明值归一）+ R2/R3 边界（audit-rounds ≥1 vs 0；有 draft 不终态）+ R4 注入边界（N-1/N 轮）+ maxFailures 双源矩阵（policy/mission/双缺三态）+ 幂等重评（同 snapshot 两次求值同结果）。

Exit Criteria:

- [ ] R1–R4 求值核心 + resolveMaxFailures 落地；双入口同源；真值表 ≥16 用例全绿
- [ ] `pnpm --prefix tools/mission-driver test` 全绿（law-policy 增函数回归；基线 ≥904 只增）
- [ ] `docs/logs/` 更新

## Phase 2 — failures 归因桶 + 计量接线 + 熔断

Targets: `docs/design/age-autonomy/02-rule-law.md`（§4.6 增量 + changelog）、`plugin/dsh/src/supervisor/`（计量接线 + 熔断）、`plugin/dsh/test/supervisor-failures.test.mjs`（新）
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [ ] `Add` 归因桶成文 + meter 接线：三桶枚举（`executor-error` / `verification-red` / `claim-expired-no-output`）计/不计规则成文进 02 §4.6 增量（owner doc Add 面由本 plan 持有，changelog 行记 M3-WI27；01 §6 failures 行已具名三桶——02 增量与之互指即可，01 不另改 = No owner-doc update required for 01）——计：执行派发运行出错（executor-error）/ mechanical-verification 命令 exit ≠ 0（verification-red）/ claim 到期且无产出被回收（claim-expired-no-output）；不计：守夜人自身写盘 CAS 冲突重试、恢复扫描的观察类记录、双驱动幂等跳过（防计数噪音，逐条成文）；1411-2 失败点接线（mechanical-verification 失败 → verification-red；执行派发错误 → executor-error；reclaim 回收 → claim-expired-no-output——各点经 1411-1 writer 写 plan frontmatter failures）。
- [ ] `Add` 熔断：`failures ≥ maxFailures` → status 写 held + hold 理由（1411-1 writer——held 写入是守夜人合法边，01 §5.1）+ 回执；全部 held ∧ 不存在可执行/可评审 open plan → 终态化 partial/blocked + 回执（经 Phase 1 求值核心同一实现——双入口同源纪律；03 §4 暂停循环条件——单 held 不阻塞其他 plan 的执行/评审）；held→active 解锁同写重置 failures=0（writer-identity 既有执法面消费注记——零规则改动）。
- [ ] `Proof` 熔断测试：`node --test plugin/dsh/test/supervisor-failures.test.mjs`——三桶计数正确性（fixture 注入三失败源各计一次）+ 不计规则负例（CAS 重试/观察记录不计）+ held 写入（frontmatter status+hold+failures 同写形态）+ 全 held 终态 + 单 held 不阻塞（其他 plan 派发继续）+ 重置边（held→active 同写 failures=0）。

Exit Criteria:

- [ ] 三桶计/不计规则成文于 02 §4.6；三个失败点接线落地
- [ ] 熔断四态（held / 全 held 终态 / 单 held 不阻塞 / 重置）行为有测试钉住
- [ ] 02 owner doc 增量经 roadmap 侧引用可查（changelog 行在册）
- [ ] `docs/logs/` 更新

## Phase 3 — 终态接线 + 文档同步与回写

Targets: `plugin/dsh/src/supervisor/`（终态出口执行）、`tools/mission-driver/CONTEXT.md`、`docs/architecture/dsh-plugin-packaging.md`、roadmap、`docs/logs/`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [ ] `Add` 终态出口执行：1411-2 terminal 决策对象 → 求值核心 → 终态回执（receipt 面尽力投递发起会话/人工 + `mdcontrol.status` 透出）+ 循环停派；R1 预算耗尽路径与 audit-rounds-overflow deny 面对齐注记（门禁 deny 新审计派发 + 守夜人 R1 收口双面，行为互补非重复）；跨重启幂等（重扫重评同结果——Phase 1 真值表钉住的运行时面）。
- [ ] `Add` 文档同步与回写：02 §4.6 changelog 行（Phase 2 已落正文）；03-supervisor.md changelog（R1–R4 执行面落地注记——非契约变更）；CONTEXT.md 增终态规则段；packaging doc 测试文件条目；roadmap WI27 tick + 证据指针（求值核心/归因桶成文/maxFailures 双源/测试路径）+ Last Updated 同步；**Follow-up「mission config 前向引用缺失文件」自愈注记**（两文件 live 在位事实 + absorbed-by 指针——本批末 roadmap 单点维护，0950-3 先例）；`docs/logs/` 收口条目。
- [ ] `Proof` 收口面：`node --test plugin/dsh/test/supervisor-terminal.test.mjs` + `node --test plugin/dsh/test/supervisor-failures.test.mjs` 全绿；`pnpm --prefix tools/mission-driver test` + `./verify-age.sh` 全绿（引擎 ≥904 / 插件 ≥223 / 真值表 ≥113 只增）；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0（law-policy/mission config 变更后的配置校验回归）。

Exit Criteria:

- [ ] terminal 出口经求值核心端到端可测（决策对象 → 回执 + status 透出 + 停派）
- [ ] roadmap WI27 `[x]` + 证据指针；Last Updated 同步；Follow-up 对应行 absorbed-by 注记在册
- [ ] CONTEXT.md / 02 / 03 / packaging doc 增量在位；`docs/logs/` 收口条目
- [ ] `./verify-age.sh` + mission-check 全绿（L2.5 corpus 覆盖本 plan）

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1411-3-m3-wi27-terminal-rules-failures-buckets-1-c9e65038 to ses_reviewer_2026-08-26-1411-3
- 2026-08-26：iteration 1，共识 acceptable-with-changes #review-2026-08-26-130203-mission-driver-2026-08-26-1411-3-m3-wi27-terminal-rules-failures-buckets-1-c9e65038（独立评审 ses_reviewer_2026-08-26-1411-3：baseline 抽查全实证——openPlans ledger-sections.mjs:546 / awaitingClosure :554 / TRIGGER_TERMINAL_VALUES law-policy.mjs:47 / resolveMaxAuditRounds :483 / LIMITS_FIELDS maxFailures :34 / policy 头注 autonomy.policy.yml:11-12 与末条 trigger terminal: partial/blocked :145-146 / R1 deny 面注释 law-rules.mjs:628-629 / 两 Follow-up 文件 live 在位全对账；1411-1/1411-2 边界互认（Non-Goals 双向 + 1411-2 Deferred 移交面）无缺口无重叠；R4 注入 seam vs WI30 sound；格式合规（checkbox 仅 Phase 区列 0 / 无 per-Phase Status / 无 Closure Gates / verify ⊆ commands）+ gate-check allow；阻塞 2 项未修，iteration 2 须修 = ①「partial/blocked 显式区分」（WI27 字面）未操作化——Phase 1 求值核心枚举已分 completed|partial|blocked|continue 但 R1/R3 命中时 partial 与 blocked 的选择规则全文缺失（03 §8/02 §4.6 均只写复合值，恰是 WI27 要求显式化之处），且 Phase 1 Proof 用例仍写「未勾→partial/blocked」复合值与枚举自相矛盾——须补 Decision 成文选择规则（如 heldPlans()>0 ∨ 停滞命中→blocked、否则 partial）并把 Proof 用例改为两出口分别钉住 ②maxFailures「默认值进 mission config」（终审 P2-3）交付形态不明——Goals「双缺默认值成文进 mission config 面」可两读（落键 vs 仅成文），Phase 3 Proof 注「law-policy/mission config 变更后」暗示 mission config 实改，但 missions/age-autonomy-implementation.json（flow.maxFailures）与 missions/autonomy.policy.yml（头注 schema-reserved 句兑现）均未进任何 Phase Targets——须钉死是否向 mission config 落键并补 Targets（policy 文件经 plan Add item 合法可改）；非阻塞 4 项：R4 的 N 策略配置落点（03 §8「N 为策略配置」）注记归属 WI30、01 §6 计量表 failures 行已含三桶名建议与 02 §4.6 增量互加交叉引用、Phase 2「全 held 终态化」注明经 Phase 1 同一求值核心（双入口同源纪律覆盖此入口）、03 §8「M4 新增终态」与 roadmap M5/WI38 措辞漂移（设计基线既存）注记归 WI39）

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-26-1411-3-m3-wi27-terminal-rules-failures-buckets-2-d47a91be to ses_reviewer_2026-08-26-1411-3
- 2026-08-26：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-26-1411-3-m3-wi27-terminal-rules-failures-buckets-2-d47a91be（独立复核 ses_reviewer_2026-08-26-1411-3：两项阻塞修复落地且 sound——①partial/blocked 显式区分已成文为 Phase 1 Decision（blocked = R3∧held>0 ∨ R4，叠加取 blocked；partial = R1 未全 done ∨ R3∧held==0；复合声明值经求值核心单点归一，policy 声明面不动；备选两条均含 rationale），Proof 用例已改「未勾→partial」+ 新增区分矩阵五例，与枚举自洽（R1∧held>0→partial 属裁定内刻意取向——预算耗尽主导因，成文于备选 B 否决理由，微观察留执行期裁量：矩阵可顺手补该边界例，不阻塞）；②maxFailures 交付形态已钉死——回退键实落 flows/mission-driver.json 顶层 maxFailures: 3（镜像 :7 maxAuditRounds live 核实为真；引擎惰性核实——engine.js 只读已知键零 maxFailures 消费面；resolveMaxAuditRounds 经 missionConfig.flow 通道 law-policy.mjs:488-490 同源），policy 头注兑现入 Phase 1 Targets（policy 头注自定「plan Add item」合法写入面 + P8 active-plan 例外成立），Goals 与 Add 项措辞一致无两读；三项非阻塞注记全部落地（R4 N 阈值 WI30 归属 / 01 §6 互指 + No owner-doc update required for 01 / 全 held 终态经 Phase 1 求值核心）；ledger 格式复核干净（checkbox 仅 Phase 区列 0 / Item Types 对齐 / 无退役构造 / 迭代 1 回执区原行原序）+ gate-check allow；无新引入问题）

## Verification

## Closure

## Deferred But Adjudicated

### R4 停滞指纹供给

- Classification: `watch-only residual`
- Why Not Blocking Closure: 本 plan 消费 stagnation 注入事实（接口钉住于求值核心入参）；指纹检测 machinery（账本 hash + 活动信号连续 N 轮判定）= WI30，接线前 R4 由注入面单测钉住语义。
- Successor Required: yes（M3-WI30）

### 独立形态终态退出码

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: DSH 形态回执不依赖退出码（03 §8 终态映射纪律）；EXIT_MAP 是冻结契约，增补须独立立项 + exit-map.test.js（M5/WI38 字面）。
- Successor Required: yes（M5/WI38）
