# AGE Autonomy 设计文档审查报告

> Status: audit record（设计审查记录）
> Date: 2026-08-24
> Scope: `docs/design/age-autonomy/` 六文件
> Reference: `docs/analysis/2026-08-24-0003`（M4 本质设计）、`-0004`（M4 可行性红队核查）、`docs/discussions/2026-08-24-roadmap-plan-frontmatter-reform.md`、`docs/plans/00-plan-authoring-and-execution-guide.md`、`tools/mission-driver/src/{exit-map.js,config.js}`、`docs/design/dsh-plugin-integration.md`
> Method: design-doc-audit + state-machine-business-review + multi-dimensional-audit（按 docs/skills 路由）；修订后做全文一致性冷回放。

## Verdict

`pass`（修订后通过；仍需 human approval 才能成为 supported baseline）。

本次审查不是只盖章：原六文档存在 4 个 P0 级与 10+ 个 P1 级问题，已直接修订到文档中。修订后六文档互相一致，并与上述红队报告的核心前置条件对齐。剩余风险见 §4。

## P0 发现与处置

| # | 发现 | 影响 | 处置 |
| --- | --- | --- | --- |
| P0-1 | R1 `audit-rounds ≥ maxAuditRounds → completed` 在 roadmap 未完成时先于 R3 命中，静默 completed | 预算耗尽会把「卡住」误报为「干完」，正是 R3 要消灭的 bug | 03 §8 R1 改为分支终态：账本干净才 completed，否则 partial/blocked + 回执 |
| P0-2 | Review Hold 状态在 01（held）与 03/05（保持 draft）互相矛盾；`held` 与 draft 的机器语义未统一 | 执行器无法可靠排除阻塞项；门禁无法裁决 | 统一为 `status: held`；03/05 同步改为 held 不被拾取，单个 held 不阻塞其他可执行 plan |
| P0-3 | claim 与 review/audit 派发登记只有概念、没有存储位置；P2 说插件零记忆，但 claim 又是跨 session 并发正确性状态 | 重启后孤儿 claim 无法回收；实现者可能自写 Closure 蒙混完成 | 01 §4.4 明确 claim 进 plan frontmatter；dispatch 行 + 同 id 结论行 + 被派发 session id 内联于 plan 区块，不设独立 registry |
| P0-4 | `gate : (proposedAction, currentFileState)` 缺 actor 与 proposed content，却要求写者身份门禁 | 按签名无法实现 draft→active / audit 回执验证 | 02 §2 扩展 `proposedAction`（path/proposedContent/baseHash/actor）；CI 无 actor 时只跑结构子集 |
| P0-5 | 全勾过渡门禁要求「最后一勾时已有审计回执」，但审计要等全勾后才派发——每个 plan 都会卡死在最后一勾 | 正常闭环不可达 | 02 §4.3 二分：已有回执校验完成公式；无回执但写者持有效 claim → 进入派生中间态 `awaitingClosure` 并触发审计；无 claim → deny |
| P0-6 | 审计拒绝要求把返工项写回 Phase，但 Phase 勾选只允许 claim 持有者——审计者无 claim，拒绝闭环不可达 | 审计拒绝路径死锁 | 增 `## Closure Findings` 计数域：审计者以 dispatch 身份追加 `- [ ]` 返工项（无需 claim）；执行者 claim 后勾选；完成公式与全勾过渡均含该域 |

## P1 发现与处置

