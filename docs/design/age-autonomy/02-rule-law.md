# AGE 自主运行架构 — 法律（Rule Law）

> Status: supported baseline（human 批准，2026-08-24）
> 定义机器强制的规则层：门禁作为纯函数、声明式规则 DSL、硬门清单、部署面。凡可机检的声称都进门禁；凡需判断的规则留在 guide 与散文。

## 1. Purpose

法律层把「不可违反的约束」从 AGENTS.md 散文与引擎代码中提出，落为**声明式、纯函数、可穷举测试**的门禁。AI 的自驱行为在此被裁决：合法则放行、非法则带回结构化理由的 deny——比二进制 pass/fail marker 更富信息，是谈判式而非开关式交互。

## 2. 门禁的本质

```
gate : (proposedAction, currentFileState) → allow | deny(reason)
proposedAction = {
  type: write | edit | str_replace_editor | claim | dispatch | terminal-claim,
  path, proposedContent, baseHash?,
  actor?: { id?: string, role: human | drafter | reviewer | auditor | supervisor | engine | executor }
}
```

- **纯函数**：无记忆、确定性、同一输入同一输出——可穷举测试（真值表风格），可同时跑在宿主内与 CI。`actor` 缺省时只能运行结构子集（CI / git hooks），身份断言在该部署面不参与 allow 判断，也不声称验证写者。
- **零信任 AI 自陈**：AI 的报告 = 文件写入本身；门禁校验写入是否合法。
- **结构化 deny**：deny 必带 reason 指向合法路径（如「完成需先有审计回执绑定：`#audit-xxx` 不存在 dispatch 行或 accepted 行」），AI 据此自修正。
- **信任模型（A1 裁定，2026-08-24）**：默认护栏——被执法者假设为「诚实但会犯错」，门禁是护栏不是安全边界。因此 bash/sed 等非拦截通道的等价写入属**成文接受的漏杀面**（与 plan-status-gate 既有 D 系列裁定一致），由 CI / plan-check 结构匹配 + git 历史归因事后兜底。对抗级保证只保留宿主在 pre-execute 边界零成本可得的三种：写者身份（actor）、audit-id nonce、CAS（乐观锁）。**重开触发**：一旦出现伪造回执/篡改账本的现实案例，立即立项受控变更通道（子代理只提交 proposed content、守夜人统一落盘）。执法层自体（P8）是唯一无条件对抗级的面，见 §4.7。

## 3. 声明式规则 DSL

规则以项目内唯一声明式文件 `missions/autonomy.policy.yml` 承载（schema 由 guide 规定，路径可被 mission 配置覆盖）；插件读取并应用；schema 版本化、结构测试钉住。`{{plansDir}}` / `{{roadmapPath}}` 按**当前 mission 上下文**解析（项目策略一份，路径随 mission 配置变化），不写死目录。

