---
status: active
mission: multi-plugin-dsh
work-item: M5-WI17
group: "2026-08-28-1540"
verify: [test]
---

# 2026-08-28-1540-1 M5-WI17 双插件联合挂载验证：load-plugins.sh 一键双挂 + dump 双 realm 断言 + AGE preset 零服务行 + mdcontrol 唯一挂载

> Source: `docs/backlog/multi-plugin-dsh-roadmap.md` M5 WI17 + Dependencies & Notes（M5 关键面 = dump grep 输出 + AGE preset 零服务行 + `mission-control-*` 三技能完好）
> Related: 前置 `2026-08-28-1312-3`（M4-WI16 收口——本 plan 基线的最近全门 GREEN 章所在）；`2026-08-28-1312-2`（M4-WI13–WI15——dual manifest 四腿证据先例）；`2026-08-28-0149-3`（M3——load-plugins.sh 形态与 as-built CLI 合法形）；后继 `2026-08-28-1540-2`（M5-WI18 全门收口 + M5 回写）

## Current Baseline

- 对象面（M4 收口后在库）：`plugin/nop-age/` + `plugin/nop-route/` 双 bundle、`plugin/plugin-manifest.yml` 双条目（config 块镜像各 bundle patch service-row config）、`plugin/load-plugins.sh` 启动器（7 flag + 预检 + 幂等）。
- 联合挂载先例证据（`2026-08-28-1312-2` Phase 3 真宿主四腿，scratch profile `nop-route-audit`）：dry-run 双 add 计划零执行 / 双 realm dump 并存零漂移（`# == nop-age` `isolate: { nopAge: true }` + `# == nop-route` `isolate: { nopRoute: true }` / `id: nop-route-service` / config 三元组）/ 二次执行全 already-present / unmount-all→重挂 dump diff 为空 + profile 清理。**但该证据的收口归属是 M4-WI15 挂载面**——WI17 要求的联合断言记录（一条 dump 同时显两插件、mdcontrol 与 noproute 分 realm、AGE preset 仍零服务行、mdcontrol 唯一挂载、三技能完好）尚无独立成册的验证记录。
- CLI 形（M3-WI8 as-built，dev guide §as-built 注记在册）：roadmap WI17 行的字面命令 `dsh web --dump-config` 为**非法 CLI 形**（`dsh web` 子命令 = `--profile web` 别名，拒父级 `--profile`）；合法 dump 形 = `dsh --profile <p> --dump-config`。本 plan 用 scratch profile 执行（M3/M4 审计纪律：`web` profile 不触碰）。
- AGE preset 面（在库确定性面）：`plugin/nop-age/test/age-preset.test.mjs` D3 门（preset 零服务行——随 L2 nop-age 套件跑）；组合腿 `npm --prefix plugin/nop-age run verify:e2e:preset`（in-process：roster + service 同树）。三技能 ID `mission-control-run/draft/analyze` 结构面由 nop-age 套件（mdcontrol-skills 测试）钉住，preset e2e 覆盖 roster 面。
- 已知边界（维持原裁定，非本 plan 回收）：真宿主 boot 腿受两 bundle 无 `main`/`exports` 包入口缺口限制（M2-WI4 留档独立后继项，重开触发 = 包入口后继项收口——未命中）；dump / mount 面不受该缺口影响（M3-WI8、1312-2 先例）。
- 前序 plans Deferred 筛查：`2026-08-28-1312-2` §Deferred「owner docs 完整两 bundle 结构性改写」重开触发 = WI17 四腿 + WI18 全门收口完成——收编归 M5-WI18（`2026-08-28-1540-2`），非本 plan；`2026-08-28-1312-3` §Deferred 两项（HTTP dispatcher 真运行时面、真宿主 boot 腿）触发均未命中。无本 plan 须收编项。

## Goals

- 一份独立成册的**联合挂载验证记录**（fresh scratch profile `nop-joint-audit`）：`./plugin/load-plugins.sh --no-start --profile nop-joint-audit` 一键双挂 nop-age + nop-route；`dsh --profile nop-joint-audit --dump-config | grep nop-` 一条 dump 同时命中两插件段；`nopAge` / `nopRoute` 两 isolate realm 并存且 config 零漂移；二次执行幂等；unmount-all→重挂 dump diff 为空；验毕清理（list 空 + profile 目录删除，`web` profile 未触碰）。
- 联合面完整性断言：mdcontrol 唯一挂载（dump 中 mdcontrol 发布服务行恰一条——nop-age 侧；nop-route 只注册 `noproute`，零第二个 mdcontrol；零 `missionControl` 残留）；AGE preset 仍零服务行（D3 结构门 + preset 组合腿）；`mission-control-run/draft/analyze` 三技能完好。
- 零 diff 纪律自证：本 plan 为纯验证面——引擎树 / 两 bundle / launcher / manifest 零改动（`git diff --stat` 空自证）。
- roadmap WI17 `[x]` + 行内证据注记 + `> Last Updated` 头同步。

