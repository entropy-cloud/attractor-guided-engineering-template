# 2026-07-28-0900 模板内部依赖布局统一 + 安装器 Node 化 + heredoc 物化

> Plan Status: completed
> Last Reviewed: 2026-07-28
> Source: user request — "统一整个项目的技术栈和安装方法"，且 install-age.sh 硬编码过多
> Related: `2026-07-24-1030-mission-driver-web-onboarding-committed-dist-plan.md`（C，Decision 2 曾否决"workspace + 根自动 build"，本 plan 缩窄其否决范围——见 Current Baseline 决策审计）；`2026-07-27-0000-template-realproject-split-plan.md`（completed，建立 template/ 填充分离）；`2026-07-27-0100-onboarding-mission-plan.md`（completed，建立 onboarding mission + check-install-age.sh 闭包门禁）
> Audit: required
> Gate: ask-first → 已获人工批准（用户 2026-07-28 选择 B 方案 tools/ 为 workspace 根 + 同时做 install-age.sh 重构 + 接受 .mjs/JSDoc 推荐）

## Current Baseline

Live facts（已核对 2026-07-28）:

**依赖/包管理碎片化（find + read 验证）**:
- 仓库根: 故意无 `package.json`（`tools/README.md:4-5` 记录的设计决策"template root is intentionally not a Node.js project"）。
- `tools/package.json`: pnpm `age-template-tools`，`packageManager: pnpm@10.0.0`，devDeps `jscpd`/`prettier` + 6 个 `.mjs` 检查脚本 + 1 个 `.sh`（`check:install`，review 纠正: 非 7 个 .mjs）；lockfile `tools/pnpm-lock.yaml`。
- `tools/mission-driver/package.json`: pnpm `mission-driver` v1.1.0，ESM，**零依赖**（仅 `node --test` 入口）；无独立 lockfile（零依赖无需）。
- `tools/mission-driver/web/package.json`: pnpm `mission-driver-monitor-web`，`packageManager: pnpm@10.27.0`（**与 tools/ 的 10.0.0 不一致**），重 Vue 依赖；独立 lockfile `tools/mission-driver/web/pnpm-lock.yaml`。
- `.opencode/package.json`: **npm**（`@opencode-ai/plugin@1.18.4`）+ `package-lock.json`；被根 `.gitignore`（`.opencode/*` 仅 `!.opencode/skills/`）排除 → **不在 git 中**，是 opencode 运行时本地产物，非模板维护结构。
- `tools/mission-driver/vendor/commander/package.json`: vendored 快照（commander 15.0.0），零依赖保障的载体，故意冻结。

**install-age.sh 硬编码（422 行，read 验证）**:
- §2 heredoc 写 `tools/mission-driver.sh` shim（46 行）。
- §3 heredoc 写 `.env.example`（需运行时插值 `$REL_MDH`）。
- §4 heredoc 写 `missions/base.json`、`demo.json`、`docs/backlog/demo-roadmap.md`。
- §4b heredoc 写 `missions/onboarding.json`。
- 共 ~200 行 heredoc 内容塞在 shell 里：不可 diff、不可 lint、改文件须改脚本。
- `[1/7]...[7/7]` 步骤编号 + 报告里 "Also created" 列表手写。
- 跨平台痛点: `tr -d '\r'`、`set -euo pipefail`、bash 数组、Git Bash 依赖（Windows 用户门槛）。
- 前置已要求 Node ≥ 18（`install-age.sh:17`）。

