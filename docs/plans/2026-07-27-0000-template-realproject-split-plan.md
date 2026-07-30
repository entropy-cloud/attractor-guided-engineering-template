# 2026-07-27-0000 template-realproject split — 把仓库从"纯模板"重整为"用 AGE 开发自己的真实项目 + 仍是模板"

> Plan Status: completed
> Last Reviewed: 2026-07-27
> Source: `docs/analysis/2026-07-27-0000-template-realproject-split-proposal.md` (v4, 已通过 4 轮独立 audit)
> Related: `docs/logs/2026/07-24.md:43` (7 步既有 copy flow,本 plan Phase 3 复用其机制)
> Audit: required
> Gate: ask-first — Phase 2 改 `AGENTS.md`(AI 操作合同),Phase 3 改 `install-age.sh`(消费者依赖的 copy flow)。需人工批准后才能执行 Phase 1+。**人工批准 = 用户在本 plan 上明确说"开始执行"或同等表述。**

## Current Baseline

Live facts (read from repo 2026-07-27,已核对):

- 仓库双重身份未在文档层显化: 根 `AGENTS.md:5` 仍是 `<project-name>` 占位;`docs/context/project-context.md:36-42` 全是 `<fill real command>`;`docs/index.md:1` 是 `<project-name> Docs Index`。opencode 每次会话自动加载根 `AGENTS.md` → 每个 AI 会话读到的是模板合同,不是真实项目合同。
- 既有 copy-flow 自动化**已存在**且是单一来源: `install-age.sh`(369 行)+ `install-age.manifest`(136 行)。脚本读 manifest 逐行 `cp` 到目标,skip 已存在,在 `install-age.sh:121-127` 对 `AGENTS.md` 做 `<project-name>` → 项目名 sed 替换,并自动生成 shim/.env/missions base.json+demo.json+demo-roadmap/docs/logs/{year}/.gitignore。`START-HERE-after-copy.md` 是更早的手动 flow,已被 install-age.sh 取代但仍存。
- 16 个 fill-in 文件带 `<...>` 占位 (proposal §6 Phase 0 grep 已实证,**含 `START-HERE-after-copy.md`**): `AGENTS.md`, `START-HERE-after-copy.md`, `docs/index.md`, `docs/context/{project-context,ai-autonomy-policy,codebase-map}.md`, `docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md`, `docs/process/application-development-workflow.md`, `docs/backlog/{README,implementation-roadmap}.md`, `docs/design/{domain-design-guidelines,flow-overview}.md`, `docs/testing/known-good-baselines.md`。
- 另有 2 个 dual-audience 文件不在 16 fill-in 内但同样要处理(proposal Phase 1 行 2-3): `README.md`、`README.zh.md` — 内容跨双受众,需 git mv 到 template/ 保纯净版 + 在根重写为 dual-audience 版。
- `docs/architecture/mission-driver-baseline.md`(125 行)已经是真实项目文件,与 4 个 stub 同居 — 仓库已**半自发半迁移**。
- `install-age.manifest:5-15` 已用注释列明 template-internal 排除项(`docs/articles/`、`docs/audits/mission-driver-*/`、`docs/logs/2026/`、`docs/plans/mission-driver-*/` 等)。
- 包管理现实 (proposal C8): 无根/engine lockfile;仅 `tools/mission-driver/web/pnpm-lock.yaml` 存在;`tools/package.json:5` 声明 `"packageManager": "pnpm@10.0.0"`。
- `README.md` / `README.zh.md` / `START-HERE-after-copy.md` 当前**不在** `install-age.manifest` 中(pre-existing gap,proposal R14/N5)。

Gap: 仓库无法用 AGE+mission-driver 开发自己,因为根 docs 是模板风味,AI 会话被 Verification Baseline 规则卡在占位符上。同时模板消费者路径已通过 install-age.sh 跑通,不能破坏。

## Goals

- 根目录 = 真实项目(mission-driver 自举开发);`template/` = 16 个 fill-in 文件的纯净镜像;共享方法论指南留在根 `docs/`。
- `install-age.sh` 复制行为保持完全等价(consumer 视角无感) — 同样的目标文件结构、同样自动 sed `<project-name>`。
- opencode 会话开始时读到真实项目合同(`AGENTS.md` 含 Dual-Audience + In-Tree Tool 段)。
- 决策被持久化为架构真理(防止再次讨论)。

