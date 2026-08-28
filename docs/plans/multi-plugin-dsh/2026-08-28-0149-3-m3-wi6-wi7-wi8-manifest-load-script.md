---
status: active
mission: multi-plugin-dsh
work-item: M3-WI6+WI7+WI8
group: "2026-08-28-0149"
verify: [test]
---

# 2026-08-28-0149-3 M3-WI6+WI7+WI8 plugin-manifest.yml + load-plugins.sh 统一启动器 + 双层验证

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M3 WI6/WI7/WI8；设计 owner `docs/design/multi-plugin-dsh-architecture.md` §Plugin Manifest / §Load Script（分期裁定经 `2026-08-28-0149-1` 修正：M3 manifest 仅声明 nop-age）
> Related: 前置 `2026-08-28-0149-2`（M2 迁移——本 plan 的 manifest 声明 `./nop-age`，须目录先在库）；后继 M4（nop-route 落地后 manifest 增补 nop-route 条目，M1 分期裁定）

## Current Baseline

- `plugin/` 目录现状：仅 `nop-age/`（M2 迁移后）——`plugin/load-plugins.sh` 与 `plugin/plugin-manifest.yml` 均不存在；`plugin/` 根无自有 package.json / 测试入口。
- 现行挂载方式 = 手工逐条 `dsh plugin --profile web add "link:$PWD/plugin/nop-age"`（cordis.patch.yml 头注与 dev guide 记载）；`dsh` CLI 在场（/opt/homebrew/bin/dsh），`python3` 在场（/opt/homebrew/bin/python3），**shellcheck 不在场**（`which shellcheck` 零命中——本 plan 基础设施前置项）。
- YAML 校验双降级依赖面：python3 标准面无 PyYAML 保底（`import yaml` 是否可用须实测）；Node 面经 nop-age pinned devDep `yaml`（package.json devDependencies 在库，`node_modules` 随 M2 迁移在 `plugin/nop-age/node_modules`）。
- `verify-age.sh` L2 链现状 = `npm --prefix plugin/nop-age test` + 真值表独立调用（M2 后路径）；L2.5 = policy / corpus / 真值表三面。CI（age-ci.yml）单 job 同构跑 verify-age.sh。
- 真值表 / 确定性测试先例：引擎与插件套件均 `node --test`；stub 注入先例 = e2e 脚本的 fail-fast 语义与 host-harness 环境腿（真宿主腿与确定性腿分离——本 plan 沿用该分层）。
- 前序 plans Deferred 筛查同 `2026-08-28-0149-1`：无重开触发命中，无收编项。

## Goals

- `plugin/plugin-manifest.yml` 落档：schema:1 / profile 默认值 / plugins[] 有序声明（M3 仅 nop-age）/ `${VAR}` 占位符语义成文且被预检执法。
- `plugin/load-plugins.sh` POSIX sh 落地：7 flag 全量、YAML 校验 Python/Node 双降级、幂等重挂、strict/dry-run 语义、挂载摘要表；`sh -n` 零错 + 零 bashism + shellcheck 干净。
- 双层验证（WI8）：确定性 stub 测试（不依赖真宿主）+ 真宿主腿（dry-run / 真挂载 / unmount-all 重挂一致 / strict fail-fast）；确定性腿接入 verify-age.sh L2（CI 同构）。
- roadmap WI6/WI7/WI8 勾选回写。

## Non-Goals

- 不新建 `plugin/nop-route/` 或在 manifest 声明 nop-route（M1 分期裁定：nop-route 条目随 M4-WI15 落地增补）。
- 不实现外部源加载（npm/git 插件市场——设计 Non-Goal）。
- 不实现插件自动发现（manifest 显式声明是设计裁定，避免误激活在制工作）。
- 不改 `plugin/nop-age/` bundle 本体（挂载面零侵入；nop-age 自身代码零 diff）。
- 不动引擎核心（`tools/mission-driver/src/engine.js`、`flows/*.json` 零触碰；verify-age.sh L2 链增腿是仓库级脚本面）。

## Task Route

- Type: `implementation-only change`（launcher 交付；manifest/load script 形态已由设计文档 + M1 doc-audit 钉死）
- Owner Docs: `docs/design/multi-plugin-dsh-architecture.md` §Plugin Manifest / §Load Script / §User Experience；`docs/process/dsh-plugin-development-guide.md`（用法段增补对象）
- Skill Selection Basis: 无项目专属 skill 匹配 POSIX sh 交付；验证分层方法由本 plan Proof 项承载——Skill: none

## Infrastructure And Config Prereqs

