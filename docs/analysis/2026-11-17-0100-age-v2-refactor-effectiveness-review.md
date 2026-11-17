# AGE v2 重构成效与跨项目实践评估

## 1. 结论摘要

**当前重构方向正确，结构性目标基本达到；但尚不能据此认定模板交付、规则一致性和持续演进能力已经全部达标。下一步应停止扩大目录重构，转向消费者验收、规则单源化和防漂移守卫。**

- 值得保留：短 AGENTS 路由、集中 guides、roadmap 与 plan 分离、规范性文档与历史分离、技能分层、mission-driver 可选。这些不是表面整理，而是在减少误路由和维护冲突。
- 尚未证明：新模板能让不同类型项目以更低成本完成真实任务，并在升级后保持既有定制。既有项目长期使用 AGE，不能自动证明新安装包已验收。
- 主要风险不是“少了几个目录或技能”，而是规则文字、安装产物、工具实际检查范围和 CI 之间仍可能不一致。
- 不建议再次全面改名、强迁移已有项目，或把下游 AGENTS 中积累的全部规则原样搬回模板。

## 2. Scope：范围、方法与证据边界

- 日期：2026-11-17；模板初始 HEAD：`151bdfdc41b70ff33a8404a05ca87ceedc9682ce`；开始检查时工作树干净。
- 任务类型：verification / audit work，仅交付分析，不修改安装器、产品行为、自治权限或现有项目。采用 `docs/skills/common/age-practice-gap-audit-prompt.md`，按本任务定制跨仓对照及独立反例探针；本次文档交付走低风险无计划路径。
- 评估尺度：同日原始分析 `2026-11-17-0000-age-template-v2-restructure-analysis.md` 中的目标方向，以及当前 AGENTS、guides、模板边界文档对消费者的承诺。原分析仍标 Proposal，不能把其中每个建议视为已有人类批准的硬验收项。
- 阅读基线：模板 AGENTS、docs/index、context 三文件、文档组织/开发流程/计划/路线图/审计/日志指南、技能注册表、模板与真实项目边界、CI 与卫生工具。
- 独立分工：安装消费链路实测；entropy/flux 实践对照；next/erp 实践对照；计划与文档守卫反例。主会话另核对模板规则和 simulator 的防复发实践。
- 下游仅只读抽样，未执行四个业务项目的完整测试或迁移。报告区分现场运行、源码/文档证据和建议；不把历史报告中的数量直接当本轮统计。

## 3. Alignment Matrix：重构目标是否达到

| 领域 | 预期与当前证据 | 判断 / 分类 | 风险与下一步 |
| --- | --- | --- | --- |
| 上下文与 AGENTS | 根及 template/AGENTS 均为 72 行，身份、路由、硬规则分离；保留自治策略独立文件 | 结构基本达标；intentional-customization | 保留第三个 context 文件合理，不必追求原提案“恰好两件” |
| 目录与指南 | guides 集中；按需目录的创建条件明确；roadmaps 与按路线图隔离的 plans 有独立职责 | 结构基本达标；部分 operational-gap | 不能以目录减少代替完整消费验收；需收敛遗留术语 |
| 需求与 owner docs | 需求、行为、技术结构的所有权已定义；源码/schema 仍有自身权威 | 方法基本对齐；效益 missing-evidence | 验收应覆盖真实需求至行为证明，不只检查文件存在 |
| 技能分层 | common/frontend/java 与操作型技能分离，按类型选择方法 | 方向达标 | 货架规模不等于有效性；注册表、安装集合和路由需要对账 |
| 计划与审计 | 冷启动、独立审计、验证范围诚实已有明确要求 | 部分达标；stale-template-drift | 新旧完成状态格式冲突；必须区分人工纪律与机器强制 |
| 验证 | 有安装测试和文档检查入口；本轮引用检查失败 | 尚未完整达标；operational-gap | 安装产物、负例、CI 路径过滤都应纳入验收 |
| 日志与记忆 | 决策日志避免复述计划，错误模式有 lesson→skill→script 晋升链 | 方向达标 | 复发时应升级机械守卫，而非继续增加同义规则 |
| 引擎与可选层 | 默认不装引擎，指南主张 vendor 与按需目录 | 架构方向达标 | 便携性与接线效果以消费侧实测为准，不能只看源仓 |
| 模板定制与升级 | root/template 边界存在，但方法变更仍要求人工双写 | 漂移风险未消除；operational-gap | 需要来源版本和有冲突提示的升级比较，而非强行覆盖 |

