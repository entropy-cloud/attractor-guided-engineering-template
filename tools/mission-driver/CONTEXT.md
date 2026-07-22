# mission-driver — 项目上下文

> 让 AI 在 30 秒内了解本工具，不包含废话。


## 是什么

`tools/mission-driver/` — AI 开发循环引擎。读 `missions/<name>.json`，按 flow JSON 定义的状态机循环执行 `opencode run` 子进程。附监控 Dashboard（Node http + SSE + Vue 3 前端）。

**语言**: Node.js (ESM) + TypeScript (仅前端)  
**依赖**: 引擎核心零依赖，CLI 层仅 `commander`；前端独立 `web/package.json`  
**位置**: 本工具位于项目仓库的 `tools/mission-driver/` 子目录，所有路径以此为基准。运行命令从仓库根目录执行。


## 目录结构

```
tools/mission-driver/
├── src/
│   ├── main.js            # 入口：解析 CLI → 加载 mission → 启引擎 + monitor
│   ├── config.js          # 配置解析（CLI/env/mission.json → 运行参数）
│   ├── engine.js          # 状态机核心，最复杂的文件
│   ├── executor.js        # 步骤执行：spawn opencode 子进程，心跳/超时/SIGTERM
│   ├── runner.js          # opencode 进程管理 + sessionId 提取
│   ├── monitor.js         # HTTP/SSE server（纯 Node http 模块）+ REST + SSE 端点
│   ├── mission-check.mjs  # mission 校验 + extends 合并（base.json → base.local.json → mission）
│   ├── flow-loader.js     # flow JSON 加载 + plans 扫描 + 表达式函数注册
│   ├── expression.mjs     # 轻量表达式引擎（when 条件 / forEach 源）
│   └── platform.mjs       # 平台兼容层（Windows/macOS/Linux）
├── flows/                 # 流程定义 JSON
│   ├── mission-driver.json    # 主流程: CHECK → REVIEW → EXEC → DRAFT → DEEP_AUDIT
│   ├── plan-execution.json    # 子流程: EXECUTE → CLOSURE_SCRIPT → CLOSURE_AUDIT → BUILD_VERIFY
│   └── deep-audit-loop.json   # 审计子流程
├── prompts/               # AI 指令模板（{{var}} 替换）
├── web/                   # Vue 3 前端（Naive UI + TypeScript + Vite）
├── memory/                # Reflexion 自记忆（--analyze-run 生成）
├── test/                  # 后端测试（node --test）
└── design/                # 引擎设计文档
```

> Mission 配置放在项目根的 `{projectRoot}/missions/`，不在 tools/ 下。


## Mission 配置系统

**文件位置**: `{projectRoot}/missions/`（不在 tools/ 下）

**优先级**: `CLI --model/--parse-model` > `mission.json` 自有字段 > `base.local.json` > `base.json`

**base.json**（进 git）— 全仓库 mission 共享默认值，任何模块可通过 `extends: "base"` 继承:
```
model, parseModel, agent, maxCycles, planGuide, auditsDir, contextDir, moduleDir, commands, commitFormat
```

**base.local.json**（不进 git，`missions/.gitignore` 已配置）— 个人覆盖:
```
sourcePaths（依赖模块源码路径，不同同事路径不同）
```

`mission-check.mjs` 中的 `resolveExtends` 实现浅合并链。`validateMission` 仅校验 `name/roadmapPath/plansDir/commands.test`——缺失 `roadmapPath` 的文件（如 base 配置）被 monitor.js 的 `GET /api/configs` 自动过滤。


## Monitor Dashboard 前端

**技术栈**: Vue 3 + Naive UI 2 + TypeScript + Vite + xterm.js + ECharts + Pinia

**路由**: `/` → RunList, `/runs/:runId` → RunDetail

**API 端点**（monitor.js 提供）:
- `GET /api/runs` — 最近 run 列表
- `GET /api/runs/:id` — run 详情 + events + stepLogs
- `GET /api/runs/:id/logs/:step` — 日志 tail
- `GET /api/runs/:id/sysmon` — 系统资源快照
- `GET /api/configs` — Mission 配置列表（跳过无 roadmapPath 的 base 文件）
- `GET /api/configs/:name/roadmap` — 解析 roadmap markdown
- `GET /api/configs/:name/plans` — Plans 列表
- `GET /api/configs/base` — 合并后的 base.json + base.local.json
- `GET /api/runs/:id/events` — SSE 实时事件流