**heredoc 与 dogfood 文件的双胞胎现实（review B3 纠正）**: 6 个 heredoc 产物中 **4 个在仓库根有同名 divergent dogfood 文件**（模板仓库自己跑 mission 用），内容与 heredoc（消费者版本）**有意不同**:
- `missions/base.json`（dogfood，16 行）: `commands.*` 是真实 `pnpm --prefix tools/mission-driver ...`；heredoc 版（消费者）: `REPLACE_WITH_YOUR_*` 占位 + 多一个 `parseModel` 字段。
- `missions/demo.json`（dogfood，12 行）: `moduleDir: tools/mission-driver`、`plansDir: docs/plans`（展示全仓 plans）；heredoc 版: `moduleDir: .`、`plansDir: docs/plans/demo`（隔离的 smoke）。
- `tools/mission-driver.sh`（dogfood，30 行）: 默认 `$DIR/mission-driver`（本地引擎）；heredoc 版（消费者 shim）: 读 `.env` 的 `MISSION_DRIVER_HOME`（跨仓引用）。
- `docs/backlog/demo-roadmap.md`（dogfood）: 4 个 WI 含 `ready`/`todo` 状态（Dashboard 演示）；heredoc 版: 3 个 WI 全 `done`（smoke 验证）。
- 仅 `.env.example` 和 `missions/onboarding.json` 是纯 heredoc-only（无 dogfood 双胞胎）。
- **结论**: heredoc 是**消费者版本**，dogfood 文件是**模板自用版本**。Phase 2 把 heredoc 搬到 `template/install/` 是正确的（`template/install/` = 消费者模板，根目录真实文件 = dogfood）——但双胞胎现实须显式记录，避免误把 dogfood 版本当消费者版拷贝。**消费者安装后不会拿到 dogfood 版**（manifest 不拷根目录这些文件，只拷 `template/install/` 版）。

**manifest（137 行，read 验证）**:
- path-per-line（rsync `--files-from` 模式）。
- `template/` 前缀同时承担三义: 源在 template/ 下 + 目标剥前缀 + 做 `<project-name>` sed 替换。三义耦合，读者须读脚本才知道。
- 无 src/dst/flags 显式列；95% 条目 src==dst（隐式剥前缀）。

**决策审计（重要——本 plan 推翻先前的 Decision 2）**: `2026-07-24-1030 Decision 2`（line 27 + Non-Goal line 39 + review record line 102）写"**彻底不引入 workspace**…保持引擎/前端两包分离，默认引擎零 install；web 依赖仅前端开发者按需 opt-in"。该决策否决的是 **workspace 本身**（分离哲学 + opt-in），**不仅是 "workspace+autobuild" 组合**。本 plan **推翻该决策**（Gate 已获人工批准 2026-07-28）——理由: (a) 维护者须双 install + 双 lockfile 易漂移（已发生: pnpm pin 10.0.0 vs 10.27.0）；(b) "消费者零 install"目标由 committed dist + manifest 隔离保证，与 workspace 内部布局无关；(c) workspace 不强制根 prepare 自动 build（committed dist 守卫前置不变，见下）。
- **committed dist 守卫需同步更新（review B2）**: `.github/workflows/web-dist-check.yml:28` `working-directory: tools/mission-driver/web` + `:40` `cache-dependency-path: tools/mission-driver/web/pnpm-lock.yaml` + `:43` `pnpm install --frozen-lockfile`（在 web/ 内跑）—— 三处依赖 web/ 独立 lockfile。Phase 1 把 lockfile 合并到 `tools/pnpm-lock.yaml` 后，**必须同步改 workflow**（见 Phase 1 Targets），否则 CI 断裂。`release.yml` 不受影响（只发 GitHub Release，不碰 pnpm）。
- **不引入根 `prepare`/`postinstall` 自动 build**（避免与 committed dist 冲突，这是原 Decision 2 的合理内核，本 plan 保留此约束）。committed dist 仍由更新后的 `web-dist-check.yml` + `pnpm check:dist` 守卫。

**既有闭包门禁**: `tools/check-install-age.sh`（147 行，已存在）—— 运行 `./install-age.sh` 到临时目录，断言 **10 项**（review B3 纠正: 实测 `assert "..."` 调用共 10 个，lines 85/89/93/97/102/117/120/125/130/135；非 11）：AGENTS.md 个性化、共享方法论拷贝、fill-in 文件拷贝、onboarding mission 有效、`<project-name>` 全替换等。被 `2026-07-27-0000` + `2026-07-27-0100` plan 用作闭包门禁。本 plan 复用为 Phase 2/3 的验证基线。

Gap: 维护者须 `cd tools` + `cd tools/mission-driver/web` 各 install 一次；两个 pnpm pin 不一致；install-age.sh 内嵌 ~200 行文件内容 + 仅 Git Bash 可跑。

## 设计决策

1. **workspace 根放 `tools/`，不放仓库根**。
   - 备选 A（仓库根）: 更贴近 vite/shadcn 标准布局，但改变仓库"非 Node 项目"身份信号，与 `tools/README.md:4-5` 文档冲突，且对 clone 模板仓库的人造成身份混淆。
   - 备选 B（tools/）: 已是 pnpm 项目，最小改动（仅新增 `pnpm-workspace.yaml`），文件零迁移，保留仓库根身份。
   - 残余风险: 维护者命令多一层 `cd tools`（可接受，已是现状）。

