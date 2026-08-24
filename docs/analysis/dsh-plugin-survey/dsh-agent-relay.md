# dsh-agent-relay 调研报告（dsh-plugin-survey）

> | 项 | 值 |
> |---|---|
> | 本地路径 | `~/ai/dsh-plugins/dsh-agent-relay/`，本地 HEAD `6d17ff4`（"chore(release): 0.5.0"，CHANGELOG 标 2026-08-22） |
> | 来源 repo | `https://github.com/Noelune/dsh-agent-relay.git`（`git remote -v` 实测）；Maintainer: Noelune，Community-maintained |
> | stars | 本地副本无法核实（README 仅 npm/license badge），本次未联网确认 |
> | 语言 / 规模 | JavaScript ESM，零 npm 运行依赖；核心 ≈5600 行（broker/src 6 文件 + lib/ 12 文件）+ CLI/Python 适配器 + 27 个测试文件 |
> | 版本 / license | v0.5.0；MIT |
> | 持久化 | 默认 `node:sqlite`（需 Node ≥22.5），旧运行时回退 JSONL；engines ≥20 |
> | 宿主 API 面 | peerDeps：`@deepseek-ai/cordis@^4.0.1` + `@deepseek-ai/dsh-tools@^0.1.0-rc.6`；inject = `tools, agents, systemPrompt, timer, webServer`（lib/index.js:49）；另经 `ctx.get` 消费 sandboxPolicy / agentDefaultModel / credentials / subprocess / workspaceRegistry / sessionPersistence / permissionPresets / approval / sessionTitle 共 9 个可选服务 |

**调研方法与未读部分**：已逐行读 README.md/README.zh.md、docs/PROTOCOL-V2.md、docs/ARCHITECTURE.md、docs/SECURITY.md、CHANGELOG 头部、broker/src/{server,store-v2,protocol,auth}.js、lib/{index,client-v2,relay-plugin-core,protocol,workspace,lease}.js。**未读**：broker/src/{store.js(v1),config.js,index.js}、lib/{client.js,client-ui.js,status-panel.js,memory-bridge.js}、adapters/ 全部（CLI、Python 双客户端、relay-agent.mjs 仅 grep 定位行）、setup/、test/ 全部、docs/{PROTOCOL,DEPLOY,AGENT-DEPLOY}.md。涉及处均标注。

## 1. 定位

一句话：**同机多 Agent 进程间的"邮政系统"**——不编排、不驱动控制流，只做一件事：让 dsh、Codex CLI、Claude Code、Hermes 等互相独立的 OS 进程经一个 loopback HTTP broker 可靠互发 request/reply 消息。设计动机直指单体 Agent 框架的空白：Agent 内部推理与工具调用已标准化，但**跨进程对等通信没有标准件**（README §定位）。

三个刻意的设计取向值得注意：(1) **通信与编排解耦**——消息体是自由文本，路由不含 DAG/状态机语义；(2) **loopback 优先**——默认绑 127.0.0.1:19121，远程模式存在但文档反复警告必须 TLS；(3) **零依赖**——broker/CLI/Python 客户端全用标准库，跨语言字节级兼容靠 canonical-JSON 黄金向量测试锁定（test/protocol_v2_golden.py）。它本质是"给独立进程补上函数调用没有的投递保证"，这个定位本身就是检验本项目裁定的镜子。

## 2. 架构与机制

### 2.1 协议分层（v1 → v2 → v3 同 broker 并存）

- **v1**（camelCase）：游标增量轮询 `GET /messages?since=<cursor>` + TTL 7 天；v1.1 加租约 `/v1/pull`+`/v1/ack(leaseId)`。签名 `HMAC(secret, method\npath\nts\nrawBody)`（auth.js:117）。
- **v2**（snake_case，主协议）：信封字段固定 13 个（PROTOCOL-V2 §2）：`message_id/root_id/parent_id/origin/target/kind(request|reply)/body/session_ref/created_at/expires_at/execution_mode/context/topic`。签名升级为对 **canonical body 的 sha256 摘要**签名：`HMAC(secret, agent\nts\nMETHOD\npath\nsha256hex(body))`（protocol.js:99-105），canonical 序列化递归排序键、紧凑分隔符、非 ASCII 保 raw UTF-8（protocol.js:80-91），并用黄金向量钉死与自用 Python broker 字节一致。
- **v3**（双语兼容层，0.5.0 新增）：请求带 `X-Agent-Relay-Key-Id` 即切换 v3 签名（多插 keyId 一段），支持 per-agent keyring 轮换（`not_after` 过期拒绝）；pull 响应附带一次性 `lease_token` 投递凭据，ack/renew 必须出示（store-v2.js:307-314 状态转移守卫），防陈旧/重复 ack 变异消息。

