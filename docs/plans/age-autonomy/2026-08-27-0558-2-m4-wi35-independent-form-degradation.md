---
status: active
mission: age-autonomy-implementation
work-item: M4-WI35
group: "2026-08-27-0558"
verify: [test, verify-age]
---

# 2026-08-27-0558-2 M4 独立形态降级：池化 → `--session` 续用 + 前缀纪律（age-autonomy M4-WI35）

> Source: `docs/backlog/age-autonomy-implementation-roadmap.md` WI35；`docs/design/age-autonomy/04-efficiency.md` §6、`docs/design/age-autonomy/05-usage.md` §3/§4
> Related: 2026-08-27-0433-3（M4-WI33——Deferred「独立形态 CONTINUE 交付（CLI runner）」由本 plan 统一裁定）、2026-08-26-1411-2（`independentChannelOf` seam 交付）、2026-08-27-0558-3（M4-WI36 门）

## Current Baseline

- 降级契约（04 §6）：无 in-process 宿主（独立形态 = `mission-driver.sh run <mission>` 引擎后端，05 §3.1）→ 池化退化为「`--session` 续用 + 前缀纪律」；读轮次照省；跨步缓存收益在 opencode 会话连续性下部分存在，pi/cline 不承诺；正确性不受影响（效率层是优化非契约）。05 §4 对照行：「agent 池化 / prompt 缓存 | DSH ✅ | 独立 ◐」。
- 引擎 `--session` 机制面在库，消费面 = **步内**（非跨步）：`runner.js` `DEFAULT_DRIVER_ARGS`（:23）`{session}` token 经 `buildDriverArgs`（:25/:43-46）渲染为 `--session <id>`（有 session 注入、无则剥离 token）；`findLatestSessionId`（runner.js :156-174）opencode-only（pi/cline 无会话连续性等价物，注记在案）。**跨步续用不在库**：`engine.js` 全部三个 `_executeAgentStep` 调用点传 `null`（:1119 forEach / :1356 `_executeSubStep` / :1790 主循环）；`this.lastSessionId`（:333 初始化 / :853 赋值）唯一消费面 = `_runCorrectionAgent`（:949）——即每 agent step 起新会话，仅步内 correction retry 与 parse-model 内层 run（runner.js :297-300）共会话。
- 步内续用已被既有测试钉住：`runner-routing.test.js`（:34-49 `--session` 转发 / :69/:181 无 session 剥离 / :169-181 pure 面）、`prompt-cmdline-limit.test.js`（:60/:90-91）、`step-executor.test.js`（:165 `lastSessionId`）、`transitions.test.js`（:431 correction retry 会话传递）、`parse-fallback.test.js`（:164）——本 plan 核对引用，不为已钉住面重复造测试。
- 引擎 prompt 前缀纪律未审计未钉住：`flow-loader.js` `loadPrompt`（:234）读模板 + `delegates.vars` 内联 `{{var}}` 替换；`prompts/*.md` 11 件模板抽样（draft-from-roadmap / execute / plan-review）显示 `{{var}}` 均为小字符串（路径/命令/名字引用），**未见大易变负载前置**——预期审计结论为多数/全部模板无需重排，但该预期无结构性测试钉住（「易变变量取不同值时共享固定前缀字节」零断言）。
- 效率层消费面为 DSH 形态独占：`agent-pool.ts` 需 `PoolAgentsFace`（continuable 子代理，:80）；`exec-arm.ts` `dispatchPromptFor` 组装挂点、`native-executor.ts` `assemblyPrefix` config 面（0433-3）——独立形态 headless run 经 `executor.js` → `runner.js` 直连，两者皆不经过。
- `independentChannelOf` 纯解析 seam 在库（`dispatch-resolve.ts` :214）：model 通道（`binding.model` → config.js model 面）；provider → 独立形态 driver 凭据 env 注记；reasoningEffort 无 config.js 载体（documented residual——seam 注记明示归 M5 independent-form gate 裁定）；CLI runner 未交付（1411-2 裁定「no CLI runner in this plan——this is the documented seam」）。
- 底线：零 `engine.js` diff（`runner.js`/`executor.js`/`engine.js` 状态机零触碰——roadmap 核心纪律 1）；零新增 npm 依赖；`prompts/*.md` 编辑须保持 `lint:prompts`（prompt-check.mjs 结构校验）绿。
- 基线计数：引擎 925 / 插件 407 / 真值表 116；`./verify-age.sh` L1+L2+L2.5 GREEN。

## Goals

