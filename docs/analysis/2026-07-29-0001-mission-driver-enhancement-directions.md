# Mission-Driver 远期增强方向分析（#4, #6）

> 分析日期：2026-07-29
> 分析范围：mission-driver 引擎的 2 个远期增强方向，需进一步设计或依赖前置工作
> 分析性质：纯分析文档，不含代码实现
> 配套文档：`2026-07-29-0000-mission-driver-actionable-fixes.md`（#1–#3, #5 明确可改问题）

## 概要

| # | 问题 | 确认 | 优先级 | 影响面 |
|---|------|------|--------|--------|
| 4 | draft 完善：grill-me + 澄清记录 + design 放入 roadmap | **确认存在** | **P1/P2** | 缺少意图澄清闭环 |
| 6 | 审计状态约定 + DRAFT_PLANS 优先消费审计发现 | **确认存在** | **P1** | 大 roadmap 场景审计滞后 |

---

## 问题 #4：draft 完善——grill-me + 澄清记录 + design 纳入 roadmap（P1/P2）

### 确认：存在

**现状**：
- `main.js:293-508` `cmdDraftMission` 已有两阶段流程：Stage 1 (brief) → Stage 2 (draft roadmap + mission.json)
- `prompts/mission-brief.md` 有 `<BRIEF_GATE>pass|blocked` 机制——但这是**单向 gate**，不是交互式澄清
- **没有** grill-me 式的多轮提问/回答
- 澄清结果（brief）写入 `docs/backlog/`，不写 `docs/discussions/`
- roadmap 只包含实现工作项，不包含 design 完善类工作

**缺口**：
1. 无交互式意图澄清（grill-me）
2. 澄清过程不记录在 `docs/discussions/`
3. roadmap 不支持"先完善 design 再实现"的工作项类型
4. draft 本质是"实现层驱动"，不是"全生命周期驱动"

### 优化方向

**分两阶段实施**：

**Phase 1（P1）：grill-me 提示词 + discussions 记录**

1. 新建 `prompts/grill-me.md`：
   - 接收用户原始目标描述
   - 生成 3-5 个关键澄清问题（目标边界、验收标准、约束条件、优先级）
   - 输出为 `docs/discussions/{YYYY-MM-DD-HHmm}-{slug}.md`

2. `cmdDraftMission` 在 Stage 1 (brief) 之前增加 Stage 0 (grill)：
   ```
   desc → grill-me (生成问题 → discussions/) → [用户回答] → brief → draft
   ```
   - grill-me 阶段可以阻塞等待用户输入（交互模式），或生成问题后退出由用户补充后重跑

3. `mission-brief.md` 增加 `{{discussionPath}}` 输入，读取 discussions 中的澄清结果

**Phase 2（P2）：design 工作项纳入 roadmap**

1. roadmap 的工作项类型扩展：
   - 当前：实现类工作项（features, fixes）
   - 新增：design 类工作项（"完善 XX 设计文档"、"澄清 YY 架构决策"）
2. `prompts/draft-from-roadmap.md` 在拟制 plan 时，识别 design 类工作项并生成对应 plan
3. plan 的执行（execute.md）对 design 类 plan 的行为：读取/更新 design 文档而非写代码

**注意**：Phase 2 需要 roadmap 格式扩展和 plan 执行逻辑适配，复杂度较高，建议作为独立 feature。

---

## 问题 #6：审计状态约定 + DRAFT_PLANS 优先消费审计发现（P1）

### 确认：存在

**现状**：

已有审计状态约定（`flow-loader.js:36, 85-107`）：
```
> Audit Status: open      → 待处理（openAudits() 扫描此状态）
> Audit Status: planned   → 发现已转为 plan（draft-from-audit.md 设置）
> Audit Status: triaged   → P2-only，终态（不再被 openAudits() 计数）
```

已有审计驱动 plan 拟制（`flows/deep-audit-loop.json`）：
```
CHECK_OPEN_AUDITS (openAudits > 0) → draft-from-audit.md → 创建 remediation plan
```

**缺口**：
1. **DRAFT_PLANS 不检查审计**：`flows/mission-driver.json:58-69` DRAFT_PLANS 只看 roadmap，不看 openAudits
   - 当前路径：DEEP_AUDIT (子流程内消费审计) → REVIEW_PLANS → EXEC_PLANS → DRAFT_PLANS (只看 roadmap)
   - DRAFT_PLANS 如果能优先消费审计发现，可以减少不必要的 DEEP_AUDIT 轮次
2. **大 roadmap 场景**：用户反馈"完全等结束后执行审计也有问题"——需要在 roadmap 中显式插入审计检查点
3. **roadmap 无审计工作项**：目前无法在 roadmap 中声明"执行一次安全审计"作为显式工作项

