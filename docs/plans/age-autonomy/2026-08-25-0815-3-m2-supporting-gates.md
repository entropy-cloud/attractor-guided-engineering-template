---
status: active
mission: age-autonomy-implementation
work-item: M2-WI17+WI18+WI19+WI20
group: "2026-08-25-0815"
verify: [test]
---

# 2026-08-25-0815-3 M2 配套门禁：nothing-claim 兜底 + claim 合法性 + 机械验证 + append-only（age-autonomy M2-WI17+WI18+WI19+WI20）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` M2 WI17/WI18/WI19/WI20；契约 owner `docs/design/age-autonomy/02-rule-law.md` §4.4/§4.5/§4.8/§5
> Related: 前置 `2026-08-25-0815-1`（N=1，内核/policy/CLI/适配层）与 `2026-08-25-0815-2`（N=2，三硬门 enforce 先例与 claim→awaitingClosure 联动）；M1 的 0635-3（过渡期写者裁定 + `_scanOpenAuditsList` legacy 通道裁定）；M3 WI26/WI27（守夜人 trigger 执行与终态规则 R1–R4——本 plan 只交付门禁判定面）

## Current Baseline

**四条配套门禁全部空白：nothing 声称走 marker 通道「信而不验」、claim 只有形状校验无写者/持有者执法、机械验证是 AI 自跑自报、append-only 区只有行语法校验没有改写检测。**（以下事实 2026-08-25 live 核实）

- **nothing 声称现状（02 §4.4 指认的缺失面）**：DRAFT_PLANS 步以 `<AI_STEP_RESULT>nothing</AI_STEP_RESULT>` marker 表达「无可起草」，引擎 marker 解析即信（marker 迁移纪律：plugin 路径仅诊断/日志，但引擎侧无独立验证面）。无 `_tmp/<runDir>/terminal-claim.json` 动作记录、无 `draftPlans()>0 ∨ activePlans()>0` 交叉验证。谓词族已就绪（ledger-sections `draftPlans`/`activePlans`，M1/WI3）。
- **预算闸现状**：roadmap frontmatter `audit-rounds` 已解析（`scanRoadmapLedger`，M1/WI6；本 roadmap 现值 0）；`maxAuditRounds` 既有通道 = mission/flow config（engine.js:428 `flow.maxAuditRounds`，config.js:359 消费）；0815-1 落 policy `limits.maxAuditRounds`（policy 优先/mission config 回退裁定）。`audit-rounds ≥ max` 的 deny 门禁无实现（现状引擎只在审计额度上做流程层判定，法律层无面）。
- **claim 现状**：`validatePlanFrontmatter` 已有形状校验（`attempt-<runId>-<holderSessionId>-<nonce8>` + ISO-8601 claim-expires + 仅 active 成对，M1/WI2）；无写者执法（claim 由守夜人/引擎写、执行者不得自写——02 §4.5）、无勾选时 holder 匹配（actor.id == holderSessionId ∧ 未过期）、无同 plan 单活 claim 约束、无「awaitingClosure 前必清」转移执法。守夜人（合法写者）M3/WI25 才存在——M2 过渡期 claim 写者供给需裁定（见 Phase 2 Decision，承 0635-3 过渡期写者模式）。
- **机械验证现状（02 §5 现状描述精确成立）**：BUILD_VERIFY 步 = AI 自跑命令自报 pass/fail，引擎信自陈；pass 行语法 + basisHash 绑定的机器校验已有（`deriveCompleted` mechanical-verification 合取，M1）；`verify` key ↔ mission `commands.*` 的枚举约束未执法（`defaultVerifyKeys` 注入通道已存在，ledger-sections）；命令执行 util 不存在——executor.js 是 agent 步执行器（spawn opencode + 心跳/超时），不是 commands runner；需要新的零引擎 diff util。
- **append-only 现状**：ledger-sections 对 append-only 区做「行语法校验」（已知前缀严格/未知行容忍，M1/WI5）；无「既有行删除/改写」检测——currentFileState 与 proposedContent 的前缀保持比对（02 §4.8 的核心判定）不存在。0635-3/WI8 裁定 `_scanOpenAuditsList`/`AUDIT_STATUS_RE` 保留为 legacy-only 通道（完整退役归 WI20+WI22 track——本 plan 落 append-only 门禁后，外部审计通道的新造文件面不再被 law 豁免，退役余项归 WI22）。
- **enforce 授权**：append-only 门禁属 02 §6 例外（P0 后直接 enforce）；nothing-claim / audit-rounds-overflow / claim-validity / verify-keys 枚举属一般门禁（observe-first 默认）——四者的直接 enforce 偏离裁定见 Phase 1 Decision（四一般门禁姿态裁定）。
- **依赖注入面**：`draftPlans`/`activePlans` 谓词与 `defaultVerifyKeys` 均可注入（M1 设计）；mission 上下文（plansDir/roadmapPath/commands/maxAuditRounds）经 0815-1 config 注入面进入 gate ctx——本 plan 无新注入通道需求。

