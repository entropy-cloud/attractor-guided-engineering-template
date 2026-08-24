# Roadmap / Plan 格式改造提案 — frontmatter 化与单一完成信号

> Status: discussion（设计提案 + 分析意见，待 human 裁定后立项）
> Date: 2026-08-24
> 关联：`docs/analysis/2026-08-24-0000`（§P5 hash 戳记、§P6 DSL）、`-0001`（§4.0 外化原则）、`docs/plans/00-plan-authoring-and-execution-guide.md` 规则 11/12、`tools/mission-driver/src/plan-check.mjs`

## 1. 提案内容（human 原始诉求复述）

1. roadmap 与 plan 采用 frontmatter 承载核心状态信息，便于机器解析，消灭复杂匹配规则；
2. frontmatter 字段尽量少——只放机器自动判断/自动读取/界面显示需要的；
3. 所有跨 session 持久化内容都在这两个文件里（AGE 本质性设定的延伸）；格式由 guide 完全规定；
4. 完成/未完成通过 `grep "- [ ]"` 这类朴素手段获知，避免复杂模式处理；
5. 两文件仍可含任意描述性段落。

## 2. 现状事实（为什么这个提案是对的）

- **复杂匹配真实存在**：`PLAN_STATUS_RE = /^>\s*(?:\*\*)?(?:Plan\s+)?Status(?:\*\*)?:\s*\*{0,2}([A-Za-z][A-Za-z /-]*)\*{0,2}\s*$/im`（plan-check.mjs:30）——容忍 bold、大小写、尾随空白的整行正则，因为状态埋在 blockquote 散文里。
- **三源状态病已成文**：guide 规则 11「Text consistency before closure」要求 `Plan Status` × 每个 phase `Status` × Exit Criteria × logs 全对齐；规则 12「Status/checkbox consistency」专门处理 "`Status: completed` 但仍有 `[ ]`" 的矛盾态（execute.md 步骤 2 也为此加了防御逻辑："Do NOT rely on the Status line alone"）。这是**被文档承认的复发缺陷模式**，不是理论风险。
- **checkbox 机械已是现役部件**：plan-check.mjs 已输出 `totalChecked/totalUnchecked/allUnchecked`——完成信号的读取通道存在，只是没被扶正为唯一信号。

## 3. 意见：赞同，且收益大于提案本身

按价值排序：

1. **根治三源状态病**。规则 11/12 与 execute.md 的防御段落整体退役——不是修得更好，而是不再需要。
2. **`completed` 应从可写状态中删除**（本报告新增的关键推论）：plan 是否完成 = 「status 为 active 且无未勾选项」，纯派生。这使 "prematurely write completed"（WI13 门禁的存在动机）**从可伪造的写入变为不可声称的状态**——想宣布完成就必须真把 box 勾完，而勾选本身已被 CLOSURE_AUDIT 流程看守。WI13 gate 随之大幅简化（从拦截 completed 写入退化为拦截 `status` 越权流转，甚至部分退役）。
3. 解析面从正则降为「frontmatter 键查找 + 行前缀 grep」：误杀面结构性下降，DSL 化（0000 报告 §P6）的判定原语齐备。
4. 外化原则的彻底化：状态位不仅外化，而且以标准格式外化，任何工具（git hooks、CI、monitor、人）零成本读取。
5. UI 显示面免费获得结构化字段。

## 4. 具体设计建议

### 4.1 判定原则（先于字段清单）

- **一事一处**：每个事实只有一个可写位置，其余一律派生（进度计数永不落盘）。
- **可写 = 决策，派生 = 计算**：draft→active 是评审决策（可写）；完成是事实（不可写，派生自 checkbox）。
- **进 frontmatter 的唯一门槛**：机器要在没有语义理解的情况下读写它的。（title 不进——H1 就是 title；时间戳不进——文件名已有；review 记录不进——audit 文件反向引用。）

