# dsh_workflow 调研报告（dsh-plugin-survey）

> | 项 | 值 | 依据 |
> | --- | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh_workflow/`（`/Users/abc/ai/dsh-plugins/dsh_workflow`） | 本地目录 |
> | 来源 repo | `https://github.com/omdsh-dev/dsh_workflow.git`，本地 HEAD `44b83c1`（"fix: harden workflow handoff preflight"） | `git remote -v` / `git log` |
> | stars | 约 98★ | 任务给定，本地未证实 |
> | 语言 | TypeScript（`src/*.ts` 为源码事实；`lib/*.js`+`.d.ts` 为随库提交的 tsc 编译产物） | 目录结构与 `package.json:45-53` |
> | license | MIT | `LICENSE`、`package.json:75` |
> | 版本/兼容 | v0.1.2，peer 钉 DSH `0.0.1-rc.2` 全家桶 + cordis；唯一运行时依赖 `quickjs-emscripten@0.32.0` | `package.json:84-121` |
> | 测试 | README 徽章称 179 tests passing、覆盖率阈值 80%（`vitest` + `@vitest/coverage-v8`）；本次未运行 | README:10,216-217、`package.json:48-52` |
> | 宿主 API 面 | `ctx.subagents`（子 Agent 派发）、`ctx.tools.register`（三工具）、`ctx.inject(['commands'])`（`/workflow`）、`ctx.inject(['systemPrompt'])`、`ctx.get('approval')`、`ctx.get('userQuestions')`、`ctx.get('jobs')`、`Session.append`（原生 `tool-workflow/*` 事件）、`agent.steer/inject`、`ctx.effect`（卸载清理）；另用 `node:vm.Script` 仅做编译检查不执行 | `index.ts:683-696,581-681`；`engine.ts:308-316` |
>
> 行号约定：本报告以 `src/*.ts` 为准。此前分析引用的 `lib/engine.js:566-593`（pause/stop）与 `829-833`（waitAdmission）已核实对应 `src/engine.ts:604-636` 与 `848-853`（lib 是编译产物，行号偏移约 -38）。**未读部分**：`tests/`（12 个 spec）、`src/types.ts` 全文（仅经 import 推断字段）、`scoped-review.ts:121-533`、`docs/KODAX_PARITY.md`、`docs/CONFIGURATION.md`（仅 grep）、`docs/features/*`、`scripts/*.mjs`、`examples/review.workflow.json`、`README.en.md`。

## 1. 定位

一句话：**在 DSH Harness 的执行原语之上加一层"命名 catalog + durable run graph + 受限 capability VM"的 Workflow 产品层**——把一次性多 Agent 调度变成可保存、可治理、可观察、可恢复的工程资产。

与官方 workflow seam 的关系：纯增量插件，不改 agent loop、不替换前台 `ctx.workflows`（ARCHITECTURE.md:3-5,49-51）。官方 seam 是"有界前台脚本"，本插件在其上叠加 named catalog、审批、持久任务句柄、pause/resume、嵌套、artifact、成本记录、快照重跑与缓存续跑——全部构建在 `ctx.subagents` 之上，宿主核心零 patch（README:22,24）。这与本项目 mission-driver 作为 AGE 的执行层、DSH 插件作为控制面的分层姿态同构：**执行原语保持小，产品能力放在可加卸载的服务层**。

三条入口共享同一引擎/store/策略（README:162）：斜杠命令 `/workflow`（人，经 userQuestions 一次性确认）、模型工具 `workflow_list` / `run_workflow` / `workflow_manage`（模型，经当前 turn 的 ctx.approval）、以及 handoff 模式（create/free-text 把 authoring 交给当前主 Agent turn 并授予一次性 inline 免审）。


## 2. 架构与机制

### 2.1 组件图（文字版）

```
/workflow 命令 ──┐                      [一次性 handoff 授权 WeakMap]
模型工具 ×3 ─────┤→ service.ts(每 cwd 一个 engine/store)
                 │   ├→ catalog.ts   发现/加载/原子写（built-in > project > personal）
                 │   ├→ author.ts    scout(fast 只读)→author(deep structured)→3 次修复→冒烟
                 │   ├→ engine.ts    preflight/审批/admission/预算/pause-stop/缓存/事件
                 │   │    ├→ runtime.ts  QuickJS/WASM JSON-capability 桥（或可信本地模块直跑）
                 │   │    │    └→ WorkflowApi(冻结) → ctx.subagents → DSH provider
                 │   │    └→ store.ts    run.json/events.jsonl/不可变 capsule 快照/results/artifacts
                 │   ├→ capsule.ts   严格 manifest/capsule 校验（exact-key 白名单+freeze）
                 │   └→ source-policy.ts  静态黑名单+词法剥离+质量 lint
                 └→ Session.append（tool-workflow/* 原生事件）＋ jobs 后台作业
```