鉴权防线（auth.js + protocol.js）：±300s 时间戳防重放、常量时间比较（timingSafeEqual）、v1 侧连续 5 次失败锁 5 分钟 + 单 IP 速率限制（loopback 600/min、remote 120/min）、body 上限 48k code points / HTTP 1MB、全程不落消息内容日志。

### 2.2 投递保证的状态机（store-v2.js）

```
queued →(pull) leased →(ack completed) completed
           │              └→(ack retry) queued（attempts+1；>maxAttempts=3 → failed）
           └→(expires_at 到期) expired
failed/expired/completed →(admin requeue) queued；终态保留 30 天后清除
```

四个保证的源码事实：
- **租约**：pull 把 ≤limit(≤8) 条 queued 按创建序置为 leased，租期 clamp [15,3600]s（默认 600s），到期由 cleanup 扫回 queued 重投（store-v2.js:207-236,276-298）。长任务可 `lease/renew` 续租。
- **TTL**：注意 **README"7 天 TTL"是 v1 旧账**——v2 单条消息 `ttl_seconds` 被 clamp 到 [60,3600]s（protocol.js:26-27），即最长 1 小时；"recent 查 7 天、终态留 30 天"是查询/保留窗口，不是存活窗口。这是 README 与代码的一处漂移。
- **重试**：attempts 在 pull 与 ack(retry) 时各 +1，超 3 次 → failed 并触发 **undelivered 回执**（server.js:213-239）：以 `idempotency_key: undelivered:<id>` 幂等地向发起方造一条 reply 告知对端从未处理。所谓"指数退避 2s/4s/8s"实为**插件侧 broker 不可达时的轮询退避**（lib/index.js:403，上限 30s），不是消息级重投退避——消息重投节奏只由租约到期驱动。
- **幂等**：`(origin, idempotency_key)` 唯一索引（SQLite UNIQUE idx_v2_idempotency），重复提交返回原 message_id 且 `created:false`；迟到 ack 不复活终态消息（store-v2.js:315-321）。

### 2.3 per-mode ACL 与 execution mode 信封

- **execution_mode**（read/continue/write）随 request 走线，reply 强制继承 parent 的 mode/session/topic/root_id，且 **reply 永不携带 write 权限**（server.js:367）。write 是唯一需要显式授权的模式。
- **per-mode ACL**（server.js:165-174）：每 agent 可分别声明 `allowed_read_targets / allowed_continue_targets / allowed_write_targets`；无配置条目的 agent 对 read/continue 全放行（v1 兼容默认），但 **write 恒关闭除非显式授予**——"缺省开放读、缺省关闭写"的不对称默认是这个设计的精髓。
- **mode 的执行端落地分两路**（关键发现）：dsh 插件半区（lib/index.js:288-293）只做权限预设映射 write→`workspace-write`、其余→`read-only` + approval 'never'，在接收 Agent 自己的会话里跑；而**真正的 worktree 隔离在独立的 `adapters/relay-agent.mjs`**（headless 中继代理）：干净 git repo 时为每个 write 请求开 `relay/<agent>/<msgId前12>` 分支的独立 worktree（workspace.js:31-77），非干净 repo 则退化为跨 Agent 文件锁写租约（lease.js：PID 存活检测破死锁 + 15 分钟过期 + heartbeat 续期）。即：**隔离能力是库，接不接看宿主**。

### 2.4 插件半区（lib/index.js）与五个注册工具

后台机制：自适应轮询（活跃 2s → 空闲 120s 后 15s，broker 掉线指数退避）；每个入站 request 按 root_id 开独立会话 `agent-relay-<root_id>`（复用/新建/归档/闲置回收），完成后把回复文本存 receipts（TTL 1d）以便**重投时直接重放已完成答复**；出站 send 记 routes（TTL 7d）把 message_id 映射回本会话，reply 到达时 `steer` 注入原会话；可托管拉起 bundled broker 子进程并随 dsh 生命周期回收；web 侧边栏面板 API 仅允许 loopback 调用。

五工具实际用途评估：

