# Attractor-Guided Engineering 模板

[English Version](README.md)

本模板是一个轻量级的应用层项目脚手架，用于 AI 辅助的产品开发。

适用于admin系统、门户、工作流应用、仪表板、内部工具、CRUD密集型领域产品等普通业务应用。

适用于已有技术栈的中小型项目。

这不是一个 starter app，不包含生成的产品代码。其目的是为仓库提供足够的持久结构，让人类和 AI 能够共享需求、owner-doc 基线、计划、验证和项目记忆，而无需重量级的流程开销。

## AGE 的含义

AGE 代表 **Attractor-Guided Engineering**（吸引子引导工程）。

AGE 从一个问题开始：

随着人类和 AI 随时间修改仓库，这个仓库应该持续向什么方向收敛？

在本模板中，吸引子是应用项目在快速 AI 辅助迭代期间应持续回归的稳定产品、设计和架构结构。

对于应用项目，吸引子由一组持久的 owner 文件承载：

- `docs/context/` - 强制项目上下文和真相源规则
- `docs/backlog/` - 优先级候选工作和 AI 就绪的下一步行动
- `docs/requirements/` - 实现就绪的需求解释
- `docs/design/` - 稳定的应用层行为和功能 owner docs
- `docs/architecture/` - 稳定的技术结构和模块边界

计划、测试、审计、日志、bug 笔记和验证不是吸引子。它们是工程控制：帮助证明变更使仓库向吸引子移动，而不仅仅是完成清单的本地控制。

## Mission Driver — 自动化开发循环引擎

`tools/mission-driver/` 是一个 Flow DSL 引擎，自动化 AGE 开发循环。它读取 `missions/<name>.json`，驱动状态机经过健康检查 → 审查 → 执行 → 草拟 → 深度审计，并为每个 AI 步骤生成 `opencode run`。

**核心能力：**

- **Flow DSL**：声明式 JSON 状态机，5 种步骤类型（script/tool/agent/group/subflow），结果驱动的转换，子流程组合
- **Plan 系统**：完整生命周期（draft → active → completed），含独立草案审查和结束审计
- **Roadmap 指导**：`roadmap.md` 驱动任务选择 — DRAFT_PLANS 每次循环读取剩余项并创建 1-3 个计划
- **Reflexion 记忆**：`--analyze-run` 生成事后分析；持久教训通过 `_index.md` 反馈到后续运行
- **Monitor Dashboard**：Vue 3 前端，含运行历史、日志查看器、资源图表和 SSE 事件流

**快速开始：**

```bash
# 从描述生成 mission
./tools/mission-driver.sh draft "构建组件库"

# 运行 mission 循环
./tools/mission-driver.sh <mission-name>

# 分析已完成的运行
./tools/mission-driver.sh --analyze-run
```

完整文档见 `tools/mission-driver/README.md`。不要复制引擎目录 — 通过 `MISSION_DRIVER_HOME` 引用（见 `tools/README.md`）。

## 模板包含的内容

- `AGENTS.md` - AI agent 的应用层操作契约
- `START-HERE-after-copy.md` - 复制模板后的 Day 0 设置清单
- `docs/index.md` - 文档路由器和目录所有权基线
- `docs/context/` - 强制 AI 上下文、真相源优先级和项目范围约定
- `docs/backlog/` - 优先级候选工作、AI 自主标签和可选的路线图层
- `docs/requirements/` - 精炼的实现就绪需求文件
- `docs/design/` - 稳定的应用层 owner docs
- `docs/architecture/` - 跨领域技术基线和模块边界
- `docs/plans/` - 含关闭规则和技能选择记录的执行计划
- `docs/audits/` - 审计工作流指导和可选的存储审计记录
- `docs/skills/` - 可复用提示、审查剧本和审计提示模板
- `docs/logs/` - 每日开发日志指南
- `docs/testing/` - 手动和自动测试记录指南
- `docs/bugs/` - 复杂回归和根因笔记指南
- `docs/lessons/` - 从重复失败和恢复中提取的持久经验
- `docs/retrospectives/` - 可选的实现后差距分析和流程改进笔记

## 默认工作流

1. 在 `docs/input/` 中收集原材料
2. 如有需要，在 `docs/discussions/` 中澄清歧义
3. 在 `docs/requirements/` 中综合实现就绪需求
4. 更新 `docs/design/` 中的稳定应用设计和 `docs/architecture/` 中的技术基线
5. 路由任务并选择候选可复用技能
6. 当规划触发条件适用时，在 `docs/plans/` 下创建计划
7. 实施前审计计划
8. 实现最小完整切片
9. 运行验证
10. 对创建的计划进行结束审计
11. 更新日志和受影响的文档

## 核心原则

不要仅通过聊天推送重要工作。

- 原始信息进入 `docs/input/`
- 强制上下文和 owner 优先级进入 `docs/context/`
- 优先级下一步行动进入 `docs/backlog/`
- 不明确的点进入 `docs/discussions/`
- 确定的需求进入 `docs/requirements/`
- 稳定的设计决策进入 `docs/design/` 和 `docs/architecture/`
- 执行控制进入 `docs/plans/`
- 证据和历史进入 `docs/logs/`、`docs/testing/` 和 `docs/bugs/`
- 流程改进成为 `docs/skills/`、`docs/lessons/` 或 `docs/retrospectives/`

## 如何开始新项目

1. 将此模板复制到新的仓库根目录。
2. 完成 `START-HERE-after-copy.md`。
3. 将 PM 笔记、原型链接、卡片文档、文章摘录和外部引用放入 `docs/input/`。
4. 如果输入仍不明确，在实现前在 `docs/discussions/` 中捕获澄清。
5. 在要求 AI 编码之前，将确定的范围转换为 `docs/requirements/`。

## 许可证

MIT

## 作者微信和微信讨论群

![](https://gitee.com/canonical-entropy/nop-entropy/raw/master/wechat-group.png)

添加微信时请注明：加入Nop平台群

## 微信公众号

![](https://gitee.com/canonical-entropy/nop-entropy/raw/master/wechat-public-account.jpg)