2. **install 脚本用 `.mjs` + JSDoc，不用 TypeScript**。
   - 备选 a（`.ts` + `node --experimental-strip-types`）: 真 TS 类型，但需 Node ≥ 22.6，升级前置（当前 ≥ 18）。
   - 备选 b（`.ts` + tsc build）: 破坏 clone-and-run（消费者 clone 后须先 build 模板开发依赖才能跑 install）。
   - 选定（`.mjs` + JSDoc）: 与引擎栈完全一致（`tools/mission-driver/src/*.mjs` 全是 ESM，无 .ts）；零构建零依赖；Node ≥ 18 不变；JSDoc 给 IDE 类型提示；`node --test` 可测。
   - 残余风险: 无 TS 编译期类型检查（JSDoc 仅 IDE 提示，非强制）；可接受因脚本仅 ~250 行。

3. **manifest 保持 path-per-line，加两种可选标注（`> dst` / `:: flags`），不改默认**。
   - 备选（完整 src/dst/desc 三列表格）: 137 条变 137 对象，噪音 3 倍；需引 `jq`/`yql`，违背零依赖。
   - 选定: 默认 `src` → dst=src 剥前缀（覆盖 95%）；仅例外加 `src > dst`（dst 不同时）+ `:: exec|fill|rel-mdh`（flags）。
   - manifest 扩展语法契约（结构性边界，非实现细节，允许写入 plan per Rule 6 例外）:
     ```
     <src>                                  # dst 默认 = src 剥前导 template/
     <src> > <dst>                          # dst 与 src 不同
     <src> > <dst> :: <flag>[,<flag>]       # flags: exec(chmod +x) | fill(替换 <project-name>) | rel-mdh(替换 __REL_MDH__)
     ```
   - 残余风险: 自定义语法非标准（rsync 无 `>`/`::`）；可接受因解析仅 ~15 行 bash/JS，且注释充分。

4. **heredoc 物化的 6 个文件放 `template/install/`，不混入既有 `template/` 结构**。
   - 理由: `template/` 现有条目是"消费者要填的脚手架文件"（AGENTS.md、project-context.md 等）；install 阶段产物（shim、.env.example、mission 默认配置）性质不同（机械生成，非消费者填写）。独立子目录 `template/install/` 语义清晰。
   - 备选 a（直接复用 dogfood 根文件）: 已否决——6 个产物中 4 个有 divergent dogfood 双胞胎（见 Current Baseline），消费者版本（heredoc）与 dogfood 版本有意不同，不能混用。
   - 备选 b（散落到 `template/{tools,missions,docs}/`）: 否决——会与既有 `template/docs/`、`template/missions/`（若有）混淆；`template/install/` 隔离 install-only 产物，语义更清。
   - 残余风险: 多一层目录（可接受）；须在 `template/install/README.md` 注明"这些是消费者安装产物，非 dogfood 自用"以防误改。

## Goals

- `tools/` 升为 pnpm workspace（覆盖 `mission-driver` + `mission-driver/web`），单一 lockfile，单一 `pnpm install`，统一 packageManager pin。
- `install-age.sh` 内 ~200 行 heredoc 物化为 `template/install/` 下 6 个真文件，脚本降到 ~160 行编排逻辑。
- manifest 加 `> dst` / `:: flags` 可选标注，让 src/dst/flags 对消费者可见可理解。
- 安装逻辑迁移到 `tools/install-age.mjs`（零依赖 Node ESM + JSDoc），`install-age.sh` 退为 ~3 行 thin shim；新增 `install-age.cmd` 让 Windows 用户无需 Git Bash。

## Non-Goals

- 不动 `.opencode/`（gitignored 本地产物，opencode 运行时自有）。
- 不动 `tools/mission-driver/vendor/commander/`（vendored 冻结快照，进 workspace 会破坏 vendoring 语义）。
- 不在仓库根加 `package.json`（保留"模板根非 Node 项目"身份，per 决策 1）。
- 不引入根 `prepare`/`postinstall` 自动 build（避免与 committed dist 冲突，per 决策审计）。
- 不改 `tools/check-install-age.sh` 本身（它是验证 harness，bash 可接受；它是本 plan 的门禁，不是产物）。
- 不改消费者侧 `MISSION_DRIVER_HOME` 约定、不改 `missions/*.json` schema、不改 `web/dist` committed 策略。
- 不重写 `tools/` 下其他 `.mjs` 检查脚本（跨平台收益仅限消费者面对的 install 入口）。

