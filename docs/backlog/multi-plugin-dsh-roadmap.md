---
audit-rounds: 0
---

# Multi-Plugin DSH Refactor Roadmap

> Last Updated: 2026-08-27 (initial)
> Source: `docs/design/multi-plugin-dsh-architecture.md`. Architecture owns the what and the why; this file owns the ordered delivery milestones and the work-item status surface.

## Purpose

Drive the refactor from a single DSH bundle (`plugin/dsh/` — `dsh-mission-control`) into a multi-plugin family under `plugin/nop-*/`, with a unified `load-plugins.sh` + manifest launcher. The first delivery includes two plugins: `nop-age` (renamed migration) and `nop-route` (new — intelligent routing/retry/model selection). Plans for each work item live under the mission's `plansDir`.

## Work Item Status

> **This is the only dynamic status block. Update status here only.**
> Status lives on **work items**, never on milestones. AI takes the first `todo` work item in order. See `docs/backlog/00-roadmap-authoring-guide.md`.

### M1 — Design and Architecture (the prerequisite for any code)

- [ ] WI1 多插件架构设计文档:明确 nop-* 命名约定、isolate realm 协议、manifest 格式、load-plugins.sh 形态、nop-route 的范围 + 4 路由 + 4 纯函数模块。(Owner: design doc → `docs/design/multi-plugin-dsh-architecture.md` 已落; plan 走流程做 doc-audit + 收口闭环)

- [ ] WI2 现有 dsh-plugin roadmap / 架构 doc 同源一致性核对 + 引用面增补(nop-age 继承 + nop-route 新增段)。

### M2 — nop-age Migration (rename plugin/dsh/ → plugin/nop-age/)

- [ ] WI3 plugin/dsh/ → plugin/nop-age/ 目录迁移(pure move + 4-token 替换)。

- [ ] WI4 验证迁移零回归:全部 plugin 测试(从 plugin/dsh/test 移到 plugin/nop-age/test)绿、引擎零 diff、CLI 行为不变。

- [ ] WI5 install-age.sh / install-age.manifest 中 `plugin/dsh` 字面引用清查与更新。

### M3 — Plugin Manifest + Load Script

- [ ] WI6 plugin/plugin-manifest.yml 设计 + 落档(schema:1 形态、profile 字段、plugins[] 数组、${VAR} 占位符语义)。

- [ ] WI7 plugin/load-plugins.sh POSIX sh 脚本实现(7 个 flag、Python/Node YAML 校验双降级、idempotent 重挂、strict/dry-run 语义)。

- [ ] WI8 load-plugins.sh 验证脚本(shellcheck + 真 dsh 宿主下 dry-run + 真挂载 + unmount-all + 重挂一致 + strict 模式 fail-fast)。

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