```yaml
version: 1
gates:
  - id: plan-structure
    match: "{{plansDir}}/**/*.md"
    rule: plan-structure                # §4.7 + 01-file-ledger §2
  - id: completion-derivation
    match: "{{plansDir}}/**/*.md"
    rule: plan-completed                # 见 §4.3
  - id: draft-to-active
    match: "{{plansDir}}/**/*.md"
    rule: writer-identity               # 见 §4.2
  - id: hold-unlock
    match: "{{plansDir}}/**/*.md"
    rule: hold-transition               # 见 §4.2 / §4.6
  - id: audit-binding
    match: "{{plansDir}}/**/*.md"
    rule: closure-audit-binding         # 见 §4.1
  - id: append-only-records
    match: "{{plansDir}}/**/*.md"
    rule: record-append-only            # 见 §4.8
  - id: nothing-claim
    match: "action:terminal-claim"      # 终态声明是动作，不是文件路径
    rule: nothing-claim-guard           # 见 §4.4
  - id: claim-taken
    match: "{{plansDir}}/**/*.md"
    rule: claim-validity                # 见 §4.5
  - id: roadmap-audit-binding
    match: "{{roadmapPath}}"
    rule: roadmap-audit-binding         # 见 §4.1
  - id: meter-guard
    match: "{{roadmapPath}}"             # roadmap frontmatter
    rule: audit-rounds-overflow         # 见 §4.6
triggers:                                # 守夜人读取，详见 03-supervisor
  - when: "plan.full-tick ∧ mechanical-verification-missing"
    dispatch: mechanical-verification
  - when: "plan.full-tick ∧ mechanical-verification-pass ∧ closure-receipt-missing"
    dispatch: closure-audit
  - when: "plan.status=draft ∧ review-dispatch-missing"
    dispatch: plan-review
  - when: "plan.status=active ∧ claim-expired"
    action: reclaim-claim
  - when: "terminal-claim=nothing-to-draft ∧ draftPlans()==0 ∧ activePlans()==0"
    dispatch: deep-audit
  - when: "deep-audit accepted findings=items"
    dispatch: draft-plans
  - when: "deep-audit accepted findings=none ∧ draftPlans()==0 ∧ activePlans()==0 ∧ roadmap 有未勾"
    terminal: partial/blocked
agents:                                  # 具名 agent（A7 裁定；schema 见 §4.9；组合面见 04-efficiency §5）
  drafter:
    mode: pooled                         # pooled | fresh（P7：auditor 必 fresh）
    poolKey: "drafter:{projectRoot}"
    idleTtlMinutes: 30
    rotateEvery: 8
    fixedPrefix: [ { kind: text, ref: prompts/draft-charter.md } ]
    model: { provider: p, model: m, reasoningEffort: default }
  auditor:
    mode: fresh
    model: { provider: p2, model: m2, reasoningEffort: high }
    requireDistinctModel: true           # 独立性下限：派发时强制 ≠ 执行者模型
dispatch:                                # 派发类型 → 具名 agent（提示词/trigger 只提派发类型）
  plan-review: reviewer
  closure-audit: auditor
  deep-audit: auditor
  execute: executor
  draft-plans: drafter
```

**判定纪律**：可机检才进门禁；需要 judgment 的规则（何为好计划）留 guide/散文。边界可放宽时一律 fail-open + 观察日志，先 shadow 后 enforce（见 §6）。`agents`/`dispatch` 是「谁干活」的部署面映射，不是法律判定——其语义与保护见 §4.9。

## 4. 门禁清单

### 4.1 审计回执绑定（硬门 1）

- 目的：独立审计的结构保证——实现者无法自写 Closure 区蒙混完成。
- 机制：守夜人/引擎派发审计时，在 plan 的 `## Closure` 区写入 `dispatch audit #audit-<runId>-<plan>-<round>-<nonce8> to <auditorSessionId>` 行并签发该 id；审计者只能追加同 id 的 `accepted`/`rejected` 结论行；完成放行校验 `dispatch 行存在 ∧ accepted 行存在 ∧ 两行 id 相等 ∧ accepted 行写者 == dispatch 行 auditorSessionId ∧ dispatch 行写者 = 派发方自身`。
- 强度：防伪强度 = dispatch 行写者身份门禁 + audit-id 的不可预测性（nonce）。独立"思考"本身无法机械验证（今天亦然）——只验证独立派发发生且回执匹配。该强度在工具面（write/edit/str_replace_editor）成立；经 bash 等非拦截通道的伪造**成文降级**为护栏强度（CI 结构匹配 + git blame 归因，见 §2 信任模型 A1 裁定），不另行立项，重开触发同 §2。
- **model lineage（G4 机制化）**：派发方在 dispatch 行附 `models={exec:<agent名>,aud:<agent名>}`（或实际 provider/model）——驳回率按 (执行, 审计) agent/模型对统计，「同源同模型」天花板从不可解变为可测数据；audit agent 的 `requireDistinctModel` 派发时强制，见 §4.9。
- 同一绑定形态同时用于 plan `## Closure` 与 roadmap `## Deep Audit Record`；发现落账本未勾项，不产生独立 finding 状态。
- CI / git hooks 无 actor 身份时只做「dispatch/accepted 同 id 结构匹配」，不声称验证写者；DSH 实时门禁才具备写者验证强度。

### 4.2 状态转移写者身份门禁（硬门 2）

