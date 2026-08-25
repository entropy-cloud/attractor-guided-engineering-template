# Shared-Engine Worktree Isolation for age-autonomy

> Date: 2026-08-25 20:30
> Status: decided（执行中）— 主树钉 `main`，age-autonomy 复用 `feature/dsh-plugin` 在独立 worktree 推进；dsh-plugin 合入 main 暂缓（human 裁定）
> Trigger: D1 陈旧引擎死锁（`docs/bugs/2026-08-25-ledger-plan-closure-deadlock.md`）暴露共享引擎无版本隔离的结构性风险

## Context

- 引擎是**活树共享**的：`template/install/tools/mission-driver.sh` 明确引擎不复制进消费项目，所有拷贝项目经 `MISSION_DRIVER_HOME` 指回本工作区 `exec node $ABS_HOME/src/main.js`。本目录磁盘上是什么代码，所有消费者下次启动就跑什么——没有版本钉住。
- 当前 HEAD 在 `feature/dsh-plugin`（非 main），消费者实际已在跑 feature 代码。
- D1 事故：M1 在运行中落地扫描器语义变更（f06ddac），运行中进程 ESM 缓存过期 → `activePlans()` 失明 → mission 空转退出。同类变更加上并发消费者进程 = 全体受害者。

## Candidate Interpretations

1. **维持现状**（单工作区直改）：自举最直接，但每次引擎语义变更都是对全部消费者的即时发布，且运行中 mission 自伤（D1 已证）。
2. **worktree 隔离**：主树钉在稳定 ref 给消费者；重构分支在独立 worktree 推进，合并回 main 成为显式发布动作。
3. **安装时 vendored copy**：installer 把引擎复制进消费项目。隔离最强，但改变分发模型、丢失 dogfood 单一事实源。

## Decided

采用候选 2（worktree 隔离），配以下约束：

- **主工作树钉在 `main`** 作为稳定基线；消费者 `MISSION_DRIVER_HOME` 不变即自动获得稳定版。注意：main 当前落后开发分支 46 提交，合并前消费者拿不到最新引擎能力——human 已知悉，合并时点由 human 另行裁定。（初版裁定曾把主树钉在 `feature/dsh-plugin`，human 复核后修正为主干。）
- age-autonomy 后续工作**复用现有 `feature/dsh-plugin` 分支**，在其 worktree（`../age-worktrees/age-autonomy`）内推进，**不另开分支**——dsh roadmap 已全量收口，该分支即当前事实开发主干；mission 工件（commit `78ac8cb`+`b17e2e1`）已快进并入。milestone Verification Gate（CI merge-blocking）绿后合入 main = 发布点。
- **操作纪律（不因隔离而免除）**：EXEC_PLANS 凡触碰引擎代码，下一轮 REVIEW/EXEC 前重启引擎进程（run-state reconcile/resume 已支持）。Worktree 只把爆炸半径从"所有人"缩到"自己"，不能消除自举进程的缓存过期窗口。
- 未提交产物必须先落分支再切 worktree（untracked 文件不跟随 worktree 创建）——本次已以 commit `78ac8cb` 先行落盘 M2 九份 plan + bug note + roadmap 回写。

## Follow-ups（未决）

- [P2] 消费侧版本钉住：`MISSION_DRIVER_HOME` 支持 tag/ref 解析或 installer vendored copy 选项（候选 3 的温和版）。
- [P2] 结构性消灭 D1 类缺陷：谓词扫描改为每次求值子进程/绕 ESM 缓存直读磁盘（候选落点：flow-loader `_scanPlansByStatus`）。
- dsh-plugin 合入 main 时点由 human 另行裁定；合并前消费者经 main 拿到的是 46 提交之前的引擎，属已知且接受的状态。