## Non-Goals

- 不改任何 bundle / launcher / manifest / 引擎代码（纯验证面；联合面若暴露缺陷，回所属模块修复 + log 记录，不在本 plan 就地打补丁绕过）。
- 不做真宿主 boot 腿（包入口缺口 = 独立后继项维持原裁定；dump 面不受影响）。
- 不复跑 runtime e2e（`verify:e2e` 两腿的收口显式复跑归 M5-WI18——`2026-08-28-1312-3` Decision 残险补偿的收编归属）。
- 不做 owner docs 完整结构性改写（`2026-08-28-1312-2` §Deferred 归 M5-WI18）。
- 不宣布 mission 完成（引擎按 audit 轮数裁定）。

## Task Route

- Type: `verification or audit work`（WI17 本质 = M5 验证面；交付物是联合挂载验证记录 + roadmap 回写）
- Owner Docs: `docs/design/multi-plugin-dsh-architecture.md` §Success Criteria 6（AGE preset 零服务行 + 三技能）+ §Interaction with Existing AGE preset；`docs/process/dsh-plugin-development-guide.md` §Unified Launcher as-built；`docs/architecture/dsh-plugin-packaging.md` §AGE Preset
- Skill Selection Basis: 无项目专属 skill 匹配（repo 无 docs/skills 项目面）；联合挂载验证方法承 M3-WI8 / 1312-2 四腿先例——Skill: none

## Infrastructure And Config Prereqs

- `dsh` CLI + `python3` 在场（M3 实测沿用）；scratch profile 名固定 `nop-joint-audit`（联合验证专用，验毕清理；`web` profile 不触碰）。
- `PROJECT_ROOT` export（nop-age `supervisor.projectRoot` 占位符替换需要）。
- 零凭据、零网络（mount / dump / 幂等 / 预检面；npm devDeps 已在库不重装）。

## Phase 1 — 联合挂载六腿（scratch profile `nop-joint-audit`）

Targets: 无代码 targets（真宿主执行面；证据落 `docs/logs/2026/08-28.md` + roadmap 行内注记）
Skill: none

- Item Types: `Decision | Proof`
- Prereqs: M4 全部收口（`2026-08-28-1312-3` closure 在册）

- [x] Decision: **dump CLI 形与 profile 纪律**——联合验证一律用 as-built 合法形 `dsh --profile nop-joint-audit --dump-config | grep nop-`，scratch profile 执行，`web` profile 不触碰。roadmap WI17 行字面 `dsh web --dump-config` 为非法 CLI 形（M3-WI8 as-built 裁定：`dsh web` 子命令拒父级 `--profile`），且字面形隐含挂入 live `web` profile——违反审计不触碰 live profile 纪律。备选①按字面形执行——否决：非法 CLI 形实测 unknown option；备选②挂入 web profile 再卸载——否决：审计腿不触碰 live 面，残留风险不对称。残险：与 roadmap 字面命令的偏差须在 WI17 行内证据注记中显式记录（WI8/WI15 先例同姿势）。
- [x] Proof: **dry-run 腿**——`PROJECT_ROOT` export 后 `./plugin/load-plugins.sh --dry-run --profile nop-joint-audit`：计划命令含 nop-age + nop-route 两条 add 且零执行。
- [x] Proof: **挂载 + dump 断言腿**——`./plugin/load-plugins.sh --no-start --profile nop-joint-audit` 后 `dsh --profile nop-joint-audit --dump-config | grep nop-`：一条 dump 同时命中 `# == nop-age`（`isolate: { nopAge: true }` / `id: nop-age-service`）与 `# == nop-route`（`isolate: { nopRoute: true }` / `id: nop-route-service`）——**两 isolate realm 并存**（mdcontrol 与 noproute 分 realm 的 roadmap 断言面）；config 三元组（nop-age：assetsDir + supervisor.projectRoot + continuous；nop-route：defaultModel / maxRetries / fallbackModels）与 manifest / bundle patch 零漂移。
- [x] Proof: **mdcontrol 唯一挂载腿**——同 dump 全文断言：mdcontrol 发布服务行恰一条（nop-age 侧 service row）；nop-route 段不含任何 mdcontrol 面（只注册 `noproute`）；零 `missionControl` 残留（M2 迁移不变式复证）。
- [x] Proof: **幂等腿**——二次执行 `./plugin/load-plugins.sh --no-start --profile nop-joint-audit`：双条目全 already-present，零重复 add。
- [x] Proof: **unmount-重挂一致腿**——`./plugin/load-plugins.sh --unmount-all --profile nop-joint-audit` 后重挂，dump 与首挂 `diff` 为空（端态一致）。
- [x] Proof: **清理腿**——`dsh plugin --profile nop-joint-audit list` 为空 + profile 目录删除；`web` profile 未触碰自证。

Exit Criteria:

- [x] 六腿证据齐（dry-run / dump 双 realm / mdcontrol 唯一 / 幂等 / unmount-重挂 diff 空 / 清理）且落 log
- [x] CLI 形偏差（字面 vs as-built）在 roadmap WI17 证据注记中显式记录
- [x] `git diff --stat tools/mission-driver/ plugin/` 为空（纯验证面自证）

## Phase 2 — AGE preset 面 + 技能面 + 回归章 + 回写

Targets: `docs/backlog/multi-plugin-dsh-roadmap.md`、`docs/logs/2026/08-28.md`
Skill: none

- Item Types: `Proof | Add`
- Prereqs: Phase 1 六腿全绿

- [x] Proof: **AGE preset 零服务行**——`./verify-age.sh` L2 链内 nop-age 套件绿（含 `age-preset.test.mjs` D3 门：preset 无任何 nop-age / 服务行）+ preset 组合腿 `npm --prefix plugin/nop-age run verify:e2e:preset` exit 0（roster + service 同树，preset 装载面在联合在库状态下复证）。
- [x] Proof: **三技能完好**——nop-age 套件内 mdcontrol-skills 测试面绿（`mission-control-run/draft/analyze` 三 ID 结构面）+ preset e2e roster 面——两者随上项同链跑出，证据合并落 log。
- [x] Proof: **全门回归章**——`./verify-age.sh` L1+L2+L2.5 全门 GREEN（本 plan 零代码改动的回归自证；逐链计数落 log）。
- [x] Add: roadmap WI17 行 `[ ]`→`[x]` + 行内证据注记（六腿摘要 + CLI 形偏差记录 + preset/技能面指针）；`> Last Updated` 头同步；roadmap-check exit 0。
- [x] Add: `docs/logs/2026/08-28.md` 收口条目（六腿输出摘要 + preset/技能面 + 全门计数）。

Exit Criteria:

- [x] preset 零服务行 + 三技能完好证据在册（D3 门 + verify:e2e:preset + 套件技能面）
- [x] `./verify-age.sh` 全门 GREEN；`git diff --stat tools/mission-driver/ plugin/` 为空
- [x] roadmap WI17 `[x]` + 证据在册；roadmap-check exit 0；log 收口条目在案

## Draft Review Record

- dispatch review #review-2026-08-28-104553-mission-driver-2026-08-28-1540-1-m5-wi17-dual-plugin-joint-mount-1-fc225db6 to ses_opencode_draft_review
- 2026-08-28：iteration 1，共识 acceptable-as-is #review-2026-08-28-104553-mission-driver-2026-08-28-1540-1-m5-wi17-dual-plugin-joint-mount-1-fc225db6

## Verification

- pass test 2026-08-28-104553-mission-driver basisHash=1a5adc4a74f3e6d1e770e89cce3d8b18ff63598f32c2b7bad60aa5691e3ef30e exit=0

## Closure

- dispatch audit #audit-2026-08-28-104553-mission-driver-2026-08-28-1540-1-m5-wi17-dual-plugin-joint-mount-1-3877e580 to ses_opencode_closure_audit models={exec:opencode/zhipuai-coding-plan/glm-5.2,aud:opencode/zhipuai-coding-plan/glm-5.2}
- accepted #audit-2026-08-28-104553-mission-driver-2026-08-28-1540-1-m5-wi17-dual-plugin-joint-mount-1-3877e580：审计通过——纯验证面成立：18 项全勾与在库证据逐面对账（roadmap WI17 `[x]` + 行内六腿证据注记〔dry-run 双 add 零执行 / 单 dump 双 realm 并存零漂移 / mdcontrol 唯一 + 零 `missionControl` 残留 / 幂等 / unmount-重挂 diff 空 / 清理 + `web` profile shasum 前后一致〕+ CLI 形偏差显式注记〔字面 `dsh web --dump-config` 非法形 → as-built `dsh --profile nop-joint-audit --dump-config`〕+ `> Last Updated` 头在册〔`docs/backlog/multi-plugin-dsh-roadmap.md`〕；`docs/logs/2026/08-28.md` 收口条目在案；`git diff --stat tools/mission-driver/ plugin/` 为空——引擎树/两 bundle/launcher/manifest 零改动自证）。独立复跑：`node tools/mission-driver/src/gate-check.mjs <plan> --verify` → commands.test `pnpm --prefix tools/mission-driver test` exit 0〔992/992 fail 0 + prompt-check OK〕basisHash=1a5adc4a…ef30e 与 pass 行绑定；`node tools/mission-driver/src/plan-check.mjs <plan> --strict` passed=true derivedCompleted=true〔18/18 勾 + pass 行 + 回执对同 id 配对〕。preset/技能面〔`verify:e2e:preset` exit 0 + D3 门 + skills 三行测试〕随 log 在册证据采信（M5-WI18 全门复跑为独立收口面）。Deferred 筛查：无本 plan 须收编项（1312-2/1312-3 §Deferred 重开触发均未命中，归属 M5-WI18 维持原裁定），无在库缺陷藏匿。models 对为同模型（single-model downgrade，如实记录）。