## 4. Findings：当前最需要修的不是目录

### F1 — P1：已有项目的非破坏性存在可复现缺陷，优先于进一步结构优化

- 独立安装探针将既有 `.env` 设为无末尾换行的 `API_TOKEN=keep`，执行带 `--with-mission-driver` 的安装，exit 0 后变成 `API_TOKEN=keepMISSION_DRIVER_HOME=tools/mission-driver`；既有配置值被污染，shim `--help` 随后 exit 1。重装不能恢复原 token。
- 定位：`tools/install-age.mjs:280-283` 直接追加；同文件 `.gitignore` 的处理（`:145-147`）已考虑换行，可复用。对照中既有 AGENTS/index 被保留，不应泛称安装会覆盖全部文件。
- 另有消费契约缺口：默认/frontend/java 的技能索引分别指向 4/2/2 个未安装技能，all 为 0；即使显式将 skills 加入引用扫描也全 exit 0。索引若刻意展示完整货架，必须标注未安装及获取方式，而非假装全部存在。
- `--pi` exit 0 却未生成所宣传的 `.pi/skills` bridge；合法字面项目名 `Cash $& Co` 被 replacement 元语法改写，残留 `<project-name>`；非法 `--profile frnotend` 也静默成功。定位分别为 `install-age.sh:15` 与 manifest 空 pi-only 分段、`tools/install-age.mjs:116-119,373-384`。
- 最小修复：先保护既有文件边界，再把这些负例和 profile 索引对账固化为安装契约测试。其余安装问题按 P2/P3 处理，不与配置内容损坏混为同一严重度。

### F2 — P1：先统一计划完成语义，再扩大推广

- 证据：`docs/guides/plan-authoring-and-execution.md:49-65,131-154` 要求派生完成、禁止写 completed，并指定状态工具；`docs/guides/audit-execution.md:67,86` 仍使用 `Plan Status: completed` 和 draft/active/completed 旧语义；`docs/skills/common/age-practice-gap-audit-prompt.md:39` 仍提示从 project-context 找 active plan，而 context 明确不持有该信息。
- 风险：新 agent 按不同入口得到相反的写法或任务定位方式，独立审计反而可能把正确计划改错。这是当前规范之间的冲突，不是应被保留的历史记录。
- 最小修复：计划指南独占生命周期规则，其他入口只引用；给共享方法文档增加针对旧状态写法和旧路由的定向回归。不要批量改写历史计划和审计记录。
- 独立实测还确认指南 `:51,134` 指定的 `gate-check.mjs <plan> --strict` 因 CLI 不支持该参数而 exit 1；去掉该参数，同一 fixture 结构检查 exit 0。必须给规范中的可运行示例加 smoke test。
- 无 review receipt 的合法 draft 经 `plan-status.mjs <plan> active` 仅警告而 exit 0、实际改为 active；写 completed 则正确 exit 2。故“格式使自关闭不可能”须限定模式；这不证明带真实 actor/policy/旧状态的引擎 full-law 门禁被绕过。

### F3 — P1：默认无引擎路径还需要一个自洽的操作闭环