- `dsh` CLI（在场）；scratch profile 名固定 `nop-load-audit`（真宿主腿专用，验证毕清理）。
- shellcheck 前置安装：`brew install shellcheck`（版本号落 log；WI8 验证命令依赖）。
- PyYAML 可用性实测：`python3 -c "import yaml"` ——不可用时 Node 降级分支为唯一路径（双降级顺序仍按设计：python3 优先，检测失败转 Node）。

## Phase 1 — plugin-manifest.yml 落档（WI6）

Targets: `plugin/plugin-manifest.yml`
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: `2026-08-28-0149-2` 收口（`plugin/nop-age/` 在库）

- [x] Decision: **manifest 内容钉死**——顶层键白名单 `schema` / `profile` / `plugins`（未知顶层键 fail-fast，预检执法）；per-plugin 键 `name` / `path` / `realm` / `config`；M3 条目集 = 恰 `nop-age` 一条（`path: ./nop-age`、`realm: nopAge`、config 对齐 live bundle patch：`assetsDir: ./assets` + `supervisor.projectRoot: ${PROJECT_ROOT}` + `continuous: false`）；`${VAR}` 替换语义 = 环境变量已定义则替换、未定义即预检报错退出。备选（未定义变量静默替换为空串）否决：`supervisor.projectRoot` 会指向错误位置且无诊断；备选（声明 nop-route 占位条目）否决：M1 分期裁定——预检存在性断言对占位条目必红。残险：config 块与 bundle patch config 漂移——预检仅校验存在性，config 一致性由 Phase 3 真挂载 dump 对照钉住。
- [x] Add: `plugin/plugin-manifest.yml` 落档（Decision 固化内容 + 文件头注释指向设计文档与分期裁定）。
- [x] Proof: YAML 语法双通道验证——`python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" plugin/plugin-manifest.yml`（或 PyYAML 缺席时 Node 通道 `node -e` 经 `plugin/nop-age/node_modules/yaml`）exit 0。（实测：python3 通道 exit 0；node 通道 `require("yaml").parse` 亦解析通过——双通道均绿，2026-08-28）

Exit Criteria:

- [x] manifest 在库且通过双通道之一语法验证；键集与 Decision 零漂移
- [x] 设计文档 §Plugin Manifest 与落档文件一致（分期注记在档）

## Phase 2 — load-plugins.sh 实现 + 确定性测试（WI7）

Targets: `plugin/load-plugins.sh`、`plugin/test/load-plugins.test.mjs`、`verify-age.sh`（L2 链）
Skill: none

- Item Types: `Decision | Add | Proof`
- Prereqs: Phase 1

- [x] Add: `plugin/load-plugins.sh`——shebang `#!/bin/sh`、`set -u` 姿态；7 flag：`--profile <name>`（覆盖 manifest `profile:`）、`--manifest <path>`（默认 `plugin/plugin-manifest.yml`）、`--no-start`（只挂不启）、`--dry-run`（打印计划 `dsh plugin add` 命令序列零执行）、`--strict`（首败即停；默认继续 + 结束非零退出）、`--skip <name>`（可重复）、`--unmount-all`（manifest 条目逐个 remove，幂等基线重置）；预检 = YAML 语法（python3 优先、缺席转 `node -e` 经 nop-age pinned devDep `yaml`——两探测分支成文于脚本头注）+ 未知顶层键拒绝 + `${VAR}` 替换与未定义变量报错 + 逐条目 path 存在且含 `cordis.patch.yml` 断言；挂载 = `dsh plugin --profile "$P" list` 幂等查重后 `add "link:$ABS_PATH"`；启动 = `dsh web --no-open --profile "$P"`（`--no-start` 跳过）；结束打印挂载摘要表（mounted / failed / already-present / skipped 四类计数与清单）；退出码 = 全成功 0、任一失败非零。（as-built 注：设计文本的启动字面 `dsh web --no-open --profile <p>` 非 CLI 合法形——`web` 子命令即 `--profile web` 别名且拒父级 `--profile`；落档为 web profile → `dsh web --no-open`、他 profile → `dsh --profile <p>`，注记在脚本内与设计文档 as-built 段）
- [x] Decision: **确定性测试挂点** = `plugin/test/load-plugins.test.mjs`（`node --test`，PATH 注入 stub `dsh` 断言命令序列与环境探针，零真宿主依赖）+ `verify-age.sh` L2 链增腿 `node --test plugin/test/load-plugins.test.mjs`（CI 同构；真宿主腿不进 L2——环境耦合留 Phase 3 独立证据）。备选（测试入 nop-age test 套件）否决：loader 是 plugin/ 家族面，不是 nop-age bundle 面；备选（仅真宿主手工验证）否决：WI7 语义回归（flag 组合 / 幂等 / strict）无确定性门。
- [x] Add: `plugin/test/load-plugins.test.mjs` 落地——≥12 例：挂载顺序按 manifest 序 / 幂等在场 skip / dry-run 零执行仅打印 / strict 首败中止 / 默认继续且退出非零 / `--skip` 多值累积 / `--unmount-all` remove 序列 / 未知顶层键 deny / 条目 path 缺失 deny / `${VAR}` 替换与未定义变量 deny / python3 与 node 双探测分支 / 摘要表输出形状。（实落 18 例——上述 12 面另加：cordis.patch.yml 缺失 deny、node 通道校验失败传播、malformed YAML deny、`--no-start` 与两式启动命令形状；全绿）
- [x] Proof: `sh -n plugin/load-plugins.sh` 零语法错；零 bashism 核对（仅 POSIX 内建与工具集：`printf`/`grep`/`sed`/`test`/`while`/`case`，无 `[[`/`local` 数组/`function` 关键字/bash 专用参数展开——逐项清单落 log）；`node --test plugin/test/load-plugins.test.mjs` 全绿。（实测：sh -n exit 0；bashism 审计 grep 命中均为 POSIX 反字符类 `[![:space:]]` 与 fd 重定向误报，无真 bashism；18/18 pass）