### 优化方向

**Step 1：DRAFT_PLANS 优先消费审计发现（P1）**

修改 `flows/mission-driver.json` 增加 DRAFT_PLANS 前置审计检查：

方案 A（flow 层路由）：
```json
"DRAFT_PLANS": {
    "type": "agent",
    "when": "true",
    "promptPath": "prompts/draft-from-roadmap.md",
    ...
}
```
改为：在 DRAFT_PLANS 之前增加一个路由步骤 `CHECK_PENDING_AUDITS`：
```json
"CHECK_PENDING_AUDITS": {
    "when": "openAudits().length > 0",
    "otherwise": { "goto": "DRAFT_PLANS" },
    "type": "agent",
    "promptPath": "prompts/draft-from-audit.md",
    "transitions": {
        "created": { "goto": "REVIEW_PLANS" },
        "nothing": { "goto": "DRAFT_PLANS" }
    }
}
```
- 有待处理审计 → 先按审计发现拟制 plan → REVIEW_PLANS
- 无待处理审计 → 正常从 roadmap 拟制 → DRAFT_PLANS
- EXEC_PLANS 的 transition 目标从 DRAFT_PLANS 改为 CHECK_PENDING_AUDITS

方案 B（提示词层合并）：
- 修改 `draft-from-roadmap.md`：先检查 `{{auditsDir}}/` 是否有 `Audit Status: open` 的审计，有则优先按审计发现拟制 plan，无则从 roadmap 拟制
- 优点：不改 flow 结构；缺点：agent 要同时理解两种来源，提示词复杂度上升

**建议**：方案 A 更清晰，职责分离，且复用已有 `draft-from-audit.md` 提示词。

**Step 2：roadmap 支持显式审计工作项（P1）**

- roadmap 工作项增加 `type: audit` 标记
- `draft-from-roadmap.md` 识别 audit 类型工作项时，生成一个"执行审计"的 plan
- 该 plan 执行时调用 deep-audit 的审计提示词（multi-audit / open-audit）而非常规 execute
- 这让用户可以在 roadmap 中显式安排审计时机：
  ```
  | Phase 3 | [ ] 执行安全审计 | audit | ... |
  ```

**Step 3：审计中间检查点（P2）**

对于超大 roadmap，允许在 roadmap 阶段表中声明审计检查点：
```
| Phase | Status | Item | Type | Audit Checkpoint |
|-------|--------|------|------|-----------------|
| 1     | done   | ...  | impl |                 |
| —     | —      | 中间审计 | audit-checkpoint | after Phase 1 |
| 2     | todo   | ...  | impl |                 |
```
引擎在完成 Phase 1 后触发一次中间审计，而非等到全部完成。

---

## 实施建议

| 问题 | 工作量 | 风险 | 备注 |
|------|--------|------|------|
| #4 Phase 1 grill-me | 中 | 低 | 新增提示词 + draft 流程 |
| #4 Phase 2 design 纳入 roadmap | 大 | 中 | roadmap + plan 格式扩展 |
| #6 Step 1 DRAFT_PLANS 消费审计 | 中（flow 结构调整） | 中（flow contract） | 复用已有提示词 |
| #6 Step 2 roadmap 审计工作项 | 中 | 低 | roadmap 格式扩展 |
| #6 Step 3 中间审计检查点 | 中 | 低 | roadmap 格式扩展 |

```
第二批后半（P1，需要 plan）：
  #6 Step 1 审计优先消费

第三批（P1/P2，后续迭代）：
  #4 grill-me → #6 Step 2 roadmap 审计工作项
```

### 受保护区影响

| 改动 | 受保护区 | 约束 |
|------|----------|------|
| #6 Step 1 DRAFT_PLANS 前增加路由步骤 | Flow JSON contract (`ask-first`) | flow 结构变化 |

---

## 附录：关键代码引用

| 问题 | 文件:行号 | 关键逻辑 |
|------|-----------|----------|
| #4 | `main.js:293-508` | `cmdDraftMission` 两阶段流程 |
| #4 | `prompts/mission-brief.md:25-32` | brief gate（单向，非交互） |
| #6 | `flow-loader.js:85-107` | `_scanOpenAuditsList` 审计状态扫描 |
| #6 | `flows/deep-audit-loop.json:23-34` | CHECK_OPEN_AUDITS 步骤 |
| #6 | `flows/mission-driver.json:58-69` | DRAFT_PLANS 只看 roadmap |
| #6 | `prompts/draft-from-audit.md:1-35` | 审计驱动 plan 拟制（已有） |
