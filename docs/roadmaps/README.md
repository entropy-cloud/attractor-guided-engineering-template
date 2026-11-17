# Roadmaps

## Purpose

A roadmap is a milestone index and a work-item status surface — the planning layer between owner docs and plans. Format and rules: `docs/guides/roadmap-authoring.md`.

- a work item is done iff its checkbox is `[x]` (closure audit passed)
- current work-in-progress is read from active plans under `docs/plans/<roadmap-slug>/`, never from a field here
- candidate work that is not yet roadmap-worthy lives as an unchecked work item or a discussion note — this directory is not a parking lot

## Current Roadmaps

| Roadmap | Scope |
| --- | --- |
| `age-autonomy-implementation-roadmap.md` | AGE ledger/law/supervisor engine autonomy track |
| `dsh-plugin-roadmap.md` | DSH plugin packaging and integration |
| `mission-driver-draft-robustness-roadmap.md` | draft pipeline robustness fixes |
| `mission-driver-step-audit-roadmap.md` | step/audit accounting fixes |
| `mission-driver-actionable-fixes-roadmap.md` | accumulated actionable fixes |
| `multi-plugin-dsh-roadmap.md` | multi-plugin DSH composition |
| `demo-roadmap.md` | onboarding/demo smoke roadmap |

When adding a roadmap, create `docs/plans/<slug>/` in the same change and add the row here.