### 4.2 plan frontmatter 最小集（建议）

```yaml
---
status: draft            # draft | active | held —— 唯一可写生命周期位；completed 移除
mission: dsh-plugin      # 归属 mission
work-item: M4-WI14       # roadmap 回写锚点
group: 2026-08-23-2200   # 批次标识（可选；缺失时回退文件名时间戳前缀）
hold: >-                 # 仅 status: held 时有值；替代 > Review Hold:
  缺上游裁定，等 D2
source-audits:           # 替代 > Source Audits:（闭合由 audit 文件侧 Audit Status 表达）
  - docs/audits/x.md
---
```

淘汰项及去向：`> Last Reviewed:`（审阅事实属于 review record，plan 不留副本）；per-Phase `Status:` 行（**整体删除**——phase 完成度 = 该 Phase 区块内 `[ ]` 计数，这正是规则 12 病根）；`> Audit: required` 并入 frontmatter 或保持正文约定（待定，见 §7）。

执行链变化：execute.md 步骤 3b（双写 status+checkbox）退化为只勾 box；步骤 4a（写 completed）删除——勾完即完成。

### 4.3 roadmap 侧：极简 frontmatter（仅跨 run 全局计量；human 裁定 2026-08-24）

- **human 裁定**：跨 run 全局计量（如 `maxAuditRounds` 的花费计数）直接放 roadmap frontmatter——这是「全局记录需要落盘」与「插件零持久记忆」冲突的正解（0004 报告 Q1-2 缺口 A 由此消解）。
- 建议形状（保持扁平标量纪律，§4.4）：
  ```yaml
  ---
  audit-rounds: 2          # 已消耗审计轮次（全局计数，跨 run 跨 session 持久）
  ---
  ```
- **limit 与 count 分离**：上限（`maxAuditRounds: 3`）属配置——留在 flow/mission 配置；计数（`audit-rounds: 2`）属账本——进 roadmap frontmatter。一事一处：谁配限制谁读计数的责任边界由此清晰。
- **语义变更（有意为之）**：M1 现状是「审计预算按 run 重置」（0001 裁定 3A 记录的已知怪点：重跑即恢复满额）；本裁定使预算成为 **mission 全局**——重跑不再重置。这修正了怪点，但属行为变更，迁移时须在 guide/changelog 成文。
- **写者纪律**：`audit-rounds` 的自增必须有合法写者（M1 = 引擎 `_wfOpen` 进 auditEntry；M4 = 监督者 trigger 进入审计态），并发写由既有乐观锁门禁（0004 §6-4）覆盖。
- 其余 roadmap 内容维持原判：Work Item 块纯 checkbox、身份由 `missions/*.json` roadmapPath 持有、描述段落自由写、❌/✅ 退役到 checkbox。

### 4.4 工程约束决定的格式纪律（硬边界）

- **引擎零 npm 依赖** → 不引入 gray-matter；frontmatter schema 必须限制在「扁平标量键 + 单层流式数组」子集（上述形状即全部语法），内置解析器 ~30 行。嵌套对象、多行对象、锚点、引用一律禁止——这不是风格偏好，是解析器体积上限。
- **grep 陷阱**：装饰性/示例性 `- [ ]` 会污染计数（本仓库自己的 guide 模板就含示例 checkbox）。对策二选一：① guide 规定 checkbox 只允许出现在 Phase/Work Item 区块，解析按区块计数；② 全文 grep + 接受偶发污染。倾向 ①——flow-loader 本就做结构化扫描，增量成本低；且 guide 文档自身（含大量示例）不会被误当 plan：有无 `status:` 键即判别（与今天靠 Plan Status 行判别同构）。
- **WI13 门禁新形态**：proposed-content 校验从全文明变正则改为「定位头部 frontmatter 块 → 键行匹配」，边界确定、无误杀散文的可能。

### 4.5 guide 所有权