## Goals

- `nothing-claim-guard` 规则（02 §4.4）：terminal-claim 动作记录写入（`_tmp/<runDir>/terminal-claim.json`，kind: nothing-to-draft）的合法性门禁——`draftPlans()>0 ∨ activePlans()>0` → deny；否则 allow 且产出 Deep Audit 触发信号面（派发执行 M3/WI26）。
- `audit-rounds-overflow` 预算闸（02 §4.6）：roadmap frontmatter `audit-rounds ≥ maxAuditRounds`（policy 优先/mission 回退）→ deny 新审计轮次写入。
- `claim-validity` 规则（02 §4.5）：claim 写者角色执法 + 勾选时 holder/过期校验 + 单活 claim + awaitingClosure 前必清。
- `verify-keys` 枚举门禁 + commands runner util + gate-check `--verify <plan>` 执行面（02 §5）：`verify` ⊆ mission `commands.*` 非空 key；runner 执行命令采集 exit code 生成 pass 行数据（basisHash 绑定）；守夜人消费接口就绪（M3 接管执行）。
- `record-append-only` 规则（02 §4.8）：plan `## Draft Review Record`/`## Verification`/`## Closure` 与 roadmap `## Deep Audit Record` 区前缀保持判定（删除/改写既有 dispatch/accepted/pass/结论行 → deny），直接 enforce。
- `law-truth-table.test.mjs` 增补至 WI24 ≥30 基线（M2 收口门 WI24 本 plan 不勾——归下批 WI21–WI24 plan）。

## Non-Goals

- 守夜人 trigger 执行、Deep Audit 派发、reclaim、终态规则 R1–R4 执行语义（M3/WI26/WI27——本 plan 只交付判定面与触发信号数据）。
- BUILD_VERIFY prompt 步的机械化改造（02 §5 最终形态执行者 = 守夜人；过渡期写者裁定 0635-3 不变——runner 的 M2 消费面是 gate-check CLI 与测试，prompt 步不动）。
- Q4 CAS 槽位三选一路由（守夜人统一落盘路径立项时裁定，02 §4.5；0815-1 已定 baseHash 字段语义）。
- `_scanOpenAuditsList` legacy 通道退役与 run-state 证据面重建（WI22）；路径护栏/P8/CI 接线（WI21/WI23）；`<AI_STEP_RESULT>` marker 物理删除（M5 评估）。
- 复合 work-item 标签约定（`M2-WI17+WI18+WI19+WI20` 这类复合标签如何命中 WI21 的「work-item 命中 roadmap 已登记」跨文件校验）不在本 plan 裁定——留给 WI21 立项时定（本批三份 plan 均用复合标签，是该校验的输入语料）。

## Task Route

