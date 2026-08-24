# AGE 自主运行架构 — 效率层（Agent Pool & Prompt Assembly）

> Status: supported baseline（human 批准，2026-08-24）
> 定义长时自主运行下的资源效率：agent 池化与角色复用、prompt 组装纪律、上下文画像。全部为插件层增强，不影响账本/法律/完成语义。

## 1. Purpose

长时自主运行的成本瓶颈是重复上下文构建与重复读取。效率层在不改变任何契约的前提下：复用 agent 会话、让提示词前缀可缓存、把必读文件直接嵌入上下文。

## 2. Agent 池化与角色复用

### 2.1 池模型

- 角色池：`drafter:{projectRoot}`（长期复用）、`reviewer:{groupId}`（同批复用）。
- 池成员 = 宿主 continuable 子代理；`create-on-first-use`、`followup` 续用、空闲 TTL 到期 `dispose`、崩溃凭持久 session 恢复。
- **内存态是性能缓存非状态权威**：丢失只损失缓存命中，正确性从 git 文件完整重建（P2 原则）。

### 2.2 group 标识

- 同批起草的 1–3 个 plan 共享 frontmatter `group:`，文件名时间戳前缀为回退。
- **同组顺序 review 复用同一 reviewer；跨组必新启**——组是复用的最大粒度，杜绝跨批次判断污染。
- **组内轮换**：同组成员超过 K 个或所依赖上游文档 hash 变化时强制换新（防 anchoring 偏置）。

### 2.3 代际令牌（防陈旧）

- 池成员每次派发持 **attemptId 代际令牌**；接管/恢复前先验代际，陈旧 attempt 显式 revoke——回答「followup 续用 vs 崩溃 resume」的判据：同代续用、跨代重派。

### 2.4 独立性红线

- **CLOSURE_AUDIT / DEEP_AUDIT / multi-audit 禁入池**：结构性独立审计每次独立新派发（P7 原则）。池化只用于 plan-review、docs-review 类前置/过程评审，且同一 turn 不得既写又评。

## 3. Prompt 组装纪律

### 3.1 双模式组装器

```
PromptAssembler.assemble(mode, spec, dynamicCtx) → string
  mode=FRESH    => fixedPrefixBlocks ++ [dynamicBlock]
  mode=CONTINUE => deltaEmbedBlocks(lastSentHashes, currentHashes) ++ [dynamicBlock]
```

- **FRESH**（新 agent）：固定前缀（persona + charter + 嵌入文件块）+ 动态任务块。
- **CONTINUE**（延续 agent）：只发动态块 + 变更文件增量——初始提示词只送一次，后续只送动态部分（利用前缀缓存）。

### 3.2 缓存纪律

- 固定字节排最前：persona / AGE mode section / AGENTS digest / charter / 嵌入文件。
- **前缀禁止易变字节**：时间戳、随机数、轮次计数一律后置。
- marker 指令属动态后缀（per-step 内容）。
- 会话历史本身即前缀：followup 天然共享前轮 KV。

### 3.3 文件嵌入（消除多轮读取）

```xml
<file path="docs/context/project-context.md" hash="a1b2c3d4">…全文…</file>
```

- 嵌入强于强制读取：指令「完整读完 X」改为直接给全文，一轮都不用跑。
- hash 三用：① dedup（CONTINUE 跳过未变文件）；② 陈旧检测（dispatch 时 hash 不符 → 重发）；③ 可审计（grep 即出处）。
- **目录全文嵌入**：指定目录（如 `docs/context/`）强制全文进入上下文，经 DSL 声明。
- **compaction 对抗**：长命 agent 必被压缩，可能剪掉早期文件块——hash 台账 + 周期性对「charter 清单内且已变/被裁剪」文件重发，而非对抗压缩。

## 4. 上下文画像（Context Profile）

- **数据源**：child session 事件（工具调用）、run-state 步骤产物、Reflexion 记忆。
- **工件**：`docs/references/context-profile.json`（项目所有、进 git、schema 版本化）——状态权威原则同样约束画像。不放在 `missions/` 目录：该目录被 mission scanner 当作 mission 配置扫描，非 mission JSON 会污染 `--list-missions` 与配置面。
- **挖掘**：run 终态后统计读频表 → 更新画像；首启由 AGENTS.md「Read This First」清单种子化。
- **消费**：组装器的 fixedPrefix 按画像取 top-N 稳定文件；按角色经 DSL 覆盖。
- **防抖**：画像更新带停滞/振荡检测（无进展不刷）。

## 5. DSL 落位

效率层配置与门禁、trigger、具名 agent 同源一个声明式文件 `missions/autonomy.policy.yml`（schema 见 02-rule-law §3；`agents:` 语义见 §4.9）：

```yaml
version: 1
agents:                                  # 具名 agent：组合面（本节）+ 模型面（02 §4.9）
  drafter:
    mode: pooled                         # pooled | fresh（P7：auditor 必 fresh）
    poolKey: "drafter:{projectRoot}"
    idleTtlMinutes: 30
    rotateEvery: 8
    fixedPrefix:
      - { kind: text, ref: prompts/draft-charter.md }
      - { kind: file, ref: "{{contextDir}}/project-context.md" }
      - { kind: dir, ref: docs/context/, maxFileBytes: 60000 }
    model: { provider: p, model: m, reasoningEffort: default }
  auditor:
    mode: fresh
    model: { provider: p2, model: m2, reasoningEffort: high }
    requireDistinctModel: true
assembly:
  embedStamp: '<file path="{path}" hash="{hash8}">{content}</file>'
  continueDelta: true
```

## 6. 独立形态的降级

- 无 in-process 宿主 → 池化退化为「`--session` 续用 + 前缀纪律」：读轮次照省；跨步缓存收益在 opencode 会话连续性下部分存在，pi/cline 不承诺。
- 正确性不受影响（效率层是优化不是契约）。

## 7. 与既有机制的关系

- StepExecutor seam 思想保留：守夜人派发仍需执行后端抽象；效率层叠加在其上。
- `promptsDir` 覆盖链（mission 级 prompt 替换）被尊重：policy 是叠加层，不取代既有 prompt 解析优先级。