数据流：启动 = preflight（环境/工具/MCP/skill/tier 需求清单比对，engine.ts:499-517）→ 审批门（见下文"审批门控"）→ 写入 run 目录并落不可变 capsule 快照（engine.ts:569）→ QuickJS 内跑 `run(wf,args)`，guest 经 JSON RPC 调冻结 WorkflowApi 派发真实子 Agent → 每 emit 追加 events.jsonl 并重投影 process 快照到 run.json → 终态算 cost/outcome、发原生 run-end、按 maxRetainedRuns 清理（engine.ts:688-707）。

run 状态机：`running → paused | completed | failed | denied | stopped`，TERMINAL 四态集合判定终态（engine.ts:28）；denied 是审批专属终态。每个 run 在项目内落盘为独立目录（README:126-133）：`run.json`（状态+结果摘要+成本+投影）、`events.jsonl`（append-only）、`workflow.workflow.json` + `script.js` + `manifest.json`（生成型不可变执行快照）、`results/`（只存完成且验证通过的确定性 effect cache）、`artifacts/`（命名证据，文件名=清洗名+sha256 前 16 位防碰撞，wx 独占创建、重名报错，store.ts:34-38,103-109）。

### 2.2 capability VM 隔离机制（源码级）

多层纵深防御：

1. **静态策略前置**：手写词法状态机剥离字符串/模板/注释后做黑名单正则匹配——import/require/process/fs/shell/network/Deno/Bun/timers/`globalThis[...]`/内部桥名/`eval|Function|.constructor|__proto__`（source-policy.ts:13-26,28-77）；再用 `node:vm.Script` 编译检查语法合法性但不执行（source-policy.ts:89-93）。质量 lint 硬拒无 Agent 工作、明显死循环（101-113），冒烟阶段把 UNOBSERVED_TASK/UNAWAITED_AGENT 也升为硬错（author.ts:321-323）。
2. **独立 WASM 堆**：QuickJS runtime 设 64MB 内存上限、1MB 栈上限、interruptHandler 按 sync 切片检查墙钟（runtime.ts:265-270）。guest bootstrap 先取走两个桥函数再 `delete` 并以不可写不可配置重新定义防篡改（runtime.ts:137-147）；注入的 `wf` 冻结（218-241）；`Math.random` 与无参 `Date.now()/Date()` 直接 throw、`Object.freeze(Math)`、console 沉默（243-256）——**确定性 guard 使脚本可复现**。
3. **JSON 边界**：所有跨界值经 `assertJsonValue`（拒绝非有限数、稀疏数组、非 plain object、原型链两级、accessor/symbol key、环引用、深度>200，runtime.ts:16-50）+ `JSON.parse(JSON.stringify())` 双保险；宿主对象永不过桥，RPC 用 envelope `{ok,value,error,fatal}` 字符串编解码（runtime.ts:115-130,284-289）。
4. **静默期收敛**：墙钟超时先关桥（closed=true 阻止新 pump）、同步回调 onTimeout 让 owner abort 子 Agent，然后**循环等待全部已接收 host dispatch settle 才 dispose VM**（runtime.ts:291-296,449-476）——"返回≠结束，accepted work 必须被观察到"，防止 fire-and-forget 效应逃逸。
5. **并发原语的宿主/客座分工**：`wf.parallel`/`wf.pipeline` 在 QuickJS 客座内实现（lane 循环 + `Promise.all`），但每条 lane 的进出经**同步 RPC**（`parallelLaneBegin/End` 等）通知宿主做预算记账（GUEST_BOOTSTRAP runtime.ts:166-217；syncDispatch runtime.ts:320-341）——并发调度留在沙箱内、记账权留在宿主内。同步方法只允许有限白名单（budget/phase/log/lane 记账），异步方法才开放 Agent 效应（297-361）。

### 2.3 其余关键机制

