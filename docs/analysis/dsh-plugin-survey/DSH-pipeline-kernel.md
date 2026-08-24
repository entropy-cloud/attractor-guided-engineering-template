# DSH-pipeline-kernel 调研报告（dsh-plugin-survey）

> 元信息

| 项 | 值 |
|---|---|
| 本地路径 | `~/ai/dsh-plugins/DSH-pipeline-kernel/` |
| 来源 repo | https://github.com/not-big-dog/DSH-pipeline-kernel.git（origin，本地克隆 HEAD `5cbe782`，2026-08-21） |
| stars | 未联网核实（约束只读本地目录；本地克隆无法得知） |
| 语言 | TypeScript（仅 `src/client` UI 源码约 1056 行）；服务端以编译产物 `lib/*.js` 约 4758 行交付并按此阅读 |
| 版本/license | v0.9.0 / MIT（LICENSE、package.json:7） |
| 宿主 API 面 | Cordis 4.x 插件；`inject: ['tools','storageDomain','agents','commands','timer']`（lib/index.js:22）；peer 依赖 `@deepseek-ai/dsh-{agent,llm,storage-domain,tools}`、`dsh-client-ui-*`、zod 4、react 18（package.json:45-57）；锁定宿主 `deepseek-harness ^0.1.0-rc.8` |

## 1. 定位

多 Agent 管线**管理内核**，业务无关："管线 = pipelines 表一行配置"，内核不内置任何管线（README.md:6-8）。三大职责：通讯（收件箱落盘 + 会话唤醒）、台账（ledger）、UI（控制面板）。工具面为 `pipeline_define/deploy/register/seed/mkdirs/push/list/claim/done/cancel/strike/ledger_write/ledger_list/archive/unarchive/purge/pack/reconcile/status` 共 18 个 defineTool + `/pipeline gate|status|pack` 斜杠命令 + 6 条 HTTP 路由。核心抽象极小：**一张任务表 + 字符串 tags 协议 + result 内嵌 route 标记**，即可实现多角色单向链流转、返工、门控、自愈。

## 2. 架构与机制（源码级）

### 2.1 存储模型：四张域表（lib/domain.js）

`kernelDomain = defineDomain({ tables: { tasks, registry, ledger, pipelines } })`（lib/domain.js:88-97），JSON 后端 + zod 校验：

- **tasks**（TaskRecord，domain.js:10-27）：status 四态 `open/claimed/done/cancelled`；关键扩展字段 `lastWakeAt`（watchdog 冷却共享）、`routeKey`（自动路由幂等键）、`successorTaskId`、`routeError`、`updatedAt`（静止判定）。
- **registry**（domain.js:30-35）：key = `` `${pipeline}/${role}` `` → `{sessionId}`，角色会话注册表持久形态，唤醒与状态视图的单一事实源。
- **pipelines**（PipelineRecord，domain.js:50-65）：一行即一条管线：`roles{role→{sessionId?,preset?,model?,seed?}}` + `chain[]` 单向链 + `entry{default,skipDesign}` + `gates{gateId→{after,desc}}` + `artifactRoot/inboxDir/strikeOut/modelDefaults` + `archivedAt`（归档标记）。
- **ledger**（LedgerRecord，domain.js:75-86）：key = `` `${pipelineId}/${type}/${name}` ``，行内 `history[{status,note,ts}]` 追加式变更记录。

### 2.2 define / deploy / seed（lib/deploy.js, lib/seed.js)

- `definePipeline`（deploy.js:30-75）：id 格式校验（`^[A-Za-z0-9_-]{1,64}$`，deploy.js:17）→ zod `partial().parse` → 只合并显式传入字段（漏传保旧值），全程 `withLock` 临界区。
- `deployPipeline`（deploy.js:111-159）：建各角色收件箱目录 + 注册核对报告；定义声明了 sessionId 但注册表缺失时落地 registry（"消除隐藏前置"，U-1/B-5），定义与实况冲突显式报警。
- `seedPipeline`（seed.js:23-138）：官方配方 `agents.create({setup: mountPreset})` 给未注册角色播种会话；cwd = 管线专属工作区；会话 id `session-<pipeline>-<role>` 撞车自动加序号重试 5 次（seed.js:85-109）；幂等复用已注册会话（cwd 匹配才复用，明确不匹配视为残留清除重播，seed.js:44-53）；显式 `attachSession` 到 workspace（GUI 归属）；supervisor 播种后立即 followup 一条引导消息避免 blank 会话渲染引导页（seed.js:117-120,157-166）。`seed:false` = 占位节点不播种。