- 裁定独立形态效率承载（04 §6 降级语义的 as-built 承载裁定），交付两个钉住面：① 步内 `--session` 续用既有测试覆盖核对引用（已钉住面零重复造测）② 引擎 prompt 前缀纪律逐件审计 + 钉住测试（预期多数/全部模板无需重排——如实记录审计结论，不制造重排）。
- 独立形态降级面如实成文（04 §6 as-built 注记 + 05 §4 对照行注记 + CONTEXT.md）：步内续用已钉住、**跨步续用未交付**（Deferred 后继 M5-WI37）；`independentChannelOf` 残项复核（reasoningEffort 载体维持 M5 裁定，零行为改动）。
- roadmap WI35 勾选。

## Non-Goals

- 不建 CLI 池 runner、不改引擎 dispatch 面、**不交付跨步 `--session` 续用**（承载裁定见 Phase 1 Decision——零 `engine.js`/`runner.js`/`executor.js` diff；跨步 threading 归 M5-WI37 裁定）。
- 不裁定 M5-WI37 引擎退役门事项（reasoningEffort config.js 载体、CLI 派发策略、引擎 threading 归 M5 independent-form gate——seam 注记原文维持）。
- 不做画像独立形态采集（归 0558-1 Deferred + headless 降级注记）。
- 不承诺 pi/cline 会话连续性（04 §6「不承诺」字面）；不改 DSH 形态效率面（WI32/WI33 已冻结）。

## Task Route

- Type: `implementation-only change`（含一个承载形态 Decision；设计基线 04 §6 已批准，本 plan 落 as-built 裁定、钉住与如实成文）
- Owner Docs: `docs/design/age-autonomy/04-efficiency.md` §6、`docs/design/age-autonomy/05-usage.md` §3/§4
- Skill Selection Basis: `docs/skills/` 现有条目均为审计 prompt 模板，非本工作方法——Skill: none

## Infrastructure And Config Prereqs

- No infra prereqs beyond existing baseline.

## Phase 1 — 承载裁定 + 步内续用覆盖核对 + prompt 前缀纪律审计与钉住

Targets: `tools/mission-driver/prompts/*.md`、`tools/mission-driver/test/`（新增钉住测试）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: 无硬依赖（建议在 0558-1 之后同组执行）

- [ ] Decision: 独立形态效率承载裁定——池化降级的 as-built 机制面 = ①步内 `--session` 续用（correction/parse 共会话，既有测试已钉住——本 plan 核对引用）②前缀纪律（本 plan 审计 + 钉住）；**跨步续用不在库且本 plan 不交付**（三个 `_executeAgentStep` 调用点传 `null`，`lastSessionId` 唯一消费面 = correction）。否决备选 A = CLI 侧按角色复用 opencode session 的池——continuable 子代理 face 是 DSH 宿主独有（`PoolAgentsFace`）+ 跨 run 会话复用缺 attemptId 代际判据（04 §2.3）= 陈旧上下文风险 + 引擎 dispatch 面重构违反零引擎 diff 底线；否决备选 B = `engine.js` 最小 threading（`lastSessionId` 接进三调用点）——违反 roadmap 核心纪律 1 零引擎 diff 底线 + 会话跨步累积改变 run 语义（agent 行为面变化，超出效率层「不改契约」边界，04 §6 为已批准基线）→ 归 M5-WI37（引擎退役判定门：守夜人接管独立形态派发 ∨ 引擎 threading 二选一裁定）。残险 = 独立形态跨步 KV 缓存损失（接受——04 §6「部分存在」按 as-built 如实收窄为「步内存在、跨步未交付」）。
- [ ] Add: 步内续用覆盖核对——逐项核对既有钉住测试与本 plan 基线清单一致（`runner-routing.test.js` `--session` 转发/剥离双分支、`step-executor.test.js` `lastSessionId`、`transitions.test.js` correction 会话传递、`parse-fallback.test.js` parse 共会话）；核对结论（引用一致 ∨ 缺面清单）记入执行日志；确有缺面才补测（已钉住面零重复造测）。
- [ ] Add: prompt 前缀纪律审计——逐件清点 `prompts/*.md` 11 模板的 `{{var}}` 位置分类（小而稳的路径/命令/名字引用 vs 大而易变的负载注入）；审计结论（预期多数/全部无需重排）如实记入执行日志；仅当出现大易变负载前置时做语义中性后移（不改指令文本语义、不改变量集、不动 `lint:prompts` 结构校验面）。
- [ ] Proof: 前缀纪律钉住测试——同模板两次渲染（易变变量取不同值）断言共享固定前缀字节（对全部 11 件模板；无需重排模板断言其前段零易变负载注入）；进引擎测试链（计数只增不减）。