- 目的：排除 drafter 自升 active、执行者自解锁 held 跳过 review。
- 机制：写 `status` 的动作必须来自该转移的合法写者（见 01-file-ledger §5.1 逐边表）：draft→active 的写者 actor.id 必须等于 Draft Review Record 中 dispatch 行的 reviewerSessionId，且该区含同 id 结论行；held→active 只能由守夜人执行人工 unlock（经 `mdcontrol.unlock` 路由）或新评审派发的 reviewer 写入，且同一次写入重置 `failures`；终态 disposition 由守夜人执行人工 disposition 或已登记评审者写入。执行者 actor 永远无权写 `status`。
- **评审租约**：Draft Review Record 出现未闭环的 `dispatch review` 后，除该 reviewerSessionId 与守夜人/引擎外，其他 actor 对 plan 的写入 deny；结论行落地（active 或 held）后租约结束。
- 前置：宿主 pre-execute 暴露 agent/session 身份（DSH 形态）；独立形态由引擎派发保证（现状已有结构性隔离）。

### 4.3 完成派生校验（硬门 3）

- 目的：把 01-file-ledger §5.2 完成公式变成放行条件。
- 机制：按**写入后的整文件 proposed content** 判定是否发生「全勾过渡」。若进入全勾：
  - 已有有效审计回执且机械验证通过 → 校验完成派生公式 `status=active ∧ 全勾 ∧ 机械验证通过 ∧ 审计回执绑定 ∧ 派发登记匹配`，成立才 allow；
  - 尚无审计回执 → 仅当当前写者持有有效 claim 时 allow，plan 进入派生中间态 `awaitingClosure`（01 §5.2）；守夜人先清除 claim 并按 §5 直跑机械验证、写 `## Verification` pass 行，全部通过后才派发 Closure Audit；验证失败 → 守夜人追加 Closure Findings 返工项并按归因递增 `failures`；无 claim 或 claim 不属于写者 → deny + reason。
  - 审计拒绝时，发现以 `## Closure Findings` 的 `- [ ]` 返工项追加进 plan（审计者身份允许，不需 claim），plan 自然脱离全勾，不依赖额外状态位。
- 全勾过渡门禁粒度：整 plan 文件粒度，与完成派生的判定同域；计数域 = Phase 区块 + Closure Findings 区块；所有谓词共用 01-file-ledger §5.2 的同一实现。
- **终态冻结**：一旦 `completed(p)` 或 `status ∈ {cancelled, superseded, deferred}`，拒绝任何 Phase checkbox / `status` / 机器字段再写入；重新开工必须新建 plan。这同时防止「已 accepted 的旧审计回执被新未勾项复用」的漏洞。

### 4.4 nothing 声称兜底门禁

- 目的：AI 无法把「无可起草」直接当成 mission 终态（roadmap 未完成却停）。
- 表示：起草者把声明写成 run 内文件（`_tmp/<runDir>/terminal-claim.json` 或 run-state 终态记录），内容含 `kind: nothing-to-draft`；该文件是动作记录，不是账本状态。
- 机制：守夜人收到该动作后调用门禁：
  - `draftPlans()>0 ∨ activePlans()>0` → deny（存在可见未完成工作，不得声称无可起草）；
  - 否则 allow 为 **Deep Audit 触发**，由守夜人派发 mission 级 Deep Audit 并自增 `audit-rounds`（见 01 §3.3）。
- **终态与活锁防线**：Deep Audit 结论落为 roadmap/plan 未勾项后正常继续；若审计后仍 `draftPlans()==0 ∧ activePlans()==0 ∧ roadmap 有未勾`，由 03-supervisor R3 收口 `partial/blocked`；若 `audit-rounds ≥ maxAuditRounds` 则 R1 收口——不会退回同一 drafter 无限重试。
- 这是 M1「信 marker 不验证」缺失的机器发现点——净强于现状。

### 4.5 认领合法性门禁（claim 原语）

