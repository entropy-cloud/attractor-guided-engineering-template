---
audit-rounds: 0
---

# Multi-Plugin DSH Refactor Roadmap

> Last Updated: 2026-08-28 (M3 WI6+WI7+WI8 `done`——plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-3`：`plugin/plugin-manifest.yml` 落档〔schema:1 / nop-age-only 分期 / ${VAR} 预检执法〕、`plugin/load-plugins.sh` POSIX 启动器〔7 flag + 预检四断言 + 幂等 + 摘要表，stub 测试 18/18 + shellcheck 0.11.0 零告警 + verify-age L2 增腿全绿〕、真宿主六面验证〔dry-run / 挂载 dump nopAge realm / 幂等 / unmount-all 重挂一致 / strict fail-fast / 起宿主腿命中 M2 留档 import 缺口→后继项〕；M2 WI3+WI4+WI5 `done`——plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-2`：plugin/dsh → plugin/nop-age 迁移落地〔token map + carve-out + grep 收口〕、零回归验证〔插件 423/423 · 引擎 987/987 · verify-age L1+L2+L2.5 GREEN · e2e PASS · 引擎零 diff 钉住〕、install-age 零引用证据化；M1 WI1+WI2 `done`——plan `docs/plans/multi-plugin-dsh/2026-08-28-0149-1`：设计文档 doc-audit 五偏差处置收口〔迁移面三清单 + 技能名 carve-out / 引擎零 diff = 行为零 diff 裁定 / manifest 分期 nop-age-only / 测试面四真值表 + e2e / install-age 零引用核实，Status DRAFT→AUDITED〕+ 既有文档族六维同源一致性矩阵与三处矛盾修正〔矩阵见 `docs/logs/2026/08-28.md`〕；initial 2026-08-27)
> Source: `docs/design/multi-plugin-dsh-architecture.md`. Architecture owns the what and the why; this file owns the ordered delivery milestones and the work-item status surface.

## Purpose

Drive the refactor from a single DSH bundle (`plugin/dsh/` — `dsh-mission-control`) into a multi-plugin family under `plugin/nop-*/`, with a unified `load-plugins.sh` + manifest launcher. The first delivery includes two plugins: `nop-age` (renamed migration) and `nop-route` (new — intelligent routing/retry/model selection). Plans for each work item live under the mission's `plansDir`.

## Work Item Status

> **This is the only dynamic status block. Update status here only.**
> Status lives on **work items**, never on milestones. AI takes the first `todo` work item in order. See `docs/backlog/00-roadmap-authoring-guide.md`.

### M1 — Design and Architecture (the prerequisite for any code)

- [x] WI1 多插件架构设计文档:明确 nop-* 命名约定、isolate realm 协议、manifest 格式、load-plugins.sh 形态、nop-route 的范围 + 4 路由 + 4 纯函数模块。(Owner: design doc → `docs/design/multi-plugin-dsh-architecture.md`; plan `2026-08-28-0149-1` doc-audit 收口——五处 live 偏差全部处置：完整迁移面三清单〔bundle 内 token + bundle 外引用 ×8 + owner docs 同步〕+ 技能名/`mdcontrol` carve-out、「引擎零 diff」裁定 = 行为零 diff + law 三模块字面更新、manifest 分期 M3 仅 nop-age、测试面四张模块名真值表 + e2e 入口统一、install-age 零字面引用已核实；Status DRAFT → AUDITED，证据指针该 doc Changelog)

- [x] WI2 现有 dsh-plugin roadmap / 架构 doc 同源一致性核对 + 引用面增补(nop-age 继承 + nop-route 新增段)。(plan `2026-08-28-0149-1`:三 live owner docs 各增 §Multi-Plugin Forward Reference〔nop-age 继承映射 + nop-route 前向指针〕;六维一致性核对矩阵全过、矛盾修正 C1-C3〔integration doc 头部 supported-baseline 过期声明 + 双形式表/安装段、dev guide 头部〕——矩阵见 `docs/logs/2026/08-28.md`;`dsh-plugin-roadmap.md` 裁定零触碰——头部无 live-baseline 声明,史实不改写)

### M2 — nop-age Migration (rename plugin/dsh/ → plugin/nop-age/)

