# Implementation Roadmap

> Last Updated: <YYYY-MM-DD>
> Source: `docs/requirements/<path>`, `docs/design/*.md`

## Purpose

This file is the global status index from design to implementation. After reading it, an AI or maintainer knows what is not started, planned, or completed without re-walking every doc and the codebase.

It contains no implementation detail. Each `planned` phase is owned by its execution plan.

> This roadmap is optional. See `docs/backlog/00-roadmap-authoring-guide.md` for authoring and update rules. Small projects can delete this file and rely on the backlog table alone.

## Phase Status

> **This is the only dynamic status block. Update status here only.**
> The roadmap is a human–AI alignment artifact: humans set the work items and their order; AI takes the first `todo` item in order, drafts/executes the plan automatically (humans do not review individual plans), and writes the item back to `done` on closure audit. See `docs/backlog/00-roadmap-authoring-guide.md` (Roadmap Role, Phase Granularity, Closed Loop).

- 1. <phase name>: `todo`

## Status Values

| Status | Meaning |
| --- | --- |
| `todo` | Not started, no plan |
| `planned` | Has an execution plan |
| `done` | Completed and passed closure audit |

## Framework / Platform Reuse

Capabilities already provided by the stack, so the project does not rebuild them:

| Capability | Provided by | Notes |
| --- | --- | --- |
| <capability> | <module/package/service> | <already-introduced / not-introduced> |

## Current Baseline

**Already implemented:**

- <summary of what exists>

**Main gaps:**

- <summary of the main gaps>

---

## Phases

| # | Phase | Owner Doc | Dependencies | Reuse |
| --- | --- | --- | --- | --- |
| 1 | <phase> | `docs/design/<path>` | — | — |

---

## Phase Details

### 1. <phase name>

> Status: see Phase Status above

**Goal:** <one sentence>

**Delivery scope:**

- <short list>

**Out of scope:** <optional>

**Modules / areas:** <optional>

---

## Dependency Graph

```mermaid
graph TD
    P1["1. <phase>"]
```

## Cross-Cutting

| Concern | Notes |
| --- | --- |
| Error handling | <convention> |
| Permissions | <convention> |
| Testing | <convention> |
| Owner-doc sync | update design/architecture when a phase closes |
| Dev log | update `docs/logs/` after each implementation |

## Rule

- This file is a status index and coarse-grained split, not an execution plan.
- Each `planned` phase is owned by its execution plan.
- Phase status changes update the Phase Status block at the top of this file only.