两文件的格式 owner = `00-plan-authoring-and-execution-guide.md`（plan）与 roadmap 编写规约（roadmap）；AGENTS.md 路由不变；prompt-check.mjs 增加对应结构校验用例。frontmatter 字段增删 = guide changelog 事件，与宿主 pin 升级同等级别纪律。

## 5. 迁移成本清单（诚实列出）

| 面 | 改动 |
| --- | --- |
| plan-check.mjs | PLAN_STATUS_RE → frontmatter 解析 + 派生 completion |
| flow-loader.js | activePlans/draftPlans 谓词改读 frontmatter |
| prompts（execute/plan-review/closure-audit/multi-audit/open-audit） | 状态操作指令改写 |
| WI13 gate | matcher + 证据规则重审（预期大幅简化） |
| roadmap-check.mjs | ❌/✅ → checkbox 对账 |
| monitor web | plans/roadmap 渲染 |
| install-age.sh + template/ | 模板样例更新 |
| 历史文档 | 存量 plan/roadmap 一次性迁移（codemod）或新旧并存过渡——**需裁定** |

## 6. 结论

提案成立且优于原始表述的预期：最大收益不在「好解析」，而在**用「completed 不可写、纯派生」消灭一整类被门禁和指南防御性条款围堵的错误**。建议独立立项走完整 AGE 流程（plan 格式是引擎消费契约，属 protected-adjacent 变更，需 draft review）。

## 7. 待 human 裁定的开放点

1. ~~`completed` 派生化是否采纳~~（待裁定，本提案最激进也最有价值的一步）？
2. 存量文档迁移策略：一次性 codemod 全迁 vs 新文新格式旧文旧格式并存（解析器双读一段时间）？
3. checkbox 计数域：区块限定（推荐）vs 全文 grep？
4. ~~`> Source Audits:` / `> Audit: required` 是否入 frontmatter~~ → 已由 §8 裁定消解（source-audits 字段删除）
5. ~~roadmap 是否完全免 frontmatter~~ → **已裁定（2026-08-24）**：roadmap 带极简 frontmatter，至少承载跨 run 全局计量（`audit-rounds`），见 §4.3。原「倾向：是」仅适用于无全局计量的场景，本裁定为一般形态。

## 8. 增补裁定（human，2026-08-24 同日）：review / audit 记录内联

> **裁定原文**：对于 roadmap 和 plan 的 review 和 audit 记录应直接写在对应文件内部，不要再产生额外的分析文件。一般情况下不会也不应该发现很多问题。

### 8.1 与现状的关系：扶正既有趋势，非推翻

- Draft Review Record 本就规定在 plan 内部（guide :58、模板 :165）；closure audit 证据本就写入 plan 的 `Closure` 区（guide :101），外部链接只是例外通道；CLOSURE_AUDIT 提示词本就直接编辑 plan 文件（closure-audit.md:3）。**独立审计者把结论写进被审文件已是现役实践。**
- 外部 `docs/audits/` 实际存量仅约 6 个记录文件（均为 7 月 multi-audit/open-audit 产物）——重装备从未被常态使用，与「一般情况发现不了很多问题」的经验一致。

### 8.2 设计含义