- [x] WI3 plugin/dsh/ → plugin/nop-age/ 目录迁移(pure move + 4-token 替换)。(plan `2026-08-28-0149-2`：`git mv` 整目录〔105×R100 + service.ts RM rename 谱系入 index，`--follow` 提交后可查〕+ token map 全量落地〔`dsh-mission-control`→`nop-age`、`missionControl`→`nopAge`、`mdcontrol-service`→`nop-age-service`、insert row `mission-control`→`nop-age` 单点、`plugin/dsh`→`plugin/nop-age` 全 live 面〕+ carve-out 保持〔`mdcontrol` / `/mdcontrol/api` / 技能三 ID 原名在库〕；bundle 外 8 处功能引用 + 四 owner docs 路径同步〔含 plan 基线记 zero 命中的 integration doc 实测 2 处一并同步——执行期基线修正〕；grep 收口零命中 + 残留 `mission-control` 逐条对照允许集；assets 经 build-bundle 再生 content-equal；`npm ci` 验 lockfile 完整）

- [x] WI4 验证迁移零回归:全部 plugin 测试(从 plugin/dsh/test 移到 plugin/nop-age/test)绿、引擎零 diff、CLI 行为不变。(plan `2026-08-28-0149-2`：插件套件 **423/423** = 迁移前基线、引擎套件 **987/987** = 基线〔只增不减·纯迁移〕、`./verify-age.sh` **L1+L2+L2.5 GREEN**〔真值表 119/0〕、mission-check 全 mission exit 0〔base.json = extends defaults 片段，standalone fail 为迁移前既有、零 diff〕、`verify:e2e` 真实 cordis runtime **PASS**〔mdcontrol 路由 + 技能三 ID + 双腿 shape identity + correction-retry + monitor render〕、`git diff --stat engine.js flows/` 为空 + tools diff 恰 law 三模块路径字面；真宿主 dump 面：nop-age service row + nopAge realm + 零 missionControl 残留，scratch profile `nop-age-mig-audit` 验毕清理；残险留档：真宿主 boot import 因 package.json 无 `main`/`exports` 不可导入——**迁移前同状**〔旧名同样缺失，既有 runtime 证据全走 in-process fixture 相对路径〕，非本迁移回归，M3-WI8 真挂载面将正面命中该缺口)

- [x] WI5 install-age.sh / install-age.manifest 中 `plugin/dsh` 字面引用清查与更新。(plan `2026-08-28-0149-2`：`grep -rn "plugin/dsh" install-age.sh install-age.manifest` **零命中**实测落档——live 基线即零，双文件零改动，证据化收口)

### M3 — Plugin Manifest + Load Script

- [x] WI6 plugin/plugin-manifest.yml 设计 + 落档(schema:1 形态、profile 字段、plugins[] 数组、${VAR} 占位符语义)。(plan `2026-08-28-0149-3` Phase 1：`plugin/plugin-manifest.yml` 落档——顶层键白名单 schema/profile/plugins（未知键预检 fail-fast）、恰 `nop-age` 一条〔`path: ./nop-age`、`realm: nopAge`、config 镜像 live bundle patch：assetsDir + `supervisor.projectRoot: ${PROJECT_ROOT}` + `continuous: false`〕、`${VAR}` 语义 = 已定义替换/未定义预检报错、M3 分期注记在档；双通道语法验证 python3/PyYAML 与 node〔nop-age pinned devDep〕均实测 exit 0)

- [x] WI7 plugin/load-plugins.sh POSIX sh 脚本实现(7 个 flag、Python/Node YAML 校验双降级、idempotent 重挂、strict/dry-run 语义)。(plan `2026-08-28-0149-3` Phase 2：`#!/bin/sh` + `set -u`、7 flag 全量、预检四断言〔YAML 双降级 / 未知顶层键 / ${VAR} 定义性 / path 存在 + cordis.patch.yml〕、`dsh plugin list` 幂等查重后 add、四类摘要表、退出语义；确定性测试 **18/18 全绿**〔`plugin/test/load-plugins.test.mjs`，PATH 注入 stub dsh/python3/node，≥12 例要求 + 6 例超额〕；`sh -n` 零错 + 零 bashism + shellcheck 0.11.0 零告警；`verify-age.sh` L2 增腿后 **L1+L2+L2.5 GREEN**〔987/987 + 423/423 + 18/18〕；as-built：启动命令 web→`dsh web --no-open`、他 profile→`dsh --profile <p>`〔设计字面形为非法 CLI，注记在档〕)

- [x] WI8 load-plugins.sh 验证脚本(shellcheck + 真 dsh 宿主下 dry-run + 真挂载 + unmount-all + 重挂一致 + strict 模式 fail-fast)。(plan `2026-08-28-0149-3` Phase 3 六面证据：shellcheck 0.11.0 零告警〔brew 安装〕；真宿主 dry-run 零执行且命令形状与 stub 断言一致〔PROJECT_ROOT 未定义实测 deny〕；真挂载 scratch profile `nop-load-audit`——dump-config L314-323 命中 `# == nop-age` / `isolate: { nopAge: true }` / `id: nop-age-service`、二次执行全 already-present 幂等；unmount-all → 重挂 dump **diff 为空**端态一致；strict 临时 manifest 不存在 path → 首条报错 exit 1 零 add；起宿主腿按基线预期命中 M2-WI4 残险〔bundle 无 main/exports import 缺口〕+ 设计字面 `dsh web --no-open --profile` 为非法 CLI 形——两者均注记在设计文档 §Load Script as-built，包入口缺口需独立后继项；scratch profile 验毕清理、`web` profile 未触碰)

### M4 — nop-route Plugin (NEW)

- [ ] WI9 nop-route 包脚手架(package.json + cordis.patch.yml + scripts/check-manifest.mjs + tsconfig.json + 测试入口)。

- [ ] WI10 error-classifier.ts 纯函数 + 真值表测试(7 种 ErrorClass + 边界用例 ≥10)。

- [ ] WI11 retry-policy.ts 纯函数 + 真值表测试(maxRetries/backoff/retry-after-header,≥10 用例)。

- [ ] WI12 model-selector.ts 纯函数 + 真值表测试(默认选 / fallback 链 / 历史感知,≥10 用例)。

- [ ] WI13 routing-core.ts 编排层(decide(classify, retry, model)→ 4 类 RoutingDecision)。

- [ ] WI14 noproute-routes.ts 路由层 + HTTP dispatcher(noproute.route/classify/pick-model/health 四方法 + /noproute/api/* 接线)。

- [ ] WI15 service.ts 挂载(noproute service publication + HTTP dispatcher + headless 降级 + mount log)。

- [ ] WI16 nop-route 端到端验证:e2e(in-process cordis runtime boot + 真四路由调用 + 真实错误样本 + 决策回放)。

### M5 — Cross-Plugin Verification & Closure

- [ ] WI17 双插件联合挂载验证(load-plugins.sh 一键挂 nop-age + nop-route,`dsh web --dump-config | grep nop-` 显两插件、mdcontrol 与 noproute 在不同 isolate realm、AGE preset 仍零服务行、mdcontrol 唯一挂载保持)。

- [ ] WI18 L1+L2+L2.5 全门 GREEN(`./verify-age.sh` + 引擎 `pnpm test` + 插件 `npm test` + 真值表全过),M5 收口;roadmap WI18 [x] + Last Updated + 设计/架构 doc 同步回写。

## Status Values

| Status | Meaning |
| --- | --- |
| `todo` | Not started |
| `ready` | Draft-reviewed, queued for implementation |
| `done` | Completed and passed closure audit |

## Dependencies & Notes

- M1 无外部依赖;design doc 已落(WI1 实际已落地为 `docs/design/multi-plugin-dsh-architecture.md` 草稿,plan 阶段走 doc-audit 闭环)。
- M2 起为代码面工作:WI3 是纯机械迁移,WI4 复用既有测试断言;install-age 引用清查(WI5)需 grep 全仓库零 `plugin/dsh` 字面引用。
- M3 启动脚本的 YAML 校验走 Python/Node 双降级:默认 Python 3(DSH 宿主通常带);无 Python 时通过 `node -e` 调 bundle pinned 的 `yaml` devDep。脚本本体不依赖 Python/Node runtime。
- M4 nop-route 完全独立于 nop-age,可用 host-harness precedent;真值表测试门槛 = WI10/11/12 各自 ≥10 例。
- M5 双插件挂载验证的关键 = `dsh web --dump-config | grep nop-` 输出 + AGE preset 仍零服务行 + `mission-control-*` 三个技能仍完好。
- 每个 WI 的交付细节(plan 内容、文件名、命名规范)按 `docs/plans/00-plan-authoring-and-execution-guide.md` 在 plan 起草阶段决定,roadmap 不预先指定;每 WI 完成即回写本 roadmap。
- WI 完成判定:plan `## Closure` 审计 accepted + roadmap WI checkbox `[x]` + 必要时 owner doc 同步。
