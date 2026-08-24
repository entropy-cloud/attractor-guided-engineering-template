# AGE 自主运行架构 — 使用（Usage）

> Status: supported baseline（human 批准，2026-08-24）
> 定义双形态产品在真实使用中的入口、流程、介入点与上手路径。两形态共享同一账本/法律/完成语义，差异只在执行后端与入口。带 `continuous`/`stop` 的能力行是目标形态，现役入口仍以 `docs/design/dsh-plugin-integration.md` 的 as-built 状态为准。

## 1. Purpose

回答「最终方案怎么用」：在 DSH 中怎么用、在外部独立怎么用、人什么时候需要介入。

## 2. DSH 插件形态

### 2.1 三个入口层

**① 交互会话（人/AI 混合）**——AGE preset 会话，自然语言直说：
- 启动：`运行 onboarding mission`、`继续推进 roadmap`、`这个 plan 卡住了看看`
- 控制：`停一下`（协作中断，`mdcontrol.stop`）
- 观察：`mdcontrol.status`（run/队列视角）、monitor 时间线、子代理拓扑
- 会话内的 AI 自己就是自驱执行者：读 roadmap/plan 直接干活，法律在 `tools/pre-execute` 裁决，文件被写即记账。

**② AI 自触发（agent 内部调用路由）**——会话 AI 判断时机后经 skill → mdcontrol 路由启动，立即拿 `{runId, status: started}` 句柄离开；后续经 status 轮询 / 终态回执 / monitor 观察。

**③ continuous 无人值守**——会话一句「连续模式开工」开启：守夜人跨 session 持续推进（03-supervisor），收尾点回执到发起会话等人裁。

### 2.2 技能与路由

| 技能/路由 | 行为 |
| --- | --- |
| `mission-control-run <mission>` | 启动一个 run（异步契约） |
| `mission-control-draft <desc>` | 两段式起草 mission |
| `mission-control-analyze [run]` | Reflexion 事后分析 |
| `mdcontrol.status/list` | 观察 run 与队列 |
| `mdcontrol.stop` | 协作中断当前 run（中断即暂停，恢复=收敛式重跑） |
| `mdcontrol.unlock <plan>` | 人工解锁 held plan；守夜人写 held→active 并清零 `failures`（目标能力） |
| （continuous） | 开启/关闭连续模式 |

### 2.3 典型一天

```
早：会话 A 说"连续模式开工" → 关掉会话去开会
中：系统自主 plan→review→execute→audit 推完 3 个 WI；
    一个 plan 审计不通过打回重做；
    一个 plan 失败 3 次 → held + 回执
下午：会话 B："那个卡住的 plan 我看了，放开" → `mdcontrol.unlock <plan>` → held→active（failures 清零）→ 继续推完 → 终态回执
```

### 2.4 人在哪介入（收尾回执点）

- Review Hold（plan 进入 `held`，等待解锁）
- 失败熔断（`failures ≥ maxFailures` → `held`）
- 审计预算耗尽 / 全部 held 死锁
- 除上述回执点外，连续模式不需要人。

## 3. 独立形态

### 3.1 入口

| 方式 | 命令/机制 |
| --- | --- |
| 全循环 | `./mission-driver.sh run <mission>`（引擎后端） |
| 换执行器 | `--driver opencode|pi|cline` |
| 本机定点续跑 | `--from-step`（本机便利，非产品面） |
| 定时推进 | cron / launchd / GitHub Actions 定时 run |
| 门禁 | CI job + git pre-commit hook（同法律函数的结构子集） |
| 手动文件流 | 手写 plan → `plan-check.mjs` 校验 → 手跑测试 → **独立评审者/审计者**内联记录 → git 提交 |

### 3.2 法律在独立形态的形态

- `plan-check.mjs`（frontmatter 版）：纯校验 CLI，pre-commit / CI 执行。
- 机器强制不依赖任何宿主存在——这是独立使用最有价值的点。

### 3.3 跨机器恢复（AGE 本质）

commit → push → 任意机器 checkout → 重跑 → 从 checkbox + frontmatter 计量/认领字段接续，不依赖任何本机记忆。

> **边界（human 裁定 A3，2026-08-24）**：同一 checkout 同一时刻只允许一种执行形态——DSH 连续模式与 CLI run 互斥，不并存（防止双循环踩踏同一账本）。

## 4. 双形态对照

| 能力 | DSH 形态 | 独立形态 |
| --- | --- | --- |
| 交互会话内自驱 | ✅ | ✘（headless） |
| 独立评审/审计派发 | ✅ 守夜人 | ✅ 引擎/CLI 派发 |
| agent 池化 / prompt 缓存 | ✅ | ◐ 退化为 `--session` 续用 + 前缀纪律 |
| 连续队列（roadmap 即队列） | ✅ 守夜人 | ◐ cron/CI 逼近 |
| 法律（门禁） | ✅ pre-execute（实时 + 身份验证） | ✅ CI/git hooks（提交边界；结构子集，无实时身份） |
| 收尾回执 | ✅ followup | ✅ 终态 + monitor |

## 5. 上手路径

- **DSH**：安装插件 → 装 AGE preset → 项目 `missions/base.json` 选 `"agent": "age"` → 会话里说「开工，连续模式」。
- **独立**：`./install-age.sh <目标> "项目名"` → `mission-driver.sh run <mission>` + 一个 pre-commit 钩子。
- 两者读同一份文件、被同一套法律约束、产出同一个完成定义——可随时切换或并存。

## 6. 与既有产品的关系

- 现有 monitor 仪表盘（端口 9300，读 run-state + SSE）零改动继续使用。
- 现有 skill 三件套与 mdcontrol 路由保留并扩展（2.2）。
- 现有 CLI 命令/标志/EXIT_MAP 在引擎存续期冻结不变；frontmatter 改造后 plan-check 升级为 frontmatter 版。
- AGE preset 会话姿态不变（AGE mode section + 三技能入口 + 异步契约要点）。