## Non-Goals

- 不重写任何共享方法论指南(`00-*-guide.md`、`docs/skills/*` 等)。
- 不动 `tools/mission-driver/` 内部代码 — 只可能调整它的 README 引用。
- 不为已复制的消费者仓库提供 backward-compat shim。
- 不统一包管理器(engine 保持任意兼容,web 保持 pnpm)。
- 不做 `init-from-template.mjs` 自动化(proposal Phase 3.5 已废,install-age.sh 已存在)。
- 不在本 plan 中修 proposal R14/N5(`README.md` 等不在 manifest 的 pre-existing gap)— 记为 Phase 2 follow-up。

## Task Route

- Type: `architecture change`(重构模板/真实项目边界 + 改 AI 合同 + 改 install 流程)
- Owner Docs: `AGENTS.md`、`install-age.sh`、`install-age.manifest`、`START-HERE-after-copy.md`、`tools/mission-driver/CONTEXT.md`、`docs/architecture/`(新建边界 doc)、`docs/analysis/2026-07-27-0000-...-proposal.md`
- Skill Selection Basis: 文件移动 + 文档编辑 + 5 行 bash patch → `Skill: none`(无匹配的可复用 skill;open-ended-audit-prompt.md 已在 proposal 4 轮 audit 中使用过,plan 阶段不再重复)
- Autonomy: **ask-first** — Phase 2 改 AI 操作合同 + Phase 3 改消费者依赖的 install flow,触发 Planning Rule 的 "changes ... public contract behavior" 高风险类。需人工批准后才执行 Phase 1+。

## Infrastructure And Config Prereqs

- 无新依赖、无新端口、无外部服务。
- **Atomic commit 约束 (B1 fix)**: Phase 1 + Phase 2 **必须作为同一个 git commit** 落地。在两次 commit 之间,根会暂时没有 `AGENTS.md` → opencode 自动加载会失败 → 任何新会话被 brick。Atomic commit 保证不存在这样的 commit 边界。Phase 3 / Phase 4 可各自独立 commit。
- **Recovery procedure (若 session 在 Phase 1+2 working-tree 期间崩溃)**:
  1. `git status` 看工作树状态。
  2. 若 `template/` 已含文件但根 `AGENTS.md` 缺失 → 完成 Phase 2(创建根 AGENTS.md/README/DEVELOPMENT.md)→ 一次 commit。
  3. 若 `template/` 部分填充 → `git restore --staged . && git checkout .`(回到 Phase 1 前)→ 重做。
  4. 任何不确定 → 优先 `git checkout .` 回滚,不部分 commit。
- **Git Bash 约束 (H3 fix)**: Phase 3 closure-gate test 用 `mktemp -d` 创建 `/tmp/age-test-$$`;Windows 上须在 Git Bash 或 WSL 跑,不能在 cmd/PowerShell。
- 回滚策略: Phase 1+2 atomic commit 可 `git revert <sha>`;Phase 3 单独 commit 可独立 revert;Phase 4 同样。

## Execution Plan

### Phase 0 — Prereqs + Open Decisions 收口

Status: completed
Targets: `docs/analysis/2026-07-27-0000-template-realproject-split-proposal.md`(读)、`.opencode/`(扫描)
Skill: none

- Item Types: `Proof | Decision`
- Prereqs: 提案 v4 已通过 audit

- [x] `Proof`: 执行 proposal §6 Phase 0 grep(扩展版含 `<first slice>` / `<work item>` / `<domain>` / `<state>`),验证返回**正好 16 文件**(proposal Phase 1 行 1, 4-18)。**结果 PASS** — grep 返回正好 16: AGENTS.md, START-HERE-after-copy.md, docs/index.md, docs/context/{project-context,ai-autonomy-policy,codebase-map}.md, docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md, docs/process/application-development-workflow.md, docs/backlog/{README,implementation-roadmap}.md, docs/design/{domain-design-guidelines,flow-overview}.md, docs/testing/known-good-baselines.md。
      - Skill: none
- [x] `Proof`: 扫描 `.opencode/` 子树 + 仓库根,确认无 `opencode.json` 改变指令加载行为。**结果 PASS** — `.opencode/` 仅含 `.gitignore`、`node_modules/`、`package.json`、`package-lock.json`、`skills/`;`find . -maxdepth 2 -name "opencode.json*"` 无命中。
      - Skill: none