Exit Criteria:

- [ ] 承载裁定 + 审计清单 + 核对结论成文（Decision 项 + 执行日志指针）
- [ ] 前缀纪律钉住测试全绿；步内续用覆盖核对完成（引用一致或缺面已补）
- [ ] `pnpm --prefix tools/mission-driver run lint:prompts` 绿（如有重排，零结构破坏）
- [ ] `git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/src/runner.js tools/mission-driver/src/executor.js` 为空

## Phase 2 — 独立形态降级如实成文 + Proof 与回写

Targets: `docs/design/age-autonomy/04-efficiency.md` §6、`docs/design/age-autonomy/05-usage.md` §4、`tools/mission-driver/CONTEXT.md`、`docs/backlog/age-autonomy-implementation-roadmap.md`、`docs/logs/2026/08-27.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [ ] Add: 04 §6 as-built 注记——降级面 = ①步内 `--session` 续用（既有测试覆盖指针）②前缀纪律（审计结论 + 钉住测试指针）③policy fixedPrefix/assembly 组装为 DSH 形态面（独立形态薄 prompt + 步内会话续用即当前 as-built 降级）④**跨步续用未交付**（`_executeAgentStep` 三调用点传 `null` 事实注记 + M5-WI37 后继指针）；05 §4 对照行「◐」同步 as-built 注记；CONTEXT.md 独立形态降级段。
- [ ] Add: `independentChannelOf` 残项复核注记——seam 头注「reasoningEffort 无载体归 M5 independent-form gate」原文核对（零行为改动、零 seam 编辑；如注记所指条目名与本 roadmap 编号不一致则以文字核对为准并注记）。
- [ ] Proof: `pnpm --prefix tools/mission-driver test` 全绿 + `./verify-age.sh` L1+L2+L2.5 GREEN。
- [ ] Add: roadmap WI35 勾选 + 行内证据指针（承载裁定 + 跨步未交付注记 + 后继指针）；`> Last Updated` 头同步；`docs/logs/2026/08-27.md` 条目。

Exit Criteria:

- [ ] 04 §6 / 05 §4 / CONTEXT.md 注记在案且与 live 行为一致（跨步未交付如实写明，非暗示在库）
- [ ] verify-age 全绿；零引擎 diff 复核（engine/runner/executor 三文件）
- [ ] roadmap WI35 `[x]` + 证据注记
- [ ] `docs/logs/` updated

## Draft Review Record

- dispatch review #review-2026-08-26-130203-mission-driver-2026-08-27-0558-2-m4-wi35-independent-form-degradation-1-75114816 to ses_reviewer_2026-08-27-0558-2
- 2026-08-27：iteration 1，共识 blocking-issues #review-2026-08-26-130203-mission-driver-2026-08-27-0558-2-m4-wi35-independent-form-degradation-1-75114816（基线事实错误：跨步 --session 续用并不在库——_executeAgentStep 三调用点传 null、lastSessionId 唯一消费面 correction；另四处非阻塞：既有钉住测试应引用核对、--from-step 假前提、模板变量均为小字符串、行号漂移）
- 2026-08-27：iteration 2，共识 acceptable-as-is #review-2026-08-26-130203-mission-driver-2026-08-27-0558-2-m4-wi35-independent-form-degradation-1-75114816（重基线逐项冷验证属实：步内续用已钉住引既有测试、跨步未交付成 Deferred 后继 M5-WI37、Decision 双备选否决理由与残险在案、as-built 注记要求如实；无新议题；status 翻 active）

## Verification

## Closure

## Deferred But Adjudicated

### 跨步 `--session` 续用（engine threading——三调用点接 `lastSessionId`）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 违反 M4 零引擎 diff 底线（roadmap 核心纪律 1）且会话跨步累积改变 run 语义（超出效率层「不改契约」边界）——Phase 1 Decision 备选 B 否决理由在案；步内续用（correction/parse）已钉住，效率损失限于跨步 KV 缓存
- Successor Required: yes（M5-WI37 引擎退役判定门——守夜人接管独立形态派发 ∨ 引擎 threading 二选一裁定；跨 run 会话复用（`--from-step` 等）同归该裁定）

### reasoningEffort 独立形态载体（config.js 无字段）

- Classification: `watch-only residual`
- Why Not Blocking Closure: `independentChannelOf` seam 已诚实注记（documented residual）；模型推理力度在独立形态经 driver 默认值承载，非契约缺口（效率/组合面优化）
- Successor Required: yes（M5-WI37 independent-form gate / 引擎退役判定时一并裁定 config.js 是否增字段）