| # | 发现 | 处置 |
| --- | --- | --- |
| P1-1 | 状态枚举漏掉现 guide 的 `cancelled/superseded/deferred`（replaced），终态计划无法表达 | 01 §4.1 加入可写终态；`replaced` 迁移并入 `superseded`；终态不原地复活 |
| P1-2 | `failures` 跨 run 累计但解锁后不重置，held→active 会立刻再次熔断 | 01 §6 / 02 §4.6 / 逐边表 T6：解锁写入同次重置 `failures` |
| P1-3 | 完成派生公式漏掉 `status: active`，held/非法态也可能派生成完成 | 01 §5.2 公式补 `p.status == active` |
| P1-4 | nothing 兜底门禁在「全部 held / 无可起草」时仍强制重新起草，形成活锁或死循环 | 02 §4.4 改为：nothing 声明只触发 mission 级 Deep Audit，完成/partial 只由 R1–R3 终态规则产生；不再把「无可起草」当直接终态，也不无限重试同一 drafter |
| P1-5 | BUILD_VERIFY 直接执行命令的来源未限制，plan 可注入任意 shell | 02 §5 限定 `verify` 只能是 mission config `commands.*` 的 key，plan Proof 只作证据引用；进入 awaitingClosure 后先机械验证再派 Closure Audit |
| P1-6 | Supervisor「不写状态」与 meter 写 frontmatter 自相矛盾；未明确 Supervisor 必须是确定性代码 | 03 §1 改为「不写业务状态，只写三类机器登记；绝不是 AI 判断环节」 |
| P1-7 | trigger 规则称「声明式」但 DSL 无 trigger 段 | 02 §3 DSL 增 `triggers:`；03 §3 明确守夜人只执行声明式规则 |
| P1-8 | 终态谓词「无 open finding」无机器表示 | 01 §5.2 改为 open finding 不设独立通道，统一表达为 plan/roadmap 未勾项；R2/R3 改用 `openPlans()` |
| P1-9 | occurrenceKey `planId + iteration` 的 iteration 未定义；claim 与 occurrenceKey 双轨 | 03 §5 改为账本派生键；幂等由 dispatch 行/claim 字段直接回答 |
| P1-10 | `missions/context-profile.json` 会被现有 mission scanner 当作 mission 列出 | 04 §4 移至 `docs/references/context-profile.json` |
| P1-11 | 文档自称「最终版/设计事实」，但 P0–P4 均未立项，可能被误当 supported baseline | 全部 status 改为「目标设计基线（候选最终版）」，00/05 标明当前受支持行为引用 |
| P1-12 | WI13 证据面在 M4 下会变 no-op 的结论未写入设计 | 00 §7 增 WI13 证据面注意：P1 是证据面重建，不是原样泛化 |
| P1-13 | `partial/blocked` 新终态没有 EXIT_MAP 契约纪律 | 03 §8 增终态映射纪律：独立形态暴露前必须显式立项改冻结契约 |
| P1-14 | review/audit 区 append-only 只有散文约束，无门禁 | 02 §4.8 增 append-only 门禁 |
| P1-15 | 乐观锁依赖宿主 edit CAS，但该能力未验证 | 02 §4.5 增 fallback：守夜人作为唯一机器字段写者 tmp+rename 原子落盘；P2 落地前必须实测二选一 |
| P1-16 | M4「步」的计量口径未定义 | 01 §6 定义 M4 步 = 被法律裁决的账本动作或一次派发 |
| P1-17 | P7 只写 CLOSURE_AUDIT/DEEP_AUDIT，multi-audit 遗漏 | 00/04 补 multi-audit |
| P1-18 | roadmap 可被多 mission 共享时 `audit-rounds` 会跨 mission 串账 | 01 §3.1 增边界：一个 roadmap 只归属一个 mission |
| P1-19 | 单个 held plan 会暂停整个连续循环（与 05 典型一天矛盾） | 03 §4 改为单个 held 不阻塞其他可执行/可评审 plan |
| P1-20 | 停滞检测只看账本 hash，会把「长任务尚未落盘」误判为空转 | 03 §7 活动信号（events/session 工具活动）必须参与 |
| P1-21 | completed 派生后若允许继续编辑，旧 accepted 回执可被新增未勾项复用 | 01 逐边表 + 02 §4.3/§4.7 增终态冻结门禁：completed/可写终态后 Phase/status/机器字段不可再写，重新开工 = 新建 plan |
| P1-22 | P7 提到 DEEP_AUDIT/multi-audit，但账本只定义了 plan 级审计记录，mission 级审计无落点 | 01 §3.3 增 roadmap `## Deep Audit Record` 同构绑定；02 DSL 增 `roadmap-audit-binding`；发现落 roadmap 未勾项 |
| P1-23 | `audit-rounds` 未说明计的是 mission 级 Deep Audit 还是含 plan Closure Audit | 01 §3.1 明确只计 Deep Audit 轮次，plan Closure Audit 不消耗；02 trigger 增 deep-audit findings 后续规则 |
| P1-24 | 机械验证未进入完成派生公式；旧 pass 行可被返工后的新全勾复用 | 01 §5.2 完成公式增 `Verification` 通过且 basisHash==当前全勾内容；`verify` 进 plan frontmatter；02 trigger 拆 mechanical-verification → closure-audit |
| P1-25 | 现 guide 的 `Closure Gates` 清单未纳入机器面；若保留可写清单，执行者可自证独立性 | 01 §4.3 裁定 Closure Gates 消解：可执行项并入最后 Phase，独立性/验证/一致性由完成公式与门禁派生，不留可写 checkbox |

## Scope Reviewed

- 六文档全部行级审查；frontmatter 格式、状态格、门禁清单、Supervisor 五职责、终态规则、池化纪律、双形态入口。
- 与 0004 红队六项前置条件逐项比对：审计回执绑定、draft→active 身份、完成派生公式、claim TTL、meter 持久化、nothing/BUILD_VERIFY/EXIT_MAP/往返熔断均已落进设计。
- 与现 plan guide 的状态集比对：补回 terminal non-live 状态与 `replaced` 迁移映射。

## Residual Risks

1. **Human approval**：AI 修订的 owner-doc 级设计不能自行转为 supported baseline；需要 human 批准后立项 P0–P4。
2. **宿主能力两个未知数**：`tools/pre-execute` 是否暴露写入者 agent/session 身份；宿主 edit 是否具备 CAS 原子写。两者是硬门 2 与乐观锁的地基，必须在 P1/P2 立项首片实测（0004 §7 复核路径同）。
3. **`partial/blocked` 的 EXIT_MAP 映射**：本审查只确立「必须显式立项」的纪律，未擅自给退出码赋值（protected contract）。
4. **历史分析文档与修订后的设计存在可接受分叉**（例如 context-profile 原建议路径）：analysis/discussion 是历史依据，运行时以本设计为准；若后续再版分析，应同步该路径裁定。
5. **trigger DSL 的谓词语法与 schema**：本文档给出最小示例，P2 立项时须先写结构测试钉住，避免 DSL 又变成第二套不可测脚本。
6. **frontmatter 解析与存量迁移**：P0 的 codemod/双读过渡仍需独立 plan；guide 更新是格式唯一权威。
7. **本审查为同会话冷回放**，未动用第二 subagent；按 AGENTS.md Reviewer-Availability Fallback，候选设计基线仍需 human 或独立 subagent 终审。