- Type: `architecture change`（法律层第二批规则 + 机械验证 util 面）
- Owner Docs: `docs/design/age-autonomy/02-rule-law.md` §4.4/§4.5/§4.6/§4.8/§5、`docs/design/age-autonomy/01-file-ledger.md` §3.3/§5.2、`docs/design/age-autonomy/03-supervisor.md`（trigger/R1–R4 接口消费方，只读引用）
- Skill Selection Basis: 无项目 skill 匹配（同 0815-1/2 裁定）→ Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline（依赖 0815-1/0815-2 交付面；commands runner 只 spawn mission `commands.*` 声明的命令，无新外部服务；不改 engine.js、不新增 npm 依赖）

## Phase 1 — nothing-claim 兜底与预算闸

Targets: law 内核（nothing-claim-guard / audit-rounds-overflow 规则）、`plugin/dsh/test/law-truth-table.test.mjs`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 0815-1（谓词注入与 mission ctx）

- [x] `Decision` **四一般门禁姿态裁定（nothing-claim-guard / audit-rounds-overflow / claim-validity / verify-keys 直接 enforce 偏离 02 §6 observe-first 默认）**：选择 = 四规则注册即 `mode: enforce`。理由：① deny 面均为窄域可判定事实（动作记录文件内容 / 预算整数比较 / claim 字段写者与持有者 / verify key 枚举），无 matcher 模糊性——02 §6 observe 爬坡针对的风险（误杀合法 in-run 编辑，WI13 门禁教训存档）在此不构成；② observe 爬坡需要守夜人观察日志消费回路（M3 才有），M2 内 observe-only 等于不执法且无校准数据源；③ 存量语料兼容性有既成回归网（Phase 3 corpus 语义按文件类钉住 + M1 语料无误杀断言）。备选 = 严格按 §6 默认 observe 至 M3——否决：四规则全部服务于完成派生公式合取（verify-keys / claim-validity 是公式输入的合法性面），observe 期间公式输入不可信使 0815-2 三硬门的 allow 判定失去根基。残险：对终端用户手写 terminal-claim.json 或手改 verify 的误杀——mitigation = deny reason 指向合法路径 + corpus 回归；若真实误杀案例出现，按 02 §6 纪律回调该规则为 observe 并记录。**执行落点**：裁定 + 回滚触发成文于 `missions/autonomy.policy.yml` supporting-gates 注释；两 gate（Phase 1）已注册 enforce。