- **catalog 持久化与原子写**（catalog.ts）：发现序 deterministic：built-in 不可遮蔽 > project > personal，同目录 `.workflow.json` 优先于 `.ts/.mjs/.js`（113-130,75-83）；文件必须普通文件、lstat 拒 symlink、超 maxCapsuleBytes 即 invalid 条目（88-107）。写入路径逐段 `lstat+realpath` 拒绝 symlink/junction/reparse point 且 realpath 必须等于字面路径（211-246）；save = 同目录随机 tmp（wx 独占创建）→ 新建用 `link()` 天然不覆盖（EEXIST 报错），替换则先把旧文件 rename 进 `.archive/` 再 rename tmp 到位、失败回滚旧文件（281-318）——并发同名保存互不覆盖。run store 另有 `.project.json` 归属 marker 防跨项目复用分区（store.ts:69-81）。
- **审批门控**：三级 `approvalMode: never | generated-and-local | always`，默认对 generated/local 类 capsule 要求 `ctx.approval.request`，denied 记为终态 `denied`（engine.ts:709-714,645-653）；trusted-local 加载前二段式 userQuestions 确认（service.ts:123-131）；斜杠命令每次运行都问一次（index.ts:506-508,568-572）。最精巧的是 **handoff 一次性授权**：`/workflow create` 把 authoring 契约以 relay 消息注入当前 Agent turn、原始请求 steer 为真 user message，并在 WeakMap<Agent,messageId> 记授权；工具调用时反向扫描 session 事件验证该消息仍在当前 turn 内且未被其他 user 消息打断才放行 inline 免审（index.ts:197-248,611-629）——授权绑定会话坐标、跨 turn 自动失效。
- **预算与信号量**：双层信号量——run 内 `WorkflowSemaphore(min(manifest.maxConcurrency, config.maxConcurrency))`（engine.ts:859）与服务级共享 deploymentSemaphore（service.ts:70,77；engine.ts:1069），waiter 带 AbortSignal 可被 stop 打断、release 时 permit 原子转移给下一个 waiter（engine.ts:361-380）。token 预算是 reserve→settle→reconcile 三段：派发前预留 allocation 否则拒绝（1082-1088），完成后按 Session 实测 usage 结算预留（1149-1153），structured-repair/verification-repair 追加用量即时核对、超支即 fail loud（1228-1232,1320-1329）。
- **事件与投影面**：events.jsonl 仅 `appendFileSync` 追加、seq 单调（store.ts:98-102）；process 快照是**从事件+任务表的纯函数投影**——phase/agent/step(nested/synthesis)/artifact 四类 item + counts + progress（含 replayedAgents），每次 emit 重投影写回 run.json（engine.ts:716-730,732-805）；outcome 投影汇总 results/coverage/unresolved/errors/usage（807-846）。同时镜像原生 `tool-workflow/run-start|agent-start|agent-end|run-end` 进 DSH Session 复用其 UI，且动态 run-start 用 Session 域 `turn:null` 防止启动它的 tool step 结束后被 UI 误判中断（engine.ts:303-316,640-643）。
- **cache resume**：cacheKey = SHA256(manifest+完整 source+插件/DSH 版本+verificationAdapter cacheIdentity+routing+task input) 截 32 位 + `-occurrence` 序号消解同 identity 多次调用（engine.ts:1019-1029）；resume-run 时先查本 run results 再查源 run，且只接受 `completed` 且无 verificationWarnings 的结果，命中即复制落盘到新 run（store.ts:120-130）；命中任务标 `replayed-from-cache` 并计入 progress（engine.ts:1031-1041,802）。只有 capability-generated run 有不可变脚本快照可 save/rerun-from-run-id；saved-name rerun 走当前 catalog 版本，同名歧义显式报错（service.ts:188-210）＝ invariant 6。
- **机械验证证据链**（write-path 默认开启 warn 级）：从子 Agent session 事件提取成功 tool_call 的读路径与 mutation 工具名（engine.ts:199-216）；workspace 指纹 = git status+diff+staged+文件树 SHA256（256-301）；requiresMutation 要求"成功 mutation 工具 ∧ workspace 指纹变化"，requiredChangedPaths 逐 path 前后指纹对比（1285-1297）；final text 正则拒绝"准备性"措辞（1300）；hard/warn 两档，hard 失败允许同 child followup 修复至多 2 次（1274-1319）。readOnly 过滤 = 父可见工具 ∩ allowlist − deny，provider 无 toolFilter 能力直接失败而非降级（318-325,483）。
- **结构化输出修复**：native capture 缺失或校验失败时，至多一次同路由、禁用全部工具的 reformat 子 Agent，仍不合规则明确 fail；rc.2 特有的"完成但 capture 缺失报 error"形态由有效修复翻案为 completed（engine.ts:1159-1226）。
- **冒烟预检**：smokeApi 用惰性假 Agent + 并行 lane 预算记账模拟整个 WorkflowApi（author.ts:90-289），生成型 capsule 在**消耗审批、派发任何真实子 Agent 之前**先空跑 `run()` 校验 admission/预算/结果可展示（320-332）；admission 校验函数被冒烟与真实执行共享（engine.ts:467-486），两套规则不会漂移。
- **waiter-gate pause（本项目已否决项）**：pause 仅翻状态位（604-610），waitAdmission 在 acquire 信号量前后双重自旋等待（848-853,1067-1072），resume 唤醒全部 pauseWaiters（612-620）。stop 复用同一 waiter 唤醒 + AbortController 级联 cancel/dispose 子 Agent（622-636）。
- **生成管线（scout→author→repair→smoke）**：scout 用 fast tier 只读调查 workspace（author.ts:344-354），author 用 deep tier 以 AUTHOR_SCHEMA 结构化输出 manifest/source/intent/inputs/requires 五字段，失败带 priorError 修复至多 3 次（356-393）；每次尝试串行过四道闸——capsule 校验、静态策略+lint、冒烟空跑、结果可展示检查（366-388）。revise 复用同一管线但以既有 capsule + change 为输入，provenance 记 revisionOf/fromRunId（service.ts:148-172）。命令路径的 create/free-text 不再走独立 scout/author 子 Agent，而是把契约注入当前主 Agent turn（handoff），避免长 authoring 卡住斜杠命令（index.ts:199-225）。
- **生命周期收尾与治理面**：finish 计算 cost 报告（墙钟、启动/完成 Agent 数、cache 命中数、token 实耗、峰值并发，engine.ts:688-707）；终态后从内存 runs 表删除并触发 `prune({keep: maxRetainedRuns})` 自动清理。嵌套 workflow 限一层（961-962），嵌套共享父信号量与 phase 栈；artifact 只写一次（writer 内 Set 查重）。Cordis 卸载经 `ctx.effect` 调 disposeAll：stop 全部活动 run 后 `Promise.allSettled` 等 completion 才结束 disposal fiber（engine.ts:597-602；service.ts:79,265-269）＝ invariant 10。run 身份解析支持 runId 或 displayName 别名，多个同名别名显式报 ambiguous（store.ts:164-173）。后台运行注册到 `ctx.jobs`（cancel 映射 stop、done 映射终态快照），注册失败仅告警不阻断——durable run id 始终是插件自有事实源（service.ts:244-263）。