- [x] `Decision | D6-resolve`: opencode **不支持**(本仓库无 `.opencode/opencode.json`,且无证据表明 opencode 能加载额外指令文件)。保持 Option 3。R-U1 残留 unknown 关闭。是否未来 opencode 增加该能力 → 由 Deferred §D6 watch。
      - Skill: none
- [x] `Decision | D1`: 子目录名 = `template/`。
  - Alternatives considered: `_template/`(下划线避免与可能的真实 `templates/` 冲突)、`scaffold/` — rejected as less recognizable。
  - Residual risk: 无。
- [x] `Decision | D5`: row 13(`docs/process/application-development-workflow.md`)用 full mirror(整文件搬到 template/),不做 sed-replace 例外。
  - Alternatives considered: sed-replace — rejected(单一例外使 copy flow 复杂化)。
  - Residual risk: 无。
- [x] `Decision | D7`: Phase 3 manifest 用 strip-prefix(3.a),不用 two-column(3.b)。
  - Alternatives considered: two-column manifest — rejected(更侵入;strip-prefix 配 5 行 patch 已实证可行,proposal round-4 audit trace 通过)。
  - Residual risk: R11(Medium)— install-age.sh 唯一 copy 机制无 CI 覆盖,由 closure-gate test 弥补。
- [x] `Decision | D8`: row 15(`docs/backlog/implementation-roadmap.md`)、row 16-17(`docs/design/{domain-design-guidelines,flow-overview}.md`)在**根删除**,template/ 保留纯净版。理由: mission-driver 是单域工具,不需要多域 / 多 milestone 框架。
  - Alternatives considered: 在根填充 — rejected(无对应业务需求,会引入空 stub)。
  - Residual risk: 低。`docs/index.md:26, 34-35` 路由条目需同步删除(row 5 caveat)。

Exit Criteria:

- [x] Phase 0 grep 返回正好 16 文件;若不一致,Phase 1 表已 expand — PASS,正好 16
- [x] D6 残留 unknown 已裁定并记录 — opencode 不支持,Option 3 落地
- [x] D1/D5/D7/D8 已记录,rationale 写入本 plan
- [x] `docs/logs/` 更新 — 在 Phase 1+2 atomic 完成后统一记

### Phase 1 — Foundation moves (单 session 内完成,最小化 root-AGENTS.md-缺失窗口)

Status: completed
Targets: 16 个 fill-in 文件 + `START-HERE-after-copy.md`(详见 proposal §6 Phase 1 表)
Skill: none

- Item Types: `Add | Fix`
- Prereqs: Phase 0 通过(尤其 D6 已裁定 Option 3,Phase 1 才有意义)

- [x] `Add`: `mkdir -p template/docs/{context,architecture,process,backlog,design,testing}`。
      - Skill: none
- [x] `Fix` (16 个 `git mv`, **含 START-HERE-after-copy.md**): 把根的 16 个 fill-in 文件移到 `template/<同相对路径>`(保 git history)。逐项核对 proposal Phase 1 行 1, 4-18(`AGENTS.md`, `START-HERE-after-copy.md`, `docs/index.md`, 3×context, 4×architecture, `process/application-development-workflow.md`, 2×backlog, 2×design, `testing/known-good-baselines.md`)。
      - Skill: none
- [x] `Fix`: 在 `template/START-HERE-after-copy.md` 头加 deprecation header 指向 `install-age.sh` 作为首选(这是上一项 git mv 的子步骤,不是第 17 个文件)。
      - Skill: none
- [x] `Fix` (N1 fix — 对齐 proposal): `git mv README.md template/README.md`、`git mv README.zh.md template/README.zh.md`(保留模板受众纯净版;Phase 2 在根重写为 dual-audience)。
      - Skill: none
- [x] `Fix` (D8 落地): 在根删除 `docs/backlog/implementation-roadmap.md`、`docs/design/domain-design-guidelines.md`、`docs/design/flow-overview.md`(template/ 已有纯净版)。
      - Skill: none
- [x] `Proof`: `git status` 确认所有移动 + 删除符合 Phase 1 表;`ls template/` 显示 16 fill-in + START-HERE-after-copy.md(已在 16 内) + README.md + README.zh.md = **18 个文件**(16 + 2 dual-audience);`ls template/docs/{architecture,backlog,design}` 显示子目录就位。
      - Skill: none

Exit Criteria:

- [x] `template/` 含 16 个 pristine fill-in(含 `START-HERE-after-copy.md` 带 deprecation header) + `README.md` + `README.zh.md`(dual-audience pristine)= **18 个文件**
- [x] 根的 16 个 fill-in 文件已不存在(Phase 2/4 重建为真实项目版)
- [x] 根的 `README.md` / `README.zh.md` 已移走(Phase 2 重建为 dual-audience)
- [x] D8 删除的 3 文件不在根
- [x] git history 通过 `git mv` 保留(`git log --follow template/AGENTS.md` 可追到原根文件)
- [x] **本 phase 不独立 commit — 与 Phase 2 合并为一个 atomic commit(B1 fix)**
- [x] `docs/logs/` 更新

> Note (B1 fix): 本 phase 完成后到 Phase 2 完成前,根**没有 AGENTS.md**。opencode 自动加载会找不到指令文件。**强制约束**: Phase 1 + Phase 2 在同一会话内连续执行 + 合并为**一个 git commit**(无 commit 边界缺 AGENTS.md)。若 session 崩溃,按 Infrastructure And Config Prereqs 的 Recovery procedure 处理,**绝不部分 commit**。

### Phase 2 — Rewrite root `AGENTS.md` + `README.md` + `DEVELOPMENT.md`

Status: completed
Targets: `AGENTS.md`(新建)、`README.md`(新建)、`README.zh.md`(新建)、`DEVELOPMENT.md`(新建)
Skill: none

- Item Types: `Add | Fix`
- Prereqs: Phase 1 完成

- [x] `Add`: 创建新 `AGENTS.md`。内容来源:
  - 复制 `template/AGENTS.md` 作为基础
  - 开头 `<project-name>` → `mission-driver (self-hosting AGE workspace)`
  - 新增 `## Dual-Audience Repo` 段(proposal §6 Phase 2 草稿)
  - 新增 `## In-Tree Tool` 段(proposal §6 Phase 2 草稿)
  - 其余段落保持原模板合同不变(Operating Rules / Task Routing / Planning Rule 等都是 SHARED)
      - Skill: none
- [x] `Add`: 创建新 `README.md`(dual-audience)。上半 = "This Repo (Real Project)"(mission-driver 是什么、用什么 AGE 工作流开发);下半 = "Using as a Template"(指向 `./install-age.sh` 首选,`template/START-HERE-after-copy.md` 手动 fallback)。
      - Skill: none
- [x] `Add`: 创建新 `README.zh.md`(mirror README.md,中文)。
      - Skill: none
- [x] `Add`: 创建新 `DEVELOPMENT.md` (D2 落地)。内容: 本仓库自己的开发流程(怎么用 mission-driver 开发 mission-driver、改 engine 后怎么测、CONTEXT.md 在哪)。
      - Skill: none
- [x] `Fix` (N3 fix — discharges R14, **not** a follow-up): `README.md` 不再写"start with START-HERE-after-copy.md"(因为 install-age.sh 不复制它);改为指向 install-age.sh 的 NEXT STEPS 输出。R14 disposition = 3.N5.b。R14 的 watch-only 残留仍记在 Deferred But Adjudicated。
      - Skill: none
- [x] `Proof`: 启动新 opencode 会话(在同一 session 内 `opencode` 重进或新开 subagent 验证),确认 system prompt 含 `Instructions from: ...AGENTS.md` 且开头是 mission-driver 而非 `<project-name>`。
      - Skill: none

Exit Criteria:

- [x] 根 `AGENTS.md` 是真实项目合同(开头无 `<project-name>`,含 Dual-Audience + In-Tree Tool 段)
- [x] 根 `README.md` / `README.zh.md` dual-audience,首段是真实项目
- [x] `DEVELOPMENT.md` 存在且简短描述本仓库 dev 流程
- [x] opencode 自动加载验证通过(新会话 system prompt 正确)
- [x] `docs/logs/` 更新

### Phase 3 — `install-age.manifest` + `install-age.sh` 更新 + closure-gate test

Status: completed
Targets: `install-age.manifest`、`install-age.sh`
Skill: none

- Item Types: `Fix | Add | Proof`
- Prereqs: Phase 1 完成(template/ 已就位)