## Task Route

- Type: `architecture change`（依赖布局 + 安装契约 + 跨平台入口）
- Owner Docs: `tools/README.md`、`tools/mission-driver/CONTEXT.md`（依赖/构建段）、`install-age.sh` 头注释
- Skill Selection Basis: 脚手架/配置重构 → `none`
- Autonomy: 改公共安装契约 + 跨模块 → 触发 plan；已获人工批准。

## Infrastructure And Config Prereqs

- Node ≥ 18（不变；install-age.sh 前置已要求）。
- pnpm ≥ 10（不变；`tools/` 已用 pnpm）。
- 无新外部服务、无新端口、无 secrets。
- 回滚: Phase 1 删 `tools/pnpm-workspace.yaml` + 恢复两个独立 lockfile；Phase 2 删 `template/install/` + 恢复 heredoc（git revert）；Phase 3 恢复 `install-age.sh` 单体 + 删 `tools/install-age.mjs` + `install-age.cmd`。

## Execution Plan

### Phase 1 - tools/ 升为 pnpm workspace

Status: completed
Targets: `tools/pnpm-workspace.yaml`（新增）、`tools/package.json`（编排 scripts + pin 升级）、`tools/mission-driver/web/package.json`（删 packageManager pin）、删 `tools/mission-driver/web/pnpm-lock.yaml`（合并入根）、`.github/workflows/web-dist-check.yml`（B2 同步）、`tools/mission-driver/web/.nvmrc`（评估移动）、`tools/README.md`（更新安装说明）
Skill: `none`

- Item Types: `Add | Fix | Decision`
- Prereqs: 无

- [x] `Add`: 新建 `tools/pnpm-workspace.yaml`，内容 `packages: ['mission-driver', 'mission-driver/web']`。
- [x] `Add`: `tools/package.json` 加编排 scripts: `md:test`（`pnpm --filter mission-driver test`）、`md:web:build`（`pnpm --filter mission-driver-monitor-web build`）、`md:web:check:dist`（`pnpm --filter mission-driver-monitor-web check:dist`）。
- [x] `Decision`: `.nvmrc` 位置——选保留 `tools/mission-driver/web/.nvmrc` 原位（CI `setup-node` 硬编码 `node-version: 20`，.nvmrc 仅本地提示；最小改动）。
- [x] `Fix`: `tools/mission-driver/web/package.json` 删 `"packageManager"` 行（继承根 pin）；`tools/mission-driver/package.json` **无** `packageManager` 字段（review B4 纠正），不改；统一根 `tools/package.json` pin 为 `pnpm@10.27.0`（取较高版本，向前兼容）。
- [x] `Fix`: 删 `tools/mission-driver/web/pnpm-lock.yaml`（合并入 `tools/pnpm-lock.yaml`）；`cd tools && pnpm install` 重新生成单一 lockfile。
- [x] `Fix(B2)`: 更新 `.github/workflows/web-dist-check.yml`: `working-directory` web/ → tools/；`cache-dependency-path` → `tools/pnpm-lock.yaml`；`pnpm install --frozen-lockfile` 改在 tools/ 跑；`pnpm build` 改 `pnpm --filter mission-driver-monitor-web build`；`git diff -- dist` → `git diff -- mission-driver/web/dist`。`release.yml` 不改（不碰 pnpm）。
- [x] `Fix(doc)`: `tools/README.md` "Install" 段改单条 `pnpm install` + 新增"Workspace Layout"小节 + Common Commands 补 `md:*`。
- [x] `Fix(附属)`: `web/dist` 刷新（workspace hoist 改变模块解析 → vite chunk hash 变化，功能等价；已 stage）。非原 Targets 列项，但 B2 CI 守卫要求 committed dist 与新拓扑一致。

Exit Criteria:

- [x] `cd tools && pnpm install` 单条命令装齐所有依赖，生成单一 `tools/pnpm-lock.yaml`。
- [x] `cd tools && pnpm md:test` —— **既有 5 fail**（opencode sessionId `ses_main` vs `run`，环境相关，基线 07-27 为 7 fail → 无新回归，反而好转）+ `prompt-check: OK`。验证范围说明: engine 测试的 5 个 fail 是 PRE-EXISTING（`docs/logs/2026/07-27.md:24` 已记录），本 plan 不改 engine/test 代码。
- [x] `cd tools && pnpm md:web:build` 成功且 `pnpm md:web:check:dist` exit=0（committed dist 新鲜度守卫不回归；dist 已刷新匹配 workspace 拓扑）。
- [x] `tools/mission-driver/web/pnpm-lock.yaml` 不再存在。
- [x] `.github/workflows/web-dist-check.yml` 路径/工作目录与单一 lockfile 一致（B2）。CI 远程验证: **verification scope limited** —— 本地静态审查 + `pnpm md:web:check:dist` exit=0 作为代理证据；远程 CI 触发留待人工推送时确认（workflow YAML 改动经逐行核对，paths/cache/install/build/diff 五处一致）。
- [x] `tools/README.md` 与 workspace 现实一致。
- [x] `docs/logs/` 更新（`docs/logs/2026/07-28.md`）。

### Phase 2 - heredoc 物化 + manifest 扩展

Status: completed
Targets: `template/install/tools/mission-driver.sh`、`template/install/.env.example`、`template/install/missions/base.json`、`template/install/missions/demo.json`、`template/install/missions/onboarding.json`、`template/install/docs/backlog/demo-roadmap.md`（均新增）、`install-age.manifest`（扩展语法 + 6 个新条目）、`install-age.sh`（删 §2/§3/§4/§4b heredoc，改为 manifest 驱动拷贝）
Skill: `none`

- Item Types: `Add | Fix | Proof`
- Prereqs: 无（与 Phase 1 正交，可独立）

- [x] `Add`: 创建 `template/install/` 下 6 个真文件 + README.md，内容 = 现有 heredoc 原文（逐字搬运）：
  - `template/install/tools/mission-driver.sh` ← 现 `install-age.sh:146-192` heredoc
  - `template/install/.env.example` ← 现 `install-age.sh:206-212` heredoc，但 `MISSION_DRIVER_HOME=$REL_MDH` 改为 `MISSION_DRIVER_HOME=__REL_MDH__`（占位符，拷贝后 sed 替换）
  - `template/install/missions/base.json` ← 现 `install-age.sh:239-260` heredoc
  - `template/install/missions/demo.json` ← 现 `install-age.sh:267-287` heredoc
  - `template/install/missions/onboarding.json` ← 现 `install-age.sh:337-357` heredoc
  - `template/install/docs/backlog/demo-roadmap.md` ← 现 `install-age.sh:296-316` heredoc
  - `template/install/README.md` —— 说明 consumer 版 vs dogfood 版的差异（Decision 4 residual risk 缓解）
- [x] `Add`: `install-age.manifest` 顶部加格式说明注释（决策 3 的语法契约）。
- [x] `Add`: manifest 加 6 个新条目（带 `> dst` + `:: flags`）:
  ```
  template/install/tools/mission-driver.sh > tools/mission-driver.sh :: exec
  template/install/.env.example > .env.example :: rel-mdh
  template/install/missions/base.json > missions/base.json
  template/install/missions/demo.json > missions/demo.json
  template/install/missions/onboarding.json > missions/onboarding.json
  template/install/docs/backlog/demo-roadmap.md > docs/backlog/demo-roadmap.md
  ```
- [x] `Fix`: `install-age.sh` 的 manifest 解析段扩展为支持 `> dst` + `:: flags`；新增 flags 应用逻辑（`exec` → `chmod +x`；`fill` → `<project-name>` sed；`rel-mdh` → `__REL_MDH__` sed）。
- [x] `Fix`: 删 `install-age.sh` §2/§3/§4/§4b heredoc；保留 `.env` 运行时 1 行写入、`mkdir -p` 目录创建、`.gitignore` ensure、报告。
- [x] `Fix`: 步骤编号 `[1/7]...[7/7]` 改为 `[1/6]...[6/6]`（删 2 个 heredoc 步骤，合并为 manifest 驱动）。
- [x] `Proof`: `./tools/check-install-age.sh` 全 10 项断言通过（既有闭包门禁，零回归）。

Exit Criteria:

- [x] `template/install/` 下 6 文件 + README 存在且内容与原 heredoc 逐字一致（.env.example 的 `$REL_MDH` → `__REL_MDH__` 是有意改动）。
- [x] `install-age.sh` 行数从 422 降到 259（删 heredoc，保留扩展的 manifest 解析 + 动态步骤）。注: 原 plan 目标 ~160 行偏高估；实际 259 行因 manifest 解析扩展（`> dst` / `:: flags`）+ 完整报告输出。
- [x] `./tools/check-install-age.sh` 全绿（10/10 PASS）。
- [x] manifest 新语法被 `install-age.sh` 正确解析（`> dst` 覆盖、`:: exec`/`:: rel-mdh` flags 生效——手动验证 shim `-rwxr-xr-x` + `.env.example` 含真实路径非 `__REL_MDH__`）。
- [x] `install-age.sh` 头注释更新（manifest 格式说明）。
- [x] `docs/logs/` 更新。

### Phase 3 - 安装器迁移到 tools/install-age.mjs

Status: completed
Targets: `tools/install-age.mjs`（新增，零依赖 Node ESM）、`install-age.sh`（改为 thin shim）、`install-age.cmd`（新增，Windows 原生入口）、`tools/install-age.test.mjs`（新增，`node --test`）、`tools/package.json`（加 `install-age:test` script）
Skill: `none`

- Item Types: `Add | Fix | Decision | Proof`
- Prereqs: Phase 2（manifest 扩展语法先稳定，再移植到 .mjs）

- [x] `Decision`: 最终确认语言为 `.mjs` + JSDoc（决策 2 已定；执行时无新信息推翻）。
- [x] `Add`: `tools/install-age.mjs` —— 移植全部逻辑到 Node ESM，仅用内置模块（`node:fs`、`node:path`、`node:url`、`node:readline/promises`、`node:process`）。含输入解析（交互式 `readline` + CLI argv）、manifest 解析（`> dst` + `:: flags`）、文件拷贝（`copyFileSync`，skip existing）、flags 应用（`chmod`、`<project-name>` replace、`__REL_MDH__` replace）、REL_MDH 计算（`path.relative`，干掉 `node -e` 子 fork）、`.env` 1 行写入、`mkdir -p`、`.gitignore` ensure、报告输出。JSDoc `@typedef` 给 ManifestEntry 类型。导出 `parseManifestLine` / `applyFlag` / `ensureGitignoreEntry` / `installAge` / `readManifest` 供测试 import。
- [x] `Add`: `install-age.sh` 改为 thin shim（16 行含注释；功能 2 行: SCRIPT_DIR + exec）。
- [x] `Add`: `install-age.cmd` —— Windows 原生入口（无需 Git Bash）: `node "%~dp0tools\install-age.mjs" %*`。
- [x] `Add`: `tools/install-age.test.mjs` —— `node --test` 单元测试 15 用例（3 suite）: manifest 解析（`> dst`、`:: flags`、默认剥前缀、多 flag、注释剥离、blank line）、flags 应用（fill/rel-mdh/global replace）、gitignore（append/dedupe/create）。
- [x] `Fix`: `tools/package.json` 加 `"install-age:test": "node --test ./install-age.test.mjs"`。
- [x] `Fix(doc)`: `install-age.sh`/`.cmd` 头注释、`tools/README.md`（Common Commands 补 `install-age:test`）更新入口说明。
- [x] `Proof`: `./tools/check-install-age.sh` 通过 thin shim 调用 .mjs，全 10 项断言通过（证明行为零回归）。
- [x] `Proof`: `cd tools && pnpm install-age:test` 全绿（15/15 pass）。
- [x] `Proof`: `node tools/install-age.mjs _tmp/manual-test "ManualProj"` 直接调用成功（copied 84 files，6 步全跑）。**跨平台验证**: solo Git Bash 验证 + 跨平台为设计推定（.mjs 仅用 Node 内置模块 + 无 shell 特定调用 + `%~dp0`/`exec node` 两种入口均经静态审查；PowerShell/cmd 实机验证留待人工推送时确认）。

Exit Criteria:

- [x] `tools/install-age.mjs` 存在，零 npm 依赖（仅 `node:fs`/`node:path`/`node:url`/`node:readline/promises`/`node:process` 内置模块），Node ≥ 18 可跑。
- [x] `install-age.sh` 为 thin shim（功能 2 行: `SCRIPT_DIR` + `exec node`；含注释共 16 行——注释不计为复杂度）。
- [x] `install-age.cmd` 存在（12 行含注释；功能 1 行 `node "%~dp0tools\install-age.mjs" %*`）；Windows 原生可跑（设计推定 + 静态审查，实机 PowerShell 验证留待人工）。
- [x] `./tools/check-install-age.sh` 全绿（10/10 PASS，通过 shim → .mjs 路径）。
- [x] `tools/install-age.test.mjs` 全绿（15/15）且并入 `tools/package.json`（`pnpm install-age:test` exit=0）。
- [x] README + 头注释与新入口一致（`tools/README.md` Common Commands + `install-age.sh`/`.cmd` 头注释）。
- [x] `docs/logs/` 更新（`docs/logs/2026/07-28.md` 追加 Phase 2+3）。

## Draft Review Record

- Independent draft review iteration 1: `needs revision`（independent fresh session `ses_0592b66edffeag7eMRimpa5S2a`，2026-07-28）—— 4 个 blocker 全部已修订:
  1. **B1 决策审计失实**: 原"不冲突"框架隐藏了与 `2026-07-24-1030 Decision 2` 的 source-of-truth 冲突（该决策彻底否决 workspace，非仅否决 workspace+autobuild）。**已改**: 明确写"本 plan 推翻 Decision 2"，附推翻理由 + 保留"不引入根 prepare 自动 build"约束。
  2. **B2 Phase 1 断 committed-dist CI**: `.github/workflows/web-dist-check.yml` 三处（working-directory/cache-dependency-path/install cwd）依赖 web/ 独立 lockfile，原 plan 漏改。**已改**: Phase 1 Targets 加 workflow 文件 + 新增 `Fix(B2)` item 同步三处路径；Exit Criteria 加 CI 验证；`release.yml` 确认不受影响（只发 Release，不碰 pnpm）。
  3. **B3 断言数 11→10**: 实测 `check-install-age.sh` 10 个 `assert`（lines 85/89/93/97/102/117/120/125/130/135），非 11。**已改**: 全文 5 处 "11 项" → "10 项"。
  4. **B4 误删不存在字段**: `tools/mission-driver/package.json`（15 行）无 `packageManager` 字段。**已改**: 删除项改为只删 `web/package.json` 的 pin；根 pin 升 10.27.0。
  - Baseline 纠正: "4/6 heredoc 实为 divergent dogfood 文件"已补入 Current Baseline（`missions/base.json`/`demo.json`/`tools/mission-driver.sh`/`demo-roadmap.md` 在根有自用版本）；"7 个 .mjs"→"6 个 .mjs + 1 个 .sh"。
  - Rule 9 纠正: Decision 4 补备选 a/b + 否决理由。
  - 非阻塞 C.1-C.6 全部确认 OK（install-age.cmd 形式、验证链、workspace 零依赖成员、manifest 语法契约、protected area 判定、Phase 正交性）。
  - 非阻塞 follow-up: `tools/mission-driver/web/.nvmrc` 位置决策已并入 Phase 1 为 `Decision` item。
  - 待 iteration 2 复核修订后是否引入新矛盾。
- Independent draft review iteration 2: `acceptable as-is`（independent fresh session `ses_0592358d7ffeChmqQhMixC6ZTM`，2026-07-28）—— 4 个 blocker（B1/B2/B3/B4）全部确认 `resolved`，2 个 baseline 纠正（BC1/BC2）全部 `verified`，6 项新矛盾检查全空（决策审计↔Fix(B2) 一致、.nvmrc Decision 良好、Draft Review Record 准确、closure gate 10 项一致、Status/checkbox 一致、Anti-Slacking 干净）。3 个非阻塞清理项已修订: (a) 删除重复的 `Add scripts` item（原 line 132）；(b) 删除与 `.nvmrc` Decision 重复的 `Fix(B2-附属)` item（原 line 131，Decision 已定为"保留原位"）；(c) 决策审计段 web-dist-check.yml 行号 :23/:38/:42 → 实测 :28/:40/:43。Plan 升 `active`。

## Closure Gates

