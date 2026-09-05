# zcode driver 可行性调查 — ZCode 无官方 CLI，mission-driver 适配暂缓

> Recorded: 2026-09-05 10:21, by AI session (user-requested investigation).
> Type: feasibility conclusion / external-dependency blocker. 非缺陷、非需求变更。
> Decision: **暂不实现 zcode driver**，等 ZCode 官方 CLI 发布后重开（见 §重开条件）。

## 背景

用户提出：确认 ZCode 是否具有命令行支持、mission-driver 的 zcode driver 适配是否完成；未完成则补齐并同步 main 与 `feature/dsh-plugin`。经调查，前置条件不成立，经用户确认选择"暂不实现，记录结论"。

## 调查事实（2026-09-05 核验）

1. **ZCode（智谱，GLM-5.3 官方 Harness）是 Electron 桌面应用，无官方 CLI / headless 模式。**
   - 官方文档（zcode.z.ai/cn/docs）：安装页只有 .dmg/.exe/.AppImage 图形安装包；ADE Tools 页明确无 CLI、无 HTTP API；远程开发是桌面端管理的 SSH/WSL/Docker 目标（运行时装在 `~/.zcode/server`，由桌面端托管，非手动可调用）；Remote Control（手机浏览器控制桌面窗口）与 Bot Channel（微信/飞书转发）均非可脚本化接口。
   - 本机核验：`zcode` 不在 PATH；`/Applications/ZCode.app` 包内无 CLI 二进制（`app.asar` 中 "headless" 字符串均属内置 Playwright）；`~/.zcode/` 下只有桌面端数据目录（cli/v2/workspace 均无可执行入口）。
   - npm：`@z-ai/zcode`、`@zhipu-ai/zcode` 均 404。存在第三方**非官方**包 `zcode-cli-stream`（自称 ZCode agent runtime 终端客户端），非官方契约、本机未安装。
2. **mission-driver 无 zcode driver。** `tools/mission-driver/src/config.js` `SUPPORTED_DRIVERS = ["opencode", "pi", "cline", "native"]`（native 仅 DSH 插件宿主）。现有三个外部 driver 全部以 spawn CLI 子进程实现（`opencode run` / `pi -p` / `cline …`）。
3. **缓解事实：** mission-driver 默认驱动即 `opencode`（模型 `zhipuai-coding-plan/glm-*`），Z.ai 官方文档同样推荐 OpenCode CLI 接 GLM。"命令行驱动 GLM coding-plan"这条能力当前已由 opencode driver 覆盖；缺的只是 ZCode 桌面端这一特定 Agent 形态的接入。

## 为什么不现在实现

- driver 的对接对象（可 spawn 的 zcode CLI）不存在，任何实现都是无法端到端验证的占位代码，违反仓库验证基线规则与"不做 demo 完整度"原则。
- 依赖非官方 `zcode-cli-stream` 需要引入第三方契约 + 用户 GLM 凭据经由非官方工具，风险未经用户授权。

## 重开条件

满足任一即可重开本议题，按 `pi`/`cline` driver 先例实现（约 6 文件 / 参考 da9ab5c cline driver 提交面：config.js 默认值 + SUPPORTED_DRIVERS、runner.js buildDriverArgs 与 findLatestSessionId、main.js 帮助文本、agents/build.zcode.md persona、test/zcode-driver-config.test.js、docs/zcode-cli.md）：

1. ZCode 官方发布 CLI / headless 调用方式（安装文档或 npm 官方包出现 `zcode` 可执行入口）；
2. 用户明确批准基于非官方 `zcode-cli-stream` 适配并接受其契约风险。

## 状态

- main 与 `feature/dsh-plugin` 均无代码变更；本记录两分支同步。