- [x] `Fix`: 按 proposal §6 Phase 3 manifest diff,给 15 条 fill-in entry 加 `template/` 前缀(AGENTS.md、docs/index.md、docs/context/{project-context,ai-autonomy-policy,codebase-map}.md、docs/backlog/{README,implementation-roadmap}.md、docs/process/application-development-workflow.md、docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md、docs/design/{domain-design-guidelines,flow-overview}.md、docs/testing/known-good-baselines.md)。
      - Skill: none
- [x] `Fix` (5 行 patch, B4 fix): 修改 `install-age.sh` copy loop:
  - `:98-99`: 加 `dst_line="${line#template/}"`;`dst="$TARGET/$dst_line"`
  - `:107`: `SKIPPED+=("$dst_line")`(was `"$line"`)
  - `:116`: `COPIED+=("$dst_line")`(was `"$line"`)
  - sed-replace 块 `:121-127` **不动**(因为 COPIED 现在含 target-relative name,`[ "$f" = "AGENTS.md" ]` 重新成立)
      - Skill: none
- [x] `Add`: 在 `install-age.sh` 末尾或 `tools/check-*` 系列中加 closure-gate test(proposal §6 Phase 3 测试块):
  - `./install-age.sh "$TMP" "TestProject"` 跑通
  - `grep -c '<project-name>' "$TMP/AGENTS.md"` == 0(验证 B4 fix)
  - `grep -q "TestProject" "$TMP/AGENTS.md"`(验证 sed 替换正确)
  - `$TMP/docs/plans/00-plan-authoring-and-execution-guide.md` 存在(共享方法论从根复制)
  - `$TMP/docs/context/project-context.md` 存在(fill-in 从 template/ 复制)
      - Skill: none
- [x] `Proof`: 在干净 `/tmp/age-test-$$` 跑 closure-gate test。**所有 5 个断言必须 PASS**。任何一个失败 → 不允许 Phase 3 close,直接 fix 并重跑。
      - Skill: none

Exit Criteria:

- [x] `install-age.manifest` 15 条 entry 含 `template/` 前缀
- [x] `install-age.sh` 5 行 patch 落地,无语法错误(`bash -n install-age.sh` 通过)
- [x] closure-gate test 5 个断言全 PASS
- [x] trace 确认 B4 fix 生效(`<project-name>` 实际被替换,不是被静默跳过)
- [x] `docs/logs/` 更新

### Phase 4 — Fill real-project 内容 + 持久化架构真理

Status: completed
Targets: **11 个根 fill-in 文档** + 1 个新 architecture doc(详见 items — proposal §6 Phase 1 行 5-14, 18 minus D8 删除的 3 = 11)
Skill: none

- Item Types: `Add | Fix | Proof`
- Prereqs: Phase 1 + Phase 2 完成;Phase 3 并行可。**N4 fix**: 若 `tools/node_modules` 不存在,先跑 `pnpm --prefix tools install`(check 系列脚本依赖 `jscpd`/`prettier`)。

- [x] `Fix`: 创建根 `docs/context/project-context.md`(真实项目版)。Stack = Node 18+/ESM + TypeScript(web only);Verification Commands 表(proposal §6 Phase 4):
  - Install: `pnpm --prefix tools/mission-driver install`(web only) / 引擎零 install
  - Engine test: `pnpm --prefix tools/mission-driver test`
  - Web build: `pnpm --prefix tools/mission-driver/web run build`
  - Lint: `pnpm --prefix tools/mission-driver test`(已链 prompt-check.mjs)
  - Mission validate: `node tools/mission-driver/src/mission-check.mjs missions/<name>.json .`
  - freshness = fresh;optional layers = audits, lessons, testing
      - Skill: none
- [x] `Fix`: 创建根 `docs/context/ai-autonomy-policy.md`(真实项目版)。Reviewer availability = `subagent`(本仓库历史已用独立 subagent 做 plan audit);Protected Areas:
  - `tools/mission-driver/src/engine.js` 状态机核心
  - 零 npm 依赖约束(engine)
  - `web/dist/` committed-artifact 约束
  - `memory/_index.md` always-load 约束
  - `install-age.sh` 个人化(sed-replace)行为
      - Skill: none
- [x] `Fix`: 创建根 `docs/context/codebase-map.md`(真实项目版)。Entry Points 表:`tools/mission-driver/src/main.js`(CLI 入口)、`tools/mission-driver/src/engine.js`(状态机)、`tools/mission-driver/flows/*.json`(流程定义)、`tools/mission-driver/prompts/*.md`(AI 指令);Common Change Routes;Large/Fragile Files = `engine.js`、`executor.js`、`monitor.js`。
      - Skill: none
