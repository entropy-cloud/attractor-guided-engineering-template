---
status: active
mission: multi-plugin-dsh
work-item: M2-WI3+WI4+WI5
group: "2026-08-28-0149"
verify: [test]
---

# 2026-08-28-0149-2 M2-WI3+WI4+WI5 plugin/dsh → plugin/nop-age 纯迁移 + 零回归验证 + 引用清查

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M2 WI3/WI4/WI5；设计 owner `docs/design/multi-plugin-dsh-architecture.md` §nop-age Plugin（经 `2026-08-28-0149-1` doc-audit 修正后的迁移面清单）
> Related: 前置 `2026-08-28-0149-1`（M1 doc-audit——本 plan 消费其迁移面清单、零 diff 语义裁定、技能名 carve-out）；后继 `2026-08-28-0149-3`（M3 manifest 声明 nop-age 路径）

## Current Baseline

- `plugin/dsh/` 为 live 单 bundle（package name `dsh-mission-control`，cordis 服务注册名 `mdcontrol`，isolate realm 键 `missionControl`），目录含 package.json / package-lock.json / cordis.patch.yml / scripts / src / test / assets / preset/age / tsconfig.json / node_modules（未跟踪）。`dsh` CLI 在场（/opt/homebrew/bin/dsh）。
- **bundle 内 `plugin/dsh` 自引用**（迁移时随目录走、需 token 更新）：`scripts/build-bundle.mjs:66/:262`、`scripts/e2e-demo.mjs:91` 及 e2e-preset / e2e-continuous / host-harness / verify-native / migrate-ledger 脚本、`preset/age/agent.cordis.yml:15`、test fixtures（e2e.cordis.yml / harness.cordis.yml / preset.cordis.yml / e2e-continuous.cordis.yml）与 test/*.test.mjs 内路径断言、`assets/src/law-*.mjs`（build-bundle 复制产物，随构建再生）。
- **bundle 外 live 功能引用**（`2026-08-28-0149-1` Current Baseline 偏差 1 全列，本 plan 一并更新）：`tools/mission-driver/src/law-rules.mjs:1391`（`LAW_PROTECTED_FAMILIES` prefix）+ :1367 注释、`tools/mission-driver/src/law-core.mjs:8` 注释、`missions/autonomy.policy.yml:124` gate match、`tools/mission-driver/test/law-policy.test.js:86` 断言、`verify-age.sh`（:10/:16/:42-46/:73 五处）、`.github/workflows/age-ci.yml:26/:36`、`missions/age-autonomy-implementation.json:25`（`verify-e2e` 命令）+ :4 描述句、`missions/dsh-plugin.json:4` 描述句、`.githooks/pre-commit:28` 注释。owner docs 路径面：`tools/mission-driver/CONTEXT.md` 14 处、`docs/process/dsh-plugin-development-guide.md` 7 处、`docs/architecture/dsh-plugin-packaging.md` 17 处、`docs/design/dsh-plugin-integration.md` 零字面命中。
- `install-age.sh` / `install-age.manifest` 零 `plugin/dsh` 引用（WI5 live 基线已零命中，本 plan 复测出证据）。
- **技能名 carve-out（M1 裁定）**：`mission-control-run/draft/analyze` 三个技能 ID、`/mdcontrol/api` HTTP 前缀、cordis 服务注册名 `mdcontrol` 迁移后**不变**（roadmap M5-WI17 验证面）；token 替换不得波及。
- **零 diff 语义（M1 裁定）**：引擎行为零 diff；`tools/mission-driver/` 允许且仅允许路径字面更新（law-rules.mjs prefix + 注释、law-core.mjs 注释、law-policy.test.js 断言三处）——`engine.js` / `flows/*.json` / 其余 src 零触碰，M2 收口以 `git diff --stat` 钉住。
- 前序 plans Deferred 已筛查（同 `2026-08-28-0149-1` baseline）：无重开触发命中，无收编项。

## Goals

- `plugin/dsh/` → `plugin/nop-age/` 迁移落地：git mv（历史保留）+ token map 全量替换，nop-age 在真宿主干净挂载（nopAge realm、service row `nop-age`）。
- 零回归：插件套件、引擎套件、`./verify-age.sh` L1+L2+L2.5、mission-check 全绿；引擎行为零 diff（路径字面三处除外）；`mdcontrol.*` 路由 / 技能 / `/mdcontrol/api` 行为不变。
- live 面零悬挂引用：迁移后 grep 收口零命中（历史工件除外）；install-age 双文件清查证据落档（WI5）。

## Non-Goals

- 不新增 `plugin/load-plugins.sh` / `plugin/plugin-manifest.yml`（M3 领地，plan `2026-08-28-0149-3`）。
- 不新建 `plugin/nop-route/`（M4 领地）。
- 不做 owner docs 结构性改写（「两 bundle 文档化 + §nop-route」留 M4/M5；本 plan 仅路径 / 包名 / realm 键零悬挂同步 + 状态头增量句）。
- 不改写历史工件（`docs/plans/`、`docs/analysis/`、`docs/discussions/`、`docs/logs/`、`docs/audits/` 既有行）。
- 不动 `tools/mission-driver/src/engine.js` 与 `flows/*.json`（引擎核心状态机保护面，零 diff 底线）。

## Task Route

- Type: `implementation-only change`（机械迁移 + 验证；设计已由 M1 doc-audit 钉死）
- Owner Docs: `docs/design/multi-plugin-dsh-architecture.md` §nop-age Plugin / §Behavioral Differences；`docs/architecture/dsh-plugin-packaging.md`（路径同步对象）
- Skill Selection Basis: 无项目专属 skill 匹配机械迁移；验证面由本 plan Proof 项承载——Skill: none

## Infrastructure And Config Prereqs

- `dsh` CLI（在场）；scratch profile 名固定 `nop-age-mig-audit`（验证后清理，不污染 `web` profile）。
- `plugin/nop-age/node_modules` 随目录物理移动；`verify-age.sh` 缺失时自动 `npm ci`（既有语义）。

## Phase 1 — 迁移执行（WI3）

Targets: `plugin/nop-age/`（自 `plugin/dsh/`）、`tools/mission-driver/src/{law-rules,law-core}.mjs`、`tools/mission-driver/test/law-policy.test.js`、`missions/autonomy.policy.yml`、`missions/{age-autonomy-implementation,dsh-plugin}.json`、`verify-age.sh`、`.github/workflows/age-ci.yml`、`.githooks/pre-commit`、owner docs 三份
Skill: none

- Item Types: `Decision | Add`
- Prereqs: `2026-08-28-0149-1` 收口（迁移面清单 / 零 diff 语义 / carve-out 三件在档）

- [x] Decision: **token map 钉死**（输入 = 迁移前全量 grep 清单实测）。基线 token 集（逐 live 文件核对后固化）：`dsh-mission-control` → `nop-age`（package.json / package-lock.json name、cordis.patch.yml service row name、src/service.ts mount log）；`missionControl` → `nopAge`（isolate 键）；`mdcontrol-service` → `nop-age-service`（config row id）；`mission-control` → `nop-age` **仅限 cordis.patch.yml insert row id 单点**（非全局——`mission-control-run/draft/analyze` 技能 ID carve-out，M1 裁定）；`plugin/dsh` → `plugin/nop-age`（全部 live 功能引用 + bundle 内自引用）。不变式：服务注册名 `mdcontrol`、`/mdcontrol/api` 前缀、preset 零服务行、技能三 ID 不变。备选（保留 `mission-control` row id）否决：设计成功判据 4 要求 dump 无 missionControl 族残留、`grep -i nop-age` 可检。残险：package-lock.json name 行手改后须 `npm ci --prefix plugin/nop-age` 验证 lockfile 完整性。
- [x] Add: `git mv plugin/dsh plugin/nop-age`（目录整体移动，git 历史保留 rename 谱系；node_modules 未跟踪面随物理移动）。
- [x] Add: bundle 内 token 替换——package.json / package-lock.json、cordis.patch.yml（isolate 键 / service row / config row id / insert row id + 头注示例路径）、src/service.ts mount log、preset/age/（agent.cordis.yml 注释、preset.yml 增新包名 tag 行）、scripts/*（注释与报错串）、test/fixtures/*.cordis.yml 与 test/*.test.mjs 内路径、其余 src 内自引用字符串（grep 清单为准）。
- [x] Add: bundle 外功能引用更新——`law-rules.mjs:1391` prefix + :1367 注释、`law-core.mjs:8` 注释、`missions/autonomy.policy.yml:124` gate match（P8 保护路径：本 plan active 期正文已具名该路径，approved-project leg 承载写入）、`test/law-policy.test.js:86` 断言、`verify-age.sh` 五处、`.github/workflows/age-ci.yml:26/:36`、`missions/age-autonomy-implementation.json:25` 命令 + 两 mission 描述句路径、`.githooks/pre-commit:28` 注释。
- [x] Add: owner docs 路径 / 命名零悬挂同步——`tools/mission-driver/CONTEXT.md`（14 处）、`docs/process/dsh-plugin-development-guide.md`（7 处）、`docs/architecture/dsh-plugin-packaging.md`（17 处）：`plugin/dsh`→`plugin/nop-age`、`dsh-mission-control`→`nop-age`、`missionControl`→`nopAge` 同构替换 + 各文档状态头一行增量句（迁移指针本 plan）；结构性改写不在本 slice。
- [x] Proof: 迁移后 grep 收口——live 面（plugin/nop-age + bundle 外引用面 + owner docs + 根级 sh/yml/json）`grep -rn "plugin/dsh"` 零命中；`dsh-mission-control` / `mdcontrol-service` / isolate `missionControl` 同法零命中；`mission-control` 残留命中仅为技能三 ID + 其历史注记（逐条列出对照 carve-out）；历史工件（docs/plans/、docs/analysis/、docs/discussions/、docs/logs/、docs/audits/）零改写（`git diff --stat` 佐证）。`npm run build --prefix plugin/nop-age` 后 assets/ content-equal（复制通道再生一致）。

Exit Criteria:

- [x] `plugin/nop-age/` 在库、`plugin/dsh/` 不存在、git rename 谱系可查（`git log --follow` 抽查一文件）
- [x] token map 全量落地 + carve-out 保持（技能三 ID / `mdcontrol` / `/mdcontrol/api` 原名在库）
- [x] grep 收口零命中证据在案（含 carve-out 允许集逐条对照）

## Phase 2 — 零回归验证（WI4 + WI5）

Targets: 验证命令面（零新增文件）；证据落 `docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 1

- [x] Proof: 插件套件 `npm --prefix plugin/nop-age test` 绿（check-manifest + 全量 unit + `tsc --noEmit` + build-bundle --check + smoke-import）。
- [x] Proof: 引擎套件 `pnpm --prefix tools/mission-driver test` 绿（含更新后 law-policy.test.js 断言；计数对照迁移前基线只增不减——迁移前先跑一次记录基线数）。
- [x] Proof: `./verify-age.sh` L1+L2+L2.5 全绿（L2 走新路径 `plugin/nop-age`，真值表 `plugin/nop-age/test/law-truth-table.test.mjs`）。
- [x] Proof: mission-check 全量——`node tools/mission-driver/src/mission-check.mjs missions/<name>.json .` 对全部 mission 配置 exit 0（含 verify-e2e 命令已更新的 age-autonomy-implementation）。
- [x] Proof: **真宿主挂载冒烟**——scratch profile：`dsh plugin --profile nop-age-mig-audit add "link:$PWD/plugin/nop-age"` → `dsh web --no-open --profile nop-age-mig-audit` 起宿主 → `--dump-config`：`grep -i nop-age` 命中 service row（nopAge isolate realm）；`mdcontrol` 服务注册名在场；`grep -i mission-control` 命中仅为技能三 ID（carve-out 允许集）；验证毕 `dsh plugin --profile nop-age-mig-audit remove` 清理。
- [x] Proof: 引擎零 diff 钉住——`git diff --stat tools/mission-driver/src/engine.js tools/mission-driver/flows/` 为空；`tools/mission-driver/` 全部 diff 恰为路径字面三处（law-rules.mjs / law-core.mjs / law-policy.test.js，M1 裁定边界）。
- [x] Proof: e2e 真宿主腿（环境变量齐备时执行 `npm --prefix plugin/nop-age run verify:e2e`；缺失时按脚本既有 fail-fast 括号语义如实记录 verification scope limited + 残险评估——不冒充全绿）。
- [x] Add: **WI5 清查证据**——`grep -rn "plugin/dsh" install-age.sh install-age.manifest` 零命中输出落 log（live 基线即零，证据化收口；install-age 双文件零改动）。

Exit Criteria:

- [x] 全部 Proof 命令 pass（或 e2e 腿按括号语义如实留档）；迁移前后引擎 / 插件套件计数对照在 log
- [x] `mdcontrol.*` 路由与技能行为不变（插件套件 + 真宿主 dump 双面证据）
- [x] WI5 零命中证据在册

## Phase 3 — roadmap / 文档回写

Targets: `docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Add | Proof`
- Prereqs: Phase 2

- [x] Add: roadmap WI3 / WI4 / WI5 行 `[ ]`→`[x]` + 行内尾部证据注记（token map 指针、套件计数对照、grep 收口、真宿主 dump 摘录、install-age 零命中）；`> Last Updated` 头同步。
- [x] Proof: `grep -c "^- \[ \]" docs/backlog/multi-plugin-dsh-roadmap.md` = 13 实测；`node tools/mission-driver/src/roadmap-check.mjs docs/backlog/multi-plugin-dsh-roadmap.md` exit 0。
- [x] Add: `docs/logs/2026/08-28.md` 收口条目（三 Phase）。

Exit Criteria:

- [x] WI3/WI4/WI5 `[x]` + 行内证据在册；grep = 13 与 roadmap-check exit 0 实测
- [x] `docs/logs/` 收口条目在案

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-0149-2-m2-wi3-wi4-wi5-nop-age-migration-1-55abedce to ses_opencode_review
- 2026-08-28：iteration 1，共识 acceptable-as-is #review-2026-08-28-104553-mission-driver-2026-08-28-0149-2-m2-wi3-wi4-wi5-nop-age-migration-1-55abedce

## Verification

- pass test gate-check-20260828T040614 basisHash=496a16cdbccffc4d9c8884a09a1ce16cc270dff091f68bb0c5a06122b8255dba exit=0
- pass test build-verify-2026-08-28-104553 basisHash=496a16cdbccffc4d9c8884a09a1ce16cc270dff091f68bb0c5a06122b8255dba exit=0

## Closure

- dispatch audit #audit-2026-08-28-104553-mission-driver-2026-08-28-0149-2-m2-wi3-wi4-wi5-nop-age-migration-1-be441ad2 to ses_opencode_audit models={exec:glm-5.2,aud:glm-5.2}
- accepted #audit-2026-08-28-104553-mission-driver-2026-08-28-0149-2-m2-wi3-wi4-wi5-nop-age-migration-1-be441ad2：独立闭合审计通过——迁移真落地（git index 105×R100 + src/service.ts RM rename 谱系在库、plugin/dsh 不存在）、live 面 grep 收口仅余 missions/multi-plugin-dsh.json:4 任务域陈述句（log 裁定在案、非悬挂功能引用）、carve-out 保持（law-policy 断言随套件绿）、引擎零 diff 实测（`git diff --stat HEAD -- tools/mission-driver/src/engine.js tools/mission-driver/flows/` 为空；tools diff 恰 law 三模块 + CONTEXT.md）、roadmap WI3/WI4/WI5 [x] + `grep -c "^- \[ \]"` = 13、docs/logs/2026/08-28.md 收口条目在档；机械验证现跑 `node tools/mission-driver/src/gate-check.mjs <plan> --verify` → `pnpm --prefix tools/mission-driver test` **987/987 pass · 0 fail** + prompt-check OK，exit 0，basisHash 496a16cd…55dba 现算与 `## Verification` pass 行一致（单模型诚实降级：exec 与 aud 同为 glm-5.2）。

## Deferred But Adjudicated

### owner docs 结构性改写（两 bundle 文档化 + §nop-route 段）

- Classification: `out-of-scope improvement`
- Why Not Blocking Closure: 目标态（nop-route 在库）未落地前，结构性改写会预写不存在的 as-built；本 plan 仅做零悬挂路径同步。
- Successor Required: yes（M4-WI15 挂载面 + M5-WI18 收口同步承担）
- 重开触发：nop-route bundle 落地（M4-WI9 起）。