## 3. 对本项目的可用模式

对照本项目线程：① 状态外化于 roadmap/plan git 文件、插件零持久记忆；② 中断即暂停、恢复=收敛式重跑（plan checkbox 接续），waiter-gate pause 已裁定否决；③ 信息组织⊥执行机制⊥机械验证正交、StepExecutor 可换（Process/Native）；④ 在研：roadmap 即队列、agent 池化/group 标识、prompt 组装 DSL、frontmatter 改造、mdcontrol.stop 协作中断。

概念对照（便于逐条映射）：

| dsh_workflow | 本项目对应物 |
| --- | --- |
| capsule（manifest+source+intent+provenance，不可变快照） | mission JSON + plan/roadmap md（git 历史即快照） |
| catalog 发现序（built-in > project > personal） | AGE preset / missions/<name>.json |
| run graph（run.json+events.jsonl+results/） | docs/logs/ + plan checkbox + git 状态 |
| effect cache 续跑（resume-run） | plan checkbox 接续收敛重跑 |
| WorkflowApi 冻结能力面 | StepExecutor seam（Process/Native） |
| deploymentSemaphore | 跨 run 连续自主队列的并发总闸 |
| approval 分级 + handoff 一次性授权 | tools/pre-execute 门禁 + mdcontrol.* 路由授权 |
| 机械验证证据链 | CHECK / DEEP_AUDIT 的机械验证支柱 |