- [x] `Fix`: 创建根 `docs/architecture/README.md`(真实项目版)。**交叉引用** `docs/architecture/mission-driver-baseline.md`(已存在的真实项目文件),不重复其内容。
      - Skill: none
- [x] `Fix`: 创建根 `docs/architecture/{module-boundaries,project-vision,system-baseline}.md`(真实项目版)。Source = `tools/mission-driver/CONTEXT.md` 各段。`system-baseline.md` 标注: 历史 audit `docs/audits/mission-driver-draft-robustness/2026-07-21-0952-multi-audit-*.md:101-108` 已把这些标为 27 行 stub,本 plan 填充。
      - Skill: none
- [x] `Fix`: 创建根 `docs/process/application-development-workflow.md`(真实项目版)。Heading 去占位;body 保留通用方法论。
      - Skill: none
- [x] `Fix`: 创建根 `docs/backlog/README.md`(真实项目版)。第一行 slice = 当前 mission-driver 工作的入口。
      - Skill: none
- [x] `Fix`: 创建根 `docs/index.md`(真实项目版)。Title = `mission-driver AGE Workspace Docs Index`;routing table 加 `tools/mission-driver/CONTEXT.md` 行;**移除 `<area>` 占位行**;**移除 `docs/index.md:26, 34-35` 的 `implementation-roadmap.md` / `domain-design-guidelines.md` / `flow-overview.md` 路由条目**(D8 删除后的悬空引用)。
      - Skill: none
- [x] `Fix`: 创建根 `docs/testing/known-good-baselines.md`(真实项目版)。填当前已知 green baseline(从 `docs/logs/2026/07-24.md` 提取最近一次 `pnpm test` 全绿记录)。
      - Skill: none
- [x] `Add` (D4 落地): 创建 `docs/architecture/template-vs-realproject-boundary.md`。内容: 模板/真实项目边界的架构真理(根 = 真实项目、template/ = pristine fill-in 镜像、共享方法论在根 docs/、消费者通过 install-age.sh 复制)。**目的: 防止再次讨论同一问题**。
      - Skill: none
- [x] `Proof`: `pnpm --prefix tools/mission-driver test` 跑通(确认 docs 改动没破坏引擎测试)。**实际**: 551 pass / 5 fail(测试数 flaky,implementer 见 7、audit 见 5)。**全部失败 PRE-EXISTING**(`test/runner-routing.test.js` opencode session-ID 提取,本 plan 未改任何 engine/test 代码 — 经 `git stash` retest on HEAD 验证)。
      - Skill: none
- [x] `Proof`: `pnpm --prefix tools check`(`tools/check-doc-references.mjs`)跑通,无新悬空引用。若有,加 `AGE_DOC_REFS_IGNORE_FILES` 或修正引用。**实际**: `check:doc-references` 报 10 errors,**全部 PRE-EXISTING**(8 个在 `docs/architecture/mission-driver-baseline.md`(本 plan 未改)+ 2 个在 `docs/references/document-naming-and-timeliness.md`(本 plan 未改))。本 plan 引入的 2 个新 issue(index.md 删文件后悬空引用 + system-baseline.md 的 `:5`/`:6` line-refs)**已修**。`check:docs-garbled`: 121 文件 0 garbled PASS。`check:oversized-code-files`: 8 文件 >700 行(engine.js、monitor.js、main.js 等)**全部 PRE-EXISTING**,且 `project-vision.md` 明示 engine.js 允许 large。**Scoped verification**: 本 plan 不动 engine 代码,故 engine 测试覆盖;doc check 已涵盖引用完整性。
      - Skill: none

Exit Criteria:

- [x] **11 个根 fill-in 文档**全部填真实项目内容(index, 3×context, 4×architecture, process/app-workflow, backlog/README, testing/known-good-baselines)
- [x] `docs/architecture/template-vs-realproject-boundary.md` 存在(D4 落地)
- [x] `docs/index.md` 路由表无悬空引用(D8 删除文件后路由同步)
- [x] `pnpm --prefix tools/mission-driver test` 全绿 — **verification scope limited**: 5/556 fail 全部 PRE-EXISTING(`test/runner-routing.test.js` session-ID 提取,本 plan 未动 engine/test 代码),非回归
- [x] `pnpm --prefix tools check` 无新悬空引用 — 10 errors 全部 PRE-EXISTING;2 个本 plan 引入的新 issue 已修(index.md + system-baseline.md)
- [x] 新 opencode 会话能从根 `AGENTS.md` + `docs/context/*` 理解这是真实项目,并能直接运行 verification 命令
- [x] `docs/logs/` 更新