- `roadmap-authoring.md:7` 声明 roadmap 可选，计划指南 `:59-65` 却要求 roadmap slug/WI，并允许 verify 默认取 mission defaults；后续 receipt 又要求 runId/nonce/commandKey。无引擎、无 roadmap 的普通计划如何映射真实命令，目前缺少清晰的替代路径。
- solo fallback 在计划指南 `:45,176` 被允许，审计指南 `:11` 又禁止冷重播单独批准。`plan-status.mjs --list` 展示原始 active，不能替代派生完成谓词来发现剩余计划。可选引擎不能成为默认流程仍隐含依赖的知识。
- 最小修复：交付一个无 roadmap/无 engine 的完整小例子，实际走完建计划→独立 review→执行与 proof→closure→未完成查询；统一 fallback 的唯一裁决。不是删除独立审查，而是让默认路径不需要猜测。

### F4 — P1 方法风险：执行过命令、存在独立 receipt，仍不足以证明业务验收

- ERP 的既有经验表明，修改设计中的 Non-Goal/Deferred 可以让 doc↔code 自洽，却让原需求消失；局部测试也可能验证旧 `.m2` jar、admin 旁路或 HTTP 200 的错误 JSON。详见下一节，均为有具体样本的风险，不是本轮重新确认 ERP 所有旧问题仍存在。
- 最小补强：closure 增加原始需求→验收→实现对照；检查是谁批准了范围、测试预期和基线变化。验证记录绑定源码/依赖/生成构件、输入全集、角色、业务结果及产物新鲜度；适用时提供红→绿或负控制。
- 独立性拆成三件事：审查者独立、判定依据独立、证据绑定当前代码/环境。不要要求每次全量重复执行，但采信他人结果时必须标明证据来源与限制，禁止用 sessionId 自动替代结果复核。

### F5 — P2：检查器通过不等于规范已经可信，失败也不等于每条都是真死链

- 本轮 `node tools/check-doc-references.mjs` exit 1：46 条引用告警、61 条行号引用告警。部分是引擎/外部项目相对路径被按本仓根解析，不能宣称发现了 107 条真实断链。
- 证据：`tools/check-doc-references.mjs:10-24,41,195-248` 默认只扫 architecture/design/references 和 index，遗漏新核心入口 guides/context/skills/AGENTS，并将部分代码格式路径统一按仓根解析。
- `node tools/check-doc-timeliness.mjs` exit 0，但其规则只是标题、日期条目等形式模式（`:58-79`），不能证明没有历史叙述、规则冲突或过期结论。例如模板边界文档仍保留过去状态叙述（`docs/architecture/template-vs-realproject-boundary.md:12,49`）。
- 最小修复：显式区分当前规则、历史记录、外部引用及示例路径；覆盖所有当前入口，为误报和漏报各留 fixture。时效性检查保留为语法卫生工具，不宣传为语义新鲜度证明。
- 独立反例：guides/context/skills/AGENTS 四处真实断链默认 exit 0，补齐扫描面后 exit 1；timeliness 遇悬空 junction 会吞掉遍历错误、漏扫同目录 `# Changelog` 而 exit 0，移除 junction 后 exit 1。后者应只豁免顶层可选目录缺失，内部读取/遍历失败必须非零退出。

### F6 — P2：消费者质量门尚未成为模板变更的稳定 CI 契约

- 证据：`.github/workflows/age-ci.yml:22-44` 的触发路径覆盖引擎、插件、plans/roadmaps/missions，却未覆盖安装器、manifest、template、共享 guides/skills 和通用检查器；`verify-age.sh:44-89` 是引擎/插件/law 门，不含安装测试和通用文档检查。
- 风险：引擎全绿和模板消费者可用是两个不同结论。只改安装包或指南的提交，不能依赖现有引擎 CI 作为验收凭据。
- 最小修复：源仓增加独立 consumer-contract 作业，覆盖默认安装、各 profile、重复安装、已有项目保留、vendor 启动和负例。消费者无需被强装源仓整套 CI。
- 接线证据：add-on 指南 `:42,46` 要求启用 hook 的计划/路线图/mission sections，并称 pre-commit+CI 机器检查；消费版 `template/install/githooks/pre-commit:31-49` 实际只有 timeliness/garbled 两项。应交付可执行接线或收窄承诺，不能让用户去启用不存在的 section。