### 2.3 投递与流转（lib/tools.js, lib/pipeline.js）

- **tags 最小原语**（tools.js:29-31）：`target:<角色>` 定向 + `task:<编号>` 同链关联 + `attempt:<n>` 三振计数 + `pipeline:<id>` 归属 + `parent:<taskId>` 后继溯源。
- `pipeline_push` → `createTask`（pipeline.js:251-314）：`withLock` 串行化 scan+put；routeKey 幂等（同父任务+目标+attempt+kind 只允许一个后继，pipeline.js:43-46,273-276）；B-7 同链槽查重——同 `task:`+`target:` 且活跃 → `DUPLICATE_SLOT` 拒绝（pipeline.js:278-290）；随后把任务单投影成 Markdown 写入 `<inboxDir>/<角色>/任务单-<id>.md`（tmp 写入 + rename 原子替换，pipeline.js:206-242），best-effort 唤醒目标会话并写 `lastWakeAt`（与 watchdog 共享冷却防双路径刷屏，tools.js:76-79）。
- **流转**：`claim` open→claimed（pipeline.js:357-359）；`done` claimed→done 时打 `routing:pending` 标签（pipeline.js:364-373）→ `autoRoute`（pipeline.js:471-505）：
  - result 文本解析协议：`route:<角色|UID>`（容忍全角冒号/等号，白名单字符集，pipeline.js:398-401）、`rework|返工` 前缀（注意中文无词边界故不用 `\b`，pipeline.js:403-407）、`产物:<path>` 显式声明；
  - 目标解析分级：UID 直连（`route:session-*` 经 registry 反查，pipeline.js:443-448）> 角色精确名 > 前缀唯一命中 > 反向前缀唯一命中，解析失败显式抛错转主管而非静默丢链（pipeline.js:526-529）;
  - 门控检查：目标角色出现在任一 `gates.*.after` → 不自动投，唤醒主管等 `/pipeline gate <gateId> pass|fail` 人工落账（pipeline.js:516-518,621-626）；
  - chain 生效：route 目标不在 `def.chain` → 越链拒绝降级主管（B-6，pipeline.js:531-539）；
  - 返工：attempt+1 自动投，达 `strikeOut`（默认 3）打 `blocked` + 唤主管三振升级（B-12，pipeline.js:595-617）;
  - 正常投递 `pushNext`（pipeline.js:541-592）：创建带完整 tags 的后继任务、回写父 `successorTaskId`、UID 优先唤醒、成功写 `lastWakeAt`；
  - 兜底：整体 try/catch，任何失败打 `route:failed` 标签 + 唤主管例外（C-1，pipeline.js:471-494）；只有正常结局才清 `routing:pending`（pipeline.js:496-503）。
- `deliverArtifacts`（pipeline.js:120-193）：review 过审后把台账 taskId 强关联条目 + result 显式 `产物:` 声明的文件搬入 `交付/`（节点目录内 move、外 copy、根外路径拒收、同名 skip、`.tmp-` 半程可清扫）。reviewer 触发硬编码在 pipeline_done 工具层（tools.js:175）。

### 2.4 台账与门控（lib/ledger.js）

