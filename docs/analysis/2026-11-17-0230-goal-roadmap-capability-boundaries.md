# Goal、Roadmap 动态更新与交付资格的能力边界

## 调查范围与结论

日期：2026-11-17。依据 HEAD `9932206` 附近的本地源码、既有宿主调研记录及两路独立只读调查；不是对已安装 DSH 的真实模型运行验收。来源会话：goal 调查 `ses_e172d9509ffegZny4E9q1xVmve`；消费者完成边界复核 `ses_e172d930effe5Bz8cngyVhe5xf`。

用户明确要求需求→roadmap→agent goal 推进、允许调研/审计以及运行时人机调整待办、每计划独立验收后自动本地提交。这个方向成立，但必须区分目标续轮、任务选择、独立验收和提交四个责任，不能用一个 goal 开关替代后三者。

## 已确认的执行面

| 执行面 | 本地证据 | 现场能力和限制 |
| --- | --- | --- |
| 外部 DSH host goal | `docs/analysis/dsh-plugin-survey/dsh-goal-domain.md` 的 tool-goal、goal-round-driver、command-goal 章节；调研版本 master@141eb6fe | 历史调研描述 `/goal` 等入口、有界续轮及异常后恢复；本轮未重新验证已安装宿主，不将其作为所有 agent 的通用 CLI |
| mission-driver CLI/插件 run | `tools/mission-driver/src/main.js` 的 run 注册，`flows/mission-driver.json`，`plugin/nop-age/src/engine-bridge.ts` | 本仓工作流编排，不是 host goal 的别名；配置按 run 装载，不承诺 mission/policy 热加载 |
| supervisor continuous | `plugin/nop-age/src/supervisor/watchdog.ts` 的 context 缓存和周期扫描；`exec-arm.ts` 的 initial-execute 分支；`docs/design/age-autonomy/06-engine-retirement-checklist.md` | 周期读取账本正文不等于 initial-execute 已完整接通；terminal 后新增项不保证自动恢复派发 |

## Roadmap 读取边界

- `tools/mission-driver/prompts/draft-from-roadmap.md` 要求每次起草全文重读，但允许先生成 1–3 个计划。
- `tools/mission-driver/src/flow-loader.js` 的 plan 扫描会重新读盘并按路径排序；`engine.js` 的 forEach 分支在进入步骤时求值一次执行列表。已生成计划及当前批次并不会因为人改 roadmap 顺序而自动重新选项。
- EXECUTE 重新读 plan，不保证模型中途看见 roadmap 编辑；编辑文件通常不取消模型轮次，却不能替换已经发出的 prompt。
- `docs/discussions/2026-08-28-0205-multi-plugin-dsh-plansdir-stale-run-config.md` 保存了运行中改配置、进程仍使用旧 plansDir 的实际事故，不能把正文重读扩大成配置热加载。
- `tools/mission-driver/src/law-rules.mjs` 的 roadmap-write-guard 限制普通 AI 增删/重排工作项。必须通过宿主允许的、明确获准的 roadmap-maintenance plan 或人类编辑实现；不能让模型自称 supervisor 取得权限。本轮不修改该法律或策略。

因此第一版推荐的是：goal 提供续轮能力，协调者一次只选择一个计划，关闭并提交后再次读盘；普通待办变化在下一选择边界生效。文档及本地辅助工具能支持并检验这个协作约定，但不能据此宣传旧 engine 已升级为确定性热调度器。

## 独立性与旧提交提示

- `tools/mission-driver/prompts/closure-audit.md` 的提交步骤仍允许按 Jira、code/doc、多 package 拆多个提交；它不是新要求中的“每 plan 一个交付提交”。`execute.md` 仍有实现者提前 tick roadmap 的提示，与独立审计后 tick 的规范有冲突。
- `plugin/nop-age/src/native-executor.ts` 的 ensure-handle 路径跨步骤复用同一 handle，测试也固定此行为。仅把 EXECUTE 和 CLOSURE_AUDIT 写成不同 step，并不保证二者是不同 session。使用此后端时须另行派发真正独立审查者；本轮不改插件执行后端或冒称其独立性缺口已修。
- 原生插件的打包/宿主 boot、supervisor 配置也有已登记限制；文档不能把装载声明当本机运行证明。
- 本轮的自动交付应由唯一协调者在真实独立接受之后调用小型 Git helper；不能宣称每个外部 runner 都已自动接线。旧引擎提示或 native 行为未升级时，应明确列为与推荐方式不等价，不用源仓规范替运行时背书。

