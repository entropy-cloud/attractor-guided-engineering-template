# Context Index

## Purpose

`docs/context/` holds the short, mandatory context AI agents should read before making non-trivial changes. It is intentionally small: rules hidden in long lookup material are easy to miss.

## Read These First

1. `project-context.md` — identity, stack, real verification commands
2. `ai-autonomy-policy.md` — autonomy levels and protected areas
3. `codebase-map.md` — entry points and change routing

Document placement, naming, and the normative/timeliness separation live in `docs/guides/doc-organization.md` (guides own the how-to; context owns the what-is-true-here).

## What Belongs Here

- current project context that should orient every AI session
- autonomy rules for when AI may proceed, plan, ask, research, or stop
- compact codebase routing that prevents repeated rediscovery

## What Does Not Belong Here

- long design documents, one-off analysis, daily logs, execution plans, detailed reference tables — put those in their owning directories and link when needed
- process history of any kind (normative docs carry no history)
