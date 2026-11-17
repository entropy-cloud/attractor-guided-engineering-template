# Attractor-Guided Engineering 模板

[English Version](README.md)

本模板是一个轻量级的应用层项目脚手架，用于 AI 辅助的产品开发。

适用于admin系统、门户、工作流应用、仪表板、内部工具、CRUD密集型领域产品等普通业务应用。

适用于已有技术栈的中小型项目。

这不是一个 starter app，不包含生成的产品代码。其目的是为仓库提供足够的持久结构，让人类和 AI 能够共享需求、owner-doc 基线、计划、验证和项目记忆，而无需重量级的流程开销。

> **双重身份仓库。** 本仓库同时开发 `$MISSION_DRIVER_HOME/`（一个 Flow DSL 引擎 + Vue 3 监控仪表盘，自动化 AGE 开发循环），用自己的 AGE 工作流 dogfood 自己。仓库根和 `docs/` 下的文件是**真实项目版**（为 mission-driver 开发填好内容）；fill-in 文件的纯净模板版在 `template/` 子目录下。消费者不直接接触 `template/`，而是跑 `./install-age.sh`（见下方"如何开始新项目"）。

## AGE 的含义

AGE 代表 **Attractor-Guided Engineering**（吸引子引导工程）。

AGE 从一个问题开始：

随着人类和 AI 随时间修改仓库，这个仓库应该持续向什么方向收敛？

在本模板中，吸引子是应用项目在快速 AI 辅助迭代期间应持续回归的稳定产品、设计和架构结构。

对于应用项目，吸引子由一组持久的 owner 文件承载：

- `docs/context/` - 强制项目上下文和真相源规则
- `docs/roadmaps/` - 优先级候选工作和 AI 就绪的下一步行动
- `docs/requirements/` - 实现就绪的需求解释
- `docs/design/` - 稳定的应用层行为和功能 owner docs
- `docs/architecture/` - 稳定的技术结构和模块边界

计划、测试、审计、日志、bug 笔记和验证不是吸引子。它们是工程控制：帮助证明变更使仓库向吸引子移动，而不仅仅是完成清单的本地控制。

## Mission Driver — 自动化开发循环引擎

`$MISSION_DRIVER_HOME/` 是一个 Flow DSL 引擎，自动化 AGE 开发循环。它读取 `missions/<name>.json`，驱动状态机经过健康检查 → 审查 → 执行 → 草拟 → 深度审计，并为每个 AI 步骤生成 `opencode run`。

**本仓库是引擎的单一来源。** 消费者缺省**不**安装引擎——给 `install-age.sh` 传 `--with-mission-driver` 才会安装 shim、`.env` 和 mission 缺省配置。兄弟仓库相对路径引用是被历史证伪的断链模式；启用 add-on 时推荐 vendor 一份引擎副本（见 `docs/guides/mission-driver-add-on.md`）。

**核心能力：**

- **Flow DSL**：声明式 JSON 状态机，5 种步骤类型（script/tool/agent/group/subflow），结果驱动的转换，子流程组合
- **Plan 系统**：完整生命周期（draft → active → completed），含独立草案审查和结束审计
- **Roadmap 指导**：`roadmap.md` 驱动任务选择 — DRAFT_PLANS 每次循环读取剩余项并创建 1-3 个计划
- **Reflexion 记忆**：`--analyze-run` 生成事后分析；持久教训通过 `_index.md` 反馈到后续运行
- **Monitor Dashboard**：Vue 3 前端，含运行历史、日志查看器、资源图表和 SSE 事件流
- **Onboarding mission**（通过 `install-age.sh` 提供给消费者）：AI 读消费者的 codebase，把复制过来的模板文档（`docs/context/*`、`docs/architecture/*` 等）填为真实内容

**快速开始（在跑过 `install-age.sh --with-mission-driver` 的目标项目里）：**

