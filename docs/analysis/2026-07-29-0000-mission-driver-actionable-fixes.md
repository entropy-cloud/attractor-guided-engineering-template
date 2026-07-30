# Mission-Driver 明确可改问题分析（#1–#3, #5）

> 分析日期：2026-07-29
> 分析范围：mission-driver 引擎的 4 个根因明确、可直接实施的问题
> 分析性质：纯分析文档，不含代码实现
> 配套文档：`2026-07-29-0001-mission-driver-enhancement-directions.md`（#4, #6 远期方向）

## 概要

| # | 问题 | 确认 | 优先级 | 影响面 |
|---|------|------|--------|--------|
| 1 | REVIEW_PLANS 返回 `approved` 触发 correction agent 浪费 | **确认存在** | **P0** | 每个 draft plan 浪费 2 次模型调用 |
| 2 | flow 配置通用化 + per-mission `promptsDir` | **确认存在** | **P0/P1** | 阻塞非实现类任务接入 |
| 3 | CHECK 应执行可配置 check 指令 + 提示词定位为确定性状态门限 | **确认存在** | **P1** | 无法配置校验强度；措辞与诉求矛盾 |
| 5 | `draft` 命令 description 应支持引用目录/多文件 | **部分存在** | **P2** | 已是 optional，主要是提示词措辞 |

---

## 问题 #1：REVIEW_PLANS 返回 `approved` 触发多次 correction（P0）

### 确认：存在，易复现

**复现路径**：在 `{{plansDir}}/` 下新建一个 `> Plan Status: draft` 的 plan 文件，运行 mission。

**根因链**（精确到代码行）：

1. `prompts/plan-review.md:27` 明确要求 agent 输出：
   ```
   Your output MUST end with exactly one `<AI_STEP_RESULT>approved</AI_STEP_RESULT>` marker.
   ```

2. `flows/mission-driver.json:71-82` 中 REVIEW_PLANS 是 `forEach: "draftPlans()"` 的 agent 步骤，transitions 为聚合 marker：
   ```json
   "transitions": {
       "all_complete": { "goto": "EXEC_PLANS" },
       "some_failed": { "goto": "EXEC_PLANS" },
       "all_failed": { "goto": "EXEC_PLANS" }
   }
   ```

3. `flows/mission-driver.json:16-30` 的 `markerAliases` **没有** `"approved"` 条目。

4. `engine.js:1629-1630` forEach agent 步骤走 `_executeForEach` → 对每个 plan 调用 `_executeAgentStep`。

5. `engine.js:836-842` 在 `_executeAgentStep` 中，marker `"approved"` 不在 transitions 中 → 触发 `_runCorrectionAgent`：
   ```javascript
   if (marker) {
       if (!transitions[marker]) {
           marker = await this._runCorrectionAgent(
               marker, result.text, rTag, transitions, stepDef, this.lastSessionId,
           );
       }
   }
   ```

6. `engine.js:860-896` `_runCorrectionAgent` 最多执行 `onUnknownMaxRetries`（=2）次 parse-model 调用，尝试将 `"approved"` 映射到 `all_complete/some_failed/all_failed`。

**实际影响**：
- 每个 draft plan：1 次 review + 最多 2 次 correction = **最多 3 次模型调用**（本应 1 次）
- N 个 draft plan：浪费最多 **2N 次** parse-model 调用
- correction agent 的任务是语义错误的——它试图把单项语义（"这个 plan 通过了"）映射到聚合语义（"全部/部分/全失败"），无论如何映射都不影响 forEach 聚合结果

**设计错配的本质**：forEach agent 步骤的每项 marker 是**单项语义**（approved/needs_revision），但步骤 transitions 是**聚合语义**（all_complete/some_failed/all_failed）。`_executeForEach`（engine.js:991-1042）的聚合逻辑只用 `iterResult.ok`（不看单项 marker 值），因此 correction 对聚合结果没有任何贡献，纯属浪费。

### 优化方向

**方案 A（推荐，最低风险）**：在 `flows/mission-driver.json` 的 `markerAliases` 中增加：
```json
"approved": "all_complete"
```

- `_tryAliasMarker("approved", transitions)` 会命中 alias → 返回 `"all_complete"` → correction agent 不触发
- 对其他步骤无副作用：CHECK 的 transitions 无 `all_complete`，alias 不会误匹配
- 对子流程无影响：plan-execution.json 的 CLOSURE_AUDIT 有 `"approved"` 作为直接 transition key，直接匹配优先于 alias

**方案 B（更正确，但触碰受保护区）**：在 `_executeForEach` 中跳过 correction agent——forEach 的单项 marker 不驱动 transition，无需 correction。但需要修改 `engine.js` 的 `_executeForEach` / `_executeAgentStep` 交互，属于 state-machine core 受保护区。

**建议**：先用方案 A（一行 JSON 修改），如有更多 forEach agent 步骤出现同类问题再考虑方案 B。

### 受保护区影响

`markerAliases` 修改属于 Flow JSON contract（`ask-first`），需确认 alias 不影响其他步骤。分析确认安全：CHECK 无 `all_complete` transition，CLOSURE_AUDIT 有直接 `"approved"` key（直接匹配优先于 alias）。

