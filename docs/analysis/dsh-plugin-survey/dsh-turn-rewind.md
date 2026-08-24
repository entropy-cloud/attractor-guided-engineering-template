# dsh-turn-rewind 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> | --- | --- |
> | 本地路径 | `~/ai/dsh-plugins/dsh-turn-rewind/`（`/Users/abc/ai/dsh-plugins/dsh-turn-rewind`），shallow clone，HEAD `b1b85f1`（release: publish @anionex/dsh-turn-rewind），tag `v0.1.1` |
> | 来源 repo | `https://github.com/Anionex/dsh-turn-rewind`，创建于 2026-08-13；stars **100** / forks 6 / open issues 4（GitHub API 2026-08-24 核实） |
> | 语言 | TypeScript 源码约 3600 行（`src/`）编译发布为 `lib/*.js`；GitHub 语言标签 JavaScript；零运行时 npm 依赖，peer 仅 `@deepseek-ai/cordis ^4.0.1` |
> | license | BSD-3-Clause（package.json:76 与 GitHub LICENSE 一致） |
> | 版本 | 0.1.1；Node `^22.19 \|\| >=24`；DSH Profile Bundle（`dsh.bundle.patch: cordis.patch.yml`，免 DSH core patch） |
> | 宿主 API 面 | Cordis：`ctx.provide('changeLedger')` 公共服务、`ctx.inject(['agents'])` 挂 pre-step 钩子、`ctx.inject(['webServer','sessions','sessionQuery','apiProxy'])` 注册 HTTP；事件 `agent/pre-step`（prepend）；`webServer.register` exact 路由 `/turn-rewind`；`apiProxy.sessions.create/fork`。Client 侧：`slots.inject('conversation.session.header.actions')` 注入 React portal |

## 1. 定位

DSH Web 会话中每条直接用户消息下出现第三个图标动作 **Rewind**（"回到发送这条消息之前"）：对话框展示该消息之后受影响的文件清单（新增/删除/修改/权限或类型变化，分页预览），提供两种模式——**恢复文件并重启会话**（默认；fork 新 Session 并把该条 prompt 放回输入框）或**仅恢复文件**。底层是可独立复用的 **Change Ledger** 引擎，以 `ctx.changeLedger` 公开给其他插件。

定位要点：它不是 diff 查看器，而是拥有完整**持久化恢复生命周期**的安全层——内容寻址还原点、git 状态围栏、过期计划、两步确认、自动救援点、恢复后哈希校验、失败回滚、崩溃日志对账。安全契约（README §Safety contract）：一切恢复显式触发、读先于写、人工闸门、mutate 前必先 rescue、**绝不 commit/stash/reset/切分支/碰 index**，也不自动判断"该不该回退"。v0.1 明确只支持常规 Git worktree。

与本项目的关系视角：mission-driver 的"恢复"是收敛式的——checkout roadmap/plan git 工件后按 checkbox 接续；turn-rewind 的"恢复"是快照回滚式的——把整个 eligible 工作区字节级拉回某个 turn 开始前的时点。两者是同一问题（执行出错后回到哪）的两种范式样本，且 turn-rewind 是快照范式里工程质量极高的实现。

## 2. 架构与机制

### 2.1 Ledger 记录什么（src/types.ts、docs/FORMAT.md）

三层持久对象，格式版本钉死 `version: 1`，读者拒绝一切未知版本、无 best-effort 兼容：

- **RestorePointManifest**（types.ts:45）：`id`（`rp_<time36>_<rand12>`）、`kind: 'user'|'rescue'|'turn'`、workspace、**repository 围栏** `{root, commonDir, head?, branch?, operation?, stagedPaths[]}`、锚定字段 `sessionId` + `turn` + `turnStartSeq`（旧版遗留 `turnEndSeq` 仅兼容读取、永不绑定 Web rewind）、`treeHash`、`entries: path -> {kind:'file', blob: sha256, size, mode} | {kind:'symlink', target, mode}`、restoreCount 等统计。
- **RestoreOperation**（types.ts:130）：一次恢复的 durable 日志，六态机 `'running'|'rollback-running'|'completed'|'rolled-back'|'interrupted'|'recovery-required'`，记 paths、error、rollbackError。
- **RestorePlan**（types.ts:114）：内存态（不入盘）过期计划，15 分钟 TTL、随机 `RESTORE-XXXX` confirmation、逐路径 `expected` 当前状态快照。