```bash
# 冒烟测试（秒级）
./tools/mission-driver.sh run demo

# 个性化（30-60 分钟）：AI 读你的 codebase，填好复制过来的文档
./tools/mission-driver.sh run onboarding

# 或：从描述生成自定义 mission
./tools/mission-driver.sh draft "构建组件库"

# 运行 mission 循环
./tools/mission-driver.sh <mission-name>

# 分析已完成的运行
./tools/mission-driver.sh --analyze-run
```

完整文档见 `$MISSION_DRIVER_HOME/README.md`。

## 模板包含的内容

缺省骨架（复制即得）：

- `AGENTS.md` - AI agent 操作契约：文档地图、任务路由、硬规则
- `docs/index.md` - 文档路由器
- `docs/context/` - 强制 AI 上下文（project-context、自主策略、codebase-map）
- `docs/guides/` - 全部 how-to 指南集中地（目录组织、roadmap/计划编写、审计、日志、需求、bug 笔记、审计预防清单……）
- `docs/roadmaps/` + `docs/plans/<roadmap-slug>/` - 路线图与按路线图隔离的计划目录
- `docs/requirements/` `docs/design/` `docs/architecture/` - owner docs（建什么 / 行为基线 / 结构基线）
- `docs/audits/` `docs/analysis/` `docs/lessons/` `docs/bugs/` `docs/logs/` - 时效性记录
- `docs/skills/common/`（+ `frontend/` / `java/`，经 `--profile`）- 可复用方法/审计提示
- `.agents/skills/` - 操作型技能：`git`（日常 git 纪律含 worktree 政策）、`grillme`（需求/计划无情质询）
- `tools/` - 独立的文档卫生检查器（时效性、引用、乱码）
- `.githooks/pre-commit` - fail-open 的文档卫生门

按需目录（`docs/discussions/`、`docs/input/`、`docs/testing/`、`docs/references/`、`docs/retrospectives/`、`docs/examples/`、`docs/archive/`）有意**不**预创建——创建时机见 `docs/guides/doc-organization.md`。

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
- 优先级下一步行动进入 `docs/roadmaps/`
- 不明确的点进入 `docs/discussions/`
- 确定的需求进入 `docs/requirements/`
- 稳定的设计决策进入 `docs/design/` 和 `docs/architecture/`
- 执行控制进入 `docs/plans/`
- 证据和历史进入 `docs/logs/`、`docs/testing/` 和 `docs/bugs/`
- 流程改进成为 `docs/skills/`、`docs/lessons/` 或 `docs/retrospectives/`

## 如何开始新项目

1. Clone 本仓库。
2. 跑 `./install-age.sh /path/to/your-new-project-root "项目名"` — 按 `install-age.manifest` 复制精选文件集（fill-in 文件从 `template/`，共享方法论指南从根），sed 替换 fill-in 文档里的 `<project-name>`，创建 `docs/logs/{year}/`，更新 `.gitignore`。可选：`--profile frontend|java|all` 追加对应技能货架；`--with-mission-driver` 启用引擎 add-on（缺省不装）。
3. 填 `docs/context/project-context.md` 的真实验证命令（占位期间不得声称任何验证通过）；启用引擎 add-on 的项目可先跑 `./tools/mission-driver.sh run demo`（冒烟），再跑 `run onboarding`（AI 读你的 codebase，个性化文档）。
4. 将 PM 笔记、原型链接、卡片文档、文章摘录和外部引用放入 `docs/input/`。
5. 如果输入仍不明确，在实现前在 `docs/discussions/` 中捕获澄清。
6. 在要求 AI 编码之前，将确定的范围转换为 `docs/requirements/`。

无 Node 环境的手动 fallback：按 `START-HERE-after-copy.md` 的 Day-0 清单操作（`install-age.sh` 会把它装到目标项目根目录）。

## 许可证

MIT

## 作者微信和微信讨论群

![](https://gitee.com/canonical-entropy/nop-entropy/raw/master/wechat-group.png)

添加微信时请注明：加入Nop平台群

## 微信公众号

![](https://gitee.com/canonical-entropy/nop-entropy/raw/master/wechat-public-account.jpg)