---

## 问题 #2：flow 配置通用化 + per-mission `promptsDir`（P0/P1）

### 确认：存在

**现状**：
- `flow-loader.js:241-247` 已有 `projectPromptDirs` 机制，按目录优先级查找 prompt：
  ```
  missions/prompts/ → TOOL_ROOT/prompts/ (内置默认)
  ```
- 但 `main.js:668-671` 硬编码为 `[resolve(config.missionsDir, "prompts")]`——**所有 mission 共享同一覆盖目录**
- `flow-loader.js:306-321` `loadSubFlow` 同样硬编码 `[resolve(missionsDir, "prompts")]`

**无法满足的场景**：
- 数据对比分析任务：需要完全不同的 draft-from-roadmap.md / health-check.md / plan-review.md
- 卡组文档分析任务：需要不同的 execute.md
- 想用同一套 flow（CHECK→REVIEW→EXEC→DRAFT→AUDIT）但提示词完全不同

**用户的更大愿景**（引用）：
> 各种工作都使用 mission driver 去做。以后可以最外层包装一下，就自动成为一个 goal 驱动的 AI 系统。根据用户提出的问题，先执行专门定制的 grill me 提示词进行澄清，然后自动生成 roadmap，根据类型选择 promptsDir 等，然后自动运行。

### 优化方向

**Step 1：增加 `promptsDir` mission 配置字段（P0）**

- `mission.json` 新增可选字段 `promptsDir`（通过 extends 链继承）
- `main.js` 构建 `projectPromptDirs` 时，在 `missions/prompts/` 之前插入 mission 级 `promptsDir`：
  ```
  mission.promptsDir → missions/prompts/ → TOOL_ROOT/prompts/
  ```
- `config.js` 将 `mission.promptsDir` 传入 config，供 `loadSubFlow` 使用
- `flow-loader.js` `loadSubFlow` 从 `this.config.missionPromptsDir` 读取（而非硬编码 `missionsDir`）

**改动范围**：
| 文件 | 改动 |
|------|------|
| `mission-check.mjs` | `promptsDir` 加入允许字段（无需校验，optional） |
| `config.js` | resolve `promptsDir`，传入 config 对象 |
| `main.js:668-671` | 构建 projectPromptDirs 时 prepend mission.promptsDir |
| `flow-loader.js:306-321` | loadSubFlow 从 config 读 missionPromptsDir |

**Step 2：flow JSON 也支持 per-mission 覆盖（已有，确认可用）**

- `createMissionDriverFlow` 已支持 `projectFlowsDir`（`missions/flows/`）→ 可放自定义 flow JSON
- `flowName` 已支持 mission.json 指定 → 可完全替换 flow 结构

**Step 3：外层 goal-driven 包装（P2，后续迭代）**

这是更远期的目标，需要：
- 一个入口（CLI 或 API）接收用户自然语言目标
- 自动选择 promptsDir / flowName（基于目标类型分类）
- 自动执行 grill-me → roadmap → mission → run 全链路
- 本质是在 mission-driver 之上加一个"mission dispatcher"

**建议**：Step 1 先行（P0），解锁"同一 flow + 不同提示词"的核心诉求。Step 3 作为后续独立 feature。

### 受保护区影响

`config.js` / `main.js` 修改无直接受保护区，低风险。

---

## 问题 #3：CHECK 应执行可配置 check 指令 + 提示词定位为确定性状态门限（P1）

### 确认：存在

**现状问题**（两方面耦合）：

**3a. CHECK 不可配置校验强度**

- `flows/mission-driver.json:33-43` CHECK 是 `type: "agent"` 步骤
- `prompts/health-check.md` 只做 `git status --porcelain`，明确禁止 build/test：
  ```
  Do NOT run the mission's build or test commands here. Do NOT attempt to diagnose-and-fix-and-rerun in a loop.
  ```
- CHECK 失败直接 `done: "failed"`，无自动修复路径
- mission.json / base.json 的 `commands` 只有 `test/build/lint/typecheck`，无 `check`

**3b. 提示词措辞与诉求矛盾**

- health-check.md 标题："Perform a **lightweight** health gate"
- 多处强调 "NOT a full build"、"must stay fast"、"Do NOT run build or test"
- 哲学定位是"can the mission safely proceed?"而非"从确定性状态开始"

**用户诉求**（引用）：
> check 脚本应该执行 mission json 中配置的一个 check 指令，这样可以选择 check 到底要做多强。提示词中不用强调轻量级，不执行 build 这样的话，只要说清楚是一个门限程序，确保从确定性状态开始，check 失败自动修复就可以了。如：对于 Java 项目，配置 mvn build 之类的确保从无错误的状态开始，否则一些问题总是拖后说是不是当前修改引入的。

### 优化方向

**统一方案：增加 `commands.check` 配置 + 重写提示词定位 + CHECK 支持自动修复**

1. **base.json / mission.json 新增 `commands.check`**（optional）：
   ```json
   "commands": {
       "check": "mvn clean compile",
       "test": "...",
       ...
   }
   ```