- 目的：寻址 + 防并发重做。承接 Flow DSL 的 flowArgs/forEach 管道职能。
- 机制：执行子代理必须先对目标 plan 取得有效 claim；claim 落在 plan frontmatter（`claim`/`claim-expires`），同 plan 同时只有一个未过期 claim；claim 过期或无产出 → 守夜人回收并重派。
- **写者**：claim 由守夜人/引擎写，不由执行子代理自写；执行者勾 checkbox 时门禁校验 `actor.id == claim 中编码的 holderSessionId ∧ claim 未过期`。
- 写回并发：roadmap/plan frontmatter 写回用乐观锁（hash CAS）串行化。宿主 CAS 能力事实（源码核实，讨论记录 A6 G5）：`fs/edit-intent` / `fs/write-intent` 单决策槽存在（走 `ctx.waterfall`），但被 base bundle 默认挂载的 fs-observation-policy 占据（不调 next()）——法律层走 CAS 必须**三选一**：① 与 observation-policy 集成同一槽位；② 替代其槽位；③ 守夜人作为唯一机器字段写者串行落盘（tmp+rename 原子替换），子代理只提交 proposed content。**Q4 三选一未裁决**：P2 首片实测确定路由（终审记录 `docs/audits/dsh-plugin/2026-08-24-age-autonomy-design-final-review.md`）。

### 4.6 预算闸

- `audit-rounds ≥ maxAuditRounds` → deny 进入新审计轮次，mission 按 03-supervisor R1 收口；
- `failures ≥ maxFailures` → 该 plan 转入 held + 回执；held→active 的解锁写入必须把 `failures` 重置为 0；
- 步数/墙钟（run 内）→ 守夜人计量熔断。

**failures 归因桶（M3-WI27 增量，写者 = 守夜人 meter 面）**：`failures` 只按归因桶计数，桶枚举与计/不计规则如下（计量表语义见 01 §6 `failures` 行，互指单一来源）：

| 桶 | 计（各 +1） | 依据点 |
| --- | --- | --- |
| `executor-error` | 执行派发的创建/换发/运行出错（agent 会话创建失败、claim 再发放写失败、执行臂异常）；策略解析拒绝属配置面，**不计** | 执行派发失败点（reclaim/execute 派发路径） |
| `verification-red` | mechanical-verification 命令 exit ≠ 0（每次红跑计一次；红跑不写 pass 行） | 机械验证失败点 |
| `claim-expired-no-output` | claim 到期且无产出被回收（active 越过 TTL 未完成即无产出；仅回收实际清除 claim 时计） | reclaim 回收点 |

**不计清单（防计数噪音）**：守夜人自身写盘 CAS 冲突/受限重试（基础设施噪音，下轮重扫重决）；恢复扫描的观察类记录（故障已在归因点计过，重启面只观察）；双驱动幂等跳过（dedup 面拒发 = 该 occurrence 已在处理，再计即双算）；**恢复 redispatch**（崩溃重派不重复计 `failures`——03 §6「不把单次崩溃计为计划失败」字面落点；恢复路径的 `recordPlanFailure` 调用点为空，重派动作本身经 observation 回执记录，M3-WI29）。

**maxFailures 双源（终审 P2-3 收口）**：policy `limits.maxFailures` 权威 / mission flow config `flow.maxFailures` 回退（`flows/mission-driver.json` 顶层键，镜像 maxAuditRounds 通道）/ 双缺默认 3——解析面 `law-policy.mjs` `resolveMaxFailures`（单权威+单回退纪律）。熔断执行（03 §7）：`failures ≥ maxFailures` → held + hold 理由 + 回执（同写清除 claim——claim 只存在于 active，02 §4.5 ⑤）；held plan 不阻塞其他可执行/可评审 plan（03 §4）；全部 held ∧ 无可执行 open plan → 经 03 §8 R1–R4 求值核心终态化 partial/blocked + 回执。

### 4.7 路径与结构护栏

- plan 文件只能落在 mission 配置的 `plansDir` 域内；frontmatter 必须符合 01-file-ledger §2 的扁平子集；`work-item` 必须命中 roadmap 已登记项；roadmap 写回只能改已登记 work-item 的 checkbox。
- 越域写 / 非法 frontmatter / 未登记 work-item → deny；对已完成派生或可写终态 plan 的 Phase/status/机器字段写入 → deny（终态冻结）。
- **执法层自护（P8）**：law 实现（`plugin/dsh/src/law/**`）、策略数据（`missions/autonomy.policy.yml`）、执法 CLI（`tools/mission-driver/src/{plan-check,gate-check}.mjs`）对 AI 写一律 deny；人工 / CI / 已批准立项路径为合法例外。被执法者不得改写执法者自身——法律层单点失效的唯一防线，属 A1 裁定下唯一无条件对抗级的面。