### F7 — P2：双源仍主要靠“记得同步”，应把下游防复发经验反用到模板自身

- 证据：`docs/architecture/template-vs-realproject-boundary.md:51-63` 的方法论变更要求 root 与 template 同步；技能注册、profile、manifest、指南、hook/CI 又形成多个交叉面。
- 已有“一个事实一个 owner”的原则很好，但不能仅据此宣称漂移已消失。适配文件允许内容不同，不能用整文件相等充当守卫。
- 最小修复：对需要一致的规则块/注册集合做语义 parity；manifest 生成 profile 专属索引；安装期校验所有必需资源。优先共享引用或单点生成，再考虑额外扫描。
- 本轮隔离消费实测确认，当前 vendor 产物的加载与 mission 发现无需兄弟仓路径；这不等于完整自治执行或升级兼容性已验收。安装器 `:221-223,253-269` 跳过既有文件，只补缺失项，重装有形成新旧混合物的风险；本轮未动态复现旧版兄弟仓依赖失败，也未验证旧版升级全矩阵。模板边界文档 `:39,49` 仍留“引擎留在模板仓/reference not copy”，需对齐当前自动 vendor 行为。

### F8 — P2：轻量化还需落到执行策略，而不只是 AGENTS 行数

- 证据：当前 `docs/guides/` 16 个 Markdown、约 1601 行，common 技能 15 个、约 885 行；它们不必全读，但必须有按任务选择的明确边界。`template/AGENTS.md:55` 和计划指南把独立子 agent 执行作为所有已建计划的通则。
- 我的判断：独立草审和闭包审计应保留；“必须由另一个执行 agent 实施”不必与独立审计绑定为所有运行器的共同必要条件。子 agent 数量不是独立证据数量，缺少工具能力也不应迫使低风险工作伪造流程回执。
- 最小优化：保持一套 owner/验证/审计语义，提供交互式执行与受控自治执行两种策略；引擎专用 token、nonce、runId 放到格式附录。任何放宽现有自治约束都需人类裁决，不能由本报告直接生效。

### F9 — P3：工具自身也要遵守模板卫生规则

- `docs/guides/doc-organization.md:157-160` 指定 `_tmp/`，但 `tools/check-docs-garbled.mjs:11,284,321-332` 仍写 `tmp/docs-garbled-check/`，本轮运行实际产生了该路径。
- 该命令 exit 0，同时报告 2 个 likely-garbled 候选；源码只在执行异常时置非零，属于诊断器而非“发现即红”的门。候选未逐条确认为乱码，不能把两者混淆。
- 最小修复：统一产物目录，明确 diagnostic 与 blocking 两种模式；不要简单把所有启发式候选改成阻断。

## 5. 跨项目实践：应该吸收什么，而非照搬什么

以下 N/E/S/H/F 分别指 `C:/can/nop/nop-chaos-next`、`nop-app-erp`、`cobol-simulator`、`nop-entropy`、`nop-chaos-flux`。Next/ERP 本轮检出 HEAD 为 `8034f8a` / `4537c0110`，entropy/flux 为 `490955799d` / `da067c238`；均不是“远端最新版本”声明。后两仓以当时工作树为证，不假定所有内容都已提交。