| # | 模式 | 判定 | 映射与理由 |
| --- | --- | --- | --- |
| 1 | effect-cache 续跑语义（identity hash+occurrence、只缓存 verified 完成、跨 run 复制） | **Adopt** | 这正是"恢复=收敛式重跑"的机械化版本。mission-driver 的 plan checkbox 是人读粒度；可在 EXEC 层引入任务级 cacheIdentity（plan 文件 hash+step 输入+executor 版本），使 resume-run 跳过已完成且通过 CHECK 的 step，checkbox 接续获得硬保证。occurrence 序号消解重复调用值得照抄。 |
| 2 | 快照重跑分流（run-id=不可变快照 / saved-name=当前版本 / 歧义显式报错） | **Adopt** | 对应 plan 执行记录：按"某次执行的归档快照"重放 vs 按"当前 plan 文件"重跑必须是两个显式入口，禁止静默混用。AGE 中 plan git 历史≈不可变快照，可直接引用 commit hash 达成同语义，成本近零。 |
| 3 | 双层信号量（run 内并发 + 服务级全局共享） | **Adapt** | "roadmap 即队列"多 run 连续自主时需要部署级总闸防资源挤兑；mission-driver 可在 driver 层放一个跨 mission 的并发 semaphore（按 agent 池容量）。run 级 waiter 可被 abort 打断的实现（engine.ts:327-381）可直接移植为 Node 侧工具函数。 |
| 4 | token 预算 reserve/settle/reconcile | **Adapt** | 队列化自主运行的失控保护：每个 plan/step 预算先预留、完成按实测结算、中途追加（如修复轮）即时核对超支即停。比"事后统计"强在能在派发前拒绝。 |
| 5 | 审批分级 + 冒烟后才消耗授权 + 授权绑定会话坐标 | **Adapt** | tools/pre-execute 门禁可借鉴三点：(a) 分级 approvalMode（never/generated-only/always）替代布尔开关；(b) dry-run/smoke 通过前不消耗一次性授权；(c) 授权绑定具体消息/turn 坐标自动过期，防重放。handoff 反向扫描 session 事件的校验逻辑对 mdcontrol.* 异步作业的授权延续有直接参考价值。 |
| 6 | catalog 原子写（tmp+link 不覆盖 / archive swap 回滚 / 逐段 realpath 反 symlink / active run 禁删 / 归属 marker） | **Adopt** | missions/、docs/logs/ 若未来工具化写入（尤其 monitor dashboard 反向写状态），这套写法是现成范本；active-run guard ↔ "活动 run 禁删"完全同构；`.project.json` marker 思路可用于防误把别的仓库的 .age 目录当本项目。 |
| 7 | 机械验证证据链（成功 tool 证据 + git workspace 指纹 + requiredChangedPaths 前后指纹 + preparatory-text 拒绝） | **Adapt** | "机械验证"支柱的具体实现清单：CHECK/DEEP_AUDIT 可要求 step 声明 requiredChangedPaths 并用前后 git 指纹证明"真的改了"；preparatory-final-text 正则是廉价的"说做了没做"检测。注意它验证的是**效果**不是流程，与我们三事正交原则一致。 |
| 8 | 结构化输出至多一次同路由无工具修复，仍败则明确 fail | **Adopt** | 比 DRAFT_PLANS 里常见的无限重试克制：一次修复 + 明确失败交还上层决策，与"审计预算耗尽即停"同哲学。repair 子请求禁用工具（toolFilter:{allow:[]}) 防止修复变成重做，细节值得抄。 |
| 9 | 冒烟与真实执行共享同一 admission 函数 | **Adopt** | 防"预检规则与执行规则漂移"的结构性做法：mission-driver 的 pre-execute 门禁与 ProcessExecutor 应共用同一份 step 校验代码，而非各写一份。 |
| 10 | append-only events.jsonl + 纯函数投影 process snapshot | **Adapt** | 投影思想可用（Vue monitor 从既有日志/git 只读投影，零持久记忆），但**不要**在仓库内新增第二状态源：我们的事件面已有 dev logs + plan checkbox + git 历史。若未来 run 目录（.gitignore 内）需要细粒度事件，可按此格式落地于仓库外。 |
| 11 | QuickJS/WASM capability VM 隔离 | **暂缓（Contingency）** | AGE flow DSL 是受信配置文件，当前无"生成代码执行"需求，引入 VM 成本>收益。但它是 prompt 组装 DSL 或未来"AI 生成 flow 片段"演化为可执行产物时的现成隔离预案：JSON-capability 桥 + 静态黑名单 + 确定性 guard + 静默期收敛四件套设计完整、依赖仅 quickjs-emscripten 一个包。 |
| 12 | waiter-gate pause 机器 | **Reject（维持原裁定）** | pause/resume 状态位 + 自旋 waiter 与"中断即暂停、恢复=重跑收敛"冲突；但其 stop 路径复用 waiter 唤醒 + AbortController 协作取消子任务的编排方式，与 mdcontrol.stop 协作中断方向一致——吸收的是 stop 半边，不是 pause。 |
| 13 | scout-then-author 自然语言生成 workflow | **Reject** | 超出范围：AGE 的 roadmap/plan 由人机协作在文件里显式书写，不做运行时自然语言生成流程。有界修复循环（author.ts:356-393）作为通用模式已在 #8 吸收。 |
| 14 | capsule intent/inputs/requires/provenance 元数据 | **Adapt-lite** | frontmatter 格式改造可参考其 provenance 字段集（fromRunId/revisionOf/createdAt/pluginVersion，capsule.ts:204-218）与 requires 显式声明缺失即 fail（preflight engine.ts:499-517）——"需求不在部署清单中就失败，不偷偷降级"符合 fail-loud 原则。 |