- `ledgerWrite`（ledger.js:17-76）：同键 upsert，`update(key, fn)` 原子读改写优先，missing-key 回落 put 后**补一次原子 update**（P2-5：并发双首写经写链重读追加，history 不丢）；幂等追加防重复 history（ledger.js:36-45）。记什么：type/name/path/status/note/taskId/pipelineId + 全量变更史——本质是"产物级状态机 + 审计轨迹"。
- `gateRecord`（ledger.js:135-168）：校验 gateId 必须存在于某管线定义 gates（防伪造门控），可选绑 taskId（同名 gate 多任务不互相覆盖，name=`gateId@taskId`），落 `type='gate'` 台账行。
- `strikeCount`（ledger.js:99-131）：读任务 `attempt:` 标签取最大值，≥strikeOut 原子补 `blocked` 标签。

### 2.5 watchdog（lib/watchdog.js）

每 `watchdogIntervalMs`（默认 5 分钟）一个 tick（watchdog.js:26-125），判的不是进程死活而是**任务语义静止**：

1. 先跑 `reconcileZombies`（pipeline.js:796-835）：扫 `status=done && routing:pending 残留 && 无 route:failed && 无带 parent: 本任务的后继` → 重跑 autoRoute 补投；已有后继的只回填 successorTaskId 并清标记。"死"的定义 = **done 但路由半途崩溃且无后继**。
2. `cleanupRegistry`：孤儿注册行（管线已删且无任务引用）清理（pipeline.js:773-787）。
3. open 任务补唤醒：目标角色 agent `idle` 且过 `lastWakeAt` 冷却（默认 10 分钟）才唤醒；**先写链内原子写冷却（同时确证仍 open）再投递，投递失败回滚冷却**（P1-4，watchdog.js:75-98）——tick 与 done 竞态下不会误唤醒已 done 任务。
4. 全链静止汇报：按管线聚合 `lastActivity=max(createdAt,doneAt,updatedAt)`，超 `watchdogStallMs`（默认 30 分钟）且有 open 任务 → 唤主管，per-pipeline `reportState` 冷却（默认 30 分钟，watchdog.js:100-116）。tick 用 `ticking` 布尔防重入（watchdog.js:30-33）。

### 2.6 归档冷存储与打包复用（lib/pipeline.js, lib/pack.js, lib/web.js）

- 归档 = pipelines 行打 `archivedAt` 标记 + ledger 记一条 archive，数据全保留可恢复（pipeline.js:681-741）；purge 仅归档箱内可用，只删定义+注册表行，任务/台账历史永不销毁，且**先清注册表最后删定义**保证崩溃可重试（P2-6，pipeline.js:750-765）。
- `packPipeline`（pack.js:35-197）：状态检查（未完成任务数、台账产物文件存在性核对）→ green 判定 → 生成 `pipeline-pack-v1` JSON+MD 落盘 `<artifactRoot>/packs/` → ledger 记 type=pack。打包时 **roles 剥离 sessionId**（"旧 UID 是历史事实，复用时应重新播种"，pack.js:103-108）。复用走 HTTP `pipeline-create` 带 `fromPack`：读包重建定义 → deploy → seed → 生成文档模板（web.js:106-173）。

### 2.7 面板与一致性

- UI 数据面唯一 HTTP：`GET /state`（快照缓存 + dirty 失效：`domain/changed` 事件统一失效 + 30s TTL 兜底，index.js:71-73 + dirty.js + web.js:33-69）、`open-folder`（工作区白名单校验，web.js:73-103）、create/delete/archive/unarchive/purge 五个管理端点（web.js:106-289）。快照组装单遍任务索引（snapshot.js:26-60）。
- 路径安全集中一处：`workspace.js` 所有相对路径必须落在工作区内（`isWithin` Windows 大小写处理，workspace.js:58-65）；角色名/管线 id 正则白名单防路径穿越（pipeline.js:16-22）。

## 3. 对本项目的可用模式

### Adopt（直接吸收的思想）