| 项目 / 现场样本 | 对模板的启示 | 不应照搬 |
| --- | --- | --- |
| H：`ai-dev/plans/2324-nop-stream-r6-keyed-restore-routing.md:10-14,68-81,137-150`；`nop-stream/nop-stream-runtime/src/test/java/io/nop/stream/runtime/integration/TestKeyedRescaleRestoreE2E.java:76-104,182-258` | 生产前缀、open 时点和恢复生命周期必须进入夹具；回退目标修复行应变红。这里 checkpoint 创建侧是播种、恢复入口是真实驱动，不夸大为生产全链 | 整套有状态流框架流程及每次再开深审 |
| H：`ai-dev/skills/invariant-loop-audit-prompt.md:30-50,64-71`；`.github/workflows/compliance.yml:49-63` | 复发先分析失效类别，再做类别守卫、正反例、自测、CI 接线；价值收敛后暂停深挖 | 用越来越多审计轮数代替防线 |
| F：`docs/bugs/166-ai-chat-streaming-chunk-renders-at-stream-end.md:8-10,21-34,55-63`；`tests/e2e/ai-widgets-fixture.spec.ts:33-66` | 流式过程在结束前采样，要求多次文本增长和 cursor；最终文本正确不证明逐块渲染正确 | 每个静态页面都跑同样时间采样 |
| F：`docs/plans/529-ai-renderers-chat-ux-remediation-plan.md:154-159,174-198,233-240`；`docs/logs/2026/10-06.md:67-70` | 审计能抓到声称已改但未落盘；最后一轮 issues 后必须有整改证据与独立接受，不能只看顶部 completed | 把有 reviewer ID 等同于最后拒绝项已关闭 |
| N：`docs/source-of-truth-and-precedence.md:15-25,38-54`，`docs/design/index.md:80-86` 将可计算依赖规则归脚本，设计只解释约束 | owner 是权威关系，不是物理目录数量；可保留合并的 design | 强制恢复独立 architecture/context 目录 |
| N：`docs/plans/43-extension-host-inject-contract-alignment.md:173-230,274-285` 记录局部通过后生产资源/manifest 仍阻塞，子代理失败后使用 self-audit | 集成验收必须贯通生产者输出→构建产物→发现→运行；self-audit 不能改名为独立审计 | 具体扩展注入协议和双引擎部署矩阵 |
| N：`docs/bugs/50-flux-form-submit-data-empty.md:14-39` 跨 XPL 模板、RPC 包装和运行时字段解析 | 低代码验证按生成/运行链组织，不能仅按 frontend/java 文件类型切分 | 项目专用 resolver 与 API 规则 |
| E：`AGENTS.md:154-164,185-193` 的模型/XML→Delta→Java 及禁止改生成物 | 把源模型、生成器、生成物、手写覆盖、包及运行时消费者列成证据链；模板已有模型权威原则，需要操作性补强 | 财务保护区、具体 codegen 命令和模块数 |
| E：`docs/lessons/12-documented-simplification-abuse.md:3-15,29-37,59-65` | 审计先证明原需求没有被自改标准消除，再谈文档一致性 | ERP 对全部 P0/P1 处置的业务裁决 |
| E：`docs/lessons/26-stale-m2-jar-invalidates-frontend-validation.md:3-15`；`tools/validate-flux-fresh.sh:167-230,302-312` | 验证非空全集、导出健康、本次构件与报告新鲜度 | 固定错误基线及依赖本机的构件路径 |
| E：`tests/e2e/reports/reports.download.auth.spec.ts:53-76` 检查业务角色、非空 XLSX 及 magic；对应计划 `2026-10-06-1900-1-report-download-auth-fnpt.md:139-144` 承认审计采信转录 | 结果断言要越过状态码；原始证据持久性和审计复验范围要诚实 | admin 成功代替真实角色成功，或假定独立 agent 一定独立复跑 |
| S：双源一致性 prompt 三问及 RunContext 反射 parity 守卫 | 模板自身清单/索引/双份规则也应做到漏同步即红 | COBOL 专项裁决、全部 ledger 字段和高风险双审规则 |

**守卫也必须被测试。** 独立 agent 提取 E `.github/workflows/compliance.yml:67-97` 的比较代码做内存探针：空 actual + 最小合法 `R1: 0` baseline 仍打印缺项 WARN 后 PASS、exit 0；换成实际 baseline 又因机器块混入散文而 `ValueError`。这是两个解析级事实，不是本轮跑通或攻破完整 ERP CI。通用教训是：空输入、缺项、未知项、畸形基线和覆盖面缩小，均要有负例。