Exit Criteria:

- [x] 7 flag + 预检四断言 + 幂等 + 退出语义全部在脚本与测试双面落地
- [x] stub 测试 ≥12 例全绿；`sh -n` 零错；bashism 清单在 log
- [x] verify-age.sh L2 增腿后 `./verify-age.sh` L1+L2+L2.5 全绿（实测 987/987 + 423/423 + 18/18 + policy/corpus/真值表全过，2026-08-28）

## Phase 3 — 真宿主验证（WI8）

Targets: 验证证据面（scratch profile `nop-load-audit`）；证据落 `docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Proof`
- Prereqs: Phase 2；shellcheck 前置安装完成

- [x] Proof: shellcheck 干净——`brew install shellcheck` 后 `shellcheck plugin/load-plugins.sh` 零告警（版本号落 log）。（shellcheck 0.11.0，exit 0 零输出；修幅：SC2034 未用变量移除、SC2046/SC2016 有意为之项 disable 注记、SC2154 eval 隐式赋值前显式置空）
- [x] Proof: 真宿主 dry-run——`./plugin/load-plugins.sh --dry-run` 输出计划命令序列且零执行（输出与 stub 断言的命令形状一致）。（需 PROJECT_ROOT 在环境——未定义时实测报 `undefined variable ${PROJECT_ROOT}` 退出非零，正是 Decision 语义；输出 `plan: dsh plugin --profile web add "link:…/plugin/nop-age"` 与 stub 断言形状一致）
- [x] Proof: 真挂载——`./plugin/load-plugins.sh --no-start --profile nop-load-audit` 后 `dsh web --no-open --profile nop-load-audit` 起宿主，`--dump-config | grep nop-` 命中 nop-age（nopAge realm）；重复执行第二次 = 全 already-present（幂等重挂）。（挂载 + dump + 幂等三面全绿：dump L314-323 `# == nop-age` / `isolate: { nopAge: true }` / `id: nop-age-service`；二次执行 already-present: 1。起宿主面如基线预期命中 M2 残险：设计字面 `dsh web --no-open --profile <p>` 为非法 CLI 形〔web 子命令即 --profile web 别名、拒父级 --profile，实测 unknown option〕，as-built 启动形 `dsh --profile nop-load-audit` 则命中 M2-WI4 留档的 bundle 无 main/exports import 缺口〔`Cannot find package …/node_modules/nop-age/index.js`〕——本 plan Non-Goal 禁改 bundle，缺口按 M2 裁定需独立后继项补包入口，证据落 log）
- [x] Proof: unmount-all 重挂一致——`./plugin/load-plugins.sh --profile nop-load-audit --unmount-all` 后重跑挂载，`--dump-config` 端态与首挂一致（设计成功判据 5 的单插件版；双插件联合面归 M5-WI17）。（unmount-all removed: 1 → 重挂 mounted: 1 → 两次 dump `diff` 为空，端态一致）
- [x] Proof: strict fail-fast 实测——临时 manifest（mktemp，含一条不存在 path 的条目）→ `--manifest <临时> --strict` 首条失败即中止、退出非零、后续条目零执行；临时文件用后删除。（两条不存在 path 条目：错误仅报首条 nop-a、exit 1、profile 零变更即零 add 执行；临时文件已删）