### 4.8 评审与审计区 append-only

- `## Draft Review Record`、`## Verification`、`## Closure` 区与 roadmap 的 `## Deep Audit Record` 区只允许**追加新行**；删除或改写既有 dispatch/结论/pass 行 → deny。
- 目的：防止实现者事后覆盖「审计拒绝」共识、伪造机械验证通过或删除既有 pass；git 历史负责可归因，门禁负责当前文件不可改写。

### 4.9 具名 agent（agents / dispatch）——「谁干活」的部署面映射

- 目的：把「哪个具名 agent 执行哪类派发、它用什么模型/提示词组合/工具面/池化生命周期」从契约面剥离。AGE 提示词与 trigger 只提**派发类型**（plan-review / closure-audit / deep-audit / execute / draft-plans），零 agent 名、零模型、零工具配置——双形态可移植性由此成立。
- 语义：`agents:` 定义具名 agent（`mode` pooled|fresh、池化参数、`fixedPrefix` 组合、`model: {provider, model, reasoningEffort?}`、`requireDistinctModel?`——model 字段措辞对齐宿主 ModelSelection，reasoningEffort 即思考级别）；`dispatch:` 把派发类型映射到具名 agent；plan frontmatter 的 `agent:` 只能引用 policy 内已定义的名字（结构校验），缺失时用 `dispatch:` 映射默认。派发类型是契约、agent 名是部署——同一 roadmap 换部署只改 policy 的 agents 段。
- **fixedPrefix 块 schema**（WI13 结构测试钉住）：`{kind: text|file|dir, ref: <path>, maxFileBytes?: number}`——dir 模式强制目录全文嵌入并设上限防 token 爆炸（示例见 04-efficiency §5；终审 P1-3）。
- **plan 级引用示例**：plan frontmatter `agent: "auditor"` 引用 policy 已定义的 auditor；未定义名由结构校验拦截，不得凭空造名（终审 P2-6）。
- 完整性（A1 承袭 + P8）：`agents`/`dispatch` 是 law 数据（A2 已保护）——执行者无权定义/改写 agent 名含义（如审计者 charter 或模型），只能引用；plan 级 `agent:` 引用也不能伪造「审计者是另一模型」的声称，因为实际绑定由派发方（守夜人/引擎）解析。
- 独立性下限：audit agent 若 `requireDistinctModel: true`，派发时校验其绑定模型 ≠ 执行者绑定模型（provider/model 对）；不满足 → 拒绝该次派发并在观察日志显式记录（单模型部署 = 显式降级，不静默）。相应 model lineage 落 dispatch 行（§4.1）。
- 双形态映射：DSH 形态 → 宿主 preset 组合（`missions/base.json` `agent` 选择基础组合）+ `agents.create` 的 agentProvider/agentModel/reasoningEffort（补 native-executor 的 ModelSelection documented gap）；独立形态 → 复用 config.js 既有 model/variant/agentFile 通道；CI 形态只做结构校验（agent 名存在、audit 角色默认完整、requireDistinctModel 可满足性），不解析模型。
- 池化边界（P7 承袭）：`auditor` 必须 `mode: fresh`——CLOSURE_AUDIT / DEEP_AUDIT / multi-audit 对应的 agent 永不入池。
- 明确否决：AI 自由选裸模型/裸配置（成本游戏 + 自审合谋）；允许的只是「从 policy 有界 agent 名单里选」。per-step agent 不提供（粒度过度）。

## 5. BUILD_VERIFY 机械化

- 现状：BUILD_VERIFY 是 AI 步，AI 自跑命令并自报 pass/fail——引擎信自陈。
- 最终：plan 进入 `awaitingClosure` 后，由守夜人**直接执行** plan frontmatter `verify` 列出的 command key（缺失时用 mission 默认集合）对应的 `commands.test/build/lint/typecheck`，exit code 即放行条件；全部通过后写 `## Verification` pass 行（basisHash 绑定全勾内容），再派发 Closure Audit——严格强于 AI 自报，且成为完成派生公式的硬前置。
- **命令来源纪律**：`verify` 只能是 `commands.*` 的 key 枚举，且对应命令必须非空；plan 的 Proof 只是证据引用，不得成为可执行命令来源（防 plan 注入任意 shell）。
- 独立形态：同一命令在 CI 跑，作为 merge-blocking 门禁。