- [x] in-scope behavior is complete（三 Phase 全部 Exit Criteria 勾选）
- [x] relevant docs are aligned（`tools/README.md` Workspace Layout + Common Commands；`install-age.sh`/`.cmd` 头注释；`install-age.manifest` 格式说明；`template/install/README.md` consumer-vs-dogfood 说明）
- [x] verification has run: `cd tools && pnpm install && pnpm md:web:check:dist && pnpm install-age:test` 全绿（`pnpm md:test` 既有 5 fail 是 PRE-EXISTING 环境问题，非本 plan 引入） + `./tools/check-install-age.sh` 全 10 项 PASS
- [x] scoped verification is not conflated with full verification —— 本 plan 验证范围 = install 流程 + 模板内部依赖布局；**不**覆盖 mission-driver 引擎自身行为（`md:test` 既有 551 pass / 5 fail，本 plan 不改引擎代码）；**不**覆盖 web 前端功能（由 `md:web:check:dist` + committed dist 守卫覆盖）；CI 远程触发（`web-dist-check.yml`）留待人工推送确认（workflow YAML 经 closure audit 逐行核对）
- [x] no in-scope item downgraded to deferred/follow-up
- [x] independent draft review completed and recorded（iteration 1 `ses_0592b66edffeag7eMRimpa5S2a` 4 blocker 全修；iteration 2 `ses_0592358d7ffeChmqQhMixC6ZTM` `acceptable-as-is`）
- [x] text consistency verified: status, phases, gates, and log all agree
- [x] closure audit was independent（`ses_059025d24ffebAYdqn2uo0w82c`，22/22 任务 verified，`close` 判定）—— 非 solo cold-replay fallback
- [x] closure evidence exists in files（test 输出 + check-install-age.sh 输出 + `docs/logs/2026/07-28.md` + closure audit task record）

## Deferred But Adjudicated

## Deferred But Adjudicated

### 重写 `tools/check-install-age.sh` 为 Node

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 它是验证 harness（bash 可接受，且在 bash/Git Bash 环境跑），不是消费者面对的产物。跨平台收益仅对消费者入口（install-age.sh/.cmd）有意义。
- Successor Required: `yes` —— 触发条件: 当本 plan Phase 3 落地后，若希望 CI 在无 bash 的 Windows runner 上跑闭包门禁，则重写。否则保持 bash。

### `.opencode/` 合并进 workspace

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: `.opencode/package.json` 被 `.gitignore` 排除，不在 git 中，是 opencode 运行时本地产物。合并会改变其语义（从"本地运行时"变"workspace 成员"），且 opencode 可能期望它自包含。
- Successor Required: `no` —— 仅当 opencode 上游改变插件加载约定时才重新评估。

### manifest 加 per-file description 列

- Classification: `optimization candidate`
- Why Not Blocking Closure: 决策 3 已用"条目上方一行 `#` 注释"满足"方便用户理解"需求（注释本就是合法 manifest 语法，解析零成本）。完整 desc 列对 137 条目产生噪音。
- Successor Required: `no` —— 若未来条目数 > 300 或需要机器可读 desc，再评估。

## Closure

Status Note: 三 Phase 全部完成并经独立 closure audit（`ses_059025d24ffebAYdqn2uo0w82c`，22/22 verified，`close`）。公共安装契约变更（install-age.sh → thin shim + .mjs）由独立 subagent 审计，非 solo fallback。消费者行为零回归（`check-install-age.sh` 10/10 PASS）；模板内部依赖布局统一为单一 pnpm workspace；heredoc 硬编码消除（422→16 行 shim + 259 行 .mjs + 6 个可 review 真文件）。

Closure Audit Evidence:

- Auditor / Agent: independent subagent `ses_059025d24ffebAYdqn2uo0w82c`（2026-07-28）
- Evidence: 22 项 closure audit 任务全部 `verified`（Phase 1: 8/8；Phase 2: 5/5；Phase 3: 4/4；Consistency 3/3；Regression 2/2）；`close` 判定；手动 install 测试 84 files / 6 steps / shim `-rwxr-xr-x` / `.env.example` 真实路径 / AGENTS.md 无 `<project-name>` 残留；dogfood `missions/base.json` 未被污染。

Follow-up:

- CI 远程触发: 推送后确认 `.github/workflows/web-dist-check.yml` 在 workspace 拓扑下跑通（本地 `pnpm md:web:check:dist` exit=0 已作代理证据）。
- Windows 实机验证: `install-age.cmd` 在 PowerShell/cmd 下实跑（设计推定 + 静态审查，Git Bash 环境已验证 shim→.mjs 链）。