## 4. 风险与不适用面

1. **进程内隔离 ≠ OS 边界**：SECURITY.md:21 自述 QuickJS 只是 in-process 组件；trusted-local 模块更是全宿主权限（catalog.ts:132-138 经 Node 原生 TS strip 直接 import）。借鉴其安全叙事时不能照搬信任等级。
2. **静态黑名单是概率防线**：stripLiterals 手写词法器未处理正则字面量——源码里 `/require\s*\(/` 形态的正则会误触发 forbidden-token（source-policy.ts:28-77 无 regex state），反之黑名单本质可绕过；真正兜底的是 WASM 堆无宿主对象。若 Adopt #11 必须把它当纵深的一层而非边界。
3. **性能热点**：projectProcess 每次 emit 都 `getEvents` 全量读 events.jsonl 再全量重投影（engine.ts:716-733），O(events²)；store.list() 逐 run 读整份 run.json（store.ts:151-162）。大 run/大 catalog 下放大，monitor 场景需自行加索引。
4. **强宿主耦合**：peer 依赖钉死 DSH rc.2 十余个包，usage/evidence 观测直接遍历 `agent.session.events` 私有形状（engine.ts:114-128,199-216），兼容性脆弱（其 compatibility.json 快照 pin 机制就是为此）。对本项目的启示：mission-driver 的 StepExecutor seam 应继续把 harness 形状关在 adapter 内。
5. **Windows 路径代码大量存在但本环境未验证**（catalog.ts:201-204 等）；junction 拒绝逻辑仅见于源码未见测试结论（tests 未读）。
6. **pause 语义残留风险**：即便 Reject pause，注意其 invariant 5（暂停须拦截已排队信号量的任务，engine.ts:1070-1072 双检）说明"协作取消必须覆盖排队中任务"——我们实现 mdcontrol.stop 时同样要处理"已入队未启动"的 step。
7. **明确不适用**：KodaX 对标的产品化命令面（save/rename/revise/prune 全家桶）超出 AGE 需要；六 pattern 内置脚本（builtins.ts）是只读演示级，无直接复用价值；scoped-review packet 写入器（内容寻址分区文件）思路有趣但服务于其 review 产品线，与 AGE 文件布局不匹配。
8. **缓存正确性边界**：cacheIdentity 含完整 source 与 routing（engine.ts:1019-1025），任何 plan 文本或路由配置变化都会使缓存全量失效——对本项目意味着若 Adopt #1，plan 文件必须把"影响语义的部分"与"仅措辞部分"分离（frontmatter 改造线程相关），否则 checkbox 接续的缓存命中率会极低。
9. **一次性授权的内存态**：handoff grants 存于 WeakMap（index.ts:583），进程重启即失效——作为"插件零持久记忆"的自洽设计成立；本项目若引入类似授权须明确其生命周期与 mdcontrol 异步作业跨会话语义的关系。

## 5. 关键源码索引