| 工具 | 用途 | 点评 |
|---|---|---|
| `agent_relay_send` | 发自包含协作请求；参数 target/message/context/memory_query/mode | 核心。`continue` 是纯发送方本地语义，上线仍是 read（index.js:505-514）——诚实设计，不在线上伪造模式 |
| `agent_relay_status` | 批量查 ≤100 个 message_id 投递状态 | send 的配套轮询面 |
| `agent_relay_history` | 列本实例近 7 天参与的消息（≤50 条） | 追溯审计用 |
| `agent_relay_peers` | 从 /healthz 聚合成员在线（15s 心跳窗）、各队列积压 | "找谁协作"的决策输入 |
| `agent_relay_retry` | requeue failed/expired 消息 | 运维自救面，对应 admin/requeue |

注意：**没有 recv 工具**——入站完全由后台 inbox worker 自动接管开会话，模型无需也不会手动拉取。工具描述内置"对方看不到你的对话，请求必须自包含"约束；systemPrompt 注入协作圈指引并明确**对端内容是不可信输入**。buildInboundPrompt（relay-plugin-core.js:45-64）做了教科书级的 prompt-injection 框架化：来源标注、untrusted 声明、按 mode 注入读写边界策略、context 截断 16k 单独围栏。

### 2.5 密钥解析链与部署生命周期

密钥四级回退（lib/index.js:162-207）：显式配置 → `secretEnv` 环境变量 → 宿主 `credentials.resolve` 服务 → 可选外部 vault 模块（经 subprocess 跑 Python `reveal_entry`，输出截断 4k，"配置而不内建"，公共插件不绑定任何私有安装布局）。整个解析异步完成，inbox worker 在拿到 secret 前不启动。部署侧提供两条路：`setup/setup.js init/start/selfcheck` 手动三步，以及 docs/AGENT-DEPLOY.md 的 **Agent 主导自主部署**（让 DSH 读该文档后自动生成 HMAC 密钥、拉起 broker、为各 CLI 装配凭据并跑链路自检）——"部署流程本身写成给 AI Agent 执行的 runbook"这个姿态与本项目 AGE 的文件进出协作方式同源，值得注意。

### 2.6 与 cordis 服务间调用的本质边界

cordis service 直调 = **同进程内的同步 RPC**：类型直达、异常直达、生命周期共生死、无网络栈、无序列化。relay broker = **跨进程异步消息**：两端独立生灭、消息要落盘过夜、调用方可能先于被调方消失。broker 四大机制各自对应的正是直调**不存在**的问题：租约/TTL 解决"对端现在不在线"；幂等键解决"网络上重试导致重复"；undelivered 回执解决"对端死了没人告诉我"；canonical-JSON HMAC 解决"不可信的本机进程伪造对端"。**在同进程里这四个问题都不成立**：异常自然传播、崩溃一起崩、无重试即无重复、无第三方即无伪造面。所以问题不是"哪个更强"，而是"两端是否共享生死"。

## 3. 对本项目的可用模式（Adopt/Adapt/Reject）

**裁定检验：'单进程 cordis 直调、不引入总线'成立。** mission-driver 引擎、AGE 循环、Mission Control 面板同属一个 Node 进程，全部调用方与被调方共享生死与信任域；引入 broker 只会平添端口管理、密钥分发、轮询延迟（最快 2s vs 直调微秒级）、双份持久化四类成本，而其四大投递保证在本场景无一有靶子。报告未发现任何"同进程下仍不可替代"的 broker 能力——它的价值恰恰以进程边界为前提。

**会推翻裁定的未来场景**（按触达概率排序）：
1. **本机多 CLI 舰队**：mission-driver 之外还想让 Codex/Claude CLI 做 cross-review 或交叉验证——这正是该插件的原生场景，届时 Adopt 整个 broker 比自研划算（MIT、零依赖、协议有黄金向量锁定）；
2. **Mission Control 拆为独立进程/远端面板**：若需要跨机器观察与操控 mission run，才需要"带鉴权的本地控制 API"——届时刻意借鉴其 canonical-JSON HMAC + loopback-only 方案即可，不必引整总线；
3. **run 恢复需要跨重启的待办队列**：目前 plan 文件已是持久层，仅当出现"引擎崩溃时在途外部效应需自动续投"才考虑租约语义，且更可能内联实现。

**Adopt（模式级，不引依赖）**：