F 也有低成本守卫的代价：`scripts/check-scanner-baselines.mjs:14-35,85-104` 只比较数量，不比较身份；本轮三个只读扫描器均 exit 0，计数为 240/737/108，而 `scripts/__tests__/check-scanner-baselines.test.ts:34-64` 的绿路径仍硬编码 221/716/108，CI 又未见 `test:scripts` 接线。这是源码结合动态计数的判断，未实际运行该测试。数量棘轮不等于零新增问题，自测也必须进入真实门禁。

H `ai-dev/tasks.yaml:2-8` 仍引用旧 `opencode-goal-driver` 不存在入口；F shim `tools/mission-driver.sh:14-19` 仍默认依赖兄弟模板，但本机兄弟仓存在，属于可移植性风险而非已发生断链。两者共同支持来源版本及只读 drift report，而不是强覆盖升级。

原提案的部分概括应保留为历史而非沿用为现状：F 的技能索引 `docs/skills/README.md:66` 已路由运营技能，不能仅凭 AGENTS 未提及就判不可发现；F context `:53-54` 明示采用 lessons，不能继续按“已砍掉”推导方案。本轮也未复算原提案全部文件数量。

## 6. Healthy Deviations：不应该被“修回模板”的差异

- entropy 使用 `ai-dev/`、项目合并 design/architecture、前端把业务知识落到组件/专题文档，都不天然违反 AGE；必须看事实 owner、路由和验证是否清楚，而非目录是否同名。
- 保留独立自治策略、只提供两个真正有用的操作技能、按需采用引擎，都可以优于原提案中的精确数量目标。
- Java 的格式/架构守卫、前端视觉与交互验收、低代码模型生成链的检查，应复用项目自身工具链；模板提供选择方法和验收接口，不包办具体业务规则。
- 不迁移旧项目的全量历史文件，不把所有审计发现自动升级为 roadmap，不把所有讨论先加工成五份内容重复的文档。

## 7. Suggested Migration Order：建议的优化顺序

1. **先做交付闭环**：统一当前规则冲突；修复消费侧可复现缺陷；将安装/profile/vendor/非破坏性及负例接入独立 CI。验收标准是新目录按文档可完成任务，而不是源仓绿灯。
2. **再做防漂移**：对 root/template、manifest/profile/技能索引、hook/CI 承诺做最小机械对账。每个清单面回答：同步通道是什么、不一致如何暴露、守卫在哪里。
3. **补版本与升级路径**：记录安装来源 commit、profile、工具包版本及已管理文件的基准 hash；升级只生成差异和冲突报告，保留定制，不静默覆盖。此为来源元数据，不是第二份工作状态账。
4. **以两个试点验证收益**：一个已有前端项目、一个已有 Java/全栈项目，只选择一个真实小切片试用，不全量迁库。记录冷启动必读量、首次可用时间、审计轮数、返工原因、守卫检出及误报、升级冲突；没有对照数据前，不声称效率已提高。
5. **最后精简默认流程**：依据试点决定核心必需品与可选增强包。少加大而全指南，多交付一个能跑的验收例子；少要求人记同步，多增加一个会红的守卫。

## 8. 本轮现场验证与限制

| 执行项（主会话 cwd 为模板根） | 结果 | 能证明什么 |
| --- | --- | --- |
| `node tools/check-doc-references.mjs` | exit 1；46 引用 + 61 行号告警 | 当前引用检查未通过，且存在作用域/规则适配问题；不是全量真实断链计数 |
| `node tools/check-doc-timeliness.mjs` | exit 0 | 当前配置下的形式规则通过；不是内容新鲜度或一致性认证 |
| `node tools/check-docs-garbled.mjs` | exit 0；289 tracked docs，2 likely 候选 | 诊断器成功运行；不是零乱码认证 |
| 独立：`node --test tools/install-age.test.mjs` | exit 0；15/15 | 安装辅助函数测试通过，不覆盖全部消费边界 |
| 独立：`bash …/check-install-age-relocated.sh` | exit 0；30 项断言通过 | 原集成脚本仅重定向临时路径及仓根定位，断言不变；不是未经修改的原命令执行 |
| 独立：default/frontend/java/all × 引擎开/关安装矩阵 | 8 组安装均 exit 0，默认引用及时效检查均 0 | 主路径可用；profile 索引遗漏仍可逃过检查 |
| 独立：隔离模板再安装，清空继承的 `MISSION_DRIVER_HOME` 后运行 shim `--help`、`list` | 均 exit 0，发现 base/demo/onboarding | vendor 的加载/发现确实不依赖兄弟仓；不是完整自治任务验收 |
| 独立：消费侧 demo/onboarding `mission-check.mjs` | 均 exit 0，valid true | mission 配置有效，不代表真实模型执行结果正确 |