| 主题 | 位置 |
| --- | --- |
| waiter-gate pause/resume/stop | src/engine.ts:604-636（lib/engine.js:566-601）；waitAdmission src/engine.ts:848-853（lib:829-836）；排队双检 src/engine.ts:1067-1072 |
| WorkflowSemaphore（permit 原子转移） | src/engine.ts:327-381；服务级部署信号量 src/service.ts:70,77 |
| token 预算 reserve/settle/reconcile | src/engine.ts:1082-1088,1149-1153,1228-1232,1320-1329 |
| 审批分级与 denied 终态 | src/engine.ts:709-714,645-653；trusted-local 确认 src/service.ts:123-131；handoff 一次性授权 src/index.ts:197-248,611-629 |
| QuickJS VM 限额与确定性 guard | src/runtime.ts:265-270（内存/栈/interrupt）、137-257（bootstrap：桥函数冻结、Math.random/Date 禁用） |
| JSON 边界断言 | src/runtime.ts:16-64；RPC envelope 桥 src/runtime.ts:364-395；静默期收敛 src/runtime.ts:291-296,449-476 |
| 静态策略与质量 lint | src/source-policy.ts:13-26（FORBIDDEN）、28-77（stripLiterals）、79-94（编译检查）、101-113（lint） |
| admission 共享校验（冒烟=真实） | src/engine.ts:405-440（input 白名单）、467-486（admission）、author.ts:90-289,320-332（smoke） |
| 缓存 key/occurrence/跨 run 复制 | src/engine.ts:1019-1041；src/store.ts:116-131 |
| 不可变快照与 rerun 分流（invariant 6） | src/engine.ts:569；src/store.ts:110-114；src/service.ts:188-210 |
| events.jsonl 追加与 process/outcome 投影 | src/store.ts:98-102；src/engine.ts:716-730,732-805,807-846；Session 域 run-start src/engine.ts:303-316,640-643 |
| 机械验证证据链 | src/engine.ts:199-216（tool 证据）、256-301（git 指纹）、1274-1334（hard/warn+修复）、318-325（readOnly 交集过滤） |
| WorkflowApi 冻结能力面（宿主侧实现） | src/engine.ts:855-999 |
| structured output 单次修复 | src/engine.ts:1159-1226 |
| 冒烟预检（审批前空跑） | src/author.ts:90-289（smokeApi）、320-332（smokeWorkflowCapsule） |
| 生成管线 scout→author→repair | src/author.ts:344-393；revise 入口 src/service.ts:148-172 |
| 嵌套 workflow 单层限制 | src/engine.ts:961-987 |
| 生命周期收尾/cost/prune/disposeAll | src/engine.ts:688-707,597-602；src/service.ts:79,244-263,265-269 |
| run 身份解析（runId/displayName 别名/歧义） | src/store.ts:164-173 |
| run 目录布局/artifact 命名防碰撞 | README:126-133；src/store.ts:34-38,83-133 |
| 命令面与 handoff 授权校验 | src/index.ts:197-248,439-579,674-680 |
| catalog 发现序/原子写/反 symlink | src/catalog.ts:113-130（发现）、211-246（逐段 realpath）、281-318（tmp+link/archive swap 回滚）、326-337（rename） |
| run store 归属/删除守卫/保留策略 | src/store.ts:69-81（.project.json）、184-189（force 限 stale）、191-200（prune）；src/service.ts:182-185（active 禁删） |
| capsule 严格校验/provenance | src/capsule.ts:118-156,204-218,220-239 |
| authoring 有界修复循环 | src/author.ts:344-393 |
| 宿主装配（ctx 面/工具/命令/systemPrompt） | src/index.ts:35-36,581-681,683-696 |
| 架构不变量 11 条 | docs/ARCHITECTURE.md:35-51 |
| 安全信任等级自述 | docs/SECURITY.md:3-35 |

未读文件备查：`tests/*.spec.ts`（12 个）、`src/types.ts` 全文、`src/scoped-review.ts:121-533`、`docs/KODAX_PARITY.md`、`docs/CONFIGURATION.md`、`docs/features/v0.1.{0,1,2}.md`、`scripts/check-*.mjs`、`examples/review.workflow.json`、`README.en.md`、全部 `lib/*.d.ts`。本报告涉及这些文件的结论均只基于 README/ARCHITECTURE 的转述并已在文中标注。
