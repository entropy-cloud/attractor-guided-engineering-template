---
audit-rounds: 0
---

# Demo Roadmap

> Last Updated: 2026-07-14
> Source: template self-demo

## Purpose

This roadmap demonstrates the mission-driver dashboard. It is a minimal example showing how work items appear in the Roadmap Progress panel.

## Work Item Status

### M1 — 基础验证

- [x] WI1 项目脚手架验证（Owner: AGENTS.md；Dependencies: —；Reuse: —）
- [x] WI2 mission-driver 引擎冒烟（Owner: tools/mission-driver/CONTEXT.md；Dependencies: WI1；Reuse: `node --test`）
- [ ] WI3 监控 Dashboard 集成验证（Owner: tools/mission-driver/CONTEXT.md；Dependencies: WI2；Reuse: `node src/main.js --monitor`）

### M2 — 端到端演示

- [ ] WI4 示例 mission 端到端运行（Owner: missions/demo.json；Dependencies: WI3；Reuse: `tools/mission-driver.sh`）

## Milestones

### M1 — 基础验证

- **WI1 项目脚手架验证** — 确认模板文件结构完整，AGENTS.md / docs/ 目录就位。
- **WI2 mission-driver 引擎冒烟** — 运行 `pnpm test`，确认全绿。
- **WI3 监控 Dashboard 集成验证** — 启动 monitor，确认 mission 列表 + roadmap progress 正常渲染。

### M2 — 端到端演示

- **WI4 示例 mission 端到端运行** — 使用 demo mission 跑一轮 CHECK → REVIEW 流程，确认引擎编排正常。
