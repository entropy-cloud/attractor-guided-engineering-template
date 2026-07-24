# 2026-07-24-1030 mission-driver clone-and-run：提交预构建 dist + CI 新鲜度校验

> Plan Status: completed
> Last Reviewed: 2026-07-24
> Source: user request — 首次 clone 需要“使用”的人被迫装前端依赖 + 手动打包太繁琐
> Related: 2026-07-24-1030-mission-driver-web-bundle-slimming-plan.md（C，已 completed，使 committed dist 更小）；commit 0a40c5f（引擎 vendor commander 实现零 install）
> Audit: required
> Gate: ask-first → 已获人工批准（用户 2026-07-24 明确“接受把 web/dist 提交进 git”并授权按业界流行做法实施新鲜度校验）

## Current Baseline

Live facts (read from repo 2026-07-24，已核对):

- 引擎已**零 npm 依赖**：commit `0a40c5f` 把唯一依赖 `commander` vendor 内联到 `tools/mission-driver/vendor/commander/`，删除 `pnpm-lock.yaml`、`package.json` 移除 dependencies。→ 引擎 `node src/main.js` **clone 即跑，无需 install**。
- 前端 `web/` 仍需 `pnpm install` + `pnpm build` 产出 `dist/`；`web/.gitignore` 忽略 `dist`；`web/dist` 未入 git。`monitor.js` 从 `web/dist/` 静态托管，缺失降级为占位页。→ **web 是 clone-and-run 的最后一块拼图**。
- 消费方（orion-pay 等，user-manual §1.4）通过 shim `node "$ABS_HOME/src/main.js"` 指向模板引擎；不在消费者仓库 install 前端。
- 仓库在 **GitHub**（origin `pymjer/…`、upstream `entropy-cloud/…`）；当前**无 `.github/workflows`**。
- 根 `.gitattributes` = `* text=auto eol=lf`（dist 文本资产强制 LF，跨 OS 无 EOL diff）。
- `web/package.json` 依赖多为 caret；`web/pnpm-lock.yaml` 存在（含 C 的 `unplugin-vue-components`）。C 已落地：首屏 dist 已瘦身（gzip ≈198KB）。
- `web/README.md:77` 述“`dist/` is a build artifact (gitignored) — always regenerate”；CONTEXT.md 述“前端零构建步骤于运行时”“前端独立 web/package.json”。

Gap: 消费者仍被迫 web install + build 才能用 monitor（本 plan 消除）。落地后：**引擎零 install + 前端提交 dist = 整体 clone-and-run，零 install 零 build（消费者侧）**。

## 设计决策

1. **提交 `web/dist/` 入 git**（用户批准）。消费者/shim 使用方 clone 即得完整 Dashboard，无 web install、无 build。
2. **不引入 workspace / 根自动 build**（旧 A 与 committed dist 冲突，已废）。保持引擎/前端两包分离，默认引擎零 install；web 依赖仅前端开发者按需 opt-in。
3. **新鲜度校验 = GitHub Actions CI（业界流行做法）**：仅当 `tools/mission-driver/web/**` 变更时触发，pinned Node/pnpm + `pnpm install --frozen-lockfile` + `pnpm build` + `git diff --exit-code -- dist`。这是 GitHub Actions 生态对 committed 产物的标准守卫（同 `@vercel/ncc` 等）。pinned 环境 + frozen-lockfile + eol=lf 解决跨机器 vite 哈希确定性（消除误报）。
4. 辅以本地 `check:dist` npm 脚本，供前端开发者提交前自查（与 CI 同逻辑）。

## Goals

- 提交预构建 `web/dist/`，消费者 clone 后**零 web install、零 build** 即得完整 monitor。
- GitHub Actions 新鲜度校验：web 源码变更但 dist 未同步重建时，CI 失败拦截。
- 更新 user-manual、`web/README.md:77`、`CONTEXT.md` 与 clone-and-run 现实一致。

## Non-Goals

- 不引入 workspace / 根 prepare 自动 build；不改 npm publish/npx；不关闭内容哈希改稳定名；不引入运行时惰性 build。
- 不做 naive-ui 减包（C 已完成）。
- 不强制 pre-commit hook（选 CI 为主守卫；本地脚本为辅，hook 留作可选 follow-up 避免给非前端提交者加装 husky）。

## Task Route