**关键 UI 交互**:
- Mission Config: n-card（可折叠，默认收起，标题右侧 ChevronDown/Up 切换）
- Log Viewer: xterm.js 终端，文件名点击 → Blob URL 新标签页打开完整日志
- Log Viewer 图标: ArrowDownOutline/PauseOutline/ChevronDownOutline/ChevronUpOutline（Ionicons 5）
- Resource Chart: Free Memory + Opencode RSS + Process Count 三线
- Base Config: 任意页面右上角 ⚙ 齿轮按钮 → Modal（n-code JSON 高亮）
- NFR-3: echarts/xterm 按 RunDetail 路由懒加载，首屏 <500KB
- WI5: `GET /api/runs/:id` 返回的 `run` 含 `auditRound` / `maxAuditRounds`（旧 run-state.json `?? 0` 兜底）；RunDetail 顶部展示 'Deep Audit: N / M'（仅当 `maxAuditRounds > 0`；额度用完 tag→success，进行中→info）。RunList 与 AppHeader 的 `statusTagType` 同步把 `single_step_done` 识别为 success（与 `main.js` exitMap 的 exit code 0 对齐）。


## 构建与验证

```bash
# 后端测试（同时跑 prompt-check.mjs 结构性校验，任一失败即整体失败）
npm --prefix tools/mission-driver test

# 前端构建
npm --prefix tools/mission-driver/web run build

# Mission 校验
node tools/mission-driver/src/mission-check.mjs missions/<name>.json .

# 启动 mission（从项目根）
./tools/mission-driver.sh <mission-name>

# dry-run
node tools/mission-driver/src/main.js <mission-name> --step CHECK --dry-run --no-monitor
```


## 关键约束

- 引擎核心 **零 npm 依赖**（仅 CLI 层用 `commander`；monitor.js 仅用 Node 内置 `http`/`fs`/`path`/`url`）
- 前端 **零构建步骤**于运行时（Vite 构建产物由 monitor 静态托管）
- `memory/_index.md` 为 always-load 核心（`_` 前缀此处为例外，非生成文件）
- `extends` 为浅合并——嵌套对象（如 `commands`）整体替换，非深度合并
- Windows 环境：Git Bash 启动脚本
- 监控端口默认 9300，冲突时自动 +1 重试
- draft-robustness WI5（mdr-remediate-4 后扩展到非-forEach 分支）：subflow step 的 `subflowRuns` 在 `_executeSubflowStep` 中，无论 forEach 还是单子流程，都在子流程开始前写入 `status: "running"` placeholder（`_wfAppendSubflowRun`，镜像 `_onAgentStepUpdate` 模式但额外匹配 `visits` 以避免 re-entry 串味），forEach 每项完成后增量追加、子流程结束后由 `_wfClose` 用终态覆盖 placeholder，父进程中途被杀时 run-state 仍反映"在跑"或已完成项（不依赖 monitor fallback 扫描磁盘 `run-state-<stepName>-<visits>-<i>.json` 文件）。`_wfClose` 仍是最终真相（forEach 结束时 sort + 覆盖 placeholder）。与 step-audit mission 的 WI5（auditRound / maxAuditRounds 计数，见上方 Monitor Dashboard 段）同名但分属不同 mission。


## 故障排查

- `TROUBLESHOOTING.md` — 卡住时的诊断手册
- orphan 清理: `node tools/mission-driver/src/reap-orphans.mjs --startup _tmp <PID>`
- Monitor 独立模式: `node tools/mission-driver/src/main.js --monitor`


## 文档入口

| 文档 | 路径 |
|------|------|
| 引擎设计 | `tools/mission-driver/design/mission-design.md` |
| 流程设计 | `tools/mission-driver/design/mission-driver-flow-design.md` |
| 执行原则 | `tools/mission-driver/EXECUTION-PRINCIPLE.md` |
| plan 编写指南 | `docs/plans/00-plan-authoring-and-execution-guide.md` |