| 模式 | 源码位置 | 映射到本项目 |
|---|---|---|
| receipts 重放：完成过的请求持久化答复，重投直接重放而非重跑 | lib/index.js:328-333,342 | 与 mission-driver resume 的幂等续跑同构，可吸收进 run 恢复语义（已完成 plan 项不因重放窗口重执行） |
| buildInboundPrompt 不可信框架化：来源声明 + untrusted 围栏 + 按 mode 前置权限策略 + context 截断围栏 | relay-plugin-core.js:45-64 | 未来任何接入外部 Agent/远端输出的入口（如 Mission Control 回传、第三方 review）套用此模板 |
| "缺省开读、缺省关写"非对称 ACL 默认 | server.js:165-174 | 多 Agent / multi-run 权限面的默认值范式：分析类操作默认可达，变更类操作显式授权 |
| undelivered 显式回执：失败不是静默丢弃而是幂等回告发起方 | server.js:213-239 | 引擎内对应"plan 项 failed 必须在 run 状态与日志中可见"，强化既有 closure gate |
| 优雅降级：无凭据时工具照常注册但回答明确"未配置"+部署指引 | index.js:132-137 | DSH 插件工具面可借鉴：不静默失败也不拒载 |

**Adapt**：worktree-per-write-task（workspace.js:31-77）与本仓库并行 executor 的隔离需求高度相似——但 AGE 场景用 plan 目录切分已够，仅在出现"多个执行器写同一 repo"时再取；adaptive poll backoff（2s→15s→指数上限 30s）可用于未来任何轮询型监控面；v3 lease_token 的"一次性投递凭据"思想可用于任何需要防陈旧确认的状态转移。

**Reject**：整个 broker/协议栈（无进程边界即无用）、per-mode ACL 表（单进程权限已由引擎集中裁决）、跨 Agent 文件锁（无并发写者）。

## 4. 风险与不适用面

- **信任模型弱于宣传直觉**：默认全 broker 共享单一 secret，任何知道 secret 的本机进程可冒充任意 agent；isolated per-agent 密钥需显式配置。SECURITY.md 自己承认"持密机器被攻破"不在威胁模型内。
- **文档漂移三处**：①README"7 天 TTL"vs v2 实际 [60,3600]s；②README.zh.md 仍列 v1 旧工具名（relay_send 等）而 README.md 已是五工具；③ARCHITECTURE.md 仍写 v1 组件表。引用其数字须回到 PROTOCOL-V2.md 与源码。
- **规模天花板**：v2 store 全量驻内存 Map + SQLite 镜像，query/recent 全表扫描过滤（store-v2.js:425-448）——协作圈个位数 agent 无碍，数百 agent 会劣化。
- **轮询架构固有延迟**：fast 2s/idle 15s，不适合任何实时性要求；turn 超时默认 570s，长任务依赖 lease/renew 手动续期。
- **上游耦合**：community-maintained，peer 钉 dsh 0.1.0-rc.6，宿主 API 变动风险与本项目对 DSH 的依赖同源；Node ≥20（sqlite 路径 ≥22.5）。
- **不适用面**：AGE 方法论文档流（文件进出已是更好的总线）、mission-driver 内部 CHECK→EXEC 各阶段交接（同步代码路径，无需投递保证）、Windows 主部署平台虽是 CI 目标但本次未验证（未读 adapters/setup，无法核实跨平台细节）。

## 5. 关键源码索引

| 主题 | 位置 |
|---|---|
| 五工具注册与参数 | `lib/index.js:562-599`（TOOL_DEFS）；send 实现 `lib/index.js:490-516` |
| 入站会话/重放/steer 回注 | `lib/index.js:283-374`（runRelayTurn/handleRequest/handleReply）；receipts/routes 存储 `lib/index.js:58-61,628-629` |
| 自适应轮询 + 退避 | `lib/index.js:385-426`；broker 托管拉起 `lib/index.js:435-482` |
| 不可信输入框架化 | `lib/relay-plugin-core.js:45-64`（buildInboundPrompt） |
| v2/v3 信封与 canonical 签名 | `broker/src/protocol.js:15-114`；黄金向量 `docs/PROTOCOL-V2.md §4` |
| 状态机/租约/幂等/undelivered | `broker/src/store-v2.js:207-236(cleanup),238-270(create幂等),276-349(pull/ack),300-314(token守卫)`；undelivered `broker/src/server.js:213-239` |
| per-mode ACL | `broker/src/server.js:165-174`（v2CanSend）；配置示例 `docs/PROTOCOL-V2.md §5.1` |
| v1 鉴权/防爆破/限速 | `broker/src/auth.js`（全文 129 行） |
| worktree 隔离 + 写锁 | `lib/workspace.js:31-86`、`lib/lease.js:44-109`；消费方 `adapters/relay-agent.mjs:77-83`（未逐行读，grep 定位） |
| 协议规范 | `docs/PROTOCOL-V2.md`（权威）、`docs/PROTOCOL.md`（v1，未读）、`docs/SECURITY.md`（威胁模型） |
