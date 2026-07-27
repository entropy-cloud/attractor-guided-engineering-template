# <project-name> Onboarding Roadmap

> Drive the AI to read this project's codebase and fill in the copied AGE template docs based on actual tech stack, entry points, and verification commands. Run after `./install-age.sh` to personalize the workspace. Source guide: `template/START-HERE-after-copy.md` (manual fallback).

## Work Item Status

| Work Item | Status | Owner Doc / Source | Dependencies | Reuse |
| --------- | ------ | ------------------ | ------------ | ----- |
| M1/WI1 项目扫描 + 引擎冒烟 | todo | `docs/input/project-scan.md` (output) | — | `./tools/mission-driver.sh list` |
| M1/WI2 填 `docs/context/project-context.md` | todo | `docs/context/project-context.md` | WI1 | — |
| M1/WI3 填 `docs/context/ai-autonomy-policy.md` | todo | `docs/context/ai-autonomy-policy.md` | WI1 | — |
| M1/WI4 填 `docs/context/codebase-map.md` | todo | `docs/context/codebase-map.md` | WI1 | — |
| M1/WI5 填 `docs/index.md` + 校验项目名占位符全替换 | todo | `docs/index.md` | WI2 | grep |
| M1/WI6 填 `docs/architecture/{README,module-boundaries,project-vision,system-baseline}.md` | todo | `docs/architecture/*` | WI1, WI2 | — |
| M1/WI7 填 `docs/process/application-development-workflow.md` + `docs/backlog/README.md` | todo | `docs/backlog/README.md` | WI2 | — |
| M1/WI8 填 `docs/testing/known-good-baselines.md` + 校验 `docs/logs/{year}/` 存在 | todo | `docs/testing/known-good-baselines.md` | WI2 | run verification |

## Milestones

### M1 — Onboarding

- **WI1 项目扫描 + 引擎冒烟** — AI 读项目根(`package.json` / `pom.xml` / `pyproject.toml` / `Cargo.toml` / `go.mod` / `README.md`),识别技术栈、主入口、build/test 命令、业务领域;写到 `docs/input/project-scan.md`。验证 `./tools/mission-driver.sh list` 跑通(引擎冒烟)。
- **WI2 填 `docs/context/project-context.md`** — 用 WI1 scan 结果填 Project Identity / Current Technical Baseline / Verification Commands(从项目实际 tooling 推导) / Optional Layers Currently In Use / AI Block Conditions。所有 `<fill ...>` 占位必须移除。
- **WI3 填 `docs/context/ai-autonomy-policy.md`** — Reviewer Availability(默认 `subagent`,因 mission-driver 可用);识别 Protected Areas(production config、auth、schema、payment、data-deletion 等)。
- **WI4 填 `docs/context/codebase-map.md`** — Entry Points(从 WI1 scan)、Common Change Routes、Large/Fragile Files。所有 `<path>` / `<notes>` 占位移除。
- **WI5 填 `docs/index.md` + 校验项目名占位符全替换** — install-age.sh 在 install 时已对 fill-in 文件做了项目名占位符(尖括号形式)的全局 sed-replace;本 WI 验证 docs/ 目录下已无该占位符残留(执行 `grep -c -F "<project" "-name>" docs/` 应返回 0,或等价检查),包括 `docs/index.md` 标题;填 `docs/index.md` 其余占位(`<area>` 表格行等);若项目单域,移除 `Domain Quick-Reference (Optional)` 段。
- **WI6 填 `docs/architecture/*`** — `README.md`(指针 + 实际架构 doc 引用)、`module-boundaries.md`(基于 WI1 scan 的模块边界)、`project-vision.md`(产品方向 + 非目标,基于 README + codebase 分析)、`system-baseline.md`(stack/runtime/deployment)。
- **WI7 填 `docs/process/application-development-workflow.md` + `docs/backlog/README.md`** — workflow 标题已被 install-age.sh sed-replace,本 WI 审查 body 是否需要项目特定调整;`backlog/README.md` 填第一行 work items(若无,显式写 `(no active work item; identify next slice from requirements or input)` 而非留 P0 `<first slice>` 占位)。
- **WI8 填 `docs/testing/known-good-baselines.md` + 校验 `docs/logs/{year}/` 存在** — 跑项目实际 verification 命令,记录 green baseline 到 `docs/testing/known-good-baselines.md`(日期/SHA/scope/commands);验证 `docs/logs/{year}/` 目录存在(install-age.sh 已创建,本 WI 仅 verify)。