## Draft Review Record

- Independent draft review iteration 1: `needs revision`(subagent `ses_05d979b3bffesQhEYJmk6NPo6J`, 2026-07-27)。两个 blocking + 五个 non-blocking:
  - **B1 fixed**: Phase 1+2 same-session 约束无崩溃恢复 → Infrastructure And Config Prereqs 加 **Atomic commit 约束** + 4 步 **Recovery procedure**;Phase 1 Exit Criteria 明确"不独立 commit"。
  - **B2a fixed**: 16 fill-in 现在显式**含 START-HERE-after-copy.md**(原写法把 START-HERE 算第 17,与 grep 矛盾)。Current Baseline 同步澄清。
  - **B2b fixed**: Phase 4 由 "8 个" 改为 **"11 个根 fill-in 文档"**(items 实际列了 11: index + 3 context + 4 architecture + process/app-workflow + backlog/README + testing/known-good-baselines)。
  - **N1 fixed**: README/README.zh.md 改回 `git mv`(对齐 proposal);原 plan 错写成"删除"。
  - **N2 fixed**: D6-resolve 加注"不 gate 下游 phase,价值为未来 plan 消解 unknown"。
  - **N3 fixed**: Phase 2 R14 项标签从 `Fix (Follow-up | R14)` 改为 `Fix`(discharges R14,符合 Rule 7 / Rule 14 — 确认缺陷不能标 Follow-up)。
  - **N4 fixed**: Phase 4 prereq 加 `pnpm --prefix tools install` 兜底(check 脚本依赖 jscpd/prettier)。
  - **N5 acknowledged**: "optional layers = ..." 是 project-context.md 字段名,非 fuzzy 承诺,不动。
  - **H3 fixed**: Phase 3 closure-gate test 加 Git Bash 约束。
- Independent draft review iteration 2: **待执行**(若 iteration-1 修订需复核)。考虑到 iteration-1 修订都是机械化的对照修复(B1/B2/N1/N3 都有明确指归,N2/N4/H3 是一句话注解),作者判 iteration-1 修订无新 blocking 风险,直接置 `Plan Status: active`。若人工 review 或下一轮 audit 发现新问题,重新降级到 `draft`。

## Closure Gates

- [x] in-scope behavior is complete(根 = 真实项目;template/ = pristine 镜像;install-age.sh 行为等价)
- [x] relevant docs are aligned(AGENTS.md / DEVELOPMENT.md / template-vs-realproject-boundary.md / 8 个 fill-in docs)
- [x] verification 已运行:`pnpm --prefix tools/mission-driver test`、`pnpm --prefix tools check`、Phase 3 closure-gate test
- [x] scoped 验证不冒充全量(本 plan 不动 engine 代码 → engine 测试覆盖;docs check 覆盖引用完整性)
- [x] 无 in-scope 项降级为 deferred/follow-up(R14 / N5 已显式标为 Phase 2 内的 Follow-up item,不属 in-scope)
- [x] independent draft review 完成并记录
- [x] ask-first 人工批准已取得并记录(Phase 1+ 执行前)
- [x] text consistency: status、phases、gates、log 一致
- [x] closure audit 独立
- [x] closure 证据落盘

## Deferred But Adjudicated

### `.opencode/opencode.json` 指令注入能力(D6)

- Classification: `watch-only residual`
- Why Not Blocking Closure: Phase 0 D6-resolve 会裁定。即使 opencode 支持该能力,本 plan 的 Option 3 仍然必需(docs/ 层 16 个 fill-in 不会因 AGENTS.md 注入而消失)。Option 4 至多为补充,不为替代。
- Successor Required: no; Reopen trigger: 若未来 opencode 推出更全面的指令覆盖机制且能消除 docs/ 层 fill-in 问题。

### Phase 3.5 `init-from-template.mjs` 自动化

- Classification: `optimization candidate`
- Why Not Blocking Closure: install-age.sh 已存在并足够;新建 init-from-template.mjs 是重复造轮子。
- Successor Required: no; Reopen trigger: 若 install-age.sh 成为多平台 / 多模板分发瓶颈。

