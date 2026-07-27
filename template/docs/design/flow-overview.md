# Flow Overview

## Purpose

This file is the project's global flow overview, organized in three layers:

- L1 macro page/flow navigation: how users move between surfaces
- L2 state machines: the core business object state machines
- L3 cross-domain common rules: eligibility, snapshot, and recovery semantics that span domains

Per-domain detail lives in its own owner doc. This file gives the global view and cross-domain mapping only; it does not repeat in-domain rules.

## When To Use This File

Use it when the project has multiple business domains and cross-domain flows, so a reader needs one global view instead of assembling it from many domain docs. Small projects can omit this file.

## Boundaries

- This file owns global flow sequencing, the state/domain/doc/page mapping, and cross-domain common rules.
- Full business rules for each state/action are owned by the relevant domain doc.
- Persisted status-code dictionaries are owned by the project's contract/model source of truth.
- Technical implementation (scheduling, integration protocol) is owned by `docs/architecture/`.

## Document Map

| Domain | Owner Doc |
| --- | --- |
| <domain> | `docs/design/<path>.md` |

---

## L1 — Macro Flow

```mermaid
flowchart LR
    A[<entry>] --> B[<surface>]
```

---

## L2 — State Machines

```mermaid
stateDiagram-v2
    [*] --> <state>: <trigger>
```

Status codes and persisted dictionaries are owned by `<owner doc>` and the contract/model source of truth.

### State-Domain-Doc-Page Mapping

| State | Owning domain | Owner Doc | Related page |
| --- | --- | --- | --- |
| <state> | <domain> | `docs/design/<path>.md` | <page> |

---

## L3 — Cross-Domain Common Rules

### Eligibility

- [Rule] <which actions require what precondition>

### Price / inventory / real-time data

- [Rule] <what must be recomputed at decision time>

### Snapshot semantics

- [Rule] <what is frozen at submission and must not follow later changes>

### Recovery semantics

- [Rule] <what is restorable after cancel/refund/failure>

## References

| Doc | Path | Notes |
| --- | --- | --- |
| <doc> | `docs/design/<path>.md` | <notes> |
