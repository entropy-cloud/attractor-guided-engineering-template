# Demo Roadmap

> Last Updated: 2026-07-14
> Source: template self-demo

## Purpose

This roadmap demonstrates the mission-driver dashboard. It is a minimal example showing how work items appear in the Roadmap Progress panel.

## Work Item Status

| Work Item | Status | Owner Doc / Source | Dependencies | Reuse |
| --------- | ------ | ------------------ | ------------ | ----- |
| M1/WI1 项目脚手架验证 | done | AGENTS.md | — | — |
| M1/WI2 mission-driver 引擎冒烟 | done | tools/mission-driver/CONTEXT.md | WI1 | `node --test` |
| M1/WI3 监控 Dashboard 集成验证 | ready | tools/mission-driver/CONTEXT.md | WI2 | `node src/main.js --monitor` |
| M2/WI4 示例 mission 端到端运行 | todo | missions/demo.json | WI3 | `tools/mission-driver.sh` |

## Milestones

### M1 — 基础验证

- **WI1 项目脚手架验证** — 确认模板文件结构完整，AGENTS.md / docs/ 目录就位。
- **WI2 mission-driver 引擎冒烟** — 运行 `pnpm test`，确认全绿。
- **WI3 监控 Dashboard 集成验证** — 启动 monitor，确认 mission 列表 + roadmap progress 正常渲染。

### M2 — 端到端演示

- **WI4 示例 mission 端到端运行** — 使用 demo mission 跑一轮 CHECK → REVIEW 流程，确认引擎编排正常。