- [x] `Add` `nothing-claim-guard`（02 §4.4，动作面规则）：拦截目标 = `_tmp/<runDir>/terminal-claim.json` 写入（动作记录，非账本状态——02 §4.4 表示裁定）；内容 `kind: nothing-to-draft` 时：`draftPlans(plansDir) > 0 ∨ activePlans(plansDir) > 0` → deny + reason（存在可见未完成工作，不得声称无可起草）；否则 allow 且评估结果携带 Deep Audit 触发信号面（trigger 执行 M3/WI26；本 plan 交付信号数据形状 + 单测钉住）。marker 通道不动（诊断/日志面，M5 评估物理删除）。**执行落点**：`law-rules.mjs` `nothing-claim-guard`（policy match `action:terminal-claim`；谓词经 `ctx.plans` 注入 records——守夜人面注入、其余面不可观测 → allow + 注记；非 JSON 动作记录 deny malformed；kind 词法面域外放行；allow 分支规则结果携带 `trigger: {dispatch: deep-audit, when: …}` 信号数据，M3 守夜人直连规则层消费）。
- [x] `Add` `audit-rounds-overflow`（02 §4.6 预算闸）：对 roadmap `## Deep Audit Record` 区新 dispatch audit 行的写入，校验 roadmap frontmatter `audit-rounds < maxAuditRounds`（policy limits 优先 / mission config `flow.maxAuditRounds` 回退——0815-1 裁定）；`≥` → deny 新审计轮次（R1 终态收口是 M3/WI27 执行方，本门禁只 deny）。maxAuditRounds 双源均未配置（=0 语义）时按现状引擎语义处理（无审计概念 → 无新审计轮次可拦，成文于测试）。**执行落点**：`law-rules.mjs` `auditRoundsOverflowRule`（current/proposed dispatch 行差集定「新增」；预算读 current 态 frontmatter；既有行不动 = 惰性；无 currentFileState = 不可观测 allow + 注记；legacy 双读域外）；双源解析 = `law-policy.mjs` `resolveMaxAuditRounds(policy, missionConfig)`（policy > mission flow > 0，规则侧读 `ctx.maxAuditRounds` 保持 import 环边界）；max=0 语义（0 ≥ 0 → 新 dispatch 行 deny，镜像引擎不进审计轮）真值表钉住。
- [x] `Proof` 真值表：terminal-claim ×（draftPlans 0/非0）×（activePlans 0/非0）× kind 词法；audit-rounds 边界（= max / < max / 未配置）× dispatch 行新增/既有；触发信号数据形状断言。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs`。**执行证据**：+8 例（truth table 72/0）——terminal-claim 矩阵含 only-draft/only-active 列与真实 plansDir fixture（磁盘落盘三 plan 文件读入 records，谓词注入面非 mock）；触发信号形状经 `getRule` 直连规则层断言；audit-rounds 六列（< max / = max / 未配置 0≥0 / 既有行 / accepted 落地 / 无 currentFileState / legacy）+ `resolveMaxAuditRounds` 优先级矩阵。

Exit Criteria:

- [x] 两规则正反例判定全对，deny reason 指向合法路径
- [x] 谓词注入面经真实 plansDir fixture 验证（非仅 mock）
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿
- [x] `docs/logs/` 更新

## Phase 2 — claim 合法性门禁

Targets: law 内核（claim-validity 规则）、`plugin/dsh/test/law-truth-table.test.mjs`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 0815-2 Phase 3（awaitingClosure 联动：全勾无回执放行依赖有效 claim）

- [x] `Decision` **过渡期 claim 写者供给裁定**：02 §4.5 合法写者 = 守夜人/引擎，执行者不得自写；守夜人 M3/WI25 才存在。裁定：M2 过渡期 claim 由引擎流程派发面供给（EXECUTE 步 prompt 指令写 claim，写者 = flow 派发会话，承 0635-3 过渡期写者裁定模式），执法信任基与现状同级（成文残险：M2 内 prompt 写者可绕——与今日现状持平，M3 守夜人接管唯一机器字段写者后消除）；规则本身按终态语义实现（engine/supervisor 角色白名单），过渡期映射经 actor 角色标注进白名单，M3 无需改规则只换写者。**依赖注记**：白名单的角色标注形态依赖 0815-1 Phase 1 actor 身份可得性 Explore 的结论——若 Explore 裁定 DSH 面降级结构子集（actor=undefined），过渡期白名单面只在结构子集注记层生效（unverified-writer），写者 deny 执法面随 M3 守夜人落地。**执行落点**：0815-1 Explore 结论 = DSH 面 actor={id}（role 不可推断）→ 规则按依赖注记实现——role 可得时写者角色白名单 deny（engine/supervisor 过、executor/drafter/reviewer/auditor deny），id-only/无 actor = unverified-writer 注记不 deny（写者 deny 执法面随 M3 守夜人 role-bearing 面落地）；claim 清除合法性 = holder（actor.id 尾部锚定匹配）∨ dispatcher，第三 session 带 id 即 deny（session 比对在 DSH 面可判定）。过渡期 claim 供给经 EXECUTE prompt 指令的通道裁定成文（prompt 改造本身非本 plan item——claim 写者面 M2 内无生产写入者，与现状持平）。
- [x] `Add` `claim-validity`：① 写者面——claim/claim-expires 写入 actor 角色必须 ∈ {engine, supervisor}（executor/drafter/reviewer/auditor 一律 deny）；② 持有者面——Phase checkbox 勾选写入时若 plan frontmatter 有活 claim：`actor.id == claim.holderSessionId ∧ claim 未过期（ISO-8601 比较对 now，可注入时钟）`才 allow；③ 单活——proposed content 出现双活 claim → deny malformed（守卫写入路径的转移合法性；frontmatter 解析器的重复键拒绝只覆盖解析面，本项覆盖「一次写入产生双活」的转移面——真值表用例注明两层边界）；④ 清除转移——进入 awaitingClosure 的写入必须同时清除 claim（0815-2 Phase 3 三岔②的补面：放行入 awaitingClosure 的 proposed content 不得仍携带 claim）；⑤ active 外携带 claim 形状面 M1 已有（格校验），本规则执法转移语境。CLI/结构面：①④ 可结构判定（claim 写入无法定写者证明 → 结构子集记录 unverified-writer 注记不 deny；勾选伴随的 claim 匹配在结构面退化为「claim 存在且未过期」不验证 actor）。**执行落点**：`law-rules.mjs` `claim-validity`——①角色白名单 + 写入 TTL 面合法形状（非 ISO-8601 / 写入即过期 deny）；②勾选（计数域 checked 增加）× 活 claim 过期（ctx.now 注入）/ 错主 deny、无 actor 退化注记；③claim 型 action（proposedContent = attempt token 或 `{claim}`）对活异 claim → deny 单活（转移面；parse 面 = 重复键拒绝，两层边界测试注明）+ 畸形 payload deny；④全勾无回执携 claim deny（plan-completed ② 同约束另侧声明）；⑤status ≠ active 携 claim deny（active→held / draft 落 claim 双例）；清除 = holder ∨ dispatcher，第三者 deny。
- [x] `Proof` 真值表：写者角色 × 写入类型（claim 写/勾选/status）矩阵；holder 匹配/错位；过期边界（可注入时钟钉 <、=、>）；双活 claim；awaitingClosure 携带残留 claim；结构面注记行为。命令：`node --test plugin/dsh/test/law-truth-table.test.mjs`。**执行证据**：+7 例（truth table 79/0）——写者六角色矩阵（四执行角色 deny + engine/supervisor allow + id-only/无 actor 注记）；TTL 写入面（非 ISO / 写入即过期）；holder 匹配/错位/结构退化（twoItemTickPair fixture 保证单勾 ≠ 全勾过渡）；过期边界 < = > 三点（时钟注入）；claim action 单活（异 claim deny / 幂等同 claim / 无活 claim / 畸形 payload / 无 currentFileState 注记，parse 面边界注明）；④残留 claim 与 ⑤出 active 双 deny 面 + draft 落 claim；清除四例（holder / supervisor / 第三者 deny / 无 actor 注记）+ 惰性与 legacy 域外。

Exit Criteria:

- [x] 全矩阵判定正确；时钟注入使过期边界可确定性测试
- [x] 过渡期写者裁定 + 残险成文于本 plan（已就地成文）且 `docs/logs/` 记录
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` 全绿
- [x] `docs/logs/` 更新