## 6. 部署面与上线纪律

| 形态 | 部署点 | 说明 |
| --- | --- | --- |
| DSH 插件 | `tools/pre-execute` 监听器 | 拦截 write/edit/str_replace_editor 与 claim/dispatch/terminal-claim 动作，校验 proposed content + actor。适配层 `plugin/dsh/src/law/host-adapter.ts`（M2-WI12）：policy 加载 + 内核 evaluate + 观察日志（`_tmp/law-observations.jsonl`），与 plan-status-gate 并存 |
| 独立形态 | CI job + git pre-commit hook | 同一套纯函数的结构子集（无 actor），作为合并/提交门禁（接线 WI23） |
| 手动文件流 | `plan-check.mjs`（frontmatter 版）+ `gate-check.mjs` | 纯校验 CLI：`gate-check.mjs --policy <file>` 校验 policy schema；`gate-check.mjs <plan.md>` 单文件结构面评估（02 §6 部署面 3，M2-WI12） |

**上线纪律**：一般门禁先 observe-only（记录而不拦截）积累真实日志 → 校准 matcher/规则 → 再切 enforce；fail-open 默认，无证据面时 allow + 观察日志（从未跑过引擎的项目手写文档合法）。**例外**：P0 迁移完成后的三硬门与 append-only 门禁直接 enforce——它们防的是净倒退，不是新增便利。WI13 门禁的误杀教训（字面规则 kill 掉合法 in-run 编辑）作为此类工程的默认反例存档。

## 7. 与「判断」的分界

- 门禁只裁决**可判定事实**：文件存在、hash 相等、状态位值、计数未超限、dispatch/accepted 行匹配。
- 计划质量、scope 是否诚实、closure 证据是否充分——这些是判断，由独立评审 agent 依 guide 完成（Draft Review Record / Closure 内联），门禁只保证「该审的审了」（派发+回执绑定），不保证「审得对」。

## Changelog

- 2026-08-26（M3-WI29，plan `docs/plans/age-autonomy/2026-08-26-1954-2`）：§4.6 增量——不计清单补第四行「恢复 redispatch」（崩溃重派不重复计 `failures`，03 §6「不把单次崩溃计为计划失败」字面落点；恢复路径 `recordPlanFailure` 调用点为空，重派动作经 observation 回执记录）；同 plan 附带两处窄域行为增量（均真值表钉住）：§4.2 评审租约改**最末 dispatch review 行作答**（superseded 行不持约、最末行配对即租约关闭——与幂等面最新行作答单一语义面，redispatch 后 plan 写面不锁死）+ §4.6 预算闸增**同轮次崩溃重派豁免**（新 DAR dispatch 行轮次号 ∈ 现 unpaired 在飞轮次集 = 同 occurrence 重派，轮次已付不耗预算不 deny，01 §3.1）。

- 2026-08-26（M3-WI27，plan `docs/plans/age-autonomy/2026-08-26-1411-3`）：§4.6 增量——failures 归因桶成文（`executor-error` / `verification-red` / `claim-expired-no-output` 三桶各计/不计规则 + 不计清单）+ maxFailures 双源解析（policy 权威 / mission flow 回退 / 双缺默认 3，`resolveMaxFailures`）+ 熔断执行语义注记（held 同写清 claim、单 held 不阻塞、全 held 经 03 §8 求值核心终态化）。
- 2026-08-25（M2-WI12/WI13，plan `docs/plans/age-autonomy/2026-08-25-0815-1`）：§6 部署面表补 gate-check.mjs 与 DSH 适配层实名（supported baseline 的最小事实性增补——内核 `tools/mission-driver/src/{law-core,law-policy}.mjs`、真实实例 `missions/autonomy.policy.yml` 已落地；本文其余契约无改动）。