存储布局（FORMAT.md）：`~/.dsh/change-ledger/v1/workspaces/<sha256(canonical-worktree)>/{manifests/, operations/, blobs/<2hex>/<sha256>}`。全部 JSON 走 tmp+rename 原子写；blob 先 fsync 临时文件再原子 hardlink 到内容寻址名，读回时哈希复验（store.ts:89 putBlob）。快照范围 = `git ls-files --cached --others --exclude-standard`（tracked + 非忽略 untracked），硬拒 sparse-checkout、submodule gitlink、特殊文件，上限 maxFiles 20000 / 16MB 单文件 / 512MB 聚合，超限 fail loudly 而非截断。

### 2.2 锚定：turn 与文件变更如何关联

锚定键是 **`(sessionId, turn 序号, turn/start 事件 seq)` 三元组，不是消息文本也不是时间戳**：

1. **捕获**（rewind-host.ts:113 TurnCheckpointCoordinator）：`ctx.on('agent/pre-step', …, {prepend:true})`，仅在 `step===1` 时拦截——即 Agent 处理本轮第一条消息之前。从 session 事件流 `findLast(type==='turn/start', data.turn===turn)` 取 `turnStartSeq`，调 `engine.createTurnCheckpoint`。捕获失败只记入内存 `failures` 表并 warn 日志，**绝不 reject 用户 turn**——该消息只是没有可用 rewind 点。同一 worktree 的捕获经 promise 链串行化（serializeWorkspace），引擎侧再叠文件锁。
2. **幂等与保留**：同 `(sessionId, turn, turnStartSeq)` 已存在则直接复用；turn 类 checkpoint 每会话上限 30 个、只 prune 自己这一类，user/rescue 点永不静默清理（engine.ts:128-134）。
3. **解析**（rewind-host.ts:459 messageTarget + :364 resolveMessageCheckpoint）：Web 端给定 `messageSeq`，校验它确实是某 `turn/start` 之后、且是该 turn 的 opening 直发用户消息（`source.kind==='user'`，中间不得插入 `turn/end`），得到目标三元组；再查引擎找 `turnStartSeq` **精确相等** 的 turn checkpoint，不等即 `PLAN_STALE` fail-closed。找不到则沿 `parentSession`+`seedLength` 的 fork 血统向上继承父 Session 的 checkpoint——要求 messageSeq 与 turnStartSeq 都落在 `seedLength` 围栏内、父子 turn 边界三元组完全一致、seen-set 防环。子会话由此能安全复用祖先的检查点，兄弟检查点互不混用。

### 2.3 restore 实现（engine.ts）

四步生命周期，每步都可独立失败：

- **inspect**（engine.ts:178）：`captureStableTree` 捕当前树，与 manifest.entries 做 `diffTrees`（added/deleted/modified/mode-changed/type-changed 五种），同时报告 headChanged/operationChanged。
- **planRestore**（engine.ts:202）：可选 `expectedCurrentTreeHash`/`expectedRepository` 二次验证（inspect 与 plan 之间树变了即 `PLAN_STALE`）；`assertRepositoryCompatible` 要求 root/commonDir/operation 不变，HEAD/branch 漂移默认阻断、须显式 `allowHeadChange`；支持路径子集选择；对"将被删除的路径若被 ignored/unmanaged 文件占据"抛 `UNMANAGED_PATH_CONFLICT` 拒绝。产出 TTL 计划 + confirmation。
- **applyRestore**（engine.ts:258）：plan 存在/未过期/confirmation 精确匹配/sessionId 匹配/防并发重入；apply 时**第三次**重捕树并逐路径比对 plan.expected（assertPlanFresh）+ git 围栏复验（assertPlanRepositoryFresh）。随后 **rescue-before-mutation**：先把当前树存为 `kind:'rescue'` 点（parentRestorePoint 指向目标），再写 `running` 态 operation journal，然后 `restorePaths`——删除按最深优先+剪空父目录，恢复按最浅优先（ensureSafeParents 拒绝 symlink 父目录、非空目录占位先删、replaceRegularFile/replaceSymbolicLink 原子替换），最后 `verifyPaths` 重捕全树逐路径 `entriesEqual` 复核，journal 落 `completed`。
- **失败与崩溃**：restore/verify 失败 → journal 转 `rollback-running` → 用 rescue.entries 反向恢复 → `rolled-back`；回滚也失败 → `recovery-required`（错误信息携带 rescuePointId，交人工）。DSH 中途死亡：下次启动 `initialize()`（store.ts:20）把非终态 journal 在无活锁时标 `interrupted`，经 `listRecovery → inspect(rescue) → planRestore/applyRestore` 走公共 API 恢复；被未完成 journal 引用的还原点禁止删除（isReferencedByRecovery）。