## Phase 3 — 机械验证门禁、append-only 与 M2 真值表收口

Targets: law 内核（verify-keys / record-append-only 规则）、commands runner util（新模块）、`tools/mission-driver/src/gate-check.mjs`（`--verify` 模式）、`plugin/dsh/test/law-truth-table.test.mjs`、roadmap tick 回写
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1/2 + 0815-2 全部（append-only 与回执区联动；verify-key 与 defaultVerifyKeys 注入）

- [x] `Add` `verify-keys` 枚举门禁（02 §5 命令来源纪律）：plan frontmatter `verify` 数组每个 key 必须命中 mission `commands.*` 键集且对应命令非空字符串；plan 的 Proof 文本不得成为可执行命令来源（runner 只认 commands.*，结构性保证）。违例 → deny（frontmatter 写入时）。**执行落点**：`law-rules.mjs` `verify-keys`——ctx.commands 注入时枚举执法（未知 key / 空命令映射 deny + reason 列出已知非空 key 集 +「Proof 文本永非命令源」声明）；ctx.commands 缺失 = fail-open 注记（02 §6 不可观测不 deny）；verify 缺省 = 派生面默认解析注记（01 §4.1）；`verify: []` 空真通道归 WI44 不在本 plan 裁定；DSH 适配层 ctx 增注 `commands`（执法输入面）。
- [x] `Add` commands runner util（零引擎 diff 新模块）：输入 = verify keys + mission commands 解析结果；执行 = spawn 对应命令（cwd = projectRoot、超时与输出截断策略成文）；输出 = 每 key 的 `{exitCode, passLine}` 数据（passLine 按 01 §4.2 语法 `pass <key> <runId> basisHash=<sha256> exit=0`，basisHash 经 `computeBasisHash` 对全勾后 plan 内容计算——与 0815-2 公式合取同源）。消费方：gate-check CLI `--verify <plan>`（本 Phase 落地）+ 守夜人（M3/WI26 mechanical-verification trigger，接口注记）。BUILD_VERIFY prompt 步不动（Non-Goal 成文）。**执行落点**：新模块 `src/verify-runner.mjs`——`resolveVerifyPlan`（verify 缺省 → mission 默认 = test/build/lint/typecheck 交集，02 §5 命名集合）/ `defaultVerifyKeys` / `passLineFor` / `runVerifyCommand`（shell spawn、cwd=projectRoot、每命令 10min 墙钟超时 SIGTERM→5s 宽限→SIGKILL、超时 exitCode=null 如实记录）/ `runVerifyCommands`（basisHash 同源绑定、输出截尾 4000 字符——尾部携带失败诊断）。策略成文于模块头注释。M3 守夜人消费面经 build-bundle ALLOWED_MODULES 预登记（unreachable-allowed：assets 副本已物化，M3 接线时入 closure；build-bundle copy plan 同步改为「复制全部 allowed 模块」以维持 bundle-scaffold 镜像恒等）。
- [x] `Add` gate-check `--verify <plan>` 模式：跑 verify-keys 校验 + runner + pass 行数据输出（写盘仍由调用方/守夜人执行——M2 内 CLI 输出到 stdout 供人审与测试断言，不自动写 plan 文件；自动写盘归守夜人 M3）。**执行落点**：`gate-check.mjs` 第三模式 `<plan.md> --verify`——owning mission 祖先走查（missions/*.json 逐级上溯，plansDir 包含关系判属，经 mission-check `loadMission` 全 extends 解析取 commands）+ verify-keys gate 评估（结构子集）+ runner 执行 + 结构化 JSON 输出（verifyKeys / usedDefaultKeys / keyResolution / gateCheck / basisHash / 每 key 结果与 passLine / decision + 「本 CLI 不写 plan 文件」note）；runId = `MISSION_DRIVER_RUN_ID` env 或 `gate-check-<timestamp>`；exit 0 ⇔ keys 解析 ok ∧ gate allow ∧ 全部命令 exit 0。
- [x] `Add` `record-append-only`（02 §4.8，直接 enforce——§6 例外授权，P0 已完成）：对 plan `## Draft Review Record`/`## Verification`/`## Closure` 与 roadmap `## Deep Audit Record` 区，currentFileState 与 proposedContent 比对：既有 dispatch/accepted/pass/日期迭代结论行必须前缀保持（原行原序保留），只允许尾部追加；删除/改写 → deny + reason 指出首个违例行。未知前缀行（prose）同受前缀保持保护（容忍策略是「未知行不参与语法匹配」，不是「未知行可删」——02 §4.8 语义按成文裁定量执行：整区前缀保持，prose 亦不可删改）。直接 enforce 授权同 0815-2 Phase 3 Decision 引用。**执行落点**：`law-rules.mjs` `record-append-only`——四锚区逐区 current/proposed 前缀保持比对（行尾空白容忍 + 尾部空行 run 清理容忍 = 编辑器卫生非改写；区中内容变化不容忍）；整区删除 deny；proposed 非 frontmatter 账本 = 双读域外（先于 current 检查——legacy 写入直接域外）、无 currentFileState = 不可观测注记、current legacy = 转移不可观测；双 policy gate 条目（`append-only-records` plans 域 + `append-only-records-roadmap` roadmap 域）。
- [x] `Proof` 收口：真值表累计 ≥30 用例全绿（覆盖本 plan 四规则 + 0815-1/2 全部规则的正向/反向/边界；计数与覆盖清单记录于本 plan 收口证据，WI24 gate 验收归下批）；append-only 前缀保持正反例（追加合法 / 删行 / 改行 / 换序）；runner 对真实 mission commands 的 `test` key 端到端跑通（`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md --verify` 产出合法 passLine 数据，exit=0——0635-3 为新格式且 `verify: [test]`，是 --verify 面的合适语料）；存量 corpus 语义按文件类钉住（legacy 0635-1/2 → 双读通道声明跳过；新格式 0635-3 与本批 0815 语料 → 全规则 pass / 注记无误杀——与 0815-2 corpus 语义同口径）。**执行证据**：truth table **88/0**（64 基线 + 24：Phase 1 +8 / Phase 2 +7 / Phase 3 +9——verify-keys 2 例（枚举 deny / fail-open / 缺省注记 / legacy）、append-only 2 例（追加/删/改/换序/整区删/prose 删/尾空白容忍/DAR 面）、runner 3 例（resolveVerifyPlan 矩阵 / passLine 语法 + M1 扫描器回读 / runVerifyCommands 真实 spawn 矩阵 exit 0/3/超时/空映射）、corpus 2 例（新格式 0635-3+0815-1+0815-2 真实 policy 全 gate allow 无误杀；legacy 全 gate 域外））；`--verify` 端到端：owning mission = age-autonomy-implementation、verify=[test]、gateCheck allow、真实 `pnpm --prefix tools/mission-driver test` 863/0 exit 0（21.2s）、passLine `- pass test gate-check-20260825T143356 basisHash=d29b5bd8…d1a86 exit=0`、CLI exit 0。
- [x] `Add` 文档同步与回写：`tools/mission-driver/CONTEXT.md` 配套门禁 + runner 行；roadmap WI17/WI18/WI19/WI20 tick + 证据指针；`docs/logs/` 收口条目。**执行落点**：CONTEXT.md「配套门禁 + 机械验证 runner」段（四规则 + runner + gate-check --verify + 适配层 ctx 增注）；roadmap WI17（M3/WI26/WI27 判定面注记）/WI18（过渡期写者供给残项注记）/WI19（BUILD_VERIFY 不动 + M3 消费面注记）/WI20（prose 保护口径 + corpus 回归）`[x]` + 证据；logs 三 Phase 条目 + 收口条目。

Exit Criteria:

- [x] `node --test plugin/dsh/test/law-truth-table.test.mjs` ≥30 用例 0 失败（WI24 真值表命令形态对齐）
- [x] `node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md --verify` 端到端绿（runner 真实执行 commands.test）
- [x] `git diff --stat tools/mission-driver/src/engine.js` 为空（runner 与新规则全部零引擎 diff）
- [x] append-only 直接 enforce 后构造的删行/改写写入被 deny；M1 存量 corpus 无误杀
- [x] `pnpm --prefix tools/mission-driver test` + `npm --prefix plugin/dsh test` + `./verify-age.sh` L1+L2 全绿
- [x] roadmap WI17/WI18/WI19/WI20 `[x]` + 证据指针；`docs/logs/` 收口条目

## Draft Review Record

- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0815-3-m2-supporting-gates-1-4f1ae78a to ses_reviewer_3
- 2026-08-25：iteration 1，共识 acceptable-with-changes #review-2026-08-25-063133-mission-driver-2026-08-25-0815-3-m2-supporting-gates-1-4f1ae78a（独立评审 ses_reviewer_3：baseline 抽查全实证、依赖链无环；阻塞项 = 四一般门禁直接 enforce 偏离 observe-first 默认却无 Decision 记录——已按建议补 Phase 1「四一般门禁姿态裁定」Decision（选择/备选/残险/mitigation）并修 baseline 指针；非阻塞 6 项：engine.js 零 diff 断言、--verify 语料钉 0635-3、Phase 2 Decision 依赖 0815-1 actor Explore 注记、WI21 复合标签约定边界注记、双活 claim 两层边界注明、命令形态说明——均已修）
- dispatch review #review-2026-08-25-063133-mission-driver-2026-08-25-0815-3-m2-supporting-gates-2-4e98f2da to ses_reviewer_3
- 2026-08-25：iteration 2，共识 acceptable-as-is #review-2026-08-25-063133-mission-driver-2026-08-25-0815-3-m2-supporting-gates-2-4e98f2da（独立复核：姿态 Decision 对 02 §6 的偏离论证 sound（窄域可判定 deny 面 / M2 无 observe 消费回路 / 公式输入不可信侵蚀 0815-2 allow 根基）、备选与回滚触发成文；五项非阻塞修复全部落地；无新引入问题。非阻塞 3 项留执行期：baseline「三者→四者」措辞已顺手修正、WI24 收口时以 roadmap 钉住的 bare 命令形态为准、过渡期 claim 写者残项在收口 log 再记录一次给 WI25 追踪）

## Verification

- 2026-08-25 执行期复核（过渡期写者裁定承袭 0635-3/0815-1/0815-2：`- pass` 行由引擎 BUILD_VERIFY 步骤按当次 basisHash 补写，此处记录执行面证据）：三 Phase 全执行完毕。`pnpm --prefix tools/mission-driver test` 863 pass/0 fail（prompt-check OK）；`npm --prefix plugin/dsh test` 221 pass/0 fail（本 plan 增 truth table 24 例至 88；closure 25/25、freshness 43 文件 content-equal（+verify-runner.mjs 预登记）、smoke-import ok、tsc --noEmit 干净）；`node --test plugin/dsh/test/law-truth-table.test.mjs` 88/0（≥30 基线超额，WI24 收口门本 plan 不勾归下批）；`node tools/mission-driver/src/gate-check.mjs docs/plans/age-autonomy/2026-08-25-0635-3-m1-corpus-migration-dual-read-guides-ci.md --verify` 端到端绿：owning mission = age-autonomy-implementation（plansDir 祖先走查）、verify=[test]、verify-keys gate allow、真实执行 `commands.test`（`pnpm --prefix tools/mission-driver test`，21.2s）exit 0、产出合法 passLine（basisHash=d29b5bd8e7c2…d1a86 当次计算）、CLI exit 0、未写 plan 文件；`./verify-age.sh` L1+L2 GREEN；`node tools/mission-driver/src/mission-check.mjs missions/age-autonomy-implementation.json .` exit 0；`gate-check --policy missions/autonomy.policy.yml` exit 0（11 gates：plan-structure observe + 三硬门四条 + 配套门禁六条 enforce）；web typecheck/build 绿（web/src 无 diff，worktree dist 环境漂移还原 committed 世代）；`lint:prompts` OK；`git diff --stat tools/mission-driver/src/engine.js` 为空（零引擎 diff 不变量成立——runner 与四新规则全部零引擎 diff）。corpus：新格式 0635-3/0815-1/0815-2 真实 policy 全 gate allow 无误杀、legacy 0635-1/2 全 gate 域外跳过（truth table §16 钉住）。真值表累计 88 例，覆盖清单见 Phase 3 Proof 执行证据。
- pass test 2026-08-25-205251-mission-driver basisHash=483f44e293bb4d67b08b636035d6ef02ef55ecd992754d34594bed50f5308429 exit=0

## Closure