- **崩溃恢复三件套**：`routing:pending` 半程标记 + `routeKey` 幂等键 + `parent:` 溯源标签（pipeline.js:43-55,364-373,544-549）。mission-driver 的 EXEC_PLANS 写 run-state/events.jsonl 时同样存在"步骤提交后、副作用完成前崩溃"窗口，可用同款"标记残留即可对账重放"协议，比全量 checkpoint 轻。
- **语义静止判死 + 冷却原子化**：watchdog 不探进程而是看 `updatedAt` 时间窗 + agent idle + 冷却先写后唤、失败回滚（watchdog.js:75-98）。我们的 reaper/watchdog 若只盯 PID/心跳，可补这层"任务级静止"判定；参数全部走 config 且默认保守（无任务零噪音）也值得照抄。
- **tags 字符串协议承载路由语义**：不建图引擎，`target:/task:/attempt:/pipeline:/parent:` 五个前缀 + result 内嵌 `route:` 标记完成全部流转。验证了我们"flow JSON 即配置行"同方向的最小性判断——它的原语甚至更小（纯文本约定）。
- **归档语义**：archivedAt 软标记 + purge 仅归档箱内 + 删除顺序保证可重试（pipeline.js:681-765），适用于我们未来 missions/runs 的冷存储设计（当前我们只有 logs append-only，无生命周期管理）。
- **打包剥离运行时身份**：pack 导出前剥 sessionId（pack.js:103-108）——对应"mission 配置不得内嵌 run/session 身份"，与 install-age.sh 从 template 填充而非拷贝实况同构。

### Adapt（需改造后用）

- **pipeline-as-config-row vs flow JSON 同构性**：成立但不等同。它的"行"= 自由角色集 + 数据驱动 `chain` 拓扑 + `gates` 插入点；我们的 missions/<name>.json = **固定骨架**（CHECK→REVIEW_PLANS→EXEC_PLANS→DRAFT_PLANS→DEEP_AUDIT）+ 数据参数。即：它把拓扑放进配置，我们把拓扑放进代码、把内容放进配置。表达能力差异：它多出①人工门控节点（gates.after）②返工 attempt 上限（strikeOut）③越链校验（chain 成员检查）；我们多出审计预算、plan 文件联动、roadmap 进度推导。可吸收点是给 flow JSON 增加**阶段间人工门/确认点**与**重试上限**两类声明字段，而非引入自由链拓扑。
- **claim 语义对比 roadmap-as-queue**：它的 claim 是多会话竞争认领（open→claimed 记 claimedBy），配合 B-7 同槽查重 + withLock 防双投；我们的 roadmap 队列由单一 driver 顺序消费，无竞争。若 mission-driver 未来做多 worker 并发，B-7"活跃槽位查重放锁内 scan+put"（pipeline.js:252-290）是现成蓝本；现阶段不需要。
- **registry 持久形态**：`` `${pipeline}/${role}` `` 行式表（domain.js:29-35）。我们单会话单 run 无此需求；但 Mission Control 监控面板若要展示"哪个会话在跑哪条 mission"，可借这个 key 约定。
- **台账 vs run-state/events.jsonl**：它把台账做成"同键 upsert + history 内嵌数组"（KV 行内存变更史），适合面板随机读；我们 events.jsonl 追加流适合审计重放但面板要全读折叠。若 Monitor 需要 KPI 视图，可在 run-state 里派生"当前值 + 计数"投影（等价其 ledger 行），不必改成 KV 库。

### Reject（明确不做）

- **收件箱 Markdown 双写投影**：domain 表 + fs 任务单文件双真相（pipeline.js:196-242），为"人可浏览"付双写一致性与清扫成本；我们 docs/plans 即人类界面，不需要第二投影。
- **中文目录名**（`exchange/收件箱`、`节点N`、`交付`）与 `.tmp-` 手工原子写：跨平台隐患，且 Node 侧我们已有成熟写法。
- **result 正则协议作为主控通道**：它靠 LLM 输出纪律 + 大量容错补丁（全角冒号/简称解析/词边界注释，pipeline.js:396-440）撑住，脆弱面可见于其审查修复记录；我们的 step 结果应走结构化字段，文本协议至多做提示层。
- **cordis/storageDomain 宿主栈**：强绑定 rc.8 私有 API，代码不可移植，只取思想。

### 与既有能力的重叠区（避免重复建设）