## Completed 冲突与消费者安全决定

现存冲突：`docs/design/age-autonomy/01-file-ledger.md` 和计划指南规定 completed 派生；live engine `ledger-frontmatter.mjs` 已把 completed 加入可写/终态，`ledger-sections.mjs` 有显式 completed 快捷分支；插件 assets 仍留旧状态表。本轮不能假定其中任意一面已代表经批准的统一契约，也不修改受保护 engine/law 或全量再生成 assets 来掩盖冲突。

独立设计复核认可的窄域决定：

1. 如实保留 `rawStatus`，另行计算消费者侧只读 `deliveryReady`，不改写或重定义 engine completed。
2. `deliveryReady` 必须有非空合法 Phase 计数域全勾、显式非空 verify keys 对应成功证据、最终同 id 配对的 review/audit 接受，无未决最新派发；只有 active 或有完整证据的历史 completed 才可能满足。状态文本本身不能提供 proof。
3. 保留新加入的 `plan-status --check` 回执检查接口。进行中的计划可通过回执层检查却尚不可交付；commit helper 不得把 `--check exit 0` 当充分条件。
4. reviewer ≠ auditor、auditor ≠ executor 都需要核实；文本回执不是认证系统。自动提交还须绑定当前实际 payload、验证和审查，拒绝验收后变更、无关 staged 内容或同文件归属不清。
5. 共同支持 fixture 上做 parity；显式 completed 快捷、mission defaults 和更严格交付检查列为兼容差异，不伪称消费者与 engine 同一公式。历史计划只展示，不自动重开、重写或排入提交队列。

## 并发与交付约束

- 用户已确认本会话统一整合另一会话的 AGENTS/plan-status 增量；保留 `--check` 接口及回执独立性加严意图，先核实再修其实现，不直接覆盖未知工作。
- 同文件混入人工新增待办时，不能因为“路径属于计划”就夹带提交；无法隔离或审查归属则阻断本次交付，不 reset/stash 覆盖人工工作。
- 接受后才提交；提交成功后 Git trailer 是收据，不把自身 hash 写回计划再造一个提交。WI1 用等价 bootstrap 协调流程，后续使用经过 fixture 验证的 helper。
- 源码、审计和当前提交范围发生实质变化须重新验证/审计。普通 pending 编辑不要求重启当前实现，紧急取消、安全与保护区变化仍可 hold/stop。

## 后继边界与重开条件

本轮整改消费工具与使用契约，不交付新 scheduler、宿主 patch、native 会话隔离改造或旧 engine 语义统一。这些不作为“已修复”报告。若要把推荐协作方式提升为某一后端的确定性保证，需指定宿主/版本、单独批准受保护变更，并通过真实独立 session、每计划重选、终态新增待办及故障恢复测试。

## 后续用户裁决：用完成更新作为同步点

用户明确指出不需要另行重读 roadmap：计划完成后本来就应更新 roadmap，此时发现是否被修改。采纳此修正：删除每轮选项/判空前无条件全文重读；在完成更新时做基线/版本校验，未变则直接推进，已变则检查并合并相关最新内容，防止旧快照覆盖。下一项及队列为空判断使用合并更新后的工作表。本节是对前述初始建议的后续裁决，不抹去原调查过程，也不放弃并发保护；当前规范以 requirement 和使用指南为准。

## 最终用户裁决：依赖内置读写工具，不另造检查器

用户进一步明确：无需 AI 做文件并发检查，agent 内置 write tool 已负责；roadmap 和 plan 的读写强制使用内置工具。因此上一节中的额外基线/版本检查提议也被否决。最终执行约定是：AI 用内置 Read/Edit/Write 类工具进行正常完成更新，依赖工具的并发保护及冲突反馈，按更新后的工作表继续；不增加主动重读、CAS、revision 检查或合并子系统，也不通过 shell/脚本绕过文档编辑工具。自动验证器内部解析和 Git 交付检查另属职责，不等于允许 AI 用脚本改任务文档。该修正只改变后续工作流切片，不重启当前安全安装执行。