主会话输出保留在 `_tmp/age-assessment-20261117/`；乱码工具按自身实现另写原有 `tmp/docs-garbled-check/`。未运行完整 `verify-age.sh`、真实模型驱动的无人值守任务或业务项目全量测试，不宣称 full green。

安装探针环境为 Windows/Git Bash、Node v26.12.1，未验证最低 Node 18、Linux/macOS 或 `.cmd` 入口。另一次 demo mock dry-run 达到步数上限 exit 2，不能据此推断真实 demo 必定失败。

## 9. Evidence Reviewed：补充证据入口

- 目标方向：同日 `docs/analysis/2026-11-17-0000-age-template-v2-restructure-analysis.md`；它是历史提案，不作为当前已完成状态清单。
- simulator 的可迁移机制：`C:/can/nop/cobol-simulator/docs/skills/dual-source-consistency-audit-prompt.md:26-56` 的逐面三问及守卫阶梯；`cobol-interp/src/test/java/app/cobol/interp/RunContextParityTest.java:80-108,122-136` 的反射逐字段对账与新增字段哨兵。这些是实际存在的实现证据，本轮未重跑其 Maven 测试。
- simulator 的反面教材：`C:/can/nop/cobol-simulator/docs/backlog/defect-ledger.md:14-55` 已有发现/修复/重开及多写者编号规则，但台账本身仍累积长历史与并发协调成本。模板应吸收最小生命周期与编号守卫，不照搬整张大表和全部专项规则。
- 独立安装 session：`ses_e174d217effeeR7j0FL1ud2XyT`；复跑入口 `C:/Users/a758371/AppData/Local/Temp/opencode/age-install-audit-20261117/{probe,adversarial}.mjs`，同目录保存原始输出。
- 独立规则探针 session：`ses_e1749a58fffeZTj2XQUxe7xVDD`；复跑入口 `C:/Users/a758371/AppData/Local/Temp/opencode/age-doc-guards-0rY4xO/reproduce.mjs`，结果路径由脚本输出。
- Next/ERP 独立抽样 session：`ses_e174d1e40ffe6b74Zj2euTTf8Z`；上表引用的是本轮读取的具体落点。临时文件与 session 是辅助凭据，本文已持久保存输入、结果和证据路径，不能要求后续读者依赖聊天记忆才能理解结论。
- entropy/flux 独立抽样 session：`ses_e174d2154ffecJMWDtoZzvzXV6`；覆盖真实计划、再审计、bug 笔记、方法 prompt、守卫及 CI，动态执行仅为三个只读扫描器，不把仓内历史绿测作为本轮复跑。
- 报告独立复核：安装实测 agent 对照自己的原始结果并抽查结论边界，要求收窄 vendor 描述以免暗示复现过旧方案失败；已按意见修订，其负责范围无其他阻断。未将该复核扩大为对其他分工全部跨仓事实的独立重验。新增索引与日志的链接另经 scoped 引用检查 exit 0（2 个文件），不替代根引用检查的失败结果。

**最终意见：应把 AGE 从“好用的文档组织方式”继续做成“可验证、可裁剪、可演进的工程协作契约”，而不是更庞大的流程框架。当前最划算的优化，是让承诺、产物和守卫对得上。**