2. **main.js 传入 `checkCmd` delegate var**（与 testCmd/buildCmd 平行）

3. **重写 health-check.md 核心定位**——从"轻量级快速检查"改为"确定性状态门限程序"：
   ```
   CHECK is a gate program that ensures the mission starts from a deterministic,
   known-good state. Its job is to verify the workspace is in a clean, compilable
   state before the loop begins.

   If {{checkCmd}} is configured, run it. If it fails, diagnose and fix the issue,
   then re-run. Only emit "fail" if the issue cannot be auto-fixed after retries.

   If no {{checkCmd}} is configured, fall back to git conflict-marker detection.
   ```
   - 删除 "lightweight"、"do NOT run build" 等限制性措辞
   - 定位从"快速检查"改为"确定性状态门限"
   - 增加 auto-fix-on-failure 语义
   - 保持向后兼容（无 checkCmd 时回退到 git-status 检查）

4. **CHECK 的 transitions 增加自动修复路径**：
   ```json
   "CHECK": {
       "transitions": {
           "pass": { "goto": "REVIEW_PLANS" },
           "fail": { "retry": "CHECK", "maxRetries": 2 }
       },
       "onMaxRetries": { "done": "failed" }
   }
   ```
   当前是 `"fail": { "done": "failed" }`（一步失败即终止），改为 retry 给 agent 自动修复的机会。

**改动范围**：
| 文件 | 改动 |
|------|------|
| `base.json` | 增加 `commands.check`（可选） |
| `main.js` | 传入 `checkCmd` delegate var |
| `prompts/health-check.md` | 重写定位为确定性状态门限 |
| `flows/mission-driver.json` | CHECK transitions 增加 retry |

### 受保护区影响

CHECK transitions 改为 retry 属于 Flow JSON contract（`ask-first`），改变 step 行为，需要 plan + review。

---

## 问题 #5：`draft` 命令 description 应支持引用目录/多文件（P2）

### 确认：部分存在（主要是认知/文档问题）

**现状**：
- `main.js:850` `--target-file` 是 `.option()`（**optional**），不是 `.argument()`
- `<description>` 是唯一必填参数（`.argument("<description>")`）
- `config.js:515` `targetFile: args.targetFile || null`——未指定时为 null
- `mission-brief.md:9` targetFile 为空时被正确忽略

**结论**：`--target-file` 已经不是必填的。用户可以：
```bash
./tools/mission-driver.sh draft "读取 docs/input/ 目录下的所有需求文档，创建 roadmap"
```

**仍需改进的点**：
1. `mission-brief.md` 应显式说明 description 可以引用目录而非单个文件
2. 用户文档（user-manual）中 `draft` 命令的示例应包含"基于目录"的用法
3. `--target-file` 的帮助文本可以更明确：这是可选的输入辅助，不是必填约束

### 优化方向

- `mission-brief.md:9` 修改措辞：将 "Target file (optional)" 改为 "Target file or directory (optional) — the description may reference any path"
- `mission-draft.md` 增加："The user request may reference directories, multiple files, or abstract goals — not limited to a single file"
- 帮助文本和文档更新

### 受保护区影响

无受保护区影响，纯提示词措辞和文档调整。

---

## 实施建议

| 问题 | 工作量 | 风险 | 备注 |
|------|--------|------|------|
| #1 approved marker alias | 极小（1 行 JSON） | 极低 | 立即修复 |
| #2 Step 1 promptsDir | 小（4 个文件） | 低 | 解锁通用化核心诉求 |
| #3 CHECK 可配置 + 提示词重写 | 中（提示词 + flow + config） | 中（flow contract） | 需 plan + review |
| #5 draft target-file 措辞 | 极小 | 极低 | 提示词 + 文档调整 |

```
第一批（P0，可立即做）：
  #1 marker alias → #2 promptsDir

第二批（P1，需要 plan）：
  #3 CHECK 可配置化

随批（P2，任意时机）：
  #5 draft 提示词措辞
```

---

## 附录：关键代码引用

| 问题 | 文件:行号 | 关键逻辑 |
|------|-----------|----------|
| #1 | `prompts/plan-review.md:27` | 要求输出 `approved` marker |
| #1 | `flows/mission-driver.json:16-30` | markerAliases 缺少 `approved` |
| #1 | `engine.js:836-842` | correction agent 触发条件 |
| #1 | `engine.js:860-896` | `_runCorrectionAgent` 实现 |
| #2 | `flow-loader.js:241-247` | `loadPrompt` 目录优先级 |
| #2 | `main.js:668-671` | `projectPromptDirs` 硬编码 |
| #3 | `flows/mission-driver.json:33-43` | CHECK 步骤定义 |
| #3 | `prompts/health-check.md:3,14` | "lightweight"、"Do NOT run build" |
| #5 | `main.js:850` | `--target-file` 是 optional option |
| #5 | `mission-brief.md:9` | "Target file (optional)" 措辞 |
| #5 | `mission-draft.md:1-9` | brief gate 输入说明 |