1. **独立性 ≠ 分文件**。reviewer 独立性的承重结构是**独立 dispatch**（第二 agent 结构性隔离，前份报告已裁定审计环节禁入池化），不是记录落点。审计者在 git 历史里对自己写入的区块可归因、不可篡改地留痕——内联不污染独立性。
2. **单一文件即完整故事**。plan + 评审史 + 收口证据随 git 一起走——这是跨 session/checkout 外化原则（0001 报告 §4.0）的直接推论：恢复现场不依赖兄弟文件存在。
3. **Source Audits 生命周期消解**。现行链路「OPEN_AUDIT 发现 → 写外部 audit 文件 → plan 头部引用 → 执行时翻 Audit Status」整体退役。发现直接落两处：能成计划的直接起草计划（durable artifact 是 plan 不是审计散文）；零散小发现的写进 roadmap 对应 work item 或受影响 plan 的发现段。「关闭审计」= 勾掉自己的 checkbox，与 §4 的完成信号统一。
4. **机器面同步简化**：§4.2 frontmatter 删除 `source-audits` 字段；P1 docs-gate 的 afterWrite 证据面从「外部 review 文件存在且 closed」改为「本文件内 review 区块存在且带通过标记」（同一个 grep 通道）；execute.md 步骤 4c 整体删除。
5. **外部位置保留给真正的例外**：`docs/audits/` 收窄为方法论指南（00-audit-execution-guide）+ 跨 mission 专项战役记录等罕见人工产物；AGENTS.md 中该目录职责描述相应收窄。
6. **防膨胀护栏**：review 记录内联要求 append-only + 有界（正常一轮 2–3 行共识记录；多轮争议的完整迭代史超出 ~20 行时，结论内联 + 完整过程移入讨论稿作为例外升级路径——但这是异常态，不是默认形态）。

### 8.3 对 §4.2 字段表的修订

```yaml
---
status: draft            # draft | active | held；completed 派生（待裁定 §7.1）
mission: dsh-plugin
work-item: M4-WI14
group: 2026-08-23-2200   # 可选
failures: 0              # 跨 run 失败计数（human 裁定 2026-08-24）；limit=maxFailures 留配置
hold: >-                 # 仅 held 时
  …
---
```

**一般规则（human 裁定 2026-08-24，两条同模式）**：跨 run 需要持久化的**计量**归账本 frontmatter（`audit-rounds` 进 roadmap、`failures` 进 plan）；**limit 归配置**；run 内临时量归 scratch。一事一处不冲突。语义升级：计数跨 run 累计而非按 run 重置（行为变更须成文）。写者纪律：合法写者 + 乐观锁；`failures` 的自增仅允许监督者/授权的失败归因（executor 错误 / 测试红 / claim 到期无产出），升级规则 `failures ≥ maxFailures → held + 人工回执`（M4 等价物 = M1 的 onMaxRetries→failed）。

`source-audits` 字段删除；评审/审计记录全部内联于正文标准区块（`## Draft Review Record`、`## Closure`、roadmap work item 行内注记），格式由 guide 规定并配结构校验用例。

## 9. 增补（2026-08-24，dsh-plugin-survey 交叉发现）

> 18 份插件调研见 `docs/analysis/dsh-plugin-survey/INDEX.md`；与本提案相关的发现：

1. **completed 派生化的反差例证**（`dsh-goal-scaffold.md`）：scaffold 的 plan.md 验收清单与 maxGoalRounds:5 全部只活在提示串里，无任何机械看守——勾选 self-declared 无人验证。这正是本提案「completed 不可写、纯派生」要根治的形态的生态活体样本。
2. **CLOSURE_AUDIT 增强候选**（`dsh-spec-loop.md`）：其「声明式 bash 验证先于 judge」+ `OK|FAIL` 单行判定格式可采纳——机械可验证项先跑命令，judge 只裁不可机械部分；与 §4 的 grep 判定原语同向。
3. **审计独立性的提升素材**（`dsh-inspect.md`）：复查独立性五层机制（fresh 子代理上下文 / 对抗提示词 / 证据强制 / 红队二阶证伪 / 失败不伪装成功）建议按 AGENTS.md 规则 15 评估并入 audit prompt/skill；其硬局限（默认同源同模型）提示独立性声明应包含模型异构性。
4. **frontmatter 字段的最小集再确认**（`goal-acceptance.md`）：13 工具验收协议最终退化为 InMemoryStore 的教训——协议再精密，状态不落盘（git 文件）就不可跨 session；本提案把状态位放进 git 文件 frontmatter 是同类问题的正解。