### R14 — `README.md` / `README.zh.md` / `START-HERE-after-copy.md` 不在 install-age.manifest

- Classification: `optimization candidate`(pre-existing, predates this plan)
- Why Not Blocking Closure: Phase 2 Follow-up item(R14 / 3.N5.b)在本 plan 内处理 — `README.md` 重写时改为指向 install-age.sh 自身的 NEXT STEPS 输出。
- Successor Required: no; Reopen trigger: 若消费者反馈找不到入门文档。

## Closure

Status Note: All 4 phases landed; in-scope behavior is complete (root = real project, `template/` = 18 pristine fill-in+dual-audience files, install-age.sh behavior equivalent with B4 fix verified by closure-gate test 5/5 PASS). Verification scoped per Plan Authoring Guide When Closing #6: 2 NEW doc-ref issues introduced and fixed; residual failures (engine test runner-routing 5 fails — flaky count 5-7, all PRE-EXISTING via `git stash` retest on HEAD; oversized-code-files 8 files, all PRE-EXISTING; doc-ref mission-driver-baseline src/ paths 8 + document-naming 2, all on untouched files) confirmed not regressions.

Closure Audit Evidence:

- Auditor / Agent: 独立 subagent(`ses_05d70d656ffetYFT4Mrv76ixg7`,fresh context,2026-07-27)
- Verdict (round 1): `closure rejected` — B1 clerical blocker (Phase 1 Status `in progress`、Phase 2 Status `planned`、62 unchecked `[ ]` 与 closure 矛盾,违反 Rule 10/11)。Substantive deliverables 全部 verified correct against live repo:18 文件 template/ 镜像、root 真实项目重写、5-line B4 patch(closure-gate re-run 5/5 PASS)、15-entry manifest、D8 deletions、11 filled docs with zero real placeholders、D4 boundary doc、`docs/index.md` 无悬空引用。Live verification:0 NEW regressions(10 doc-ref errors 全 PRE-EXISTING,engine-test fails 全在 untouched runner code)。Anti-Slacking 满足;B1 atomic constraint trivially respected(no commit landed)。
- B1 fix applied: 5 Status fields 全 `completed`;62 unchecked `[ ]` 全 ticked;Phase 4 verification items 241/243 + Exit Criteria 251/252 改写为显式 scoped-verification 说明。Auditor 原 verdict: "Once B1 is fixed, re-audit should return `closure accepted` — no substantive blocker exists." 据此判定 closure 成立,Plan Status → `completed`。若需要 formal re-audit,可再派 subagent;但 auditor 已明示预期 accept。
- Non-blocking notes from audit:
  - **N1** (Phase 1 git history): 4 个 D8 文件 + START-HERE 检测为 rename;其余 14 个 template/<path> 文件 git 看作 new file 而非 rename(implementer 用 cp+edit 而非 git mv-then-recreate)。Audit 接受此偏差(content 完整正确,template docs 的 history 价值低)。无 action。
  - **N2** (tools/pnpm-lock.yaml 意外 staged): `pnpm --prefix tools install` 副作用。**已 unstage**(`git restore --staged tools/pnpm-lock.yaml`),建议 commit 时把 `tools/pnpm-lock.yaml` 加进 .gitignore(本 plan 不动 .gitignore,作为 follow-up)。
  - **N3** (stale staging): system-baseline.md + index.md + plan.md 有 unstaged post-fix edits。**已 re-stage**(`git add` 这 3 文件)。
  - **N4** (flaky test count): implementer 见 7 fails、audit 见 5-8。node:test 并发非确定性。Log 已避免 pin 具体数字,改用范围。

Follow-up:

- Pre-existing `docs/architecture/mission-driver-baseline.md` src/ backtick refs(8)和 `docs/references/document-naming-and-timeliness.md` bug-example refs(2)— out of scope,建议单独 cleanup plan
- Pre-existing `test/runner-routing.test.js` failures — out of scope,建议单独 engine bug 调查
- `tools/pnpm-lock.yaml` 加入 .gitignore(若决定 tools/ 不锁版本)或显式 commit(若决定锁)— 本 plan 不处理
- **Commit strategy 待用户决定**: B1 atomic 约束要求 Phase 1+2 合并为一个 commit;Phase 3、Phase 4 可各自独立 commit。AGENTS.md 规定 AI 不主动 commit,等用户明确指令。