会话重启（mode=both）在代码恢复成功后才调 `createConversationRestart`（rewind-host.ts:432）：首条消息 → `sessions.create` 开空白 Session；否则 `sessions.fork(atSeq=previousTurnEndSeq)`。**fork 失败会自动从 rescuePointId 反向回滚刚恢复的代码**（补偿事务），补偿再失败则 AggregateError 上报。

### 2.4 边界情况处理

- **未提交变更**：根本不区分"已提交/未提交"——快照照单全收工作区现状；恢复后的内容天然呈现为相对当前 HEAD 的普通未提交 diff（README 明示 HEAD 差异不阻断，因为 git 控制面未被触碰）。stagedPaths 只是围栏观测值，不参与恢复逻辑。
- **git 冲突/进行中操作**：gitOperation（git.ts:147）探测 rebase-merge/rebase-apply/MERGE_HEAD/CHERRY_PICK_HEAD/REVERT_HEAD/BISECT_LOG 六种 marker，planning 与 apply 双端比对 `GIT_OPERATION_CHANGED` 阻断；共享同 worktree 的 running Session 也阻断（sharedWorkspaceSessions 按 repo root 归一比较）。
- **捕获竞态**：captureStableTree（snapshot.ts:76）全树连捕两次，treeHash + repository fence + 路径清单三者一致才接受，3 次不成即弃；单文件层面 lstat before/after stat 六元组一致 + 内容长度吻合，防读到撕裂状态。
- **blob GC**：collectGarbage 清无引用 blob，创建新点时顺带以本次引用白名单跑一遍；失败路径也有对称清理。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

**核心辨析——快照回滚 vs 工件收敛**：turn-rewind 的恢复语义是"把文件系统字节级拉回时点 T"，正确性由内容寻址 + treeHash 保证，代价是持续的全量快照存储，且它**不要求工作有任何结构**——这正契合它的场景：交互式单人 Web 会话，用户没有也不需要有计划工件。AGE 的恢复语义是"checkout 到工件版本 V，按 plan checkbox 重新对齐意图"，恢复点是**少数几个外化工件的版本**而非整棵树，收敛靠执行器读 plan 续跑而非字节还原，代价是对"工件之外的工作区漂移"零防护。两者不是优劣关系，而是**前提关系**：有权威计划工件时，快照是冗余副本；没有计划工件时，快照是唯一退路。mission-driver 有 roadmap/plan，所以选收敛；但 turn-rewind 证明了快照范式要做到"可信"需要付出多大的工程代价（围栏、三重校验、journal、rescue、GC 缺一不可）——这本身就是对"别轻易引入快照"的最强论证。

**Adopt（吸收思想，不引代码）**：
1. **Journal 六态机 + 启动对账**：非终态在重启时标 interrupted、终态日志永留作审计证据、被未完成 journal 引用的对象禁删。若 events.jsonl 之上引入任何长操作记录（如 DEEP_AUDIT、异步 run），直接套用此状态机与 reconcile 规则。
2. **Rescue-before-mutation + 补偿链**：破坏性批量改写（run-state 迁移、多 plan 文件重构）前先落可检视退路（对我们即 git commit 或备份分支），失败自动补偿，补偿失败升级为显式 recovery-required 而非静默吞掉。
3. **Plan/confirm 两段式的 CAS 思想**：preview 生成带 TTL + expected 状态的凭据，提交时逐字段重验、任何漂移 fail-closed。对 events.jsonl 的多进程并发写（reaper 并行 run 场景）可直接借鉴为"写前比对 mtime/hash，漂移即重读重试"。
4. **锚定一律用事件 seq 不用时间戳**，且恢复时校验"精确相等"；fork/派生上下文复用祖先锚点须经血统围栏校验。events.jsonl 的 seq 语义与此同构。

**Adapt**：
1. Repository fence → 给 run-state 写入加轻量围栏（git HEAD + 是否 dirty），恢复前校验工作区仍是 plan 期望状态；不需要全量双捕。
2. 分类保留策略（turn 自动点限量自清、user/rescue 永不静默清）→ 未来做"phase 失败自动留档"时的 retention 参考。

