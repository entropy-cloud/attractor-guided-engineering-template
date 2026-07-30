# Demo Roadmap

> Minimal roadmap for the demo mission. All items are done — verifies the install end-to-end.

## Work Item Status

| Work Item | Status | Owner Doc / Source | Dependencies | Reuse |
| --------- | ------ | ------------------ | ------------ | ----- |
| M1/WI1 脚手架验证 | done | AGENTS.md | — | — |
| M1/WI2 引擎冒烟 | done | docs/context/project-context.md | WI1 | echo demo-ok |
| M1/WI3 Dashboard 集成 | done | docs/context/project-context.md | WI2 | ./tools/mission-driver.sh monitor |

## Milestones

### M1 — 基础验证

- **WI1 脚手架验证** — 确认 AGENTS.md / docs/ 目录就位。
- **WI2 引擎冒烟** — CHECK 步骤通过（echo demo-ok）。
- **WI3 Dashboard 集成** — monitor 启动并渲染。