任务板四态机、角色注册表、watchdog 补唤醒、面板快照轮询——均与 mission-driver 的 loop 驱动 + run-state + Monitor 重叠，**不建议引入其工具族或分叉实现**；真正缺口只有三个：阶段间人工 gate、attempt 上限/blocked 升级、run 归档生命周期。这三项可作为 mission-driver backlog 候选，各自工作量都在单模块内。

## 4. 风险与不适用面

1. **宿主锁定**：所有运行时调用假设 `deepseek-harness 0.1.0-rc.8`（agents.create setup-mount 配方、followup 无 mode 参数、webServer 服务键），升级敏感；对我们仅有模式参考价值。
2. **文本协议脆弱性**：route/rework/产物 解析依赖 LLM 格式纪律，项目自己的 docs/ 下多份审查报告（审查 P1-x/B-x/C-1 等编号遍布注释）显示该区域是缺陷高发带——佐证我们"结构化优先"的路线。
3. **存储规模上限**：JSON 域后端全表扫描随处可见（successorOf、B-7 查重、cleanupRegistry 均 O(n) 遍历，pipeline.js:49-55,280-290,773-787），任务量大后巡检成本线性涨。
4. **"业务无关"有小破口**：reviewer 交付触发、默认四角色 designer/prompter/reviewer、inboxCounts 兜底角色表硬编码在内核层（tools.js:175、pipeline.js:857）。
5. **疑似 bug**：`writeDocTemplates` 引用未定义变量 `artifactRoot`（应为局部 `root`，lib/web.js:395,398）——首次实际写入模板时会抛 ReferenceError，被 pipeline-create 外层 try 捕获导致整个请求 500（此前 define/deploy/seed 已生效，状态不一致）。引用该插件打包模板生成功能前需自行实现。
6. **watchdog 只能唤醒在线 agent**：离线会话 `woken:false` 回滚冷却靠下个 tick 重试（watchdog.js:92-97），长离线任务实际靠主管人工兜底。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| 插件入口/config/lazy domain | lib/index.js:19-79 |
| 四表 schema（tasks/registry/pipelines/ledger） | lib/domain.js:10-97 |
| define/register/deploy | lib/deploy.js:30-108,111-159 |
| seed 播种/撞车重试/workspace attach | lib/seed.js:23-138,141-148,157-204 |
| createTask 锁+B-7 查重+routeKey | lib/pipeline.js:251-314 |
| 任务单 Markdown 投影（原子写） | lib/pipeline.js:196-242 |
| done/routing:pending/autoRoute/gates/三振 | lib/pipeline.js:361-373,471-638 |
| route/rework/产物 文本协议解析 | lib/pipeline.js:396-440 |
| 僵尸自愈 reconcileZombies | lib/pipeline.js:796-835 |
| 归档/恢复/purge/孤儿清理 | lib/pipeline.js:681-787 |
| 台账 upsert+history 幂等追加 | lib/ledger.js:17-76 |
| gate 落账校验 | lib/ledger.js:135-168 |
| watchdog tick 全流程 | lib/watchdog.js:26-125 |
| 18 个 pipeline_* 工具注册 | lib/tools.js:24-600 |
| /pipeline gate\|status\|pack 命令 | lib/commands.js:15-78 |
| HTTP 面（state/open-folder/create/archive/purge） | lib/web.js:26-294 |
| 打包/复用/roles 剥离 sessionId | lib/pack.js:35-197,199-218 |
| 路径安全单一入口 | lib/workspace.js:12-108 |
| AgentRuntime 窄适配层 | lib/agent-runtime.js:20-117 |
| 快照脏失效 | lib/dirty.js:14-39；lib/index.js:71-73 |

**诚实标注**：服务端逻辑按仓库交付形态阅读编译产物 `lib/*.js`（`src/` 仅含客户端 UI 的 TS 源码）；`src/client/PipelinePanel.tsx`（738 行）只读了文件头未逐行核对面板交互；`docs/` 下设计文档、`test/` 断言细节、`lib/client.js`、`lib/snapshot.js` 61 行以后、`lib/types/*.d.ts` 未读。stars 数因只读约束未联网核实。