**Reject**：
1. 全量内容寻址快照存储——git object store 已是更优的内容寻址快照层，自建一份违背"状态只外化 git 工件"原则。
2. Web 对话框人工闸门——我们是自主 loop，恢复应默认自动执行并记入 events/log，人审是例外不是默认。
3. "绝不碰 git 控制面"的洁癖——这是宿主内第三方插件的正确克制；mission-driver 是自己仓库的主人，git-commit-per-phase 必须继续用 git。

**两个指定问题的回答**：
- *git-commit-per-phase + checkbox 收敛是否已覆盖其价值？* 对 mission-driver 自身：**基本覆盖**。出错回退 = checkout/revert 计划工件 + 重跑，天然跨 session 跨机器；commit 图就是免费的增量快照史。真正的残余缺口只有一个：单个 phase 内大量未提交改动中途出错时，收敛恢复拿不回那些中间产物，而 turn-rewind 能。但按 AGE 纪律 phase 内就该小切片勤 commit，该缺口是纪律违例的症状而非方法论缺口——不值得为症状引入第二套快照基础设施。
- *ledger 思想对 run-state/events.jsonl 有无借鉴？* 有，但借的是 **durability 纪律**而非快照本体：原子写+fsync、append-only 六态 journal、启动 reconcile、引用保护 GC、CAS 两段提交、seq 精确锚定。概念上 events.jsonl 本来就是"我们的 change ledger"——它记录"发生过什么"而非"文件是什么样"，这正是工件收敛范式的自然账本形态；turn-rewind 值得抄的是它对账本的运维纪律。

## 4. 风险与不适用面

- **规模不友好**：每次 inspect/create 都全量 `ls-files` + 双重捕获，O(tree)；20000 文件上限对 monorepo 直接 fail。node_modules 类大型 untracked 目录若无 ignore 覆盖会撑爆聚合限额。
- **存储放大**：512MB 聚合 × 每 turn 一点 × 每会话 30 点；靠 blob 去重缓解，但活跃开发期仍可观。
- **平台/形态限制**：sparse-checkout、submodule、非 git 目录硬拒；符号链接与权限位跨平台行为本次未深入核验。
- **安全设计错位**：session-bound plan、same-origin endpoint、human gate 为多会话 Web 场景而设，整体搬进 headless 自主 loop 只剩开销。
- **诚实标注（未读/未验部分）**：测试套件未运行；`lib/` 构建产物与 `src/` 一致性未验；`src/client/index.tsx`（648 行）仅浏览注入结构与 portal 选择逻辑，未逐行读渲染细节；`store.ts` 后半（collectGarbage/reclaimStaleLock/workspaceAppearsActive）读了签名与局部实现；`path-utils.ts`/`validate.ts`/`errors.ts`/tests/SECURITY.md 正文未读（SECURITY.md 仅确认章节标题）；stars 数来自 GitHub API 而非页面目测。

## 5. 关键源码索引

| 位置 | 内容 |
| --- | --- |
| `src/types.ts:45/114/130` | RestorePointManifest / RestorePlan / RestoreOperation 权威形状 |
| `docs/FORMAT.md` | v1 持久格式规范：目录布局、原子写协议、turn 锚定字段的兼容语义 |
| `src/engine.ts:48` | ChangeLedgerEngine 主类；`:94` createTurnCheckpoint（幂等+保留修剪）、`:142` findTurnCheckpoint（seq 精确匹配）、`:202` planRestore、`:258` applyRestore（rescue→journal→restore→verify→rollback 全链）、`:517` restorePaths（删深先/复浅先）、`:636` assertRepositoryCompatible、`:703` assertNoUnmanagedRestoreConflicts |
| `src/snapshot.ts:76/100/146/162` | captureStableTree 双捕一致性、diffTrees 五种变更分类、hashTree、单文件捕获竞态防御 |
| `src/git.ts:17/79/147` | discoverRepository（eligible 清单+围栏采集）、sameRepositoryFence、gitOperation 六 marker 探测 |
| `src/store.ts:20/49/89/226` | 启动 crash 对账、O_EXCL 文件锁+陈锁回收、blob 原子发布、GC |
| `src/rewind-host.ts:113/122/364/432/459` | TurnCheckpointCoordinator（pre-step 捕获）、install 钩子、resolveMessageCheckpoint（fork 血统继承）、createConversationRestart（fork+补偿回滚）、messageTarget（opening 消息校验） |
| `src/client/index.tsx:159` | Web 端注入入口（conversation.session.header.actions slot + per-message portal） |