- Type: `architecture change`（dist/分发策略 + CI）
- Owner Docs: `tools/mission-driver/CONTEXT.md`、`web/README.md`、`docs/user-manual.zh.md §1.3/§1.4`
- Skill Selection Basis: 配置/CI 变更 → `none`。
- Autonomy: 改动 build/分发/deployment；Protected Areas 占位 → ask-first；**已获用户（人工）明确批准**并授权机制选择，闸门满足。

## Infrastructure And Config Prereqs

- CI 规范构建环境：workflow 内 pin Node 主版本（≥18，建议锁 20.x LTS）+ pnpm 主版本；`pnpm install --frozen-lockfile`（依赖 committed `web/pnpm-lock.yaml`）。
- 保留 `web/pnpm-lock.yaml`（不做 workspace，无根 lockfile 合并）。
- EOL 由根 `.gitattributes eol=lf` 处理；确保 dist 文本资产随之规范化。
- 校验独立于引擎 `npm --prefix tools/mission-driver test`（引擎 web-independent；避免 CLI-only/异仓 shim 误跑）。
- 回滚：恢复 `web/.gitignore` 的 `dist` + `git rm --cached -r web/dist` + 删 workflow。

## Execution Plan

### Phase 1 - 提交预构建 dist

Status: completed
Targets: `web/.gitignore`、根 `.gitignore`（negation）、`web/dist/`（提交）、`web/README.md:79`、`CONTEXT.md`
Skill: `none`

- Item Types: `Fix | Add | Proof`
- Prereqs: C 完成（提交物为瘦身后 dist）

- [x] `Fix`：从 `web/.gitignore` 移除 `dist`；发现根 `.gitignore:3` `dist/` 全局忽略生效，加 negation `!tools/mission-driver/web/dist/`。
- [x] `Add`：`pnpm install --frozen-lockfile` + `pnpm build` 产出规范 dist，`git add web/dist`（17 文件）。
- [x] `Fix(doc 漂移)`：`web/README.md:79` 改“已提交、消费者零 build + CI 校验”；`CONTEXT.md` 依赖行/关键约束行改“引擎零 npm 依赖（commander vendored）+ web/dist 已提交 → clone 即跑零 install/零 build”。
- [x] `Proof`：运行中的 monitor `GET /` 返回完整 App HTML 并引用已构建的 `assets/index-BXlkLssv.js`（非占位页），证明 monitor 静态托管已提交 dist。

Exit Criteria:

- [x] `web/dist` 已被 git 跟踪（negation 生效，`git check-ignore` 确认不再忽略）且为 C 瘦身后产物。
- [x] monitor `GET /` 呈现完整 Dashboard（引用构建产物 hash chunk）。
- [x] `web/README.md`、`CONTEXT.md` 与“已提交 dist”一致。
- [x] `docs/logs/` 更新。

### Phase 2 - CI 新鲜度校验 + 本地自查脚本

Status: completed
Targets: `.github/workflows/web-dist-check.yml`（新增）、`web/package.json`（`check:dist` 脚本）、`docs/user-manual.zh.md §1.3/§1.4`
Skill: `none`

- Item Types: `Add | Proof`
- Prereqs: Phase 1

- [x] `Add`：`.github/workflows/web-dist-check.yml`——`on: push/pull_request` + `paths: tools/mission-driver/web/**`；job：checkout → pnpm/action-setup@v4(v10) → setup-node@v4(node20, cache pnpm) → `pnpm install --frozen-lockfile` → `pnpm build` → `git diff --exit-code -- dist`（stale 则 `::error` + exit 1）。
- [x] `Add`：`web/package.json` 加 `"check:dist": "vue-tsc --noEmit && vite build && git diff --exit-code -- dist"`。
- [x] `Proof`：本地正反用例——dist 与源码一致时 `check:dist` exit 0；临时改 `src/App.vue` 主题色 → rebuild 变 hash → `git diff` 检出（entry `index-BXlkLssv`→`index-C9uajcHM`）→ exit 1；已 revert+rebuild 复原。

Exit Criteria:

- [x] workflow 存在、路径过滤正确、pin Node20/pnpm10、用 `--frozen-lockfile` + `git diff --exit-code`。
- [x] `check:dist` 正反用例符合预期。
- [x] user-manual §1.3 重写为 clone-and-run（零 install/零 build）+ 前端开发者 opt-in + CI 守卫说明；§1.4 前提行更新；`docs/logs/` 更新。

## Draft Review Record