Exit Criteria:

- [x] shellcheck / dry-run / 真挂载 / 幂等 / unmount-all 一致 / strict fail-fast 六面证据在 log
- [x] scratch profile 清理干净（`dsh plugin --profile nop-load-audit list` 空）（list 空输出 exit 0 + profile 目录删除，`web` profile 未触碰）

## Phase 4 — 文档 + roadmap 回写

Targets: `docs/process/dsh-plugin-development-guide.md`、`docs/design/multi-plugin-dsh-architecture.md`（as-built 注记）、`docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 3

- [x] Add: dev guide 增 `load-plugins.sh` 用法段（一键挂载 / flag 表 / 手工 `dsh plugin add` 保留为备选路径）；设计文档 §Load Script 增 as-built 注记（测试挂点 + L2 接线 + shellcheck 前置）。（另同步：设计文档 §User Experience 增 PROJECT_ROOT export 前置、Status 头落地态刷新〔M1-M3 landed，消除「Nothing implemented yet」过期句〕、Changelog M3 条）
- [x] Add: roadmap WI6 / WI7 / WI8 行 `[ ]`→`[x]` + 行内尾部证据注记（manifest 落档指针、脚本 + 测试计数、六面真宿主证据摘要）；`> Last Updated` 头同步。
- [x] Proof: `grep -c "^- \[ \]" docs/backlog/multi-plugin-dsh-roadmap.md` = 10 实测；`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/multi-plugin-dsh-roadmap.md` exit 0。（10 实测命中 + passed: true / fieldErrors 空）
- [x] Add: `docs/logs/2026/08-28.md` 收口条目（四 Phase）。（含 bashism 逐项清单、shellcheck 版本、六面证据、起宿主腿两处 as-built 偏差与 import 缺口后继项、CI 触发面残险注记）

Exit Criteria:

- [x] WI6/WI7/WI8 `[x]` + 行内证据在册；grep = 10 与 roadmap-check exit 0 实测
- [x] dev guide / 设计文档 as-built 增量在库；`docs/logs/` 收口条目在案

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-0149-3-m3-wi6-wi7-wi8-manifest-load-script-1-6d3c8137 to ses_opencode_review
- 2026-08-28：iteration 1，共识 acceptable-as-is #review-2026-08-28-104553-mission-driver-2026-08-28-0149-3-m3-wi6-wi7-wi8-manifest-load-script-1-6d3c8137

## Verification

- pass test 2026-08-28-104553-mission-driver basisHash=be6723f9a9fcd29560219c2a0bea94873dd7b591b64ef2f9d775f4a1f7dd797b exit=0

## Closure

- dispatch audit #audit-2026-08-28-104553-mission-driver-2026-08-28-0149-3-m3-wi6-wi7-wi8-manifest-load-script-1-8688d844 to ses_opencode_audit models={exec:zhipuai/glm-5.2,aud:zhipuai/glm-5.2}
- accepted #audit-2026-08-28-104553-mission-driver-2026-08-28-0149-3-m3-wi6-wi7-wi8-manifest-load-script-1-8688d844：独立收口审计通过——25/25 项与库内证据逐面对账一致（`plugin/plugin-manifest.yml` 落档内容 = Phase 1 Decision 零漂移；`plugin/load-plugins.sh` `sh -n` 零错；`node --test plugin/test/load-plugins.test.mjs` 18/18 pass；`verify-age.sh` L52 L2 增腿在库；roadmap WI6/WI7/WI8 `[x]` + 行内证据 + Last Updated 头；dev guide §Unified Launcher + 设计文档 as-built 注记 + `docs/logs/2026/08-28.md` 四 Phase 收口条目均在库）；机械验证 `pnpm --prefix tools/mission-driver test` 987/987 fail 0 + prompt-check OK exit 0（2026-08-28 复跑实测）；Deferred 项（nop-route 条目增补）为 M1 分期裁定的 watch-only residual，无在库缺陷隐瞒；models lineage = 单模型部署诚实注记（policy 02 §4.9 `downgrade: single-model`，exec 与 aud 同为 zhipuai/glm-5.2）

## Deferred But Adjudicated

### manifest 的 nop-route 条目增补

- Classification: `watch-only residual`（M1 分期裁定的执行面）
- Why Not Blocking Closure: M3 预检存在性断言要求条目 path 在库；nop-route 至 M4 才存在，占位条目必红。
- Successor Required: yes（M4-WI15 挂载面 plan 增补条目并复跑本 plan Phase 3 真宿主四腿）
- 重开触发：`plugin/nop-route/` 目录在库（M4-WI9 起）。