- Independent draft review iteration 1（subagent, task ses_06e05cf6effe1FvCvMicJYZchh, 2026-07-24）: 合并 plan 判 `needs revision`。修订已落实：B1（frozen-lockfile + pin 环境 + CI 强制点，EOL 已由 `.gitattributes` 处理）；M1（不再 workspace 强装 web/无 `--ignore-scripts` hack——本 plan 彻底不引入 workspace）；M2（校验独立于引擎 test）；M3（C 已拆独立 plan 并 completed）；M4（README:77 + CONTEXT 纳入 Phase 1）；M5（ask-first 记录 + 人工批准）。
- User direction（2026-07-24）：①引擎已 vendor commander 实现零 install（0a40c5f）；②批准提交 dist；③授权按业界流行做法做新鲜度校验 → 选定 GitHub Actions（仓库确在 GitHub）。这构成本 plan 的**人工批准 + 机制决策**，ask-first 闸门满足。
- Draft review iteration 2：因关键机制已由用户人工指定、iteration-1 findings 均已落实、且改动进一步收窄（不引入 workspace），置 `active` 实施；实施后由独立 subagent 做 closure audit 作为独立复核。

## Closure Gates

- [x] 消费者零 install/零 build 路径成立（干净 checkout 启 monitor 出完整 Dashboard）
- [x] user-manual、`web/README.md`、`CONTEXT.md` 与 clone-and-run 对齐
- [x] 验证已运行：干净 checkout 启 monitor、`check:dist` 正反用例、workflow 结构核对
- [x] scoped 验证不冒充全量
- [x] 无 in-scope 项降级为 deferred/follow-up
- [x] 独立 draft review 记录完整（iteration 1 + 用户人工批准）
- [x] ask-first 人工批准已取得并记录
- [x] 文本一致性：状态、phases、gates、log 一致
- [x] 独立 closure audit（subagent）
- [x] 闭环证据落盘

## Deferred But Adjudicated

### pre-commit hook 强制本地 dist 同步

- Classification: `optimization candidate`
- Why Not Blocking Closure: 已有 CI 主守卫 + 本地 `check:dist`；hook 需给所有提交者装 husky，与零 install 理念相悖。
- Successor Required: `no`；Reopen trigger: 若 CI 无法覆盖某分支流程且 dist 频繁陈旧。

## Closure

Status Note: clone-and-run 落地——引擎零依赖（commander vendored）+ `web/dist` 提交入 git，消费者 clone 即用、零 install 零 build；CI rebuild+`git diff` 守卫 dist 新鲜度。独立 closure audit 判 `closure accepted`。

Closure Audit Evidence:

- Auditor / Agent: 独立 subagent（task ses_06dc75832fferBEQsSBkkgI6ap，2026-07-24，read-only）
- Evidence（独立复核逐项）：① dist 已跟踪（`git ls-files …/dist` = 17 文件，`git check-ignore` exit 1=未忽略）；② CI workflow 路径/pin/frozen-lockfile/git-diff 结构正确、YAML 合法、`working-directory`+`dist` 路径解析正确；③ **同机确定性已实证**（rebuild 后 `git diff --exit-code -- dist` exit 0、tree 干净）；④ check:dist 脚本逻辑正确；⑤ `.gitkeep` 经 build 存活；⑥ clone-and-run 证据：`tools/mission-driver/package.json` 无 dependencies、`vendor/commander/` 存在、monitor.js:170/1742-1748/1790-1797 静态托管 dist + 缺失降级占位；⑦ 文档全部对齐（zh §1.3/§1.4、README、CONTEXT）；⑧ plan 文本一致。
- Verdict：`closure accepted`，无 blocking。唯一 Major(M1)=跨 Node(26→20)/跨 OS(Win→Ubuntu) 确定性为"假设非实证"——评 MEDIUM 残余，强缓解（frozen-lockfile 锁 esbuild/rollup/vite、esbuild 为确定性 Go 二进制、`.gitattributes eol=lf`、dist 无机器路径嵌入），CI 即权威验证器，drift 会响亮失败而非静默腐化。审计建议采纳：
  - **已落地**：`web/package.json` 加 `packageManager: pnpm@10.27.0`；新增 `web/.nvmrc`（Node 20）→ 贡献者环境对齐 CI，M1 缓解转为预防。
  - **不适用**：审计 m1 建议 sync `user-manual.en.md` §1.3——经核查英文手册**从无 §1.3 安装段**（§1.2 直接到 §2），无 stale 流，无需改。

Follow-up:

- 无阻塞项。CI 首次运行即对跨环境确定性做最终实证（若 Node20/ubuntu 产物哈希与本地一致 → M1 残余消解）。
